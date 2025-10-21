
(function () {
    'use strict';

    /** ============================
     *  LOCAL RATING BADGE v1
     *  — только данные из карточки
     *  — никаких API запросов
     *  — мгновенное отображение
     *  ============================ */

    const PLUGIN_NAME = 'local_rating_badge_v1';

    // ======= Storage helpers =======
    const Storage = {
        get(name, def) { 
            try { 
                const v = Lampa.Storage.get(name, def); 
                return v == null ? def : v; 
            } catch { 
                return def; 
            } 
        },
        set(name, val) { 
            try { 
                Lampa.Storage.set(name, val); 
            } catch {} 
        }
    };

    // ======= Rating extraction =======
    function getRatingFromCard(card, source) {
        if (!card) return null;

        const ratings = {
            'tmdb': () => {
                // Основные поля TMDB
                if (card.vote_average > 0) return parseFloat(card.vote_average);
                if (card.rating > 0) return parseFloat(card.rating);
                
                // Эвристики для TMDB
                if (card.vote_count > 0) return 5.0;
                if (card.popularity > 10) return 6.0;
                
                const year = (card.release_date || card.first_air_date || '').slice(0, 4);
                const currentYear = new Date().getFullYear();
                if (year && currentYear - Number(year) <= 2) return 5.5;
                
                return 0;
            },
            
            'kp': () => {
                // Все возможные поля Kinopoisk
                const rating = card.kp_rating || 
                              card.kinopoisk_rating || 
                              card.kp_rate ||
                              card.kinopoisk_rate ||
                              card.rating_kp ||
                              0;
                return parseFloat(rating);
            },
            
            'imdb': () => {
                // Все возможные поля IMDb
                const rating = card.imdb_rating || 
                              card.imdb_rate || 
                              card.imdb_vote_average ||
                              card.rating_imdb ||
                              0;
                return parseFloat(rating);
            }
        };

        const rating = ratings[source] ? ratings[source]() : 0;
        return rating > 0 ? rating : 0;
    }

    // ======= Badge rendering =======
    const BRAND_ICONS = {
        tmdb: 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg',
        kp: 'https://raw.githubusercontent.com/ARST113/star/refs/heads/main/kinopoisk-icon-main.svg',
        imdb: 'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg'
    };

    function getPosterContainer(card) {
        return card.querySelector('.card__view, .card__image, .card__img, .poster, .image, .thumb') || card;
    }

    function ensureBadgeHost(card) {
        const container = getPosterContainer(card);
        if (!container || !container.appendChild) return null;
        
        try { 
            const cs = getComputedStyle(container); 
            if (cs.position === 'static') container.style.position = 'relative'; 
        } catch {}
        
        let host = container.querySelector(':scope > .local-rate-badge');
        if (!host) {
            host = document.createElement('div');
            host.className = 'local-rate-badge';
            host.style.cssText = `
                position: absolute;
                right: 8px;
                bottom: 8px;
                z-index: 50;
                pointer-events: none;
            `;
            container.appendChild(host);
        }
        
        if (!host.shadowRoot) host.attachShadow({ mode: 'open' });
        return host;
    }

    function renderRatingBadge(card, rating, source) {
        const host = ensureBadgeHost(card);
        if (!host) return;

        // Безопасное преобразование в число и форматирование
        const numRating = parseFloat(rating) || 0;
        const displayValue = numRating > 0 ? numRating.toFixed(1) : '—';
        const icon = BRAND_ICONS[source] || '';

        host.shadowRoot.innerHTML = `
            <style>
                .rating-badge {
                    box-sizing: border-box;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 8px;
                    border-radius: 8px;
                    min-width: 50px;
                    justify-content: center;
                    font: 600 12px/1.1 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Ubuntu, Arial, sans-serif;
                    color: #fff;
                    text-shadow: 0 1px 1px rgba(0,0,0,.7);
                    pointer-events: none;
                }
                .rating-badge.tmdb { 
                    background: #0D253F; 
                    box-shadow: 0 0 0 1px rgba(255,255,255,.06), 0 2px 6px rgba(0,0,0,.38); 
                }
                .rating-badge.kp { 
                    background: #ff5500; 
                }
                .rating-badge.imdb { 
                    background: #f5c518; 
                    color: #000; 
                    text-shadow: none; 
                }
                .rating-value { 
                    font-weight: 700; 
                }
                .rating-logo { 
                    display: inline-block; 
                    width: 48px; 
                    height: 20px; 
                    background-position: center; 
                    background-repeat: no-repeat; 
                    background-size: contain; 
                }
                @media (max-width: 480px) { 
                    .rating-logo { 
                        height: 18px; 
                    } 
                }
            </style>
            <div class="rating-badge ${source}">
                <span class="rating-value">${displayValue}</span>
                <span class="rating-logo" style="${icon ? `background-image:url('${icon}')` : ''}" title="${source.toUpperCase()}"></span>
            </div>
        `;
    }

    // ======= Card processing =======
    function processCard(card) {
        if (!card?.querySelector) return;
        
        const cardData = card.card_data || card.data;
        if (!cardData?.id) return;

        const source = Storage.get('rating_source', 'tmdb');
        const rating = getRatingFromCard(cardData, source);

        renderRatingBadge(card, rating, source);
    }

    // ======= Auto-injection =======
    function hookCards() {
        if (window[PLUGIN_NAME + '_hooked']) return;
        window[PLUGIN_NAME + '_hooked'] = true;

        // Обработка новых карточек через Lampa Listener
        if (Lampa?.Listener?.follow) {
            Lampa.Listener.follow('card', (ev) => {
                if (ev?.type === 'build' && ev?.data?.object) {
                    setTimeout(() => processCard(ev.data.object), 0);
                }
            });
        }

        // Обработка через MutationObserver
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    
                    if (node.classList?.contains('card')) {
                        processCard(node);
                    } else {
                        node.querySelectorAll?.('.card')?.forEach(processCard);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        
        // Обработка существующих карточек
        setTimeout(() => {
            document.querySelectorAll('.card').forEach(processCard);
        }, 300);
    }

    // ======= Settings =======
    function addSettings() {
        if (!Lampa?.SettingsApi?.addParam && !Lampa?.Settings?.listener?.add) return;

        const addSelect = (config) => {
            if (Lampa.SettingsApi?.addParam) {
                Lampa.SettingsApi.addParam({
                    component: 'interface',
                    param: { name: config.name, type: 'select', values: config.values, default: config.def },
                    field: { name: config.title, description: config.descr },
                    onChange: config.onChange
                });
            } else if (Lampa.Settings?.listener?.add) {
                Lampa.Settings.listener.add({
                    component: 'main',
                    param: { name: config.name, type: 'select', values: config.values, default: config.def },
                    field: { name: config.title, description: config.descr },
                    onChange: config.onChange
                });
            }
        };

        addSelect({
            name: 'rating_source',
            values: { tmdb: 'TMDB', kp: 'Кинопоиск', imdb: 'IMDb' },
            def: Storage.get('rating_source', 'tmdb'),
            title: 'Источник рейтинга (локальный)',
            descr: 'Берётся только из данных карточки, без запросов к API',
            onChange: (value) => {
                Storage.set('rating_source', value);
                // Перерисовываем все карточки
                document.querySelectorAll('.card').forEach(processCard);
            }
        });
    }

    // ======= Hide native ratings =======
    function hideNativeRatings() {
        const style = document.createElement('style');
        style.id = 'hide-native-ratings';
        style.textContent = `
            .card .card__view .card__vote,
            .card .card__image .card__vote,
            .card .card__img .card__vote { 
                display: none !important; 
            }
        `;
        document.head.appendChild(style);
    }

    // ======= Initialization =======
    function init() {
        if (window[PLUGIN_NAME + '_inited']) return;
        window[PLUGIN_NAME + '_inited'] = true;

        hideNativeRatings();
        addSettings();
        hookCards();
    }

    // Запуск
    if (window.appready) {
        init();
    } else if (Lampa?.Listener?.follow) {
        Lampa.Listener.follow('app', (e) => {
            if (e?.type === 'ready') init();
        });
    } else {
        setTimeout(init, 1000);
    }
})();
