(function () {
    'use strict';

    const CACHE_TTL = 30 * 60 * 1000;
    const CLEANUP_AGE = 60 * 24 * 60 * 60 * 1000;
    const DEBOUNCE_DELAY = 1000;

    // МОДУЛЬ: КЭШ И ХРАНИЛИЩЕ МЕТАДАННЫХ
    const StorageManager = (function() {
        let memoryCache = null;
        let torrserverCache = null;
        let activeStorageKey = null;
        let syncedStorageKey = null;
        let accountReady = !!window.appready;

        function formatTime(seconds) {
            if (!seconds || seconds <= 0) return '';
            
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            
            if (h > 0) {
                return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        function getStorageKey() {
            try {
                if (accountReady && Lampa.Account && Lampa.Account.Permit && 
                    Lampa.Account.Permit.sync && Lampa.Account.Permit.account && 
                    Lampa.Account.Permit.account.profile && 
                    typeof Lampa.Account.Permit.account.profile.id !== 'undefined') {
                    return `continue_watch_params_${Lampa.Account.Permit.account.profile.id}`;
                }
            } catch (e) {
                console.error('[ContinueWatch] Failed to get profile key:', e);
            }
            return 'continue_watch_params';
        }

        function getActiveStorageKey() {
            const key = getStorageKey();
            if (activeStorageKey !== key) {
                activeStorageKey = key;
                memoryCache = null;
            }
            return key;
        }

        function ensureStorageSync() {
            const key = getActiveStorageKey();
            if (syncedStorageKey !== key) {
                try {
                    Lampa.Storage.sync(key, 'object_object');
                    syncedStorageKey = key;
                } catch (e) {
                    console.error('[ContinueWatch] Storage sync failed:', e);
                }
            }
        }

        function getParams() {
            ensureStorageSync();
            if (!memoryCache) {
                try {
                    memoryCache = Lampa.Storage.get(getActiveStorageKey(), {});
                } catch (e) {
                    console.error('[ContinueWatch] Failed to get params:', e);
                    memoryCache = {};
                }
            }
            return memoryCache;
        }

        function setParams(data, force = false) {
            ensureStorageSync();
            memoryCache = data;
            
            const key = getActiveStorageKey();
            const saveOperation = () => {
                try {
                    Lampa.Storage.set(key, data);
                } catch (e) {
                    console.error('[ContinueWatch] Failed to save params:', e);
                }
            };
            
            if (force) {
                saveOperation();
            } else {
                setTimeout(saveOperation, DEBOUNCE_DELAY);
            }
        }

        function saveStreamParams(hash, data) {
            if (!hash || !data) return false;
            
            const params = getParams();
            if (!params[hash]) {
                params[hash] = {};
            }
            
            let changed = false;
            const oldData = params[hash];
            
            for (const key in data) {
                if (oldData[key] !== data[key]) {
                    oldData[key] = data[key];
                    changed = true;
                }
            }
            
            oldData.timestamp = Date.now();
            
            if (changed || !oldData.original_timestamp) {
                oldData.original_timestamp = oldData.timestamp;
                setParams(params, true);
                console.log(`[ContinueWatch] Сохранены метаданные для хэша: ${hash}, серия: S${data.season || 0}E${data.episode || 0}`);
                return true;
            }
            
            return false;
        }

        function getTorrServerUrl() {
            if (!torrserverCache) {
                try {
                    const url = Lampa.Storage.get('torrserver_url');
                    const url_two = Lampa.Storage.get('torrserver_url_two');
                    const use_two = Lampa.Storage.field('torrserver_use_link') === 'two';
                    
                    let final_url = use_two ? (url_two || url) : (url || url_two);
                    
                    if (final_url) {
                        if (!final_url.match(/^https?:\/\//)) {
                            final_url = 'http://' + final_url;
                        }
                        final_url = final_url.replace(/\/$/, '');
                        
                        try {
                            new URL(final_url);
                        } catch (e) {
                            console.error('[ContinueWatch] Invalid TorrServer URL:', final_url);
                            return null;
                        }
                    }
                    
                    torrserverCache = final_url || null;
                } catch (e) {
                    console.error('[ContinueWatch] Failed to get TorrServer URL:', e);
                    torrserverCache = null;
                }
            }
            return torrserverCache;
        }

        function buildStreamUrl(params) {
            if (!params || !params.file_name || !params.torrent_link) {
                console.error('[ContinueWatch] Missing params for stream URL:', params);
                return null;
            }
            
            const server_url = getTorrServerUrl();
            if (!server_url) {
                Lampa.Noty.show('TorrServer не настроен');
                return null;
            }
            
            const encodedFile = encodeURIComponent(params.file_name);
            const encodedLink = encodeURIComponent(params.torrent_link);
            const index = params.file_index || 0;
            
            return `${server_url}/stream/${encodedFile}?link=${encodedLink}&index=${index}&play`;
        }

        function getStreamParams(movie) {
            if (!movie) return null;
            
            const originalTitle = movie.original_name || movie.original_title;
            if (!originalTitle) return null;
            
            const params = getParams();
            const movieId = movie.id || movie.movie_id;
            
            console.log('[ContinueWatch] Поиск параметров для:', {
                originalTitle: originalTitle,
                movieId: movieId,
                totalParams: Object.keys(params).length
            });
            
            if (movie.number_of_seasons) {
                let episodes = Object.values(params)
                    .filter(p => {
                        const sameTitle = p.original_title === originalTitle;
                        const sameId = !movieId || !p.movie_id || p.movie_id === movieId;
                        return sameTitle && sameId && p.season && p.episode;
                    })
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                
                console.log('[ContinueWatch] Найдены эпизоды:', episodes.map(e => `S${e.season}E${e.episode} (${e.timestamp})`));
                
                return episodes[0] || null;
            } 
            else {
                const hash = Lampa.Utils.hash(originalTitle);
                return params[hash] || null;
            }
        }

        function generateTimelineHash(movie, season, episode) {
            if (movie.number_of_seasons && season && episode) {
                const separator = season > 10 ? ':' : '';
                const originalTitle = movie.original_name || movie.original_title;
                return Lampa.Utils.hash([season, separator, episode, originalTitle].join(''));
            }
            
            const originalTitle = movie.original_name || movie.original_title;
            return Lampa.Utils.hash(originalTitle);
        }

        function extractSeasonEpisode(data) {
            // Сначала пытаемся получить из явных полей
            if (data.season !== undefined && data.episode !== undefined) {
                return { season: data.season, episode: data.episode };
            }
            
            // Пытаемся извлечь из path_human
            if (data.path_human) {
                const match = data.path_human.match(/S(\d{1,2})E(\d{1,2})/i);
                if (match) {
                    return { 
                        season: parseInt(match[1]), 
                        episode: parseInt(match[2]) 
                    };
                }
            }
            
            // Пытаемся извлечь из path
            if (data.path) {
                const match = data.path.match(/S(\d{1,2})E(\d{1,2})/i);
                if (match) {
                    return { 
                        season: parseInt(match[1]), 
                        episode: parseInt(match[2]) 
                    };
                }
            }
            
            return { season: 0, episode: 0 };
        }

        return {
            getParams,
            saveStreamParams,
            getStreamParams,
            buildStreamUrl,
            formatTime,
            getTorrServerUrl,
            generateTimelineHash,
            extractSeasonEpisode,
            ensureStorageSync,
            
            setAccountReady: function(ready) {
                accountReady = ready;
            }
        };
    })();

    // МОДУЛЬ: УПРАВЛЕНИЕ ПЛЕЕРОМ И СОБЫТИЯМИ
    const PlayerManager = (function() {
        let playerStartListener = null;
        let playerChangeListener = null;
        let playerDestroyListener = null;
        let currentEpisodeHash = null;
        let listenersInitialized = false;
        let lastSavedHash = null;

        function launchPlayer(movie, params) {
            if (!movie || !params) return;
            
            const url = StorageManager.buildStreamUrl(params);
            if (!url) {
                console.error('[ContinueWatch] Failed to build stream URL for params:', params);
                return;
            }
            
            console.log('[ContinueWatch] Запускаем плеер для:', movie.title || movie.name, 'серия: S' + (params.season || 0) + 'E' + (params.episode || 0));
            
            const timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
            const timeline = Lampa.Timeline.view(timelineHash);
            
            let restoreTime = 0;
            let restorePercent = 0;
            
            if (timeline) {
                console.log(`[ContinueWatch] Используем встроенный timeline для хэша: ${timelineHash}`);
                console.log(`[ContinueWatch] Прогресс из timeline: время=${timeline.time}, процент=${timeline.percent}`);
                
                if (timeline.time > 0) {
                    restoreTime = timeline.time;
                    restorePercent = timeline.percent;
                }
            }
            
            const streamData = {
                file_name: params.file_name,
                torrent_link: params.torrent_link,
                file_index: params.file_index || 0,
                title: movie.name || movie.title,
                original_title: movie.original_name || movie.original_title,
                movie_id: movie.id || movie.movie_id,
                season: params.season || 0,
                episode: params.episode || 0,
                episode_title: params.episode_title
            };
            
            StorageManager.saveStreamParams(timelineHash, streamData);
            
            currentEpisodeHash = timelineHash;
            lastSavedHash = timelineHash;
            
            const playerData = {
                url: url,
                title: params.episode_title || params.title || movie.title,
                card: movie,
                torrent_hash: params.torrent_link,
                timeline: timeline || { hash: timelineHash, percent: restorePercent, time: restoreTime, duration: 0 },
                season: params.season,
                episode: params.episode,
                position: restoreTime > 10 ? restoreTime : -1
            };
            
            if (restoreTime > 10) {
                const timeStr = StorageManager.formatTime(restoreTime);
                Lampa.Noty.show(`⏪ Восстанавливаем: ${timeStr}`);
            }
            
            console.log('[ContinueWatch] Быстрый запуск плеера');
            
            try {
                Lampa.Player.play(playerData);
                Lampa.Player.callback(() => {
                    Lampa.Controller.toggle('content');
                });
            } catch (e) {
                console.error('[ContinueWatch] Failed to launch player:', e);
            }
        }

        function setupPlayerListeners() {
            if (listenersInitialized) {
                return;
            }
            
            console.log('[ContinueWatch] Настройка слушателей плеера...');
            
            // Слушатель старта плеера - ОСНОВНОЙ СПОСОБ ОТСЛЕЖИВАНИЯ СЕРИЙ
            playerStartListener = function(data) {
                try {
                    console.log('[ContinueWatch] Player start event:', data);
                    
                    if (data) {
                        handlePlayerStart(data);
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Player start listener error:', e);
                }
            };
            
            // Слушатель изменения плеера (для дополнительной надежности)
            playerChangeListener = function(data) {
                try {
                    console.log('[ContinueWatch] Player change event:', data);
                    
                    if (data) {
                        handlePlayerStart(data);
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Player change listener error:', e);
                }
            };
            
            // Слушатель уничтожения плеера
            playerDestroyListener = function() {
                console.log('[ContinueWatch] Player destroy event, текущий хэш:', currentEpisodeHash);
                
                if (currentEpisodeHash) {
                    try {
                        const timeline = Lampa.Timeline.view(currentEpisodeHash);
                        if (timeline && timeline.time > 0) {
                            console.log(`[ContinueWatch] Прогресс сохранен в Timeline Lampa: ${timeline.time} сек для хэша: ${currentEpisodeHash}`);
                        }
                    } catch (e) {
                        console.error('[ContinueWatch] Error checking timeline on destroy:', e);
                    }
                }
                
                currentEpisodeHash = null;
            };
            
            try {
                // Основные слушатели плеера
                if (Lampa.Player && Lampa.Player.listener) {
                    Lampa.Player.listener.follow('start', playerStartListener);
                    Lampa.Player.listener.follow('change', playerChangeListener);
                    Lampa.Player.listener.follow('destroy', playerDestroyListener);
                    console.log('[ContinueWatch] Основные слушатели плеера установлены');
                }
                
                listenersInitialized = true;
                console.log('[ContinueWatch] Слушатели событий успешно установлены');
            } catch (e) {
                console.error('[ContinueWatch] Failed to setup player listeners:', e);
            }
        }
        
        function handlePlayerStart(data) {
            try {
                console.log('[ContinueWatch] Обработка начала воспроизведения:', data);
                
                // Пытаемся получить карточку из разных источников
                let movie = data.card;
                
                if (!movie) {
                    // Пытаемся получить карточку из активности
                    const activity = Lampa.Activity.active();
                    if (activity && activity.movie) {
                        movie = activity.movie;
                        console.log('[ContinueWatch] Получена карточка из активности:', movie);
                    }
                }
                
                if (!movie) {
                    console.log('[ContinueWatch] Не удалось получить карточку, данные:', data);
                    return;
                }
                
                // Извлекаем сезон и эпизод
                const { season, episode } = StorageManager.extractSeasonEpisode(data);
                
                if (season === 0 || episode === 0) {
                    console.log('[ContinueWatch] Не удалось извлечь сезон и эпизод из данных:', data);
                    return;
                }
                
                console.log('[ContinueWatch] Извлечены сезон и эпизод:', { season, episode });
                
                // Генерируем хэш для текущей серии
                const newHash = StorageManager.generateTimelineHash(movie, season, episode);
                
                console.log('[ContinueWatch] Сгенерирован хэш:', newHash, 'Текущий хэш:', currentEpisodeHash);
                
                // Проверяем, нужно ли сохранять
                if (newHash === lastSavedHash) {
                    console.log('[ContinueWatch] Хэш уже был сохранен, пропускаем:', newHash);
                    return;
                }
                
                // Извлекаем имя файла из URL или path
                let fileName = '';
                let torrentLink = data.torrent_hash || '';
                
                if (data.url) {
                    const match = data.url.match(/\/stream\/([^?]+)/);
                    if (match) {
                        fileName = decodeURIComponent(match[1]);
                    }
                }
                
                if (!fileName && data.path) {
                    fileName = data.path.split('/').pop() || data.path;
                }
                
                if (!fileName && data.file_name) {
                    fileName = data.file_name;
                }
                
                // Если всё еще нет имени файла, используем путь
                if (!fileName && data.path) {
                    fileName = data.path;
                }
                
                // Сохраняем метаданные для новой серии
                const streamData = {
                    file_name: fileName,
                    torrent_link: torrentLink,
                    file_index: data.id || 0,
                    title: data.title || movie.name || movie.title,
                    original_title: movie.original_name || movie.original_title,
                    movie_id: movie.id || movie.movie_id,
                    season: season,
                    episode: episode,
                    episode_title: data.episode_title || data.title
                };
                
                // Сохраняем метаданные
                const saved = StorageManager.saveStreamParams(newHash, streamData);
                
                if (saved) {
                    // Обновляем текущий хэш
                    currentEpisodeHash = newHash;
                    lastSavedHash = newHash;
                    
                    console.log(`[ContinueWatch] Сохранены метаданные для: S${season}E${episode}, хэш: ${newHash}`);
                    
                    // Получаем timeline для информации
                    const timeline = Lampa.Timeline.view(newHash);
                    if (timeline) {
                        console.log(`[ContinueWatch] Timeline прогресс для серии: время=${timeline.time}, процент=${timeline.percent}`);
                    }
                }
            } catch (e) {
                console.error('[ContinueWatch] Player start handler error:', e);
            }
        }
        
        function cleanupPlayerListeners() {
            try {
                // Удаляем основные слушатели плеера
                if (playerStartListener && Lampa.Player && Lampa.Player.listener) {
                    try {
                        Lampa.Player.listener.remove('start', playerStartListener);
                    } catch (e) {}
                }
                
                if (playerChangeListener && Lampa.Player && Lampa.Player.listener) {
                    try {
                        Lampa.Player.listener.remove('change', playerChangeListener);
                    } catch (e) {}
                }
                
                if (playerDestroyListener && Lampa.Player && Lampa.Player.listener) {
                    try {
                        Lampa.Player.listener.remove('destroy', playerDestroyListener);
                    } catch (e) {}
                }
                
                // Сбрасываем все ссылки
                playerStartListener = null;
                playerChangeListener = null;
                playerDestroyListener = null;
                
                listenersInitialized = false;
                console.log('[ContinueWatch] Player listeners cleaned up');
            } catch (e) {
                console.error('[ContinueWatch] Failed to cleanup player listeners:', e);
            }
        }

        function patchPlayer() {
            if (Lampa.Player._continue_patched) {
                return;
            }
            
            const originalPlay = Lampa.Player.play;
            
            Lampa.Player.play = function(params) {
                try {
                    console.log('[ContinueWatch] Player.play called with params:', params);
                    
                    if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                        const movie = params.card || params.movie || 
                                    (Lampa.Activity.active() && Lampa.Activity.active().movie);
                        
                        if (movie) {
                            const timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
                            
                            const matchFile = params.url && params.url.match(/\/stream\/([^?]+)/);
                            const matchLink = params.url && params.url.match(/[?&]link=([^&]+)/);
                            const matchIndex = params.url && params.url.match(/[?&]index=(\d+)/);
                            
                            if (matchFile && matchLink) {
                                const streamData = {
                                    file_name: decodeURIComponent(matchFile[1]),
                                    torrent_link: decodeURIComponent(matchLink[1]),
                                    file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                    title: movie.name || movie.title,
                                    original_title: movie.original_name || movie.original_title,
                                    movie_id: movie.id || movie.movie_id,
                                    season: params.season,
                                    episode: params.episode,
                                    episode_title: params.title || params.episode_title
                                };
                                
                                StorageManager.saveStreamParams(timelineHash, streamData);
                                lastSavedHash = timelineHash;
                                console.log(`[ContinueWatch] Сохранены метаданные для: S${params.season}E${params.episode}, хэш: ${timelineHash}`);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Player patch error:', e);
                }
                
                return originalPlay.call(this, params);
            };
            
            Lampa.Player._continue_patched = true;
            console.log('[ContinueWatch] Player patched successfully');
        }
        
        return {
            launchPlayer,
            patchPlayer,
            setupPlayerListeners,
            cleanupPlayerListeners
        };
    })();

    // МОДУЛЬ: UI И КНОПКА
    const UIManager = (function() {
        let debounceTimer = null;
        
        function handleContinueClick(movieData, buttonElement) {
            if (debounceTimer) return;
            
            const params = StorageManager.getStreamParams(movieData);
            if (!params) {
                Lampa.Noty.show('Нет истории просмотров');
                return;
            }
            
            console.log('[ContinueWatch] Параметры для продолжения:', params);
            
            if (buttonElement) {
                $(buttonElement).css('opacity', 0.5);
            }
            
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                if (buttonElement) {
                    $(buttonElement).css('opacity', 1);
                }
            }, DEBOUNCE_DELAY);
            
            console.log(`[ContinueWatch] 🚀 Нажата кнопка "Продолжить" для: ${movieData.title || movieData.name}, серия: S${params.season}E${params.episode}`);
            
            PlayerManager.launchPlayer(movieData, params);
        }
        
        function createContinueButton(movie, params) {
            const timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
            const timeline = Lampa.Timeline.view(timelineHash);
            
            let percent = 0;
            let timeStr = "";
            
            if (timeline && timeline.percent > 0) {
                percent = timeline.percent;
                timeStr = StorageManager.formatTime(timeline.time);
                console.log(`[ContinueWatch] Используем Timeline Lampa для кнопки: ${percent}%, ${timeStr}, серия: S${params.season}E${params.episode}`);
            }
            
            let labelText = '▶️ Продолжить';
            if (params.season && params.episode) {
                labelText += ` S${params.season} E${params.episode}`;
            }
            if (timeStr) {
                labelText += ` <span style="opacity:0.7;font-size:0.9em">(${timeStr})</span>`;
            }
            
            const dashArray = (percent * 65.97 / 100).toFixed(2);
            
            const buttonHtml = `
                <div class="full-start__button selector button--continue-watch" style="margin-top: 0.5em; position: relative;">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" style="margin-right: 0.5em">
                        <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
                        <circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" 
                            stroke-dasharray="${dashArray} 65.97" transform="rotate(-90 12 12)" style="opacity: 0.5"/>
                    </svg>
                    <div>${labelText}</div>
                </div>
            `;
            
            return $(buttonHtml);
        }
        
        function setupContinueButton() {
            Lampa.Listener.follow('full', function (e) {
                if (e.type === 'complite') {
                    requestAnimationFrame(() => {
                        const activity = e.object.activity;
                        const render = activity.render();
                        
                        if (render.find('.button--continue-watch').length) {
                            return;
                        }
                        
                        const params = StorageManager.getStreamParams(e.data.movie);
                        if (!params) {
                            return;
                        }
                        
                        console.log(`[ContinueWatch] 📍 Отображаем кнопку для: ${e.data.movie.title || e.data.movie.name}, серия: S${params.season}E${params.episode}`);
                        
                        const continueBtn = createContinueButton(e.data.movie, params);
                        continueBtn.on('hover:enter', function () {
                            handleContinueClick(e.data.movie, this);
                        });
                        
                        const torrentBtn = render.find('.view--torrent').last();
                        const buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();
                        
                        if (torrentBtn.length) {
                            torrentBtn.after(continueBtn);
                        } else if (buttonsContainer.length) {
                            buttonsContainer.append(continueBtn);
                        } else {
                            render.find('.full-start__button').last().after(continueBtn);
                        }
                    });
                }
            });
        }
        
        return {
            setupContinueButton,
            handleContinueClick
        };
    })();

    // МОДУЛЬ: ИНИЦИАЛИЗАЦИЯ
    const InitializationManager = (function() {
        function initialize() {
            try {
                console.log('[ContinueWatch] Начало инициализации плагина...');
                
                StorageManager.ensureStorageSync();
                PlayerManager.patchPlayer();
                PlayerManager.setupPlayerListeners();
                UIManager.setupContinueButton();
                
                // Очистка старых параметров
                setTimeout(() => {
                    try {
                        const params = StorageManager.getParams();
                        const now = Date.now();
                        let changed = false;
                        
                        Object.keys(params).forEach(hash => {
                            if (params[hash].timestamp && now - params[hash].timestamp > CLEANUP_AGE) {
                                delete params[hash];
                                changed = true;
                            }
                        });
                        
                        if (changed) {
                            StorageManager.setParams(params);
                            console.log('[ContinueWatch] Cleaned up old params');
                        }
                    } catch (e) {
                        console.error('[ContinueWatch] Cleanup failed:', e);
                    }
                }, 10000);
                
                console.log('[ContinueWatch] v95 Loaded. Fixed card extraction and hash tracking.');
                console.log('[ContinueWatch] Исправлено получение карточки и отслеживание хэша.');
                
            } catch (e) {
                console.error('[ContinueWatch] Initialization failed:', e);
            }
        }
        
        function setupAppListener() {
            Lampa.Listener.follow('app', (e) => {
                if (e.type === 'ready') {
                    StorageManager.setAccountReady(true);
                    StorageManager.ensureStorageSync();
                }
            });
        }
        
        return {
            initialize,
            setupAppListener
        };
    })();

    // ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ
    if (window.appready) {
        InitializationManager.initialize();
    } else {
        InitializationManager.setupAppListener();
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') {
                InitializationManager.initialize();
            }
        });
    }
})();
