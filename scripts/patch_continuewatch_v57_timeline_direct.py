from pathlib import Path
import re

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    s = s.replace(old, new, 1)


replace_once(
    "var BOOT_VERSION = 'v5.6.1-desktop-input-focus-20260828';",
    "var BOOT_VERSION = 'v5.7.0-timeline-direct-20260828';",
    'version'
)

# Remove the UI/DOM online resolver config. Online and torrent now share Timeline-driven launch.
s = s.replace(
    "\n        onlineResolveEnabled: true,\n        onlineResolveTimeoutMs: 20000,\n        onlineResolvePollMs: 250,\n",
    "\n"
)

# Remove OnlineResolverTransport section completely.
start_marker = "    // ============================================================\n    // OnlineResolverTransport\n    // ============================================================\n"
end_marker = "    // ============================================================\n    // LampaNativeTransport\n    // ============================================================\n"
start = s.find(start_marker)
end = s.find(end_marker, start if start >= 0 else 0)
if start < 0 or end < 0 or end <= start:
    raise SystemExit('online resolver section not found')
s = s[:start] + end_marker + s[end + len(end_marker):]

# Player.play should observe the source's actual data, not rewrite it through a resolver.
s = s.replace(
    "                    data = data || {};\n                    data = OnlineResolverTransport.preparePlayData(data) || data;\n\n                    var transport = JustPlusTransport.matches() ? 'just' : 'lampa';",
    "                    data = data || {};\n\n                    var transport = JustPlusTransport.matches() ? 'just' : 'lampa';"
)

# Continue should launch directly, never open Online activity/UI.
s = s.replace(
    "\n            if (OnlineResolverTransport.shouldResolve(params)) {\n                if (OnlineResolverTransport.launch(movie, params)) return;\n            }\n",
    "\n"
)

# Remove stale API exposure for the deleted resolver.
s = s.replace(
    "                just: JustPlusTransport.getStatus,\n                online: OnlineResolverTransport.getStatus,\n                lampa: LampaNativeTransport.getStatus",
    "                just: JustPlusTransport.getStatus,\n                lampa: LampaNativeTransport.getStatus"
)

# Restore the old v4 Timeline semantics: use the actual Lampa Timeline object when launching.
old = """            var resumeTime = Math.max(Number(params.time || params.position || 0), Number(timeline && timeline.time || 0));
            var resumeDuration = Math.max(Number(params.duration || 0), Number(timeline && timeline.duration || 0));
            var resumePercent = Math.max(Number(params.percent || 0), Number(timeline && timeline.percent || 0));

            if (!resumePercent && resumeTime > 0 && resumeDuration > 0) {
                resumePercent = Math.round(resumeTime / resumeDuration * 100);
            }

            resumePercent = Utils.clamp(resumePercent, 0, 100);
"""
new = """            var resumeTime = Math.max(Number(params.time || params.position || 0), Number(timeline && timeline.time || 0));
            var resumeDuration = Math.max(Number(params.duration || 0), Number(timeline && timeline.duration || 0));
            var resumePercent = Math.max(Number(params.percent || 0), Number(timeline && timeline.percent || 0));

            if (!resumePercent && resumeTime > 0 && resumeDuration > 0) {
                resumePercent = Math.round(resumeTime / resumeDuration * 100);
            }

            resumePercent = Utils.clamp(resumePercent, 0, 100);

            if (!timeline || typeof timeline !== 'object') timeline = {};
            timeline.hash = hash;
            timeline.time = resumeTime;
            timeline.duration = resumeDuration;
            timeline.percent = resumePercent;
"""
replace_once(old, new, 'timeline resume block')

old_timeline = """                timeline: {
                    hash: hash,
                    time: resumeTime,
                    duration: resumeDuration,
                    percent: resumePercent
                },
"""
replace_once(old_timeline, "                timeline: timeline,\n", 'launch timeline object')

# Preserve the source marker for ordinary online playback, but do not resolve/open any UI.
s = s.replace(
    "                torrent_hash: torrentHash,\n                continue_watch_universal: true",
    "                torrent_hash: torrentHash,\n                isonline: !!params.isonline,\n                continue_watch_universal: true"
)

s = s.replace(
    "rememberBootStatus('ready', 'online fresh resolver + strict identity initialized');",
    "rememberBootStatus('ready', 'timeline-direct online + Just+ native return initialized');"
)

# Ensure resolver references are gone.
if 'OnlineResolverTransport' in s:
    raise SystemExit('OnlineResolverTransport reference remains')
if 'onlineResolveEnabled' in s or 'onlineResolveTimeoutMs' in s or 'onlineResolvePollMs' in s:
    raise SystemExit('online resolver config remains')

PATH.write_text(s, encoding='utf-8')
print('patched', len(s))
