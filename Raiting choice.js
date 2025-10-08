(function() {
    'use strict';
    
    console.log('Загрузка плагина рейтингов...');
    
    // Два API ключа для надежности
    const API_KEYS = [
        '2a4a0808-81a3-40ae-b0d3-e11335ede616',
        '8c8e1a50-6322-4135-8875-5d40a5420d86'
    ];
    let currentApiKeyIndex = 0;
    
    // Очередь для фоновой обработки
    let processingQueue = [];
    let isProcessing = false;
    let processedCount = 0;
    let totalCards = 0;
    
    // Статистика использования API ключей
    let apiUsageStats = {
        '2a4a0808-81a3-40ae-b0d3-e11335ede616': { requests: 0, lastUsed: 0 },
        '8c8e1a50-6322-4135-8875-5d40a5420d86': { requests: 0, lastUsed: 0 }
    };
    
    // Принудительное обновление (игнорировать кэш)
    let forceRefresh = false;
    
    // WeakSet для отслеживания обработанных карточек
    const processedCards = new WeakSet();
    
    function getApiKey() {
        // Выбираем ключ который использовался давнее всего
        const now = Date.now();
        let selectedKey = API_KEYS[0];
        let minLastUsed = now;
        
        API_KEYS.forEach(key => {
            if (apiUsageStats[key].lastUsed < minLastUsed) {
                minLastUsed = apiUsageStats[key].lastUsed;
                selectedKey = key;
            }
        });
        
        // Обновляем статистику
        apiUsageStats[selectedKey].requests++;
        apiUsageStats[selectedKey].lastUsed = now;
        
        console.log(`🔑 Используется API ключ: ${selectedKey.substring(0, 8)}... (запросов: ${apiUsageStats[selectedKey].requests})`);
        return selectedKey;
    }
    
    function initPlugin() {
        if (window.rating_plugin_loaded) return;
        window.rating_plugin_loaded = true;
        
        console.log('Инициализация плагина рейтингов...');
        
        // Добавляем настройку
        Lampa.SettingsApi.addParam({
            component: 'interface',
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
                name: 'Источник рейтинга',
                description: 'Выберите источник рейтинга для карточек'
            },
            onChange: function(value) {
                console.log('🔄 Изменен источник рейтинга на:', value);
                Lampa.Storage.set('rating_source', value);
                Lampa.Noty.show(`Рейтинг изменен на: ${value.toUpperCase()}`);
                
                // При смене источника принудительно обновляем все карточки
                forceRefresh = true;
                // Очищаем очередь и сбрасываем флаги обработки
                processingQueue = [];
                startBackgroundProcessing();
            }
        });
        
        addStyles();
        startCardProcessing();
        startPeriodicCardCheck();
        
        // Запускаем фоновую обработку при старте
        setTimeout(() => {
            console.log('🚀 Автозапуск фоновой обработки...');
            startBackgroundProcessing();
        }, 5000);
        
        console.log('✅ Плагин рейтингов успешно инициализирован');
    }
    
    // Функции нормализации
    function cleanTitle(str) {
        if (!str) return '';
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
    function getCachedKpRating(id) {
        if (forceRefresh) return false;
        
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
    
    // Фоновая обработка карточек
    function startBackgroundProcessing() {
        const ratingSource = Lampa.Storage.get('rating_source', 'tmdb');
        if (ratingSource === 'tmdb') {
            console.log('ℹ️ Фоновая обработка не требуется для TMDB');
            return;
        }
        
        // Находим ВСЕ карточки на странице
        const cards = document.querySelectorAll('.card');
        totalCards = cards.length;
        
        if (totalCards === 0) {
            console.log('ℹ️ Карточки не найдены для фоновой обработки');
            return;
        }
        
        console.log(`🎯 Найдено ${totalCards} карточек для обработки`);
        
        // Добавляем карточки в очередь
        let addedToQueue = 0;
        cards.forEach(card => {
            const cardData = card.card_data || {};
            if (cardData.id && cardData.title) {
                // Проверяем, есть ли уже эта карточка в очереди
                const existsInQueue = processingQueue.some(item => item.data.id === cardData.id && !item.processed);
                const isProcessed = processedCards.has(card);
                
                // Добавляем в очередь если:
                // 1. Нет в очереди ИЛИ обработана но forceRefresh = true
                // 2. Или если рейтинг еще не получен
                if (!existsInQueue && (!isProcessed || forceRefresh)) {
                    // Удаляем старую запись если есть (при forceRefresh)
                    const existingIndex = processingQueue.findIndex(item => item.data.id === cardData.id);
                    if (existingIndex !== -1) {
                        processingQueue.splice(existingIndex, 1);
                    }
                    
                    processingQueue.push({
                        element: card,
                        data: cardData,
                        processed: false
                    });
                    addedToQueue++;
                }
            }
        });
        
        console.log(`📥 Добавлено в очередь: ${addedToQueue} карточек`);
        console.log(`📊 Всего в очереди: ${processingQueue.length} карточек`);
        
        // Если обработка не запущена, запускаем
        if (!isProcessing && processingQueue.length > 0) {
            isProcessing = true;
            processedCount = 0;
            console.log('🚀 Запуск обработки очереди...');
            processQueue();
        }
    }
    
    function processQueue() {
        if (!isProcessing) {
            console.log('⏹️ Обработка очереди остановлена');
            return;
        }
        
        if (processingQueue.length === 0) {
            isProcessing = false;
            forceRefresh = false;
            console.log(`✅ Обработка очереди завершена. Обработано: ${processedCount} карточек`);
            
            // Статистика использования API
            console.log('📊 Статистика использования API:');
            API_KEYS.forEach(key => {
                console.log(`   ${key.substring(0, 8)}...: ${apiUsageStats[key].requests} запросов`);
            });
            
            return;
        }
        
        // Находим первую необработанную карточку в очереди
        const nextIndex = processingQueue.findIndex(item => !item.processed);
        if (nextIndex === -1) {
            isProcessing = false;
            forceRefresh = false;
            console.log(`✅ Все карточки в очереди обработаны: ${processedCount} карточек`);
            return;
        }
        
        const queueItem = processingQueue[nextIndex];
        const { element, data } = queueItem;
        const ratingSource = Lampa.Storage.get('rating_source', 'tmdb');
        
        if (ratingSource === 'tmdb') {
            isProcessing = false;
            return;
        }
        
        // Помечаем как обрабатываемую
        queueItem.processed = true;
        
        // Проверяем кэш (если не принудительное обновление)
        const cached = getCachedKpRating(data.id);
        if (cached && cached[data.id] && !forceRefresh) {
            processedCount++;
            updateCardDisplay(element, data, ratingSource, cached[data.id]);
            processedCards.add(element);
            console.log(`⚡ Кэш: ${data.title} - ${cached[data.id].kp}/${cached[data.id].imdb}`);
            
            setTimeout(processQueue, 10);
            return;
        }
        
        // Получаем рейтинг для этой карточки
        console.log(`🔍 Запрос: ${data.title}`);
        getKpRating(data, ratingSource, function(rating) {
            processedCount++;
            processedCards.add(element);
            
            updateCardDisplay(element, data, ratingSource, { 
                kp: rating, 
                imdb: rating 
            });
            
            console.log(`✅ Получен рейтинг: ${data.title} - ${rating}`);
            
            if (processedCount % 3 === 0) {
                const remaining = processingQueue.filter(item => !item.processed).length;
                console.log(`📊 Прогресс: ${processedCount} обработано, ${remaining} осталось`);
            }
            
            const delay = 800 + Math.random() * 400;
            setTimeout(processQueue, delay);
        });
    }
    
    // Функция обновления отображения карточки
    function updateCardDisplay(element, data, ratingSource, ratingData) {
        const ratingElement = element.querySelector('.card__vote');
        if (!ratingElement) return;
        
        const rating = ratingSource === 'kp' ? ratingData.kp : ratingData.imdb;
        const sourceName = ratingSource === 'kp' ? 'KP' : 'IMDB';
        
        ratingElement.className = 'card__vote rate--' + ratingSource;
        ratingElement.innerHTML = `<span class="rating-value">${rating}</span><span class="source--name">${sourceName}</span>`;
    }
    
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .card__vote.rate--kp,
            .card__vote.rate--imdb {
                display: flex;
                align-items: center;
                font-size: 12px;
            }
            
            .source--name {
                font-size: 9px;
                opacity: 0.7;
                margin-left: 4px;
                padding: 1px 4px;
                background: rgba(255,255,255,0.1);
                border-radius: 3px;
                line-height: 1;
            }
            
            .rate--kp .source--name {
                color: #ffcc00;
                background: rgba(255,204,0,0.1);
            }
            
            .rate--imdb .source--name {
                color: #f5c518;
                background: rgba(245,197,24,0.1);
            }
            
            .rate--tmdb .source--name {
                color: #01d277;
                background: rgba(1,210,119,0.1);
            }
        `;
        document.head.appendChild(style);
    }
    
    // НЕМЕДЛЕННАЯ обработка карточек при создании
    function startCardProcessing() {
        Lampa.Listener.follow('card', function(event) {
            if (event.type === 'build' && event.data && event.data.object) {
                const cardElement = event.data.object;
                const cardData = cardElement.card_data || {};
                
                setTimeout(() => {
                    processCardImmediate(cardElement, cardData);
                }, 100);
            }
        });
        
        setTimeout(() => {
            updateAllCards();
        }, 2000);
    }
    
    // НЕМЕДЛЕННАЯ обработка одной карточки
    function processCardImmediate(cardElement, cardData) {
        if (!cardElement || !cardElement.querySelector) return;
        
        const ratingSource = Lampa.Storage.get('rating_source', 'tmdb');
        const ratingElement = cardElement.querySelector('.card__vote');
        
        if (!ratingElement) return;
        
        ratingElement.className = 'card__vote rate--' + ratingSource;
        
        if (ratingSource === 'tmdb') {
            const originalRating = ratingElement.textContent.replace('TMDB', '').trim();
            ratingElement.innerHTML = `${originalRating}<span class="source--name">TMDB</span>`;
            processedCards.add(cardElement);
            return;
        }
        
        // Для KP/IMDB проверяем кэш и показываем сразу если есть
        const cached = getCachedKpRating(cardData.id);
        if (cached && cached[cardData.id]) {
            const rating = ratingSource === 'kp' ? cached[cardData.id].kp : cached[cardData.id].imdb;
            const sourceName = ratingSource === 'kp' ? 'KP' : 'IMDB';
            ratingElement.innerHTML = `<span class="rating-value">${rating}</span><span class="source--name">${sourceName}</span>`;
            processedCards.add(cardElement);
        } else {
            // Если нет в кэше, показываем загрузку и добавляем в очередь
            ratingElement.innerHTML = '...';
            
            // Добавляем в очередь для фоновой обработки
            const existsInQueue = processingQueue.some(item => item.data.id === cardData.id && !item.processed);
            if (!existsInQueue) {
                processingQueue.push({
                    element: cardElement,
                    data: cardData,
                    processed: false
                });
                
                if (!isProcessing) {
                    setTimeout(() => {
                        isProcessing = true;
                        processQueue();
                    }, 1000);
                }
            }
        }
    }
    
    function updateAllCards() {
        const cards = document.querySelectorAll('.card');
        console.log('🔄 Быстрое обновление интерфейса карточек:', cards.length);
        cards.forEach((card, index) => {
            setTimeout(() => {
                if (!processedCards.has(card)) {
                    processCardImmediate(card, card.card_data || {});
                }
            }, index * 50);
        });
    }
    
    // Периодическая проверка новых карточек
    function startPeriodicCardCheck() {
        setInterval(() => {
            const ratingSource = Lampa.Storage.get('rating_source', 'tmdb');
            if (ratingSource !== 'tmdb') {
                const cards = document.querySelectorAll('.card');
                let newCards = 0;
                
                cards.forEach(card => {
                    const cardData = card.card_data || {};
                    if (cardData.id && cardData.title && !processedCards.has(card)) {
                        const existsInQueue = processingQueue.some(item => item.data.id === cardData.id);
                        if (!existsInQueue) {
                            processingQueue.push({
                                element: card,
                                data: cardData,
                                processed: false
                            });
                            newCards++;
                        }
                    }
                });
                
                if (newCards > 0 && !isProcessing) {
                    console.log(`🔄 Периодическая проверка: найдено ${newCards} новых карточек`);
                    isProcessing = true;
                    processQueue();
                }
            }
        }, 10000);
    }
    
    // Основная функция получения рейтинга
    function getKpRating(itemData, source, callback) {
        const cached = getCachedKpRating(itemData.id);
        
        if (cached && cached[itemData.id] && !forceRefresh) {
            const rating = source === 'kp' ? cached[itemData.id].kp : cached[itemData.id].imdb;
            callback(rating ? parseFloat(rating).toFixed(1) : '0.0');
            return;
        }
        
        const searchQuery = kpCleanTitle(itemData.title || itemData.name);
        const releaseYear = itemData.release_date || itemData.first_air_date || itemData.first_release_date || '0000';
        const year = parseInt((releaseYear + '').substring(0, 4));
        const originalTitle = itemData.original_title || itemData.original_name;
        
        const network = new Lampa.Reguest();
        const apiKey = getApiKey();
        
        let url = 'https://kinopoiskapiunofficial.tech/';
        let url_by_title = Lampa.Utils.addUrlComponent(url + 'api/v2.1/films/search-by-keyword', 'keyword=' + encodeURIComponent(searchQuery));
        
        if (itemData.imdb_id) {
            url = Lampa.Utils.addUrlComponent(url + 'api/v2.2/films', 'imdbId=' + encodeURIComponent(itemData.imdb_id));
        } else {
            url = url_by_title;
        }
        
        network.clear();
        network.timeout(15000);
        network.silent(url, function(response) {
            if (response.items && response.items.length) {
                processSearchResults(response.items, itemData, year, originalTitle, source, callback, network, apiKey);
            } else if (response.films && response.films.length) {
                processSearchResults(response.films, itemData, year, originalTitle, source, callback, network, apiKey);
            } else if (url !== url_by_title) {
                network.clear();
                network.timeout(15000);
                network.silent(url_by_title, function(response) {
                    if (response.items && response.items.length) {
                        processSearchResults(response.items, itemData, year, originalTitle, source, callback, network, apiKey);
                    } else if (response.films && response.films.length) {
                        processSearchResults(response.films, itemData, year, originalTitle, source, callback, network, apiKey);
                    } else {
                        const cachedData = setCachedKpRating(itemData.id, {
                            kp: 0,
                            imdb: 0,
                            timestamp: new Date().getTime()
                        });
                        callback('0.0');
                    }
                }, function(error) {
                    console.log('❌ Ошибка поиска по названию:', error);
                    const cachedData = setCachedKpRating(itemData.id, {
                        kp: 0,
                        imdb: 0,
                        timestamp: new Date().getTime()
                    });
                    callback('0.0');
                }, false, {
                    headers: {
                        'X-API-KEY': apiKey,
                        'Content-Type': 'application/json'
                    }
                });
            } else {
                const cachedData = setCachedKpRating(itemData.id, {
                    kp: 0,
                    imdb: 0,
                    timestamp: new Date().getTime()
                });
                callback('0.0');
            }
        }, function(error) {
            console.log('❌ Ошибка поиска:', error);
            const cachedData = setCachedKpRating(itemData.id, {
                kp: 0,
                imdb: 0,
                timestamp: new Date().getTime()
            });
            callback('0.0');
        }, false, {
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json'
            }
        });
    }
    
    function processSearchResults(results, itemData, year, originalTitle, source, callback, network, apiKey) {
        let filteredResults = results;
        
        results.forEach(function(item) {
            const itemYear = item.start_date || item.year || '0000';
            item.tmp_year = parseInt((itemYear + '').substring(0, 4));
        });
        
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
                const filmUrl = 'https://kinopoiskapiunofficial.tech/api/v2.2/films/' + filmId;
                
                network.clear();
                network.timeout(15000);
                network.silent(filmUrl, function(filmData) {
                    const cachedData = setCachedKpRating(itemData.id, {
                        kp: filmData.ratingKinopoisk || 0,
                        imdb: filmData.ratingImdb || 0,
                        timestamp: new Date().getTime()
                    });
                    
                    const rating = source === 'kp' ? cachedData.kp : cachedData.imdb;
                    callback(rating ? parseFloat(rating).toFixed(1) : '0.0');
                }, function(error) {
                    console.log('❌ Ошибка получения данных фильма:', error);
                    const cachedData = setCachedKpRating(itemData.id, {
                        kp: 0,
                        imdb: 0,
                        timestamp: new Date().getTime()
                    });
                    callback('0.0');
                }, false, {
                    headers: {
                        'X-API-KEY': apiKey,
                        'Content-Type': 'application/json'
                    }
                });
            } else {
                const cachedData = setCachedKpRating(itemData.id, {
                    kp: 0,
                    imdb: 0,
                    timestamp: new Date().getTime()
                });
                callback('0.0');
            }
        } else {
            const cachedData = setCachedKpRating(itemData.id, {
                kp: 0,
                imdb: 0,
                timestamp: new Date().getTime()
            });
            callback('0.0');
        }
    }
    
    // Запускаем когда Lampa готова
    if (window.appready) {
        console.log('Lampa уже готова, запускаем плагин');
        initPlugin();
    } else {
        console.log('Ожидаем готовности Lampa...');
        Lampa.Listener.follow('app', function(event) {
            if (event.type === 'ready') {
                console.log('Lampa готова!');
                setTimeout(initPlugin, 1000);
            }
        });
    }
    
})();
