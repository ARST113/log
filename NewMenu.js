(function(){
  "use strict";
  var CFG_KEY = "lhead_menu_cfg";
  var PLUGIN_NAME = "Новое меню";
  var PLUGIN_ENABLED_KEY = 'lhead_enabled';

  // --- дефолтное верхнее меню ---
  function defaultMenu(){
    return [
      {title:"Фильмы", type:"mirror", enabled:true, icon:"emoji:🎬"},
      {title:"Сериалы", type:"mirror", enabled:true, icon:"emoji:📺"},
      {title:"Аниме", type:"mirror", enabled:true, icon:"emoji:🈲"},
      {title:"Избранное", type:"mirror", enabled:true, icon:"emoji:⭐"},
      {title:"История", type:"mirror", enabled:true, icon:"emoji:🕓"},
      {title:"Настройки", type:"mirror", enabled:true, icon:"emoji:⚙️"}
    ];
  }
  function readCfg(){
    try{var raw=localStorage.getItem(CFG_KEY);if(!raw)return defaultMenu();var p=JSON.parse(raw);return Array.isArray(p)?p:defaultMenu();}catch(e){return defaultMenu();}
  }
  function writeCfg(cfg){try{localStorage.setItem(CFG_KEY,JSON.stringify(cfg));}catch(e){}}
  function isEnabled(){ return localStorage.getItem(PLUGIN_ENABLED_KEY)==='true' }

  var wait = setInterval(function(){
    if(window.Lampa && Lampa.SettingsApi && window.$){clearInterval(wait);boot();}
  },200);

  function boot(){
    var $=window.$||window.jQuery;
    var L=window.Lampa;

    // НАСТРОЙКИ: доступ всегда!
    L.SettingsApi.addComponent({
      component: 'new_menu_plugin',
      name: PLUGIN_NAME,
      icon: '<svg width="24" height="24" viewBox="0 0 32 32" fill="none"><path d="M4 8h24M4 16h24M4 24h24" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'
    });

    L.SettingsApi.addParam({
      component: 'new_menu_plugin',
      param: { name: 'open_menu_config', type: 'button', component: 'menu_config' },
      field: {
        name: 'Настроить верхнее меню',
        description: 'Открыть настройки верхнего меню'
      },
      onChange: function() { openConfigUI(); }
    });

    L.SettingsApi.addParam({
      component: 'new_menu_plugin',
      param: {
        name: 'plugin_enabled',
        type: 'trigger',
        default: false
      },
      field: {
        name: 'Включить верхнее меню',
        description: 'Будет отображаться новое верхнее меню'
      },
      onChange: function(value){
        localStorage.setItem(PLUGIN_ENABLED_KEY, value?'true':''); value ? initPlugin() : cleanupPlugin();
        Lampa.Settings.update();
      }
    });

    L.SettingsApi.addParam({
      component: 'new_menu_plugin',
      param: { type: 'button', component: 'about_plugin' },
      field: {
        name: 'О плагине',
        description: 'Информация о плагине Новое меню'
      },
      onChange: function() { showAboutPlugin(); }
    });

    if(isEnabled()) setTimeout(initPlugin, 1);
  }

  function initPlugin() {
    var $ = window.$ || window.jQuery;
    cleanupPlugin();
    hideNativeHeadChildren();
    keepChildrenHidden();
    injectStyles();
    var $head = renderHead();
    document.body.appendChild($head.get(0));
    buildMenuFromConfig($head, readCfg());
    enforceSpacing($head);
    var moFix = new MutationObserver(function(){ enforceSpacing($head); });
    moFix.observe(document.body, {childList:true, subtree:true});
    bindRoutesStatic($head);
    addController($head);
    hijackMenuToggle(window.Lampa.Controller);
    installSearchModeWatcher();
  }

  function cleanupPlugin(){
    try{
      document.querySelectorAll('.lhead').forEach(function(n){n.remove();});
      ['lhead-style','kill-head-children'].forEach(function(id){
        var x=document.getElementById(id); if(x) x.remove();
      });
    }catch(e){}
  }

  function showAboutPlugin() {
    var modal = document.createElement('div');
    modal.className = 'lhead-modal';
    modal.innerHTML = `
      <div class="lhead-modal__box">
        <div class="lhead-modal__title">Плагин "Новое меню"</div>
        <div class="lhead-modal__section">
          <div style="color: #fff; margin-bottom: 15px;">
            <strong>Расширенное настраиваемое верхнее меню для Lampa.</strong><br>
            <strong>По умолчанию в меню:</strong><br>
            Фильмы, Сериалы, Аниме, Избранное, История, Настройки<br>
            <strong>Версия:</strong> 1.0.0
          </div>
        </div>
        <div class="lhead-modal__controls">
          <button data-act="close">Закрыть</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
      if (e.target.getAttribute('data-act') === 'close' || e.target === modal) modal.remove();
    });
  }

  function hideNativeHeadChildren(){
    try{
      var st=document.createElement("style");
      st.id='kill-head-children';
      st.textContent='.head__logo,.head__actions,.head__action-rights,.head__menu-icon{display:none!important;visibility:hidden!important;}';
      document.head.appendChild(st);
    }catch(e){}
  }
  function keepChildrenHidden(){
    try{
      var observer=new MutationObserver(function(){
        var nodes=document.querySelectorAll('.head__logo,.head__actions,.head__action-rights,.head__menu-icon');
        nodes.forEach(function(n){n.style.setProperty('display','none','important');});
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }catch(e){}
  }
  function injectStyles(){if(document.getElementById('lhead-style')) return;
    var css=`
.lhead{position:fixed;top:0;left:0;width:100%;z-index:15}
.lhead__body{padding:0.95em 2.22em;display:flex;align-items:center}
.lhead__logo{width:3.3em;flex-shrink:0;margin-left:1.3em;margin-right:2.6em;position:relative;transition:transform .33s}
.lhead__logo.focus,.lhead__logo.hover{transform:scale(1.17)}
.lhead__actions{display:flex!important;flex-wrap:nowrap}
.lhead__actions .lhead__action{display:inline-flex!important;align-items:center;padding:0 .79em;color:#fff;background:transparent;transition:transform .19s; font-size:1.51em;}
.lhead__ico{display:inline-flex;width:2.6em;height:2.6em;align-items:center;justify-content:center;flex-shrink:0;transition:box-shadow .22s,filter .13s;}
.lhead__ico svg,.lhead__ico img{width:2.35em;height:2.35em;display:block;filter:grayscale(.05)brightness(.87)contrast(.96);}
.lhead__actions .lhead__action .lhead__ico { color:#fff; fill:#fff; filter: grayscale(.03) brightness(.95) opacity(.93);}
.lhead__actions .lhead__action:hover .lhead__ico,
.lhead__actions .lhead__action.focus .lhead__ico,
.lhead__actions .lhead__action.hover .lhead__ico { box-shadow: 0 0 0 3.45px #fff,0 0 12px 3px #fff3; background:rgba(255,255,255,.12); filter:brightness(1.19) grayscale(0) drop-shadow(0 0 2px #fff);}
.lhead__actions .lhead__action.selected .lhead__ico,
.lhead__actions .lhead__action .lhead__ico.selected,
.lhead__actions .lhead__action[aria-checked="true"] .lhead__ico {
  box-shadow:0 0 0 6.9px #fff,0 0 9px 5px #fff4,0 0 2px #fff;
  background:rgba(255,255,255,.18);
  filter:brightness(1.47) grayscale(0);}
.lhead__label{display:inline-block;max-width:0;opacity:0;white-space:nowrap;overflow:hidden;margin-left:0;transition:max-width .29s,opacity .219s,margin-left .185s;font-size:1.01em}
.lhead--compact .lhead__action:hover .lhead__label,.lhead--compact .lhead__action.focus .lhead__label,.lhead--compact .lhead__action.hover .lhead__label{max-width:17em;opacity:1;margin-left:.88em}
@media (hover:none),(max-width:900px),(max-width:850px){.lhead--compact .lhead__label{max-width:0!important;opacity:0;margin-left:0!important;}}
.lhead__actions .lhead__action + .lhead__action{margin-left:1.7rem!important}
@supports (gap:1rem){.lhead__actions{gap:1.85rem}
.lhead__actions .lhead__action + .lhead__action{margin-left:0!important}}
.lhead__right{position:fixed;right:2.5em;display:flex;gap:1.38em}
.lhead__right-item>svg{width:2.18em;height:2.18em;flex-shrink:0}
.lhead__right-item.btn-cfg::after{content:"⚙";color:#fff;font-size:1.67em;line-height:1;display:inline-block;padding:0 .15em}
.lhead-modal{position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center}
.lhead-modal__box{width:min(1130px,99vw);max-height:94vh;overflow:auto;background:#23232a;border-radius:13px;padding:30px 26px 24px;color:#fff}
.lhead-modal__title{font-size:25px;margin-bottom:22px;font-weight:700;}
.lhead-modal__section{margin:15px 0}
.lhead-list{display:flex;flex-wrap:wrap;gap:16px}
.lhead-tag{display:inline-flex;align-items:center;gap:12px;background:#272737;border:1.4px solid #373745;border-radius:999px;padding:10px 16px 10px 13px; font-size:1.26em;}
.lhead-tag input{margin:0;}
.lhead-tag input[type="checkbox"]:checked+span>span.lhead__ico,.lhead-tag input[type="checkbox"]:checked~span.lhead__ico{box-shadow:0 0 0 6.1px #fff,0 0 9px 5px #fff4,0 0 2px #fff;background:rgba(255,255,255,.14)!important;filter:brightness(1.47);}
.lhead-tag:hover span.lhead__ico,.lhead-tag:focus-within span.lhead__ico{box-shadow:0 0 0 3.0px #fff;filter:brightness(1.22)!important;}
.lhead-modal__controls{display:flex;gap:20px;margin-top:21px;flex-wrap:wrap;}
.lhead-modal__controls button{padding:10px 16px;border-radius:12px;background:#222;border:1.5px solid #363646;color:#fff;cursor:pointer;font-size:1.13em;}
.lhead-modal__controls span{font-size:1em;}
.lhead-modal__controls #lhead-count{min-width:8em;display:inline-block;}
.head{visibility:hidden!important;opacity:0!important;pointer-events:none!important}
.lhead-native--on .head{visibility:visible!important;opacity:1!important;pointer-events:auto!important}
.lhead-native--on .lhead{display:none!important}
body.true--mobile.orientation--portrait .lhead__body{justify-content:space-between;padding:1em 1em}
body.true--mobile.orientation--portrait .lhead__actions,.lhead--compact .lhead__actions,.lhead--compact .lhead__right{display:flex;align-items:center;gap:1em;flex-shrink:0}
body.true--mobile.orientation--portrait .lhead__actions .lhead__label{max-width:0!important;opacity:0!important;margin-left:0!important;}
    `;
    var st=document.createElement("style");st.id='lhead-style';st.textContent=css;document.head.appendChild(st);
  }

  // Оставшиеся функции — полностью такие же, как из твоей последней верной версии openConfigUI/renderHead/buildMenuFromConfig/etc.
  // ----- Не забывай подгружать jQuery для корректной работы верхней панели! -----
  function openConfigUI(){
    injectStyles();
    document.querySelectorAll('.lhead-modal').forEach(n=>n.remove());
    var cfg=readCfg();
    var $head = window.$('.lhead');
    if(!$head.length) {
      $head = renderHead();
      document.body.appendChild($head.get(0));
    }
    buildMenuFromConfig($head, cfg);
    enforceSpacing($head);
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
      </div>
    `;
    document.body.appendChild(modal);
    var leftAvail=scanLeftMenu();
    var current=(cfg||[]).filter(Boolean);
    var selectedSet=new Set(current.map(x=>"m:"+normalize(x.title)));
    function renderTag(container,id,label,checked,iconHTML){
      var tag=document.createElement('label');
      tag.className='lhead-tag';
      tag.innerHTML=`<input type="checkbox" data-id="${id}" ${checked?'checked':''}/><span>${iconHTML||''}</span><span>${label}</span>`;
      container.appendChild(tag);
    }
    var wrapLeft=modal.querySelector('#lhead-list-left');
    leftAvail.forEach(function(it){
      var id='m:'+normalize(it.title);
      renderTag(wrapLeft,id,it.title,selectedSet.has(id),renderIconHTML(it));
    });
    var counter=modal.querySelector('#lhead-count');
    function updateCount(){ var checked=modal.querySelectorAll('input[type="checkbox"]:checked').length; counter.textContent='Выбрано: '+checked; counter.style.color='#ccc'; }
    modal.addEventListener('change',updateCount); updateCount();
    modal.addEventListener('click',function(e){
      var btn=e.target.closest('button');
      if(!btn)return;
      var act=btn.getAttribute('data-act');
      if(act==="cancel"){modal.remove();}
      else if(act==="defaults"){writeCfg(defaultMenu());buildMenuFromConfig($head,readCfg());enforceSpacing($head);modal.remove();}
      else if(act==="save"){
        var ids=Array.from(modal.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.getAttribute('data-id'));
        var newCfg=[];
        leftAvail.forEach(function(m){if(ids.includes('m:'+normalize(m.title)))newCfg.push({title:m.title,type:'mirror',enabled:true,icon:m.icon||'emoji:📁'});});
        writeCfg(newCfg);buildMenuFromConfig($head,newCfg);enforceSpacing($head);modal.remove();
      }
    });
  }
  function renderHead(){ var $=window.$||window.jQuery; var el = $(`<div class="lhead" data-plugin="head-nav">
  <div class="lhead__body">
    <div class="lhead__logo selector open--main" tabindex="0"><img src="./img/logo-icon.svg" /></div>
    <div class="lhead__actions"></div>
    <div class="lhead__right">
      <div class="lhead__right-item selector btn-cfg open--headcfg" tabindex="0" title="Меню"></div>
      <div class="lhead__right-item selector open--search" tabindex="0" title="Поиск">
        <svg width="32" height="32" viewBox="2 2 20 20" fill="none"><path d="M11 6C13.7614 6 16 8.23858 16 11M16.6588 16.6549L21 21M19 11C19 15.4183 15.4183 19 11 19C6.58172 19 3 15.4183 3 11C3 6.58172 6.58172 3 11 3C15.4183 3 19 6.58172 19 11Z" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="lhead__right-item selector open--settings" tabindex="0" title="Настройки">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="10" stroke="#fff" stroke-width="3"/><rect x="15" y="11" width="2" height="7" rx="1" fill="#fff"/><rect x="15" y="21" width="2" height="2" rx="1" fill="#fff"/></svg>
      </div>
    </div>
  </div>
</div>`); document.documentElement.classList.add('lhead--compact');return el;}
  function buildMenuFromConfig($head,cfg){
    var $wrap=$head.find('.lhead__actions');
    $wrap.empty();
    var items=(cfg||[]).filter(Boolean).filter(function(it){return it.enabled!==false;});
    items.forEach(function(it){
      var html = `<div class="lhead__action selector" tabindex="0">${renderIconHTML(it)}<span class="lhead__label"><span>${it.title||it.key||'Item'}</span></span></div>`;
      var $btn=$(html);$btn.data('cfg',it);$btn.on('click hover:enter',function(){fireMenuAction($(this).data('cfg'));});$wrap.append($btn);
    });
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
    if(!item)return;
    var targets=document.querySelectorAll('.menu,.left-menu,.wrap__left,.navigation-bar,.menu__list,.menu__content,.menu__items');
    var found=null;
    targets.forEach(function(root){if(found)return;var cand=root.querySelectorAll('.selector,[data-action],[data-name],.menu__item,.navigation-bar__item');
        cand.forEach(function(el){if(found)return;var t=(el.innerText||el.textContent||"").trim();if(normalize(t)===normalize(item.title))found=el;});});
    if(found){try{if(window.$)$(found).trigger('hover:enter');else found.dispatchEvent(new Event('click',{bubbles:true}));
    }catch(e){try{found.dispatchEvent(new Event('click',{bubbles:true}));}catch(e2){}}}
  }
  function enforceSpacing($head){var items=$head.find('.lhead__actions .lhead__action').get();
    for(var i=1;i<items.length;i++)items[i].style.setProperty('margin-left','1.7rem','important');}
  function scanLeftMenu(){
    var results=[];
    try{
      var roots=document.querySelectorAll('.menu,.left-menu,.wrap__left,.navigation-bar,.menu__list,.menu__content,.menu__items');
      var seen=new Set();
      roots.forEach(function(root){
        var candidates=root.querySelectorAll('.selector,[data-action],[data-name],.menu__item,.navigation-bar__item');
        candidates.forEach(function(el){
          var t=(el.innerText||el.textContent||'').trim();
          var label=normalize(t);
          if(!label||label.length<2)return;
          if(seen.has(label))return;
          seen.add(label);
          var svg=el.querySelector('svg');
          var iconHTML='';
          if(svg)iconHTML=svg.outerHTML;
          var img=!svg&&el.querySelector('img[src]');
          if(!svg&&img)iconHTML='<img src="'+img.src+'" style="width:2.3em;height:2.3em;">';
          var iSpan=!svg&&!img&&el.querySelector('span[class*="icon"],i[class*="icon"]');
          if(!svg&&!img&&iSpan)iconHTML=iSpan.outerHTML;
          if(!iconHTML)iconHTML='emoji:📁';
          results.push({title:t,icon:iconHTML});
        });
      });
    }catch(e){}
    return results;
  }
  function normalize(s){ return (s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
})();
