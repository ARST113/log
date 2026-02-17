(function () {
    'use strict';

    if (!window.Lampa) return;

    const TAG = '[EXT-CHECK]';

    let externalStarted = false;
    let lastHash = '';

    function log(msg) {
        console.log(TAG, msg);
        Lampa.Noty.show(msg);
    }

    function init() {

        log('INIT');

        /* ===== Проверка моста Android ===== */
        if (window.Android) {
            log('Android object detected');
            if (Android.version) {
                log('Bridge version: ' + Android.version);
            } else {
                log('Bridge version: unknown');
            }
        } else {
            log('NO Android object');
        }

        /* ===== Проверка player_timecode ===== */
        const timecodeEnabled = Lampa.Storage.get('player_timecode', true);
        log('player_timecode: ' + timecodeEnabled);

        /* ===== external ===== */
        Lampa.Listener.follow('external', function (data) {
            log('EXTERNAL event received');
            externalStarted = true;

            // буфер на случай неправильного порядка событий
            setTimeout(() => {
                if (externalStarted) {
                    log('externalStarted still true after 300ms');
                }
            }, 300);
        });

        /* ===== RAW timeline без фильтра ===== */
        Lampa.Listener.follow('state:changed', function (e) {

            const target = e.target || e.targer;
            const reason = e.reason;

            if (target === 'timeline' && reason === 'update') {

                log('RAW timeline update detected');

                const { hash, road } = e.data || {};

                if (!road) {
                    log('NO road in event');
                    return;
                }

                log(`Timeline data → hash:${hash}`);

                if (!externalStarted) {
                    log('timeline update but externalStarted=false');
                    return;
                }

                if (hash === lastHash) {
                    log('duplicate hash');
                    return;
                }

                lastHash = hash;
                externalStarted = false;

                const timeText = Lampa.Utils.secondsToTime(road.time, true);
                const durationText = Lampa.Utils.secondsToTime(road.duration || 0, true);
                const percent = Math.round(road.percent || 0);

                log(`FINAL: ${timeText} / ${durationText} (${percent}%)`);
            }
        });
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
