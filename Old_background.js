(function(){
    'use strict';

    // Вставляем CSS для оформления постера, как в старом интерфейсе
    const style = `
    /* Исходные стили для фонового постера (старый интерфейс) */
    .full-start__background {
        transition: all 0.6s ease;
        /* Здесь можно задать начальные размеры, если необходимо */
    }
    /* Класс, который развернёт фон до полного экрана */
    .full-start__background.expanded {
        width: 100vw;
        height: 100vh;
        border-radius: 0;
    }
    `;
    const styleTag = document.createElement('style');
    styleTag.textContent = style;
    document.head.appendChild(styleTag);

    // Плагин, который будет применяться к элементу фонового постера
    const PluginOldPoster = {
        target: null,

        // Инициализация – наблюдаем за появлением фонового элемента в DOM
        init() {
            this.observeBackground();
        },

        // Функция наблюдения за DOM: ищем элемент с классом .full-start__background
        observeBackground() {
            const observer = new MutationObserver(() => {
                // Ищем фон, используемый в старом интерфейсе (логика из кода трейлера)
                const bg = document.querySelector('.full-start__background');
                if (bg && bg !== this.target) {
                    this.target = bg;
                    // Если элемент ранее был скрыт (например, через класс nodisplay), удаляем его
                    if (this.target.classList.contains('nodisplay')) {
                        this.target.classList.remove('nodisplay');
                    }
                    // Добавляем класс expanded, чтобы фон развернулся полноэкранно
                    this.target.classList.add('expanded');
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        },

        // Дополнительные методы для программного управления при необходимости
        expand() {
            if (this.target) {
                this.target.classList.add('expanded');
            }
        },
        collapse() {
            if (this.target) {
                this.target.classList.remove('expanded');
            }
        }
    };

    // Регистрируем плагин в пространстве Lampa.Plugin, т.к. новый интерфейс для нас подходит
    if (!window.Lampa) window.Lampa = {};
    if (!Lampa.Plugin) Lampa.Plugin = {};
    Lampa.Plugin.OldPosterExpand = PluginOldPoster;

    // Автоинициализация плагина после загрузки DOM
    document.addEventListener('DOMContentLoaded', () => {
        Lampa.Plugin.OldPosterExpand.init();
    });
})();
