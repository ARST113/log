(function () {
    'use strict';

    // ========================================================================
    // КОНФИГУРАЦИЯ
    // ========================================================================
    var STORAGE_KEY = 'continue_watch_params';
    var PROFILE_KEY = null;
    
    // Маппинг названий эпизодов для быстрого доступа
    var EPISODE_TITLES_CACHE = {};
    
    // Флаги состояния
    var STATE = {
        playlistBuilding: false,
        currentTorrentHash: null
    };

    // ========================================================================
    // 1. ХРАНИЛИЩЕ С ПРОФИЛИЗАЦИЕЙ
    // ========================================================================

    function updateProfileKey() {
        var profileId = '';
        if (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.sync && 
            Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile) {
            profileId = '_' + Lampa.Account.Permit.account.profile.id;
        }
        PROFILE_KEY = STORAGE_KEY + profileId;
        Lampa.Storage.sync(PROFILE_KEY, 'object_object');
    }

    function getStorage() {
        updateProfileKey();
        return Lampa.Storage.get(PROFILE_KEY, {});
    }

    function saveStorage(data) {
        updateProfileKey();
        Lampa.Storage.set(PROFILE_KEY, data);
    }

    function updateEpisodeData(hash, data) {
        var storage = getStorage();
        if (!storage[hash]) storage[hash] = {};
        
        Object.assign(storage[hash], data);
        storage[hash].timestamp = Date.now();
        
        saveStorage(storage);
    }

    // ========================================================================
    // 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ========================================================================

    function formatTime(seconds) {
        if (!seconds) return '';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        return h > 0 
            ? h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
            : m + ':' + (s < 10 ? '0' : '') + s;
    }

    function getSeriesTitle(movie) {
        return movie.original_name || movie.original_title || movie.name || movie.title || '';
    }

    function generateHash(movie, season, episode) {
        var title = getSeriesTitle(movie);
        if (movie.number_of_seasons && season && episode) {
            return Lampa.Utils.hash(title + '_S' + season + 'E' + episode);
        }
        return Lampa.Utils.hash(title);
    }

    function parseStreamUrl(url) {
        if (!url) return {};
        var match = url.match(/stream\/([^?]+)/);
        var linkMatch = url.match(/link=([^&]+)/);
        var indexMatch = url.match(/index=(\d+)/);
        
        return {
            file_name: match ? decodeURIComponent(match[1]) : null,
            torrent_link: linkMatch ? linkMatch[1] : null,
            file_index: indexMatch ? parseInt(indexMatch[1]) : 0
        };
    }

    function getEpisodeTitle(movie, season, episode) {
        var cacheKey = getSeriesTitle(movie) + '_S' + season + 'E' + episode;
        
        if (EPISODE_TITLES_CACHE[cacheKey]) {
            return EPISODE_TITLES_CACHE[cacheKey];
        }
        
        var title = 'S' + season + ' E' + episode;
        
        // Пытаемся найти русское название
        if (movie.episodes && Array.isArray(movie.episodes)) {
            for (var i = 0; i < movie.episodes.length; i++) {
                var ep = movie.episodes[i];
                if ((ep.season_number || ep.season) == season && 
                    (ep.episode_number || ep.episode) == episode) {
                    if (ep.name_ru || ep.rus_name || ep.name) {
                        title = ep.name_ru || ep.rus_name || ep.name;
                        break;
                    }
                }
            }
        }
        
        EPISODE_TITLES_CACHE[cacheKey] = title;
        return title;
    }

    // ========================================================================
    // 3. УПРОЩЕННОЕ ПОСТРОЕНИЕ ПЛЕЙЛИСТА
    // ========================================================================

    function buildSimplePlaylist(movie, currentParams, currentUrl, callback) {
        if (STATE.playlistBuilding) {
            callback([]);
            return;
        }
        
        STATE.playlistBuilding = true;
        
        var seriesTitle = getSeriesTitle(movie);
        var storage = getStorage();
        var playlist = [];
        
        // 1. Собираем все эпизоды из хранилища для этого сериала
        Object.keys(storage).forEach(function(hash) {
            var item = storage[hash];
            if (item.title === seriesTitle && item.season && item.episode) {
                var episodeHash = generateHash(movie, item.season, item.episode);
                var timeline = Lampa.Timeline.view(episodeHash);
                
                var playlistItem = {
                    title: item.episode_title || getEpisodeTitle(movie, item.season, item.episode),
                    season: item.season,
                    episode: item.episode,
                    timeline: timeline || { hash: episodeHash, time: 0, percent: 0, duration: 0 },
                    card: movie,
                    url: buildStreamUrl(item),
                    position: timeline ? timeline.time : -1
                };
                
                // Если это текущий эпизод, используем currentUrl
                if (item.season == currentParams.season && item.episode == currentParams.episode) {
                    playlistItem.url = currentUrl;
                }
                
                playlist.push(playlistItem);
            }
        });
        
        // 2. Если есть текущий торрент, добавляем его файлы
        if (currentParams.torrent_link && !STATE.currentTorrentHash) {
            STATE.currentTorrentHash = currentParams.torrent_link;
            
            Lampa.Torserver.files(currentParams.torrent_link, function(files) {
                if (files && files.file_stats) {
                    files.file_stats.forEach(function(file, index) {
                        // Парсим информацию о сезоне/эпизоде из имени файла
                        var season = currentParams.season;
                        var episode = currentParams.episode + index; // Простая логика
                        
                        // Проверяем, есть ли уже такой эпизод
                        var exists = playlist.some(function(item) {
                            return item.season == season && item.episode == episode;
                        });
                        
                        if (!exists) {
                            var episodeHash = generateHash(movie, season, episode);
                            
                            var newItem = {
                                file_name: file.path,
                                torrent_link: currentParams.torrent_link,
                                file_index: file.id || index,
                                title: seriesTitle,
                                season: season,
                                episode: episode,
                                episode_title: getEpisodeTitle(movie, season, episode)
                            };
                            
                            // Сохраняем в хранилище
                            updateEpisodeData(episodeHash, newItem);
                            
                            // Добавляем в плейлист
                            playlist.push({
                                title: newItem.episode_title,
                                season: season,
                                episode: episode,
                                timeline: { hash: episodeHash, time: 0, percent: 0, duration: 0 },
                                card: movie,
                                url: buildStreamUrl(newItem),
                                position: -1
                            });
                        }
                    });
                    
                    // Сортируем по эпизодам
                    playlist.sort(function(a, b) {
                        if (a.season == b.season) return a.episode - b.episode;
                        return a.season - b.season;
                    });
                }
                
                STATE.playlistBuilding = false;
                callback(playlist);
            }, function() {
                STATE.playlistBuilding = false;
                callback(playlist);
            });
        } else {
            STATE.playlistBuilding = false;
            callback(playlist);
        }
    }

    // ========================================================================
    // 4. ЗАПУСК ПЛЕЕРА
    // ========================================================================

    function buildStreamUrl(params) {
        if (!params || !params.file_name || !params.torrent_link) return null;
        
        var serverUrl = getTorrServerUrl();
        if (!serverUrl) {
            Lampa.Noty.show('TorrServer не настроен');
            return null;
        }
        
        var url = serverUrl + '/stream/' + encodeURIComponent(params.file_name) + 
                  '?link=' + params.torrent_link + 
                  '&index=' + (params.file_index || 0) + 
                  '&play';
        
        return url;
    }

    function getTorrServerUrl() {
        var url = Lampa.Storage.get('torrserver_url');
        var url_two = Lampa.Storage.get('torrserver_url_two');
        var use_two = Lampa.Storage.field('torrserver_use_link') == 'two';
        var final_url = use_two ? (url_two || url) : (url || url_two);
        
        if (final_url) {
            if (!final_url.match(/^https?:\/\//)) final_url = 'http://' + final_url;
            final_url = final_url.replace(/\/$/, '');
        }
        
        return final_url;
    }

    function launchPlayer(movie, params) {
        var url = buildStreamUrl(params);
        if (!url) return;
        
        var episodeHash = generateHash(movie, params.season, params.episode);
        var timeline = Lampa.Timeline.view(episodeHash) || { 
            hash: episodeHash, 
            time: params.time || 0, 
            percent: params.percent || 0, 
            duration: params.duration || 0 
        };
        
        // Обновляем данные эпизода
        var episodeData = {
            title: getSeriesTitle(movie),
            season: params.season,
            episode: params.episode,
            episode_title: getEpisodeTitle(movie, params.season, params.episode),
            file_name: params.file_name,
            torrent_link: params.torrent_link,
            file_index: params.file_index,
            last_opened: Date.now()
        };
        
        updateEpisodeData(episodeHash, episodeData);
        
        // Определяем тип плеера
        var playerType = Lampa.Storage.field('player_torrent');
        var isExternalPlayer = playerType !== 'lampa' && playerType !== 'inner';
        
        var playerData = {
            url: url,
            title: episodeData.episode_title,
            card: movie,
            timeline: timeline,
            season: params.season,
            episode: params.episode,
            position: timeline.time || -1,
            torrent_hash: params.torrent_link
        };
        
        if (isExternalPlayer && movie.number_of_seasons) {
            // Для внешнего плеера с сериалами строим плейлист
            buildSimplePlaylist(movie, params, url, function(playlist) {
                if (playlist.length > 0) {
                    playerData.playlist = playlist;
                }
                Lampa.Player.play(playerData);
            });
        } else {
            // Для внутреннего плеера или фильмов запускаем сразу
            Lampa.Player.play(playerData);
            
            // Для внутреннего плеера с сериалами подгружаем плейлист в фоне
            if (movie.number_of_seasons && playerType === 'lampa') {
                buildSimplePlaylist(movie, params, url, function(playlist) {
                    if (playlist.length > 1) {
                        Lampa.Player.playlist(playlist);
                    }
                });
            }
        }
        
        if (timeline.time > 0) {
            Lampa.Noty.show('Восстанавливаем: ' + formatTime(timeline.time));
        }
    }

    // ========================================================================
    // 5. КНОПКА "ПРОДОЛЖИТЬ"
    // ========================================================================

    function getLatestEpisode(movie) {
        var storage = getStorage();
        var seriesTitle = getSeriesTitle(movie);
        var latestEpisode = null;
        var latestTime = 0;
        
        Object.keys(storage).forEach(function(hash) {
            var item = storage[hash];
            if (item.title === seriesTitle && item.last_opened) {
                if (item.last_opened > latestTime) {
                    latestTime = item.last_opened;
                    latestEpisode = item;
                }
            }
        });
        
        return latestEpisode;
    }

    function setupContinueButton() {
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                setTimeout(function() {
                    var movie = e.data.movie;
                    var latestEpisode = getLatestEpisode(movie);
                    
                    if (!latestEpisode) return;
                    
                    var activity = e.object.activity;
                    var render = activity.render();
                    if (render.find('.button--continue-watch').length) return;
                    
                    var episodeHash = generateHash(movie, latestEpisode.season, latestEpisode.episode);
                    var timeline = Lampa.Timeline.view(episodeHash);
                    
                    var time = timeline ? timeline.time : latestEpisode.time;
                    var percent = timeline ? timeline.percent : latestEpisode.percent;
                    
                    var label = 'Продолжить';
                    if (latestEpisode.season && latestEpisode.episode) {
                        label += ' S' + latestEpisode.season + ' E' + latestEpisode.episode;
                    }
                    
                    if (time) {
                        label += ' <span style="opacity:0.7;font-size:0.9em">(' + formatTime(time) + ')</span>';
                    }
                    
                    var dashArray = (percent * 65.97 / 100).toFixed(2);
                    var buttonHtml = `
                        <div class="full-start__button selector button--continue-watch" style="margin-top: 0.5em;">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" style="margin-right: 0.5em">
                                <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
                                <circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none"
                                    stroke-dasharray="${dashArray} 65.97" transform="rotate(-90 12 12)" style="opacity: 0.5"/>
                            </svg>
                            <div>${label}</div>
                        </div>
                    `;
                    
                    var button = $(buttonHtml);
                    button.on('hover:enter', function() {
                        launchPlayer(movie, latestEpisode);
                    });
                    
                    // Вставляем кнопку после торрент-кнопки
                    var torrentBtn = render.find('.view--torrent').last();
                    if (torrentBtn.length) {
                        torrentBtn.after(button);
                    } else {
                        render.find('.full-start__button').last().after(button);
                    }
                }, 100);
            }
        });
    }

    // ========================================================================
    // 6. СЛЕЖЕНИЕ ЗА ПРОСМОТРОМ
    // ========================================================================

    function setupTimelineTracking() {
        Lampa.Timeline.listener.follow('update', function(e) {
            var road = e.data.road;
            var hash = e.data.hash;
            
            if (road && hash) {
                var storage = getStorage();
                if (storage[hash]) {
                    storage[hash].time = road.time;
                    storage[hash].percent = road.percent;
                    storage[hash].duration = road.duration;
                    storage[hash].timestamp = Date.now();
                    
                    saveStorage(storage);
                }
            }
        });
    }

    // ========================================================================
    // 7. ОЧИСТКА СТАРЫХ ДАННЫХ
    // ========================================================================

    function cleanupOldData() {
        setTimeout(function() {
            var storage = getStorage();
            var now = Date.now();
            var changed = false;
            var maxAge = 90 * 24 * 60 * 60 * 1000; // 90 дней
            
            Object.keys(storage).forEach(function(hash) {
                var item = storage[hash];
                if (item.timestamp && (now - item.timestamp > maxAge)) {
                    delete storage[hash];
                    changed = true;
                }
            });
            
            if (changed) {
                saveStorage(storage);
            }
        }, 30000);
    }

    // ========================================================================
    // 8. ИНИЦИАЛИЗАЦИЯ
    // ========================================================================

    function init() {
        updateProfileKey();
        setupContinueButton();
        setupTimelineTracking();
        cleanupOldData();
        
        // Очищаем кэш при смене профиля
        if (Lampa.Listener && Lampa.Listener.follow) {
            Lampa.Listener.follow('account', function(e) {
                if (e.type === 'profile') {
                    EPISODE_TITLES_CACHE = {};
                    STATE.currentTorrentHash = null;
                    updateProfileKey();
                }
            });
        }
        
        console.log('[ContinueWatch] Упрощенный плагин загружен');
    }

    // Запускаем при готовности приложения
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }

})();
