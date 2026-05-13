(function () {
    'use strict';

    if (!window.Lampa) return;

    var BOOT_VERSION = 'v4.0.5-android-ddd-playlist-fragment-20260513';

    if (
        window.__CONTINUE_WATCH_DDD_LAYER_V3_READY__ &&
        window.__CONTINUE_WATCH_DDD_LAYER_V3_VERSION__ === BOOT_VERSION
    ) {
        return;
    }

    window.__CONTINUE_WATCH_DDD_LAYER_V3_LOADING__ = true;
    window.__CONTINUE_WATCH_DDD_LAYER_V3_VERSION__ = BOOT_VERSION;

    var PLUGIN_NAME = 'ContinueWatchUniversal';
    var PLUGIN_VERSION = BOOT_VERSION;

    var DDD_DEBUG = true;

    var DEBUG = {
        enabled: !!DDD_DEBUG,
        console: !!DDD_DEBUG,
        noty: !!DDD_DEBUG,
        notyLevel: DDD_DEBUG ? 3 : 0,
        notyMinIntervalMs: 1200,
        pollSuccess: !!DDD_DEBUG,
        pollFail: !!DDD_DEBUG,
        statusButton: false,
        exposeApi: true
    };

    var CONFIG = {
        storageBaseKey: 'continue_watch_params',
        sessionStorageKey: 'continue_watch_ddd_session',

        cleanupAgeMs: 60 * 24 * 60 * 60 * 1000,
        debounceDelayMs: 1000,

        dddEnabled: true,
        dddAndroidOnly: true,
        dddHost: 'http://127.0.0.1',
        dddPort: 39677,
        dddClient: 'lampa',
        dddMode: 'local',
        dddToken: '',

        dddPollIntervalMs: 1500,
        dddFetchTimeoutMs: 1800,
        dddTimelineSaveIntervalMs: 5000,
        dddEventsLimit: 50,

        minSaveSeconds: 8,
        minDurationSeconds: 60,
        finishPercent: 90,

        onlyExternalTorrentPlayer: true,
        nativeTimelineEnabled: true,
        nativePlayerEventsEnabled: true,
        saveNativeTimelineToCustomStorage: true,
        updateLampaTimelineFromDDD: true,
        maxNativeAfterDDDSilenceMs: 30000
    };

    // ============================================================
    // Utils
    // ============================================================

    var Utils = (function () {
        var lastNotyMessage = '';
        var lastNotyTime = 0;

        function now() {
            return Date.now ? Date.now() : new Date().getTime();
        }

        function stringifyArgs(args) {
            var out = [];

            for (var i = 0; i < args.length; i++) {
                var item = args[i];

                if (item === undefined) continue;

                if (item === null) {
                    out.push('null');
                    continue;
                }

                if (
                    typeof item === 'string' ||
                    typeof item === 'number' ||
                    typeof item === 'boolean'
                ) {
                    out.push(String(item));
                    continue;
                }

                try {
                    out.push(JSON.stringify(item));
                } catch (e) {
                    out.push('[object]');
                }
            }

            return out.join(' ');
        }

        function showConsole(method, args) {
            if (!DEBUG.enabled || !DEBUG.console) return;
            if (!window.console) return;

            var fn = console[method] || console.log;

            try {
                fn.apply(console, ['[' + PLUGIN_NAME + ']'].concat(Array.prototype.slice.call(args)));
            } catch (e) {}
        }

        function showNoty(message, level, force) {
            if (!DEBUG.enabled || !DEBUG.noty) return;

            level = Number(level || 0);
            if (!force && level > Number(DEBUG.notyLevel || 0)) return;

            var current = now();
            var text = String(message || '');

            if (!force && text === lastNotyMessage && current - lastNotyTime < DEBUG.notyMinIntervalMs) {
                return;
            }

            lastNotyMessage = text;
            lastNotyTime = current;

            try {
                if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(text);
            } catch (e) {}
        }

        function debugLine(prefix, args, level, force) {
            var text = stringifyArgs(args);

            if (!text) text = '';
            if (prefix) text = prefix + (text ? ': ' + text : '');

            showNoty(text.slice(0, 180), level, force);
        }

        function log() {
            showConsole('log', arguments);
        }

        function warn() {
            showConsole('warn', arguments);
            debugLine('warn', arguments, 2, false);
        }

        function error() {
            showConsole('error', arguments);
            debugLine('error', arguments, 0, true);
        }

        function noty(message, force, level) {
            showNoty(message, level, force);
        }

        function stripFragment(url) {
            if (typeof url !== 'string') return url;

            var pos = url.indexOf('#');
            return pos >= 0 ? url.substring(0, pos) : url;
        }

        function getFragment(url) {
            if (typeof url !== 'string') return '';

            var pos = url.indexOf('#');
            return pos >= 0 ? url.substring(pos + 1) : '';
        }

        function isStreamUrl(url) {
            return typeof url === 'string' && url.indexOf('/stream/') !== -1;
        }

        function encodeParams(params) {
            var result = [];

            Object.keys(params).forEach(function (key) {
                if (params[key] === undefined || params[key] === null || params[key] === '') return;

                result.push(
                    encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]))
                );
            });

            return result.join('&');
        }

        function appendFragmentParams(url, params) {
            if (!url || typeof url !== 'string') return url;

            var base = stripFragment(url);
            var oldFragment = getFragment(url);
            var add = encodeParams(params || {});

            if (!oldFragment) return add ? base + '#' + add : base;
            if (!add) return base + '#' + oldFragment;

            return base + '#' + oldFragment + '&' + add;
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

        function msToSeconds(ms) {
            ms = Number(ms || 0);
            if (!ms || ms < 0) return 0;
            return Math.floor(ms / 1000);
        }

        function clamp(value, min, max) {
            value = Number(value || 0);
            if (value < min) return min;
            if (value > max) return max;
            return value;
        }

        function safeJson(value) {
            try {
                return JSON.stringify(value);
            } catch (e) {
                return '';
            }
        }

        function safeDecode(value) {
            value = String(value || '');

            try {
                return decodeURIComponent(value);
            } catch (e) {
                return value;
            }
        }

        function normalizeText(value) {
            return String(value || '')
                .toLowerCase()
                .replace(/\+/g, ' ')
                .replace(/[_]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function getPlatformKind() {
            var ua = '';

            try {
                ua = String(navigator.userAgent || '').toLowerCase();
            } catch (e) {}

            try {
                if (Lampa.Platform && Lampa.Platform.is) {
                    if (Lampa.Platform.is('android')) return 'android';
                    if (Lampa.Platform.is('webos')) return 'lg_webos';
                    if (Lampa.Platform.is('tizen')) return 'samsung_tizen';
                    if (Lampa.Platform.is('samsung')) return 'samsung_tizen';
                    if (Lampa.Platform.is('apple_tv')) return 'apple_tv';
                    if (Lampa.Platform.is('apple')) return 'apple';
                }
            } catch (e2) {}

            if (/android/.test(ua)) return 'android';
            if (/web0s|webos|netcast|lg browser/.test(ua)) return 'lg_webos';
            if (/tizen|samsungbrowser|smart-tv|smarttv/.test(ua)) return 'samsung_tizen';

            return 'unknown';
        }

        function isAndroidPlatform() {
            return getPlatformKind() === 'android';
        }

        function getTorrentPlayerType() {
            try {
                return String(Lampa.Storage.field('player_torrent') || '');
            } catch (e) {
                return '';
            }
        }

        function isExternalTorrentPlayer() {
            var type = getTorrentPlayerType();

            if (!type) return true;
            if (type === 'inner') return false;
            if (type === 'lampa') return false;

            return true;
        }

        function shouldUseDDDLayer() {
            if (!CONFIG.dddEnabled) return false;

            if (CONFIG.dddAndroidOnly && !isAndroidPlatform()) return false;

            if (!CONFIG.onlyExternalTorrentPlayer) return true;

            return isExternalTorrentPlayer();
        }

        function parseStreamUrl(url) {
            if (!url || typeof url !== 'string') return null;

            url = stripFragment(url);

            var fileMatch = url.match(/\/stream\/([^?]+)/);
            var linkMatch = url.match(/[?&]link=([^&#]+)/);
            var indexMatch = url.match(/[?&]index=(\d+)/);

            if (!fileMatch || !linkMatch) return null;

            return {
                file_name: safeDecode(fileMatch[1])
                    .replace(/\+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim(),
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

        function getOriginalLanguage(obj) {
            obj = obj || {};

            var card = obj.card || obj.movie || obj.data || obj;

            return String(
                obj.original_language ||
                obj.originalLanguage ||
                obj.language ||
                card.original_language ||
                card.originalLanguage ||
                card.language ||
                ''
            ).toLowerCase();
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
                obj.media_type ||
                obj.mediaType ||
                card.media_type ||
                card.mediaType ||
                ''
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

            if (card.release_date || Number(card.runtime || 0) > 0 || card.original_title) {
                return 'movie';
            }

            return 'movie';
        }

        function isJapaneseSeries(obj) {
            obj = obj || {};

            var card = obj.card || obj.movie || obj.data || obj;
            var lang = getOriginalLanguage(card);

            return lang === 'ja' && getMediaKind(card) === 'tv';
        }

        function getStreamFileNameFromData(data) {
            if (!data) return '';

            var url = data.url || data.uri || data.src || '';

            if (url && typeof url === 'string') {
                var parsed = parseStreamUrl(url);
                if (parsed && parsed.file_name) return parsed.file_name;
            }

            return '';
        }

        function extractSE(data, options) {
            options = options || {};

            var preferText = !!options.preferText;
            var allowEpisodeOnly = !!options.allowEpisodeOnly;
            var fallbackSeason = Number(options.fallbackSeason || 0);

            function parseText(text) {
                if (!text || typeof text !== 'string') return null;

                text = safeDecode(text)
                    .replace(/\+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                var m;

                m = text.match(/\bS\s*0?(\d{1,2})\s*[-_. ]+\s*0?(\d{1,3})\b/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_s_dash_e' };

                m = text.match(/\bS(?:eason)?\s*0?(\d{1,2})\s*[\.\-_: ]*\s*E(?:p(?:isode)?)?\s*0?(\d{1,3})\b/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_sxe' };

                m = text.match(/\b0?(\d{1,2})\s*[xх×]\s*0?(\d{1,3})\b/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_1x02' };

                m = text.match(/season\s*0?(\d{1,2}).*?(?:episode|ep\.?)\s*0?(\d{1,3})/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_season_episode' };

                m = text.match(/0?(\d{1,2})\s*сезон.*?0?(\d{1,3})\s*сер/i);
                if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10), source: 'text_ru_season_episode' };

                m = text.match(/第\s*0?(\d{1,3})\s*話/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return { season: fallbackSeason, episode: parseInt(m[1], 10), source: 'text_ja_episode_only' };
                }

                m = text.match(/(?:эпизод|сер(?:ия|ии|и)?|episode|ep\.?|сер\.)\s*[-–—:]?\s*0?(\d{1,3})/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return { season: fallbackSeason, episode: parseInt(m[1], 10), source: 'text_episode_only' };
                }

                m = text.match(/\s[-–—]\s0?(\d{1,3})(?:\s|$|\.|\[|\()/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return { season: fallbackSeason, episode: parseInt(m[1], 10), source: 'text_dash_episode_only' };
                }

                m = text.match(/(?:^|[\s._\-\[\(])0?(\d{1,3})(?:\s*(?:v\d+)?\s*(?:\[[^\]]+\]|\([^)]+\))*)?\.(?:mkv|mp4|avi|ts)$/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return { season: fallbackSeason, episode: parseInt(m[1], 10), source: 'text_filename_episode_only' };
                }

                return null;
            }

            function parseFields() {
                if (data && data.season !== undefined && data.episode !== undefined) {
                    var s = Number(data.season || 0);
                    var e = Number(data.episode || 0);
                    if (s && e) return { season: s, episode: e, source: 'fields_season_episode' };
                }

                if (data && data.season_number !== undefined && data.episode_number !== undefined) {
                    var ss = Number(data.season_number || 0);
                    var ee = Number(data.episode_number || 0);
                    if (ss && ee) return { season: ss, episode: ee, source: 'fields_season_number_episode_number' };
                }

                if (data && data.s !== undefined && data.e !== undefined) {
                    var s2 = Number(data.s || 0);
                    var e2 = Number(data.e || 0);
                    if (s2 && e2) return { season: s2, episode: e2, source: 'fields_s_e' };
                }

                return null;
            }

            function parseTexts() {
                var fields = [];

                if (data) {
                    fields.push(
                        getStreamFileNameFromData(data),
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
                    );

                    if (data.currentItem) {
                        fields.push(
                            data.currentItem.filename,
                            data.currentItem.title,
                            data.currentItem.uri,
                            data.currentItem.url
                        );
                    }
                }

                for (var i = 0; i < fields.length; i++) {
                    var parsed = parseText(fields[i]);
                    if (parsed && parsed.season && parsed.episode) return parsed;
                }

                return null;
            }

            var result = preferText ? parseTexts() : parseFields();
            if (result) return result;

            result = preferText ? parseFields() : parseTexts();
            if (result) return result;

            return { season: 0, episode: 0, source: '' };
        }

        function shallowClone(obj) {
            var out = {};

            if (!obj || typeof obj !== 'object') return out;

            Object.keys(obj).forEach(function (key) {
                out[key] = obj[key];
            });

            return out;
        }

        function getActivityMovie() {
            try {
                var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
                if (active && active.movie) return active.movie;
            } catch (e) {}

            return null;
        }

        return {
            log: log,
            warn: warn,
            error: error,
            noty: noty,
            now: now,
            stripFragment: stripFragment,
            getFragment: getFragment,
            appendFragmentParams: appendFragmentParams,
            isStreamUrl: isStreamUrl,
            encodeParams: encodeParams,
            formatSeconds: formatSeconds,
            msToSeconds: msToSeconds,
            clamp: clamp,
            safeJson: safeJson,
            safeDecode: safeDecode,
            normalizeText: normalizeText,
            getPlatformKind: getPlatformKind,
            isAndroidPlatform: isAndroidPlatform,
            getTorrentPlayerType: getTorrentPlayerType,
            isExternalTorrentPlayer: isExternalTorrentPlayer,
            shouldUseDDDLayer: shouldUseDDDLayer,
            parseStreamUrl: parseStreamUrl,
            streamIdentity: streamIdentity,
            extractSE: extractSE,
            getOriginalLanguage: getOriginalLanguage,
            getMovieTitle: getMovieTitle,
            getMediaKind: getMediaKind,
            isJapaneseSeries: isJapaneseSeries,
            getStreamFileNameFromData: getStreamFileNameFromData,
            shallowClone: shallowClone,
            getActivityMovie: getActivityMovie
        };
    })();

    // ============================================================
    // StorageManager
    // ============================================================

    var StorageManager = (function () {
        var memoryCache = null;
        var activeStorageKey = null;
        var syncedStorageKey = null;
        var accountReady = !!window.appready;
        var saveTimer = null;

        function setAccountReady(value) {
            accountReady = !!value;
            activeStorageKey = null;
            syncedStorageKey = null;
            memoryCache = null;
        }

        function getProfileId() {
            try {
                if (
                    accountReady &&
                    Lampa.Account &&
                    Lampa.Account.Permit &&
                    Lampa.Account.Permit.sync &&
                    Lampa.Account.Permit.account &&
                    Lampa.Account.Permit.account.profile &&
                    Lampa.Account.Permit.account.profile.id !== undefined
                ) {
                    return Lampa.Account.Permit.account.profile.id;
                }
            } catch (e) {}

            return null;
        }

        function getStorageKey() {
            var profileId = getProfileId();

            if (profileId !== null && profileId !== undefined) return CONFIG.storageBaseKey + '_' + profileId;

            return CONFIG.storageBaseKey;
        }

        function getSessionStorageKey() {
            var profileId = getProfileId();

            if (profileId !== null && profileId !== undefined) return CONFIG.sessionStorageKey + '_' + profileId;

            return CONFIG.sessionStorageKey;
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
                } catch (e) {
                    Utils.error('Storage get failed', e);
                    memoryCache = {};
                }
            }

            if (!memoryCache || typeof memoryCache !== 'object') memoryCache = {};

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
            var isMovieRecord = mediaType === 'movie';

            if (!isMovieRecord && (!data.season || !data.episode)) return;

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
                if (key === 'playlist') return;

                var value = data[key];

                if (value === undefined) return;

                if (old[key] !== value) {
                    old[key] = value;
                    changed = true;
                }
            });

            if (Array.isArray(data.playlist) && data.playlist.length >= 2) {
                var oldJson = old.playlist ? Utils.safeJson(old.playlist) : '';
                var newJson = Utils.safeJson(data.playlist);

                if (oldJson !== newJson) {
                    old.playlist = data.playlist;
                    changed = true;
                }
            }

            if (forceTimestamp || changed || !old.timestamp) {
                old.timestamp = Utils.now();

                if (!old.original_timestamp) old.original_timestamp = old.timestamp;

                updateLastPointer(params, old, hash);
                setParams(params, true);

                Utils.log('Saved stream params', hash, 'S' + (old.season || 0) + 'E' + (old.episode || 0), old.episode_title || old.title || '');

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

                url = url.replace(/\/$/, '');

                if (!/^https?:\/\/[^/]+/.test(url)) return null;

                return url;
            } catch (e) {
                Utils.error('Invalid TorrServer URL', e);
                return null;
            }
        }

        function buildStreamUrl(params) {
            if (!params || !params.file_name || !params.torrent_link) {
                Utils.error('Missing stream params', params);
                return null;
            }

            var server = getTorrServerUrl();

            if (!server) {
                try { Lampa.Noty.show('TorrServer не настроен'); } catch (e) {}
                return null;
            }

            var file = encodeURIComponent(params.file_name);
            var link = encodeURIComponent(params.torrent_link);
            var index = params.file_index !== undefined ? params.file_index : 0;

            return server + '/stream/' + file + '?link=' + link + '&index=' + index + '&play';
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

        function updateTimeline(hash, time, duration, percent, source) {
            if (!hash) return;
            if (!Lampa.Timeline || !Lampa.Timeline.update) return;

            time = Number(time || 0);
            duration = Number(duration || 0);
            percent = Number(percent || 0);

            if (!duration && time) return;

            if (!percent && duration) percent = Math.round(time / duration * 100);

            percent = Utils.clamp(percent, 0, 100);

            try {
                Lampa.Timeline.update({
                    hash: hash,
                    percent: percent,
                    time: time,
                    duration: duration,
                    received: source === 'ddd'
                });
            } catch (e) {
                Utils.error('Timeline update failed', e);
            }
        }

        function getLastStreamParams(movie) {
            if (!movie) return null;

            var originalTitle = Utils.getMovieTitle(movie);
            var movieId = movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId;
            var mediaKind = Utils.getMediaKind(movie);
            var isMovieLike = mediaKind === 'movie';
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

            if (!originalTitle && !movieId) return null;

            var list = [];

            Object.keys(params).forEach(function (key) {
                var item = params[key];

                if (!item || typeof item !== 'object') return;
                if (!item.file_name || !item.torrent_link) return;

                var sameId = false;
                var sameTitle = false;

                if (movieId && item.movie_id) sameId = String(item.movie_id) === String(movieId);
                if (originalTitle && item.original_title) sameTitle = sameTitle || String(item.original_title) === String(originalTitle);
                if (originalTitle && item.original_name) sameTitle = sameTitle || String(item.original_name) === String(originalTitle);
                if (originalTitle && item.title) sameTitle = sameTitle || String(item.title) === String(originalTitle);

                if (!(sameId || sameTitle)) return;

                if (isMovieLike) {
                    var itemMediaType = String(item.media_type || item.mediaType || '').toLowerCase();
                    if (itemMediaType && itemMediaType !== 'movie') return;
                }

                list.push(item);
            });

            if (!list.length) return null;

            list.sort(function (a, b) {
                return Number(b.timestamp || 0) - Number(a.timestamp || 0);
            });
            return list[0] || null;
        }

        function cleanupOld() {
            var params = getParams();
            var maxAge = CONFIG.cleanupAgeMs;
            var current = Utils.now();
            var changed = false;

            Object.keys(params).forEach(function (key) {
                if (key === '__last_by_movie') return;

                var item = params[key];
                if (!item || typeof item !== 'object') return;

                if (item.timestamp && current - Number(item.timestamp) > maxAge) {
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
            setAccountReady: setAccountReady,
            ensureSync: ensureSync,
            getParams: getParams,
            setParams: setParams,
            getMovieKey: getMovieKey,
            getMovieKeyFromData: getMovieKeyFromData,
            saveStreamParams: saveStreamParams,
            getTorrServerUrl: getTorrServerUrl,
            buildStreamUrl: buildStreamUrl,
            rebuildStreamUrl: rebuildStreamUrl,
            generateTimelineHash: generateTimelineHash,
            updateTimeline: updateTimeline,
            getLastStreamParams: getLastStreamParams,
            cleanupOld: cleanupOld,
            getSessionStorageKey: getSessionStorageKey
        };
    })();

    // ============================================================
    // SessionBuilder / SessionManager
    // ============================================================

    var SessionManager = (function () {
        var currentSession = null;
        var sessionByHash = {};
        var hashMetaByHash = {};

        function rememberHash(hash, session, meta) {
            if (!hash) return;

            hash = String(hash);
            sessionByHash[hash] = session;
            hashMetaByHash[hash] = meta || {};
        }

        function hasHash(hash) {
            return !!(hash && hashMetaByHash[String(hash)]);
        }

        function normalizePlaylist(playlist) {
            if (!Array.isArray(playlist)) return [];

            return playlist
                .filter(function (item) {
                    return item && typeof item === 'object';
                })
                .map(function (item, index) {
                    var url = item.url || item.uri || item.src || '';
                    var parsed = Utils.parseStreamUrl(url);

                    return {
                        url: Utils.stripFragment(url || ''),
                        title: item.title || item.name || item.label || '',
                        name: item.name || item.title || '',
                        filename: item.filename || item.file_name || item.path || (parsed ? parsed.file_name : ''),
                        file_name: item.file_name || item.filename || item.path || (parsed ? parsed.file_name : ''),
                        index: index,
                        season: item.season || item.season_number || item.s || 0,
                        episode: item.episode || item.episode_number || item.e || 0,
                        raw: item
                    };
                });
        }

        function getMovieFromData(data) {
            data = data || {};

            return data.card || data.movie || data.card_data || data.data || Utils.getActivityMovie() || data;
        }

        function inferPlaylistIndex(data, playlist, url) {
            var i;
            var cleanUrl = Utils.stripFragment(url || '');
            var identity = Utils.streamIdentity(cleanUrl);

            if (data) {
                if (data.playlist_index !== undefined) return Number(data.playlist_index || 0);
                if (data.start_index !== undefined) return Number(data.start_index || 0);
                if (data.index !== undefined) return Number(data.index || 0);
                if (data.windowIndex !== undefined) return Number(data.windowIndex || 0);
            }

            if (playlist && playlist.length) {
                for (i = 0; i < playlist.length; i++) {
                    if (Utils.stripFragment(playlist[i].url || '') === cleanUrl) return i;
                    if (Utils.streamIdentity(playlist[i].url || '') === identity) return i;
                }
            }

            var parsed = Utils.parseStreamUrl(cleanUrl);
            if (parsed && parsed.file_index !== undefined) return Number(parsed.file_index || 0);

            return 0;
        }

        function getItemAt(playlist, index) {
            if (!playlist || !playlist.length) return null;
            index = Number(index || 0);
            if (index < 0) index = 0;
            if (index >= playlist.length) index = playlist.length - 1;
            return playlist[index] || null;
        }

        function extractSEForSession(data, movie, item, playlistIndex) {
            var fallbackSeason = 0;

            if (data) {
                fallbackSeason = Number(data.season || data.season_number || data.s || 0);
            }

            if (!fallbackSeason && item) {
                fallbackSeason = Number(item.season || item.season_number || item.s || 0);
            }

            if (!fallbackSeason && Utils.getMediaKind(movie) === 'tv') fallbackSeason = 1;

            var se = Utils.extractSE(data || {}, {
                preferText: false,
                allowEpisodeOnly: Utils.isJapaneseSeries(movie),
                fallbackSeason: fallbackSeason
            });

            if (se.season && se.episode) return se;

            if (item) {
                se = Utils.extractSE(item, {
                    preferText: true,
                    allowEpisodeOnly: Utils.isJapaneseSeries(movie),
                    fallbackSeason: fallbackSeason || 1
                });

                if (se.season && se.episode) return se;
            }

            if (Utils.getMediaKind(movie) === 'tv' && Number(playlistIndex) >= 0) {
                return {
                    season: fallbackSeason || 1,
                    episode: Number(playlistIndex || 0) + 1,
                    source: 'playlist_index_fallback'
                };
            }

            return {
                season: 0,
                episode: 0,
                source: ''
            };
        }

        function createSid(hash, data, url) {
            var seed = [
                hash || '',
                Utils.streamIdentity(url || ''),
                data && (data.movie_id || data.tmdb_id || data.id || '') || '',
                data && (data.season || data.season_number || '') || '',
                data && (data.episode || data.episode_number || '') || ''
            ].join('|');

            return 'cw-' + Lampa.Utils.hash(seed);
        }

        function buildParams(session) {
            var parsed = Utils.parseStreamUrl(session.url);
            var movie = session.movie || {};
            var item = session.currentItem || {};

            var data = {
                url: Utils.stripFragment(session.url || ''),
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
                file_index: parsed ? parsed.file_index : Number(session.playlistIndex || 0),
                file_name: parsed ? parsed.file_name : (item.file_name || item.filename || ''),
                torrent_link: parsed ? parsed.torrent_link : '',
                playlist: session.playlist || [],
                sid: session.sid || ''
            };

            return data;
        }

        function register(session) {
            if (!session) return null;

            currentSession = session;

            if (session.hash) {
                rememberHash(session.hash, session, {
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
                    var itemSE = extractSEForSession(item, session.movie, item, i);
                    var itemHash = StorageManager.generateTimelineHash(session.movie, itemSE.season, itemSE.episode);

                    if (itemHash) {
                        rememberHash(itemHash, session, {
                            index: i,
                            item: item,
                            season: Number(itemSE.season || 0),
                            episode: Number(itemSE.episode || 0),
                            source: itemSE.source || 'playlist'
                        });
                    }
                }
            }

            try {
                Lampa.Storage.set(StorageManager.getSessionStorageKey(), session);
            } catch (e) {}

            return session;
        }

        function buildFromPlayData(data, options) {
            options = options || {};
            data = data || {};

            var movie = options.movie || getMovieFromData(data);
            var url = Utils.stripFragment(options.url || data.url || data.uri || data.src || '');
            var playlist = normalizePlaylist(options.playlist || data.playlist || []);
            var playlistIndex = inferPlaylistIndex(data, playlist, url);
            var item = getItemAt(playlist, playlistIndex);

            if (item && item.url && !url) url = item.url;

            var se = extractSEForSession(data, movie, item, playlistIndex);

            var timelineHash = '';
            if (data.timeline && data.timeline.hash) timelineHash = data.timeline.hash;
            if (!timelineHash) timelineHash = StorageManager.generateTimelineHash(movie, se.season, se.episode);

            var session = {
                sid: options.sid || createSid(timelineHash, data, url),
                source: options.source || '',
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
                lastRoad: null,
                params: null
            };

            session.params = buildParams(session);

            return register(session);
        }

        function updateByPlaylistIndex(index, payload) {
            if (!currentSession) return null;

            index = Number(index || 0);

            var item = getItemAt(currentSession.playlist, index);
            var url = payload && payload.uri ? Utils.stripFragment(payload.uri) : '';

            if (!item && currentSession.playlist && currentSession.playlist.length) {
                item = getItemAt(currentSession.playlist, index);
            }

            if (!url && item && item.url) url = item.url;
            if (!url) url = currentSession.url;

            var probeData = Utils.shallowClone(item || {});

            if (payload) {
                probeData.url = payload.uri || probeData.url || url;
                probeData.title = payload.title || probeData.title || '';
                probeData.currentItem = payload.currentItem || null;
                if (payload.currentItem) {
                    probeData.filename = payload.currentItem.filename || probeData.filename;
                    probeData.file_name = payload.currentItem.filename || probeData.file_name;
                }
            }

            var se = extractSEForSession(probeData, currentSession.movie, item, index);
            var hash = StorageManager.generateTimelineHash(currentSession.movie, se.season, se.episode);

            currentSession.url = Utils.stripFragment(url);
            currentSession.playlistIndex = index;
            currentSession.currentItem = item;
            currentSession.title = (payload && payload.title) || (item && item.title) || currentSession.title;
            currentSession.episode_title = (item && item.title) || currentSession.episode_title || '';
            currentSession.season = se.season || currentSession.season || 0;
            currentSession.episode = se.episode || currentSession.episode || 0;
            currentSession.seSource = se.source || currentSession.seSource || '';
            currentSession.hash = hash || currentSession.hash;
            currentSession.updatedAt = Utils.now();
            currentSession.params = buildParams(currentSession);

            register(currentSession);

            return currentSession;
        }

        function updateByTimelineHash(hash, payload) {
            if (!hash) return currentSession;

            var meta = hashMetaByHash[String(hash)];

            if (!meta || !currentSession) {
                return sessionByHash[String(hash)] || currentSession;
            }

            var item = meta.item || getItemAt(currentSession.playlist, meta.index);
            var updatePayload = payload ? Utils.shallowClone(payload) : {};

            if (item) {
                updatePayload.uri = updatePayload.uri || item.url || item.uri || item.src || '';
                updatePayload.title = updatePayload.title || item.title || item.name || '';
                updatePayload.currentItem = updatePayload.currentItem || {
                    filename: item.filename || item.file_name || '',
                    title: item.title || item.name || ''
                };
            }

            currentSession = updateByPlaylistIndex(meta.index, updatePayload) || currentSession;
            currentSession.hash = String(hash);
            currentSession.season = Number(meta.season || currentSession.season || 0);
            currentSession.episode = Number(meta.episode || currentSession.episode || 0);
            currentSession.currentItem = item || currentSession.currentItem;
            currentSession.playlistIndex = Number(meta.index || currentSession.playlistIndex || 0);
            currentSession.params = buildParams(currentSession);

            register(currentSession);

            return currentSession;
        }

        function updateRoad(road) {
            if (!currentSession) return;
            currentSession.lastRoad = road;
            currentSession.updatedAt = Utils.now();
        }

        function getCurrent() {
            return currentSession;
        }

        function getByHash(hash) {
            return sessionByHash[hash] || null;
        }

        return {
            buildFromPlayData: buildFromPlayData,
            updateByPlaylistIndex: updateByPlaylistIndex,
            buildParams: buildParams,
            updateRoad: updateRoad,
            updateByTimelineHash: updateByTimelineHash,
            hasHash: hasHash,
            getCurrent: getCurrent,
            getByHash: getByHash,
            register: register
        };
    })();

    // ============================================================
    // Core
    // ============================================================

    var Core = (function () {
        var activeSource = null;
        var lastDDDTime = 0;
        var lastSaveByHash = {};

        function canAcceptSource(source) {
            source = source || 'unknown';

            if (source === 'ddd') {
                activeSource = 'ddd';
                lastDDDTime = Utils.now();
                return true;
            }

            if (activeSource === 'ddd') {
                if (Utils.now() - lastDDDTime < CONFIG.maxNativeAfterDDDSilenceMs) return false;
                activeSource = source;
                return true;
            }

            if (!activeSource) activeSource = source;

            return true;
        }

        function shouldSave(hash, event) {
            if (!hash) return false;

            var key = hash + ':' + (event.source || '') + ':' + (event.type || '');
            var current = Utils.now();
            var last = lastSaveByHash[key] || 0;

            if (event.force) {
                lastSaveByHash[key] = current;
                return true;
            }

            if (current - last >= 1000) {
                lastSaveByHash[key] = current;
                return true;
            }

            return false;
        }

        function calculatePercent(time, duration, percent) {
            time = Number(time || 0);
            duration = Number(duration || 0);
            percent = Number(percent || 0);

            if (!percent && duration > 0) percent = Math.round(time / duration * 100);

            return Utils.clamp(percent, 0, 100);
        }

        function enrichSessionFromEvent(session, event) {
            if (!session || !event) return session;

            if (event.hash && String(event.hash) !== String(session.hash || '') && SessionManager.hasHash(event.hash)) {
                session = SessionManager.updateByTimelineHash(event.hash, event.rawPayload || event) || session;
            }

            if (event.url) session.url = Utils.stripFragment(event.url);
            if (event.title) session.title = event.title;

            if (event.playlist_index !== undefined && event.playlist_index !== null) {
                SessionManager.updateByPlaylistIndex(event.playlist_index, event.rawPayload || event);
                session = SessionManager.getCurrent() || session;
            }

            if (event.season && event.episode) {
                session.season = Number(event.season || 0);
                session.episode = Number(event.episode || 0);
                session.hash = StorageManager.generateTimelineHash(session.movie, session.season, session.episode) || session.hash;
                session.params = SessionManager.buildParams(session);
                SessionManager.register(session);
            }

            return session;
        }

        function consume(event) {
            if (!event || !event.type) return;
            if (!canAcceptSource(event.source)) return;

            var session = event.session || SessionManager.getCurrent();
            if (!session) return;

            session = enrichSessionFromEvent(session, event);

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
            params.last_source = event.source || '';
            params.last_event_type = event.rawType || event.type || '';
            params.last_reason = event.reason || '';

            if (event.type === 'start') {
                StorageManager.saveStreamParams(hash, params, true);
                return;
            }

            if (!shouldSave(hash, event)) return;

            if (duration >= CONFIG.minDurationSeconds || event.force || event.type === 'ended' || event.type === 'stop' || event.type === 'error') {
                if (event.source === 'ddd' && CONFIG.updateLampaTimelineFromDDD) {
                    if (time >= CONFIG.minSaveSeconds || percent >= CONFIG.finishPercent || event.force || event.type === 'ended') {
                        StorageManager.updateTimeline(hash, time, duration, percent, 'ddd');
                    }
                }

                StorageManager.saveStreamParams(hash, params, true);

                SessionManager.updateRoad({
                    hash: hash,
                    time: time,
                    duration: duration,
                    percent: percent,
                    source: event.source,
                    type: event.type
                });
            }
        }

        function getActiveSource() {
            return activeSource;
        }

        return {
            consume: consume,
            getActiveSource: getActiveSource
        };
    })();

    // ============================================================
    // DDDTransport
    // ============================================================

    var DDDTransport = (function () {
        var pollTimer = null;
        var activeSid = '';
        var lastTs = 0;
        var lastProbeResult = null;
        var lastPingAt = 0;
        var lastGoodAt = 0;
        var lastEventsError = '';
        var lastStateError = '';

        function baseUrl() {
            return CONFIG.dddHost.replace(/\/$/, '') + ':' + CONFIG.dddPort;
        }

        function baseUrls() {
            var urls = [];
            var primary = baseUrl();

            function add(url) {
                if (!url) return;
                if (urls.indexOf(url) === -1) urls.push(url);
            }

            add(primary);

            if (primary.indexOf('127.0.0.1') !== -1) {
                add(primary.replace('127.0.0.1', 'localhost'));
            }
            else if (primary.indexOf('localhost') !== -1) {
                add(primary.replace('localhost', '127.0.0.1'));
            }

            return urls;
        }

        function withToken(params) {
            params = params || {};
            if (CONFIG.dddToken) params.token = CONFIG.dddToken;
            return params;
        }

        function endpointFromBase(base, path, params) {
            params = withToken(params || {});
            var query = Utils.encodeParams(params);
            return base + path + (query ? '?' + query : '');
        }

        function endpoint(path, params) {
            return endpointFromBase(baseUrl(), path, params);
        }

        function endpointList(path, variants) {
            var result = [];
            var bases = baseUrls();

            variants = variants && variants.length ? variants : [{}];

            bases.forEach(function (base) {
                variants.forEach(function (params) {
                    result.push(endpointFromBase(base, path, params));
                });
            });

            return result;
        }

        function parseJsonMaybe(value) {
            if (value === null || value === undefined) return null;
            if (typeof value === 'object') return value;

            try {
                return JSON.parse(String(value));
            } catch (e) {
                return null;
            }
        }

        function fetchWithBrowserFetch(url, timeoutMs, call) {
            var finished = false;
            var timer = null;
            var controller = null;

            function done(err, json) {
                if (finished) return;
                finished = true;
                if (timer) clearTimeout(timer);
                call(err, json);
            }

            timer = setTimeout(function () {
                try {
                    if (controller) controller.abort();
                } catch (e) {}
                done(new Error('fetch timeout'), null);
            }, timeoutMs);

            try {
                if (window.AbortController) controller = new AbortController();
            } catch (e1) {}

            try {
                fetch(url, controller ? { signal: controller.signal } : {})
                    .then(function (res) {
                        if (!res || !res.ok) throw new Error('fetch HTTP ' + (res ? res.status : 0));
                        return res.json();
                    })
                    .then(function (json) {
                        done(null, json);
                    })
                    .catch(function (err) {
                        done(err || new Error('fetch failed'), null);
                    });
            } catch (e2) {
                done(e2, null);
            }
        }

        function fetchWithXhr(url, timeoutMs, call) {
            var xhr;

            try {
                xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = timeoutMs;
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;

                    if (xhr.status >= 200 && xhr.status < 300) {
                        var json = parseJsonMaybe(xhr.responseText);
                        if (!json) return call(new Error('xhr invalid json'), null);
                        return call(null, json);
                    }

                    call(new Error('xhr HTTP ' + xhr.status), null);
                };
                xhr.onerror = function () {
                    call(new Error('xhr network error'), null);
                };
                xhr.ontimeout = function () {
                    call(new Error('xhr timeout'), null);
                };
                xhr.send(null);
            } catch (e) {
                call(e, null);
            }
        }

        function fetchWithLampaNative(url, timeoutMs, call) {
            try {
                if (!Utils.isAndroidPlatform()) return call(new Error('native skipped: not android'), null);
                if (!Lampa.Android || !Lampa.Android.httpReq) return call(new Error('native skipped: Lampa.Android.httpReq missing'), null);

                Lampa.Android.httpReq({
                    url: url,
                    dataType: 'json',
                    timeout: timeoutMs,
                    attempts: 0
                }, {
                    complite: function (data) {
                        var json = parseJsonMaybe(data);
                        if (!json) return call(new Error('native invalid json'), null);
                        call(null, json);
                    },
                    error: function (err) {
                        call(new Error(
                            (err && (err.decode_error || err.responseText || err.message || err.status)) ||
                            'native http error'
                        ), null);
                    }
                });
            } catch (e) {
                call(e, null);
            }
        }

        function fetchJson(url, call) {
            var timeoutMs = CONFIG.dddFetchTimeoutMs;
            var errors = [];

            fetchWithBrowserFetch(url, timeoutMs, function (fetchErr, fetchJsonResult) {
                if (!fetchErr && fetchJsonResult) return call(null, fetchJsonResult);
                errors.push(fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr || 'fetch failed'));

                fetchWithXhr(url, timeoutMs, function (xhrErr, xhrJsonResult) {
                    if (!xhrErr && xhrJsonResult) return call(null, xhrJsonResult);
                    errors.push(xhrErr && xhrErr.message ? xhrErr.message : String(xhrErr || 'xhr failed'));

                    fetchWithLampaNative(url, timeoutMs, function (nativeErr, nativeJsonResult) {
                        if (!nativeErr && nativeJsonResult) return call(null, nativeJsonResult);
                        errors.push(nativeErr && nativeErr.message ? nativeErr.message : String(nativeErr || 'native failed'));

                        call(new Error(errors.join(' | ')), null);
                    });
                });
            });
        }

        function fetchFirstJson(urls, label, call) {
            var index = 0;
            var errors = [];

            function next() {
                if (index >= urls.length) {
                    return call(new Error(errors.join(' || ') || 'all requests failed'), null);
                }

                var url = urls[index++];

                fetchJson(url, function (err, json) {
                    if (!err && json) {
                        if (DEBUG.pollSuccess) Utils.log('DDD ' + label + ' ok', url);
                        lastGoodAt = Utils.now();
                        return call(null, json);
                    }

                    errors.push(url + ' => ' + (err && err.message ? err.message : err));
                    next();
                });
            }

            next();
        }

        function canUse() {
            return Utils.shouldUseDDDLayer();
        }

        function appendToUrl(url, sid) {
            if (!url || typeof url !== 'string') return url;

            return Utils.appendFragmentParams(url, {
                ddd_mode: CONFIG.dddMode || 'local',
                ddd_sid: sid,
                ddd_port: CONFIG.dddPort,
                ddd_client: CONFIG.dddClient,
                ddd_token: CONFIG.dddToken || ''
            });
        }

        function applyBridgeExtras(data, session) {
            if (!data || !session || !session.sid) return data;

            data.bridge_enabled = true;
            data.bridge_session_id = session.sid;
            data.bridge_client = CONFIG.dddClient;
            data.bridge_mode = CONFIG.dddMode || 'local';
            data.bridge_emit_position = true;
            data.bridge_emit_user_actions = true;
            data.bridge_position_interval_ms = 1000;
            data.bridge_schema_version = 1;
            data.bridge_local_port = CONFIG.dddPort;

            if (CONFIG.dddToken) data.bridge_local_token = CONFIG.dddToken;

            data.ddd_sid = session.sid;
            data.ddd_mode = CONFIG.dddMode || 'local';
            data.ddd_port = CONFIG.dddPort;
            data.ddd_client = CONFIG.dddClient;
            if (CONFIG.dddToken) data.ddd_token = CONFIG.dddToken;

            return data;
        }

        function applyBridgeToPlaylist(data, session) {
            if (!data || !session || !session.sid) return data;
            if (!Array.isArray(data.playlist) || !data.playlist.length) return data;

            var startIndex = Number(
                data.start_index !== undefined ? data.start_index :
                data.playlist_index !== undefined ? data.playlist_index :
                session.playlistIndex !== undefined ? session.playlistIndex :
                session.startIndex !== undefined ? session.startIndex :
                0
            );

            if (isNaN(startIndex) || startIndex < 0) startIndex = 0;
            if (startIndex >= data.playlist.length) startIndex = data.playlist.length - 1;

            data.start_index = startIndex;
            data.playlist_index = startIndex;

            var patchedCount = 0;

            data.playlist.forEach(function (item) {
                if (!item || typeof item !== 'object') return;

                var url = item.url || item.uri || item.src || '';
                if (!url || typeof url !== 'string') return;
                if (!Utils.isStreamUrl(url)) return;

                var patched = appendToUrl(url, session.sid);

                if (item.url !== undefined) item.url = patched;
                else if (item.uri !== undefined) item.uri = patched;
                else if (item.src !== undefined) item.src = patched;

                patchedCount++;
            });

            if (patchedCount) {
                Utils.log('DDD playlist bridge applied', 'sid=' + session.sid, 'start=' + startIndex, 'items=' + patchedCount);
                Utils.noty('DDD playlist bridge: start=' + startIndex + ' items=' + patchedCount, false, 2);
            }

            return data;
        }

        function activate(session) {
            if (!session || !session.sid) return;
            if (!canUse()) return;

            activeSid = session.sid;
            lastTs = 0;
            lastPingAt = 0;
            lastGoodAt = 0;
            lastEventsError = '';
            lastStateError = '';

            Utils.log('DDD activate', activeSid, session.url || '');
            Utils.noty('DDD: activate ' + activeSid, true, 1);

            startPolling();
        }

        function normalizeBridgeEvent(event) {
            if (!event || typeof event !== 'object') return null;

            var payload = event.payload || {};
            var rawType = event.type || payload.type || '';
            var type = '';
            var time = 0;
            var duration = 0;
            var playlistIndex = payload.windowIndex;

            if (playlistIndex === undefined || playlistIndex === null) playlistIndex = payload.index;

            if (rawType === 'session_started') type = 'start';
            else if (rawType === 'position_tick') type = 'time';
            else if (rawType === 'playback_state_changed') type = payload.isPlaying ? 'play' : 'pause';
            else if (rawType === 'seek_completed') type = 'time';
            else if (rawType === 'playlist_item_changed') type = 'playlist_item_changed';
            else if (rawType === 'before_playlist_item_changed') type = 'before_playlist_item_changed';
            else if (rawType === 'playback_ended') type = 'ended';
            else if (rawType === 'session_finished') type = 'stop';
            else if (rawType === 'error') type = 'error';
            else return null;

            if (rawType === 'seek_completed') time = Utils.msToSeconds(payload.toPosition || payload.position || 0);
            else time = Utils.msToSeconds(payload.position || 0);

            duration = Utils.msToSeconds(payload.duration || 0);

            return {
                source: 'ddd',
                type: type,
                rawType: rawType,
                sid: event.sessionId || payload.sessionId || activeSid,
                ts: event.ts || payload.ts || Utils.now(),
                url: payload.uri || (payload.currentItem && (payload.currentItem.uri || payload.currentItem.url)) || '',
                title: payload.title || (payload.currentItem && payload.currentItem.title) || '',
                time: time,
                duration: duration,
                percent: duration ? Math.round(time / duration * 100) : 0,
                playlist_index: playlistIndex !== undefined && playlistIndex !== null ? Number(playlistIndex) : undefined,
                reason: payload.reason || payload.endBy || payload.end_by || '',
                currentItem: payload.currentItem || null,
                rawPayload: payload,
                force: rawType === 'session_finished' || rawType === 'playback_ended' || rawType === 'error' || payload.reason === 'pause' || payload.reason === 'background' || payload.reason === 'destroy' || payload.reason === 'user_exit' || payload.reason === 'before_playlist_item_changed'
            };
        }

        function handleBridgeEvent(event) {
            var normalized = normalizeBridgeEvent(event);
            if (!normalized) return;

            Utils.log('DDD event', normalized.rawType, 'idx=' + normalized.playlist_index, 't=' + normalized.time, normalized.title || '');

            if (normalized.playlist_index !== undefined && normalized.playlist_index !== null) {
                SessionManager.updateByPlaylistIndex(normalized.playlist_index, normalized.rawPayload || normalized);
            }

            normalized.session = SessionManager.getCurrent();

            Core.consume(normalized);
        }

        function eventParamVariants() {
            var limit = CONFIG.dddEventsLimit;
            var since = lastTs || 0;

            return [
                { sid: activeSid, since: since, limit: limit },
                { sessionId: activeSid, since: since, limit: limit },
                { session_id: activeSid, since: since, limit: limit },
                { sid: activeSid, limit: limit },
                { sessionId: activeSid, limit: limit },
                { session_id: activeSid, limit: limit },
                { sid: activeSid },
                { sessionId: activeSid },
                { session_id: activeSid },
                {}
            ];
        }

        function stateParamVariants() {
            return [
                { sid: activeSid },
                { sessionId: activeSid },
                { session_id: activeSid },
                {}
            ];
        }

        function pollEvents() {
            if (!activeSid) return;

            fetchFirstJson(endpointList('/events', eventParamVariants()), 'events', function (err, json) {
                if (err || !json || json.ok === false || !Array.isArray(json.events)) {
                    lastEventsError = err && err.message ? err.message : (json ? 'bad events response' : 'empty events response');
                    if (DEBUG.pollFail) Utils.warn('DDD events poll failed', lastEventsError);
                    return;
                }

                if (DEBUG.pollSuccess) Utils.noty('DDD events: ' + json.events.length, false, 3);

                json.events.sort(function (a, b) {
                    return Number(a.ts || 0) - Number(b.ts || 0);
                });

                json.events.forEach(function (event) {
                    if (event && event.ts) lastTs = Math.max(lastTs, Number(event.ts || 0));
                    handleBridgeEvent(event);
                });
            });
        }

        function pollState() {
            if (!activeSid) return;

            fetchFirstJson(endpointList('/state', stateParamVariants()), 'state', function (err, json) {
                if (err || !json || json.ok === false || !json.state) {
                    lastStateError = err && err.message ? err.message : (json ? 'bad state response' : 'empty state response');
                    if (DEBUG.pollFail) Utils.warn('DDD state poll failed', lastStateError);
                    return;
                }

                if (DEBUG.pollSuccess) Utils.noty('DDD state: ok', false, 3);

                var event = json.state.lastEvent || json.state.event || null;
                if (!event) return;

                if (event.ts && event.ts <= lastTs) return;
                if (event.ts) lastTs = Math.max(lastTs, Number(event.ts || 0));

                handleBridgeEvent(event);
            });
        }

        function pollPing(force) {
            var current = Utils.now();
            if (!force && current - lastPingAt < 5000) return;
            lastPingAt = current;

            fetchFirstJson(endpointList('/ping', [{}]), 'ping', function (err, json) {
                lastProbeResult = {
                    ok: !err && !!json && json.ok !== false,
                    error: err ? String(err.message || err) : '',
                    json: json || null,
                    time: Utils.now()
                };

                if (DEBUG.pollSuccess || force) {
                    Utils.noty(lastProbeResult.ok ? 'DDD ping: ok' : 'DDD ping: fail ' + lastProbeResult.error, true, lastProbeResult.ok ? 2 : 0);
                }
            });
        }

        function pollCycle() {
            if (!activeSid) return;

            pollPing(false);
            pollState();
            pollEvents();
        }

        function startPolling() {
            if (pollTimer) clearInterval(pollTimer);

            pollCycle();

            pollTimer = setInterval(function () {
                pollCycle();
            }, CONFIG.dddPollIntervalMs);
        }

        function stopPolling() {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
            activeSid = '';
            Utils.log('DDD polling stopped');
        }

        function probe(force) {
            pollPing(!!force);
        }

        function getStatus() {
            return {
                activeSid: activeSid,
                lastTs: lastTs,
                lastProbeResult: lastProbeResult,
                lastEventsError: lastEventsError,
                lastStateError: lastStateError,
                lastGoodAt: lastGoodAt,
                canUse: canUse(),
                baseUrl: baseUrl(),
                baseUrls: baseUrls()
            };
        }

        return {
            canUse: canUse,
            appendToUrl: appendToUrl,
            applyBridgeExtras: applyBridgeExtras,
            applyBridgeToPlaylist: applyBridgeToPlaylist,
            activate: activate,
            stopPolling: stopPolling,
            probe: probe,
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
            if (event.data) return event.data;
            return event;
        }

        function handlePlayerCreate(event) {
            if (!CONFIG.nativePlayerEventsEnabled) return;

            var data = getDataFromEvent(event);
            if (!data || !data.url) return;

            var session = SessionManager.getCurrent();

            if (!session || Utils.streamIdentity(session.url) !== Utils.streamIdentity(data.url)) {
                var options = { source: 'lampa' };

                if (session) {
                    if ((!data.playlist || !data.playlist.length) && session.playlist && session.playlist.length) {
                        options.playlist = session.playlist;
                    }

                    if (!data.card && !data.movie && !data.card_data && !data.data && session.movie) {
                        options.movie = session.movie;
                    }
                }

                session = SessionManager.buildFromPlayData(data, options);
            }

            if (session) {
                Core.consume({
                    source: 'lampa',
                    type: 'start',
                    session: session,
                    hash: session.hash,
                    url: session.url,
                    title: session.title,
                    force: true
                });
            }
        }

        function handlePlayerDestroy() {
            if (!CONFIG.nativePlayerEventsEnabled) return;

            var session = SessionManager.getCurrent();
            if (!session || !session.lastRoad) return;

            Core.consume({
                source: 'lampa',
                type: 'stop',
                session: session,
                hash: session.lastRoad.hash || session.hash,
                time: session.lastRoad.time || 0,
                duration: session.lastRoad.duration || 0,
                percent: session.lastRoad.percent || 0,
                force: true,
                reason: 'destroy'
            });
        }

        function timelineBelongsToSession(hash, session) {
            if (!hash || !session) return false;
            if (String(hash) === String(session.hash)) return true;
            if (SessionManager.getByHash(hash)) return true;
            return false;
        }

        function handleTimelineUpdate(event) {
            if (!CONFIG.nativeTimelineEnabled) return;

            var data = event && event.data ? event.data : event;
            if (!data || !data.hash || !data.road) return;

            var hash = data.hash;
            var road = data.road || {};
            var session = SessionManager.getCurrent();

            if (session && String(hash) !== String(session.hash || '') && SessionManager.hasHash(hash)) {
                session = SessionManager.updateByTimelineHash(hash, {
                    time: road.time,
                    duration: road.duration,
                    percent: road.percent,
                    reason: 'timeline_hash_switch'
                }) || session;
            }

            if (!session) session = SessionManager.getByHash(hash);

            if (!timelineBelongsToSession(hash, session)) return;

            lastTimelineHash = hash;

            if (CONFIG.saveNativeTimelineToCustomStorage) {
                Core.consume({
                    source: 'lampa',
                    type: 'time',
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

        function installPlayerListeners() {
            if (!Lampa.Player || !Lampa.Player.listener || !Lampa.Player.listener.follow) return;

            try {
                Lampa.Player.listener.follow('create', handlePlayerCreate);
                Lampa.Player.listener.follow('start', handlePlayerCreate);
                Lampa.Player.listener.follow('ready', handlePlayerCreate);
                Lampa.Player.listener.follow('destroy', handlePlayerDestroy);
            } catch (e) {
                Utils.error('Native player listener failed', e);
            }
        }

        function installTimelineListener() {
            if (!Lampa.Timeline || !Lampa.Timeline.listener || !Lampa.Timeline.listener.follow) return;

            try {
                Lampa.Timeline.listener.follow('update', handleTimelineUpdate);
            } catch (e) {
                Utils.error('Native timeline listener failed', e);
            }
        }

        function init() {
            if (installed) return;
            installed = true;

            installPlayerListeners();
            installTimelineListener();
        }

        function getStatus() {
            return {
                installed: installed,
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

        function patchPlayer() {
            if (patched) return;
            if (!Lampa.Player || !Lampa.Player.play) return;
            if (Lampa.Player.__continueWatchUniversalPatched) {
                patched = true;
                return;
            }

            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (data) {
                try {
                    data = data || {};

                    var session = SessionManager.buildFromPlayData(data, { source: 'player_patch' });

                    if (session) {
                        Core.consume({
                            source: 'lampa',
                            type: 'start',
                            session: session,
                            hash: session.hash,
                            url: session.url,
                            title: session.title,
                            force: true
                        });

                        if (DDDTransport.canUse() && Utils.isStreamUrl(data.url)) {
                            DDDTransport.applyBridgeExtras(data, session);
                            DDDTransport.applyBridgeToPlaylist(data, session);
                            data.url = DDDTransport.appendToUrl(data.url, session.sid);
                            session.url = Utils.stripFragment(data.url);
                            session.params = SessionManager.buildParams(session);
                            SessionManager.register(session);
                            DDDTransport.activate(session);

                            Utils.log('DDD transport selected', session.sid, data.url);
                        } else {
                            Utils.log('Lampa native transport selected', Utils.getPlatformKind(), Utils.getTorrentPlayerType());
                        }
                    }
                } catch (e) {
                    Utils.error('Player patch failed', e);
                }

                return originalPlay.apply(this, arguments);
            };

            Lampa.Player.__continueWatchUniversalPatched = true;
            patched = true;
        }

        function launchFromContinue(movie, params) {
            if (!movie || !params) return;

            var url = StorageManager.buildStreamUrl(params);
            if (!url) return;

            var season = Number(params.season || 0);
            var episode = Number(params.episode || 0);
            var hash = StorageManager.generateTimelineHash(movie, season, episode);
            var timeline = hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null;

            if (timeline && params.time && (!timeline.time || Number(params.time) > Number(timeline.time || 0))) {
                timeline.time = Number(params.time || 0);
                timeline.duration = Number(params.duration || 0);
                timeline.percent = Number(params.percent || 0);
            }

            var playlist = Array.isArray(params.playlist) ? params.playlist.map(function (item) {
                var clone = Utils.shallowClone(item);
                if (clone.url) clone.url = StorageManager.rebuildStreamUrl(clone.url);
                return clone;
            }) : null;

            var data = {
                url: url,
                title: params.episode_title || params.title || Utils.getMovieTitle(movie),
                card: movie,
                timeline: timeline,
                playlist: playlist,
                playlist_index: Number(params.playlist_index || params.file_index || 0),
                season: season,
                episode: episode,
                torrent_hash: params.torrent_link || '',
                continue_watch_universal: true
            };

            try {
                Lampa.Player.play(data);
            } catch (e) {
                Utils.error('Launch from continue failed', e);
            }
        }

        return {
            patchPlayer: patchPlayer,
            launchFromContinue: launchFromContinue
        };
    })();

    // ============================================================
    // UIManager
    // ============================================================

    var UIManager = (function () {
        var installed = false;

        function removeContinueButtons(render) {
            try {
                render.find('.button--continue-watch-ddd').remove();
                render.find('.button--continue-watch-ddd-debug').remove();
            } catch (e) {}
        }

        function escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function formatContinueDetails(params) {
            if (!params) return '';

            var parts = [];
            var season = Number(params.season || 0);
            var episode = Number(params.episode || 0);
            var isTv = params.media_type === 'tv' || season || episode;

            if (isTv && season && episode) {
                parts.push('S' + season + 'E' + episode);
            }
            else if (isTv && episode) {
                parts.push('E' + episode);
            }

            if (params.time) {
                parts.push(Utils.formatSeconds(params.time));
            }

            return parts.join(' · ');
        }

        function createButton(movie, params) {
            var details = formatContinueDetails(params);
            var label = 'Продолжить просмотр' + (details ? ' · ' + details : '');

            var html = '' +
                '<div class="full-start__button selector button--continue-watch-ddd" title="' + escapeHtml(label) + '">' +
                    '<span>' + escapeHtml(label) + '</span>' +
                '</div>';

            var button = $(html);

            button.off('hover:enter.continueWatchUniversal click.continueWatchUniversal').on('hover:enter.continueWatchUniversal click.continueWatchUniversal', function () {
                PlayerManager.launchFromContinue(movie, StorageManager.getLastStreamParams(movie));
            });

            return button;
        }

        function createStatusButton(movie) {
            var html = '' +
                '<div class="full-start__button selector button--continue-watch-ddd-debug">' +
                    '<span>CW статус</span>' +
                '</div>';

            var button = $(html);

            button.off('hover:enter.continueWatchUniversalDebug').on('hover:enter.continueWatchUniversalDebug', function () {
                var params = StorageManager.getLastStreamParams(movie);
                var ddd = DDDTransport.getStatus();
                var nativeStatus = LampaNativeTransport.getStatus();
                var session = SessionManager.getCurrent();

                Utils.noty(
                    'platform=' + Utils.getPlatformKind() +
                    ' player=' + Utils.getTorrentPlayerType() +
                    ' source=' + Core.getActiveSource() +
                    ' ddd=' + (ddd.canUse ? 'yes' : 'no'),
                    true,
                    0
                );

                setTimeout(function () {
                    Utils.noty(
                        'hist=' + (params ? 'S' + (params.season || 0) + 'E' + (params.episode || 0) : 'none') +
                        ' sess=' + (session ? session.sid : 'none') +
                        ' tl=' + (nativeStatus.lastTimelineHash || '-'),
                        true,
                        0
                    );
                }, 700);

                try { DDDTransport.probe(true); } catch (e) {}
            });

            return button;
        }

        function insertAfterBestPlace(render, button) {
            var torrentButton = render.find('.view--torrent').last();
            var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

            if (torrentButton.length) torrentButton.after(button);
            else if (buttonsContainer.length) buttonsContainer.append(button);
            else render.find('.full-start__button').last().after(button);
        }

        function install() {
            if (installed) return;
            installed = true;

            Lampa.Listener.follow('full', function (event) {
                if (!event || event.type !== 'complite') return;

                requestAnimationFrame(function () {
                    try {
                        var activity = event.object && event.object.activity;
                        var render = activity && activity.render ? activity.render() : null;
                        var movie = event.data && event.data.movie;

                        if (!render || !movie) return;

                        var params = StorageManager.getLastStreamParams(movie);
                        if (!params) return;

                        removeContinueButtons(render);

                        var button = createButton(movie, params);
                        insertAfterBestPlace(render, button);

                        if (DEBUG.enabled && DEBUG.statusButton && DEBUG.noty) {
                            var debugButton = createStatusButton(movie);
                            render.find('.button--continue-watch-ddd').after(debugButton);
                        }
                    } catch (e) {
                        Utils.error('Button render failed', e);
                    }
                });
            });
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
            LampaNativeTransport.init();

            Utils.log(
                'Transport init',
                'platform=' + Utils.getPlatformKind(),
                'player_torrent=' + Utils.getTorrentPlayerType(),
                'ddd=' + (DDDTransport.canUse() ? 'enabled' : 'disabled')
            );
        }

        return {
            init: init
        };
    })();

    // ============================================================
    // Public debug API
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
                shouldUseDDD: Utils.shouldUseDDDLayer,
                parseStreamUrl: Utils.parseStreamUrl
            },
            storage: {
                get: StorageManager.getParams,
                last: StorageManager.getLastStreamParams,
                cleanup: StorageManager.cleanupOld
            },
            session: {
                current: SessionManager.getCurrent
            },
            ddd: {
                status: DDDTransport.getStatus,
                probe: DDDTransport.probe,
                stop: DDDTransport.stopPolling
            },
            native: {
                status: LampaNativeTransport.getStatus
            }
        };

        window.ContinueWatchDDD = window.ContinueWatchUniversal;
    }

    // ============================================================
    // Init
    // ============================================================

    function init() {
        try {
            Utils.noty('loaded ' + PLUGIN_VERSION, false, 1);
            Utils.log('Init', PLUGIN_VERSION);

            StorageManager.ensureSync();
            TransportManager.init();
            PlayerManager.patchPlayer();
            UIManager.install();
            exposeApi();

            setTimeout(function () {
                StorageManager.cleanupOld();
            }, 10000);

            window.__CONTINUE_WATCH_DDD_LAYER_V3_READY__ = true;
            window.__CONTINUE_WATCH_DDD_LAYER_V3_LOADING__ = false;
            window.__CONTINUE_WATCH_DDD_LAYER_V3_VERSION__ = PLUGIN_VERSION;
            window.__CONTINUE_WATCH_TRANSPORT_NEUTRAL_READY__ = true;
        } catch (e) {
            window.__CONTINUE_WATCH_DDD_LAYER_V3_READY__ = false;
            window.__CONTINUE_WATCH_DDD_LAYER_V3_LOADING__ = false;
            window.__CONTINUE_WATCH_DDD_LAYER_V3_VERSION__ = PLUGIN_VERSION + ':init-error';
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
            if (event && event.type === 'ready') {
                StorageManager.setAccountReady(true);
                init();
            }
        });
    }

    // ============================================================
    // Global button dedup
    // ============================================================

    (function () {
        var scheduled = false;

        function dedupContinueWatchButtons() {
            try {
                var buttons = $('.button--continue-watch-ddd');
                if (buttons.length <= 1) return;
                buttons.slice(1).remove();
            } catch (e) {}
        }

        function scheduleDedup() {
            if (scheduled) return;
            scheduled = true;

            requestAnimationFrame(function () {
                scheduled = false;
                dedupContinueWatchButtons();
            });
        }

        try {
            Lampa.Listener.follow('full', function (event) {
                if (!event || event.type !== 'complite') return;
                scheduleDedup();
                setTimeout(dedupContinueWatchButtons, 300);
            });
        } catch (e) {}
    })();
})();
