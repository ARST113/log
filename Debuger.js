// Lampa.Plugin - Continue Watch v6.1 (Simplified Test Version)
(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" v6.1 (Тестовая)');
        console.log('[ContinueWatch] ========================================');

        var currentHash = null;
        var buttonClickLock = false;
        var currentButton = null;

        // ========== УПРОЩЕННЫЕ УТИЛИТЫ ==========
          
        function extractFileName(url) {
            if (!url) return null;
            var match = url.match(/\/stream\/([^?]+)/);
            return match ? decodeURIComponent(match[1]) : null;
        }

        function extractTorrentLink(url) {
            if (!url) return null;
            var match = url.match(/[?&]link=([^&]+)/);
            return match ? match[1] : null;
        }

        function extractFileIndex(url) {
            if (!url) return 0;
            var match = url.match(/[?&]index=(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }

        function buildStreamUrl(params) {
            if (!params || !params.file_name || !params.torrent_link) {
                console.error('[ContinueWatch] ❌ Недостаточно параметров');
                return null;
            }
            
            // Используем настройки пользователя
            var torrserver_url = Lampa.Storage.get('torrserver_url');
            var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
            
            var server_url = Lampa.Storage.field('torrserver_use_link') == 'two' 
                ? (torrserver_url_two || torrserver_url) 
                : (torrserver_url || torrserver_url_two);
            
            if (!server_url) {
                console.error('[ContinueWatch] ❌ TorrServer URL не настроен!');
                return null;
            }
            
            if (!server_url.match(/^https?:\/\//)) {
                server_url = 'http://' + server_url;
            }
            
            var encodedFileName = encodeURIComponent(params.file_name);
            var playMode = Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play';
            
            var url = server_url + '/stream/' + encodedFileName;
            var urlParams = [];
            if (params.torrent_link) urlParams.push('link=' + params.torrent_link);
            urlParams.push('index=' + params.file_index);
            urlParams.push(playMode);
            
            url += '?' + urlParams.join('&');
            
            console.log('[ContinueWatch] ✅ URL:', url);
            return url;
        }

        function saveUrlParams(hash, data) {
            if (!hash || !data) return;
            
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                
                if (!viewed[hash]) {
                    viewed[hash] = {
                        duration: 0,
                        time: 0,
                        percent: 0,
                        profile: 0
                    };
                }
                
                viewed[hash].stream_params = {
                    file_name: data.file_name,
                    torrent_link: data.torrent_link,
                    file_index: data.file_index,
                    path: data.path,
                    title: data.title,
                    season: data.season,
                    episode: data.episode,
                    timestamp: Date.now(),
                    source: 'continue_watch_v6.1_test'
                };
                
                Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                console.log('[ContinueWatch] 💾 Сохранено для hash:', hash);
                
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка сохранения:', e);
            }
        }

        function getUrlParams(hash) {
            if (!hash) return null;
            
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                return viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка чтения:', e);
                return null;
            }
        }

        // ========== УПРОЩЕННЫЙ ПЕРЕХВАТ PLAYER.PLAY ==========
        function patchPlayerForPlayline() {
            console.log('[ContinueWatch] 🔧 Установка патча Player.play()');
            
            var originalPlay = Lampa.Player.play;
            Lampa.Player.play = function(params) {
                console.log('[ContinueWatch] 📺 Перехват Player.play()', params ? {
                    url: params.url,
                    title: params.title,
                    torrent_hash: params.torrent_hash,
                    path: params.path
                } : 'null');
                
                // Сохраняем параметры при любом запуске торрента
                if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                    console.log('[ContinueWatch] 💾 Сохраняем параметры');
                    
                    var hash = null;
                    var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                    
                    if (movie) {
                        var baseTitle = movie.number_of_seasons ? 
                            (movie.original_name || movie.original_title) :
                            (movie.original_title || movie.original_name);
                        
                        if (baseTitle) {
                            // Упрощенное вычисление hash
                            if (params.season && params.episode) {
                                hash = Lampa.Utils.hash([
                                    params.season,
                                    params.episode,
                                    baseTitle
                                ].join(''));
                            } else {
                                hash = Lampa.Utils.hash(baseTitle);
                            }
                            
                            if (hash) {
                                currentHash = hash;
                                
                                // Упрощенное извлечение параметров
                                var file_name = null;
                                var torrent_link = null;
                                var file_index = 0;
                                
                                if (params.torrent_hash && params.path) {
                                    file_name = params.path.split(/[\\\/]/).pop();
                                    torrent_link = params.torrent_hash;
                                    file_index = params.id || params.file_id || 0;
                                } else if (params.url) {
                                    file_name = extractFileName(params.url);
                                    torrent_link = extractTorrentLink(params.url);
                                    file_index = extractFileIndex(params.url);
                                }
                                
                                if (file_name && torrent_link) {
                                    saveUrlParams(hash, {
                                        file_name: file_name,
                                        torrent_link: torrent_link,
                                        file_index: file_index,
                                        path: params.path,
                                        title: params.title || 'Unknown',
                                        season: params.season,
                                        episode: params.episode
                                    });
                                }
                            }
                        }
                    }
                }
                
                return originalPlay.call(this, params);
            };
        }

        // ========== УПРОЩЕННАЯ КНОПКА ==========
        function createButton(movie, container) {
            console.log('[ContinueWatch] 🔘 Создание тестовой кнопки');
            
            // Удаляем старую кнопку если есть
            if (currentButton) {
                currentButton.remove();
                currentButton = null;
            }
            
            // Создаем простую кнопку без процентов
            var button = $('<div class="full-start__button selector button--continue-watch" style="position: relative;">' +
                '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
                    '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +
                '</svg>' +
                '<span>Продолжить просмотр</span>' +
            '</div>');
            
            button.on('hover:enter', function() {
                if (buttonClickLock) {
                    console.log('[ContinueWatch] 🔒 Кнопка заблокирована');
                    return;
                }
                
                buttonClickLock = true;
                console.log('[ContinueWatch] 🎬 КНОПКА НАЖАТА');
                
                // Разблокируем через 2 секунды
                setTimeout(function() {
                    buttonClickLock = false;
                }, 2000);
                
                // Получаем hash для текущего контента
                var title = movie.number_of_seasons ? 
                    (movie.original_name || movie.original_title) : 
                    (movie.original_title || movie.original_name);
                
                if (!title) {
                    console.log('[ContinueWatch] ❌ Не удалось определить title');
                    Lampa.Noty.show('Ошибка: не найден заголовок');
                    return;
                }
                
                var hash = Lampa.Utils.hash(title);
                
                // Для сериалов используем последний просмотренный эпизод
                if (movie.number_of_seasons) {
                    var last = Lampa.Storage.get('online_watched_last', '{}');
                    if (typeof last === 'string') {
                        try { last = JSON.parse(last); } catch(e) { last = {}; }
                    }
                    
                    var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title);
                    var filed = last[titleHash];
                    
                    if (filed && filed.season && filed.episode) {
                        hash = Lampa.Utils.hash([
                            filed.season,
                            filed.episode,
                            movie.original_name || movie.original_title
                        ].join(''));
                    }
                }
                
                console.log('[ContinueWatch] 🔑 Используем hash:', hash);
                
                var savedParams = getUrlParams(hash);
                
                if (savedParams && savedParams.stream_params) {
                    console.log('[ContinueWatch] ✅ Параметры найдены:', savedParams.stream_params);
                    
                    var url = buildStreamUrl(savedParams.stream_params);
                    
                    if (!url) {
                        Lampa.Noty.show('TorrServer не настроен');
                        return;
                    }
                    
                    var playerData = {
                        url: url,
                        title: savedParams.stream_params.title,
                        card: movie,
                        continue_play: true,
                        torrent_hash: savedParams.stream_params.torrent_link
                    };
                    
                    // Добавляем timeline если есть прогресс
                    var view = Lampa.Timeline.view(hash);
                    if (view && view.percent && view.percent > 0) {
                        playerData.timeline = view;
                        console.log('[ContinueWatch] ⏱️ Восстанавливаем позицию:', view.time + 'сек');
                    }
                    
                    console.log('[ContinueWatch] 🎬 Запускаем плеер');
                    
                    try {
                        if (Lampa.Platform.is('android')) {
                            playerData.position = (view && view.time) || -1;
                            
                            if (typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
                                Lampa.Android.openPlayer(url, playerData);
                            } else if (typeof AndroidJS !== 'undefined' && AndroidJS.openPlayer) {
                                AndroidJS.openPlayer(url, JSON.stringify(playerData));
                            } else {
                                Lampa.Player.play(playerData);
                            }
                        } else {
                            Lampa.Player.play(playerData);
                        }
                        
                        Lampa.Noty.show('Запуск продолжения...');
                        
                    } catch(err) {
                        console.error('[ContinueWatch] ❌ Ошибка запуска:', err);
                        Lampa.Noty.show('Ошибка запуска');
                    }
                    
                } else {
                    console.log('[ContinueWatch] ⚠️ Параметры не найдены');
                    Lampa.Noty.show('Параметры не найдены, открываем выбор источника');
                    
                    Lampa.Activity.push({
                        url: '',
                        title: movie.title || movie.name,
                        component: 'torrents',
                        movie: movie,
                        page: 1
                    });
                }
            });
            
            container.prepend(button);
            currentButton = button;
            console.log('[ContinueWatch] ✅ Кнопка создана');
        }

        // ========== ПЕРЕХВАТ ANDROID API ==========
        function patchAndroidAPI() {
            if (!Lampa.Platform.is('android')) return;
            
            console.log('[ContinueWatch] 🔧 Настройка Android API');
            
            if (typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
                var originalOpenPlayer = Lampa.Android.openPlayer;
                Lampa.Android.openPlayer = function(link, data) {
                    console.log('[ContinueWatch] 📱 Перехват Lampa.Android.openPlayer');
                    
                    if (data && data.timeline && data.timeline.hash) {
                        var hash = data.timeline.hash;
                        currentHash = hash;
                        
                        var file_name = extractFileName(link);
                        var torrent_link = extractTorrentLink(link);
                        var file_index = extractFileIndex(link);
                        
                        if (file_name && torrent_link) {
                            saveUrlParams(hash, {
                                file_name: file_name,
                                torrent_link: torrent_link,
                                file_index: file_index,
                                title: data.title || 'Unknown',
                                season: data.season,
                                episode: data.episode
                            });
                        }
                    }
                    
                    return originalOpenPlayer.call(this, link, data);
                };
            }
        }

        // ========== ИНИЦИАЛИЗАЦИЯ ==========
        
        patchPlayerForPlayline();
        patchAndroidAPI();
        
        // Подписка на события карточки
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
              
            setTimeout(function() {
                var movie = e.data.movie;
                var container = e.object.activity.render().find('.full-start-new__buttons, .full-start__buttons, .full__buttons, [class*="buttons"]').first();
                
                if (!container.length) {
                    console.log('[ContinueWatch] ❌ Контейнер не найден');
                    return;
                }
                
                // ✅ ВСЕГДА создаем кнопку без проверок
                createButton(movie, container);
                
            }, 100);
        });
        
        // Очистка при выходе из карточки
        Lampa.Activity.listener.follow('backward', function() {
            console.log('[ContinueWatch] 🧹 Очистка');
            if (currentButton) {
                currentButton.remove();
                currentButton = null;
            }
            buttonClickLock = false;
        });
        
        console.log('[ContinueWatch] 🚀 Упрощенная тестовая версия загружена');
        console.log('[ContinueWatch] 💡 Кнопка "Продолжить просмотр" будет всегда отображаться');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
