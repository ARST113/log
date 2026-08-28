from pathlib import Path
import re

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')


def sub_once(pattern, repl, label, flags=0):
    global s
    new, count = re.subn(pattern, repl, s, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {count}')
    s = new


sub_once(
    r"var BOOT_VERSION = 'v5\.3\.0-justplus-sync-playlist-external-20260828';",
    "var BOOT_VERSION = 'v5.4.0-strict-card-profile-sync-20260828';",
    'version'
)

# Profile isolation: authenticated profiles keep their historical key, guests get
# an explicit local-only bucket instead of the unsuffixed shared bucket.
sub_once(
    r"function getStorageKey\(\) \{\n\s*var profileId = getProfileId\(\);\n\s*return profileId !== null && profileId !== undefined\n\s*\? CONFIG\.storageBaseKey \+ '_' \+ profileId\n\s*: CONFIG\.storageBaseKey;\n\s*\}",
    "function getStorageKey() {\n            var profileId = getProfileId();\n            return profileId !== null && profileId !== undefined\n                ? CONFIG.storageBaseKey + '_' + profileId\n                : CONFIG.storageBaseKey + '_guest';\n        }",
    'profile storage key'
)

# Never register/sync the guest bucket to the account storage backend.
sub_once(
    r"function ensureSync\(\) \{\n\s*var key = getActiveStorageKey\(\);\n\s*if \(syncedStorageKey === key\) return;",
    "function ensureSync() {\n            var key = getActiveStorageKey();\n            var profileId = getProfileId();\n            if (profileId === null || profileId === undefined) return;\n            if (syncedStorageKey === key) return;",
    'guest sync guard'
)

# Strong identity: media type + TMDB id. This avoids TV/movie namespace collisions
# and prevents unrelated cards from sharing a pointer.
sub_once(
    r"function getMovieKey\(movie\) \{.*?\n\s*\}\n\n\s*function getMovieKeyFromData\(data\) \{.*?\n\s*\}",
    '''function getMovieKey(movie) {
            if (!movie) return '';

            var id = movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '';
            var title = Utils.getMovieTitle(movie);
            var mediaType = Utils.getMediaKind(movie) || '';
            var year = String(movie.release_date || movie.first_air_date || movie.year || '').slice(0, 4);

            if (id) return 'tmdb:' + mediaType + ':' + id;
            if (title) return 'title:' + mediaType + ':' + Lampa.Utils.hash([title, year].join('|'));
            return '';
        }

        function getMovieKeyFromData(data) {
            if (!data) return '';
            if (data.card_key) return String(data.card_key);
            if (data.movie_key && String(data.movie_key).indexOf('tmdb:') === 0) return String(data.movie_key);

            var id = data.movie_id || data.tmdb_id || data.tmdbId || '';
            var mediaType = String(data.media_type || data.mediaType || '').toLowerCase();
            if (!mediaType) mediaType = (data.original_name || data.name) ? 'tv' : 'movie';

            if (id) return 'tmdb:' + mediaType + ':' + id;

            var title = data.original_title || data.original_name || data.title || data.name || '';
            var year = String(data.release_date || data.first_air_date || data.year || '').slice(0, 4);
            if (title) return 'title:' + mediaType + ':' + Lampa.Utils.hash([title, year].join('|'));
            return '';
        }''',
    'strict movie identity',
    flags=re.S
)

# Persist strict identity and profile id in every record.
sub_once(
    r"var data = \{\n\s*url: Utils\.stripFragment\(session\.url \|\| ''\),",
    "var data = {\n                card_key: StorageManager.getMovieKey(movie) || '',\n                profile_id: StorageManager.getProfileId() !== null ? StorageManager.getProfileId() : 'guest',\n                url: Utils.stripFragment(session.url || ''),",
    'buildParams identity fields'
)

# Pending return without in-memory session must retain the same strict card key.
sub_once(
    r"params\.url = item\.url \|\| params\.url \|\| '';",
    "params.card_key = pending.movie_key || params.card_key || '';\n            params.profile_id = StorageManager.getProfileId() !== null ? StorageManager.getProfileId() : 'guest';\n            params.url = item.url || params.url || '';",
    'resolved identity fields'
)

# Strict getLast lookup. Exact pointer/card_key first. Legacy records are accepted only
# when BOTH id and title match, and media types do not conflict.
pattern = r"var originalTitle = Utils\.getMovieTitle\(movie\);\n\s*var movieId = movie\.id \|\| movie\.movie_id \|\| movie\.tmdb_id \|\| movie\.tmdbId \|\| '';\n\s*var list = \[\];\n\n\s*Object\.keys\(params\)\.forEach\(function \(key\) \{.*?\n\s*\}\);\n\n\s*list\.sort"
replacement = '''var originalTitle = Utils.getMovieTitle(movie);
            var movieId = movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '';
            var movieType = Utils.getMediaKind(movie) || '';
            var list = [];

            Object.keys(params).forEach(function (key) {
                if (key === '__last_by_movie' || key.indexOf('__last__') === 0) return;

                var item = params[key];
                if (!item || typeof item !== 'object') return;

                var itemKey = getMovieKeyFromData(item);
                if (itemKey && itemKey === movieKey) {
                    list.push(item);
                    return;
                }

                // Legacy v5.3 and older: never match by bare numeric id alone.
                var itemId = item.movie_id || item.tmdb_id || item.tmdbId || '';
                var itemTitle = item.original_title || item.original_name || item.name || item.title || '';
                var itemType = String(item.media_type || item.mediaType || '').toLowerCase();
                var sameId = movieId && itemId && String(movieId) === String(itemId);
                var sameTitle = originalTitle && itemTitle && String(originalTitle) === String(itemTitle);
                var typeCompatible = !itemType || !movieType || itemType === movieType;

                if (sameId && sameTitle && typeCompatible) list.push(item);
            });

            list.sort'''
sub_once(pattern, replacement, 'strict getLast fallback', flags=re.S)

# findBaseStored is used after returning from Just+. Validate source_hash record against
# the strict pending movie key before accepting it as the base object.
sub_once(
    r"if \(pending\.source_hash && params\[pending\.source_hash\]\) return params\[pending\.source_hash\];",
    "if (pending.source_hash && params[pending.source_hash]) {\n                var sourceRecord = params[pending.source_hash];\n                var sourceKey = StorageManager.getMovieKeyFromData(sourceRecord);\n                if (sourceKey && sourceKey === pending.movie_key) return sourceRecord;\n            }",
    'validate source hash record'
)

# When scanning by movie_key during Just+ return, old bare id records are not accepted.
sub_once(
    r"if \(StorageManager\.getMovieKeyFromData\(item\) !== pending\.movie_key\) return;",
    "if (StorageManager.getMovieKeyFromData(item) !== pending.movie_key) return;",
    'explicit strict pending scan'
)

# Migration: stamp strict card_key when enough record metadata is present; never convert
# a legacy bare pointer into a strict pointer without validating the target record.
insert_anchor = "        function migrateCompactStorage(forceWrite) {\n            var params = getParams();\n            var changed = false;\n"
if insert_anchor not in s:
    raise SystemExit('migration anchor not found')
insert = '''
            Object.keys(params).forEach(function (key) {
                if (key === '__last_by_movie' || key.indexOf('__last__') === 0) return;
                var item = params[key];
                if (!item || typeof item !== 'object') return;
                var strictKey = getMovieKeyFromData(item);
                if (strictKey && String(strictKey).indexOf('tmdb:') === 0 && item.card_key !== strictKey) {
                    item.card_key = strictKey;
                    changed = true;
                }
            });
'''
s = s.replace(insert_anchor, insert_anchor + insert, 1)

# Do not copy legacy __last_by_movie blindly. Only create a strict pointer when its
# target record itself resolves to the same strict key.
sub_once(
    r"if \(params\.__last_by_movie && typeof params\.__last_by_movie === 'object'\) \{.*?delete params\.__last_by_movie;\n\s*changed = true;\n\s*\}",
    '''if (params.__last_by_movie && typeof params.__last_by_movie === 'object') {
                Object.keys(params.__last_by_movie).forEach(function (legacyMovieKey) {
                    var pointer = params.__last_by_movie[legacyMovieKey];
                    if (!pointer || !pointer.hash || !params[pointer.hash]) return;
                    var record = params[pointer.hash];
                    var strictKey = getMovieKeyFromData(record);
                    if (!strictKey || String(strictKey).indexOf('tmdb:') !== 0) return;
                    params[pointerStorageKey(strictKey)] = {
                        kind: 'pointer',
                        movie_key: strictKey,
                        hash: pointer.hash,
                        season: Number(record.season || pointer.season || 0),
                        episode: Number(record.episode || pointer.episode || 0),
                        media_type: record.media_type || pointer.media_type || '',
                        timestamp: Number(record.timestamp || pointer.timestamp || Utils.now())
                    };
                });
                delete params.__last_by_movie;
                changed = true;
            }''',
    'safe pointer migration',
    flags=re.S
)

# Make diagnostics explicit.
sub_once(
    r"rememberBootStatus\('ready', 'native \+ just return reconciliation initialized'\);",
    "rememberBootStatus('ready', 'strict card identity + profile isolated sync initialized');",
    'ready status'
)

PATH.write_text(s, encoding='utf-8')
print('patched', len(s))
