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
            if (!CONFIG.justTransportEnabled) return