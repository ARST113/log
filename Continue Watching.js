(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР"');
        console.log('[ContinueWatch] Версия: 1.5 Final');
        console.log('[ContinueWatch] Платформа:', Lampa.Platform.is('android') ? 'Android' : 'Web');
        console.log('[ContinueWatch] ========================================');

        var STORAGE_KEY = 'continue_watch_urls';
        var DEBUG_LOG_KEY = 'continue_watch_debug_log';
        var currentHash = null;
        var debugLog = [];

        // ========== ЛОГИРОВАНИЕ ==========
        
        function addDebugLog(message, data) {
            var timestamp = new Date().toISOString();
            var logEntry = {
                time: timestamp,
                message: message,
                data: data
            };
            
            debugLog.push(logEntry);
            console.log('[ContinueWatch]', message, data || '');
            
            if (debugLog.length > 50) {
                debugLog = debugLog.slice(-50);
            }
            
            try {
                localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(debugLog));
            } catch(e) {}
        }

        // ========== УТИЛИТЫ ==========
        
        function formatTime(seconds) {
            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);
            if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        function getStoredUrls() {
            try {
                var data = localStorage.getItem(STORAGE_KEY);
                return data ? JSON.parse(data) : {};
            } catch(e) {
                addDebugLog('❌ Ошибка чтения localStorage', e.message);
                return {};
            }
        }

        function saveUrl(hash, data) {
            try {
                var urls = getStoredUrls();
                urls[hash] = data;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
                addDebugLog('✓ URL сохранен', { hash: hash, title: data.title });
            } catch(e) {
                addDebugLog('❌ Ошибка сохранения URL', e.message);
            }
        }

        // ========== СОЗДАНИЕ КНОПКИ НА КАРТОЧКЕ ==========
        
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
            
            addDebugLog('📄 Обработка карточки');
            
            var movie = e.data.movie;
            var title = movie.original_title || movie.original_name;
            
            if (!title) {
                addDebugLog('⚠️ Название не найдено');
                return;
            }
            
            addDebugLog('📄 Название', title);
            
            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);
            
            addDebugLog('📊 Timeline', {
                hash: hash,
                percent: view.percent,
                time: Math.floor(view.time || 0)
            });
            
            // Для сериалов
            if (movie.number_of_seasons) {
                var last = Lampa.Storage.get('online_watched_last', '{}');
                var filed = last[Lampa.Utils.hash(title)];
                
                if (filed && filed.season && filed.episode) {
                    hash = Lampa.Utils.hash([filed.season, filed.season > 10 ? ':' : '', filed.episode, title].join(''));
                    view = Lampa.Timeline.view(hash);
                    addDebugLog('📺 Сериал', {
                        season: filed.season,
                        episode: filed.episode,
                        percent: view.percent
                    });
                }
            }
            
            // Проверяем прогресс
            if (!view.percent || view.percent < 5 || view.percent > 95) {
                addDebugLog('⚠️ Прогресс не подходит', view.percent + '%');
                return;
            }
            
            var percent = view.percent;
            var timeStr = formatTime(view.time);
            var urls = getStoredUrls();
            var savedUrl = urls[hash];
            
            addDebugLog('🔍 URL найден?', Boolean(savedUrl));
            
            // Создаем кнопку
            var button = $('<div class="full-start__button selector button--continue-watch" style="position: relative;">' +
                '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
                    '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +
                    '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" ' +
                        'stroke-dasharray="' + (percent * 65.97 / 100).toFixed(2) + ' 65.97" transform="rotate(-90 12 12)"/>' +
                '</svg>' +
                '<span>Продолжить ' + percent + '%</span>' +
                '<div style="position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); font-size: 10px; opacity: 0.7;">' +
                    timeStr +
                '</div>' +
            '</div>');
            
            // ========== ОБРАБОТЧИК КЛИКА ==========
            button.on('hover:enter', function() {
                addDebugLog('🎬 Кнопка нажата');
                
                if (savedUrl) {
                    addDebugLog('✓ URL найден', savedUrl.url.substring(0, 50) + '...');
                    
                    var playerSetting = Lampa.Storage.field('player');
                    addDebugLog('🎮 Настройка плеера', playerSetting);
                    
                    var playerData = {
                        url: savedUrl.url,
                        title: savedUrl.title,
                        timeline: view,
                        card: movie
                    };
                    
                    try {
                        // ========== ANDROID ВНЕШНИЙ ПЛЕЕР ==========
                        if (Lampa.Platform.is('android') && playerSetting === 'android') {
                            addDebugLog('📱 Запуск через Android внешний плеер');
                            
                            // Отключаем рекламу
                            var originalPrerollShow = null;
                            if (typeof Lampa.Preroll !== 'undefined' && Lampa.Preroll.show) {
                                originalPrerollShow = Lampa.Preroll.show;
                                Lampa.Preroll.show = function(data, callback) {
                                    addDebugLog('🚫 Реклама пропущена');
                                    if (callback) callback();
                                };
                            }
                            
                            // Добавляем позицию для продолжения
                            playerData.position = view.time || -1;
                            
                            // Запускаем через Android.openPlayer
                            Lampa.Android.openPlayer(savedUrl.url, playerData);
                            
                            addDebugLog('✅ Android плеер запущен');
                            
                            if (originalPrerollShow) {
                                setTimeout(function() {
                                    Lampa.Preroll.show = originalPrerollShow;
                                }, 500);
                            }
                        }
                        // ========== WEB ИЛИ ВНУТРЕННИЙ ПЛЕЕР ==========
                        else {
                            addDebugLog('🖥️ Запуск через Player.play');
                            
                            // Отключаем рекламу
                            var originalPrerollShow = null;
                            if (typeof Lampa.Preroll !== 'undefined' && Lampa.Preroll.show) {
                                originalPrerollShow = Lampa.Preroll.show;
                                Lampa.Preroll.show = function(data, callback) {
                                    addDebugLog('🚫 Реклама пропущена');
                                    if (callback) callback();
                                };
                            }
                            
                            Lampa.Player.play(playerData);
                            addDebugLog('✅ Плеер запущен');
                            
                            if (originalPrerollShow) {
                                setTimeout(function() {
                                    Lampa.Preroll.show = originalPrerollShow;
                                }, 500);
                            }
                        }
                    } catch(err) {
                        addDebugLog('❌ Ошибка запуска', err.message);
                        Lampa.Noty.show('Ошибка: ' + err.message);
                    }
                } else {
                    addDebugLog('⚠️ URL не найден, запуск torrents');
                    Lampa.Activity.push({
                        url: '',
                        title: movie.title || movie.name,
                        component: 'torrents',
                        movie: movie,
                        page: 1
                    });
                }
            });
            
            // Добавляем кнопку
            var container = e.object.activity.render().find('.full-start-new__buttons');
            
            if (container.length) {
                container.prepend(button);
                addDebugLog('✅ Кнопка добавлена');
            } else {
                addDebugLog('⚠️ Контейнер не найден');
            }
        });
        
        // ========== ПЕРЕХВАТ ANDROID.OPENPLAYER ==========
        
        if (Lampa.Platform.is('android') && typeof Lampa.Android !== 'undefined') {
            addDebugLog('🤖 Android обнаружен');
            
            var originalOpenPlayer = Lampa.Android.openPlayer;
            
            Lampa.Android.openPlayer = function(link, data) {
                addDebugLog('📱 Android.openPlayer перехват', {
                    hasLink: Boolean(link),
                    hasTimeline: Boolean(data && data.timeline)
                });
                
                // Сохраняем URL
                if (data && data.timeline && data.timeline.hash) {
                    var hash = data.timeline.hash;
                    currentHash = hash;
                    
                    saveUrl(hash, {
                        url: link,
                        title: data.title || 'Unknown',
                        season: data.season,
                        episode: data.episode,
                        timestamp: Date.now()
                    });
                }
                
                // Сохраняем плейлист
                if (data && data.playlist && Array.isArray(data.playlist)) {
                    addDebugLog('📋 Плейлист', { items: data.playlist.length });
                    
                    data.playlist.forEach(function(elem) {
                        if (elem.timeline && elem.timeline.hash && elem.url) {
                            saveUrl(elem.timeline.hash, {
                                url: elem.url,
                                title: elem.title || 'Unknown',
                                season: elem.season,
                                episode: elem.episode,
                                timestamp: Date.now()
                            });
                        }
                    });
                }
                
                return originalOpenPlayer.call(this, link, data);
            };
            
            addDebugLog('✅ Android.openPlayer установлен');
        }
        
        // ========== ПЕРЕХВАТ PLAYER.PLAY (WEB) ==========
        
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function(data) {
            addDebugLog('📺 Player.play перехват');
            
            if (data) {
                var url = data.url || data.stream || data.file;
                var title = data.title || data.name || data.fname || data.original_title;
                
                if (url && title) {
                    var hash = null;
                    
                    if (data.timeline && data.timeline.hash) {
                        hash = data.timeline.hash;
                    } else if (data.card && (data.card.original_title || data.card.original_name)) {
                        hash = Lampa.Utils.hash(data.card.original_title || data.card.original_name);
                    } else {
                        hash = Lampa.Utils.hash(title);
                    }
                    
                    if (hash) {
                        currentHash = hash;
                        
                        saveUrl(hash, {
                            url: url,
                            title: title,
                            season: data.season,
                            episode: data.episode,
                            timestamp: Date.now()
                        });
                    }
                }
            }
            
            return originalPlay.call(this, data);
        };
        
        // ========== АВТОСОХРАНЕНИЕ ПРОГРЕССА (WEB) ==========
        
        Lampa.Player.listener.follow('timeupdate', function(e) {
            if (!currentHash) return;
            
            var video = document.querySelector('video');
            if (!video) return;
            
            var time = video.currentTime;
            var duration = video.duration;
            
            if (!time || !duration || duration === 0) return;
            
            if (Math.floor(time) % 10 === 0 && Math.floor(time) !== Math.floor(video.lastSavedTime || 0)) {
                video.lastSavedTime = time;
                
                var percent = Math.round((time / duration) * 100);
                
                Lampa.Timeline.update({
                    hash: currentHash,
                    percent: percent,
                    time: time,
                    duration: duration
                });
                
                addDebugLog('💾 Автосохранение', {
                    time: Math.floor(time),
                    percent: percent
                });
            }
        });

        Lampa.Player.listener.follow('destroy', function() {
            if (!currentHash) return;
            
            var video = document.querySelector('video');
            if (video && video.currentTime && video.duration) {
                Lampa.Timeline.update({
                    hash: currentHash,
                    percent: Math.round((video.currentTime / video.duration) * 100),
                    time: video.currentTime,
                    duration: video.duration
                });
                addDebugLog('💾 Финальное сохранение', {
                    time: Math.floor(video.currentTime),
                    percent: Math.round((video.currentTime / video.duration) * 100)
                });
            }
            currentHash = null;
        });

        // ========== КОНСОЛЬНЫЕ КОМАНДЫ ==========
        
        window.continueWatchDebug = function() {
            var urls = getStoredUrls();
            console.log('==========================================');
            console.log('CONTINUE WATCH DEBUG');
            console.log('==========================================');
            console.log('Платформа:', Lampa.Platform.is('android') ? 'Android' : 'Web');
            console.log('Настройка плеера:', Lampa.Storage.field('player'));
            console.log('Текущий hash:', currentHash || 'не установлен');
            console.log('Сохранено URLs:', Object.keys(urls).length);
            console.log('------------------------------------------');
            
            Object.keys(urls).forEach(function(hash) {
                var data = urls[hash];
                var view = Lampa.Timeline.view(hash);
                console.log('Hash:', hash);
                console.log('  Название:', data.title);
                console.log('  URL:', data.url.substring(0, 80) + '...');
                console.log('  Timeline:', view.percent + '%, ' + Math.floor(view.time) + ' сек');
                console.log('  Сохранено:', new Date(data.timestamp).toLocaleString('ru-RU'));
                console.log('------------------------------------------');
            });
            
            console.log('ПОСЛЕДНИЕ 20 ЛОГОВ:');
            debugLog.slice(-20).forEach(function(log) {
                console.log(log.time.substring(11, 19), log.message, log.data || '');
            });
            console.log('==========================================');
            
            return {
                platform: Lampa.Platform.is('android') ? 'Android' : 'Web',
                playerSetting: Lampa.Storage.field('player'),
                currentHash: currentHash,
                urls: urls,
                debugLog: debugLog,
                totalSaved: Object.keys(urls).length
            };
        };
        
        window.continueWatchClear = function() {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(DEBUG_LOG_KEY);
            debugLog = [];
            addDebugLog('✓ Все данные удалены');
            console.log('[ContinueWatch] ✓ Все данные удалены');
        };

        addDebugLog('✅ ПЛАГИН ГОТОВ');
        addDebugLog('Команды: continueWatchDebug(), continueWatchClear()');
        
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ✅ ГОТОВ К РАБОТЕ');
        console.log('[ContinueWatch] Команды отладки:');
        console.log('[ContinueWatch]   - continueWatchDebug()');
        console.log('[ContinueWatch]   - continueWatchClear()');
        console.log('[ContinueWatch] ========================================');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) { if (e.type == 'ready') startPlugin(); });
})();
