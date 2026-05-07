(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__DDD_DIAGNOSTIC_DEBUGER_LOADER__) return;
    window.__DDD_DIAGNOSTIC_DEBUGER_LOADER__ = true;

    var PLUGIN_NAME = 'DDD Diagnostic Wrapper';
    var PLUGIN_VERSION = 'diag-ja-canonical-20260507-1';
    var CORE_URL = 'https://arst113.github.io/log/ContinueWatching.js?v=diag-ja-canonical-20260507-1';
    var NOTY_MIN_INTERVAL = 350;
    var lastNoty = '';
    var lastNotyAt = 0;
    var movieContext = {};

    function now() {
        return Date.now ? Date.now() : new Date().getTime();
    }

    function compact(value, maxLen) {
        if (value === undefined) return '-';
        if (value === null) return 'null';
        var s = String(value);
        if (maxLen && s.length > maxLen) return s.substring(0, maxLen) + '…';
        return s;
    }

    function toInt(value) {
        var n = Number(value || 0);
        return isFinite(n) ? Math.floor(n) : 0;
    }

    function noty(message, force) {
        message = '[DDD DBG] ' + String(message || '');
        try { console.log(message); } catch (e) {}

        var t = now();
        if (!force && message === lastNoty && t - lastNotyAt < NOTY_MIN_INTERVAL) return;
        lastNoty = message;
        lastNotyAt = t;

        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
        } catch (e) {}
    }

    function warn(message, data) {
        try { console.warn('[DDD DBG]', message, data || ''); } catch (e) {}
        noty('WARN ' + message, true);
    }

    function safeDecode(value) {
        try { return decodeURIComponent(value); } catch (e) { return value; }
    }

    function isDddStorageKey(key) {
        return typeof key === 'string' && (
            key.indexOf('continue_watch_params') === 0 ||
            key.indexOf('continue_watch_ddd_session') === 0
        );
    }

    function parseStreamUrl(url) {
        if (!url || typeof url !== 'string') return null;
        var fileMatch = url.match(/\/stream\/([^?]+)/);
        var linkMatch = url.match(/[?&]link=([^&#]+)/);
        var indexMatch = url.match(/[?&]index=(\d+)/);
        if (!fileMatch && !indexMatch) return null;
        return {
            file_name: fileMatch ? safeDecode(fileMatch[1]) : '',
            torrent_link: linkMatch ? safeDecode(linkMatch[1]) : '',
            file_index: indexMatch ? parseInt(indexMatch[1], 10) : 0
        };
    }

    function getFileIndexFromUrl(url) {
        var parsed = parseStreamUrl(url || '');
        return parsed ? toInt(parsed.file_index) : 0;
    }

    function getHash(value) {
        try {
            if (value && window.Lampa && Lampa.Utils && Lampa.Utils.hash) return String(Lampa.Utils.hash(String(value)));
        } catch (e) {}
        return '';
    }

    function getRecordMovieKey(record) {
        record = record || {};
        if (record.movie_key) return String(record.movie_key);
        if (record.movie_id) return 'id:' + String(record.movie_id);
        var title = record.original_title || record.original_name || record.title || record.name || '';
        var hash = getHash(title);
        return hash ? 'title:' + hash : '';
    }

    function rememberContext(obj, source) {
        if (!obj || typeof obj !== 'object') return;

        var card = obj.card || obj.movie || obj.data || obj;
        var lang = card.original_language || card.originalLanguage || obj.original_language || obj.originalLanguage || '';
        var id = card.id || card.movie_id || obj.movie_id || '';
        var title = card.original_name || card.original_title || card.name || card.title || obj.original_title || obj.title || '';
        var key = '';

        if (id) key = 'id:' + String(id);
        else {
            var titleHash = getHash(title);
            if (titleHash) key = 'title:' + titleHash;
        }

        if (!key && obj.movie_key) key = String(obj.movie_key);
        if (!key) return;

        movieContext[key] = {
            lang: String(lang || '').toLowerCase(),
            title: title || '',
            source: source || '',
            ts: now()
        };

        if (id) movieContext['id:' + String(id)] = movieContext[key];
        if (title) {
            var h = getHash(title);
            if (h) movieContext['title:' + h] = movieContext[key];
        }
    }

    function getRecordLanguage(record) {
        record = record || {};
        var lang = record.original_language || record.originalLanguage || record.language || '';
        if (lang) return String(lang).toLowerCase();

        var key = getRecordMovieKey(record);
        if (key && movieContext[key] && movieContext[key].lang) return movieContext[key].lang;

        return '';
    }

    function parseSeasonEpisodeFromFileName(fileName) {
        fileName = String(fileName || '');
        var m;

        m = fileName.match(/\bS\s*0?(\d{1,2})\s*[-_. ]+\s*0?(\d{1,3})\b/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0, source: 'file_name_s_dash_e' };

        m = fileName.match(/\bS\s*0?(\d{1,2})\s*E\s*0?(\d{1,3})\b/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0, source: 'file_name_sxe' };

        m = fileName.match(/\b0?(\d{1,2})\s*[xх×]\s*0?(\d{1,3})\b/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0, source: 'file_name_1x02' };

        m = fileName.match(/season\s*0?(\d{1,2}).*?(?:episode|ep\.?)\s*0?(\d{1,3})/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0, source: 'file_name_season_episode' };

        m = fileName.match(/(?:эпизод|сер(?:ия|ии|и)?|episode|ep\.?|сер\.)\s*[-–—:]?\s*0?(\d{1,4})/i);
        if (m) return { season: 0, episode: parseInt(m[1], 10) || 0, source: 'file_name_episode_text' };

        return { season: 0, episode: 0, source: '' };
    }

    function isJapaneseAnimeDddCase(record) {
        record = record || {};

        var lang = getRecordLanguage(record);
        if (lang !== 'ja') return false;

        var playlist = Array.isArray(record.playlist) ? record.playlist : [];
        var playlistSize = playlist.length || toInt(record.playlistSize || record.playlist_size);
        if (playlistSize <= 1) return false;

        var pi = toInt(record.playlist_index);
        var item = playlist[pi] || {};
        var fileName = String(record.file_name || item.file_name || item.title || item.name || record.episode_title || '');
        var url = String(record.url || record.uri || item.url || '');
        var hasDddFileIdentity = !!fileName || /[?&]index=\d+/i.test(url) || record.file_index !== undefined;

        return hasDddFileIdentity;
    }

    function canonicalizeJapaneseAnimeDddRecord(record, hash) {
        if (!record || typeof record !== 'object') return false;
        if (!isJapaneseAnimeDddCase(record)) return false;

        var playlist = Array.isArray(record.playlist) ? record.playlist : [];
        var oldSeason = toInt(record.season);
        var oldEpisode = toInt(record.episode);
        var oldPi = toInt(record.playlist_index);
        var pi = oldPi;

        if (!isFinite(pi) || pi < 0) pi = toInt(record.ddd_start_index);
        if (!isFinite(pi) || pi < 0) pi = toInt(record.start_index);
        if (!isFinite(pi) || pi < 0) pi = 0;

        var item = playlist[pi] || {};
        var fileName = record.file_name || item.file_name || item.title || item.name || record.episode_title || '';
        var url = record.url || record.uri || item.url || '';
        var fileIndex = toInt(record.file_index) || getFileIndexFromUrl(url) || toInt(item.file_index) || getFileIndexFromUrl(item.url || '');
        var fromFile = parseSeasonEpisodeFromFileName(fileName);

        var itemSeason = toInt(item.season) || toInt(item.season_number) || toInt(item.seasonNumber);
        var itemEpisode = toInt(item.episode) || toInt(item.episode_number) || toInt(item.episodeNumber) || toInt(item.number) || toInt(item.num);

        var season = oldSeason;
        var episode = oldEpisode;
        var source = 'old_record';

        if (fromFile.season && fromFile.episode) {
            season = fromFile.season;
            episode = fromFile.episode;
            source = fromFile.source;
        } else if (fromFile.episode) {
            season = oldSeason || itemSeason || 1;
            episode = fromFile.episode;
            source = fromFile.source;
        } else if (fileIndex > 0) {
            season = oldSeason || itemSeason || 1;
            episode = fileIndex;
            source = 'url_file_index';
        } else if (itemSeason && itemEpisode) {
            season = itemSeason;
            episode = itemEpisode;
            source = 'playlist_item';
        } else if (pi >= 0) {
            season = oldSeason || itemSeason || 1;
            episode = pi + 1;
            source = 'playlist_index_plus_one';
        }

        if (episode && !season) season = 1;

        var expectedPi = pi;
        if (episode > 0 && playlist.length >= episode) expectedPi = episode - 1;
        else if (fileIndex > 0 && playlist.length >= fileIndex) expectedPi = fileIndex - 1;

        var changed = false;
        if (season && toInt(record.season) !== season) { record.season = season; changed = true; }
        if (episode && toInt(record.episode) !== episode) { record.episode = episode; changed = true; }
        if (fileIndex && toInt(record.file_index) !== fileIndex) { record.file_index = fileIndex; changed = true; }
        if (expectedPi >= 0 && toInt(record.playlist_index) !== expectedPi) { record.playlist_index = expectedPi; changed = true; }

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

        if (changed || oldSeason !== season || oldEpisode !== episode || oldPi !== expectedPi) {
            noty(
                'anime canonical old=S' + oldSeason + 'E' + oldEpisode +
                ' new=S' + (record.season || 0) + 'E' + (record.episode || 0) +
                ' src=' + source +
                ' fi=' + compact(record.file_index) +
                ' pi=' + compact(record.playlist_index) +
                ' start=' + compact(record.playlist_index) +
                ' hash=' + compact(hash, 8),
                true
            );
            try { console.log('[DDD DBG anime canonical]', hash, record, { oldSeason: oldSeason, oldEpisode: oldEpisode, oldPi: oldPi, source: source, fileName: fileName, url: url }); } catch (e) {}
        }

        return changed;
    }

    function refreshLastPointerForRecord(map, hash, record) {
        if (!map || !hash || !record || !record.season || !record.episode) return false;
        var movieKey = getRecordMovieKey(record);
        if (!movieKey) return false;

        if (!map.__last_by_movie) map.__last_by_movie = {};

        var pointer = map.__last_by_movie[movieKey] || {};
        var changed = pointer.hash !== hash || toInt(pointer.season) !== toInt(record.season) || toInt(pointer.episode) !== toInt(record.episode);

        map.__last_by_movie[movieKey] = {
            hash: hash,
            season: toInt(record.season),
            episode: toInt(record.episode),
            timestamp: toInt(record.timestamp) || now()
        };

        return changed;
    }

    function canonicalizeJapaneseAnimeStorageMap(map) {
        if (!map || typeof map !== 'object') return false;

        var changed = false;
        Object.keys(map).forEach(function (hash) {
            if (hash === '__last_by_movie') return;
            var record = map[hash];
            if (!record || typeof record !== 'object') return;

            rememberContext(record, 'storage-record');

            if (canonicalizeJapaneseAnimeDddRecord(record, hash)) {
                changed = true;
                if (refreshLastPointerForRecord(map, hash, record)) changed = true;
            }
        });

        return changed;
    }

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
            if (!item.file_name && !item.torrent_link && !item.playlist) return;
            if (!latest || toInt(item.timestamp) > toInt(latest.timestamp)) {
                latest = item;
                latestHash = hash;
            }
        });

        return latest ? { hash: latestHash, record: latest } : null;
    }

    function getPointerPreview(map) {
        if (!map || typeof map !== 'object' || !map.__last_by_movie) return 'ptr=none';
        var keys = Object.keys(map.__last_by_movie);
        if (!keys.length) return 'ptr=empty';
        var lastKey = keys[keys.length - 1];
        return 'ptrs=' + keys.length + ' lastKey=' + compact(lastKey, 16) + ' ' + summarizePointer(map.__last_by_movie[lastKey]);
    }

    function inspectStorageSet(key, value) {
        if (typeof key !== 'string') return;

        if (key.indexOf('continue_watch_ddd_session') === 0) {
            rememberContext(value, 'session');
            noty('session set key=' + key + ' sid=' + compact(value && value.sid, 10) + ' start=' + compact(value && value.start_index) + ' meta=' + (value && value.meta && value.meta.length || value && value.playlist && value.playlist.length || 0), true);
            try { console.log('[DDD DBG session set full]', key, value); } catch (e) {}
            return;
        }

        if (key.indexOf('continue_watch_params') !== 0) return;

        canonicalizeJapaneseAnimeStorageMap(value);

        var latest = getLatestRecordInfo(value);
        var latestText = latest ? ('latestHash=' + compact(latest.hash, 10) + ' ' + summarizeRecord(latest.record)) : 'latest=none';
        noty('storage set key=' + key + ' keys=' + (value && typeof value === 'object' ? Object.keys(value).length : 0) + ' ' + latestText, true);
        noty(getPointerPreview(value), false);

        try {
            console.log('[DDD DBG storage set full]', key, value);
            if (latest) console.log('[DDD DBG storage latest]', latest.hash, latest.record);
            if (value && value.__last_by_movie) console.log('[DDD DBG storage pointers]', value.__last_by_movie);
        } catch (e) {}
    }

    function inspectStorageGet(key, value) {
        if (typeof key !== 'string') return;
        if (key.indexOf('continue_watch_params') !== 0 && key.indexOf('continue_watch_ddd_session') !== 0) return;

        try { console.log('[DDD DBG storage get]', key, value); } catch (e) {}

        if (key.indexOf('continue_watch_params') === 0) {
            var latest = getLatestRecordInfo(value);
            var text = latest ? summarizeRecord(latest.record) : 'none';
            noty('storage get key=' + key + ' latest=' + text, false);
        }
    }

    function inspectPlayerParams(params) {
        if (!params || typeof params !== 'object') return;
        rememberContext(params, 'player');

        var playlist = Array.isArray(params.playlist) ? params.playlist : [];
        var pi = toInt(params.playlist_index || params.ddd_start_index || params.start_index || params.playlistIndex || 0);
        var item = playlist[pi] || null;
        var parsed = parseStreamUrl((item && item.url) || params.url || '');

        var text = [
            'play',
            'pi=' + pi,
            'pl=' + playlist.length,
            'pS=' + compact(params.season || 0) + ' pE=' + compact(params.episode || 0),
            'iS=' + compact(item && (item.season || item.season_number || item.seasonNumber || 0)),
            'iE=' + compact(item && (item.episode || item.episode_number || item.episodeNumber || item.number || 0)),
            'fi=' + compact(parsed && parsed.file_index),
            'lang=' + compact(getRecordLanguage(params) || '-'),
            'it=' + compact(item && (item.title || item.name || item.episode_title || ''), 18)
        ].join(' ');

        noty(text, true);
        try { console.log('[DDD DBG Player.play params]', params, 'selectedItem', item, 'parsed', parsed); } catch (e) {}
    }

    function isBridgeUrl(url) {
        url = String(url || '');
        return url.indexOf('127.0.0.1:39677') !== -1 || url.indexOf('localhost:39677') !== -1;
    }

    function patchStorage() {
        try {
            if (!window.Lampa || !Lampa.Storage || Lampa.Storage.__ddd_diag_patch) return;

            var originalSet = Lampa.Storage.set;
            var originalGet = Lampa.Storage.get;
            var originalSync = Lampa.Storage.sync;

            if (typeof originalSet === 'function') {
                Lampa.Storage.set = function (key, value) {
                    if (isDddStorageKey(key)) inspectStorageSet(key, value);
                    return originalSet.apply(this, arguments);
                };
            }

            if (typeof originalGet === 'function') {
                Lampa.Storage.get = function (key) {
                    var value = originalGet.apply(this, arguments);
                    if (isDddStorageKey(key)) inspectStorageGet(key, value);
                    return value;
                };
            }

            if (typeof originalSync === 'function') {
                Lampa.Storage.sync = function (key) {
                    if (isDddStorageKey(key)) noty('storage sync key=' + key, false);
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
                    try { console.log('[DDD DBG bridge fetch request]', url, arguments); } catch (e) {}
                }

                return originalFetch.apply(this, arguments).then(function (response) {
                    if (!bridge) return response;

                    noty('bridge res ' + response.status + ' ' + compact(url, 70), true);

                    try {
                        var clone = response.clone();
                        clone.text().then(function (body) {
                            var text = compact(body || '', 700);
                            console.log('[DDD DBG bridge fetch response]', url, 'status=' + response.status, 'ms=' + (now() - started), body);
                            noty('bridge body ' + text, false);
                        }).catch(function (e) {
                            warn('bridge body read failed', e);
                        });
                    } catch (e) {}

                    return response;
                }).catch(function (e) {
                    if (bridge) {
                        warn('bridge fail ' + (e && e.message || e), e);
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
                warn('promise rejection ' + compact(reason && reason.message || reason, 90), reason);
            });
        } catch (e) {}
    }

    function installPatchesLoop() {
        patchStorage();
        patchFetch();
        patchErrors();

        var started = now();
        var timer = setInterval(function () {
            patchStorage();
            patchPlayer();
            if (now() - started > 30000) clearInterval(timer);
        }, 500);
    }

    function evalCore(text) {
        var patched = String(text || '').replace('var DDD_DEBUG = false;', 'var DDD_DEBUG = true;');
        patched += '\n//# sourceURL=ContinueWatching.diag.loaded.js';
        (new Function(patched))();
    }

    function loadCore() {
        if (window.__CONTINUE_WATCH_DDD_LAYER_V3__) {
            noty('core already loaded; only diagnostics active', true);
            return;
        }

        noty('loading ContinueWatching diagnostic core', true);

        fetch(CORE_URL, { cache: 'no-store' })
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
                script.onload = function () { noty('core fallback script loaded', true); };
                script.onerror = function () { warn('core fallback script failed'); };
                document.head.appendChild(script);
            });
    }

    window.DDDDiagnostic = {
        version: PLUGIN_VERSION,
        inspectStorageSet: inspectStorageSet,
        inspectStorageGet: inspectStorageGet,
        inspectPlayerParams: inspectPlayerParams,
        canonicalizeJapaneseAnimeStorageMap: canonicalizeJapaneseAnimeStorageMap,
        canonicalizeJapaneseAnimeDddRecord: canonicalizeJapaneseAnimeDddRecord,
        movieContext: movieContext
    };

    installPatchesLoop();
    loadCore();
})();
