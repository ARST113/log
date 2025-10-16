(function(){
  "use strict";

  var $ = window.$ || window.jQuery;
  if(!$) return;

  var Lampa = window.Lampa;
  if(!Lampa) return;

  /* === Стили для настроек === */
  (function injectSettingsStyles(){
    var id = 'plugin-topmenu-settings-style';
    $('#'+id).remove();

    var css = [
      '.topmenu-settings-icon {',
      '  width: 24px !important;',
      '  height: 24px !important;',
      '  margin-right: 10px !important;',
      '}',
      '.topmenu-settings-icon svg, .topmenu-settings-icon img {',
      '  width: 24px !important;',
      '  height: 24px !important;',
      '}'
    ].join('\n');

    $('<style id="'+id+'">'+css+'</style>').appendTo('head');
  })();

  /* === Ховер-эффект для верхнего меню === */
  (function injectRevealStyles(){
    var id = 'plugin-topmenu-reveal-style';
    $('#'+id).remove();

    var css = [
      '.plugin-topmenu-item{',
      '  margin-left:.25em !important;',
      '  padding-left:.3em !important;',
      '  padding-right:.5em !important;',
      '}',
      
      '.plugin-topmenu-item .topmenu-ico,',
      '.plugin-topmenu-item .topmenu-ico *,',
      '.plugin-topmenu-item .menu__ico,',
      '.plugin-topmenu-item .menu__ico *{',
      '  margin:0 !important;',
      '  padding:0 !important;',
      '}',
      
      '.plugin-topmenu-item .topmenu-label{',
      '  display:inline-block !important;',
      '  white-space:nowrap !important;',
      '  max-width:0 !important;',
      '  opacity:0 !important;',
      '  margin-left:0 !important;',
      '  padding-left:0 !important;',
      '  overflow:hidden !important;',
      '  transition: max-width .22s ease, opacity .16s ease, padding-left .16s ease !important;',
      '}',

      '@media (min-width: 768px) and (orientation: landscape) {',
      '  .plugin-topmenu-item.focus .topmenu-label{',
      '    max-width:18em !important;',
      '    opacity:1 !important;',
      '    padding-left:.15em !important;',
      '  }',
      '}',

      '@media (max-width: 767px), (orientation: portrait) {',
      '  .plugin-topmenu-item{',
      '    width:2.25em !important;',
      '    min-width:2.25em !important;',
      '    padding:0 !important;',
      '    justify-content:center !important;',
      '    border-radius:50% !important;',
      '  }',
      '  .plugin-topmenu-item.focus .topmenu-label{',
      '    max-width:0 !important;',
      '    opacity:0 !important;',
      '    padding-left:0 !important;',
      '  }',
      '}',

      '.plugin-topmenu-item .menu__ico svg,',
      '.plugin-topmenu-item .menu__ico svg path,',
      '.plugin-topmenu-item .menu__ico svg use{',
      '  transition: fill .14s ease, stroke .14s ease;',
      '}',

      '.plugin-topmenu-item.focus{ color:#000 !important; }'
    ].join('\n');

    $('<style id="'+id+'">'+css+'</style>').appendTo('head');
  })();

  /* === Удаляем ненужные элементы === */
  (function removeUnwantedElements(){
    $('.head__title').remove();
    $('.head__action.selector.full-screen').remove();
  })();

  // Безопасное получение булева значения из Storage
  function getStorageBool(key, defaultValue){
    var value = Lampa.Storage.get(key);
    if(value === undefined || value === null) return defaultValue;
    // Конвертируем в булев тип
    if(typeof value === 'string') return value === 'true';
    return !!value;
  }

  /* === Переносим пункты левого меню в верхний бар === */
  function addTopMenuItems(){
    var container = $('.head__actions');
    var leftMenu  = $('.menu__list').first();
    var profileBtn = $('.head__action.selector.open--profile');
    
    if(!container.length || !leftMenu.length) return;

    container.find('.plugin-topmenu-item').remove();

    var addedCount = 0;
    leftMenu.find('.menu__item').each(function(index){
      var showItem = getStorageBool('topmenu_show_item_' + index, true);
      
      if(!showItem) return;

      var $src    = $(this);
      var $textEl = $src.find('.menu__text');
      if(!$textEl.length) return;

      var label = ($textEl.text() || '').trim();
      if(!label) return;

      var $ico = $src.find('.menu__ico').first().clone(true,true);

      var card = $('<div class="head__action selector plugin-topmenu-item" tabindex="0" style="'
        + 'display:flex;'
        + 'align-items:center;'
        + 'border-radius:12px;'
        + 'height:2.25em;'
        + 'color:#fff;'
        + 'font-size:1.14em;'
        + 'width:auto;'
        + 'flex-shrink:1;'
        + 'user-select:none;'
        + 'cursor:pointer;'
        + 'column-gap:0;'
        + 'transition:width .22s ease, background .16s, color .14s;'
        + '"></div>');

      var icoWrap = $('<span class="topmenu-ico"></span>');
      if($ico.length) {
        $ico.css({'margin': '0', 'padding': '0'});
        icoWrap.append($ico);
      }

      var labelEl = $('<span class="topmenu-label"></span>').text(label);

      card.append(icoWrap).append(labelEl);

      card.on('mouseenter focus', function(){ 
        card.addClass('focus');
        if(window.innerWidth >= 768 && window.matchMedia('(orientation: landscape)').matches) {
          card.css('width', '9em');
        }
      });
      card.on('mouseleave blur',  function(){ 
        card.removeClass('focus');
        card.css('width', 'auto');
      });

      card.on('hover:enter', function(){
        try{
          var link = $src.find('a');
          if(link.length && typeof link[0].click === 'function') link[0].click();
          else $src.trigger('hover:enter');
        }catch(e){
          console.warn('[TopMenu] activation error:', e);
        }
      });

      card.on('keydown', function(e){
        if(e.key === 'Enter' || e.which === 13){
          e.preventDefault();
          card.trigger('hover:enter');
        }
      });

      if(profileBtn.length) {
        card.insertBefore(profileBtn);
      } else {
        container.append(card);
      }
      
      addedCount++;
    });

    if (Lampa.Controller && typeof Lampa.Controller.collectionSet === 'function'){
      Lampa.Controller.collectionSet($('.head__actions .selector'));
    }
  }

  // Создание настроек
  function buildSettings(){
    setTimeout(function(){
      var titles = [];
      $('.menu__list').first().find('.menu__item').each(function(){
        var text = $(this).find('.menu__text').text().trim();
        if(text) titles.push(text);
      });
      
      Lampa.SettingsApi.addComponent({
        component: 'top_menu_plugin',
        name: 'Верхнее меню',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>'
      });

      // Переключатели для каждого найденного пункта
      titles.forEach(function(title, index){
        Lampa.SettingsApi.addParam({
          component: 'top_menu_plugin',
          param: {
            type: 'button',
            name: 'item_' + index
          },
          field: {
            name: title,
            description: ''
          },
          onRender: function(item){
            // Получаем иконку
            var $menuItem = $('.menu__list').first().find('.menu__item').eq(index);
            var $icon = $menuItem.find('.menu__ico').first().clone();
            
            // Уменьшаем иконку
            $icon.addClass('topmenu-settings-icon');
            $icon.find('svg, img').css({
              'width': '24px',
              'height': '24px'
            });
            
            // Вставляем иконку перед названием
            var $name = item.find('.settings-param__name');
            $name.prepend($icon);
            
            // Функция обновления статуса
            function refreshStatus(){
              var isShown = getStorageBool('topmenu_show_item_' + index, true);
              var status = isShown ? 'Показано' : 'Скрыто';
              
              item.find('.settings-param__value').remove();
              var $value = $('<div class="settings-param__value"/>')
                .text(status)
                .css({'font-size': '1em'});
              item.append($value);
            }
            
            // Начальный статус
            refreshStatus();
            
            // Обработчик клика
            item.off('hover:enter').on('hover:enter', function(e){
              var currentValue = getStorageBool('topmenu_show_item_' + index, true);
              var newValue = !currentValue;
              
              // Сохраняем СТРОКУ для надежности
              Lampa.Storage.set('topmenu_show_item_' + index, newValue ? 'true' : 'false');
              
              // Обновляем статус в UI
              refreshStatus();
              
              // Обновляем верхнее меню
              setTimeout(function(){
                $('.plugin-topmenu-item').remove();
                addTopMenuItems();
              }, 50);
            });
          }
        });
      });
    }, 1000);
  }

  // Инициализация
  buildSettings();
  setTimeout(addTopMenuItems, 800);

})();
