/*
 * ARX Live Search for Lampa
 * Restores responsive native CUB/TMDB search results while typing.
 * No external API, DOM replacement, or modifications to Lampa.Manifest.plugins.
 * Compatible with the search sources/create/results API used by Lampa 2.x.
 * Version: 1.0.0
 */
(function () {
    'use strict';

    var FLAG = '__arx_live_search_v100';
    if (window[FLAG]) return;
    window[FLAG] = true;

    var initialized = false;
    var waiting = 0;
    var MAX_RETRIES = 40;

    function setting(name, fallback) {
        try {
            if (window.Lampa && Lampa.Storage && typeof Lampa.Storage.get === 'function') {
                return Lampa.Storage.get(name, fallback);
            }
        } catch (e) {}
        return fallback;
    }

    function enabled() {
        var value = setting('arx_live_search_enabled', true);
        return value !== false && value !== 'false' && value !== 0 && value !== '0';
    }

    function delay() {
        var value = parseInt(setting('arx_live_search_delay', '450'), 10);
        if (!isFinite(value)) value = 450;
        return Math.max(200, Math.min(value, 1500));
    }

    function enhanceResult(result) {
        if (!result || typeof result.search !== 'function' || result._arxLiveSearchV1) return;
        result._arxLiveSearchV1 = true;

        var nativeSearch = result.search;
        var nativeCancel = result.cancel;
        var queued = null;
        var lastDispatched = null;

        function stopQueue() {
            if (queued !== null) {
                clearTimeout(queued);
                queued = null;
            }
        }

        // Native Result.search remembers its last executed query. If a request for
        // that query was aborted and the user types it again, it may skip the retry.
        // Reset that internal guard only when the same query is actually retried.
        function dispatch(value) {
            queued = null;
            if (lastDispatched === value) {
                nativeSearch.call(result, value.slice(0, 2), true);
            }
            lastDispatched = value;
            nativeSearch.call(result, value, true);
        }

        result.search = function (value, immediately) {
            stopQueue();

            var text = typeof value === 'string' ? value : String(value || '');

            // Retain native handling of short/empty queries (history, clear).
            // Manual searches and selection from history must never be delayed.
            if (!enabled() || immediately || text.trim().length < 3) {
                lastDispatched = text;
                return nativeSearch.apply(this, arguments);
            }

            queued = setTimeout(function () {
                dispatch(text);
            }, delay());
        };

        result.cancel = function () {
            stopQueue();
            if (typeof nativeCancel === 'function') {
                return nativeCancel.apply(this, arguments);
            }
        };
    }

    function attachSources(data) {
        var sources = data && data.sources;
        if (!sources || !sources.listener || typeof sources.listener.follow !== 'function') return;
        if (sources._arxLiveSearchSourcesV1) return;
        sources._arxLiveSearchSourcesV1 = true;

        // In Lampa's Sources.create(), the 'create' event is emitted while
        // individual Result objects are being built, before input is processed.
        sources.listener.follow('create', function (data) {
            if (data && data.result) enhanceResult(data.result);
        });
    }

    function registerSettings() {
        try {
            if (!Lampa.SettingsApi || typeof Lampa.SettingsApi.addComponent !== 'function' ||
                typeof Lampa.SettingsApi.addParam !== 'function') return;

            var component = 'arx_live_search';
            Lampa.SettingsApi.addComponent({
                component: component,
                name: 'ARX — Живой поиск',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'
            });
            Lampa.SettingsApi.addParam({
                component: component,
                param: {
                    name: 'arx_live_search_enabled',
                    type: 'trigger',
                    default: true
                },
                field: {
                    name: 'Живые результаты',
                    description: 'Показывать штатные карточки CUB и TMDB при наборе от 3 символов'
                }
            });
            Lampa.SettingsApi.addParam({
                component: component,
                param: {
                    name: 'arx_live_search_delay',
                    type: 'select',
                    values: {
                        '300': '300 мс — быстро',
                        '450': '450 мс — рекомендуется',
                        '650': '650 мс — умеренно',
                        '900': '900 мс — экономно'
                    },
                    default: '450'
                },
                field: {
                    name: 'Задержка перед поиском',
                    description: 'Новый запрос отправляется после паузы при вводе; снижает нагрузку на API'
                }
            });
        } catch (e) {
            console.warn('[ARX Live Search] Settings registration failed:', e);
        }
    }

    function init() {
        if (initialized) return true;
        if (!window.Lampa || !Lampa.Search || !Lampa.Search.listener ||
            typeof Lampa.Search.listener.follow !== 'function') return false;

        initialized = true;
        Lampa.Search.listener.follow('sources', attachSources);
        registerSettings();
        console.log('[ARX Live Search] v1.0.0 ready; native result cards, 3+ characters');
        return true;
    }

    function retryInit() {
        if (init() || waiting++ >= MAX_RETRIES) return;
        setTimeout(retryInit, 250);
    }

    if (window.appready) {
        retryInit();
    } else if (window.Lampa && Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
        Lampa.Listener.follow('app', function (event) {
            if (event && event.type === 'ready') retryInit();
        });
    } else {
        retryInit();
    }
})();