from pathlib import Path
import re

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')


def sub_once(pattern, repl, label, flags=0):
    global s
    ns, count = re.subn(pattern, repl, s, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')
    s = ns


sub_once(
    r"var BOOT_VERSION = 'v5\.4\.0-strict-card-profile-sync-20260828';",
    "var BOOT_VERSION = 'v5.5.0-online-resume-url-routing-20260828';",
    'version'
)

# Preserve a canonical URL before dropping duplicate uri/src fields.
sub_once(
    r"function sanitizeRecord\(data\) \{\n\s*data = data \|\| \{\};\n\s*var out = Utils\.shallowClone\(data\);\n\s*var image = Utils\.extractImage\(data\);",
    "function sanitizeRecord(data) {\n            data = data || {};\n            var out = Utils.shallowClone(data);\n            var image = Utils.extractImage(data);\n            var canonicalUrl = Utils.stripFragment(data.url || data.uri || data.src || '');\n            if (canonicalUrl) out.url = canonicalUrl;",
    'sanitize canonical url'
)

# After compacting the playlist, recover the active online URL from its item when the
# top-level URL is missing. Torrent compact items are rebuilt per-device at launch.
anchor = """            if (Array.isArray(data.playlist) && data.playlist.length) {
                out.playlist_compact = compactPlaylist(data.playlist, data.torrent_link);
            }
            delete out.playlist;
"""
addition = """
            if (!out.url && out.playlist_compact && Array.isArray(out.playlist_compact.items)) {
                var compactIndex = Number(data.playlist_index || 0);
                if (compactIndex < 0) compactIndex = 0;
                if (compactIndex >= out.playlist_compact.items.length) compactIndex = out.playlist_compact.items.length - 1;
                var compactActive = out.playlist_compact.items[compactIndex];
                if (compactActive && compactActive.u) out.url = Utils.stripFragment(compactActive.u);
            }
"""
if anchor not in s:
    raise SystemExit('sanitize playlist anchor not found')
s = s.replace(anchor, anchor + addition, 1)

# Rebuild a launch URL from the active full/compact playlist before falling back to the
# record-level URL. Torrent URLs are always regenerated through this device's TorrServer.
sub_once(
    r"function buildLaunchUrl\(params\) \{.*?\n\s*\}",
    '''function buildLaunchUrl(params) {
            if (!params) return '';

            var index = Number(params.playlist_index || 0);

            if (Array.isArray(params.playlist) && params.playlist.length) {
                if (index < 0) index = 0;
                if (index >= params.playlist.length) index = params.playlist.length - 1;
                var fullItem = params.playlist[index] || {};
                var fullUrl = Utils.stripFragment(fullItem.url || fullItem.uri || fullItem.src || '');
                if (fullUrl) {
                    return Utils.parseStreamUrl(fullUrl) ? rebuildStreamUrl(fullUrl) : fullUrl;
                }
            }

            var packed = params.playlist_compact;
            if (packed && Array.isArray(packed.items) && packed.items.length) {
                if (index < 0) index = 0;
                if (index >= packed.items.length) index = packed.items.length - 1;
                var compactItem = packed.items[index] || {};

                if (compactItem.u) return Utils.stripFragment(compactItem.u);

                var compactLink = String(packed.link || params.torrent_link || '');
                if (compactItem.f && compactLink) {
                    return buildStreamUrl({
                        file_name: compactItem.f,
                        torrent_link: compactLink,
                        file_index: compactItem.i !== undefined ? Number(compactItem.i) : index
                    }) || '';
                }
            }

            if (params.file_name && params.torrent_link) return buildStreamUrl(params) || '';

            var direct = Utils.stripFragment(params.url || params.uri || params.src || '');
            if (direct) return Utils.parseStreamUrl(direct) ? rebuildStreamUrl(direct) : direct;
            return '';
        }''',
    'buildLaunchUrl',
    flags=re.S
)

# launchFromContinue must rebuild the playlist FIRST; the active playlist item is more
# authoritative than a possibly missing/legacy record-level URL.
old = '''            var url = StorageManager.buildLaunchUrl(params);
            if (!url) {
                try { Lampa.Noty.show('Не удалось восстановить ссылку просмотра'); } catch (e) {}
                return;
            }

            var season = Number(params.season || 0);
'''
new = '''            var playlist = rebuildPlaylistForLaunch(params);
            var playlistIndex = Number(params.playlist_index || 0);

            if (playlist && playlist.length) {
                if (isNaN(playlistIndex) || playlistIndex < 0) playlistIndex = 0;
                if (playlistIndex >= playlist.length) playlistIndex = playlist.length - 1;
            } else {
                playlistIndex = 0;
            }

            var activeItem = playlist && playlist.length ? playlist[playlistIndex] : null;
            var url = activeItem
                ? Utils.stripFragment(activeItem.url || activeItem.uri || activeItem.src || '')
                : '';
            if (!url) url = StorageManager.buildLaunchUrl(params);

            if (!url) {
                try { Lampa.Noty.show('Не удалось восстановить ссылку просмотра'); } catch (e) {}
                return;
            }

            var season = Number(params.season || 0);
'''
if old not in s:
    raise SystemExit('launch start block not found')
s = s.replace(old, new, 1)

# Remove the now-duplicate playlist reconstruction block later in launchFromContinue.
dup = '''            var playlist = rebuildPlaylistForLaunch(params);
            var playlistIndex = Number(params.playlist_index || 0);

            if (playlist && playlist.length) {
                if (isNaN(playlistIndex) || playlistIndex < 0) playlistIndex = 0;
                if (playlistIndex >= playlist.length) playlistIndex = playlist.length - 1;

                // Prefer the playlist's canonical URL. It is the URL Lampa stores and later
                // uses to match the URI returned by Just+.
                if (playlist[playlistIndex] && playlist[playlistIndex].url) {
                    url = playlist[playlistIndex].url;
                }
            }

            var activeItem = playlist && playlist.length ? playlist[playlistIndex] : null;
'''
if dup not in s:
    raise SystemExit('duplicate playlist block not found')
s = s.replace(dup, '', 1)

# A compact ONLINE playlist is not a torrent. Only an actual TorrServer URL, torrent link,
# torrent hash, or compact playlist with a shared torrent link should select player_torrent.
old_torrent = '''            var isTorrentResume = !!(
                params.torrent_link || params.file_name || params.playlist_compact || parsedLaunch
            );
'''
new_torrent = '''            var compactTorrentLink = params.playlist_compact && params.playlist_compact.link
                ? String(params.playlist_compact.link)
                : '';
            var isTorrentResume = !!(
                params.torrent_hash || params.torrent_link || compactTorrentLink || parsedLaunch
            );
'''
if old_torrent not in s:
    raise SystemExit('isTorrentResume block not found')
s = s.replace(old_torrent, new_torrent, 1)

# Keep route semantics explicit for diagnostics.
s = s.replace(
    "rememberBootStatus('ready', 'strict card identity + profile isolated sync initialized');",
    "rememberBootStatus('ready', 'strict identity + online/torrent resume routing initialized');",
    1
)

PATH.write_text(s, encoding='utf-8')
print('patched', len(s))
