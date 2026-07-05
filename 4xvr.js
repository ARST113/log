(function () {
    'use strict';

    var pluginId = 'lampa_4xvr_url_fix';
    var resetDelayMs = 800;
    var bypassAndroidJsOnce = false;

    if (window[pluginId + '_ready']) return;

    window[pluginId + '_ready'] = true;

    function log(message) {
        if (window.console && console.log) {
            console.log('[4XVR Fix] ' + message);
        }
    }

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

    function parsePlayerData(dataString) {
        if (typeof dataString !== 'string') return null;

        try {
            return JSON.parse(dataString);
        }
        catch (e) {
            return null;
        }
    }

    function normalizePlayerDataString(dataString) {
        var data = parsePlayerData(dataString);

        if (!data) return dataString;

        return JSON.stringify(normalizePlayerData(data));
    }

    function shouldUse4xvr(url, data) {
        if (typeof url !== 'string') return false;

        if (!/^https?:\/\//i.test(url)) return false;

        if (/\/stream\//i.test(url)) return true;
        if (/\.(mkv|mp4|m4v|avi|mov|ts|m2ts|webm)(\?|$)/i.test(url)) return true;
        if (data && (data.torrent_hash || data.torrent || data.url)) return true;

        return true;
    }

    function resetNativePlayerChoice() {
        if (typeof AndroidJS === 'undefined' || typeof AndroidJS.clearDefaultPlayer !== 'function') {
            return false;
        }

        try {
            AndroidJS.clearDefaultPlayer();
            return true;
        }
        catch (e) {
            log('AndroidJS.clearDefaultPlayer failed: ' + (e && e.message ? e.message : e));
            return false;
        }
    }

    function openViaNativeChooser(url, data, fallback) {
        var normalizedUrl = normalizePlayerUrl(url);
        var normalizedData = normalizePlayerData(data);

        log('reset broken saved player and delegate -> ' + normalizedUrl);

        if (typeof fallback === 'function') {
            resetNativePlayerChoice();

            setTimeout(function () {
                fallback(normalizedUrl, normalizedData);
            }, resetDelayMs);
        }

        return null;
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
                var data = parsePlayerData(dataString);
                var normalizedLink = normalizePlayerUrl(link);

                if (data) {
                    normalizePlayerData(data);
                }

                if (bypassAndroidJsOnce) {
                    bypassAndroidJsOnce = false;

                    return originalOpenPlayer.call(
                        AndroidJS,
                        normalizedLink,
                        data ? JSON.stringify(data) : normalizePlayerDataString(dataString)
                    );
                }

                if (shouldUse4xvr(normalizedLink, data)) {
                    return openViaNativeChooser(normalizedLink, data, function (fallbackLink, fallbackData) {
                        return originalOpenPlayer.call(
                            AndroidJS,
                            fallbackLink,
                            fallbackData ? JSON.stringify(fallbackData) : normalizePlayerDataString(dataString)
                        );
                    });
                }

                return originalOpenPlayer.call(
                    AndroidJS,
                    normalizedLink,
                    data ? JSON.stringify(data) : normalizePlayerDataString(dataString)
                );
            };

            window[pluginId + '_androidjs_patched'] = true;
        }
        catch (e) {
            return false;
        }

        log('AndroidJS.openPlayer bypass enabled');

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

            if (shouldUse4xvr(normalizedLink, normalizedData)) {
                return openViaNativeChooser(normalizedLink, normalizedData, function (fallbackLink, fallbackData) {
                    bypassAndroidJsOnce = true;

                    return originalOpenPlayer.call(this, fallbackLink, fallbackData);
                }.bind(this));
            }

            return originalOpenPlayer.call(this, normalizedLink, normalizedData);
        };

        Lampa.Android.openPlayer[pluginId] = true;

        log('Lampa.Android.openPlayer bypass enabled');

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
