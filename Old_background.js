(function(){
    'use strict';

    // Классы, под которыми может скрываться фон в Lampa
    const POSSIBLE_CLASSES = [
        '.full-start__background',
        '.card__background',
        '.activity__background',
        '.card-detail__backdrop',
        '.card-full__background'
        // Добавь другие, если знаешь точные названия
    ];

    function forceContain() {
        POSSIBLE_CLASSES.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.style.setProperty('background-size', 'contain', 'important');
                el.style.setProperty('background-position', 'center', 'important');
                el.style.setProperty('background-repeat', 'no-repeat', 'important');

                // Если необходимо — фиксируем ширину/высоту контейнера
                // el.style.setProperty('width', '100%', 'important');
                // el.style.setProperty('height', '100%', 'important');
            });
        });
    }

    // Запускаем при каждом открытии экрана (чтобы перезаписать стили)
    Lampa.Listener.follow('activity', forceContain);

    // А также через секунду после загрузки
    setTimeout(forceContain, 1000);
})();
