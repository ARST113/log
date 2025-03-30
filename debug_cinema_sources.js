
(function () {
    'use strict';
    setInterval(function () {
        console.log('[Debug] Доступные источники:', Lampa.Activity.sources);
        if (Lampa.Activity.sources && Lampa.Activity.sources.length) {
            Lampa.Activity.sources.forEach((src, i) => {
                console.log('Источник ' + i + ':', src.name);
            });
        }
    }, 2000);
})();
