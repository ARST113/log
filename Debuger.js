(function () {
    'use strict';

    // ========================================================================
    // ПЕРЕМЕННЫЕ
    // ========================================================================
    var MEMORY_CACHE = null;
    var TORRSERVER_CACHE = null;
    var SAVE_TIMEOUT = null;
    var CURRENT_HASH = null;
    var CURRENT_MOVIE = null;
    var CURRENT_TIMELINE_VIEW = null;

    var PLAYER_START_HANDLER = null;
    var PLAYER_DESTROY_HANDLER = null;
    var LISTENERS_INITIALIZED = false;

    // Флаги защиты
    var IS_BUILDING_PLAYLIST = false;
    var LAUNCH_DEBOUNCE = null;

    // ========================================================================
    // 1. ХРАНИЛИЩЕ
    // ========================================================================
    
    Lampa.Storage.sync('continue_watch_params', 'object_object');

    Lampa.Storage.listener.follow('change', function(e) {
        if (e.name === 'continue_watch_params') MEMORY_CACHE = null;
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

    function updateContinueWatchParams(hash, data) {
        var params = getParams();
        if (!params[hash]) params[hash] = {};
        for (var key in data) { params[hash][key] = data[key]; }
        params[hash].timestamp = Date.now();
        setParams(params);
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
    // 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ========================================================================

    function formatTime(seconds) {
        if (!seconds) return '';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        return h > 0 ? h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s : m + ':' + (s < 10 ? '0' : '') + s;
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
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        if (!title) return null;
        var params = getParams();
        
        if (movie.number_of_seasons) {
            var latestEpisode = null;
            var latestTimestamp = 0;
            for (var hash in params) {
                var p = params[hash];
                if (p.title === title && p.season && p.episode) {
                    if (p.timestamp && p.timestamp > latestTimestamp) {
                        latestTimestamp = p.timestamp;
                        latestEpisode = p;
                    }
                }
            }
            return latestEpisode;
        } else {
            var hash = Lampa.Utils.hash(title);
            return params[hash] || null;
        }
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
        query.push('play');
        return url + '?' + query.join('&');
    }

    function updateCurrentHash(movie, season, episode) {
        if (!movie) return;
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        if (movie.number_of_seasons && season && episode) {
            var separator = season > 10 ? ':' : '';
            CURRENT_HASH = Lampa.Utils.hash([season, separator, episode, title].join(''));
        } else {
            CURRENT_HASH = Lampa.Utils.hash(title);
        }
    }

    function getCurrentEpisodeFromUrl(url) {
        if (!url) return null;
        try {
            var match = url.match(/\/stream\/([^?]+)/);
            if (match) {
                var filename = decodeURIComponent(match[1]);
                var seasonMatch = filename.match(/S(\d+)/i);
                var episodeMatch = filename.match(/E(\d+)/i);
                if (seasonMatch && episodeMatch) {
                    return { season: parseInt(seasonMatch[1]), episode: parseInt(episodeMatch[1]) };
                }
            }
        } catch (e) {}
        return null;
    }

    // ========================================================================
    // 3. ГЛОБАЛЬНОЕ ОТСЛЕЖИВАНИЕ
    // ========================================================================
    
    function setupTimelineSaving() {
        Lampa.Timeline.listener.follow('update', function(e) {
            var hash = e.data.hash;
            var road = e.data.road;
            if (hash && road) {
                var params = getParams();
                if (params[hash]) {
                    updateContinueWatchParams(hash, {
                        file_name: params[hash].file_name,
                        torrent_link: params[hash].torrent_link,
                        file_index: params[hash].file_index,
                        title: params[hash].title,
                        season: params[hash].season,
                        episode: params[hash].episode,
                        episode_title: params[hash].episode_title,
                        percent: road.percent,
                        time: road.time,
                        duration: road.duration
                    });
                }
            }
        });
    }

    function wrapTimelineHandler(timeline, params) {
        if (!timeline) return timeline;
        if (timeline._wrapped) return timeline;
        var originalHandler = timeline.handler;
        timeline.handler = function (percent, time, duration) {
            if (originalHandler) originalHandler(percent, time, duration);
            updateContinueWatchParams(timeline.hash, {
                file_name: params.file_name,
                torrent_link: params.torrent_link,
                file_index: params.file_index,
                title: params.title,
                season: params.season,
                episode: params.episode,
                episode_title: params.episode_title,
                percent: percent,
                time: time,
                duration: duration
            });
        };
        timeline._wrapped = true;
        return timeline;
    }

    // ========================================================================
    // 4. СБОРКА ПЛЕЙЛИСТА (RETRY SYSTEM)
    // ========================================================================
    function buildPlaylist(movie, currentParams, currentUrl, quietMode, callback) {  
        if (IS_BUILDING_PLAYLIST && !quietMode) {
            callback([]);
            return;
        }
        
        if(!quietMode) IS_BUILDING_PLAYLIST = true;

        var title = movie.original_name || movie.original_title || movie.name || movie.title;  
        var allParams = getParams();
        var playlist = [];  
        var SAFETY_TIMER = null;

        var finalize = function(resultList) {
            if (SAFETY_TIMER) { clearTimeout(SAFETY_TIMER); SAFETY_TIMER = null; }
            if (!quietMode) {
                Lampa.Loading.stop();
                IS_BUILDING_PLAYLIST = false;
            }
            callback(resultList);
        };

        // 1. Из кэша (мгновенно)
        for (var hash in allParams) {  
            var p = allParams[hash];  
            if (p.title === title && p.season && p.episode) {  
                var separator = p.season > 10 ? ':' : '';  
                var episodeHash = Lampa.Utils.hash([p.season, separator, p.episode, title].join(''));  
                var timeline = Lampa.Timeline.view(episodeHash);  
                
                if (timeline) {
                    wrapTimelineHandler(timeline, {
                        season: p.season,
                        episode: p.episode,
                        title: title,
                        file_name: p.file_name,
                        torrent_link: p.torrent_link,
                        file_index: p.file_index
                    });
                }
                
                var isCurrent = (p.season === currentParams.season && p.episode === currentParams.episode);
                var item = {  
                    title: p.episode_title || ('S' + p.season + ' E' + p.episode),
                    season: p.season,  
                    episode: p.episode,  
                    timeline: timeline,
                    torrent_hash: p.torrent_hash || p.torrent_link,
                    card: movie,
                    url: buildStreamUrl(p),
                    position: isCurrent ? (timeline ? (timeline.time || -1) : -1) : -1
                };  
                if (isCurrent) item.url = currentUrl;
                playlist.push(item);  
            }  
        }

        if (!currentParams.torrent_link) {
            finalize(playlist);
            return;
        }

        // 2. Запрос к TorrServer с усиленным Retry
        var isCancelled = false;
        var retryCount = 0;
        var maxRetries = 10; 

        if (!quietMode) {
            Lampa.Loading.start(function() {
                isCancelled = true;
                finalize([]); 
            }, 'Подготовка плейлиста...');
            
            // Предохранитель 25 секунд
            SAFETY_TIMER = setTimeout(function() {
                if(!isCancelled) {
                    console.log("[ContinueWatch] Timeout. Finalizing with what we have.");
                    finalize(playlist);
                }
            }, 25000);
        }

        Lampa.Torserver.hash({
            link: currentParams.torrent_link,
            title: title,
            poster: movie.poster_path,
            data: { lampa: true, movie: movie }
        }, function(torrent) {
            if (isCancelled) return;
            if (!quietMode) Lampa.Loading.setText('Ожидание метаданных...');

            var fetchFiles = function() {
                if (isCancelled) return;

                Lampa.Torserver.files(torrent.hash, function(json) {
                    if (isCancelled) return;

                    // ПРОВЕРКА: Пришел ли список файлов?
                    if (json && json.file_stats && json.file_stats.length > 0) {
                        
                        var totalFiles = json.file_stats.length;
                        var processedCount = 0;

                        json.file_stats.forEach(function(file) {
                            if (isCancelled) return;
                            processedCount++;
                            if (!quietMode && (processedCount % 10 === 0)) {
                                Lampa.Loading.setText('Обработка: ' + Math.round((processedCount / totalFiles) * 100) + '%');
                            }

                            try {
                                var episodeValue = null;
                                var seasonValue = null;

                                if (movie.number_of_seasons) {
                                    var fileName = file.path.split('/').pop();
                                    var matchStart = fileName.match(/^(\d{1,3})\./);
                                    if (matchStart) {
                                        episodeValue = parseInt(matchStart[1]);
                                        seasonValue = currentParams.season;
                                    }
                                    if (!episodeValue) {
                                        var fileInfo = { movie: movie, files: [file], filename: fileName, path: file.path, is_file: true };
                                        var info = Lampa.Torserver.parse(fileInfo);
                                        if (info.season === currentParams.season) {
                                            episodeValue = info.episode;
                                            seasonValue = info.season;
                                        }
                                    }
                                }

                                if ((episodeValue && seasonValue === currentParams.season) || !movie.number_of_seasons) {
                                    var alreadyExists = false;
                                    if (movie.number_of_seasons) {
                                        alreadyExists = playlist.some(function(p) { return p.episode === episodeValue; });
                                    }

                                    if (!alreadyExists) {
                                        var episodeHash;
                                        if (movie.number_of_seasons) {
                                            var separator = seasonValue > 10 ? ':' : '';
                                            episodeHash = Lampa.Utils.hash([seasonValue, separator, episodeValue, title].join(''));
                                        } else {
                                            episodeHash = Lampa.Utils.hash(title);
                                        }

                                        var timeline = Lampa.Timeline.view(episodeHash);
                                        if (!timeline) timeline = { hash: episodeHash, percent: 0, time: 0, duration: 0 };
                                        
                                        var tempParams = getParams();
                                        if (!tempParams[episodeHash]) {
                                            updateContinueWatchParams(episodeHash, {
                                                file_name: file.path,
                                                torrent_link: currentParams.torrent_link,
                                                file_index: file.id || 0,
                                                title: title,
                                                season: seasonValue,
                                                episode: episodeValue,
                                                percent: 0, time: 0, duration: 0
                                            });
                                        }

                                        var isCurrent = (seasonValue === currentParams.season && episodeValue === currentParams.episode);

                                        var item = {
                                            title: movie.number_of_seasons ? ('S' + seasonValue + ' E' + episodeValue) : (movie.title || title),
                                            season: seasonValue,
                                            episode: episodeValue,
                                            timeline: timeline,
                                            torrent_hash: currentParams.torrent_link,
                                            card: movie,
                                            url: buildStreamUrl({
                                                file_name: file.path,
                                                torrent_link: currentParams.torrent_link,
                                                file_index: file.id || 0,
                                                title: title,
                                                season: seasonValue,
                                                episode: episodeValue
                                            }),
                                            position: isCurrent ? (timeline ? (timeline.time || -1) : -1) : -1
                                        };
                                        
                                        if (movie.number_of_seasons) {
                                            if (episodeValue === currentParams.episode) item.url = currentUrl;
                                        } else if (file.id === currentParams.file_index) {
                                            item.url = currentUrl;
                                        }
                                        
                                        playlist.push(item);
                                    }
                                }
                            } catch (e) {}
                        });
                        
                        if (isCancelled) return;
                        if (movie.number_of_seasons) playlist.sort(function(a, b) { return a.episode - b.episode; });
                        finalize(playlist);

                    } else {
                        // Retry
                        if (retryCount < maxRetries) {
                            retryCount++;
                            if (!quietMode) Lampa.Loading.setText('Ожидание файлов (попытка ' + retryCount + ')...');
                            setTimeout(fetchFiles, 2000);
                        } else {
                            finalize(playlist);
                        }
                    }
                }, function() { 
                    if (retryCount < maxRetries) {
                        retryCount++;
                        if (!quietMode) Lampa.Loading.setText('Сервер занят (попытка ' + retryCount + ')...');
                        setTimeout(fetchFiles, 2000);
                    } else {
                        if(!isCancelled) finalize(playlist); 
                    }
                });
            };
            fetchFiles();
        }, function() { 
            if(!isCancelled) finalize(playlist); 
        });
    }

    // ========================================================================
    // 5. ЗАПУСК ПЛЕЕРА
    // ========================================================================
    function launchPlayer(movie, params) {  
        var url = buildStreamUrl(params);  
        if (!url) return;  
        
        CURRENT_MOVIE = movie;  
        updateCurrentHash(movie, params.season, params.episode);  
        
        var timeline = Lampa.Timeline.view(CURRENT_HASH);  
        if (!timeline || (!timeline.time && !timeline.percent)) {
            timeline = timeline || { hash: CURRENT_HASH };
            timeline.time = params.time || 0;  
            timeline.percent = params.percent || 0;  
            timeline.duration = params.duration || 0;  
        } else if (params.time > timeline.time) {
            timeline.time = params.time;
            timeline.percent = params.percent;
            timeline.duration = params.duration;
        }
        
        wrapTimelineHandler(timeline, params);  
        CURRENT_TIMELINE_VIEW = timeline;  
        
        updateContinueWatchParams(CURRENT_HASH, {
            percent: timeline.percent,
            time: timeline.time,
            duration: timeline.duration
        });

        var player_type = Lampa.Storage.field('player_torrent');
        var isExternalPlayer = (player_type !== 'inner' && player_type !== 'lampa');

        if (isExternalPlayer) {
            buildPlaylist(movie, params, url, false, function(playlist) {
                if (playlist.length === 0 && !params.torrent_link) return;
                
                var playerData = {    
                    url: url,    
                    title: params.episode_title || params.title || movie.title,  
                    card: movie,    
                    torrent_hash: params.torrent_link,    
                    timeline: timeline,  
                    season: params.season,  
                    episode: params.episode,  
                    playlist: playlist.length ? playlist : null,
                    position: timeline.time || -1  
                };  
                Lampa.Player.play(playerData);
                Lampa.Player.callback(function() { Lampa.Controller.toggle('content'); });  
            });
        } else {
            // Внутренний плеер: ЗАПУСК СРАЗУ
            var tempPlaylist = [];
            var currentItem = {
                url: url,
                title: params.episode_title || ('S' + params.season + ' E' + params.episode),
                timeline: timeline,
                season: params.season,
                episode: params.episode,
                card: movie
            };
            tempPlaylist.push(currentItem);
            if (movie.number_of_seasons) {
                tempPlaylist.push({ title: 'Загрузка списка...', url: '', timeline: {} });
            }

            var playerData = {    
                url: url,    
                title: params.episode_title || params.title || movie.title,  
                card: movie,    
                torrent_hash: params.torrent_link,    
                timeline: timeline,
                season: params.season,
                episode: params.episode,
                playlist: tempPlaylist
            };
            
            if (timeline.time > 0) Lampa.Noty.show('Восстанавливаем: ' + formatTime(timeline.time));
            
            Lampa.Player.play(playerData);
            setupPlayerListeners();
            Lampa.Player.callback(function() { Lampa.Controller.toggle('content'); });

            if (movie.number_of_seasons && params.season && params.episode) {
                console.log("[ContinueWatch] Starting background playlist build...");
                buildPlaylist(movie, params, url, true, function(playlist) {
                    console.log("[ContinueWatch] Background playlist ready:", playlist.length);
                    if (playlist.length > 1) {
                         Lampa.Player.playlist(playlist);
                         Lampa.Noty.show('Плейлист загружен (' + playlist.length + ' с.)');
                    }
                });
            }
        }
    }

    function setupPlayerListeners() {
        if (LISTENERS_INITIALIZED) cleanupPlayerListeners();
        PLAYER_START_HANDLER = function(data) {
            if (data.card) {
                updateCurrentHash(data.card, data.season, data.episode);
                updateContinueWatchParams(CURRENT_HASH, {
                    file_name: decodeURIComponent(data.url.match(/\/stream\/([^?]+)/)[1]),
                    title: data.card.original_name || data.card.original_title || data.card.title,
                    season: data.season,
                    episode: data.episode
                });
            }
        };
        PLAYER_DESTROY_HANDLER = function() { cleanupPlayerListeners(); };
        Lampa.Player.listener.follow('start', PLAYER_START_HANDLER);
        Lampa.Player.listener.follow('destroy', PLAYER_DESTROY_HANDLER);
        LISTENERS_INITIALIZED = true;
    }

    function cleanupPlayerListeners() {
        if (PLAYER_START_HANDLER) { Lampa.Player.listener.remove('start', PLAYER_START_HANDLER); PLAYER_START_HANDLER = null; }
        if (PLAYER_DESTROY_HANDLER) { Lampa.Player.listener.remove('destroy', PLAYER_DESTROY_HANDLER); PLAYER_DESTROY_HANDLER = null; }
        LISTENERS_INITIALIZED = false;
    }

    function patchPlayer() {
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (params) {
            if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                if (movie) {
                    var baseTitle = movie.original_name || movie.original_title || movie.title;
                    if (baseTitle) {
                        var hash;
                        var season = params.season;
                        var episode = params.episode;
                        
                        if (movie.number_of_seasons) {
                            if (!season || !episode) {
                                var episodeInfo = getCurrentEpisodeFromUrl(params.url);
                                if (episodeInfo) { season = episodeInfo.season; episode = episodeInfo.episode; }
                            }
                            if (season && episode) {
                                var separator = season > 10 ? ':' : '';
                                hash = Lampa.Utils.hash([season, separator, episode, baseTitle].join(''));
                            } else { hash = Lampa.Utils.hash(baseTitle); }
                        } else {
                            hash = Lampa.Utils.hash(baseTitle);
                        }
                        
                        if (hash) {
                            CURRENT_HASH = hash;
                            var matchFile = params.url && params.url.match(/\/stream\/([^?]+)/);
                            var matchLink = params.url && params.url.match(/[?&]link=([^&]+)/);
                            var matchIndex = params.url && params.url.match(/[?&]index=(\d+)/);
                            
                            if (matchFile && matchLink) {
                                updateContinueWatchParams(hash, {
                                    file_name: decodeURIComponent(matchFile[1]),
                                    torrent_link: matchLink[1],
                                    file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                    title: baseTitle,
                                    season: season,
                                    episode: episode,
                                    episode_title: params.title || params.episode_title
                                });
                            }
                        }
                    }
                }
            }
            return originalPlay.call(this, params);
        };
    }

    // ========================================================================
    // 6. КНОПКА (С ПРЕДЗАГРУЗКОЙ)
    // ========================================================================

    function handleContinueClick(movieData) {
        if (LAUNCH_DEBOUNCE) return;
        var params = getStreamParams(movieData);
        if (!params) { Lampa.Noty.show('Нет сохраненной истории'); return; }
        LAUNCH_DEBOUNCE = setTimeout(function() { LAUNCH_DEBOUNCE = null; }, 2000);
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
                        // ПРЕДЗАГРУЗКА ДАННЫХ TORRSERVER
                        if (params.torrent_link) {
                            console.log("[ContinueWatch] Preloading metadata...");
                            Lampa.Torserver.files(params.torrent_link, function(){}, function(){});
                        }

                        var title = e.data.movie.original_name || e.data.movie.original_title || e.data.movie.title;
                        var hash;
                        
                        if (e.data.movie.number_of_seasons && params.season && params.episode) {
                            var separator = params.season > 10 ? ':' : '';
                            hash = Lampa.Utils.hash([params.season, separator, params.episode, title].join(''));
                        } else { 
                            hash = Lampa.Utils.hash(title); 
                        }
                        
                        var view = Lampa.Timeline.view(hash);
                        if (view && view.percent > 0) {
                            percent = view.percent;
                            timeStr = formatTime(view.time);
                        } else if (params.time) {
                            percent = params.percent || 0;
                            timeStr = formatTime(params.time);
                        }
                    }

                    var labelText = 'Продолжить';
                    if (params && params.season && params.episode) {
                        labelText += ' S' + params.season + ' E' + params.episode;
                    }
                    if (timeStr) labelText += ' (' + timeStr + ')';

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

                    if (torrentBtn.length) torrentBtn.after(continueBtn);
                    else if (buttonsContainer.length) buttonsContainer.append(continueBtn);
                    else render.find('.full-start__button').last().after(continueBtn);

                    Lampa.Controller.toggle('content'); 
                    console.log("[ContinueWatch] v69 Preload Edition Ready");
                }, 100); 
            }
        });
    }

    function add() {
        patchPlayer();
        cleanupOldParams();
        setupContinueButton();
        setupTimelineSaving();
    }

    if (window.appready) add();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') add(); });
})();
