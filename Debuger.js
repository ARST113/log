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
        // Супер-быстрое сохранение (10мс), чтобы успеть записать данные при переключении серий
        SAVE_TIMEOUT = setTimeout(function() {
            Lampa.Storage.set('continue_watch_params', data);
        }, 10);
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

    // === НОВАЯ ЛОГИКА ВЫБОРА СЕРИИ v80 ===
    function getStreamParams(movie) {
        if (!movie) return null;
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        if (!title) return null;
        var params = getParams();
        
        if (movie.number_of_seasons) {
            var candidates = [];
            
            // 1. Собираем всех кандидатов
            for (var hash in params) {
                var p = params[hash];
                if (p.title === title && p.timestamp) {
                    candidates.push(p);
                }
            }

            if (candidates.length === 0) return null;

            // 2. Сортируем по времени (самые свежие сверху)
            candidates.sort(function(a, b) {
                return b.timestamp - a.timestamp;
            });

            // 3. Ищем "Активную" серию (недосмотренную)
            // Приоритет: Недосмотренная > Досмотренная
            var activeCandidates = [];
            var now = Date.now();

            // Собираем "горячие" серии за последние 15 минут
            for (var i = 0; i < candidates.length; i++) {
                var p = candidates[i];
                var isRecent = (now - p.timestamp) < (15 * 60 * 1000); // 15 минут
                var isUnfinished = (p.percent || 0) < 93; // Не титры

                // Если это недавняя недосмотренная серия - добавляем в шорт-лист
                if (isRecent && isUnfinished) {
                    activeCandidates.push(p);
                }
            }

            // Если есть активные недавние серии (например, вы переключали 3-ю и 4-ю)
            if (activeCandidates.length > 0) {
                // Сортируем их по НОМЕРУ СЕРИИ (по убыванию)
                // Предполагаем, что пользователь двигается вперед
                activeCandidates.sort(function(a, b) {
                    var scoreA = (a.season || 0) * 10000 + (a.episode || 0);
                    var scoreB = (b.season || 0) * 10000 + (b.episode || 0);
                    
                    // Если есть индексы файлов - они надежнее
                    if (a.file_index !== undefined && b.file_index !== undefined) {
                        return parseInt(b.file_index) - parseInt(a.file_index);
                    }
                    return scoreB - scoreA;
                });
                
                console.log("[ContinueWatch] Smart Pick: Moving forward to episode", activeCandidates[0].episode);
                return activeCandidates[0];
            }

            // 4. Если нет "горячих" активных (вы смотрели давно или все досмотрели)
            // Просто берем самую последнюю по времени (первую в списке)
            // Но проверяем: если она досмотрена (>93%), может быть есть смысл взять следующую?
            // Пока оставим просто последнюю открытую, чтобы не усложнять.
            return candidates[0];

        } else {
            var hash = Lampa.Utils.hash(title);
            return params[hash] || null;
        }
    }

    function buildStreamUrl(params) {
        if (!params || !params.file_name || !params.torrent_link) return null;
        var server_url = getTorrServerUrl();
        if (!server_url) return null;

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
    // 4. СБОРКА ПЛЕЙЛИСТА (v80 LOOSE MATCHING)
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

        // 1. Кэш
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
                
                // МЯГКОЕ СРАВНЕНИЕ (== вместо ===)
                var isCurrent = false;
                if (currentParams.file_index !== undefined && p.file_index !== undefined) {
                    isCurrent = (p.file_index == currentParams.file_index);
                } else {
                    isCurrent = (p.season == currentParams.season && p.episode == currentParams.episode);
                }

                var item = {  
                    title: p.episode_title || ('S' + p.season + ' E' + p.episode),
                    season: p.season,  
                    episode: p.episode,  
                    timeline: timeline,
                    torrent_hash: p.torrent_hash || p.torrent_link,
                    card: movie,
                    url: buildStreamUrl(p),
                    position: isCurrent ? (timeline ? (timeline.time || 0) : 0) : -1 
                };  
                if (isCurrent) item.url = currentUrl;
                playlist.push(item);  
            }  
        }

        if (!currentParams.torrent_link) {
            finalize(playlist);
            return;
        }

        // 2. Запрос
        var isCancelled = false;
        var retryCount = 0;
        var maxRetries = 10; 

        if (!quietMode) {
            Lampa.Loading.start(function() {
                isCancelled = true;
                finalize([]); 
            }, 'Подготовка плейлиста...');
            
            SAFETY_TIMER = setTimeout(function() {
                if(!isCancelled) finalize(playlist);
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

                    if (json && json.file_stats && json.file_stats.length > 0) {
                        var totalFiles = json.file_stats.length;
                        var processedCount = 0;

                        json.file_stats.forEach(function(file) {
                            if (isCancelled) return;
                            processedCount++;
                            if (!quietMode
