(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР"');
        console.log('[ContinueWatch] Версия: 1.6 Android External Fix');
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
            if (debugLog.length > 50) debugLog = debugLog.slice(-50);
            try { localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(debugLog)); } catch(e) {}
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
            } catch(e) { addDebugLog('❌ Ошибка чтения localStorage', e.message); return {}; }
        }
        function saveUrl(hash, data) {
            try {
                var urls = getStoredUrls();
                urls[hash] = data;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
                addDebugLog('✓ URL сохранен', { hash: hash, title: data.title });
            } catch(e) { addDebugLog('❌ Ошибка сохранения URL', e.message); }
        }

        // ========== СОЗДАНИЕ КНОПКИ ==========
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
            addDebugLog('📄 Обработка карточки');
            var movie = e.data.movie;
            var title = movie.original_title || movie.original_name;
            if (!title) { addDebugLog('⚠️ Название не найдено'); return; }
            addDebugLog('📄 Название', title);

            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);

            addDebugLog('📊 Timeline', {
                hash: hash,
                percent: view.percent,
                time: Math.floor(view.time || 0)
            });

            // Для сериалов - выбираем эпизод
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

            if (!view.percent || view.percent < 5 || view.percent > 95) {
                addDebugLog('⚠️ Прогресс не подходит', view.percent + '%');
                return;
            }

            var percent = view.percent;
            var timeStr = formatTime(view.time);
            var urls = getStoredUrls();
            var savedUrl = urls[hash];

            addDebugLog('🔍 URL найден?', Boolean(savedUrl));

            // ========== КНОПКА ПРОДОЛЖИТЬ ==========
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

            // ========== ОБРАБОТЧИК КНОПКИ ==========
            button.on('hover:enter', function() {
                addDebugLog('🎬 Кнопка нажата');
                if (savedUrl) {
                    addDebugLog('✓ URL найден', savedUrl.url.substring(0, 50) + '...');

                    var playerData = {
                        url: savedUrl.url,
                        title: savedUrl.title,
                        timeline: view,
                        card: movie,
                        position: view.time || -1
                    };

                    try {
                        // ==== ANDROID ВСЕГДА через внешнее API (универсально) ====
                        if (Lampa.Platform.is('android')) {
                            addDebugLog('📱 Попытка использовать внешний API Android');

                            var playUrl = savedUrl.url.replace('&preload', '&play');
                            playerData.url = playUrl;

                            // Безопасная подмена рекламы
                            var originalPrerollShow = null;
                            if (Lampa.Preroll && Lampa.Preroll.show) {
                                originalPrerollShow = Lampa.Preroll.show;
                                Lampa.Preroll.show = function(data, callback) {
                                    addDebugLog('🚫 Реклама пропущена');
                                    if (callback) callback();
                                };
                            }

                            // Если есть Lampa.Android.openPlayer
                            if (typeof Lampa.Android !== 'undefined' && typeof Lampa.Android.openPlayer === 'function') {
                                Lampa.Android.openPlayer(playUrl, playerData);
                                addDebugLog('✅ Вызов Lampa.Android.openPlayer');
                            }
                            // Если есть Lampa.AndroidJS.openPlayer (старые версии)
                            else if (typeof Lampa.AndroidJS !== 'undefined' && typeof Lampa.AndroidJS.openPlayer === 'function') {
                                Lampa.AndroidJS.openPlayer(playUrl, JSON.stringify(playerData));
                                addDebugLog('✅ Вызов Lampa.AndroidJS.openPlayer');
                            }
                            // Очень старые/экзотические версии
                            else {
                                window.open(playUrl, '_blank');
                                addDebugLog('⚠️ Fallback: window.open');
                            }

                            if (originalPrerollShow) {
                                setTimeout(function() {
                                    Lampa.Preroll.show = originalPrerollShow;
                                    addDebugLog('✓ Preroll восстановлен');
                                }, 500);
                            }
                            return;
                        }

                        // ==== WEB или внутренний плеер ====
                        addDebugLog('🖥️ Запуск через Player.play (Web)');
                        var originalPrerollShow = null;
                        if (typeof Lampa.Preroll !== 'undefined' && Lampa.Preroll.show) {
                            originalPrerollShow = Lampa.Preroll.show;
                            Lampa.Preroll.show = function(data, callback) {
                                addDebugLog('🚫 Реклама пропущена');
                                if (callback) callback();
                            };
                        }
                        Lampa.Player.play(playerData);
                        addDebugLog('✅ Player.play вызван');
                        if (originalPrerollShow) {
                            setTimeout(function() {
                                Lampa.Preroll.show = originalPrerollShow;
                                addDebugLog('✓ Preroll восстановлен');
                            }, 500);
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
        if (Lampa.Platform.is('android') && (typeof Lampa.Android !== 'undefined' || typeof Lampa.AndroidJS !== 'undefined')) {
            addDebugLog('🤖 Проверка наличия Android API', {
                LampaAndroid: typeof (Lampa.Android && Lampa.Android.openPlayer),
                AndroidJS: typeof (Lampa.AndroidJS && Lampa.AndroidJS.openPlayer)
            });

            // Если вдруг нужен перехват
            if (typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
                var originalOpenPlayer = Lampa.Android.openPlayer;
                Lampa.Android.openPlayer = function(link, data) {
                    addDebugLog('📱 Android.openPlayer перехват', {hasLink: Boolean(link)});
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
                    return originalOpenPlayer.call(this, link, data);
                };
                addDebugLog('✅ Android.openPlayer установлен');
            }
        }

        // ========== ПЕРЕХВАТ PLAYER.PLAY (WEB) ==========
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function(data) {
            addDebugLog('📺 Player.play перехват');
            if (data) {
                var url = data.url || data.stream || data.file;
                var title = data.title || data.name || data.fname || data.original_title;
                if (url && title) {
                    var hash = data.timeline && data.timeline.hash ||
                        (data.card && (data.card.original_title || data.card.original_name) && Lampa.Utils.hash(data.card.original_title || data.card.original_name)) ||
                        Lampa.Utils.hash(title);
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

        // ========== АВТОСОХРАНЕНИЕ ПРОГРЕССА ==========
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
                addDebugLog('💾 Автосохранение', {time: Math.floor(time), percent: percent});
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
            console.log('Текущий hash:', currentHash || 'не установлен');
            console.log('Сохранено URLs:', Object.keys(urls).length);
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
            debugLog.slice(-20).forEach(function(log) {console.log(log.time.substring(11, 19), log.message, log.data || '');});
            console.log('==========================================');
            return { currentHash: currentHash, urls: urls, debugLog: debugLog, totalSaved: Object.keys(urls).length };
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
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) { if (e.type == 'ready') startPlugin(); });
})();
