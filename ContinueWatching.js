(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__CONTINUE_WATCH_DDD_LAYER_V3__) return;
    window.__CONTINUE_WATCH_DDD_LAYER_V3__ = true;

    /**
     * ContinueWatch + DDD Local Bridge
     *
     * Цель:
     * - использовать штатные механизмы Lampa: Player, Timeline, playlist;
     * - не конкурировать с системой истории Lampa;
     * - сохранять только минимальные stream-параметры для повторного запуска TorrServer stream;
     * - не привязывать сохранённые записи к старому TorrServer host;
     * - корректно работать с anime-case, где TMDB/Lampa/раздача могут расходиться по S/E;
     * - не портить playlist пустыми/непроверенными данными bridge layer.
     */

    var PLUGIN_NAME = 'ContinueWatchDDD';
    var PLUGIN_VERSION = 'v3.1.2-button-global-dedup-20260511';

    /**
     * Диагностика.
     *
     * Для проверки сейчас включено.
     * После теста можно вернуть false.
     */
    //var DDD_DEBUG = true;
    var DDD_DEBUG = false;

    var CONFIG = {
        storageBaseKey: 'continue_watch_params',
        sessionStorageKey: 'continue_watch_ddd_session',

        cleanupAgeMs: 60 * 24 * 60 * 60 * 1000,
        debounceDelayMs: 1000,

        dddEnabled: true,
        dddHost: 'http://127.0.0.1',
        dddPort: 39677,
        dddClient: 'lampa',

        dddPollIntervalMs: 4000,
        dddFetchTimeoutMs: 2500,
        dddTimelineSaveIntervalMs: 5000,

        minSaveSeconds: 8,
        minDurationSeconds: 60,
        finishPercent: 90,

        debugConsole: false,
        debugNoty: false,
        debugNotyLevel: 0,
        debugNotyMinIntervalMs: 1500,
        debugNotyPollSuccess: false,
        debugNotyPollFail: false,
        debugStatusButton: false,

        /**
         * true:
         * DDD-слой добавляется только для внешнего torrent-плеера.
         *
         * false:
         * DDD-слой добавляется всегда, если URL похож на TorrServer stream.
         */
        onlyExternalTorrentPlayer: true
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
        
        function showConsole(method, args) {}
        
        function showNoty(message, level, force) {}
        
        function log() {}
        
        function warn() {}
        
        function error() {}
        
        function noty(message, force, level) {}
        
                function stripFragment(url) {
                    if (typeof url !== 'string') return url;
        
                    var pos = url.indexOf('#');
                    return pos >= 0 ? url.substring(0, pos) : url;
                }
        
                function isStreamUrl(url) {
                    return typeof url === 'string' && url.indexOf('/stream/') !== -1;
                }
        
                function encodeParams(params) {
                    var result = [];
        
                    Object.keys(params).forEach(function (key) {
                        if (params[key] === undefined || params[key] === null) return;
        
                        result.push(
                            encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]))
                        );
                    });
        
                    return result.join('&');
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

            if (h > 0) {
                return h + ':' + pad2(m) + ':' + pad2(s);
            }

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

        function isExternalTorrentPlayer() {
            try {
                var type = Lampa.Storage.field('player_torrent');

                if (type === 'inner') return false;
                if (type === 'lampa') return false;

                return true;
            } catch (e) {
                return true;
            }
        }

        function shouldUseDDDLayer() {
            if (!CONFIG.dddEnabled) return false;
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

            if (!parsed) {
                return stripFragment(url || '');
            }

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

        function isJapaneseSeries(obj) {
            obj = obj || {};

            var card = obj.card || obj.movie || obj.data || obj;
            var lang = getOriginalLanguage(card);

            if (lang !== 'ja') return false;

            return !!(
                card.original_name ||
                card.name ||
                card.media_type === 'tv' ||
                card.number_of_seasons !== undefined ||
                card.first_air_date
            );
        }

        function getStreamFileNameFromData(data) {
            if (!data) return '';

            var url = data.url || data.uri || data.src || '';

            if (url && typeof url === 'string') {
                var parsed = parseStreamUrl(url);

                if (parsed && parsed.file_name) {
                    return parsed.file_name;
                }
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

                /*
                 * Anime-case:
                 * [SubsPlus+] Oshi No Ko S2 - 10
                 * Title S2 10
                 */
                m = text.match(/\bS\s*0?(\d{1,2})\s*[-_. ]+\s*0?(\d{1,3})\b/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10),
                        source: 'text_s_dash_e'
                    };
                }

                /*
                 * S2E10 / S02E010
                 */
                m = text.match(/\bS(?:eason)?\s*0?(\d{1,2})\s*[\.\-_: ]*\s*E(?:p(?:isode)?)?\s*0?(\d{1,3})\b/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10),
                        source: 'text_sxe'
                    };
                }

                /*
                 * 2x10 / 2х10 / 2×10
                 */
                m = text.match(/\b0?(\d{1,2})\s*[xх×]\s*0?(\d{1,3})\b/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10),
                        source: 'text_1x02'
                    };
                }

                /*
                 * Oshi no Ko 2nd Season - 10
                 */
                m = text.match(/\b0?(\d{1,2})(?:st|nd|rd|th)?\s+season\s*[-_.: ]+\s*0?(\d{1,3})\b/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10),
                        source: 'text_nth_season_dash_e'
                    };
                }

                /*
                 * Season 2 Episode 10
                 */
                m = text.match(/season\s*0?(\d{1,2}).*?(?:episode|ep\.?)\s*0?(\d{1,3})/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10),
                        source: 'text_season_episode'
                    };
                }

                /*
                 * 2 сезон 10 серия
                 */
                m = text.match(/0?(\d{1,2})\s*сезон.*?0?(\d{1,3})\s*сер/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10),
                        source: 'text_ru_season_episode'
                    };
                }

                /*
                 * Японский вариант: 第10話
                 */
                m = text.match(/第\s*0?(\d{1,3})\s*話/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return {
                        season: fallbackSeason,
                        episode: parseInt(m[1], 10),
                        source: 'text_ja_episode_only'
                    };
                }

                /*
                 * Episode 10 / Ep.10 / Серия 10
                 */
                m = text.match(/(?:эпизод|сер(?:ия|ии|и)?|episode|ep\.?|сер\.)\s*[-–—:]?\s*0?(\d{1,3})/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return {
                        season: fallbackSeason,
                        episode: parseInt(m[1], 10),
                        source: 'text_episode_only'
                    };
                }

                /*
                 * Anime-only fallback:
                 * Title - 10
                 */
                m = text.match(/\s[-–—]\s0?(\d{1,3})(?:\s|$|\.|\[|\()/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return {
                        season: fallbackSeason,
                        episode: parseInt(m[1], 10),
                        source: 'text_dash_episode_only'
                    };
                }

                /*
                 * Filename ending:
                 * Title 10.mkv / Title - 10.mkv
                 */
                m = text.match(/(?:^|[\s._\-\[\(])0?(\d{1,3})(?:\s*(?:v\d+)?\s*(?:\[[^\]]+\]|\([^)]+\))*)?\.(?:mkv|mp4|avi|ts)$/i);
                if (m && allowEpisodeOnly && fallbackSeason) {
                    return {
                        season: fallbackSeason,
                        episode: parseInt(m[1], 10),
                        source: 'text_filename_episode_only'
                    };
                }

                return null;
            }

            function parseFields() {
                if (data && data.season !== undefined && data.episode !== undefined) {
                    var s = Number(data.season || 0);
                    var e = Number(data.episode || 0);

                    if (s && e) {
                        return {
                            season: s,
                            episode: e,
                            source: 'fields_season_episode'
                        };
                    }
                }

                if (data && data.season_number !== undefined && data.episode_number !== undefined) {
                    var ss = Number(data.season_number || 0);
                    var ee = Number(data.episode_number || 0);

                    if (ss && ee) {
                        return {
                            season: ss,
                            episode: ee,
                            source: 'fields_season_number_episode_number'
                        };
                    }
                }

                if (data && data.s !== undefined && data.e !== undefined) {
                    var s2 = Number(data.s || 0);
                    var e2 = Number(data.e || 0);

                    if (s2 && e2) {
                        return {
                            season: s2,
                            episode: e2,
                            source: 'fields_s_e'
                        };
                    }
                }

                return null;
            }

            function parseTexts() {
                var fields = [];

                if (data) {
                    fields.push(
                        getStreamFileNameFromData(data),
                        data.file_name,
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

            return {
                season: 0,
                episode: 0,
                source: ''
            };
        }

        return {
            log: log,
            warn: warn,
            error: error,
            noty: noty,
            now: now,
            stripFragment: stripFragment,
            isStreamUrl: isStreamUrl,
            encodeParams: encodeParams,
            formatSeconds: formatSeconds,
            msToSeconds: msToSeconds,
            clamp: clamp,
            safeJson: safeJson,
            safeDecode: safeDecode,
            normalizeText: normalizeText,
            isExternalTorrentPlayer: isExternalTorrentPlayer,
            shouldUseDDDLayer: shouldUseDDDLayer,
            parseStreamUrl: parseStreamUrl,
            streamIdentity: streamIdentity,
            extractSE: extractSE,
            getOriginalLanguage: getOriginalLanguage,
            getMovieTitle: getMovieTitle,
            isJapaneseSeries: isJapaneseSeries,
            getStreamFileNameFromData: getStreamFileNameFromData
        };
    })();

    // ============================================================
    // StorageManager
    // ============================================================

    var StorageManager = (function () {
        var memoryCache = null;
        var activeStorageKey = null;
        var syncedStorageKey = null;
        var torrserverCache = null;
        var accountReady = !!window.appready;
        var saveTimer = null;

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

            if (profileId !== null && profileId !== undefined) {
                return CONFIG.storageBaseKey + '_' + profileId;
            }

            return CONFIG.storageBaseKey;
        }

        function getSessionStorageKey() {
            var profileId = getProfileId();

            if (profileId !== null && profileId !== undefined) {
                return CONFIG.sessionStorageKey + '_' + profileId;
            }

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

            if (!memoryCache || typeof memoryCache !== 'object') {
                memoryCache = {};
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

            if (force) {
                save();
            } else {
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
            if (!data.season || !data.episode) return;

            var movieKey = getMovieKeyFromData(data);
            if (!movieKey) return;

            if (!params.__last_by_movie) {
                params.__last_by_movie = {};
            }

            params.__last_by_movie[movieKey] = {
                hash: hash,
                season: Number(data.season || 0),
                episode: Number(data.episode || 0),
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

                /**
                 * Не затираем старые хорошие значения undefined-ом.
                 */
                if (value === undefined) return;

                if (old[key] !== value) {
                    old[key] = value;
                    changed = true;
                }
            });

            if (Array.isArray(data.playlist)) {
                /**
                 * Bridge/session-race не должен затирать полноценный сериаловый playlist
                 * пустым или одиночным списком.
                 */
                if (data.playlist.length >= 2) {
                    var oldJson = old.playlist ? Utils.safeJson(old.playlist) : '';
                    var newJson = Utils.safeJson(data.playlist);

                    if (oldJson !== newJson) {
                        old.playlist = data.playlist;
                        changed = true;
                    }
                }
            }

            if (forceTimestamp || changed || !old.timestamp) {
                old.timestamp = Utils.now();

                if (!old.original_timestamp) {
                    old.original_timestamp = old.timestamp;
                }

                updateLastPointer(params, old, hash);

                setParams(params, true);

                Utils.noty(
                    'saved S' + (old.season || 0) +
                    'E' + (old.episode || 0) +
                    ' fi=' + (old.file_index !== undefined ? old.file_index : '-') +
                    ' pi=' + (old.playlist_index !== undefined ? old.playlist_index : '-') +
                    ' pl=' + (old.playlist ? old.playlist.length : 0),
                    false,
                    2
                );

                Utils.log(
                    'Saved stream params',
                    hash,
                    'S' + (old.season || 0) + 'E' + (old.episode || 0),
                    old.episode_title || old.title || ''
                );

                return true;
            }

            return false;
        }

        function clearTorrServerCache() {
            torrserverCache = null;
        }

        function getTorrServerUrl() {
            try {
                var url1 = Lampa.Storage.get('torrserver_url');
                var url2 = Lampa.Storage.get('torrserver_url_two');
                var useTwo = Lampa.Storage.field('torrserver_use_link') === 'two';

                var url = useTwo ? (url2 || url1) : (url1 || url2);

                if (!url) {
                    torrserverCache = null;
                    return null;
                }

                url = String(url).trim();

                if (!url.match(/^https?:\/\//)) {
                    url = 'http://' + url;
                }

                url = url.replace(/\/$/, '');

                if (!/^https?:\/\/[^/]+/.test(url)) {
                    torrserverCache = null;
                    return null;
                }

                torrserverCache = url;
                return torrserverCache;
            } catch (e) {
                Utils.error('Invalid TorrServer URL', e);
                torrserverCache = null;
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
                try {
                    Lampa.Noty.show('TorrServer не настроен');
                } catch (e) {}
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

            /**
             * Повторяет формулу Lampa Timeline.watchedEpisode:
             * season > 10 ? ':' : ''
             */
            if (season > 0 && episode > 0) {
                var separator = season > 10 ? ':' : '';
                return Lampa.Utils.hash([season, separator, episode, originalTitle].join(''));
            }

            return Lampa.Utils.hash(originalTitle);
        }

        function getLastStreamParams(movie) {
            if (!movie) return null;

            var originalTitle = Utils.getMovieTitle(movie);
            var movieId = movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId;
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

            var episodes = Object.keys(params)
                .map(function (key) {
                    return params[key];
                })
                .filter(function (item) {
                    if (!item || typeof item !== 'object') return false;
                    if (!item.file_name || !item.torrent_link) return false;

                    var sameId = false;
                    var sameTitle = false;

                    if (movieId && item.movie_id) {
                        sameId = String(item.movie_id) === String(movieId);
                    }

                    if (originalTitle && item.original_title) {
                        sameTitle = String(item.original_title) === String(originalTitle);
                    }

                    if (originalTitle && item.original_name) {
                        sameTitle = sameTitle || String(item.original_name) === String(originalTitle);
                    }

                    if (originalTitle && item.title) {
                        sameTitle = sameTitle || String(item.title) === String(originalTitle);
                    }

                    return (sameId || sameTitle) && item.season && item.episode;
                })
                .sort(function (a, b) {
                    return (b.timestamp || 0) - (a.timestamp || 0);
                });

            if (episodes.length) return episodes[0];

            if (originalTitle) {
                var hash = Lampa.Utils.hash(originalTitle);
                return params[hash] || null;
            }

            return null;
        }

        function saveDDDSession(session) {
            if (!session || !session.sid) return;

            try {
                Lampa.Storage.set(getSessionStorageKey(), session);
            } catch (e) {
                Utils.error('Save DDD session failed', e);
            }
        }

        function getDDDSession() {
            try {
                return Lampa.Storage.get(getSessionStorageKey(), null);
            } catch (e) {
                return null;
            }
        }

        function cleanupOld() {
            try {
                var params = getParams();
                var current = Utils.now();
                var changed = false;

                Object.keys(params).forEach(function (hash) {
                    if (hash === '__last_by_movie') return;

                    var item = params[hash];

                    if (item && item.timestamp && current - item.timestamp > CONFIG.cleanupAgeMs) {
                        delete params[hash];
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

                if (changed) {
                    setParams(params, true);
                    Utils.log('Old records cleaned');
                }
            } catch (e) {
                Utils.error('Cleanup failed', e);
            }
        }

        function setAccountReady(value) {
            accountReady = !!value;
        }

        return {
            getParams: getParams,
            setParams: setParams,
            saveStreamParams: saveStreamParams,
            getLastStreamParams: getLastStreamParams,
            buildStreamUrl: buildStreamUrl,
            rebuildStreamUrl: rebuildStreamUrl,
            getTorrServerUrl: getTorrServerUrl,
            clearTorrServerCache: clearTorrServerCache,
            generateTimelineHash: generateTimelineHash,
            saveDDDSession: saveDDDSession,
            getDDDSession: getDDDSession,
            cleanupOld: cleanupOld,
            ensureSync: ensureSync,
            setAccountReady: setAccountReady,
            getMovieKey: getMovieKey,
            getMovieKeyFromData: getMovieKeyFromData
        };
    })();

    // ============================================================
    // PlaylistManager
    // ============================================================

    var PlaylistManager = (function () {
        function cloneItem(item) {
            var normalized = {};

            item = item || {};

            Object.keys(item).forEach(function (key) {
                normalized[key] = item[key];
            });

            return normalized;
        }

        function normalize(list) {
            if (!Array.isArray(list)) return null;

            var out = [];

            for (var i = 0; i < list.length; i++) {
                var item = list[i];

                if (!item || typeof item !== 'object') continue;
                if (!item.url || typeof item.url !== 'string') continue;

                var normalized = cloneItem(item);

                normalized.url = StorageManager.rebuildStreamUrl(item.url);
                normalized.title = item.title || item.name || item.episode_title || '';

                var parsed = Utils.parseStreamUrl(normalized.url);

                if (parsed) {
                    normalized.file_name = parsed.file_name;
                    normalized.torrent_link = parsed.torrent_link;
                    normalized.file_index = parsed.file_index;
                }

                if (item.season !== undefined) normalized.season = Number(item.season || 0);
                if (item.episode !== undefined) normalized.episode = Number(item.episode || 0);
                if (item.season_number !== undefined && normalized.season === undefined) normalized.season = Number(item.season_number || 0);
                if (item.episode_number !== undefined && normalized.episode === undefined) normalized.episode = Number(item.episode_number || 0);

                if (item.timeline && typeof item.timeline === 'object') {
                    normalized.timeline = {};

                    if (item.timeline.hash !== undefined) {
                        normalized.timeline.hash = String(item.timeline.hash);
                    }

                    if (item.timeline.time !== undefined) {
                        normalized.timeline.time = Number(item.timeline.time || 0);
                    }

                    if (item.timeline.duration !== undefined) {
                        normalized.timeline.duration = Number(item.timeline.duration || 0);
                    }

                    if (item.timeline.percent !== undefined) {
                        normalized.timeline.percent = Number(item.timeline.percent || 0);
                    }
                }

                out.push(normalized);
            }

            return out.length ? out : null;
        }

        function clonePlaylist(list) {
            if (!Array.isArray(list)) return null;

            var out = [];

            for (var i = 0; i < list.length; i++) {
                out.push(cloneItem(list[i]));
            }

            return out;
        }

        function findPlaylistIndexByUrl(playlist, url) {
            if (!Array.isArray(playlist) || !url) return -1;

            var cleanTarget = Utils.stripFragment(url);
            var targetIdentity = Utils.streamIdentity(url);

            for (var i = 0; i < playlist.length; i++) {
                var itemUrl = playlist[i] && playlist[i].url;

                if (!itemUrl) continue;

                if (Utils.stripFragment(itemUrl) === cleanTarget) {
                    return i;
                }

                if (Utils.streamIdentity(itemUrl) === targetIdentity) {
                    return i;
                }
            }

            return -1;
        }

        function saveIfBetter(hash, playlist) {
            if (!hash || !Array.isArray(playlist) || playlist.length < 2) return false;

            var normalized = normalize(playlist);
            if (!normalized || normalized.length < 2) return false;

            var params = StorageManager.getParams();
            var old = params[hash] || {};

            var oldJson = old.playlist ? Utils.safeJson(old.playlist) : '';
            var newJson = Utils.safeJson(normalized);

            if (oldJson === newJson) return false;

            StorageManager.saveStreamParams(hash, {
                playlist: normalized
            }, true);

            Utils.noty('playlist saved len=' + normalized.length, false, 2);

            return true;
        }

        function getForLaunch(params) {
            if (!params || !Array.isArray(params.playlist) || params.playlist.length < 2) {
                return null;
            }

            return normalize(params.playlist);
        }

        function itemToMeta(movie, item, index, selectedIndex, fallbackSeason, fallbackEpisode) {
            item = item || {};

            var season = Number(item.season || item.season_number || 0);
            var episode = Number(item.episode || item.episode_number || 0);
            var isAnime = Utils.isJapaneseSeries(movie);
            var seSource = season && episode ? 'item_fields' : '';

            if (!season || !episode) {
                var se = Utils.extractSE(item, {
                    preferText: isAnime,
                    allowEpisodeOnly: false,
                    fallbackSeason: Number(fallbackSeason || 1)
                });

                if (se.season && se.episode) {
                    season = se.season;
                    episode = se.episode;
                    seSource = se.source || 'extractSE';
                }
            }

            /**
             * Fallback S/E разрешён только для реально выбранного элемента.
             * Иначе весь playlistMeta получит один и тот же номер серии.
             */
            if ((!season || !episode) && index === selectedIndex) {
                season = Number(fallbackSeason || 0);
                episode = Number(fallbackEpisode || 0);
                if (season && episode) seSource = 'selected_fallback';
            }

            var timelineHash = '';

            if (item.timeline && item.timeline.hash !== undefined) {
                timelineHash = String(item.timeline.hash);
            }

            if (!timelineHash && movie && season && episode) {
                timelineHash = StorageManager.generateTimelineHash(movie, season, episode);
            }

            return {
                index: index,
                title: item.title || item.name || item.episode_title || '',
                season: season,
                episode: episode,
                seSource: seSource,
                timelineHash: timelineHash,
                url: Utils.stripFragment(item.url || '')
            };
        }

        function repairAnimeMetaByAnchor(movie, playlist, meta, selectedIndex, fallbackSeason, fallbackEpisode) {
            if (!Utils.isJapaneseSeries(movie)) return meta;
            if (!Array.isArray(meta) || !meta.length) return meta;

            selectedIndex = Number(selectedIndex || 0);

            var anchorIndex = -1;
            var anchorSeason = Number(fallbackSeason || 0);
            var anchorEpisode = Number(fallbackEpisode || 0);

            if (
                meta[selectedIndex] &&
                meta[selectedIndex].season &&
                meta[selectedIndex].episode
            ) {
                anchorIndex = selectedIndex;
                anchorSeason = Number(meta[selectedIndex].season || 0);
                anchorEpisode = Number(meta[selectedIndex].episode || 0);
            }

            if (anchorIndex < 0 && anchorSeason && anchorEpisode) {
                anchorIndex = selectedIndex;
            }

            if (anchorIndex < 0) {
                for (var i = 0; i < meta.length; i++) {
                    if (meta[i].season && meta[i].episode) {
                        anchorIndex = i;
                        anchorSeason = Number(meta[i].season || 0);
                        anchorEpisode = Number(meta[i].episode || 0);
                        break;
                    }
                }
            }

            if (anchorIndex < 0 || !anchorSeason || !anchorEpisode) {
                return meta;
            }

            for (var j = 0; j < meta.length; j++) {
                var item = meta[j];

                if (!item) continue;

                if (item.season && item.episode) {
                    if (!item.timelineHash) {
                        item.timelineHash = StorageManager.generateTimelineHash(
                            movie,
                            item.season,
                            item.episode
                        );
                    }

                    continue;
                }

                var inferredEpisode = anchorEpisode + (j - anchorIndex);

                if (inferredEpisode <= 0 || inferredEpisode > 200) {
                    continue;
                }

                item.season = anchorSeason;
                item.episode = inferredEpisode;
                item.seSource = 'anime_anchor_relative';

                item.timelineHash = StorageManager.generateTimelineHash(
                    movie,
                    item.season,
                    item.episode
                );
            }

            Utils.log('Anime meta repaired', {
                selectedIndex: selectedIndex,
                anchorIndex: anchorIndex,
                anchorSeason: anchorSeason,
                anchorEpisode: anchorEpisode,
                meta: meta
            });

            return meta;
        }

        function buildMeta(movie, playlist, selectedIndex, fallbackSeason, fallbackEpisode) {
            var meta = [];

            if (!Array.isArray(playlist)) return meta;

            selectedIndex = Number(selectedIndex || 0);

            for (var i = 0; i < playlist.length; i++) {
                meta.push(
                    itemToMeta(
                        movie,
                        playlist[i],
                        i,
                        selectedIndex,
                        fallbackSeason,
                        fallbackEpisode
                    )
                );
            }

            meta = repairAnimeMetaByAnchor(
                movie,
                playlist,
                meta,
                selectedIndex,
                fallbackSeason,
                fallbackEpisode
            );

            return meta;
        }

        function findMetaByIndexOrUrl(session, index, url) {
            if (!session || !Array.isArray(session.playlistMeta)) return null;

            /**
             * Сначала URL/stream identity.
             * Индекс внешнего плеера может не совпадать с индексом Lampa playlist.
             */
            if (url) {
                var clean = Utils.stripFragment(url);
                var targetIdentity = Utils.streamIdentity(url);

                for (var i = 0; i < session.playlistMeta.length; i++) {
                    var metaUrl = session.playlistMeta[i].url;

                    if (!metaUrl) continue;

                    if (Utils.stripFragment(metaUrl) === clean) {
                        return session.playlistMeta[i];
                    }

                    if (Utils.streamIdentity(metaUrl) === targetIdentity) {
                        return session.playlistMeta[i];
                    }
                }
            }

            if (
                index !== undefined &&
                index !== null &&
                index >= 0 &&
                session.playlistMeta[index]
            ) {
                return session.playlistMeta[index];
            }

            return null;
        }

        return {
            normalize: normalize,
            clonePlaylist: clonePlaylist,
            saveIfBetter: saveIfBetter,
            getForLaunch: getForLaunch,
            buildMeta: buildMeta,
            findMetaByIndexOrUrl: findMetaByIndexOrUrl,
            findPlaylistIndexByUrl: findPlaylistIndexByUrl
        };
    })();

    // ============================================================
    // DDDLayer
    // ============================================================

    var DDDLayer = (function () {
        var activeSession = null;
        var lastSavedByHash = {};
        var lastEventTsBySession = {};
        var pollTimer = null;
        var host = CONFIG.dddHost + ':' + CONFIG.dddPort;

        function makeSid(movie, timelineHash, season, episode) {
            var base = timelineHash;

            if (!base) {
                var title = '';

                try {
                    title = Utils.getMovieTitle(movie);
                } catch (e) {}

                base = title
                    ? Lampa.Utils.hash([title, season || 0, episode || 0].join(':'))
                    : 'unknown';
            }

            return 'ddd_' + base + '_' + Utils.now() + '_' + Math.floor(Math.random() * 100000);
        }

        function makeToken(sid) {
            return sid;
        }

        function appendFragment(url, session, index, startIndex) {
            if (!Utils.isStreamUrl(url)) return url;

            var clean = Utils.stripFragment(url);

            var fragment = Utils.encodeParams({
                ddd_mode: 'local',
                ddd_client: CONFIG.dddClient,
                ddd_sid: session.sid,
                ddd_port: CONFIG.dddPort,
                ddd_token: session.token,
                ddd_i: index || 0,
                ddd_start: startIndex || 0
            });

            return clean + '#' + fragment;
        }

        function chooseStartIndex(params, playlist, fallbackParams) {
            var indexByUrl = -1;
            var indexByFallbackUrl = -1;
            var explicitIndex = -1;

            if (params && params.url && Array.isArray(playlist)) {
                indexByUrl = PlaylistManager.findPlaylistIndexByUrl(playlist, params.url);
            }

            if (fallbackParams && fallbackParams.url && Array.isArray(playlist)) {
                indexByFallbackUrl = PlaylistManager.findPlaylistIndexByUrl(playlist, fallbackParams.url);
            }

            if (params && params.playlist_index !== undefined) {
                explicitIndex = Number(params.playlist_index || 0);
            }

            if (explicitIndex < 0 && params && params.ddd_start_index !== undefined) {
                explicitIndex = Number(params.ddd_start_index || 0);
            }

            if (explicitIndex < 0 && params && params.start_index !== undefined) {
                explicitIndex = Number(params.start_index || 0);
            }

            /**
             * Главное правило:
             * если текущий stream URL найден в playlist, он важнее playlist_index.
             */
            if (indexByUrl >= 0) return indexByUrl;
            if (indexByFallbackUrl >= 0) return indexByFallbackUrl;

            if (
                explicitIndex >= 0 &&
                Array.isArray(playlist) &&
                playlist.length &&
                explicitIndex < playlist.length
            ) {
                return explicitIndex;
            }

            return 0;
        }

        function attach(params, movie, timelineHash, fallbackParams) {
            if (!Utils.shouldUseDDDLayer()) return params;
            if (!params || !params.url || !Utils.isStreamUrl(params.url)) return params;

            var originalUrl = Utils.stripFragment(params.url);
            var isAnime = Utils.isJapaneseSeries(movie);

            var se = Utils.extractSE(params, {
                preferText: isAnime,
                allowEpisodeOnly: isAnime,
                fallbackSeason: Number(
                    params.season ||
                    (fallbackParams && fallbackParams.season) ||
                    1
                )
            });

            var season = se.season || Number(params.season || (fallbackParams && fallbackParams.season) || 0);
            var episode = se.episode || Number(params.episode || (fallbackParams && fallbackParams.episode) || 0);

            var playlist = null;

            if (Array.isArray(params.playlist)) {
                playlist = PlaylistManager.normalize(params.playlist);
            }

            if (!playlist && fallbackParams && Array.isArray(fallbackParams.playlist)) {
                playlist = PlaylistManager.normalize(fallbackParams.playlist);
            }

            var matchedIndex = playlist
                ? PlaylistManager.findPlaylistIndexByUrl(playlist, originalUrl)
                : -1;

            var startIndex = chooseStartIndex(params, playlist, fallbackParams);
            var sid = makeSid(movie, timelineHash, season, episode);

            var session = {
                sid: sid,
                token: makeToken(sid),
                host: host,
                port: CONFIG.dddPort,
                ts: Utils.now(),

                movie: movie || null,
                movie_id: movie ? (movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId) : null,
                movie_key: movie ? StorageManager.getMovieKey(movie) : '',
                original_title: movie ? Utils.getMovieTitle(movie) : '',
                original_language: movie ? Utils.getOriginalLanguage(movie) : '',

                title: params.title || '',
                season: season,
                episode: episode,
                startIndex: startIndex,
                timelineHash: timelineHash || '',
                playlistMeta: [],
                playlistClean: null,
                seSource: se.source || ''
            };

            if (playlist && playlist.length) {
                var cleanPlaylist = PlaylistManager.clonePlaylist(playlist);

                session.playlistClean = cleanPlaylist;
                session.playlistMeta = PlaylistManager.buildMeta(
                    movie,
                    cleanPlaylist,
                    startIndex,
                    season,
                    episode
                );

                for (var i = 0; i < playlist.length; i++) {
                    playlist[i].url = appendFragment(playlist[i].url, session, i, startIndex);
                }

                params.playlist = playlist;

                var hasExplicitPlaylistIndex =
                    params.playlist_index !== undefined ||
                    params.ddd_start_index !== undefined ||
                    params.start_index !== undefined;

                var canReplaceUrlByPlaylist =
                    matchedIndex >= 0 ||
                    hasExplicitPlaylistIndex;

                if (
                    canReplaceUrlByPlaylist &&
                    playlist[startIndex] &&
                    playlist[startIndex].url
                ) {
                    params.url = playlist[startIndex].url;

                    if (playlist[startIndex].title) {
                        params.title = playlist[startIndex].title;
                    }
                } else {
                    params.url = appendFragment(originalUrl, session, startIndex, startIndex);
                }
            } else {
                session.playlistMeta = [
                    {
                        index: startIndex,
                        title: params.title || '',
                        season: season,
                        episode: episode,
                        seSource: se.source || '',
                        timelineHash: timelineHash || '',
                        url: Utils.stripFragment(params.url)
                    }
                ];

                params.url = appendFragment(params.url, session, startIndex, startIndex);
            }

            params.playlist_index = startIndex;
            params.ddd_session = {
                sid: session.sid,
                port: session.port,
                startIndex: session.startIndex
            };

            activeSession = session;
            StorageManager.saveDDDSession(session);

            Utils.noty(
                'attach pl=' + session.playlistMeta.length +
                ' start=' + startIndex +
                ' S' + season +
                'E' + episode +
                ' src=' + (se.source || '-'),
                false,
                2
            );

            Utils.log('DDD attached', session);

            return params;
        }

        function getSession() {
            if (activeSession) return activeSession;

            activeSession = StorageManager.getDDDSession();

            return activeSession;
        }

        function fetchJson(url, timeoutMs) {
            timeoutMs = timeoutMs || CONFIG.dddFetchTimeoutMs;

            var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

            var timer = controller
                ? setTimeout(function () {
                    try {
                        controller.abort();
                    } catch (e) {}
                }, timeoutMs)
                : null;

            return fetch(url, {
                method: 'GET',
                cache: 'no-store',
                mode: 'cors',
                signal: controller ? controller.signal : undefined
            }).then(function (response) {
                return response.text().then(function (text) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status + ': ' + text);
                    }

                    try {
                        return JSON.parse(text);
                    } catch (e) {
                        return text;
                    }
                });
            }).finally(function () {
                if (timer) clearTimeout(timer);
            });
        }

        function normalizeEvents(data) {
            if (Array.isArray(data)) return data;
            if (data && Array.isArray(data.value)) return data.value;
            if (data && Array.isArray(data.Value)) return data.Value;

            return [];
        }

        function hasPosition(event) {
            return !!(
                event &&
                event.payload &&
                (
                    event.payload.position !== undefined ||
                    event.payload.positionSec !== undefined
                )
            );
        }

        function eventTs(event, fallbackIndex) {
            if (!event) return fallbackIndex || 0;

            return Number(
                event.ts ||
                (event.payload && event.payload.ts) ||
                fallbackIndex ||
                0
            );
        }

        function chooseBestEvent(state, eventsRaw) {
            var events = normalizeEvents(eventsRaw);
            var candidates = [];

            for (var i = 0; i < events.length; i++) {
                if (events[i] && events[i].payload && hasPosition(events[i])) {
                    events[i].__order = i + 1;
                    candidates.push(events[i]);
                }
            }

            if (state && state.payload && hasPosition(state)) {
                state.__order = events.length + 1;
                candidates.push(state);
            }

            candidates.sort(function (a, b) {
                return eventTs(b, b.__order) - eventTs(a, a.__order);
            });

            return candidates[0] || state || null;
        }

        function readPayloadIndex(payload, session) {
            payload = payload || {};

            var fields = [
                'ddd_i',
                'playlistIndex',
                'playlist_index',
                'windowIndex',
                'mediaItemIndex',
                'itemIndex',
                'index'
            ];

            for (var i = 0; i < fields.length; i++) {
                var key = fields[i];

                if (payload[key] !== undefined && payload[key] !== null) {
                    return Number(payload[key] || 0);
                }
            }

            return Number(session.startIndex || 0);
        }

        function resolveMeta(session, payload) {
            payload = payload || {};

            var index = readPayloadIndex(payload, session);
            var uri = payload.uri || payload.url || payload.src || '';

            var meta = PlaylistManager.findMetaByIndexOrUrl(session, index, uri);

            if (meta) return meta;

            var isAnime = Utils.isJapaneseSeries(session.movie);
            var se = Utils.extractSE(payload, {
                preferText: isAnime,
                allowEpisodeOnly: isAnime,
                fallbackSeason: Number(session.season || 1)
            });

            return {
                index: index,
                title: payload.title || session.title || '',
                season: se.season || session.season || 0,
                episode: se.episode || session.episode || 0,
                seSource: se.source || 'resolve_fallback',
                timelineHash: session.timelineHash || '',
                url: Utils.stripFragment(uri || '')
            };
        }

        function updateStreamTimestampFromDDD(session, meta, payload) {
            if (!session || !session.movie || !meta || !meta.timelineHash) return;

            try {
                if (!meta.season || !meta.episode) {
                    Utils.warn('Skip DDD stream params without S/E', meta, payload);
                    return;
                }

                var uri = meta.url || payload.uri || payload.url || payload.src || '';
                var parsed = Utils.parseStreamUrl(uri);

                if (!parsed) return;

                StorageManager.saveStreamParams(meta.timelineHash, {
                    file_name: parsed.file_name,
                    torrent_link: parsed.torrent_link,
                    file_index: parsed.file_index,

                    playlist_index: meta.index,
                    title: session.movie.name || session.movie.title || session.title || '',
                    original_title: Utils.getMovieTitle(session.movie) || session.original_title || '',
                    original_name: session.movie.original_name || '',
                    original_language: Utils.getOriginalLanguage(session.movie),
                    movie_id: session.movie.id || session.movie.movie_id || session.movie_id,
                    movie_key: session.movie_key,

                    season: meta.season,
                    episode: meta.episode,
                    episode_title: meta.title || payload.title || '',
                    ddd_se_source: meta.seSource || '',

                    playlist: session.playlistClean || undefined
                }, true);
            } catch (e) {
                Utils.warn('updateStreamTimestampFromDDD failed', e);
            }
        }

        function updateTimelineFromEvent(session, event) {
            if (!session || !event || !event.payload) return false;

            var payload = event.payload;
            var sessionId = session.sid || event.sessionId || payload.sessionId || 'default';
            var eventTime = eventTs(event, 0);

            if (
                eventTime &&
                lastEventTsBySession[sessionId] &&
                eventTime < lastEventTsBySession[sessionId]
            ) {
                return false;
            }

            if (eventTime) {
                lastEventTsBySession[sessionId] = eventTime;
            }

            var positionSec = Utils.msToSeconds(payload.position);
            var durationSec = Utils.msToSeconds(payload.duration);

            if (!positionSec && payload.positionSec !== undefined) {
                positionSec = Number(payload.positionSec || 0);
            }

            if (!durationSec && payload.durationSec !== undefined) {
                durationSec = Number(payload.durationSec || 0);
            }

            if (positionSec < CONFIG.minSaveSeconds) return false;
            if (durationSec < CONFIG.minDurationSeconds) return false;

            var meta = resolveMeta(session, payload);

            if (!meta.timelineHash && session.movie && meta.season && meta.episode) {
                meta.timelineHash = StorageManager.generateTimelineHash(
                    session.movie,
                    meta.season,
                    meta.episode
                );
            }

            if (!meta.timelineHash) {
                Utils.warn('No timeline hash for DDD event', meta, payload);
                return false;
            }

            var percent = Utils.clamp(
                Math.round((positionSec / durationSec) * 100),
                0,
                100
            );

            if (percent >= CONFIG.finishPercent) {
                percent = 100;
                positionSec = durationSec;
            }

            var current = Utils.now();
            var lastSave = lastSavedByHash[meta.timelineHash] || 0;

            if (percent < 100 && current - lastSave < CONFIG.dddTimelineSaveIntervalMs) {
                return false;
            }

            lastSavedByHash[meta.timelineHash] = current;

            try {
                if (Lampa.Timeline && Lampa.Timeline.update) {
                    Lampa.Timeline.update({
                        hash: meta.timelineHash,
                        percent: percent,
                        time: positionSec,
                        duration: durationSec
                    });
                } else {
                    Utils.warn('Lampa.Timeline.update not found');
                    return false;
                }
            } catch (e) {
                Utils.error('Timeline update failed', e);
                return false;
            }

            updateStreamTimestampFromDDD(session, meta, payload);

            if (CONFIG.debugNotyPollSuccess || CONFIG.debugNotyLevel >= 3) {
                Utils.noty(
                    'tl S' + (meta.season || 0) +
                    'E' + (meta.episode || 0) +
                    ' i=' + meta.index +
                    ' ' + Utils.formatSeconds(positionSec) +
                    '/' + Utils.formatSeconds(durationSec) +
                    ' ' + percent + '%',
                    false,
                    3
                );
            }

            Utils.log('Timeline updated from DDD', {
                meta: meta,
                positionSec: positionSec,
                durationSec: durationSec,
                percent: percent,
                payload: payload
            });

            return true;
        }

        function probe(showFail) {
            var session = getSession();

            if (!session || !session.sid || !session.token) {
                if (showFail) Utils.noty('no session', true, 0);
                return Promise.resolve(false);
            }

            var pingUrl = host + '/ping';
            var stateUrl = host + '/state?sid=' + encodeURIComponent(session.sid) + '&token=' + encodeURIComponent(session.token);
            var eventsUrl = host + '/events?sid=' + encodeURIComponent(session.sid) + '&token=' + encodeURIComponent(session.token);

            var stateData = null;

            return fetchJson(pingUrl, CONFIG.dddFetchTimeoutMs)
                .then(function () {
                    return fetchJson(stateUrl, CONFIG.dddFetchTimeoutMs);
                })
                .then(function (state) {
                    stateData = state;
                    return fetchJson(eventsUrl, CONFIG.dddFetchTimeoutMs);
                })
                .then(function (events) {
                    var best = chooseBestEvent(stateData, events);

                    if (!best || !best.payload) {
                        if (showFail) Utils.noty('no payload', true, 0);
                        return false;
                    }

                    return updateTimelineFromEvent(session, best);
                })
                .catch(function (e) {
                    Utils.log('DDD probe failed', e);

                    if (
                        showFail ||
                        (
                            CONFIG.debugNotyPollFail &&
                            CONFIG.debugNotyLevel >= 3
                        )
                    ) {
                        Utils.noty(
                            'bridge fail: ' + String(e.message || e).slice(0, 90),
                            showFail,
                            showFail ? 0 : 3
                        );
                    }

                    return false;
                });
        }

        function startPolling() {
            if (pollTimer) return;

            pollTimer = setInterval(function () {
                probe(false);
            }, CONFIG.dddPollIntervalMs);
        }

        function installWakeHooks() {
            try {
                document.addEventListener('visibilitychange', function () {
                    if (!document.hidden) {
                        setTimeout(function () {
                            probe(true);
                        }, 800);
                    }
                });
            } catch (e) {}

            try {
                window.addEventListener('focus', function () {
                    setTimeout(function () {
                        probe(true);
                    }, 800);
                });
            } catch (e) {}

            try {
                Lampa.Listener.follow('app', function (event) {
                    if (event && (event.type === 'ready' || event.type === 'resume')) {
                        setTimeout(function () {
                            probe(true);
                        }, 1000);
                    }
                });
            } catch (e) {}
        }

        function exposeDebugApi() {
            window.ContinueWatchDDD = {
                version: PLUGIN_VERSION,
                config: CONFIG,
                probe: function () {
                    return probe(true);
                },
                session: function () {
                    return getSession();
                },
                host: host,
                storage: function () {
                    return StorageManager.getParams();
                }
            };
        }

        function init() {
            if (!CONFIG.dddEnabled) return;

            startPolling();
            installWakeHooks();
            //exposeDebugApi(); // debug API отключён в чистой версии

            setTimeout(function () {
                probe(false);
            }, 1500);
        }

        return {
            init: init,
            attach: attach,
            probe: probe,
            getSession: getSession
        };
    })();

    // ============================================================
    // PlayerManager
    // ============================================================

    var PlayerManager = (function () {
        var patched = false;
        var listenersReady = false;

        var currentEpisodeHash = null;
        var lastSavedHash = null;
        var lastKnownMovie = null;

        var GLOBAL_MOVIE_KEY = '__continuewatch_ddd_last_movie';

        function cacheMovie(movie) {
            if (!movie) return;

            try {
                window[GLOBAL_MOVIE_KEY] = movie;
            } catch (e) {}
        }

        function getCachedMovie() {
            try {
                return window[GLOBAL_MOVIE_KEY] || null;
            } catch (e) {
                return null;
            }
        }

        function getMovieFromParams(params) {
            var movie = null;

            if (params) {
                movie = params.card || params.movie || params.data || null;
            }

            if (!movie) {
                try {
                    var activity = Lampa.Activity.active();

                    if (activity && activity.movie) {
                        movie = activity.movie;
                    }
                } catch (e) {}
            }

            if (!movie && lastKnownMovie) movie = lastKnownMovie;
            if (!movie) movie = getCachedMovie();

            if (movie) {
                lastKnownMovie = movie;
                cacheMovie(movie);
            }

            return movie;
        }

        function getTimelineView(hash) {
            try {
                if (Lampa.Timeline && Lampa.Timeline.view) {
                    return Lampa.Timeline.view(hash);
                }
            } catch (e) {}

            return null;
        }

        function saveFromPlayerParams(params, movie) {
            if (!params || !movie) return null;
            if (!params.url || !Utils.isStreamUrl(params.url)) return null;

            var isAnime = Utils.isJapaneseSeries(movie);

            var se = Utils.extractSE(params, {
                preferText: isAnime,
                allowEpisodeOnly: isAnime,
                fallbackSeason: Number(params.season || 1)
            });

            var season = se.season || Number(params.season || 0);
            var episode = se.episode || Number(params.episode || 0);

            var timelineHash = StorageManager.generateTimelineHash(movie, season, episode);

            if (!timelineHash) return null;

            var parsed = Utils.parseStreamUrl(params.url);

            if (!parsed) return timelineHash;

            var playlistToSave = null;
            var playlistIndex = -1;

            if (Array.isArray(params.playlist)) {
                playlistToSave = PlaylistManager.normalize(params.playlist);
            }

            if (playlistToSave) {
                playlistIndex = PlaylistManager.findPlaylistIndexByUrl(playlistToSave, params.url);

                /**
                 * playlist_index используем только если URL не удалось сопоставить.
                 */
                if (playlistIndex < 0 && params.playlist_index !== undefined) {
                    var candidateIndex = Number(params.playlist_index || 0);

                    if (
                        candidateIndex >= 0 &&
                        candidateIndex < playlistToSave.length
                    ) {
                        playlistIndex = candidateIndex;
                    }
                }

                if (playlistIndex < 0 && params.ddd_start_index !== undefined) {
                    var candidateDddIndex = Number(params.ddd_start_index || 0);

                    if (
                        candidateDddIndex >= 0 &&
                        candidateDddIndex < playlistToSave.length
                    ) {
                        playlistIndex = candidateDddIndex;
                    }
                }

                PlaylistManager.saveIfBetter(timelineHash, playlistToSave);
            }

            StorageManager.saveStreamParams(timelineHash, {
                file_name: parsed.file_name,
                torrent_link: parsed.torrent_link,
                file_index: parsed.file_index,

                playlist_index: playlistIndex >= 0 ? playlistIndex : undefined,

                title: movie.name || movie.title || '',
                original_title: Utils.getMovieTitle(movie),
                original_name: movie.original_name || '',
                original_language: Utils.getOriginalLanguage(movie),
                movie_id: movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId,
                movie_key: StorageManager.getMovieKey(movie),

                season: season,
                episode: episode,
                episode_title: params.episode_title || params.title || '',
                ddd_se_source: se.source || '',

                playlist: playlistToSave || undefined
            }, true);

            currentEpisodeHash = timelineHash;
            lastSavedHash = timelineHash;

            Utils.log('saveFromPlayerParams', {
                isAnime: isAnime,
                se: se,
                season: season,
                episode: episode,
                playlistIndex: playlistIndex,
                playlistLength: playlistToSave ? playlistToSave.length : 0,
                parsed: parsed,
                params: params
            });

            return timelineHash;
        }

        function patchPlayer() {
            if (patched) return;

            if (!Lampa.Player || !Lampa.Player.play) {
                setTimeout(patchPlayer, 500);
                return;
            }

            if (Lampa.Player.__continue_watch_ddd_patched_v3) {
                patched = true;
                return;
            }

            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (params) {
                try {
                    if (params && params.url && Utils.isStreamUrl(params.url)) {
                        var movie = getMovieFromParams(params);
                        var timelineHash = movie ? saveFromPlayerParams(params, movie) : null;

                        if (movie && timelineHash) {
                            params = DDDLayer.attach(params, movie, timelineHash, {
                                season: params.season,
                                episode: params.episode,
                                file_index: params.file_index,
                                playlist_index: params.playlist_index,
                                url: params.url,
                                playlist: params.playlist
                            });
                        }
                    }
                } catch (e) {
                    Utils.error('Player.play patch failed', e);
                }

                return originalPlay.call(this, params);
            };

            Lampa.Player.__continue_watch_ddd_patched_v3 = true;
            patched = true;

            Utils.noty('player patched', false, 1);
            Utils.log('Player.play patched');
        }

        function handlePlayerEvent(data) {
            if (!data) return;

            var movie = getMovieFromParams(data);

            if (!movie) return;

            var timelineHash = saveFromPlayerParams(data, movie);

            if (timelineHash && timelineHash === lastSavedHash) {
                currentEpisodeHash = timelineHash;
            }
        }

        function setupListeners() {
            if (listenersReady) return;

            if (!Lampa.Player || !Lampa.Player.listener) {
                setTimeout(setupListeners, 500);
                return;
            }

            try {
                Lampa.Player.listener.follow('start', function (data) {
                    try {
                        handlePlayerEvent(data);
                    } catch (e) {
                        Utils.error('Player start handler failed', e);
                    }
                });

                Lampa.Player.listener.follow('change', function (data) {
                    try {
                        handlePlayerEvent(data);
                    } catch (e) {
                        Utils.error('Player change handler failed', e);
                    }
                });

                Lampa.Player.listener.follow('destroy', function () {
                    try {
                        DDDLayer.probe(true);
                    } catch (e) {}

                    currentEpisodeHash = null;
                });

                listenersReady = true;

                Utils.noty('listeners installed', false, 1);
                Utils.log('Player listeners installed');
            } catch (e) {
                Utils.error('Player listeners setup failed', e);
            }
        }

        function launchFromContinue(movie, params) {
            if (!movie || !params) return;

            var url = StorageManager.buildStreamUrl(params);

            if (!url) return;

            var timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
            var timeline = getTimelineView(timelineHash);

            var restoreTime = 0;
            var restorePercent = 0;

            if (timeline && timeline.time > 0) {
                restoreTime = timeline.time;
                restorePercent = timeline.percent || 0;
            }

            var playlist = PlaylistManager.getForLaunch(params);
            var playlistIndex = -1;

            if (playlist) {
                /**
                 * Для Continue сначала URL, потому что старый playlist_index мог быть испорчен.
                 */
                playlistIndex = PlaylistManager.findPlaylistIndexByUrl(playlist, url);

                if (playlistIndex < 0 && params.playlist_index !== undefined) {
                    var savedIndex = Number(params.playlist_index || 0);

                    if (savedIndex >= 0 && savedIndex < playlist.length) {
                        playlistIndex = savedIndex;
                    }
                }

                if (playlistIndex < 0) playlistIndex = 0;
                if (playlistIndex >= playlist.length) playlistIndex = 0;
            } else {
                playlistIndex = 0;
            }

            StorageManager.saveStreamParams(timelineHash, {
                file_name: params.file_name,
                torrent_link: params.torrent_link,
                file_index: params.file_index || 0,

                playlist_index: playlistIndex,

                title: movie.name || movie.title || '',
                original_title: Utils.getMovieTitle(movie),
                original_name: movie.original_name || '',
                original_language: Utils.getOriginalLanguage(movie),
                movie_id: movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId,
                movie_key: StorageManager.getMovieKey(movie),

                season: params.season || 0,
                episode: params.episode || 0,
                episode_title: params.episode_title || params.title || '',

                playlist: playlist || undefined
            }, true);

            lastKnownMovie = movie;
            cacheMovie(movie);

            var playerData = {
                url: url,
                title: params.episode_title || params.title || movie.title || movie.name,
                card: movie,

                torrent_hash: params.torrent_link,

                season: params.season,
                episode: params.episode,

                /**
                 * file_index — индекс файла внутри TorrServer.
                 */
                file_index: params.file_index || 0,

                /**
                 * playlist_index — индекс элемента внутри Lampa playlist.
                 */
                playlist_index: playlistIndex,
                ddd_start_index: playlistIndex,
                start_index: playlistIndex,

                timeline: timeline || {
                    hash: timelineHash,
                    percent: restorePercent,
                    time: restoreTime,
                    duration: 0
                },

                position: restoreTime > 10 ? restoreTime : -1,
                playlist: playlist || undefined
            };

            Utils.noty(
                'launch S' + (params.season || 0) +
                'E' + (params.episode || 0) +
                ' pi=' + playlistIndex +
                ' fi=' + (params.file_index || 0) +
                ' pl=' + (playlist ? playlist.length : 0) +
                ' t=' + Utils.formatSeconds(restoreTime),
                true,
                1
            );

            Utils.log('launchFromContinue', {
                params: params,
                playerData: playerData,
                playlistIndex: playlistIndex,
                timeline: timeline
            });

            if (restoreTime > 10) {
                try {
                    Lampa.Noty.show('Восстанавливаем: ' + Utils.formatSeconds(restoreTime));
                } catch (e) {}
            }

            currentEpisodeHash = timelineHash;
            lastSavedHash = timelineHash;

            try {
                Lampa.Player.play(playerData);

                Lampa.Player.callback(function () {
                    try {
                        DDDLayer.probe(true);
                    } catch (e) {}

                    try {
                        Lampa.Controller.toggle('content');
                    } catch (e) {}
                });
            } catch (e) {
                Utils.error('Continue launch failed', e);
            }
        }

        return {
            patchPlayer: patchPlayer,
            setupListeners: setupListeners,
            launchFromContinue: launchFromContinue
        };
    })();

    // ============================================================
    // UIManager
    // ============================================================

    var UIManager = (function () {
        var debounceTimer = null;
        var installed = false;

        function getTimelineView(hash) {
            try {
                if (Lampa.Timeline && Lampa.Timeline.view) {
                    return Lampa.Timeline.view(hash);
                }
            } catch (e) {}

            return null;
        }

        function renderButtonContent(movie, params) {
            params = params || {};

            var timelineHash = StorageManager.generateTimelineHash(
                movie,
                params.season,
                params.episode
            );

            var timeline = getTimelineView(timelineHash);

            var percent = 0;
            var timeText = '';

            if (timeline && timeline.percent > 0) {
                percent = Number(timeline.percent || 0);
                timeText = Utils.formatSeconds(timeline.time || 0);
            }

            var season = Number(params.season || 0);
            var episode = Number(params.episode || 0);

            var label = 'Продолжить';

            if (season > 0 && episode > 0) {
                label += ' S' + season + '.E' + episode;

                if (timeText) {
                    label += ' <span style="opacity:0.7;font-size:0.9em">· ' + timeText + '</span>';
                }
            } else if (timeText) {
                label += ' <span style="opacity:0.7;font-size:0.9em">· ' + timeText + '</span>';
            }

            var dash = (percent * 65.97 / 100).toFixed(2);

            return {
                label: label,
                dash: dash
            };
        }

        function createButton(movie, params) {
            var content = renderButtonContent(movie, params);

            var html =
                '<div class="full-start__button selector button--continue-watch-ddd" style="margin-top:0.5em;position:relative;max-width:100%;overflow:hidden;">' +
                    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" style="margin-right:0.5em;flex-shrink:0;">' +
                        '<path d="M8 5v14l11-7L8 5z" fill="currentColor"></path>' +
                        '<circle class="continue-watch-ddd-progress" cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" ' +
                            'stroke-dasharray="' + content.dash + ' 65.97" transform="rotate(-90 12 12)" style="opacity:0.5"></circle>' +
                    '</svg>' +
                    '<div class="continue-watch-ddd-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">' + content.label + '</div>' +
                '</div>';

            return $(html);
        }

        function updateButton(button, movie, params) {
            var content = renderButtonContent(movie, params);

            button.find('.continue-watch-ddd-label').html(content.label);
            button.find('.continue-watch-ddd-progress')
                .attr('stroke-dasharray', content.dash + ' 65.97');
        }

        function handleClick(movie, button) {
            if (debounceTimer) return;

            var params = StorageManager.getLastStreamParams(movie);

            if (!params) {
                try {
                    Lampa.Noty.show('Нет истории просмотров');
                } catch (e) {}
                return;
            }

            if (button) {
                $(button).css('opacity', 0.5);
            }

            debounceTimer = setTimeout(function () {
                debounceTimer = null;

                if (button) {
                    $(button).css('opacity', 1);
                }
            }, CONFIG.debounceDelayMs);

            PlayerManager.launchFromContinue(movie, params);
        }

        function createStatusButton(movie) {
            var html =
                '<div class="full-start__button selector button--continue-watch-ddd-debug" style="margin-top:0.5em;position:relative;max-width:100%;overflow:hidden;">' +
                    '<div>DDD статус</div>' +
                '</div>';

            var button = $(html);

            bindStatusButton(button, movie);

            return button;
        }

        function bindStatusButton(button, movie) {
            button.off('hover:enter').on('hover:enter', function () {
                var params = StorageManager.getLastStreamParams(movie);
                var session = DDDLayer.getSession();

                if (!params) {
                    Utils.noty('status: no history', true, 0);
                    return;
                }

                Utils.noty(
                    'hist S' + (params.season || 0) +
                    'E' + (params.episode || 0) +
                    ' fi=' + (params.file_index !== undefined ? params.file_index : '-') +
                    ' pi=' + (params.playlist_index !== undefined ? params.playlist_index : '-') +
                    ' pl=' + (params.playlist ? params.playlist.length : 0),
                    true,
                    0
                );

                if (session) {
                    setTimeout(function () {
                        Utils.noty(
                            'sess start=' + session.startIndex +
                            ' meta=' + ((session.playlistMeta && session.playlistMeta.length) || 0) +
                            ' S' + (session.season || 0) +
                            'E' + (session.episode || 0),
                            true,
                            0
                        );
                    }, 700);
                } else {
                    setTimeout(function () {
                        Utils.noty('sess: none', true, 0);
                    }, 700);
                }

                try {
                    DDDLayer.probe(true);
                } catch (e) {}
            });
        }

        function insertAfterBestPlace(render, button) {
            var torrentButton = render.find('.view--torrent').last();
            var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

            if (torrentButton.length) {
                torrentButton.after(button);
            } else if (buttonsContainer.length) {
                buttonsContainer.append(button);
            } else {
                render.find('.full-start__button').last().after(button);
            }
        }

        function install() {
            if (installed) return;
            installed = true;

            Lampa.Listener.follow('full', function (event) {
                if (!event || event.type !== 'complite') return;

                requestAnimationFrame(function () {
                    try {
                        var activity = event.object.activity;
                        var render = activity.render();
                        var movie = event.data.movie;

                        if (!render || !movie) return;

                        var params = StorageManager.getLastStreamParams(movie);

                        if (!params) return;

                        var existing = render.find('.button--continue-watch-ddd');

                        if (existing.length) {
                            var existingButton = existing.eq(0);
                    updateButton(existingButton, movie, params);

                            existingButton.off('hover:enter.continueWatchDDD').on('hover:enter.continueWatchDDD', function () {
                                handleClick(movie, this);
                            });
                        } else {
                            var button = createButton(movie, params);

                            button.off('hover:enter.continueWatchDDD').on('hover:enter.continueWatchDDD', function () {
                                handleClick(movie, this);
                            });

                            insertAfterBestPlace(render, button);
                        }

                        /*
                         * DDD статус отключён в чистой версии.
                         *
                         * if (CONFIG.debugStatusButton && CONFIG.debugNoty) {
                         *     var debugExisting = render.find('.button--continue-watch-ddd-debug');
                         *
                         *     if (debugExisting.length) {
                         *         bindStatusButton(debugExisting, movie);
                         *     } else {
                         *         var debugButton = createStatusButton(movie);
                         *         render.find('.button--continue-watch-ddd').after(debugButton);
                         *     }
                         * }
                         */
                    } catch (e) {
                        Utils.error('Button render failed', e);
                    }
                });
            });
        }

        return {
            install: install
        };
    })();

    // ============================================================
    // Init
    // ============================================================

    function init() {
        try {
            Utils.noty('loaded ' + PLUGIN_VERSION, false, 1);
            Utils.log('Init', PLUGIN_VERSION);

            StorageManager.ensureSync();

            DDDLayer.init();

            PlayerManager.patchPlayer();
            PlayerManager.setupListeners();

            UIManager.install();

            setTimeout(function () {
                StorageManager.cleanupOld();
            }, 10000);
        } catch (e) {
            Utils.error('Init failed', e);
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
    // ==========================================================
    // ContinueWatchDDD global button dedup
    // =========================================================

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

                setTimeout(function () {
                    dedupContinueWatchButtons();
                }, 300);
            });
        } catch (e) {}
    })();

})();
