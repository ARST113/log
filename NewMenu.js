Lampa.Platform.tv();

(function(){
"use strict";

/* ==== Константы ==== */
const CFG_KEY = "lhead_menu_cfg";
const PLUGIN_ENABLED_KEY = "lhead_enabled";
const ICON_SIZE_KEY = "lhead_icon_size";

/* ==== Утилиты ==== */
function norm(s){return (s||"").replace(/\s+/g," ").trim().toLowerCase();}
function isEnabled(){return localStorage.getItem(PLUGIN_ENABLED_KEY)==="true";}
function getIconSize(){return parseFloat(localStorage.getItem(ICON_SIZE_KEY)||"1.0");}
function writeCfg(cfg){try{localStorage.setItem(CFG_KEY,JSON.stringify(cfg));}catch(e){}}
function readCfg(){
  try{
    const raw=localStorage.getItem(CFG_KEY);
    if(!raw) return defMenu();
    const p=JSON.parse(raw);
    return Array.isArray(p)&&p.length?p:defMenu();
  }catch(e){return defMenu();}
}

/* ==== Сканируем левое меню ==== */
function scanLeftMenu(){
  const out=[], seen={};
  try{
    const root=document.querySelector('.menu,.left-menu,.navigation-bar');
    if(!root) return [];
    root.querySelectorAll('.menu__item,.selector,[data-action]').forEach(el=>{
      const title=(el.innerText||el.textContent||"").trim();
      const key=norm(title);
      if(!title||seen[key]) return;
      seen[key]=1;
      let iconHTML="";
      const svg=el.querySelector("svg");
      if(svg) iconHTML=svg.outerHTML;
      else {
        const img=el.querySelector("img[src]");
        if(img) iconHTML=`<img src="${img.src}" width="24" height="24">`;
      }
      if(!iconHTML) iconHTML="emoji:📁";
      out.push({title,icon:iconHTML});
    });
  }catch(e){}
  return out;
}

/* ==== Меню по умолчанию ==== */
function defMenu(){
  const src=scanLeftMenu();
  const need=["Фильмы","Сериалы","Аниме","Избранное","История","Настройки"];
  const out=[];
  need.forEach(n=>{
    const f=src.find(it=>norm(it.title)===norm(n));
    if(f) out.push({...f,enabled:true});
  });
  return out.length?out:[
    {title:"Фильмы",icon:"emoji:🎬",enabled:true},
    {title:"Сериалы",icon:"emoji:📺",enabled:true},
    {title:"Аниме",icon:"emoji:🈲",enabled:true},
    {title:"Избранное",icon:"emoji:⭐",enabled:true},
    {title:"История",icon:"emoji:🕓",enabled:true},
    {title:"Настройки",icon:"emoji:⚙️",enabled:true}
  ];
}

/* ==== Ожидание Lampa ==== */
const wait=setInterval(()=>{
  if(window.Lampa&&Lampa.SettingsApi&&window.$){clearInterval(wait);boot();}
},200);

function boot(){
  const L=Lampa;
  L.SettingsApi.addComponent({
    component:"new_menu_plugin",
    name:"Новое меню",
    icon:'<svg width="24" height="24" viewBox="0 0 32 32"><path d="M4 8h24M4 16h24M4 24h24" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>'
  });
  L.SettingsApi.addParam({
    component:"new_menu_plugin",
    param:{name:"open_menu_config",type:"button"},
    field:{name:"Настроить верхнее меню",description:"Открыть настройки верхнего меню"},
    onChange:openConfigUI
  });
  L.SettingsApi.addParam({
    component:"new_menu_plugin",
    param:{name:"plugin_enabled",type:"trigger",default:false},
    field:{name:"Включить верхнее меню",description:"Показать новое верхнее меню"},
    onChange:v=>{localStorage.setItem(PLUGIN_ENABLED_KEY,v?"true":"");v?initPlugin():cleanupPlugin();}
  });
  L.SettingsApi.addParam({
    component:"new_menu_plugin",
    param:{name:"icon_size",type:"select",values:{"0.8":"Маленькие","1.0":"Стандарт","1.2":"Крупные"},default:"1.0"},
    field:{name:"Размер иконок"},onChange:v=>{localStorage.setItem(ICON_SIZE_KEY,v);applyIconSize(parseFloat(v));}
  });
  if(isEnabled()){
    const wm=setInterval(()=>{if(document.querySelector(".menu__item")){clearInterval(wm);initPlugin();}},300);
  }
}

/* ==== Инициализация ==== */
function initPlugin(){
  cleanupPlugin();
  injectStyles();
  const $=window.$||window.jQuery;
  const $head=$(renderHead());
  document.body.appendChild($head.get(0));

  const orig=document.querySelector(".head");
  if(orig) orig.classList.add("lhead-hidden");

  buildMenu($head,readCfg());
  mirrorProfile($head);
  bindRoutes($head);
  applyIconSize(getIconSize());
  fixSearch();
  installSearchModeWatcher();
}

/* ==== Очистка ==== */
function cleanupPlugin(){
  document.querySelectorAll(".lhead").forEach(n=>n.remove());
  document.querySelectorAll(".lhead-style").forEach(n=>n.remove());
  const orig=document.querySelector(".head");
  if(orig) orig.classList.remove("lhead-hidden");
}

/* ==== Разметка ==== */
function renderHead(){
  return `
  <div class="lhead">
    <div class="lhead__body">
      <div class="lhead__logo selector" tabindex="0"><img src="./img/logo-icon.svg" width="32" height="32"></div>
      <div class="lhead__actions"></div>
      <div class="lhead__right">
        <div class="lhead__right-item selector open--search" tabindex="0" title="Поиск">
          <svg width="28" height="28" viewBox="2 2 20 20" fill="none"><path d="M11 6C13.7614 6 16 8.2386 16 11M16.6588 16.6549L21 21M19 11C19 15.4183 15.4183 19 11 19C6.5817 19 3 15.4183 3 11C3 6.5817 6.5817 3 11 3C15.4183 3 19 6.5817 19 11Z" stroke="#fff" stroke-width="2"/></svg>
        </div>
        <div class="lhead__profile selector" tabindex="0"><div class="lhead__profile-inner"></div></div>
      </div>
    </div>
  </div>`;
}

/* ==== Профиль ==== */
function mirrorProfile($head){
  const proxy=$head.find(".lhead__profile").get(0);
  const inner=proxy.querySelector(".lhead__profile-inner");
  const orig=document.querySelector(".head .open--profile");
  function sync(){
    if(!orig||!inner) return;
    const img=orig.querySelector("img");
    inner.innerHTML="";
    if(img){
      const copy=img.cloneNode(true);
      copy.removeAttribute("onerror");
      copy.style.borderRadius="50%";
      inner.appendChild(copy);
    }
  }
  function open(){if(orig) orig.click();}
  proxy.onclick=open; try{$(proxy).on("hover:enter",open);}catch(e){}
  sync(); const mo=new MutationObserver(()=>setTimeout(sync,150));
  if(orig) mo.observe(orig,{childList:true,subtree:true,attributes:true});
}

/* ==== Меню ==== */
function buildMenu($head,cfg){
  const $=window.$||window.jQuery;
  const wrap=$head.find(".lhead__actions");wrap.empty();
  (cfg||[]).forEach(it=>{
    if(it.enabled===false) return;
    const html=`<div class="lhead__action selector" tabindex="0" data-title="${it.title}">
      ${renderIcon(it)}<span class="lhead__label">${it.title}</span></div>`;
    const $b=$(html);$b.data("cfg",it);
    $b.on("click hover:enter",()=>fireMenu(it));wrap.append($b);
  });
}
function renderIcon(it){
  const i=it.icon||"";
  if(i.startsWith("<svg")||i.startsWith("<img")) return `<span class="lhead__ico">${i}</span>`;
  if(i.startsWith("emoji:")) return `<span class="lhead__ico">${i.slice(6)}</span>`;
  return `<span class="lhead__ico">📁</span>`;
}
function fireMenu(it){
  const btn=[...document.querySelectorAll(".menu__item,.selector")].find(x=>norm(x.textContent)===norm(it.title));
  if(btn&&btn.click) btn.click();
}

/* ==== Главная и Поиск ==== */
function bindRoutes($head){
  const $=window.$||window.jQuery;
  $head.find(".lhead__logo").on("click hover:enter",()=>{
    const g=[...document.querySelectorAll(".menu__item,.selector")].find(x=>norm(x.textContent)==="главная");
    if(g&&g.click) g.click();
  });
}
function fixSearch(){
  const waitSearch = setInterval(()=>{
    const btn = document.querySelector('.lhead__right-item.open--search');
    if(!btn) return;
    clearInterval(waitSearch);
    btn.onclick = ()=>{
      try {
        if(window.Lampa && Lampa.Search && typeof Lampa.Search.open==='function'){
          Lampa.Search.open(); return;
        }
      }catch(e){}
      const s=[...document.querySelectorAll('.menu__item,.selector')]
        .find(x=>/(поиск)/i.test(x.textContent));
      if(s&&s.click) s.click();
    };
  },500);
}

/* ==== Размер иконок ==== */
function applyIconSize(scale){
  document.querySelectorAll(".lhead .lhead__ico svg,.lhead .lhead__ico img").forEach(el=>{
    el.style.width=(2.3*scale)+"em";
    el.style.height=(2.3*scale)+"em";
  });
  document.querySelectorAll(".lhead .lhead__label").forEach(el=>{
    el.style.fontSize=(1.05*scale)+"em";
  });
}

/* ==== Скрытие при поиске ==== */
function installSearchModeWatcher(){
  const observer = new MutationObserver(()=>{
    const active = document.body.classList.contains('search--active') ||
                   document.querySelector('.search') ||
                   document.querySelector('.search-box');
    const root = document.documentElement;
    if(active) root.classList.add('lhead-native--on');
    else root.classList.remove('lhead-native--on');
  });
  observer.observe(document.body,{childList:true,subtree:true});
}

/* ==== Конфигуратор ==== */
function openConfigUI(){
  const cfg=readCfg();
  const all=scanLeftMenu();
  const modal=document.createElement("div");
  modal.className="lhead-modal";
  modal.innerHTML=`
    <div class="lhead-modal__box">
      <div class="lhead-modal__title">Настройка верхнего меню</div>
      <div class="lhead-list"></div>
      <div class="lhead-modal__controls">
        <button data-act="save">Сохранить</button>
        <button data-act="cancel">Отмена</button>
        <button data-act="defaults">Сбросить</button>
      </div></div>`;
  document.body.appendChild(modal);
  const list=modal.querySelector(".lhead-list");
  const active=new Set(cfg.map(x=>norm(x.title)));
  all.forEach(it=>{
    const checked=active.has(norm(it.title));
    const tag=document.createElement("label");
    tag.className="lhead-tag"+(checked?" selected":"");
    tag.innerHTML=`<input type="checkbox" ${checked?"checked":""}/> ${renderIcon(it)} ${it.title}`;
    tag.querySelector("input").addEventListener("change",e=>{
      e.target.checked?tag.classList.add("selected"):tag.classList.remove("selected");
    });
    list.appendChild(tag);
  });
  modal.addEventListener("click",e=>{
    const b=e.target.closest("button");if(!b)return;
    const act=b.dataset.act;
    if(act==="cancel") return modal.remove();
    if(act==="defaults"){writeCfg(defMenu());initPlugin();return modal.remove();}
    if(act==="save"){
      const newCfg=[];
      list.querySelectorAll("label").forEach(l=>{
        if(l.querySelector("input").checked){
          const t=l.textContent.trim();
          const found=all.find(x=>x.title===t);
          if(found) newCfg.push({...found,enabled:true});
        }
      });
      writeCfg(newCfg);initPlugin();modal.remove();
    }
  });
}

/* ==== Стили ==== */
function injectStyles(){
  if(document.getElementById("lhead-style")) return;
  const css=`
.head.lhead-hidden{opacity:0!important;pointer-events:none!important;}
.lhead{position:fixed;top:0;left:0;width:100%;z-index:15;}
.lhead__body{display:flex;align-items:center;padding:.6em 1.4em;}
.lhead__logo{cursor:pointer;margin-right:2em;}
.lhead__actions{display:flex;gap:1.2em;flex:1;}
.lhead__action{display:flex;align-items:center;cursor:pointer;border-radius:12px;padding:0 .5em;height:2.4em;transition:background .2s;}
.lhead__ico{display:flex;align-items:center;justify-content:center;}
.lhead__ico svg,.lhead__ico img{width:2.3em;height:2.3em;transition:fill .2s;}
.lhead__label{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;margin-left:0;color:#fff;transition:max-width .25s,opacity .25s,margin-left .25s;}
.lhead__action:hover .lhead__label,
.lhead__action.focus .lhead__label,
.lhead__action.hover .lhead__label{max-width:8em;opacity:1;margin-left:.8em;color:#000;}
.lhead__action:hover,.lhead__action.focus{background:#fff;color:#000;}
/* перекраска контуров без заливки */
.lhead__action:hover .lhead__ico svg path,
.lhead__action.focus .lhead__ico svg path,
.lhead__action:hover .lhead__ico svg circle,
.lhead__action.focus .lhead__ico svg circle,
.lhead__action:hover .lhead__ico svg rect,
.lhead__action.focus .lhead__ico svg rect{stroke:#000!important;}
.lhead__right{display:flex;align-items:center;gap:1em;}
.lhead__profile img{width:2em;height:2em;border-radius:50%;object-fit:cover;}
.lhead-modal{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;}
.lhead-modal__box{background:#23232a;padding:24px;border-radius:12px;color:#fff;width:90%;max-width:600px;}
.lhead-modal__title{font-size:1.3em;margin-bottom:12px;}
.lhead-list{display:flex;flex-wrap:wrap;gap:10px;}
.lhead-tag{padding:6px 12px;border:1px solid #444;border-radius:10px;cursor:pointer;display:flex;align-items:center;gap:8px;}
.lhead-tag.selected{background:#fff;color:#000;}
.lhead-modal__controls{margin-top:15px;display:flex;gap:10px;}
.lhead-modal__controls button{padding:6px 14px;border:none;border-radius:8px;background:#444;color:#fff;cursor:pointer;}
.lhead-modal__controls button:hover{background:#666;}
/* скрываем шапку при поиске */
.lhead-native--on .lhead{display:none!important;}
.lhead-native--on .head{visibility:visible!important;opacity:1!important;pointer-events:auto!important;}
/* ==== адаптация под вертикальную ориентацию ==== */
@media (orientation: portrait) {
  .lhead__logo {display:none!important;}
  .lhead__label {max-width:0!important;opacity:0!important;margin-left:0!important;}
  .lhead__body {padding:0.4em 1em!important;}
  .lhead__ico svg,.lhead__ico img {width:1.8em!important;height:1.8em!important;}
}
`;
  const st=document.createElement("style");
  st.id="lhead-style";st.className="lhead-style";st.textContent=css;
  document.head.appendChild(st);
}

})();
