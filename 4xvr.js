(function () {
    'use strict';

    var pluginId = 'lampa_4xvr_url_fix';
    var fourXvrPackage = 'cn.vr4p.oculus4xvrplayerovPl';

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

    function sanitizeIntentDataUrl(url) {
        return normalizePlayerUrl(url)
            .trim()
            .replace(/ /g, '%20')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/#/g, '%23');
    }

    function build4xvrIntentUrl(url) {
        var dataUrl = sanitizeIntentDataUrl(url);
        var match = dataUrl.match(/^([a-z][a-z0-9+.-]*):\/\/(.+)$/i);
        var scheme = match ? match[1].toLowerCase() : 'http';
        var rest = match ? match[2] : dataUrl;

        return 'intent://' + rest +
            '#Intent;scheme=' + scheme +
            ';action=android.intent.action.VIEW' +
            ';type=video/*' +
            ';package=' + fourXvrPackage +
            ';end';
    }

    function openIntent(intentUrl) {
        var anchor = document.createElement('a');

        anchor.href = intentUrl;
        anchor.style.display = 'none';

        (document.body || document.documentElement).appendChild(anchor);
        anchor.click();

        setTimeout(function () {
            if (anchor.parentNode) {
                anchor.parentNode.removeChild(anchor);
            }
        }, 1000);
    }

    function open4xvr(url, data) {
        var normalizedUrl = normalizePlayerUrl(url);
        var normalizedData = normalizePlayerData(data);
        var intentUrl = build4xvrIntentUrl(normalizedUrl);

        log('launch ' + fourXvrPackage + ' -> ' + normalizedUrl);

        try {
            openIntent(intentUrl);
        }
        catch (e) {
            window.location.href = intentUrl;
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

                if (shouldUse4xvr(normalizedLink, data)) {
                    return open4xvr(normalizedLink, data);
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
                return open4xvr(normalizedLink, normalizedData);
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
