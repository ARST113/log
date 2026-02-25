Lampa.Platform.tv();

(function () {
    'use strict';

    // ==================== ДЕФОЛТНЫЕ НАСТРОЙКИ ====================
    var defaults = {
        1: { action: 'movie',   svg: '<svg><use xlink:href="#sprite-movie"></use></svg>',   name: 'Фильмы' },
        2: { action: 'tv',      svg: '<svg><use xlink:href="#sprite-tv"></use></svg>',      name: 'Сериалы' },
        3: { action: 'cartoon', svg: '<svg><use xlink:href="#sprite-cartoon"></use></svg>', name: 'Мультфильмы' }
    };

    // ==================== CSS (стили из плагина 2) ====================
    function supportsBackdropFilter() {
        var CSS = window.CSS;
        return CSS && (CSS.supports('backdrop-filter', 'blur(10px)') || CSS.supports('-webkit-backdrop-filter', 'blur(10px)'));
    }

    var baseCSS = `
    /* ===== Стили панели из плагина 2 ===== */
    .navigation-bar__body {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        width: 100% !important;
        max-width: 100% !important;
        padding: 8px 12px !important;
        overflow: hidden !important;
        box-shadow: 0 2px 20px rgba(0,0,0,0.3);
        border-top: 1px solid rgba(255,255,255,0.08);
        background: rgba(20,20,25,0.45);
        transition: all 0.3s ease;
        ${supportsBackdropFilter() ? 'backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);' : ''}
        box-sizing: border-box !important;
        gap: 8px !important;
    }
    body.glass--style .navigation-bar__body {
        background-color: rgba(20,20,25,0.45) !important;
        backdrop-filter: blur(14px) !important;
        -webkit-backdrop-filter: blur(14px) !important;
        border-top-color: rgba(255,255,255,0.12) !important;
    }
    .navigation-bar__item {
        flex: 1 1 0px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(255,255,255,${supportsBackdropFilter() ? '0.06' : '0.1'});
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.35);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-sizing: border-box !important;
        cursor: pointer;
        aspect-ratio: 1 / 1 !important;
        overflow: hidden !important;
        ${supportsBackdropFilter() ? 'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);' : ''}
        min-width: 0 !important;
        max-width: 100% !important;
    }
    body.glass--style .navigation-bar__item {
        background: rgba(255,255,255,0.08) !important;
        box-shadow: 0 4px 15px rgba(0,0,0,0.4) !important;
        border: 1px solid rgba(255,255,255,0.05) !important;
    }
    .navigation-bar__item:hover, .navigation-bar__item.active {
        background: rgba(255,255,255,${supportsBackdropFilter() ? '0.14' : '0.2'});
        transform: scale(1.05);
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        z-index: 1;
    }
    body.glass--style .navigation-bar__item:hover, body.glass--style .navigation-bar__item.active {
        background: rgba(255,255,255,0.16) !important;
        border-color: rgba(255,255,255,0.1) !important;
    }
    .navigation-bar__icon {
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        padding: 10px;
    }
    .navigation-bar__icon svg {
        width: 100% !important;
        height: 100% !important;
        max-width: 28px !important;
        max-height: 28px !important;
        min-width: 18px !important;
        min-height: 18px !important;
        transition: all 0.3s ease;
    }
    .navigation-bar__label {
        display: none !important;
    }

    /* Ландшафтный режим */
    body.true--mobile.orientation--landscape .navigation-bar__body {
        flex-direction: column !important;
        width: auto !important;
        min-width: 60px !important;
        max-width: 80px !important;
        height: 100% !important;
        padding: 12px 8px !important;
        border-top: none !important;
        border-left: 1px solid rgba(255,255,255,0.15) !important;
        box-shadow: -2px 0 30px rgba(0,0,0,0.5) !important;
        justify-content: center !important;
        align-items: center !important;
        position: fixed !important;
        right: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        z-index: 11 !important;
        gap: 8px !important;
        overflow: hidden !important;
    }
    body.glass--style.true--mobile.orientation--landscape .navigation-bar__body {
        border-left-color: rgba(255,255,255,0.12) !important;
        background-color: rgba(20,20,25,0.5) !important;
    }
    body.true--mobile.orientation--landscape .navigation-bar__item {
        flex: 0 0 auto !important;
        width: 80% !important;
        max-width: 56px !important;
        min-width: 40px !important;
        height: auto !important;
        aspect-ratio: 1 / 1 !important;
        margin: 0 !important;
    }
    body.true--mobile.orientation--landscape .navigation-bar__icon {
        padding: 12px !important;
    }
    body.true--mobile.orientation--landscape .navigation-bar__icon svg {
        width: 100% !important;
        height: 100% !important;
        max-width: 28px !important;
        max-height: 28px !important;
        min-width: 18px !important;
        min-height: 18px !important;
    }

    /* Адаптив для ландшафта */
    @media (max-height: 600px) {
        body.true--mobile.orientation--landscape .navigation-bar__body {
            padding: 10px 6px !important;
            gap: 6px !important;
            min-width: 56px !important;
            max-width: 70px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__item {
            width: 75% !important;
            max-width: 48px !important;
            min-width: 36px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__icon {
            padding: 10px !important;
        }
    }
    @media (max-height: 450px) {
        body.true--mobile.orientation--landscape .navigation-bar__body {
            padding: 8px 4px !important;
            gap: 4px !important;
            min-width: 48px !important;
            max-width: 60px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__item {
            width: 70% !important;
            max-width: 40px !important;
            min-width: 32px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__icon {
            padding: 8px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__icon svg {
            max-width: 22px !important;
            max-height: 22px !important;
            min-width: 16px !important;
            min-height: 16px !important;
        }
    }
    @media (max-height: 350px) {
        body.true--mobile.orientation--landscape .navigation-bar__body {
            padding: 6px 3px !important;
            gap: 3px !important;
            min-width: 40px !important;
            max-width: 50px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__item {
            width: 65% !important;
            max-width: 36px !important;
            min-width: 28px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__icon {
            padding: 6px !important;
        }
        body.true--mobile.orientation--landscape .navigation-bar__icon svg {
            max-width: 18px !important;
            max-height: 18px !important;
            min-width: 14px !important;
            min-height: 14px !important;
        }
    }

    /* Портретный режим адаптивность */
    @media (max-width: 1200px) {
        .navigation-bar__body {
            padding: 8px 10px !important;
            gap: 6px !important;
        }
    }
    @media (max-width: 900px) {
        .navigation-bar__body {
            padding: 6px 8px !important;
            gap: 4px !important;
        }
        .navigation-bar__item {
            border-radius: 10px !important;
        }
        .navigation-bar__icon {
            padding: 8px !important;
        }
    }
    @media (max-width: 600px) {
        .navigation-bar__body {
            padding: 6px !important;
            gap: 3px !important;
        }
        .navigation-bar__item {
            border-radius: 8px !important;
        }
        .navigation-bar__icon {
            padding: 6px !important;
        }
        .navigation-bar__icon svg {
            max-width: 22px !important;
            max-height: 22px !important;
        }
    }
    @media (max-width: 400px) {
        .navigation-bar__body {
            padding: 4px !important;
            gap: 2px !important;
        }
        .navigation-bar__item {
            border-radius: 6px !important;
        }
        .navigation-bar__icon {
            padding: 4px !important;
        }
        .navigation-bar__icon svg {
            max-width: 20px !important;
            max-height: 20px !important;
            min-width: 16px !important;
            min-height: 16px !important;
        }
    }

    /* ===== Модальное окно выбора из плагина 1 ===== */
    .phone-menu-picker-overlay {
        position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.75);
        display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 10px; box-sizing: border-box;
    }
    @supports (padding: constant(safe-area-inset-top)) {
        .phone-menu-picker-overlay { padding: constant(safe-area-inset-top) constant(safe-area-inset-right) constant(safe-area-inset-bottom) constant(safe-area-inset-left); }
    }
    @supports (padding: env(safe-area-inset-top)) {
        .phone-menu-picker-overlay { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
    }
    .phone-menu-picker-modal {
        background: #1e1e24; padding: 12px; border-radius: 12px; max-width: 96%; max-height: 88vh; overflow: hidden;
        display: flex; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.6); box-sizing: border-box; width: 100%;
    }
    .phone-menu-picker-title {
        text-align: center; color: #fff; margin: 0 0 10px; font-size: 16px; font-weight: 600;
    }
    .phone-menu-picker-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; overflow-y: auto; padding: 4px; flex: 1; min-height: 100px; -webkit-overflow-scrolling: touch;
    }
    .phone-menu-picker-grid .picker-item {
        display: flex; flex-direction: column; align-items: center; cursor: pointer; padding: 8px; border-radius: 10px; transition: background 0.2s;
    }
    .phone-menu-picker-grid .picker-item:hover {
        background: rgba(255,255,255,0.1);
    }
    .phone-menu-picker-grid .picker-icon-wrap {
        width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px;
    }
    .phone-menu-picker-grid .picker-icon-wrap svg {
        width: 40px; height: 40px;
    }
    .phone-menu-picker-grid .picker-name {
        font-size: 11px; color: #fff; text-align: center; word-break: break-word;
    }
    .phone-menu-picker-reset {
        grid-column: 1 / -1; text-align: center; padding: 12px; cursor: pointer; color: #ff5555; font-size: 14px;
    }
    @media (min-width: 360px) {
        .phone-menu-picker-modal { padding: 16px; border-radius: 14px; }
        .phone-menu-picker-title { font-size: 17px; margin-bottom: 12px; }
        .phone-menu-picker-grid { gap: 12px; min-height: 120px; }
        .phone-menu-picker-grid .picker-icon-wrap { width: 50px; height: 50px; margin-bottom: 8px; }
        .phone-menu-picker-grid .picker-icon-wrap svg { width: 46px; height: 46px; }
        .phone-menu-picker-grid .picker-name { font-size: 12px; }
    }
    @media (min-width: 480px) {
        .phone-menu-picker-modal { padding: 20px; border-radius: 16px; max-width: 420px; }
        .phone-menu-picker-title { font-size: 18px; }
        .phone-menu-picker-grid { gap: 16px; min-height: 140px; }
        .phone-menu-picker-grid .picker-icon-wrap { width: 56px; height: 56px; }
        .phone-menu-picker-grid .picker-icon-wrap svg { width: 48px; height: 48px; }
        .phone-menu-picker-grid .picker-name { font-size: 13px; }
    }
    @media (min-width: 768px) {
        .phone-menu-picker-overlay { padding: 20px; }
        .phone-menu-picker-modal { max-width: 480px; max-height: 85vh; }
    }`;

    // ==================== УТИЛИТЫ ====================
    var $ = function(s,r){ r = r || document; return r.querySelector(s); };
    var $$ = function(s,r){ r = r || document; var n = r.querySelectorAll(s); return Array.prototype.slice.call(n); };

    function svgToStorage(svg){
        if(!svg || typeof svg !== 'string') return svg;
        try{ return 'b64:' + btoa(unescape(encodeURIComponent(svg))); } catch(e){ return svg; }
    }
    function svgFromStorage(val){
        if(!val || typeof val !== 'string') return val;
        if(val.indexOf('b64:') !== 0) return val;
        try{ return decodeURIComponent(escape(atob(val.slice(4)))); } catch(e){ return val; }
    }

    function injectCSS(){
        if(!$('#menu-glass-auto-style')){
            var st = document.createElement('style');
            st.id = 'menu-glass-auto-style';
            st.textContent = baseCSS;
            document.head.appendChild(st);
        }
    }

    // ==================== НАВИГАЦИЯ ====================
    function triggerClick(el){
        if(!el) return;
        try{ el.click(); } catch(e){}
        try{
            var ev = document.createEvent('MouseEvents');
            ev.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
            el.dispatchEvent(ev);
        } catch(e){}
    }

    function getLeftMenuRoot(){
        try{
            var sidebarMenu = document.querySelector('.sidebar .menu, .sidebar .selector');
            if(sidebarMenu && sidebarMenu.parentElement) return sidebarMenu.parentElement;
            var sidebar = document.querySelector('.sidebar, .sidebar__body');
            if(sidebar) return sidebar;
            var menu = document.querySelector('.menu');
            return menu || null;
        } catch(e){ return null; }
    }

    function findAndClickMenuItem(action){
        try{
            var root = getLeftMenuRoot();
            var list = root && root.querySelectorAll ? root.querySelectorAll('.menu__item[data-action], .menu__item[data-id], .selector[data-action], .selector[data-id], .menu__item, .selector') : [];
            for(var i = 0; i < list.length; i++){
                var el = list[i];
                var v = (el && el.getAttribute && (el.getAttribute('data-action') || el.getAttribute('data-id'))) || '';
                if(v && v === action){ triggerClick(el); return true; }
            }
            for(var j = 0; j < list.length; j++){
                var el2 = list[j];
                var nameEl = el2 && el2.querySelector ? el2.querySelector('.menu__text, .selector__text, .selector-title') : null;
                var text = (nameEl && nameEl.textContent ? nameEl.textContent.trim() : (el2.textContent || '').trim().replace(/\s+/g, ' ')) || '';
                if(text && text === action){ triggerClick(el2); return true; }
            }
        } catch(e){}
        return false;
    }

    function emulateSidebarClick(action){
        try{
            if(!action) return false;
            if(typeof Lampa !== 'undefined' && Lampa.Go){
                try{ Lampa.Go(action); return true; } catch(e){}
            }
            if(findAndClickMenuItem(action)) return true;
            setTimeout(function(){
                findAndClickMenuItem(action);
            }, 280);
            return true;
        } catch(e){ return false; }
    }

    // ==================== СБОР ПУНКТОВ ЛЕВОГО МЕНЮ (без разворачивания спрайтов) ====================
    function collectMenuSections(){
        var out = [];
        var seen = {};
        var root = getLeftMenuRoot();
        if(!root) return out;

        function add(el){
            var action = (el.getAttribute('data-action') || el.getAttribute('data-id') || '').trim();
            var nameEl = el.querySelector('.menu__text, .selector__text, .selector-title, .text');
            var name = (nameEl && nameEl.textContent) ? nameEl.textContent.trim() : '';
            if(!name) name = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
            var key = action || name || ('item_' + out.length);
            if(!key || seen[key]) return;
            if(action === 'main' || action === 'settings') return;
            if(name && (name.indexOf('Редактировать') !== -1 || name.indexOf('Настройки') !== -1)) return;
            seen[key] = true;

            var ico = el.querySelector('.menu__ico, .selector__ico, .selector-icon, .ico');
            var svg = '';
            if(ico){
                var svgEl = ico.querySelector('svg');
                if(svgEl) svg = svgEl.outerHTML;
            }
            if(!svg){
                var firstSvg = el.querySelector('svg');
                if(firstSvg) svg = firstSvg.outerHTML;
            }
            if(!svg) return;
            // Не разворачиваем <use>, оставляем как есть
            out.push({ name: name || key, action: key, svg: svg });
        }

        var selectors = [
            '.menu__item[data-action]', '.menu__item[data-id]', '.menu__item',
            '.selector[data-action]', '.selector[data-id]', '.selector'
        ];
        for(var i = 0; i < selectors.length; i++){
            var list = root.querySelectorAll(selectors[i]);
            for(var j = 0; j < list.length; j++){
                add(list[j]);
            }
        }
        return out;
    }

    // ==================== МОДАЛЬНОЕ ОКНО ВЫБОРА ====================
    function showIconPicker(position, div, iconEl, labelEl, defaultAction, defaultSvg, defaultName){
        var overlay = document.createElement('div');
        overlay.className = 'phone-menu-picker-overlay';
        overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.parentNode && overlay.parentNode.removeChild(overlay); });

        var modal = document.createElement('div');
        modal.className = 'phone-menu-picker-modal';

        var title = document.createElement('h3');
        title.textContent = 'Настройка кнопки';
        title.className = 'phone-menu-picker-title';
        modal.appendChild(title);

        var grid = document.createElement('div');
        grid.className = 'phone-menu-picker-grid';
        var options = collectMenuSections();
        if(options.length === 0) return;

        // Функция заполнения сетки
        function renderOptionsGrid(grid, options, position, div, iconEl, labelEl, overlay, defaultAction, defaultSvg, defaultName){
            grid.innerHTML = '';
            for(var i = 0; i < options.length; i++){
                var opt = options[i];
                var item = document.createElement('div');
                item.className = 'picker-item';
                item.innerHTML = '<div class="picker-icon-wrap">' + opt.svg + '</div><span class="picker-name">' + (opt.name || '') + '</span>';
                var svgEl = item.querySelector('svg');
                if(svgEl){ svgEl.style.width = '48px'; svgEl.style.height = '48px'; }
                if(opt.action !== '_'){
                    (function(o, a, s, n){
                        item.addEventListener('click', function(){
                            // Сохраняем иконку как есть (без разворачивания)
                            div.setAttribute('data-action', a);
                            localStorage.setItem('bottom_bar_' + position + '_action', a);
                            iconEl.innerHTML = s; // используем исходный SVG
                            localStorage.setItem('bottom_bar_' + position + '_svg', svgToStorage(s));
                            labelEl.textContent = n;
                            localStorage.setItem('bottom_bar_' + position + '_name', n);
                            if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
                        });
                    })(opt, opt.action, opt.svg, opt.name);
                } else {
                    item.style.pointerEvents = 'none';
                    item.style.opacity = '0.7';
                }
                grid.appendChild(item);
            }
            var reset = document.createElement('div');
            reset.className = 'phone-menu-picker-reset';
            reset.textContent = 'Сбросить на стандарт';
            reset.addEventListener('click', function(){
                div.setAttribute('data-action', defaultAction);
                localStorage.removeItem('bottom_bar_' + position + '_action');
                iconEl.innerHTML = defaultSvg; // используем стандартную иконку как есть
                localStorage.setItem('bottom_bar_' + position + '_svg', svgToStorage(defaultSvg));
                labelEl.textContent = defaultName;
                localStorage.removeItem('bottom_bar_' + position + '_name');
                if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
            });
            grid.appendChild(reset);
        }

        renderOptionsGrid(grid, options, position, div, iconEl, labelEl, overlay, defaultAction, defaultSvg, defaultName);

        modal.appendChild(grid);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    // ==================== ДОБАВЛЕНИЕ КНОПКИ ====================
    function addItem(position, defaultAction, defaultSvg, defaultName){
        var bar = $('.navigation-bar__body');
        if(!bar || bar.querySelector('[data-position="' + position + '"]')) return;

        var savedAction = localStorage.getItem('bottom_bar_' + position + '_action') || defaultAction;
        var savedSvg = svgFromStorage(localStorage.getItem('bottom_bar_' + position + '_svg') || defaultSvg);
        var savedName = localStorage.getItem('bottom_bar_' + position + '_name') || defaultName;

        var div = document.createElement('div');
        div.className = 'navigation-bar__item';
        div.setAttribute('data-action', savedAction);
        div.setAttribute('data-position', position);

        var iconDiv = document.createElement('div');
        iconDiv.className = 'navigation-bar__icon';
        iconDiv.innerHTML = savedSvg; // вставляем иконку как есть (с <use>)

        var labelDiv = document.createElement('div');
        labelDiv.className = 'navigation-bar__label';
        labelDiv.textContent = savedName;

        div.appendChild(iconDiv);
        div.appendChild(labelDiv);

        var search = bar.querySelector('.navigation-bar__item[data-action="search"]');
        if(search) bar.insertBefore(div, search);
        else bar.appendChild(div);

        div.addEventListener('click', function(){
            emulateSidebarClick(div.getAttribute('data-action'));
        });

        // Долгое нажатие для настройки
        var timer;
        function start(){
            timer = setTimeout(function(){ showIconPicker(position, div, iconDiv, labelDiv, defaultAction, defaultSvg, defaultName); }, 700);
        }
        function cancel(){ clearTimeout(timer); }

        div.addEventListener('touchstart', start);
        div.addEventListener('touchend', cancel);
        div.addEventListener('touchmove', cancel);
        div.addEventListener('touchcancel', cancel);
        div.addEventListener('mousedown', function(e){
            if(e.button === 0){
                start();
                function up(){ cancel(); document.removeEventListener('mouseup', up); }
                document.addEventListener('mouseup', up);
            }
        });
    }

    // ==================== АДАПТАЦИЯ ИЗ ПЛАГИНА 2 ====================
    var cache = {
        bar: null,
        items: null,
        resizeObserver: null,
        lampaListeners: [],
        getBar: function() {
            if (!this.bar || !document.contains(this.bar)) {
                this.bar = $('.navigation-bar__body');
            }
            return this.bar;
        },
        getItems: function() {
            var bar = this.getBar();
            if (!bar) {
                this.items = null;
                return [];
            }
            if (!this.items || this.items.some(function(item){ return !document.contains(item); })) {
                this.items = $$('.navigation-bar__item', bar);
            }
            return this.items;
        },
        clearBarCache: function() {
            this.bar = null;
        }
    };

    function debounce(func, wait) {
        if (window.Lampa && window.Lampa.Utils && window.Lampa.Utils.debounce) {
            return Lampa.Utils.debounce(func, wait);
        }
        var timeout;
        return function executedFunction() {
            var args = arguments;
            var later = function() {
                clearTimeout(timeout);
                func.apply(null, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function adjustLandscapeSpacing() {
        requestAnimationFrame(function() {
            var bar = cache.getBar();
            var items = cache.getItems();
            if (!bar || !items.length) return;

            var screenHeight = window.innerHeight;
            var screenWidth = window.innerWidth;

            var itemSize;
            if (screenHeight > 600) {
                itemSize = Math.min(56, Math.floor(screenHeight * 0.08));
            } else if (screenHeight > 450) {
                itemSize = Math.min(48, Math.floor(screenHeight * 0.09));
            } else if (screenHeight > 350) {
                itemSize = Math.min(40, Math.floor(screenHeight * 0.1));
            } else {
                itemSize = Math.min(36, Math.floor(screenHeight * 0.11));
            }
            itemSize = Math.max(32, itemSize);

            var panelWidth = itemSize + 16;
            bar.style.width = panelWidth + 'px';
            bar.style.minWidth = panelWidth + 'px';
            bar.style.maxWidth = panelWidth + 'px';

            items.forEach(function(item) {
                item.style.width = itemSize + 'px';
                item.style.height = itemSize + 'px';
                item.style.minWidth = itemSize + 'px';
                item.style.maxWidth = itemSize + 'px';
                item.style.flex = '0 0 auto';
                item.style.margin = '0';
            });

            bar.style.justifyContent = 'center';
            bar.style.alignItems = 'center';

            var itemCount = items.length;
            var totalItemsHeight = itemSize * itemCount;
            var availableHeight = screenHeight - 24;

            if (totalItemsHeight > availableHeight) {
                var maxItemSize = Math.floor(availableHeight / itemCount);
                var finalItemSize = Math.max(32, maxItemSize);
                var finalPanelWidth = finalItemSize + 12;
                bar.style.width = finalPanelWidth + 'px';
                bar.style.minWidth = finalPanelWidth + 'px';
                bar.style.maxWidth = finalPanelWidth + 'px';
                items.forEach(function(item) {
                    item.style.width = finalItemSize + 'px';
                    item.style.height = finalItemSize + 'px';
                    item.style.minWidth = finalItemSize + 'px';
                    item.style.maxWidth = finalItemSize + 'px';
                });
            }
        });
    }

    function resetPortraitStyles() {
        requestAnimationFrame(function() {
            var bar = cache.getBar();
            var items = cache.getItems();
            if (!bar || !items.length) return;

            bar.style.width = '';
            bar.style.minWidth = '';
            bar.style.maxWidth = '';
            bar.style.justifyContent = '';
            bar.style.alignItems = '';

            items.forEach(function(item) {
                item.style.width = '';
                item.style.height = '';
                item.style.minWidth = '';
                item.style.maxWidth = '';
                item.style.flex = '';
                item.style.margin = '';
            });
        });
    }

    function adjustSpacing() {
        var isLandscape = document.body.classList.contains('orientation--landscape') && document.body.classList.contains('true--mobile');
        if (isLandscape) {
            adjustLandscapeSpacing();
        } else {
            resetPortraitStyles();
        }
    }

    function setupEvents() {
        var bar = cache.getBar();
        if (!bar) return;

        if (window.Lampa && window.Lampa.Listener) {
            var listener = window.Lampa.Listener;
            cache.lampaListeners.push(
                listener.follow('size:changed', function() { adjustSpacing(); }),
                listener.follow('orientation:changed', function() {
                    setTimeout(function() {
                        adjustSpacing();
                        if (bar) {
                            bar.style.display = 'none';
                            bar.offsetHeight;
                            bar.style.display = 'flex';
                        }
                    }, 300);
                }),
                listener.follow('router:change', function() {
                    requestAnimationFrame(function() {
                        var items = cache.getItems();
                        var currentPage = Lampa.Router && Lampa.Router.current ? Lampa.Router.current().url : window.location.pathname;
                        items.forEach(function(item) {
                            var action = item.dataset.action;
                            if (!action) return;
                            var isActive = currentPage.includes(action) ||
                                (action === 'movie' && (currentPage.includes('/movie/') || currentPage === 'movie')) ||
                                (action === 'tv' && (currentPage.includes('/tv/') || currentPage === 'tv')) ||
                                (action === 'anime' && (currentPage.includes('/anime/') || currentPage === 'anime'));
                            item.classList.toggle('active', isActive);
                        });
                    });
                })
            );
        } else {
            window.addEventListener('resize', debounce(adjustSpacing, 100));
            window.addEventListener('orientationchange', function() { setTimeout(adjustSpacing, 300); });
        }

        if (window.ResizeObserver) {
            cache.resizeObserver = new ResizeObserver(debounce(adjustSpacing, 100));
            cache.resizeObserver.observe(bar);
        }
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================
    function init() {
        injectCSS();

        addItem('1', defaults[1].action, defaults[1].svg, defaults[1].name);
        addItem('2', defaults[2].action, defaults[2].svg, defaults[2].name);
        addItem('3', defaults[3].action, defaults[3].svg, defaults[3].name);

        adjustSpacing();
        setupEvents();
    }

    // ==================== ЗАПУСК ====================
    var mo = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
            var mutation = mutations[i];
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                for (var j = 0; j < mutation.addedNodes.length; j++) {
                    var node = mutation.addedNodes[j];
                    if (node.nodeType === 1 && (node.classList && node.classList.contains('navigation-bar__body') || (node.querySelector && node.querySelector('.navigation-bar__body')))) {
                        mo.disconnect();
                        init();
                        return;
                    }
                }
            }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    if ($('.navigation-bar__body')) {
        mo.disconnect();
        init();
    }
})();
