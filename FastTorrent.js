(function() {
    'use strict';

    console.log('[FastTorrentStart] 🚀 Плагин загружается (Fix Regex & Player)...');

    // ========== КОНФИГУРАЦИЯ ==========
    const PLUGIN_NAME = 'fast_torrent_start';
    const MAX_PRELOAD_CACHE = 50;
    
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
        'dubbing': { name: 'Дубляж', priority: 1, keywords: ['дублирован', 'дубляж', 'dub', 'dubbed', 'липсинк', 'дб', 'невафильм', 'мосфильм', 'пифагор', 'sdi media', 'кириллица', 'амедиа', 'рентв', 'стс', 'тнт', 'первый канал', 'netflix', 'apple tv', 'hbo', 'amazon', 'wakanim', 'crunchyroll', 'аниме дубляж', '| d', ' d |', '[d]'] },
        'multi': { name: 'Многоголосая', priority: 2, keywords: ['многоголос', 'multi', 'закадров', 'lostfilm', 'baibako', 'newstudio', 'alexfilm', 'jaskier', 'кубик в кубе', 'кураж-бамбей', 'anilibria', 'anidub', 'shiza', 'jam', 'animedia', 'субтитры', '| мг', ' мг |', '[мг]'] },
        'single': { name: 'Одноголосая', priority: 3, keywords: ['одноголос', 'single', 'голос', 'one voice', 'гоблин', 'пучков', 'сербин', 'гаврилов', 'володарский', 'любительск', '| l1', '[l1]'] },
        'original': { name: 'Оригинал', priority: 4, keywords: ['оригинал', 'original', 'eng', 'english', 'raw', '| o', ' o |', '[o]'] },
        'any': { name: 'Любая', priority: 5, keywords: [] }
    };

    const voiceCascade = {
        'dubbing': ['dubbing', 'multi', 'single'],
        'multi': ['multi', 'dubbing', 'single'],
        'single': ['single', 'multi', 'dubbing'],
        'original': ['original', 'dubbing', 'multi', 'single'],
        'any': ['dubbing', 'multi', 'single']
    };

    const defaultTrackers = [
        'http://retracker.local/announce', 'http://bt4.t-ru.org/ann?magnet', 'udp://opentor.org:2710',
        'udp://tracker.opentrackr.org:1337/announce', 'http://tracker.city9x.com:2710/announce',
        'udp://tracker.cyberia.is:6969/announce', 'udp://exodus.desync.com:6969/announce'
    ];

    let currentButton = null;
    let currentMovie = null;
    let buttonClickLock = false;
    let preloadedTorrents = new Map();
    let currentProcessId = null;
    let currentSearchId = null;
    const compiledVoiceRegex = {};
    let settingsCache = null;

    // ========== ИСПРАВЛЕННАЯ КОМПИЛЯЦИЯ REGEX ==========
    function compileVoiceRegex() {
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        for (const [key, data] of Object.entries(voiceCategoriesData)) {
            if (key === 'any' || !data.keywords.length) { 
                compiledVoiceRegex[key] = null; 
                continue; 
            }
            
            const patterns = data.keywords.map(word => {
                const escaped = escapeRegExp(word.toLowerCase().trim());
                // ИСПРАВЛЕНИЕ: [\W_] ловит точки, тире, скобки и пробелы
                // Раньше точки (.) игнорировались, и Movie.Dubbing не находился
                if (word.length <= 4 && /^[a-zа-я0-9]+$/i.test(word)) {
                    return `(?:^|[\\W_])${escaped}(?:$|[\\W_])`;
                }
                return escaped;
            });
            
            try { 
                compiledVoiceRegex[key] = new RegExp(patterns.join('|'), 'i'); 
            } catch (e) { 
                compiledVoiceRegex[key] = null; 
            }
        }
    }

    function initSettings() {
        if (!Lampa.SettingsApi) return;
        Lampa.Storage.listener.follow('change', function(e) { if (e.name.startsWith('fts_')) settingsCache = null; });
        Lampa.SettingsApi.addComponent({ component: PLUGIN_NAME, name: 'Быстрый старт торрентов', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>' });
        const settings = [
            { name: 'fts_enabled', type: 'trigger', default: defaultSettings.enabled, field: { name: 'Включить' } },
            { name: 'fts_anime_mode', type: 'trigger', default: defaultSettings.anime_mode, field: { name: 'Режим аниме' } },
            { name: 'fts_search_both_titles', type: 'trigger', default: defaultSettings.search_both_titles, field: { name: 'Поиск по двум названиям' } },
            { name: 'fts_cascade_voice', type: 'trigger', default: defaultSettings.cascade_voice, field: { name: 'Каскадный поиск озвучки' } },
            { name: 'fts_preload_on_enter', type: 'trigger', default: defaultSettings.preload_on_enter, field: { name: 'Предзагрузка' } },
            { name: 'fts_auto_play', type: 'trigger', default: defaultSettings.auto_play, field: { name: 'Автоматический запуск' } },
            { name: 'fts_save_continue_params', type: 'trigger', default: defaultSettings.save_continue_params, field: { name: 'Сохранение Continue Watch' } },
            { name: 'fts_add_trackers', type: 'trigger', default: defaultSettings.add_trackers, field: { name: 'Добавлять трекеры' } },
            { name: 'fts_quality', type: 'select', values: {'2160': '4K','1440': '1440p','1080': '1080p','720': '720p','480': '480p'}, default: defaultSettings.quality, field: { name: 'Качество' } },
            { name: 'fts_fallback', type: 'trigger', default: defaultSettings.fallback, field: { name: 'Снижать качество' } },
            { name: 'fts_voice_priority', type: 'select', values: {'dubbing': 'Дубляж','multi': 'Многоголосая','single': 'Одноголосая','original': 'Оригинал','any': 'Любая'}, default: defaultSettings.voice_priority, field: { name: 'Озвучка' } },
            { name: 'fts_sort_by', type: 'select', values: {'seeders': 'Сиды','size': 'Размер','date': 'Дата'}, default: defaultSettings.sort_by, field: { name: 'Сортировка' } },
            { name: 'fts_min_seeders', type: 'select', values: {'0': 'Любые','10': '10+','50': '50+','100': '100+'}, default: defaultSettings.min_seeders, field: { name: 'Мин. сидов' } }
        ];
        settings.forEach(s => Lampa.SettingsApi.addParam({ component: PLUGIN_NAME, param: { name: s.name, type: s.type, values: s.values, default: s.default }, field: s.field }));
    }

    function getSettings() {
        if (settingsCache) return settingsCache;
        try {
            settingsCache = {};
            Object.keys(defaultSettings).forEach(key => {
                const val = Lampa.Storage.field('fts_' + key);
                settingsCache[key] = val !== undefined ? val : defaultSettings[key];
                if (key === 'quality' || key === 'min_seeders') settingsCache[key] = parseInt(settingsCache[key]);
            });
            return settingsCache;
        } catch (e) { return defaultSettings; }
    }

    function initContinueWatch() { Lampa.Storage.sync('continue_watch_params', 'object_object'); }
    function saveStreamParams(movie, hash_data, mainFile) {
        if (!getSettings().save_continue_params) return;
        const hash = Lampa.Utils.hash(movie.original_title || movie.title);
        const params = Lampa.Storage.get('continue_watch_params', {});
        params[hash] = { file_name: mainFile.path.split('/').pop(), torrent_link: hash_data.hash, file_index: mainFile.id, path: mainFile.path, title: movie.original_title || movie.title, timestamp: Date.now(), source: 'fast_torrent_start' };
        Lampa.Storage.set('continue_watch_params', params);
    }
    function isAnime(movie) { return (movie.type === 'anime' || movie.media_type === 'anime' || movie.category === 'anime' || (typeof Activity !== 'undefined' && Activity.active()?.type === 'anime')); }
    function addTrackersToMagnet(magnetUri, additionalTrackers) {
        if (!magnetUri) return magnetUri;
        let magnet = magnetUri;
        const separator = magnet.includes('?') ? '&' : '?';
        for (let tracker of additionalTrackers) if (!magnet.includes(encodeURIComponent(tracker))) magnet += `${separator}tr=${encodeURIComponent(tracker)}`;
        return magnet;
    }

    function addButtonStyles() {
        if ($('#fast-torrent-styles').length) return;
        $('head').append(`
            <style id="fast-torrent-styles">
                .button--fast-torrent { background: linear-gradient(45deg, #ff6b35, #f7931e) !important; border-radius: 8px !important; margin-right: 10px !important; transition: all 0.2s; z-index: 99 !important; position: relative; pointer-events: auto !important; }
                .button--fast-torrent:hover { background: linear-gradient(45deg, #ff8b35, #ffa91e) !important; transform: scale(1.05); }
                .button--fast-torrent.button--loading { background: linear-gradient(45deg, #333, #444) !important; opacity: 0.9; pointer-events: none; }
                .button--fast-torrent svg { color: white !important; width: 1.5em; height: 1.5em; pointer-events: none; }
                .button--fast-torrent span { color: white !important; font-weight: bold; pointer-events: none; }
                @keyframes fts-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .fts-loader { animation: fts-spin 1s linear infinite; }
            </style>`);
    }

    function addFastTorrentButton(movie) {
        if (!getSettings().enabled) return;
        if (currentButton) { currentButton.remove(); currentButton = null; }
        const selectors = ['.full-start-new__buttons', '.full-start__buttons', '.full__buttons', '.full-start-new-buttons'];
        let attempts = 0;
        function waitForContainer() {
            let container = null;
            for (let selector of selectors) { if ($(selector).length) { container = $(selector).first(); break; } }
            if (container) renderButton(container, movie);
            else if (attempts < 20) { attempts++; setTimeout(waitForContainer, 100); }
        }
        waitForContainer();
    }

    function renderButton(container, movie) {
        if (container.find('.button--fast-torrent').length) return;
        const button = $(`
            <div class="full-start__button selector button--fast-torrent">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>
                <span>Fast Torrent</span>
            </div>
        `);
        
        button.on('hover:enter click', function(e) {
            if (buttonClickLock) return;
            console.log('[FastTorrentStart] 🖱️ Клик!');
            handleButtonClick(movie);
        });
        
        container.prepend(button);
        currentButton = button;
        currentMovie = movie;
        if (getSettings().preload_on_enter && !movie.number_of_seasons) preloadTorrents(movie);
    }

    function checkQuality(torrent, quality) {
        const title = (torrent.Title || '').toLowerCase();
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
        if (voiceType === 'any') return true;
        const regex = compiledVoiceRegex[voiceType];
        // ИСПРАВЛЕНИЕ: Добавлена защита от null regex
        return regex ? regex.test(torrent.Title || '') : true;
    }

    function findBestTorrent(torrents, settings, isAnimeContent) {
        if (!torrents?.length) return null;
        const qualityLevels = [2160, 1440, 1080, 720, 480];
        let startIndex = qualityLevels.indexOf(settings.quality);
        if (startIndex === -1) startIndex = 2;
        
        // Клонируем, чтобы не ломать исходный массив
        let sortedTorrents = [...torrents].filter(t => t && typeof t === 'object');
        
        if (settings.sort_by === 'seeders') sortedTorrents.sort((a, b) => (b.Seeders || 0) - (a.Seeders || 0));
        else if (settings.sort_by === 'size') sortedTorrents.sort((a, b) => (b.Size || 0) - (a.Size || 0));
        else if (settings.sort_by === 'date') sortedTorrents.sort((a, b) => new Date(b.PublishDate || 0) - new Date(a.PublishDate || 0));
        
        let voicePriorities = settings.cascade_voice ? (voiceCascade[settings.voice_priority] || [settings.voice_priority]) : [settings.voice_priority];
        if (isAnimeContent && settings.anime_mode) { voicePriorities = voicePriorities.filter(v => v !== 'original'); if (!voicePriorities.length) voicePriorities = ['multi']; }
        
        for (let voiceType of voicePriorities) {
            for (let i = startIndex; i < qualityLevels.length; i++) {
                const quality = qualityLevels[i];
                for (let torrent of sortedTorrents) {
                    if (settings.min_seeders > 0 && (torrent.Seeders || 0) < settings.min_seeders) continue;
                    if (checkQuality(torrent, quality) && checkVoiceCategory(torrent, voiceType)) {
                        console.log(`[FastTorrentStart] ✅ Найдено: ${torrent.Title}`);
                        return torrent;
                    }
                }
                if (!settings.fallback) break;
            }
        }
        // Fallback
        return sortedTorrents[0] && (settings.min_seeders === 0 || (sortedTorrents[0].Seeders || 0) >= settings.min_seeders) ? sortedTorrents[0] : null;
    }

    function searchTorrentsWithCascade(movie, callback) {
        const settings = getSettings();
        const searchQueries = [];
        const searchId = Date.now();
        currentSearchId = searchId;
        if (movie.original_title) searchQueries.push({ title: movie.original_title, type: 'original' });
        if (settings.search_both_titles && movie.title && movie.title !== movie.original_title) searchQueries.push({ title: movie.title, type: 'russian' });
        if (searchQueries.length === 0) searchQueries.push({ title: movie.title, type: 'default' });
        let allResults = [];
        let completedSearches = 0;
        const uniqueLinks = new Set();
        searchQueries.forEach(query => {
            Lampa.Parser.get({ movie: { ...movie, title: query.title, original_title: query.title } }, (data) => {
                if (currentSearchId !== searchId) return;
                completedSearches++;
                if (data?.Results?.length) {
                    data.Results.forEach(item => {
                        const key = (item.Link || item.MagnetUri || '').toLowerCase();
                        if (key && !uniqueLinks.has(key)) { uniqueLinks.add(key); allResults.push(item); }
                    });
                }
                if (completedSearches === searchQueries.length) callback(allResults);
            });
        });
    }

    function preloadTorrents(movie) {
        if (movie.number_of_seasons) return;
        if (preloadedTorrents.size > MAX_PRELOAD_CACHE) preloadedTorrents.delete(preloadedTorrents.keys().next().value);
        const movieKey = (movie.original_title || movie.title) + (movie.year ? '_' + movie.year : '');
        if (preloadedTorrents.has(movieKey)) return;
        preloadedTorrents.set(movieKey, { status: 'loading', data: null });
        searchTorrentsWithCascade(movie, (torrents) => {
            if (torrents?.length > 0) {
                const bestTorrent = findBestTorrent(torrents, getSettings(), isAnime(movie));
                if (bestTorrent) {
                    preloadedTorrents.set(movieKey, { status: 'loaded', data: bestTorrent });
                    if (getSettings().auto_play && !movie.auto_played) { movie.auto_played = true; setTimeout(() => handleButtonClick(movie), 800); }
                } else preloadedTorrents.set(movieKey, { status: 'no_torrents', data: null });
            } else preloadedTorrents.set(movieKey, { status: 'no_torrents', data: null });
        });
    }

    function handleButtonClick(movie) {
        console.log('[FastTorrentStart] 🚀 START');
        if (movie.number_of_seasons) {
            setButtonLoading('Сезоны...');
            setTimeout(() => showSeasonSelectorWithoutTorrent(movie), 50);
            return;
        }
        const movieKey = (movie.original_title || movie.title) + (movie.year ? '_' + movie.year : '');
        const preloaded = preloadedTorrents.get(movieKey);
        if (preloaded?.status === 'loaded') processBestTorrentForMovie(movie, preloaded.data);
        else { setButtonLoading('Поиск...'); processQuickSearch(movie); }
    }

    function processQuickSearch(movie) {
        searchTorrentsWithCascade(movie, (torrents) => {
            if (torrents?.length > 0) {
                const bestTorrent = findBestTorrent(torrents, getSettings(), isAnime(movie));
                if (bestTorrent) processBestTorrentForMovie(movie, bestTorrent);
                else { Lampa.Noty.show('Не найдено подходящих раздач'); resetButton(); }
            } else { Lampa.Noty.show('Торренты не найдены'); resetButton(); }
        });
    }

    function showSeasonSelectorWithoutTorrent(movie) {
        let totalSeasons = movie.number_of_seasons || 1;
        if (totalSeasons === 1) { setButtonLoading('Поиск...'); findTorrentForSeason(movie, 1); return; }
        const seasonItems = [];
        for (let i = 1; i <= totalSeasons; i++) seasonItems.push({ title: `Сезон ${i}`, subtitle: `Season ${i}`, season: i });
        Lampa.Select.show({
            title: 'Выберите сезон',
            items: seasonItems,
            onSelect: (item) => {
                Lampa.Controller.toggle('content');
                setButtonLoading('S' + item.season + '...');
                findTorrentForSeason(movie, item.season);
            },
            onBack: () => { Lampa.Controller.toggle('content'); resetButton(); }
        });
        resetButton();
    }

    function findTorrentForSeason(movie, season) {
        setButtonLoading('S' + season + ' Поиск...');
        const isAnimeContent = isAnime(movie);
        searchTorrentsWithCascade(movie, (torrents) => {
            if (!torrents?.length) { Lampa.Noty.show('Торренты не найдены'); resetButton(); return; }
            const settings = getSettings();
            let seasonTorrents;
            if (isAnimeContent && settings.anime_mode) {
                const animePatterns = [ new RegExp(`\\[s0*${season}\\]`, 'i'), new RegExp(`\\(s0*${season}\\)`, 'i'), new RegExp(`season\\s*0*${season}[\\s\\]\\)]`, 'i'), new RegExp(`s0*${season}e\\d+`, 'i'), new RegExp(`\\s${season}\\s+сезон`, 'i'), new RegExp(`сезон\\s+${season}`, 'i') ];
                const isSingleSeason = (season === 1 && (movie.number_of_seasons || 1) === 1);
                seasonTorrents = torrents.filter(torrent => {
                    const title = (torrent.Title || '');
                    if (isSingleSeason) return true;
                    return animePatterns.some(p => p.test(title));
                });
            } else {
                const seasonExtractPatterns = [ /\((\d+)\s+сезон/i, /\((\d+)-й\s+сезон/i, /^[^\d]*сезон:\s*(\d+)/i, /season\s+(\d+)/i ];
                const includePatterns = [ new RegExp(`s0*${season}e\\d+`, 'i'), new RegExp(`\\[s0*${season}\\]`, 'i') ];
                seasonTorrents = torrents.filter(torrent => {
                    const title = (torrent.Title || '');
                    let foundSeason = null;
                    for (let pattern of seasonExtractPatterns) { const match = title.match(pattern); if (match) { foundSeason = parseInt(match[1]); break; } }
                    if (foundSeason !== null) return foundSeason === season;
                    return includePatterns.some(p => p.test(title));
                });
            }
            if (seasonTorrents.length === 0) { Lampa.Noty.show(`Сезон ${season} не найден`); resetButton(); return; }
            const bestTorrent = findBestTorrent(seasonTorrents, settings, isAnimeContent);
            if (bestTorrent) { Lampa.Torrent.start(bestTorrent, movie); resetButton(); }
            else { Lampa.Noty.show(`Подходящий торрент не найден`); resetButton(); }
        });
    }

    function processBestTorrentForMovie(movie, bestTorrent) {
        if (!Lampa.Torserver.url()) { Lampa.Noty.show('TorrServer не настроен'); resetButton(); return; }
        const processId = Date.now();
        currentProcessId = processId;
        setButtonLoading('Добавление...');
        let magnetLink = bestTorrent.Link || bestTorrent.MagnetUri;
        if (getSettings().add_trackers) magnetLink = addTrackersToMagnet(magnetLink, defaultTrackers);
        Lampa.Torserver.hash({ link: magnetLink, title: movie.title, poster: movie.poster_path ? Lampa.Api.img(movie.poster_path) : '' }, (hash_data) => {
            if (currentProcessId !== processId) return;
            setButtonLoading('Файлы...');
            checkFilesViaLampa(hash_data.hash, movie, processId, 1);
        }, () => {
            if (currentProcessId !== processId) return;
            Lampa.Noty.show('Ошибка добавления');
            resetButton();
        });
    }

    function checkFilesViaLampa(hash, movie, processId, attempt) {
        if (currentProcessId !== processId) return;
        if (typeof Lampa.Activity !== 'undefined' && !Lampa.Activity.active()) return;
        if (typeof Lampa.Torserver.files !== 'function') { Lampa.Noty.show('Err: API'); resetButton(); return; }
        Lampa.Torserver.files(hash, (files_data) => {
            if (currentProcessId !== processId) return;
            let files = null;
            if (Array.isArray(files_data)) files = files_data;
            else if (files_data?.file_stats) files = files_data.file_stats;
            else if (files_data?.files) files = files_data.files;
            if (files && files.length > 0) launchPlayer(movie, { hash: hash }, files);
            else if (attempt < 12) setTimeout(() => checkFilesViaLampa(hash, movie, processId, attempt + 1), 1500);
            else { Lampa.Noty.show('Нет файлов'); resetButton(); }
        }, () => {
             if (currentProcessId !== processId) return;
             if (attempt < 12) setTimeout(() => checkFilesViaLampa(hash, movie, processId, attempt + 1), 1500);
             else { Lampa.Noty.show('Ошибка получения файлов'); resetButton(); }
        });
    }

    function launchPlayer(movie, hash_data, files) {
        try {
            const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'm2ts'];
            const videoFiles = files.filter(f => f && f.path && videoExts.includes(f.path.split('.').pop().toLowerCase()));
            if (!videoFiles.length) { Lampa.Noty.show('Видео не найдено'); resetButton(); return; }
            videoFiles.sort((a, b) => (b.length || 0) - (a.length || 0));
            const mainFile = videoFiles[0];
            
            const subExts = ['srt', 'vtt', 'ass'];
            const subtitles = files.filter(f => f && f.path && subExts.includes(f.path.split('.').pop().toLowerCase())).map(f => ({ label: f.path.split('/').pop(), url: Lampa.Torserver.stream(f.path, hash_data.hash, f.id) }));
            
            const streamUrl = Lampa.Torserver.stream(mainFile.path, hash_data.hash, mainFile.id);
            const hash = Lampa.Utils.hash(movie.original_title || movie.title);
            const view = Lampa.Timeline.view(hash);
            
            const playerData = { url: streamUrl, title: movie.title || movie.name, card: movie, torrent_hash: hash_data.hash, timeline: view, subtitles: subtitles };
            
            if (movie.id) Lampa.Favorite.add('history', movie, 100);
            saveStreamParams(movie, hash_data, mainFile);
            
            resetButton();
            
            // ИСПРАВЛЕНИЕ: Запускаем только play, без playlist
            Lampa.Player.play(playerData);
            
            console.log('[FastTorrentStart] ✅ Запуск плеера');
        } catch (error) { console.error('[FastTorrentStart] ❌', error); Lampa.Noty.show('Ошибка запуска'); resetButton(); }
    }

    function setButtonLoading(text) {
        buttonClickLock = true;
        if (currentButton) {
            currentButton.addClass('button--loading');
            currentButton.find('svg').replaceWith(`<svg class="fts-loader" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 4V2C6.48 2 2 6.48 2 12H4C4 7.58 7.58 4 12 4Z" fill="currentColor"/></svg>`);
            currentButton.find('span').text(text || 'Загрузка...');
        }
    }

    function resetButton() {
        buttonClickLock = false;
        currentProcessId = null;
        if (currentButton) {
            currentButton.removeClass('button--loading');
            currentButton.find('svg').replaceWith(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>`);
            currentButton.find('span').text('Fast Torrent');
        }
    }

    function startPlugin() {
        if (!window.Lampa || !Lampa.Parser || !Lampa.Torrent || !Lampa.Listener || !Lampa.Torserver) { setTimeout(startPlugin, 100); return; }
        try {
            addButtonStyles();
            compileVoiceRegex();
            initContinueWatch();
            initSettings();
            
            Lampa.Listener.follow('full', function(e) { 
                if (e.type === 'complite' && e.data?.movie) addFastTorrentButton(e.data.movie); 
            });
            
            if (Lampa.Activity.active() && Lampa.Activity.active().component === 'full') {
                const activity = Lampa.Activity.active();
                if (activity.activity && activity.activity.movie) addFastTorrentButton(activity.activity.movie);
            }

            const cleanup = () => { currentProcessId = null; if (currentButton) { currentButton.remove(); currentButton = null; } resetButton(); currentMovie = null; };
            Lampa.Activity.listener.follow('backward', cleanup);
            Lampa.Listener.follow('clear', cleanup);
            console.log('[FastTorrentStart] 🎉 Ready');
        } catch (error) { console.error('[FastTorrentStart] ❌ Init Error:', error); }
    }

    if (window.Lampa) startPlugin();
    else window.addEventListener('lampa-loaded', startPlugin);

})();
