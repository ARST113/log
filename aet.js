(function () {
    'use strict';

    if (!window.Lampa) return;

    const TAG = '[EXT-TIMELINE-DEBUG]';

    let externalStarted = false;
    let wasHidden = false;
    let lastHash = '';

    function log(msg) {
        console.log(TAG, msg);
        Lampa.Noty.show(msg);
    }

    function init() {

        log('INIT');

        /* ===== external ===== */
        Lampa.Listener.on('external', function () {
            externalStarted = true;
            log('EVENT: external → externalStarted = true');
        });

        /* ===== visibility ===== */
        document.addEventListener('visibilitychange', function () {

            if (document.hidden) {
                wasHidden = true;
                log('EVENT: visibility → hidden');
            }
            else {
                log('EVENT: visibility → visible');
            }

        });

        /* ===== state:changed ===== */
        Lampa.Listener.on('state:changed', function (e) {

            log('EVENT: state:changed');

            const target = e.target || e.targer || 'undefined';
            const reason = e.reason || 'undefined';

            log(`state data → target:${target} | reason:${reason}`);

            if (!externalStarted) {
                log('SKIP: externalStarted = false');
                return;
            }

            if (target !== 'timeline') {
                log('SKIP: target != timeline');
                return;
            }

            if (reason !== 'update') {
                log('SKIP: reason != update');
                return;
            }

            if (!e.data) {
                log('SKIP: no e.data');
                return;
            }

            const hash = e.data.hash;
            const road = e.data.road;

            if (!road) {
                log('SKIP: no road');
                return;
            }

            if (hash === lastHash) {
                log('SKIP: duplicate hash');
                return;
            }

            lastHash = hash;
            externalStarted = false;

            log('PASS: timeline update after external');

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
