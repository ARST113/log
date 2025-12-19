(function () {
    'use strict';

    // ========================================================================
    // КОНФИГУРАЦИЯ И КЭШ
    // ========================================================================
    var STORAGE_KEY = 'continue_watch_params';
    var LEGACY_MIGRATED = false;
    var MEMORY_CACHE = null;
    var TORRSERVER_CACHE = null;
    var FILES_CACHE = {};

    // маппинг "чужих" timeline.hash -> наш эпизодный hash
    var TIMELINE_HASH_MAP = {};

    // трекер переключений внутри плеера
    var PLAYER_SWITCH = {
        timer: null,
        last_key: '',
        last_pos: -1,
        last_url: '',
        last_title: ''
    };

    var TIMERS = {
        save: null,
        debounce_click: null
    };

    var LISTENERS = {
        player_start: null,
        player_destroy: null,
        account: null,
        initialized: false
    };

    var STATE = {
        building_playlist: false
    };

    // ========================================================================
    // 1. ХРАНИЛИЩЕ
    // ========================================================================

    function getStorageKey() {
        var profile_id = (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.sync && Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile) ? Lampa.Account.Permit.account.profile.id : '';
        return STORAGE_KEY + (profile_id ? '_' + profile_id : '');
    }

    // Инициализация синхронизации
    Lampa.Storage.sync(getStorageKey(), 'object_object');

    function migrateLegacyProfileStorage() {
        if (LEGACY_MIGRATED) return;

        var profileId = Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile && Lampa.Account.Permit.account.profile.id;
        if (!profileId) return;

        var profileKey = getStorageKey();
        var profileData = Lampa.Storage.get(profileKey);
        var legacyData = Lampa.Storage.get(STORAGE_KEY);

        // Если профиль пуст, но есть старые общие данные — копируем их
        if (!profileData && legacyData && typeof legacyData === 'object' && !Array.isArray(legacyData)) {
            try {
                var clone = JSON.parse(JSON.stringify(legacyData));
                Lampa.Storage.set(profileKey, clone);
                MEMORY_CACHE = clone;
            } catch (e) {}
        }
        LEGACY_MIGRATED = true;
    }

    Lampa.Storage.listener.follow('change', function (e) {
        // Если изменился ключ текущего профиля — сбрасываем кэш
        if (e.name === getStorageKey()) MEMORY_CACHE = null;
        if (e.name === 'torrserver_url' || e.name === 'torrserver_url_two' || e.name === 'torrserver_use_link') TORRSERVER_CACHE = null;
    });

    function setupAccountListener() {
        if (LISTENERS.account) return;

        LISTENERS.account = function (e) {
            if (e.type === 'profile' || e.type === 'login' || e.type === 'logout') {
                MEMORY_CACHE = null;
                TORRSERVER_CACHE = null;
                FILES_CACHE = {};
                TIMELINE_HASH_MAP = {};
                PLAYER_SWITCH.last_key = '';
                
                // Перерегистрируем синхронизацию под новым ключом
                Lampa.Storage.sync(getStorageKey(), 'object_object');
                migrateLegacyProfileStorage();
            }
        };
        Lampa.Listener.follow('account', LISTENERS.account);
    }

    function getParams() {
        if (!MEMORY_CACHE) MEMORY_CACHE = Lampa.Storage.get(getStorageKey(), {});
        return MEMORY_CACHE;
    }

    function setParams(data, force) {
        MEMORY_CACHE = data;
        clearTimeout(TIMERS.save);

        if (force) {
            Lampa.Storage.set(getStorageKey(), data);
        } else {
            TIMERS.save = setTimeout(function () {
                Lampa.Storage.set(getStorageKey(), data);
            }, 1000);
        }
    }

    function updateContinueWatchParams(hash, data) {  
        // Проверяем что есть в Timeline  
        var timeline = Lampa.Timeline.view(hash);  
        var hasTimelineData = timeline && (timeline.percent > 0 || timeline.time > 0);  
          
        // Если Timeline пустой, сохраняем базовые данные просмотра  
        if (!hasTimelineData && (data.percent || data.time || data.duration)) {  
            timeline.handler(data.percent || 0, data.time || 0, data.duration || 0);  
        }  
          
        // Сохраняем только метаданные, которых нет в Timeline  
        var metaToSave = {};  
        if (data.file_name) metaToSave.file_name = data.file_name;  
        if (data.torrent_link) metaToSave.torrent_link = data.torrent_link;  
        if (data.file_index !== undefined) metaToSave.file_index = data.file_index;  
        if (data.episode_title) metaToSave.episode_title = data.episode_title;  
        if (data.episode_titles_ru) metaToSave.episode_titles_ru = data.episode_titles_ru;  
        if (data.title) metaToSave.title = data.title;  
        if (data.season !== undefined) metaToSave.season = data.season;  
        if (data.episode !== undefined) metaToSave.episode = data.episode;  
        if (data.last_opened) metaToSave.last_opened = data.last_opened;  
        if (data.audio_tracks) metaToSave.audio_tracks = data.audio_tracks;  
          
        // Сохраняем метаданные только если они изменились  
        if (Object.keys(metaToSave).length > 0) {  
            var params = getParams();  
            if (!params[hash]) params[hash] = {};  
              
            var changed = false;  
            for (var key in metaToSave) {  
                if (params[hash][key] !== metaToSave[key]) {  
                    params[hash][key] = metaToSave[key];  
                    changed = true;  
                }  
            }  
              
            if (changed) {  
                params[hash].timestamp = Date.now();  
                var isCritical = (data.percent && data.percent > 90);
                setParams(params, isCritical);  
            }  
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
        return h > 0
            ? h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
            : m + ':' + (s < 10 ? '0' : '') + s;
    }

    function getSeriesTitle(card) {
        if (!card) return '';
        return card.original_name || card.original_title || card.name || card.title || '';
    }

    function isTraksEnabled() {
        var flags = ['traks', 'online_traks', 'parser_traks', 'torrserver_traks'];
        for (var i = 0; i < flags.length; i++) {
            if (Lampa.Storage.field && Lampa.Storage.field(flags[i])) return true;
            if (Lampa.Storage.get && Lampa.Storage.get(flags[i])) return true;
        }
        return !!(Lampa.Traks || window.Traks);
    }

    function extractEpisodeTitles(movie, season, episode) {
        var titles = [];
        if (!movie || !season || !episode) return titles;

        var episodes = movie.episodes || [];
        if (!Array.isArray(episodes) && movie.seasons) {
            movie.seasons.forEach(function (seasonInfo) {
                if (seasonInfo && Array.isArray(seasonInfo.episodes)) {
                    episodes = episodes.concat(seasonInfo.episodes);
                }
            });
        }

        if (Array.isArray(episodes)) {
            episodes.forEach(function (ep) {
                var epSeason = ep.season_number || ep.season || ep.season_id;
                var epNumber = ep.episode_number || ep.episode || ep.number;
                if (epSeason == season && epNumber == episode) {
                    var names = [ep.name_ru, ep.rus_name, ep.name];
                    names.forEach(function (name) {
                        if (name && titles.indexOf(name) === -1) titles.push(name);
                    });
                }
            });
        }
        return titles;
    }

    function parseSxEx(str) {
        if (!str) return null;
        var m = String(str).match(/S\s*(\d+)\s*E\s*(\d+)/i);
        if (!m) return null;
        return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
    }

    function isEpisodeCodeTitle(str) {
        if (!str) return false;
        return /^S\s*\d+\s*E\s*\d+$/i.test(String(str).trim());
    }

    function getRuEpisodeTitle(movie, season, episode, storedTitles, fallback) {
        var titles = [];
        if (Array.isArray(storedTitles) && storedTitles.length) titles = storedTitles;
        else titles = extractEpisodeTitles(movie, season, episode);

        return (titles && titles.length ? titles[0] : '') || fallback;
    }

    function getStreamMetaFromUrl(url) {
        if (!url) return {};
        var matchFile = url.match(/\/stream\/([^?]+)/);
        var matchLink = url.match(/[?&]link=([^&]+)/);
        var matchIndex = url.match(/[?&]index=(\d+)/);

        return {
            file_name: matchFile ? decodeURIComponent(matchFile[1]) : undefined,
            torrent_link: matchLink ? matchLink[1] : undefined,
            file_index: matchIndex ? parseInt(matchIndex[1], 10) : 0
        };
    }

    function normalizeEpisodeTitle(movie, season, episode, dataLike) {
        var seriesTitle = getSeriesTitle(movie);

        var fallback = (season && episode)
            ? ('S' + season + ' E' + episode)
            : (seriesTitle || 'Видео');

        var storedRu = dataLike && dataLike.episode_titles_ru;
        var fromMovie = extractEpisodeTitles(movie, season, episode);

        var incoming = (dataLike && (dataLike.title || dataLike.episode_title))
            ? String(dataLike.title || dataLike.episode_title).trim()
            : '';

        if ((!storedRu || !storedRu.length) && incoming && incoming !== seriesTitle && !isEpisodeCodeTitle(incoming)) {
            storedRu = [incoming];
        }

        var ru = (storedRu && storedRu.length)
            ? storedRu
            : (fromMovie && fromMovie.length ? fromMovie : null);

        var finalTitle = getRuEpisodeTitle(movie, season, episode, ru, fallback);
        if (finalTitle && seriesTitle && finalTitle === seriesTitle && season && episode) finalTitle = fallback;

        return {
            title: finalTitle,
            episode_titles_ru: (ru && ru.length) ? ru : undefined
        };
    }

    function collectAudioTracks(params) {
        var tracks = [];
        if (!params) return tracks;
        var candidates = [params.audio_tracks, params.tracks, params.audio];
        if (params.card && Array.isArray(params.card.tracks)) candidates.push(params.card.tracks);
        if (params.card && params.card.extra && Array.isArray(params.card.extra.tracks)) candidates.push(params.card.extra.tracks);

        candidates.forEach(function (list) {
            if (Array.isArray(list)) {
                list.forEach(function (track) {
                    var label = track && (track.title || track.label || track.name || track.lang);
                    if (label && tracks.indexOf(label) === -1) tracks.push(label);
                });
            }
        });
        return tracks;
    }

    function cleanupOldParams() {
        setTimeout(function () {
            try {
                var params = getParams();
                var now = Date.now();
                var changed = false;
                var max_age = 60 * 24 * 60 * 60 * 1000; // 60 дней

                Object.keys(params).forEach(function (hash) {
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
        var title = getSeriesTitle(movie);
        if (!title) return null;

        var params = getParams();

        if (movie.number_of_seasons) {
            var latestEpisode = null;
            var latestTimestamp = 0;

            Object.keys(params).forEach(function (hash) {
                var p = params[hash];
                if (p.title === title && p.season && p.episode) {
                    var ts = p.last_opened || p.timestamp || 0;
                    if (ts > latestTimestamp) {
                        latestTimestamp = ts;
                        latestEpisode = p;
                    }
                }
            });

            return latestEpisode;
        } else {
            // Для фильмов проверяем прогресс через Timeline
            var timelineData = Lampa.Timeline.watched(movie, true);
            if (timelineData && timelineData.percent > 0) {
                return {
                    title: getSeriesTitle(movie),
                    time: timelineData.time,
                    percent: timelineData.percent,
                    duration: timelineData.duration
                };
            }
            
            // Fallback - проверяем по старому методу через storage
            var hash2 = Lampa.Utils.hash(title);
            return params[hash2] || null;
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
        var title = getSeriesTitle(movie);
        if (movie.number_of_seasons && season && episode) {
            var separator = season > 10 ? ':' : '';
            return Lampa.Utils.hash([season, separator, episode, title].join(''));
        }
        return Lampa.Utils.hash(title);
    }

    // ========================================================================
    // 3. ОТСЛЕЖИВАНИЕ И TIMELINE
    // ========================================================================

    function setupTimelineSaving() {
        Lampa.Timeline.listener.follow('update', function (e) {
            var rawHash = e.data.hash;
            var road = e.data.road;

            if (!rawHash || !road || typeof road.percent === 'undefined') return;

            var hash = TIMELINE_HASH_MAP[rawHash] || rawHash;

            var params = getParams();
            if (params[hash]) {
                updateContinueWatchParams(hash, {
                    percent: road.percent,
                    time: road.time,
                    duration: road.duration
                });
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
                    episode_titles_ru: params.episode_titles_ru,
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
    // 4. ПЛЕЙЛИСТ И ЗАГРУЗКА (FIXED: Timeout Guard)
    // ========================================================================

    function buildPlaylist(movie, currentParams, currentUrl, quietMode, callback) {
        if (STATE.building_playlist && !quietMode) {
            callback([]);
            return;
        }

        if (!quietMode) STATE.building_playlist = true;

        var seriesTitle = getSeriesTitle(movie);
        var allParams = getParams();
        var playlist = [];
        var ABORT_CONTROLLER = false;
        var SAFE_TIMER = null; // Таймер безопасности

        var finalize = function (resultList) {
            if (ABORT_CONTROLLER) return; // Уже завершили
            ABORT_CONTROLLER = true;
            
            if (SAFE_TIMER) {
                clearTimeout(SAFE_TIMER);
                SAFE_TIMER = null;
            }

            if (!quietMode) {
                Lampa.Loading.stop();
                STATE.building_playlist = false;
            }
            callback(resultList);
        };

        // ТАЙМЕР БЕЗОПАСНОСТИ: Если за 15 сек плейлист не готов, отдаем что есть
        if (!quietMode) {
            SAFE_TIMER = setTimeout(function() {
                console.warn("[ContinueWatch] Playlist build timed out!");
                if (!ABORT_CONTROLLER) {
                    Lampa.Noty.show('Тайм-аут загрузки плейлиста');
                    finalize(playlist);
                }
            }, 15000);
        }

        // 1) элементы из storage (что уже смотрели)
        for (var hash in allParams) {
            var p = allParams[hash];
            if (p.title === seriesTitle && p.season && p.episode) {
                var episodeHash = generateHash(movie, p.season, p.episode);

                var timeline = Lampa.Timeline.view(episodeHash);
                if (timeline) wrapTimelineHandler(timeline, p);

                var isCurrent = (p.season === currentParams.season && p.episode === currentParams.episode);
                var norm = normalizeEpisodeTitle(movie, p.season, p.episode, p);

                var item = {
                    title: norm.title,
                    episode_title: norm.title,
                    episode_titles_ru: norm.episode_titles_ru,
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

                updateContinueWatchParams(episodeHash, {
                    episode_title: norm.title,
                    episode_titles_ru: norm.episode_titles_ru
                });
            }
        }

        if (!currentParams.torrent_link) { finalize(playlist); return; }

        var processFiles = function (files) {
            if (!FILES_CACHE[currentParams.torrent_link]) {
                FILES_CACHE[currentParams.torrent_link] = files;
                setTimeout(function () { delete FILES_CACHE[currentParams.torrent_link]; }, 300000);
            }

            var uniqueEpisodes = new Set();
            playlist.forEach(function (p) { uniqueEpisodes.add(p.season + '_' + p.episode); });

            files.forEach(function (file) {
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

                            var ruTitles = extractEpisodeTitles(movie, episodeInfo.season, episodeInfo.episode);
                            var norm = normalizeEpisodeTitle(movie, episodeInfo.season, episodeInfo.episode, { episode_titles_ru: ruTitles });

                            if (!allParams[episodeHash]) {
                                updateContinueWatchParams(episodeHash, {
                                    file_name: file.path,
                                    torrent_link: currentParams.torrent_link,
                                    file_index: file.id || 0,
                                    title: seriesTitle,
                                    season: episodeInfo.season,
                                    episode: episodeInfo.episode,
                                    episode_title: norm.title,
                                    episode_titles_ru: norm.episode_titles_ru,
                                    percent: 0, time: 0, duration: 0
                                });
                            }

                            var isCurrent = (episodeInfo.season === currentParams.season && episodeInfo.episode === currentParams.episode);

                            var item = {
                                title: movie.number_of_seasons ? norm.title : (movie.title || seriesTitle),
                                episode_title: norm.title,
                                episode_titles_ru: norm.episode_titles_ru,
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

                            updateContinueWatchParams(episodeHash, {
                                episode_title: norm.title,
                                episode_titles_ru: norm.episode_titles_ru
                            });
                        }
                    }
                } catch (e) { }
            });

            if (movie.number_of_seasons) playlist.sort(function (a, b) { return a.episode - b.episode; });
            finalize(playlist);
        };

        if (FILES_CACHE[currentParams.torrent_link]) { processFiles(FILES_CACHE[currentParams.torrent_link]); return; }

        if (!quietMode) Lampa.Loading.start(function () { finalize(playlist); }, 'Подготовка...');

        Lampa.Torserver.hash({
            link: currentParams.torrent_link,
            title: seriesTitle,
            poster: movie.poster_path,
            data: { lampa: true, movie: movie }
        }, function (torrent) {
            if (ABORT_CONTROLLER) return;

            var retryCount = 0;
            var maxRetries = 5;

            var fetchFiles = function () {
                if (ABORT_CONTROLLER) return;

                Lampa.Torserver.files(torrent.hash, function (json) {
                    if (ABORT_CONTROLLER) return;

                    if (json && json.file_stats && json.file_stats.length > 0) {
                        processFiles(json.file_stats);
                    } else if (retryCount < maxRetries) {
                        retryCount++;
                        if (!quietMode) Lampa.Loading.setText('Ожидание файлов (' + retryCount + '/' + maxRetries + ')...');
                        setTimeout(fetchFiles, retryCount * 1000);
                    } else {
                        finalize(playlist);
                    }
                }, function () {
                    if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(fetchFiles, retryCount * 1000);
                    } else {
                        finalize(playlist);
                    }
                });
            };

            fetchFiles();
        }, function () { finalize(playlist); });
    }

    // ========================================================================
    // 5. ЛОГИКА ПЛЕЕРА
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
            timeline.time = params.time;
            timeline.percent = params.percent;
        }

        timeline.hash = currentHash;
        var norm = normalizeEpisodeTitle(movie, params.season, params.episode, params);

        updateContinueWatchParams(currentHash, {
            title: getSeriesTitle(movie),
            season: params.season,
            episode: params.episode,
            episode_title: norm.title,
            episode_titles_ru: norm.episode_titles_ru,
            last_opened: Date.now()
        });

        wrapTimelineHandler(timeline, {
            file_name: params.file_name,
            torrent_link: params.torrent_link,
            file_index: params.file_index,
            title: getSeriesTitle(movie),
            season: params.season,
            episode: params.episode,
            episode_title: norm.title,
            episode_titles_ru: norm.episode_titles_ru
        });

        ensurePlayerListeners();

        var player_type = Lampa.Storage.field('player_torrent');
        var force_inner = (player_type === 'inner');
        var isExternalPlayer = !force_inner && (player_type !== 'lampa');

        var playerData = {
            url: url,
            title: norm.title,
            episode_title: norm.title,
            episode_titles_ru: norm.episode_titles_ru,
            card: movie,
            torrent_hash: params.torrent_link,
            timeline: timeline,
            season: params.season,
            episode: params.episode,
            position: timeline.time || -1
        };

        if (force_inner) {
            delete playerData.torrent_hash;
            var original_platform_is = Lampa.Platform.is;
            Lampa.Platform.is = function (what) { return what === 'android' ? false : original_platform_is(what); };
            setTimeout(function () { Lampa.Platform.is = original_platform_is; }, 500);
            Lampa.Storage.set('internal_torrclient', true);
        }

        if (isExternalPlayer) {
            buildPlaylist(movie, params, url, false, function (playlist) {
                if (playlist.length === 0 && !params.torrent_link) return;
                playerData.playlist = playlist.length ? playlist : null;
                Lampa.Player.play(playerData);
                Lampa.Player.callback(function () { Lampa.Controller.toggle('content'); });
            });
        } else {
            // Формируем временный плейлист из одного элемента, чтобы запустить сразу
            var tempPlaylist = [{
                url: url,
                title: norm.title,
                episode_title: norm.title,
                episode_titles_ru: norm.episode_titles_ru,
                timeline: timeline,
                season: params.season,
                episode: params.episode,
                card: movie
            }];

            // Если сериал, добавляем заглушку, чтобы плеер знал, что это список
            if (movie.number_of_seasons) tempPlaylist.push({ title: 'Загрузка списка...', url: '', timeline: {} });
            playerData.playlist = tempPlaylist;

            if (timeline.time > 0) Lampa.Noty.show('Восстанавливаем: ' + formatTime(timeline.time));
            Lampa.Player.play(playerData);
            ensurePlayerListeners();
            Lampa.Player.callback(function () { Lampa.Controller.toggle('content'); });

            if (movie.number_of_seasons && params.season && params.episode) {
                // Асинхронно догружаем плейлист
                buildPlaylist(movie, params, url, true, function (playlist) {
                    if (playlist.length > 1) {
                        Lampa.Player.playlist(playlist);
                        Lampa.Noty.show('Плейлист загружен (' + playlist.length + ' эп.)');
                    }
                });
            }
        }
    }

    // ========================================================================
    // 6. LISTENERS ПЛЕЕРА
    // ========================================================================

    function ensurePlayerListeners() {
        if (LISTENERS.initialized) return;

        LISTENERS.player_start = function (data) {
            try {
                var movie = data.card || data.movie;
                if (!movie || !movie.number_of_seasons) return;

                var season = data.season;
                var episode = data.episode;

                if (!season || !episode) {
                    var se = parseSxEx(data.title || data.episode_title || '');
                    if (se) { season = se.season; episode = se.episode; }
                }

                if (!season || !episode) return;

                var hash = generateHash(movie, season, episode);

                if (data.timeline && data.timeline.hash && data.timeline.hash !== hash) {
                    TIMELINE_HASH_MAP[data.timeline.hash] = hash;
                    data.timeline.hash = hash;
                }

                var meta = getStreamMetaFromUrl(data.url);
                var norm = normalizeEpisodeTitle(movie, season, episode, data);

                var payload = {
                    file_name: meta.file_name,
                    torrent_link: meta.torrent_link || data.torrent_hash,
                    file_index: meta.file_index,
                    title: getSeriesTitle(movie),
                    season: season,
                    episode: episode,
                    episode_title: norm.title,
                    episode_titles_ru: norm.episode_titles_ru,
                    last_opened: Date.now()
                };

                if (isTraksEnabled()) {
                    var audioTracks = collectAudioTracks(data);
                    if (audioTracks.length) payload.audio_tracks = audioTracks;
                }

                updateContinueWatchParams(hash, payload);
            } catch (e) { }
        };

        LISTENERS.player_destroy = function () {
            try {
                if (PLAYER_SWITCH.timer) {
                    clearInterval(PLAYER_SWITCH.timer);
                    PLAYER_SWITCH.timer = null;
                }
            } catch (e) { }

            if (LISTENERS.player_start) { Lampa.Player.listener.remove('start', LISTENERS.player_start); LISTENERS.player_start = null; }
            if (LISTENERS.player_destroy) { Lampa.Player.listener.remove('destroy', LISTENERS.player_destroy); LISTENERS.player_destroy = null; }
            LISTENERS.initialized = false;
        };

        Lampa.Player.listener.follow('start', LISTENERS.player_start);
        Lampa.Player.listener.follow('destroy', LISTENERS.player_destroy);
        LISTENERS.initialized = true;
    }

    // ========================================================================
    // 7. PATCHES
    // ========================================================================

    function patchPlayer() {
        if (patchPlayer._patched) return;
        patchPlayer._patched = true;

        var originalPlay = Lampa.Player.play;

        Lampa.Player.play = function (params) {
            try {
                ensurePlayerListeners();
                if (!params) return originalPlay.call(this, params);

                var movie = params.card || params.movie || (Lampa.Activity.active && Lampa.Activity.active() && Lampa.Activity.active().movie);
                if (!movie) return originalPlay.call(this, params);

                if (movie.number_of_seasons) {
                    if (!params.season || !params.episode) {
                        var se = parseSxEx(params.title || params.episode_title || '');
                        if (se) { params.season = se.season; params.episode = se.episode; }
                    }

                    if (params.season && params.episode) {
                        var episodeHash = generateHash(movie, params.season, params.episode);
                        var norm = normalizeEpisodeTitle(movie, params.season, params.episode, params);
                        
                        params.title = norm.title;
                        params.episode_title = norm.title;
                        if (!params.episode_titles_ru && norm.episode_titles_ru) params.episode_titles_ru = norm.episode_titles_ru;

                        var tl = params.timeline || Lampa.Timeline.view(episodeHash);
                        if (tl) {
                            if (tl.hash && tl.hash !== episodeHash) TIMELINE_HASH_MAP[tl.hash] = episodeHash;
                            tl.hash = episodeHash;
                            params.timeline = tl;
                        }

                        var meta = getStreamMetaFromUrl(params.url);
                        updateContinueWatchParams(episodeHash, {
                            title: getSeriesTitle(movie),
                            season: params.season,
                            episode: params.episode,
                            file_name: meta.file_name,
                            torrent_link: meta.torrent_link || params.torrent_hash,
                            file_index: meta.file_index,
                            episode_title: norm.title,
                            episode_titles_ru: norm.episode_titles_ru,
                            last_opened: Date.now()
                        });

                        wrapTimelineHandler(params.timeline || { hash: episodeHash }, {
                            file_name: meta.file_name,
                            torrent_link: meta.torrent_link || params.torrent_hash,
                            file_index: meta.file_index,
                            title: getSeriesTitle(movie),
                            season: params.season,
                            episode: params.episode,
                            episode_title: norm.title,
                            episode_titles_ru: norm.episode_titles_ru
                        });
                    }
                }
            } catch (e) { }

            return originalPlay.call(this, params);
        };
    }

    function patchShowNextEpisodeName() {
        if (patchShowNextEpisodeName._patched) return;
        patchShowNextEpisodeName._patched = true;

        try {
            if (!Lampa.Panel || typeof Lampa.Panel.showNextEpisodeName !== 'function') return;
            var originalShow = Lampa.Panel.showNextEpisodeName;

            Lampa.Panel.showNextEpisodeName = function (e) {
                try {
                    if (e && e.playlist && typeof e.position === 'number' && e.playlist[e.position + 1]) {
                        var nextItem = e.playlist[e.position + 1];
                        var movie = (e.playlist[0] && e.playlist[0].card) || nextItem.card;

                        if (movie && nextItem && nextItem.season && nextItem.episode) {
                            var norm = normalizeEpisodeTitle(movie, nextItem.season, nextItem.episode, nextItem);
                            var root = (Lampa.Panel.render && Lampa.Panel.render()) ? Lampa.Panel.render() : null;
                            if (root) {
                                var el = root.find('.player-panel__next-episode-name, .player-panel__episode, .player-panel__next');
                                if (el.length) { el.first().text(norm.title).toggleClass('hide', false); return; }
                            }
                        }
                    }
                } catch (errInner) { }
                return originalShow.call(this, e);
            };
        } catch (err) { }
    }

    function getPlayerDispatchFnName(listener) {
        if (!listener) return '';
        var candidates = ['send', 'emit', 'trigger', 'dispatch', 'fire'];
        for (var i = 0; i < candidates.length; i++) {
            var n = candidates[i];
            if (typeof listener[n] === 'function') return n;
        }
        return '';
    }

    function safeGet(obj, path) {
        try {
            var p = path.split('.');
            var cur = obj;
            for (var i = 0; i < p.length; i++) {
                if (!cur) return undefined;
                cur = cur[p[i]];
            }
            return cur;
        } catch (e) { return undefined; }
    }

    function getCurrentFromContext(ctx) {
        if (!ctx) return null;
        var playlist = ctx.playlist || safeGet(ctx, 'data.playlist') || null;
        var position = (typeof ctx.position === 'number') ? ctx.position : safeGet(ctx, 'data.position');

        var card = ctx.card || ctx.movie || safeGet(ctx, 'data.card') || (playlist && playlist[0] && playlist[0].card) || null;
        var item = null;
        if (playlist && typeof position === 'number' && playlist[position]) item = playlist[position];
        item = item || ctx.item || ctx.current || safeGet(ctx, 'data.item') || safeGet(ctx, 'data.current') || null;

        return {
            card: card,
            url: (item && item.url) || ctx.url || safeGet(ctx, 'data.url') || '',
            season: (item && item.season) || ctx.season || safeGet(ctx, 'data.season'),
            episode: (item && item.episode) || ctx.episode || safeGet(ctx, 'data.episode'),
            title: (item && item.title) || ctx.title || safeGet(ctx, 'data.title') || '',
            episode_title: (item && (item.episode_title || item.title)) || ctx.episode_title || safeGet(ctx, 'data.episode_title') || '',
            episode_titles_ru: (item && item.episode_titles_ru) || ctx.episode_titles_ru || safeGet(ctx, 'data.episode_titles_ru'),
            torrent_hash: ctx.torrent_hash || safeGet(ctx, 'data.torrent_hash') || (item && item.torrent_hash) || null,
            item: item
        };
    }

    function normalizeAndSaveCurrentFromContext(ctx) {
        var cur = getCurrentFromContext(ctx);
        if (!cur || !cur.card || !cur.card.number_of_seasons) return;

        if (!cur.season || !cur.episode) {
            var se = parseSxEx(cur.episode_title || cur.title || '');
            if (se) { cur.season = se.season; cur.episode = se.episode; }
        }

        if ((!cur.season || !cur.episode) && Lampa.Torserver && typeof Lampa.Torserver.parse === 'function') {
            var meta = getStreamMetaFromUrl(cur.url);
            if (meta.file_name) {
                try {
                    var parsed = Lampa.Torserver.parse({
                        movie: cur.card, files: [{path: meta.file_name}], filename: String(meta.file_name).split('/').pop(), path: meta.file_name, is_file: true
                    });
                    if (parsed && parsed.season && parsed.episode) { cur.season = parsed.season; cur.episode = parsed.episode; }
                } catch (e) { }
            }
        }

        if (!cur.season || !cur.episode) return;

        var episodeHash = generateHash(cur.card, cur.season, cur.episode);
        var norm = normalizeEpisodeTitle(cur.card, cur.season, cur.episode, {
            title: cur.title, episode_title: cur.episode_title, episode_titles_ru: cur.episode_titles_ru, url: cur.url
        });

        var key = episodeHash + '|' + (cur.url || '') + '|' + norm.title;
        if (PLAYER_SWITCH.last_key === key) return;
        PLAYER_SWITCH.last_key = key;

        if (cur.item) {
            cur.item.title = norm.title;
            cur.item.episode_title = norm.title;
            cur.item.episode_titles_ru = norm.episode_titles_ru;
            cur.item.season = cur.season;
            cur.item.episode = cur.episode;
        }

        var meta2 = getStreamMetaFromUrl(cur.url);
        updateContinueWatchParams(episodeHash, {
            title: getSeriesTitle(cur.card),
            season: cur.season,
            episode: cur.episode,
            file_name: meta2.file_name,
            torrent_link: meta2.torrent_link || cur.torrent_hash,
            file_index: meta2.file_index,
            episode_title: norm.title,
            episode_titles_ru: norm.episode_titles_ru,
            last_opened: Date.now()
        });
    }

    function patchPlaylistSwitchTracking() {
        if (patchPlaylistSwitchTracking._patched) return;
        patchPlaylistSwitchTracking._patched = true;

        try {
            var listener = Lampa.Player && Lampa.Player.listener;
            var dispatchName = getPlayerDispatchFnName(listener);

            if (listener && dispatchName) {
                var originalDispatch = listener[dispatchName];
                listener[dispatchName] = function () {
                    var res = originalDispatch.apply(this, arguments);
                    try {
                        var data = arguments[1] || arguments[0];
                        if (typeof data === 'object') normalizeAndSaveCurrentFromContext(data);
                    } catch (e) { }
                    return res;
                };
            }
        } catch (e) { }

        try {
            var candidates = ['playlist_select', 'playlistSelect', 'select', 'choose', 'set', 'item', 'next', 'prev'];
            candidates.forEach(function(fn) {
                 if (Lampa.Player && typeof Lampa.Player[fn] === 'function') {
                    var orig = Lampa.Player[fn];
                    Lampa.Player[fn] = function () {
                        var out = orig.apply(this, arguments);
                        try { normalizeAndSaveCurrentFromContext(Lampa.Player); } catch (e) { }
                        return out;
                    };
                 }
            });
        } catch (e) { }

        try {
            if (PLAYER_SWITCH.timer) clearInterval(PLAYER_SWITCH.timer);
            PLAYER_SWITCH.timer = setInterval(function () {
                try {
                    var state = (Lampa.Player && typeof Lampa.Player.data === 'function') ? Lampa.Player.data() : Lampa.Player;
                    normalizeAndSaveCurrentFromContext(state);
                } catch (e) { }
            }, 1000);
        } catch (e) { }
    }

    // ========================================================================
    // 8. UI: КНОПКА
    // ========================================================================

    function handleContinueClick(movieData, buttonElement) {
        if (TIMERS.debounce_click) return;

        var params = getStreamParams(movieData);
        if (!params) { Lampa.Noty.show('Нет истории'); return; }

        if (movieData && movieData.number_of_seasons && params.season && params.episode) {
            var norm = normalizeEpisodeTitle(movieData, params.season, params.episode, params);
            params.episode_title = norm.title;
            params.episode_titles_ru = norm.episode_titles_ru;
        }

        if (buttonElement) $(buttonElement).css('opacity', 0.5);
        TIMERS.debounce_click = setTimeout(function () {
            TIMERS.debounce_click = null;
            if (buttonElement) $(buttonElement).css('opacity', 1);
        }, 1000);

        launchPlayer(movieData, params);
    }

    function setupContinueButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type === 'complite') {
                requestAnimationFrame(function () {
                    var activity = e.object.activity;
                    var render = activity.render();
                    if (render.find('.button--continue-watch').length) return;

                    var params = getStreamParams(e.data.movie);
                    if (!params) return;

                    if (params.torrent_link && !FILES_CACHE[params.torrent_link]) {
                        Lampa.Torserver.files(params.torrent_link, function (json) {
                            if (json && json.file_stats) FILES_CACHE[params.torrent_link] = json.file_stats;
                        });
                    }

                    var percent = 0;
                    var timeStr = "";
                    
                    if (e.data.movie.number_of_seasons) {
                        // Для сериалов
                        var hash = generateHash(e.data.movie, params.season, params.episode);
                        var view = Lampa.Timeline.view(hash);
                        if (view && view.percent > 0) { percent = view.percent; timeStr = formatTime(view.time); }
                        else if (params.time) { percent = params.percent || 0; timeStr = formatTime(params.time); }
                    } else {
                        // Для фильмов
                        var timelineData = Lampa.Timeline.watched(e.data.movie, true);
                        if (timelineData && timelineData.percent > 0) { 
                            percent = timelineData.percent; 
                            timeStr = formatTime(timelineData.time); 
                        }
                        else if (params.time) { percent = params.percent || 0; timeStr = formatTime(params.time); }
                    }

                    var labelText = 'Продолжить';
                    if (params.season && params.episode) labelText += ' S' + params.season + ' E' + params.episode;
                    if (timeStr) labelText += ' <span style="opacity:0.7;font-size:0.9em">(' + timeStr + ')</span>';

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
                    continueBtn.on('hover:enter', function () { handleContinueClick(e.data.movie, this); });

                    var torrentBtn = render.find('.view--torrent').last();
                    var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

                    if (torrentBtn.length) torrentBtn.after(continueBtn);
                    else if (buttonsContainer.length) buttonsContainer.append(continueBtn);
                    else render.find('.full-start__button').last().after(continueBtn);
                });
            }
        });
    }

    // ========================================================================
    // INIT
    // ========================================================================

    function add() {
        ensurePlayerListeners();
        patchPlayer();
        patchShowNextEpisodeName();
        patchPlaylistSwitchTracking();

        cleanupOldParams();
        setupAccountListener();
        migrateLegacyProfileStorage();
        setupContinueButton();
        setupTimelineSaving();

        console.log("[ContinueWatch] Loaded. Profile support + Timeout Fix applied.");
    }

    if (window.appready) add();
    else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') add(); });
})();
