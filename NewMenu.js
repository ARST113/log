Lampa.Platform.tv();

(function(){
"use strict";

/* ===== КОНСТАНТЫ ===== */
var CFG_KEY = "lhead_menu_cfg";
var PLUGIN_NAME = "Новое меню";
var PLUGIN_ENABLED_KEY = 'lhead_enabled';
var ICON_SIZE_KEY = 'lhead_icon_size';

/* ===== ВНУТРЕННЕЕ СОСТОЯНИЕ ДЛЯ ТВ ===== */
var tv = {
  enabled: true,               // ТВ-навигация активна всегда (клавиши/пульт)
  active: false,               // сейчас управляем шапкой
  index: 0,                    // текущий индекс фокуса
  focusables: [],              // список фокусируемых узлов в шапке
  keydownBound: null,          // ссылка на обработчик
  moHead: null,                // MutationObserver оригинальной head
  moBody: null                 // MutationObserver body (страховка)
};

/* ===== УТИЛИТЫ ===== */
function normalize(s){ return (s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
function getIconSize(){ return parseFloat(localStorage.getItem(ICON_SIZE_KEY)||'1.0'); }
function isEnabled(){ return localStorage.getItem(PLUGIN_ENABLED_KEY)==='true'; }
function writeCfg(cfg){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }catch(e){} }
function readCfg(){
  try{
    var raw=localStorage.getItem(CFG_KEY);
    if(!raw) return defaultMenu();
    var p=JSON.parse(raw);
    return Array.isArray(p)?p:defaultMenu();
  }catch(e){ return defaultMenu(); }
}
function getDefaultPanelList() {
  var src = scanLeftMenu();
  var needed = ["Фильмы","Сериалы","Аниме","Избранное","История","Настройки"];
  var result = [];
  needed.forEach(function(name){
    var found = src.find(i => normalize(i.title) === normalize(name));
    if (found) result.push({ title: found.title, icon: found.icon, enabled: true, type: 'mirror'});
  });
  return result;
}
function defaultMenu(){
  var cached = getDefaultPanelList();
  return cached.length ? cached : [
    {title:"Фильмы",   type:"mirror", enabled:true, icon:"emoji:🎬"},
    {title:"Сериалы",  type:"mirror", enabled:true, icon:"emoji:📺"},
    {title:"Аниме",    type:"mirror", enabled:true, icon:"emoji:🈲"},
    {title:"Избранное",type:"mirror", enabled:true, icon:"emoji:⭐"},
    {title:"История",  type:"mirror", enabled:true, icon:"emoji:🕓"},
    {title:"Настройки",type:"mirror", enabled:true, icon:"emoji:⚙️"}
  ];
}

/* ===== ОЖИДАНИЕ Lampa ===== */
var wait = setInterval(function(){
  if(window.Lampa && Lampa.SettingsApi && window.$){
    clearInterval(wait); boot();
  }
},200);

/* ===== РЕГИСТРАЦИЯ В НАСТРОЙКАХ ===== */
function boot(){
  var L=window.Lampa;

  L.SettingsApi.addComponent({
    component: 'new_menu_plugin',
    name: PLUGIN_NAME,
    icon: '<svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M4 8h24M4 16h24M4 24h24" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'
  });

  L.SettingsApi.addParam({
    component: 'new_menu_plugin',
    param: { name: 'open_menu_config', type: 'button', component: 'menu_config' },
    field: { name: 'Настроить верхнее меню', description: 'Открыть настройки верхнего меню' },
    onChange: openConfigUI
  });

  L.SettingsApi.addParam({
    component: 'new_menu_plugin',
    param: { name: 'plugin_enabled', type: 'trigger', default: false },
    field: { name: 'Включить верхнее меню', description: 'Будет отображаться новое верхнее меню' },
    onChange: function(v){
      localStorage.setItem(PLUGIN_ENABLED_KEY, v?'true':''); 
      v ? initPlugin() : cleanupPlugin();
      Lampa.Settings.update();
    }
  });

  L.SettingsApi.addParam({
    component: 'new_menu_plugin',
    param: { name: 'icon_size', type: 'select',
      values:{'0.8':'Маленькие','1.0':'Стандарт','1.2':'Крупные','1.4':'Очень крупные'},
      default:'1.0'
    },
    field: { name: 'Размер иконок', description: 'Изменить масштаб иконок верхнего меню' },
    onChange: function(v){
      localStorage.setItem(ICON_SIZE_KEY, v);
      applyIconSize(parseFloat(v));
    }
  });

  if(isEnabled()) setTimeout(initPlugin, 1);
}

/* ===== ЗАПУСК ПЛАГИНА ===== */
function initPlugin(){
  cleanupPlugin();          // на всякий
  injectStyles();

  var $head = renderHead();
  document.body.appendChild($head.get(0));

  moveWhitelistedHeadItems($head);      // перенос часов/профиля
  ensureProfilePresence($head, /*preferStub=*/false); // почин профиля, если пропал
  watchOriginalHeadForWhitelisted($head);

  buildMenuFromConfig($head, readCfg());
  enforceSpacing($head);
  bindRoutesStatic($head);
  installSearchModeWatcher();
  applyIconSize(getIconSize());

  setupTvNav($head);        // <<< добавлена TV-навигация
}

/* ===== ОЧИСТКА ===== */
function cleanupPlugin(){
  try{
    // снять глобальный keydown
    if (tv.keydownBound){
      document.removeEventListener('keydown', tv.keydownBound, true);
      tv.keydownBound = null;
    }
    // снять наблюдателей
    if (tv.moHead){ tv.moHead.disconnect(); tv.moHead = null; }
    if (tv.moBody){ tv.moBody.disconnect(); tv.moBody = null; }

    document.querySelectorAll('.lhead').forEach(function(n){ n.remove();});
    var st=document.getElementById('lhead-style'); if(st) st.remove();
  }catch(e){}
}

/* ===== РЕНДЕР НОВОЙ ШАПКИ ===== */
function renderHead(){
  var $=window.$||window.jQuery;
  var el = $(`<div class="lhead" data-plugin="head-nav">
    <div class="lhead__body">
      <div class="lhead__logo selector" tabindex="0" title="Главная" aria-label="Главная" role="button">
        <img src="./img/logo-icon.svg" style="width:2.55em;height:2.55em"/>
      </div>
      <div class="lhead__actions" role="menubar" aria-label="Верхнее меню"></div>
      <div class="lhead__right">
        <div class="lhead__right-item selector open--search" tabindex="0" title="Поиск" role="button" aria-label="Поиск">
          <svg width="32" height="32" viewBox="2 2 20 20" fill="none">
            <path d="M11 6C13.7614 6 16 8.23858 16 11M16.6588 16.6549L21 21M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z"
                  stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  </div>`);
  document.documentElement.classList.add('lhead--compact');
  return el;
}

/* ===== БЕЛЫЙ/ЧЕРНЫЙ СПИСКИ ПЕРЕНОСА ===== */
var WHITELIST = [
  '.head__action.selector.open--profile', // профиль
  '.head__time',
  '.head__clock'
];
var BLACKLIST = [
  '.head__action.selector.full-screen'
];
function ensureSingle(container, selector){
  var nodes = Array.from(container.querySelectorAll(selector));
  for (var i=1;i<nodes.length;i++) nodes[i].remove();
}
function moveWhitelistedHeadItems($head){
  var right = $head.find('.lhead__right').get(0);
  var orig  = document.querySelector('.head');
  if(!right || !orig) return;

  BLACKLIST.forEach(function(sel){
    right.querySelectorAll(sel).forEach(function(n){ n.remove(); });
  });

  WHITELIST.forEach(function(sel){
    if (right.querySelector(sel)) return;
    var node = orig.querySelector(sel);
    if (node) right.appendChild(node);
  });

  WHITELIST.forEach(function(sel){ ensureSingle(right, sel); });
}
function watchOriginalHeadForWhitelisted($head){
  var right = $head.find('.lhead__right').get(0);
  var orig  = document.querySelector('.head');
  if(!orig || !right) return;

  tv.moHead = new MutationObserver(function(muts){
    var needMove = false;
    muts.forEach(function(m){
      m.addedNodes && m.addedNodes.forEach(function(n){
        if (n.nodeType===1){
          if (n.matches && BLACKLIST.some(sel=>n.matches(sel))) { n.remove(); return; }
          if (n.matches && WHITELIST.some(sel=>n.matches(sel))) { needMove = true; }
          WHITELIST.forEach(function(sel){
            if (n.querySelector && n.querySelector(sel)) needMove = true;
          });
        }
      });
    });
    if (needMove){
      moveWhitelistedHeadItems($head);
      ensureProfilePresence($head, /*preferStub=*/false);
      rebuildFocusables($head);
    }
  });
  tv.moHead.observe(orig, {childList:true,subtree:true});

  // Доп. наблюдение за body — ловим большие перерисовки / смены активностей
  tv.moBody = new MutationObserver(function(){
    ensureProfilePresence($head, /*preferStub=*/false);
    rebuildFocusables($head);
  });
  tv.moBody.observe(document.body, {childList:true,subtree:true});
}

/* ===== ПОСТРОЕНИЕ МЕНЮ ===== */
function buildMenuFromConfig($head,cfg){
  var $=$ || window.$ || window.jQuery;
  var $wrap=$head.find('.lhead__actions');
  $wrap.empty();

  (cfg||[]).filter(Boolean).filter(it => it.enabled!==false).forEach(function(it){
    var html = `<div class="lhead__action selector" tabindex="0" role="menuitem" data-title="${it.title}">
      ${renderIconHTML(it)}<span class="lhead__label"><span>${it.title||it.key||'Item'}</span></span>
    </div>`;
    var $btn=$(html); $btn.data('cfg',it);
    $btn.on('click hover:enter',function(){ fireMenuAction($(this).data('cfg')); });
    $wrap.append($btn);
  });

  rebuildFocusables($head);
}
function renderIconHTML(item){
  var icon=item&&item.icon;
  if(typeof icon==="string"&&(icon.startsWith('<svg')||icon.startsWith('<img')||icon.startsWith('<span')||icon.startsWith('<i'))) return '<span class="lhead__ico" aria-hidden="true">'+icon+'</span>';
  if(typeof icon==="string"&&icon.startsWith("emoji:")){
    var ch = icon.slice(6); return '<span class="lhead__ico" aria-hidden="true">'+ch+'</span>';
  }
  if(typeof icon==="string"&&icon.startsWith("url:")){
    var src=icon.slice(4); return '<span class="lhead__ico" aria-hidden="true"><img src="'+src+'" alt="" /></span>';
  }
  return '<span class="lhead__ico" aria-hidden="true"></span>';
}
function fireMenuAction(item){
  if(!item || !item.title) return;
  var menuItem = Array.from(document.querySelectorAll('.menu__item,.selector')).find(x => normalize(x.textContent)===normalize(item.title));
  if(menuItem) menuItem.click();
}
function enforceSpacing($head){
  var items=$head.find('.lhead__actions .lhead__action').get();
  for(var i=1;i<items.length;i++) items[i].style.setProperty('margin-left','1.7rem','important');
}

/* ===== НАВИГАЦИЯ (Главная/Поиск) ===== */
function bindRoutesStatic($head){
  $head.find('.open--search').on('click hover:enter', function(){
    var searchBtn = Array.from(document.querySelectorAll('.menu__item,.selector')).find(x=> normalize(x.textContent)==='поиск');
    if(searchBtn) searchBtn.click();
    if(window.Lampa && Lampa.Search && Lampa.Search.open) Lampa.Search.open();
  });
  $head.find('.lhead__logo').on('click hover:enter', function(){
    var mainBtn = Array.from(document.querySelectorAll('.menu__item,.selector')).find(x=> normalize(x.textContent)==='главная');
    if(mainBtn) mainBtn.click();
    if(window.Lampa && Lampa.Activity && Lampa.Activity.push){
      Lampa.Activity.push({url:'',title:'Главная',component:'main',source:'tmdb',page:1});
    }
  });
}

/* ===== РЕЖИМ ПОИСКА (переключение шапок) ===== */
function isSearchActive(){
  return !!(document.querySelector('.search')||document.querySelector('.search-box')||document.body.classList.contains('search--active')||document.body.classList.contains('active--search'));
}
function setNativeHeadMode(on){
  var root=document.documentElement;
  if(on) root.classList.add('lhead-native--on'); else root.classList.remove('lhead-native--on');
}
function dedupeSearchBoxes(){
  try{
    var boxes=Array.from(document.querySelectorAll('.search,.search-box'));
    if(boxes.length>1){
      for(var i=0;i<boxes.length-1;i++) boxes[i].style.setProperty('display','none','important');
    }
  }catch(e){}
}
function updateSearchMode(){
  var on=isSearchActive();
  setNativeHeadMode(on);
  if(on) dedupeSearchBoxes();
  // когда открывается поиск — выключаем наш контроллер
  if (on) tv.active = false;
}
function installSearchModeWatcher(){
  try{
    var moHeadSwap=new MutationObserver(updateSearchMode);
    moHeadSwap.observe(document.body,{childList:true,subtree:true});
    updateSearchMode();
  }catch(e){}
}

/* ===== МАСШТАБ ИКОНОК ===== */
function applyIconSize(scale){
  document.querySelectorAll('.lhead .lhead__ico').forEach(function(el){
    el.style.transform=`scale(${scale})`;
    el.style.transformOrigin='center';
  });
}

/* ===== СКАН ЛЕВОГО МЕНЮ ДЛЯ КОНФИГА ===== */
function scanLeftMenu(){
  var results=[];
  try{
    var roots=document.querySelectorAll('.menu,.left-menu,.wrap__left,.navigation-bar,.menu__list,.menu__content,.menu__items');
    var seen=new Set();
    roots.forEach(function(root){
      var candidates=root.querySelectorAll('.selector,[data-action],[data-name],.menu__item,.navigation-bar__item');
      candidates.forEach(function(el){
        var t=(el.innerText||el.textContent||'').trim();
        var label=normalize(t); if(!label||label.length<2) return;
        if(seen.has(label)) return; seen.add(label);
        var svg=el.querySelector('svg');
        var iconHTML='';
        if(svg) iconHTML=svg.outerHTML;
        var img=!svg&&el.querySelector('img[src]');
        if(!svg&&img) iconHTML='<img src="'+img.src+'" style="width:2.3em;height:2.3em;">';
        var iSpan=!svg&&!img&&el.querySelector('span[class*="icon"],i[class*="icon"]');
        if(!svg&&!img&&iSpan) iconHTML=iSpan.outerHTML;
        if(!iconHTML) iconHTML='emoji:📁';
        results.push({title:t,icon:iconHTML});
      });
    });
  }catch(e){}
  return results;
}

/* ===== КОНФИГУРАТОР МЕНЮ ===== */
function openConfigUI(){
  injectStyles();
  document.querySelectorAll('.lhead-modal').forEach(n=>n.remove());

  var cfg=readCfg();
  var $head = window.$('.lhead');
  if(!$head.length) { $head = renderHead(); document.body.appendChild($head.get(0)); }
  buildMenuFromConfig($head, cfg); enforceSpacing($head);

  var modal=document.createElement('div');
  modal.className='lhead-modal';
  modal.innerHTML=`
    <div class="lhead-modal__box">
      <div class="lhead-modal__title">Верхнее меню — выберите нужные пункты</div>
      <div class="lhead-modal__section">
        <div style="margin-bottom:6px;opacity:.8">Из бокового меню:</div>
        <div class="lhead-list" id="lhead-list-left"></div>
      </div>
      <div class="lhead-modal__controls">
        <button data-act="save">Сохранить</button>
        <button data-act="cancel">Отмена</button>
        <button data-act="defaults">Сбросить</button>
        <span style="margin-left:auto;opacity:.8" id="lhead-count"></span>
      </div>
    </div>`;
  document.body.appendChild(modal);

  var leftAvail=scanLeftMenu();
  var current=(cfg||[]).filter(Boolean);
  var selectedSet=new Set(current.map(x=>"m:"+normalize(x.title)));

  function renderTag(container,id,label,checked,iconHTML){
    var tag=document.createElement('label');
    tag.className='lhead-tag';
    if(checked) tag.classList.add('selected');
    tag.innerHTML=
      `<input type="checkbox" data-id="${id}" ${checked?'checked':''}/><span>${iconHTML||''}</span><span>${label}</span>`;
    container.appendChild(tag);
  }

  var wrapLeft=modal.querySelector('#lhead-list-left');
  leftAvail.forEach(function(it){
    var id='m:'+normalize(it.title);
    renderTag(wrapLeft,id,it.title,selectedSet.has(id),renderIconHTML(it));
  });

  wrapLeft.addEventListener('change',function(e){
    if(e.target.tagName!=="INPUT") return;
    var lab = e.target.closest('.lhead-tag');
    if(e.target.checked) lab.classList.add('selected');
    else lab.classList.remove('selected');
  });

  var counter=modal.querySelector('#lhead-count');
  function updateCount(){ 
    var checked=modal.querySelectorAll('input[type="checkbox"]:checked').length; 
    counter.textContent='Выбрано: '+checked; counter.style.color='#ccc';
  }
  modal.addEventListener('change',updateCount); updateCount();

  modal.addEventListener('click',function(e){
    var btn=e.target.closest('button'); if(!btn) return;
    var act=btn.getAttribute('data-act');
    if(act==="cancel"){ modal.remove(); }
    else if(act==="defaults"){
      writeCfg(defaultMenu());
      buildMenuFromConfig($head,readCfg()); enforceSpacing($head); modal.remove();
      rebuildFocusables($head);
    }
    else if(act==="save"){
      var ids=Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.getAttribute('data-id'));
      var newCfg=[];
      leftAvail.forEach(function(m){
        if(ids.includes('m:'+normalize(m.title)))
          newCfg.push({title:m.title,type:'mirror',enabled:true,icon:m.icon||'emoji:📁'});
      });
      writeCfg(newCfg);
      buildMenuFromConfig($head,newCfg); enforceSpacing($head); modal.remove();
      rebuildFocusables($head);
    }
  });
}

/* ===== ТВ-НАВИГАЦИЯ: фокус и клавиши ===== */
function rebuildFocusables($head){
  // порядок: логотип → пункты меню → правые элементы (поиск, профиль, часы как не-фокусные)
  var right = Array.from($head.find('.lhead__right .selector').get());
  var actions = Array.from($head.find('.lhead__actions .lhead__action').get());
  var logo = $head.find('.lhead__logo').get(0);

  // Только фокусопригодные
  tv.focusables = []
    .concat(logo ? [logo] : [])
    .concat(actions)
    .concat(right);

  tv.focusables.forEach(function(el, i){
    el.setAttribute('data-index', String(i));
    el.classList.remove('focus');
    el.addEventListener('hover:focus', function(){ tv.index = i; markFocus(i); tv.active = true; }, {passive:true});
    el.addEventListener('focusin',     function(){ tv.index = i; markFocus(i); tv.active = true; }, {passive:true});
    el.addEventListener('mouseenter',  function(){ /* мышь не обязательна на ТВ */ }, {passive:true});
  });

  // Если активен контроллер — восстановим фокус
  if (tv.active && tv.focusables[tv.index]) markFocus(tv.index);
}
function markFocus(i){
  tv.focusables.forEach(function(n){ n.classList.remove('focus'); });
  var el = tv.focusables[i];
  if (el){
    el.classList.add('focus');
    // сымитируем "фокус" для Lampa
    try{ $(el).trigger('hover:focus'); }catch(e){}
    if (typeof el.focus === 'function') el.focus({preventScroll:true});
  }
}
function focusFirstContent(){
  // попытка передать фокус в ближайший контент
  var cand = document.querySelector('.content .selector, .items-line .selector, .menu .selector, .menu__item .selector, .selector');
  if (cand){
    try{ $(cand).trigger('hover:focus'); }catch(e){}
    if (typeof cand.focus==='function') cand.focus({preventScroll:true});
  }
}
function atTopRow(){
  // если текущий фокус очень высоко — позволим "поднять" его в шапку
  var cur = document.querySelector('.selector.focus');
  if (!cur) return true;
  var rect = cur.getBoundingClientRect();
  return rect.top < 120; // ~ верхний ряд
}
function setupTvNav($head){
  // глобальный обработчик клавиш (в режиме поиска — выключаемся)
  tv.keydownBound = function onKey(e){
    if (isSearchActive()) return;                   // родной поиск сам рулит
    var key = e.key || e.code;
    var kc  = e.keyCode || e.which;

    // Подняться в шапку по ArrowUp, если мы близко к верху и не в шапке
    if (!tv.active && (key==='ArrowUp' || kc===38)){
      if (atTopRow()){
        tv.active = true;
        // если уже был индекс — оставим, иначе на первый видимый
        if (!tv.focusables.length) rebuildFocusables($head);
        tv.index = Math.min(tv.index || 0, Math.max(0, tv.focusables.length-1));
        markFocus(tv.index);
        e.preventDefault(); e.stopPropagation();
        return;
      }
    }

    if (!tv.active) return; // мы не управляем шапкой сейчас

    // Управление в шапке
    if (key==='ArrowRight' || kc===39){
      tv.index = Math.min(tv.index+1, tv.focusables.length-1);
      markFocus(tv.index);
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (key==='ArrowLeft' || kc===37){
      tv.index = Math.max(tv.index-1, 0);
      markFocus(tv.index);
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (key==='Enter' || kc===13 || kc===65376 /* Tizen OK */){
      var el = tv.focusables[tv.index];
      if (el){
        try{ $(el).trigger('hover:enter'); }catch(err){}
        el.click && el.click();
      }
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (key==='ArrowDown' || kc===40){
      tv.active = false;
      tv.focusables.forEach(n=>n.classList.remove('focus'));
      focusFirstContent();
      e.preventDefault(); e.stopPropagation(); return;
    }
    // BACK (WebOS 461, Tizen 10009) — просто выходим из шапки, пусть дальше обрабатывает Lampa
    if (kc===461 || kc===10009){
      tv.active = false;
      tv.focusables.forEach(n=>n.classList.remove('focus'));
      return; // не preventDefault — отдаём системной "Назад"
    }
  };

  document.addEventListener('keydown', tv.keydownBound, true);

  // Пересборка фокусируемых при первичном запуске
  rebuildFocusables($head);
}

/* ===== ПРОФИЛЬ: устойчивое присутствие ===== */
function ensureProfilePresence($head, preferStub){
  var right = $head.find('.lhead__right').get(0);
  if (!right) return;

  var haveNative = !!right.querySelector('.head__action.selector.open--profile');
  var stub = right.querySelector('.lhead__profile-stub');

  if (haveNative){
    // если рядом висит заглушка — удаляем
    if (stub) stub.remove();
    return;
  }

  // Попытаемся перенести ещё раз из .head
  var orig = document.querySelector('.head .head__action.selector.open--profile');
  if (orig){
    right.appendChild(orig);
    rebuildFocusables($head);
    return;
  }

  // Если нет — создаём заглушку (приоритет зависит от preferStub)
  if (!stub && (preferStub || true)){
    var btn = document.createElement('div');
    btn.className = 'lhead__right-item selector lhead__profile-stub open--profile';
    btn.setAttribute('tabindex','0');
    btn.setAttribute('title','Профиль');

    // простая иконка-пользователь
    btn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="#fff" stroke-width="2"/><path d="M4 20c0-3.3137 3.134-6 7-6h2c3.866 0 7 2.6863 7 6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';

    function openProfile(){
      // 1) если где-то есть настоящий .open--profile — кликнем его
      var trueBtn = document.querySelector('.head__action.selector.open--profile');
      if (trueBtn && trueBtn !== btn){ trueBtn.click(); return; }

      // 2) попробуем вызвать API, если существует
      try{
        if (window.Lampa && Lampa.Account && typeof Lampa.Account.open === 'function'){
          Lampa.Account.open(); return;
        }
      }catch(e){}

      // 3) ищем пункт меню "Профиль" / "Аккаунт" / fallback "Настройки"
      var m = Array.from(document.querySelectorAll('.menu__item,.selector'));
      var cand = m.find(x=>/профиль|аккаунт/i.test(x.textContent)) || m.find(x=>/настройки/i.test(x.textContent));
      if (cand) cand.click();
    }

    btn.addEventListener('click', openProfile);
    try{ $(btn).on('hover:enter', openProfile); }catch(e){}

    right.appendChild(btn);
    rebuildFocusables($head);
  }
}

/* ===== СТИЛИ ===== */
function injectStyles(){
  if (document.getElementById('lhead-style')) return;
  var css = `
.lhead{position:fixed;top:0;left:0;width:100%;z-index:15}
.lhead__body{padding:0.95em 2.22em;display:flex;align-items:center;}
.lhead__logo{width:2.7em;flex-shrink:0;margin-left:1em;margin-right:3rem;}
.lhead__actions{display:flex;flex:1 1 0;min-width:0;}
.lhead__right{display:flex;align-items:center;gap:1.2em;flex-shrink:0;}
.lhead__right-item>svg{width:2em;height:2em;}
.lhead__action{display:inline-flex;align-items:center;justify-content:center;border-radius:12px;transition:background .13s,color .12s;cursor:pointer;padding:0 .61em;font-size:1.21em;height:2.7em;margin:.10em 0;}
.lhead__ico{display:inline-flex;width:2.2em;height:2.2em;align-items:center;justify-content:center;flex-shrink:0;transition:color .15s;}
.lhead__ico svg,.lhead__ico img{width:2.1em;height:2.1em;display:block;}
.lhead__label{display:inline-block;max-width:0;opacity:0;white-space:nowrap;overflow:hidden;margin-left:0;transition:max-width .23s,opacity .23s,margin-left .20s;font-size:1.02em;color:#fff;}
.lhead__action:hover .lhead__label,
.lhead__action.focus .lhead__label,
.lhead__action.hover .lhead__label{max-width:10em;opacity:1;margin-left:1.1em;color:#23232a;}
.lhead__action:hover,
.lhead__action:focus,
.lhead__action.focus,
.lhead__action.hover{
  background:#fff; color:#23232a!important;
}
.lhead__action:hover .lhead__ico,
.lhead__action:focus .lhead__ico,
.lhead__action.focus .lhead__ico,
.lhead__action.hover .lhead__ico { color:#23232a!important; }
.lhead__action:hover .lhead__ico svg,
.lhead__action:focus .lhead__ico svg,
.lhead__action.focus .lhead__ico svg,
.lhead__action.hover .lhead__ico svg { fill:#23232a!important; color:#23232a!important; }
.lhead__action:hover .lhead__label span,
.lhead__action:focus .lhead__label span,
.lhead__action.focus .lhead__label span,
.lhead__action.hover .lhead__label span { color:#23232a!important; }

@media (max-width:900px), (max-width:850px){
  .lhead__body{padding:0.45em 0.9em;}
  .lhead__action{font-size:1em;padding:0 0.19em;}
  .lhead__ico, .lhead__ico svg,.lhead__ico img{width:1.55em;height:1.55em;}
  .lhead__label{max-width:0!important;opacity:0!important;margin-left:0!important;}
}
@media (orientation: portrait) {
  .lhead__logo,
  .lhead__right-item.open--search { display:none !important; }
}

/* модалка конфигуратора (как было) */
.lhead-modal{position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center}
.lhead-modal__box{width:min(1130px,99vw);max-height:94vh;overflow:auto;background:#23232a;border-radius:13px;padding:30px 26px 24px;color:#fff}
.lhead-modal__title{font-size:25px;margin-bottom:22px;font-weight:700;}
.lhead-modal__section{margin:15px 0}
.lhead-list{display:flex;flex-wrap:wrap;gap:16px}
.lhead-tag{display:inline-flex;align-items:center;gap:12px;background:#272737;border:1.4px solid #373745;border-radius:999px;padding:9px 19px 9px 13px;font-size:1.18em;transition:background .10s;}
.lhead-tag input{display:none;}
.lhead-tag.selected{background:#fff;color:#23232a;font-weight:500;}
.lhead-tag.selected .lhead__ico,
.lhead-tag.selected .lhead__ico svg,
.lhead-tag.selected .lhead__ico img{color:#23232a!important;fill:#23232a!important;filter:none!important;}
.lhead-tag.selected span{color:#23232a!important;}
.lhead-tag.selected svg{fill:#23232a!important;}
.lhead-tag.selected img{filter:brightness(0.16);}
.lhead-tag:hover{background:#cfcfcf;color:#23232a;}
.lhead-modal__controls{display:flex;gap:20px;margin-top:21px;flex-wrap:wrap;}
.lhead-modal__controls button{padding:10px 16px;border-radius:12px;background:#222;border:1.5px solid #363646;color:#fff;cursor:pointer;font-size:1.13em;}
.lhead-modal__controls span{font-size:1em;}
.lhead-modal__controls #lhead-count{min-width:8em;display:inline-block;}

/* скрыть родную шапку */
.head{visibility:hidden!important;opacity:0!important;pointer-events:none!important}

/* в режиме поиска показываем родную шапку */
.lhead-native--on .head{visibility:visible!important;opacity:1!important;pointer-events:auto!important}
.lhead-native--on .lhead{display:none!important}

/* портрет/мобайл */
body.true--mobile.orientation--portrait .lhead__body{justify-content:space-between;padding:1em 1em}
body.true--mobile.orientation--portrait .lhead__actions,
.lhead--compact .lhead__actions,
.lhead--compact .lhead__right{display:flex;align-items:center;gap:1em;flex-shrink:0}
body.true--mobile.orientation--portrait .lhead__actions .lhead__label{max-width:0!important;opacity:0!important;margin-left:0!important;}

/* запретить full-screen внутри нашей шапки */
.lhead .head__action.selector.full-screen{display:none!important;visibility:hidden!important}
`;
  var st=document.createElement("style"); st.id='lhead-style'; st.textContent=css; document.head.appendChild(st);
}

/* ===== КОНЕЦ IIFE ===== */
})();
