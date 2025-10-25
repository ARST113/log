(function() {
    'use strict';

    console.log('[Poster Style] === Плагин запущен ===');

    function applyPosterStyles() {
        console.log('[Poster Style] Применяем стили...');
        
        // Меняем параметр blur на false
        if (typeof window.lampa_settings !== 'undefined' && 'blur_poster' in window.lampa_settings) {
            window.lampa_settings.blur_poster = false;
        }
        
        // Удаляем старые стили
        var oldStyle = document.getElementById('poster-style-plugin');
        if (oldStyle) oldStyle.remove();
        
        // Создаем новые стили
        var style = document.createElement('style');
        style.id = 'poster-style-plugin';
        style.textContent = `
            /* Убираем blur */
            .full-start__poster,
            .full-start-new__poster,
            .full-start__poster img,
            .full-start-new__poster img,
            .background,
            .background img {
                filter: none !important;
                -webkit-filter: none !important;
            }
            
            /* Основной контейнер постера */
            .full-start__poster,
            .full-start-new__poster,
            .background {
                position: relative;
                overflow: hidden;
            }
            
            /* Изображение - показываем весь постер */
            .full-start__poster img,
            .full-start-new__poster img,
            .background img {
                object-fit: cover !important;
                object-position: center center !important;
                width: 100% !important;
                height: 100% !important;
                
                /* Обработка как на Кинопоиске */
                filter: brightness(0.75) contrast(1.1) saturate(0.9) !important;
                -webkit-filter: brightness(0.75) contrast(1.1) saturate(0.9) !important;
            }
            
            /* Очень плавный градиент без резких границ */
            .full-start__poster::after,
            .full-start-new__poster::after,
            .background::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                pointer-events: none;
                z-index: 1;
                
                background: 
                    /* Мягкий градиент снизу - очень плавный переход */
                    linear-gradient(
                        to top,
                        rgba(0, 0, 0, 0.95) 0%,
                        rgba(0, 0, 0, 0.92) 5%,
                        rgba(0, 0, 0, 0.88) 10%,
                        rgba(0, 0, 0, 0.82) 15%,
                        rgba(0, 0, 0, 0.75) 20%,
                        rgba(0, 0, 0, 0.65) 25%,
                        rgba(0, 0, 0, 0.55) 30%,
                        rgba(0, 0, 0, 0.45) 35%,
                        rgba(0, 0, 0, 0.35) 40%,
                        rgba(0, 0, 0, 0.25) 45%,
                        rgba(0, 0, 0, 0.18) 50%,
                        rgba(0, 0, 0, 0.12) 55%,
                        rgba(0, 0, 0, 0.08) 60%,
                        rgba(0, 0, 0, 0.05) 65%,
                        rgba(0, 0, 0, 0.03) 70%,
                        rgba(0, 0, 0, 0.01) 75%,
                        transparent 80%
                    ),
                    /* Мягкое затемнение по бокам */
                    linear-gradient(
                        to right,
                        rgba(0, 0, 0, 0.4) 0%,
                        rgba(0, 0, 0, 0.2) 5%,
                        rgba(0, 0, 0, 0.1) 10%,
                        transparent 20%,
                        transparent 80%,
                        rgba(0, 0, 0, 0.1) 90%,
                        rgba(0, 0, 0, 0.2) 95%,
                        rgba(0, 0, 0, 0.4) 100%
                    ),
                    /* Легкая виньетка */
                    radial-gradient(
                        ellipse at center,
                        transparent 40%,
                        rgba(0, 0, 0, 0.08) 60%,
                        rgba(0, 0, 0, 0.15) 80%,
                        rgba(0, 0, 0, 0.25) 100%
                    );
            }
            
            /* Очень легкий общий overlay */
            .full-start__poster::before,
            .full-start-new__poster::before,
            .background::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.1);
                pointer-events: none;
                z-index: 0;
            }
            
            /* Контент поверх градиентов */
            .full-start__content,
            .full-start-new__content,
            .full-start__title,
            .full-start-new__title,
            .full-start__tagline,
            .full-start__details,
            .full-start__buttons {
                position: relative;
                z-index: 2;
            }
        `;
        
        document.head.appendChild(style);
        console.log('[Poster Style] ✓ Стили применены');
    }

    // Применяем стили сразу
    applyPosterStyles();
    
    // Повторяем через 500ms
    setTimeout(applyPosterStyles, 500);

    // Мониторинг настройки blur_poster
    setInterval(function() {
        if (window.lampa_settings && window.lampa_settings.blur_poster !== false) {
            window.lampa_settings.blur_poster = false;
        }
    }, 1000);

    // Подписываемся на события Lampa
    if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                applyPosterStyles();
            }
        });
        
        Lampa.Listener.follow('activity', function(e) {
            if (e.type === 'start') {
                setTimeout(applyPosterStyles, 100);
            }
        });
    }

    console.log('[Poster Style] === Инициализация завершена ===');

})();
