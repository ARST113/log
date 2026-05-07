(function() {
    'use strict';
    
    // Проверка версии Lampa (требуется 3.0.0+)
    if (!Lampa.Manifest || Lampa.Manifest.app_digital < 300) return;
    
    // Защита от повторной загрузки
    if (window.combinedPluginLoaded) return;
    window.combinedPluginLoaded = true;
    window.__combinedPluginInitialized = window.__combinedPluginInitialized || false;
    window.__combinedLogoLoaderInitialized = window.__combinedLogoLoaderInitialized || false;
    window.__combinedLogoRequestToken = window.__combinedLogoRequestToken || 0;
    window.__combinedLogoCache = window.__combinedLogoCache || {};
    const COMBINED_LOGO_STORAGE_KEY = 'combined_logo_cache_v1';
    const COMBINED_LOGO_IMAGE_SIZE = 'w500';
    
    function loadPersistLogoCache() {
        try {
            const saved = Lampa.Storage.get(COMBINED_LOGO_STORAGE_KEY, '{}');
            const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
    
            if (parsed && typeof parsed === 'object') {
                window.__combinedLogoCache = Object.assign({}, parsed, window.__combinedLogoCache || {});
            }
        } catch (err) {
            window.__combinedLogoCache = window.__combinedLogoCache || {};
        }
    }
    
    function savePersistLogoCache() {
        try {
            Lampa.Storage.set(COMBINED_LOGO_STORAGE_KEY, JSON.stringify(window.__combinedLogoCache || {}));
        } catch (err) {}
    }
    
    loadPersistLogoCache();
    
    
    // ===== СТИЛИ (через Lampa.Template) =====
    function injectStyles() {
        const styleId = 'combined-plugin-styles';
        
        // Проверяем, есть ли уже стили
        if (document.getElementById(styleId)) return;
        
        const css = `
            /* Отключение blur на постерах и фоне */
            .full-start__poster,
            .full-start-new__poster,
            .full-start__poster img,
            .full-start-new__poster img,
            .background,
            .background img,
            .screensaver__slides-slide img,
            .screensaver__bg,
            .card--collection .card__img {
                filter: none !important;
                -webkit-filter: none !important;
            }
            
            /* Чёрный фон и скрытие canvas */
            .background {
                background: #000 !important;
            }
            .background canvas {
                display: none !important;
            }
            
            /* Очистка правого блока от лишних эффектов */
            .full-start-new__right {
                background: none !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                outline: none !important;
            }
            .full-start-new__right::before, 
            .full-start-new__right::after {
                background: none !important;
                box-shadow: none !important;
                border: none !important;
                opacity: 0 !important;
                content: unset !important;
            }
            
            /* Плавное затемнение постера (50%) */
            .full-start-new__poster {
                position: relative !important;
                overflow: hidden !important;
            }
            .full-start-new__poster::after {
                content: '' !important;
                position: absolute !important;
                bottom: 0 !important;
                left: 0 !important;
                right: 0 !important;
                height: 50% !important;
                background: linear-gradient(to bottom, 
                    transparent 0%, 
                    rgba(0, 0, 0, 0.4) 20%,
                    rgba(0, 0, 0, 0.6) 40%,
                    rgba(0, 0, 0, 0.8) 70%,
                    #000 100%) !important;
                pointer-events: none !important;
                z-index: 1 !important;
            }
            
            /* Год */
            .full-start-new__head {
                background: rgba(0, 0, 0, 0.7) !important;
                backdrop-filter: blur(5px) !important;
                -webkit-backdrop-filter: blur(5px) !important;
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                text-shadow: none !important;
                -webkit-text-stroke: 0 !important;
                border-radius: 6px !important;
                padding: 0.25em 0.7em !important;
                position: relative !important;
                display: inline-block !important;
            }
            .full-start-new__head::before,
            .full-start-new__head::after {
                display: none !important;
                content: none !important;
                background: none !important;
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
            }
            /* Логотип проекта без повторного мигания */
/* Слот заголовка: сначала резервируем место под логотип */
.full-start-new__title.combined-logo-slot {
    min-height: 125px !important;
    width: 100% !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    text-align: center !important;
    position: relative !important;
}

/* Пока проверяем логотип, текстовое название не показываем */
.full-start-new__title.combined-logo-slot.combined-logo-pending .combined-title-text {
    visibility: hidden !important;
    opacity: 0 !important;
}

/* Если логотип найден, текстовое название полностью убираем */
.full-start-new__title.combined-logo-slot.combined-logo-ready .combined-title-text {
    display: none !important;
}

/* Если логотипа нет, возвращаем обычное название */
.full-start-new__title.combined-logo-slot.combined-logo-missing .combined-title-text {
    visibility: visible !important;
    opacity: 1 !important;
    display: inline !important;
}

/* Контейнер логотипа */
    .combined-logo-container {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        width: 100% !important;
        min-height: 125px !important;
        position: relative !important;
    }
    
    /* Сам логотип */
    .combined-logo-container img {
        display: block !important;
        max-height: 125px !important;
        max-width: 100% !important;
        opacity: 1 !important;
        filter: none !important;
        -webkit-filter: none !important;
    }        
            /* Центрирование элементов на мобильных ТОЛЬКО внутри полной карточки */
            @media (max-width: 768px) {
                .full-start-new .full-start-new__right,
                .full-start .full-start__left {
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: center !important;
                    align-items: center !important;
                }
                
                .full-start-new .full-start-new__buttons,
                .full-start-new .full-start-new__rate-line,
                .full-start .full-start__buttons,
                .full-start .full-start__details,
                .full-start-new .full-start-new__details,
                .full-start .full-descr__details,
                .full-start .full-descr__tags,
                .full-start .full-descr__text,
                .full-start-new .full-start-new__title,
                .full-start-new .full-start-new__tagline,
                .full-start-new .full-start-new__head,
                .full-start .full-start__title,
                .full-start .full-start__title-original {
                    justify-content: center !important;
                    align-items: center !important;
                    text-align: center !important;
                    display: flex !important;
                    flex-direction: row !important;
                    flex-wrap: wrap !important;
                    gap: 0.5em !important;
                }
                
                .full-start .items-line__head {
                    display: flex !important;
                    justify-content: center !important;
                    align-items: center !important;
                    width: 100% !important;
                }
            }
        `;
        
        Lampa.Template.add(styleId, `<style id="${styleId}">${css}</style>`);
        Lampa.Template.get(styleId, {}).appendTo('head');
    }
    
    // ===== ПРИНУДИТЕЛЬНОЕ ОТКЛЮЧЕНИЕ BLUR =====
    function initBlurFix() {
        Lampa.Settings.listener.follow('change', function(e) {
            if (e.name === 'blur_poster' && e.value !== false) {
                Lampa.Storage.set('blur_poster', false);
                if (window.lampa_settings) {
                    window.lampa_settings.blur_poster = false;
                }
            }
        });
        
        if (Lampa.Storage.get('blur_poster') !== false) {
            Lampa.Storage.set('blur_poster', false);
        }
        
        if (window.lampa_settings && window.lampa_settings.blur_poster !== false) {
            window.lampa_settings.blur_poster = false;
        }
    }
    
    // ===== ЗАГРУЗКА ЛОГОТИПОВ (ОРИГИНАЛЬНОЕ КАЧЕСТВО, БЕЗ АНАЛИЗА) =====
    function initLogoLoader() {
        if (window.__combinedLogoLoaderInitialized) return;
        window.__combinedLogoLoaderInitialized = true;
    
        Lampa.Listener.follow('full', function(e) {
            if (!e || e.type !== 'complite') return;
            if (!e.object || !e.object.activity) return;
            if (!e.data || !e.data.movie) return;
    
            const data = e.data.movie;
            const type = data.name ? 'tv' : 'movie';
            const id = data.id;
    
            if (!id) return;
    
            const activity = e.object.activity;
            const language = Lampa.Storage.get('language') || '';
            const requestKey = type + ':' + id + ':' + language;
            const requestToken = ++window.__combinedLogoRequestToken;
    
            function getTitleBlock() {
                if (!activity || typeof activity.render !== 'function') return $();
    
                const render = activity.render();
                const title = render.find('.full-start-new__title');
    
                if (!title.length) return $();
    
                return title;
            }
    
            function isNodeAlive(node) {
                return node && node.length && document.documentElement.contains(node[0]);
            }
    
            function ensureTitleSlot(titleBlock) {
                if (!titleBlock.length) return;
    
                titleBlock.addClass('combined-logo-slot');
    
                const hasLogo = titleBlock.find('img[data-combined-logo="1"]').length > 0;
                const hasText = titleBlock.find('.combined-title-text').length > 0;
    
                if (!hasLogo && !hasText) {
                    const currentHtml = titleBlock.html();
    
                    titleBlock.html(
                        '<span class="combined-title-text">' + currentHtml + '</span>'
                    );
                }
    
                titleBlock.attr('data-combined-logo-key', requestKey);
            }
    
            function setPending(titleBlock) {
                if (!titleBlock.length) return;
    
                titleBlock
                    .removeClass('combined-logo-ready combined-logo-missing')
                    .addClass('combined-logo-pending');
            }
    
            function setMissing(titleBlock) {
                if (!titleBlock.length) return;
    
                titleBlock
                    .removeClass('combined-logo-pending combined-logo-ready')
                    .addClass('combined-logo-missing');
            }
    
            function isSameLogoAlreadyApplied(titleBlock, logoUrl) {
                const img = titleBlock.find('img[data-combined-logo="1"]');
    
                return (
                    titleBlock.attr('data-combined-logo-key') === requestKey &&
                    titleBlock.attr('data-combined-logo-url') === logoUrl &&
                    img.length &&
                    img.attr('src') === logoUrl
                );
            }
    
            function applyLogo(logoUrl, instant) {
                if (!logoUrl) {
                    const titleBlock = getTitleBlock();
                    if (titleBlock.length) setMissing(titleBlock);
                    return;
                }
            
                let titleBlock = getTitleBlock();
                if (!titleBlock.length) return;
                if (!isNodeAlive(titleBlock)) return;
            
                ensureTitleSlot(titleBlock);
            
                if (isSameLogoAlreadyApplied(titleBlock, logoUrl)) {
                    return;
                }
            
                setPending(titleBlock);
            
                function commitLogo() {
                    const fresh = getTitleBlock();
                    if (!fresh.length) return;
                    if (!isNodeAlive(fresh)) return;
            
                    ensureTitleSlot(fresh);
            
                    if (isSameLogoAlreadyApplied(fresh, logoUrl)) {
                        return;
                    }
            
                    const container = $('<div class="combined-logo-container"></div>');
                    const img = $('<img data-combined-logo="1" decoding="async" loading="eager" fetchpriority="high" />');
            
                    img.attr('src', logoUrl);
                    container.append(img);
            
                    fresh.empty();
                    fresh.append(container);
            
                    fresh
                        .attr('data-combined-logo-key', requestKey)
                        .attr('data-combined-logo-url', logoUrl)
                        .removeClass('combined-logo-pending combined-logo-missing')
                        .addClass('combined-logo-ready');
                }
            
                if (instant) {
                    commitLogo();
                    return;
                }
            
                const preload = new Image();
            
                preload.onload = function() {
                    if (requestToken !== window.__combinedLogoRequestToken) return;
                    commitLogo();
                };
            
                preload.onerror = function() {
                    const fresh = getTitleBlock();
                    if (!fresh.length) return;
                    if (!isNodeAlive(fresh)) return;
            
                    ensureTitleSlot(fresh);
                    setMissing(fresh);
                };
            
                preload.src = logoUrl;
            }
    
            let titleBlock = getTitleBlock();
            if (!titleBlock.length) return;
    
            ensureTitleSlot(titleBlock);
    
            const cached = window.__combinedLogoCache[requestKey];
    
            /*
             * Если уже знаем, что логотипа нет, не держим пустой слот.
             */
            if (cached === false) {
                setMissing(titleBlock);
                return;
            }
    
            /*
             * Если логотип уже есть в кэше, ставим его без похода в TMDB.
             */
            if (typeof cached === 'string' && cached) {
            if (isSameLogoAlreadyApplied(titleBlock, cached)) return;
        
            applyLogo(cached, true);
            return;
        }
    
            /*
             * Первый заход на карточку:
             * сразу скрываем текст, чтобы не было уродской замены title -> logo.
             */
            setPending(titleBlock);
    
            /*
             * Защита от вечного пустого блока, если TMDB подвис.
             * Если за 4 секунды логотип не пришёл, возвращаем обычное название.
             */
            const fallbackTimer = setTimeout(function() {
                if (requestToken !== window.__combinedLogoRequestToken) return;
    
                const fresh = getTitleBlock();
                if (!fresh.length) return;
                if (!isNodeAlive(fresh)) return;
    
                if (!fresh.hasClass('combined-logo-ready')) {
                    setMissing(fresh);
                }
            }, 4000);
    
            const url = Lampa.TMDB.api(
                type + '/' + id + '/images?api_key=' + Lampa.TMDB.key() + '&language=' + language
            );
    
            $.get(url)
                .done(function(resp) {
                    clearTimeout(fallbackTimer);
    
                    if (requestToken !== window.__combinedLogoRequestToken) return;
    
                    if (!resp || !resp.logos || !resp.logos[0] || !resp.logos[0].file_path) {
                       window.__combinedLogoCache[requestKey] = false;
                       savePersistLogoCache();
    
                        const fresh = getTitleBlock();
                        if (fresh.length) {
                            ensureTitleSlot(fresh);
                            setMissing(fresh);
                        }
    
                        return;
                    }
    
                    const logoPath = resp.logos[0].file_path;
                    const logoUrl = Lampa.TMDB.image('/t/p/original' + logoPath.replace('.svg', '.png'));
    
                    window.__combinedLogoCache[requestKey] = logoUrl;
                    savePersistLogoCache();

                    applyLogo(logoUrl, false);
                })
                .fail(function() {
                    clearTimeout(fallbackTimer);
    
                    const fresh = getTitleBlock();
                    if (!fresh.length) return;
    
                    ensureTitleSlot(fresh);
                    setMissing(fresh);
                });
        });
    }
    
    // ===== ПЕРЕОПРЕДЕЛЕНИЕ ШАБЛОНА full_start_new =====
    function overrideTemplate() {
        // Изменён порядок: title -> tagline -> head -> rate-line
        Lampa.Template.add('full_start_new', `
<div class="full-start-new">
    <div class="full-start-new__body">
        <div class="full-start-new__left">
            <div class="full-start-new__poster">
                <img class="full-start-new__img full--poster" />
            </div>
        </div>

        <div class="full-start-new__right">
            <div class="full-start-new__title combined-logo-slot combined-logo-pending">
                <span class="combined-title-text">{title}</span>
            </div>
            <div class="full-start-new__tagline full--tagline">{tagline}</div>
            <div class="full-start-new__head"></div>
            <div class="full-start-new__rate-line">
                <div class="full-start__rate rate--tmdb"><div>{rating}</div><div class="source--name">TMDB</div></div>
                <div class="full-start__rate rate--imdb hide"><div></div><div>IMDB</div></div>
                <div class="full-start__rate rate--kp hide"><div></div><div>KP</div></div>
                <div class="full-start__pg hide"></div>
                <div class="full-start__status hide"></div>
            </div>
            <div class="full-start-new__details"></div>
            <div class="full-start-new__reactions">
                <div>#{reactions_none}</div>
            </div>

            <div class="full-start-new__buttons">
                <div class="full-start__button selector button--play">
                    <svg><use xlink:href="#sprite-play"></use></svg>
                    <span>#{title_watch}</span>
                </div>

                <div class="full-start__button selector button--book">
                    <svg width="21" height="32" viewBox="0 0 21 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 1.5H19C19.2761 1.5 19.5 1.72386 19.5 2V27.9618C19.5 28.3756 19.0261 28.6103 18.697 28.3595L12.6212 23.7303C11.3682 22.7757 9.63183 22.7757 8.37885 23.7303L2.30302 28.3595C1.9739 28.6103 1.5 28.3756 1.5 27.9618V2C1.5 1.72386 1.72386 1.5 2 1.5Z" stroke="currentColor" stroke-width="2.5"/>
                    </svg>
                    <span>#{settings_input_links}</span>
                </div>

                <div class="full-start__button selector button--reaction">
                    <svg><use xlink:href="#sprite-reaction"></use></svg>           
                    <span>#{title_reactions}</span>
                </div>

                <div class="full-start__button selector button--subscribe hide">
                    <svg viewBox="0 0 25 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6.01892 24C6.27423 27.3562 9.07836 30 12.5 30C15.9216 30 18.7257 27.3562 18.981 24H15.9645C15.7219 25.6961 14.2632 27 12.5 27C10.7367 27 9.27804 25.6961 9.03542 24H6.01892Z" fill="currentColor"></path>
                        <path d="M3.81972 14.5957V10.2679C3.81972 5.41336 7.7181 1.5 12.5 1.5C17.2819 1.5 21.1803 5.41336 21.1803 10.2679V14.5957C21.1803 15.8462 21.5399 17.0709 22.2168 18.1213L23.0727 19.4494C24.2077 21.2106 22.9392 23.5 20.9098 23.5H4.09021C2.06084 23.5 0.792282 21.2106 1.9273 19.4494L2.78317 18.1213C3.46012 17.0709 3.81972 15.8462 3.81972 14.5957Z" stroke="currentColor" stroke-width="2.6"></path>
                    </svg>
                    <span>#{title_subscribe}</span>
                </div>

                <div class="full-start__button selector button--options">
                    <svg><use xlink:href="#sprite-dots"></use></svg>
                </div>
            </div>
        </div>
    </div>

    <div class="hide buttons--container">
        <div class="full-start__button view--torrent hide">
            <svg><use xlink:href="#sprite-torrent"></use></svg>
            <span>#{full_torrents}</span>
        </div>

        <div class="full-start__button selector view--trailer">
            <svg><use xlink:href="#sprite-trailer"></use></svg>
            <span>#{full_trailers}</span>
        </div>
    </div>
</div>
        `);
    }
    
    // ===== ИНИЦИАЛИЗАЦИЯ =====
    function init() {
        if (window.__combinedPluginInitialized) return;
        window.__combinedPluginInitialized = true;
    
        injectStyles();
        overrideTemplate();
        initBlurFix();
        initLogoLoader();
    }
    
    // Запуск плагина с использованием Lampa.Timer
    Lampa.Timer.add(500, function() {
        if (window.appready) {
            init();
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    init();
                }
            });
        }
    }, true);
    
})();
