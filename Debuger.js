(function () {
    'use strict';

    // ========================================================================
    // ПЕРЕМЕННЫЕ
    // ========================================================================
    var TORRSERVER_CACHE = null;
    var CURRENT_HASH = null;
    var CURRENT_MOVIE = null;
    var CURRENT_TIMELINE_VIEW = null;

    var PLAYER_START_HANDLER = null;
    var PLAYER_DESTROY_HANDLER = null;
    var LISTENERS_INITIALIZED = false;

    var IS_BUILDING_PLAYLIST = false;
    var LAUNCH_DEBOUNCE = null;

    // ========================================================================
    // 1. ХРАНИЛИЩЕ (БЕЗОПАСНАЯ ЗАПИСЬ)
    // ========================================================================
    
    Lampa.Storage.sync('continue_watch_params', 'object_object');

    Lampa.Storage.listener.follow('change', function(e) {
        if (e.name === 'torrserver_url' || e.name === 'torrserver_url_two' || e.name === 'torrserver_use_link') TORRSERVER_CACHE = null;
    });

    function getParams() {
        return Lampa.Storage.get('continue_watch_params', {});
    }

    function updateContinueWatchParams(hash, data) {
        var params = Lampa.Storage.get('continue_watch_params', {});
        
        if (!params[hash]) params[hash] = {};
        
        for (var key in data) { 
            params[hash][key] = data[key]; 
        }
        
        params[hash].timestamp = Date.now();
        
        Lampa.Storage.set('continue_watch_params', params);
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
                var params = Lampa.Storage.get('continue_watch_params', {});
                var now = Date.now();
                var changed = false;
                for (var hash in params) {
                    if (params[hash].timestamp && now - params[hash].timestamp > 30 * 24 * 60 * 60 * 1000) {
                        delete params[hash];
                        changed = true;
                    }
                }
                if (changed) Lampa.Storage.set('continue_watch_params', params);
            } catch (e) {}
        }, 5000);
    }

    // === УМНЫЙ ВЫБОР СЕРИИ ===
    function getStreamParams(movie) {
        if (!movie) return null;
        var title = movie.original_name || movie.original_title || movie.name || movie.title;
        if (!title) return null;
        var params = getParams();
        
        if (movie.number_of_seasons) {
            var candidates = [];
            for (var hash in params) {
                var p = params[hash];
                if (p.title === title && p.timestamp) {
                    candidates.push(p);
                }
            }

            if (candidates.length === 0) return null;

            candidates.sort(function(a, b) {
                return b.timestamp - a.timestamp;
            });

            var best = candidates[0];
            var now = best.timestamp;

            for (var i = 1; i < candidates.length; i++) {
                var other = candidates[i];
                var timeDiff = Math.abs(now - other.timestamp);

                if (timeDiff < 15 * 60 * 1000) {
                    if (best.file_index !== undefined && other.file_index !== undefined) {
                        if (parseInt(other.file_index) > parseInt(best.file_index)) best = other; 
                    } else if (best.season && other.season) {
                        var bestScore = (best.season * 10000) + best.episode;
                        var otherScore = (other.season * 10000) + other.episode;
                        if (otherScore > bestScore) best = other;
                    }
                } else {
                    break; 
                }
            }
            return best;
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
                        duration: road.duration,
                        // [UPDATE 1] Сохраняем название эпизода при обновлении времени
                        episode_title: params[hash].episode_title 
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
    // 4. СБОРКА ПЛЕЙЛИСТА
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
                Lampa.
