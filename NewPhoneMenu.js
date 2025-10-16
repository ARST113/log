Lampa.Platform.tv();

(function () {
'use strict';

var MOVIE_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.1 12V10.52C9.1 8.61 10.45 7.84 12.1 8.79L13.38 9.53L14.66 10.27C16.31 11.22 16.31 12.78 14.66 13.73L13.38 14.47L12.1 15.21C10.45 16.16 9.1 15.38 9.1 13.48V12Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
var TV_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M7.26 2h9.47c.65 0 1.23.02 1.75.09C21.25 2.4 22 3.7 22 7.26v6.32c0 3.56-.75 4.86-3.52 5.16-.52.07-1.09.08-1.76.08H7.26c-.65 0-1.23-.02-1.75-.08C2.74 18.44 2 17.14 2 13.58V7.26c0-3.56.74-4.86 3.51-5.17.52-.07 1.1-.09 1.75-.09Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.58 8.32h3.68M6.74 14.11h10.53M7 22h10M7.19 8.3h.01M10.49 8.3h.01" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

var css = `
.navigation-bar {
    background: none !important;
    box-shadow: none !important;
    border: none !important;
    width: 100vw !important;
    left: 0 !important; right: 0 !important;
    padding: 0 !important;
}
.navigation-bar__body {
    display: flex !important;
    justify-content: center !important;
    align-items: stretch !important;
    width: 100vw !important;
    min-width: 0 !important;
    overflow: visible !important;
    margin: 0 auto !important;
    padding: 8px 0 !important;
    background: none !important;
    gap: 0 !important;
}
.navigation-bar__item {
    flex: 1 1 0 !important; /* равная ширина на всё окно */
    min-width: 0 !important;
    max-width: 120px !important;
    margin: 0 2px !important;
    background: #23232a;
    border-radius: 13px;
    display: flex !important;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 0 5px 0 !important;
    box-shadow: 0 2px 12px 0 #23232f33;
    transition: background .16s,box-shadow .16s;
}
.navigation-bar__item:hover,
.navigation-bar__item:focus-visible,
.navigation-bar__item.active {
    background: #505057;
    box-shadow: 0 4px 22px 0 #23232fa3;
    outline: 2px solid #fff;
}
.navigation-bar__item .navigation-bar__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 27px;
    margin-bottom: 3px;
}
.navigation-bar__item .navigation-bar__icon svg {
    width: 22px !important;
    height: 22px !important;
    display: block;
}
.navigation-bar__item .navigation-bar__label {
    font-size: 1em !important;
    text-align: center !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1.12;
    min-height: 22px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90vw;
}
@media (max-width: 480px) {
    .navigation-bar__item {
        padding: 4px 0 3.5px 0 !important;
        border-radius: 8px;
        max-width: 72px !important;
        font-size: 0.95em;
    }
    .navigation-bar__item .navigation-bar__icon svg {
        width: 18px !important;
        height: 18px !important;
    }
    .navigation-bar__item .navigation-bar__label {
        font-size: 0.97em !important;
        min-height: 18px;
    }
}
`;

function applyExtraStyle() {
    if (!document.getElementById('navbar-custom-style')) {
        var style = document.createElement('style');
        style.id = 'navbar-custom-style';
        style.textContent = css;
        document.head.appendChild(style);
    }
}

function emulateSidebarClick(label){
    var items = document.querySelectorAll('.menu__item, .selector');
    for(var i=0;i<items.length;i++){
        var txt = (items[i].innerText||items[i].textContent||"").trim().toLowerCase();
        if(txt === label.toLowerCase()){
            items[i].click(); return true;
        }
    }
    return false;
}

function addItem(action, label, svg) {
    var bar = document.querySelector('.navigation-bar__body');
    if (!bar) return;
    if (bar.querySelector('.navigation-bar__item[data-action="'+action+'"]')) return;
    var div = document.createElement('div');
    div.className = "navigation-bar__item";
    div.setAttribute("data-action",action);
    div.innerHTML = `<div class="navigation-bar__icon">${svg}</div><div class="navigation-bar__label">${label}</div>`;
    var search = bar.querySelector('.navigation-bar__item[data-action="search"]');
    if(search) bar.insertBefore(div, search); else bar.appendChild(div);

    div.addEventListener('click', function(){ emulateSidebarClick(label); });
}

function ensureNavItems(){
    addItem("movie","Фильмы",MOVIE_SVG);
    addItem("tv","Сериалы",TV_SVG);
    applyExtraStyle();
}

setTimeout(ensureNavItems, 800);
setInterval(ensureNavItems, 3500);

})();
