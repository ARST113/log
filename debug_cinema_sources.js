(function () {
    'use strict';

    console.log('[CinemaCollapseFix] Плагин загружен.');

    // Проверяем, определён ли Lampa и Lampa.Activity
    if (!window.Lampa || !Lampa.Activity) {
        console.log('[CinemaCollapseFix] Lampa или Lampa.Activity не найдены.');
    } else {
        console.log('[CinemaCollapseFix] Lampa найден. Текущее количество источников:',
            Lampa.Activity.sources ? Lampa.Activity.sources.length : 'нет источников');
    }

    // Функция для логирования источников
    function logSources() {
        const sources = Lampa.Activity.sources || [];
        console.log('[CinemaCollapseFix] Количество источников:', sources.length);
        sources.forEach((src, index) => {
            const nameStr = src && typeof src.name === 'string' ? src.name : '(нет name)';
            console.log('[CinemaCollapseFix]', index, nameStr);
        });
    }

    // Интервал для проверки источников каждые 2 секунды
    const INTERVAL = setInterval(() => {
        try {
            if (!window.Lampa || !Lampa.Activity) {
                console.log('[CinemaCollapseFix] Lampa или Lampa.Activity не найдены.');
                return;
            }
            const sources = Lampa.Activity.sources || [];
            console.log('[CinemaCollapseFix] Текущее количество источников:', sources.length);
            logSources();

            for (let i = 0; i < sources.length; i++) {
                const src = sources[i];
                if (src && typeof src.name === 'string') {
                    const lowerName = src.name.toLowerCase();
                    // Если имя источника содержит "cinema" и collapse ещё не определён
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
