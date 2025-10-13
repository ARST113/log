// head_navbar.plugin.js
(function () {
  'use strict';

  var wait = setInterval(function () {
    if (typeof window.Lampa !== 'undefined') {
      clearInterval(wait);
      boot();
    }
  }, 200);

  var CFG_KEY = 'lhead_menu_v3';
  var MAX_ITEMS = 7;

  function defaultMenu() {
    return [
      { key:'movie',     title:'Фильмы',    type:'builtin', enabled:true, icon:'movie' },
      { key:'tv',        title:'Сериалы',   type:'builtin', enabled:true, icon:'tv' },
      { key:'mult',      title:'Мульт',     type:'builtin', enabled:true, icon:'mult' },
      { key:'anime',     title:'Аниме',     type:'builtin', enabled:true, icon:'anime' },
      { key:'favorite',  title:'Избранное', type:'builtin', enabled:true, icon:'favorite' }
    ];
  }

  function readCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (!raw) return defaultMenu();
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : defaultMenu();
    } catch(e){ return defaultMenu(); }
  }
  function writeCfg(cfg) { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch(e){} }

  // Встроенные SVG‑иконки
  var ICONS = {
    movie:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h3l2 4h3l2-4h3l2 4h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
    tv:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="13" rx="2" ry="2"/><path d="M8 7l4-4 4 4"/></svg>',
    mult:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm-2 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm4 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>',
    anime:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 12a8 8 0 1 1 16 0v5H4v-5zm3 8h10"/></svg>',
    favorite:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21l-8-6 3-9h10l3 9-8 6z"/></svg>',
    mytorrents:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3z"/></svg>',
    sisi:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>',
    feed:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6a12 12 0 0 1 12 12h-2A10 10 0 0 0 6 8V6z"/><circle cx="6" cy="18" r="2"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>'
  };

  function boot() {
    var $ = window.$ || window.jQuery;
    var L = window.Lampa;
    var Storage = L.Storage || {};
    var Controller = L.Controller || {};
    var Activity = L.Activity || {};
    var Search = L.Search || {};
    var Navigator = L.Navigator || window.Navigator || {};

    cleanupPlugin();
    hideNativeHeadChildren();
    keepChildrenHidden();
    injectStyles();

    var $head = renderHead();
    document.body.appendChild($head.get(0));
    buildMenuFromConfig($head, readCfg());
    enforceSpacing($head);

    var moFix = new MutationObserver(function(){ enforceSpacing($head); });
    moFix.observe(document.body, { childList:true, subtree:true });

    bindRoutesStatic($head, Search);
    addController($head);
    hijackMenuToggle(Controller);
    installSearchModeWatcher();

    $head.find('.open--headcfg').on('click hover:enter', function () {
      openConfigUI($head);
    });
  }

  // housekeeping
  function cleanupPlugin(){
    try {
      document.querySelectorAll('.lhead').forEach(function(n){ n.remove(); });
      ['lhead-style','kill-head-children'].forEach(function(id){ var x=document.getElementById(id); if (x) x.remove(); });
    } catch(e){}
  }
  function hideNativeHeadChildren(){
    try {
      var st = document.createElement('style');
      st.id = 'kill-head-children';
      st.textContent = `
        .head__logo,
        .head__actions,
        .head__action-rights,
        .head__menu-icon { display:none !important; visibility:hidden !important; }
      `;
      document.head.appendChild(st);
    } catch(e){}
  }
  function keepChildrenHidden(){
    try {
      var observer = new MutationObserver(function(){
        var nodes = document.querySelectorAll('.head__logo, .head__actions, .head__action-rights, .head__menu-icon');
        nodes.forEach(function(n){ n.style.setProperty('display','none','important'); });
      });
      observer.observe(document.body, { childList:true, subtree:true });
    } catch(e){}
  }
  function injectStyles(){
    var css = `
.lhead{position:fixed;top:0;left:0;width:100%;z-index:15}
.lhead__body{padding:0.5em 1.5em;display:flex;align-items:center}
.lhead__logo{width:2.7em;flex-shrink:0;margin-left:1em;margin-right:2em;position:relative;transition:transform .3s ease}
.lhead__logo.focus,.lhead__logo.hover{transform:scale(1.2)}
.lhead__actions{display:flex !important;flex-wrap:nowrap;white-space:nowrap}
.lhead__actions .lhead__action{display:inline-flex !important;align-items:center;padding:0 .35em;color:rgba(255,255,255,.85);background:transparent;transition:transform .3s ease}
.lhead__actions .lhead__action.focus,.lhead__actions .lhead__action.hover{color:#fff;transform:scale(1.2)}
.lhead__ico{display:inline-flex;width:1.8em;height:1.8em;align-items:center;justify-content:center;flex-shrink:0}
.lhead__ico svg,.lhead__ico img{width:1.6em;height:1.6em;display:block}
.lhead__label{display:inline-block;max-width:0;opacity:0;white-space:nowrap;overflow:hidden;margin-left:0;transition:max-width .25s ease,opacity .2s ease,margin-left .2s ease}
.lhead--compact .lhead__action:hover .lhead__label,
.lhead--compact .lhead__action.focus .lhead__label,
.lhead--compact .lhead__action.hover .lhead__label{max-width:12em;opacity:1;margin-left:.5em}
@media (hover: none){ .lhead--compact .lhead__label{max-width:12em;opacity:1;margin-left:.5em} }
.lhead__actions .lhead__action + .lhead__action{margin-left:1rem !important}
.lhead__actions .lhead__action + .lhead__action::before{content:"";display:inline-block;width:1rem;min-width:1rem;height:1px;flex:0 0 auto}
@supports (gap: 1rem){
  .lhead__actions{gap:1rem}
  .lhead__actions .lhead__action + .lhead__action{margin-left:0 !important}
  .lhead__actions .lhead__action + .lhead__action::before{width:0;min-width:0}
}
.lhead__right{position:fixed;right:2em;display:flex;gap:1em}
.lhead__actions + .lhead__right{margin-left:auto}
.lhead__right-item{position:static}
.lhead__right-item>svg{width:2em;height:2em;flex-shrink:0}
.lhead__right-item.btn-cfg::after{content:"⚙"; color:#fff; font-size:1.4em; line-height:1; display:inline-block; padding:0 .1em}
body.true--mobile.orientation--portrait .lhead__body{justify-content:space-between;padding:1em 1em}
body.true--mobile.orientation--portrait .lhead__logo{width:2.5em;margin-left:0;margin-right:1em;flex-shrink:0}
body.true--mobile.orientation--portrait .lhead__actions,
body.true--mobile.orientation--portrait .lhead__right{display:flex;align-items:center;gap:1em;flex-shrink:0}
body.true--mobile.orientation--portrait .lhead__right{position:static;margin-right:0}
body.true--mobile.orientation--portrait .lhead__actions .lhead__label{max-width:12em;opacity:1;margin-left:.5em}
.head{visibility:hidden!important;opacity:0!important;pointer-events:none!important}
.lhead-native--on .head{visibility:visible!important;opacity:1!important;pointer-events:auto!important}
.lhead-native--on .lhead{display:none!important}
.lhead-modal{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}
.lhead-modal__box{width:min(980px,92vw);max-height:86vh;overflow:auto;background:#1f1f1f;border-radius:10px;padding:16px;color:#fff}
.lhead-modal__title{font-size:20px;margin-bottom:12px}
.lhead-modal__section{margin:10px 0}
.lhead-list{display:flex;flex-wrap:wrap;gap:8px}
.lhead-tag{display:inline-flex;align-items:center;gap:6px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:999px;padding:6px 10px}
.lhead-tag input{margin:0}
.lhead-modal__controls{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.lhead-modal__controls button{padding:8px 12px;border-radius:8px;background:#2a2a2a;border:1px solid #3a3a3a;color:#fff;cursor:pointer}
`;
    var st = document.createElement('style');
    st.id = 'lhead-style';
    st.textContent = css;
    document.head.appendChild(st);
  }
  function renderHead(){
    var $ = window.$ || window.jQuery;
    var el = $(`
<div class="lhead" data-plugin="head-nav">
  <div class="lhead__body">
    <div class="lhead__logo selector open--main" tabindex="0"><img src="./img/logo-icon.svg" /></div>
    <div class="lhead__actions"></div>
    <div class="lhead__right">
      <div class="lhead__right-item selector btn-cfg open--headcfg" tabindex="0" title="Меню"></div>
      <div class="lhead__right-item selector open--search" tabindex="0" title="Поиск">
        <svg width="32" height="32" viewBox="2 2 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 6C13.7614 6 16 8.23858 16 11M16.6588 16.6549L21 21M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="lhead__right-item selector open--settings" tabindex="0" title="Настройки">
        <svg width="32" height="32" viewBox="1.25 1 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3" stroke="#fff" stroke-width="1.75"/></svg>
      </div>
    </div>
  </div>
</div>
    `);
    document.documentElement.classList.add('lhead--compact');
    return el;
  }

  function renderIconHTML(item){
    var icon = item && item.icon;
    // SVG-иконка или <img> — вставлять прямо
    if (typeof icon === 'string' && (icon.startsWith('<svg') || icon.startsWith('<img') || icon.startsWith('<span') || icon.startsWith('<i'))) {
      return '<span class="lhead__ico" aria-hidden="true">'+icon+'</span>';
    }
    // emoji
    if (typeof icon === 'string' && icon.startsWith('emoji:')){
      var ch = icon.slice(6);
      return '<span class="lhead__ico" aria-hidden="true">'+ch+'</span>';
    }
    if (typeof icon === 'string' && icon.startsWith('url:')){
      var src = icon.slice(4);
      return '<span class="lhead__ico" aria-hidden="true"><img src="'+src+'" alt="" /></span>';
    }
    var key = (icon || item.key || '').toLowerCase();
    var svg = ICONS[key] || ICONS.movie;
    return '<span class="lhead__ico" aria-hidden="true">'+svg+'</span>';
  }

  function buildMenuFromConfig($head, cfg){
    try {
      var $wrap = $head.find('.lhead__actions');
      $wrap.empty();
      var items = (cfg||[]).filter(Boolean).filter(function(it){return it.enabled;}).slice(0, MAX_ITEMS);
      items.forEach(function(it){
        var html = `
          <div class="lhead__action selector" tabindex="0">
            ${renderIconHTML(it)}
            <span class="lhead__label"><span>${it.title || it.key || 'Item'}</span></span>
          </div>`;
        var $btn = $(html);
        $btn.data('cfg', it);
        $btn.on('click hover:enter', function(){ fireMenuAction($(this).data('cfg')); });
        $wrap.append($btn);
      });
    } catch(e){}
  }

  function fireMenuAction(item){
    var L = window.Lampa, Storage = L.Storage || {}, Activity = L.Activity || {}, Search = L.Search || {};
    function source(){ return Storage.get ? Storage.get('source','tmdb') : 'tmdb'; }
    if (!item) return;

    if (item.type === 'builtin'){
      switch (item.key) {
        case 'movie': Activity.push({ url:'movie', title:'Фильмы', component:'category', source:source() }); break;
        case 'tv': Activity.push({ url:'tv', title:'Сериалы', component:'category', source:source() }); break;
        case 'mult': Activity.push({ url:'movie', title:'Мульт', component:'category', genres:16, id:16, source:source(), card_type:true, page:1 }); break;
        case 'anime':
          var src = source();
          if (src === 'cub') Activity.push({ url:'anime', title:'Аниме', component:'category', source:'cub' });
          else Activity.push({
            url:'tv', title:'Аниме', component:'category', genres:16, id:16,
            with_original_language:'ja',
            with_keywords:'210024,210027,222361',
            without_genres:'10759,10762,10763,10764,10765,10766,10767,10768',
            with_type:'3', include_adult:false, source:src, card_type:true, page:1
          });
          break;
        case 'favorite': Activity.push({ url:'', title:'Избранное', component:'bookmarks', page:1 }); break;
        case 'mytorrents': Activity.push({ url:'', title:'Мои торренты', component:'mytorrents', page:1 }); break;
        case 'sisi': Activity.push({ url:'', title:(L.Lang&&L.Lang.translate)?L.Lang.translate('lampac_sisiname'):'18+', component:'sisi_lampac', page:1 }); break;
        case 'feed': Activity.push({ url:'', title:'Лента', component:'feed', page:1 }); break;
        case 'search': if (Search.open) Search.open(); break;
      }
    } else if (item.type === 'mirror' && item.title){
      var targets = document.querySelectorAll('.menu, .left-menu, .wrap__left, .navigation-bar, .menu__list, .menu__content, .menu__items');
      var found = null;
      targets.forEach(function(root){
        if (found) return;
        var candidates = root.querySelectorAll('.selector, [data-action], [data-name], .menu__item, .navigation-bar__item');
        candidates.forEach(function(el){
          if (found) return;
          var text = (el.innerText || el.textContent || '').trim();
          if (normalize(text) === normalize(item.title)) found = el;
        });
      });
      if (found) {
        try { if (window.$) $(found).trigger('hover:enter'); else found.dispatchEvent(new Event('click', {bubbles:true})); }
        catch(e){ try { found.dispatchEvent(new Event('click', {bubbles:true})); } catch(e2){} }
      }
    }
  }

  function bindRoutesStatic($head, Search){
    var L = window.Lampa, Storage = L.Storage || {}, Activity = L.Activity || {};
    function source(){ return Storage.get ? Storage.get('source','tmdb') : 'tmdb'; }
    $head.find('.open--main').on('click hover:enter', function () {
      Activity.push({ url:'', title:'Главная', component:'main', source:source(), page:1 });
    });
    $head.find('.open--search').on('click hover:enter', function () {
      if (Search.open) Search.open();
      setTimeout(updateSearchMode, 0);
    });
    $head.find('.open--settings').on('click hover:enter', function () {
      if (L.Controller && L.Controller.toggle) L.Controller.toggle('settings');
    });
  }

  function enforceSpacing($head){
    try {
      var items = $head.find('.lhead__actions .lhead__action').get();
      for (var i = 1; i < items.length; i++){
        items[i].style.setProperty('margin-left','1rem','important');
      }
    } catch(e){}
  }
  function addController($head){
    var Controller = window.Lampa.Controller || {};
    var Navigator = window.Lampa.Navigator || window.Navigator || {};
    var Activity = window.Lampa.Activity || {};
    try {
      Controller.add('head-nav', {
        toggle: function(){
          Controller.collectionSet($head, false, true);
          var items = $head.find('.selector');
          if (items.length) Controller.collectionFocus(items.get(0), $head, true);
        },
        right: function(){
          try{
            if (Navigator.canmove && !Navigator.canmove('right')) {
              var first = $head.find('.selector').get(0);
              Controller.collectionFocus(first, $head);
            } else if (Navigator.move) Navigator.move('right');
          }catch(e){}
        },
        left: function(){
          try{
            if (Navigator.canmove && !Navigator.canmove('left')) {
              var items = $head.find('.selector');
              var last = items.get(items.length - 1);
              Controller.collectionFocus(last, $head);
            } else if (Navigator.move) Navigator.move('left');
          }catch(e){}
        },
        down: function(){ Controller.toggle('content'); },
        back: function(){ if (Activity.backward) Activity.backward(); else history.back(); }
      });
    } catch(e){}
  }
  function hijackMenuToggle(Controller){
    try {
      if (Controller && Controller.toggle){
        var orig = Controller.toggle.bind(Controller);
        Controller.toggle = function(name){
          if (name === 'menu') return orig('head-nav');
          return orig(name);
        };
      }
    } catch(e){}
  }

  function isSearchActive(){
    return !!(
      document.querySelector('.search') ||
      document.querySelector('.search-box') ||
      document.querySelector('[data-name="search"]') ||
      document.querySelector('.search__input')
    );
  }
  function setNativeHeadMode(on){
    var root = document.documentElement;
    if (on) root.classList.add('lhead-native--on');
    else root.classList.remove('lhead-native--on');
  }
  function dedupeSearchBoxes(){
    try {
      var boxes = Array.from(document.querySelectorAll('.search, .search-box'));
      if (boxes.length > 1){
        for (var i = 0; i < boxes.length - 1; i++){
          boxes[i].style.setProperty('display','none','important');
        }
      }
    } catch(e){}
  }
  function updateSearchMode(){
    var on = isSearchActive();
    setNativeHeadMode(on);
    if (on) dedupeSearchBoxes();
  }
  function installSearchModeWatcher(){
    try {
      var moHeadSwap = new MutationObserver(updateSearchMode);
      moHeadSwap.observe(document.body, {childList:true,subtree:true});
      updateSearchMode();
    } catch(e){}
  }

  function openConfigUI($head){
    var cfg = readCfg();
    var modal = document.createElement('div');
    modal.className = 'lhead-modal';
    modal.innerHTML = `
      <div class="lhead-modal__box">
        <div class="lhead-modal__title">Верхнее меню — выберите до ${MAX_ITEMS} пунктов</div>
        <div class="lhead-modal__section">
          <div style="margin-bottom:6px;opacity:.8">Из бокового меню:</div>
          <div class="lhead-list" id="lhead-list-left"></div>
        </div>
        <div class="lhead-modal__section">
          <div style="margin-bottom:6px;opacity:.8">Встроенные:</div>
          <div class="lhead-list" id="lhead-list-builtin"></div>
        </div>
        <div class="lhead-modal__controls">
          <button data-act="save">Сохранить</button>
          <button data-act="cancel">Отмена</button>
          <button data-act="defaults">Сбросить</button>
          <span style="margin-left:auto;opacity:.8" id="lhead-count"></span>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    var leftAvail = scanLeftMenu();
    var builtin = [
      { key:'movie', title:'Фильмы', type:'builtin', icon:'movie' },
      { key:'tv', title:'Сериалы', type:'builtin', icon:'tv' },
      { key:'mult', title:'Мульт', type:'builtin', icon:'mult' },
      { key:'anime', title:'Аниме', type:'builtin', icon:'anime' },
      { key:'favorite', title:'Избранное', type:'builtin', icon:'favorite' },
      { key:'mytorrents', title:'Торренты', type:'builtin', icon:'mytorrents' },
      { key:'sisi', title:'18+', type:'builtin', icon:'sisi' },
      { key:'feed', title:'Лента', type:'builtin', icon:'feed' },
      { key:'search', title:'Поиск', type:'builtin', icon:'search' }
    ];

    var current = (cfg || []).filter(Boolean);
    var selectedSet = new Set(current.map(x => x.type==='builtin' ? 'b:'+x.key : 'm:'+normalize(x.title)));

    function renderTag(container, id, label, checked, iconHTML){
      var tag = document.createElement('label');
      tag.className = 'lhead-tag';
      tag.innerHTML = `<input type="checkbox" data-id="${id}" ${checked?'checked':''}/> <span>${iconHTML||''}</span> <span>${label}</span>`;
      container.appendChild(tag);
    }

    var wrapLeft = modal.querySelector('#lhead-list-left');
    leftAvail.forEach(function(it){
      var id = 'm:'+normalize(it.title);
      renderTag(wrapLeft, id, it.title, selectedSet.has(id), renderIconHTML(it));
    });

    var wrapBuiltin = modal.querySelector('#lhead-list-builtin');
    builtin.forEach(function(it){
      var id = 'b:'+it.key;
      renderTag(wrapBuiltin, id, it.title, selectedSet.has(id), renderIconHTML(it));
    });

    var counter = modal.querySelector('#lhead-count');
    function updateCount(){
      var checked = modal.querySelectorAll('input[type="checkbox"]:checked').length;
      counter.textContent = 'Выбрано: '+checked+' / '+MAX_ITEMS;
      counter.style.color = (checked > MAX_ITEMS) ? '#ff6868' : '#ccc';
    }
    modal.addEventListener('change', updateCount);
    updateCount();

    modal.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var act = btn.getAttribute('data-act');

      if (act === 'cancel') {
        modal.remove();
      } else if (act === 'defaults') {
        writeCfg(defaultMenu());
        buildMenuFromConfig($head, readCfg());
        enforceSpacing($head);
        modal.remove();
      } else if (act === 'save') {
        var ids = Array.from(modal.querySelectorAll('input[type="checkbox"]')).filter(i=>i.checked).map(i=>i.getAttribute('data-id'));
        if (ids.length > MAX_ITEMS) { alert('Лимит: '+MAX_ITEMS); return; }

        var newCfg = [];
        builtin.forEach(function(b){
          if (ids.includes('b:'+b.key)) newCfg.push({ key:b.key, title:b.title, type:'builtin', enabled:true, icon:b.icon });
        });
        leftAvail.forEach(function(m){
          if (ids.includes('m:'+normalize(m.title))) newCfg.push({ title:m.title, type:'mirror', enabled:true, icon:m.icon || 'emoji:📁' });
        });

        writeCfg(newCfg);
        buildMenuFromConfig($head, newCfg);
        enforceSpacing($head);
        modal.remove();
      }
    });
  }

  function scanLeftMenu(){
    var results = [];
    try {
      var roots = document.querySelectorAll('.menu, .left-menu, .wrap__left, .navigation-bar, .menu__list, .menu__content, .menu__items');
      var seen = new Set();
      roots.forEach(function(root){
        var candidates = root.querySelectorAll('.selector, [data-action], [data-name], .menu__item, .navigation-bar__item');
        candidates.forEach(function(el){
          var t = (el.innerText || el.textContent || '').trim();
          var label = normalize(t);
          if (!label || label.length < 2) return;
          if (seen.has(label)) return;
          seen.add(label);

          // ищем SVG или img для иконки
          var svg = el.querySelector('svg');
          var iconHTML = '';
          if (svg) iconHTML = svg.outerHTML;
          var img = !svg && el.querySelector('img[src]');
          if (!svg && img) iconHTML = '<img src="'+img.src+'" style="width:1.6em;height:1.6em;">';
          var iSpan = (!svg && !img) && el.querySelector('span[class*="icon"], i[class*="icon"]');
          if (!svg && !img && iSpan) iconHTML = iSpan.outerHTML;
          if (!iconHTML) iconHTML = 'emoji:📁';

          results.push({ title: t, icon: iconHTML });
        });
      });
    } catch(e){}
    return results;
  }

  function normalize(s){ return (s || '').replace(/\s+/g,' ').trim().toLowerCase(); }

})();
