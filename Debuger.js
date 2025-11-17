// Lampa.Plugin - Continue Watch v7.5 (Playlist Support + CUB Sync)
(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] 🔧 ВЕРСИЯ 7.5: ПОДДЕРЖКА ПЛЕЙЛИСТОВ И СИНХРОНИЗАЦИЯ CUB');

        var currentButton = null;
        var buttonClickLock = false;

        // ========== РЕГИСТРАЦИЯ СИНХРОНИЗАЦИИ CUB ==========
        Lampa.Storage.sync('continue_watch_params', 'object_object');
        console.log('[ContinueWatch] 🔄 Зарегистрирована синхронизация CUB для continue_watch_params');

        // ========== ОБРАБОТЧИКИ КНОПКИ ==========
        function setupButtonHandler(button, movie) {
            console.log('[ContinueWatch] 🔧 Настройка обработчика');
            
            button.on('hover:enter', function() {
                handleButtonClick(movie);
            });
            
            button.on('click', function(e) {
                console.log('[ContinueWatch] 🖱️ Click событие');
                e.preventDefault();
                e.stopPropagation();
                handleButtonClick(movie);
            });
        }

        function handleButtonClick(movie) {
            if (buttonClickLock) return;
            
            buttonClickLock = true;
            console.log('[ContinueWatch] 🎬 Обработка клика для:', movie.title);
            
            if (currentButton) {
                currentButton.addClass('button--active');
                currentButton.find('span').text('Загрузка...');
            }

            try {
                processButtonClick(movie);
            } catch (error) {
                console.error('[ContinueWatch] ❌ Ошибка:', error);
                Lampa.Noty.show('Ошибка: ' + error.message);
                resetButton();
            }
        }

        function resetButton() {
            setTimeout(function() {
                buttonClickLock = false;
                if (currentButton) {
                    currentButton.removeClass('button--active');
                    currentButton.find('span').text('Продолжить просмотр');
                }
            }, 2000);
        }

        function processButtonClick(movie) {
            console.log('[ContinueWatch] 🔍 Поиск данных для:', movie.title);
            
            var title = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title || movie.name || movie.title) : 
                (movie.original_title || movie.original_name || movie.title || movie.name);
            
            if (!title) {
                Lampa.Noty.show('Ошибка: заголовок не найден');
                resetButton();
                return;
            }
            
            var hash = Lampa.Utils.hash(title);
            console.log('[ContinueWatch] 🔑 Hash:', hash);
            
            // Для сериалов - улучшенная обработка
            if (movie.number_of_seasons) {
                try {
                    var last = Lampa.Storage.get('online_watched_last', '{}');
                    if (typeof last === 'string') last = JSON.parse(last);
                    
                    var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title || title);
                    var filed = last[titleHash];
                    
                    if (filed && filed.season !== undefined && filed.episode !== undefined) {
                        var separator = filed.season > 10 ? ':' : '';
                        var episodeHash = Lampa.Utils.hash([filed.season, separator, filed.episode, title].join(''));
                        hash = episodeHash;
                        console.log('[ContinueWatch] 🔑 Improved episode hash:', hash, 'for S' + filed.season + 'E' + filed.episode);
                    }
                } catch(e) {
                    console.error('[ContinueWatch] ❌ Ошибка сериала:', e);
                }
            }
            
            var savedParams = getUrlParams(hash);
            
            if (savedParams && savedParams.stream_params) {
                console.log('[ContinueWatch] ✅ Параметры найдены!');
                launchPlayer(savedParams.stream_params, movie, hash);
            } else {
                console.log('[ContinueWatch] ❌ Параметры не найдены');
                Lampa.Noty.show('Параметры не найдены');
                
                // Альтернативный поиск
                var alternativeHashes = [
                    Lampa.Utils.hash(title),
                    Lampa.Utils.hash(movie.original_title || title),
                    Lampa.Utils.hash(movie.original_name || title)
                ];
                
                for (var i = 0; i < alternativeHashes.length; i++) {
                    var altParams = getUrlParams(alternativeHashes[i]);
                    if (altParams && altParams.stream_params) {
                        console.log('[ContinueWatch] ✅ Найдено по альтернативному hash');
                        launchPlayer(altParams.stream_params, movie, alternativeHashes[i]);
                        return;
                    }
                }
                
                Lampa.Noty.show('Открываем выбор источника...');
                setTimeout(function() {
                    openTorrentsComponent(movie);
                }, 1000);
                
                resetButton();
            }
        }

        function launchPlayer(streamParams, movie, hash) {
            console.log('[ContinueWatch] 🚀 ЗАПУСК ПЛЕЕРА');
            
            var url = buildStreamUrl(streamParams);
            if (!url) {
                Lampa.Noty.show('Ошибка формирования URL');
                resetButton();
                return;
            }
            
            console.log('[ContinueWatch] 🌐 Final URL:', url);
            
            // Получаем прогресс воспроизведения (синхронизируется через CUB отдельно)
            var view = Lampa.Timeline.view(hash);
            
            // HANDLER ДЛЯ ОБНОВЛЕНИЯ ПРОГРЕССА
            if (view) {
                view.handler = function(percent, time, duration) {
                    console.log('[ContinueWatch] 🔄 Обновление прогресса:', percent + '%, ' + time + 'сек');
                    Lampa.Timeline.update({
                        hash: hash,
                        percent: percent,
                        time: time,
                        duration: duration
                    });
                };
                console.log('[ContinueWatch] ✅ Handler прогресса добавлен');
            }
            
            // ОСНОВНЫЕ ДАННЫЕ ПЛЕЕРА
            var playerData = {
                url: url,
                title: streamParams.title || movie.title,
                card: movie,
                torrent_hash: streamParams.torrent_link,
                timeline: view
            };
            
            // ФОРМИРОВАНИЕ PLAYLIST ДЛЯ СЕРИАЛОВ (с синхронизированными параметрами)
            if (streamParams.season && streamParams.episode) {
                console.log('[ContinueWatch] 📺 Формируем playlist для сериала');
                var playlist = buildSeriesPlaylist(streamParams, movie);
                
                if (playlist && playlist.length > 1) {
                    playerData.playlist = playlist;
                    console.log('[ContinueWatch] ✅ Playlist создан, эпизодов:', playlist.length);
                } else {
                    console.log('[ContinueWatch] ℹ️ Playlist не создан (мало эпизодов)');
                }
            }
            
            if (view && view.percent > 0) {
                console.log('[ContinueWatch] ⏱️ Восстанавливаем позицию:', view.time + 'сек');
            }
            
            console.log('[ContinueWatch] 🎬 Данные плеера:', playerData);
            
            try {
                Lampa.Noty.show('Запуск плеера...');
                
                console.log('[ContinueWatch] ✅ Используем Lampa.Player.play с torrent_hash');
                Lampa.Player.play(playerData);
                
                console.log('[ContinueWatch] ✅ Плеер запущен!');
                resetButton();
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска:', err);
                Lampa.Noty.show('Ошибка: ' + err.message);
                resetButton();
            }
        }

        function buildSeriesPlaylist(currentStreamParams, movie) {
            console.log('[ContinueWatch] 🔄 Сборка playlist для сериала');
            
            var playlist = [];
            // ИСПОЛЬЗУЕМ СИНХРОНИЗИРОВАННОЕ ХРАНИЛИЩЕ
            var params = Lampa.Storage.get('continue_watch_params', {});
            var baseTitle = movie.original_title || movie.original_name;
            
            if (!baseTitle) {
                console.log('[ContinueWatch] ❌ Не удалось определить baseTitle для playlist');
                return playlist;
            }
            
            console.log('[ContinueWatch] 🔍 Поиск эпизодов в синхронизированном хранилище:', Object.keys(params).length, 'записей');
            
            // Получить все сохраненные эпизоды этого сериала из синхронизированного хранилища
            for (var key in params) {
                var item = params[key];
                if (item && 
                    item.season && 
                    item.episode &&
                    item.title === currentStreamParams.title) {
                    
                    var episodeUrl = buildStreamUrl(item);
                    if (!episodeUrl) continue;
                    
                    // Создаем hash для эпизода (такой же как при сохранении)
                    var separator = item.season > 10 ? ':' : '';
                    var episodeHash = Lampa.Utils.hash([
                        item.season,
                        separator,
                        item.episode,
                        baseTitle
                    ].join(''));
                    
                    var episodeView = Lampa.Timeline.view(episodeHash);
                    
                    // Добавляем handler для каждого эпизода в playlist
                    if (episodeView) {
                        episodeView.handler = function(episodeHash) {
                            return function(percent, time, duration) {
                                console.log('[ContinueWatch] 🔄 Обновление прогресса эпизода:', episodeHash, percent + '%');
                                Lampa.Timeline.update({
                                    hash: episodeHash,
                                    percent: percent,
                                    time: time,
                                    duration: duration
                                });
                            };
                        }(episodeHash);
                    }
                    
                    playlist.push({
                        title: 'Сезон ' + item.season + ' / Эпизод ' + item.episode,
                        url: episodeUrl,
                        timeline: episodeView,
                        season: item.season,
                        episode: item.episode
                    });
                    
                    console.log('[ContinueWatch] 📺 Добавлен эпизод S' + item.season + 'E' + item.episode);
                }
            }
            
            // Сортировать по сезону/эпизоду
            if (playlist.length > 0) {
                playlist.sort(function(a, b) {
                    if (a.season !== b.season) {
                        return a.season - b.season;
                    }
                    return a.episode - b.episode;
                });
                
                console.log('[ContinueWatch] 📋 Отсортированный playlist:', playlist.length + ' эпизодов');
            }
            
            return playlist;
        }

        function openTorrentsComponent(movie) {
            console.log('[ContinueWatch] 📺 Открываем компонент torrents');
            
            try {
                Lampa.Activity.push({
                    url: '',
                    title: movie.title || movie.name || 'Выбор источника',
                    component: 'torrents',
                    movie: movie
                });
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка открытия torrents:', e);
                Lampa.Activity.push({
                    url: '',
                    title: movie.title || movie.name,
                    component: 'full',
                    movie: movie
                });
            }
        }

        // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
        function buildStreamUrl(params) {
            if (!params || !params.file_name || !params.torrent_link) {
                console.error('[ContinueWatch] ❌ Недостаточно параметров');
                return null;
            }
            
            var torrserver_url = Lampa.Storage.get('torrserver_url');
            var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
            
            var server_url = Lampa.Storage.field('torrserver_use_link') == 'two' 
                ? (torrserver_url_two || torrserver_url) 
                : (torrserver_url || torrserver_url_two);
            
            if (!server_url) {
                console.error('[ContinueWatch] ❌ TorrServer URL не настроен');
                Lampa.Noty.show('Ошибка: TorrServer не настроен');
                return null;
            }
            
            // Используем оригинальный протокол TorrServer
            if (!server_url.match(/^https?:\/\//)) {
                server_url = 'http://' + server_url;
            }
            
            var encodedFileName = encodeURIComponent(params.file_name);
            var playMode = Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play';
            
            var url = server_url + '/stream/' + encodedFileName;
            var urlParams = [];
            if (params.torrent_link) urlParams.push('link=' + params.torrent_link);
            urlParams.push('index=' + (params.file_index || 0));
            urlParams.push(playMode);
            
            url += '?' + urlParams.join('&');
            
            return url;
        }

        // ========== ФУНКЦИИ ДЛЯ СИНХРОНИЗИРОВАННОГО ХРАНИЛИЩА ==========
        function getUrlParams(hash) {
            if (!hash) return null;
            
            try {
                // ИСПОЛЬЗУЕМ СИНХРОНИЗИРОВАННОЕ ХРАНИЛИЩЕ
                var params = Lampa.Storage.get('continue_watch_params', {});
                var result = params[hash] ? { stream_params: params[hash] } : null;
                console.log('[ContinueWatch] 🔍 Поиск параметров в синхронизированном хранилище:', !!result);
                return result;
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка чтения синхронизированного хранилища:', e);
                return null;
            }
        }

        function saveUrlParams(hash, data) {
            if (!hash || !data) return;
            
            try {
                // ИСПОЛЬЗУЕМ СИНХРОНИЗИРОВАННОЕ ХРАНИЛИЩЕ
                var params = Lampa.Storage.get('continue_watch_params', {});
                
                params[hash] = {
                    file_name: data.file_name,
                    torrent_link: data.torrent_link,
                    file_index: data.file_index,
                    path: data.path,
                    title: data.title,
                    season: data.season,
                    episode: data.episode,
                    timestamp: Date.now(),
                    source: 'continue_watch_v7.5_cub'
                };
                
                // СОХРАНЕНИЕ С АВТОМАТИЧЕСКОЙ СИНХРОНИЗАЦИЕЙ CUB
                Lampa.Storage.set('continue_watch_params', params);
                
                console.log('[ContinueWatch] 💾 Сохранено в синхронизированное хранилище для hash:', hash);
                
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка сохранения в синхронизированное хранилище:', e);
            }
        }

        // ========== ПАТЧ ДЛЯ СОХРАНЕНИЯ ПАРАМЕТРОВ ==========
        function patchPlayerForPlayline() {
            console.log('[ContinueWatch] 🔧 Установка патча Player.play() с синхронизацией CUB');
            
            var originalPlay = Lampa.Player.play;
            Lampa.Player.play = function(params) {
                console.log('[ContinueWatch] 📺 Перехват Player.play()');
                
                if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                    console.log('[ContinueWatch] 💾 Сохраняем параметры в синхронизированное хранилище');
                    
                    var hash = null;
                    var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                    
                    if (movie) {
                        var baseTitle = movie.number_of_seasons ? 
                            (movie.original_name || movie.original_title) :
                            (movie.original_title || movie.original_name);
                        
                        if (baseTitle) {
                            // ИСПРАВЛЕННЫЙ HASH ДЛЯ СЕРИАЛОВ
                            if (params.season && params.episode) {
                                var separator = params.season > 10 ? ':' : '';
                                hash = Lampa.Utils.hash([params.season, separator, params.episode, baseTitle].join(''));
                                console.log('[ContinueWatch] 🔑 Fixed episode hash:', hash, 'for S' + params.season + 'E' + params.episode);
                            } else {
                                hash = Lampa.Utils.hash(baseTitle);
                            }
                            
                            if (hash) {
                                var file_name = extractFileName(params.url);
                                var torrent_link = extractTorrentLink(params.url);
                                var file_index = extractFileIndex(params.url);
                                
                                if (file_name && torrent_link) {
                                    saveUrlParams(hash, {
                                        file_name: file_name,
                                        torrent_link: torrent_link,
                                        file_index: file_index,
                                        path: params.path,
                                        title: baseTitle || params.title || 'Unknown',
                                        season: params.season,
                                        episode: params.episode
                                    });
                                }
                            }
                        }
                    }
                }
                
                return originalPlay.call(this, params);
            };
        }

        function extractFileName(url) {
            if (!url) return null;
            var match = url.match(/\/stream\/([^?]+)/);
            return match ? decodeURIComponent(match[1]) : null;
        }

        function extractTorrentLink(url) {
            if (!url) return null;
            var match = url.match(/[?&]link=([^&]+)/);
            return match ? match[1] : null;
        }

        function extractFileIndex(url) {
            if (!url) return 0;
            var match = url.match(/[?&]index=(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }

        // ========== СОЗДАНИЕ КНОПКИ - ВСЕГДА! ==========
        function createButton(movie, container) {
            console.log('[ContinueWatch] 🔘 СОЗДАНИЕ КНОПКИ (ВСЕГДА ВИДИМА) для:', movie.title);
            
            if (currentButton) {
                currentButton.remove();
                currentButton = null;
            }
            
            var button = $('<div class="full-start__button selector button--continue-watch" style="position: relative; border: 2px solid rgba(255,255,255,0.3);">' +
                '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
                    '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +
                '</svg>' +
                '<span style="margin-left: 8px;">Продолжить просмотр</span>' +
            '</div>');
            
            setupButtonHandler(button, movie);
            container.prepend(button);
            currentButton = button;
            
            console.log('[ContinueWatch] ✅ Кнопка создана (всегда видима)');
        }

        // ========== ИНИЦИАЛИЗАЦИЯ ==========
        patchPlayerForPlayline();
        
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
            
            setTimeout(function() {
                var movie = e.data.movie;
                var container = e.object.activity.render().find('.full-start-new__buttons, .full-start__buttons, .full__buttons, [class*="buttons"]').first();
                
                if (!container.length) {
                    console.log('[ContinueWatch] ❌ Контейнер не найден');
                    return;
                }
                
                createButton(movie, container);
                
            }, 100);
        });
        
        Lampa.Activity.listener.follow('backward', function() {
            console.log('[ContinueWatch] 🧹 Очистка');
            if (currentButton) {
                currentButton.remove();
                currentButton = null;
            }
            buttonClickLock = false;
        });
        
        console.log('[ContinueWatch] ✅ Версия 7.5 загружена (поддержка playlist + синхронизация CUB)');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
