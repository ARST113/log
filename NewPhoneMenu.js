Lampa.Platform.tv();

(function () {
'use strict';

// SVG для "Фильмы" и "Сериалы"
var MOVIE_SVG = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.1 12V10.52C9.1 8.61 10.45 7.84 12.1 8.79L13.38 9.53L14.66 10.27C16.31 11.22 16.31 12.78 14.66 13.73L13.38 14.47L12.1 15.21C10.45 16.16 9.1 15.38 9.1 13.48V12Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
var TV_SVG    = `<svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M7.26 2h9.47c.65 0 1.23.02 1.75.09C21.25 2.4 22 3.7 22 7.26v6.32c0 3.56-.75 4.86-3.52 5.16-.52.07-1.09.08-1.76.08H7.26c-.65 0-1.23-.02-1.75-.08C2.74 18.44 2 17.14 2 13.58V7.26c0-3.56.74-4.86 3.51-5.17.52-.07 1.1-.09 1.75-.09Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.58 8.32h3.68M6.74 14.11h10.53M7 22h10M7.19 8.3h.01M10.49 8.3h.01" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

var css = `
.navigation-bar__body {
    display: flex !important;
    justify-content: center !important;
    gap: 0 !important;
    background: none !important;
    box-shadow: none !important;
    flex-wrap: nowrap !important;
    width: 100% !important;
}
.navigation-bar__item {
    flex: 0 0 auto !important;
    display: flex !important;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: 0 4px !important;
    background: #23232a;
    border-radius: 13px;
    box-shadow: 0 2px 12px 0 #23232f44;
    transition: background .16s, box-shadow .16s, transform .16s;
    padding: 8px 12px !important;
    min-height: 60px;
    min-width: 90px !important;
    max-width: 110px !important;
    box-sizing: border-box;
}
.navigation-bar__item:hover, .navigation-bar__item:focus-visible, .navigation-bar__item.active {
    background: #505057;
    box-shadow: 0 4px 22px 0 #23232fa3;
    outline: 2px solid #fff;
    transform: scale(1.05);
}
.navigation-bar__item .navigation-bar__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    margin-bottom: 4px;
    transition: all 0.2s ease;
}
.navigation-bar__item .navigation-bar__icon svg {
    width: 24px !important;
    height: 24px !important;
    display: block;
    transition: all 0.2s ease;
}
.navigation-bar__item .navigation-bar__label {
    font-size: 0.95em !important;
    text-align: center !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    transition: all 0.2s ease;
}

/* Адаптивные стили для планшетов */
@media (max-width: 1024px) {
    .navigation-bar__item {
        min-width: 80px !important;
        max-width: 95px !important;
        padding: 6px 8px !important;
        margin: 0 3px !important;
    }
    
    .navigation-bar__item .navigation-bar__icon {
        height: 24px;
        margin-bottom: 3px;
    }
    
    .navigation-bar__item .navigation-bar__icon svg {
        width: 22px !important;
        height: 22px !important;
    }
    
    .navigation-bar__item .navigation-bar__label {
        font-size: 0.85em !important;
    }
}

/* Адаптивные стили для мобильных устройств */
@media (max-width: 768px) {
    .navigation-bar__body {
        justify-content: flex-start !important;
        overflow-x: auto !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
        padding: 0 8px !important;
    }
    .navigation-bar__body::-webkit-scrollbar {
        display: none !important;
    }
    
    .navigation-bar__item {
        min-width: 70px !important;
        max-width: 85px !important;
        padding: 5px 6px !important;
        margin: 0 2px !important;
        border-radius: 10px;
    }
    
    .navigation-bar__item .navigation-bar__icon {
        height: 22px;
        margin-bottom: 2px;
    }
    
    .navigation-bar__item .navigation-bar__icon svg {
        width: 20px !important;
        height: 20px !important;
    }
    
    .navigation-bar__item .navigation-bar__label {
        font-size: 0.8em !important;
        line-height: 1.1;
    }
}

/* Стили для маленьких экранов в портретной ориентации */
@media (max-width: 480px) and (orientation: portrait) {
    .navigation-bar__body {
        padding: 0 6px !important;
    }
    
    .navigation-bar__item {
        min-width: 55px !important;
        max-width: 65px !important;
        padding: 4px 5px !important;
        margin: 0 1px !important;
        border-radius: 8px;
    }
    
    .navigation-bar__item .navigation-bar__icon {
        height: 18px;
        margin-bottom: 1px;
    }
    
    .navigation-bar__item .navigation-bar__icon svg {
        width: 16px !important;
        height: 16px !important;
    }
    
    .navigation-bar__item .navigation-bar__label {
        font-size: 0.7em !important;
    }
}

/* Стили для очень маленьких экранов в портретной ориентации */
@media (max-width: 360px) and (orientation: portrait) {
    .navigation-bar__body {
        padding: 0 4px !important;
    }
    
    .navigation-bar__item {
        min-width: 45px !important;
        max-width: 55px !important;
        padding: 3px 4px !important;
        margin: 0 1px !important;
        border-radius: 6px;
    }
    
    .navigation-bar__item .navigation-bar__icon {
        height: 16px;
        margin-bottom: 0;
    }
    
    .navigation-bar__item .navigation-bar__icon svg {
        width: 14px !important;
        height: 14px !important;
    }
    
    .navigation-bar__item .navigation-bar__label {
        font-size: 0.65em !important;
        line-height: 1;
    }
}

/* Стили для альбомной ориентации на мобильных */
@media (max-width: 850px) and (orientation: landscape) {
    .navigation-bar__body {
        justify-content: center !important;
        overflow-x: visible !important;
        flex-wrap: wrap !important;
        padding: 0 5px !important;
    }
    
    .navigation-bar__item {
        min-width: 65px !important;
        max-width: 80px !important;
        padding: 4px 6px !important;
        margin: 2px !important;
    }
    
    .navigation-bar__item .navigation-bar__icon {
        height: 20px;
    }
    
    .navigation-bar__item .navigation-bar__icon svg {
        width: 18px !important;
        height: 18px !important;
    }
    
    .navigation-bar__item .navigation-bar__label {
        font-size: 0.75em !important;
    }
}

/* Для очень больших экранов - увеличиваем размер */
@media (min-width: 1600px) {
    .navigation-bar__item {
        min-width: 110px !important;
        max-width: 130px !important;
        padding: 10px 15px !important;
        min-height: 70px;
    }
    
    .navigation-bar__item .navigation-bar__icon {
        height: 32px;
        margin-bottom: 6px;
    }
    
    .navigation-bar__item .navigation-bar__icon svg {
        width: 28px !important;
        height: 28px !important;
    }
    
    .navigation-bar__item .navigation-bar__label {
        font-size: 1.05em !important;
    }
}

/* Динамическое ограничение количества элементов для очень узких экранов */
@media (max-width: 320px) and (orientation: portrait) {
    .navigation-bar__body {
        padding: 0 2px !important;
    }
    
    .navigation-bar__item {
        min-width: 40px !important;
        max-width: 50px !important;
        padding: 2px 3px !important;
        margin: 0 0.5px !important;
    }
    
    .navigation-bar__item .navigation-bar__icon {
        height: 14px;
    }
    
    .navigation-bar__item .navigation-bar__icon svg {
        width: 12px !important;
        height: 12px !important;
    }
    
    .navigation-bar__item .navigation-bar__label {
        font-size: 0.6em !important;
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

// Добавляем обработчик изменения ориентации
function handleResize() {
  applyExtraStyle();
}

// Инициализация
setTimeout(ensureNavItems, 800);
setInterval(ensureNavItems, 3500);

// Слушаем изменения размера окна и ориентации
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

})();
