(function(){
    'use strict';

    // Задайте здесь корректный селектор фонового элемента,
    // который отображает картинку в карточке фильма
    const BG_SELECTOR = '.full-start__background';

    const css = `
    ${BG_SELECTOR} {
       background-size: contain !important;       /* Вместо cover — показывается весь контент изображения */
       background-position: center !important;      /* Центрирование изображения */
       background-repeat: no-repeat !important;     /* Без повторения */
       width: 100%;
       height: 100%;                                /* Если контейнер имеет нужные размеры */
    }
    `;
    
    const styleTag = document.createElement('style');
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
})();
