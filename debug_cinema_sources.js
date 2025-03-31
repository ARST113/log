(function () {
    'use strict';

    console.log('[CinemaButtonPlugin] Плагин загружен');

    Lampa.Listener.follow('full', function(e) {
        if (e.type === 'complite') {
            setTimeout(function() {
                try {
                    var fullContainer = e.object.activity.render();
                    // Ищем кнопку с классом 'cinema--button'
                    var cinemaBtn = fullContainer.find('.cinema--button');
                    console.log('[CinemaButtonPlugin] Найдена кнопка Cinema:', cinemaBtn.length);
                    
                    if (cinemaBtn.length) {
                        // Пример: добавляем класс, который через CSS сворачивает кнопку
                        cinemaBtn.addClass('collapsed');
                        // Или можно скрыть кнопку
                        // cinemaBtn.hide();
                    }
                } catch (err) {
                    console.error('[CinemaButtonPlugin] Ошибка:', err);
                }
            }, 500); // задержка, чтобы экран точно успел отрендериться
        }
    });
})();
