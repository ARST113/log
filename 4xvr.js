(function () {
    'use strict';

    var pluginId = 'lampa_4xvr_url_fix';

    if (window[pluginId + '_ready']) return;

    window[pluginId + '_ready'] = true;

    function normalizePlayerUrl(url) {
        if (typeof url !== 'string') return url;

        return url
            .replace(/&amp;/gi, '&')
            .replace(/\\u0026/gi, '&')
            .replace(/%5c+%26/gi, '&')
            .replace(/%5c+&/gi, '&')
            .replace(/\\+%26/g, '&')
            .replace(/\\+&/g, '&')
            .replace(/([?&])preload(?=(&|$))/g, '$1play');
    }

    function normalizePlayerData(data) {
        if (!data || typeof data !== 'object') return data;

        if (typeof data.url === 'string') {
            data.url = normalizePlayerUrl(data.url);
        }

        if (Array.isArray(data.playlist)) {
            data.playlist.forEach(function (item) {
                if (item && typeof item.url === 'string') {
                    item.url = normalizePlayerUrl(item.url);
                }
            });
        }

        return data;
    }

    function patchAndroidOpenPlayer() {
        if (!window.Lampa || !Lampa.Android || typeof Lampa.Android.openPlayer !== 'function') {
            return false;
        }

        if (Lampa.Android.openPlayer[pluginId]) {
            return true;
        }

        var originalOpenPlayer = Lampa.Android.openPlayer;

        Lampa.Android.openPlayer = function (link, data) {
            var normalizedLink = normalizePlayerUrl(link);
            var normalizedData = normalizePlayerData(data);

            return originalOpenPlayer.call(this, normalizedLink, normalizedData);
        };

        Lampa.Android.openPlayer[pluginId] = true;

        if (window.console && console.log) {
            console.log('[4XVR URL Fix] Android.openPlayer URL normalizer enabled');
        }

        return true;
    }

    function waitAndPatch(attempt) {
        if (patchAndroidOpenPlayer()) return;

        if (attempt < 60) {
            setTimeout(function () {
                waitAndPatch(attempt + 1);
            }, 500);
        }
    }

    waitAndPatch(0);
})();
