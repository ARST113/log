(function () {
    'use strict';

    // Функция раскрытия кнопок с логами
    function showAllButtonsWithLogs() {
        console.log('showAllButtonsWithLogs: Инициализация функции');
        Lampa.Listener.follow('full', function (e) {
            console.log('showAllButtonsWithLogs: Событие full с типом', e.type);
            if (e.type === 'complite') {
                setTimeout(function () {
                    var fullContainer = e.object.activity.render();
                    console.log('showAllButtonsWithLogs: Получен fullContainer', fullContainer.length);

                    var targetContainer = fullContainer.find('.full-start-new__buttons');
                    if (targetContainer.length === 0) {
                        console.warn('showAllButtonsWithLogs: targetContainer не найден');
                        return;
                    }
                    console.log('showAllButtonsWithLogs: targetContainer найден', targetContainer.length);

                    fullContainer.find('.button--play').remove();
                    console.log('showAllButtonsWithLogs: Кнопка play удалена, если была');

                    var allButtons = fullContainer.find('.buttons--container .full-start__button').add(targetContainer.find('.full-start__button'));
                    console.log('showAllButtonsWithLogs: Найдено кнопок всего:', allButtons.length);

                    var categories = {
                        online: [],
                        torrent: [],
                        trailer: [],
                        other: []
                    };
                    allButtons.each(function () {
                        var $button = $(this);
                        var className = $button.attr('class') || '';
                        if (className.includes('online')) categories.online.push($button);
                        else if (className.includes('torrent')) categories.torrent.push($button);
                        else if (className.includes('trailer')) categories.trailer.push($button);
                        else categories.other.push($button.clone(true));
                    });

                    console.log('showAllButtonsWithLogs: Категории кнопок по длине:',
                        'torrent:', categories.torrent.length,
                        'online:', categories.online.length,
                        'trailer:', categories.trailer.length,
                        'other:', categories.other.length);

                    var buttonSortOrder = Lampa.Storage.get('lme_buttonsort') || ['torrent', 'online', 'trailer', 'other'];
                    targetContainer.empty();
                    buttonSortOrder.forEach(function (category) {
                        categories[category].forEach(function ($button) {
                            targetContainer.append($button);
                        });
                    });

                    if (Lampa.Storage.get('lme_showbuttonwn') == true) {
                        targetContainer.find("span").remove();
                        console.log('showAllButtonsWithLogs: Удалены спаны в кнопках');
                    }

                    targetContainer.css({
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px'
                    });
                    console.log('showAllButtonsWithLogs: Применены стили для контейнера кнопок');

                    // Добавляем плавные анимации для кнопок
                    targetContainer.find('.full-start__button').css({
                        'transition': 'all 0.4s ease',
                        'transform': 'scale(1)'
                    });
                    console.log('showAllButtonsWithLogs: Добавлены плавные анимации для кнопок');

                    Lampa.Controller.toggle("full_start");
                    console.log('showAllButtonsWithLogs: Вызван toggle full_start');
                }, 100);
            }
        });
        console.log('showAllButtonsWithLogs: Подписка на событие full завершена');
    }

    // Добавляем CSS стили для анимаций при наведении
    function addCustomStyles() {
        var style = document.createElement('style');
        style.innerHTML = `
            .full-start__button {
                transition: all 0.4s ease !important;
            }
            .full-start__button:hover,
            .full-start__button.focus {
                transform: scale(1.05) !important;
                transition: all 0.4s ease !important;
            }
        `;
        document.head.appendChild(style);
        console.log('addCustomStyles: CSS стили для плавных анимаций добавлены');
    }

    // Инициализация плагина
    function main() {
        addCustomStyles();
        showAllButtonsWithLogs();
    }

    // Запуск основной функции плагина
    main();

})();
