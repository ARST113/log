(function () {
    'use strict';

    // Плагин для отключения Shots в Lampa
    // Отключает функциональность скриншотов (shots)
    
    // Отключаем Shots через настройки
    window.lampa_settings = window.lampa_settings || {};
    window.lampa_settings.disable_features = window.lampa_settings.disable_features || {};
    window.lampa_settings.disable_features.shots = true;
    
    // Альтернативный способ через Storage
    if (typeof Lampa !== 'undefined' && Lampa.Storage) {
        Lampa.Storage.set('shots_enabled', 'false');
        Lampa.Storage.set('disable_shots', 'true');
    }
    
    // Отключаем Shots через глобальные переменные
    window.lampa_shots_enabled = false;
    window.shots_enabled = false;
    
    // Перехватываем возможные функции Shots
    if (typeof Lampa !== 'undefined') {
        // Блокируем инициализацию Shots
        Lampa.Shots = {
            init: function() { return false; },
            show: function() { return false; },
            hide: function() { return false; },
            enabled: false
        };
        
        // Отключаем в компонентах
        if (Lampa.Component && Lampa.Component.prototype) {
            var originalCreate = Lampa.Component.prototype.create;
            Lampa.Component.prototype.create = function() {
                var result = originalCreate.apply(this, arguments);
                
                // Удаляем элементы Shots из DOM
                if (this.render && this.render()) {
                    var shotsElements = this.render().querySelectorAll('[data-shots], .shots, .shot, .screenshot, .shots-button, .shots-item');
                    shotsElements.forEach(function(el) {
                        el.style.display = 'none';
                        el.remove();
                    });
                }
                
                return result;
            };
        }
        
        // Перехватываем и блокируем меню
        if (Lampa.Controller && Lampa.Controller.prototype) {
            var originalMenu = Lampa.Controller.prototype.menu;
            Lampa.Controller.prototype.menu = function() {
                var result = originalMenu.apply(this, arguments);
                
                // Удаляем пункт Shots из меню - более точная проверка
                setTimeout(function() {
                    var menuItems = document.querySelectorAll('.menu__item, .menu-item');
                    menuItems.forEach(function(item) {
                        var text = item.textContent || item.innerText || '';
                        // Ищем именно Shots, а не другие пункты
                        if (text === 'Shots' || text === 'нарезки' || text === 'скриншоты' || text.includes('смотреть нарезки')) {
                            item.style.display = 'none';
                            item.remove();
                        }
                    });
                    
                    // Дополнительная проверка по data-атрибутам
                    var shotsItems = document.querySelectorAll('[data-component="shots"], [data-action="shots"], [data-name="shots"]');
                    shotsItems.forEach(function(item) {
                        item.style.display = 'none';
                        item.remove();
                    });
                }, 100);
                
                return result;
            };
        }
        
        // Блокируем детальную информацию карточки
        if (Lampa.Card && Lampa.Card.prototype) {
            var originalRender = Lampa.Card.prototype.render;
            Lampa.Card.prototype.render = function() {
                var result = originalRender.apply(this, arguments);
                
                setTimeout(function() {
                    // Удаляем кнопки Shots в детальной информации
                    var shotsButtons = document.querySelectorAll('.card__shots, .full-info__shots, .shots-btn, [data-action="shots"]');
                    shotsButtons.forEach(function(btn) {
                        btn.style.display = 'none';
                        btn.remove();
                    });
                }, 200);
                
                return result;
            };
        }
    }
    
    // Стили для скрытия элементов Shots
    var style = document.createElement('style');
    style.textContent = `
        [data-component="shots"],
        [data-action="shots"],
        [data-name="shots"],
        .shots-button,
        .shots-container,
        .shots-modal,
        .card__shots,
        .full-info__shots,
        .shots-btn,
        .shots-item {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
        }
    `;
    document.head.appendChild(style);
    
    // Отключаем события Shots
    document.addEventListener('DOMContentLoaded', function() {
        // Удаляем обработчики событий для Shots
        var shotsButtons = document.querySelectorAll('[onclick*="shots"], [onclick*="screenshot"]');
        shotsButtons.forEach(function(button) {
            button.onclick = null;
            button.style.display = 'none';
        });
    });
    
    // Агрессивная очистка DOM - запускаем периодически
    function removeShotsElements() {
        // Ищем и удаляем только конкретные элементы Shots
        var selectors = [
            '[data-component="shots"]',
            '[data-action="shots"]',
            '[data-name="shots"]',
            '.shots-button',
            '.shots-container',
            '.shots-modal',
            '.card__shots',
            '.full-info__shots',
            '.shots-btn'
        ];
        
        selectors.forEach(function(selector) {
            var elements = document.querySelectorAll(selector);
            elements.forEach(function(el) {
                el.style.display = 'none';
                el.remove();
            });
        });
        
        // Более точная проверка по текстовому содержимому
        var allElements = document.querySelectorAll('.menu__item, .menu-item, .button, [class*="shots"]');
        allElements.forEach(function(el) {
            var text = (el.textContent || el.innerText || '').trim();
            // Ищем только точные совпадения для Shots
            if (text === 'Shots' || text === 'нарезки' || text === 'скриншоты' || text === 'смотреть нарезки') {
                el.style.display = 'none';
                el.remove();
            }
        });
    }
    
    // Запускаем очистку сразу
    removeShotsElements();
    
    // Запускаем периодически для динамически создаваемых элементов (реже)
    setInterval(removeShotsElements, 3000);
    
    // Наблюдаем за изменениями в DOM
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                removeShotsElements();
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Логирование для отладки
    console.log('[Lampa Plugin] Shots отключен');
    
})();
