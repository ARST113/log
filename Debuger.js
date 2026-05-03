(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__CONTINUE_WATCH_DDD_LAYER_V2__) return;
    window.__CONTINUE_WATCH_DDD_LAYER_V2__ = true;

    /**
     * ContinueWatch + DDD Local Bridge
     *
     * Основная задача:
     * - сохранить гибкость исходного ContinueWatch;
     * - не ломать TorrServer / playlist / timeline;
     * - добавить слой связи с обновлённым DDDPlayer через локальный HTTP bridge.
     */

    var PLUGIN_NAME = 'ContinueWatchDDD';
    var PLUGIN_VERSION = 'v2.0.0-test';

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

        debug: true,
        debugNoty: true,

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
        function log() {
            if (!CONFIG.debug) return;

            try {
                console.log.apply(console, ['[' + PLUGIN_NAME + ']'].concat(Array.prototype.slice.call(arguments)));
            } catch (e) {}
        }

        function warn() {
            try {
                console.warn.apply(console, ['[' + PLUGIN_NAME + ']'].concat(Array.prototype.slice.call(arguments)));
            } catch (e) {}
        }

        function error() {
            try {
                console.error.apply(console, ['[' + PLUGIN_NAME + ']'].concat(Array.prototype.slice.call(arguments)));
            } catch (e) {}
        }

        function noty(message, force) {
            log(message);

            if (!force && !CONFIG.debugNoty) return;

            try {
                if (window.Lampa && Lampa.Noty) {
                    Lampa.Noty.show(String(message));
                }
            } catch (e) {}
        }

        function now() {
            return Date.now ? Date.now() : new Date().getTime();
        }

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

        function formatSeconds(seconds) {
            seconds = Number(seconds || 0);

            if (!seconds || seconds < 0) return '0:00';

            var total = Math.floor(seconds);
            var h = Math.floor(total / 3600);
            var m = Math.floor((total % 3600) / 60);
            var s = total % 60;

            if (h > 0) {
                return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
            }

            return m + ':' + String(s).padStart(2, '0');
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
                file_name: decodeURIComponent(fileMatch[1]),
                torrent_link: decodeURIComponent(linkMatch[1]),
                file_index: indexMatch ? parseInt(indexMatch[1], 10) : 0
            };
        }

        function extractSE(data) {
            function parseText(text) {
                if (!text || typeof text !== 'string') return null;

                var m;

                m = text.match(/S(?:eason)?\s*0?(\d{1,2})\s*[\.\-_: ]*\s*E(?:p(?:isode)?)?\s*0?(\d{1,2})/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10)
                    };
                }

                m = text.match(/(\d{1,2})\s*[xх×]\s*0?(\d{1,2})/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10)
                    };
                }

                m = text.match(/(\d{1,2})\s*сезон.*?(\d{1,2})\s*сер/i);
                if (m) {
                    return {
                        season: parseInt(m[1], 10),
                        episode: parseInt(m[2], 10)
                    };
                }

                return null;
            }

            if (data && data.season !== undefined && data.episode !== undefined) {
                return {
                    season: Number(data.season || 0),
                    episode: Number(data.episode || 0)
                };
            }

            var fields = [];

            if (data) {
                fields.push(
                    data.title,
                    data.name,
                    data.file_name,
                    data.path,
                    data.path_human,
                    data.folder_name
                );
            }

            for (var i = 0; i < fields.length; i++) {
                var parsed = parseText(fields[i]);
                if (parsed) return parsed;
            }

            return {
                season: 0,
                episode: 0
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
            isExternalTorrentPlayer: isExternalTorrentPlayer,
            shouldUseDDDLayer: shouldUseDDDLayer,
            parseStreamUrl: parseStreamUrl,
            extractSE: extractSE
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

            if (force) save();
            else setTimeout(save, CONFIG.debounceDelayMs);
        }

        function saveStreamParams(hash, data, forceTimestamp) {
            if (!hash || !data) return false;

            var params = getParams();

            if (!params[hash]) params[hash] = {};

            var old = params[hash];
            var changed = false;

            Object.keys(data).forEach(function (key) {
                if (key === 'playlist') return;

                if (old[key] !== data[key]) {
                    old[key] = data[key];
                    changed = true;
                }
            });

            if (Array.isArray(data.playlist)) {
                var oldJson = old.playlist ? Utils.safeJson(old.playlist) : '';
                var newJson = Utils.safeJson(data.playlist);

                if (oldJson !== newJson) {
                    old.playlist = data.playlist;
                    changed = true;
                }
            }

            if (forceTimestamp || changed || !old.timestamp) {
                old.timestamp = Utils.now();

                if (!old.original_timestamp) {
                    old.original_timestamp = old.timestamp;
                }

                setParams(params, true);

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

        function getTorrServerUrl() {
            if (torrserverCache) return torrserverCache;

            try {
                var url1 = Lampa.Storage.get('torrserver_url');
                var url2 = Lampa.Storage.get('torrserver_url_two');
                var useTwo = Lampa.Storage.field('torrserver_use_link') === 'two';

                var url = useTwo ? (url2 || url1) : (url1 || url2);

                if (!url) {
                    torrserverCache = null;
                    return null;
                }

                if (!url.match(/^https?:\/\//)) {
                    url = 'http://' + url;
                }

                url = url.replace(/\/$/, '');

                new URL(url);

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
                Lampa.Noty.show('TorrServer не настроен');
                return null;
            }

            var file = encodeURIComponent(params.file_name);
            var link = encodeURIComponent(params.torrent_link);
            var index = params.file_index !== undefined ? params.file_index : 0;

            return server + '/stream/' + file + '?link=' + link + '&index=' + index + '&play';
        }

        function generateTimelineHash(movie, season, episode) {
            if (!movie) return '';

            var originalTitle = movie.original_name || movie.original_title || movie.name || movie.title || '';

            if (movie.number_of_seasons && season && episode) {
                var separator = season > 10 ? ':' : '';

                return Lampa.Utils.hash([season, separator, episode, originalTitle].join(''));
            }

            return Lampa.Utils.hash(originalTitle);
        }

        function getLastStreamParams(movie) {
            if (!movie) return null;

            var originalTitle = movie.original_name || movie.original_title || movie.name || movie.title;

            if (!originalTitle) return null;

            var params = getParams();
            var movieId = movie.id || movie.movie_id;

            if (movie.number_of_seasons) {
                var episodes = Object.keys(params)
                    .map(function (key) {
                        return params[key];
                    })
                    .filter(function (item) {
                        if (!item) return false;

                        var sameTitle = item.original_title === originalTitle;
                        var sameId = !movieId || !item.movie_id || item.movie_id === movieId;

                        return sameTitle && sameId && item.season && item.episode;
                    })
                    .sort(function (a, b) {
                        return (b.timestamp || 0) - (a.timestamp || 0);
                    });

                return episodes[0] || null;
            }

            var hash = Lampa.Utils.hash(originalTitle);

            return params[hash] || null;
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
                    var item = params[hash];

                    if (item && item.timestamp && current - item.timestamp > CONFIG.cleanupAgeMs) {
                        delete params[hash];
                        changed = true;
                    }
                });

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
            getTorrServerUrl: getTorrServerUrl,
            generateTimelineHash: generateTimelineHash,
            saveDDDSession: saveDDDSession,
            getDDDSession: getDDDSession,
            cleanupOld: cleanupOld,
            ensureSync: ensureSync,
            setAccountReady: setAccountReady
        };
    })();

    // ============================================================
    // PlaylistManager
    // ============================================================

    var PlaylistManager = (function () {
        function normalize(list) {
            if (!Array.isArray(list)) return null;

            var out = [];

            for (var i = 0; i < list.length; i++) {
                var item = list[i];

                if (!item || typeof item !== 'object') continue;
                if (!item.url || typeof item.url !== 'string') continue;

                var normalized = {};

                Object.keys(item).forEach(function (key) {
                    normalized[key] = item[key];
                });

                normalized.url = Utils.stripFragment(item.url);
                normalized.title = item.title || item.name || '';

                if (item.season !== undefined) normalized.season = Number(item.season || 0);
                if (item.episode !== undefined) normalized.episode = Number(item.episode || 0);

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

        function saveIfBetter(hash, playlist) {
            if (!hash || !Array.isArray(playlist) || playlist.length < 2) return false;

            var params = StorageManager.getParams();
            var old = params[hash] || {};
            var oldLen = Array.isArray(old.playlist) ? old.playlist.length : 0;

            if (playlist.length <= oldLen) return false;

            StorageManager.saveStreamParams(hash, {
                playlist: playlist
            }, true);

            Utils.log('Playlist saved', 'hash=' + hash, 'len=' + playlist.length);

            return true;
        }

        function getForLaunch(params) {
            if (!params || !Array.isArray(params.playlist) || params.playlist.length < 2) {
                return null;
            }

            return normalize(params.playlist);
        }

        function itemToMeta(movie, item, index, fallbackSeason, fallbackEpisode) {
            item = item || {};

            var season = Number(item.season || fallbackSeason || 0);
            var episode = Number(item.episode || fallbackEpisode || 0);

            if (!season || !episode) {
                var se = Utils.extractSE(item);

                if (se.season && se.episode) {
                    season = se.season;
                    episode = se.episode;
                }
            }

            var timelineHash = '';

            if (item.timeline && item.timeline.hash !== undefined) {
                timelineHash = String(item.timeline.hash);
            }

            if (!timelineHash && movie) {
                timelineHash = StorageManager.generateTimelineHash(movie, season, episode);
            }

            return {
                index: index,
                title: item.title || item.name || '',
                season: season,
                episode: episode,
                timelineHash: timelineHash,
                url: Utils.stripFragment(item.url || '')
            };
        }

        function buildMeta(movie, playlist, fallbackSeason, fallbackEpisode) {
            var meta = [];

            if (!Array.isArray(playlist)) return meta;

            for (var i = 0; i < playlist.length; i++) {
                meta.push(itemToMeta(movie, playlist[i], i, fallbackSeason, fallbackEpisode));
            }

            return meta;
        }

        function findMetaByIndexOrUrl(session, index, url) {
            if (!session || !Array.isArray(session.playlistMeta)) return null;

            if (index !== undefined && index !== null && session.playlistMeta[index]) {
                return session.playlistMeta[index];
            }

            if (url) {
                var clean = Utils.stripFragment(url);

                for (var i = 0; i < session.playlistMeta.length; i++) {
                    if (session.playlistMeta[i].url && session.playlistMeta[i].url === clean) {
                        return session.playlistMeta[i];
                    }
                }
            }

            return null;
        }

        return {
            normalize: normalize,
            saveIfBetter: saveIfBetter,
            getForLaunch: getForLaunch,
            buildMeta: buildMeta,
            findMetaByIndexOrUrl: findMetaByIndexOrUrl
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
            if (timelineHash) return 'ddd_' + timelineHash;

            var title = '';

            try {
                title = movie.original_name || movie.original_title || movie.name || movie.title || '';
            } catch (e) {}

            if (title) {
                return 'ddd_' + Lampa.Utils.hash([title, season || 0, episode || 0].join(':'));
            }

            return 'ddd_' + Utils.now();
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
            var index = 0;

            if (params && params.ddd_start_index !== undefined) {
                index = Number(params.ddd_start_index || 0);
            } else if (params && params.start_index !== undefined) {
                index = Number(params.start_index || 0);
            } else if (params && params.file_index !== undefined) {
                index = Number(params.file_index || 0);
            } else if (fallbackParams && fallbackParams.file_index !== undefined) {
                index = Number(fallbackParams.file_index || 0);
            }

            if (Array.isArray(playlist) && playlist.length) {
                if (index < 0) index = 0;
                if (index >= playlist.length) index = 0;
            }

            return index;
        }

        function attach(params, movie, timelineHash, fallbackParams) {
            if (!Utils.shouldUseDDDLayer()) return params;
            if (!params || !params.url || !Utils.isStreamUrl(params.url)) return params;

            var season = Number(params.season || (fallbackParams && fallbackParams.season) || 0);
            var episode = Number(params.episode || (fallbackParams && fallbackParams.episode) || 0);

            var playlist = null;

            if (Array.isArray(params.playlist)) {
                playlist = PlaylistManager.normalize(params.playlist);
            }

            if (!playlist && fallbackParams && Array.isArray(fallbackParams.playlist)) {
                playlist = PlaylistManager.normalize(fallbackParams.playlist);
            }

            var startIndex = chooseStartIndex(params, playlist, fallbackParams);

            var sid = makeSid(movie, timelineHash, season, episode);

            var session = {
                sid: sid,
                token: makeToken(sid),
                host: host,
                port: CONFIG.dddPort,
                ts: Utils.now(),

                movie: movie || null,
                movie_id: movie ? (movie.id || movie.movie_id) : null,
                original_title: movie ? (movie.original_name || movie.original_title || '') : '',

                title: params.title || '',
                season: season,
                episode: episode,
                startIndex: startIndex,
                timelineHash: timelineHash || '',
                playlistMeta: []
            };

            if (playlist && playlist.length) {
                session.playlistMeta = PlaylistManager.buildMeta(movie, playlist, season, episode);

                for (var i = 0; i < playlist.length; i++) {
                    playlist[i].url = appendFragment(playlist[i].url, session, i, startIndex);
                }

                params.playlist = playlist;

                if (playlist[startIndex] && playlist[startIndex].url) {
                    params.url = playlist[startIndex].url;

                    if (playlist[startIndex].title) {
                        params.title = playlist[startIndex].title;
                    }
                } else {
                    params.url = appendFragment(params.url, session, startIndex, startIndex);
                }
            } else {
                session.playlistMeta = [
                    {
                        index: startIndex,
                        title: params.title || '',
                        season: season,
                        episode: episode,
                        timelineHash: timelineHash || '',
                        url: Utils.stripFragment(params.url)
                    }
                ];

                params.url = appendFragment(params.url, session, startIndex, startIndex);
            }

            params.ddd_session = {
                sid: session.sid,
                port: session.port,
                startIndex: session.startIndex
            };

            activeSession = session;
            StorageManager.saveDDDSession(session);

            Utils.noty(
                'DDD bridge: list=' + session.playlistMeta.length + ', start=' + startIndex,
                false
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
                event.payload.position !== undefined
            );
        }

        function chooseBestEvent(state, eventsRaw) {
            var events = normalizeEvents(eventsRaw);
            var candidates = [];

            for (var i = events.length - 1; i >= 0; i--) {
                candidates.push(events[i]);
            }

            if (state) candidates.push(state);

            var priority = [
                'PositionTick',
                'PlaybackStateChanged',
                'PlaylistItemChanged',
                'SessionFinished'
            ];

            for (var p = 0; p < priority.length; p++) {
                for (var c = 0; c < candidates.length; c++) {
                    if (candidates[c] && candidates[c].type === priority[p] && hasPosition(candidates[c])) {
                        return candidates[c];
                    }
                }
            }

            for (var j = 0; j < candidates.length; j++) {
                if (hasPosition(candidates[j])) return candidates[j];
            }

            return state || null;
        }

        function resolveMeta(session, payload) {
            payload = payload || {};

            var index = payload.windowIndex !== undefined
                ? Number(payload.windowIndex || 0)
                : Number(session.startIndex || 0);

            var meta = PlaylistManager.findMetaByIndexOrUrl(session, index, payload.uri);

            if (meta) return meta;

            return {
                index: index,
                title: payload.title || session.title || '',
                season: session.season || 0,
                episode: session.episode || 0,
                timelineHash: session.timelineHash || '',
                url: Utils.stripFragment(payload.uri || '')
            };
        }

        function updateTimelineFromEvent(session, event) {
            if (!session || !event || !event.payload) return false;

            var payload = event.payload;
            var sessionId = session.sid || event.sessionId || payload.sessionId || 'default';
            var eventTs = Number(event.ts || payload.ts || 0);

            if (eventTs && lastEventTsBySession[sessionId] && eventTs < lastEventTsBySession[sessionId]) {
                return false;
            }

            if (eventTs) {
                lastEventTsBySession[sessionId] = eventTs;
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

            if (!meta.timelineHash && session.movie) {
                meta.timelineHash = StorageManager.generateTimelineHash(
                    session.movie,
                    meta.season,
                    meta.episode
                );
            }

            if (!meta.timelineHash) {
                Utils.warn('No timeline hash for DDD event', event, session);
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

            Utils.noty(
                'DDD OK: ' +
                event.type +
                ', ' +
                Utils.formatSeconds(positionSec) +
                ' / ' +
                Utils.formatSeconds(durationSec) +
                ', index=' +
                meta.index +
                ', list=' +
                ((session.playlistMeta && session.playlistMeta.length) || 1) +
                (meta.season && meta.episode ? ', S' + meta.season + 'E' + meta.episode : '') +
                (meta.title ? ', ' + meta.title : ''),
                false
            );

            return true;
        }

        function updateStreamTimestampFromDDD(session, meta, payload) {
            if (!session || !session.movie || !meta || !meta.timelineHash) return;

            try {
                var parsed = Utils.parseStreamUrl(meta.url || payload.uri || '');

                if (!parsed) return;

                StorageManager.saveStreamParams(meta.timelineHash, {
                    file_name: parsed.file_name,
                    torrent_link: parsed.torrent_link,
                    file_index: parsed.file_index,
                    title: session.movie.name || session.movie.title || session.title || '',
                    original_title: session.movie.original_name || session.movie.original_title || session.original_title || '',
                    movie_id: session.movie.id || session.movie.movie_id || session.movie_id,
                    season: meta.season,
                    episode: meta.episode,
                    episode_title: meta.title || payload.title || ''
                }, true);
            } catch (e) {}
        }

        function probe(showFail) {
            var session = getSession();

            if (!session || !session.sid || !session.token) {
                if (showFail) Utils.noty('DDD: нет session', true);
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
                        if (showFail) Utils.noty('DDD: нет payload', true);
                        return false;
                    }

                    return updateTimelineFromEvent(session, best);
                })
                .catch(function (e) {
                    Utils.log('DDD probe failed', e);

                    if (showFail) {
                        Utils.noty('DDD FAIL: ' + (e.message || e), true);
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
                host: host
            };
        }

        function init() {
            if (!CONFIG.dddEnabled) return;

            startPolling();
            installWakeHooks();
            exposeDebugApi();

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
                movie = params.card || params.movie || null;
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

        function saveFromPlayerParams(params, movie) {
            if (!params || !movie) return null;

            if (!params.url || !Utils.isStreamUrl(params.url)) return null;

            var se = Utils.extractSE(params);
            var season = se.season || Number(params.season || 0);
            var episode = se.episode || Number(params.episode || 0);

            var timelineHash = StorageManager.generateTimelineHash(movie, season, episode);

            if (!timelineHash) return null;

            var parsed = Utils.parseStreamUrl(params.url);

            if (!parsed) return timelineHash;

            var playlistToSave = null;

            if (Utils.isExternalTorrentPlayer() && Array.isArray(params.playlist)) {
                playlistToSave = PlaylistManager.normalize(params.playlist);
            }

            if (playlistToSave) {
                PlaylistManager.saveIfBetter(timelineHash, playlistToSave);
            }

            StorageManager.saveStreamParams(timelineHash, {
                file_name: parsed.file_name,
                torrent_link: parsed.torrent_link,
                file_index: parsed.file_index,
                title: movie.name || movie.title || '',
                original_title: movie.original_name || movie.original_title || '',
                movie_id: movie.id || movie.movie_id,
                season: season,
                episode: episode,
                episode_title: params.episode_title || params.title || '',
                playlist: playlistToSave || undefined
            }, true);

            currentEpisodeHash = timelineHash;
            lastSavedHash = timelineHash;

            return timelineHash;
        }

        function patchPlayer() {
            if (patched) return;

            if (!Lampa.Player || !Lampa.Player.play) {
                setTimeout(patchPlayer, 500);
                return;
            }

            if (Lampa.Player.__continue_watch_ddd_patched) {
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
                                playlist: params.playlist
                            });
                        }
                    }
                } catch (e) {
                    Utils.error('Player.play patch failed', e);
                }

                return originalPlay.call(this, params);
            };

            Lampa.Player.__continue_watch_ddd_patched = true;
            patched = true;

            Utils.log('Player.play patched');
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

                Utils.log('Player listeners installed');
            } catch (e) {
                Utils.error('Player listeners setup failed', e);
            }
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

        function launchFromContinue(movie, params) {
            if (!movie || !params) return;

            var url = StorageManager.buildStreamUrl(params);

            if (!url) return;

            var timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
            var timeline = Lampa.Timeline.view(timelineHash);

            var restoreTime = 0;
            var restorePercent = 0;

            if (timeline && timeline.time > 0) {
                restoreTime = timeline.time;
                restorePercent = timeline.percent || 0;
            }

            var playlist = Utils.isExternalTorrentPlayer()
                ? PlaylistManager.getForLaunch(params)
                : null;

            StorageManager.saveStreamParams(timelineHash, {
                file_name: params.file_name,
                torrent_link: params.torrent_link,
                file_index: params.file_index || 0,
                title: movie.name || movie.title || '',
                original_title: movie.original_name || movie.original_title || '',
                movie_id: movie.id || movie.movie_id,
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
                file_index: params.file_index || 0,
                timeline: timeline || {
                    hash: timelineHash,
                    percent: restorePercent,
                    time: restoreTime,
                    duration: 0
                },
                position: restoreTime > 10 ? restoreTime : -1,
                playlist: playlist || undefined
            };

            if (restoreTime > 10) {
                Lampa.Noty.show('Восстанавливаем: ' + Utils.formatSeconds(restoreTime));
            }

            currentEpisodeHash = timelineHash;
            lastSavedHash = timelineHash;

            try {
                Lampa.Player.play(playerData);

                Lampa.Player.callback(function () {
                    try {
                        DDDLayer.probe(true);
                    } catch (e) {}

                    Lampa.Controller.toggle('content');
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

        function createButton(movie, params) {
            var timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
            var timeline = Lampa.Timeline.view(timelineHash);

            var percent = 0;
            var timeText = '';

            if (timeline && timeline.percent > 0) {
                percent = Number(timeline.percent || 0);
                timeText = Utils.formatSeconds(timeline.time || 0);
            }

            var label = 'Продолжить';

            if (params.season && params.episode) {
                label += ' S' + params.season + ' E' + params.episode;
            }

            if (timeText) {
                label += ' <span style="opacity:0.7;font-size:0.9em">(' + timeText + ')</span>';
            }

            var dash = (percent * 65.97 / 100).toFixed(2);

            var html =
                '<div class="full-start__button selector button--continue-watch-ddd" style="margin-top:0.5em;position:relative;">' +
                    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" style="margin-right:0.5em">' +
                        '<path d="M8 5v14l11-7L8 5z" fill="currentColor"></path>' +
                        '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" ' +
                            'stroke-dasharray="' + dash + ' 65.97" transform="rotate(-90 12 12)" style="opacity:0.5"></circle>' +
                    '</svg>' +
                    '<div>' + label + '</div>' +
                '</div>';

            return $(html);
        }

        function handleClick(movie, button) {
            if (debounceTimer) return;

            var params = StorageManager.getLastStreamParams(movie);

            if (!params) {
                Lampa.Noty.show('Нет истории просмотров');
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

        function install() {
            Lampa.Listener.follow('full', function (event) {
                if (!event || event.type !== 'complite') return;

                requestAnimationFrame(function () {
                    try {
                        var activity = event.object.activity;
                        var render = activity.render();
                        var movie = event.data.movie;

                        if (!render || !movie) return;
                        if (render.find('.button--continue-watch-ddd').length) return;

                        var params = StorageManager.getLastStreamParams(movie);

                        if (!params) return;

                        var button = createButton(movie, params);

                        button.on('hover:enter', function () {
                            handleClick(movie, this);
                        });

                        var torrentButton = render.find('.view--torrent').last();
                        var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

                        if (torrentButton.length) {
                            torrentButton.after(button);
                        } else if (buttonsContainer.length) {
                            buttonsContainer.append(button);
                        } else {
                            render.find('.full-start__button').last().after(button);
                        }
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
            Utils.log('Init', PLUGIN_VERSION);

            StorageManager.ensureSync();

            DDDLayer.init();

            PlayerManager.patchPlayer();
            PlayerManager.setupListeners();

            UIManager.install();

            setTimeout(function () {
                StorageManager.cleanupOld();
            }, 10000);

            Utils.noty('ContinueWatchDDD loaded', false);
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
})();
