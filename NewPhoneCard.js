(function() {
    'use strict';
    
    // Проверка версии Lampa 3.0.0 и выше
    if (Lampa.Manifest && Lampa.Manifest.app_digital < 300) return;
    
    Lampa.Platform.tv();

    let observer;
    let reorderAttempts = 0;
    const maxReorderAttempts = 10;
    window.logoplugin = true;

    function log(...args) {
        if (window.logoplugin) console.log('[combined-plugin]', ...args);
    }

    // ===== ОСНОВНЫЕ СТИЛИ =====
    function applyBaseStyles() {
        // Удаляем старые стили если есть
        var oldStyle = document.getElementById('no-blur-plugin-styles');
        if (oldStyle) oldStyle.remove();
        
        // Добавляем все стили
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
            
            /* Черный фон и скрытие canvas */
            .background {
                background: #000 !important;
            }
            .background canvas {
                display: none !important;
            }
            
            /* Очистка правого блока */
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
            
            /* Стили для логотипа */
            .full-start-new__title {
                position: relative !important;
                width: 100% !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                min-height: 70px !important;
                margin: 0 auto !important;
                box-sizing: border-box !important;
            }
            .full-start-new__title img {
                margin-top: 5px !important;
                max-height: 125px !important;
                display: block !important;
                position: relative !important;
                z-index: 2 !important;
            }
            
            /* Плавное затемнение постера - УВЕЛИЧЕНО ДО 50% */
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
                height: 50% !important;  /* Увеличено с 40% до 50% */
                background: linear-gradient(to bottom, 
                    transparent 0%, 
                    rgba(0, 0, 0, 0.4) 20%,
                    rgba(0, 0, 0, 0.6) 40%,
                    rgba(0, 0, 0, 0.8) 70%,
                    #000 100%) !important;
                pointer-events: none !important;
                z-index: 1 !important;
            }

            /* Стили для перемещения заголовка с затемненным фоном */
            .full-start-new__head {
                border: 2px solid rgba(255, 255, 255, 0.75) !important;
                border-radius: 6px !important;
                padding: 0.25em 0.7em !important;
                box-sizing: border-box !important;
                background: rgba(0, 0, 0, 0.7) !important;  /* Добавлен затемненный фон */
                backdrop-filter: blur(5px) !important;      /* Легкое размытие для красоты */
                -webkit-backdrop-filter: blur(5px) !important;
            }
        `;
        document.head.appendChild(style);
        
        return true;
    }

    function initBlurPlugin() {
        // Запускаем сразу
        applyBaseStyles();

        // Повторяем через 500ms на случай если DOM еще не готов
        setTimeout(applyBaseStyles, 500);

        // Мониторинг изменений каждую секунду
        setInterval(function() {
            if (window.lampa_settings && window.lampa_settings.blur_poster !== false) {
                window.lampa_settings.blur_poster = false;
            }
        }, 1000);
    }

    // ===== ФУНКЦИИ ПЕРЕМЕЩЕНИЯ ЗАГОЛОВКА =====
    function reorderElements() {
        reorderAttempts++;

        const $head = $('.full-start-new__head');
        const $tagline = $('.full-start-new__tagline.full--tagline');
        const $rateLine = $('.full-start-new__rate-line');

        if ($head.length && $rateLine.length) {
            // Усиленная обводка: толще и ярче + фон
            $head.css({
                'border': '2px solid rgba(255, 255, 255, 0.75)',  // более яркая обводка
                'border-radius': '6px',
                'padding': '0.25em 0.7em',
                'box-sizing': 'border-box',
                'background': 'rgba(0, 0, 0, 0.7)',              // Добавлен фон
                'backdrop-filter': 'blur(5px)',                  // Размытие фона
                '-webkit-backdrop-filter': 'blur(5px)'
            });

            if ($tagline.length) {
                if ($tagline.next()[0] !== $head[0]) {
                    $head.insertAfter($tagline);
                    log('Moved head after tagline');
                }
                if ($head.next()[0] !== $rateLine[0]) {
                    $head.insertBefore($rateLine);
                    log('Moved head before rateLine');
                }
            } else {
                if ($head.next()[0] !== $rateLine[0]) {
                    $head.insertBefore($rateLine);
                    log('Fallback: moved head before rateLine');
                }
            }

            reorderAttempts = 0;
            return true;
        } else {
            log('Heads or rate-line missing', {
                head: $head.length,
                tagline: $tagline.length,
                rateLine: $rateLine.length
            });

            if (reorderAttempts >= maxReorderAttempts) {
                log('Max reorder attempts reached');
            }

            return false;
        }
    }

    function initHeadMover() {
        reorderElements();

        let intervalId = setInterval(() => {
            let success = reorderElements();
            if (success || reorderAttempts >= maxReorderAttempts) {
                clearInterval(intervalId);
                log(success ? 'Successfully reordered elements' : 'Stopped reorder attempts after max retries');
            }
        }, 200);
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
                        initHeadMover(); // Добавляем инициализацию перемещения заголовка
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
            let shouldReorder = false;
            
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            // Проверяем, появились ли элементы карточки
                            if (node.classList && (
                                node.classList.contains('full-start-new__right') ||
                                node.classList.contains('full-start__left') ||
                                node.classList.contains('items-line__head') ||
                                node.classList.contains('full-start-new__poster') ||
                                node.classList.contains('full-start-new__head') ||
                                node.querySelector('.full-start-new__right') ||
                                node.querySelector('.full-start__left') ||
                                node.querySelector('.items-line__head') ||
                                node.querySelector('.full-start-new__poster') ||
                                node.querySelector('.full-start-new__head')
                            )) {
                                shouldApplyStyles = true;
                                
                                // Если появился заголовок, запускаем переупорядочивание
                                if (node.classList.contains('full-start-new__head') || 
                                    node.querySelector('.full-start-new__head')) {
                                    shouldReorder = true;
                                }
                            }
                            
                            // Проверяем вложенные элементы
                            if (node.querySelector) {
                                const cardElements = node.querySelectorAll(
                                    '.full-start-new__right, .full-start__left, .items-line__head, .full-start-new__poster, .full-start-new__head'
                                );
                                if (cardElements.length > 0) {
                                    shouldApplyStyles = true;
                                    if (node.querySelector('.full-start-new__head')) {
                                        shouldReorder = true;
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Также проверяем изменения атрибутов (на случай если Lampa меняет классы)
                if (mutation.type === 'attributes' && 
                    mutation.target.classList && 
                    (mutation.target.classList.contains('full-start-new__poster') ||
                     mutation.target.classList.contains('full-start-new__head'))) {
                    shouldApplyStyles = true;
                }
            });
            
            if (shouldApplyStyles) {
                setTimeout(applyMobileStyles, 100);
                // Принудительно переприменяем базовые стили для затемнения
                setTimeout(applyBaseStyles, 150);
            }
            
            if (shouldReorder) {
                setTimeout(initHeadMover, 200);
            }
        });
        
        // Начинаем наблюдение
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
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

    // ===== ФУНКЦИИ ДЛЯ ЛОГОТИПОВ (ВСТРОЕННЫЕ БЕЗ НАСТРОЕК) =====
    function initLogoPlugin() {
        // Встроенная версия плагина логотипов без настроек
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
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
                    }).fail(function() {
                        // Ошибка загрузки логотипа - оставляем оригинальный текст
                        log('Failed to load logo');
                    });
                }
            }
        });
    }

    // ===== ОБЩАЯ ИНИЦИАЛИЗАЦИЯ =====
    function initAllPlugins() {
        initBlurPlugin();    // Запускаем отключение blur и базовые стили
        initMobileStyles();  // Запускаем мобильные стили
        initLogoPlugin();    // Запускаем логотипы (встроенные без настроек)
        initHeadMover();     // Запускаем перемещение заголовка
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
    window.applyBaseStyles = applyBaseStyles;
    window.reorderHeadElements = reorderElements;

})();
