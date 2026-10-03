#!/usr/bin/env bash
set -Eeuo pipefail

domain=""
port=8097
source_dir=""
install_dir=/opt/audiobooks-backend
data_dir=/var/lib/audiobooks-backend/data
repo=ARST113/log
ref=main

while (($#)); do
  case "$1" in
    --domain) domain=${2:?}; shift 2 ;;
    --port) port=${2:?}; shift 2 ;;
    --source) source_dir=${2:?}; shift 2 ;;
    --ref) ref=${2:?}; shift 2 ;;
    *) echo "Неизвестный аргумент: $1" >&2; exit 2 ;;
  esac
done
[[ $EUID -eq 0 ]] || { echo "Запустите установщик через sudo." >&2; exit 1; }
[[ $port =~ ^[0-9]+$ ]] && ((port>=1024 && port<=65535)) || exit 2
[[ -z $domain || $domain =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || exit 2
[[ $ref =~ ^[a-zA-Z0-9._/-]+$ ]] || exit 2
command -v apt-get >/dev/null || { echo "Нужен Ubuntu/Debian с apt-get." >&2; exit 1; }

if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y docker.io
  systemctl enable --now docker
fi
for dependency in curl python3 tar; do
  command -v "$dependency" >/dev/null || { apt-get update; apt-get install -y "$dependency"; }
done
if ! docker compose version >/dev/null 2>&1; then
  . /etc/os-release
  [[ $ID == ubuntu || $ID == debian ]] || { echo "Поддерживаются Ubuntu/Debian." >&2; exit 1; }
  if ! grep -RqsE 'https?://download\.docker\.com/linux/(ubuntu|debian)' /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/%s %s stable\n' "$(dpkg --print-architecture)" "$ID" "$VERSION_CODENAME" > /etc/apt/sources.list.d/audiobooks-docker.list
  fi
  apt-get update
  apt-get install -y docker-compose-plugin
fi
docker compose version >/dev/null

tmp_dir=$(mktemp -d /tmp/audiobooks-install.XXXXXXXX)
trap 'rm -rf -- "$tmp_dir"' EXIT
if [[ -n $source_dir ]]; then
  [[ -f "$source_dir/src/Audiobooks.Backend.csproj" && -f "$source_dir/compose.yaml" ]] || exit 2
  cp -a "$source_dir/." "$tmp_dir/project"
else
  curl --fail --location --retry 3 "https://codeload.github.com/$repo/tar.gz/$ref" -o "$tmp_dir/source.tar.gz"
  mkdir "$tmp_dir/unpacked"
  tar -xzf "$tmp_dir/source.tar.gz" -C "$tmp_dir/unpacked"
  source_dir=$(find "$tmp_dir/unpacked" -mindepth 2 -maxdepth 2 -type d -name audiobooks-backend -print -quit)
  [[ -n $source_dir && -f "$source_dir/src/Audiobooks.Backend.csproj" ]] || exit 1
  cp -a "$source_dir" "$tmp_dir/project"
fi

mkdir -p "$install_dir" "$data_dir" /var/lib/audiobooks-backend/backups
if [[ -f "$data_dir/audiobooks-fdb.sqlite" ]]; then
  backup=/var/lib/audiobooks-backend/backups/audiobooks-$(date -u +%Y%m%dT%H%M%SZ).sqlite
  python3 - "$data_dir/audiobooks-fdb.sqlite" "$backup" <<'PY'
import sqlite3, sys
src=sqlite3.connect(sys.argv[1], timeout=30)
dst=sqlite3.connect(sys.argv[2])
src.backup(dst)
if dst.execute('pragma quick_check').fetchone()[0] != 'ok':
    raise SystemExit('Ошибка резервной копии базы')
dst.close(); src.close()
PY
  chmod 600 "$backup"
fi
rm -f "$tmp_dir/project/.env"
cp -a "$tmp_dir/project/." "$install_dir/"
chown -R 1654:1654 "$data_dir"
chmod 750 "$data_dir"
if [[ ! -f "$install_dir/.env" ]]; then
  printf 'AUDIOBOOK_CRAWLER_ENABLED=true\nAUDIOBOOK_CRAWLER_PARALLELISM=1\nAUDIOBOOK_CRAWLER_INTERVAL_MINUTES=30\n' > "$install_dir/.env"
  chmod 600 "$install_dir/.env"
fi
sed -i '/^AUDIOBOOK_PORT=/d' "$install_dir/.env"
printf 'AUDIOBOOK_PORT=%s\n' "$port" >> "$install_dir/.env"
export AUDIOBOOK_PORT=$port AUDIOBOOK_DATA_DIR=$data_dir
cd "$install_dir"
docker compose -p audiobooks-backend build --pull
docker compose -p audiobooks-backend up -d
ready=false
for _ in {1..30}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:$port/readyz" >/dev/null; then ready=true; break; fi
  sleep 2
done
[[ $ready == true ]] || { docker compose -p audiobooks-backend logs --tail 30; echo "Бэкенд не готов." >&2; exit 1; }

if [[ -n $domain ]]; then
  if ! command -v caddy >/dev/null; then
    apt-get update
    apt-get install -y caddy
  fi
  mkdir -p /etc/caddy/audiobooks-sites
  cp -p /etc/caddy/Caddyfile "$tmp_dir/Caddyfile.before"
  [[ ! -f /etc/caddy/audiobooks-sites/backend.caddy ]] || cp -p /etc/caddy/audiobooks-sites/backend.caddy "$tmp_dir/backend.before"
  printf '%s {\n  encode zstd gzip\n  reverse_proxy 127.0.0.1:%s\n}\n' "$domain" "$port" > /etc/caddy/audiobooks-sites/backend.caddy
  grep -Fq 'import /etc/caddy/audiobooks-sites/*.caddy' /etc/caddy/Caddyfile || printf '\nimport /etc/caddy/audiobooks-sites/*.caddy\n' >> /etc/caddy/Caddyfile
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
    cp -p "$tmp_dir/Caddyfile.before" /etc/caddy/Caddyfile
    if [[ -f "$tmp_dir/backend.before" ]]; then cp -p "$tmp_dir/backend.before" /etc/caddy/audiobooks-sites/backend.caddy; else rm -f /etc/caddy/audiobooks-sites/backend.caddy; fi
    exit 1
  fi
  systemctl enable caddy
  systemctl reload-or-restart caddy
  echo "API: https://$domain"
  echo "Плагин Lampa: https://$domain/audiobook2.js"
else
  echo "API доступен локально: http://127.0.0.1:$port"
  echo "Для HTTPS повторите установку с --domain ИМЯ_ДОМЕНА."
fi
echo "База: $data_dir/audiobooks-fdb.sqlite"
echo "Логи: cd $install_dir && sudo docker compose -p audiobooks-backend logs --tail 100"
