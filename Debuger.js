// Lampa.Plugin - Continue Watch v7.1 (External Android Player Support)
(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] 🔧 ВЕРСИЯ 7.1: ПОДДЕРЖКА ВНЕШНЕГО ANDROID ПЛЕЕРА');

        var currentButton = null;
        var buttonClickLock = false;

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
            
            // Для сериалов
            if (movie.number_of_seasons) {
                try {
                    var last = Lampa.Storage.get('online_watched_last', '{}');
                    if (typeof last === 'string') last = JSON.parse(last);
                    
                    var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title || title);
                    var filed = last[titleHash];
                    
                    if (filed && filed.season !== undefined && filed.episode !== undefined) {
                        var episodeHash = Lampa.Utils.hash([filed.season, filed.episode, title].join(''));
                        hash = episodeHash;
                        console.log('[ContinueWatch] 🔑 Episode hash:', hash);
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
            
            // Добавляем прогресс воспроизведения
            var view = Lampa.Timeline.view(hash);
            var position = (view && view.percent > 0) ? view.time : -1;
            
            // Основные данные плеера
            var playerData = {
                url: url,
                title: streamParams.title || movie.title,
                card: movie,
                continue_play: true,
                torrent_hash: streamParams.torrent_link // ДОБАВЛЯЕМ torrent_hash!
            };
            
            if (view && view.percent > 0) {
                playerData.timeline = view;
                playerData.position = position;
                console.log('[ContinueWatch] ⏱️ Восстанавливаем позицию:', position + 'сек');
            }
            
            console.log('[ContinueWatch] 🎬 Данные плеера:', playerData);
            
            try {
                Lampa.Noty.show('Запуск плеера...');
                
                // ВАРИАНТ 1: Прямой вызов Android.openPlayer для внешнего плеера
                if (Lampa.Platform.is('android') && Lampa.Storage.field('player_torrent') == 'android') {
                    console.log('[ContinueWatch] ✅ Запуск внешнего Android плеера');
                    
                    var androidData = {
                        url: url,
                        title: streamParams.title || movie.title,
                        position: position,
                        timeline: view,
                        torrent_hash: streamParams.torrent_link,
                        card: movie
                    };
                    
                    // Заменяем &preload на &play для Android
                    var androidUrl = url.replace('&preload', '&play');
                    
                    if (typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
                        console.log('[ContinueWatch] ✅ Используем Lampa.Android.openPlayer');
                        Lampa.Android.openPlayer(androidUrl, androidData);
                    } else if (typeof AndroidJS !== 'undefined' && AndroidJS.openPlayer) {
                        console.log('[ContinueWatch] ✅ Используем AndroidJS.openPlayer');
                        AndroidJS.openPlayer(androidUrl, JSON.stringify(androidData));
                    } else {
                        console.log('[ContinueWatch] ⚠️ Android API недоступно, используем стандартный метод');
                        Lampa.Player.play(playerData);
                    }
                } 
                // ВАРИАНТ 2: Стандартный вызов (внутренний плеер или другой)
                else {
                    console.log('[ContinueWatch] ✅ Используем стандартный плеер');
                    Lampa.Player.play(playerData);
                }
                
                console.log('[ContinueWatch] ✅ Плеер запущен!');
                resetButton();
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска:', err);
                Lampa.Noty.show('Ошибка: ' + err.message);
                resetButton();
            }
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
            
            // Автоматически определяем протокол
            var currentProtocol = window.location.protocol;
            var serverProtocol = server_url.split('://')[0];
            
            // Если Lampa на HTTPS, а TorrServer на HTTP - используем HTTPS или предупреждаем
            if (currentProtocol === 'https:' && serverProtocol === 'http') {
                console.warn('[ContinueWatch] ⚠️ Смешанный контент: HTTPS -> HTTP');
                // Для внешнего плеера это не критично, но пробуем заменить на HTTPS
                server_url = server_url.replace('http://', 'https://');
                console.log('[ContinueWatch] 🔄 Заменяем на HTTPS:', server_url);
            }
            
            // Убеждаемся, что URL имеет протокол
            if (!server_url.match(/^https?:\/\//)) {
                server_url = currentProtocol + '//' + server_url;
            }
            
            var encodedFileName = encodeURIComponent(params.file_name);
            var playMode = Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play';
            
            var url = server_url + '/stream/' + encodedFileName;
            var urlParams = [];
            if (params.torrent_link) urlParams.push('link=' + params.torrent_link);
            urlParams.push('index=' + (params.file_index || 0));
            urlParams.push(playMode);
            
            url += '?' + urlParams.join('&');
            
            console.log('[ContinueWatch] ✅ URL построен:', url);
            return url;
        }

        function getUrlParams(hash) {
            if (!hash) return null;
            
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                var result = viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
                console.log('[ContinueWatch] 🔍 Поиск параметров:', !!result);
                return result;
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка чтения:', e);
                return null;
            }
        }

        // ========== СОЗДАНИЕ КНОПКИ - ВСЕГДА! ==========
        function createButton(movie, container) {
            console.log('[ContinueWatch] 🔘 СОЗДАНИЕ КНОПКИ (ВСЕГДА ВИДИМА) для:', movie.title);
            
            // Удаляем старую кнопку если есть
            if (currentButton) {
                currentButton.remove();
                currentButton = null;
            }
            
            // Создаем кнопку с улучшенными стилями
            var button = $('<div class="full-start__button selector button--continue-watch" style="position: relative; border: 2px solid rgba(255,255,255,0.3);">' +
                '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
                    '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +
                '</svg>' +
                '<span style="margin-left: 8px;">Продолжить просмотр</span>' +
            '</div>');
            
            // Настраиваем обработчики
            setupButtonHandler(button, movie);
            
            // Добавляем в DOM
            container.prepend(button);
            currentButton = button;
            
            console.log('[ContinueWatch] ✅ Кнопка создана (всегда видима)');
        }

        // ========== ПАТЧ ДЛЯ СОХРАНЕНИЯ ПАРАМЕТРОВ ==========
        function patchPlayerForPlayline() {
            console.log('[ContinueWatch] 🔧 Установка патча Player.play()');
            
            var originalPlay = Lampa.Player.play;
            Lampa.Player.play = function(params) {
                console.log('[ContinueWatch] 📺 Перехват Player.play()');
                
                if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                    console.log('[ContinueWatch] 💾 Сохраняем параметры');
                    
                    var hash = null;
                    var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                    
                    if (movie) {
                        var baseTitle = movie.number_of_seasons ? 
                            (movie.original_name || movie.original_title) :
                            (movie.original_title || movie.original_name);
                        
                        if (baseTitle) {
                            if (params.season && params.episode) {
                                hash = Lampa.Utils.hash([params.season, params.episode, baseTitle].join(''));
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
                                        title: params.title || 'Unknown',
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

        function saveUrlParams(hash, data) {
            if (!hash || !data) return;
            
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                
                if (!viewed[hash]) {
                    viewed[hash] = { duration: 0, time: 0, percent: 0, profile: 0 };
                }
                
                viewed[hash].stream_params = {
                    file_name: data.file_name,
                    torrent_link: data.torrent_link,
                    file_index: data.file_index,
                    path: data.path,
                    title: data.title,
                    season: data.season,
                    episode: data.episode,
                    timestamp: Date.now(),
                    source: 'continue_watch_v7.1'
                };
                
                Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                console.log('[ContinueWatch] 💾 Сохранено для hash:', hash);
                
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка сохранения:', e);
            }
        }

        // ========== ИНИЦИАЛИЗАЦИЯ - СОЗДАЕМ КНОПКУ ВСЕГДА ==========
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
                
                // ВАЖНО: Создаем кнопку ВСЕГДА, без проверки прогресса!
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
        
        console.log('[ContinueWatch] ✅ Версия 7.1 загружена (внешний Android плеер)');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
