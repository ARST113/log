(function () {
    'use strict';

    if (!window.Lampa) return;

    const pluginName = 'android_external_timecode';

    let externalStarted = false;
    let lastRoadHash = '';

    function formatAndNotify(road) {
        if (!road || typeof road.time !== 'number') return;

        const timeText = Lampa.Utils.secondsToTime(road.time, true);
        const durationText = Lampa.Utils.secondsToTime(road.duration || 0, true);
        const percent = Math.round(road.percent || 0);

        Lampa.Noty.show(
            `Финальная позиция: ${timeText} / ${durationText} (${percent}%)`
        );
    }

    function hashRoad(road) {
        return `${road.time}_${road.duration}_${road.percent}`;
    }

    function init() {
        // Только Android
        if (!Lampa.Platform || !Lampa.Platform.android) return;

        console.log(`[${pluginName}] init`);

        /**
         * 1. Фиксируем запуск внешнего плеера
         */
        Lampa.Listener.on('external', function () {
            externalStarted = true;
            lastRoadHash = '';
            console.log(`[${pluginName}] external started`);
        });

        /**
         * 2. Ловим обновление таймлайна
         */
        Lampa.Listener.on('state:changed', function (e) {
            if (!externalStarted) return;
            if (!e || e.target !== 'timeline') return;
            if (e.reason !== 'update') return;

            const road = e.data && e.data.road;
            if (!road) return;

            const currentHash = hashRoad(road);

            // Защита от повторного вызова
            if (currentHash === lastRoadHash) return;

            lastRoadHash = currentHash;
            externalStarted = false;

            console.log(`[${pluginName}] timeline updated after external`);

            formatAndNotify(road);
        });
    }

    /**
     * Инициализация после полной загрузки приложения
     */
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
