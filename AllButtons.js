"use strict";

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
          var targetContainer = fullContainer.find('.full-start-new__buttons');
          
          if (targetContainer.length === 0) {
            console.warn('showAllButtonsWithLogs: targetContainer не найден');
            return;
          }

          // Удаляем стандартную кнопку Play, если она есть (часто мешает)
          fullContainer.find('.button--play').remove();

          // Собираем ВСЕ кнопки (и из скрытого контейнера, и из видимого)
          var allButtons = fullContainer.find('.buttons--container .full-start__button').add(targetContainer.find('.full-start__button'));
          console.log('showAllButtonsWithLogs: Найдено кнопок всего:', allButtons.length);

          var screenWidth = window.innerWidth || document.documentElement.clientWidth;
          var isSmallScreen = screenWidth < 1280;

          // 1. ДОБАВИЛИ КАТЕГОРИЮ continue_view
          var categories = {
            continue_view: [], // Для кнопки "Продолжить"
            online: [],
            torrent: [],
            trailer: [],
            other: []
          };

          allButtons.each(function () {
            var $button = $(this);
            var className = $button.attr('class') || '';

            // 2. ПРОВЕРЯЕМ НАЛИЧИЕ КЛАССА button--continue-watch (из твоего прошлого плагина)
            if (className.includes('button--continue-watch')) {
               categories.continue_view.push($button);
            } 
            // Проверяем reyohoho_mod и относим к online
            else if (className.includes('online') || className.includes('reyohoho_mod')) {
              categories.online.push($button);
            } else if (className.includes('torrent')) {
              categories.torrent.push($button);
            } else if (className.includes('trailer')) {
              categories.trailer.push($button);
            } else {
              // Клонируем остальные, чтобы сохранить привязки событий
              categories.other.push($button); 
            }
          });

          var buttonSortOrder = Lampa.Storage.get('lme_buttonsort') || ['torrent', 'online', 'trailer', 'other'];
          
          // Очищаем контейнер перед перестройкой
          targetContainer.empty();

          // 3. СНАЧАЛА ВСЕГДА ВСТАВЛЯЕМ КНОПКУ "ПРОДОЛЖИТЬ" (если она есть)
          // Это гарантирует, что она будет ПЕРЕД торрентами
          for (var c = 0; c < categories.continue_view.length; c++) {
             targetContainer.append(categories.continue_view[c]);
          }

          // Затем вставляем остальные кнопки согласно настройкам сортировки
          for (var i = 0; i < buttonSortOrder.length; i++) {
            var category = buttonSortOrder[i];
            // Если в настройках вдруг есть continue_view, пропускаем, т.к. уже вставили
            if (category === 'continue_view') continue; 
            
            var buttons = categories[category];
            if (buttons) {
                for (var j = 0; j < buttons.length; j++) {
                  targetContainer.append(buttons[j]);
                }
            }
          }

          // Удаляем спаны если включена настройка
          if (Lampa.Storage.get('lme_showbuttonwn') == true) {
            targetContainer.find("span").remove();
          } else {
            if (isSmallScreen) {
              targetContainer.find('.view--reyohoho_mod span').remove();
            }
          }

          targetContainer.css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px'
          });

          // Стили для анимации
          targetContainer.find('.full-start__button').css({
            'transition': 'opacity 0.5s ease-in-out, transform 0.5s ease-in-out',
            'transform': 'scale(1)',
            'opacity': '1'
          });

          // 4. ВАЖНО: ОБНОВЛЯЕМ КОНТРОЛЛЕР
          // Это исправляет проблему с фокусом и нажатиями влево/вправо
          Lampa.Controller.toggle("full_start");
          console.log('showAllButtonsWithLogs: Навигация обновлена');
          
        }, 100); // Небольшая задержка, чтобы все плагины успели отработать
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
