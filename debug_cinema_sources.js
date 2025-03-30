(function () {
    'use strict';

    console.log('[SorterPlugin] плагин загружен');

    function startPlugin() {
        try {
            // Сброс параметра, если он установлен
            if (Lampa.Storage.get('full_btn_priority') !== undefined) {
                Lampa.Storage.set('full_btn_priority', '{}');
            }

            Lampa.Listener.follow('full', function(e) {
                if (e.type === 'complite') {
                    setTimeout(function() {
                        try {
                            var fullContainer = e.object.activity.render();
                            var targetContainer = fullContainer.find('.full-start-new__buttons');
                            console.log('[SorterPlugin] Контейнер найден:', targetContainer);

                            // Заставляем контейнер использовать flex, чтобы CSS order работал
                            targetContainer.css('display', 'flex');

                            // Собираем все кнопки из двух контейнеров
                            var allButtons = fullContainer.find('.buttons--container .full-start__button')
                                .add(targetContainer.find('.full-start__button'));
                            console.log('[SorterPlugin] Всего кнопок:', allButtons.length);

                            // Функция для проверки наличия класса
                            function hasClass(el, name) {
                                return $(el).attr('class').toLowerCase().includes(name);
                            }

                            // Назначаем порядок кнопкам через CSS-свойство order:
                            // 1: cinema, 2: online, 3: torrent, 4: trailer, 5: остальные
                            allButtons.each(function() {
                                var $btn = $(this);
                                var classes = $btn.attr('class').toLowerCase();
                                if (classes.includes('cinema')) {
                                    $btn.css('order', 1);
                                } else if (classes.includes('online')) {
                                    $btn.css('order', 2);
                                } else if (classes.includes('torrent')) {
                                    $btn.css('order', 3);
                                } else if (classes.includes('trailer')) {
                                    $btn.css('order', 4);
                                } else {
                                    $btn.css('order', 5);
                                }
                            });

                            console.log('[SorterPlugin] Новый порядок кнопок применён с помощью CSS order');
                        } catch (err) {
                            console.error('[SorterPlugin] Ошибка сортировки:', err);
                        }
                    }, 500); // задержка 500 мс
                }
            });

            if (typeof module !== 'undefined' && module.exports) {
                module.exports = {};
            }
        } catch (err) {
            console.error('[SorterPlugin] Ошибка инициализации плагина:', err);
        }
    }

    startPlugin();
})();
