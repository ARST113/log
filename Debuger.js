(function () {
    'use strict';

    const MIGRATION_FLAG_KEY = 'continue_watch_params__migrated_to_profiles';
    const CACHE_TTL = 30 * 60 * 1000;
    const CLEANUP_AGE = 60 * 24 * 60 * 60 * 1000;
    const MAX_RETRIES = 5;
    const DEBOUNCE_DELAY = 1000;

    // ========================================================================
    // СИСТЕМА УВЕДОМЛЕНИЙ И ИНДИКАТОРОВ
    // ========================================================================
    const NotificationManager = (function() {
        let activeNotifications = new Map();
        let playlistLoadingIndicator = null;
        
        function showTimedNotification(message, duration = 3000) {
            const id = 'temp_' + Date.now();
            Lampa.Noty.show(message, duration);
            activeNotifications.set(id, {message, timeout: null});
            return id;
        }
        
        function showPersistentNotification(message) {
            const id = 'persistent_' + Date.now();
            const notification = Lampa.Noty.show(message, 0);
            activeNotifications.set(id, {message, element: notification});
            return id;
        }
        
        function hideNotification(id) {
            const notification = activeNotifications.get(id);
            if (notification) {
                if (notification.element) {
                    try {
                        Lampa.Noty.hide(notification.element);
                    } catch (e) {}
                }
                activeNotifications.delete(id);
            }
        }
        
        function showPlaylistLoadingIndicator() {
            if (!playlistLoadingIndicator) {
                playlistLoadingIndicator = showPersistentNotification('📥 Загрузка плейлиста в фоне...');
            }
        }
        
        function hidePlaylistLoadingIndicator(success = false) {
            if (playlistLoadingIndicator) {
                hideNotification(playlistLoadingIndicator);
                playlistLoadingIndicator = null;
                if (success) {
                    showTimedNotification('✅ Плейлист загружен', 2000);
                }
            }
        }
        
        function clearAll() {
            activeNotifications.forEach((_, id) => hideNotification(id));
            activeNotifications.clear();
            playlistLoadingIndicator = null;
        }
        
        return {
            showTimedNotification,
            showPersistentNotification,
            hideNotification,
            showPlaylistLoadingIndicator,
            hidePlaylistLoadingIndicator,
            clearAll
        };
    })();

    // ========================================================================
    // МОДУЛЬ: КЭШ И ХРАНИЛИЩЕ
    // ========================================================================
    const StorageManager = (function() {
        let memoryCache = null;
        let torrserverCache = null;
        let filesCache = new Map();
        let activeStorageKey = null;
        let syncedStorageKey = null;
        let accountReady = !!window.appready;
        
        const wrappedHandlers = new WeakMap();

        function formatTime(seconds) {
            if (!seconds || seconds <= 0) return '';
            
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            
            if (h > 0) {
                return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        function generateHash(movie, season, episode) {
            const title = movie.original_name || movie.original_title || movie.name || movie.title;
            if (!title) return null;
            
            if (movie.number_of_seasons && season && episode) {
                const separator = season > 10 ? ':' : '';
                return Lampa.Utils.hash(`${season}${separator}${episode}${title}`);
            }
            return Lampa.Utils.hash(title);
        }

        function getStorageKey() {
            try {
                if (accountReady && Lampa.Account && Lampa.Account.Permit && 
                    Lampa.Account.Permit.sync && Lampa.Account.Permit.account && 
                    Lampa.Account.Permit.account.profile && 
                    typeof Lampa.Account.Permit.account.profile.id !== 'undefined') {
                    return `continue_watch_params_${Lampa.Account.Permit.account.profile.id}`;
                }
            } catch (e) {
                console.error('[ContinueWatch] Failed to get profile key:', e);
            }
            return 'continue_watch_params';
        }

        function getActiveStorageKey() {
            const key = getStorageKey();
            if (activeStorageKey !== key) {
                activeStorageKey = key;
                memoryCache = null;
            }
            return key;
        }

        function ensureStorageSync() {
            const key = getActiveStorageKey();
            if (syncedStorageKey !== key) {
                try {
                    Lampa.Storage.sync(key, 'object_object');
                    syncedStorageKey = key;
                } catch (e) {
                    console.error('[ContinueWatch] Storage sync failed:', e);
                }
            }
        }

        function getParams() {
            ensureStorageSync();
            if (!memoryCache) {
                try {
                    memoryCache = Lampa.Storage.get(getActiveStorageKey(), {});
                } catch (e) {
                    console.error('[ContinueWatch] Failed to get params:', e);
                    memoryCache = {};
                }
            }
            return memoryCache;
        }

        function setParams(data, force = false) {
            ensureStorageSync();
            memoryCache = data;
            
            const key = getActiveStorageKey();
            const saveOperation = () => {
                try {
                    Lampa.Storage.set(key, data);
                } catch (e) {
                    console.error('[ContinueWatch] Failed to save params:', e);
                }
            };
            
            if (force) {
                saveOperation();
            } else {
                setTimeout(saveOperation, DEBOUNCE_DELAY);
            }
        }

        function updateContinueWatchParams(hash, data) {
            if (!hash || !data) return false;
            
            const params = getParams();
            if (!params[hash]) {
                params[hash] = {};
            }
            
            let changed = false;
            const oldData = params[hash];
            
            for (const key in data) {
                if (oldData[key] !== data[key]) {
                    oldData[key] = data[key];
                    changed = true;
                }
            }
            
            if (changed || !oldData.timestamp) {
                oldData.timestamp = Date.now();
                const isCritical = (data.percent && data.percent > 90);
                setParams(params, isCritical);
                return true;
            }
            
            return false;
        }

        function getCachedFiles(torrentLink) {
            const cached = filesCache.get(torrentLink);
            if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
                return cached.files;
            }
            filesCache.delete(torrentLink);
            return null;
        }

        function setCachedFiles(torrentLink, files) {
            filesCache.set(torrentLink, {
                files: files,
                timestamp: Date.now()
            });
        }

        function clearCache() {
            memoryCache = null;
            torrserverCache = null;
            filesCache.clear();
            console.log('[ContinueWatch] Cache cleared');
        }

        function getTorrServerUrl() {
            if (!torrserverCache) {
                try {
                    const url = Lampa.Storage.get('torrserver_url');
                    const url_two = Lampa.Storage.get('torrserver_url_two');
                    const use_two = Lampa.Storage.field('torrserver_use_link') === 'two';
                    
                    let final_url = use_two ? (url_two || url) : (url || url_two);
                    
                    if (final_url) {
                        if (!final_url.match(/^https?:\/\//)) {
                            final_url = 'http://' + final_url;
                        }
                        final_url = final_url.replace(/\/$/, '');
                        
                        try {
                            new URL(final_url);
                        } catch (e) {
                            console.error('[ContinueWatch] Invalid TorrServer URL:', final_url);
                            return null;
                        }
                    }
                    
                    torrserverCache = final_url || null;
                } catch (e) {
                    console.error('[ContinueWatch] Failed to get TorrServer URL:', e);
                    torrserverCache = null;
                }
            }
            return torrserverCache;
        }

        function buildStreamUrl(params) {
            if (!params || !params.file_name || !params.torrent_link) {
                console.error('[ContinueWatch] Missing params for stream URL:', params);
                return null;
            }
            
            const server_url = getTorrServerUrl();
            if (!server_url) {
                Lampa.Noty.show('TorrServer не настроен');
                return null;
            }
            
            const encodedFile = encodeURIComponent(params.file_name);
            const encodedLink = encodeURIComponent(params.torrent_link);
            const index = params.file_index || 0;
            
            return `${server_url}/stream/${encodedFile}?link=${encodedLink}&index=${index}&play`;
        }

        function getStreamParams(movie) {
            if (!movie) return null;
            
            const title = movie.original_name || movie.original_title || movie.name || movie.title;
            if (!title) return null;
            
            const params = getParams();
            
            if (movie.number_of_seasons) {
                const episodes = Object.values(params)
                    .filter(p => p.title === title && p.season && p.episode)
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                
                return episodes[0] || null;
            } 
            else {
                const hash = Lampa.Utils.hash(title);
                return params[hash] || null;
            }
        }

        function wrapTimelineHandler(timeline, params) {
            if (!timeline || !params) return timeline;
            
            if (wrappedHandlers.has(timeline)) {
                return wrappedHandlers.get(timeline);
            }
            
            if (timeline._wrapped_continue) {
                wrappedHandlers.set(timeline, timeline);
                return timeline;
            }
            
            const originalHandler = timeline.handler;
            let lastUpdate = 0;
            const updateInterval = 1000;
            
            timeline.handler = function (percent, time, duration) {
                try {
                    if (originalHandler) {
                        originalHandler.call(this, percent, time, duration);
                    }
                    
                    const now = Date.now();
                    if (now - lastUpdate >= updateInterval) {
                        lastUpdate = now;
                        
                        updateContinueWatchParams(timeline.hash, {
                            file_name: params.file_name,
                            torrent_link: params.torrent_link,
                            file_index: params.file_index,
                            title: params.title,
                            season: params.season,
                            episode: params.episode,
                            episode_title: params.episode_title,
                            percent: Math.min(percent, 100),
                            time: Math.max(0, time),
                            duration: Math.max(0, duration)
                        });
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Timeline handler error:', e);
                }
            };
            
            timeline._wrapped_continue = true;
            wrappedHandlers.set(timeline, timeline);
            
            return timeline;
        }

        return {
            getParams,
            updateContinueWatchParams,
            getStreamParams,
            buildStreamUrl,
            generateHash,
            formatTime,
            getCachedFiles,
            setCachedFiles,
            clearCache,
            getTorrServerUrl,
            wrapTimelineHandler,
            getActiveStorageKey,
            ensureStorageSync,
            
            setAccountReady: function(ready) {
                accountReady = ready;
            }
        };
    })();

    // ========================================================================
    // МОДУЛЬ: ПЛЕЙЛИСТ И ФАЙЛЫ
    // ========================================================================
    const PlaylistManager = (function() {
        let buildingPlaylist = false;
        const abortControllers = new Map();

        function buildPlaylist(movie, currentParams, currentUrl, isExternalPlayer, callback) {
            if (!movie || !currentParams || typeof callback !== 'function') {
                callback([]);
                return;
            }
            
            if (buildingPlaylist) {
                callback([]);
                return;
            }
            
            buildingPlaylist = true;
            const controllerId = Date.now();
            
            const abortController = {
                id: controllerId,
                aborted: false,
                abort: function() {
                    this.aborted = true;
                    abortControllers.delete(this.id);
                }
            };
            
            abortControllers.set(controllerId, abortController);
            
            const finalize = function(resultList) {
                abortController.abort();
                buildingPlaylist = false;
                
                if (movie.number_of_seasons && resultList.length > 0) {
                    resultList.sort((a, b) => {
                        if (a.season === b.season) return a.episode - b.episode;
                        return a.season - b.season;
                    });
                }
                
                callback(resultList);
            };
            
            collectPlaylistData(movie, currentParams, currentUrl, isExternalPlayer, abortController, finalize);
        }

        function collectPlaylistData(movie, currentParams, currentUrl, isExternalPlayer, abortController, finalize) {
            const title = movie.original_name || movie.original_title || movie.name || movie.title;
            if (!title) {
                finalize([]);
                return;
            }
            
            const params = StorageManager.getParams();
            const playlist = [];
            
            const episodesFromHistory = Object.values(params)
                .filter(p => p.title === title && p.season && p.episode)
                .map(p => createPlaylistItem(movie, p, currentParams, currentUrl));
            
            playlist.push(...episodesFromHistory);
            
            if (!currentParams.torrent_link || !movie.number_of_seasons) {
                finalize(playlist);
                return;
            }
            
            if (isExternalPlayer) {
                NotificationManager.showPlaylistLoadingIndicator();
                loadExternalPlaylist(movie, currentParams, currentUrl, playlist, abortController, finalize);
            } 
            else {
                finalize(playlist);
                
                setTimeout(() => {
                    if (!abortController.aborted) {
                        loadCompletePlaylist(movie, currentParams, currentUrl, playlist, (fullPlaylist) => {
                            if (fullPlaylist.length > playlist.length) {
                                try {
                                    const player = Lampa.Player.instance();
                                    if (player && player.playlist) {
                                        Lampa.Player.playlist(fullPlaylist);
                                        NotificationManager.showTimedNotification(`🎬 Плейлист обновлен: ${fullPlaylist.length} эпизодов`);
                                    }
                                } catch (e) {
                                    console.error('[ContinueWatch] Failed to update playlist:', e);
                                }
                            }
                        }, abortController);
                    }
                }, 100);
            }
        }

        function createPlaylistItem(movie, params, currentParams, currentUrl) {
            const hash = StorageManager.generateHash(movie, params.season, params.episode);
            const timeline = Lampa.Timeline.view(hash);
            
            if (timeline) {
                StorageManager.wrapTimelineHandler(timeline, params);
            }
            
            const isCurrent = (params.season === currentParams.season && 
                              params.episode === currentParams.episode);
            
            const item = {
                title: params.episode_title || `S${params.season} E${params.episode}`,
                season: params.season,
                episode: params.episode,
                timeline: timeline || { hash: hash, percent: 0, time: 0, duration: 0 },
                torrent_hash: params.torrent_hash || params.torrent_link,
                card: movie,
                url: StorageManager.buildStreamUrl(params),
                position: timeline ? (timeline.time || -1) : -1
            };
            
            if (isCurrent && currentUrl) {
                item.url = currentUrl;
            }
            
            return item;
        }

        function loadExternalPlaylist(movie, currentParams, currentUrl, basePlaylist, abortController, finalize) {
            Lampa.Loading.start(
                () => {
                    abortController.abort();
                    finalize([]);
                    NotificationManager.hidePlaylistLoadingIndicator(false);
                },
                'Подготовка плейлиста...'
            );
            
            loadCompletePlaylist(movie, currentParams, currentUrl, basePlaylist, (playlist) => {
                Lampa.Loading.stop();
                NotificationManager.hidePlaylistLoadingIndicator(true);
                finalize(playlist);
            }, abortController);
        }

        function loadCompletePlaylist(movie, currentParams, currentUrl, basePlaylist, callback, abortController) {
            if (abortController && abortController.aborted) {
                callback(basePlaylist);
                return;
            }
            
            const title = movie.original_name || movie.original_title || movie.name || movie.title;
            const torrentLink = currentParams.torrent_link;
            
            const cachedFiles = StorageManager.getCachedFiles(torrentLink);
            if (cachedFiles) {
                processFiles(movie, currentParams, currentUrl, basePlaylist, cachedFiles, callback);
                return;
            }
            
            loadTorrentFiles(torrentLink, title, movie, (files) => {
                if (abortController && abortController.aborted) {
                    callback(basePlaylist);
                    return;
                }
                
                if (files && files.length > 0) {
                    StorageManager.setCachedFiles(torrentLink, files);
                    processFiles(movie, currentParams, currentUrl, basePlaylist, files, callback);
                } else {
                    callback(basePlaylist);
                }
            }, abortController);
        }

        function processFiles(movie, currentParams, currentUrl, basePlaylist, files, callback) {
            const uniqueEpisodes = new Set();
            basePlaylist.forEach(p => uniqueEpisodes.add(`${p.season}_${p.episode}`));
            
            const newPlaylist = [...basePlaylist];
            
            files.forEach(file => {
                try {
                    const episodeInfo = Lampa.Torserver.parse({
                        movie: movie,
                        files: [file],
                        filename: file.path.split('/').pop(),
                        path: file.path,
                        is_file: true
                    });
                    
                    if (!movie.number_of_seasons || episodeInfo.season === currentParams.season) {
                        const epKey = `${episodeInfo.season}_${episodeInfo.episode}`;
                        
                        if (!uniqueEpisodes.has(epKey)) {
                            addFileToPlaylist(movie, currentParams, currentUrl, episodeInfo, file, newPlaylist);
                            uniqueEpisodes.add(epKey);
                        }
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Failed to parse file:', e);
                }
            });
            
            callback(newPlaylist);
        }

        function addFileToPlaylist(movie, currentParams, currentUrl, episodeInfo, file, playlist) {
            const hash = StorageManager.generateHash(movie, episodeInfo.season, episodeInfo.episode);
            const timeline = Lampa.Timeline.view(hash);
            
            const params = {
                file_name: file.path,
                torrent_link: currentParams.torrent_link,
                file_index: file.id || 0,
                title: movie.original_name || movie.original_title || movie.name || movie.title,
                season: episodeInfo.season,
                episode: episodeInfo.episode,
                percent: 0,
                time: 0,
                duration: 0
            };
            
            StorageManager.updateContinueWatchParams(hash, params);
            
            const isCurrent = (episodeInfo.season === currentParams.season && 
                              episodeInfo.episode === currentParams.episode);
            
            const item = {
                title: movie.number_of_seasons ? 
                       `S${episodeInfo.season} E${episodeInfo.episode}` : 
                       (movie.title || params.title),
                season: episodeInfo.season,
                episode: episodeInfo.episode,
                timeline: timeline || { hash: hash, percent: 0, time: 0, duration: 0 },
                torrent_hash: currentParams.torrent_link,
                card: movie,
                url: StorageManager.buildStreamUrl(params),
                position: timeline ? timeline.time : -1
            };
            
            if (isCurrent) {
                item.url = currentUrl;
            }
            
            playlist.push(item);
        }

        function loadTorrentFiles(torrentLink, title, movie, callback, abortController) {
            let retryCount = 0;
            
            const loadHash = () => {
                if (abortController && abortController.aborted) {
                    callback([]);
                    return;
                }
                
                Lampa.Torserver.hash({
                    link: torrentLink,
                    title: title,
                    poster: movie.poster_path,
                    data: { lampa: true, movie: movie }
                }, (torrent) => {
                    if (abortController && abortController.aborted) {
                        callback([]);
                        return;
                    }
                    
                    if (torrent && torrent.hash) {
                        loadFiles(torrent.hash);
                    } else if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        setTimeout(loadHash, retryCount * 1000);
                    } else {
                        callback([]);
                    }
                }, (error) => {
                    console.error('[ContinueWatch] Failed to get torrent hash:', error);
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        setTimeout(loadHash, retryCount * 1000);
                    } else {
                        callback([]);
                    }
                });
            };
            
            const loadFiles = (hash) => {
                if (abortController && abortController.aborted) {
                    callback([]);
                    return;
                }
                
                Lampa.Torserver.files(hash, (json) => {
                    if (abortController && abortController.aborted) {
                        callback([]);
                        return;
                    }
                    
                    if (json && json.file_stats && json.file_stats.length > 0) {
                        callback(json.file_stats);
                    } else if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        setTimeout(() => loadFiles(hash), retryCount * 1000);
                    } else {
                        callback([]);
                    }
                }, (error) => {
                    console.error('[ContinueWatch] Failed to get files:', error);
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        setTimeout(() => loadFiles(hash), retryCount * 1000);
                    } else {
                        callback([]);
                    }
                });
            };
            
            loadHash();
        }

        function preloadFiles(torrentLink, movie) {
            if (!torrentLink || StorageManager.getCachedFiles(torrentLink)) {
                return;
            }
            
            const title = movie.original_name || movie.original_title || movie.name || movie.title;
            
            setTimeout(() => {
                loadTorrentFiles(torrentLink, title, movie, (files) => {
                    if (files && files.length > 0) {
                        StorageManager.setCachedFiles(torrentLink, files);
                    }
                }, null);
            }, 2000);
        }

        return {
            buildPlaylist,
            preloadFiles
        };
    })();

    // ========================================================================
    // МОДУЛЬ: УПРАВЛЕНИЕ ПЛЕЕРОМ
    // ========================================================================
    const PlayerManager = (function() {
        let listenersInitialized = false;
        let playerStartListener = null;
        let playerDestroyListener = null;
        let playlistSelectListener = null;
        let currentEpisodeData = null;

        function launchPlayer(movie, params) {
            if (!movie || !params) return;
            
            const url = StorageManager.buildStreamUrl(params);
            if (!url) {
                console.error('[ContinueWatch] Failed to build stream URL for params:', params);
                return;
            }
            
            console.log('[ContinueWatch] Запускаем плеер для:', movie.title || movie.name);
            
            const currentHash = StorageManager.generateHash(movie, params.season, params.episode);
            const timeline = Lampa.Timeline.view(currentHash);
            
            let restoreTime = params.time || 0;
            let restorePercent = params.percent || 0;
            
            if (timeline) {
                if (timeline.time > 0 && timeline.time > restoreTime) {
                    restoreTime = timeline.time;
                    restorePercent = timeline.percent;
                }
                StorageManager.wrapTimelineHandler(timeline, params);
            }
            
            StorageManager.updateContinueWatchParams(currentHash, {
                percent: restorePercent,
                time: restoreTime,
                duration: params.duration || 0
            });
            
            const playerType = Lampa.Storage.field('player_torrent');
            const forceInner = (playerType === 'inner');
            const isExternalPlayer = !forceInner && (playerType !== 'lampa');
            
            const playerData = {
                url: url,
                title: params.episode_title || params.title || movie.title,
                card: movie,
                torrent_hash: params.torrent_link,
                timeline: timeline || { hash: currentHash, percent: restorePercent, time: restoreTime, duration: 0 },
                season: params.season,
                episode: params.episode,
                position: restoreTime > 10 ? restoreTime : -1
            };
            
            currentEpisodeData = {
                movie: movie,
                params: params,
                hash: currentHash,
                url: url
            };
            
            if (forceInner) {
                delete playerData.torrent_hash;
                
                const originalPlatformIs = Lampa.Platform.is;
                Lampa.Platform.is = function(what) {
                    return what === 'android' ? false : originalPlatformIs.call(this, what);
                };
                
                setTimeout(() => {
                    Lampa.Platform.is = originalPlatformIs;
                }, 500);
                
                Lampa.Storage.set('internal_torrclient', true);
            }
            
            if (isExternalPlayer) {
                launchExternalPlayer(movie, params, url, playerData);
            } else {
                launchInternalPlayer(movie, params, url, playerData, restoreTime);
            }
        }
        
        function launchExternalPlayer(movie, params, url, playerData) {
            console.log('[ContinueWatch] Запуск внешнего плеера с загрузкой плейлиста...');
            PlaylistManager.buildPlaylist(movie, params, url, true, (playlist) => {
                if (!playlist || playlist.length === 0) {
                    console.error('[ContinueWatch] Empty playlist for external player');
                    return;
                }
                
                playerData.playlist = playlist;
                
                try {
                    Lampa.Player.play(playerData);
                    Lampa.Player.callback(() => {
                        Lampa.Controller.toggle('content');
                    });
                } catch (e) {
                    console.error('[ContinueWatch] Failed to launch external player:', e);
                }
            });
        }
        
        function launchInternalPlayer(movie, params, url, playerData, restoreTime) {
            const tempPlaylist = [{
                url: url,
                title: params.episode_title || `S${params.season} E${params.episode}`,
                timeline: playerData.timeline,
                season: params.season,
                episode: params.episode,
                card: movie
            }];
            
            playerData.playlist = tempPlaylist;
            
            if (restoreTime > 10) {
                const timeStr = StorageManager.formatTime(restoreTime);
                Lampa.Noty.show(`⏪ Восстанавливаем: ${timeStr}`);
            }
            
            console.log('[ContinueWatch] Быстрый запуск внутреннего плеера');
            
            try {
                Lampa.Player.play(playerData);
                setupPlayerListeners();
                Lampa.Player.callback(() => {
                    Lampa.Controller.toggle('content');
                });
                
                if (movie.number_of_seasons) {
                    PlaylistManager.buildPlaylist(movie, params, url, false, (playlist) => {
                        if (playlist.length > 1) {
                            try {
                                Lampa.Player.playlist(playlist);
                            } catch (e) {
                                console.error('[ContinueWatch] Failed to update playlist:', e);
                            }
                        }
                    });
                }
            } catch (e) {
                console.error('[ContinueWatch] Failed to launch internal player:', e);
            }
        }
        
        // ========================================================================
        // ОБРАБОТКА ПЕРЕКЛЮЧЕНИЯ СЕРИЙ ЧЕРЕЗ СОБЫТИЕ 'select' ПЛЕЙЛИСТА
        // ========================================================================
        function setupPlaylistSelectListener() {
            if (playlistSelectListener) {
                // Безопасное удаление существующего слушателя
                try {
                    if (Lampa.Playlist && Lampa.Playlist.listener) {
                        Lampa.Playlist.listener.remove('select', playlistSelectListener);
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Error removing playlist listener:', e);
                }
            }
            
            playlistSelectListener = function(e) {
                try {
                    console.log('[ContinueWatch] Playlist select event:', e);
                    
                    if (e && e.item) {
                        handleEpisodeSwitch(e.item);
                    }
                } catch (error) {
                    console.error('[ContinueWatch] Playlist select listener error:', error);
                }
            };
            
            // Безопасная установка слушателя
            try {
                if (Lampa.Playlist && Lampa.Playlist.listener) {
                    Lampa.Playlist.listener.follow('select', playlistSelectListener);
                    console.log('[ContinueWatch] Playlist select listener установлен');
                } else {
                    console.error('[ContinueWatch] Lampa.Playlist or its listener is not available');
                }
            } catch (e) {
                console.error('[ContinueWatch] Failed to setup playlist listener:', e);
            }
        }
        
        function handleEpisodeSwitch(item) {
            try {
                console.log('[ContinueWatch] Переключили на серию:', item);
                
                if (!item || !item.card) {
                    console.log('[ContinueWatch] Нет данных о карточке в элементе плейлиста');
                    return;
                }
                
                const movie = item.card;
                const season = item.season;
                const episode = item.episode;
                
                if (!season || !episode) {
                    console.log('[ContinueWatch] Нет информации о сезоне/эпизоде');
                    return;
                }
                
                const hash = StorageManager.generateHash(movie, season, episode);
                
                // Извлекаем параметры из URL
                const matchFile = item.url && item.url.match(/\/stream\/([^?]+)/);
                const matchLink = item.url && item.url.match(/[?&]link=([^&]+)/);
                const matchIndex = item.url && item.url.match(/[?&]index=(\d+)/);
                
                if (hash && matchFile && matchLink) {
                    const params = {
                        file_name: decodeURIComponent(matchFile[1]),
                        torrent_link: decodeURIComponent(matchLink[1]),
                        file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                        title: movie.original_name || movie.original_title || movie.title,
                        season: season,
                        episode: episode,
                        episode_title: item.title || item.episode_title,
                        percent: 0,
                        time: 0,
                        duration: 0
                    };
                    
                    currentEpisodeData = {
                        movie: movie,
                        params: params,
                        hash: hash,
                        url: item.url
                    };
                    
                    // Сохраняем параметры эпизода
                    StorageManager.updateContinueWatchParams(hash, params);
                    
                    // Обертываем timeline для нового эпизода
                    const timeline = Lampa.Timeline.view(hash);
                    if (timeline) {
                        StorageManager.wrapTimelineHandler(timeline, params);
                        console.log(`[ContinueWatch] Timeline обернут для эпизода: S${season}E${episode}`);
                        
                        // Восстанавливаем прогресс, если есть
                        if (timeline.time && timeline.time > 10) {
                            const timeStr = StorageManager.formatTime(timeline.time);
                            Lampa.Noty.show(`⏪ Восстанавливаем: ${timeStr}`, 2000);
                        }
                    } else {
                        console.log(`[ContinueWatch] Нет timeline для эпизода: S${season}E${episode}`);
                    }
                    
                    console.log(`[ContinueWatch] Обработан переход на эпизод: S${season}E${episode}`);
                } else {
                    console.log('[ContinueWatch] Не удалось извлечь параметры из URL');
                }
            } catch (error) {
                console.error('[ContinueWatch] Episode switch handler error:', error);
            }
        }
        
        // ========================================================================
        // СЛУШАТЕЛИ ПЛЕЕРА
        // ========================================================================
        function setupPlayerListeners() {
            if (listenersInitialized) {
                cleanupPlayerListeners();
            }
            
            playerStartListener = function(data) {
                try {
                    console.log('[ContinueWatch] Player start event:', data);
                    
                    // При старте плеера также обрабатываем как переключение на первый эпизод
                    if (data && data.card) {
                        handlePlayerStart(data);
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Player start listener error:', e);
                }
            };
            
            playerDestroyListener = function() {
                console.log('[ContinueWatch] Player destroy event');
                
                // Сохраняем прогресс текущего эпизода
                if (currentEpisodeData) {
                    try {
                        const timeline = Lampa.Timeline.view(currentEpisodeData.hash);
                        if (timeline && timeline.time > 0) {
                            StorageManager.updateContinueWatchParams(currentEpisodeData.hash, {
                                percent: timeline.percent || 0,
                                time: timeline.time || 0,
                                duration: timeline.duration || 0
                            });
                            console.log(`[ContinueWatch] Сохранен прогресс перед закрытием плеера: ${timeline.time} сек`);
                        }
                    } catch (e) {
                        console.error('[ContinueWatch] Error saving progress on destroy:', e);
                    }
                }
                
                cleanupPlayerListeners();
                currentEpisodeData = null;
            };
            
            try {
                if (Lampa.Player && Lampa.Player.listener) {
                    Lampa.Player.listener.follow('start', playerStartListener);
                    Lampa.Player.listener.follow('destroy', playerDestroyListener);
                } else {
                    console.error('[ContinueWatch] Lampa.Player or its listener is not available');
                }
                
                // Устанавливаем слушатель для плейлиста
                setupPlaylistSelectListener();
                
                listenersInitialized = true;
                console.log('[ContinueWatch] Player listeners setup complete');
            } catch (e) {
                console.error('[ContinueWatch] Failed to setup player listeners:', e);
            }
        }
        
        function handlePlayerStart(data) {
            try {
                console.log('[ContinueWatch] Обработка начала воспроизведения:', data);
                
                if (data && data.card) {
                    const movie = data.card;
                    const season = data.season;
                    const episode = data.episode;
                    
                    if (!season || !episode) {
                        console.log('[ContinueWatch] Нет информации о сезоне/эпизоде, пропускаем');
                        return;
                    }
                    
                    const hash = StorageManager.generateHash(movie, season, episode);
                    
                    const matchFile = data.url && data.url.match(/\/stream\/([^?]+)/);
                    const matchLink = data.url && data.url.match(/[?&]link=([^&]+)/);
                    const matchIndex = data.url && data.url.match(/[?&]index=(\d+)/);
                    
                    if (hash && matchFile && matchLink) {
                        const params = {
                            file_name: decodeURIComponent(matchFile[1]),
                            torrent_link: decodeURIComponent(matchLink[1]),
                            file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                            title: movie.original_name || movie.original_title || movie.title,
                            season: season,
                            episode: episode,
                            episode_title: data.title || data.episode_title,
                            percent: 0,
                            time: 0,
                            duration: 0
                        };
                        
                        currentEpisodeData = {
                            movie: movie,
                            params: params,
                            hash: hash,
                            url: data.url
                        };
                        
                        StorageManager.updateContinueWatchParams(hash, params);
                        
                        const timeline = Lampa.Timeline.view(hash);
                        if (timeline) {
                            StorageManager.wrapTimelineHandler(timeline, params);
                            console.log(`[ContinueWatch] Timeline обернут для эпизода: S${season}E${episode}`);
                        }
                        
                        // Восстанавливаем прогресс, если есть
                        const savedParams = StorageManager.getParams()[hash];
                        if (savedParams && savedParams.time && savedParams.time > 10) {
                            const timeStr = StorageManager.formatTime(savedParams.time);
                            Lampa.Noty.show(`⏪ Восстанавливаем: ${timeStr}`, 2000);
                        }
                    }
                }
            } catch (e) {
                console.error('[ContinueWatch] Player start handler error:', e);
            }
        }
        
        function cleanupPlayerListeners() {
            try {
                // Безопасное удаление слушателей Player
                if (playerStartListener && Lampa.Player && Lampa.Player.listener) {
                    try {
                        Lampa.Player.listener.remove('start', playerStartListener);
                    } catch (e) {
                        console.error('[ContinueWatch] Error removing player start listener:', e);
                    }
                }
                playerStartListener = null;
                
                if (playerDestroyListener && Lampa.Player && Lampa.Player.listener) {
                    try {
                        Lampa.Player.listener.remove('destroy', playerDestroyListener);
                    } catch (e) {
                        console.error('[ContinueWatch] Error removing player destroy listener:', e);
                    }
                }
                playerDestroyListener = null;
                
                // Безопасное удаление слушателей Playlist
                if (playlistSelectListener && Lampa.Playlist && Lampa.Playlist.listener) {
                    try {
                        Lampa.Playlist.listener.remove('select', playlistSelectListener);
                    } catch (e) {
                        console.error('[ContinueWatch] Error removing playlist listener:', e);
                    }
                }
                playlistSelectListener = null;
                
                listenersInitialized = false;
                console.log('[ContinueWatch] Player listeners cleaned up');
            } catch (e) {
                console.error('[ContinueWatch] Failed to cleanup player listeners:', e);
            }
        }
        
        // ========================================================================
        // ПАТЧИНГ ПЛЕЕРА
        // ========================================================================
        function patchPlayer() {
            if (Lampa.Player._continue_patched) {
                return;
            }
            
            const originalPlay = Lampa.Player.play;
            
            Lampa.Player.play = function(params) {
                try {
                    console.log('[ContinueWatch] Player.play called with params:', params);
                    
                    if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                        const movie = params.card || params.movie || 
                                    (Lampa.Activity.active() && Lampa.Activity.active().movie);
                        
                        if (movie) {
                            const hash = StorageManager.generateHash(movie, params.season, params.episode);
                            
                            if (hash) {
                                const timeline = Lampa.Timeline.view(hash);
                                const isNewSession = !timeline || !timeline.percent || timeline.percent < 5;
                                
                                if (isNewSession) {
                                    const matchFile = params.url && params.url.match(/\/stream\/([^?]+)/);
                                    const matchLink = params.url && params.url.match(/[?&]link=([^&]+)/);
                                    const matchIndex = params.url && params.url.match(/[?&]index=(\d+)/);
                                    
                                    if (matchFile && matchLink) {
                                        const newParams = {
                                            file_name: decodeURIComponent(matchFile[1]),
                                            torrent_link: decodeURIComponent(matchLink[1]),
                                            file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                            title: movie.original_name || movie.original_title || movie.title,
                                            season: params.season,
                                            episode: params.episode,
                                            episode_title: params.title || params.episode_title
                                        };
                                        
                                        StorageManager.updateContinueWatchParams(hash, newParams);
                                        console.log(`[ContinueWatch] Сохранены параметры для эпизода: S${params.season}E${params.episode}`);
                                        
                                        if (timeline) {
                                            StorageManager.wrapTimelineHandler(timeline, newParams);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Player patch error:', e);
                }
                
                return originalPlay.call(this, params);
            };
            
            Lampa.Player._continue_patched = true;
            console.log('[ContinueWatch] Player patched successfully');
        }
        
        // ========================================================================
        // ПУБЛИЧНЫЙ API
        // ========================================================================
        return {
            launchPlayer,
            patchPlayer,
            setupPlayerListeners,
            cleanupPlayerListeners
        };
    })();

    // ========================================================================
    // МОДУЛЬ: UI И КНОПКА
    // ========================================================================
    const UIManager = (function() {
        let debounceTimer = null;
        
        function handleContinueClick(movieData, buttonElement) {
            if (debounceTimer) return;
            
            const params = StorageManager.getStreamParams(movieData);
            if (!params) {
                Lampa.Noty.show('Нет истории просмотров');
                return;
            }
            
            if (buttonElement) {
                $(buttonElement).css('opacity', 0.5);
            }
            
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                if (buttonElement) {
                    $(buttonElement).css('opacity', 1);
                }
            }, DEBOUNCE_DELAY);
            
            console.log(`[ContinueWatch] 🚀 Нажата кнопка "Продолжить" для: ${movieData.title || movieData.name}`);
            
            PlayerManager.launchPlayer(movieData, params);
        }
        
        function createContinueButton(movie, params) {
            const hash = StorageManager.generateHash(movie, params.season, params.episode);
            const view = Lampa.Timeline.view(hash);
            
            let percent = 0;
            let timeStr = "";
            
            if (view && view.percent > 0) {
                percent = view.percent;
                timeStr = StorageManager.formatTime(view.time);
            } else if (params.time) {
                percent = params.percent || 0;
                timeStr = StorageManager.formatTime(params.time);
            }
            
            let labelText = '▶️ Продолжить';
            if (params.season && params.episode) {
                labelText += ` S${params.season} E${params.episode}`;
            }
            if (timeStr) {
                labelText += ` <span style="opacity:0.7;font-size:0.9em">(${timeStr})</span>`;
            }
            
            const dashArray = (percent * 65.97 / 100).toFixed(2);
            
            const buttonHtml = `
                <div class="full-start__button selector button--continue-watch" style="margin-top: 0.5em; position: relative;">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" style="margin-right: 0.5em">
                        <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
                        <circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" 
                            stroke-dasharray="${dashArray} 65.97" transform="rotate(-90 12 12)" style="opacity: 0.5"/>
                    </svg>
                    <div>${labelText}</div>
                </div>
            `;
            
            return $(buttonHtml);
        }
        
        function setupContinueButton() {
            Lampa.Listener.follow('full', function (e) {
                if (e.type === 'complite') {
                    requestAnimationFrame(() => {
                        const activity = e.object.activity;
                        const render = activity.render();
                        
                        if (render.find('.button--continue-watch').length) {
                            return;
                        }
                        
                        const params = StorageManager.getStreamParams(e.data.movie);
                        if (!params) {
                            return;
                        }
                        
                        console.log(`[ContinueWatch] 📍 Отображаем кнопку для: ${e.data.movie.title || e.data.movie.name}`);
                        
                        if (params.torrent_link && !StorageManager.getCachedFiles(params.torrent_link)) {
                            PlaylistManager.preloadFiles(params.torrent_link, e.data.movie);
                        }
                        
                        const continueBtn = createContinueButton(e.data.movie, params);
                        continueBtn.on('hover:enter', function () {
                            handleContinueClick(e.data.movie, this);
                        });
                        
                        const torrentBtn = render.find('.view--torrent').last();
                        const buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();
                        
                        if (torrentBtn.length) {
                            torrentBtn.after(continueBtn);
                        } else if (buttonsContainer.length) {
                            buttonsContainer.append(continueBtn);
                        } else {
                            render.find('.full-start__button').last().after(continueBtn);
                        }
                    });
                }
            });
        }
        
        return {
            setupContinueButton,
            handleContinueClick
        };
    })();

    // ========================================================================
    // МОДУЛЬ: МИГРАЦИЯ И ОЧИСТКА
    // ========================================================================
    const MigrationManager = (function() {
        function migrateOldData() {
            try {
                if (!(StorageManager.setAccountReady && Lampa.Account && 
                      Lampa.Account.Permit && Lampa.Account.Permit.sync)) {
                    return;
                }
                
                if (Lampa.Storage.get(MIGRATION_FLAG_KEY, false)) {
                    return;
                }
                
                const oldKey = 'continue_watch_params';
                const oldData = Lampa.Storage.get(oldKey, {});
                const newKey = StorageManager.getActiveStorageKey();
                const newData = Lampa.Storage.get(newKey, {});
                
                if (Object.keys(oldData).length > 0 && Object.keys(newData).length === 0) {
                    Lampa.Storage.set(newKey, oldData);
                    Lampa.Storage.set(MIGRATION_FLAG_KEY, true);
                    console.log('[ContinueWatch] Migrated old data to profile key:', newKey);
                } else {
                    Lampa.Storage.set(MIGRATION_FLAG_KEY, true);
                }
            } catch (e) {
                console.error('[ContinueWatch] Migration failed:', e);
            }
        }
        
        function cleanupOldParams() {
            setTimeout(() => {
                try {
                    const params = StorageManager.getParams();
                    const now = Date.now();
                    let changed = false;
                    
                    Object.keys(params).forEach(hash => {
                        if (params[hash].timestamp && now - params[hash].timestamp > CLEANUP_AGE) {
                            delete params[hash];
                            changed = true;
                        }
                    });
                    
                    if (changed) {
                        StorageManager.setParams(params);
                        console.log('[ContinueWatch] Cleaned up old params');
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Cleanup failed:', e);
                }
            }, 10000);
        }
        
        function setupProfileListener() {
            Lampa.Listener.follow('profile_select', () => {
                StorageManager.clearCache();
                StorageManager.ensureStorageSync();
                migrateOldData();
                NotificationManager.clearAll();
                console.log('[ContinueWatch] Profile changed, caches cleared');
            });
        }
        
        return {
            migrateOldData,
            cleanupOldParams,
            setupProfileListener
        };
    })();

    // ========================================================================
    // МОДУЛЬ: ТАЙМЛАЙН И СИНХРОНИЗАЦИЯ
    // ========================================================================
    const TimelineManager = (function() {
        function setupTimelineSaving() {
            Lampa.Timeline.listener.follow('update', (e) => {
                try {
                    const hash = e.data.hash;
                    const road = e.data.road;
                    
                    console.log(`[ContinueWatch] Timeline update for hash: ${hash}, percent: ${road.percent}, time: ${road.time}`);
                    
                    if (hash && road && typeof road.percent !== 'undefined') {
                        const params = StorageManager.getParams();
                        if (params[hash]) {
                            StorageManager.updateContinueWatchParams(hash, {
                                percent: road.percent,
                                time: road.time,
                                duration: road.duration
                            });
                        }
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Timeline update error:', e);
                }
            });
        }
        
        return {
            setupTimelineSaving
        };
    })();

    // ========================================================================
    // МОДУЛЬ: ИНИЦИАЛИЗАЦИЯ
    // ========================================================================
    const InitializationManager = (function() {
        function initialize() {
            try {
                StorageManager.ensureStorageSync();
                PlayerManager.patchPlayer();
                MigrationManager.cleanupOldParams();
                UIManager.setupContinueButton();
                TimelineManager.setupTimelineSaving();
                MigrationManager.setupProfileListener();
                MigrationManager.migrateOldData();
                
                console.log('[ContinueWatch] v80 Loaded. Fixed cleanup listeners issue.');
                console.log('[ContinueWatch] Теперь корректно обрабатывает уничтожение плеера без ошибок.');
                
                window.__continueWatchDebug = {
                    getStatus: function() {
                        const cacheSize = StorageManager.getParams ? Object.keys(StorageManager.getParams() || {}).length : 0;
                        
                        console.log(`[ContinueWatch] Статус:`);
                        console.log(`  - Записей в кэше: ${cacheSize}`);
                        console.log(`  - TorrServer URL: ${StorageManager.getTorrServerUrl()}`);
                        console.log(`  - Player listeners инициализированы: ${PlayerManager.listenersInitialized}`);
                    }
                };
                
            } catch (e) {
                console.error('[ContinueWatch] Initialization failed:', e);
            }
        }
        
        function setupAppListener() {
            Lampa.Listener.follow('app', (e) => {
                if (e.type === 'ready') {
                    StorageManager.setAccountReady(true);
                    StorageManager.ensureStorageSync();
                    MigrationManager.migrateOldData();
                }
            });
        }
        
        return {
            initialize,
            setupAppListener
        };
    })();

    // ========================================================================
    // ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ
    // ========================================================================
    if (window.appready) {
        InitializationManager.initialize();
    } else {
        InitializationManager.setupAppListener();
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') {
                InitializationManager.initialize();
            }
        });
    }
})();
