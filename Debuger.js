(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__DDD_DIAGNOSTIC_DEBUGER_LOADER__) return;
    window.__DDD_DIAGNOSTIC_DEBUGER_LOADER__ = true;

    var PLUGIN_NAME = 'DDD Diagnostic Wrapper';
    var PLUGIN_VERSION = 'diag-ja-bridge-canonical-20260507-2';

    /*
     * Важно:
     * Debuger.js остаётся диагностическим wrapper'ом.
     * Основной ContinueWatching.js не переписываем.
     */
    var CORE_URL = 'https://arst113.github.io/log/ContinueWatching.js?v=diag-ja-bridge-canonical-20260507-2';

    /*
     * Главная защита:
     * canonical-save включён только для японского anime case.
     */
    var JA_CANONICAL_ENABLED = true;

    /*
     * true — писать исправленную запись в continue_watch_params.
     * false — только логировать расчёт.
     */
    var JA_CANONICAL_WRITE_ENABLED = true;

    /*
     * true — показывать огромный bridge body в Noty.
     * Сейчас лучше false, иначе Noty забивает весь экран.
     * Полный body всё равно пишется в console.
     */
    var SHOW_BRIDGE_BODY_IN_NOTY = false;

    var NOTY_MIN_INTERVAL = 350;

    var state = {
        activeSession: null,
        activeSessionKey: '',
        activeMovie: null,
        activeParamsStorageKey: '',
        lastNoty: '',
        lastNotyAt: 0,
        suppressStoragePatch: false,
        movieContext: {},
        lastBridgeCanonicalAt: 0,
        lastBridgeCanonicalKey: ''
    };

    // ============================================================
    // Basic utils
    // ============================================================

    function now() {
        return Date.now ? Date.now() : new Date().getTime();
    }

    function compact(value, maxLen) {
        if (value === undefined) return '-';
        if (value === null) return 'null';

        var s;

        try {
            if (typeof value === 'object') s = JSON.stringify(value);
            else s = String(value);
        } catch (e) {
            s = String(value);
        }

        if (maxLen && s.length > maxLen) return s.substring(0, maxLen) + '…';

        return s;
    }

    function toInt(value) {
        var n = Number(value || 0);
        return isFinite(n) ? Math.floor(n) : 0;
    }

    function toNumber(value) {
        var n = Number(value || 0);
        return isFinite(n) ? n : 0;
    }

    function hasValue(value) {
        return value !== undefined && value !== null && value !== '';
    }

    function hasNumber(value) {
        return value !== undefined && value !== null && value !== '' && isFinite(Number(value));
    }

    function safeJson(value) {
        try {
            return JSON.stringify(value);
        } catch (e) {
            return '';
        }
    }

    function safeParseJson(text) {
        if (!text || typeof text !== 'string') return null;

        try {
            return JSON.parse(text);
        } catch (e) {}

        return null;
    }

    function safeDecode(value) {
        value = String(value || '');

        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value;
        }
    }

    function stripFragment(url) {
        url = String(url || '');

        var p = url.indexOf('#');
        return p >= 0 ? url.substring(0, p) : url;
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[_]+/g, ' ')
            .trim();
    }

    function normalizeFileName(value) {
        return safeDecode(value || '')
            .replace(/\+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function noty(message, force) {
        message = '[DDD DBG] ' + String(message || '');

        try {
            console.log(message);
        } catch (e) {}

        var t = now();

        if (!force && message === state.lastNoty && t - state.lastNotyAt < NOTY_MIN_INTERVAL) {
            return;
        }

        state.lastNoty = message;
        state.lastNotyAt = t;

        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show(message);
            }
        } catch (e) {}
    }

    function warn(message, data, silentAbort) {
        try {
            console.warn('[DDD DBG]', message, data || '');
        } catch (e) {}

        if (silentAbort) return;

        noty('WARN ' + message, true);
    }

    function isAbortError(error) {
        if (!error) return false;

        var name = String(error.name || '');
        var message = String(error.message || error || '');

        return name === 'AbortError' || message.indexOf('aborted') !== -1;
    }

    // ============================================================
    // Lampa / storage keys
    // ============================================================

    function getProfileId() {
        try {
            if (
                window.Lampa &&
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

    function getParamsStorageKey() {
        var profileId = getProfileId();

        if (profileId !== null && profileId !== undefined) {
            return 'continue_watch_params_' + profileId;
        }

        return 'continue_watch_params';
    }

    function getSessionStorageKey() {
        var profileId = getProfileId();

        if (profileId !== null && profileId !== undefined) {
            return 'continue_watch_ddd_session_' + profileId;
        }

        return 'continue_watch_ddd_session';
    }

    function isDddStorageKey(key) {
        return typeof key === 'string' && (
            key.indexOf('continue_watch_params') === 0 ||
            key.indexOf('continue_watch_ddd_session') === 0
        );
    }

    function isParamsStorageKey(key) {
        return typeof key === 'string' && key.indexOf('continue_watch_params') === 0;
    }

    function isSessionStorageKey(key) {
        return typeof key === 'string' && key.indexOf('continue_watch_ddd_session') === 0;
    }

    function readStorage(key, fallback) {
        try {
            var value = Lampa.Storage.get(key);
            return value || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            state.suppressStoragePatch = true;
            Lampa.Storage.set(key, value);
            state.suppressStoragePatch = false;
            return true;
        } catch (e) {
            state.suppressStoragePatch = false;
            warn('storage write failed ' + key, e);
            return false;
        }
    }

    function syncStorage(key) {
        try {
            if (Lampa.Storage && Lampa.Storage.sync) {
                Lampa.Storage.sync(key, 'object_object');
            }
        } catch (e) {}
    }

    // ============================================================
    // Stream URL parsing
    // ============================================================

    function parseStreamUrl(url) {
        url = stripFragment(String(url || ''));

        if (!url) return null;

        var fileMatch = url.match(/\/stream\/([^?]+)/);
        var linkMatch = url.match(/[?&]link=([^&#]+)/);
        var indexMatch = url.match(/[?&]index=(\d+)/);

        if (!fileMatch && !indexMatch) return null;

        return {
            url: url,
            file_name: fileMatch ? normalizeFileName(fileMatch[1]) : '',
            torrent_link: linkMatch ? safeDecode(linkMatch[1]) : '',
            file_index: indexMatch ? parseInt(indexMatch[1], 10) : 0
        };
    }

    function parseStreamIdentityFromObject(obj) {
        obj = obj || {};

        var url = obj.url || obj.uri || obj.stream || '';
        var parsed = parseStreamUrl(url);

        if (parsed) {
            if (!parsed.file_name && obj.file_name) parsed.file_name = normalizeFileName(obj.file_name);
            if (!parsed.torrent_link && obj.torrent_link) parsed.torrent_link = String(obj.torrent_link || '');
            if (!parsed.file_index && hasNumber(obj.file_index)) parsed.file_index = toInt(obj.file_index);
            return parsed;
        }

        if (obj.file_name || obj.torrent_link || hasNumber(obj.file_index)) {
            return {
                url: '',
                file_name: normalizeFileName(obj.file_name || obj.title || obj.name || ''),
                torrent_link: String(obj.torrent_link || ''),
                file_index: hasNumber(obj.file_index) ? toInt(obj.file_index) : 0
            };
        }

        return null;
    }

    function streamIdentityKey(identity) {
        if (!identity) return '';

        return [
            String(identity.torrent_link || ''),
            String(identity.file_index || 0),
            normalizeFileName(identity.file_name || '')
        ].join('|');
    }

    function streamIdentitySoftKey(identity) {
        if (!identity) return '';

        return [
            String(identity.torrent_link || ''),
            normalizeFileName(identity.file_name || '')
        ].join('|');
    }

    function sameStreamIdentity(a, b) {
        if (!a || !b) return false;

        var aFile = normalizeFileName(a.file_name || '');
        var bFile = normalizeFileName(b.file_name || '');

        if (
            a.torrent_link &&
            b.torrent_link &&
            String(a.torrent_link) === String(b.torrent_link) &&
            hasNumber(a.file_index) &&
            hasNumber(b.file_index) &&
            toInt(a.file_index) === toInt(b.file_index)
        ) {
            return true;
        }

        if (
            a.torrent_link &&
            b.torrent_link &&
            String(a.torrent_link) === String(b.torrent_link) &&
            aFile &&
            bFile &&
            aFile === bFile
        ) {
            return true;
        }

        if (aFile && bFile && aFile === bFile) {
            return true;
        }

        return false;
    }

    // ============================================================
    // Season / episode parsing
    // ============================================================

    function parseSeasonEpisodeFromFileName(fileName) {
        fileName = normalizeFileName(fileName || '');

        var m;

        /*
         * Главный случай:
         * [SubsPlus+] Oshi No Ko S2 - 10 [WEB-DL ...].mkv
         */
        m = fileName.match(/\bS\s*0?(\d{1,2})\s*[-_. ]+\s*0?(\d{1,3})\b/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0,
                source: 'file_name_s_dash_e'
            };
        }

        /*
         * S2E10 / S02E010
         */
        m = fileName.match(/\bS\s*0?(\d{1,2})\s*E\s*0?(\d{1,3})\b/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0,
                source: 'file_name_sxe'
            };
        }

        /*
         * 2x10 / 2х10 / 2×10
         */
        m = fileName.match(/\b0?(\d{1,2})\s*[xх×]\s*0?(\d{1,3})\b/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0,
                source: 'file_name_1x02'
            };
        }

        /*
         * Season 2 Episode 10
         */
        m = fileName.match(/season\s*0?(\d{1,2}).*?(?:episode|ep\.?)\s*0?(\d{1,3})/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0,
                source: 'file_name_season_episode'
            };
        }

        /*
         * 2 сезон 10 серия
         */
        m = fileName.match(/0?(\d{1,2})\s*сезон.*?0?(\d{1,3})\s*сер/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0,
                source: 'file_name_ru_season_episode'
            };
        }

        /*
         * Эпизод 10 / Episode 10 / Серия 10.
         * Сезон здесь неизвестен, его можно брать только из movie/session/item.
         */
        m = fileName.match(/(?:эпизод|сер(?:ия|ии|и)?|episode|ep\.?|сер\.)\s*[-–—:]?\s*0?(\d{1,4})/i);
        if (m) {
            return {
                season: 0,
                episode: parseInt(m[1], 10) || 0,
                source: 'file_name_episode_text'
            };
        }

        return {
            season: 0,
            episode: 0,
            source: ''
        };
    }

    function getItemSeasonEpisode(item) {
        item = item || {};

        var season = toInt(
            item.season ||
            item.season_number ||
            item.seasonNumber ||
            item.s ||
            0
        );

        var episode = toInt(
            item.episode ||
            item.episode_number ||
            item.episodeNumber ||
            item.number ||
            item.num ||
            item.e ||
            0
        );

        if (season && episode) {
            return {
                season: season,
                episode: episode,
                source: 'playlist_item_fields'
            };
        }

        var identity = parseStreamIdentityFromObject(item);
        var fileName = identity && identity.file_name
            ? identity.file_name
            : (item.file_name || item.title || item.name || item.episode_title || '');

        var parsed = parseSeasonEpisodeFromFileName(fileName);

        if (parsed.season || parsed.episode) return parsed;

        return {
            season: 0,
            episode: 0,
            source: ''
        };
    }

    // ============================================================
    // Movie / language context
    // ============================================================

    function getHash(value) {
        try {
            if (value && window.Lampa && Lampa.Utils && Lampa.Utils.hash) {
                return String(Lampa.Utils.hash(String(value)));
            }
        } catch (e) {}

        return '';
    }

    function getMovieTitle(movie) {
        movie = movie || {};

        return (
            movie.original_name ||
            movie.original_title ||
            movie.name ||
            movie.title ||
            movie.originalName ||
            movie.originalTitle ||
            ''
        );
    }

    function getMovieId(movie) {
        movie = movie || {};

        return movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '';
    }

    function getMovieKey(movie) {
        movie = movie || {};

        if (movie.movie_key) return String(movie.movie_key);

        var id = getMovieId(movie);
        if (id) return 'id:' + String(id);

        var title = getMovieTitle(movie);
        var hash = getHash(title);

        return hash ? 'title:' + hash : '';
    }

    function getRecordMovieKey(record) {
        record = record || {};

        if (record.movie_key) return String(record.movie_key);

        if (record.movie_id) return 'id:' + String(record.movie_id);

        var title = (
            record.original_title ||
            record.original_name ||
            record.title ||
            record.name ||
            ''
        );

        var hash = getHash(title);

        return hash ? 'title:' + hash : '';
    }

    function getOriginalLanguage(obj) {
        obj = obj || {};

        var card = obj.card || obj.movie || obj.data || obj;

        var lang = (
            obj.original_language ||
            obj.originalLanguage ||
            obj.language ||
            card.original_language ||
            card.originalLanguage ||
            card.language ||
            ''
        );

        return String(lang || '').toLowerCase();
    }

    function rememberMovieContext(obj, source) {
        if (!obj || typeof obj !== 'object') return;

        var movie = obj.movie || obj.card || obj.data || obj;
        var lang = getOriginalLanguage(movie);
        var key = getMovieKey(movie);
        var title = getMovieTitle(movie);

        if (!key && !title) return;

        var context = {
            movie: movie,
            lang: lang,
            title: title,
            source: source || '',
            ts: now()
        };

        if (key) state.movieContext[key] = context;

        var id = getMovieId(movie);
        if (id) state.movieContext['id:' + String(id)] = context;

        if (title) {
            var h = getHash(title);
            if (h) state.movieContext['title:' + h] = context;
        }

        if (lang === 'ja') {
            state.activeMovie = movie;
        } else if (!state.activeMovie && title) {
            state.activeMovie = movie;
        }
    }

    function getActiveMovie() {
        if (state.activeSession && state.activeSession.movie) {
            return state.activeSession.movie;
        }

        if (state.activeMovie) return state.activeMovie;

        return null;
    }

    function getRecordLanguage(record) {
        record = record || {};

        var lang = getOriginalLanguage(record);
        if (lang) return lang;

        var movie = getActiveMovie();
        lang = getOriginalLanguage(movie);
        if (lang) return lang;

        var key = getRecordMovieKey(record);

        if (key && state.movieContext[key] && state.movieContext[key].lang) {
            return state.movieContext[key].lang;
        }

        return '';
    }

    function isJapaneseAnimeContext(record, payload) {
        if (!JA_CANONICAL_ENABLED) return false;

        var lang = '';

        if (record) lang = getRecordLanguage(record);
        if (!lang && payload) lang = getOriginalLanguage(payload);

        var movie = getActiveMovie();
        if (!lang && movie) lang = getOriginalLanguage(movie);

        return String(lang || '').toLowerCase() === 'ja';
    }

    // ============================================================
    // Playlist / session helpers
    // ============================================================

    function normalizePlaylist(list) {
        if (!Array.isArray(list)) return [];

        var out = [];

        for (var i = 0; i < list.length; i++) {
            var item = list[i];

            if (!item || typeof item !== 'object') continue;

            var copy = {};

            Object.keys(item).forEach(function (key) {
                copy[key] = item[key];
            });

            var identity = parseStreamIdentityFromObject(copy);

            if (identity) {
                copy.file_name = identity.file_name || copy.file_name || '';
                copy.torrent_link = identity.torrent_link || copy.torrent_link || '';
                copy.file_index = hasNumber(identity.file_index) ? toInt(identity.file_index) : toInt(copy.file_index);
            }

            if (!copy.title && copy.name) copy.title = copy.name;
            if (!copy.episode_title && copy.title) copy.episode_title = copy.title;

            out.push(copy);
        }

        return out;
    }

    function getSessionPlaylist(session) {
        session = session || state.activeSession || {};

        var list = [];

        if (Array.isArray(session.meta)) list = session.meta;
        else if (Array.isArray(session.playlist)) list = session.playlist;
        else if (Array.isArray(session.items)) list = session.items;
        else if (Array.isArray(session.files)) list = session.files;

        return normalizePlaylist(list);
    }

    function findPlaylistIndexByIdentity(playlist, identity) {
        if (!Array.isArray(playlist) || !identity) return -1;

        for (var i = 0; i < playlist.length; i++) {
            var item = playlist[i] || {};
            var itemIdentity = parseStreamIdentityFromObject(item);

            if (sameStreamIdentity(identity, itemIdentity)) {
                return i;
            }
        }

        return -1;
    }

    function findPlaylistItemByIdentity(playlist, identity) {
        var index = findPlaylistIndexByIdentity(playlist, identity);

        if (index < 0) {
            return {
                index: -1,
                item: null
            };
        }

        return {
            index: index,
            item: playlist[index] || null
        };
    }

    function getSelectedSessionItem(index) {
        var playlist = getSessionPlaylist();

        if (!playlist.length) {
            return {
                playlist: [],
                item: null,
                index: -1
            };
        }

        index = toInt(index);

        if (index < 0 || index >= playlist.length) {
            index = toInt(
                state.activeSession &&
                (
                    state.activeSession.start_index ||
                    state.activeSession.ddd_start_index ||
                    state.activeSession.playlist_index ||
                    0
                )
            );
        }

        if (index < 0 || index >= playlist.length) index = 0;

        return {
            playlist: playlist,
            item: playlist[index] || null,
            index: index
        };
    }

    function rememberSession(session, key, source) {
        if (!session || typeof session !== 'object') return;

        state.activeSession = session;
        state.activeSessionKey = key || state.activeSessionKey || getSessionStorageKey();

        if (session.movie) {
            rememberMovieContext(session.movie, source || 'session.movie');
        } else {
            rememberMovieContext(session, source || 'session');
        }

        try {
            console.log('[DDD DBG session remembered]', source, key, session);
        } catch (e) {}
    }

    // ============================================================
    // Timeline hash / params save
    // ============================================================

    function generateTimelineHash(movie, season, episode) {
        movie = movie || {};

        var originalTitle = getMovieTitle(movie);

        season = toInt(season);
        episode = toInt(episode);

        if (!originalTitle) return '';

        /*
         * Повторяет формулу основного ContinueWatching.js:
         * season > 10 ? ':' : ''
         */
        if (season > 0 && episode > 0) {
            var separator = season > 10 ? ':' : '';
            return getHash([season, separator, episode, originalTitle].join(''));
        }

        return getHash(originalTitle);
    }

    function getParamsMapAndKey() {
        var key = state.activeParamsStorageKey || getParamsStorageKey();

        syncStorage(key);

        var map = readStorage(key, {});

        if (!map || typeof map !== 'object') map = {};

        return {
            key: key,
            map: map
        };
    }

    function updateLastPointer(map, hash, record) {
        if (!map || !hash || !record) return false;
        if (!record.season || !record.episode) return false;

        var movieKey = getRecordMovieKey(record);

        if (!movieKey) return false;

        if (!map.__last_by_movie) map.__last_by_movie = {};

        var old = map.__last_by_movie[movieKey] || {};

        var pointer = {
            hash: hash,
            season: toInt(record.season),
            episode: toInt(record.episode),
            timestamp: toInt(record.timestamp) || now(),
            source: 'ddd-ja-canonical'
        };

        var changed = safeJson(old) !== safeJson(pointer);

        map.__last_by_movie[movieKey] = pointer;

        return changed;
    }

    function saveCanonicalRecord(hash, record, reason) {
        if (!hash || !record) return false;

        var storage = getParamsMapAndKey();
        var map = storage.map;
        var key = storage.key;

        var old = map[hash] || {};
        var changed = false;

        if (!map[hash]) {
            map[hash] = old;
            changed = true;
        }

        Object.keys(record).forEach(function (field) {
            var newValue = record[field];

            if (field === 'playlist') {
                var oldJson = old.playlist ? safeJson(old.playlist) : '';
                var newJson = newValue ? safeJson(newValue) : '';

                if (oldJson !== newJson) {
                    old.playlist = newValue;
                    changed = true;
                }

                return;
            }

            if (safeJson(old[field]) !== safeJson(newValue)) {
                old[field] = newValue;
                changed = true;
            }
        });

        old.timestamp = now();
        if (!old.original_timestamp) old.original_timestamp = old.timestamp;

        updateLastPointer(map, hash, old);

        if (!JA_CANONICAL_WRITE_ENABLED) {
            noty(
                'DRY canonical ' +
                'S' + old.season + 'E' + old.episode +
                ' pi=' + old.playlist_index +
                ' fi=' + old.file_index +
                ' hash=' + compact(hash, 10) +
                ' reason=' + reason,
                true
            );

            try {
                console.log('[DDD DBG canonical dry]', key, hash, old, map);
            } catch (e) {}

            return true;
        }

        writeStorage(key, map);

        noty(
            'canonical saved ' +
            'S' + old.season + 'E' + old.episode +
            ' pi=' + old.playlist_index +
            ' fi=' + old.file_index +
            ' pl=' + (old.playlist ? old.playlist.length : 0) +
            ' hash=' + compact(hash, 10) +
            ' reason=' + reason,
            true
        );

        try {
            console.log('[DDD DBG canonical saved]', key, hash, old, map);
        } catch (e) {}

        return changed;
    }

    // ============================================================
    // Bridge body handling
    // ============================================================

    function isBridgeUrl(url) {
        url = String(url || '');

        return (
            url.indexOf('127.0.0.1:39677') !== -1 ||
            url.indexOf('localhost:39677') !== -1
        );
    }

    function collectBridgePayloads(value, out, depth) {
        out = out || [];
        depth = depth || 0;

        if (!value || depth > 8) return out;

        if (Array.isArray(value)) {
            for (var i = 0; i < value.length; i++) {
                collectBridgePayloads(value[i], out, depth + 1);
            }

            return out;
        }

        if (typeof value !== 'object') return out;

        /*
         * Основной формат:
         * { client: "lampa", payload: { uri: "...", position: ... } }
         */
        if (value.payload && typeof value.payload === 'object') {
            var payload = value.payload;

            if (payload.uri || payload.url) {
                out.push({
                    envelope: value,
                    payload: payload
                });
            }

            /*
             * Рекурсивно всё равно смотрим глубже, но текущий payload
             * уже добавили только если у него есть uri/url.
             */
            collectBridgePayloads(payload, out, depth + 1);
        }

        /*
         * Fallback, если DDD когда-нибудь отдаст payload без envelope.
         */
        if ((value.uri || value.url) && (value.position !== undefined || value.duration !== undefined || value.playlistSize !== undefined)) {
            out.push({
                envelope: null,
                payload: value
            });
        }

        Object.keys(value).forEach(function (key) {
            if (key === 'payload') return;

            var child = value[key];

            if (child && typeof child === 'object') {
                collectBridgePayloads(child, out, depth + 1);
            }
        });

        return out;
    }

    function parseBridgeBody(body) {
        if (!body || typeof body !== 'string') return null;

        var parsed = safeParseJson(body);

        if (parsed) return parsed;

        /*
         * Иногда в лог может попасть текст вокруг JSON.
         * Пытаемся вырезать первый JSON-массив или объект.
         */
        var startArray = body.indexOf('[');
        var startObject = body.indexOf('{');

        var start = -1;

        if (startArray >= 0 && startObject >= 0) start = Math.min(startArray, startObject);
        else if (startArray >= 0) start = startArray;
        else if (startObject >= 0) start = startObject;

        if (start < 0) return null;

        var sliced = body.substring(start);
        parsed = safeParseJson(sliced);

        return parsed || null;
    }

    function selectBridgePlaybackPayload(body) {
        var parsed = parseBridgeBody(body);

        if (!parsed) return null;

        var payloads = collectBridgePayloads(parsed, [], 0)
            .filter(function (item) {
                var payload = item && item.payload;
                var uri = payload && (payload.uri || payload.url);

                if (!uri) return false;
                if (String(uri).indexOf('/stream/') === -1) return false;

                return true;
            });

        if (!payloads.length) return null;

        /*
         * Берём последний валидный payload.
         * Если есть payload с position > 0, он предпочтительнее.
         */
        var selected = payloads[payloads.length - 1];

        for (var i = payloads.length - 1; i >= 0; i--) {
            var p = payloads[i].payload;

            if (toNumber(p.position) > 0 || toNumber(p.time) > 0) {
                selected = payloads[i];
                break;
            }
        }

        return selected;
    }

    function normalizePositionToSeconds(payload) {
        payload = payload || {};

        var value = payload.position;

        if (value === undefined) value = payload.time;
        if (value === undefined) value = payload.currentTime;

        value = toNumber(value);

        /*
         * DDD обычно отдаёт миллисекунды.
         */
        if (value > 10000) return value / 1000;

        return value;
    }

    function normalizeDurationToSeconds(payload) {
        payload = payload || {};

        var value = payload.duration;

        if (value === undefined) value = payload.length;

        value = toNumber(value);

        if (value > 10000) return value / 1000;

        return value;
    }

    function buildCanonicalRecordFromBridgePayload(payload, envelope) {
        payload = payload || {};

        var uri = payload.uri || payload.url || '';
        var identity = parseStreamUrl(uri);

        if (!identity) return null;

        var playlist = getSessionPlaylist();
        var found = findPlaylistItemByIdentity(playlist, identity);
        var item = found.item || {};
        var playlistIndex = found.index;

        /*
         * Если в session/meta не нашли, не делаем episode-1/file_index-1.
         * Это принципиально.
         */
        if (playlistIndex < 0 && hasNumber(payload.playlistIndex)) {
            playlistIndex = toInt(payload.playlistIndex);
        }

        if (playlistIndex < 0 && hasNumber(payload.playlist_index)) {
            playlistIndex = toInt(payload.playlist_index);
        }

        if (playlistIndex < 0 && hasNumber(payload.start_index)) {
            playlistIndex = toInt(payload.start_index);
        }

        if (playlistIndex < 0 && state.activeSession && hasNumber(state.activeSession.start_index)) {
            playlistIndex = toInt(state.activeSession.start_index);
        }

        if (playlistIndex < 0) playlistIndex = 0;

        var fileName = (
            identity.file_name ||
            item.file_name ||
            item.title ||
            item.name ||
            item.episode_title ||
            ''
        );

        var parsedSE = parseSeasonEpisodeFromFileName(fileName);
        var itemSE = getItemSeasonEpisode(item);

        var season = parsedSE.season || itemSE.season || 0;
        var episode = parsedSE.episode || itemSE.episode || 0;
        var seSource = parsedSE.source || itemSE.source || '';

        /*
         * Только если есть episode, но нет season,
         * season можно брать из item/session/record.
         */
        if (episode && !season) {
            season = (
                itemSE.season ||
                toInt(item.season) ||
                toInt(item.season_number) ||
                toInt(payload.season) ||
                1
            );

            seSource = seSource || 'episode_with_fallback_season';
        }

        /*
         * Не используем file_index как episode.
         * Для anime/torrent это как раз ломало второй сезон.
         */
        if (!season || !episode) {
            return {
                skipped: true,
                reason: 'no_season_episode_from_file_or_item',
                identity: identity,
                item: item,
                playlistIndex: playlistIndex,
                payload: payload
            };
        }

        var movie = getActiveMovie() || {};
        var lang = getOriginalLanguage(movie) || getOriginalLanguage(payload);

        var originalTitle = getMovieTitle(movie);

        if (!originalTitle) {
            originalTitle = (
                payload.original_title ||
                payload.original_name ||
                payload.title ||
                payload.name ||
                ''
            );
        }

        if (!originalTitle) {
            return {
                skipped: true,
                reason: 'no_movie_title_for_hash',
                identity: identity,
                item: item,
                playlistIndex: playlistIndex,
                payload: payload
            };
        }

        var movieId = getMovieId(movie) || payload.movie_id || payload.id || '';
        var movieKey = getMovieKey(movie);

        if (!movieKey) {
            if (movieId) movieKey = 'id:' + movieId;
            else movieKey = 'title:' + getHash(originalTitle);
        }

        var position = normalizePositionToSeconds(payload);
        var duration = normalizeDurationToSeconds(payload);
        var percent = 0;

        if (duration > 0 && position > 0) {
            percent = Math.round((position / duration) * 100);
            if (percent < 0) percent = 0;
            if (percent > 100) percent = 100;
        }

        var normalizedPlaylist = playlist.length ? playlist : [];

        var record = {
            source: 'ddd',
            ddd_canonical_source: 'bridge_payload_uri',
            ddd_canonical_reason: 'ja_bridge_uri_to_playlist',
            ddd_se_source: seSource,

            movie_id: movieId,
            movie_key: movieKey,

            title: movie.title || movie.name || originalTitle,
            original_title: originalTitle,
            original_name: movie.original_name || movie.originalName || '',
            original_language: lang || 'ja',

            season: season,
            episode: episode,
            episode_title: (
                item.episode_title ||
                item.title ||
                item.name ||
                payload.episode_title ||
                fileName ||
                ''
            ),

            file_name: identity.file_name || fileName,
            torrent_link: identity.torrent_link || item.torrent_link || '',
            file_index: hasNumber(identity.file_index) ? toInt(identity.file_index) : toInt(item.file_index),

            url: uri,
            uri: uri,

            playlist_index: playlistIndex,
            ddd_start_index: playlistIndex,
            start_index: playlistIndex,

            playlist: normalizedPlaylist,

            time: position,
            duration: duration,
            percent: percent,

            hasNext: !!payload.hasNext,
            hasPrevious: !!payload.hasPrevious,
            isPlaying: !!payload.isPlaying,
            isBuffering: !!payload.isBuffering,

            timestamp: now()
        };

        return {
            skipped: false,
            record: record,
            movie: movie,
            identity: identity,
            item: item,
            playlistIndex: playlistIndex,
            payload: payload,
            envelope: envelope
        };
    }

    function handleBridgeBody(url, body) {
        try {
            if (!body) return false;

            if (SHOW_BRIDGE_BODY_IN_NOTY) {
                noty('bridge body ' + compact(body, 700), false);
            }

            try {
                console.log('[DDD DBG bridge body full]', url, body);
            } catch (e) {}

            var selected = selectBridgePlaybackPayload(body);

            if (!selected || !selected.payload) {
                try {
                    console.log('[DDD DBG bridge no playback payload]', url, body);
                } catch (e) {}

                return false;
            }

            var built = buildCanonicalRecordFromBridgePayload(selected.payload, selected.envelope);

            if (!built) {
                noty('bridge skip no canonical build', false);
                return false;
            }

            if (built.skipped) {
                noty('bridge skip ' + built.reason, false);

                try {
                    console.log('[DDD DBG bridge canonical skipped]', built);
                } catch (e) {}

                return false;
            }

            var record = built.record;

            if (!isJapaneseAnimeContext(record, selected.payload)) {
                noty('bridge skip non-ja lang=' + compact(getRecordLanguage(record) || getOriginalLanguage(getActiveMovie()) || '-', 8), false);

                try {
                    console.log('[DDD DBG bridge skip non-ja]', record, selected);
                } catch (e) {}

                return false;
            }

            /*
             * Защита от многократной записи одной и той же точки за один polling.
             */
            var bridgeKey = [
                record.movie_key,
                record.season,
                record.episode,
                record.file_index,
                Math.floor(toNumber(record.time || 0) / 2)
            ].join('|');

            if (
                bridgeKey === state.lastBridgeCanonicalKey &&
                now() - state.lastBridgeCanonicalAt < 1200
            ) {
                return false;
            }

            state.lastBridgeCanonicalKey = bridgeKey;
            state.lastBridgeCanonicalAt = now();

            var hash = generateTimelineHash(getActiveMovie() || record, record.season, record.episode);

            if (!hash) {
                noty('bridge skip no hash S' + record.season + 'E' + record.episode, true);
                return false;
            }

            return saveCanonicalRecord(hash, record, 'bridge');

        } catch (e) {
            warn('handleBridgeBody failed', e);
            return false;
        }
    }

    // ============================================================
    // Storage canonicalization for existing records
    // ============================================================

    function summarizeRecord(record) {
        if (!record || typeof record !== 'object') return 'null';

        return [
            'S' + compact(record.season || 0) + 'E' + compact(record.episode || 0),
            'fi=' + compact(record.file_index),
            'pi=' + compact(record.playlist_index),
            'pl=' + (Array.isArray(record.playlist) ? record.playlist.length : 0),
            't=' + compact(record.timestamp),
            'title=' + compact(record.title || record.original_title || '', 18),
            'ep=' + compact(record.episode_title || '', 18)
        ].join(' ');
    }

    function summarizePointer(pointer) {
        if (!pointer || typeof pointer !== 'object') return 'null';

        return [
            'hash=' + compact(pointer.hash, 10),
            'S' + compact(pointer.season || 0) + 'E' + compact(pointer.episode || 0),
            't=' + compact(pointer.timestamp)
        ].join(' ');
    }

    function getLatestRecordInfo(map) {
        var latest = null;
        var latestHash = '';

        if (!map || typeof map !== 'object') return null;

        Object.keys(map).forEach(function (hash) {
            if (hash === '__last_by_movie') return;

            var item = map[hash];

            if (!item || typeof item !== 'object') return;
            if (!item.file_name && !item.torrent_link && !item.playlist && !item.url && !item.uri) return;

            if (!latest || toInt(item.timestamp) > toInt(latest.timestamp)) {
                latest = item;
                latestHash = hash;
            }
        });

        return latest ? {
            hash: latestHash,
            record: latest
        } : null;
    }

    function getPointerPreview(map) {
        if (!map || typeof map !== 'object' || !map.__last_by_movie) return 'ptr=none';

        var keys = Object.keys(map.__last_by_movie);

        if (!keys.length) return 'ptr=empty';

        var lastKey = keys[keys.length - 1];

        return 'ptrs=' + keys.length +
            ' lastKey=' + compact(lastKey, 16) +
            ' ' + summarizePointer(map.__last_by_movie[lastKey]);
    }

    function canonicalizeJapaneseAnimeDddRecord(record, hash) {
        if (!record || typeof record !== 'object') return false;

        rememberMovieContext(record, 'storage-record');

        if (!isJapaneseAnimeContext(record, null)) return false;

        var playlist = normalizePlaylist(record.playlist || []);
        var recordIdentity = parseStreamIdentityFromObject(record);

        var found = findPlaylistItemByIdentity(playlist, recordIdentity);
        var item = found.item || {};
        var exactPlaylistIndex = found.index;

        var fileName = (
            record.file_name ||
            (recordIdentity && recordIdentity.file_name) ||
            item.file_name ||
            item.title ||
            item.name ||
            record.episode_title ||
            ''
        );

        var parsedSE = parseSeasonEpisodeFromFileName(fileName);
        var itemSE = getItemSeasonEpisode(item);

        var season = parsedSE.season || itemSE.season || toInt(record.season);
        var episode = parsedSE.episode || itemSE.episode || toInt(record.episode);
        var source = parsedSE.source || itemSE.source || 'old_record';

        if (episode && !season) {
            season = itemSE.season || toInt(record.season) || 1;
            source = source + '+fallback_season';
        }

        /*
         * Важно:
         * file_index и episode-1 НЕ используются для вычисления playlist_index.
         */
        var changed = false;

        if (season && toInt(record.season) !== season) {
            record.season = season;
            changed = true;
        }

        if (episode && toInt(record.episode) !== episode) {
            record.episode = episode;
            changed = true;
        }

        if (recordIdentity) {
            if (recordIdentity.file_name && record.file_name !== recordIdentity.file_name) {
                record.file_name = recordIdentity.file_name;
                changed = true;
            }

            if (recordIdentity.torrent_link && record.torrent_link !== recordIdentity.torrent_link) {
                record.torrent_link = recordIdentity.torrent_link;
                changed = true;
            }

            if (hasNumber(recordIdentity.file_index) && toInt(record.file_index) !== toInt(recordIdentity.file_index)) {
                record.file_index = toInt(recordIdentity.file_index);
                changed = true;
            }
        }

        if (exactPlaylistIndex >= 0 && toInt(record.playlist_index) !== exactPlaylistIndex) {
            record.playlist_index = exactPlaylistIndex;
            record.ddd_start_index = exactPlaylistIndex;
            record.start_index = exactPlaylistIndex;
            changed = true;
        }

        if (!record.episode_title) {
            record.episode_title = item.episode_title || item.title || item.name || fileName || '';
            if (record.episode_title) changed = true;
        }

        if (record.source !== 'ddd') {
            record.source = 'ddd';
            changed = true;
        }

        if (record.ddd_canonical_source !== source) {
            record.ddd_canonical_source = source;
            changed = true;
        }

        if (changed) {
            noty(
                'storage canonical ' +
                'S' + record.season + 'E' + record.episode +
                ' src=' + source +
                ' fi=' + compact(record.file_index) +
                ' pi=' + compact(record.playlist_index) +
                ' hash=' + compact(hash, 8),
                true
            );

            try {
                console.log('[DDD DBG storage anime canonical]', hash, record, {
                    source: source,
                    recordIdentity: recordIdentity,
                    exactPlaylistIndex: exactPlaylistIndex,
                    item: item
                });
            } catch (e) {}
        }

        return changed;
    }

    function canonicalizeJapaneseAnimeStorageMap(map) {
        if (!map || typeof map !== 'object') return false;

        var changed = false;

        Object.keys(map).forEach(function (hash) {
            if (hash === '__last_by_movie') return;

            var record = map[hash];

            if (!record || typeof record !== 'object') return;

            if (canonicalizeJapaneseAnimeDddRecord(record, hash)) {
                changed = true;
                if (updateLastPointer(map, hash, record)) changed = true;
            }
        });

        return changed;
    }

    // ============================================================
    // Diagnostics inspectors
    // ============================================================

    function inspectStorageSet(key, value) {
        if (typeof key !== 'string') return;

        if (isSessionStorageKey(key)) {
            rememberSession(value, key, 'storage-set');

            noty(
                'session set key=' + key +
                ' sid=' + compact(value && value.sid, 10) +
                ' start=' + compact(value && (value.start_index || value.ddd_start_index || 0)) +
                ' meta=' + (
                    value &&
                    (
                        value.meta && value.meta.length ||
                        value.playlist && value.playlist.length ||
                        value.items && value.items.length ||
                        0
                    )
                ) +
                ' lang=' + compact(getOriginalLanguage(value && value.movie || value) || '-', 8),
                true
            );

            try {
                console.log('[DDD DBG session set full]', key, value);
            } catch (e) {}

            return;
        }

        if (!isParamsStorageKey(key)) return;

        state.activeParamsStorageKey = key;

        if (value && typeof value === 'object') {
            canonicalizeJapaneseAnimeStorageMap(value);
        }

        var latest = getLatestRecordInfo(value);
        var latestText = latest
            ? ('latestHash=' + compact(latest.hash, 10) + ' ' + summarizeRecord(latest.record))
            : 'latest=none';

        noty(
            'storage set key=' + key +
            ' keys=' + (value && typeof value === 'object' ? Object.keys(value).length : 0) +
            ' ' + latestText,
            true
        );

        noty(getPointerPreview(value), false);

        try {
            console.log('[DDD DBG storage set full]', key, value);
            if (latest) console.log('[DDD DBG storage latest]', latest.hash, latest.record);
            if (value && value.__last_by_movie) console.log('[DDD DBG storage pointers]', value.__last_by_movie);
        } catch (e) {}
    }

    function inspectStorageGet(key, value) {
        if (typeof key !== 'string') return;

        if (isSessionStorageKey(key)) {
            rememberSession(value, key, 'storage-get');
            return;
        }

        if (!isParamsStorageKey(key)) return;

        state.activeParamsStorageKey = key;

        if (value && typeof value === 'object') {
            canonicalizeJapaneseAnimeStorageMap(value);
        }

        try {
            console.log('[DDD DBG storage get]', key, value);
        } catch (e) {}

        var latest = getLatestRecordInfo(value);
        var text = latest ? summarizeRecord(latest.record) : 'none';

        noty('storage get key=' + key + ' latest=' + text, false);
    }

    function inspectPlayerParams(params) {
        if (!params || typeof params !== 'object') return;

        rememberMovieContext(params, 'player-params');

        var playlist = normalizePlaylist(params.playlist || []);
        var pi = 0;

        if (hasNumber(params.playlist_index)) pi = toInt(params.playlist_index);
        else if (hasNumber(params.ddd_start_index)) pi = toInt(params.ddd_start_index);
        else if (hasNumber(params.start_index)) pi = toInt(params.start_index);
        else if (hasNumber(params.playlistIndex)) pi = toInt(params.playlistIndex);

        var item = playlist[pi] || null;
        var identity = parseStreamIdentityFromObject(item || params);
        var se = getItemSeasonEpisode(item || params);

        var text = [
            'play',
            'pi=' + pi,
            'pl=' + playlist.length,
            'pS=' + compact(params.season || 0) + ' pE=' + compact(params.episode || 0),
            'iS=' + compact(se.season || 0),
            'iE=' + compact(se.episode || 0),
            'fi=' + compact(identity && identity.file_index),
            'lang=' + compact(getOriginalLanguage(params) || getOriginalLanguage(getActiveMovie()) || '-', 8),
            'it=' + compact(item && (item.title || item.name || item.episode_title || ''), 18)
        ].join(' ');

        noty(text, true);

        try {
            console.log('[DDD DBG Player.play params]', params, 'selectedItem', item, 'identity', identity, 'se', se);
        } catch (e) {}
    }

    // ============================================================
    // Patches
    // ============================================================

    function patchStorage() {
        try {
            if (!window.Lampa || !Lampa.Storage || Lampa.Storage.__ddd_diag_patch) return;

            var originalSet = Lampa.Storage.set;
            var originalGet = Lampa.Storage.get;
            var originalSync = Lampa.Storage.sync;

            if (typeof originalSet === 'function') {
                Lampa.Storage.set = function (key, value) {
                    if (!state.suppressStoragePatch && isDddStorageKey(key)) {
                        inspectStorageSet(key, value);
                    }

                    return originalSet.apply(this, arguments);
                };
            }

            if (typeof originalGet === 'function') {
                Lampa.Storage.get = function (key) {
                    var value = originalGet.apply(this, arguments);

                    if (!state.suppressStoragePatch && isDddStorageKey(key)) {
                        inspectStorageGet(key, value);
                    }

                    return value;
                };
            }

            if (typeof originalSync === 'function') {
                Lampa.Storage.sync = function (key) {
                    if (!state.suppressStoragePatch && isDddStorageKey(key)) {
                        noty('storage sync key=' + key, false);
                    }

                    return originalSync.apply(this, arguments);
                };
            }

            Lampa.Storage.__ddd_diag_patch = true;

            noty('storage patch ready ' + PLUGIN_VERSION, true);
        } catch (e) {
            warn('storage patch failed', e);
        }
    }

    function patchPlayer() {
        try {
            if (!window.Lampa || !Lampa.Player || !Lampa.Player.play || Lampa.Player.__ddd_diag_patch) return;

            var originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (params) {
                inspectPlayerParams(params);
                return originalPlay.apply(this, arguments);
            };

            Lampa.Player.__ddd_diag_patch = true;

            noty('player patch ready', false);
        } catch (e) {
            warn('player patch failed', e);
        }
    }

    function patchFetch() {
        try {
            if (!window.fetch || window.fetch.__ddd_diag_patch) return;

            var originalFetch = window.fetch;

            var patchedFetch = function () {
                var input = arguments[0];
                var url = typeof input === 'string' ? input : (input && input.url) || '';
                var bridge = isBridgeUrl(url);
                var started = now();

                if (bridge) {
                    noty('bridge req ' + compact(url, 90), true);

                    try {
                        console.log('[DDD DBG bridge fetch request]', url, arguments);
                    } catch (e) {}
                }

                return originalFetch.apply(this, arguments).then(function (response) {
                    if (!bridge) return response;

                    noty('bridge res ' + response.status + ' ' + compact(url, 70), true);

                    try {
                        var clone = response.clone();

                        clone.text().then(function (body) {
                            try {
                                console.log(
                                    '[DDD DBG bridge fetch response]',
                                    url,
                                    'status=' + response.status,
                                    'ms=' + (now() - started),
                                    body
                                );
                            } catch (e) {}

                            if (SHOW_BRIDGE_BODY_IN_NOTY) {
                                noty('bridge body ' + compact(body || '', 700), false);
                            }

                            handleBridgeBody(url, body);
                        }).catch(function (e) {
                            warn('bridge body read failed', e, isAbortError(e));
                        });
                    } catch (e) {
                        warn('bridge clone/read setup failed', e, isAbortError(e));
                    }

                    return response;
                }).catch(function (e) {
                    if (bridge) {
                        /*
                         * AbortError от polling/fetch timeout не считаем причиной бага.
                         */
                        if (isAbortError(e)) {
                            try {
                                console.warn('[DDD DBG] bridge aborted', url, e);
                            } catch (ee) {}

                            noty('bridge aborted', false);
                        } else {
                            warn('bridge fail ' + (e && e.message || e), e);
                        }
                    }

                    throw e;
                });
            };

            patchedFetch.__ddd_diag_patch = true;
            window.fetch = patchedFetch;

            noty('fetch patch ready', false);
        } catch (e) {
            warn('fetch patch failed', e);
        }
    }

    function patchErrors() {
        try {
            if (window.__ddd_diag_errors_patch) return;

            window.__ddd_diag_errors_patch = true;

            window.addEventListener('error', function (event) {
                warn('script error ' + compact(event && event.message, 90), event);
            });

            window.addEventListener('unhandledrejection', function (event) {
                var reason = event && event.reason;

                if (isAbortError(reason)) {
                    try {
                        console.warn('[DDD DBG] promise abort', reason);
                    } catch (e) {}

                    return;
                }

                warn('promise rejection ' + compact(reason && reason.message || reason, 90), reason);
            });
        } catch (e) {}
    }

    // ============================================================
    // Core loader
    // ============================================================

    function evalCore(text) {
        var patched = String(text || '');

        patched = patched.replace('var DDD_DEBUG = false;', 'var DDD_DEBUG = true;');
        patched += '\n//# sourceURL=ContinueWatching.diag.loaded.js';

        (new Function(patched))();
    }

    function loadCore() {
        if (window.__CONTINUE_WATCH_DDD_LAYER_V3__) {
            noty('core already loaded; only diagnostics active', true);
            return;
        }

        noty('loading ContinueWatching diagnostic core', true);

        fetch(CORE_URL, {
            cache: 'no-store'
        })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.text();
            })
            .then(function (text) {
                evalCore(text);
                noty('core loaded with DDD_DEBUG=true', true);
            })
            .catch(function (e) {
                warn('core fetch/eval failed, fallback script load: ' + (e && e.message || e), e);

                var script = document.createElement('script');

                script.src = CORE_URL;
                script.async = true;

                script.onload = function () {
                    noty('core fallback script loaded', true);
                };

                script.onerror = function () {
                    warn('core fallback script failed');
                };

                document.head.appendChild(script);
            });
    }

    // ============================================================
    // Public debug API
    // ============================================================

    window.DDDDiagnostic = {
        version: PLUGIN_VERSION,

        state: state,

        parseStreamUrl: parseStreamUrl,
        parseSeasonEpisodeFromFileName: parseSeasonEpisodeFromFileName,

        getParamsStorageKey: getParamsStorageKey,
        getSessionStorageKey: getSessionStorageKey,

        getSessionPlaylist: getSessionPlaylist,
        findPlaylistIndexByIdentity: findPlaylistIndexByIdentity,

        handleBridgeBody: handleBridgeBody,
        buildCanonicalRecordFromBridgePayload: buildCanonicalRecordFromBridgePayload,

        canonicalizeJapaneseAnimeDddRecord: canonicalizeJapaneseAnimeDddRecord,
        canonicalizeJapaneseAnimeStorageMap: canonicalizeJapaneseAnimeStorageMap,

        inspectStorageSet: inspectStorageSet,
        inspectStorageGet: inspectStorageGet,
        inspectPlayerParams: inspectPlayerParams
    };

    // ============================================================
    // Boot
    // ============================================================

    function installPatchesLoop() {
        patchStorage();
        patchFetch();
        patchErrors();

        var started = now();

        var timer = setInterval(function () {
            patchStorage();
            patchPlayer();

            if (now() - started > 30000) {
                clearInterval(timer);
            }
        }, 500);
    }

    installPatchesLoop();
    loadCore();

})();
