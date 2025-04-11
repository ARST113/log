(function(){
    'use strict';

    // Список классов, где хотим отключать блюр, когда мы в карточке
    const BLUR_CLASSES = [
        '.navigation-bar__body',
        '.selectbox__content',
        '.selectbox__layer',
        '.settings__content',
        '.settings__layer',
        '.layer--height'
    ];

    // CSS, которое отключает blur
    const css = `
        .no-blur {
            backdrop-filter: none !important;
            filter: none !important;
            background: transparent !important;
        }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Функция, которая проверяет текущее состояние активности
    function toggleBlur() {
        const current = Lampa.Activity.active();
        if(!current) return;

        // Если мы в карточке, component === 'full'
        const isCard = (current.component === 'full');

        // Пробегаем по всем элементам, где раньше был блюр
        BLUR_CLASSES.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (isCard) el.classList.add('no-blur');
                else el.classList.remove('no-blur');
            });
        });
    }

    // Запускаем при смене активности
    Lampa.Listener.follow('activity', toggleBlur);

    // И делаем первичную проверку
    setTimeout(toggleBlur, 2000);
})();
