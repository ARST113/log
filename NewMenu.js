(function(){
  "use strict";
  var $ = window.$ || window.jQuery;
  if(!$) return;
  var Lampa = window.Lampa;
  if(!Lampa) return;
  var SIZE_KEY = 'topmenu_size';

  function getMenuSize(){
    var s = +(Lampa.Storage.get(SIZE_KEY)||1);
    if(s < 1 || s > 3) s = 1;
    return s;
  }

  function applyMenuSize(){
    $('#plugin-topmenu-size-style').remove();
    var s = getMenuSize();
    var lineHeights = ['2.25em','2.75em','3.25em'];
    var fontSizes = ['1.14em','1.35em','1.58em'];
    var iconHeights = ['1.21em','1.47em','1.75em'];
    var css =
      '.head__action.selector,'+
      '.head__action.head__settings,'+
      '.head__action.open--settings,'+
      '.head__action.open--search,'+
      '.head__action.open--profile,'+
      '.head__action.open--notice,'+ // уведомления, если есть
      '.plugin-topmenu-item {' +
        'height:' + lineHeights[s-1] + ' !important;' +
        'font-size:' + fontSizes[s-1] + ' !important;' +
        'min-width:' + lineHeights[s-1] + ' !important;' +
        'max-height:' + lineHeights[s-1] + ' !important;' +
      '}' +
      '.head__action.selector .menu__ico svg,' +
      '.head__action.selector .menu__ico img,' +
      '.head__action.head__settings svg, .head__action.head__settings img,' +
      '.head__action.open--search svg,.head__action.open--settings svg,.head__action.open--profile img,.head__action.open--notice svg,' +
      '.plugin-topmenu-item .menu__ico svg, .plugin-topmenu-item .menu__ico img,' +
      '.plugin-topmenu-item .topmenu-ico svg, .plugin-topmenu-item .topmenu-ico img {' +
        'height:' + iconHeights[s-1] + ' !important;width:auto !important;max-height:' + iconHeights[s-1] + ' !important;vertical-align:middle!important;display:inline-block!important;' +
      '}'
    ;
    $('<style id="plugin-topmenu-size-style">'+css+'</style>').appendTo('head');
  }

  (function injectGeneralStyles(){
    var id='plugin-topmenu-style';
    $('#'+id).remove();
    var css=[
      '.plugin-topmenu-item{margin-left:.25em !important;padding-left:.3em !important;padding-right:.5em !important;}',
      '.plugin-topmenu-item .topmenu-ico, .plugin-topmenu-item .topmenu-ico *, .plugin-topmenu-item .menu__ico, .plugin-topmenu-item .menu__ico *{margin:0 !important;padding:0 !important;}',
      '.plugin-topmenu-item .topmenu-label{display:inline-block !important;white-space:nowrap !important;max-width:0 !important;opacity:0 !important;margin-left:0 !important;padding-left:0 !important;overflow:hidden !important;transition:max-width .22s,opacity .16s,padding-left .16s !important;}',
      '@media (min-width:768px) and (orientation:landscape){.plugin-topmenu-item.focus .topmenu-label{max-width:18em !important;opacity:1 !important;padding-left:.15em !important;}}',
      '@media (max-width:767px),(orientation:portrait){.plugin-topmenu-item{width:2.25em !important;min-width:2.25em !important;padding:0 !important;justify-content:center !important;border-radius:50% !important;}.plugin-topmenu-item.focus .topmenu-label{max-width:0 !important;opacity:0 !important;padding-left:0 !important;}}',
      '.plugin-topmenu-item .menu__ico svg,.plugin-topmenu-item .menu__ico svg path,.plugin-topmenu-item .menu__ico svg use{transition:fill .14s,stroke .14s;}',
      '.plugin-topmenu-item.focus{color:#000 !important;}',
      '.topmenu-settings-icon{width:24px !important;height:24px !important;margin-right:10px !important;}',
      '.topmenu-settings-icon svg,.topmenu-settings-icon img{width:24px !important;height:24px !important;}'
    ].join('');
    $('<style id="'+id+'">'+css+'</style>').appendTo('head');
  })();

  function getStorageBool(key, def) {
    var v = Lampa.Storage.get(key);
    if(v === undefined || v === null) return def;
    if(typeof v === 'string') return v === 'true';
    return !!v;
  }

  function hideFeedAndTitle(){
    $('.head__action.selector.open--feed').hide();
    $('.head__title').hide();
  }

  // Фиксация правого блока (служебные кнопки) на последнем месте
  function placeFixedRightActions() {
    var container = $('.head__actions');
    var items = [
      $('.head__action.head__settings.selector.open--search'),
      $('.head__action.selector.open--settings'),
      $('.head__action.selector.open--notice'),
      $('.head__action.selector.open--profile')
    ];
    items.forEach(function($el){ if($el.length) $el.detach().appendTo(container); });
  }

  function addTopMenuItems(){
    applyMenuSize();
    var container = $('.head__actions');
    var leftMenu = $('.menu__list').first();
    var profileBtn = $('.head__action.selector.open--profile');
    if(!container.length || !leftMenu.length) return;
    container.find('.plugin-topmenu-item').remove();
    leftMenu.find('.menu__item').each(function(i){
      var showItem = getStorageBool('topmenu_show_item_'+i, true);
      if(!showItem) return;
      var $src = $(this);
      var $text = $src.find('.menu__text');
      if(!$text.length) return;
      var label = ($text.text()||'').trim();
      if(!label) return;
      var $ico = $src.find('.menu__ico').first().clone(true,true);
      var card = $('<div class="head__action selector plugin-topmenu-item" tabindex="0" style="display:flex;align-items:center;border-radius:12px;color:#fff;width:auto;flex-shrink:1;user-select:none;cursor:pointer;column-gap:0;transition:width .22s,background .16s,color .14s;"></div>');
      var icoWrap = $('<span class="topmenu-ico"></span>');
      if($ico.length){ $ico.css({'margin':'0','padding':'0'}); icoWrap.append($ico);}
      var labelEl = $('<span class="topmenu-label"></span>').text(label);
      card.append(icoWrap).append(labelEl);
      card.on('mouseenter focus', function(){
        card.addClass('focus');
        if(window.innerWidth>=768&&window.matchMedia('(orientation: landscape)').matches){
          card.css('width','9em');
        }
      });
      card.on('mouseleave blur',function(){card.removeClass('focus');card.css('width','auto');});
      card.on('hover:enter',function(){
        try{
          var link = $src.find('a');
          if(link.length && typeof link[0].click==='function') link[0].click();
          else $src.trigger('hover:enter');
        }catch(e){}
      });
      card.on('keydown',function(e){if(e.key==='Enter'||e.which===13){e.preventDefault();card.trigger('hover:enter');}});
      if(profileBtn.length) card.insertBefore(profileBtn); else container.append(card);
    });
    if(window.Lampa && window.Lampa.Controller && typeof window.Lampa.Controller.collectionSet==='function'){
      window.Lampa.Controller.collectionSet($('.head__actions .selector'));
    }
    hideFeedAndTitle();
    placeFixedRightActions(); // <--- фиксация служебных кнопок!
  }

  function buildSettings(){
    setTimeout(function(){
      var titles = [];
      $('.menu__list').first().find('.menu__item').each(function(){
        var text = $(this).find('.menu__text').text().trim();
        if(text) titles.push(text);
      });

      // ПЕРВЫМ компонент и selectbox через Lampa select-параметр!
      Lampa.SettingsApi.addComponent({
        component: 'top_menu_plugin',
        name: 'Верхнее меню',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>'
      });

      Lampa.SettingsApi.addParam({
        component: 'top_menu_plugin',
        param: {
          name: SIZE_KEY,
          type: 'select',
          default: 1,
          values: {1:'Стандартный',2:'Больше',3:'Очень большой'}
        },
        field: {
          name: 'Размер меню',
          description: 'Меняет размер всех иконок верхней панели'
        },
        onChange: function(val){
          Lampa.Storage.set(SIZE_KEY, val+"");
          setTimeout(function(){
            $('.plugin-topmenu-item').remove();
            addTopMenuItems();
          },30);
        }
      });

      // Меню
      titles.forEach(function(title,i){
        Lampa.SettingsApi.addParam({
          component: 'top_menu_plugin',
          param: {type:'button',name:'item_'+i},
          field: {name:title,description:''},
          onRender: function(item){
            var $menuItem = $('.menu__list').first().find('.menu__item').eq(i);
            var $icon = $menuItem.find('.menu__ico').first().clone();
            $icon.addClass('topmenu-settings-icon');
            $icon.find('svg,img').css({'width':'24px','height':'24px'});
            item.find('.settings-param__name').prepend($icon);
            function refreshStatus(){
              var isShown = getStorageBool('topmenu_show_item_'+i,true);
              var status = isShown ? 'Показано' : 'Скрыто';
              item.find('.settings-param__value').remove();
              var $value = $('<div class="settings-param__value"/>').text(status).css({'font-size':'1em'});
              item.append($value);
            }
            refreshStatus();
            item.off('hover:enter').on('hover:enter',function(){
              var val = getStorageBool('topmenu_show_item_'+i,true);
              Lampa.Storage.set('topmenu_show_item_'+i, !val ? 'true' : 'false');
              refreshStatus();
              setTimeout(function(){
                $('.plugin-topmenu-item').remove();
                addTopMenuItems();
              },50);
            });
          }
        });
      });
    },300);
  }

  buildSettings();
  setTimeout(addTopMenuItems,800);
})();
