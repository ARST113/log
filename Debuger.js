(function () {
    'use strict';

    function highlightBlurredElements() {
        const all = document.querySelectorAll('*');
        let count = 0;

        all.forEach(el => {
            const style = getComputedStyle(el);

            const hasBlur =
                (style.backdropFilter && style.backdropFilter.includes('blur')) ||
                (style.filter && style.filter.includes('blur'));

            if (hasBlur) {
                el.style.outline = '2px dashed red'; // визуальное выделение
                el.style.zIndex = 9999; // поверх всего
                count++;

                console.log(`[BLUR DETECTED]`, {
                    tag: el.tagName,
                    class: el.className,
                    filter: style.filter,
                    backdropFilter: style.backdropFilter
                });
            }
        });

        if (count === 0) {
            console.log('Нет элементов с blur-фильтрами.');
        } else {
            console.log(`Найдено ${count} элементов с эффектом blur.`);
        }
    }

    // Подождать чуть-чуть, пока загрузится интерфейс, затем запустить
    setTimeout(() => {
        highlightBlurredElements();
    }, 1500);
})();
