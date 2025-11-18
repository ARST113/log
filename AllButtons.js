"use strict";

(function () {
  'use strict';

  function showAllButtonsWithLogs() {
    console.log('ButtonSorter: Инициализация');
    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') {
        // УВЕЛИЧИЛИ ЗАДЕРЖКУ до 700мс, чтобы кнопка "Продолжить" успела создаться
        setTimeout(function () {
          var fullContainer = e.object.activity.render();
          var targetContainer = fullContainer.find('.full-start-new__buttons');
          
          if (targetContainer.length === 0) return;

          // Удаляем лишнюю кнопку Play
          fullContainer.find('.button--play').remove();

          // Собираем все кнопки
          var allButtons = fullContainer.find('.buttons--container .full-start__button').add(targetContainer.find('.full-start__button'));
          
          var screenWidth = window.innerWidth || document.documentElement.clientWidth;
          var isSmallScreen = screenWidth < 1280;

          // Категории
          var categories = {
            continue_view: [], // Наша кнопка
            online: [],
            torrent: [],
            trailer: [],
            other: []
          };

          allButtons.each(function () {
            var $button = $(this);
            var className = $button.attr('class') || '';

            // Распределяем кнопки
            if (className.includes('button--continue-watch')) {
               categories.continue_view.push($button);
            } else if (className.includes('online') || className.includes('reyohoho_mod')) {
              categories.online.push($button);
            } else if (className.includes('torrent') || className.includes('view--torrent')) {
              categories.torrent.push($button);
            } else if (className.includes('trailer')) {
              categories.trailer.push($button);
            } else {
              categories.other.push($button);
            }
          });

          var buttonSortOrder = Lampa.Storage.get('lme_buttonsort') || ['torrent', 'online', 'trailer', 'other'];
          
          targetContainer.empty();

          // --- ЛОГИКА ПОРЯДКА ---

          // 1. Сначала добавляем ТОРРЕНТЫ (чтобы фокус встал на них)
          for (var t = 0; t < categories.torrent.length; t++) {
              targetContainer.append(categories.torrent[t]);
          }

          // 2. Вторым номером - кнопка "ПРОДОЛЖИТЬ ПРОСМОТР"
          // Если массив пустой, пробуем найти кнопку еще раз (на случай если она не попала в allButtons)
          if (categories.continue_view.length === 0) {
             var lateButton = $('.button--continue-watch');
             if (lateButton.length) {
                 targetContainer.append(lateButton);
             }
          } else {
             for (var c = 0; c < categories.continue_view.length; c++) {
                targetContainer.append(categories.continue_view[c]);
             }
          }

          // 3. Добавляем остальные категории из настроек
          for (var i = 0; i < buttonSortOrder.length; i++) {
            var category = buttonSortOrder[i];
            
            // Пропускаем уже добавленные
            if (category === 'torrent' || category === 'continue_view') continue; 
            
            var buttons = categories[category];
            if (buttons) {
                for (var j = 0; j < buttons.length; j++) {
                  targetContainer.append(buttons[j]);
                }
            }
          }

          // Удаление span (текста) если нужно
          if (Lampa.Storage.get('lme_showbuttonwn') == true) {
            targetContainer.find("span").remove();
          } else if (isSmallScreen) {
            targetContainer.find('.view--reyohoho_mod span').remove();
          }

          // Стили контейнера
          targetContainer.css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px'
          });

          // Стили анимации кнопок
          targetContainer.find('.full-start__button').css({
            'transition': 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
            'transform': 'scale(1)',
            'opacity': '1'
          });

          // Обновляем навигацию
          Lampa.Controller.toggle("full_start");
          
        }, 700); // 700ms - оптимально, чтобы успели отработать другие плагины
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
