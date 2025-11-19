"use strict";

(function () {
  'use strict';

  function showAllButtonsWithLogs() {
    console.log('ButtonSorter: Start (Clean Version)');
    Lampa.Listener.follow('full', function (e) {
      if (e.type === 'complite') {
        // Задержка, чтобы все плагины успели добавить свои кнопки
        setTimeout(function () {
          var fullContainer = e.object.activity.render();
          var targetContainer = fullContainer.find('.full-start-new__buttons');
          
          if (targetContainer.length === 0) return;

          // 1. Удаляем дубликат кнопки Play (если есть)
          fullContainer.find('.button--play').remove();

          // 2. Ищем нашу кнопку "Продолжить" (где бы она ни была)
          var continueButton = fullContainer.find('.button--continue-watch');

          // 3. Собираем все остальные кнопки
          var allButtons = fullContainer.find('.buttons--container .full-start__button').add(targetContainer.find('.full-start__button'));
          
          var categories = {
            torrent: [],
            online: [],
            trailer: [],
            other: []
          };

          // 4. Сортируем по массивам (не трогая сами элементы DOM пока что)
          allButtons.each(function () {
            var $button = $(this);
            
            // Пропускаем нашу кнопку (мы её вставим вручную)
            if ($button.hasClass('button--continue-watch')) return;

            var className = ($button.attr('class') || '').toLowerCase();

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
          
          // 5. Очищаем контейнер (визуально кнопки исчезнут на миллисекунду)
          targetContainer.empty();

          // --- ВСТАВКА В НУЖНОМ ПОРЯДКЕ ---

          // A. Торренты (Первые)
          for (var t = 0; t < categories.torrent.length; t++) {
              targetContainer.append(categories.torrent[t]);
          }

          // B. Продолжить просмотр (Вторая)
          if (continueButton.length) {
              targetContainer.append(continueButton);
          }

          // C. Остальные (согласно настройкам)
          for (var i = 0; i < buttonSortOrder.length; i++) {
            var category = buttonSortOrder[i];
            if (category === 'torrent') continue; 
            
            var buttons = categories[category];
            if (buttons) {
                for (var j = 0; j < buttons.length; j++) {
                  targetContainer.append(buttons[j]);
                }
            }
          }

          // --- ВАЖНО: Я УДАЛИЛ БЛОК, КОТОРЫЙ ДЕЛАЛ span.remove() ---
          // Теперь текст внутри кнопок остается живым, и анимация раскрытия будет работать.

          // Возвращаем базовые стили контейнера (чтобы кнопки стояли в ряд)
          targetContainer.css({
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center'
          });

          // Обновляем навигацию (карту пульта)
          Lampa.Controller.toggle("full_start");
          
        }, 800); 
      }
    });
  }

  function main() {
    showAllButtonsWithLogs();
  }

  main();
})();
