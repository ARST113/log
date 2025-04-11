(function () {
    function removeCardBlur() {
        const current = Lampa?.Activity?.active()?.activity;

        if (!current) return;

        const isCard =
            current.name === 'full' ||
            current.name === 'full_start';

        const classList = [
            '.navigation-bar__body',
            '.selectbox__content',
            '.selectbox__layer',
            '.settings__content',
            '.settings__layer',
            '.layer--height'
        ];

        classList.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (isCard) {
                    el.classList.add('no-blur');
                } else {
                    el.classList.remove('no-blur');
                }
            });
        });
    }

    // Вставляем CSS для отключения blur
    const style = document.createElement('style');
    style.textContent = `
        .no-blur {
            backdrop-filter: none !important;
            filter: none !important;
            background: transparent !important;
        }
    `;
    document.head.appendChild(style);

    // Отслеживаем смену активностей
    Lampa.Listener.follow('activity', removeCardBlur);

    // Проверка при старте
    setTimeout(removeCardBlur, 2000);
})();
