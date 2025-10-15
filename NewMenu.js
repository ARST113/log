(function(){
  "use strict";
  function scanLeftMenu(){
    const res = [], seen = {};
    const root = document.querySelector('.menu,.left-menu,.navigation-bar');
    if (!root) return [];
    root.querySelectorAll('.menu__item,.selector,[data-action]').forEach(el => {
      const t = (el.innerText || el.textContent || "").trim();
      const k = t.toLowerCase();
      if (!t || seen[k]) return;
      seen[k] = 1;
      let icon = "";
      const svg = el.querySelector("svg");
      if(svg) icon = svg.outerHTML;
      else {
        const img = el.querySelector("img[src]");
        if(img) icon = `<img src="${img.src}" width="22" height="22">`;
      }
      if(!icon) icon = "emoji:📁";
      res.push({title: t, icon});
    });
    return res;
  }

  function getEnabledMenuItems() {
    let enabled = JSON.parse(localStorage.getItem("plugin_menu_cfg")||"[]");
    const all = scanLeftMenu();
    if (!enabled.length) {
      const def = ["фильмы","аниме","избранное","история","сериалы","настройки"];
      enabled = all.filter(x => def.includes(x.title.toLowerCase())).map(x => x.title);
      localStorage.setItem("plugin_menu_cfg", JSON.stringify(enabled));
    }
    return all.filter(x=>enabled.includes(x.title));
  }

  function buildMenuButtons(iconSize){
    const actions = document.querySelector('.head__actions');
    if (!actions) return setTimeout(()=>buildMenuButtons(iconSize), 150);
    actions.querySelectorAll('.plugin-menu-btn').forEach(e=>e.remove());
    getEnabledMenuItems().forEach(item => {
      const btn = document.createElement('div');
      btn.className = 'head__action selector plugin-menu-btn';
      btn.setAttribute('tabindex','0');
      btn.innerHTML = `
        <span class="menu-ico">${item.icon}</span>
        <span class="menu-label">${item.title}</span>`;
      btn.querySelector('.menu-label').style.opacity = '0';

      function setFocus(state){
        if(state){
          btn.classList.add('focus');
        } else {
          btn.classList.remove('focus');
        }
      }
      btn.addEventListener('mouseenter',()=>setFocus(true));
      btn.addEventListener('mouseleave',()=>setFocus(false));
      btn.addEventListener('focus',()=>setFocus(true));
      btn.addEventListener('blur',()=>setFocus(false));

      // -- Универсальный переход --
      btn.onclick = function(e){
        e.preventDefault();
        const items = Array.from(document.querySelectorAll('.menu__item,.selector'));
        // ищем точное совпадение и fallback по includes
        let found = items.find(b=>{
          const txt=(b.innerText||b.textContent||"").trim().toLowerCase();
          return txt === item.title.toLowerCase();
        }) || items.find(b=>{
          const txt=(b.innerText||b.textContent||"").trim().toLowerCase();
          return txt.includes(item.title.toLowerCase());
        });
        if(found){
          found.focus();
          if(window.$) window.$(found).trigger('hover:enter');
          found.dispatchEvent(new Event('hover:enter'));
          if (typeof found.click === "function") found.click();
        }
      };
      btn.addEventListener('keydown', function(e){
        if (e.key === 'Enter') {
          e.preventDefault();
          btn.click();
        }
      });
      actions.insertBefore(btn, actions.firstChild);
    });
    insertSettingsButton(actions, iconSize);
  }

  function insertSettingsButton(actions, iconSize){
    if (actions.querySelector('.menu-btn-settings')) return;
    let settBtn = document.createElement('div');
    settBtn.className = 'head__action selector plugin-menu-btn menu-btn-settings';
    settBtn.setAttribute('tabindex','0');
    settBtn.innerHTML = `<span class="menu-ico">⚙️</span> <span class="menu-label">Настройки</span>`;
    settBtn.querySelector('.menu-label').style.opacity = '0';
    settBtn.onclick = function(){ openMenuConfig(iconSize); };
    settBtn.addEventListener('keydown', function(e){
      if (e.key === 'Enter') {
        e.preventDefault();
        settBtn.click();
      }
    });
    actions.appendChild(settBtn);
  }

  function openMenuConfig(iconSize) {
    const allItems = scanLeftMenu();
    let enabledItems = JSON.parse(localStorage.getItem("plugin_menu_cfg")||"[]");
    let modal = document.createElement("div");
    modal.style = "position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;";
    modal.innerHTML = `
      <div style="background:#23232a;padding:2em 2em 1em 2em;border-radius:14px;color:#fff;min-width:340px;max-width:99vw">
        <div style="font-size:1.35em;margin-bottom:1em;font-weight:bold">Настройка верхнего меню</div>
        <div id="plugin-menu-list" style="display:flex;flex-direction:column;gap:10px;max-height:50vh;overflow-y:auto"></div>
        <div style="margin-top:1.5em;text-align:right">
          <button id="plugin-menu-save" style="padding:.6em 1.5em;background:#578;border-radius:6px;color:#fff;border:none;margin-right:.5em;">Сохранить</button>
          <button id="plugin-menu-cancel" style="padding:.6em 1.5em;background:#444;border-radius:6px;color:#fff;border:none;margin-right:.5em;">Отмена</button>
          <button id="plugin-menu-reset" style="padding:.6em 1.5em;background:#666;border-radius:6px;color:#fff;border:none">Сбросить</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const list = modal.querySelector("#plugin-menu-list");
    allItems.forEach(it => {
      const enabled = enabledItems.includes(it.title);
      const row = document.createElement("label");
      row.style = "display:flex;align-items:center;gap:9px;cursor:pointer;font-size:1.08em;padding:.35em .6em;border-radius:7px;" +
        (enabled ? "background:#fff;color:#000;" : "");
      row.innerHTML = `
        <input type="checkbox" ${enabled?"checked":""} style="accent-color:#578;width:22px;height:22px;"/>
        ${it.icon} <span>${it.title}</span>`;
      row.querySelector("input").onchange = function(){
        if (this.checked) { row.style.background="#fff"; row.style.color="#000"; }
        else { row.style.background=""; row.style.color="#fff"; }
      };
      list.appendChild(row);
    });

    modal.querySelector("#plugin-menu-save").onclick = function(){
      const enabledNew = [];
      list.querySelectorAll("label").forEach(row=>{
        if(row.querySelector("input").checked) {
          enabledNew.push(row.querySelector("span").innerText);
        }
      });
      localStorage.setItem("plugin_menu_cfg", JSON.stringify(enabledNew));
      modal.remove();
      injectStyles(iconSize);
      buildMenuButtons(iconSize);
    };
    modal.querySelector("#plugin-menu-cancel").onclick = function(){
      modal.remove();
    };
    modal.querySelector("#plugin-menu-reset").onclick = function(){
      localStorage.setItem("plugin_menu_cfg", JSON.stringify(allItems.map(x=>x.title)));
      modal.remove();
      injectStyles(iconSize);
      buildMenuButtons(iconSize);
    };
  }

  function injectStyles(iconSize){
    const prevStyle = document.getElementById("plugin-menu-btn-style");
    if(prevStyle) prevStyle.remove();
    const size = iconSize || 1.1;
    const style = document.createElement("style");
    style.id = "plugin-menu-btn-style";
    style.textContent = `
.head__action.plugin-menu-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  cursor:pointer;
  border-radius:12px;
  padding:0 .8em;
  height:2.8em;
  margin-left:.14em;
  color:#fff;
  font-size:${size}em;
  min-width:8em;
  background:none;
  transition:background .16s, color .14s, min-width .12s;
  user-select:none;
  position:relative;
}
.head__action.plugin-menu-btn .menu-label{
  margin-left:.48em;
  font-size:1em;
  white-space:nowrap;
  opacity:0;
  color:#000;
  transition:opacity .16s;
}
.head__action.plugin-menu-btn .menu-ico svg,
.head__action.plugin-menu-btn .menu-ico img {
  width:2em; height:2em; min-width:2em; min-height:2em; margin-right:.09em; transition:all .14s; display:block;
}
.head__action.plugin-menu-btn.focus,
.head__action.plugin-menu-btn:focus,
.head__action.plugin-menu-btn:hover {
  background: #fff !important;
  color: #000 !important;
  outline: none;
}
.head__action.plugin-menu-btn.focus .menu-label,
.head__action.plugin-menu-btn:focus .menu-label,
.head__action.plugin-menu-btn:hover .menu-label {
  opacity:1 !important;
}
.head__action.plugin-menu-btn .menu-label,
.head__action.plugin-menu-btn .menu-ico {
  flex-shrink:0;
  flex-grow:0;
}
`;
    document.head.appendChild(style);
  }

  setTimeout(() => {
    let iconSize = parseFloat(localStorage.getItem('plugin_menu_icon_size') || "1.1");
    injectStyles(iconSize);
    buildMenuButtons(iconSize);
  }, 900);
})();
