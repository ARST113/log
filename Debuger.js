(function () {
    'use strict';

    // ========================================================================
    // КОНФИГУРАЦИЯ И КЭШ
    // ========================================================================
    var STORAGE_KEY = 'continue_watch_params';
    var MEMORY_CACHE = null;
    var TORRSERVER_CACHE = null;
    var FILES_CACHE = {}; // Кэш списков файлов (хеш торрента -> список файлов)
    
    var TIMERS = {
        save: null,
        debounce_click: null,
        loader: null
    };

    var LISTENERS = {
        player_start: null,
        player_destroy: null,
        initialized: false
    };

    // Флаги состояния
    var STATE = {
        building_playlist: false
    };

    // ========================================================================
    // 1. ХРАНИЛИЩЕ И НАСТРОЙКИ
    // ========================================================================
    
    Lampa.Storage.sync(STORAGE_KEY, 'object_object');

    Lampa.Storage.listener.follow('change', function(e) {
        if (e.name === STORAGE_KEY) MEMORY_CACHE = null;
        if (e.name === 'torrserver_url' || e.name === 'torrserver_url_two' || e.name === 'torrserver_use_link') TORRSERVER_CACHE = null;
    });

    function getParams() {
        if (!MEMORY_CACHE) MEMORY_CACHE = Lampa.Storage.get(STORAGE_KEY, {});
        return MEMORY_CACHE;
    }

    function setParams(data) {
        MEMORY_CACHE = data;
        clearTimeout(TIMERS.save);
        TIMERS.save = setTimeout(function() {
            Lampa.Storage.set(STORAGE_KEY, data);
        }, 1000); // Увеличили задержку записи для снижения IO
    }

    function updateContinueWatchParams(hash, data) {
        var params = getParams();
        if (!params[hash]) params[hash] = {};
        
        // Обновляем только изменившиеся поля
        var changed = false;
        for (var key in data) { 
            if (params[hash][key] !== data[key]) {
                params[hash][key] = data[key]; 
                changed = true;
            }
        }
        
        if (changed || !params[hash].timestamp) {
            params[hash].timestamp = Date.now();
            setParams(params);
        }
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
        // Очистка раз в 60 дней
        setTimeout(function() {
            try {
                var params = getParams();
                var now = Date.now();
                var changed = false;
                var max_age = 60 * 24 * 60 * 60 * 1000;
                
                Object.keys(params).forEach(function(hash) {
                    if (params[hash].timestamp && now - params[hash].timestamp > max_age) {
                        delete params[hash];
                        changed = true;
                    }
                });
                
                if (changed) setParams(params);
            } catch (e) { console.error('CleanUp Error', e); }
        }, 10000);
    }

    function getStreamParams(movie) {
        if (!movie) return null;
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        if (!title) return null;
        
        var params = getParams();
        
        if (movie.number_of_seasons) {
            // Для сериалов ищем последнюю просмотренную серию
            var latestEpisode = null;
            var latestTimestamp = 0;
            
            // Используем Object.keys для более безопасного перебора
            Object.keys(params).forEach(function(hash) {
                var p = params[hash];
                if (p.title === title && p.season && p.episode) {
                    if (p.timestamp && p.timestamp > latestTimestamp) {
                        latestTimestamp = p.timestamp;
                        latestEpisode = p;
                    }
                }
            });
            return latestEpisode;
        } else {
            // Для фильмов просто по хешу названия
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

    function generateHash(movie, season, episode) {
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        if (movie.number_of_seasons && season && episode) {
            var separator = season > 10 ? ':' : '';
            return Lampa.Utils.hash([season, separator, episode, title].join(''));
        }
        return Lampa.Utils.hash(title);
    }

    // ========================================================================
    // 3. ОТСЛЕЖИВАНИЕ ПРОГРЕССА
    // ========================================================================
    
    function setupTimelineSaving() {
        Lampa.Timeline.listener.follow('update', function(e) {
            var hash = e.data.hash;
            var road = e.data.road;
            // Сохраняем только если есть хеш и прогресс валиден
            if (hash && road && typeof road.percent !== 'undefined') {
                var params = getParams();
                if (params[hash]) {
                    updateContinueWatchParams(hash, {
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
        if (timeline._wrapped_continue) return timeline;
        
        var originalHandler = timeline.handler;
        // Троттлинг обновлений (не чаще раза в секунду)
        var lastUpdate = 0;

        timeline.handler = function (percent, time, duration) {
            if (originalHandler) originalHandler(percent, time, duration);
            
            var now = Date.now();
            if (now - lastUpdate > 1000) {
                lastUpdate = now;
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
            }
        };
        timeline._wrapped_continue = true;
        return timeline;
    }

    // ========================================================================
    // 4. СБОРКА ПЛЕЙЛИСТА (ОПТИМИЗИРОВАНО)
    // ========================================================================
    function buildPlaylist(movie, currentParams, currentUrl, quietMode, callback) {  
        if (STATE.building_playlist && !quietMode) {
            callback([]);
            return;
        }
        
        if(!quietMode) STATE.building_playlist = true;

        var title = movie.original_name || movie.original_title || movie.name || movie.title;  
        var allParams = getParams();
        var playlist = [];  
        var ABORT_CONTROLLER = false;

        var finalize = function(resultList) {
            ABORT_CONTROLLER = true;
            if (!quietMode) {
                Lampa.Loading.stop();
                STATE.building_playlist = false;
            }
            callback(resultList);
        };

        // 1. Быстрая сборка из кэша плагина (Lampa Storage)
        for (var hash in allParams) {  
            var p = allParams[hash];  
            if (p.title === title && p.season && p.episode) {  
                var episodeHash = generateHash(movie, p.season, p.episode);
                var timeline = Lampa.Timeline.view(episodeHash);  
                
                if (timeline) {
                    wrapTimelineHandler(timeline, p);
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

        // 2. Запрос к TorrServer с кэшированием и экспоненциальным Backoff
        
        var processFiles = function(files) {
            // Кэшируем результат
            if (!FILES_CACHE[currentParams.torrent_link]) {
                FILES_CACHE[currentParams.torrent_link] = files;
                // Очистка кэша через 5 минут
                setTimeout(function(){ delete FILES_CACHE[currentParams.torrent_link]; }, 300000);
            }

            var uniqueEpisodes = new Set();
            playlist.forEach(function(p) { uniqueEpisodes.add(p.season + '_' + p.episode); });

            files.forEach(function(file) {
                if (ABORT_CONTROLLER) return;
                try {
                    var episodeInfo = Lampa.Torserver.parse({ 
                        movie: movie, 
                        files: [file], 
                        filename: file.path.split('/').pop(), 
                        path: file.path, 
                        is_file: true 
                    });

                    // Фильтрация: берем только нужный сезон или если это фильм
                    if (!movie.number_of_seasons || (episodeInfo.season === currentParams.season)) {
                        var epKey = episodeInfo.season + '_' + episodeInfo.episode;
                        
                        // Если эпизода еще нет в плейлисте (из истории)
                        if (!uniqueEpisodes.has(epKey)) {
                            var episodeHash = generateHash(movie, episodeInfo.season, episodeInfo.episode);
                            var timeline = Lampa.Timeline.view(episodeHash);
                            
                            if (!timeline) timeline = { hash: episodeHash, percent: 0, time: 0, duration: 0 };
                            
                            // Создаем запись параметров, если её нет
                            if (!allParams[episodeHash]) {
                                updateContinueWatchParams(episodeHash, {
                                    file_name: file.path,
                                    torrent_link: currentParams.torrent_link,
                                    file_index: file.id || 0,
                                    title: title,
                                    season: episodeInfo.season,
                                    episode: episodeInfo.episode,
                                    percent: 0, time: 0, duration: 0
                                });
                            }

                            var isCurrent = (episodeInfo.season === currentParams.season && episodeInfo.episode === currentParams.episode);
                            
                            var item = {
                                title: movie.number_of_seasons ? ('S' + episodeInfo.season + ' E' + episodeInfo.episode) : (movie.title || title),
                                season: episodeInfo.season,
                                episode: episodeInfo.episode,
                                timeline: timeline,
                                torrent_hash: currentParams.torrent_link,
                                card: movie,
                                url: buildStreamUrl({
                                    file_name: file.path,
                                    torrent_link: currentParams.torrent_link,
                                    file_index: file.id || 0
                                }),
                                position: isCurrent ? (timeline ? (timeline.time || -1) : -1) : -1
                            };
                            
                            if (isCurrent || (file.id === currentParams.file_index && !movie.number_of_seasons)) {
                                item.url = currentUrl;
                            }
                            
                            playlist.push(item);
                            uniqueEpisodes.add(epKey);
                        }
                    }
                } catch (e) {}
            });
            
            if (movie.number_of_seasons) playlist.sort(function(a, b) { return a.episode - b.episode; });
            finalize(playlist);
        };

        // Если есть в кэше - отдаем сразу
        if (FILES_CACHE[currentParams.torrent_link]) {
            processFiles(FILES_CACHE[currentParams.torrent_link]);
            return;
        }

        // Если нет в кэше - запрашиваем
        if (!quietMode) Lampa.Loading.start(function() { ABORT_CONTROLLER = true; finalize([]); }, 'Подготовка...');

        Lampa.Torserver.hash({
            link: currentParams.torrent_link,
            title: title,
            poster: movie.poster_path,
            data: { lampa: true, movie: movie }
        }, function(torrent) {
            if (ABORT_CONTROLLER) return;
            
            var retryCount = 0;
            var maxRetries = 5; 

            var fetchFiles = function() {
                if (ABORT_CONTROLLER) return;

                Lampa.Torserver.files(torrent.hash, function(json) {
                    if (ABORT_CONTROLLER) return;

                    if (json && json.file_stats && json.file_stats.length > 0) {
                        processFiles(json.file_stats);
                    } else if (retryCount < maxRetries) {
                        retryCount++;
                        var delay = retryCount * 1000; // 1s, 2s, 3s...
                        if (!quietMode) Lampa.Loading.setText('Ожидание файлов (' + retryCount + '/' + maxRetries + ')...');
                        setTimeout(fetchFiles, delay);
                    } else {
                        finalize(playlist);
                    }
                }, function() { 
                    if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(fetchFiles, retryCount * 1000);
                    } else {
                        if(!ABORT_CONTROLLER) finalize(playlist); 
                    }
                });
            };
            fetchFiles();
        }, function() { 
            if(!ABORT_CONTROLLER) finalize(playlist); 
        });
    }

    // ========================================================================
    // 5. ЗАПУСК ПЛЕЕРА
    // ========================================================================
    function launchPlayer(movie, params) {  
        var url = buildStreamUrl(params);  
        if (!url) return;  
        
        var currentHash = generateHash(movie, params.season, params.episode);
        var timeline = Lampa.Timeline.view(currentHash);  
        
        if (!timeline || (!timeline.time && !timeline.percent)) {
            timeline = timeline || { hash: currentHash };
            timeline.time = params.time || 0;  
            timeline.percent = params.percent || 0;  
            timeline.duration = params.duration || 0;  
        } else if (params.time > timeline.time) {
            // Если в сохраненных параметрах время больше чем в timeline (синхронизация)
            timeline.time = params.time;
            timeline.percent = params.percent;
        }
        
        // Оборачиваем таймлайн сразу, чтобы не потерять прогресс
        wrapTimelineHandler(timeline, params);  
        
        updateContinueWatchParams(currentHash, {
            percent: timeline.percent,
            time: timeline.time,
            duration: timeline.duration
        });

        // Конфигурация плеера
        var player_type = Lampa.Storage.field('player_torrent');
        var force_inner = (player_type === 'inner');
        var isExternalPlayer = !force_inner && (player_type !== 'lampa');

        var playerData = {    
            url: url,    
            title: params.episode_title || params.title || movie.title,  
            card: movie,    
            torrent_hash: params.torrent_link,    
            timeline: timeline,  
            season: params.season,  
            episode: params.episode,  
            position: timeline.time || -1  
        };

        // Хак для встроенного плеера на Android
        if (force_inner) {
            delete playerData.torrent_hash; // Убираем хеш, чтобы Android не перехватил Intent
            
            var original_platform_is = Lampa.Platform.is;
            Lampa.Platform.is = function(what) {
                if (what === 'android') return false; 
                return original_platform_is(what);
            };

            setTimeout(function() {
                Lampa.Platform.is = original_platform_is;
            }, 500);
            
            Lampa.Storage.set('internal_torrclient', true);
        }

        if (isExternalPlayer) {
            // Для внешнего плеера собираем плейлист сразу (блокирующе)
            buildPlaylist(movie, params, url, false, function(playlist) {
                if (playlist.length === 0 && !params.torrent_link) return;
                playerData.playlist = playlist.length ? playlist : null;
                
                Lampa.Player.play(playerData);
                Lampa.Player.callback(function() { Lampa.Controller.toggle('content'); });  
            });
        } else {
            // Для встроенного запускаем сразу и грузим плейлист фоном
            var tempPlaylist = [{
                url: url,
                title: params.episode_title || ('S' + params.season + ' E' + params.episode),
                timeline: timeline,
                season: params.season,
                episode: params.episode,
                card: movie
            }];
            
            if (movie.number_of_seasons) {
                tempPlaylist.push({ title: 'Загрузка списка серий...', url: '', timeline: {} });
            }
            playerData.playlist = tempPlaylist;

            if (timeline.time > 0) Lampa.Noty.show('Восстанавливаем: ' + formatTime(timeline.time));
            
            Lampa.Player.play(playerData);
            setupPlayerListeners();
            Lampa.Player.callback(function() { Lampa.Controller.toggle('content'); });

            // Фоновая загрузка плейлиста
            if (movie.number_of_seasons && params.season && params.episode) {
                buildPlaylist(movie, params, url, true, function(playlist) {
                    if (playlist.length > 1) {
                         Lampa.Player.playlist(playlist);
                         Lampa.Noty.show('Плейлист обновлен (' + playlist.length + ' эп.)');
                    }
                });
            }
        }
    }

    function setupPlayerListeners() {
        if (LISTENERS.initialized) cleanupPlayerListeners();
        
        LISTENERS.player_start = function(data) {
            if (data.card) {
                // При переключении серии обновляем "текущую" в истории
                var hash = generateHash(data.card, data.season, data.episode);
                var matchFile = data.url.match(/\/stream\/([^?]+)/);
                
                if (matchFile) {
                    updateContinueWatchParams(hash, {
                        file_name: decodeURIComponent(matchFile[1]),
                        title: data.card.original_name || data.card.original_title || data.card.title,
                        season: data.season,
                        episode: data.episode
                    });
                }
            }
        };
        
        LISTENERS.player_destroy = function() { cleanupPlayerListeners(); };
        
        Lampa.Player.listener.follow('start', LISTENERS.player_start);
        Lampa.Player.listener.follow('destroy', LISTENERS.player_destroy);
        LISTENERS.initialized = true;
    }

    function cleanupPlayerListeners() {
        if (LISTENERS.player_start) { Lampa.Player.listener.remove('start', LISTENERS.player_start); LISTENERS.player_start = null; }
        if (LISTENERS.player_destroy) { Lampa.Player.listener.remove('destroy', LISTENERS.player_destroy); LISTENERS.player_destroy = null; }
        LISTENERS.initialized = false;
    }

    // Перехват стандартного запуска, чтобы сохранить параметры (file_index, link)
    function patchPlayer() {
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (params) {
            if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                if (movie) {
                    var hash = generateHash(movie, params.season, params.episode);
                    if (hash) {
                        var matchFile = params.url && params.url.match(/\/stream\/([^?]+)/);
                        var matchLink = params.url && params.url.match(/[?&]link=([^&]+)/);
                        var matchIndex = params.url && params.url.match(/[?&]index=(\d+)/);
                        
                        if (matchFile && matchLink) {
                            updateContinueWatchParams(hash, {
                                file_name: decodeURIComponent(matchFile[1]),
                                torrent_link: matchLink[1],
                                file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                title: movie.original_name || movie.original_title || movie.title,
                                season: params.season,
                                episode: params.episode,
                                episode_title: params.title || params.episode_title
                            });
                        }
                    }
                }
            }
            return originalPlay.call(this, params);
        };
    }

    // ========================================================================
    // 6. UI: КНОПКА
    // ========================================================================

    function handleContinueClick(movieData, buttonElement) {
        if (TIMERS.debounce_click) return;
        
        var params = getStreamParams(movieData);
        if (!params) { Lampa.Noty.show('Нет истории'); return; }
        
        // Визуальная реакция
        if(buttonElement) $(buttonElement).css('opacity', 0.5);

        TIMERS.debounce_click = setTimeout(function() { 
            TIMERS.debounce_click = null; 
            if(buttonElement) $(buttonElement).css('opacity', 1);
        }, 1000);
        
        launchPlayer(movieData, params);
    }

    function setupContinueButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                requestAnimationFrame(function() {
                    var activity = e.object.activity;
                    var render = activity.render();
                    if (render.find('.button--continue-watch').length) return;

                    var params = getStreamParams(e.data.movie);
                    if (!params) return;

                    // Предзагрузка метаданных, если есть ссылка
                    if (params.torrent_link && !FILES_CACHE[params.torrent_link]) {
                        Lampa.Torserver.files(params.torrent_link, function(json){
                            if(json && json.file_stats) FILES_CACHE[params.torrent_link] = json.file_stats;
                        });
                    }

                    var percent = 0;
                    var timeStr = "";
                    var hash = generateHash(e.data.movie, params.season, params.episode);
                    
                    var view = Lampa.Timeline.view(hash);
                    if (view && view.percent > 0) {
                        percent = view.percent;
                        timeStr = formatTime(view.time);
                    } else if (params.time) {
                        percent = params.percent || 0;
                        timeStr = formatTime(params.time);
                    }

                    var labelText = 'Продолжить';
                    if (params.season && params.episode) {
                        labelText += ' S' + params.season + ' E' + params.episode;
                    }
                    if (timeStr) labelText += ' <span style="opacity:0.7;font-size:0.9em">(' + timeStr + ')</span>';

                    // SVG кольцо прогресса
                    var dashArray = (percent * 65.97 / 100).toFixed(2);
                    
                    var continueButtonHtml = `
                        <div class="full-start__button selector button--continue-watch" style="margin-top: 0.5em;">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" style="margin-right: 0.5em">
                                <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
                                <circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" 
                                    stroke-dasharray="${dashArray} 65.97" transform="rotate(-90 12 12)" style="opacity: 0.5"/>
                            </svg>
                            <div>${labelText}</div>
                        </div>
                    `;

                    var continueBtn = $(continueButtonHtml);
                    
                    continueBtn.on('hover:enter', function (event) {
                        handleContinueClick(e.data.movie, this);
                    });

                    // Вставка кнопки в оптимальное место
                    var torrentBtn = render.find('.view--torrent').last();
                    var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

                    if (torrentBtn.length) torrentBtn.after(continueBtn);
                    else if (buttonsContainer.length) buttonsContainer.append(continueBtn);
                    else render.find('.full-start__button').last().after(continueBtn);
                }); 
            }
        });
    }

    function add() {
        patchPlayer();
        cleanupOldParams();
        setupContinueButton();
        setupTimelineSaving();
        console.log("[ContinueWatch] Plugin Loaded. Storage size:", Object.keys(getParams()).length);
    }

    if (window.appready) add();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') add(); });
})();
