(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__DDD_DIAGNOSTIC_DEBUGER_LOADER__) return;
    window.__DDD_DIAGNOSTIC_DEBUGER_LOADER__ = true;

    var PLUGIN_NAME = 'DDD Diagnostic Wrapper';
    var PLUGIN_VERSION = 'diag-20260507-1';
    var CORE_URL = 'https://arst113.github.io/log/ContinueWatching.js?v=diag-20260507-1';
    var NOTY_MIN_INTERVAL = 350;
    var lastNoty = '';
    var lastNotyAt = 0;

    function now() {
        return Date.now ? Date.now() : new Date().getTime();
    }

    function safeJson(value, maxLen) {
        var out = '';
        try {
            out = JSON.stringify(value);
        } catch (e) {
            out = String(value);
        }
        if (maxLen && out.length > maxLen) return out.substring(0, maxLen) + '…';
        return out;
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

    function safeDecode(value) {
        try { return decodeURIComponent(value); } catch (e) { return value; }
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
            noty('session set key=' + key + ' sid=' + compact(value && value.sid, 10) + ' start=' + compact(value && value.start_index) + ' meta=' + (value && value.meta && value.meta.length || value && value.playlist && value.playlist.length || 0), true);
            try { console.log('[DDD DBG session set full]', key, value); } catch (e) {}
            return;
        }

        if (key.indexOf('continue_watch_params') !== 0) return;

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
        inspectPlayerParams: inspectPlayerParams
    };

    installPatchesLoop();
    loadCore();
})();
