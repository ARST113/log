(function () {
    'use strict';

    var BOOT_VERSION = 'v5.7.0-timeline-direct-20260828';
    var PLUGIN_NAME = 'ContinueWatchUniversal';
    var PLUGIN_VERSION = BOOT_VERSION;

    function rememberBootStatus(phase, details) {
        try {
            localStorage.setItem('continue_watch_boot_status', JSON.stringify({
                version: BOOT_VERSION,
                phase: phase,
                details: details || '',
                timestamp: Date.now()
            }));
        } catch (e) {}
    }

    if (!window.Lampa) {
        rememberBootStatus('waiting', 'window.Lampa is not ready');

        if (!window.__CONTINUE_WATCH_WAITING_FOR_LAMPA__) {
            window.__CONTINUE_WATCH_WAITING_FOR_LAMPA__ = true;

            var waitingScriptUrl = '';
            var waitingAttempts = 0;

            try {
                waitingScriptUrl = document.currentScript && document.currentScript.src
                    ? document.currentScript.src
                    : '';
            } catch (e) {}

            var waitingTimer = setInterval(function () {
                waitingAttempts += 1;

                if (window.Lampa && waitingScriptUrl) {
                    clearInterval(waitingTimer);
                    window.__CONTINUE_WATCH_WAITING_FOR_LAMPA__ = false;
                    rememberBootStatus('retrying', 'Lampa became ready');

                    var retryScript = document.createElement('script');
                    retryScript.async = true;
                    retryScript.src = waitingScriptUrl;
                    (document.head || document.documentElement).appendChild(retryScript);
                    return;
                }

                if (waitingAttempts >= 120) {
                    clearInterval(waitingTimer);
                    window.__CONTINUE_WATCH_WAITING_FOR_LAMPA__ = false;
                    rememberBootStatus('timeout', 'Lampa did not become ready');
                }
            }, 250);
        }

        return;
    }

    if (
        window.__CONTINUE_WATCH_NATIVE_JUST_READY__ &&
        window.__CONTINUE_WATCH_NATIVE_JUST_VERSION__ === BOOT_VERSION
    ) {
        return;
    }

    window.__CONTINUE_WATCH_NATIVE_JUST_LOADING__ = true;
    window.__CONTINUE_WATCH_NATIVE_JUST_VERSION__ = BOOT_VERSION;

    var DEBUG = {
        enabled: false,
        console: false,
        exposeApi: true
    };

    var CONFIG = {
        storageBaseKey: 'continue_watch_params',
        cleanupAgeMs: 60 * 24 * 60 * 60 * 1000,
        debounceDelayMs: 800,

        minSaveSeconds: 8,
        minDurationSeconds: 60,
        finishPercent: 90,

        nativePlayerEventsEnabled: true,
        nativeTimelineEnabled: true,
        saveNativeTimelineToCustomStorage: true,

        // Android Lampa exposes torrent playback as "android". The actual selected
        // external package is chosen by the native shell. For this plugin that path
        // is treated as the Just+ transport: the authoritative result comes back via
        // Lampa.Timeline after Just+ finishes.
        justTransportEnabled: true,
        justAndroidPlayerValue: 'android',
        justPendingKey: 'continue_watch_just_pending_v1',
        justResultSettleMs: 1400,
        justReconcileIntervalMs: 1000,
        justReturnBurstMs: 4000,
        justCompletionFallbackMs: 3500,

        hookRetryMs: 500,
        hookRetryMaxMs: 60000,
        syncRecordMaxChars: 9000,
        syncPlaylistMaxChars: 6000,


        launchLockMs: 3000
    };

    // ============================================================
    // Utils
    // ============================================================

    var Utils = (function () {
        var lastActivityMovie = null;

        function now() {
            return Date.now ? Date.now() : new Date().getTime();
        }

        function log() {
            if (!DEBUG.enabled || !DEBUG.console || !window.console) return;
            try {
                console.log.apply(console, ['[' + PLUGIN_NAME + ']'].concat(Array.prototype.slice.call(arguments)));
            } catch (e) {}
        }

        function warn() {
            if (!window.console) return;
            try {
                console.warn.apply(console, ['[' + PLUGIN_NAME + ']'].concat(Array.prototype.slice.call(arguments)));
            } catch (e) {}
        }

        function error() {
            if (!window.console) return;
            try {
                console.error.apply(console, ['[' + PLUGIN_NAME + ']'].concat(Array.prototype.slice.call(arguments)));
            } catch (e) {}
        }

        function stripFragment(url) {
            if (typeof url !== 'string') return url || '';
            var pos = url.indexOf('#');
            return pos >= 0 ? url.substring(0, pos) : url;
        }

        function safeDecode(value) {
            value = String(value || '');
            try {
                return decodeURIComponent(value);
            } catch (e) {
                return value;
            }
        }

        function safeJson(value) {
            try {
                return JSON.stringify(value);
            } catch (e) {
                return '';
            }
        }

        function clamp(value, min, max) {
            value = Number(value || 0);
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        function pad2(value) {
            value = Number(value || 0);
            return value < 10 ? '0' + value : String(value);
        }

        function formatSeconds(seconds) {
            seconds = Number(seconds || 0);
            if (!seconds || seconds < 0) return '0:00';

            var total = Math.floor(seconds);
            var h = Math.floor(total / 3600);
            var m = Math.floor((total % 3600) / 60);
            var s = total % 60;

            if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
            return m + ':' + pad2(s);
        }

        function firstNonEmpty() {
            for (var i = 0; i < arguments.length; i++) {
                if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') {
                    return arguments[i];
                }
            }
            return '';
        }

        function normalizeImageUrl(src) {
            src = String(src || '').trim();
            if (!src) return '';

            if (/^\/\//.test(src)) return location.protocol + src;
            if (/^(https?:|data:image\/|blob:)/i.test(src)) return src;

            if (src.charAt(0) === '/') {
                try {
                    if (Lampa.Api && Lampa.Api.img) return Lampa.Api.img(src, 'w300');
                } catch (e) {}

                try {
                    if (Lampa.TMDB && Lampa.TMDB.image) return Lampa.TMDB.image(src, 'w300');
                } catch (e2) {}
            }

            return src;
        }

        function extractImage(obj) {
            if (!obj || typeof obj !== 'object') return '';

            var direct = firstNonEmpty(
                obj.img,
                obj.image,
                obj.picture,
                obj.poster,
                obj.cover,
                obj.thumb,
                obj.thumbnail,
                obj.preview,
                obj.still_path,
                obj.still,
                obj.poster_path,
                obj.backdrop_path
            );

            if (direct) return normalizeImageUrl(direct);

            var nested = [
                obj.currentItem,
                obj.item,
                obj.file,
                obj.episode_data,
                obj.episodeData,
                obj.timeline,
                obj.card,
                obj.movie,
                obj.data
            ];

            for (var i = 0; i < nested.length; i++) {
                direct = extractImage(nested[i]);
                if (direct) return direct;
            }

            return '';
        }

        function copyImageFields(target, image) {
            image = normalizeImageUrl(image);
            if (!target || !image) return target;

            target.img = target.img || image;
            target.image = target.image || image;
            target.picture = target.picture || image;
            target.poster = target.poster || image;
            target.cover = target.cover || image;
            target.thumb = target.thumb || image;
            target.thumbnail = target.thumbnail || image;
            target.preview = target.preview || image;
            target.still_path = target.still_path || image;

            return target;
        }

        function getPlatformKind() {
            var ua = '';
            try { ua = String(navigator.userAgent || '').toLowerCase(); } catch (e) {}

            try {
                if (Lampa.Platform && Lampa.Platform.is) {
                    if (Lampa.Platform.is('android')) return 'android';
                    if (Lampa.Platform.is('webos')) return 'lg_webos';
                    if (Lampa.Platform.is('tizen')) return 'samsung_tizen';
                    if (Lampa.Platform.is('apple_tv')) return 'apple_tv';
                    if (Lampa.Platform.is('apple')) return 'apple';
                }
            } catch (e2) {}

            if (/android/.test(ua)) return 'android';
            if (/web0s|webos|netcast|lg browser/.test(ua)) return 'lg_webos';
            if (/tizen|samsungbrowser|smart-tv|smarttv/.test(ua)) return 'samsung_tizen';
            return 'unknown';
        }

        function getTorrentPlayerType() {
            try {
                return String(Lampa.Storage.field('player_torrent') || '');
            } catch (e) {
                return '';
            }
        }

        function isJustTransport() {
            if (!CONFIG.justTransportEnabled) return false;
            return getPlatformKind() === 'android' && getTorrentPlayerType() === CONFIG.justAndroidPlayerValue;
        }

        function parseStreamUrl(url) {
            if (!url || typeof url !== 'string') return null;
            url = stripFragment(url);

            var fileMatch = url.match(/\/stream\/([^?]+)/);
            var linkMatch = url.match(/[?&]link=([^&#]+)/);
            var indexMatch = url.match(/[?&]index=(\d+)/);

            if (!fileMatch || !linkMatch) return null;

            return {
                file_name: safeDecode(fileMatch[1]).replace(/\+/g, ' ').replace(/\s+/g, ' ').trim(),
                torrent_link: safeDecode(linkMatch[1]),
                file_index: indexMatch ? parseInt(indexMatch[1], 10) : 0
            };
        }

        function streamIdentity(url) {
            var parsed = parseStreamUrl(url);
            if (!parsed) return stripFragment(url || '');

            return [
                parsed.torrent_link || '',
                parsed.file_index !== undefined ? parsed.file_index : '',
                parsed.file_name || ''
            ].join('|');
        }

        function extractTorrentHash(value) {
            value = safeDecode(String(value || '')).trim();
            if (!value) return '';

            var match = value.match(/btih:([a-z0-9]+)/i);
            if (match) return match[1];

            match = value.match(/(?:^|[^a-f0-9])([a-f0-9]{40}|[a-f0-9]{64})(?:[^a-f0-9]|$)/i);
            return match ? match[1] : '';
        }

        function getMovieTitle(obj) {
            obj = obj || {};
            return String(
                obj.original_name ||
                obj.original_title ||
                obj.name ||
                obj.title ||
                obj.originalName ||
                obj.originalTitle ||
                ''
            );
        }

        function getMediaKind(obj) {
            obj = obj || {};
            var card = obj.card || obj.movie || obj.data || obj;
            var media = String(
                obj.media_type || obj.mediaType || card.media_type || card.mediaType || ''
            ).toLowerCase();

            if (media === 'movie' || media === 'film') return 'movie';
            if (media === 'tv' || media === 'show' || media === 'series') return 'tv';

            if (
                Number(card.number_of_seasons || 0) > 0 ||
                Number(card.number_of_episodes || 0) > 0 ||
                card.original_name ||
                card.first_air_date ||
                card.seasons !== undefined ||
                card.episodes !== undefined ||
                card.last_episode_to_air !== undefined ||
                card.next_episode_to_air !== undefined
            ) {
                return 'tv';
            }

            return 'movie';
        }

        function extractExplicitSE(data) {
            data = data || {};

            var pairs = [
                [data.season, data.episode],
                [data.season_number, data.episode_number],
                [data.s, data.e]
            ];

            for (var i = 0; i < pairs.length; i++) {
                var season = Number(pairs[i][0] || 0);
                var episode = Number(pairs[i][1] || 0);
                if (season > 0 && episode > 0) {
                    return { season: season, episode: episode, source: 'explicit_fields' };
                }
            }

            return null;
        }

        function extractSEFromText(data, fallbackSeason) {
            data = data || {};
            fallbackSeason = Number(fallbackSeason || 0);

            var texts = [
                data.file_name,
                data.filename,
                data.title,
                data.name,
                data.path,
                data.path_human,
                data.folder_name,
                data.episode_title,
                data.url,
                data.uri,
                data.src
            ];

            if (data.currentItem) {
                texts.push(
                    data.currentItem.filename,
                    data.currentItem.file_name,
                    data.currentItem.title,
                    data.currentItem.name,
                    data.currentItem.uri,
                    data.currentItem.url
                );
            }

            function parse(text) {
                if (!text || typeof text !== 'string') return null;

                text = safeDecode(text).replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
                var m;

                m = text.match(/\bS(?:eason)?\s*0?(\d{1,2})\s*[\.\-_: ]*\s*E(?:p(?:isode)?)?\s*0?(\d{1,3})\b/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_sxe' };

                m = text.match(/\b0?(\d{1,2})\s*[xх×]\s*0?(\d{1,3})\b/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_1x02' };

                m = text.match(/season\s*0?(\d{1,2}).*?(?:episode|ep\.?)\s*0?(\d{1,3})/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_season_episode' };

                m = text.match(/0?(\d{1,2})\s*сезон.*?0?(\d{1,3})\s*сер/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_ru_season_episode' };

                m = text.match(/(?:эпизод|сер(?:ия|ии|и)?|episode|ep\.?|сер\.)\s*[-–—:]?\s*0?(\d{1,3})/i);
                if (m && fallbackSeason > 0) {
                    return { season: fallbackSeason, episode: parseInt(m[1], 10), source: 'text_episode_only' };
                }

                m = text.match(/(?:^|[\s._\-\[\(])0?(\d{1,3})(?:\s*(?:v\d+)?\s*(?:\[[^\]]+\]|\([^)]+\))*)?\.(?:mkv|mp4|avi|ts)$/i);
                if (m && fallbackSeason > 0) {
                    return { season: fallbackSeason, episode: parseInt(m[1], 10), source: 'filename_episode_only' };
                }

                return null;
            }

            for (var i = 0; i < texts.length; i++) {
                var result = parse(texts[i]);
                if (result) return result;
            }

            return null;
        }

        function shallowClone(obj) {
            var out = {};
            if (!obj || typeof obj !== 'object') return out;

            Object.keys(obj).forEach(function (key) {
                var value = obj[key];
                if (value === undefined || typeof value === 'function') return;
                out[key] = value;
            });

            return out;
        }

        function getActivityMovie() {
            try {
                var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
                var movie = active && (
                    active.movie ||
                    active.card ||
                    (active.params && active.params.movie)
                );

                if (movie) {
                    lastActivityMovie = movie;
                    return movie;
                }
            } catch (e) {}

            return lastActivityMovie;
        }

        function captureOnlineContext(data, movie) {
            data = data || {};
            if (!data.isonline) return null;

            var active = null;
            try {
                active = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
            } catch (e) {}

            active = active || {};
            movie = movie || data.card || data.movie || {};

            var context = {
                component: String(active.component || ''),
                url: String(active.url || ''),
                title: String(active.title || ''),
                search: String(active.search || ''),
                search_one: String(active.search_one || ''),
                search_two: String(active.search_two || ''),
                clarification: !!active.clarification,
                similar: active.similar !== false,
                balanser: String(active.balanser || ''),
                page: Number(active.page || 1)
            };

            if (!context.search) context.search = String(movie.title || movie.name || '');
            if (!context.search_one) context.search_one = String(movie.title || movie.name || '');
            if (!context.search_two) context.search_two = String(movie.original_title || movie.original_name || '');

            return context.component ? context : null;
        }

        function rememberActivityMovie(movie) {
            if (movie && typeof movie === 'object') lastActivityMovie = movie;
            return lastActivityMovie;
        }

        return {
            now: now,
            log: log,
            warn: warn,
            error: error,
            stripFragment: stripFragment,
            safeDecode: safeDecode,
            safeJson: safeJson,
            clamp: clamp,
            formatSeconds: formatSeconds,
            firstNonEmpty: firstNonEmpty,
            normalizeImageUrl: normalizeImageUrl,
            extractImage: extractImage,
            copyImageFields: copyImageFields,
            getPlatformKind: getPlatformKind,
            getTorrentPlayerType: getTorrentPlayerType,
            isJustTransport: isJustTransport,
            parseStreamUrl: parseStreamUrl,
            streamIdentity: streamIdentity,
            extractTorrentHash: extractTorrentHash,
            getMovieTitle: getMovieTitle,
            getMediaKind: getMediaKind,
            extractExplicitSE: extractExplicitSE,
            extractSEFromText: extractSEFromText,
            shallowClone: shallowClone,
            getActivityMovie: getActivityMovie,
            rememberActivityMovie: rememberActivityMovie,
            captureOnlineContext: captureOnlineContext
        };
    })();

    // ============================================================
    // StorageManager
    // ============================================================

    var StorageManager = (function () {
        var memoryCache = null;
        var activeStorageKey = null;
        var syncedStorageKey = null;
        var saveTimer = null;

        function getProfileId() {
            var account = null;

            try {
                if (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account) {
                    account = Lampa.Account.Permit.account;
                }
            } catch (e) {}

            try {
                if (!account && Lampa.Storage && Lampa.Storage.get) {
                    account = Lampa.Storage.get('account', {});
                }
            } catch (e2) {}

            if (
                account && account.profile &&
                account.profile.id !== undefined &&
                account.profile.id !== null &&
                account.profile.id !== ''
            ) {
                return account.profile.id;
            }

            return null;
        }

        function getStorageKey() {
            var profileId = getProfileId();
            return profileId !== null && profileId !== undefined
                ? CONFIG.storageBaseKey + '_' + profileId
                : CONFIG.storageBaseKey + '_guest';
        }

        function getActiveStorageKey() {
            var key = getStorageKey();
            if (activeStorageKey !== key) {
                activeStorageKey = key;
                memoryCache = null;
            }
            return key;
        }

        function ensureSync() {
            var key = getActiveStorageKey();
            var profileId = getProfileId();
            if (profileId === null || profileId === undefined) return;
            if (syncedStorageKey === key) return;

            try {
                Lampa.Storage.sync(key, 'object_object');
                syncedStorageKey = key;
            } catch (e) {
                Utils.error('Storage sync failed', e);
            }
        }

        function getParams() {
            ensureSync();

            if (!memoryCache) {
                try {
                    memoryCache = Lampa.Storage.get(getActiveStorageKey(), {});
                    if (!memoryCache || typeof memoryCache !== 'object') memoryCache = {};
                } catch (e) {
                    Utils.error('Storage get failed', e);
                    memoryCache = {};
                }
            }

            return memoryCache;
        }

        function setParams(data, force) {
            ensureSync();
            memoryCache = data;

            var key = getActiveStorageKey();

            function save() {
                try {
                    Lampa.Storage.set(key, data);
                } catch (e) {
                    Utils.error('Storage set failed', e);
                }
            }

            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }

            if (force) save();
            else {
                saveTimer = setTimeout(function () {
                    saveTimer = null;
                    save();
                }, CONFIG.debounceDelayMs);
            }
        }

        function getMovieKey(movie) {
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
        }


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
            var canonicalUrl = Utils.stripFragment(data.url || data.uri || data.src || '');
            if (canonicalUrl) out.url = canonicalUrl;

            if (Array.isArray(data.playlist) && data.playlist.length) {
                out.playlist_compact = compactPlaylist(data.playlist, data.torrent_link);
            }
            delete out.playlist;

            if (!out.url && out.playlist_compact && Array.isArray(out.playlist_compact.items)) {
                var compactIndex = Number(data.playlist_index || 0);
                if (compactIndex < 0) compactIndex = 0;
                if (compactIndex >= out.playlist_compact.items.length) compactIndex = out.playlist_compact.items.length - 1;
                var compactActive = out.playlist_compact.items[compactIndex];
                if (compactActive && compactActive.u) out.url = Utils.stripFragment(compactActive.u);
            }

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

        function migrateCompactStorage(forceWrite) {
            var params = getParams();
            var changed = false;

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

            if (params.__last_by_movie && typeof params.__last_by_movie === 'object') {
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

            if (changed || forceWrite) setParams(params, true);
            return changed;
        }

        function updateLastPointer(params, data, hash) {
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

        function saveStreamParams(hash, data, forceTimestamp) {
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

        function getTorrServerUrl() {
            try {
                var url1 = Lampa.Storage.get('torrserver_url');
                var url2 = Lampa.Storage.get('torrserver_url_two');
                var useTwo = Lampa.Storage.field('torrserver_use_link') === 'two';
                var url = useTwo ? (url2 || url1) : (url1 || url2);

                if (!url) return null;
                url = String(url).trim();
                if (!url.match(/^https?:\/\//)) url = 'http://' + url;
                return url.replace(/\/$/, '');
            } catch (e) {
                return null;
            }
        }

        function buildStreamUrl(params) {
            if (!params || !params.file_name || !params.torrent_link) return null;

            var server = getTorrServerUrl();
            if (!server) return null;

            var file = encodeURIComponent(params.file_name);
            var link = encodeURIComponent(params.torrent_link);
            var index = params.file_index !== undefined ? Number(params.file_index || 0) : 0;

            return server + '/stream/' + file + '?link=' + link + '&index=' + index + '&play';
        }

        function buildLaunchUrl(params) {
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
        }

        function rebuildStreamUrl(url) {
            var parsed = Utils.parseStreamUrl(url);
            if (!parsed) return Utils.stripFragment(url || '');
            return buildStreamUrl(parsed) || Utils.stripFragment(url || '');
        }

        function generateTimelineHash(movie, season, episode) {
            if (!movie) return '';

            var originalTitle = Utils.getMovieTitle(movie);
            season = Number(season || 0);
            episode = Number(episode || 0);

            if (!originalTitle) return '';

            if (season > 0 && episode > 0) {
                var separator = season > 10 ? ':' : '';
                return Lampa.Utils.hash([season, separator, episode, originalTitle].join(''));
            }

            return Lampa.Utils.hash(originalTitle);
        }

        function getLastStreamParams(movie) {
            if (!movie) return null;

            var params = getParams();
            var movieKey = getMovieKey(movie);

            var pointer = movieKey ? params[pointerStorageKey(movieKey)] : null;
            if (pointer && pointer.hash && params[pointer.hash]) return params[pointer.hash];

            if (
                movieKey && params.__last_by_movie && params.__last_by_movie[movieKey] &&
                params.__last_by_movie[movieKey].hash && params[params.__last_by_movie[movieKey].hash]
            ) {
                return params[params.__last_by_movie[movieKey].hash];
            }

            var originalTitle = Utils.getMovieTitle(movie);
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

            list.sort(function (a, b) {
                return Number(b.timestamp || 0) - Number(a.timestamp || 0);
            });

            return list[0] || null;
        }

        function cleanupOld() {
            var params = getParams();
            var current = Utils.now();
            var changed = false;

            Object.keys(params).forEach(function (key) {
                if (key === '__last_by_movie' || key.indexOf('__last__') === 0) return;
                var item = params[key];
                if (!item || typeof item !== 'object') return;

                if (item.timestamp && current - Number(item.timestamp) > CONFIG.cleanupAgeMs) {
                    delete params[key];
                    changed = true;
                }
            });

            if (params.__last_by_movie) {
                Object.keys(params.__last_by_movie).forEach(function (key) {
                    var pointer = params.__last_by_movie[key];
                    if (!pointer || !pointer.hash || !params[pointer.hash]) {
                        delete params.__last_by_movie[key];
                        changed = true;
                    }
                });
            }

            Object.keys(params).forEach(function (key) {
                if (key.indexOf('__last__') !== 0) return;
                var pointer = params[key];
                if (!pointer || !pointer.hash || !params[pointer.hash]) {
                    delete params[key];
                    changed = true;
                }
            });

            if (changed) setParams(params, true);
        }

        return {
            ensureSync: ensureSync,
            getParams: getParams,
            setParams: setParams,
            getProfileId: getProfileId,
            getStorageKey: getStorageKey,
            getMovieKey: getMovieKey,
            getMovieKeyFromData: getMovieKeyFromData,
            compactPlaylist: compactPlaylist,
            expandCompactPlaylist: expandCompactPlaylist,
            migrateCompactStorage: migrateCompactStorage,
            saveStreamParams: saveStreamParams,
            buildLaunchUrl: buildLaunchUrl,
            rebuildStreamUrl: rebuildStreamUrl,
            generateTimelineHash: generateTimelineHash,
            getLastStreamParams: getLastStreamParams,
            cleanupOld: cleanupOld
        };
    })();

    // ============================================================
    // SessionManager
    // ============================================================

    var SessionManager = (function () {
        var currentSession = null;
        var hashMetaByHash = {};

        function normalizePlaylist(playlist) {
            if (!Array.isArray(playlist)) return [];

            return playlist.filter(function (item) {
                return item && typeof item === 'object';
            }).map(function (item, index) {
                var normalized = Utils.shallowClone(item);
                var url = item.url || item.uri || item.src || '';
                var parsed = Utils.parseStreamUrl(url);
                var image = Utils.extractImage(item);

                normalized.url = Utils.stripFragment(url || '');
                normalized.uri = normalized.uri || normalized.url;
                normalized.src = normalized.src || normalized.url;
                normalized.title = Utils.firstNonEmpty(item.title, item.name, item.label);
                normalized.name = Utils.firstNonEmpty(item.name, item.title, item.label);
                normalized.filename = Utils.firstNonEmpty(item.filename, item.file_name, item.path, parsed ? parsed.file_name : '');
                normalized.file_name = Utils.firstNonEmpty(item.file_name, item.filename, item.path, parsed ? parsed.file_name : '');
                normalized.index = index;

                // Keep playlist_index separate from TorrServer file_index.
                normalized.playlist_index = index;
                if (item.file_index !== undefined && item.file_index !== null && item.file_index !== '') {
                    normalized.file_index = Number(item.file_index);
                } else if (parsed && parsed.file_index !== undefined) {
                    normalized.file_index = Number(parsed.file_index);
                }

                normalized.season = Number(Utils.firstNonEmpty(item.season, item.season_number, item.s, 0) || 0);
                normalized.episode = Number(Utils.firstNonEmpty(item.episode, item.episode_number, item.e, 0) || 0);

                if (image) Utils.copyImageFields(normalized, image);
                return normalized;
            });
        }

        function getMovieFromData(data) {
            data = data || {};
            return data.card || data.movie || data.card_data || data.data || Utils.getActivityMovie() || data;
        }

        function getItemAt(playlist, index) {
            if (!playlist || !playlist.length) return null;
            index = Number(index || 0);
            if (index < 0 || index >= playlist.length) return null;
            return playlist[index] || null;
        }

        function inferPlaylistIndex(data, playlist, url) {
            data = data || {};

            if (data.playlist_index !== undefined && data.playlist_index !== null && data.playlist_index !== '') {
                return Number(data.playlist_index);
            }
            if (data.start_index !== undefined && data.start_index !== null && data.start_index !== '') {
                return Number(data.start_index);
            }
            if (data.windowIndex !== undefined && data.windowIndex !== null && data.windowIndex !== '') {
                return Number(data.windowIndex);
            }

            var cleanUrl = Utils.stripFragment(url || '');
            var identity = Utils.streamIdentity(cleanUrl);

            if (playlist && playlist.length && cleanUrl) {
                for (var i = 0; i < playlist.length; i++) {
                    if (Utils.stripFragment(playlist[i].url || '') === cleanUrl) return i;
                    if (Utils.streamIdentity(playlist[i].url || '') === identity) return i;

                    if (playlist[i].quality && typeof playlist[i].quality === 'object') {
                        var qualities = playlist[i].quality;
                        var keys = Object.keys(qualities);
                        for (var q = 0; q < keys.length; q++) {
                            if (Utils.stripFragment(String(qualities[keys[q]] || '')) === cleanUrl) return i;
                        }
                    }
                }
            }

            return 0;
        }

        function playlistHasEpisodeMetadata(playlist) {
            if (!playlist || !playlist.length) return false;
            for (var i = 0; i < playlist.length; i++) {
                if (Number(playlist[i].season || 0) > 0 && Number(playlist[i].episode || 0) > 0) return true;
            }
            return false;
        }

        function resolveSE(data, movie, item, playlistIndex, playlist) {
            var explicit = Utils.extractExplicitSE(data);
            if (explicit) {
                explicit.source = 'play_data_explicit';
                return explicit;
            }

            explicit = Utils.extractExplicitSE(item);
            if (explicit) {
                explicit.source = 'playlist_metadata';
                return explicit;
            }

            var fallbackSeason = Number(
                (data && (data.season || data.season_number || data.s)) ||
                (item && (item.season || item.season_number || item.s)) ||
                0
            );

            var textResult = Utils.extractSEFromText(item || data || {}, fallbackSeason);
            if (textResult) return textResult;

            textResult = Utils.extractSEFromText(data || {}, fallbackSeason);
            if (textResult) return textResult;

            // Legacy fallback only when the playlist contains no explicit episode metadata at all.
            // This prevents playlist index 2 from becoming E03 when the real item is e.g. S02E06.
            if (
                Utils.getMediaKind(movie) === 'tv' &&
                Number(playlistIndex) >= 0 &&
                !playlistHasEpisodeMetadata(playlist)
            ) {
                return {
                    season: fallbackSeason || 1,
                    episode: Number(playlistIndex) + 1,
                    source: 'legacy_playlist_index_fallback'
                };
            }

            return { season: 0, episode: 0, source: '' };
        }

        function buildParams(session) {
            var parsed = Utils.parseStreamUrl(session.url);
            var movie = session.movie || {};
            var item = session.currentItem || {};
            var image = Utils.extractImage(item) || Utils.extractImage(session) || Utils.extractImage(movie);

            var data = {
                card_key: StorageManager.getMovieKey(movie) || '',
                profile_id: StorageManager.getProfileId() !== null ? StorageManager.getProfileId() : 'guest',
                isonline: !!session.isOnline,
                online_context: session.onlineContext || null,
                url: Utils.stripFragment(session.url || ''),
                uri: Utils.stripFragment(session.url || ''),
                src: Utils.stripFragment(session.url || ''),
                title: session.title || item.title || Utils.getMovieTitle(movie),
                episode_title: item.title || session.episode_title || '',
                movie_id: movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '',
                tmdb_id: movie.id || movie.tmdb_id || movie.tmdbId || '',
                original_title: movie.original_title || '',
                original_name: movie.original_name || movie.name || '',
                name: movie.name || movie.title || '',
                media_type: Utils.getMediaKind(movie),
                season: Number(session.season || 0),
                episode: Number(session.episode || 0),
                playlist_index: Number(session.playlistIndex || 0),
                file_index: parsed && parsed.file_index !== undefined
                    ? Number(parsed.file_index)
                    : (item.file_index !== undefined ? Number(item.file_index) : 0),
                file_name: parsed ? parsed.file_name : (item.file_name || item.filename || ''),
                torrent_link: parsed ? parsed.torrent_link : '',
                torrent_hash: String(session.torrentHash || item.torrent_hash || ''),
                playlist: session.playlist || [],
                transport: session.transport || 'lampa',
                timeline_hash: String(session.hash || '')
            };

            if (image) data.img = image;
            return data;
        }

        function rememberHash(hash, meta) {
            if (!hash) return;
            hashMetaByHash[String(hash)] = meta || {};
        }

        function register(session) {
            if (!session) return null;
            currentSession = session;

            if (session.hash) {
                rememberHash(session.hash, {
                    session: session,
                    index: Number(session.playlistIndex || 0),
                    item: session.currentItem || null,
                    season: Number(session.season || 0),
                    episode: Number(session.episode || 0),
                    source: 'current'
                });
            }

            if (session.playlist && session.playlist.length) {
                for (var i = 0; i < session.playlist.length; i++) {
                    var item = session.playlist[i];
                    var se = resolveSE(item, session.movie, item, i, session.playlist);
                    if (!se.season || !se.episode) continue;

                    var itemHash = item && item.timeline && item.timeline.hash && String(item.timeline.hash) !== '0'
                        ? String(item.timeline.hash)
                        : StorageManager.generateTimelineHash(session.movie, se.season, se.episode);
                    if (!itemHash) continue;

                    rememberHash(itemHash, {
                        session: session,
                        index: i,
                        item: item,
                        season: Number(se.season),
                        episode: Number(se.episode),
                        source: se.source || 'playlist'
                    });
                }
            }

            return session;
        }

        function buildFromPlayData(data, options) {
            options = options || {};
            data = data || {};

            var movie = options.movie || getMovieFromData(data);
            var url = Utils.stripFragment(options.url || data.url || data.uri || data.src || '');
            var playlist = normalizePlaylist(options.playlist || data.playlist || []);
            var playlistIndex = inferPlaylistIndex(data, playlist, url);

            if (playlist.length) {
                if (playlistIndex < 0) playlistIndex = 0;
                if (playlistIndex >= playlist.length) playlistIndex = playlist.length - 1;
            } else {
                playlistIndex = 0;
            }

            var item = getItemAt(playlist, playlistIndex);
            if (!url && item && item.url) url = item.url;

            var se = resolveSE(data, movie, item, playlistIndex, playlist);
            var timelineHash = data.timeline && data.timeline.hash
                ? String(data.timeline.hash)
                : StorageManager.generateTimelineHash(movie, se.season, se.episode);

            var session = {
                source: options.source || '',
                transport: options.transport || (Utils.isJustTransport() ? 'just' : 'lampa'),
                movie: movie,
                url: url,
                initialUrl: url,
                title: data.title || (item && item.title) || Utils.getMovieTitle(movie),
                episode_title: (item && item.title) || data.episode_title || '',
                playlist: playlist,
                playlistIndex: playlistIndex,
                startIndex: playlistIndex,
                currentItem: item,
                season: se.season || 0,
                episode: se.episode || 0,
                seSource: se.source || '',
                hash: timelineHash,
                createdAt: Utils.now(),
                updatedAt: Utils.now(),
                lampaTime: Number(data.time || data.position || (data.timeline && data.timeline.time) || 0),
                lampaDuration: Number(data.duration || (data.timeline && data.timeline.duration) || 0),
                lampaPercent: Number(data.percent || (data.timeline && data.timeline.percent) || 0),
                torrentHash: String(data.torrent_hash || (item && item.torrent_hash) || ''),
                isOnline: !!data.isonline,
                onlineContext: Utils.captureOnlineContext(data, movie),
                lastRoad: null,
                params: null
            };

            var image = Utils.extractImage(data) || Utils.extractImage(item) || Utils.extractImage(movie);
            if (image) Utils.copyImageFields(session, image);

            session.params = buildParams(session);
            return register(session);
        }

        function updateByPlaylistIndex(index, payload) {
            if (!currentSession) return null;

            index = Number(index);
            if (isNaN(index) || index < 0 || index >= currentSession.playlist.length) return currentSession;

            payload = payload || {};
            var item = getItemAt(currentSession.playlist, index);
            var explicit = Utils.extractExplicitSE(payload) || Utils.extractExplicitSE(payload.currentItem);
            var itemExplicit = Utils.extractExplicitSE(item);
            var se = explicit || itemExplicit || resolveSE(payload, currentSession.movie, item, index, currentSession.playlist);

            var url = Utils.stripFragment(
                payload.uri || payload.url ||
                (payload.currentItem && (payload.currentItem.uri || payload.currentItem.url)) ||
                (item && item.url) ||
                currentSession.url || ''
            );

            var hash = item && item.timeline && item.timeline.hash && String(item.timeline.hash) !== '0'
                ? String(item.timeline.hash)
                : StorageManager.generateTimelineHash(currentSession.movie, se.season, se.episode);
            var image = Utils.extractImage(item) || Utils.extractImage(payload) || Utils.extractImage(currentSession);

            currentSession.url = url;
            currentSession.playlistIndex = index;
            currentSession.currentItem = item;
            currentSession.title = payload.title || (item && item.title) || currentSession.title;
            currentSession.episode_title = (item && item.title) || currentSession.episode_title || '';
            currentSession.season = Number(se.season || currentSession.season || 0);
            currentSession.episode = Number(se.episode || currentSession.episode || 0);
            currentSession.torrentHash = String(
                payload.torrent_hash || (item && item.torrent_hash) || currentSession.torrentHash || ''
            );
            currentSession.seSource = se.source || currentSession.seSource || '';
            currentSession.hash = hash || currentSession.hash;
            currentSession.updatedAt = Utils.now();

            if (image) Utils.copyImageFields(currentSession, image);
            currentSession.params = buildParams(currentSession);

            return register(currentSession);
        }

        function updateByTimelineHash(hash, payload) {
            if (!hash) return currentSession;

            var meta = hashMetaByHash[String(hash)];
            if (!meta || !currentSession) return currentSession;

            var updatePayload = payload ? Utils.shallowClone(payload) : {};
            var item = meta.item || getItemAt(currentSession.playlist, meta.index);

            updatePayload.season = Number(meta.season || 0);
            updatePayload.episode = Number(meta.episode || 0);
            updatePayload.playlist_index = Number(meta.index || 0);

            if (item) {
                updatePayload.uri = updatePayload.uri || item.url || item.uri || item.src || '';
                updatePayload.title = updatePayload.title || item.title || item.name || '';
                updatePayload.currentItem = updatePayload.currentItem || item;
            }

            currentSession = updateByPlaylistIndex(Number(meta.index || 0), updatePayload) || currentSession;
            currentSession.hash = String(hash);
            currentSession.season = Number(meta.season || currentSession.season || 0);
            currentSession.episode = Number(meta.episode || currentSession.episode || 0);
            currentSession.params = buildParams(currentSession);
            register(currentSession);

            return currentSession;
        }

        function hasHash(hash) {
            return !!(hash && hashMetaByHash[String(hash)]);
        }

        function getMetaByHash(hash) {
            return hash ? hashMetaByHash[String(hash)] || null : null;
        }

        function getCurrent() {
            return currentSession;
        }

        function updateRoad(road) {
            if (!currentSession) return;
            currentSession.lastRoad = road;
            currentSession.updatedAt = Utils.now();
        }

        return {
            normalizePlaylist: normalizePlaylist,
            buildFromPlayData: buildFromPlayData,
            buildParams: buildParams,
            updateByPlaylistIndex: updateByPlaylistIndex,
            updateByTimelineHash: updateByTimelineHash,
            hasHash: hasHash,
            getMetaByHash: getMetaByHash,
            getCurrent: getCurrent,
            updateRoad: updateRoad,
            register: register
        };
    })();

    // ============================================================
    // Core
    // ============================================================

    var Core = (function () {
        var lastSaveByHash = {};

        function calculatePercent(time, duration, percent) {
            time = Number(time || 0);
            duration = Number(duration || 0);
            percent = Number(percent || 0);

            if (!percent && duration > 0) percent = Math.round(time / duration * 100);
            return Utils.clamp(percent, 0, 100);
        }

        function shouldSave(hash, force) {
            if (!hash) return false;
            var current = Utils.now();
            var last = Number(lastSaveByHash[hash] || 0);

            if (force || current - last >= 1000) {
                lastSaveByHash[hash] = current;
                return true;
            }

            return false;
        }

        function consume(event) {
            if (!event || !event.type) return;

            var session = event.session || SessionManager.getCurrent();
            if (!session) return;

            if (event.hash && String(event.hash) !== String(session.hash || '') && SessionManager.hasHash(event.hash)) {
                session = SessionManager.updateByTimelineHash(event.hash, event) || session;
            }

            if (event.playlist_index !== undefined && event.playlist_index !== null) {
                session = SessionManager.updateByPlaylistIndex(event.playlist_index, event) || session;
            }

            var hash = event.hash || session.hash;
            if (!hash) return;

            var time = Number(event.time || 0);
            var duration = Number(event.duration || 0);
            var percent = calculatePercent(time, duration, event.percent);

            if (event.type === 'ended') {
                percent = 100;
                if (!time && duration) time = duration;
            }

            var params = SessionManager.buildParams(session);
            params.time = time;
            params.duration = duration;
            params.percent = percent;
            params.timeline_hash = String(hash || params.timeline_hash || '');
            params.last_source = event.source || session.transport || 'lampa';
            params.last_event_type = event.type;
            params.last_reason = event.reason || '';

            session.lampaTime = time;
            session.lampaDuration = duration;
            session.lampaPercent = percent;
            session.params = params;

            if (event.type === 'start') {
                StorageManager.saveStreamParams(hash, params, true);
                return;
            }

            if (!shouldSave(hash, !!event.force)) return;

            if (
                duration >= CONFIG.minDurationSeconds ||
                event.force ||
                event.type === 'ended' ||
                event.type === 'stop'
            ) {
                if (
                    time >= CONFIG.minSaveSeconds ||
                    percent >= CONFIG.finishPercent ||
                    event.force ||
                    event.type === 'ended'
                ) {
                    StorageManager.saveStreamParams(hash, params, true);
                }

                SessionManager.updateRoad({
                    hash: hash,
                    time: time,
                    duration: duration,
                    percent: percent,
                    source: params.last_source,
                    type: event.type
                });
            }
        }

        return {
            consume: consume
        };
    })();

    // ============================================================
    // JustPlusTransport
    // ============================================================

    var JustPlusTransport = (function () {
        var installed = false;
        var lastTimelineHash = '';
        var lastResolvedHash = '';
        var lastResolvedAt = 0;
        var reconcileTimer = null;
        var periodicTimer = null;

        function matches() {
            return Utils.isJustTransport();
        }

        function readPending() {
            try {
                var raw = localStorage.getItem(CONFIG.justPendingKey);
                if (!raw) return null;
                var data = JSON.parse(raw);
                return data && typeof data === 'object' ? data : null;
            } catch (e) {
                return null;
            }
        }

        function writePending(pending) {
            try {
                if (pending) localStorage.setItem(CONFIG.justPendingKey, JSON.stringify(pending));
                else localStorage.removeItem(CONFIG.justPendingKey);
            } catch (e) {}
        }

        function timelineRoad(hash) {
            if (!hash || !Lampa.Timeline || !Lampa.Timeline.view) return null;
            try {
                return Lampa.Timeline.view(hash);
            } catch (e) {
                return null;
            }
        }

        function itemHash(session, item, index) {
            if (item && item.timeline && item.timeline.hash && String(item.timeline.hash) !== '0') {
                return String(item.timeline.hash);
            }

            var season = Number(item && item.season || 0);
            var episode = Number(item && item.episode || 0);

            if ((!season || !episode) && session && Number(session.playlistIndex) === Number(index)) {
                season = Number(session.season || season || 0);
                episode = Number(session.episode || episode || 0);
            }

            return StorageManager.generateTimelineHash(session && session.movie, season, episode);
        }

        function minimalMovie(movie) {
            movie = movie || {};
            return {
                id: movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '',
                original_title: movie.original_title || '',
                original_name: movie.original_name || movie.name || '',
                name: movie.name || movie.title || '',
                title: movie.title || movie.name || '',
                media_type: Utils.getMediaKind(movie)
            };
        }

        function arm(session) {
            if (!matches() || !session) return false;

            var items = [];
            var playlist = session.playlist && session.playlist.length
                ? session.playlist
                : [session.currentItem || {}];

            for (var i = 0; i < playlist.length; i++) {
                var item = playlist[i] || {};
                var hash = itemHash(session, item, i);
                if (!hash || String(hash) === '0') continue;

                var road = timelineRoad(hash) || {};
                var parsed = Utils.parseStreamUrl(item.url || item.uri || item.src || '');
                var image = Utils.extractImage(item);

                items.push({
                    hash: String(hash),
                    index: i,
                    season: Number(item.season || (i === Number(session.playlistIndex) ? session.season : 0) || 0),
                    episode: Number(item.episode || (i === Number(session.playlistIndex) ? session.episode : 0) || 0),
                    url: Utils.stripFragment(item.url || item.uri || item.src || ''),
                    title: item.title || item.name || '',
                    image: image || '',
                    file_index: item.file_index !== undefined
                        ? Number(item.file_index)
                        : (parsed && parsed.file_index !== undefined ? Number(parsed.file_index) : 0),
                    before_updated: Number(road.updated || 0)
                });
            }

            if (!items.length && session.hash) {
                var currentRoad = timelineRoad(session.hash) || {};
                items.push({
                    hash: String(session.hash),
                    index: Number(session.playlistIndex || 0),
                    season: Number(session.season || 0),
                    episode: Number(session.episode || 0),
                    url: Utils.stripFragment(session.url || ''),
                    title: session.episode_title || session.title || '',
                    image: Utils.extractImage(session) || '',
                    file_index: Number(session.params && session.params.file_index || 0),
                    before_updated: Number(currentRoad.updated || 0)
                });
            }

            writePending({
                version: BOOT_VERSION,
                launch_at: Utils.now(),
                source_hash: String(session.hash || ''),
                movie_key: StorageManager.getMovieKey(session.movie) || '',
                movie: minimalMovie(session.movie),
                start_index: Number(session.playlistIndex || 0),
                items: items,
                events: [],
                return_started_at: 0,
                return_window_until: 0,
                last_event_hash: '',
                last_event_seen_at: 0,
                resolved_hash: '',
                resolved_event_seen_at: 0,
                resolved_at: 0
            });

            return true;
        }

        function pendingItemByHash(pending, hash) {
            if (!pending || !pending.items || !hash) return null;
            for (var i = 0; i < pending.items.length; i++) {
                if (String(pending.items[i].hash) === String(hash)) return pending.items[i];
            }
            return null;
        }

        function pendingItemByIndex(pending, index) {
            if (!pending || !pending.items) return null;
            index = Number(index);
            for (var i = 0; i < pending.items.length; i++) {
                if (Number(pending.items[i].index) === index) return pending.items[i];
            }
            return null;
        }

        function pageLooksActive() {
            try {
                if (document.visibilityState === 'hidden') return false;
            } catch (e) {}
            try {
                if (document.hasFocus && !document.hasFocus()) return false;
            } catch (e2) {}
            return true;
        }

        function appendReturnEvent(pending, data, knownItem) {
            if (!pending || !data || !data.hash || !data.road) return pending;

            var now = Utils.now();
            var road = data.road || {};
            var hash = String(data.hash);
            var event = {
                hash: hash,
                seen_at: now,
                updated: Number(road.updated || now),
                time: Number(road.time || 0),
                duration: Number(road.duration || 0),
                percent: Number(road.percent || 0),
                known_index: knownItem ? Number(knownItem.index) : -1
            };

            if (!Array.isArray(pending.events)) pending.events = [];

            var replaced = false;
            for (var i = pending.events.length - 1; i >= 0; i--) {
                var old = pending.events[i];
                if (
                    String(old.hash) === hash &&
                    Number(old.updated || 0) === Number(event.updated || 0) &&
                    Number(old.time || 0) === Number(event.time || 0) &&
                    Number(old.duration || 0) === Number(event.duration || 0)
                ) {
                    pending.events[i] = event;
                    replaced = true;
                    break;
                }
            }

            if (!replaced) pending.events.push(event);
            if (pending.events.length > 40) pending.events = pending.events.slice(-40);

            if (!pending.return_started_at) pending.return_started_at = now;
            pending.return_window_until = now + CONFIG.justReturnBurstMs;
            pending.last_event_hash = hash;
            pending.last_event_seen_at = now;
            return pending;
        }

        function buildSyntheticEvents(pending) {
            var events = [];
            if (!pending || !pending.items) return events;

            for (var i = 0; i < pending.items.length; i++) {
                var item = pending.items[i];
                var road = timelineRoad(item.hash);
                if (!road) continue;

                var updated = Number(road.updated || 0);
                if (!updated || updated <= Number(item.before_updated || 0)) continue;
                if (pending.launch_at && updated + 2000 < Number(pending.launch_at)) continue;

                events.push({
                    hash: String(item.hash),
                    seen_at: updated,
                    updated: updated,
                    time: Number(road.time || 0),
                    duration: Number(road.duration || 0),
                    percent: Number(road.percent || 0),
                    known_index: Number(item.index)
                });
            }

            return events;
        }

        function getFreshEvents(pending) {
            var all = [];
            var resolvedSeen = Number(pending && pending.resolved_event_seen_at || 0);

            if (pending && Array.isArray(pending.events)) {
                pending.events.forEach(function (event) {
                    if (Number(event.seen_at || 0) > resolvedSeen) all.push(event);
                });
            }

            buildSyntheticEvents(pending).forEach(function (event) {
                var duplicate = false;
                for (var i = 0; i < all.length; i++) {
                    if (
                        String(all[i].hash) === String(event.hash) &&
                        Number(all[i].updated || 0) === Number(event.updated || 0)
                    ) {
                        duplicate = true;
                        break;
                    }
                }
                if (!duplicate && Number(event.seen_at || 0) > resolvedSeen) all.push(event);
            });

            all.sort(function (a, b) {
                return Number(a.seen_at || 0) - Number(b.seen_at || 0);
            });

            return all;
        }

        function inferItemForEvent(pending, event, events) {
            var direct = pendingItemByHash(pending, event.hash);
            if (direct) return direct;

            if (Number(event.known_index) >= 0) {
                direct = pendingItemByIndex(pending, event.known_index);
                if (direct) return direct;
            }

            var startIndex = Number(pending.start_index || 0);
            var firstCompletionIndex = null;
            var lastCompletionIndex = null;

            for (var i = 0; i < events.length; i++) {
                var e = events[i];
                if (Number(e.seen_at || 0) > Number(event.seen_at || 0)) break;
                if (Number(e.percent || 0) < 100 || Number(e.known_index) < 0) continue;

                if (firstCompletionIndex === null) firstCompletionIndex = Number(e.known_index);
                lastCompletionIndex = Number(e.known_index);
            }

            var inferredIndex = startIndex;

            if (firstCompletionIndex !== null) {
                if (firstCompletionIndex < startIndex) {
                    inferredIndex = firstCompletionIndex - 1;
                } else if (lastCompletionIndex !== null) {
                    inferredIndex = lastCompletionIndex + 1;
                }
            }

            if (inferredIndex < 0) inferredIndex = 0;
            if (pending.items && inferredIndex >= pending.items.length) inferredIndex = pending.items.length - 1;

            return pendingItemByIndex(pending, inferredIndex);
        }

        function chooseCandidate(pending) {
            var events = getFreshEvents(pending);
            if (!events.length) return null;

            var playable = events.filter(function (event) {
                return Number(event.time || 0) > 0 &&
                    Number(event.duration || 0) > 0 &&
                    Number(event.percent || 0) < 100;
            });

            var pool = playable.length ? playable : events.filter(function (event) {
                return Number(event.time || 0) > 0 && Number(event.duration || 0) > 0;
            });

            if (!pool.length) {
                // A 100% update for the launched episode is usually Lampa marking the
                // previous item complete while Just+ has already moved to another item.
                // Never let that alone overwrite Continue Watching immediately.
                return {
                    completionOnly: true,
                    events: events,
                    lastEvent: events[events.length - 1]
                };
            }

            pool.sort(function (a, b) {
                if (Number(b.seen_at || 0) !== Number(a.seen_at || 0)) {
                    return Number(b.seen_at || 0) - Number(a.seen_at || 0);
                }
                if (Number(b.updated || 0) !== Number(a.updated || 0)) {
                    return Number(b.updated || 0) - Number(a.updated || 0);
                }
                return 0;
            });

            var event = pool[0];
            var item = inferItemForEvent(pending, event, events);
            if (!item) return null;

            return {
                completionOnly: false,
                item: item,
                event: event,
                road: {
                    time: Number(event.time || 0),
                    duration: Number(event.duration || 0),
                    percent: Number(event.percent || 0),
                    updated: Number(event.updated || event.seen_at || 0)
                },
                events: events
            };
        }

        function findBaseStored(pending) {
            var params = StorageManager.getParams();
            if (!params || typeof params !== 'object') return null;

            if (pending.source_hash && params[pending.source_hash]) {
                var sourceRecord = params[pending.source_hash];
                var sourceKey = StorageManager.getMovieKeyFromData(sourceRecord);
                if (sourceKey && sourceKey === pending.movie_key) return sourceRecord;
            }

            var best = null;
            Object.keys(params).forEach(function (key) {
                if (key === '__last_by_movie') return;
                var item = params[key];
                if (!item || typeof item !== 'object') return;
                if (StorageManager.getMovieKeyFromData(item) !== pending.movie_key) return;
                if (!best || Number(item.timestamp || 0) > Number(best.timestamp || 0)) best = item;
            });
            return best;
        }

        function saveResolvedWithoutSession(pending, candidate) {
            var base = findBaseStored(pending) || {};
            var params = Utils.shallowClone(base);
            var item = candidate.item;
            var road = candidate.road || {};
            var movie = pending.movie || {};
            var hash = String(candidate.event && candidate.event.hash || item.hash || '');

            params.card_key = pending.movie_key || params.card_key || '';
            params.profile_id = StorageManager.getProfileId() !== null ? StorageManager.getProfileId() : 'guest';
            params.url = item.url || params.url || '';
            params.uri = params.url;
            params.src = params.url;
            params.title = item.title || params.title || movie.name || movie.title || '';
            params.episode_title = item.title || params.episode_title || '';
            params.movie_id = params.movie_id || movie.id || '';
            params.tmdb_id = params.tmdb_id || movie.id || '';
            params.original_title = params.original_title || movie.original_title || '';
            params.original_name = params.original_name || movie.original_name || movie.name || '';
            params.name = params.name || movie.name || movie.title || '';
            params.media_type = params.media_type || movie.media_type || 'tv';
            params.season = Number(item.season || 0);
            params.episode = Number(item.episode || 0);
            params.playlist_index = Number(item.index || 0);
            params.file_index = Number(item.file_index || 0);
            params.timeline_hash = hash;
            params.time = Number(road.time || 0);
            params.duration = Number(road.duration || 0);
            params.percent = Number(road.percent || 0);
            params.last_source = 'just';
            params.last_event_type = 'time';
            params.last_reason = 'native_return_burst';
            params.transport = 'just';

            if (item.image) Utils.copyImageFields(params, item.image);

            return StorageManager.saveStreamParams(hash, params, true);
        }

        function markResolved(pending, candidate) {
            var event = candidate && candidate.event;
            pending.resolved_hash = String(event && event.hash || '');
            pending.resolved_event_seen_at = Number(event && event.seen_at || pending.last_event_seen_at || Utils.now());
            pending.resolved_at = Utils.now();
            writePending(pending);

            lastResolvedHash = pending.resolved_hash;
            lastResolvedAt = pending.resolved_at;
        }

        function reconcile(reason) {
            if (!matches()) return false;

            var pending = readPending();
            if (!pending) return false;

            if (pending.launch_at && Utils.now() - Number(pending.launch_at) > 6 * 60 * 60 * 1000) {
                writePending(null);
                return false;
            }

            var candidate = chooseCandidate(pending);
            if (!candidate) return false;

            if (candidate.completionOnly) {
                var burstAge = Utils.now() - Number(pending.last_event_seen_at || pending.return_started_at || 0);
                if (burstAge < CONFIG.justCompletionFallbackMs) return false;

                // Do not overwrite Continue Watching with "100%, 0:00". This was the bug
                // that reset the launched episode after an internal Just+ switch.
                pending.resolved_event_seen_at = Number(
                    candidate.lastEvent && candidate.lastEvent.seen_at ||
                    pending.last_event_seen_at ||
                    Utils.now()
                );
                pending.resolved_at = Utils.now();
                writePending(pending);
                return false;
            }

            var hash = String(candidate.event.hash || candidate.item.hash || '');
            var road = candidate.road || {};
            var session = SessionManager.getCurrent();

            if (session) {
                var payload = {
                    season: Number(candidate.item.season || 0),
                    episode: Number(candidate.item.episode || 0),
                    playlist_index: Number(candidate.item.index || 0),
                    currentItem: candidate.item,
                    uri: candidate.item.url || '',
                    title: candidate.item.title || '',
                    time: Number(road.time || 0),
                    duration: Number(road.duration || 0),
                    percent: Number(road.percent || 0),
                    reason: reason || 'native_return_burst'
                };

                session = SessionManager.updateByPlaylistIndex(Number(candidate.item.index || 0), payload) || session;

                Core.consume({
                    source: 'just',
                    type: 'time',
                    session: session,
                    hash: hash,
                    playlist_index: Number(candidate.item.index || 0),
                    season: Number(candidate.item.season || 0),
                    episode: Number(candidate.item.episode || 0),
                    currentItem: candidate.item,
                    url: candidate.item.url || '',
                    time: Number(road.time || 0),
                    duration: Number(road.duration || 0),
                    percent: Number(road.percent || 0),
                    force: true,
                    reason: reason || 'native_return_burst'
                });
            } else {
                saveResolvedWithoutSession(pending, candidate);
            }

            lastTimelineHash = hash;
            markResolved(pending, candidate);
            return true;
        }

        function scheduleReconcile(reason) {
            if (reconcileTimer) clearTimeout(reconcileTimer);
            reconcileTimer = setTimeout(function () {
                reconcileTimer = null;
                reconcile(reason || 'timeline_burst_settled');
            }, CONFIG.justResultSettleMs);
        }

        function handleTimeline(data) {
            if (!matches() || !data || !data.hash || !data.road) return false;

            var hash = String(data.hash);
            var pending = readPending();
            var session = SessionManager.getCurrent();
            var knownItem = pendingItemByHash(pending, hash);
            var now = Utils.now();

            if (pending) {
                var inReturnWindow = Number(pending.return_window_until || 0) >= now;
                var playableUnknown = !knownItem &&
                    pageLooksActive() &&
                    Number(data.road.time || 0) > 0 &&
                    Number(data.road.duration || 0) > 0 &&
                    Number(data.road.percent || 0) < 100;

                if (knownItem || inReturnWindow || playableUnknown) {
                    pending = appendReturnEvent(pending, data, knownItem);

                    // Once one playlist hash confirms that Lampa is processing the external
                    // result, accept the following hashes for a few seconds too. This covers
                    // a mismatched/missing hash map for the final current item.
                    if (knownItem && !pending.return_started_at) {
                        pending.return_started_at = now;
                    }

                    writePending(pending);
                    lastTimelineHash = hash;
                    scheduleReconcile('lampa_result_burst');
                    return true;
                }
            }

            if (session && SessionManager.hasHash(hash)) {
                session = SessionManager.updateByTimelineHash(hash, {
                    time: Number(data.road.time || 0),
                    duration: Number(data.road.duration || 0),
                    percent: Number(data.road.percent || 0),
                    reason: 'just_timeline_fallback'
                }) || session;

                Core.consume({
                    source: 'just',
                    type: Number(data.road.percent || 0) >= 100 ? 'ended' : 'time',
                    session: session,
                    hash: hash,
                    time: Number(data.road.time || 0),
                    duration: Number(data.road.duration || 0),
                    percent: Number(data.road.percent || 0),
                    force: true,
                    reason: 'just_timeline_fallback'
                });

                return true;
            }

            return false;
        }

        function init() {
            if (installed) return;
            installed = true;

            setTimeout(function () { reconcile('init_reconcile'); }, 1200);

            periodicTimer = setInterval(function () {
                reconcile('periodic_reconcile');
            }, CONFIG.justReconcileIntervalMs);

            try {
                window.addEventListener('focus', function () {
                    var pending = readPending();
                    if (!pending) return;
                    pending.return_window_until = Utils.now() + CONFIG.justReturnBurstMs;
                    writePending(pending);
                    scheduleReconcile('window_focus');
                });
            } catch (e) {}

            try {
                document.addEventListener('visibilitychange', function () {
                    if (document.visibilityState === 'hidden') return;
                    var pending = readPending();
                    if (!pending) return;
                    pending.return_window_until = Utils.now() + CONFIG.justReturnBurstMs;
                    writePending(pending);
                    scheduleReconcile('visibility_return');
                });
            } catch (e2) {}
        }

        function getStatus() {
            return {
                installed: installed,
                matches: matches(),
                lastTimelineHash: lastTimelineHash,
                lastResolvedHash: lastResolvedHash,
                lastResolvedAt: lastResolvedAt,
                pending: readPending()
            };
        }

        return {
            init: init,
            matches: matches,
            arm: arm,
            reconcile: reconcile,
            handleTimeline: handleTimeline,
            getStatus: getStatus
        };
    })();

    // ============================================================
    // LampaNativeTransport
    // ============================================================

    var LampaNativeTransport = (function () {
        var installed = false;
        var lastTimelineHash = '';

        function getDataFromEvent(event) {
            if (!event) return null;
            return event.data || event;
        }

        function handlePlayerCreate(event) {
            if (!CONFIG.nativePlayerEventsEnabled) return;

            var data = getDataFromEvent(event);
            if (!data || !(data.url || data.uri || data.src)) return;

            var session = SessionManager.getCurrent();
            var url = data.url || data.uri || data.src || '';

            if (!session || Utils.streamIdentity(session.url || '') !== Utils.streamIdentity(url)) {
                var options = {
                    source: 'player_event',
                    transport: JustPlusTransport.matches() ? 'just' : 'lampa'
                };

                if (session) {
                    if ((!data.playlist || !data.playlist.length) && session.playlist && session.playlist.length) {
                        options.playlist = session.playlist;
                    }
                    if (!data.card && !data.movie && session.movie) options.movie = session.movie;
                }

                session = SessionManager.buildFromPlayData(data, options);
            }

            if (!session) return;

            Core.consume({
                source: session.transport,
                type: 'start',
                session: session,
                hash: session.hash,
                url: session.url,
                force: true
            });
        }

        function handlePlayerDestroy() {
            if (!CONFIG.nativePlayerEventsEnabled) return;

            var session = SessionManager.getCurrent();
            if (!session || !session.lastRoad) return;

            Core.consume({
                source: session.transport,
                type: 'stop',
                session: session,
                hash: session.lastRoad.hash || session.hash,
                time: Number(session.lastRoad.time || 0),
                duration: Number(session.lastRoad.duration || 0),
                percent: Number(session.lastRoad.percent || 0),
                force: true,
                reason: 'destroy'
            });
        }

        function handleTimelineUpdate(event) {
            if (!CONFIG.nativeTimelineEnabled) return;

            var data = event && event.data ? event.data : event;
            if (!data || !data.hash || !data.road) return;

            // Just+ gets first refusal on Android. If it handled the result timeline,
            // ordinary native handling must not save the same update again.
            if (JustPlusTransport.handleTimeline(data)) return;

            var hash = String(data.hash);
            var road = data.road || {};
            var session = SessionManager.getCurrent();

            if (session && SessionManager.hasHash(hash)) {
                session = SessionManager.updateByTimelineHash(hash, {
                    time: Number(road.time || 0),
                    duration: Number(road.duration || 0),
                    percent: Number(road.percent || 0),
                    reason: 'native_timeline_hash'
                }) || session;
            }

            if (!session) {
                var stored = StorageManager.getParams();
                if (!stored || !stored[hash]) return;

                var patch = Utils.shallowClone(stored[hash]);
                patch.time = Number(road.time || 0);
                patch.duration = Number(road.duration || 0);
                patch.percent = Number(road.percent || 0);
                patch.last_source = 'lampa';
                patch.last_event_type = 'timeline_update';
                StorageManager.saveStreamParams(hash, patch, true);
                lastTimelineHash = hash;
                return;
            }

            if (String(hash) !== String(session.hash || '') && !SessionManager.hasHash(hash)) return;

            lastTimelineHash = hash;

            if (CONFIG.saveNativeTimelineToCustomStorage) {
                Core.consume({
                    source: 'lampa',
                    type: Number(road.percent || 0) >= 100 ? 'ended' : 'time',
                    session: session,
                    hash: hash,
                    time: Number(road.time || 0),
                    duration: Number(road.duration || 0),
                    percent: Number(road.percent || 0),
                    force: false,
                    reason: 'timeline_update'
                });
            }
        }

        var playerListenersInstalled = false;
        var timelineListenerInstalled = false;
        var hookRetryTimer = null;
        var hookRetryStartedAt = 0;

        function installPlayerListeners() {
            if (playerListenersInstalled) return true;
            if (!Lampa.Player || !Lampa.Player.listener || !Lampa.Player.listener.follow) return false;

            try {
                Lampa.Player.listener.follow('create', handlePlayerCreate);
                Lampa.Player.listener.follow('start', handlePlayerCreate);
                Lampa.Player.listener.follow('ready', handlePlayerCreate);
                Lampa.Player.listener.follow('destroy', handlePlayerDestroy);
                playerListenersInstalled = true;
                return true;
            } catch (e) {
                Utils.error('Player listener failed', e);
                return false;
            }
        }

        function installTimelineListener() {
            if (timelineListenerInstalled) return true;
            if (!Lampa.Timeline || !Lampa.Timeline.listener || !Lampa.Timeline.listener.follow) return false;

            try {
                Lampa.Timeline.listener.follow('update', handleTimelineUpdate);
                timelineListenerInstalled = true;
                return true;
            } catch (e) {
                Utils.error('Timeline listener failed', e);
                return false;
            }
        }

        function ensureHooks() {
            installPlayerListeners();
            installTimelineListener();

            if (playerListenersInstalled && timelineListenerInstalled && hookRetryTimer) {
                clearInterval(hookRetryTimer);
                hookRetryTimer = null;
            }

            return playerListenersInstalled && timelineListenerInstalled;
        }

        function init() {
            if (installed) return;
            installed = true;
            hookRetryStartedAt = Utils.now();
            ensureHooks();

            if (!playerListenersInstalled || !timelineListenerInstalled) {
                hookRetryTimer = setInterval(function () {
                    ensureHooks();
                    if (Utils.now() - hookRetryStartedAt > CONFIG.hookRetryMaxMs && hookRetryTimer) {
                        clearInterval(hookRetryTimer);
                        hookRetryTimer = null;
                    }
                }, CONFIG.hookRetryMs);
            }
        }

        function getStatus() {
            return {
                installed: installed,
                playerListenersInstalled: playerListenersInstalled,
                timelineListenerInstalled: timelineListenerInstalled,
                lastTimelineHash: lastTimelineHash
            };
        }

        return {
            init: init,
            getStatus: getStatus
        };
    })();

    // ============================================================
    // PlayerManager
    // ============================================================

    var PlayerManager = (function () {
        var patched = false;
        var patchRetryTimer = null;
        var patchRetryStartedAt = 0;

        function schedulePatchRetry() {
            if (patchRetryTimer || patched) return;
            patchRetryStartedAt = patchRetryStartedAt || Utils.now();

            patchRetryTimer = setInterval(function () {
                if (patched) {
                    clearInterval(patchRetryTimer);
                    patchRetryTimer = null;
                    return;
                }

                if (Utils.now() - patchRetryStartedAt > CONFIG.hookRetryMaxMs) {
                    clearInterval(patchRetryTimer);
                    patchRetryTimer = null;
                    return;
                }

                patchPlayer();
            }, CONFIG.hookRetryMs);
        }

        function patchPlayer() {
            if (patched) return true;
            if (!Lampa.Player || !Lampa.Player.play) {
                schedulePatchRetry();
                return false;
            }

            if (Lampa.Player.__continueWatchNativeJustPatchVersion === BOOT_VERSION) {
                patched = true;
                if (patchRetryTimer) {
                    clearInterval(patchRetryTimer);
                    patchRetryTimer = null;
                }
                return true;
            }

            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (data) {
                try {
                    data = data || {};

                    var transport = JustPlusTransport.matches() ? 'just' : 'lampa';
                    var session = SessionManager.buildFromPlayData(data, {
                        source: 'player_patch',
                        transport: transport
                    });

                    if (session) {
                        Core.consume({
                            source: transport,
                            type: 'start',
                            session: session,
                            hash: session.hash,
                            url: session.url,
                            force: true
                        });

                        // Persist a minimal native-hash map before Android leaves Lampa.
                        // It survives WebView/app recreation while Just+ is in front.
                        if (transport === 'just') JustPlusTransport.arm(session);
                    }
                } catch (e) {
                    Utils.error('Player patch failed', e);
                }

                // No transport mutates the URL or suppresses Lampa.Player.play.
                // Lampa remains fully responsible for launching Just+ and receiving its result.
                return originalPlay.apply(this, arguments);
            };

            Lampa.Player.__continueWatchNativeJustPatched = true;
            Lampa.Player.__continueWatchNativeJustPatchVersion = BOOT_VERSION;
            patched = true;

            if (patchRetryTimer) {
                clearInterval(patchRetryTimer);
                patchRetryTimer = null;
            }
            return true;
        }

        function makeLaunchLockKey(movie, params) {
            var movieKey = '';
            try { movieKey = StorageManager.getMovieKey(movie) || ''; } catch (e) {}

            return [
                movieKey,
                params && params.torrent_link || '',
                params && params.url || '',
                params && params.file_index !== undefined ? params.file_index : '',
                params && params.playlist_index !== undefined ? params.playlist_index : '',
                params && params.season || 0,
                params && params.episode || 0
            ].join('|');
        }

        function acquireLaunchLock(movie, params) {
            var current = Utils.now();
            var key = makeLaunchLockKey(movie, params);
            var lock = window.__CONTINUE_WATCH_UNIVERSAL_LAUNCH_LOCK__;

            if (!lock || typeof lock !== 'object') {
                lock = { key: '', ts: 0 };
                window.__CONTINUE_WATCH_UNIVERSAL_LAUNCH_LOCK__ = lock;
            }

            if (lock.key === key && current - Number(lock.ts || 0) < CONFIG.launchLockMs) return false;

            lock.key = key;
            lock.ts = current;
            return true;
        }

        function rebuildPlaylistForLaunch(params) {
            var sourcePlaylist = Array.isArray(params.playlist) && params.playlist.length
                ? params.playlist
                : StorageManager.expandCompactPlaylist(params);
            if (!Array.isArray(sourcePlaylist) || !sourcePlaylist.length) return null;

            return sourcePlaylist.map(function (item, index) {
                var clone = Utils.shallowClone(item || {});
                var url = clone.url || clone.uri || clone.src || '';

                if (url) {
                    clone.url = Utils.parseStreamUrl(url)
                        ? StorageManager.rebuildStreamUrl(url)
                        : Utils.stripFragment(url);
                    clone.uri = clone.url;
                    clone.src = clone.url;
                }

                clone.playlist_index = index;
                clone.torrent_hash = clone.torrent_hash || params.torrent_hash || '';

                var parsed = Utils.parseStreamUrl(clone.url || '');
                if (parsed && parsed.file_index !== undefined) clone.file_index = Number(parsed.file_index);

                var image = Utils.extractImage(item) || Utils.extractImage(clone);
                if (image) Utils.copyImageFields(clone, image);

                return clone;
            });
        }

        function launchFromContinue(movie, params) {
            if (!movie || !params) return;
            if (!acquireLaunchLock(movie, params)) return;


            var playlist = rebuildPlaylistForLaunch(params);
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
            var episode = Number(params.episode || 0);
            var hash = String(params.timeline_hash || '') || StorageManager.generateTimelineHash(movie, season, episode);
            var timeline = null;

            try {
                timeline = hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null;
            } catch (e2) {}

            var resumeTime = Math.max(Number(params.time || params.position || 0), Number(timeline && timeline.time || 0));
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

            var activeImage = Utils.extractImage(activeItem) || Utils.extractImage(params) || Utils.extractImage(movie);
            var parsedLaunch = Utils.parseStreamUrl(url);
            var torrentHash = String(
                params.torrent_hash ||
                Utils.extractTorrentHash(params.torrent_link) ||
                Utils.extractTorrentHash(parsedLaunch && parsedLaunch.torrent_link) ||
                ''
            );
            var compactTorrentLink = params.playlist_compact && params.playlist_compact.link
                ? String(params.playlist_compact.link)
                : '';
            var isTorrentResume = !!(
                params.torrent_hash || params.torrent_link || compactTorrentLink || parsedLaunch
            );

            // Lampa.Player.play chooses player_torrent only when torrent_hash is truthy.
            // A sentinel is enough when the real hash is unavailable after cross-device sync.
            if (!torrentHash && isTorrentResume) torrentHash = 'continue_watch_external';

            var data = {
                url: url,
                uri: url,
                src: url,
                title: params.episode_title || params.title || Utils.getMovieTitle(movie),
                card: movie,
                movie: movie,
                timeline: timeline,
                time: resumeTime,
                position: resumeTime > 0 ? resumeTime : -1,
                duration: resumeDuration,
                percent: resumePercent,
                playlist: playlist,
                playlist_index: playlistIndex,
                start_index: playlistIndex,
                season: season,
                episode: episode,
                torrent_hash: torrentHash,
                isonline: !!params.isonline,
                continue_watch_universal: true
            };

            if (activeItem) data.currentItem = activeItem;
            if (activeImage) Utils.copyImageFields(data, activeImage);

            try {
                Lampa.Player.play(data);
            } catch (e3) {
                Utils.error('Launch from continue failed', e3);
            }
        }

        return {
            patchPlayer: patchPlayer,
            launchFromContinue: launchFromContinue,
            isPatched: function () { return patched; }
        };
    })();

    // ============================================================
    // UIManager
    // ============================================================

    var UIManager = (function () {
        var installed = false;
        var cardObserver = null;
        var cardScanTimer = null;
        var cardScanQueued = false;
        var controllerRefreshTimer = null;
        var controllerRegisteredNode = null;
        var controllerRegisteredState = '';

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function getContinueRoad(movie, params) {
            params = params || {};

            var road = {
                time: Number(params.time || 0),
                duration: Number(params.duration || 0),
                percent: Number(params.percent || 0)
            };

            try {
                var hash = String(params.timeline_hash || '') || StorageManager.generateTimelineHash(movie, Number(params.season || 0), Number(params.episode || 0));
                var timeline = hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null;

                if (timeline) {
                    road.time = Math.max(road.time, Number(timeline.time || 0));
                    road.duration = Math.max(road.duration, Number(timeline.duration || 0));
                    road.percent = Math.max(road.percent, Number(timeline.percent || 0));
                }
            } catch (e) {}

            if (!road.percent && road.time && road.duration) {
                road.percent = Math.round(road.time / road.duration * 100);
            }

            road.percent = Utils.clamp(road.percent, 0, 100);
            return road;
        }

        function formatContinueSubtitle(params, road) {
            if (!params) return '';

            var parts = [];
            var season = Number(params.season || 0);
            var episode = Number(params.episode || 0);
            var isTv = params.media_type === 'tv' || season || episode;

            if (isTv && season && episode) parts.push('S' + season + 'E' + episode);
            else if (isTv && episode) parts.push('E' + episode);

            if (road && road.time) parts.push(Utils.formatSeconds(road.time));
            return parts.join(' / ');
        }

        function getActiveMovieFromCard() {
            try {
                var activity = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
                if (activity && activity.movie) return activity.movie;
                if (activity && activity.card) return activity.card;
                if (activity && activity.params && activity.params.movie) return activity.params.movie;
            } catch (e) {}
            return null;
        }

        function launchFromButton(button, movie) {
            var now = Date.now();
            var lastLaunchAt = Number(button.data('continueWatchUniversalLaunchAt') || 0);
            if (now - lastLaunchAt < 900) return false;

            button.data('continueWatchUniversalLaunchAt', now);

            var activeMovie = movie || getActiveMovieFromCard();
            var params = activeMovie ? StorageManager.getLastStreamParams(activeMovie) : null;

            if (!activeMovie || !params) {
                try { Lampa.Noty.show('Нет истории просмотров'); } catch (e) {}
                return false;
            }

            PlayerManager.launchFromContinue(activeMovie, params);
            return false;
        }

        function bindLaunch(button, movie) {
            function launch(event) {
                if (event) {
                    try { event.preventDefault(); } catch (e) {}
                    try { event.stopPropagation(); } catch (e2) {}
                    try { event.stopImmediatePropagation(); } catch (e3) {}
                }
                return launchFromButton(button, movie);
            }

            button
                .off('.continueWatchUniversalLaunch')
                .on('hover:enter.continueWatchUniversalLaunch', function () {
                    return launch();
                })
                .on('click.continueWatchUniversalLaunch', function (event) {
                    return launch(event);
                });

            // Desktop browsers let Lampa's mouse-navigation move controller focus on
            // mousedown before click. Prevent that default focus hop while keeping the
            // actual click handler above. Android/touch does not depend on this branch.
            if (Utils.getPlatformKind() === 'unknown') {
                button
                    .on('mousedown.continueWatchUniversalLaunch', function (event) {
                        try { event.preventDefault(); } catch (e) {}
                        try { event.stopPropagation(); } catch (e2) {}
                    })
                    .on('pointerdown.continueWatchUniversalLaunch', function (event) {
                        if (event && event.pointerType && event.pointerType !== 'mouse') return;
                        try { event.preventDefault(); } catch (e) {}
                        try { event.stopPropagation(); } catch (e2) {}
                    });
            }
        }

        function createButton(movie, params) {
            var road = getContinueRoad(movie, params);
            var subtitle = formatContinueSubtitle(params, road);
            var dash = (road.percent * 65.97 / 100).toFixed(2);
            var movieKey = '';

            try { movieKey = StorageManager.getMovieKey(movie) || ''; } catch (e) {}

            var stateKey = [
                Number(params && params.timestamp || 0),
                Number(params && params.time || 0),
                Number(params && params.duration || 0),
                Number(params && params.season || 0),
                Number(params && params.episode || 0),
                Number(params && params.playlist_index || 0)
            ].join(':');

            var html =
                '<div class="full-start__button selector view--continue-watch button--continue-watch button--continue-watch-native-just" ' +
                    'data-buttons-plugin-id="continue_watch_universal" ' +
                    'data-cwu-movie-key="' + escapeHtml(movieKey) + '" ' +
                    'data-cwu-state="' + escapeHtml(stateKey) + '" ' +
                    'data-cwu-subtitle="' + escapeHtml(subtitle) + '">' +
                    '<svg class="continue-watch-native-just-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">' +
                        '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.7" fill="none" opacity="0.22"></circle>' +
                        '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="' + dash + ' 65.97" transform="rotate(-90 12 12)"></circle>' +
                        '<path d="M9 7.7v8.6c0 .55.6.89 1.08.6l6.62-4.3a.72.72 0 0 0 0-1.2l-6.62-4.3A.7.7 0 0 0 9 7.7z" fill="currentColor"></path>' +
                    '</svg>' +
                    '<span>Продолжить</span>' +
                '</div>';

            var button = $(html);
            bindLaunch(button, movie);
            return button;
        }

        function getWatchContainer(render) {
            var container = render.find('.full-start-new__buttons').first();
            if (container.length) return container;

            container = render.find('.buttons--container').first();
            if (container.length) return container;

            container = $('<div class="full-start-new__buttons"></div>');
            render.append(container);
            return container;
        }

        function insertButton(render, button) {
            var container = getWatchContainer(render);
            container.find('> .button--continue-watch-native-just').remove();

            var torrentButton = container.find('> .view--torrent').first();
            var trailerButton = container.find('> .view--trailer').first();

            if (torrentButton.length) torrentButton.before(button);
            else if (trailerButton.length) trailerButton.before(button);
            else container.prepend(button);
        }

        function refreshCardController(force) {
            function appendButton(forceAppend) {
                try {
                    var current = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled() : null;
                    var buttons = $('.button--continue-watch-native-just').filter(function () {
                        return this.offsetParent !== null;
                    }).first();

                    if (!(
                        current && current.name === 'full_start' &&
                        buttons.length && Lampa.Controller.collectionAppend
                    )) return;

                    var node = buttons[0];
                    var state = String(buttons.attr('data-cwu-state') || '');

                    // collectionAppend rebuilds the controller collection. Repeating it on
                    // every MutationObserver/scan tick makes desktop mouse focus jump to a
                    // neighbouring selector. Register only a new/replaced button.
                    if (!forceAppend && controllerRegisteredNode === node && controllerRegisteredState === state) {
                        return;
                    }

                    Lampa.Controller.collectionAppend(buttons);
                    controllerRegisteredNode = node;
                    controllerRegisteredState = state;
                } catch (e) {}
            }

            appendButton(!!force);
            clearTimeout(controllerRefreshTimer);
            controllerRefreshTimer = setTimeout(function () {
                appendButton(false);
            }, 300);
        }

        function injectStyles() {
            try {
                var css =
                    '.button--continue-watch-native-just{opacity:1!important;pointer-events:auto!important;cursor:pointer!important;position:relative!important;}' +
                    '.button--continue-watch-native-just .continue-watch-native-just-icon{flex-shrink:0;pointer-events:none!important;}' +
                    '.button--continue-watch-native-just span,.button--continue-watch-native-just:after{pointer-events:none!important;}' +
                    '.button--continue-watch-native-just span{white-space:nowrap;}' +
                    '.button--continue-watch-native-just[data-cwu-subtitle]:after{' +
                        'content:attr(data-cwu-subtitle);display:none!important;margin-left:.45em;' +
                        'font-size:.72em;line-height:1;opacity:.65;white-space:nowrap;transform:translateY(.06em);' +
                    '}' +
                    '.button--continue-watch-native-just:hover:after,' +
                    '.button--continue-watch-native-just.focus:after{display:inline-block!important;}';

                var style = document.getElementById('continue-watch-native-just-style');
                if (!style) {
                    style = document.createElement('style');
                    style.id = 'continue-watch-native-just-style';
                    style.type = 'text/css';
                    document.head.appendChild(style);
                }
                style.textContent = css;
            } catch (e) {}
        }

        function getEventMovie(event) {
            var active = null;
            try { active = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null; } catch (e) {}

            var activity = event && event.object && event.object.activity
                ? event.object.activity
                : active;

            return (
                (event && event.data && event.data.movie) ||
                (activity && activity.movie) ||
                (activity && activity.card) ||
                (activity && activity.params && activity.params.movie) ||
                (active && active.movie) ||
                (active && active.card) ||
                getActiveMovieFromCard() ||
                Utils.getActivityMovie()
            );
        }

        function getEventRender(event) {
            var render = event && event.body && event.body.find ? event.body : null;
            if (render && render.find('.full-start-new__buttons').length) return render;

            try {
                var roots = $('.full-start-new');
                if (roots && roots.length) return roots.last();
            } catch (e) {}

            return render;
        }

        function renderCardButtons(render, movie) {
            if (!render || !render.find || !movie) return;

            Utils.rememberActivityMovie(movie);
            var params = StorageManager.getLastStreamParams(movie);
            var existing = render.find('.button--continue-watch-native-just').first();

            if (!params) {
                if (existing.length) existing.remove();
                return;
            }

            var stateKey = [
                Number(params.timestamp || 0),
                Number(params.time || 0),
                Number(params.duration || 0),
                Number(params.season || 0),
                Number(params.episode || 0),
                Number(params.playlist_index || 0)
            ].join(':');

            var controllerChanged = false;

            if (!existing.length) {
                insertButton(render, createButton(movie, params));
                controllerChanged = true;
            } else if (String(existing.attr('data-cwu-state') || '') !== stateKey) {
                existing.replaceWith(createButton(movie, params));
                controllerChanged = true;
            }

            render.find('.button--continue-watch-native-just').each(function () {
                bindLaunch($(this), movie);
            });

            if (controllerChanged) refreshCardController(true);
        }

        function scanActiveCard() {
            cardScanQueued = false;
            try {
                var movie = getEventMovie(null);
                var render = getEventRender(null);
                if (movie && render) renderCardButtons(render, movie);
            } catch (e) {}
        }

        function queueCardScan() {
            if (cardScanQueued) return;
            cardScanQueued = true;
            setTimeout(scanActiveCard, 120);
        }

        function install() {
            if (installed) return;
            installed = true;

            injectStyles();

            $(document)
                .off('click.continueWatchUniversalDelegate', '.button--continue-watch-native-just')
                .on('click.continueWatchUniversalDelegate', '.button--continue-watch-native-just', function (event) {
                    if (event) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                    return launchFromButton($(this), null);
                });

            Lampa.Listener.follow('full', function (event) {
                if (!event) return;

                var movie = getEventMovie(event);
                if (movie) Utils.rememberActivityMovie(movie);

                if (event.type !== 'start' && event.type !== 'build' && event.type !== 'complite') return;

                setTimeout(function () {
                    renderCardButtons(getEventRender(event), getEventMovie(event));
                }, 0);

                setTimeout(function () {
                    renderCardButtons(getEventRender(event), getEventMovie(event));
                }, 350);
            });

            try {
                if (window.MutationObserver && document.body) {
                    cardObserver = new MutationObserver(queueCardScan);
                    cardObserver.observe(document.body, { childList: true, subtree: true });
                }
            } catch (e) {}

            cardScanTimer = setInterval(scanActiveCard, 1500);
            setTimeout(scanActiveCard, 250);
        }

        function removeContinueButtons(render) {
            try {
                if (render && render.find) render.find('.button--continue-watch-native-just').remove();
                else $('.button--continue-watch-native-just').remove();
            } catch (e) {}
        }

        return {
            install: install,
            removeContinueButtons: removeContinueButtons
        };
    })();

    // ============================================================
    // TransportManager
    // ============================================================

    var TransportManager = (function () {
        function init() {
            JustPlusTransport.init();
            LampaNativeTransport.init();

            Utils.log(
                'Transport init',
                'platform=' + Utils.getPlatformKind(),
                'player_torrent=' + Utils.getTorrentPlayerType(),
                'selected=' + (JustPlusTransport.matches() ? 'just' : 'lampa')
            );
        }

        return { init: init };
    })();

    // ============================================================
    // Public API
    // ============================================================

    function exposeApi() {
        if (!DEBUG.exposeApi) return;

        window.ContinueWatchUniversal = {
            version: PLUGIN_VERSION,
            config: CONFIG,
            debug: DEBUG,
            utils: {
                platform: Utils.getPlatformKind,
                player: Utils.getTorrentPlayerType,
                isJustTransport: Utils.isJustTransport,
                parseStreamUrl: Utils.parseStreamUrl
            },
            storage: {
                get: StorageManager.getParams,
                last: StorageManager.getLastStreamParams,
                cleanup: StorageManager.cleanupOld
            },
            session: {
                current: SessionManager.getCurrent,
                metaByHash: SessionManager.getMetaByHash
            },
            transport: {
                just: JustPlusTransport.getStatus,
                lampa: LampaNativeTransport.getStatus
            },
            hooks: {
                playerPatched: PlayerManager.isPatched
            },
            ui: {
                remove: UIManager.removeContinueButtons
            }
        };
    }

    // ============================================================
    // Init
    // ============================================================

    var initStarted = false;

    function init() {
        if (initStarted) return;
        initStarted = true;

        try {
            StorageManager.ensureSync();
            TransportManager.init();
            PlayerManager.patchPlayer();
            UIManager.install();
            exposeApi();

            setTimeout(function () {
                StorageManager.migrateCompactStorage();
                StorageManager.cleanupOld();
            }, 7000);

            setTimeout(function () {
                StorageManager.migrateCompactStorage(true);
            }, 16000);

            window.__CONTINUE_WATCH_NATIVE_JUST_READY__ = true;
            window.__CONTINUE_WATCH_NATIVE_JUST_LOADING__ = false;
            window.__CONTINUE_WATCH_NATIVE_JUST_VERSION__ = PLUGIN_VERSION;
            rememberBootStatus('ready', 'timeline-direct online + Just+ native return initialized');
        } catch (e) {
            initStarted = false;
            window.__CONTINUE_WATCH_NATIVE_JUST_READY__ = false;
            window.__CONTINUE_WATCH_NATIVE_JUST_LOADING__ = false;
            rememberBootStatus('init-error', String(e && e.message ? e.message : e));
            Utils.error('Init failed', e);

            try {
                if (Lampa.Noty && Lampa.Noty.show) {
                    Lampa.Noty.show('ContinueWatch init error: ' + String(e && e.message ? e.message : e).slice(0, 120));
                }
            } catch (ee) {}
        }
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') init();
        });

        setTimeout(init, 1200);
        setTimeout(init, 4000);
    }
})();
