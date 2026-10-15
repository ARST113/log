#!/usr/bin/env bash
# TorrServer NextGen unattended updater and systemd timer manager.
# Usage: sudo bash torrserver-nextgen-autoupdate.sh install|remove|status|run
set -Eeuo pipefail

readonly REPO="lampac-nextgen/TorrServer"
readonly SERVICE="torrserver.service"
readonly TIMER="torrserver-nextgen-update.timer"
readonly UPDATE_SERVICE="torrserver-nextgen-update.service"
readonly PROGRAM="/usr/local/sbin/torrserver-nextgen-autoupdate"
readonly INSTALL_DIR="/opt/torrserver"
readonly API="https://api.github.com/repos/${REPO}/releases/latest"

log() { printf '[TorrServer NextGen] %s\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

require_root() {
  (( EUID == 0 )) || die "Run this command as root (sudo)."
}

require_tools() {
  local tool
  for tool in systemctl curl python3 sha256sum flock mktemp; do
    command -v "$tool" >/dev/null 2>&1 || die "Missing required tool: $tool"
  done
}

get_running_binary() {
  local path=""
  # Unlike the original installer, auto-update never recreates the unit file.
  path=$(systemctl show -p ExecStart --value "$SERVICE" 2>/dev/null |
    sed -nE 's/.*path=([^ ;]+).*/\1/p' | head -n 1 || true)
  if [[ -z "$path" && -r "$INSTALL_DIR/torrserver.service" ]]; then
    path=$(sed -nE 's@^[[:space:]]*ExecStart=([^[:space:]]+).*@\1@p' "$INSTALL_DIR/torrserver.service" | head -n 1 || true)
  fi
  case "$path" in
    "$INSTALL_DIR"/TorrServer-linux-*|"$INSTALL_DIR"/TorrServer-gst-linux-*) ;;
    *) die "Unexpected TorrServer binary path: ${path:-not found}. No changes made." ;;
  esac
  [[ -x "$path" && -f "$path" ]] || die "Active binary not found: $path"
  printf '%s\n' "$path"
}

current_tag() {
  local binary="$1"
  "$binary" --version 2>/dev/null | grep -oEm1 'MatriX\.[0-9]+(\.[0-9]+)*' || true
}

fetch_metadata() {
  local asset_name="$1" json
  json=$(curl -fsSL --retry 2 --connect-timeout 10 --max-time 40 \
    -H 'Accept: application/vnd.github+json' "$API") ||
    die "Cannot retrieve latest release from GitHub."
  printf '%s' "$json" | python3 -c '
import json, re, sys
try:
    release = json.load(sys.stdin)
    tag = release["tag_name"]
    assert re.fullmatch(r"MatriX\.[0-9]+(?:\.[0-9]+)*", tag)
    name = sys.argv[1]
    matching = [a for a in release["assets"] if a.get("name") == name]
    assert len(matching) == 1, f"Asset {name} not found"
    digest = matching[0].get("digest", "")
    assert re.fullmatch(r"sha256:[0-9a-fA-F]{64}", digest), "Missing SHA256 digest"
    print(tag)
    print(digest[7:].lower())
except Exception as e:
    sys.exit(f"Invalid release metadata: {e}")
' "$asset_name"
}

do_update() {
  require_tools
  systemctl cat "$SERVICE" >/dev/null 2>&1 ||
    die "TorrServer systemd service was not found."

  exec 9>/run/torrserver-nextgen-update.lock
  if ! flock -n 9; then
    log "Another update is already running; skipping."
    return 0
  fi

  if ! systemctl is-active --quiet "$SERVICE"; then
    log "TorrServer is stopped. Skipping update to preserve its state."
    return 0
  fi

  local binary asset metadata latest sha installed current_sha first
  binary=$(get_running_binary)
  asset=${binary##*/}
  metadata=$(fetch_metadata "$asset") || die "Failed to read release metadata."
  latest=${metadata%%$'\n'*}
  sha=${metadata##*$'\n'}
  [[ "$latest" =~ ^MatriX\.[0-9]+(\.[0-9]+)*$ && "$sha" =~ ^[a-f0-9]{64}$ ]] ||
    die "Invalid tag or checksum."

  installed=$(current_tag "$binary")
  current_sha=$(sha256sum "$binary")
  current_sha=${current_sha%% *}
  if [[ "$installed" == "$latest" && "$current_sha" == "$sha" ]]; then
    log "Already up to date: $latest ($asset)."
    return 0
  fi

  if [[ -n "$installed" && "$installed" != "$latest" ]]; then
    first=$(printf '%s\n' "$installed" "$latest" | sort -V | head -n 1)
    if [[ "$first" == "$latest" ]]; then
      log "Installed version $installed is newer than latest $latest. Skipping downgrade."
      return 0
    fi
  fi

  local temp backup url must_restart=0 replaced=0
  temp=$(mktemp "${binary}.download.XXXXXXXX")
  backup=$(mktemp "${binary}.backup.XXXXXXXX")
  cleanup() {
    local rc=$?
    trap - EXIT
    if (( rc != 0 && must_restart == 1 )); then
      log "Update failed; restoring old binary and service..."
      if (( replaced == 1 )) && [[ -s "$backup" ]]; then
        mv -f -- "$backup" "$binary" || log "CRITICAL: rollback of binary failed!"
      fi
      systemctl start "$SERVICE" || log "CRITICAL: cannot restart old service."
      if systemctl is-active --quiet "$SERVICE"; then
        log "Previous TorrServer service has been restored."
      fi
    fi
    rm -f -- "$temp" "$backup"
  }
  trap cleanup EXIT

  url="https://github.com/${REPO}/releases/download/${latest}/${asset}"
  log "Downloading $latest ($asset); service stays online during download."
  curl -fLsS --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 600 \
    --output "$temp" "$url" || die "Download failed."
  printf '%s  %s\n' "$sha" "$temp" | sha256sum -c --status ||
    die "SHA256 mismatch; original binary was not touched."
  chmod --reference="$binary" "$temp"
  chown --reference="$binary" "$temp"
  [[ -x "$temp" ]] || die "Downloaded binary is not executable."
  # Check that the downloaded executable can at least start in version mode.
  timeout 10 "$temp" --version >/dev/null 2>&1 ||
    die "Downloaded binary did not pass the --version startup test."

  cp -p -- "$binary" "$backup"
  log "Checksum verified. Restarting TorrServer to install $latest..."
  systemctl stop "$SERVICE" || die "Could not stop TorrServer."
  must_restart=1
  mv -f -- "$temp" "$binary"
  replaced=1
  systemctl start "$SERVICE" || die "New service failed to start."
  sleep 4
  systemctl is-active --quiet "$SERVICE" ||
    die "New service did not remain active after startup."
  must_restart=0
  log "Updated successfully: ${installed:-unknown} -> $latest. Settings and accs.db unchanged."
}

install_timer() {
  require_tools
  command -v timeout >/dev/null 2>&1 || die "timeout is required (coreutils)."
  systemctl cat "$SERVICE" >/dev/null 2>&1 ||
    die "Install TorrServer first; torrserver.service does not exist."
  get_running_binary >/dev/null
  [[ -f "$0" && -r "$0" ]] ||
    die "Save the script to a file first; piping it directly to bash is not supported."
  install -D -m 0755 -- "$0" "$PROGRAM"

  cat >"/etc/systemd/system/$UPDATE_SERVICE" <<EOF
[Unit]
Description=Update TorrServer NextGen from trusted GitHub release
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=$PROGRAM run
TimeoutStartSec=15min
Nice=10
EOF

  cat >"/etc/systemd/system/$TIMER" <<EOF
[Unit]
Description=Check TorrServer NextGen releases daily
[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=1h
Persistent=true
Unit=$UPDATE_SERVICE
[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now "$TIMER"
  log "Automatic updates enabled. Once daily, around 04:00-05:00 server local time."
  log "Show schedule: systemctl list-timers $TIMER"
  log "View logs: journalctl -u $UPDATE_SERVICE -n 50 --no-pager"
}

remove_timer() {
  systemctl disable --now "$TIMER" >/dev/null 2>&1 || true
  rm -f -- "/etc/systemd/system/$TIMER" "/etc/systemd/system/$UPDATE_SERVICE" "$PROGRAM"
  systemctl daemon-reload
  systemctl reset-failed "$UPDATE_SERVICE" 2>/dev/null || true
  log "Automatic updates disabled. TorrServer and its data were not removed."
}

status_timer() {
  systemctl is-enabled "$TIMER" 2>/dev/null || true
  systemctl list-timers "$TIMER" --all --no-pager || true
}

require_root
case "${1:-}" in
  install|enable) install_timer ;;
  remove|disable) remove_timer ;;
  status) status_timer ;;
  run|update-now) do_update ;;
  *)
    printf 'Usage: sudo bash %s {install|remove|status|run}\n' "$0"
    exit 2
    ;;
esac
