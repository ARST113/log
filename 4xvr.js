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

    function normalizePlayerDataString(dataString) {
        if (typeof dataString !== 'string') return dataString;

        try {
            return JSON.stringify(normalizePlayerData(JSON.parse(dataString)));
        }
        catch (e) {
            return dataString;
        }
    }

    function patchAndroidJsOpenPlayer() {
        if (typeof AndroidJS === 'undefined' || typeof AndroidJS.openPlayer !== 'function') {
            return false;
        }

        if (window[pluginId + '_androidjs_patched']) {
            return true;
        }

        try {
            var originalOpenPlayer = AndroidJS.openPlayer;

            AndroidJS.openPlayer = function (link, dataString) {
                return originalOpenPlayer.call(
                    AndroidJS,
                    normalizePlayerUrl(link),
                    normalizePlayerDataString(dataString)
                );
            };

            window[pluginId + '_androidjs_patched'] = true;
        }
        catch (e) {
            return false;
        }

        if (window.console && console.log) {
            console.log('[4XVR URL Fix] AndroidJS.openPlayer URL normalizer enabled');
        }

        return true;
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
        var androidJsReady = patchAndroidJsOpenPlayer();
        var lampaAndroidReady = patchAndroidOpenPlayer();

        if (androidJsReady && lampaAndroidReady) return;

        if (attempt < 60) {
            setTimeout(function () {
                waitAndPatch(attempt + 1);
            }, 500);
        }
    }

    waitAndPatch(0);
})();
