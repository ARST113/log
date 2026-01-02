Lampa.Platform.tv();

(function () {
    'use strict';

    /** SVG-иконки через спрайт */
    const MOVIE_SVG = `<svg><use xlink:href="#sprite-movie"></use></svg>`;
    const TV_SVG = `<svg><use xlink:href="#sprite-tv"></use></svg>`;
    const ANIME_SVG = `<svg><use xlink:href="#sprite-anime"></use></svg>`;

    /** Проверка поддержки backdrop-filter */
    function supportsBackdropFilter() {
        const CSS = window.CSS;
        return CSS && (CSS.supports('backdrop-filter', 'blur(10px)') || 
               CSS.supports('-webkit-backdrop-filter', 'blur(10px)'));
    }

    /** CSS с правильными отступами и центрированием */
    const baseCSS = `
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

    /* Интеграция с glass-системой Lampa */
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

    .navigation-bar__item:hover,
    .navigation-bar__item.active {
        background: rgba(255,255,255,${supportsBackdropFilter() ? '0.14' : '0.2'});
        transform: scale(1.05);
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        z-index: 1;
    }

    body.glass--style .navigation-bar__item:hover,
    body.glass--style .navigation-bar__item.active {
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

    /* Скрыть подписи в портретном режиме */
    .navigation-bar__label {
        display: none !important;
    }

    /* Ландшафтный режим - меню справа компактное и центрированное */
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

    /* Адаптивность для маленьких экранов в ландшафтном режиме */
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
    }`;

    /** Селекторы */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    /** Кэш DOM элементов */
    const cache = {
        bar: null,
        items: null,
        resizeObserver: null,
        lampaListeners: [],
        
        getBar() {
            if (!this.bar || !document.contains(this.bar)) {
                this.bar = $('.navigation-bar__body');
            }
            return this.bar;
        },
        
        getItems() {
            const bar = this.getBar();
            if (!bar) {
                this.items = null;
                return [];
            }
            
            if (!this.items || this.items.some(item => !document.contains(item))) {
                this.items = $$('.navigation-bar__item', bar);
            }
            return this.items;
        },
        
        clear() {
            this.bar = null;
            this.items = null;
            this.lampaListeners.forEach(listener => listener && listener());
            this.lampaListeners = [];
        },
        
        clearBarCache() {
            this.bar = null;
        }
    };

    /** Дебаунсинг */
    function debounce(func, wait) {
        if (window.Lampa && window.Lampa.Utils && window.Lampa.Utils.debounce) {
            return Lampa.Utils.debounce(func, wait);
        }
        
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /** Навигация через Lampa API */
    function navigateToCategory(action) {
        if (window.Lampa && window.Lampa.Router) {
            const categoryMap = {
                'movie': {
                    title: 'Фильмы',
                    url: 'movie',
                    source: Lampa.Storage ? Lampa.Storage.field('source') : 'tmdb'
                },
                'tv': {
                    title: 'Сериалы',
                    url: 'tv',
                    source: Lampa.Storage ? Lampa.Storage.field('source') : 'tmdb'
                },
                'anime': {
                    title: 'Аниме',
                    url: 'anime',
                    source: 'cub'
                }
            };
            
            const category = categoryMap[action];
            if (category) {
                Lampa.Router.call('category', {
                    url: category.url,
                    title: category.title,
                    source: category.source,
                    page: 1
                });
                return;
            }
        }
        
        requestAnimationFrame(() => {
            const menuItems = $$('.menu__item, .selector');
            for (const el of menuItems) {
                if (el.dataset?.action === action) {
                    el.click();
                    return;
                }
            }
        });
    }

    /** Вставка CSS */
    function injectCSS() {
        if (!$('#menu-glass-auto-style')) {
            const style = document.createElement('style');
            style.id = 'menu-glass-auto-style';
            style.textContent = baseCSS;
            document.head.appendChild(style);
        }
    }

    /** Добавление элемента в панель навигации */
    function addItem(action, svg) {
        const bar = cache.getBar();
        if (!bar || bar.querySelector(`[data-action="${action}"]`)) return;
        
        const div = document.createElement('div');
        div.className = 'navigation-bar__item';
        div.dataset.action = action;
        div.innerHTML = `<div class="navigation-bar__icon">${svg}</div>`;
        
        // Вставляем перед кнопкой поиска, если она есть
        const search = bar.querySelector('.navigation-bar__item[data-action="search"]');
        if (search) {
            bar.insertBefore(div, search);
        } else {
            bar.appendChild(div);
        }
        
        div.addEventListener('click', () => navigateToCategory(action));
        cache.clearBarCache();
        
        // Активация при загрузке соответствующей страницы
        requestAnimationFrame(() => {
            const currentPath = window.location.pathname;
            const currentPage = Lampa.Router && Lampa.Router.current ? 
                               Lampa.Router.current().url : currentPath;
            
            if (currentPage.includes(action) || 
                (action === 'movie' && (currentPage.includes('/movie/') || currentPage === 'movie')) ||
                (action === 'tv' && (currentPage.includes('/tv/') || currentPage === 'tv')) ||
                (action === 'anime' && (currentPage.includes('/anime/') || currentPage === 'anime'))) {
                div.classList.add('active');
            }
        });
    }

    /** Динамическая корректировка для ландшафтного режима */
    function adjustLandscapeSpacing() {
        requestAnimationFrame(() => {
            const bar = cache.getBar();
            const items = cache.getItems();
            
            if (!bar || !items.length) return;

            // Получаем реальные размеры экрана
            const screenHeight = window.innerHeight;
            const screenWidth = window.innerWidth;
            
            // Определяем размеры элементов на основе высоты экрана
            let itemSize;
            
            if (screenHeight > 600) {
                // Большие экраны
                itemSize = Math.min(56, Math.floor(screenHeight * 0.08));
            } else if (screenHeight > 450) {
                // Средние экраны
                itemSize = Math.min(48, Math.floor(screenHeight * 0.09));
            } else if (screenHeight > 350) {
                // Маленькие экраны
                itemSize = Math.min(40, Math.floor(screenHeight * 0.1));
            } else {
                // Очень маленькие экраны
                itemSize = Math.min(36, Math.floor(screenHeight * 0.11));
            }
            
            // Ограничиваем минимальный размер
            itemSize = Math.max(32, itemSize);
            
            // Рассчитываем ширину панели на основе размера элементов
            const panelWidth = itemSize + 16; // + отступы
            
            // Применяем размеры к панели
            bar.style.width = `${panelWidth}px`;
            bar.style.minWidth = `${panelWidth}px`;
            bar.style.maxWidth = `${panelWidth}px`;
            
            // Применяем размеры к элементам
            items.forEach((item) => {
                item.style.width = `${itemSize}px`;
                item.style.height = `${itemSize}px`;
                item.style.minWidth = `${itemSize}px`;
                item.style.maxWidth = `${itemSize}px`;
                item.style.flex = '0 0 auto';
                item.style.margin = '0';
            });
            
            // Центрируем элементы в панели
            bar.style.justifyContent = 'center';
            bar.style.alignItems = 'center';
            
            // Если элементы не помещаются, уменьшаем отступы
            const itemCount = items.length;
            const totalItemsHeight = itemSize * itemCount;
            const availableHeight = screenHeight - 24; // Учитываем отступы
            
            if (totalItemsHeight > availableHeight) {
                // Вычисляем максимальный размер, который поместится
                const maxItemSize = Math.floor(availableHeight / itemCount);
                const finalItemSize = Math.max(32, maxItemSize);
                const finalPanelWidth = finalItemSize + 12;
                
                // Обновляем размеры
                bar.style.width = `${finalPanelWidth}px`;
                bar.style.minWidth = `${finalPanelWidth}px`;
                bar.style.maxWidth = `${finalPanelWidth}px`;
                
                items.forEach((item) => {
                    item.style.width = `${finalItemSize}px`;
                    item.style.height = `${finalItemSize}px`;
                    item.style.minWidth = `${finalItemSize}px`;
                    item.style.maxWidth = `${finalItemSize}px`;
                });
            }
        });
    }

    /** Сброс стилей для портретного режима */
    function resetPortraitStyles() {
        requestAnimationFrame(() => {
            const bar = cache.getBar();
            const items = cache.getItems();
            
            if (!bar || !items.length) return;
            
            // Сбрасываем все стили, установленные для ландшафтного режима
            bar.style.width = '';
            bar.style.minWidth = '';
            bar.style.maxWidth = '';
            bar.style.justifyContent = '';
            bar.style.alignItems = '';
            
            items.forEach((item) => {
                item.style.width = '';
                item.style.height = '';
                item.style.minWidth = '';
                item.style.maxWidth = '';
                item.style.flex = '';
                item.style.margin = '';
            });
        });
    }

    /** Автоматическая корректировка размера элементов */
    function adjustSpacing() {
        const isLandscape = document.body.classList.contains('orientation--landscape') && 
                          document.body.classList.contains('true--mobile');
        
        if (isLandscape) {
            adjustLandscapeSpacing();
        } else {
            resetPortraitStyles();
        }
    }

    /** Настройка обработчиков событий */
    function setupEvents() {
        const bar = cache.getBar();
        if (!bar) return;
        
        // Используем Lampa.Listener если доступен
        if (window.Lampa && window.Lampa.Listener) {
            const listener = window.Lampa.Listener;
            
            cache.lampaListeners.push(
                listener.follow('size:changed', () => {
                    adjustSpacing();
                }),
                
                listener.follow('orientation:changed', () => {
                    setTimeout(() => {
                        adjustSpacing();
                        if (bar) {
                            // Принудительный рефлоу
                            bar.style.display = 'none';
                            bar.offsetHeight;
                            bar.style.display = 'flex';
                        }
                    }, 300);
                }),
                
                // Слушаем изменения роутера для обновления активного элемента
                listener.follow('router:change', () => {
                    requestAnimationFrame(() => {
                        const items = cache.getItems();
                        const currentPage = Lampa.Router && Lampa.Router.current ? 
                                           Lampa.Router.current().url : window.location.pathname;
                        
                        items.forEach(item => {
                            const action = item.dataset.action;
                            if (!action) return;
                            
                            const isActive = currentPage.includes(action) || 
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
            window.addEventListener('orientationchange', () => {
                setTimeout(adjustSpacing, 300);
            });
        }
        
        // Наблюдатель за изменением размеров
        if (window.ResizeObserver) {
            cache.resizeObserver = new ResizeObserver(
                debounce(() => {
                    adjustSpacing();
                }, 100)
            );
            cache.resizeObserver.observe(bar);
        }
    }

    /** Инициализация */
    function init() {
        injectCSS();
        
        // Добавляем наши элементы
        addItem('movie', MOVIE_SVG);
        addItem('tv', TV_SVG);
        addItem('anime', ANIME_SVG);
        
        // Настраиваем расположение
        adjustSpacing();
        
        const bar = cache.getBar();
        if (!bar) return;
        
        // Настраиваем обработчики событий
        setupEvents();
    }

    /** MutationObserver для ожидания появления навигационной панели */
    const mo = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && 
                        (node.classList?.contains('navigation-bar__body') || 
                         node.querySelector?.('.navigation-bar__body'))) {
                        mo.disconnect();
                        init();
                        return;
                    }
                }
            }
        }
    });

    mo.observe(document.documentElement, { 
        childList: true, 
        subtree: true 
    });
    
    // Если панель уже существует
    if ($('.navigation-bar__body')) {
        mo.disconnect();
        init();
    }
})();
