(function () {
    'use strict';

    const CLEANUP_AGE = 60 * 24 * 60 * 60 * 1000; // 60 дней
    const SAVE_DEBOUNCE = 1000;

    // =========================================================================
    // МОДУЛЬ: ХРАНИЛИЩЕ + МЕТАДАННЫЕ
    // =========================================================================
    const StorageManager = (function () {
        let memoryCache = null;
        let torrserverCache = null;

        let activeStorageKey = null;
        let syncedStorageKey = null;
        let accountReady = !!window.appready;

        function formatTime(seconds) {
            if (!seconds || seconds <= 0) return '';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return `${m}:${s.toString().padStart(2, '0')}`;
        }

        function getStorageKey() {
            try {
                if (
                    accountReady &&
                    Lampa.Account &&
                    Lampa.Account.Permit &&
                    Lampa.Account.Permit.sync &&
                    Lampa.Account.Permit.account &&
                    Lampa.Account.Permit.account.profile &&
                    typeof Lampa.Account.Permit.account.profile.id !== 'undefined'
                ) {
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
                memoryCache = null; // не смешиваем кэш разных профилей
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

            if (force) saveOperation();
            else setTimeout(saveOperation, SAVE_DEBOUNCE);
        }

        function getTorrServerUrl() {
            if (!torrserverCache) {
                try {
                    const url = Lampa.Storage.get('torrserver_url');
                    const url_two = Lampa.Storage.get('torrserver_url_two');
                    const use_two = Lampa.Storage.field('torrserver_use_link') === 'two';

                    let final_url = use_two ? (url_two || url) : (url || url_two);

                    if (final_url) {
                        if (!final_url.match(/^https?:\/\//)) final_url = 'http://' + final_url;
                        final_url = final_url.replace(/\/$/, '');
                        try {
                            new URL(final_url);
                        } catch (e) {
                            console.error('[ContinueWatch] Invalid TorrServer URL:', final_url);
                            torrserverCache = null;
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
            if (!params || !params.file_name || !params.torrent_link) return null;

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

        function generateTimelineHash(movie, season, episode) {
            const originalTitle = movie && (movie.original_name || movie.original_title);
            if (!originalTitle) return null;

            if (movie.number_of_seasons && season && episode) {
                const separator = season > 10 ? ':' : '';
                return Lampa.Utils.hash([season, separator, episode, originalTitle].join(''));
            }
            return Lampa.Utils.hash(originalTitle);
        }

        function extractSeasonEpisode(data) {
            if (data && data.season !== undefined && data.episode !== undefined) {
                return { season: parseInt(data.season) || 0, episode: parseInt(data.episode) || 0 };
            }

            const tryMatch = (str) => {
                if (!str || typeof str !== 'string') return null;
                const m = str.match(/S(\d{1,2})E(\d{1,2})/i);
                if (!m) return null;
                return { season: parseInt(m[1]) || 0, episode: parseInt(m[2]) || 0 };
            };

            const m1 = tryMatch(data && data.path_human);
            if (m1) return m1;

            const m2 = tryMatch(data && data.path);
            if (m2) return m2;

            return { season: 0, episode: 0 };
        }

        // ✅ плейлист для внешнего плеера: сохраняем строго минимальный формат
        function sanitizePlaylist(list) {
            if (!Array.isArray(list)) return null;

            const out = [];
            for (let i = 0; i < list.length; i++) {
                const it = list[i] || {};
                const url = (typeof it.url === 'string' ? it.url : '').trim();
                const title = (typeof it.title === 'string' ? it.title : '').trim();

                const season = parseInt(it.season) || 0;
                const episode = parseInt(it.episode) || 0;

                const hash =
                    (it.timeline && (it.timeline.hash || it.timeline)) ||
                    it.hash ||
                    it.timeline_hash ||
                    '';

                const h = (typeof hash === 'string' ? hash : '').trim();

                if (!url || !h) continue;

                out.push({
                    url,
                    title: title || '',
                    season,
                    episode,
                    timeline: { hash: h }
                });
            }

            return out.length ? out : null;
        }

        function saveStreamParams(hash, data) {
            if (!hash || !data) return false;

            const params = getParams();
            if (!params[hash]) params[hash] = {};

            let changed = false;
            const oldData = params[hash];

            for (const key in data) {
                if (key === 'playlist') continue; // отдельно
                if (oldData[key] !== data[key]) {
                    oldData[key] = data[key];
                    changed = true;
                }
            }

            // ✅ плейлист для внешнего плеера
            if (data.playlist) {
                const sp = sanitizePlaylist(data.playlist);
                if (sp) {
                    const prev = JSON.stringify(oldData.playlist || null);
                    const next = JSON.stringify(sp);
                    if (prev !== next) {
                        oldData.playlist = sp;
                        changed = true;
                    }
                }
            }

            oldData.timestamp = Date.now();

            if (changed || !oldData.original_timestamp) {
                oldData.original_timestamp = oldData.timestamp;
                setParams(params, true);
                return true;
            }

            return false;
        }

        function getStreamParams(movie) {
            if (!movie) return null;

            const originalTitle = movie.original_name || movie.original_title;
            if (!originalTitle) return null;

            const params = getParams();
            const movieId = movie.id || movie.movie_id;

            if (movie.number_of_seasons) {
                const episodes = Object.values(params)
                    .filter(p => {
                        const sameTitle = p.original_title === originalTitle;
                        const sameId = !movieId || !p.movie_id || p.movie_id === movieId;
                        return sameTitle && sameId && p.season && p.episode;
                    })
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

                return episodes[0] || null;
            } else {
                const hash = Lampa.Utils.hash(originalTitle);
                return params[hash] || null;
            }
        }

        return {
            getParams,
            setParams,
            saveStreamParams,
            getStreamParams,
            buildStreamUrl,
            formatTime,
            getTorrServerUrl,
            generateTimelineHash,
            extractSeasonEpisode,
            ensureStorageSync,
            sanitizePlaylist,
            setAccountReady: function (ready) { accountReady = ready; }
        };
    })();

    // =========================================================================
    // МОДУЛЬ: ВНЕШНИЙ ПЛЕЕР (ПЛЕЙЛИСТ + СЕЙВ ПРОГРЕССА)
    // =========================================================================
    const ExternalPlayerManager = (function () {
        function isExternalPlayerMode() {
            try {
                const playerType = Lampa.Storage.field('player_torrent');
                if (!Lampa.Platform || !Lampa.Platform.is || !Lampa.Platform.is('android')) return false;
                if (playerType === 'inner') return false;
                return playerType !== 'lampa';
            } catch (e) {
                return false;
            }
        }

        function getActivePlaylistItemFromPlayer() {
            try {
                const pl = Lampa.Player && Lampa.Player.playlist;
                if (!pl) return null;

                // пытаемся получить текущий item разными методами
                if (typeof pl.current === 'function') return pl.current();
                if (typeof pl.active === 'function') return pl.active();
                if (typeof pl.getActive === 'function') return pl.getActive();

                const list = (typeof pl.get === 'function') ? pl.get() : null;
                if (!Array.isArray(list) || !list.length) return null;

                // индекс
                if (typeof pl.index === 'function') {
                    const idx = pl.index();
                    if (typeof idx === 'number' && list[idx]) return list[idx];
                }
                if (typeof pl.selected === 'number' && list[pl.selected]) return list[pl.selected];

                return null;
            } catch (e) {
                return null;
            }
        }

        function getActiveHashFallback(currentEpisodeHash) {
            // 1) пробуем взять из текущего playlist item
            const item = getActivePlaylistItemFromPlayer();
            const h1 = item && item.timeline && item.timeline.hash;
            if (h1 && typeof h1 === 'string') return h1;

            // 2) пробуем взять из Lampa.Player.data.timeline.hash (если есть)
            try {
                const d = (Lampa.Player && typeof Lampa.Player.data === 'function') ? Lampa.Player.data() : null;
                const h2 = d && d.timeline && d.timeline.hash;
                if (h2 && typeof h2 === 'string') return h2;
            } catch (e) {}

            // 3) фолбэк на то, что мы держим сами
            return currentEpisodeHash || null;
        }

        function getPlayerPositionSeconds() {
            try {
                const p = Lampa.Player;

                if (p && typeof p.position === 'number' && isFinite(p.position)) return Math.floor(p.position);
                if (p && typeof p.time === 'number' && isFinite(p.time)) return Math.floor(p.time);

                // иногда есть video / video[0]
                const v = p && p.video ? (p.video[0] || p.video) : null;
                if (v && typeof v.currentTime === 'number' && isFinite(v.currentTime)) return Math.floor(v.currentTime);

                return 0;
            } catch (e) {
                return 0;
            }
        }

        function getPlayerDurationSeconds() {
            try {
                const p = Lampa.Player;

                if (p && typeof p.duration === 'number' && isFinite(p.duration) && p.duration > 0) return Math.floor(p.duration);

                const v = p && p.video ? (p.video[0] || p.video) : null;
                if (v && typeof v.duration === 'number' && isFinite(v.duration) && v.duration > 0) return Math.floor(v.duration);

                return 0;
            } catch (e) {
                return 0;
            }
        }

        function updateTimelineSafe(hash, timeSec, durationSec) {
            if (!hash || !timeSec || timeSec <= 0) return false;

            try {
                const view = Lampa.Timeline && typeof Lampa.Timeline.view === 'function' ? Lampa.Timeline.view(hash) : null;
                const duration = durationSec > 0 ? durationSec : (view && view.duration ? Math.floor(view.duration) : 0);

                let percent = 0;
                if (duration > 0) percent = Math.max(0, Math.min(100, (timeSec / duration) * 100));
                else percent = view && view.percent ? view.percent : 0;

                const payload = {
                    time: Math.floor(timeSec),
                    duration: duration > 0 ? Math.floor(duration) : 0,
                    percent: percent
                };

                // Lampa может иметь update или set (разные сборки)
                if (Lampa.Timeline && typeof Lampa.Timeline.update === 'function') {
                    Lampa.Timeline.update(hash, payload);
                } else if (Lampa.Timeline && typeof Lampa.Timeline.set === 'function') {
                    Lampa.Timeline.set(hash, payload);
                } else {
                    return false;
                }

                return true;
            } catch (e) {
                console.error('[ContinueWatch] Timeline update failed:', e);
                return false;
            }
        }

        function saveProgressOnDestroy(currentEpisodeHash) {
            if (!isExternalPlayerMode()) return;

            const hash = getActiveHashFallback(currentEpisodeHash);
            if (!hash) return;

            const t = getPlayerPositionSeconds();
            const d = getPlayerDurationSeconds();

            if (t <= 0) return;

            const ok = updateTimelineSafe(hash, t, d);
            if (ok) {
                // дополнительно фиксируем в метаданных, чтобы не зависеть только от Timeline
                StorageManager.saveStreamParams(hash, {
                    time: t,
                    duration: d || 0
                });
            }
        }

        // ✅ плейлист для внешнего плеера: подготовка для сохранения/передачи
        function normalizePlaylistForSave(list, movie) {
            const sp = StorageManager.sanitizePlaylist(list);
            if (sp) return sp;

            // если список не в нужном формате, пытаемся привести
            if (!Array.isArray(list)) return null;

            const out = [];
            for (let i = 0; i < list.length; i++) {
                const it = list[i] || {};
                const url = (typeof it.url === 'string' ? it.url : '').trim();
                if (!url) continue;

                const season = parseInt(it.season) || 0;
                const episode = parseInt(it.episode) || 0;

                let hash = '';
                if (it.timeline && typeof it.timeline.hash === 'string') hash = it.timeline.hash;
                else if (it.timeline && typeof it.timeline === 'string') hash = it.timeline;
                else if (season && episode && movie) hash = StorageManager.generateTimelineHash(movie, season, episode) || '';

                if (!hash) continue;

                out.push({
                    url: url.replace('&preload', '&play'),
                    title: (typeof it.title === 'string' ? it.title : ''),
                    season,
                    episode,
                    timeline: { hash }
                });
            }

            return out.length ? out : null;
        }

        return {
            isExternalPlayerMode,
            saveProgressOnDestroy,
            normalizePlaylistForSave
        };
    })();

    // =========================================================================
    // МОДУЛЬ: ПЛЕЕР + СОБЫТИЯ
    // =========================================================================
    const PlayerManager = (function () {
        let playerStartListener = null;
        let playerChangeListener = null;
        let playerDestroyListener = null;

        let currentEpisodeHash = null;
        let lastSavedHash = null;
        let listenersInitialized = false;

        function launchPlayer(movie, params) {
            if (!movie || !params) return;

            const url = StorageManager.buildStreamUrl(params);
            if (!url) return;

            const timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
            if (!timelineHash) return;

            const timeline = Lampa.Timeline.view(timelineHash);

            let restoreTime = 0;
            let restorePercent = 0;

            if (timeline && timeline.time > 0) {
                restoreTime = timeline.time;
                restorePercent = timeline.percent || 0;
            }

            // ✅ плейлист для внешнего плеера: берем сохраненный плейлист из метаданных (если есть)
            const savedPlaylist = params.playlist ? ExternalPlayerManager.normalizePlaylistForSave(params.playlist, movie) : null;

            const streamData = {
                file_name: params.file_name,
                torrent_link: params.torrent_link,
                file_index: params.file_index || 0,
                title: movie.name || movie.title,
                original_title: movie.original_name || movie.original_title,
                movie_id: movie.id || movie.movie_id,
                season: params.season || 0,
                episode: params.episode || 0,
                episode_title: params.episode_title,
                playlist: savedPlaylist || undefined // ✅ плейлист для внешнего плеера
            };

            StorageManager.saveStreamParams(timelineHash, streamData);

            currentEpisodeHash = timelineHash;
            lastSavedHash = timelineHash;

            const playerData = {
                url: url,
                title: params.episode_title || params.title || movie.title,
                card: movie,
                torrent_hash: params.torrent_link,
                timeline: timeline || { hash: timelineHash, percent: restorePercent, time: restoreTime, duration: 0 },
                season: params.season,
                episode: params.episode,
                position: restoreTime > 10 ? restoreTime : -1
            };

            // ✅ плейлист для внешнего плеера
            if (ExternalPlayerManager.isExternalPlayerMode() && savedPlaylist) {
                playerData.playlist = savedPlaylist;
            }

            if (restoreTime > 10) {
                const timeStr = StorageManager.formatTime(restoreTime);
                Lampa.Noty.show(`Восстанавливаем: ${timeStr}`);
            }

            try {
                Lampa.Player.play(playerData);
                Lampa.Player.callback(() => Lampa.Controller.toggle('content'));
            } catch (e) {
                console.error('[ContinueWatch] Failed to launch player:', e);
            }
        }

        function setupPlayerListeners() {
            if (listenersInitialized) return;

            playerStartListener = function (data) {
                try { if (data) handlePlayerStart(data); } catch (e) {}
            };

            playerChangeListener = function (data) {
                try { if (data) handlePlayerStart(data); } catch (e) {}
            };

            playerDestroyListener = function () {
                try {
                    // ✅ плейлист для внешнего плеера: при выходе фиксируем прогресс и правильный hash
                    ExternalPlayerManager.saveProgressOnDestroy(currentEpisodeHash);
                } catch (e) {
                    console.error('[ContinueWatch] Error saving progress on destroy:', e);
                }
                currentEpisodeHash = null;
            };

            try {
                if (Lampa.Player && Lampa.Player.listener) {
                    Lampa.Player.listener.follow('start', playerStartListener);
                    Lampa.Player.listener.follow('change', playerChangeListener);
                    Lampa.Player.listener.follow('destroy', playerDestroyListener);
                    listenersInitialized = true;
                }
            } catch (e) {
                console.error('[ContinueWatch] Failed to setup player listeners:', e);
            }
        }

        function handlePlayerStart(data) {
            try {
                let movie = data.card;

                if (!movie) {
                    const activity = Lampa.Activity.active();
                    if (activity && activity.movie) movie = activity.movie;
                }
                if (!movie) return;

                // 1) если уже есть timeline.hash в событии — это самый надежный вариант
                let candidateHash = null;
                if (data.timeline && typeof data.timeline.hash === 'string') {
                    candidateHash = data.timeline.hash;
                }

                // 2) иначе вытаскиваем сезон/эпизод
                let season = 0, episode = 0;
                if (!candidateHash) {
                    const se = StorageManager.extractSeasonEpisode(data);
                    season = se.season;
                    episode = se.episode;
                    if (!season || !episode) return;
                    candidateHash = StorageManager.generateTimelineHash(movie, season, episode);
                }

                if (!candidateHash) return;

                if (candidateHash === lastSavedHash) return;

                // Извлекаем file_name + torrent_link
                let fileName = '';
                let torrentLink = data.torrent_hash || data.torrent_link || '';

                if (data.url) {
                    const match = data.url.match(/\/stream\/([^?]+)/);
                    if (match) fileName = decodeURIComponent(match[1]);
                    const linkMatch = data.url.match(/[?&]link=([^&]+)/);
                    if (!torrentLink && linkMatch) torrentLink = decodeURIComponent(linkMatch[1]);
                }
                if (!fileName && data.path) fileName = data.path.split('/').pop() || data.path;
                if (!fileName && data.file_name) fileName = data.file_name;
                if (!fileName && data.path) fileName = data.path;

                // ✅ плейлист для внешнего плеера: сохраняем, если приходит в событии
                const incomingPlaylist = data.playlist ? ExternalPlayerManager.normalizePlaylistForSave(data.playlist, movie) : null;

                const streamData = {
                    file_name: fileName,
                    torrent_link: torrentLink,
                    file_index: data.id || data.file_index || 0,
                    title: data.title || movie.name || movie.title,
                    original_title: movie.original_name || movie.original_title,
                    movie_id: movie.id || movie.movie_id,
                    season: season || data.season || 0,
                    episode: episode || data.episode || 0,
                    episode_title: data.episode_title || data.title,
                    playlist: incomingPlaylist || undefined // ✅ плейлист для внешнего плеера
                };

                const saved = StorageManager.saveStreamParams(candidateHash, streamData);
                if (saved) {
                    currentEpisodeHash = candidateHash;
                    lastSavedHash = candidateHash;
                }
            } catch (e) {
                console.error('[ContinueWatch] Player start handler error:', e);
            }
        }

        function patchPlayer() {
            if (Lampa.Player._continue_patched) return;

            const originalPlay = Lampa.Player.play;

            Lampa.Player.play = function (params) {
                try {
                    // ✅ плейлист для внешнего плеера: перехватываем плейлист при обычном запуске Lampa
                    if (params && params.card) {
                        const movie = params.card;
                        const hash = StorageManager.generateTimelineHash(movie, params.season, params.episode);

                        if (hash) {
                            let file_name = '';
                            let torrent_link = params.torrent_hash || params.torrent_link || '';

                            if (params.url) {
                                const mf = params.url.match(/\/stream\/([^?]+)/);
                                const ml = params.url.match(/[?&]link=([^&]+)/);
                                const mi = params.url.match(/[?&]index=(\d+)/);
                                if (mf) file_name = decodeURIComponent(mf[1]);
                                if (!torrent_link && ml) torrent_link = decodeURIComponent(ml[1]);

                                const incomingPlaylist = params.playlist
                                    ? ExternalPlayerManager.normalizePlaylistForSave(params.playlist, movie)
                                    : null;

                                StorageManager.saveStreamParams(hash, {
                                    file_name,
                                    torrent_link,
                                    file_index: mi ? parseInt(mi[1]) : (params.file_index || 0),
                                    title: movie.name || movie.title,
                                    original_title: movie.original_name || movie.original_title,
                                    movie_id: movie.id || movie.movie_id,
                                    season: params.season || 0,
                                    episode: params.episode || 0,
                                    episode_title: params.title || params.episode_title,
                                    playlist: incomingPlaylist || undefined // ✅ плейлист для внешнего плеера
                                });

                                lastSavedHash = hash;
                            }
                        }
                    }
                } catch (e) {
                    console.error('[ContinueWatch] Player patch error:', e);
                }

                return originalPlay.call(this, params);
            };

            Lampa.Player._continue_patched = true;
        }

        return {
            launchPlayer,
            patchPlayer,
            setupPlayerListeners
        };
    })();

    // =========================================================================
    // МОДУЛЬ: UI (КНОПКА)
    // =========================================================================
    const UIManager = (function () {
        let debounceTimer = null;

        function handleContinueClick(movieData, buttonElement) {
            if (debounceTimer) return;

            const params = StorageManager.getStreamParams(movieData);
            if (!params) {
                Lampa.Noty.show('Нет истории просмотров');
                return;
            }

            if (buttonElement) $(buttonElement).css('opacity', 0.5);

            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                if (buttonElement) $(buttonElement).css('opacity', 1);
            }, SAVE_DEBOUNCE);

            PlayerManager.launchPlayer(movieData, params);
        }

        function createContinueButton(movie, params) {
            const timelineHash = StorageManager.generateTimelineHash(movie, params.season, params.episode);
            const timeline = timelineHash ? Lampa.Timeline.view(timelineHash) : null;

            let percent = 0;
            let timeStr = '';

            if (timeline && timeline.percent > 0) {
                percent = timeline.percent;
                timeStr = StorageManager.formatTime(timeline.time);
            }

            let labelText = 'Продолжить';
            if (params.season && params.episode) labelText += ` S${params.season} E${params.episode}`;
            if (timeStr) labelText += ` <span style="opacity:0.7;font-size:0.9em">(${timeStr})</span>`;

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
                if (e.type !== 'complite') return;

                requestAnimationFrame(() => {
                    const activity = e.object.activity;
                    const render = activity.render();

                    if (render.find('.button--continue-watch').length) return;

                    const params = StorageManager.getStreamParams(e.data.movie);
                    if (!params) return;

                    const continueBtn = createContinueButton(e.data.movie, params);

                    continueBtn.on('hover:enter', function () {
                        handleContinueClick(e.data.movie, this);
                    });

                    const torrentBtn = render.find('.view--torrent').last();
                    const buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

                    if (torrentBtn.length) torrentBtn.after(continueBtn);
                    else if (buttonsContainer.length) buttonsContainer.append(continueBtn);
                    else render.find('.full-start__button').last().after(continueBtn);
                });
            });
        }

        return {
            setupContinueButton
        };
    })();

    // =========================================================================
    // ИНИЦИАЛИЗАЦИЯ
    // =========================================================================
    const InitializationManager = (function () {
        function cleanupOldParams() {
            setTimeout(() => {
                try {
                    const params = StorageManager.getParams();
                    const now = Date.now();
                    let changed = false;

                    Object.keys(params).forEach(hash => {
                        if (params[hash] && params[hash].timestamp && now - params[hash].timestamp > CLEANUP_AGE) {
                            delete params[hash];
                            changed = true;
                        }
                    });

                    if (changed) StorageManager.setParams(params);
                } catch (e) {
                    console.error('[ContinueWatch] Cleanup failed:', e);
                }
            }, 10000);
        }

        function initialize() {
            try {
                StorageManager.ensureStorageSync();
                PlayerManager.patchPlayer();
                PlayerManager.setupPlayerListeners();
                UIManager.setupContinueButton();
                cleanupOldParams();

                console.log('[ContinueWatch] Loaded. External playlist enabled, destroy-save improved.');
            } catch (e) {
                console.error('[ContinueWatch] Initialization failed:', e);
            }
        }

        function setupAppListener() {
            Lampa.Listener.follow('app', (e) => {
                if (e.type === 'ready') {
                    StorageManager.setAccountReady(true);
                    StorageManager.ensureStorageSync();
                }
            });
        }

        return {
            initialize,
            setupAppListener
        };
    })();

    if (window.appready) {
        InitializationManager.initialize();
    } else {
        InitializationManager.setupAppListener();
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') InitializationManager.initialize();
        });
    }
})();
