(function(){
    // Вставляем стили для анимации фонового постера
    const style = `
    .card__background {
        transition: all 0.6s ease !important;
        z-index: 1 !important;
    }
    .card__background.expanded {
        width: 100vw !important;
        height: 100vh !important;
        border-radius: 0 !important;
    }
    `;
    const styleTag = document.createElement('style');
    styleTag.textContent = style;
    document.head.appendChild(styleTag);

    // Основной функционал плагина
    const Plugin = {
        target: null,

        // Инициализация — наблюдаем за появлением фонового элемента
        init() {
            this.observeBackground();
        },

        // Используем MutationObserver для отслеживания появления элемента с классом .card__background
        observeBackground() {
            const observer = new MutationObserver(() => {
                const bg = document.querySelector('.card__background');
                if (bg && bg !== this.target) {
                    this.target = bg;
                    // Автоматически расширяем фон при появлении элемента в карточке
                    this.target.classList.add('expanded');
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        },

        // Методы для программного управления (при необходимости)
        expand() {
            if (this.target) this.target.classList.add('expanded');
        },
        collapse() {
            if (this.target) this.target.classList.remove('expanded');
        }
    };

    // Регистрируем плагин в пространстве Lampa
    if (!window.Lampa) window.Lampa = {};
    if (!Lampa.Plugin) Lampa.Plugin = {};
    Lampa.Plugin.AutoBackgroundExpand = Plugin;

    // Автоинициализация плагина после загрузки DOM
    document.addEventListener('DOMContentLoaded', () => {
        Lampa.Plugin.AutoBackgroundExpand.init();
    });
})();
