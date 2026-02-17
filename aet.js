(function () {
    'use strict';

    if (!window.Lampa) return;

    let externalStarted = false;
    let lastHash = '';

    function init() {

        // Маркер запуска внешнего плеера
        Lampa.Listener.on('external', function () {
            externalStarted = true;
        });

        // Реальный источник данных
        Lampa.Listener.on('state:changed', function (e) {

            const target = e.target || e.targer;

            if (!externalStarted) return;
            if (target !== 'timeline') return;
            if (e.reason !== 'update') return;

            if (!e.data) return;

            const hash = e.data.hash;
            const road = e.data.road;

            if (!road) return;
            if (hash === lastHash) return;

            lastHash = hash;
            externalStarted = false;

            const timeText = Lampa.Utils.secondsToTime(road.time, true);
            const durationText = Lampa.Utils.secondsToTime(road.duration || 0, true);
            const percent = Math.round(road.percent || 0);

            Lampa.Noty.show(
                `Финальная позиция: ${timeText} / ${durationText} (${percent}%)`
            );
        });
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
