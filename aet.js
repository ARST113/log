(function () {
    'use strict';

    if (!window.Lampa) return;

    const TAG = '[EXT-TIMELINE-DEBUG]';

    let externalStarted = false;

    function log(msg) {
        console.log(TAG, msg);
        Lampa.Noty.show(msg);
    }

    function init() {

        log('INIT');

        /* ===== external ===== */
        Lampa.Listener.follow('external', function () {
            externalStarted = true;
            log('EVENT: external');
        });

        /* ===== state:changed ===== */
        Lampa.Listener.follow('state:changed', function (e) {

            log('EVENT: state:changed');

            const target = e.target || e.targer || 'undefined';
            const reason = e.reason || 'undefined';

            log(`DATA → target:${target} | reason:${reason}`);

            if (!externalStarted) {
                log('SKIP: externalStarted=false');
                return;
            }

            if (target !== 'timeline') {
                log('SKIP: target!=timeline');
                return;
            }

            if (reason !== 'update') {
                log('SKIP: reason!=update');
                return;
            }

            const road = e.data && e.data.road;
            if (!road) {
                log('SKIP: no road');
                return;
            }

            externalStarted = false;

            const timeText = Lampa.Utils.secondsToTime(road.time, true);
            const durationText = Lampa.Utils.secondsToTime(road.duration || 0, true);
            const percent = Math.round(road.percent || 0);

            log(`FINAL: ${timeText} / ${durationText} (${percent}%)`);
        });
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
