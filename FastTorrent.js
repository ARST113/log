(function () {
    'use strict';

    // ==========================================================
    // FastTorrentStart (Optimized + Fixes)
    // - фикс addTrackersToMagnet (корректные &tr=)
    // - кеш ping TorrServer (меньше задержек на клик)
    // - дедуп добавления кнопки (full/content не дублируют)
    // - ускорение фильтра сезонов (RegExp компилируются один раз)
    // - фикс DOM: текст кнопки меняется только в .fts-text, иконка не пропадает
    // ==========================================================

    const DEBUG = false;
    const log = (...a) => DEBUG && console.log('[FastTorrentStart]', ...a);
    const err = (...a) => console.error('[FastTorrentStart] ❌', ...a);

    const PLUGIN_NAME = 'fast_torrent_start';
    const MAX_PRELOAD_CACHE = 20;
    const MAX_TORRENT_ATTEMPTS = 5;
    const TORRENT_CHECK_DELAY = 3000;

    const defaultSettings = {
        enabled: true,
        quality: '1080',
        fallback: true,
        voice_priority: 'dubbing',
        min_seeders: '10',
        auto_play: false,
        preload_on_enter: true,
        save_continue_params: true,
        sort_by: 'seeders',
        add_trackers: true,
        search_both_titles: true,
        cascade_voice: true,
        anime_mode: true
    };

    const voiceCategoriesData = {
        dubbing: {
            name: 'Дубляж',
            priority: 1,
            keywords: ['дублирован', 'дубляж', 'dub', 'dubbed', 'липсинк', 'дб', ' d ', '(dub)']
        },
        multi: {
            name: 'Многоголосая',
            priority: 2,
            keywords: ['многоголос', 'multi', 'закадров', 'lostfilm', ' мг ', '(мг)']
        },
        single: {
            name: 'Одноголосая',
            priority: 3,
            keywords: ['одноголос', 'single', 'голос', ' l1 ', '(l1)']
        },
        original: {
            name: 'Оригинал',
            priority: 4,
            keywords: ['оригинал', 'original', 'eng', ' o ', '(o)']
        },
        any: {
            name: 'Любая',
            priority: 5,
            keywords: []
        }
    };

    const voiceCascade = {
        dubbing: ['dubbing', 'multi', 'single'],
        multi: ['multi', 'dubbing', 'single'],
        single: ['single', 'multi', 'dubbing'],
        original: ['original', 'dubbing', 'multi', 'single'],
        any: ['dubbing', 'multi', 'single']
    };

    const defaultTrackers = [
        'http://retracker.local/announce',
        'http://bt4.t-ru.org/ann?magnet',
        'udp://opentor.org:2710',
        'udp://tracker.opentrackr.org:1337/announce',
        'http://tracker.city9x.com:2710/announce',
        'udp://tracker.cyberia.is:6969/announce',
        'udp://exodus.desync.com:6969/announce'
    ];

    // -------- runtime state
    let currentButton = null;
    let currentMovie = null;
    let buttonClickLock = false;
    let preloadedTorrents = new Map();

    let currentProcessId = null;
    let currentSearchId = null;

    const compiledVoiceRegex = {};
    let settingsCache = null;

    let currentOverlay = null;
    let overlayPrecreated = false;

    let activeTorrentRequests = new Set();
    let lastButtonKey = null;

    // -------- кеш паттернов сезонов
    const seasonPatternsCache = new Map(); // key = `${season}|${isAnime}` -> {list, exclude}

    // ==========================================================
    // TorrServer availability (cached)
    // ==========================================================
    const torrPing = { ts: 0, ok: false, promise: null, xhr: null };

    function checkTorrServerAvailabilityCached(ttl = 30000) {
        const now = Date.now();
        if (now - torrPing.ts < ttl) return Promise.resolve(torrPing.ok);
        if (torrPing.promise) return torrPing.promise;

        if (!Lampa.Torserver || !Lampa.Torserver.url()) return Promise.resolve(false);

        torrPing.promise = new Promise((resolve) => {
            try {
                torrPing.xhr && torrPing.xhr.abort();
            } catch (e) { }

            torrPing.xhr = $.ajax({
                url: Lampa.Torserver.url(),
                type: 'GET',
                timeout: 2500
            })
                .done(() => {
                    torrPing.ok = true;
                    torrPing.ts = Date.now();
                    resolve(true);
                })
                .fail(() => {
                    torrPing.ok = false;
                    torrPing.ts = Date.now();
                    resolve(false);
                })
                .always(() => {
                    torrPing.promise = null;
                });
        });

        return torrPing.promise;
    }

    // ==========================================================
    // Requests
    // ==========================================================
    function addActiveRequest(id) {
        activeTorrentRequests.add(id);
    }

    function removeActiveRequest(id) {
        activeTorrentRequests.delete(id);
    }

    function cleanupAllRequests() {
        activeTorrentRequests.clear();
    }

    // ==========================================================
    // Overlay
    // ==========================================================
    const OVERLAY_STAGES = {
        initial: { title: '🚀 Быстрый старт', text: 'Запускаем поиск...', progress: 10, step: 0 },
        search: { title: '🔍 Поиск торрентов', text: 'Ищем лучшие раздачи...', progress: 30, step: 0 },
        adding: { title: '📥 Добавление торрента', text: 'Добавляем в TorrServer...', progress: 60, step: 1 },
        files: { title: '📁 Проверка файлов', text: 'Получаем список файлов...', progress: 90, step: 2 },
        season: { title: '🎬 Выбор сезона', text: 'Выберите сезон для поиска...', progress: 40, step: 1 },
        loading: { title: '⏳ Загрузка', text: 'Пожалуйста, подождите...', progress: 50, step: 1 }
    };

    function createOverlayStyles() {
        if ($('#fts-overlay-styles').length) return;

        $('head').append(`
            <style id="fts-overlay-styles">
                .fts-overlay {
                    position: fixed;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.95);
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 999999;
                    color: white;
                    font-family: Arial, sans-serif;
                    backdrop-filter: blur(15px);
                    transition: opacity 0.3s ease;
                }
                .fts-overlay-content {
                    text-align: center;
                    max-width: 80%;
                    animation: fts-fadeInUp 0.4s ease-out;
                }
                .fts-spinner {
                    width: 70px; height: 70px;
                    border: 5px solid rgba(255, 107, 53, 0.3);
                    border-top: 5px solid #ff6b35;
                    border-radius: 50%;
                    animation: fts-spin 1.2s linear infinite;
                    margin-bottom: 25px;
                }
                .fts-overlay-title {
                    font-size: 28px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    background: linear-gradient(45deg, #ff6b35, #f7931e);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .fts-overlay-text {
                    font-size: 18px;
                    opacity: 0.9;
                    margin-bottom: 25px;
                    line-height: 1.5;
                }
                .fts-progress-bar {
                    width: 300px;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 3px;
                    overflow: hidden;
                    margin: 15px 0;
                }
                .fts-progress-fill {
                    height: 100%;
                    background: linear-gradient(45deg, #ff6b35, #f7931e);
                    border-radius: 3px;
                    transition: width 0.4s ease;
                }
                .fts-steps {
                    display: flex;
                    gap: 12px;
                    margin-top: 25px;
                }
                .fts-step {
                    width: 10px; height: 10px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.3);
                    transition: all 0.4s ease;
                }
                .fts-step.active {
                    background: #ff6b35;
                    transform: scale(1.3);
                }
                .fts-cancel-button {
                    margin-top: 25px;
                    padding: 10px 20px;
                    background: rgba(255, 255, 255, 0.15);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    border-radius: 25px;
                    color: white;
                    font-size: 16px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    font-weight: bold;
                }
                .fts-cancel-button:hover {
                    background: rgba(255, 255, 255, 0.25);
                    transform: translateY(-2px);
                }
                @keyframes fts-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes fts-fadeInUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        `);
    }

    function precreateOverlay() {
        if (overlayPrecreated) return;

        createOverlayStyles();

        currentOverlay = $(`
            <div class="fts-overlay" style="display: none; opacity: 0;">
                <div class="fts-overlay-content">
                    <div class="fts-spinner"></div>
                    <div class="fts-overlay-title">🔍 Быстрый старт</div>
                    <div class="fts-overlay-text">Подготовка...</div>
                    <div class="fts-progress-bar">
                        <div class="fts-progress-fill" style="width: 10%"></div>
                    </div>
                    <div class="fts-steps">
                        <div class="fts-step"></div>
                        <div class="fts-step"></div>
                        <div class="fts-step"></div>
                    </div>
                    <div class="fts-cancel-button">Отменить</div>
                </div>
            </div>
        `);

        function cancel() {
            hideOverlay();
            resetButton();
            currentProcessId = null;
            currentSearchId = null;
            cleanupAllRequests();
            Lampa.Noty.show('Операция отменена');
        }

        currentOverlay.find('.fts-cancel-button').on('click', cancel);

        currentOverlay.on('click', function (e) {
            if (e.target === this) cancel();
        });

        $('body').append(currentOverlay);
        overlayPrecreated = true;
    }

    function applyOverlayState(stage = 'loading', customText = '') {
        precreateOverlay();

        const st = OVERLAY_STAGES[stage] || OVERLAY_STAGES.loading;
        const title = st.title;
        const text = customText || st.text;

        currentOverlay.find('.fts-overlay-title').text(title);
        currentOverlay.find('.fts-overlay-text').text(text);
        currentOverlay.find('.fts-progress-fill').css('width', st.progress + '%');

        const steps = currentOverlay.find('.fts-step').removeClass('active');
        if (typeof st.step === 'number') steps.eq(st.step).addClass('active');

        currentOverlay.show().css('opacity', '1');
    }

    function showOverlay(stage = 'search', additionalText = '') {
        applyOverlayState(stage, additionalText);
    }

    function updateOverlay(stage, text) {
        if (!currentOverlay || !currentOverlay.is(':visible')) {
            applyOverlayState(stage, text);
            return;
        }
        applyOverlayState(stage, text);
    }

    function hideOverlay() {
        if (!currentOverlay) return;
        currentOverlay.css('opacity', '0');
        setTimeout(() => currentOverlay && currentOverlay.hide(), 300);
    }

    // ==========================================================
    // TorrServer safe calls
    // ==========================================================
    function waitForTorrServer(callback, attempt = 1) {
        if (attempt > MAX_TORRENT_ATTEMPTS) return callback(false);

        if (!Lampa.Torserver || !Lampa.Torserver.url()) {
            return setTimeout(() => waitForTorrServer(callback, attempt + 1), TORRENT_CHECK_DELAY);
        }

        callback(true);
    }

    function safeTorrServerHash(params, success, error) {
        const requestId = 'hash_' + Date.now() + '_' + Math.random().toString(16).slice(2);
        addActiveRequest(requestId);

        waitForTorrServer((ready) => {
            if (!ready) {
                removeActiveRequest(requestId);
                Lampa.Noty.show('❌ TorrServer не доступен. Проверьте настройки.');
                return error(new Error('TorrServer не доступен'));
            }

            if (!activeTorrentRequests.has(requestId)) return;

            Lampa.Torserver.hash(params, (hash_data) => {
                removeActiveRequest(requestId);
                success(hash_data);
            }, (e) => {
                removeActiveRequest(requestId);
                Lampa.Noty.show('Ошибка добавления торрента в TorrServer');
                error(e);
            });
        });
    }

    function safeTorrServerFiles(hash, success, error) {
        const requestId = 'files_' + Date.now() + '_' + Math.random().toString(16).slice(2);
        addActiveRequest(requestId);

        waitForTorrServer((ready) => {
            if (!ready) {
                removeActiveRequest(requestId);
                return error(new Error('TorrServer не доступен'));
            }

            if (!activeTorrentRequests.has(requestId)) return;

            const timeoutId = setTimeout(() => {
                if (activeTorrentRequests.has(requestId)) {
                    removeActiveRequest(requestId);
                    error(new Error('Таймаут получения файлов'));
                }
            }, 30000);

            Lampa.Torserver.files(hash, (files_data) => {
                clearTimeout(timeoutId);
                removeActiveRequest(requestId);
                success(files_data);
            }, (e) => {
                clearTimeout(timeoutId);
                removeActiveRequest(requestId);
                error(e);
            });
        });
    }

    // ==========================================================
    // Settings / regex
    // ==========================================================
    function compileVoiceRegex() {
        const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        for (const [key, data] of Object.entries(voiceCategoriesData)) {
            if (key === 'any' || !data.keywords.length) {
                compiledVoiceRegex[key] = null;
                continue;
            }

            const patterns = data.keywords
                .map((w) => (w ? escapeRegExp(w.toLowerCase().trim()) : ''))
                .filter(Boolean);

            try {
                compiledVoiceRegex[key] = new RegExp(patterns.join('|'), 'i');
            } catch (e) {
                compiledVoiceRegex[key] = null;
            }
        }
    }

    function initSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.Storage.listener.follow('change', function (e) {
            if (e.name && e.name.startsWith('fts_')) {
                settingsCache = null;
                compileVoiceRegex();
            }
        });

        Lampa.SettingsApi.addComponent({
            component: PLUGIN_NAME,
            name: 'Быстрый старт торрентов',
            icon:
                '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>'
        });

        const settings = [
            { name: 'fts_enabled', type: 'trigger', default: defaultSettings.enabled, field: { name: 'Включить' } },
            { name: 'fts_anime_mode', type: 'trigger', default: defaultSettings.anime_mode, field: { name: 'Режим аниме' } },
            { name: 'fts_search_both_titles', type: 'trigger', default: defaultSettings.search_both_titles, field: { name: 'Поиск по двум названиям' } },
            { name: 'fts_cascade_voice', type: 'trigger', default: defaultSettings.cascade_voice, field: { name: 'Каскадный поиск озвучки' } },
            { name: 'fts_preload_on_enter', type: 'trigger', default: defaultSettings.preload_on_enter, field: { name: 'Предзагрузка' } },
            { name: 'fts_auto_play', type: 'trigger', default: defaultSettings.auto_play, field: { name: 'Автоматический запуск' } },
            { name: 'fts_save_continue_params', type: 'trigger', default: defaultSettings.save_continue_params, field: { name: 'Сохранение Continue Watch' } },
            { name: 'fts_add_trackers', type: 'trigger', default: defaultSettings.add_trackers, field: { name: 'Добавлять трекеры' } },
            {
                name: 'fts_quality',
                type: 'select',
                values: { 2160: '4K', 1440: '1440p', 1080: '1080p', 720: '720p', 480: '480p' },
                default: defaultSettings.quality,
                field: { name: 'Качество' }
            },
            { name: 'fts_fallback', type: 'trigger', default: defaultSettings.fallback, field: { name: 'Снижать качество' } },
            {
                name: 'fts_voice_priority',
                type: 'select',
                values: { dubbing: 'Дубляж', multi: 'Многоголосая', single: 'Одноголосая', original: 'Оригинал', any: 'Любая' },
                default: defaultSettings.voice_priority,
                field: { name: 'Озвучка' }
            },
            { name: 'fts_sort_by', type: 'select', values: { seeders: 'Сиды', size: 'Размер', date: 'Дата' }, default: defaultSettings.sort_by, field: { name: 'Сортировка' } },
            { name: 'fts_min_seeders', type: 'select', values: { 0: 'Любые', 10: '10+', 50: '50+', 100: '100+' }, default: defaultSettings.min_seeders, field: { name: 'Мин. сидов' } }
        ];

        settings.forEach((s) => {
            Lampa.SettingsApi.addParam({
                component: PLUGIN_NAME,
                param: { name: s.name, type: s.type, values: s.values, default: s.default },
                field: s.field
            });
        });
    }

    function getSettings() {
        if (settingsCache) return settingsCache;

        try {
            const out = {};
            Object.keys(defaultSettings).forEach((key) => {
                const val = Lampa.Storage.field('fts_' + key);
                out[key] = val !== undefined ? val : defaultSettings[key];

                if (key === 'quality' || key === 'min_seeders') out[key] = parseInt(out[key], 10);
            });
            settingsCache = out;
            return out;
        } catch (e) {
            return { ...defaultSettings, quality: parseInt(defaultSettings.quality, 10), min_seeders: parseInt(defaultSettings.min_seeders, 10) };
        }
    }

    function initContinueWatch() {
        Lampa.Storage.sync('continue_watch_params', 'object_object');
    }

    function saveStreamParams(movie, hash_data, mainFile) {
        if (!getSettings().save_continue_params) return;

        try {
            const hash = Lampa.Utils.hash(movie.original_title || movie.title);
            const params = Lampa.Storage.get('continue_watch_params', {});
            params[hash] = {
                file_name: mainFile.path.split('/').pop(),
                torrent_link: hash_data.hash,
                file_index: mainFile.id,
                path: mainFile.path,
                title: movie.original_title || movie.title,
                timestamp: Date.now(),
                source: 'fast_torrent_start'
            };
            Lampa.Storage.set('continue_watch_params', params);
        } catch (e) {
            err('Ошибка сохранения параметров', e);
        }
    }

    // ==========================================================
    // Content helpers
    // ==========================================================
    function isSeries(movie) {
        if (!movie) return false;

        return (
            movie.number_of_seasons > 0 ||
            movie.media_type === 'tv' ||
            movie.category === 'tv'
        );
    }

    function isAnime(movie) {
        return (
            movie &&
            (movie.type === 'anime' ||
                movie.media_type === 'anime' ||
                movie.category === 'anime' ||
                (movie.genres && movie.genres.some((g) => g.name && g.name.toLowerCase().includes('аниме'))))
        );
    }

    // FIX: правильная сборка tr-параметров
    function addTrackersToMagnet(magnetUri, trackers) {
        if (!magnetUri || !getSettings().add_trackers) return magnetUri;

        const parts = String(magnetUri).split('?');
        const base = parts[0] || 'magnet:';
        const query = parts[1] || '';
        const params = new URLSearchParams(query);

        const existing = new Set(params.getAll('tr'));
        for (const tr of trackers || []) {
            if (!existing.has(tr)) params.append('tr', tr);
        }

        const q = params.toString();
        return q ? base + '?' + q : base;
    }

    // ==========================================================
    // UI: button styles
    // ==========================================================
    function addButtonStyles() {
        if ($('#fast-torrent-styles').length) return;

        $('head').append(`
            <style id="fast-torrent-styles">
                .button--fast-torrent {
                    background: linear-gradient(45deg, #ff6b35, #f7931e) !important;
                    border-radius: 10px !important;
                    margin-right: 12px !important;
                    transition: all 0.3s ease !important;
                    z-index: 999 !important;
                    position: relative;
                    pointer-events: auto !important;
                    padding: 12px 20px !important;
                    border: 2px solid transparent !important;
                    color: white !important;
                    font-weight: bold !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                }
                .button--fast-torrent:hover {
                    background: linear-gradient(45deg, #ff8b35, #ffa91e) !important;
                    transform: scale(1.08) !important;
                    border-color: rgba(255,255,255,0.3) !important;
                }
                .button--fast-torrent.button--loading {
                    background: linear-gradient(45deg, #555, #666) !important;
                    opacity: 0.8;
                    pointer-events: none;
                    transform: scale(0.95) !important;
                }
                .button--fast-torrent .fts-ico {
                    color: white !important;
                    pointer-events: none;
                    font-size: 1.1em;
                }
                .button--fast-torrent .fts-text {
                    color: white !important;
                    font-weight: bold;
                    pointer-events: none;
                    font-size: 1.1em;
                }
                @keyframes fts-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .fts-loader { animation: fts-spin 1s linear infinite; }
            </style>
        `);
    }

    // ==========================================================
    // Button injection (dedup)
    // ==========================================================
    function addFastTorrentButton(movie) {
        if (!getSettings().enabled) return;
        if (!movie || !movie.title) return;

        const key = (movie.id || '') + '|' + (movie.original_title || movie.title || '') + '|' + (movie.year || '');
        if (lastButtonKey === key && currentButton && currentButton.length) return;
        lastButtonKey = key;

        if (currentButton) {
            currentButton.remove();
            currentButton = null;
        }

        setTimeout(() => {
            try {
                let container = null;

                const selectors = [
                    '.full-start-new__buttons',
                    '.full-start__buttons',
                    '.full__buttons',
                    '.full-start-new-buttons',
                    '.full-start-new-buttons__grid'
                ];

                for (let selector of selectors) {
                    const elements = $(selector);
                    if (elements.length) {
                        container = elements.first();
                        break;
                    }
                }

                if (!container) {
                    const anyButton = $('.full-start__button, .full-start-new__button').first();
                    if (anyButton.length) container = anyButton.parent();
                }

                if (!container) return;

                const isSeriesContent = isSeries(movie);
                renderButton(container, movie, isSeriesContent);
            } catch (e) {
                err('Ошибка добавления кнопки', e);
            }
        }, 200);
    }

    function renderButton(container, movie, isSeriesContent) {
        const existingButton = container.find('.button--fast-torrent');
        if (existingButton.length) existingButton.remove();

        const buttonText = isSeriesContent ? 'Fast Series' : 'Fast Torrent';

        const button = $(`
            <div class="full-start__button selector button--fast-torrent">
                <span class="fts-ico">🚀</span>
                <span class="fts-text">${buttonText}</span>
            </div>
        `);

        button.on('hover:enter click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (buttonClickLock) return;

            button.css({ transform: 'scale(0.92)', transition: 'transform 0.15s ease' });
            setTimeout(() => button.length && button.css({ transform: 'scale(1)', transition: 'transform 0.25s ease' }), 150);

            showOverlay('initial');

            setTimeout(() => handleButtonClick(movie, isSeriesContent), 80);
        });

        try {
            if (container.find('.full-start__button').length) container.prepend(button);
            else container.append(button);

            currentButton = button;
            currentMovie = movie;
        } catch (e) {
            err('Ошибка рендера кнопки', e);
        }
    }

    // ==========================================================
    // Torrent selection
    // ==========================================================
    function checkQuality(torrent, quality) {
        if (!torrent || !torrent.Title) return false;

        const title = torrent.Title.toLowerCase();
        switch (quality) {
            case 2160: return /2160|4k|uhd/.test(title);
            case 1440: return /1440|2k/.test(title);
            case 1080: return /1080|fullhd|fhd/.test(title);
            case 720: return /720|hd/.test(title);
            case 480: return /480|sd/.test(title);
            default: return true;
        }
    }

    function checkVoiceCategory(torrent, voiceType) {
        if (voiceType === 'any' || !torrent || !torrent.Title) return true;
        const regex = compiledVoiceRegex[voiceType];
        return regex && typeof regex.test === 'function' ? regex.test(torrent.Title) : true;
    }

    function findBestTorrent(torrents, settings, isAnimeContent) {
        if (!torrents || !torrents.length) return null;

        const qualityLevels = [2160, 1440, 1080, 720, 480];
        let startIndex = qualityLevels.indexOf(settings.quality);
        if (startIndex === -1) startIndex = 2;

        let list = torrents.filter((t) => t && typeof t === 'object' && t.Title);

        // сортировка (как у тебя было)
        if (settings.sort_by === 'seeders') {
            list.sort((a, b) => (b.Seeders || 0) - (a.Seeders || 0));
        } else if (settings.sort_by === 'size') {
            list.sort((a, b) => (b.Size || 0) - (a.Size || 0));
        } else if (settings.sort_by === 'date') {
            list.sort((a, b) => new Date(b.PublishDate || 0) - new Date(a.PublishDate || 0));
        }

        let voicePriorities = settings.cascade_voice
            ? (voiceCascade[settings.voice_priority] || [settings.voice_priority])
            : [settings.voice_priority];

        if (isAnimeContent && settings.anime_mode) {
            voicePriorities = voicePriorities.filter((v) => v !== 'original');
            if (!voicePriorities.length) voicePriorities = ['multi'];
        }

        for (let voiceType of voicePriorities) {
            for (let i = startIndex; i < qualityLevels.length; i++) {
                const q = qualityLevels[i];
                for (let t of list) {
                    if (settings.min_seeders > 0 && (t.Seeders || 0) < settings.min_seeders) continue;
                    if (checkQuality(t, q) && checkVoiceCategory(t, voiceType)) return t;
                }
                if (!settings.fallback) break;
            }
        }

        // fallback
        const top = list[0];
        if (top && (settings.min_seeders === 0 || (top.Seeders || 0) >= settings.min_seeders)) return top;

        return null;
    }

    // ==========================================================
    // Search
    // ==========================================================
    function searchTorrentsWithCascade(movie, callback) {
        const settings = getSettings();
        const searchQueries = [];
        const searchId = Date.now();
        currentSearchId = searchId;

        if (movie.original_title) searchQueries.push({ title: movie.original_title, type: 'original' });
        if (settings.search_both_titles && movie.title && movie.title !== movie.original_title) {
            searchQueries.push({ title: movie.title, type: 'russian' });
        }
        if (!searchQueries.length) searchQueries.push({ title: movie.title, type: 'default' });

        let allResults = [];
        let completed = 0;
        const uniqueLinks = new Set();

        const done = () => {
            if (currentSearchId !== searchId) return;
            callback(allResults);
        };

        searchQueries.forEach((q) => {
            Lampa.Parser.get(
                { movie: { ...movie, title: q.title, original_title: q.title } },
                (data) => {
                    if (currentSearchId !== searchId) return;

                    completed++;

                    if (data && data.Results && data.Results.length) {
                        data.Results.forEach((item) => {
                            const key = (item.Link || item.MagnetUri || '').toLowerCase();
                            if (key && !uniqueLinks.has(key)) {
                                uniqueLinks.add(key);
                                allResults.push(item);
                            }
                        });
                    }

                    if (completed === searchQueries.length) done();
                }
            );
        });
    }

    // ==========================================================
    // Preload
    // ==========================================================
    function preloadTorrents(movie) {
        const settings = getSettings();
        if (!settings.preload_on_enter) return;
        if (isSeries(movie)) return;

        if (preloadedTorrents.size > MAX_PRELOAD_CACHE) {
            const firstKey = preloadedTorrents.keys().next().value;
            preloadedTorrents.delete(firstKey);
        }

        const movieKey = (movie.original_title || movie.title) + (movie.year ? '_' + movie.year : '');
        if (preloadedTorrents.has(movieKey)) return;

        preloadedTorrents.set(movieKey, { status: 'loading', data: null });

        searchTorrentsWithCascade(movie, (torrents) => {
            if (torrents && torrents.length) {
                const best = findBestTorrent(torrents, getSettings(), isAnime(movie));
                if (best) {
                    preloadedTorrents.set(movieKey, { status: 'loaded', data: best });

                    if (getSettings().auto_play && !movie.auto_played) {
                        movie.auto_played = true;
                        setTimeout(() => handleButtonClick(movie, false), 800);
                    }
                } else {
                    preloadedTorrents.set(movieKey, { status: 'no_torrents', data: null });
                }
            } else {
                preloadedTorrents.set(movieKey, { status: 'no_torrents', data: null });
            }
        });
    }

    // ==========================================================
    // Main click handler
    // ==========================================================
    async function handleButtonClick(movie, isSeriesContent) {
        // cached ping
        const ok = await checkTorrServerAvailabilityCached(30000);

        if (!ok) {
            hideOverlay();
            Lampa.Noty.show(`
                ❌ TorrServer недоступен!
                Проверьте:
                1. Запущен ли TorrServer
                2. Адрес в настройках Lampa
                3. Сеть и порты
            `);
            resetButton();
            return;
        }

        updateOverlay('search');

        if (isSeriesContent) {
            showSeasonSelector(movie);
        } else {
            const movieKey = (movie.original_title || movie.title) + (movie.year ? '_' + movie.year : '');
            const preloaded = preloadedTorrents.get(movieKey);

            if (preloaded && preloaded.status === 'loaded') {
                processBestTorrentForMovie(movie, preloaded.data);
            } else {
                setButtonLoading('Поиск...');
                processQuickSearch(movie);
            }
        }
    }

    function processQuickSearch(movie) {
        searchTorrentsWithCascade(movie, (torrents) => {
            if (torrents && torrents.length) {
                const best = findBestTorrent(torrents, getSettings(), isAnime(movie));
                if (best) return processBestTorrentForMovie(movie, best);

                hideOverlay();
                Lampa.Noty.show('Не найдено подходящих раздач');
                resetButton();
            } else {
                hideOverlay();
                Lampa.Noty.show('Торренты не найдены');
                resetButton();
            }
        });
    }

    // ==========================================================
    // Seasons
    // ==========================================================
    function showSeasonSelector(movie) {
        const totalSeasons = movie.number_of_seasons || 1;

        if (totalSeasons === 1) {
            updateOverlay('season', 'Поиск сезона 1...');
            setTimeout(() => findTorrentForSeason(movie, 1), 300);
            return;
        }

        const seasonItems = [];
        for (let i = 1; i <= totalSeasons; i++) {
            seasonItems.push({ title: `Сезон ${i}`, subtitle: `Season ${i}`, season: i });
        }

        hideOverlay();

        Lampa.Select.show({
            title: 'Выберите сезон',
            items: seasonItems,
            onSelect: (item) => {
                Lampa.Controller.toggle('content');
                showOverlay('season', `Поиск сезона ${item.season}...`);
                setTimeout(() => findTorrentForSeason(movie, item.season), 300);
            },
            onBack: () => {
                Lampa.Controller.toggle('content');
                resetButton();
            }
        });

        resetButton();
    }

    function getAlternativeVoicePriorities(currentVoice) {
        const priorities = {
            dubbing: ['multi', 'single', 'original'],
            multi: ['dubbing', 'single', 'original'],
            single: ['multi', 'dubbing', 'original'],
            original: ['dubbing', 'multi', 'single'],
            any: ['dubbing', 'multi', 'single']
        };
        return priorities[currentVoice] || ['multi', 'dubbing', 'single'];
    }

    function buildSeasonPatterns(season, isAnimeContent) {
        const key = season + '|' + (isAnimeContent ? 1 : 0);
        if (seasonPatternsCache.has(key)) return seasonPatternsCache.get(key);

        const s2 = String(season).padStart(2, '0');
        let list, exclude;

        if (isAnimeContent) {
            list = [
                new RegExp(`\\[s${s2}\\]`, 'i'),
                new RegExp(`s${s2}`, 'i'),
                new RegExp(`season\\s*${season}`, 'i'),
                new RegExp(`\\s${season}\\s+сезон`, 'i'),
                new RegExp(`сезон\\s+${season}`, 'i'),
                new RegExp(`\\[${season}\\s*сезон\\]`, 'i'),
                new RegExp(`\\(${season}\\s*сезон\\)`, 'i')
            ];

            // Для 1 сезона часто не пишут, но важно исключить явные другие сезоны
            exclude = season === 1 ? /\[s(0[2-9]|[1-9]\d)\]/i : null;
        } else {
            list = [
                new RegExp(`s${s2}`, 'i'),
                new RegExp(`season\\s*${season}`, 'i'),
                new RegExp(`\\s${season}\\s+сезон`, 'i'),
                new RegExp(`сезон\\s+${season}`, 'i'),
                new RegExp(`\\[сезон\\s*${season}\\]`, 'i')
            ];
            exclude = null;
        }

        const out = { list, exclude };
        seasonPatternsCache.set(key, out);
        return out;
    }

    function filterTorrentsBySeason(torrents, season, isAnimeContent) {
        const { list, exclude } = buildSeasonPatterns(season, isAnimeContent);

        return torrents.filter((torrent) => {
            const title = (torrent && torrent.Title) ? torrent.Title : '';
            if (exclude && exclude.test(title)) return false;
            return list.some((re) => re.test(title));
        });
    }

    function findTorrentForSeason(movie, season) {
        searchTorrentsWithCascade(movie, (torrents) => {
            if (!torrents || !torrents.length) {
                hideOverlay();
                Lampa.Noty.show('Торренты не найдены');
                resetButton();
                return;
            }

            const settings = getSettings();
            const anime = isAnime(movie);

            const seasonTorrents = filterTorrentsBySeason(torrents, season, anime);

            if (!seasonTorrents.length) {
                // каскад по озвучке на всем массиве (как у тебя было)
                const alt = getAlternativeVoicePriorities(settings.voice_priority);

                for (let voiceType of alt) {
                    const temp = { ...settings, voice_priority: voiceType };
                    const best = findBestTorrent(torrents, temp, anime);
                    if (best) return launchTorrentsComponent(movie, best, season);
                }

                hideOverlay();
                Lampa.Noty.show(`Сезон ${season} не найден`);
                resetButton();
                return;
            }

            let best = findBestTorrent(seasonTorrents, settings, anime);
            if (best) return launchTorrentsComponent(movie, best, season);

            // каскад по озвучке внутри сезонных
            const alt = getAlternativeVoicePriorities(settings.voice_priority);
            for (let voiceType of alt) {
                const temp = { ...settings, voice_priority: voiceType };
                const bestAlt = findBestTorrent(seasonTorrents, temp, anime);
                if (bestAlt) return launchTorrentsComponent(movie, bestAlt, season);
            }

            hideOverlay();
            Lampa.Noty.show(`Подходящий торрент не найден`);
            resetButton();
        });
    }

    function launchTorrentsComponent(movie, bestTorrent) {
        Lampa.Torrent.start(bestTorrent, movie);
        hideOverlay();
        resetButton();
    }

    // ==========================================================
    // Movie playback pipeline
    // ==========================================================
    function processBestTorrentForMovie(movie, bestTorrent) {
        const processId = Date.now();
        currentProcessId = processId;

        updateOverlay('adding');

        let magnetLink = bestTorrent.Link || bestTorrent.MagnetUri;
        if (!magnetLink) {
            hideOverlay();
            Lampa.Noty.show('Ошибка: нет magnet ссылки');
            resetButton();
            return;
        }

        magnetLink = addTrackersToMagnet(magnetLink, defaultTrackers);

        safeTorrServerHash(
            {
                link: magnetLink,
                title: movie.title,
                poster: movie.poster_path ? Lampa.Api.img(movie.poster_path) : ''
            },
            (hash_data) => {
                if (currentProcessId !== processId) return;

                if (!hash_data || !hash_data.hash) {
                    hideOverlay();
                    Lampa.Noty.show('Ошибка получения хеша торрента');
                    resetButton();
                    return;
                }

                updateOverlay('files');
                checkFilesViaLampa(hash_data.hash, movie, processId, 1);
            },
            () => {
                if (currentProcessId !== processId) return;
                hideOverlay();
                Lampa.Noty.show('Ошибка добавления торрента');
                resetButton();
            }
        );
    }

    function checkFilesViaLampa(hash, movie, processId, attempt) {
        if (currentProcessId !== processId) return;
        if (typeof Lampa.Activity !== 'undefined' && !Lampa.Activity.active()) return;

        safeTorrServerFiles(
            hash,
            (files_data) => {
                if (currentProcessId !== processId) return;

                let files = null;
                if (Array.isArray(files_data)) files = files_data;
                else if (files_data && files_data.file_stats) files = files_data.file_stats;
                else if (files_data && files_data.files) files = files_data.files;

                if (files && files.length) {
                    launchPlayer(movie, { hash }, files);
                } else if (attempt < MAX_TORRENT_ATTEMPTS) {
                    updateOverlay('files', `Проверка файлов... (попытка ${attempt}/${MAX_TORRENT_ATTEMPTS})`);
                    setTimeout(() => checkFilesViaLampa(hash, movie, processId, attempt + 1), TORRENT_CHECK_DELAY);
                } else {
                    hideOverlay();
                    Lampa.Noty.show('Файлы не найдены в торренте');
                    resetButton();
                }
            },
            () => {
                if (currentProcessId !== processId) return;

                if (attempt < MAX_TORRENT_ATTEMPTS) {
                    updateOverlay('files', `Повторная проверка... (попытка ${attempt}/${MAX_TORRENT_ATTEMPTS})`);
                    setTimeout(() => checkFilesViaLampa(hash, movie, processId, attempt + 1), TORRENT_CHECK_DELAY);
                } else {
                    hideOverlay();
                    Lampa.Noty.show('Ошибка получения файлов');
                    resetButton();
                }
            }
        );
    }

    function launchPlayer(movie, hash_data, files) {
        try {
            const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'm2ts'];

            const videoFiles = files.filter((f) => {
                if (!f || !f.path) return false;
                const ext = f.path.split('.').pop().toLowerCase();
                return videoExts.includes(ext);
            });

            if (!videoFiles.length) {
                hideOverlay();
                Lampa.Noty.show('Видео файлы не найдены');
                resetButton();
                return;
            }

            videoFiles.sort((a, b) => (b.length || 0) - (a.length || 0));
            const mainFile = videoFiles[0];

            const subExts = ['srt', 'vtt', 'ass'];
            const subtitles = files
                .filter((f) => f && f.path && subExts.includes(f.path.split('.').pop().toLowerCase()))
                .map((f) => ({
                    label: f.path.split('/').pop(),
                    url: Lampa.Torserver.stream(f.path, hash_data.hash, f.id)
                }));

            const streamUrl = Lampa.Torserver.stream(mainFile.path, hash_data.hash, mainFile.id);

            const hash = Lampa.Utils.hash(movie.original_title || movie.title);
            const view = Lampa.Timeline.view(hash);

            const playerData = {
                url: streamUrl,
                title: movie.title || movie.name,
                card: movie,
                torrent_hash: hash_data.hash,
                timeline: view,
                subtitles
            };

            if (movie.id) Lampa.Favorite.add('history', movie, 100);
            saveStreamParams(movie, hash_data, mainFile);

            setTimeout(() => hideOverlay(), 300);
            resetButton();

            Lampa.Player.play(playerData);
        } catch (e) {
            err('Ошибка запуска плеера', e);
            hideOverlay();
            Lampa.Noty.show('Ошибка запуска плеера');
            resetButton();
        }
    }

    // ==========================================================
    // Button states
    // ==========================================================
    function setButtonLoading(text) {
        buttonClickLock = true;
        if (!currentButton) return;
        currentButton.addClass('button--loading');
        currentButton.find('.fts-text').text(text || 'Загрузка...');
    }

    function resetButton() {
        buttonClickLock = false;
        currentProcessId = null;
        currentSearchId = null;
        cleanupAllRequests();

        if (!currentButton) return;
        currentButton.removeClass('button--loading');

        const series = isSeries(currentMovie);
        currentButton.find('.fts-text').text(series ? 'Fast Series' : 'Fast Torrent');
    }

    // ==========================================================
    // Cleanup
    // ==========================================================
    function cleanup() {
        currentProcessId = null;
        currentSearchId = null;
        cleanupAllRequests();
        hideOverlay();

        if (currentButton) {
            currentButton.remove();
            currentButton = null;
        }

        currentMovie = null;
        lastButtonKey = null;
    }

    // ==========================================================
    // Plugin init
    // ==========================================================
    function startPlugin() {
        if (!window.Lampa) {
            setTimeout(startPlugin, 100);
            return;
        }

        const required = ['Parser', 'Torrent', 'Listener', 'Torserver', 'Storage', 'SettingsApi'];
        const missing = required.filter((c) => !Lampa[c]);
        if (missing.length) {
            setTimeout(startPlugin, 100);
            return;
        }

        try {
            addButtonStyles();
            precreateOverlay();
            compileVoiceRegex();
            initContinueWatch();
            initSettings();

            // full page
            Lampa.Listener.follow('full', function (e) {
                if (e.type === 'complite' && e.data && e.data.movie) {
                    setTimeout(() => {
                        addFastTorrentButton(e.data.movie);
                        preloadTorrents(e.data.movie);
                    }, 350);
                }
            });

            // content page (иногда full не приходит)
            Lampa.Listener.follow('content', function (e) {
                if (e.type === 'complite' && e.data && e.data.movie) {
                    setTimeout(() => {
                        addFastTorrentButton(e.data.movie);
                        preloadTorrents(e.data.movie);
                    }, 350);
                }
            });

            // если уже на full
            if (Lampa.Activity.active() && Lampa.Activity.active().component === 'full') {
                const activity = Lampa.Activity.active();
                if (activity.activity && activity.activity.movie) {
                    setTimeout(() => {
                        addFastTorrentButton(activity.activity.movie);
                        preloadTorrents(activity.activity.movie);
                    }, 700);
                }
            }

            Lampa.Activity.listener.follow('backward', cleanup);
            Lampa.Listener.follow('clear', cleanup);

            log('✅ Плагин инициализирован');
        } catch (e) {
            err('Ошибка инициализации', e);
        }
    }

    if (window.Lampa) startPlugin();
    else window.addEventListener('lampa-loaded', startPlugin);
})();
