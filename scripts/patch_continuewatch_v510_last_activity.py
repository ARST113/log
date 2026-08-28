from pathlib import Path
import re

path = Path('ContinueWatching.js')
s = path.read_text(encoding='utf-8')
old = s

OLD_VERSION = 'v5.9.0-online-playlist-resolvers-20260828'
NEW_VERSION = 'v5.10.0-last-activity-online-noty-20260828'

if OLD_VERSION not in s:
    raise SystemExit(f'expected version {OLD_VERSION} not found')
s = s.replace(OLD_VERSION, NEW_VERSION, 1)

# Config: phone-only online diagnostics.
needle = "        syncRecordMaxChars: 9000,\n        syncPlaylistMaxChars: 6000,\n\n\n        launchLockMs: 3000"
replacement = "        syncRecordMaxChars: 9000,\n        syncPlaylistMaxChars: 6000,\n\n        onlinePhoneNotyDebug: true,\n\n        launchLockMs: 3000"
if needle not in s:
    raise SystemExit('config insertion point not found')
s = s.replace(needle, replacement, 1)

# Utils: phone detection + concise online Noty diagnostics.
needle = """        function rememberActivityMovie(movie) {
            if (movie && typeof movie === 'object') lastActivityMovie = movie;
            return lastActivityMovie;
        }

        return {
"""
replacement = """        function rememberActivityMovie(movie) {
            if (movie && typeof movie === 'object') lastActivityMovie = movie;
            return lastActivityMovie;
        }

        function isPhoneLike() {
            var ua = '';
            var touch = false;
            var minSide = 9999;

            try { ua = String(navigator.userAgent || '').toLowerCase(); } catch (e) {}
            try { touch = Number(navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window); } catch (e2) {}
            try { minSide = Math.min(Number(window.innerWidth || 9999), Number(window.innerHeight || 9999)); } catch (e3) {}

            if (!touch) return false;
            if (/iphone|ipod|android.*mobile|mobile/i.test(ua)) return true;
            return minSide <= 900;
        }

        function shortDebugUrl(url) {
            url = String(url || '');
            if (!url) return '-';
            try {
                var parsed = new URL(url, location.href);
                var out = parsed.host + parsed.pathname;
                if (out.length > 58) out = out.slice(0, 55) + '...';
                return out;
            } catch (e) {
                return url.length > 58 ? url.slice(0, 55) + '...' : url;
            }
        }

        function onlineNoty(message) {
            if (!CONFIG.onlinePhoneNotyDebug || !isPhoneLike()) return;
            try {
                if (Lampa.Noty && Lampa.Noty.show) {
                    Lampa.Noty.show('[CW online] ' + String(message || '').slice(0, 180));
                }
            } catch (e) {}
        }

        return {
"""
if needle not in s:
    raise SystemExit('utils insertion point not found')
s = s.replace(needle, replacement, 1)

needle = """            getActivityMovie: getActivityMovie,
            rememberActivityMovie: rememberActivityMovie,
            captureOnlineContext: captureOnlineContext
"""
replacement = """            getActivityMovie: getActivityMovie,
            rememberActivityMovie: rememberActivityMovie,
            captureOnlineContext: captureOnlineContext,
            isPhoneLike: isPhoneLike,
            shortDebugUrl: shortDebugUrl,
            onlineNoty: onlineNoty
"""
if needle not in s:
    raise SystemExit('utils export point not found')
s = s.replace(needle, replacement, 1)

# Storage: activity score comes from Timeline.updated first, then explicit playback activity.
needle = """        function updateLastPointer(params, data, hash) {
            if (!data || !hash) return;

            var mediaType = String(data.media_type || data.mediaType || '').toLowerCase();
            var isMovie = mediaType === 'movie';
            if (!isMovie && (!data.season || !data.episode)) return;

            var movieKey = getMovieKeyFromData(data);
            if (!movieKey) return;

            params[pointerStorageKey(movieKey)] = {
                kind: 'pointer',
                movie_key: movieKey,
                hash: hash,
                season: Number(data.season || 0),
                episode: Number(data.episode || 0),
                media_type: mediaType || '',
                timestamp: Utils.now()
            };
        }
"""
replacement = """        function recordActivityAt(data, hash) {
            data = data || {};
            hash = String(data.timeline_hash || hash || '');

            var timelineUpdated = 0;
            try {
                var road = hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null;
                timelineUpdated = Number(road && road.updated || 0);
            } catch (e) {}

            var explicitActivity = Number(data.activity_at || data.last_activity_at || 0);
            var authoritative = Math.max(timelineUpdated, explicitActivity);
            if (authoritative > 0) return authoritative;

            // Legacy fallback only. Once Timeline/activity_at exists, storage rewrites
            // and migrations can no longer make an older source look newer.
            return Number(data.timestamp || data.original_timestamp || 0);
        }

        function updateLastPointer(params, data, hash) {
            if (!data || !hash) return;

            var mediaType = String(data.media_type || data.mediaType || '').toLowerCase();
            var isMovie = mediaType === 'movie';
            if (!isMovie && (!data.season || !data.episode)) return;

            var movieKey = getMovieKeyFromData(data);
            if (!movieKey) return;

            var pointerKey = pointerStorageKey(movieKey);
            var candidateAt = recordActivityAt(data, hash);
            var currentPointer = params[pointerKey];

            if (currentPointer && currentPointer.hash && params[currentPointer.hash]) {
                var currentAt = recordActivityAt(params[currentPointer.hash], currentPointer.hash);
                if (currentAt > candidateAt) return;
            }

            params[pointerKey] = {
                kind: 'pointer',
                movie_key: movieKey,
                hash: hash,
                season: Number(data.season || 0),
                episode: Number(data.episode || 0),
                media_type: mediaType || '',
                activity_at: candidateAt,
                timestamp: Utils.now()
            };
        }
"""
if needle not in s:
    raise SystemExit('updateLastPointer block not found')
s = s.replace(needle, replacement, 1)

# Storage: never trust the independently synced pointer as authoritative.
pattern = re.compile(r"        function getLastStreamParams\(movie\) \{.*?\n        \}\n\n        function cleanupOld\(\) \{", re.S)
match = pattern.search(s)
if not match:
    raise SystemExit('getLastStreamParams block not found')
replacement = """        function getLastStreamParams(movie) {
            if (!movie) return null;

            var params = getParams();
            var movieKey = getMovieKey(movie);
            var originalTitle = Utils.getMovieTitle(movie);
            var movieId = movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '';
            var movieType = Utils.getMediaKind(movie) || '';
            var pointer = movieKey ? params[pointerStorageKey(movieKey)] : null;
            var pointerHash = pointer && pointer.hash ? String(pointer.hash) : '';
            var list = [];

            Object.keys(params).forEach(function (key) {
                if (key === '__last_by_movie' || key.indexOf('__last__') === 0) return;

                var item = params[key];
                if (!item || typeof item !== 'object') return;

                var matched = false;
                var itemKey = getMovieKeyFromData(item);
                if (itemKey && itemKey === movieKey) matched = true;

                if (!matched) {
                    // Legacy v5.3 and older: never match by bare numeric id alone.
                    var itemId = item.movie_id || item.tmdb_id || item.tmdbId || '';
                    var itemTitle = item.original_title || item.original_name || item.name || item.title || '';
                    var itemType = String(item.media_type || item.mediaType || '').toLowerCase();
                    var sameId = movieId && itemId && String(movieId) === String(itemId);
                    var sameTitle = originalTitle && itemTitle && String(originalTitle) === String(itemTitle);
                    var typeCompatible = !itemType || !movieType || itemType === movieType;
                    matched = !!(sameId && sameTitle && typeCompatible);
                }

                if (!matched) return;

                list.push({
                    key: String(key),
                    item: item,
                    activity: recordActivityAt(item, key),
                    pointer: pointerHash && String(key) === pointerHash ? 1 : 0,
                    timestamp: Number(item.timestamp || 0)
                });
            });

            list.sort(function (a, b) {
                if (b.activity !== a.activity) return b.activity - a.activity;
                if (b.pointer !== a.pointer) return b.pointer - a.pointer;
                return b.timestamp - a.timestamp;
            });

            return list.length ? list[0].item : null;
        }

        function cleanupOld() {"""
s = s[:match.start()] + replacement + s[match.end():]

# Core: only real playback progress advances activity_at. A mere start/storage rewrite does not.
needle = """            params.last_source = event.source || session.transport || 'lampa';
            params.last_event_type = event.type;
            params.last_reason = event.reason || '';

            session.lampaTime = time;
"""
replacement = """            params.last_source = event.source || session.transport || 'lampa';
            params.last_event_type = event.type;
            params.last_reason = event.reason || '';

            var previousActivityAt = 0;
            try {
                var storedForActivity = StorageManager.getParams();
                previousActivityAt = Number(storedForActivity && storedForActivity[hash] && storedForActivity[hash].activity_at || 0);
            } catch (eActivity) {}

            var eventActivityAt = Number(event.activity_at || event.updated || 0);
            var meaningfulActivity = event.type !== 'start' && (
                time > 0 || percent > 0 || event.type === 'ended' || event.type === 'stop'
            );
            if (!eventActivityAt && meaningfulActivity) eventActivityAt = Utils.now();
            params.activity_at = Math.max(previousActivityAt, eventActivityAt, Number(params.activity_at || 0));

            session.lampaTime = time;
"""
if needle not in s:
    raise SystemExit('Core activity insertion point not found')
s = s.replace(needle, replacement, 1)

# Just+ authoritative return timestamps.
s = s.replace(
"""                    percent: Number(road.percent || 0),
                    force: true,
                    reason: reason || 'native_return_burst'
""",
"""                    percent: Number(road.percent || 0),
                    activity_at: Number(road.updated || candidate.event && candidate.event.updated || Utils.now()),
                    force: true,
                    reason: reason || 'native_return_burst'
""",
1)

s = s.replace(
"""                    percent: Number(data.road.percent || 0),
                    force: true,
                    reason: 'just_timeline_fallback'
""",
"""                    percent: Number(data.road.percent || 0),
                    activity_at: Number(data.road.updated || Utils.now()),
                    force: true,
                    reason: 'just_timeline_fallback'
""",
1)

needle = """            params.percent = Number(road.percent || 0);
            params.last_source = 'just';
"""
replacement = """            params.percent = Number(road.percent || 0);
            params.activity_at = Number(road.updated || candidate.event && candidate.event.updated || Utils.now());
            params.last_source = 'just';
"""
if needle not in s:
    raise SystemExit('Just+ saveResolved activity point not found')
s = s.replace(needle, replacement, 1)

# Native Timeline timestamps + one Noty when an online episode hash changes on phone.
s = s.replace(
"""    var LampaNativeTransport = (function () {
        var installed = false;
        var lastTimelineHash = '';
""",
"""    var LampaNativeTransport = (function () {
        var installed = false;
        var lastTimelineHash = '';
        var lastOnlineDebugHash = '';
""",
1)

needle = """                patch.percent = Number(road.percent || 0);
                patch.last_source = 'lampa';
"""
replacement = """                patch.percent = Number(road.percent || 0);
                patch.activity_at = Number(road.updated || Utils.now());
                patch.last_source = 'lampa';
"""
if needle not in s:
    raise SystemExit('native stored timeline activity point not found')
s = s.replace(needle, replacement, 1)

needle = """            lastTimelineHash = hash;

            if (CONFIG.saveNativeTimelineToCustomStorage) {
                Core.consume({
"""
replacement = """            lastTimelineHash = hash;

            if (session && session.isOnline && lastOnlineDebugHash !== hash) {
                lastOnlineDebugHash = hash;
                Utils.onlineNoty(
                    'timeline S' + Number(session.season || 0) +
                    'E' + Number(session.episode || 0) +
                    ' ' + Utils.formatSeconds(Number(road.time || 0)) +
                    ' hash=' + hash
                );
            }

            if (CONFIG.saveNativeTimelineToCustomStorage) {
                Core.consume({
"""
if needle not in s:
    raise SystemExit('native online debug insertion point not found')
s = s.replace(needle, replacement, 1)

needle = """                    percent: Number(road.percent || 0),
                    force: false,
                    reason: 'timeline_update'
"""
replacement = """                    percent: Number(road.percent || 0),
                    activity_at: Number(road.updated || Utils.now()),
                    force: false,
                    reason: 'timeline_update'
"""
if needle not in s:
    raise SystemExit('native Core activity point not found')
s = s.replace(needle, replacement, 1)

# Online phone diagnostics: capture/routing/resolver/final Player URL.
needle = """                        var mediaForResolver = data.url || data.uri || data.src || '';
                        var resolverMeta = OnlineResolverCapture.lookup(mediaForResolver) ||
                            OnlineResolverCapture.lookupEpisode(movieForResolver, data);
"""
replacement = """                        var mediaForResolver = data.url || data.uri || data.src || '';
                        var resolverMeta = OnlineResolverCapture.lookup(mediaForResolver) ||
                            OnlineResolverCapture.lookupEpisode(movieForResolver, data);
                        Utils.onlineNoty(
                            'play S' + Number(data.season || 0) + 'E' + Number(data.episode || 0) +
                            ' resolver=' + (resolverMeta ? 'yes' : 'no') +
                            ' url=' + Utils.shortDebugUrl(mediaForResolver)
                        );
"""
if needle not in s:
    raise SystemExit('online player patch debug point not found')
s = s.replace(needle, replacement, 1)

needle = """            if (params.isonline && activeResolverUrl) {
                OnlineResolverCapture.resolve({
"""
replacement = """            if (params.isonline) {
                Utils.onlineNoty(
                    'continue S' + season + 'E' + episode +
                    ' ' + Utils.formatSeconds(resumeTime) +
                    ' resolver=' + (activeResolverUrl ? 'yes' : 'no') +
                    ' hash=' + hash
                );
            }

            if (params.isonline && activeResolverUrl) {
                Utils.onlineNoty('resolve -> ' + Utils.shortDebugUrl(activeResolverUrl));
                OnlineResolverCapture.resolve({
"""
if needle not in s:
    raise SystemExit('online continue debug point not found')
s = s.replace(needle, replacement, 1)

needle = """                }, function (resolved) {
                    startPlayback(resolved);
                });
"""
replacement = """                }, function (resolved) {
                    Utils.onlineNoty(
                        resolved && resolved.url
                            ? 'resolve OK -> ' + Utils.shortDebugUrl(resolved.url)
                            : 'resolve FAIL'
                    );
                    startPlayback(resolved);
                });
"""
# Replace the occurrence in launchFromContinue closest to the end. There may be other resolve callbacks.
pos = s.rfind(needle)
if pos < 0:
    raise SystemExit('online resolver callback debug point not found')
s = s[:pos] + replacement + s[pos+len(needle):]

needle = """                try {
                    Lampa.Player.play(data);
                } catch (e3) {
"""
replacement = """                if (params.isonline) {
                    Utils.onlineNoty('player -> ' + Utils.shortDebugUrl(data.url || data.uri || data.src || ''));
                }

                try {
                    Lampa.Player.play(data);
                } catch (e3) {
"""
if needle not in s:
    raise SystemExit('online final player debug point not found')
s = s.replace(needle, replacement, 1)

# Update ready status wording.
s = s.replace(
    "rememberBootStatus('ready', 'timeline-direct online + Just+ native return initialized');",
    "rememberBootStatus('ready', 'last-activity selection + online phone diagnostics + Just+ initialized');"
)

if s == old:
    raise SystemExit('patch produced no changes')

path.write_text(s, encoding='utf-8')
print('patched', OLD_VERSION, '->', NEW_VERSION)
