from pathlib import Path

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    s = s.replace(old, new, 1)


def insert_after(anchor, addition, label):
    global s
    count = s.count(anchor)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, got {count}')
    s = s.replace(anchor, anchor + addition, 1)


replace_once(
    "var BOOT_VERSION = 'v5.2.0-justplus-return-burst-20260827';",
    "var BOOT_VERSION = 'v5.3.0-justplus-sync-playlist-external-20260828';",
    'version'
)

replace_once(
    "        launchLockMs: 3000\n",
    "        syncRecordMaxChars: 9000,\n        syncPlaylistMaxChars: 6000,\n\n        launchLockMs: 3000\n",
    'config sync limits'
)

# ------------------------------------------------------------
# Utils: recover a real torrent hash when possible.
# ------------------------------------------------------------
insert_after(
    "        function streamIdentity(url) {\n            var parsed = parseStreamUrl(url);\n            if (!parsed) return stripFragment(url || '');\n\n            return [\n                parsed.torrent_link || '',\n                parsed.file_index !== undefined ? parsed.file_index : '',\n                parsed.file_name || ''\n            ].join('|');\n        }\n",
    "\n        function extractTorrentHash(value) {\n            value = safeDecode(String(value || '')).trim();\n            if (!value) return '';\n\n            var match = value.match(/btih:([a-z0-9]+)/i);\n            if (match) return match[1];\n\n            match = value.match(/(?:^|[^a-f0-9])([a-f0-9]{40}|[a-f0-9]{64})(?:[^a-f0-9]|$)/i);\n            return match ? match[1] : '';\n        }\n",
    'extractTorrentHash'
)
replace_once(
    "            streamIdentity: streamIdentity,\n",
    "            streamIdentity: streamIdentity,\n            extractTorrentHash: extractTorrentHash,\n",
    'export extractTorrentHash'
)

# ------------------------------------------------------------
# Storage: compact playlist so every object_object value remains
# below Lampa StorageWorker's hard 10k send limit.
# ------------------------------------------------------------
insert_after(
    "        function getMovieKeyFromData(data) {\n            if (!data) return '';\n            if (data.movie_key) return data.movie_key;\n            if (data.movie_id) return 'id:' + data.movie_id;\n            if (data.tmdb_id) return 'id:' + data.tmdb_id;\n\n            var title = data.original_title || data.original_name || data.title || data.name || '';\n            if (title) return 'title:' + Lampa.Utils.hash(title);\n            return '';\n        }\n",
    r'''

        function pointerStorageKey(movieKey) {
            return '__last__' + String(Lampa.Utils.hash(String(movieKey || '')));
        }

        function compactPlaylist(playlist, fallbackTorrentLink) {
            if (!Array.isArray(playlist) || !playlist.length) return null;

            var commonLink = String(fallbackTorrentLink || '');
            var items = [];

            playlist.forEach(function (item, index) {
                item = item || {};
                var url = Utils.stripFragment(item.url || item.uri || item.src || '');
                var parsed = Utils.parseStreamUrl(url);
                if (!commonLink && parsed && parsed.torrent_link) commonLink = parsed.torrent_link;

                var compact = {
                    i: item.file_index !== undefined && item.file_index !== null
                        ? Number(item.file_index)
                        : (parsed && parsed.file_index !== undefined ? Number(parsed.file_index) : index),
                    s: Number(item.season || item.season_number || item.s || 0),
                    e: Number(item.episode || item.episode_number || item.e || 0)
                };

                var fileName = item.file_name || item.filename || item.path || (parsed && parsed.file_name) || '';
                var title = item.title || item.name || item.label || '';
                var hash = item.timeline && item.timeline.hash && String(item.timeline.hash) !== '0'
                    ? String(item.timeline.hash)
                    : '';

                if (fileName) compact.f = String(fileName).slice(0, 220);
                if (title) compact.t = String(title).slice(0, 96);
                if (hash) compact.h = hash;
                if (!parsed && url) compact.u = url;

                items.push(compact);
            });

            var packed = { v: 1, link: commonLink, items: items };
            var json = Utils.safeJson(packed);

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) { delete item.t; });
                json = Utils.safeJson(packed);
            }

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) { delete item.h; });
                json = Utils.safeJson(packed);
            }

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) {
                    if (item.f) item.f = String(item.f).slice(0, 120);
                });
            }

            return packed;
        }

        function expandCompactPlaylist(params) {
            params = params || {};
            var packed = params.playlist_compact;
            if (!packed || !Array.isArray(packed.items)) return [];

            var commonLink = String(packed.link || params.torrent_link || '');

            return packed.items.map(function (item, index) {
                item = item || {};
                var url = String(item.u || '');

                if (!url && item.f && commonLink) {
                    url = buildStreamUrl({
                        file_name: item.f,
                        torrent_link: commonLink,
                        file_index: item.i !== undefined ? Number(item.i) : index
                    }) || '';
                }

                var season = Number(item.s || 0);
                var episode = Number(item.e || 0);
                var hash = String(item.h || '') || generateTimelineHash(params, season, episode);
                var title = item.t || (episode ? String(episode) : '');

                return {
                    url: url,
                    uri: url,
                    src: url,
                    title: title,
                    name: title,
                    filename: item.f || '',
                    file_name: item.f || '',
                    file_index: item.i !== undefined ? Number(item.i) : index,
                    playlist_index: index,
                    season: season,
                    episode: episode,
                    torrent_hash: params.torrent_hash || '',
                    timeline: hash ? { hash: hash, time: 0, duration: 0, percent: 0 } : undefined
                };
            });
        }

        function sanitizeRecord(data) {
            data = data || {};
            var out = Utils.shallowClone(data);
            var image = Utils.extractImage(data);

            if (Array.isArray(data.playlist) && data.playlist.length) {
                out.playlist_compact = compactPlaylist(data.playlist, data.torrent_link);
            }
            delete out.playlist;

            // Duplicated values make one synchronized object unnecessarily large.
            delete out.uri;
            delete out.src;
            delete out.currentItem;
            delete out.image;
            delete out.picture;
            delete out.poster;
            delete out.cover;
            delete out.thumb;
            delete out.thumbnail;
            delete out.preview;
            delete out.still_path;
            if (image) out.img = image;

            if (Utils.safeJson(out).length > CONFIG.syncRecordMaxChars && out.playlist_compact) {
                out.playlist_compact.items.forEach(function (item) {
                    delete item.t;
                    delete item.h;
                });
            }

            if (Utils.safeJson(out).length > CONFIG.syncRecordMaxChars) {
                delete out.img;
                if (out.episode_title && String(out.episode_title).length > 80) {
                    out.episode_title = String(out.episode_title).slice(0, 80);
                }
                if (out.title && String(out.title).length > 100) {
                    out.title = String(out.title).slice(0, 100);
                }
            }

            return out;
        }

        function migrateCompactStorage() {
            var params = getParams();
            var changed = false;

            if (params.__last_by_movie && typeof params.__last_by_movie === 'object') {
                Object.keys(params.__last_by_movie).forEach(function (movieKey) {
                    var pointer = params.__last_by_movie[movieKey];
                    if (!pointer || !pointer.hash) return;
                    params[pointerStorageKey(movieKey)] = {
                        kind: 'pointer',
                        movie_key: movieKey,
                        hash: pointer.hash,
                        season: Number(pointer.season || 0),
                        episode: Number(pointer.episode || 0),
                        media_type: pointer.media_type || '',
                        timestamp: Number(pointer.timestamp || Utils.now())
                    };
                });
                delete params.__last_by_movie;
                changed = true;
            }

            Object.keys(params).forEach(function (key) {
                if (key.indexOf('__last__') === 0) return;
                var item = params[key];
                if (!item || typeof item !== 'object') return;

                var clean = sanitizeRecord(item);
                if (Utils.safeJson(clean) !== Utils.safeJson(item)) {
                    params[key] = clean;
                    changed = true;
                }
            });

            if (changed) setParams(params, true);
            return changed;
        }
''',
    'storage compact helpers'
)

replace_once(
    "        function updateLastPointer(params, data, hash) {\n            if (!data || !hash) return;\n\n            var mediaType = String(data.media_type || data.mediaType || '').toLowerCase();\n            var isMovie = mediaType === 'movie';\n\n            if (!isMovie && (!data.season || !data.episode)) return;\n\n            var movieKey = getMovieKeyFromData(data);\n            if (!movieKey) return;\n\n            if (!params.__last_by_movie) params.__last_by_movie = {};\n\n            params.__last_by_movie[movieKey] = {\n                hash: hash,\n                season: Number(data.season || 0),\n                episode: Number(data.episode || 0),\n                media_type: mediaType || '',\n                timestamp: Utils.now()\n            };\n        }\n",
    "        function updateLastPointer(params, data, hash) {\n            if (!data || !hash) return;\n\n            var mediaType = String(data.media_type || data.mediaType || '').toLowerCase();\n            var isMovie = mediaType === 'movie';\n            if (!isMovie && (!data.season || !data.episode)) return;\n\n            var movieKey = getMovieKeyFromData(data);\n            if (!movieKey) return;\n\n            params[pointerStorageKey(movieKey)] = {\n                kind: 'pointer',\n                movie_key: movieKey,\n                hash: hash,\n                season: Number(data.season || 0),\n                episode: Number(data.episode || 0),\n                media_type: mediaType || '',\n                timestamp: Utils.now()\n            };\n        }\n",
    'pointer storage'
)

old_save = """        function saveStreamParams(hash, data, forceTimestamp) {
            if (!hash || !data) return false;

            var params = getParams();
            if (!params[hash]) params[hash] = {};

            var old = params[hash];
            var changed = false;

            Object.keys(data).forEach(function (key) {
                var value = data[key];
                if (value === undefined) return;

                if (key === 'playlist' && Array.isArray(value)) {
                    var oldJson = Utils.safeJson(old.playlist || []);
                    var newJson = Utils.safeJson(value);
                    if (oldJson !== newJson) {
                        old.playlist = value;
                        changed = true;
                    }
                    return;
                }

                if (old[key] !== value) {
                    old[key] = value;
                    changed = true;
                }
            });

            if (forceTimestamp || changed || !old.timestamp) {
                old.timestamp = Utils.now();
                if (!old.original_timestamp) old.original_timestamp = old.timestamp;
                updateLastPointer(params, old, hash);
                setParams(params, true);
                return true;
            }

            return false;
        }
"""
new_save = """        function saveStreamParams(hash, data, forceTimestamp) {
            if (!hash || !data) return false;

            var params = getParams();
            var previous = sanitizeRecord(params[hash] || {});
            var incoming = sanitizeRecord(data);
            var next = Utils.shallowClone(previous);

            Object.keys(incoming).forEach(function (key) {
                if (incoming[key] !== undefined) next[key] = incoming[key];
            });

            var changed = Utils.safeJson(previous) !== Utils.safeJson(next);

            if (forceTimestamp || changed || !next.timestamp) {
                next.timestamp = Utils.now();
                if (!next.original_timestamp) next.original_timestamp = next.timestamp;
                params[hash] = sanitizeRecord(next);
                updateLastPointer(params, params[hash], hash);
                setParams(params, true);
                return true;
            }

            return false;
        }
"""
replace_once(old_save, new_save, 'saveStreamParams')

# Prefer a small per-movie pointer, with old map as compatibility fallback.
replace_once(
    "            if (\n                movieKey &&\n                params.__last_by_movie &&\n                params.__last_by_movie[movieKey] &&\n                params.__last_by_movie[movieKey].hash &&\n                params[params.__last_by_movie[movieKey].hash]\n            ) {\n                return params[params.__last_by_movie[movieKey].hash];\n            }\n",
    "            var pointer = movieKey ? params[pointerStorageKey(movieKey)] : null;\n            if (pointer && pointer.hash && params[pointer.hash]) return params[pointer.hash];\n\n            if (\n                movieKey && params.__last_by_movie && params.__last_by_movie[movieKey] &&\n                params.__last_by_movie[movieKey].hash && params[params.__last_by_movie[movieKey].hash]\n            ) {\n                return params[params.__last_by_movie[movieKey].hash];\n            }\n",
    'getLast pointer'
)
replace_once(
    "                if (key === '__last_by_movie') return;\n\n                var item = params[key];\n",
    "                if (key === '__last_by_movie' || key.indexOf('__last__') === 0) return;\n\n                var item = params[key];\n",
    'skip pointers in getLast'
)

# Cleanup/migrate pointer records.
replace_once(
    "                if (key === '__last_by_movie') return;\n                var item = params[key];\n",
    "                if (key === '__last_by_movie' || key.indexOf('__last__') === 0) return;\n                var item = params[key];\n",
    'skip pointers in cleanup'
)
insert_after(
    "            if (params.__last_by_movie) {\n                Object.keys(params.__last_by_movie).forEach(function (key) {\n                    var pointer = params.__last_by_movie[key];\n                    if (!pointer || !pointer.hash || !params[pointer.hash]) {\n                        delete params.__last_by_movie[key];\n                        changed = true;\n                    }\n                });\n            }\n",
    "\n            Object.keys(params).forEach(function (key) {\n                if (key.indexOf('__last__') !== 0) return;\n                var pointer = params[key];\n                if (!pointer || !pointer.hash || !params[pointer.hash]) {\n                    delete params[key];\n                    changed = true;\n                }\n            });\n",
    'cleanup compact pointers'
)

replace_once(
    "            getMovieKeyFromData: getMovieKeyFromData,\n            saveStreamParams: saveStreamParams,\n",
    "            getMovieKeyFromData: getMovieKeyFromData,\n            compactPlaylist: compactPlaylist,\n            expandCompactPlaylist: expandCompactPlaylist,\n            migrateCompactStorage: migrateCompactStorage,\n            saveStreamParams: saveStreamParams,\n",
    'export storage compact'
)

# ------------------------------------------------------------
# Session persistence: retain real torrent identity but keep storage lean.
# ------------------------------------------------------------
replace_once(
    "                torrent_link: parsed ? parsed.torrent_link : '',\n                playlist: session.playlist || [],\n",
    "                torrent_link: parsed ? parsed.torrent_link : '',\n                torrent_hash: String(session.torrentHash || item.torrent_hash || ''),\n                playlist: session.playlist || [],\n",
    'buildParams torrent hash'
)
replace_once(
    "            if (image) Utils.copyImageFields(data, image);\n            return data;\n",
    "            if (image) data.img = image;\n            return data;\n",
    'lean buildParams image'
)
replace_once(
    "                lampaPercent: Number(data.percent || (data.timeline && data.timeline.percent) || 0),\n                lastRoad: null,\n",
    "                lampaPercent: Number(data.percent || (data.timeline && data.timeline.percent) || 0),\n                torrentHash: String(data.torrent_hash || (item && item.torrent_hash) || ''),\n                lastRoad: null,\n",
    'session torrent hash'
)
insert_after(
    "            currentSession.episode = Number(se.episode || currentSession.episode || 0);\n",
    "            currentSession.torrentHash = String(\n                payload.torrent_hash || (item && item.torrent_hash) || currentSession.torrentHash || ''\n            );\n",
    'update torrent hash'
)

# ------------------------------------------------------------
# Launch: expand the synchronized compact playlist and force Lampa
# through the torrent-player selection path for torrent resumes.
# ------------------------------------------------------------
replace_once(
    "        function rebuildPlaylistForLaunch(params) {\n            if (!Array.isArray(params.playlist)) return null;\n\n            return params.playlist.map(function (item, index) {\n",
    "        function rebuildPlaylistForLaunch(params) {\n            var sourcePlaylist = Array.isArray(params.playlist) && params.playlist.length\n                ? params.playlist\n                : StorageManager.expandCompactPlaylist(params);\n            if (!Array.isArray(sourcePlaylist) || !sourcePlaylist.length) return null;\n\n            return sourcePlaylist.map(function (item, index) {\n",
    'expand compact playlist on launch'
)
insert_after(
    "                clone.playlist_index = index;\n",
    "                clone.torrent_hash = clone.torrent_hash || params.torrent_hash || '';\n",
    'playlist torrent hash'
)

replace_once(
    "            var activeItem = playlist && playlist.length ? playlist[playlistIndex] : null;\n            var activeImage = Utils.extractImage(activeItem) || Utils.extractImage(params) || Utils.extractImage(movie);\n\n            var data = {\n",
    "            var activeItem = playlist && playlist.length ? playlist[playlistIndex] : null;\n            var activeImage = Utils.extractImage(activeItem) || Utils.extractImage(params) || Utils.extractImage(movie);\n            var parsedLaunch = Utils.parseStreamUrl(url);\n            var torrentHash = String(\n                params.torrent_hash ||\n                Utils.extractTorrentHash(params.torrent_link) ||\n                Utils.extractTorrentHash(parsedLaunch && parsedLaunch.torrent_link) ||\n                ''\n            );\n            var isTorrentResume = !!(\n                params.torrent_link || params.file_name || params.playlist_compact || parsedLaunch\n            );\n\n            // Lampa.Player.play chooses player_torrent only when torrent_hash is truthy.\n            // A sentinel is enough when the real hash is unavailable after cross-device sync.\n            if (!torrentHash && isTorrentResume) torrentHash = 'continue_watch_external';\n\n            var data = {\n",
    'torrent launch route'
)
replace_once(
    "                torrent_hash: params.torrent_link || '',\n",
    "                torrent_hash: torrentHash,\n",
    'use torrent hash'
)

# ------------------------------------------------------------
# Migrate old oversized local records after StorageWorker has had
# time to load, then trigger a sync-safe rewrite.
# ------------------------------------------------------------
replace_once(
    "            setTimeout(function () {\n                StorageManager.cleanupOld();\n            }, 10000);\n",
    "            setTimeout(function () {\n                StorageManager.migrateCompactStorage();\n                StorageManager.cleanupOld();\n            }, 7000);\n\n            setTimeout(function () {\n                StorageManager.migrateCompactStorage();\n            }, 16000);\n",
    'migration timers'
)

PATH.write_text(s, encoding='utf-8')
print('patched', PATH, 'chars=', len(s))
