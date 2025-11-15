// Lampa.Plugin - Continue Watch v5.9 (Stable PC/NW.js Support)
(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" v5.9');
        console.log('[ContinueWatch] ========================================');

        var currentHash = null;
        var activeButtons = {};

        // ========== КОРРЕКТНАЯ НАСТРОЙКА NW.JS ==========
        function setupNWjsSupport() {
            // Проверяем NW.js платформу
            if (!Lampa.Platform.is('nw')) {
                console.log('[ContinueWatch] 💻 Не NW.js платформа, пропускаем настройку');
                return;
            }

            if (typeof nw === 'undefined') {
                console.log('[ContinueWatch] ⚠️ NW.js API недоступно');
                return;
            }

            console.log('[ContinueWatch] 🔧 Настраиваем NW.js поддержку');

            try {
                // Получаем настройки пользователя
                var torrserver_url = Lampa.Storage.get('torrserver_url');
                var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
                
                var domains = [];
                if (torrserver_url) domains.push(torrserver_url);
                if (torrserver_url_two) domains.push(torrserver_url_two);

                // Добавляем домены в whitelist
                domains.forEach(function(url) {
                    if (url && url.trim()) {
                        try {
                            // Нормализуем URL
                            var normalizedUrl = url.match(/^https?:\/\//) ? url : 'http://' + url;
                            var urlObj = new URL(normalizedUrl);
                            
                            // Добавляем в whitelist NW.js
                            nw.App.addOriginAccessWhitelistEntry(
                                urlObj.origin,
                                'app', 
                                nw.App.manifest.name || 'lampa',
                                true
                            );
                            console.log('[ContinueWatch] ✅ NW.js whitelist:', urlObj.origin);
                        } catch(e) {
                            console.error('[ContinueWatch] ❌ Ошибка добавления в whitelist:', url, e);
                        }
                    }
                });
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка настройки NW.js:', e);
            }
        }

        // ========== УТИЛИТЫ (без изменений из v5.6) ==========
          
        function formatTime(seconds) {
            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);
            if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        function extractFileName(url) {
            var match = url.match(/\/stream\/([^?]+)/);
            if (match) {
                try {
                    return decodeURIComponent(match[1]);
                } catch(e) {
                    return match[1];
                }
            }
            return null;
        }

        function extractTorrentLink(url) {
            var match = url.match(/[?&]link=([^&]+)/);
            return match ? match[1] : null;
        }

        function extractFileIndex(url) {
            var match = url.match(/[?&]index=(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }

        function extractStreamParamsFromData(data) {
            console.log('[ContinueWatch] 🔍 Извлечение параметров из data:', data);
            
            var params = {
                file_name: null,
                torrent_link: null,
                file_index: 0,
                path: null,
                title: data.title || 'Unknown'
            };

            // Пытаемся получить параметры из различных источников
            if (data.torrent_hash && data.path) {
                // Случай 1: Прямые параметры торрента
                params.torrent_link = data.torrent_hash;
                params.path = data.path;
                params.file_name = data.path.split(/[\\\/]/).pop();
                params.file_index = data.id || data.file_id || 0;
                console.log('[ContinueWatch] ✅ Параметры извлечены из data.torrent_hash/data.path');
            }
            else if (data.url) {
                // Случай 2: Из URL
                params.file_name = extractFileName(data.url);
                params.torrent_link = extractTorrentLink(data.url);
                params.file_index = extractFileIndex(data.url);
                console.log('[ContinueWatch] ✅ Параметры извлечены из data.url');
            }
            else if (data.material_data && data.material_data.torrent_hash) {
                // Случай 3: Из material_data
                params.torrent_link = data.material_data.torrent_hash;
                params.path = data.material_data.path;
                params.file_name = data.material_data.path ? data.material_data.path.split(/[\\\/]/).pop() : null;
                params.file_index = data.material_data.id || data.material_data.file_id || 0;
                console.log('[ContinueWatch] ✅ Параметры извлечены из data.material_data');
            }

            // Дополнительная информация
            if (data.season) params.season = data.season;
            if (data.episode) params.episode = data.episode;
            if (data.card) {
                params.title = data.card.title || data.card.name || params.title;
            }

            console.log('[ContinueWatch] 📋 Итоговые параметры:', params);
            return params;
        }

        function buildStreamUrl(params) {
            console.log('[ContinueWatch] 🛠️ Сборка URL из параметров:', params);
            
            // ✅ ПРАВИЛЬНО: Используем настройки пользователя
            var torrserver_url = Lampa.Storage.get('torrserver_url');
            var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
            
            var server_url = Lampa.Storage.field('torrserver_use_link') == 'two' 
                ? (torrserver_url_two || torrserver_url) 
                : (torrserver_url || torrserver_url_two);
            
            if (!server_url) {
                console.error('[ContinueWatch] ❌ TorrServer URL не настроен!');
                return null;
            }
            
            if (!server_url.match(/^https?:\/\//)) {
                server_url = 'http://' + server_url;
            }
            
            // Используем file_name если есть, иначе из path
            var fileName = params.file_name;
            if (!fileName && params.path) {
                fileName = params.path.split(/[\\\/]/).pop();
                console.log('[ContinueWatch] 🔄 Извлекли file_name из path:', fileName);
            }
            
            if (!fileName) {
                console.error('[ContinueWatch] ❌ Не удалось определить file_name');
                return null;
            }
            
            var encodedFileName = encodeURIComponent(fileName);
            var playMode = Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play';
            
            var url = server_url + '/stream/' + encodedFileName;
            var urlParams = [];
            if (params.torrent_link) urlParams.push('link=' + params.torrent_link);
            urlParams.push('index=' + params.file_index);
            urlParams.push(playMode);
            
            url += '?' + urlParams.join('&');
            
            console.log('[ContinueWatch] ✅ Собранный URL:', url);
            return url;
        }

        function checkTorrentAvailability(torrent_link, onSuccess, onError) {
            if (typeof Lampa.Torserver === 'undefined' || typeof Lampa.Torserver.cache !== 'function') {
                console.log('[ContinueWatch] ⚠️ Torserver.cache недоступен, пропускаем проверку');
                onSuccess();
                return;
            }
            
            console.log('[ContinueWatch] 🔍 Проверка доступности торрента...');
            
            // ✅ УЛУЧШЕНО: Добавляем таймаут для проверки
            var timeoutId = setTimeout(function() {
                console.log('[ContinueWatch] ⏰ Таймаут проверки торрента, считаем доступным');
                onSuccess();
            }, 3000); // 3 секунды таймаут
            
            Lampa.Torserver.cache(
                torrent_link,
                function(json) {
                    clearTimeout(timeoutId);
                    console.log('[ContinueWatch] ✅ Торрент найден в кэше');
                    onSuccess();
                },
                function() {
                    clearTimeout(timeoutId);
                    console.log('[ContinueWatch] ⚠️ Торрент не найден в кэше, но пытаемся запустить');
                    // ✅ ИЗМЕНЕНИЕ: Вместо ошибки сразу пробуем запустить
                    onSuccess();
                }
            );
        }

        function launchPlayer(url, currentSavedParams, currentView, currentData) {
            var playerData = {
                url: url,
                title: currentSavedParams.stream_params.title,
                timeline: currentView,
                card: currentData.movie,
                continue_play: true,
                torrent_hash: currentSavedParams.stream_params.torrent_link
            };
            
            // Сохраняем дополнительные параметры для будущего использования
            if (currentSavedParams.stream_params.path) {
                playerData.path = currentSavedParams.stream_params.path;
                playerData.file_id = currentSavedParams.stream_params.file_index;
            }
            
            // Обновляем Timeline перед запуском
            if (currentView.hash) {
                Lampa.Timeline.update({
                    hash: currentView.hash,
                    percent: currentView.percent,
                    time: currentView.time,
                    duration: currentView.duration
                });
                console.log('[ContinueWatch] 💾 Timeline обновлен перед запуском:', currentView.percent + '%');
            }
            
            console.log('[ContinueWatch] 🎬 Запуск плеера:', currentView.percent + '%,', currentView.time, 'сек');
            
            // ✅ УЛУЧШЕНО: Показываем уведомление о запуске
            Lampa.Noty.show('Запуск просмотра...');
            
            try {
                if (Lampa.Platform.is('android') || Lampa.Platform.is('webos')) {
                    playerData.position = currentView.time || -1;
                    
                    console.log('[ContinueWatch] 📱 Попытка запуска внешнего плеера...');
                    
                    if (typeof Lampa.Android !== 'undefined' && typeof Lampa.Android.openPlayer === 'function') {
                        Lampa.Android.openPlayer(url, playerData);
                        console.log('[ContinueWatch] ✅ Запущен Lampa.Android.openPlayer');
                        return;
                    }
                    
                    if (typeof AndroidJS !== 'undefined' && typeof AndroidJS.openPlayer === 'function') {
                        AndroidJS.openPlayer(url, JSON.stringify(playerData));
                        console.log('[ContinueWatch] ✅ Запущен AndroidJS.openPlayer');
                        return;
                    }
                    
                    console.log('[ContinueWatch] ⚠️ Android API недоступен, fallback на встроенный плеер');
                }
                
                console.log('[ContinueWatch] 🖥️ Запуск встроенного плеера');
                Lampa.Player.play(playerData);
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска:', err);
                Lampa.Noty.show('Ошибка запуска: ' + err.message);
                
                // ✅ УЛУЧШЕНО: Предлагаем выбрать другой источник при ошибке
                showSourceReselectDialog(currentData.movie);
            }
        }

        // ========== ДИАЛОГ ВЫБОРА ИСТОЧНИКА ==========
        function showSourceReselectDialog(movie) {
            Lampa.Select.show({
                title: 'Не удалось запустить воспроизведение',
                items: [
                    {
                        title: 'Выбрать другой источник',
                        value: 'reselect'
                    },
                    {
                        title: 'Попробовать ещё раз',
                        value: 'retry'
                    }
                ],
                onSelect: function(item) {
                    if (item.value === 'reselect') {
                        Lampa.Activity.push({
                            url: '',
                            title: movie.title || movie.name,
                            component: 'torrents',
                            movie: movie,
                            page: 1
                        });
                    } else {
                        // Для retry просто закрываем диалог
                        // Пользователь может нажать кнопку ещё раз
                    }
                },
                onBack: function() {}
            });
        }

        function saveUrlParams(hash, data) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                
                if (!viewed[hash]) {
                    viewed[hash] = {
                        duration: 0,
                        time: 0,
                        percent: 0,
                        profile: 0
                    };
                }
                
                // Сохраняем расширенные параметры
                viewed[hash].stream_params = {
                    file_name: data.file_name,
                    torrent_link: data.torrent_link,
                    file_index: data.file_index,
                    path: data.path, // Сохраняем полный путь
                    title: data.title,
                    season: data.season,
                    episode: data.episode,
                    timestamp: Date.now(),
                    source: 'continue_watch_v5.9' // Для отладки
                };
                
                Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                
                console.log('[ContinueWatch] 💾 Параметры сохранены для hash:', hash, viewed[hash].stream_params);
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка сохранения:', e);
            }
        }

        function getUrlParams(hash) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                return viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка чтения:', e);
                return null;
            }
        }

        // ✅ УЛУЧШЕНО: Расширенная диагностика
        function createOrUpdateButton(movie, container) {
            console.log('[ContinueWatch] ========================================');
            console.log('[ContinueWatch] 🔍 ДИАГНОСТИКА СОЗДАНИЯ КНОПКИ');
            
            var title = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title) : 
                (movie.original_title || movie.original_name);
            
            console.log('[ContinueWatch] - Title:', title);
            console.log('[ContinueWatch] - Is series:', !!movie.number_of_seasons);
              
            if (!title) {
                console.log('[ContinueWatch] ❌ Title не найден');
                console.log('[ContinueWatch] - Movie object:', movie);
                return;
            }
              
            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);
            
            console.log('[ContinueWatch] - Hash:', hash);
            console.log('[ContinueWatch] - Timeline:', view);
              
            if (movie.number_of_seasons) {
                var last = Lampa.Storage.get('online_watched_last', '{}');
                if (typeof last === 'string') {
                    try {
                        last = JSON.parse(last);
                    } catch(e) {
                        last = {};
                    }
                }
                
                var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title);
                var filed = last[titleHash];
                
                console.log('[ContinueWatch] - Series titleHash:', titleHash);
                console.log('[ContinueWatch] - Last watched:', filed);
                
                if (filed && filed.season && filed.episode) {
                    hash = Lampa.Utils.hash([
                        filed.season,
                        filed.season > 10 ? ':' : '',
                        filed.episode,
                        movie.original_name || movie.original_title
                    ].join(''));
                    view = Lampa.Timeline.view(hash);
                    console.log('[ContinueWatch] - Episode hash:', hash);
                    console.log('[ContinueWatch] - Episode view:', view);
                }
            }
              
            // ✅ УЛУЧШЕНО: Детальное логирование проверки
            console.log('[ContinueWatch] - Percent:', view.percent);
            console.log('[ContinueWatch] - Условие: percent >= 5 и <= 95');
            
            if (!view.percent || view.percent < 5 || view.percent > 95) {
                console.log('[ContinueWatch] ❌ Прогресс не подходит:', view.percent);
                
                if (activeButtons[hash]) {
                    activeButtons[hash].button.remove();
                    delete activeButtons[hash];
                    console.log('[ContinueWatch] 🗑️ Кнопка удалена');
                }
                
                console.log('[ContinueWatch] ========================================');
                return;
            }
            
            console.log('[ContinueWatch] ✅ Условия выполнены!');
              
            var percent = view.percent;
            var timeStr = formatTime(view.time);
            var savedParams = getUrlParams(hash);
            
            if (activeButtons[hash]) {
                console.log('[ContinueWatch] 🔄 Обновление существующей кнопки');
                var button = activeButtons[hash].button;
                
                button.find('circle').attr('stroke-dasharray', (percent * 65.97 / 100).toFixed(2) + ' 65.97');
                button.find('span').text('Продолжить ' + percent + '%');
                button.find('div').last().text(timeStr);
                
                activeButtons[hash].view = view;
                activeButtons[hash].savedParams = savedParams;
                
                console.log('[ContinueWatch] ========================================');
                return;
            }
            
            console.log('[ContinueWatch] ➕ Создание новой кнопки');
            
            var button = $('<div class="full-start__button selector button--continue-watch" style="position: relative;">' +
                '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
                    '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +
                    '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" ' +
                        'stroke-dasharray="' + (percent * 65.97 / 100).toFixed(2) + ' 65.97" transform="rotate(-90 12 12)"/>' +
                '</svg>' +
                '<span>Продолжить ' + percent + '%</span>' +
                '<div style="position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); font-size: 10px; opacity: 0.7;">' +
                    timeStr +
                '</div>' +
            '</div>');
            
            activeButtons[hash] = {
                button: button,
                movie: movie,
                view: view,
                savedParams: savedParams,
                hash: hash
            };
              
            button.on('hover:enter', function() {
                console.log('[ContinueWatch] 🎬 КНОПКА НАЖАТА');
                
                var currentData = activeButtons[hash];
                if (!currentData) return;
                
                var currentSavedParams = getUrlParams(hash);
                var currentView = Lampa.Timeline.view(hash);
                  
                if (currentSavedParams && currentSavedParams.stream_params) {
                    console.log('[ContinueWatch] 📋 Используем сохраненные параметры:', currentSavedParams.stream_params);
                    
                    var url = buildStreamUrl(currentSavedParams.stream_params);
                    
                    if (!url) {
                        Lampa.Noty.show('TorrServer не настроен');
                        return;
                    }
                    
                    checkTorrentAvailability(
                        currentSavedParams.stream_params.torrent_link,
                        function() {
                            launchPlayer(url, currentSavedParams, currentView, currentData);
                        },
                        function() {
                            Lampa.Select.show({
                                title: 'Торрент не доступен',
                                items: [
                                    {
                                        title: 'Выбрать другой источник',
                                        value: 'reselect'
                                    },
                                    {
                                        title: 'Попробовать запустить',
                                        value: 'try'
                                    }
                                ],
                                onSelect: function(item) {
                                    if (item.value === 'reselect') {
                                        Lampa.Activity.push({
                                            url: '',
                                            title: currentData.movie.title || currentData.movie.name,
                                            component: 'torrents',
                                            movie: currentData.movie,
                                            page: 1
                                        });
                                    } else {
                                        launchPlayer(url, currentSavedParams, currentView, currentData);
                                    }
                                },
                                onBack: function() {}
                            });
                        }
                    );
                    
                } else {
                    console.log('[ContinueWatch] ⚠️ Сохраненных параметров нет, открываем выбор источника');
                    Lampa.Activity.push({
                        url: '',
                        title: currentData.movie.title || currentData.movie.name,
                        component: 'torrents',
                        movie: currentData.movie,
                        page: 1
                    });
                }
            });
              
            container.prepend(button);
            console.log('[ContinueWatch] ✅ Кнопка добавлена!');
            console.log('[ContinueWatch] ========================================');
        }

        // ========== КРИТИЧЕСКИЙ ПАТЧ: Перехват Player.play() ==========
        function patchPlayerForPlayline() {
            console.log('[ContinueWatch] 🔧 Установка патча Player.play()');
            
            var originalPlay = Lampa.Player.play;
            Lampa.Player.play = function(params) {
                console.log('[ContinueWatch] 📺 Перехват Player.play()', params);
                
                // Сохраняем параметры при первом запуске
                if (params && (params.torrent_hash || params.url)) {
                    console.log('[ContinueWatch] 💾 Обнаружены параметры для сохранения');
                    
                    var hash = null;
                    var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                    
                    // Вычисляем hash через Torserver.parse если доступно
                    if (params.path && typeof Lampa.Torserver !== 'undefined' && Lampa.Torserver.parse && movie) {
                        try {
                            var info = Lampa.Torserver.parse({
                                filename: params.title || 'Unknown',
                                path: params.path,
                                movie: movie
                            });
                            hash = info.hash;
                            console.log('[ContinueWatch] 🔑 Hash из Torserver.parse:', hash);
                        } catch(e) {
                            console.error('[ContinueWatch] ❌ Ошибка Torserver.parse:', e);
                            // Fallback: вычисляем hash вручную
                            hash = computeManualHash(movie, params.season, params.episode);
                        }
                    } else {
                        // Альтернативные методы вычисления hash
                        hash = computeManualHash(movie, params.season, params.episode);
                    }
                    
                    if (hash) {
                        currentHash = hash;
                        
                        var streamParams = extractStreamParamsFromData(params);
                        streamParams.title = params.title || streamParams.title;
                        
                        if (streamParams.file_name && streamParams.torrent_link) {
                            saveUrlParams(hash, streamParams);
                            
                            // ✅ ПРОВЕРКА: убеждаемся что параметры сохранились
                            var saved = getUrlParams(hash);
                            if (saved && saved.stream_params) {
                                console.log('[ContinueWatch] ✅ Параметры сохранены и проверены:', saved.stream_params);
                            } else {
                                console.error('[ContinueWatch] ❌ Параметры не сохранились!');
                            }
                        } else {
                            console.log('[ContinueWatch] ⚠️ Недостаточно параметров для сохранения:', streamParams);
                        }
                    } else {
                        console.log('[ContinueWatch] ❌ Не удалось вычислить hash для сохранения');
                    }
                } else {
                    console.log('[ContinueWatch] 📝 Нет параметров для сохранения');
                }
                
                return originalPlay.call(this, params);
            };
            
            console.log('[ContinueWatch] ✅ Патч Player.play() установлен');
        }

        function computeManualHash(movie, season, episode) {
            if (!movie) {
                console.log('[ContinueWatch] ❌ Нет данных movie для вычисления hash');
                return null;
            }
            
            var hash = null;
            var baseTitle = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title) :
                (movie.original_title || movie.original_name);
            
            if (!baseTitle) {
                console.log('[ContinueWatch] ❌ Не удалось определить baseTitle');
                return null;
            }
            
            if (season && episode) {
                // ✅ ИСПРАВЛЕНО: Правильный формат как в EpisodeParser
                hash = Lampa.Utils.hash([
                    season,
                    season > 10 ? ':' : '', // Разделитель для сезонов > 10
                    episode,
                    baseTitle
                ].join(''));
                console.log('[ContinueWatch] 🔑 Hash вычислен для серии:', season + 'x' + episode, baseTitle);
            } else {
                hash = Lampa.Utils.hash(baseTitle);
                console.log('[ContinueWatch] 🔑 Hash вычислен для фильма:', baseTitle);
            }
            
            return hash;
        }

        // ========== ИНИЦИАЛИЗАЦИЯ И СОБЫТИЯ ==========
        
        // ✅ ПРАВИЛЬНО: Сначала настраиваем NW.js поддержку
        setupNWjsSupport();
        
        // Затем устанавливаем патч плеера
        patchPlayerForPlayline();
        
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
              
            console.log('[ContinueWatch] ======== Событие FULL ========');
              
            setTimeout(function() {
                var movie = e.data.movie;
                var container = e.object.activity.render().find('.full-start-new__buttons');
                
                console.log('[ContinueWatch] Поиск контейнера .full-start-new__buttons:', container.length);
                
                if (!container.length) {
                    container = e.object.activity.render().find('.full-start__buttons');
                    console.log('[ContinueWatch] Поиск .full-start__buttons:', container.length);
                }
                
                if (!container.length) {
                    container = e.object.activity.render().find('.full__buttons');
                    console.log('[ContinueWatch] Поиск .full__buttons:', container.length);
                }
                
                if (!container.length) {
                    container = e.object.activity.render().find('[class*="buttons"]').first();
                    console.log('[ContinueWatch] Поиск [class*="buttons"]:', container.length);
                }
                
                if (!container.length) {
                    console.log('[ContinueWatch] ❌ Контейнер не найден!');
                    // ✅ НОВОЕ: Показываем все классы для диагностики
                    var allClasses = [];
                    e.object.activity.render().find('[class]').each(function() {
                        var cls = $(this).attr('class');
                        if (cls && allClasses.indexOf(cls) === -1) allClasses.push(cls);
                    });
                    console.log('[ContinueWatch] Доступные классы:', allClasses.slice(0, 20));
                    return;
                }
                
                console.log('[ContinueWatch] ✅ Контейнер найден!');
                createOrUpdateButton(movie, container);
                
            }, 100);
        });
        
        Lampa.Timeline.listener.follow('update', function(data) {
            console.log('[ContinueWatch] 📡 Timeline update, hash:', data.hash);
            
            if (data.hash && activeButtons[data.hash]) {
                var buttonData = activeButtons[data.hash];
                var container = buttonData.button.parent();
                
                if (container.length && document.contains(container[0])) {
                    createOrUpdateButton(buttonData.movie, container);
                } else {
                    delete activeButtons[data.hash];
                    console.log('[ContinueWatch] 🗑️ Кнопка удалена (не в DOM)');
                }
            }
        });
        
        Lampa.Activity.listener.follow('backward', function() {
            console.log('[ContinueWatch] 🧹 Очистка');
            activeButtons = {};
        });
        
        // Команда для диагностики Timeline
        window.ContinueWatchDebug = function() {
            var timeline = Lampa.Storage.get(Lampa.Timeline.filename(), {});
            console.log('========== TIMELINE DEBUG ==========');
            console.log('Timeline data:', timeline);
            console.log('Keys count:', Object.keys(timeline).length);
            Object.keys(timeline).forEach(function(hash) {
                var item = timeline[hash];
                console.log('Hash:', hash);
                console.log('  Percent:', item.percent);
                console.log('  Time:', item.time);
                console.log('  Params:', item.stream_params);
            });
            console.log('====================================');
        };
        
        console.log('[ContinueWatch] 💡 Для диагностики выполните: ContinueWatchDebug()');
        console.log('[ContinueWatch] 🚀 Плагин успешно загружен v5.9 с корректной поддержкой PC/NW.js');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
