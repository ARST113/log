(function() {
    'use strict';
    
    // Проверка версии Lampa 3.0.0 и выше
    if (Lampa.Manifest && Lampa.Manifest.app_digital < 300) return;
    
    Lampa.Platform.tv();

    let observer;
    window.logoplugin = true;

    // ===== ФУНКЦИИ ДЛЯ ОТКЛЮЧЕНИЯ BLUR =====
    function disableBlur() {
        // 1. Меняем параметр
        if (typeof window.lampa_settings !== 'undefined' && 'blur_poster' in window.lampa_settings) {
            window.lampa_settings.blur_poster = false;
        }
        
        // 2. Удаляем старые стили если есть
        var oldStyle = document.getElementById('no-blur-plugin-styles');
        if (oldStyle) oldStyle.remove();
        
        // 3. Добавляем CSS для принудительного отключения blur
        var style = document.createElement('style');
        style.id = 'no-blur-plugin-styles';
        style.textContent = `
            /* Отключаем blur на всех постерах */
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
        `;
        document.head.appendChild(style);
        
        return true;
    }

    function initBlurPlugin() {
        // Запускаем сразу
        disableBlur();

        // Повторяем через 500ms на случай если DOM еще не готов
        setTimeout(disableBlur, 500);

        // Мониторинг изменений каждую секунду
        setInterval(function() {
            if (window.lampa_settings && window.lampa_settings.blur_poster !== false) {
                window.lampa_settings.blur_poster = false;
            }
        }, 1000);
    }

    // ===== ФУНКЦИИ ДЛЯ МОБИЛЬНЫХ СТИЛЕЙ =====
    function initMobileStyles() {
        // Подписываемся на события
        if (typeof Lampa.Listener !== 'undefined' && typeof Lampa.Listener.follow === 'function') {
            // События приложения
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'full' || e.type === 'card') {
                    setTimeout(() => {
                        applyMobileStyles();
                        startDOMObserver();
                    }, 400);
                }
                
                // При скрытии карточки останавливаем observer
                if (e.type === 'hide' || e.type === 'component_hide') {
                    stopDOMObserver();
                }
            });
        }

        // Запускаем постоянное отслеживание
        startDOMObserver();
        
        // Также применяем стили сразу
        setTimeout(applyMobileStyles, 1000);
    }

    function startDOMObserver() {
        // Если observer уже запущен, останавливаем его
        stopDOMObserver();
        
        observer = new MutationObserver(function(mutations) {
            let shouldApplyStyles = false;
            
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            // Проверяем, появились ли элементы карточки
                            if (node.classList && (
                                node.classList.contains('full-start-new__right') ||
                                node.classList.contains('full-start__left') ||
                                node.classList.contains('items-line__head') ||
                                node.querySelector('.full-start-new__right') ||
                                node.querySelector('.full-start__left') ||
                                node.querySelector('.items-line__head')
                            )) {
                                shouldApplyStyles = true;
                                break;
                            }
                            
                            // Проверяем вложенные элементы
                            if (node.querySelector) {
                                const cardElements = node.querySelectorAll(
                                    '.full-start-new__right, .full-start__left, .items-line__head'
                                );
                                if (cardElements.length > 0) {
                                    shouldApplyStyles = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            });
            
            if (shouldApplyStyles) {
                applyMobileStyles();
            }
        });
        
        // Начинаем наблюдение
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function stopDOMObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    function applyMobileStyles() {
        // Применяем стили для мобильной адаптации
        const styles = {
            // Основной контейнер
            '.full-start-new__right, .full-start__left': {
                'display': 'flex',
                'flex-direction': 'column',
                'justify-content': 'center',
                'align-items': 'center'
            },
            
            // Кнопки и рейтинг
            '.full-start-new__buttons, .full-start-new__rate-line, .full-start__buttons, .full-start__details': {
                'justify-content': 'center',
                'align-items': 'center',
                'display': 'flex',
                'flex-direction': 'row',
                'gap': '0.5em',
                'flex-wrap': 'wrap'
            },
            
            // Детали
            '.full-start-new__details, .full-descr__details, .full-descr__tags': {
                'justify-content': 'center',
                'align-items': 'center',
                'display': 'flex',
                'flex-direction': 'row',
                'flex-wrap': 'wrap'
            },
            
            // Текстовые блоки
            '.full-descr__text, .full-start-new__title, .full-start-new__tagline, .full-start-new__head, .full-start__title, .full-start__title-original': {
                'display': 'flex',
                'flex-direction': 'row',
                'justify-content': 'center',
                'align-items': 'center',
                'text-align': 'center'
            }
        };

        // Применяем все стили
        Object.keys(styles).forEach(selector => {
            const elements = $(selector);
            if (elements.length > 0) {
                elements.css(styles[selector]);
            }
        });

        // Стили для заголовков разделов
        applySectionHeadStyles();
    }

    function applySectionHeadStyles() {
        const sectionTitles = [
            'Рекомендации',
            'Режиссер', 
            'Актеры',
            'Подробно',
            'Похожие',
            'Коллекция'
        ];

        $('.items-line__head').each(function() {
            const $element = $(this);
            const text = $element.text().trim();
            
            if (text && (
                sectionTitles.includes(text) ||
                text.includes('Сезон')
            )) {
                $element.css({
                    'display': 'flex',
                    'justify-content': 'center',
                    'align-items': 'center',
                    'width': '100%'
                });
            }
        });
    }

    // ===== ФУНКЦИИ ДЛЯ ЛОГОТИПОВ =====
    function initLogoPlugin() {
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite' && Lampa.Storage.get('logo_glav') !== '1') {
                var data = e.data.movie;
                var type = data.name ? 'tv' : 'movie';
                
                if (data.id !== '') {
                    var url = Lampa.TMDB.api(type + '/' + data.id + '/images?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language'));
                    
                    $.get(url, function(data) {
                        if (data.logos && data.logos[0]) {
                            var logo = data.logos[0].file_path;
                            
                            if (logo !== '') {
                                // Добавляем логотип с центрированием
                                e.object.activity.render().find('.full-start-new__title').html(
                                    '<div style="display: flex; justify-content: center; align-items: center; width: 100%;">' +
                                    '<img style="margin-top: 5px; max-height: 125px;" src="' + Lampa.TMDB.image('/t/p/w300' + logo.replace('.svg', '.png')) + '"/>' +
                                    '</div>'
                                );
                            }
                        }
                    });
                }
            }
        });
    }

    function addLogoSettings() {
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'logo_glav',
                type: 'select',
                values: {
                    '1': 'Скрыть',
                    '0': 'Отображать',
                },
                default: '0',
            },
            field: {
                name: 'Логотипы вместо названий',
                description: 'Отображает логотипы фильмов вместо текста',
            }
        });
    }

    // ===== ОБЩАЯ ИНИЦИАЛИЗАЦИЯ =====
    function initAllPlugins() {
        initBlurPlugin();    // Запускаем отключение blur
        initMobileStyles();  // Запускаем мобильные стили
        initLogoPlugin();    // Запускаем логотипы
        addLogoSettings();   // Добавляем настройки логотипов
    }

    function startPlugin() {
        if (window.appready) {
            initAllPlugins();
        } else {
            if (typeof Lampa.Listener !== 'undefined' && typeof Lampa.Listener.follow === 'function') {
                Lampa.Listener.follow('app', function(e) {
                    if (e.type === 'ready') {
                        setTimeout(initAllPlugins, 500);
                    }
                });
            } else {
                setTimeout(initAllPlugins, 2000);
            }
        }
    }

    // Запускаем плагин
    if (typeof Lampa.Timer !== 'undefined' && typeof Lampa.Timer.add === 'function') {
        Lampa.Timer.add(500, startPlugin, true);
    } else {
        setTimeout(startPlugin, 500);
    }

    // Ручные вызовы для отладки (бесшумные)
    window.applyLampaStyles = applyMobileStyles;
    window.disableLampaBlur = disableBlur;

})();
