// Lampa.Plugin - Continue Watch v5.1 (Production + Enhancements)

(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" ЗАПУЩЕН');
        console.log('[ContinueWatch] Версия: 5.1 - Production с улучшениями');
        console.log('[ContinueWatch] ========================================');

        var currentHash = null;
        var activeButtons = {};

        // ========== УТИЛИТЫ ==========
          
        function formatTime(seconds) {
            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);
            if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        function extractFileName(url) {
            var match = url.match(/\/stream\/([^?]+)/);
            if (match) {
                try {
                    return decodeURIComponent(match[1]);
                } catch(e) {
                    return match[1];
                }
            }
            return null;
        }

        function extractTorrentLink(url) {
            var match = url.match(/[?&]link=([^&]+)/);
            return match ? match[1] : null;
        }

        function extractFileIndex(url) {
            var match = url.match(/[?&]index=(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }

        function buildStreamUrl(params) {
            var torrserver_url = Lampa.Storage.get('torrserver_url');
            var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
            
            var server_url = Lampa.Storage.field('torrserver_use_link') == 'two' 
                ? (torrserver_url_two || torrserver_url) 
                : (torrserver_url || torrserver_url_two);
            
            if (!server_url) {
                console.error('[ContinueWatch] TorrServer URL не настроен!');
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
            
            return url;
        }

        // ✅ НОВОЕ: Проверка доступности торрента в кэше
        function checkTorrentAvailability(torrent_link, onSuccess, onError) {
            if (typeof Lampa.Torserver === 'undefined' || typeof Lampa.Torserver.cache !== 'function') {
                console.log('[ContinueWatch] ⚠️ Torserver.cache недоступен, пропускаем проверку');
                onSuccess();
                return;
            }
            
            console.log('[ContinueWatch] 🔍 Проверка доступности торрента в кэше...');
            
            Lampa.Torserver.cache(
                torrent_link,
                function(json) {
                    console.log('[ContinueWatch] ✅ Торрент найден в кэше');
                    onSuccess();
                },
                function() {
                    console.log('[ContinueWatch] ⚠️ Торрент не найден в кэше');
                    onError();
                }
            );
        }

        function launchPlayer(url, currentSavedParams, currentView, currentData) {
            var playerData = {
                url: url,
                title: currentSavedParams.stream_params.title,
                timeline: currentView,
                card: currentData.movie,
                continue_play: true,
                torrent_hash: currentSavedParams.stream_params.torrent_link
            };
            
            console.log('[ContinueWatch] Запуск плеера с Timeline:', currentView.percent + '%,', currentView.time, 'сек');
            
            try {
                if (Lampa.Platform.is('android') || Lampa.Platform.is('webos')) {
                    playerData.position = currentView.time || -1;
                    
                    console.log('[ContinueWatch] 📱 Попытка запуска внешнего плеера...');
                    
                    if (typeof Lampa.Android !== 'undefined' && typeof Lampa.Android.openPlayer === 'function') {
                        Lampa.Android.openPlayer(url, playerData);
                        console.log('[ContinueWatch] ✅ Внешний плеер запущен через Lampa.Android.openPlayer');
                        return;
                    }
                    
                    if (typeof AndroidJS !== 'undefined' && typeof AndroidJS.openPlayer === 'function') {
                        AndroidJS.openPlayer(url, JSON.stringify(playerData));
                        console.log('[ContinueWatch] ✅ Внешний плеер запущен через AndroidJS.openPlayer');
                        return;
                    }
                    
                    console.log('[ContinueWatch] ⚠️ Android API недоступен, fallback на встроенный плеер');
                }
                
                console.log('[ContinueWatch] 🖥️ Запуск встроенного плеера');
                Lampa.Player.play(playerData);
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска плеера:', err);
                
                Lampa.Select.show({
                    title: 'Ошибка запуска плеера',
                    items: [
                        {
                            title: 'Выбрать другой источник',
                            subtitle: 'Открыть список торрентов',
                            value: 'reselect'
                        },
                        {
                            title: 'Попробовать ещё раз',
                            subtitle: 'Повторить попытку',
                            value: 'retry'
                        }
                    ],
                    onSelect: function(item) {
                        if (item.value === 'reselect') {
                            Lampa.Activity.push({
                                url: '',
                                title: currentData.movie.title || currentData.movie.name,
                                component: 'torrents',
                                movie: currentData.movie,
                                page: 1
                            });
                        } else if (item.value === 'retry') {
                            launchPlayer(url, currentSavedParams, currentView, currentData);
                        }
                    },
                    onBack: function() {}
                });
            }
        }

        function saveUrlParams(hash, data) {
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
                    title: data.title,
                    season: data.season,
                    episode: data.episode,
                    timestamp: Date.now()
                };
                
                Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                
                console.log('[ContinueWatch] ✓ Параметры сохранены в Timeline для hash:', hash);
            } catch(e) {
                console.error('[ContinueWatch] Ошибка сохранения параметров:', e);
            }
        }

        function getUrlParams(hash) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                return viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
            } catch(e) {
                console.error('[ContinueWatch] Ошибка чтения параметров:', e);
                return null;
            }
        }

        function createOrUpdateButton(movie, container) {
            var title = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title) : 
                (movie.original_title || movie.original_name);
              
            if (!title) return;
              
            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);
              
            if (movie.number_of_seasons) {
                var last = Lampa.Storage.get('online_watched_last', '{}');
                if (typeof last === 'string') {
                    try {
                        last = JSON.parse(last);
                    } catch(e) {
                        last = {};
                    }
                }
                
                var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title);
                var filed = last[titleHash];
                
                if (filed && filed.season && filed.episode) {
                    hash = Lampa.Utils.hash([
                        filed.season,
                        filed.season > 10 ? ':' : '',
                        filed.episode,
                        movie.original_name || movie.original_title
                    ].join(''));
                    view = Lampa.Timeline.view(hash);
                }
            }
              
            if (!view.percent || view.percent < 5 || view.percent > 95) {
                if (activeButtons[hash]) {
                    activeButtons[hash].button.remove();
                    delete activeButtons[hash];
                    console.log('[ContinueWatch] 🗑️ Кнопка удалена (прогресс не подходит)');
                }
                return;
            }
              
            var percent = view.percent;
            var timeStr = formatTime(view.time);
            var savedParams = getUrlParams(hash);
            
            if (activeButtons[hash]) {
                console.log('[ContinueWatch] 🔄 Обновление существующей кнопки');
                var button = activeButtons[hash].button;
                
                button.find('circle').attr('stroke-dasharray', (percent * 65.97 / 100).toFixed(2) + ' 65.97');
                button.find('span').text('Продолжить ' + percent + '%');
                button.find('div').last().text(timeStr);
                
                activeButtons[hash].view = view;
                activeButtons[hash].savedParams = savedParams;
                
                return;
            }
            
            console.log('[ContinueWatch] ➕ Создание новой кнопки');
            
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
            
            activeButtons[hash] = {
                button: button,
                movie: movie,
                view: view,
                savedParams: savedParams,
                hash: hash
            };
              
            button.on('hover:enter', function() {
                console.log('[ContinueWatch] ========================================');
                console.log('[ContinueWatch] 🎬 КНОПКА "ПРОДОЛЖИТЬ" НАЖАТА');
                
                var currentData = activeButtons[hash];
                if (!currentData) return;
                
                var currentSavedParams = getUrlParams(hash);
                var currentView = Lampa.Timeline.view(hash);
                  
                if (currentSavedParams && currentSavedParams.stream_params) {
                    var url = buildStreamUrl(currentSavedParams.stream_params);
                    
                    if (!url) {
                        Lampa.Noty.show('TorrServer не настроен');
                        return;
                    }
                    
                    // ✅ НОВОЕ: Проверяем доступность торрента перед запуском
                    checkTorrentAvailability(
                        currentSavedParams.stream_params.torrent_link,
                        function() {
                            // Торрент доступен - запускаем
                            launchPlayer(url, currentSavedParams, currentView, currentData);
                        },
                        function() {
                            // Торрент не доступен - предлагаем выбрать заново
                            Lampa.Select.show({
                                title: 'Торрент не доступен',
                                items: [
                                    {
                                        title: 'Выбрать другой источник',
                                        subtitle: 'Открыть список торрентов',
                                        value: 'reselect'
                                    },
                                    {
                                        title: 'Попробовать запустить',
                                        subtitle: 'Возможно торрент загрузится',
                                        value: 'try'
                                    }
                                ],
                                onSelect: function(item) {
                                    if (item.value === 'reselect') {
                                        Lampa.Activity.push({
                                            url: '',
                                            title: currentData.movie.title || currentData.movie.name,
                                            component: 'torrents',
                                            movie: currentData.movie,
                                            page: 1
                                        });
                                    } else if (item.value === 'try') {
                                        launchPlayer(url, currentSavedParams, currentView, currentData);
                                    }
                                },
                                onBack: function() {}
                            });
                        }
                    );
                    
                } else {
                    Lampa.Activity.push({
                        url: '',
                        title: currentData.movie.title || currentData.movie.name,
                        component: 'torrents',
                        movie: currentData.movie,
                        page: 1
                    });
                }
                  
                console.log('[ContinueWatch] ========================================');
            });
              
            container.prepend(button);
            console.log('[ContinueWatch] ✅ Кнопка добавлена на карточку');
        }

        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
              
            console.log('[ContinueWatch] ========================================');
            console.log('[ContinueWatch] Обработка карточки');
              
            var movie = e.data.movie;
            var container = e.object.activity.render().find('.full-start-new__buttons');
              
            if (!container.length) {
                console.log('[ContinueWatch] ⚠️ Контейнер .full-start-new__buttons не найден');
                return;
            }
            
            createOrUpdateButton(movie, container);
            
            console.log('[ContinueWatch] ========================================');
        });
        
        Lampa.Timeline.listener.follow('update', function(data) {
            console.log('[ContinueWatch] 📡 Timeline обновлен, hash:', data.hash);
            
            if (data.hash && activeButtons[data.hash]) {
                var buttonData = activeButtons[data.hash];
                var container = buttonData.button.parent();
                
                if (container.length && $.contains(document, container[0])) {
                    console.log('[ContinueWatch] 🔄 Обновляем кнопку для hash:', data.hash);
                    createOrUpdateButton(buttonData.movie, container);
                } else {
                    delete activeButtons[data.hash];
                    console.log('[ContinueWatch] 🗑️ Кнопка удалена (контейнер не в DOM)');
                }
            }
        });
        
        Lampa.Activity.listener.follow('backward', function() {
            console.log('[ContinueWatch] 🧹 Очистка активных кнопок');
            activeButtons = {};
        });
          
        if (Lampa.Platform.is('android') && typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
            var originalOpenPlayer = Lampa.Android.openPlayer;
            Lampa.Android.openPlayer = function(link, data) {
                console.log('[ContinueWatch] 📱 Перехват Android.openPlayer');
                  
                if (data && data.timeline && data.timeline.hash) {
                    var hash = data.timeline.hash;
                    currentHash = hash;
                    
                    var file_name = extractFileName(link);
                    var torrent_link = extractTorrentLink(link);
                    var file_index = extractFileIndex(link);
                    
                    if (file_name !== null && torrent_link) {
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
            console.log('[ContinueWatch] ✅ Android.openPlayer перехвачен');
        }
          
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function(data) {
            console.log('[ContinueWatch] ----------------------------------------');
            console.log('[ContinueWatch] 📺 Перехват Player.play()');
              
            if (data && data.url) {
                var hash = null;
                if (data.timeline && data.timeline.hash) {
                    hash = data.timeline.hash;
                } else if (data.season && data.episode && data.card) {
                    var baseTitle = data.card.number_of_seasons ? 
                        (data.card.original_name || data.card.original_title) :
                        (data.card.original_title || data.card.original_name);
                    
                    hash = Lampa.Utils.hash([
                        data.season,
                        data.season > 10 ? ':' : '',
                        data.episode,
                        baseTitle
                    ].join(''));
                } else if (data.card) {
                    var cardTitle = data.card.number_of_seasons ? 
                        (data.card.original_name || data.card.original_title) :
                        (data.card.original_title || data.card.original_name);
                    hash = Lampa.Utils.hash(cardTitle);
                } else if (data.title) {
                    hash = Lampa.Utils.hash(data.title);
                }
                  
                if (hash) {
                    currentHash = hash;
                    
                    var file_name = extractFileName(data.url);
                    var torrent_link = extractTorrentLink(data.url);
                    var file_index = extractFileIndex(data.url);
                    
                    if (file_name !== null && torrent_link) {
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
            }
              
            console.log('[ContinueWatch] ----------------------------------------');
            return originalPlay.call(this, data);
        };
          
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
                  
                console.log('[ContinueWatch] 💾 Автосохранение:', Math.floor(time), 'сек (' + percent + '%)');
            }
        });

        Lampa.Player.listener.follow('destroy', function() {
            console.log('[ContinueWatch] ========================================');
            console.log('[ContinueWatch] 🛑 Плеер закрывается');
              
            if (!currentHash) {
                console.log('[ContinueWatch] ⚠️ currentHash не установлен');
                return;
            }
              
            var video = document.querySelector('video');
            if (video) {
                var time = video.currentTime;
                var duration = video.duration;
                  
                if (time && duration && duration > 0) {
                    var percent = Math.round((time / duration) * 100);
                      
                    Lampa.Timeline.update({
                        hash: currentHash,
                        percent: percent,
                        time: time,
                        duration: duration
                    });
                      
                    console.log('[ContinueWatch] 💾 Прогресс сохранен при закрытии:', Math.floor(time), 'сек (' + percent + '%)');
                }
            }
            
            currentHash = null;
        });
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
