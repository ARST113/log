(function(){
    'use strict';

    // Функция для удаления блюра с элемента
    function removeBlur(el) {
        if(el && el.style) {
            // Сброс inline фильтров
            el.style.filter = 'none';
            el.style.backdropFilter = 'none';
        }
    }

    // MutationObserver, который следит за элементами с классом .full-start__background и их изменениями стилей
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if(mutation.target && mutation.target.matches && mutation.target.matches('.full-start__background')) {
                removeBlur(mutation.target);
            }
            // Если изменения затрагивают потомков, пройдёмся по ним
            if(mutation.target.querySelectorAll) {
                mutation.target.querySelectorAll('.full-start__background').forEach(removeBlur);
            }
        });
    });

    // Наблюдение за всем документом – изменения в дочерних элементах, атрибутах стиля
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });

    // Дополнительно, внедрим CSS, чтобы псевдоэлементы не применяли блюр
    const css = `
        .full-start__background::before,
        .full-start__background::after {
            filter: none !important;
            backdrop-filter: none !important;
            background: transparent !important;
        }
    `;
    const styleTag = document.createElement('style');
    styleTag.textContent = css;
    document.head.appendChild(styleTag);
})();
