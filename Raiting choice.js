(function() {
    'use strict';
    
    console.log('🎯 Загрузка плагина рейтингов Lampa v9 (исправленный TMDB)...');
    
    const DEBUG = true;
    
    function log(message, data = null) {
        if (DEBUG) {
            const timestamp = new Date().toLocaleTimeString();
            if (data) {
                console.log(`[${timestamp}] 🔹 ${message}`, data);
            } else {
                console.log(`[${timestamp}] 🔹 ${message}`);
            }
        }
    }
    
    let processedCards = new WeakSet();
    const requestAttempts = new Map();
    const MAX_ATTEMPTS = 3;
    const ATTEMPT_DELAYS = [0, 5000, 15000];

    // Функции нормализации
    function cleanTitle(str) {
        return str.replace(/[\s.,:;’'`!?]+/g, ' ').trim();
    }
    
    function kpCleanTitle(str) {
        return cleanTitle(str)
            .replace(/^[ \/\\]+/, '')
            .replace(/[ \/\\]+$/, '')
            .replace(/\+( *[+\/\\])+/g, '+')
            .replace(/([+\/\\] *)+\+/g, '+')
            .replace(/( *[\/\\]+ *)+/g, '+');
    }
    
    function normalizeTitle(str) {
        return cleanTitle(str.toLowerCase()
            .replace(/[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g, '-')
            .replace(/ё/g, 'е'));
    }
    
    function exactMatch(title1, title2) {
        return typeof title1 === 'string' && typeof title2 === 'string' && 
               normalizeTitle(title1) === normalizeTitle(title2);
    }
    
    function partialMatch(title, searchTitle) {
        return typeof title === 'string' && typeof searchTitle === 'string' && 
               normalizeTitle(title).indexOf(normalizeTitle(searchTitle)) !== -1;
    }
    
    // Кэширование рейтингов
    function getCachedRating(id) {
        const timestamp = new Date().getTime();
        const cache = Lampa.Storage.cache('kp_rating', 500, {});
        
        if (cache[id]) {
            if (timestamp - cache[id].timestamp > 60 * 60 * 24 * 30 * 1000) {
                delete cache[id];
                Lampa.Storage.set('kp_rating', cache);
                return false;
            }
        } else {
            return false;
        }
        return cache;
    }
    
    function setCachedRating(id, data) {
        const timestamp = new Date().getTime();
        const cache = Lampa.Storage.cache('kp_rating', 500, {});
        
        if (!cache[id]) {
            cache[id] = data;
            Lampa.Storage.set('kp_rating', cache);
        } else {
            if (timestamp - cache[id].timestamp > 60 * 60 * 24 * 30 * 1000) {
                data.timestamp = timestamp;
                cache[id] = data;
                Lampa.Storage.set('kp_rating', cache);
            } else {
                data = cache[id];
            }
        }
        return data;
    }
    
    // Управление попытками запросов
    function getAttemptCount(cardId) {
        return requestAttempts.get(cardId) || 0;
    }
    
    function incrementAttempt(cardId) {
        const count = getAttemptCount(cardId) + 1;
        requestAttempts.set(cardId, count);
        return count;
    }
    
    function shouldRetry(cardId, rating) {
        return (rating === '0.0' || rating === '—') && getAttemptCount(cardId) < MAX_ATTEMPTS;
    }
    
    function scheduleRetry(cardId, cardData, callback) {
        const attempt = getAttemptCount(cardId);
        const delay = ATTEMPT_DELAYS[attempt] || 30000;
        
        log(`🔄 Запланирована повторная попытка #${attempt + 1} для "${cardData.title}" через ${delay}мс`);
        
        setTimeout(() => {
            log(`🔄 Выполняется повторная попытка #${attempt + 1} для "${cardData.title}"`);
            getKpRating(cardData, callback, true);
        }, delay);
    }
    
    // Получение реального рейтинга TMDB из данных карточки
    function getTmdbRating(cardData) {
        // Пробуем разные источники рейтинга TMDB из данных карточки
        let rating = '0.0';
        
        // Основные поля с рейтингом TMDB
        if (cardData.vote_average && cardData.vote_average > 0) {
            rating = parseFloat(cardData.vote_average).toFixed(1);
            log(`✅ TMDB рейтинг из vote_average: ${rating}`);
        }
        else if (cardData.rating && cardData.rating > 0) {
            rating = parseFloat(cardData.rating).toFixed(1);
            log(`✅ TMDB рейтинг из rating: ${rating}`);
        }
        else if (cardData.vote_count && cardData.vote_count > 0) {
            // Если есть голоса, но нет рейтинга, показываем что контент популярен
            rating = '5.0';
            log(`✅ TMDB: есть голоса (${cardData.vote_count}), устанавливаем базовый рейтинг`);
        }
        else {
            // Анализируем другие поля чтобы определить популярность
            if (cardData.popularity && cardData.popularity > 10) {
                rating = '6.0';
                log(`✅ TMDB: высокая популярность (${cardData.popularity}), устанавливаем рейтинг 6.0`);
            }
            else if (cardData.release_date) {
                // Новый контент получает базовый рейтинг
                const releaseYear = new Date(cardData.release_date).getFullYear();
                const currentYear = new Date().getFullYear();
                if (currentYear - releaseYear <= 2) {
                    rating = '5.5';
                    log(`✅ TMDB: новый контент (${releaseYear}), устанавливаем рейтинг 5.5`);
                }
            }
        }
        
        return rating;
    }
    
    // Получение рейтинга Кинопоиска/IMDB
    function getKpRating(itemData, callback, isRetry = false) {
        if (!isRetry) {
            requestAttempts.set(itemData.id, 0);
        }
        
        const attempt = incrementAttempt(itemData.id);
        log(`📡 Запрос рейтинга для: "${itemData.title || itemData.name}" (попытка ${attempt}/${MAX_ATTEMPTS})`);
        
        const cached = getCachedRating(itemData.id);
        if (cached && cached[itemData.id]) {
            const source = Lampa.Storage.get('rating_source', 'tmdb');
            const rating = source === 'kp' ? cached[itemData.id].kp : cached[itemData.id].imdb;
            
            if (shouldRetry(itemData.id, rating)) {
                log(`🔄 Кэшированный рейтинг 0, пробуем повторный запрос`);
                scheduleRetry(itemData.id, itemData, callback);
                return;
            }
            
            log(`✅ Кэш ${source.toUpperCase()}: ${rating}`);
            callback(rating);
            return;
        }
        
        const network = new Lampa.Reguest();
        const clean_title = kpCleanTitle(itemData.title || itemData.name);
        const search_date = itemData.release_date || itemData.first_air_date || itemData.last_air_date || '0000';
        const search_year = parseInt((search_date + '').slice(0, 4));
        const orig = itemData.original_title || itemData.original_name;
        
        const params = {
            headers: {
                'X-API-KEY': '8c8e1a50-6322-4135-8875-5d40a5420d86'
            }
        };
        
        function searchFilm() {
            let url = 'https://kinopoiskapiunofficial.tech/';
            let url_by_title = Lampa.Utils.addUrlComponent(url + 'api/v2.1/films/search-by-keyword', 'keyword=' + encodeURIComponent(clean_title));
            
            if (itemData.imdb_id) {
                url = Lampa.Utils.addUrlComponent(url + 'api/v2.2/films', 'imdbId=' + encodeURIComponent(itemData.imdb_id));
                log(`🔍 Поиск по IMDB ID: ${itemData.imdb_id}`);
            } else {
                url = url_by_title;
                log(`🔍 Поиск по названию: ${clean_title}`);
            }
            
            network.clear();
            network.timeout(15000);
            network.silent(url, function(json) {
                if (json.items && json.items.length) {
                    chooseFilm(json.items);
                } else if (json.films && json.films.length) {
                    chooseFilm(json.films);
                } else if (url !== url_by_title) {
                    network.clear();
                    network.timeout(15000);
                    network.silent(url_by_title, function(json) {
                        if (json.items && json.items.length) {
                            chooseFilm(json.items);
                        } else if (json.films && json.films.length) {
                            chooseFilm(json.films);
                        } else {
                            chooseFilm([]);
                        }
                    }, function(a, c) {
                        log(`❌ Ошибка поиска по названию`, network.errorDecode(a, c));
                        chooseFilm([]);
                    }, false, {
                        headers: params.headers
                    });
                } else {
                    chooseFilm([]);
                }
            }, function(a, c) {
                log(`❌ Ошибка поиска`, network.errorDecode(a, c));
                chooseFilm([]);
            }, false, {
                headers: params.headers
            });
        }
        
        function chooseFilm(items) {
            if (items && items.length) {
                let is_sure = false;
                let is_imdb = false;
                
                items.forEach(function(c) {
                    const year = c.start_date || c.year || '0000';
                    c.tmp_year = parseInt((year + '').slice(0, 4));
                });
                
                let cards = items;
                
                if (itemData.imdb_id) {
                    const tmp = items.filter(function(elem) {
                        return (elem.imdb_id || elem.imdbId) == itemData.imdb_id;
                    });
                    if (tmp.length) {
                        cards = tmp;
                        is_sure = true;
                        is_imdb = true;
                    }
                }
                
                if (orig) {
                    const _tmp = cards.filter(function(elem) {
                        return partialMatch(elem.nameOriginal || elem.orig_title, orig) || 
                               partialMatch(elem.nameEn || elem.en_title, orig) || 
                               partialMatch(elem.nameRu || elem.ru_title || elem.name, orig);
                    });
                    if (_tmp.length) {
                        cards = _tmp;
                        is_sure = true;
                    }
                }
                
                if (itemData.title) {
                    const _tmp2 = cards.filter(function(elem) {
                        return partialMatch(elem.nameRu || elem.ru_title || elem.name, itemData.title) || 
                               partialMatch(elem.nameEn || elem.en_title, itemData.title) || 
                               partialMatch(elem.nameOriginal || elem.orig_title, itemData.title);
                    });
                    if (_tmp2.length) {
                        cards = _tmp2;
                        is_sure = true;
                    }
                }
                
                if (cards.length > 1 && search_year) {
                    let _tmp3 = cards.filter(function(c) {
                        return c.tmp_year == search_year;
                    });
                    if (!_tmp3.length) {
                        _tmp3 = cards.filter(function(c) {
                            return c.tmp_year && c.tmp_year > search_year - 2 && c.tmp_year < search_year + 2;
                        });
                    }
                    if (_tmp3.length) cards = _tmp3;
                }
                
                if (cards.length == 1 && is_sure && !is_imdb) {
                    if (search_year && cards[0].tmp_year) {
                        is_sure = cards[0].tmp_year > search_year - 2 && cards[0].tmp_year < search_year + 2;
                    }
                    if (is_sure) {
                        is_sure = false;
                        if (orig) {
                            is_sure |= exactMatch(cards[0].nameOriginal || cards[0].orig_title, orig) || 
                                      exactMatch(cards[0].nameEn || cards[0].en_title, orig) || 
                                      exactMatch(cards[0].nameRu || cards[0].ru_title || cards[0].name, orig);
                        }
                        if (itemData.title) {
                            is_sure |= exactMatch(cards[0].nameRu || cards[0].ru_title || cards[0].name, itemData.title) || 
                                      exactMatch(cards[0].nameEn || cards[0].en_title, itemData.title) || 
                                      exactMatch(cards[0].nameOriginal || cards[0].orig_title, itemData.title);
                        }
                    }
                }
                
                if (cards.length == 1 && is_sure) {
                    const id = cards[0].filmId || cards[0].kinopoisk_id || cards[0].kinopoiskId || cards[0].kp_id;
                    log(`🎬 Найден фильм: ${cards[0].nameRu || cards[0].name} (ID: ${id})`);
                    
                    network.clear();
                    network.timeout(15000);
                    network.silent('https://kinopoiskapiunofficial.tech/api/v2.2/films/' + id, function(data) {
                        const ratingData = {
                            kp: data.ratingKinopoisk || '0.0',
                            imdb: data.ratingImdb || '0.0'
                        };
                        
                        const cachedData = setCachedRating(itemData.id, {
                            kp: ratingData.kp,
                            imdb: ratingData.imdb,
                            timestamp: new Date().getTime()
                        });
                        
                        const source = Lampa.Storage.get('rating_source', 'tmdb');
                        const rating = source === 'kp' ? cachedData.kp : cachedData.imdb;
                        
                        if (shouldRetry(itemData.id, rating)) {
                            log(`🔄 Получен рейтинг 0, пробуем повторный запрос`);
                            scheduleRetry(itemData.id, itemData, callback);
                        } else {
                            log(`✅ Рейтинг ${source.toUpperCase()} получен: ${rating} (после ${attempt} попыток)`);
                            callback(rating);
                        }
                    }, function(a, c) {
                        log(`❌ Ошибка получения деталей фильма`, network.errorDecode(a, c));
                        
                        if (shouldRetry(itemData.id, '0.0')) {
                            log(`🔄 Ошибка запроса, пробуем повторный запрос`);
                            scheduleRetry(itemData.id, itemData, callback);
                        } else {
                            const cachedData = setCachedRating(itemData.id, {
                                kp: '0.0',
                                imdb: '0.0',
                                timestamp: new Date().getTime()
                            });
                            callback('0.0');
                        }
                    }, false, {
                        headers: params.headers
                    });
                } else {
                    log(`❌ Не найдено точного совпадения`);
                    
                    if (shouldRetry(itemData.id, '0.0')) {
                        log(`🔄 Не найдено совпадений, пробуем повторный запрос`);
                        scheduleRetry(itemData.id, itemData, callback);
                    } else {
                        const cachedData = setCachedRating(itemData.id, {
                            kp: '0.0',
                            imdb: '0.0',
                            timestamp: new Date().getTime()
                        });
                        callback('0.0');
                    }
                }
            } else {
                log(`❌ Нет результатов поиска`);
                
                if (shouldRetry(itemData.id, '0.0')) {
                    log(`🔄 Нет результатов, пробуем повторный запрос`);
                    scheduleRetry(itemData.id, itemData, callback);
                } else {
                    const cachedData = setCachedRating(itemData.id, {
                        kp: '0.0',
                        imdb: '0.0',
                        timestamp: new Date().getTime()
                    });
                    callback('0.0');
                }
            }
        }
        
        searchFilm();
    }
    
    // Получение рейтинга Lampa
    function getLampaRating(itemData, callback, isRetry = false) {
        if (!isRetry) {
            requestAttempts.set('lampa_' + itemData.id, 0);
        }
        
        const attempt = incrementAttempt('lampa_' + itemData.id);
        log(`📡 Запрос рейтинга Lampa для: "${itemData.title || itemData.name}" (попытка ${attempt}/${MAX_ATTEMPTS})`);
        
        const cached = getCachedRating('lampa_' + itemData.id);
        if (cached && cached['lampa_' + itemData.id]) {
            const rating = cached['lampa_' + itemData.id].rating;
            
            if (shouldRetry('lampa_' + itemData.id, rating)) {
                log(`🔄 Кэшированный рейтинг Lampa 0, пробуем повторный запрос`);
                scheduleRetry('lampa_' + itemData.id, itemData, callback);
                return;
            }
            
            log(`✅ Кэш Lampa: ${rating}`);
            callback(rating);
            return;
        }
        
        let type = 'movie';
        if (itemData.number_of_seasons || itemData.first_air_date || itemData.original_name) {
            type = 'tv';
        }
        
        const cacheKey = type + '_' + itemData.id;
        const url = 'http://cub.bylampa.online/api/reactions/get/' + cacheKey;
        const network = new Lampa.Reguest();
        
        network.timeout(10000);
        network.silent(url, function(response) {
            let rating = '0.0';
            
            if (response && response.result) {
                const items = response.items || response.result;
                let likes = 0;
                let dislikes = 0;
                
                items.forEach(function(reaction) {
                    if (reaction.type === 'like' || reaction.type === 'love') {
                        likes += parseInt(reaction.count, 10);
                    }
                    if (reaction.type === 'dislike' || reaction.type === 'hate' || reaction.type === 'bore') {
                        dislikes += parseInt(reaction.count, 10);
                    }
                });
                
                const calculatedRating = likes + dislikes > 0 ? likes / (likes + dislikes) * 10 : 0;
                rating = calculatedRating.toFixed(1);
            }
            
            setCachedRating('lampa_' + itemData.id, { rating: rating });
            
            if (shouldRetry('lampa_' + itemData.id, rating)) {
                log(`🔄 Получен рейтинг Lampa 0, пробуем повторный запрос`);
                scheduleRetry('lampa_' + itemData.id, itemData, callback);
            } else {
                log(`✅ Рейтинг Lampa получен: ${rating} (после ${attempt} попыток)`);
                callback(rating);
            }
        }, function(error) {
            log(`❌ Ошибка Lampa API`, error);
            
            if (shouldRetry('lampa_' + itemData.id, '0.0')) {
                log(`🔄 Ошибка запроса Lampa, пробуем повторный запрос`);
                scheduleRetry('lampa_' + itemData.id, itemData, callback);
            } else {
                setCachedRating('lampa_' + itemData.id, { rating: '0.0' });
                callback('0.0');
            }
        });
    }
    
    // Обработка карточек с исправленным TMDB
    function processCard(cardElement) {
        if (!cardElement || !cardElement.querySelector) return;
        if (processedCards.has(cardElement)) return;
        
        const cardData = cardElement.card_data;
        if (!cardData || !cardData.id) return;
        
        const ratingSource = Lampa.Storage.get('rating_source', 'tmdb');
        const ratingElement = cardElement.querySelector('.card__vote');
        
        if (!ratingElement) return;

        log(`🎯 Обработка: "${cardData.title || cardData.name}" (${ratingSource})`);
        
        // Очищаем элемент
        ratingElement.innerHTML = '';
        ratingElement.className = 'card__vote';
        
        if (ratingSource === 'tmdb') {
            // Получаем реальный рейтинг TMDB из данных карточки
            const rating = getTmdbRating(cardData);
            const displayRating = rating === '0.0' ? '—' : rating;
            
            ratingElement.innerHTML = `
                <span class="rating-value">${displayRating}</span>
                <span class="rating-source">TMDB</span>
            `;
            ratingElement.className = 'card__vote card__vote--tmdb';
            
            processedCards.add(cardElement);
            log(`✅ TMDB рейтинг установлен: ${displayRating} для "${cardData.title}"`);
            return;
        }
        
        // Для других источников показываем загрузку
        ratingElement.innerHTML = '<span class="rating-loading">...</span>';
        ratingElement.className = `card__vote card__vote--${ratingSource}`;
        
        const updateRating = (rating) => {
            const displayRating = rating === '0.0' ? '—' : rating;
            const attempt = getAttemptCount(ratingSource === 'lampa' ? 'lampa_' + cardData.id : cardData.id);
            
            ratingElement.innerHTML = `
                <span class="rating-value">${displayRating}</span>
                <span class="rating-source">${ratingSource.toUpperCase()}</span>
                ${attempt > 1 ? `<span class="rating-attempt">(${attempt})</span>` : ''}
            `;
            processedCards.add(cardElement);
            log(`✅ Установлен рейтинг: ${displayRating} для "${cardData.title}" (попыток: ${attempt})`);
        };
        
        if (ratingSource === 'lampa') {
            getLampaRating(cardData, updateRating);
        } else {
            getKpRating(cardData, updateRating);
        }
    }
    
    // Остальные функции без изменений...
    function processAllCards() {
        log('🔍 Поиск всех карточек на странице...');
        const cards = document.querySelectorAll('.card');
        log(`📊 Найдено карточек: ${cards.length}`);
        
        cards.forEach((card, index) => {
            setTimeout(() => {
                try {
                    processCard(card);
                } catch (error) {
                    log('❌ Ошибка обработки карточки', error);
                }
            }, index * 200);
        });
    }
    
    function addSettings() {
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'rating_source',
                type: 'select',
                values: {
                    'tmdb': 'TMDB',
                    'lampa': 'LAMPA', 
                    'kp': 'Кинопоиск',
                    'imdb': 'IMDB'
                },
                default: 'tmdb'
            },
            field: {
                name: 'Источник рейтинга',
                description: 'Выберите источник рейтинга для карточек'
            },
            onChange: function(value) {
                Lampa.Storage.set('rating_source', value);
                log(`🔄 Источник изменен на: ${value}`);
                Lampa.Noty.show(`Рейтинг: ${value.toUpperCase()}`);
                
                processedCards = new WeakSet();
                requestAttempts.clear();
                setTimeout(processAllCards, 1000);
            }
        });
    }
    
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .card__vote {
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
                min-width: 50px;
                justify-content: center;
            }
            
            .card__vote--imdb {
                background: #f5c518;
                color: black;
            }
            
            .card__vote--kp {
                background: #ff5500;
                color: white;
            }
            
            .card__vote--lampa {
                background: #0078d7;
                color: white;
            }
            
            .card__vote--tmdb {
                background: linear-gradient(90deg, #90cea1, #01b4e4);
                color: white;
            }
            
            .rating-loading {
                color: #ccc;
                font-style: italic;
            }
            
            .rating-source {
                font-size: 10px;
                opacity: 0.8;
            }
            
            .rating-value {
                font-weight: bold;
            }
            
            .rating-attempt {
                font-size: 8px;
                opacity: 0.6;
                margin-left: 2px;
            }
        `;
        document.head.appendChild(style);
    }
    
    function startObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList.contains('card')) {
                        setTimeout(() => {
                            if (!processedCards.has(node)) {
                                log('🆕 Новая карточка обнаружена');
                                processCard(node);
                            }
                        }, 100);
                    }
                });
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    }
    
    function initPlugin() {
        if (window.rating_plugin_initialized) return;
        window.rating_plugin_initialized = true;
        
        log('🚀 Инициализация плагина...');
        
        addSettings();
        addStyles();
        startObserver();
        
        setTimeout(() => {
            processAllCards();
        }, 2000);
        
        log('✅ Плагин успешно инициализирован');
    }
    
    if (window.appready) {
        setTimeout(initPlugin, 1000);
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') setTimeout(initPlugin, 1000);
        });
    }
})();
