"use strict";
(function () {
    'use strict';

    // ========================================================================
    // ПЕРЕМЕННЫЕ КЭША
    // ========================================================================
    var MEMORY_CACHE = null;
    var WATCHED_LAST_CACHE = null;
    var TORRSERVER_CACHE = null;
    var SAVE_TIMEOUT = null;
    var CURRENT_PLAYLIST = null;
    var CURRENT_HASH = null;
    var CURRENT_MOVIE = null;
    var CURRENT_TIMELINE_VIEW = null;

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
        
        var title = movie.number_of_seasons ? 
            movie.original_name || movie.original_title || movie.name || movie.title : 
            movie.original_title || movie.original_name || movie.title || movie.name;
        
        if (!title) return null;
        
        var params = getParams();
        var latestEpisode = null;
        var latestTimestamp = 0;
        
        // Ищем самый свежий эпизод для этого сериала
        for (var hash in params) {
            var p = params[hash];
            if (p.title === title) {
                if (p.timestamp && p.timestamp > latestTimestamp) {
                    latestTimestamp = p.timestamp;
                    latestEpisode = p;
                }
            }
        }
        
        if (latestEpisode) {
            console.log("[ContinueWatch] Found latest episode:", latestEpisode.season, latestEpisode.episode, "timestamp:", new Date(latestEpisode.timestamp));
            return latestEpisode;
        }
        
        // Если не нашли в нашем хранилище, пробуем старую логику для обратной совместимости
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
        query.push('play');
        return url + '?' + query.join('&');
    }

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
        
        console.log("[ContinueWatch] Updated CURRENT_HASH to:", CURRENT_HASH, "for S" + season + "E" + episode);
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
                    return {
                        season: parseInt(seasonMatch[1]),
                        episode: parseInt(episodeMatch[1])
                    };
                }
            }
        } catch (e) {
            console.log("[ContinueWatch] Error parsing episode from URL:", e);
        }
        
        return null;
    }

    function setupTimelineHandler() {
        if (!CURRENT_HASH) return;
        
        CURRENT_TIMELINE_VIEW = Lampa.Timeline.view(CURRENT_HASH);
        
        if (CURRENT_TIMELINE_VIEW) {
            CURRENT_TIMELINE_VIEW.handler = function (percent, time, duration) {
                console.log("[ContinueWatch] Timeline handler for", CURRENT_HASH, "called:", percent, time, duration);
                Lampa.Timeline.update(CURRENT_HASH, { 
                    percent: percent, 
                    time: time, 
                    duration: duration 
                });
            };
            console.log("[ContinueWatch] Timeline handler set for hash:", CURRENT_HASH);
        } else {
            console.log("[ContinueWatch] No timeline view found for hash:", CURRENT_HASH);
        }
    }

    // ВОССТАНОВЛЕННАЯ ФУНКЦИЯ: полная загрузка эпизодов из TorrServer
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
                  
                // Для текущего эпизода используем точный URL
                if (p.episode === currentParams.episode) {
                    item.url = currentUrl;
                    console.log("[ContinueWatch] Using current URL for episode", p.episode);
                }
                  
                playlist.push(item);  
            }  
        }
        
        // ЗАГРУЖАЕМ ВСЕ ЭПИЗОДЫ ИЗ TORRSERVER ДЛЯ ПОЛНОГО ПЛЕЙЛИСТА
        if (currentParams.torrent_link) {
            console.log("[ContinueWatch] Loading ALL episodes from TorrServer for complete playlist");

            Lampa.Torserver.hash({
                link: currentParams.torrent_link,
                title: movie.title || movie.name,
                poster: movie.poster_path,
                data: {
                    lampa: true,
                    movie: movie
                }
            }, function(torrent) {
                console.log("[ContinueWatch] Got torrent hash:", torrent.hash);
                
                // Получаем список файлов
                Lampa.Torserver.files(torrent.hash, function(json) {
                    console.log("[ContinueWatch] TorrServer files response received");
                    
                    if (json && json.file_stats && json.file_stats.length > 0) {
                        console.log("[ContinueWatch] Processing", json.file_stats.length, "files for season", currentParams.season);
                        
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
                                    // Проверяем, нет ли уже этого эпизода в плейлисте
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
                    
                    // Сортируем по номеру эпизода
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
            }, function(error) {
                console.log("[ContinueWatch] Error getting hash from TorrServer:", error);
                // В случае ошибки возвращаем то, что есть
                playlist.sort(function(a, b) {  
                    return a.episode - b.episode;  
                });
                callback(playlist);
            });
        } else {
            // Если нет torrent_link, возвращаем только сохраненные эпизоды
            playlist.sort(function(a, b) {  
                return a.episode - b.episode;  
            });
            console.log("[ContinueWatch] Final playlist from storage:", playlist.length, "episodes");
            callback(playlist);
        }
    }

    function launchPlayer(movie, params) {  
        console.log("[ContinueWatch] Launching player with params:", params);
        
        var url = buildStreamUrl(params);  
        if (!url) return;  
        
        CURRENT_MOVIE = movie;
        updateCurrentHash(movie, params.season, params.episode);
        
        setupTimelineHandler();
        
        var playerData = {  
            url: url,  
            title: params.episode_title || params.title || movie.title,
            card: movie,  
            torrent_hash: params.torrent_link,  
            timeline: CURRENT_TIMELINE_VIEW,
            season: params.season,
            episode: params.episode
        };  
        
        var view = Lampa.Timeline.view(CURRENT_HASH);
        if (view && view.percent > 0) {
            Lampa.Noty.show('Восстанавливаем позицию...');
        }
        
        Lampa.Player.play(playerData);
        
        // Настройка плейлиста
        if (params.season && params.episode) {  
            console.log("[ContinueWatch] Setting up playlist for season", params.season);
            
            buildPlaylist(movie, params, url, function(playlist) {
                if (playlist && playlist.length > 1) {
                    console.log("[ContinueWatch] Setting playlist with", playlist.length, "items");
                    CURRENT_PLAYLIST = playlist;
                    Lampa.Player.playlist(playlist);
                } else {
                    console.log("[ContinueWatch] Not enough episodes for playlist:", playlist ? playlist.length : 0);
                    CURRENT_PLAYLIST = null;
                }
            });
        }
        
        Lampa.Player.callback(function() {  
            Lampa.Controller.toggle('content');  
        });
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
                        var season = params.season;
                        var episode = params.episode;
                        
                        if (!season || !episode) {
                            var episodeInfo = getCurrentEpisodeFromUrl(params.url);
                            if (episodeInfo) {
                                season = episodeInfo.season;
                                episode = episodeInfo.episode;
                            }
                        }
                        
                        if (season && episode) {
                            var separator = season > 10 ? ':' : '';
                            hash = Lampa.Utils.hash([season, separator, episode, baseTitle].join(''));
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
                                    season: season,
                                    episode: episode,
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

    function setupPlayerListeners() {
        if (Lampa.PlayerPlaylist && Lampa.PlayerPlaylist.listener) {
            Lampa.PlayerPlaylist.listener.follow('select', function(e) {
                console.log("[ContinueWatch] PlayerPlaylist select event", e);
                
                if (e.item && e.item.season && e.item.episode && e.item.card) {
                    updateCurrentHash(e.item.card, e.item.season, e.item.episode);
                    
                    setTimeout(function() {
                        setupTimelineHandler();
                    }, 100);
                    
                    if (e.item.url && e.item.torrent_hash) {
                        var matchFile = e.item.url.match(/\/stream\/([^?]+)/);
                        var matchIndex = e.item.url.match(/[?&]index=(\d+)/);
                        
                        if (matchFile) {
                            var baseTitle = e.item.card.original_name || e.item.card.original_title;
                            var separator = e.item.season > 10 ? ':' : '';
                            var hash = Lampa.Utils.hash([e.item.season, separator, e.item.episode, baseTitle].join(''));
                            
                            var store = getParams();
                            store[hash] = {
                                file_name: decodeURIComponent(matchFile[1]),
                                torrent_link: e.item.torrent_hash,
                                file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                title: baseTitle,
                                season: e.item.season,
                                episode: e.item.episode,
                                episode_title: e.item.title,
                                timestamp: Date.now()
                            };
                            setParams(store);
                            
                            console.log("[ContinueWatch] Saved playlist episode data for S" + e.item.season + "E" + e.item.episode);
                        }
                    }
                }
            });
        }

        Lampa.Player.listener.follow('start', function(data) {
            console.log("[ContinueWatch] Player start event", data);
            
            if (data.season && data.episode && data.card) {
                updateCurrentHash(data.card, data.season, data.episode);
                
                setTimeout(function() {
                    setupTimelineHandler();
                }, 100);
                
                if (data.url && data.torrent_hash) {
                    var matchFile = data.url.match(/\/stream\/([^?]+)/);
                    var matchIndex = data.url.match(/[?&]index=(\d+)/);
                    
                    if (matchFile) {
                        var baseTitle = data.card.original_name || data.card.original_title;
                        var separator = data.season > 10 ? ':' : '';
                        var hash = Lampa.Utils.hash([data.season, separator, data.episode, baseTitle].join(''));
                        
                        var store = getParams();
                        store[hash] = {
                            file_name: decodeURIComponent(matchFile[1]),
                            torrent_link: data.torrent_hash,
                            file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                            title: baseTitle,
                            season: data.season,
                            episode: data.episode,
                            episode_title: data.title,
                            timestamp: Date.now()
                        };
                        setParams(store);
                        
                        console.log("[ContinueWatch] Saved start event episode data for S" + data.season + "E" + data.episode);
                    }
                }
            }
        });
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
                        
                        var hash;
                        if (params.season && params.episode) {
                            var separator = params.season > 10 ? ':' : '';
                            hash = Lampa.Utils.hash([params.season, separator, params.episode, title].join(''));
                        } else {
                            hash = Lampa.Utils.hash(title);
                        }
                        
                        var view = Lampa.Timeline.view(hash);
                        if (view) {
                            percent = view.percent || 0;
                            timeStr = formatTime(view.time || 0);
                        }

                        console.log("[ContinueWatch] Button will show:", "S" + params.season + "E" + params.episode, "percent:", percent, "time:", timeStr);
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
                    console.log("[ContinueWatch] v40 (Complete Playlist + Fixed Switching) - Button added");

                }, 100); 
            }
        });
    }

    function add() {
        patchPlayer();
        setupPlayerListeners();
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
