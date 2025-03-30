(function () {
    'use strict';

    // Выводим список источников для отладки
    function logSources() {
        const sources = Lampa.Activity.sources || [];
        console.log('[CinemaCollapseFix] Список источников:', sources.length);
        sources.forEach((src, index) => {
            const nameStr = src && typeof src.name === 'string' ? src.name : '(нет name)';
            console.log(index, nameStr);
        });
    }

    // Каждые 2 сек проверяем источники
    const INTERVAL = setInterval(() => {
        try {
            const sources = Lampa.Activity.sources || [];
            if (!sources.length) return;

            logSources();

            for (let i = 0; i < sources.length; i++) {
                const src = sources[i];
                if (src && typeof src.name === 'string') {
                    const lowerName = src.name.toLowerCase();
                    // Если содержит 'cinema' и нет collapse
                    if (lowerName.includes('cinema') && typeof src.collapse !== 'function') {
                        src.collapse = function () {
                            return {
                                title: 'Cinema',
                                description: 'Источник от Cinema',
                                sort: 1
                            };
                        };
                        console.log('[CinemaCollapseFix] collapse() добавлен для источника:', src.name);
                        clearInterval(INTERVAL);
                        break;
                    }
                }
            }
        } catch (err) {
            console.error('[CinemaCollapseFix] Общая ошибка:', err);
        }
    }, 2000);
})();
