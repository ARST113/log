// Lampa.Plugin - Continue Watch v5.2 (Enhanced Debug + Fixes)

(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" v5.2');
        console.log('[ContinueWatch] ========================================');

        var currentHash = null;
        var activeButtons = {};

        // ========== ПРОВЕРКА ANDROID VERSION ==========
        if (Lampa.Platform.is('android') && typeof AndroidJS !== 'undefined') {
            try {
                var version = AndroidJS.appVersion().split('-').pop();
                console.log('[ContinueWatch] 📱 Android app version:', version);
                
                if (parseInt(version, 10) < 98) {
                    console.log('[ContinueWatch] ⚠️ Android < v98, timeCall не поддерживается');
                }
            } catch(e) {
                console.error('[ContinueWatch] Ошибка проверки версии:', e);
            }
        }

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

        function checkTorrentAvailability(torrent_link, onSuccess, onError) {
            if (typeof Lampa.Torserver === 'undefined' || typeof Lampa.Torserver.cache !== 'function') {
                console.log('[ContinueWatch] ⚠️ Torserver.cache недоступен, пропускаем проверку');
                onSuccess();
                return;
            }
            
            console.log('[ContinueWatch] 🔍 Проверка доступности торрента...');
            
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
            
            // ✅ НОВОЕ: Обновляем Timeline перед запуском
            if (currentView.hash) {
                Lampa.Timeline.update({
                    hash: currentView.hash,
                    percent: currentView.percent,
                    time: currentView.time,
                    duration: currentView.duration
                });
                console.log('[ContinueWatch] 💾 Timeline обновлен перед запуском:', currentView.percent + '%');
            }
            
            console.log('[ContinueWatch] 🎬 Запуск плеера:', currentView.percent + '%,', currentView.time, 'сек');
            
            try {
                if (Lampa.Platform.is('android') || Lampa.Platform.is('webos')) {
                    playerData.position = currentView.time || -1;
                    
                    console.log('[ContinueWatch] 📱 Попытка запуска внешнего плеера...');
                    
                    if (typeof Lampa.Android !== 'undefined' && typeof Lampa.Android.openPlayer === 'function') {
                        Lampa.Android.openPlayer(url, playerData);
                        console.log('[ContinueWatch] ✅ Запущен Lampa.Android.openPlayer');
                        return;
                    }
                    
                    if (typeof AndroidJS !== 'undefined' && typeof AndroidJS.openPlayer === 'function') {
                        AndroidJS.openPlayer(url, JSON.stringify(playerData));
                        console.log('[ContinueWatch] ✅ Запущен AndroidJS.openPlayer');
                        return;
                    }
                    
                    console.log('[ContinueWatch] ⚠️ Android API недоступен, fallback на встроенный плеер');
                }
                
                console.log('[ContinueWatch] 🖥️ Запуск встроенного плеера');
                Lampa.Player.play(playerData);
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска:', err);
                Lampa.Noty.show('Ошибка запуска: ' + err.message);
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
                
                console.log('[ContinueWatch] ✓ Параметры сохранены для hash:', hash);
            } catch(e) {
                console.error('[ContinueWatch] Ошибка сохранения:', e);
            }
        }

        function getUrlParams(hash) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                return viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
            } catch(e) {
                console.error('[ContinueWatch] Ошибка чтения:', e);
                return null;
            }
        }

        // ✅ УЛУЧШЕНО: Расширенная диагностика
        function createOrUpdateButton(movie, container) {
            console.log('[ContinueWatch] ========================================');
            console.log('[ContinueWatch] 🔍 ДИАГНОСТИКА СОЗДАНИЯ КНОПКИ');
            
            var title = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title) : 
                (movie.original_title || movie.original_name);
            
            console.log('[ContinueWatch] - Title:', title);
            console.log('[ContinueWatch] - Is series:', !!movie.number_of_seasons);
              
            if (!title) {
                console.log('[ContinueWatch] ❌ Title не найден');
                console.log('[ContinueWatch] - Movie object:', movie);
                return;
            }
              
            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);
            
            console.log('[ContinueWatch] - Hash:', hash);
            console.log('[ContinueWatch] - Timeline:', view);
              
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
                
                console.log('[ContinueWatch] - Series titleHash:', titleHash);
                console.log('[ContinueWatch] - Last watched:', filed);
                
                if (filed && filed.season && filed.episode) {
                    hash = Lampa.Utils.hash([
                        filed.season,
                        filed.season > 10 ? ':' : '',
                        filed.episode,
                        movie.original_name || movie.original_title
                    ].join(''));
                    view = Lampa.Timeline.view(hash);
                    console.log('[ContinueWatch] - Episode hash:', hash);
                    console.log('[ContinueWatch] - Episode view:', view);
                }
            }
              
            // ✅ УЛУЧШЕНО: Детальное логирование проверки
            console.log('[ContinueWatch] - Percent:', view.percent);
            console.log('[ContinueWatch] - Условие: percent >= 5 и <= 95');
            
            if (!view.percent || view.percent < 5 || view.percent > 95) {
                console.log('[ContinueWatch] ❌ Прогресс не подходит:', view.percent);
                
                if (activeButtons[hash]) {
                    activeButtons[hash].button.remove();
                    delete activeButtons[hash];
                    console.log('[ContinueWatch] 🗑️ Кнопка удалена');
                }
                
                console.log('[ContinueWatch] ========================================');
                return;
            }
            
            console.log('[ContinueWatch] ✅ Условия выполнены!');
              
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
                
                console.log('[ContinueWatch] ========================================');
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
                console.log('[ContinueWatch] 🎬 КНОПКА НАЖАТА');
                
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
                    
                    checkTorrentAvailability(
                        currentSavedParams.stream_params.torrent_link,
                        function() {
                            launchPlayer(url, currentSavedParams, currentView, currentData);
                        },
                        function() {
                            Lampa.Select.show({
                                title: 'Торрент не доступен',
                                items: [
                                    {
                                        title: 'Выбрать другой источник',
                                        value: 'reselect'
                                    },
                                    {
                                        title: 'Попробовать запустить',
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
                                    } else {
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
            });
              
            container.prepend(button);
            console.log('[ContinueWatch] ✅ Кнопка добавлена!');
            console.log('[ContinueWatch] ========================================');
        }

        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
              
            console.log('[ContinueWatch] ======== Событие FULL ========');
              
            setTimeout(function() {
                var movie = e.data.movie;
                var container = e.object.activity.render().find('.full-start-new__buttons');
                
                console.log('[ContinueWatch] Поиск контейнера .full-start-new__buttons:', container.length);
                
                if (!container.length) {
                    container = e.object.activity.render().find('.full-start__buttons');
                    console.log('[ContinueWatch] Поиск .full-start__buttons:', container.length);
                }
                
                if (!container.length) {
                    container = e.object.activity.render().find('.full__buttons');
                    console.log('[ContinueWatch] Поиск .full__buttons:', container.length);
                }
                
                if (!container.length) {
                    container = e.object.activity.render().find('[class*="buttons"]').first();
                    console.log('[ContinueWatch] Поиск [class*="buttons"]:', container.length);
                }
                
                if (!container.length) {
                    console.log('[ContinueWatch] ❌ Контейнер не найден!');
                    // ✅ НОВОЕ: Показываем все классы для диагностики
                    var allClasses = [];
                    e.object.activity.render().find('[class]').each(function() {
                        var cls = $(this).attr('class');
                        if (cls && allClasses.indexOf(cls) === -1) allClasses.push(cls);
                    });
                    console.log('[ContinueWatch] Доступные классы:', allClasses.slice(0, 20));
                    return;
                }
                
                console.log('[ContinueWatch] ✅ Контейнер найден!');
                createOrUpdateButton(movie, container);
                
            }, 100);
        });
        
        Lampa.Timeline.listener.follow('update', function(data) {
            console.log('[ContinueWatch] 📡 Timeline update, hash:', data.hash);
            
            if (data.hash && activeButtons[data.hash]) {
                var buttonData = activeButtons[data.hash];
                var container = buttonData.button.parent();
                
                if (container.length && document.contains(container[0])) {
                    createOrUpdateButton(buttonData.movie, container);
                } else {
                    delete activeButtons[data.hash];
                    console.log('[ContinueWatch] 🗑️ Кнопка удалена (не в DOM)');
                }
            }
        });
        
        Lampa.Activity.listener.follow('backward', function() {
            console.log('[ContinueWatch] 🧹 Очистка');
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
        }
          
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function(data) {
            console.log('[ContinueWatch] 📺 Перехват Player.play');
              
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
            console.log('[ContinueWatch] 🛑 Плеер закрывается');
              
            if (!currentHash) return;
              
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
                      
                    console.log('[ContinueWatch] 💾 Прогресс сохранен:', Math.floor(time), 'сек (' + percent + '%)');
                }
            }
            
            currentHash = null;
        });
        
        // ✅ НОВОЕ: Команда для диагностики Timeline
        window.ContinueWatchDebug = function() {
            var timeline = Lampa.Storage.get(Lampa.Timeline.filename(), {});
            console.log('========== TIMELINE DEBUG ==========');
            console.log('Timeline data:', timeline);
            console.log('Keys count:', Object.keys(timeline).length);
            Object.keys(timeline).forEach(function(hash) {
                var item = timeline[hash];
                console.log('Hash:', hash);
                console.log('  Percent:', item.percent);
                console.log('  Time:', item.time);
                console.log('  Params:', item.stream_params);
            });
            console.log('====================================');
        };
        console.log('[ContinueWatch] 💡 Для диагностики выполните: ContinueWatchDebug()');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
