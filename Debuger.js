"use strict";
(function () {
    'use strict';

    // ========================================================================
    // ПЕРЕМЕННЫЕ КЭША (ОПТИМИЗАЦИЯ)
    // ========================================================================
    var MEMORY_CACHE = null;
    var WATCHED_LAST_CACHE = null;
    var TORRSERVER_CACHE = null;
    var SAVE_TIMEOUT = null;
    var CURRENT_PLAYLIST = null;
    var CURRENT_HASH = null;
    var LAST_SAVED_POSITION = null;
    var SAVE_INTERVAL = null;
    var PLAYER_LISTENERS_ADDED = false;

    // ========================================================================
    // 1. СИСТЕМА КЭШИРОВАНИЯ И СИНХРОНИЗАЦИИ
    // ========================================================================
    
    Lampa.Storage.sync('continue_watch_params', 'object_object');

    Lampa.Storage.listener.follow('change', function(e) {
        if (e.name === 'continue_watch_params') MEMORY_CACHE = null;
        if (e.name === 'online_watched_last') WATCHED_LAST_CACHE = null;
        if (e.name === 'torrserver_url' || e.name === 'torrserver_url_two' || e.name === 'torrserver_use_link') TORRSERVER_CACHE = null;
    });

    function getParams() {
        if (!MEMORY_CACHE) MEMORY_CACHE = Lampa.Storage.get('continue_watch_params', {});
        return MEMORY_CACHE;
    }

    function setParams(data) {
        MEMORY_CACHE = data;
        clearTimeout(SAVE_TIMEOUT);
        SAVE_TIMEOUT = setTimeout(function() {
            Lampa.Storage.set('continue_watch_params', data);
        }, 500);
    }

    function getWatchedLast() {
        if (!WATCHED_LAST_CACHE) {
            var last = Lampa.Storage.get('online_watched_last', '{}');
            WATCHED_LAST_CACHE = typeof last === 'string' ? JSON.parse(last) : last;
        }
        return WATCHED_LAST_CACHE;
    }

    function getTorrServerUrl() {
        if (!TORRSERVER_CACHE) {
            var url = Lampa.Storage.get('torrserver_url');
            var url_two = Lampa.Storage.get('torrserver_url_two');
            var use_two = Lampa.Storage.field('torrserver_use_link') == 'two';
            var final_url = use_two ? (url_two || url) : (url || url_two);
            
            if (final_url) {
                if (!final_url.match(/^https?:\/\//)) final_url = 'http://' + final_url;
                final_url = final_url.replace(/\/$/, '');
            }
            TORRSERVER_CACHE = final_url;
        }
        return TORRSERVER_CACHE;
    }

    // ========================================================================
    // 2. ЛОГИКА
    // ========================================================================

    function formatTime(seconds) {
        if (!seconds) return '';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        return h > 0 ? 
            h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s : 
            m + ':' + (s < 10 ? '0' : '') + s;
    }

    function cleanupOldParams() {
        setTimeout(function() {
            try {
                var params = getParams();
                var now = Date.now();
                var changed = false;
                for (var hash in params) {
                    if (params[hash].timestamp && now - params[hash].timestamp > 30 * 24 * 60 * 60 * 1000) {
                        delete params[hash];
                        changed = true;
                    }
                }
                if (changed) setParams(params);
            } catch (e) {}
        }, 5000);
    }

    function getStreamParams(movie) {
        if (!movie) return null;
        var title = movie.number_of_seasons ? movie.original_name || movie.original_title || movie.name : movie.original_title || movie.title || movie.name;
        if (!title) return null;
        
        var hash = Lampa.Utils.hash(title);

        if (movie.number_of_seasons) {
            try {
                var last = getWatchedLast();
                var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title || title);
                var filed = last[titleHash];
                if (filed && filed.season !== undefined && filed.episode !== undefined) {
                    var separator = filed.season > 10 ? ':' : '';
                    hash = Lampa.Utils.hash([filed.season, separator, filed.episode, title].join(''));
                }
            } catch (e) {}
        }
        
        var params = getParams();
        return params[hash] || params[Lampa.Utils.hash(title)] || null;
    }

    function buildStreamUrl(params) {
        if (!params || !params.file_name || !params.torrent_link) return null;
        
        var server_url = getTorrServerUrl();

        if (!server_url) {
            Lampa.Noty.show('TorrServer не настроен');
            return null;
        }

        var url = server_url + '/stream/' + encodeURIComponent(params.file_name);
        var query = [];
        if (params.torrent_link) query.push('link=' + params.torrent_link);
        query.push('index=' + (params.file_index || 0));
        query.push(Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play');
        return url + '?' + query.join('&');
    }

    // ИСПРАВЛЕННАЯ ФУНКЦИЯ: сохранение позиции с использованием Lampa.PlayerVideo.video()
    function saveCurrentPosition(force) {
        if (!CURRENT_HASH) return;
        
        try {
            var video = Lampa.PlayerVideo.video();
            if (!video) return;
            
            var currentTime = video.currentTime || 0;
            var duration = video.duration || 0;
            
            if (!duration || duration < 10) return;
            
            var percent = Math.round((currentTime / duration) * 100);
            
            // Debouncing logic
            if (!force && LAST_SAVED_POSITION) {
                var timeDiff = Math.abs(currentTime - LAST_SAVED_POSITION.time);
                var percentDiff = Math.abs(percent - LAST_SAVED_POSITION.percent);
                
                if (timeDiff < 10 && percentDiff < 2) return;
            }
            
            console.log("[ContinueWatch] Saving position for", CURRENT_HASH, "time:", currentTime, "percent:", percent);
            
            Lampa.Timeline.update(CURRENT_HASH, {
                duration: duration,
                time: currentTime,
                percent: percent
            });
            
            LAST_SAVED_POSITION = { time: currentTime, percent: percent };
        } catch (e) {
            console.log("[ContinueWatch] Error saving position:", e);
        }
    }

    // Функция для обновления хэша при смене эпизода
    function updateCurrentHash(movie, season, episode) {
        if (!movie) return;
        
        var title = movie.number_of_seasons ? 
            movie.original_name || movie.original_title || movie.name || movie.title : 
            movie.original_title || movie.original_name || movie.title || movie.name;
        
        if (season && episode) {
            var separator = season > 10 ? ':' : '';
            CURRENT_HASH = Lampa.Utils.hash([season, separator, episode, title].join(''));
        } else {
            CURRENT_HASH = Lampa.Utils.hash(title);
        }
        
        console.log("[ContinueWatch] Updated CURRENT_HASH to:", CURRENT_HASH);
        LAST_SAVED_POSITION = null; // Сбрасываем сохраненную позицию
    }

    // Улучшенная функция создания плейлиста
    function buildPlaylist(movie, currentParams, currentUrl, callback) {  
        console.log("[ContinueWatch] Building playlist for", movie.original_name, "season", currentParams.season);
        
        var playlist = [];  
        var allParams = getParams();  
        var title = movie.original_name || movie.original_title;  
        
        console.log("[ContinueWatch] Total params in storage:", Object.keys(allParams).length);
        
        // Сначала добавляем эпизоды из хранилища
        for (var hash in allParams) {  
            var p = allParams[hash];  
              
            if (p.season === currentParams.season && p.title === title) {  
                console.log("[ContinueWatch] Found saved episode:", p.episode, "title:", p.episode_title);
                
                var separator = p.season > 10 ? ':' : '';  
                var episodeHash = Lampa.Utils.hash([p.season, separator, p.episode, title].join(''));  
                var timeline = Lampa.Timeline.view(episodeHash);  
                  
                var item = {  
                    title: p.episode_title || ('S' + p.season + ' E' + p.episode),
                    season: p.season,  
                    episode: p.episode,  
                    timeline: timeline,  
                    torrent_hash: p.torrent_hash || p.torrent_link,
                    card: movie,
                    url: buildStreamUrl(p)
                };  
                  
                // Используем точный URL для текущего эпизода
                if (p.episode === currentParams.episode) {
                    item.url = currentUrl;
                    console.log("[ContinueWatch] Using current URL for episode", p.episode);
                }
                  
                playlist.push(item);  
            }  
        }
        
        // Если недостаточно эпизодов, загружаем из TorrServer
        if (playlist.length <= 1 && currentParams.torrent_link) {
            console.log("[ContinueWatch] Loading additional episodes from TorrServer");
            
            Lampa.Torserver.files(currentParams.torrent_link, function(json) {
                console.log("[ContinueWatch] TorrServer files response received");
                
                if (json && json.file_stats && json.file_stats.length > 0) {
                    console.log("[ContinueWatch] Processing", json.file_stats.length, "files");
                    
                    var addedEpisodes = 0;
                    
                    json.file_stats.forEach(function(file) {
                        try {
                            var fileInfo = {
                                movie: movie,
                                files: json.file_stats,
                                filename: file.path,
                                path: file.path,
                                is_file: true
                            };
                            
                            var info = Lampa.Torserver.parse(fileInfo);
                            
                            if (info && info.season === currentParams.season && info.episode) {
                                var alreadyExists = playlist.some(function(p) {
                                    return p.episode === info.episode;
                                });
                                
                                if (!alreadyExists) {
                                    var separator = info.season > 10 ? ':' : '';  
                                    var episodeHash = Lampa.Utils.hash([info.season, separator, info.episode, title].join(''));  
                                    var timeline = Lampa.Timeline.view(episodeHash);
                                    
                                    var item = {
                                        title: 'S' + info.season + ' E' + info.episode,
                                        season: info.season,
                                        episode: info.episode,
                                        timeline: timeline,
                                        torrent_hash: currentParams.torrent_link,
                                        card: movie,
                                        url: buildStreamUrl({
                                            file_name: file.path,
                                            torrent_link: currentParams.torrent_link,
                                            file_index: file.id || 0,
                                            title: title,
                                            season: info.season,
                                            episode: info.episode
                                        })
                                    };
                                    
                                    // Для текущего эпизода используем точный URL
                                    if (info.episode === currentParams.episode) {
                                        item.url = currentUrl;
                                    }
                                    
                                    playlist.push(item);
                                    addedEpisodes++;
                                    console.log("[ContinueWatch] Added episode from TorrServer:", info.episode);
                                }
                            }
                        } catch (e) {
                            console.log("[ContinueWatch] Error parsing file:", file.path, e);
                        }
                    });
                    
                    console.log("[ContinueWatch] Added", addedEpisodes, "episodes from TorrServer");
                }
                
                // Сортируем и возвращаем плейлист
                playlist.sort(function(a, b) {  
                    return a.episode - b.episode;  
                });
                
                console.log("[ContinueWatch] Final playlist:", playlist.length, "episodes");
                callback(playlist);
                
            }, function(error) {
                console.log("[ContinueWatch] Error loading files from TorrServer:", error);
                // В случае ошибки возвращаем то, что есть
                playlist.sort(function(a, b) {  
                    return a.episode - b.episode;  
                });
                callback(playlist);
            });
        } else {
            playlist.sort(function(a, b) {  
                return a.episode - b.episode;  
            });
            console.log("[ContinueWatch] Final playlist from storage:", playlist.length, "episodes");
            callback(playlist);
        }
    }

    // Очистка интервалов и обработчиков
    function cleanupPlayerListeners() {
        if (SAVE_INTERVAL) {
            clearInterval(SAVE_INTERVAL);
            SAVE_INTERVAL = null;
        }
        PLAYER_LISTENERS_ADDED = false;
    }

    // МОДИФИЦИРОВАННАЯ ФУНКЦИЯ: запуск плеера с улучшенным управлением плейлистом
    function launchPlayer(movie, params) {  
        console.log("[ContinueWatch] Launching player with params:", params);
        
        var url = buildStreamUrl(params);  
        if (!url) return;  
          
        // Обновляем текущий хэш
        updateCurrentHash(movie, params.season, params.episode);
          
        var view = Lampa.Timeline.view(CURRENT_HASH);  
        if (view) {  
            view.handler = function (percent, time, duration) {  
                Lampa.Timeline.update(CURRENT_HASH, { percent: percent, time: time, duration: duration });  
            };  
        }  
          
        var playerData = {  
            url: url,  
            title: params.episode_title || params.title || movie.title,
            card: movie,  
            torrent_hash: params.torrent_link,  
            timeline: view,  
            season: params.season,
            episode: params.episode
        };  
          
        if (view && view.percent > 0) Lampa.Noty.show('Восстанавливаем позицию...');  
        
        // Очищаем старые обработчики
        cleanupPlayerListeners();
        
        // Запускаем плеер
        Lampa.Player.play(playerData);
        
        // Сохраняем ссылку на текущий плейлист
        if (params.season && params.episode) {  
            console.log("[ContinueWatch] Setting up playlist for season", params.season);
            
            buildPlaylist(movie, params, url, function(playlist) {
                if (playlist && playlist.length > 1) {
                    console.log("[ContinueWatch] Setting playlist with", playlist.length, "items");
                    CURRENT_PLAYLIST = playlist;
                    Lampa.Player.playlist(playlist);
                    
                    // Дополнительная проверка через секунду
                    setTimeout(function() {
                        if (Lampa.PlayerPlaylist && Lampa.PlayerPlaylist.get) {
                            var currentPlaylist = Lampa.PlayerPlaylist.get();
                            console.log("[ContinueWatch] Playlist verification - actual length:", currentPlaylist ? currentPlaylist.length : 0);
                        }
                    }, 1000);
                } else {
                    console.log("[ContinueWatch] Not enough episodes for playlist:", playlist ? playlist.length : 0);
                    CURRENT_PLAYLIST = null;
                }
            });
        }
        
        // Настраиваем обработчики для сохранения позиции
        setupPlayerListeners(movie);
          
        Lampa.Player.callback(function() {  
            Lampa.Controller.toggle('content');  
        });
    }

    // ИСПРАВЛЕННАЯ ФУНКЦИЯ: настройка обработчиков плеера
    function setupPlayerListeners(movie) {
        if (PLAYER_LISTENERS_ADDED) return;
        
        // Обработчик изменения эпизода
        function handlePlayerChange() {
            console.log("[ContinueWatch] Player change event");
            // Сохраняем позицию перед сменой эпизода
            saveCurrentPosition(true);
            
            // Обновляем хэш для нового эпизода
            setTimeout(function() {
                // Пытаемся получить текущий элемент из плейлиста
                if (Lampa.PlayerPlaylist && Lampa.PlayerPlaylist.current) {
                    var current = Lampa.PlayerPlaylist.current();
                    if (current) {
                        updateCurrentHash(movie, current.season, current.episode);
                        console.log("[ContinueWatch] Episode changed to S" + current.season + "E" + current.episode);
                    }
                }
            }, 100);
        }
        
        // Обработчик остановки плеера
        function handlePlayerStop() {
            console.log("[ContinueWatch] Player stop event");
            // Сохраняем позицию при остановке
            saveCurrentPosition(true);
            // Очищаем интервалы
            cleanupPlayerListeners();
        }
        
        // Добавляем обработчики
        Lampa.Player.listener.follow('change', handlePlayerChange);
        Lampa.Player.listener.follow('stop', handlePlayerStop);
        
        // Периодическое сохранение позиции
        SAVE_INTERVAL = setInterval(function() {
            var video = Lampa.PlayerVideo.video();
            // Сохраняем, если видео есть и оно не на паузе
            if (video && !video.paused) {
                saveCurrentPosition(false);
            }
        }, 5000); // Сохраняем каждые 5 секунд
        
        PLAYER_LISTENERS_ADDED = true;
    }

    function patchPlayer() {
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (params) {
            if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                if (movie) {
                    var baseTitle = movie.number_of_seasons ? movie.original_name || movie.original_title : movie.original_title || movie.original_name;
                    if (baseTitle) {
                        var hash;
                        if (params.season && params.episode) {
                            var separator = params.season > 10 ? ':' : '';
                            hash = Lampa.Utils.hash([params.season, separator, params.episode, baseTitle].join(''));
                        } else {
                            hash = Lampa.Utils.hash(baseTitle);
                        }
                        if (hash) {
                            CURRENT_HASH = hash;
                            
                            var matchFile = params.url && params.url.match(/\/stream\/([^?]+)/);
                            var matchLink = params.url && params.url.match(/[?&]link=([^&]+)/);
                            var matchIndex = params.url && params.url.match(/[?&]index=(\d+)/);
                            if (matchFile && matchLink) {
                                var store = getParams();
                                var episodeData = {
                                    file_name: decodeURIComponent(matchFile[1]),
                                    torrent_link: matchLink[1],
                                    file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                    title: baseTitle,
                                    season: params.season,
                                    episode: params.episode,
                                    episode_title: params.title || params.episode_title,
                                    timestamp: Date.now()
                                };
                                store[hash] = episodeData;
                                setParams(store);
                                
                                console.log("[ContinueWatch] Saved episode data:", episodeData);
                            }
                        }
                    }
                }
            }
            return originalPlay.call(this, params);
        };
    }

    // ========================================================================
    // 3. ИНТЕГРАЦИЯ КНОПКИ
    // ========================================================================

    function handleContinueClick(movieData) {
        console.log("[ContinueWatch] Continue button clicked for:", movieData.original_name || movieData.title);
        var params = getStreamParams(movieData);
        if (!params) {
            Lampa.Noty.show('Нет сохраненной истории');
            return;
        }
        launchPlayer(movieData, params);
    }

    function setupContinueButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                setTimeout(function() {
                    var activity = e.object.activity;
                    var render = activity.render();
                    
                    if (render.find('.button--continue-watch').length) return;

                    var params = getStreamParams(e.data.movie);
                    
                    var percent = 0;
                    var timeStr = "";

                    if (params) {
                        var title = e.data.movie.number_of_seasons ? 
                            (e.data.movie.original_name || e.data.movie.original_title) : 
                            (e.data.movie.original_title || e.data.movie.original_name);
                        
                        var hash = Lampa.Utils.hash(title);
                        if (params.season && params.episode) {
                            var separator = params.season > 10 ? ':' : '';
                            hash = Lampa.Utils.hash([params.season, separator, params.episode, title].join(''));
                        }
                        
                        var view = Lampa.Timeline.view(hash);
                        if (view) {
                            percent = view.percent || 0;
                            timeStr = formatTime(view.time || 0);
                        }
                    }

                    var labelText = 'Продолжить';
                    if (params && params.season && params.episode) {
                        labelText += ' S' + params.season + ' E' + params.episode;
                    }
                    
                    if (timeStr) {
                        labelText += ' (' + timeStr + ')';
                    }

                    var continueButtonHtml = `
                        <div class="full-start__button selector button--continue-watch">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                                <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
                                <circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" 
                                    stroke-dasharray="${(percent * 65.97 / 100).toFixed(2)} 65.97" transform="rotate(-90 12 12)"/>
                            </svg>
                            <span>${labelText}</span>
                        </div>
                    `;

                    var continueBtn = $(continueButtonHtml);
                    
                    continueBtn.on('hover:enter', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        handleContinueClick(e.data.movie);
                    });

                    var torrentBtn = render.find('.view--torrent').last();
                    var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

                    if (torrentBtn.length) {
                        torrentBtn.after(continueBtn);
                    } else if (buttonsContainer.length) {
                        buttonsContainer.append(continueBtn);
                    } else {
                        render.find('.full-start__button').last().after(continueBtn);
                    }

                    Lampa.Controller.toggle('content'); 
                    console.log("[ContinueWatch] v31 (Fixed PlayerVideo Methods) - Button added");

                }, 100); 
            }
        });
    }

    function add() {
        patchPlayer();
        cleanupOldParams();
        setupContinueButton();
    }

    function startPlugin() {
        window.plugin_continue_watch_ready = true;
        if (window.appready) {
            add();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') add();
            });
        }
    }

    if (!window.plugin_continue_watch_ready) startPlugin();
})();
