(function() {
    'use strict';
    
    // Проверка версии Lampa (требуется 3.0.0+)
    if (!Lampa.Manifest || Lampa.Manifest.app_digital < 300) return;
    
    // Защита от повторной загрузки
    if (window.combinedPluginLoaded) return;
    window.combinedPluginLoaded = true;
    
    // ===== СТИЛИ (через Lampa.Template) =====
    function injectStyles() {
        const styleId = 'combined-plugin-styles';
        
        // Проверяем, есть ли уже стили (защита от множественных вставок)
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
            
            /* Год (убрано выделение, оставлен только фон для читаемости) */
            .full-start-new__head {
                background: rgba(0, 0, 0, 0.7) !important;
                backdrop-filter: blur(5px) !important;
                -webkit-backdrop-filter: blur(5px) !important;
                border: none !important;
                border-radius: 6px !important;
                padding: 0.25em 0.7em !important;
                position: relative !important;
                display: inline-block !important;
            }
            .full-start-new__head::before {
                display: none !important;
            }
            
            /* Классы для контуров логотипов (пока закомментированы) 
            .logo-light {
                filter: drop-shadow(0 0 2px rgba(0,0,0,0.8)) drop-shadow(0 0 2px rgba(0,0,0,0.8));
            }
            .logo-dark {
                filter: drop-shadow(0 0 2px rgba(255,255,255,0.8)) drop-shadow(0 0 2px rgba(255,255,255,0.8));
            }
            */
            
            /* Центрирование элементов на мобильных */
            @media (max-width: 768px) {
                .full-start-new__right,
                .full-start__left {
                    display: flex !important;
                    flex-direction: column !important;
                    justify-content: center !important;
                    align-items: center !important;
                }
                
                .full-start-new__buttons,
                .full-start-new__rate-line,
                .full-start__buttons,
                .full-start__details,
                .full-start-new__details,
                .full-descr__details,
                .full-descr__tags,
                .full-descr__text,
                .full-start-new__title,
                .full-start-new__tagline,
                .full-start-new__head,
                .full-start__title,
                .full-start__title-original {
                    justify-content: center !important;
                    align-items: center !important;
                    text-align: center !important;
                    display: flex !important;
                    flex-direction: row !important;
                    flex-wrap: wrap !important;
                    gap: 0.5em !important;
                }
                
                .items-line__head {
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
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                if (!e.object || !e.object.activity) return;
                
                const data = e.data.movie;
                const type = data.name ? 'tv' : 'movie';
                const id = data.id;
                
                if (!id) return;
                
                const url = Lampa.TMDB.api(`${type}/${id}/images?api_key=${Lampa.TMDB.key()}&language=${Lampa.Storage.get('language')}`);
                
                $.get(url)
                    .done(function(resp) {
                        if (resp.logos && resp.logos[0]) {
                            const logoPath = resp.logos[0].file_path;
                            // Используем оригинальное качество
                            const logoUrl = Lampa.TMDB.image('/t/p/original' + logoPath.replace('.svg', '.png'));
                            
                            const titleBlock = e.object.activity.render().find('.full-start-new__title');
                            if (titleBlock.length) {
                                // Создаём контейнер с фиксированной минимальной высотой и невидимым изображением
                                titleBlock.empty();
                                const container = $(`
                                    <div style="display: flex; justify-content: center; align-items: center; width: 100%; min-height: 125px; position: relative;">
                                        <img style="max-height: 125px; opacity: 0; transition: opacity 0.2s ease;" />
                                    </div>
                                `);
                                titleBlock.append(container);
                                
                                const imgElement = container.find('img')[0];
                                
                                // Просто загружаем изображение и показываем его (без анализа)
                                const img = new Image();
                                img.src = logoUrl;
                                
                                img.onload = function() {
                                    imgElement.src = logoUrl;
                                    imgElement.style.opacity = '1';
                                };
                                
                                img.onerror = function() {
                                    // Если не удалось загрузить, ничего не делаем
                                };
                            }
                        }
                    });
            }
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
            <div class="full-start-new__title">{title}</div>
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
