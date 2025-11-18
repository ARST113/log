"use strict";

(function () {
  'use strict';

  function showAllButtonsWithLogs() {
    console.log('ButtonSorter: Инициализация');
    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') {
        // Задержка 800мс, чтобы все плагины точно отработали
        setTimeout(function () {
          var fullContainer = e.object.activity.render();
          // Это основной контейнер, где должны лежать все кнопки в ряд
          var targetContainer = fullContainer.find('.full-start-new__buttons');
          
          if (targetContainer.length === 0) return;

          // Удаляем лишнюю кнопку Play
          fullContainer.find('.button--play').remove();

          // 1. Ищем кнопку "Продолжить просмотр" ГДЕ УГОДНО в карточке
          // (даже если она выпала в другой контейнер или висит отдельно)
          var continueButton = fullContainer.find('.button--continue-watch');

          // Собираем все остальные кнопки
          var allButtons = fullContainer.find('.buttons--container .full-start__button').add(targetContainer.find('.full-start__button'));
          
          var screenWidth = window.innerWidth || document.documentElement.clientWidth;
          var isSmallScreen = screenWidth < 1280;

          var categories = {
            torrent: [],
            online: [],
            trailer: [],
            other: []
          };

          allButtons.each(function () {
            var $button = $(this);
            // Пропускаем нашу кнопку "Продолжить", мы её уже нашли отдельно
            if ($button.hasClass('button--continue-watch')) return;

            var className = $button.attr('class') || '';

            if (className.includes('torrent') || className.includes('view--torrent')) {
              categories.torrent.push($button);
            } else if (className.includes('online') || className.includes('reyohoho_mod')) {
              categories.online.push($button);
            } else if (className.includes('trailer')) {
              categories.trailer.push($button);
            } else {
              categories.other.push($button);
            }
          });

          var buttonSortOrder = Lampa.Storage.get('lme_buttonsort') || ['torrent', 'online', 'trailer', 'other'];
          
          // Очищаем контейнер, чтобы пересобрать заново
          targetContainer.empty();

          // --- СБОРКА КНОПОК В ОДИН РЯД ---

          // 1. Ставим ТОРРЕНТЫ
          for (var t = 0; t < categories.torrent.length; t++) {
              targetContainer.append(categories.torrent[t]);
          }

          // 2. Сразу за ними - ПРОДОЛЖИТЬ (если нашли)
          if (continueButton.length) {
              // Важно: append перемещает элемент из старого места в новое
              targetContainer.append(continueButton);
          }

          // 3. Ставим ОСТАЛЬНЫЕ по порядку
          for (var i = 0; i < buttonSortOrder.length; i++) {
            var category = buttonSortOrder[i];
            if (category === 'torrent') continue; // Торренты уже поставили
            
            var buttons = categories[category];
            if (buttons) {
                for (var j = 0; j < buttons.length; j++) {
                  targetContainer.append(buttons[j]);
                }
            }
          }

          // Удаление текста span если нужно
          if (Lampa.Storage.get('lme_showbuttonwn') == true) {
            targetContainer.find("span").remove();
          } else if (isSmallScreen) {
            targetContainer.find('.view--reyohoho_mod span').remove();
          }

          // Стили контейнера (в одну строку с переносом)
          targetContainer.css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center' // Выравнивание по вертикали
          });

          // Стили анимации
          targetContainer.find('.full-start__button').css({
            'transition': 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
            'transform': 'scale(1)',
            'opacity': '1'
          });

          // Обновляем навигацию
          Lampa.Controller.toggle("full_start");
          
        }, 800); 
      }
    });
  }

  function addCustomStyles() {
    var style = document.createElement('style');
    style.innerHTML = `
            .full-start__button {
                transition: opacity 0.5s ease-in-out, transform 0.5s ease-in-out !important;
                opacity: 0.85 !important;
            }
            .full-start__button:hover,
            .full-start__button.focus {
                opacity: 1 !important;
                transform: scale(1.01) !important;
                transition: opacity 0.5s ease-in-out, transform 0.5s ease-in-out !important;
                z-index: 2;
            }
        `;
    document.head.appendChild(style);
  }

  function main() {
    addCustomStyles();
    showAllButtonsWithLogs();
  }

  main();
})();
