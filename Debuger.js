(function () {
    'use strict';

    // ========================================================================
    // КОНФИГУРАЦИЯ И КЭШ
    // ========================================================================
    var STORAGE_KEY = 'continue_watch_params';
    var MEMORY_CACHE = null;
    var TORRSERVER_CACHE = null;
    var FILES_CACHE = {}; 
    
    var TIMERS = {
        save: null,
        debounce_click: null
    };

    var LISTENERS = {
        player_start: null,
        player_destroy: null,
        initialized: false
    };

    var STATE = {
        building_playlist: false
    };

    // ========================================================================
    // 1. ХРАНИЛИЩЕ
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

    function setParams(data, force) {
        MEMORY_CACHE = data;
        clearTimeout(TIMERS.save);

        if (force) {
            Lampa.Storage.set(STORAGE_KEY, data);
        } else {
            TIMERS.save = setTimeout(function() {
                Lampa.Storage.set(STORAGE_KEY, data);
            }, 1000); 
        }
    }

    // Очистка названия эпизода от мусора
    function extractEpisodeTitleFromPath(filePath) {
        if (!filePath) return '';
        var fileName = filePath.split('/').pop().replace(/\.[^/.]+$/, ""); // Убираем расширение
        
        // Убираем S01E01, 1x01 и прочее
        var patterns = [
            /s\d{1,2}e\d{1,3}/gi,
            /\d{1,2}x\d{1,3}/gi,
            /season\s*\d+/gi,
            /episode\s*\d+/gi,
            /сезон\s*\d+/gi,
            /серия\s*\d+/gi,
            /1080p|720p|4k|2160p|web-dl|webrip|hdtv|rip/gi
        ];
        
        patterns.forEach(function(pattern) {
            fileName = fileName.replace(pattern, '');
        });

        // Убираем спецсимволы и лишние пробелы
        fileName = fileName.replace(/[._\-]/g, ' ').replace(/\s+/g, ' ').trim();
        // Если после очистки пусто, возвращаем исходное (без расширения) или ничего
        return fileName || filePath.split('/').pop(); 
    }

    function updateContinueWatchParams(hash, data) {
        var params = getParams();
        if (!params[hash]) params[hash] = {};
        
        // Автоматически извлекаем название, если его нет, но есть имя файла
        if (data.file_name && !data.episode_title && !params[hash].episode_title) {
            data.episode_title = extractEpisodeTitleFromPath(data.file_name);
        }

        var changed = false;
        for (var key in data) { 
            if (params[hash][key] !== data[key]) {
                params[hash][key] = data[key]; 
                changed = true;
            }
        }
        
        if (changed || !params[hash].timestamp) {
            params[hash].timestamp = Date.now();
            // Критическое сохранение при >90%
            var isCritical = (data.percent && data.percent > 90);
            setParams(params, isCritical);
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
            } catch (e) {}
        }, 10000);
    }

    function getStreamParams(movie) {
        if (!movie) return null;
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        if (!title) return null;
        
        var params = getParams();
        
        if (movie.number_of_seasons) {
            var latestEpisode = null;
            var latestTimestamp = 0;
            
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
            var hash = Lampa.Utils.hash(title);
            return params[hash] || null;
        }
    }

    // Поиск следующего эпизода в истории
    function findNextEpisode(movie, currentParams) {
        var params = getParams();
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        var nextEp = null;
        
        Object.keys(params).forEach(function(hash) {
            var p = params[hash];
            if (p.title === title && p.season === currentParams.season && p.episode === currentParams.episode + 1) {
                nextEp = p;
            }
        });
        return nextEp;
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
    // 3. ОТСЛЕЖИВАНИЕ
    // ========================================================================
    
    function setupTimelineSaving() {
        Lampa.Timeline.listener.follow('update', function(e) {
            var hash = e.data.hash;
            var road = e.data.road;
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
    // 4. ПЛЕЙЛИСТ
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

        // 1. ИЗ ИСТОРИИ
        for (var hash in allParams) {  
            var p = allParams[hash];  
            if (p.title === title && p.season && p.episode && (!currentParams.season || p.season === currentParams.season)) {  
                var episodeHash = generateHash(movie, p.season, p.episode);
                var timeline = Lampa.Timeline.view(episodeHash);  
                
                if (timeline) wrapTimelineHandler(timeline, p);
                
                var isCurrent = (p.season === currentParams.season && p.episode === currentParams.episode);
                // Для плейлиста используем красивое название
                var displayTitle = p.episode_title || ('S' + p.season + ' E' + p.episode);

                var item = {  
                    title: displayTitle,
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

        if (!currentParams.torrent_link) { finalize(playlist); return; }

        // 2. ИЗ TORRSERVER
        var processFiles = function(files) {
            if (!FILES_CACHE[currentParams.torrent_link]) {
                FILES_CACHE[currentParams.torrent_link] = files;
                setTimeout(function(){ delete FILES_CACHE[currentParams.torrent_link]; }, 300000);
            }

            var uniqueEpisodes = new Set();
            playlist.forEach(function(p) { uniqueEpisodes.add(p.season + '_' + p.episode); });

            files.forEach(function(file) {
                if (ABORT_CONTROLLER) return;
                try {
                    var episodeInfo = Lampa.Torserver.parse({ 
                        movie: movie, files: [file], filename: file.path.split('/').pop(), path: file.path, is_file: true 
                    });

                    if (!movie.number_of_seasons || (episodeInfo.season === currentParams.season)) {
                        var epKey = episodeInfo.season + '_' + episodeInfo.episode;
                        
                        if (!uniqueEpisodes.has(epKey)) {
                            var episodeHash = generateHash(movie, episodeInfo.season, episodeInfo.episode);
                            var timeline = Lampa.Timeline.view(episodeHash);
                            if (!timeline) timeline = { hash: episodeHash, percent: 0, time: 0, duration: 0 };
                            
                            var epTitle = extractEpisodeTitleFromPath(file.path);

                            if (!allParams[episodeHash]) {
                                updateContinueWatchParams(episodeHash, {
                                    file_name: file.path,
                                    torrent_link: currentParams.torrent_link,
                                    file_index: file.id || 0,
                                    title: title,
                                    season: episodeInfo.season,
                                    episode: episodeInfo.episode,
                                    episode_title: epTitle,
                                    percent: 0, time: 0, duration: 0
                                });
                            }

                            var isCurrent = (episodeInfo.season === currentParams.season && episodeInfo.episode === currentParams.episode);
                            
                            var item = {
                                title: movie.number_of_seasons ? (epTitle || ('S' + episodeInfo.season + ' E' + episodeInfo.episode)) : (movie.title || title),
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
                            if (isCurrent || (file.id === currentParams.file_index && !movie.number_of_seasons)) item.url = currentUrl;
                            playlist.push(item);
                            uniqueEpisodes.add(epKey);
                        }
                    }
                } catch (e) {}
            });
            
            if (movie.number_of_seasons) playlist.sort(function(a, b) { return a.episode - b.episode; });
            finalize(playlist);
        };

        if (FILES_CACHE[currentParams.torrent_link]) { processFiles(FILES_CACHE[currentParams.torrent_link]); return; }

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
                        if (!quietMode) Lampa.Loading.setText('Ожидание файлов (' + retryCount + '/' + maxRetries + ')...');
                        setTimeout(fetchFiles, retryCount * 1000);
                    } else { finalize(playlist); }
                }, function() { 
                    if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(fetchFiles, retryCount * 1000);
                    } else { if(!ABORT_CONTROLLER) finalize(playlist); }
                });
            };
            fetchFiles();
        }, function() { if(!ABORT_CONTROLLER) finalize(playlist); });
    }

    // ========================================================================
    // 5. ЛОГИКА ПЛЕЕРА И СИНХРОНИЗАЦИЯ
    // ========================================================================
    function launchPlayer(movie, params) {
        var currentHash = generateHash(movie, params.season, params.episode);
        var timeline = Lampa.Timeline.view(currentHash);

        // AUTO-NEXT Logic
        if (timeline && timeline.percent > 95 && movie.number_of_seasons) {
            var nextParams = findNextEpisode(movie, params);
            if (nextParams) {
                Lampa.Noty.show('Запуск следующей серии...');
                params = nextParams;
                currentHash = generateHash(movie, params.season, params.episode);
                timeline = Lampa.Timeline.view(currentHash);
                if (timeline && timeline.percent > 95) {
                    timeline.percent = 0; timeline.time = 0; 
                }
            } else {
                Lampa.Noty.show('Серия просмотрена. Запуск с начала.');
                params.time = 0;
                params.percent = 0;
                if(timeline) { timeline.time = 0; timeline.percent = 0; }
            }
        }

        // FIX: Если названия нет, извлекаем его принудительно перед стартом и сохраняем
        if (!params.episode_title && params.file_name) {
            params.episode_title = extractEpisodeTitleFromPath(params.file_name);
            updateContinueWatchParams(currentHash, {
                episode_title: params.episode_title
            });
        }

        var url = buildStreamUrl(params);  
        if (!url) return;  
        
        timeline = Lampa.Timeline.view(currentHash);
        if (!timeline || (!timeline.time && !timeline.percent)) {
            timeline = timeline || { hash: currentHash };
            timeline.time = params.time || 0;  
            timeline.percent = params.percent || 0;  
        } else if (params.time > timeline.time) {
            timeline.time = params.time;
            timeline.percent = params.percent;
        }
        
        wrapTimelineHandler(timeline, params);  
        updateContinueWatchParams(currentHash, { percent: timeline.percent, time: timeline.time });

        var player_type = Lampa.Storage.field('player_torrent');
        var force_inner = (player_type === 'inner');
        var isExternalPlayer = !force_inner && (player_type !== 'lampa');

        // Для плеера используем Полное название (включая русское)
        var playerTitle = params.episode_title || ('S' + params.season + ' E' + params.episode);
        if (!movie.number_of_seasons) playerTitle = params.title || movie.title;

        var playerData = {    
            url: url, title: playerTitle, card: movie,    
            torrent_hash: params.torrent_link, timeline: timeline,  
            season: params.season, episode: params.episode, position: timeline.time || -1  
        };

        if (force_inner) {
            delete playerData.torrent_hash;
            var original_platform_is = Lampa.Platform.is;
            Lampa.Platform.is = function(what) { return what === 'android' ? false : original_platform_is(what); };
            setTimeout(function() { Lampa.Platform.is = original_platform_is; }, 500);
            Lampa.Storage.set('internal_torrclient', true);
        }

        if (isExternalPlayer) {
            buildPlaylist(movie, params, url, false, function(playlist) {
                if (playlist.length === 0 && !params.torrent_link) return;
                playerData.playlist = playlist.length ? playlist : null;
                Lampa.Player.play(playerData);
                Lampa.Player.callback(function() { Lampa.Controller.toggle('content'); });  
            });
        } else {
            var tempPlaylist = [{ url: url, title: playerTitle, timeline: timeline, season: params.season, episode: params.episode, card: movie }];
            if (movie.number_of_seasons) tempPlaylist.push({ title: 'Загрузка списка...', url: '', timeline: {} });
            playerData.playlist = tempPlaylist;

            if (timeline.time > 0) Lampa.Noty.show('Восстанавливаем: ' + formatTime(timeline.time));
            Lampa.Player.play(playerData);
            setupPlayerListeners();
            Lampa.Player.callback(function() { Lampa.Controller.toggle('content'); });

            if (movie.number_of_seasons && params.season && params.episode) {
                buildPlaylist(movie, params, url, true, function(playlist) {
                    if (playlist.length > 1) { Lampa.Player.playlist(playlist); Lampa.Noty.show('Плейлист загружен (' + playlist.length + ' эп.)'); }
                });
            }
        }
    }

    function setupPlayerListeners() {
        if (LISTENERS.initialized) cleanupPlayerListeners();
        LISTENERS.player_start = function(data) {
            if (data.card) {
                var hash = generateHash(data.card, data.season, data.episode);
                var matchFile = data.url.match(/\/stream\/([^?]+)/);
                if (matchFile) {
                    updateContinueWatchParams(hash, {
                        file_name: decodeURIComponent(matchFile[1]),
                        title: data.card.original_name || data.card.original_title || data.card.title,
                        season: data.season, episode: data.episode
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

    function patchPlayer() {
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (params) {
            if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                if (movie) {
                    var hash = generateHash(movie, params.season, params.episode);
                    if (hash) {
                        var timeline = Lampa.Timeline.view(hash);
                        var hasSignificantProgress = timeline && (timeline.percent > 5);
                        
                        if (!hasSignificantProgress) {
                            var matchFile = params.url && params.url.match(/\/stream\/([^?]+)/);
                            var matchLink = params.url && params.url.match(/[?&]link=([^&]+)/);
                            var matchIndex = params.url && params.url.match(/[?&]index=(\d+)/);
                            
                            if (matchFile && matchLink) {
                                var fileName = decodeURIComponent(matchFile[1]);
                                var epTitle = params.title || params.episode_title;
                                // Принудительно извлекаем заголовок при прямом запуске
                                if (!epTitle) epTitle = extractEpisodeTitleFromPath(fileName);

                                updateContinueWatchParams(hash, {
                                    file_name: fileName,
                                    torrent_link: matchLink[1],
                                    file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                    title: movie.original_name || movie.original_title || movie.title,
                                    season: params.season,
                                    episode: params.episode,
                                    episode_title: epTitle
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
    // 6. UI: КНОПКА
    // ========================================================================

    function handleContinueClick(movieData, buttonElement) {
        if (TIMERS.debounce_click) return;
        var params = getStreamParams(movieData);
        if (!params) { Lampa.Noty.show('Нет истории'); return; }
        
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

                    if (params.torrent_link && !FILES_CACHE[params.torrent_link]) {
                        Lampa.Torserver.files(params.torrent_link, function(json){
                            if(json && json.file_stats) FILES_CACHE[params.torrent_link] = json.file_stats;
                        });
                    }

                    var percent = 0;
                    var timeStr = "";
                    var hash = generateHash(e.data.movie, params.season, params.episode);
                    var view = Lampa.Timeline.view(hash);
                    
                    if (view && view.percent > 0) { percent = view.percent; timeStr = formatTime(view.time); } 
                    else if (params.time) { percent = params.percent || 0; timeStr = formatTime(params.time); }

                    // ЛАКОНИЧНЫЙ ТЕКСТ КНОПКИ
                    var labelText = 'Продолжить';
                    if (params.season && params.episode) {
                        labelText += ' S' + params.season + ' E' + params.episode;
                    }
                    if (timeStr) labelText += ' <span style="opacity:0.7;font-size:0.9em">(' + timeStr + ')</span>';

                    var dashArray = (percent * 65.97 / 100).toFixed(2);
                    var continueButtonHtml = `
                        <div class="full-start__button selector button--continue-watch" style="margin-top: 0.5em;">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" style="margin-right: 0.5em">
                                <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
                                <circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" 
                                    stroke-dasharray="${dashArray} 65.97" transform="rotate(-90 12 12)" style="opacity: 0.5"/>
                            </svg>
                            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${labelText}</div>
                        </div>
                    `;

                    var continueBtn = $(continueButtonHtml);
                    continueBtn.on('hover:enter', function (event) { handleContinueClick(e.data.movie, this); });

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
        console.log("[ContinueWatch] v73 Loaded. Instant Titles Fix.");
    }

    if (window.appready) add();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') add(); });
})();
