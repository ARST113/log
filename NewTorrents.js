(function () {
    'use strict';

    // Android UA patch: убирает ложное распознавание браузерной Lampa как Android-клиента.
    // Нативный APK Lampa (lampa_client) не затрагивается.
    (function () {
        'use strict';

        var FLAG = '__lampa_torrent_ua_patch__';

        if (window[FLAG]) return;
        window[FLAG] = true;

        var originalUA = navigator.userAgent;

        // Настоящий Android APK Lampa не трогаем
        if (/lampa_client/i.test(originalUA)) {
            console.log('[Lampa torrent patch] native Lampa Android - skip');
            return;
        }

        // На других платформах патч не нужен
        if (!/android/i.test(originalUA)) return;

        var patchedUA = originalUA.replace(/Android/gi, 'AOSP');

        Object.defineProperty(navigator, 'userAgent', {
            configurable: true,
            get: function () {
                return patchedUA;
            }
        });

        console.log('[Lampa torrent patch] enabled');
        console.log('Original:', originalUA);
        console.log('Patched :', navigator.userAgent);
        console.log(
            'android index:',
            navigator.userAgent.toLowerCase().indexOf('android')
        );
    })();

    var PLUGIN_VERSION = '2.1.0';
    var PLAYER_KEY = 'player_torrent';
    var INTERNAL_KEY = 'internal_torrclient';
    var MIGRATION_KEY = 'new_torrents_v2_migrated';
    var started = false;
    var settingsAdded = false;
    var storageBound = false;

    function log() {
        if (!window.console || !console.log) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[NewTorrents v' + PLUGIN_VERSION + ']');
        console.log.apply(console, args);
    }

    function getStorage(name, fallback) {
        try {
            var field = Lampa.Storage.field(name);
            if (field !== undefined && field !== null && field !== '') return field;
        } catch (e) {}

        try {
            var value = Lampa.Storage.get(name);
            if (value !== undefined && value !== null && value !== '') return value;
        } catch (e2) {}

        return fallback;
    }

    function setStorage(name, value) {
        try {
            Lampa.Storage.set(name, value);
            return true;
        } catch (e) {
            log('Storage.set failed:', name, e);
            return false;
        }
    }

    function getTorrentPlayerMode() {
        return String(getStorage(PLAYER_KEY, 'inner') || 'inner').toLowerCase();
    }

    function isInnerMode() {
        var mode = getTorrentPlayerMode();
        return mode === 'inner' || mode === 'lampa';
    }

    function syncInternalTorrentClient() {
        var inner = isInnerMode();
        var current = getStorage(INTERNAL_KEY, null);

        if (current !== inner) setStorage(INTERNAL_KEY, inner);
        return inner;
    }

    function migrateLegacyDefault() {
        var migrated = getStorage(MIGRATION_KEY, false) === true;
        if (migrated) return;

        // Старая версия плагина по умолчанию выбирала Android-плеер.
        // Для новой сборки Lampa основной маршрут — встроенный плеер.
        setStorage(PLAYER_KEY, 'inner');
        setStorage(INTERNAL_KEY, true);
        setStorage(MIGRATION_KEY, true);
        log('Legacy torrent player mode migrated to inner');
    }

    function addSettings() {
        if (settingsAdded) return true;
        if (!Lampa.SettingsApi || !Lampa.SettingsApi.addParam) return false;

        Lampa.SettingsApi.addParam({
            component: 'player',
            param: {
                name: PLAYER_KEY,
                type: 'select',
                values: {
                    'inner': 'Lampa (Встроенный)',
                    'android': 'Android (Внешний)'
                },
                default: 'inner'
            },
            field: {
                name: (Lampa.Lang && Lampa.Lang.translate) ? Lampa.Lang.translate('settings_player_type_torrent') : 'Плеер для торрентов',
                description: 'Встроенный режим воспроизводит поток TorrServer внутри Lampa'
            },
            onChange: function (value) {
                setStorage(PLAYER_KEY, value);
                syncInternalTorrentClient();
                log('Torrent player mode:', value);
            }
        });

        settingsAdded = true;
        return true;
    }

    function bindStorage() {
        if (storageBound) return;
        if (!Lampa.Storage || !Lampa.Storage.listener || !Lampa.Storage.listener.follow) return;

        Lampa.Storage.listener.follow('change', function (event) {
            if (!event || event.name !== PLAYER_KEY) return;
            syncInternalTorrentClient();
        });

        storageBound = true;
    }

    function activeIsTorrentComponent() {
        try {
            var activity = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
            return !!(activity && activity.component === 'torrents');
        } catch (e) {
            return false;
        }
    }

    function looksLikeTorrServerStream(url) {
        if (!url || typeof url !== 'string') return false;
        var lower = url.toLowerCase();

        if (lower.indexOf('/stream/') >= 0 && lower.indexOf('link=') >= 0) return true;
        if (lower.indexOf('link=') >= 0 && (lower.indexOf('index=') >= 0 || lower.indexOf('&play') >= 0 || lower.indexOf('&preload') >= 0)) return true;
        return false;
    }

    function isTorrentPlayback(object) {
        if (activeIsTorrentComponent()) return true;
        if (!object || typeof object !== 'object') return false;

        if (object.torrent_hash) return true;
        if (object.torrent === true) return true;
        if (object.torrent && typeof object.torrent === 'object') return true;
        if (object.source === 'torrent' || object.type === 'torrent') return true;
        if (looksLikeTorrServerStream(object.url)) return true;

        return false;
    }

    function forceInnerPlayer() {
        syncInternalTorrentClient();

        try {
            if (Lampa.Player && typeof Lampa.Player.runas === 'function') {
                Lampa.Player.runas('inner');
                return true;
            }
        } catch (e) {
            log('Player.runas(inner) failed:', e);
        }

        return false;
    }

    function hookPlayer() {
        if (!Lampa.Player || typeof Lampa.Player.play !== 'function') return false;
        if (Lampa.Player.play.__new_torrents_v2) return true;

        var originalPlay = Lampa.Player.play;

        function patchedPlay(object) {
            if (isInnerMode() && isTorrentPlayback(object)) {
                forceInnerPlayer();

                // Маркер понимают плагины продолжения просмотра/маршрутизации.
                if (object && typeof object === 'object') object.launch_player = 'inner';

                log('Torrent routed to embedded Lampa player');
            }

            return originalPlay.apply(this, arguments);
        }

        patchedPlay.__new_torrents_v2 = true;
        patchedPlay.__new_torrents_original = originalPlay;
        Lampa.Player.play = patchedPlay;
        return true;
    }

    function initialize() {
        if (started) return;
        started = true;

        migrateLegacyDefault();
        syncInternalTorrentClient();
        bindStorage();
        addSettings();

        if (!hookPlayer()) {
            var attempts = 0;
            var timer = setInterval(function () {
                attempts += 1;
                addSettings();
                if (hookPlayer() || attempts >= 20) clearInterval(timer);
            }, 500);
        }

        window.plugin_torrents_ready = true;
        window.plugin_torrents_version = PLUGIN_VERSION;
        log('Ready; mode =', getTorrentPlayerMode(), 'internal_torrclient =', getStorage(INTERNAL_KEY, false));
    }

    function boot() {
        if (!window.Lampa) return;

        if (window.appready) {
            initialize();
        } else if (Lampa.Listener && Lampa.Listener.follow) {
            Lampa.Listener.follow('app', function (event) {
                if (event && event.type === 'ready') initialize();
            });
        }
    }

    boot();
})();