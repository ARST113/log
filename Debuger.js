(function(){
    'use strict';

    function highlightBlur() {
        const all = document.querySelectorAll('*');
        let count = 0;

        all.forEach(el => {
            const style = getComputedStyle(el);
            const hasBlur =
                (style.backdropFilter && style.backdropFilter.includes('blur')) ||
                (style.filter && style.filter.includes('blur'));

            if (hasBlur) {
                el.style.outline = '2px dashed magenta';
                el.style.zIndex = 9999;
                count++;
                console.log(`[CARD BLUR DETECTED] tag:${el.tagName}, class:"${el.className}", filter:${style.filter}, backdropFilter:${style.backdropFilter}`);
            }
        });

        if (!count) {
            console.log('[CARD BLUR DETECTED] Ничего не найдено');
        } else {
            console.log(`[CARD BLUR DETECTED] Найдено ${count} элементов`);
        }
    }

    // Когда активность = full (карточка), ждём 2 секунды и сканируем
    function onActivity(){
        const curr = Lampa.Activity.active();
        if (curr?.component === 'full'){
            setTimeout(highlightBlur, 2000); 
        }
    }

    Lampa.Listener.follow('activity', onActivity);
})();
