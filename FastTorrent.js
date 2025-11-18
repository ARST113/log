// plugins/fast_torrent_start/index.js
(function() {
    'use strict';

    console.log('[FastTorrentStart] 🔧 Плагин загружается...');

    // ========== КОНФИГУРАЦИЯ ==========
    const PLUGIN_NAME = 'fast_torrent_start';
    const defaultSettings = {
        enabled: true,
        quality: '1080',
        fallback: true,
        voice_priority: 'dubbing',
        min_seeders: '10',
        auto_play: false,
        preload_on_enter: true,
        save_continue_params: true
    };

    // Система категорий озвучки
    const voiceCategories = {
        'dubbing': {
            name: 'Дубляж',
            keywords: ['дублирован', 'дубляж', 'dub', 'dubbed', 'липсинк', 'dubline', 'дб'],
        },
        'multi': {
            name: 'Многоголосая', 
            keywords: ['многоголос', 'multi', 'multivoice', 'закадров', 'за кадром'],
        },
        'single': {
            name: 'Одноголосая',
            keywords: ['одноголос', 'single', 'голос', 'one voice', 'читает'],
        },
        'original': {
            name: 'Оригинал',
            keywords: ['оригинал', 'original', 'eng', 'en.', 'англ'],
        },
        'any': {
            name: 'Любая',
            keywords: [],
        }
    };

    // ========== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==========
    let currentButton = null;
    let currentMovie = null;
    let buttonClickLock = false;
    let preloadedTorrents = new Map();
    let currentProcessId = null;

    // ========== СИСТЕМА НАСТРОЕК ==========
    function initSettings() {
        if (!Lampa.SettingsApi) {
            console.error('[FastTorrentStart] SettingsApi не доступен');
            return;
        }

        console.log('[FastTorrentStart] ⚙️ Инициализация настроек');
        
        Lampa.SettingsApi.addComponent({
            component: PLUGIN_NAME,
            name: 'Быстрый старт торрентов',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/></svg>'
        });

        const settings = [
            {
                name: 'fts_enabled',
                type: 'trigger',
                default: defaultSettings.enabled,
                field: {
                    name: 'Включить быстрый старт',
                    description: 'Активировать плагин автоматического запуска торрентов'
                }
            },
            {
                name: 'fts_preload_on_enter', 
                type: 'trigger',
                default: defaultSettings.preload_on_enter,
                field: {
                    name: 'Предзагрузка торрентов',
                    description: 'Автоматически начинать поиск торрентов при входе в карточку'
                }
            },
            {
                name: 'fts_auto_play',
                type: 'trigger', 
                default: defaultSettings.auto_play,
                field: {
                    name: 'Автоматический запуск',
                    description: 'Автоматически запускать торрент при открытии карточки'
                }
            },
            {
                name: 'fts_save_continue_params',
                type: 'trigger',
                default: defaultSettings.save_continue_params,
                field: {
                    name: 'Сохранение для Continue Watch',
                    description: 'Сохранять параметры потока для продолжения просмотра'
                }
            },
            {
                name: 'fts_quality',
                type: 'select',
                values: {
                    '2160': '4K (2160p)',
                    '1440': '1440p', 
                    '1080': '1080p (Full HD)',
                    '720': '720p (HD)',
                    '480': '480p'
                },
                default: defaultSettings.quality,
                field: {
                    name: 'Качество видео',
                    description: 'Предпочитаемое качество для автозапуска'
                }
            },
            {
                name: 'fts_fallback',
                type: 'trigger',
                default: defaultSettings.fallback,
                field: {
                    name: 'Автоматический поиск в низком качестве',
                    description: 'Искать в меньшем качестве, если выбранное недоступно'
                }
            },
            {
                name: 'fts_voice_priority',
                type: 'select',
                values: {
                    'dubbing': '🎭 Дубляж (студийный)',
                    'multi': '👥 Многоголосая', 
                    'single': '🎤 Одноголосая',
                    'original': '🌍 Оригинал',
                    'any': '🔓 Любая озвучка'
                },
                default: defaultSettings.voice_priority,
                field: {
                    name: 'Тип озвучки',
                    description: 'Предпочитаемый тип озвучки для автоматического выбора'
                }
            },
            {
                name: 'fts_min_seeders',
                type: 'select',
                values: {
                    '0': 'Любые',
                    '10': '10+ сидов',
                    '50': '50+ сидов', 
                    '100': '100+ сидов',
                    '500': '500+ сидов'
                },
                default: defaultSettings.min_seeders,
                field: {
                    name: 'Минимальное количество сидов',
                    description: 'Фильтровать торренты по количеству сидов'
                }
            }
        ];

        settings.forEach(setting => {
            Lampa.SettingsApi.addParam({
                component: PLUGIN_NAME,
                param: {
                    name: setting.name,
                    type: setting.type,
                    values: setting.values,
                    default: setting.default
                },
                field: setting.field
            });
        });

        console.log('[FastTorrentStart] ✅ Настройки инициализированы');
    }

    function getSettings() {
        try {
            return {
                enabled: Lampa.Storage.field('fts_enabled') !== false,
                quality: parseInt(Lampa.Storage.field('fts_quality')) || 1080,
                fallback: Lampa.Storage.field('fts_fallback') !== false,
                voice_priority: Lampa.Storage.field('fts_voice_priority') || 'dubbing',
                min_seeders: parseInt(Lampa.Storage.field('fts_min_seeders')) || 10,
                auto_play: Lampa.Storage.field('fts_auto_play') === true,
                preload_on_enter: Lampa.Storage.field('fts_preload_on_enter') !== false,
                save_continue_params: Lampa.Storage.field('fts_save_continue_params') !== false
            };
        } catch (error) {
            console.error('[FastTorrentStart] Ошибка получения настроек:', error);
            return defaultSettings;
        }
    }

    // ========== СИСТЕМА CONTINUE WATCH ==========
    function initContinueWatch() {
        Lampa.Storage.sync('continue_watch_params', 'object_object');
        console.log('[FastTorrentStart] 🔄 Зарегистрирована синхронизация CUB для continue_watch_params');
    }

    function saveStreamParams(movie, hash_data, mainFile) {
        try {
            const settings = getSettings();
            if (!settings.save_continue_params) return;

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
            console.log('[FastTorrentStart] 💾 Сохранены параметры потока для hash:', hash);
        } catch (error) {
            console.error('[FastTorrentStart] Ошибка сохранения параметров:', error);
        }
    }

    // ========== СИСТЕМА КНОПКИ ==========
    function addButtonStyles() {
        if ($('#fast-torrent-styles').length) return;

        const styles = `
            <style id="fast-torrent-styles">
                .button--fast-torrent {
                    background: linear-gradient(45deg, #ff6b35, #f7931e) !important;
                    border-radius: 8px !important;
                    margin-right: 10px !important;
                }
                .button--fast-torrent:hover {
                    background: linear-gradient(45deg, #ff8b35, #ffa91e) !important;
                    transform: scale(1.05);
                }
                .button--fast-torrent.button--active {
                    background: linear-gradient(45deg, #e55a2b, #e5821a) !important;
                }
                .button--fast-torrent .full-start__button-icon {
                    color: white !important;
                }
                .button--fast-torrent span {
                    color: white !important;
                    font-weight: bold;
                }
            </style>
        `;

        $('head').append(styles);
    }

    function addFastTorrentButton(movie) {
        console.log('[FastTorrentStart] 🎯 Попытка добавления кнопки для:', movie.title);

        if (currentButton) {
            currentButton.remove();
            currentButton = null;
        }

        const settings = getSettings();
        if (!settings.enabled) return;

        setTimeout(() => {
            try {
                let container = null;
                const selectors = [
                    '.full-start-new__buttons',
                    '.full-start__buttons', 
                    '.full__buttons',
                    '.full-start-new-buttons',
                    '.full-start-buttons',
                    '.full-buttons'
                ];

                for (let selector of selectors) {
                    container = $(selector).first();
                    if (container.length) {
                        console.log(`[FastTorrentStart] ✅ Найден контейнер: ${selector}`);
                        break;
                    }
                }

                if (!container || !container.length) return;
                if (container.find('.button--fast-torrent').length) return;

                const button = $(`
                    <div class="full-start__button selector button--fast-torrent">
                        <div class="full-start__button-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/>
                            </svg>
                        </div>
                        <span>Fast Torrent</span>
                    </div>
                `);

                button.on('hover:enter', function() {
                    console.log('[FastTorrentStart] 🎯 Кнопка нажата');
                    if (movie && !buttonClickLock) {
                        handleButtonClick(movie);
                    }
                });

                addButtonStyles();
                container.prepend(button);
                currentButton = button;
                currentMovie = movie;

                console.log('[FastTorrentStart] ✅ Кнопка успешно добавлена');

                if (settings.preload_on_enter) {
                    console.log('[FastTorrentStart] 🔍 Запуск предзагрузки торрентов');
                    preloadTorrents(movie);
                }

            } catch (error) {
                console.error('[FastTorrentStart] ❌ Ошибка добавления кнопки:', error);
            }
        }, 300);
    }

    function resetButton() {
        buttonClickLock = false;
        currentProcessId = null;
        if (currentButton) {
            currentButton.removeClass('button--active');
            currentButton.find('span').text('Fast Torrent');
        }
        console.log('[FastTorrentStart] 🔄 Кнопка сброшена');
    }

    function setButtonLoading(text) {
        buttonClickLock = true;
        if (currentButton) {
            currentButton.addClass('button--active');
            currentButton.find('span').text(text);
        }
    }

    // ========== УЛУЧШЕННАЯ ФИЛЬТРАЦИЯ ТОРРЕНТОВ ==========
    function checkQuality(torrent, quality) {
        try {
            const title = (torrent.Title || '').toLowerCase();
            
            switch (quality) {
                case 2160: return title.includes('2160') || title.includes('4k') || title.includes('uhd');
                case 1440: return title.includes('1440') || title.includes('2k');
                case 1080: return title.includes('1080') || title.includes('fullhd') || title.includes('fhd');
                case 720: return title.includes('720') || title.includes('hd');
                case 480: return title.includes('480') || title.includes('sd');
                default: return true;
            }
        } catch (error) {
            return false;
        }
    }

    function checkVoiceCategory(torrent, voiceType) {
        try {
            if (voiceType === 'any') return true;
            
            const title = (torrent.Title || '').toLowerCase();
            const category = voiceCategories[voiceType];
            if (!category) return true;
            
            for (let keyword of category.keywords) {
                if (title.includes(keyword)) return true;
            }
            
            return false;
        } catch (error) {
            return true;
        }
    }

    function findBestTorrent(torrents, settings) {
        try {
            if (!torrents?.length) return null;

            const qualityLevels = [2160, 1440, 1080, 720, 480];
            let startIndex = qualityLevels.indexOf(settings.quality);
            if (startIndex === -1) startIndex = 2;

            const sortedBySeeders = torrents
                .filter(t => t && typeof t === 'object')
                .sort((a, b) => (b.Seeders || 0) - (a.Seeders || 0));

            for (let i = startIndex; i < qualityLevels.length; i++) {
                const quality = qualityLevels[i];
                
                for (let torrent of sortedBySeeders) {
                    if (settings.min_seeders > 0 && (torrent.Seeders || 0) < settings.min_seeders) continue;
                    
                    const hasQuality = checkQuality(torrent, quality);
                    const hasVoice = checkVoiceCategory(torrent, settings.voice_priority);
                    
                    if (hasQuality && hasVoice) {
                        console.log(`[FastTorrentStart] 🎯 Найден идеальный торрент: ${quality}p, ${torrent.Seeders} сидов`);
                        return torrent;
                    }
                }

                if (settings.fallback) {
                    for (let torrent of sortedBySeeders) {
                        if (settings.min_seeders > 0 && (torrent.Seeders || 0) < settings.min_seeders) continue;
                        
                        if (checkQuality(torrent, quality)) {
                            console.log(`[FastTorrentStart] 🔄 Найден торрент с качеством ${quality}p (любая озвучка)`);
                            return torrent;
                        }
                    }
                }

                if (!settings.fallback) break;
            }

            const bestSeeder = sortedBySeeders[0];
            if (bestSeeder && (settings.min_seeders === 0 || (bestSeeder.Seeders || 0) >= settings.min_seeders)) {
                console.log(`[FastTorrentStart] 📡 Возвращаем самый раздаваемый: ${bestSeeder.Seeders} сидов`);
                return bestSeeder;
            }

            return null;

        } catch (error) {
            console.error('[FastTorrentStart] Ошибка поиска торрента:', error);
            return torrents?.[0] || null;
        }
    }

    // ========== ПРЕДЗАГРУЗКА ТОРРЕНТОВ ==========
    function preloadTorrents(movie) {
        const movieKey = (movie.original_title || movie.title) + (movie.year ? '_' + movie.year : '');
        
        if (preloadedTorrents.has(movieKey)) return;

        console.log('[FastTorrentStart] 🔍 Начинаем предзагрузку торрентов для:', movie.title);
        preloadedTorrents.set(movieKey, { status: 'loading', data: null });

        Lampa.Parser.get({movie: movie}, (data) => {
            if (data?.Results?.length > 0) {
                const bestTorrent = findBestTorrent(data.Results, getSettings());
                if (bestTorrent) {
                    preloadedTorrents.set(movieKey, { 
                        status: 'loaded', 
                        data: bestTorrent,
                        timestamp: Date.now()
                    });
                    console.log('[FastTorrentStart] ✅ Предзагрузка завершена');

                    const settings = getSettings();
                    if (settings.auto_play && !movie.auto_played) {
                        movie.auto_played = true;
                        console.log('[FastTorrentStart] 🚀 Автозапуск после предзагрузки');
                        setTimeout(() => handleButtonClick(movie), 800);
                    }
                } else {
                    preloadedTorrents.set(movieKey, { status: 'no_torrents', data: null });
                }
            } else {
                preloadedTorrents.set(movieKey, { status: 'no_torrents', data: null });
            }
        });
    }

    function handleButtonClick(movie) {
        if (buttonClickLock) return;

        console.log('[FastTorrentStart] 🎬 Обработка клика для:', movie.title);
        setButtonLoading('Поиск...');

        const movieKey = (movie.original_title || movie.title) + (movie.year ? '_' + movie.year : '');
        const preloaded = preloadedTorrents.get(movieKey);
        
        if (preloaded?.status === 'loaded') {
            console.log('[FastTorrentStart] ⚡ Используем предзагруженный торрент');
            processBestTorrent(movie, preloaded.data);
        } else {
            console.log('[FastTorrentStart] 🔍 Быстрый поиск торрентов');
            processQuickSearch(movie);
        }
    }

    function processQuickSearch(movie) {
        setButtonLoading('Быстрый поиск...');

        Lampa.Parser.get({movie: movie}, (data) => {
            if (data?.Results?.length > 0) {
                const bestTorrent = findBestTorrent(data.Results, getSettings());
                if (bestTorrent) {
                    processBestTorrent(movie, bestTorrent);
                } else {
                    Lampa.Noty.show('Не найдено подходящих раздач');
                    resetButton();
                }
            } else {
                Lampa.Noty.show('Торренты не найдены');
                resetButton();
            }
        });
    }

    // ========== РАБОТА С СЕРИАЛАМИ ==========
    function showSeasonSelector(movie, initialTorrent) {
        console.log('[FastTorrentStart] 📺 Показываем выбор сезона для сериала');
        
        let totalSeasons = movie.number_of_seasons || 1;
        
        if (totalSeasons === 1) {
            console.log('[FastTorrentStart] ℹ️ Один сезон, открываем torrents напрямую');
            launchTorrentsComponent(movie, initialTorrent, 1);
            return;
        }
        
        const seasonItems = [];
        for (let i = 1; i <= totalSeasons; i++) {
            seasonItems.push({
                title: `Сезон ${i}`,
                subtitle: `Season ${i}`,
                season: i
            });
        }
        
        console.log('[FastTorrentStart] 📋 Создано сезонов для выбора:', totalSeasons);
        
        Lampa.Select.show({
            title: 'Выберите сезон',
            items: seasonItems,
            onSelect: (item) => {
                console.log('[FastTorrentStart] ✅ Выбран сезон:', item.season);
                Lampa.Controller.toggle('content');
                
                // Ищем торрент для выбранного сезона
                setButtonLoading('Поиск сезона ' + item.season + '...');
                findTorrentForSeason(movie, item.season);
            },
            onBack: () => {
                console.log('[FastTorrentStart] 🔙 Отмена выбора сезона');
                Lampa.Controller.toggle('content');
                resetButton();
            }
        });
        
        resetButton();
    }

    // ИСПРАВЛЕННАЯ ФУНКЦИЯ с правильной фильтрацией
    function findTorrentForSeason(movie, season) {
        console.log('[FastTorrentStart] 🔍 Ищем торрент для сезона:', season);
        
        Lampa.Parser.get({movie: movie}, (data) => {
            if (!data?.Results?.length) {
                Lampa.Noty.show('Торренты не найдены');
                resetButton();
                return;
            }
            
            console.log('[FastTorrentStart] 📦 Получено торрентов:', data.Results.length);
            
            const settings = getSettings();
            
            // КРИТИЧЕСКИ ВАЖНО: Извлекаем НОМЕР СЕЗОНА из названия торрента
            const seasonTorrents = data.Results.filter(torrent => {
                const title = (torrent.Title || '').toLowerCase();
                
                // Паттерны для извлечения номера сезона из НАЧАЛА названия
                const seasonExtractPatterns = [
                    /\((\d+)\s+сезон/i,                      // (3 сезон
                    /\((\d+)-й\s+сезон/i,                    // (3-й сезон
                    /^[^\d]*сезон:\s*(\d+)/i,                // Сезон: 3
                    /\/\s*сезон:\s*(\d+)/i,                  // / Сезон: 3
                    /season\s+(\d+)/i                         // Season 3
                ];
                
                // Извлекаем номер сезона
                let foundSeason = null;
                for (let pattern of seasonExtractPatterns) {
                    const match = title.match(pattern);
                    if (match) {
                        foundSeason = parseInt(match[1]);
                        break;
                    }
                }
                
                // ПРОВЕРЯЕМ: если номер сезона найден И он НЕ РАВЕН искомому - ИСКЛЮЧАЕМ
                if (foundSeason !== null && foundSeason !== season) {
                    console.log(`[FastTorrentStart] ❌ Исключён (сезон ${foundSeason}, нужен ${season}):`, torrent.Title);
                    return false;
                }
                
                // Если не найден номер сезона ИЛИ он совпадает - оставляем
                if (foundSeason === season) {
                    console.log(`[FastTorrentStart] ✅ Подходит (сезон ${season}):`, torrent.Title);
                    return true;
                }
                
                // Для торрентов без явного указания сезона - проверяем доп. паттерны
                const includePatterns = [
                    new RegExp(`s0*${season}e\\d+`, 'i'),                     // S01E01
                    new RegExp(`\\[s0*${season}\\]`, 'i'),                    // [S01]
                    new RegExp(`\\[${season}\\s+сезон\\]`, 'i')               // [1 сезон]
                ];
                
                for (let pattern of includePatterns) {
                    if (pattern.test(title)) {
                        console.log(`[FastTorrentStart] ✅ Подходит (паттерн):`, torrent.Title);
                        return true;
                    }
                }
                
                return false;
            });
            
            console.log('[FastTorrentStart] 📊 Найдено торрентов для сезона', season, ':', seasonTorrents.length);
            
            if (seasonTorrents.length === 0) {
                console.warn('[FastTorrentStart] ⚠️ Не найдено торрентов для сезона', season);
                Lampa.Noty.show(`Торренты для сезона ${season} не найдены`);
                resetButton();
                return;
            }
            
            // Выбираем лучший торрент среди найденных для этого сезона
            const bestTorrent = findBestTorrent(seasonTorrents, settings);
            
            if (bestTorrent) {
                console.log('[FastTorrentStart] ✅ Лучший торрент для сезона', season, ':', bestTorrent.Title);
                launchTorrentsComponent(movie, bestTorrent, season);
            } else {
                Lampa.Noty.show(`Подходящий торрент для сезона ${season} не найден`);
                resetButton();
            }
        });
    }

    // Функция запуска компонента torrents
    function launchTorrentsComponent(movie, bestTorrent, season) {
        console.log('[FastTorrentStart] 🚀 Запуск стандартного компонента torrents');
        console.log('[FastTorrentStart] 📦 Торрент:', bestTorrent.Title);
        console.log('[FastTorrentStart] 📺 Сезон:', season);
        
        // Просто запускаем стандартный компонент Lampa - он сам всё отфильтрует!
        Lampa.Torrent.start(bestTorrent, movie);
        
        resetButton();
    }

    // ========== ОБРАБОТКА ТОРРЕНТОВ ДЛЯ ФИЛЬМОВ И СЕРИАЛОВ ==========
    function processBestTorrent(movie, bestTorrent) {
        console.log('[FastTorrentStart] ✅ Найден лучший торрент:', bestTorrent.Title);
        console.log('[FastTorrentStart] 🎬 Тип контента:', movie.number_of_seasons ? 'Сериал' : 'Фильм');
        
        // Для сериалов - показываем выбор сезона
        if (movie.number_of_seasons) {
            console.log('[FastTorrentStart] 📺 Сериал - показываем выбор сезона');
            setButtonLoading('Выбор сезона...');
            
            setTimeout(() => {
                showSeasonSelector(movie, bestTorrent);
            }, 300);
            
            return;
        }
        
        // ДЛЯ ФИЛЬМОВ - прямой запуск
        console.log('[FastTorrentStart] 🎬 Фильм - быстрый запуск');
        
        if (!Lampa.Torserver.url()) {
            console.error('[FastTorrentStart] ❌ TorrServer не настроен');
            Lampa.Noty.show('TorrServer не настроен');
            resetButton();
            return;
        }
        
        const processId = Date.now();
        currentProcessId = processId;
        
        setButtonLoading('Добавление...');
        
        console.log('[FastTorrentStart] 🔗 Добавляем торрент:', bestTorrent.Link || bestTorrent.MagnetUri);
        
        Lampa.Torserver.hash({
            link: bestTorrent.Link || bestTorrent.MagnetUri,
            title: movie.title,
            poster: movie.poster_path ? Lampa.Api.img(movie.poster_path) : ''
        }, (hash_data) => {
            if (currentProcessId !== processId) {
                console.log('[FastTorrentStart] ⏭️ Процесс отменён');
                return;
            }
            
            console.log('[FastTorrentStart] ✅ Торрент добавлен, hash:', hash_data.hash);
            setButtonLoading('Загрузка файлов...');
            
            const checkFilesDirectly = () => {
                const torrserverUrl = Lampa.Torserver.url();
                const apiUrl = torrserverUrl + '/stream?link=' + hash_data.hash + '&index=0&play';
                
                console.log('[FastTorrentStart] 🔗 Прямой запрос к TorrServer:', apiUrl);
                
                fetch(apiUrl, { method: 'HEAD' })
                    .then(response => {
                        console.log('[FastTorrentStart] ✅ HEAD запрос успешен:', response.status);
                        if (response.ok) {
                            getTorrentListAndLaunch(hash_data.hash, movie, processId);
                        } else {
                            throw new Error('TorrServer не готов');
                        }
                    })
                    .catch(error => {
                        console.log('[FastTorrentStart] ⏳ TorrServer ещё загружает торрент, пробуем через Lampa API...');
                        checkFilesViaLampa(hash_data.hash, movie, processId, 1);
                    });
            };
            
            setTimeout(checkFilesDirectly, 2000);
            
        }, (error) => {
            if (currentProcessId !== processId) return;
            console.error('[FastTorrentStart] ❌ Ошибка добавления торрента:', error);
            Lampa.Noty.show('Ошибка добавления торрента');
            resetButton();
        });
    }

    function getTorrentListAndLaunch(hash, movie, processId) {
        if (currentProcessId !== processId) return;
        
        console.log('[FastTorrentStart] 📋 Получаем список всех торрентов...');
        
        const torrserverUrl = Lampa.Torserver.url();
        
        fetch(torrserverUrl + '/torrents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list' })
        })
        .then(response => response.json())
        .then(data => {
            console.log('[FastTorrentStart] 📦 Получен список торрентов:', data);
            
            const torrent = data.find(t => t.hash.toLowerCase() === hash.toLowerCase());
            
            if (torrent && torrent.file_stats && torrent.file_stats.length > 0) {
                console.log('[FastTorrentStart] ✅ Найден торрент с файлами:', torrent.file_stats.length);
                launchPlayer(movie, { hash: hash }, torrent.file_stats);
            } else {
                console.log('[FastTorrentStart] ⏳ Торрент найден, но файлы ещё не готовы. Пробуем через Lampa...');
                checkFilesViaLampa(hash, movie, processId, 1);
            }
        })
        .catch(error => {
            console.error('[FastTorrentStart] ❌ Ошибка получения списка:', error);
            checkFilesViaLampa(hash, movie, processId, 1);
        });
    }

    function checkFilesViaLampa(hash, movie, processId, attempt) {
        if (currentProcessId !== processId) {
            console.log('[FastTorrentStart] ⏭️ Процесс отменён');
            return;
        }
        
        const maxAttempts = 12;
        
        console.log(`[FastTorrentStart] 🔍 Проверка файлов через Lampa, попытка ${attempt}/${maxAttempts}`);
        
        if (typeof Lampa.Torserver.files !== 'function') {
            console.error('[FastTorrentStart] ❌ Lampa.Torserver.files не существует!');
            Lampa.Noty.show('Ошибка: API TorrServer недоступен');
            resetButton();
            return;
        }
        
        try {
            Lampa.Torserver.files(hash, 
                (files_data) => {
                    if (currentProcessId !== processId) return;
                    
                    console.log('[FastTorrentStart] 📦 SUCCESS callback вызван');
                    
                    let files = null;
                    
                    if (Array.isArray(files_data)) {
                        files = files_data;
                    } else if (files_data?.file_stats) {
                        files = files_data.file_stats;
                    } else if (files_data?.files) {
                        files = files_data.files;
                    } else if (typeof files_data === 'object') {
                        const keys = Object.keys(files_data);
                        if (keys.length > 0 && files_data[keys[0]]?.path) {
                            files = Object.values(files_data);
                        }
                    }
                    
                    if (files && files.length > 0) {
                        console.log('[FastTorrentStart] ✅ Получено файлов:', files.length);
                        launchPlayer(movie, { hash: hash }, files);
                    } else if (attempt < maxAttempts) {
                        console.log('[FastTorrentStart] ⏳ Файлы пустые, повтор через 1.5 сек');
                        setTimeout(() => checkFilesViaLampa(hash, movie, processId, attempt + 1), 1500);
                    } else {
                        console.error('[FastTorrentStart] ❌ Файлы не появились после', maxAttempts, 'попыток');
                        Lampa.Noty.show('Не удалось получить файлы торрента');
                        resetButton();
                    }
                },
                (error) => {
                    if (currentProcessId !== processId) return;
                    
                    console.error('[FastTorrentStart] ❌ ERROR callback вызван:', error);
                    
                    if (attempt < maxAttempts) {
                        setTimeout(() => checkFilesViaLampa(hash, movie, processId, attempt + 1), 1500);
                    } else {
                        Lampa.Noty.show('Ошибка получения файлов: превышен лимит попыток');
                        resetButton();
                    }
                }
            );
            
        } catch (e) {
            console.error('[FastTorrentStart] ❌ КРИТИЧЕСКАЯ ОШИБКА при вызове Lampa.Torserver.files:', e);
            
            if (attempt < maxAttempts) {
                setTimeout(() => checkFilesViaLampa(hash, movie, processId, attempt + 1), 1500);
            } else {
                Lampa.Noty.show('Критическая ошибка API');
                resetButton();
            }
        }
    }

    function launchPlayer(movie, hash_data, files) {
        try {
            console.log('[FastTorrentStart] 🎬 Запуск плеера для фильма');
            console.log('[FastTorrentStart] 📁 Количество файлов:', files.length);
            
            const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'm2ts'];
            const videoFiles = files.filter(f => {
                if (!f || !f.path) return false;
                const ext = f.path.split('.').pop().toLowerCase();
                return videoExts.includes(ext);
            });
            
            if (videoFiles.length === 0) {
                console.error('[FastTorrentStart] ❌ Видеофайлы не найдены');
                Lampa.Noty.show('Видеофайлы не найдены в торренте');
                resetButton();
                return;
            }
            
            videoFiles.sort((a, b) => (b.length || 0) - (a.length || 0));
            const mainFile = videoFiles[0];
            
            console.log('[FastTorrentStart] 🎯 Выбран файл:', mainFile.path);
            console.log('[FastTorrentStart] 📊 Размер:', (mainFile.length / 1024 / 1024 / 1024).toFixed(2), 'GB');
            
            const streamUrl = Lampa.Torserver.stream(mainFile.path, hash_data.hash, mainFile.id);
            const hash = Lampa.Utils.hash(movie.original_title || movie.title);
            const view = Lampa.Timeline.view(hash);
            
            const playerData = {
                url: streamUrl,
                title: movie.title || movie.name,
                card: movie,
                torrent_hash: hash_data.hash,
                timeline: view,
                subtitles: []
            };
            
            if (movie.id) {
                Lampa.Favorite.add('history', movie, 100);
            }
            
            saveStreamParams(movie, hash_data, mainFile);
            
            console.log('[FastTorrentStart] 🚀 Запускаем плеер!');
            
            resetButton();
            
            Lampa.Player.play(playerData);
            Lampa.Player.playlist([playerData]);
            
            console.log('[FastTorrentStart] ✅ Плеер запущен!');
            
        } catch (error) {
            console.error('[FastTorrentStart] ❌ Ошибка в launchPlayer:', error);
            Lampa.Noty.show('Ошибка запуска: ' + error.message);
            resetButton();
        }
    }

    // ========== ИНИЦИАЛИЗАЦИЯ ПЛАГИНА ==========
    function initPlugin() {
        console.log('[FastTorrentStart] 🔧 Инициализация плагина');

        initContinueWatch();

        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite' && e.data?.movie) {
                console.log('[FastTorrentStart] 📨 Получено событие full complite');
                addFastTorrentButton(e.data.movie);
            }
        });

        Lampa.Activity.listener.follow('backward', function() {
            console.log('[FastTorrentStart] 🔙 Очистка при backward');
            currentProcessId = null;
            if (currentButton) {
                currentButton.remove();
                currentButton = null;
            }
            resetButton();
            currentMovie = null;
        });

        Lampa.Listener.follow('clear', function() {
            console.log('[FastTorrentStart] 🔄 Очистка при clear');
            currentProcessId = null;
            if (currentButton) {
                currentButton.remove();
                currentButton = null;
            }
            resetButton();
            currentMovie = null;
        });

        console.log('[FastTorrentStart] ✅ Слушатели установлены');
    }

    function startPlugin() {
        if (!window.Lampa) {
            setTimeout(startPlugin, 100);
            return;
        }

        if (!Lampa.Parser || !Lampa.Torrent || !Lampa.Listener || !Lampa.Torserver) {
            setTimeout(startPlugin, 100);
            return;
        }

        console.log('[FastTorrentStart] ✅ Lampa загружена, запускаем плагин');

        try {
            initSettings();
            initPlugin();
            console.log('[FastTorrentStart] 🎉 Плагин успешно инициализирован');
        } catch (error) {
            console.error('[FastTorrentStart] ❌ Ошибка инициализации плагина:', error);
        }
    }

    // ========== ЗАПУСК ==========
    if (window.Lampa) {
        startPlugin();
    } else {
        window.addEventListener('lampa-loaded', startPlugin);
    }

})();
