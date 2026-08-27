(function () {
    'use strict';

    var BOOT_VERSION = 'v5.1.0-justplus-native-return-20260827';
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
        justResultSettleMs: 650,
        justReconcileIntervalMs: 1000,

        hookRetryMs: 500,
        hookRetryMaxMs: 60000,
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
            getMovieTitle: getMovieTitle,
            getMediaKind: getMediaKind,
            extractExplicitSE: extractExplicitSE,
            extractSEFromText: extractSEFromText,
            shallowClone: shallowClone,
            getActivityMovie: getActivityMovie,
            rememberActivityMovie: rememberActivityMovie
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
                : CONFIG.storageBaseKey;
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

            if (id) return 'id:' + id;
            if (title) return 'title:' + Lampa.Utils.hash(title);
            return '';
        }

        function getMovieKeyFromData(data) {
            if (!data) return '';
            if (data.movie_key) return data.movie_key;
            if (data.movie_id) return 'id:' + data.movie_id;
            if (data.tmdb_id) return 'id:' + data.tmdb_id;

            var title = data.original_title || data.original_name || data.title || data.name || '';
            if (title) return 'title:' + Lampa.Utils.hash(title);
            return '';
        }

        function updateLastPointer(params, data, hash) {
            if (!data || !hash) return;

            var mediaType = String(data.media_type || data.mediaType || '').toLowerCase();
            var isMovie = mediaType === 'movie';

            if (!isMovie && (!data.season || !data.episode)) return;

            var movieKey = getMovieKeyFromData(data);
            if (!movieKey) return;

            if (!params.__last_by_movie) params.__last_by_movie = {};

            params.__last_by_movie[movieKey] = {
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
            if (params.file_name && params.torrent_link) return buildStreamUrl(params) || '';
            return Utils.stripFragment(params.url || params.uri || params.src || '');
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

            if (
                movieKey &&
                params.__last_by_movie &&
                params.__last_by_movie[movieKey] &&
                params.__last_by_movie[movieKey].hash &&
                params[params.__last_by_movie[movieKey].hash]
            ) {
                return params[params.__last_by_movie[movieKey].hash];
            }

            var originalTitle = Utils.getMovieTitle(movie);
            var movieId = movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '';
            var list = [];

            Object.keys(params).forEach(function (key) {
                if (key === '__last_by_movie') return;

                var item = params[key];
                if (!item || typeof item !== 'object') return;

                var sameId = movieId && item.movie_id && String(movieId) === String(item.movie_id);
                var sameTitle = originalTitle && (
                    String(item.original_title || '') === String(originalTitle) ||
                    String(item.original_name || '') === String(originalTitle) ||
                    String(item.name || '') === String(originalTitle)
                );

                if (sameId || sameTitle) list.push(item);
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
                if (key === '__last_by_movie') return;
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
                playlist: session.playlist || [],
                transport: session.transport || 'lampa',
                timeline_hash: String(session.hash || '')
            };

            if (image) Utils.copyImageFields(data, image);
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
                    source