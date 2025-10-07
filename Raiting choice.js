(function() {
    'use strict';
    
    Lampa.Platform.tv();
    
    // Основные функции плагина рейтингов
    function normalizeText(text) {
        return text.replace(/[\s.,:;''`!?]+/g, ' ').trim();
    }
    
    function prepareSearchQuery(query) {
        return normalizeText(query)
            .replace(/^[ \/\\]+/, '')
            .replace(/[ \/\\]+$/, '')
            .replace(/\+( *[+\/\\])+/g, '+')
            .replace(/([+\/\\] *)+\+/g, '+')
            .replace(/( *[\/\\]+ *)+/g, '+');
    }
    
    function normalizeTitle(title) {
        return normalizeText(title.toLowerCase()
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
    function getCachedKpRating(id) {
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
    
    function setCachedKpRating(id, data) {
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
    
    // Получение рейтинга Кинопоиска/IMDB
    function getKpRating(itemData, callback) {
        const cached = getCachedKpRating(itemData.id);
        
        if (cached && cached[itemData.id]) {
            const source = Lampa.Storage.get('rating_source', 'tmdb');
            const rating = source === 'kp' ? cached[itemData.id].kp : cached[itemData.id].imdb;
            callback(rating ? parseFloat(rating).toFixed(1) : '0.0');
            return;
        }
        
        const request = new Lampa.Request();
        const searchQuery = prepareSearchQuery(itemData.title || itemData.name);
        const releaseYear = itemData.release_date || itemData.first_air_date || itemData.first_release_date || '0000';
        const year = parseInt((releaseYear + '').substring(0, 4));
        const originalTitle = itemData.original_title || itemData.original_name;
        
        // ЗАМЕНИТЕ API КЛЮЧ НА СВОЙ!
        const apiConfig = {
            url: 'https://kinopoiskapiunofficial.tech/',
            headers: {
                'X-API-KEY': 'ВАШ_API_КЛЮЧ' // Получите на kinopoiskapiunofficial.tech
            }
        };
        
        function performSearch() {
            let searchUrl = apiConfig.url;
            let constructedUrl = Lampa.Utils.addUrlParam(searchUrl + 'api/v2.1/films/search-by-keyword', 
                'keyword=' + encodeURIComponent(searchQuery));
            
            if (itemData.imdb_id) {
                searchUrl = Lampa.Utils.addUrlParam(searchUrl + 'api/v2.2/films', 
                    'imdbId=' + encodeURIComponent(itemData.imdb_id));
            } else {
                searchUrl = constructedUrl;
            }
            
            request.clear();
            request.timeout(15000);
            request.silent(searchUrl, function(response) {
                if (response.films && response.films.length) {
                    processSearchResults(response.films);
                } else if (response.items && response.items.length) {
                    processSearchResults(response.items);
                } else {
                    processSearchResults([]);
                }
            }, function() {
                callback('0.0');
            }, true, {
                headers: apiConfig.headers
            });
        }
        
        function processSearchResults(results) {
            if (!results || !results.length) {
                const cachedData = setCachedKpRating(itemData.id, {
                    kp: 0,
                    imdb: 0,
                    timestamp: new Date().getTime()
                });
                callback('0.0');
                return;
            }
            
            // Добавляем временное поле года
            results.forEach(function(item) {
                const itemYear = item.start_date || item.year || '0000';
                item.tmp_year = parseInt((itemYear + '').substring(0, 4));
            });
            
            let filteredResults = results;
            
            // Фильтрация по оригинальному названию
            if (originalTitle) {
                const titleFiltered = filteredResults.filter(function(item) {
                    return partialMatch(item.nameOriginal || item.nameEn, originalTitle) ||
                           partialMatch(item.en_title || item.nameEn, originalTitle) ||
                           partialMatch(item.nameRu || item.ru_title || item.name, originalTitle);
                });
                
                if (titleFiltered.length) {
                    filteredResults = titleFiltered;
                }
            }
            
            // Фильтрация по году
            if (filteredResults.length > 1 && year) {
                let yearFiltered = filteredResults.filter(function(item) {
                    return item.tmp_year == year;
                });
                
                if (!yearFiltered.length) {
                    yearFiltered = filteredResults.filter(function(item) {
                        return item.tmp_year && item.tmp_year > year - 2 && item.tmp_year < year + 2;
                    });
                }
                
                if (yearFiltered.length) {
                    filteredResults = yearFiltered;
                }
            }
            
            if (filteredResults.length >= 1) {
                const filmId = filteredResults[0].filmId || filteredResults[0].kinopoisk_id || filteredResults[0].id;
                
                if (filmId) {
                    request.clear();
                    request.timeout(15000);
                    request.silent(apiConfig.url + 'api/v2.2/films/' + filmId, function(filmData) {
                        const cachedData = setCachedKpRating(itemData.id, {
                            kp: filmData.ratingKinopoisk || 0,
                            imdb: filmData.ratingImdb || 0,
                            timestamp: new Date().getTime()
                        });
                        
                        const source = Lampa.Storage.get('rating_source', 'tmdb');
                        const rating = source === 'kp' ? cachedData.kp : cachedData.imdb;
                        callback(rating ? parseFloat(rating).toFixed(1) : '0.0');
                    }, function() {
                        callback('0.0');
                    }, true, {
                        headers: apiConfig.headers
                    });
                } else {
                    callback('0.0');
                }
            } else {
                callback('0.0');
            }
        }
        
        performSearch();
    }
    
    // Обработка карточек
    const processedCards = new WeakSet();
    
    function processCard(card) {
        const cardElement = card.object || card;
        
        if (!cardElement || !cardElement.querySelector) return;
        if (processedCards.has(cardElement)) return;
        
        processedCards.add(cardElement);
        
        const cardData = cardElement.card_data || card.data || {};
        if (!cardData.id) return;
        
        const ratingSource = Lampa.Storage.get('rating_source', 'tmdb');
        const ratingElement = cardElement.querySelector('.card__vote');
        
        if (!ratingElement) return;
        
        ratingElement.className = 'card__vote rate--' + ratingSource;
        
        if (ratingSource === 'tmdb') {
            // Оставляем оригинальный TMDB рейтинг
            return;
        }
        
        // Для KP и IMDB очищаем и показываем загрузку
        ratingElement.innerHTML = '...';
        
        if (ratingSource === 'kp' || ratingSource === 'imdb') {
            getKpRating(cardData, function(rating) {
                if (ratingElement) {
                    const sourceName = ratingSource === 'kp' ? 'KP' : 'IMDB';
                    ratingElement.innerHTML = rating + '<span class="source--name">' + sourceName + '</span>';
                }
            });
        }
    }
    
    // Настройки плагина
    function addSettings() {
        Lampa.Settings.listener.add({
            component: 'main',
            param: {
                name: 'rating_source',
                type: 'select',
                values: {
                    'tmdb': 'TMDB',
                    'kp': 'Кинопоиск',
                    'imdb': 'IMDB'
                },
                default: 'tmdb'
            },
            field: {
                name: 'Источник рейтинга на карточках',
                description: 'Выберите какой рейтинг отображать на карточках'
            },
            onRender: function(item) {
                setTimeout(function() {
                    $('.settings-param > div:contains("Источник рейтинга на карточках")')
                        .parent()
                        .prepend($('<div class="settings-param__value"></div>'));
                }, 0);
            },
            onChange: function(value) {
                Lampa.Storage.set('rating_source', value);
                // Перезагружаем страницу для применения изменений
                setTimeout(function() {
                    location.reload();
                }, 500);
            }
        });
    }
    
    // Инициализация плагина
    function initPlugin() {
        // УБРАНА ПРОВЕРКА ВЕРСИИ
        if (window.plugin_rating_loaded) return;
        window.plugin_rating_loaded = true;
        
        addSettings();
        
        // Стили для отображения рейтингов
        const style = document.createElement('style');
        style.type = 'text/css';
        
        const css = `
            .card__vote {
                display: inline-block;
                align-items: center !important;
            }
            
            .card__vote .source--name {
                font-size: 10px;
                opacity: 0.7;
                margin-left: 4px;
                display: inline-block;
                height: 24px;
                line-height: 24px;
                background-repeat: no-repeat;
                background-size: contain;
                flex-shrink: 0;
            }
            
            .rate--kp .source--name {
                background-image: url("data:image/svg+xml,%3Csvg fill='%23ffcc00' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cg id='SVGRepo_bgCarrier' stroke-width='0'%3E%3C/g%3E%3Cg id='SVGRepo_tracerCarrier' stroke-linecap='round' stroke-linejoin='round'%3E%3C/g%3E%3Cg id='SVGRepo_iconCarrier'%3E%3Cpath d='M 0 7 L 0 25 L 32 25 L 32 7 Z M 2 9 L 30 9 L 30 23 L 2 23 Z M 5 11.6875 L 5 20.3125 L 7 20.3125 L 7 11.6875 Z M 8.09375 11.6875 L 8.09375 20.3125 L 10 20.3125 L 10 15.5 L 10.90625 20.3125 L 12.1875 20.3125 L 13 15.5 L 13 20.3125 L 14.8125 20.3125 L 14.8125 11.6875 L 12 11.6875 L 11.5 15.8125 L 10.8125 11.6875 Z M 15.90625 11.6875 L 15.90625 20.1875 L 18.3125 20.1875 C 19.613281 20.1875 20.101563 19.988281 20.5 19.6875 C 20.898438 19.488281 21.09375 19 21.09375 18.5 L 21.09375 13.3125 C 21.09375 12.710938 20.898438 12.199219 20.5 12 C 20 11.800781 19.8125 11.6875 18.3125 11.6875 Z M 22.09375 11.8125 L 22.09375 20.3125 L 23.90625 20.3125 C 23.90625 20.3125 23.992188 19.710938 24.09375 19.8125 C 24.292969 19.8125 25.101563 20.1875 25.5 20.1875 C 26 20.1875 26.199219 20.195313 26.5 20.09375 C 26.898438 19.894531 27 19.613281 27 19.3125 L 27 14.3125 C 27 13.613281 26.289063 13.09375 25.6875 13.09375 C 25.085938 13.09375 24.511719 13.488281 24.3125 13.6875 L 24.3125 11.8125 Z M 18 13 C 18.398438 13 18.8125 13.007813 18.8125 13.40625 L 18.8125 18.40625 C 18.8125 18.804688 18.300781 18.8125 18 18.8125 Z M 24.59375 14 C 24.695313 14 24.8125 14.105469 24.8125 14.40625 L 24.8125 18.6875 C 24.8125 18.886719 24.792969 19.09375 24.59375 19.09375 C 24.492188 19.09375 24.40625 18.988281 24.40625 18.6875 L 24.40625 14.40625 C 24.40625 14.207031 24.394531 14 24.59375 14 Z '%3E%3C/g%3E%3C/svg%3E");
            }
            
            @media (min-width: 481px) {
                .card__vote .source--name {
                    font-size: 12px;
                }
            }
            
            .rate--imdb .source--name {
                background-image: url("data:image/svg+xml,%3Csvg fill='%23f5c518' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M18.65 0L12 5.4 5.35 0C2.46 0 0 2.46 0 5.35v13.3C0 21.54 2.46 24 5.35 24L12 18.6l6.65 5.4c2.89 0 5.35-2.46 5.35-5.35V5.35C24 2.46 21.54 0 18.65 0zM12 15.12c-2.47 0-4.47-2-4.47-4.47s2-4.47 4.47-4.47 4.47 2 4.47 4.47-2 4.47-4.47 4.47z'/%3E%3C/svg%3E");
            }
        `;
        
        if (style.styleSheet) {
            style.styleSheet.cssText = css;
        } else {
            style.appendChild(document.createTextNode(css));
        }
        
        document.head.appendChild(style);
        
        // Следим за созданием карточек
        Lampa.Listener.follow('card', function(event) {
            if (event.type === 'build' && event.data.object) {
                processCard(event.data);
            }
        });
    }
    
    // Запуск плагина
    if (window.appready) {
        initPlugin();
    } else {
        Lampa.Listener.follow('app', function(event) {
            if (event.type === 'ready') {
                initPlugin();
            }
        });
    }
})();
