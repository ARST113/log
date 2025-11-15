// Lampa.Plugin - Continue Watch v6.2 (Android Button Fix)
(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" v6.2');
        console.log('[ContinueWatch] ========================================');

        var currentHash = null;
        var buttonClickLock = false;
        var currentButton = null;

        // ========== УЛУЧШЕННАЯ ОБРАБОТКА СОБЫТИЙ ==========
        function setupButtonHandler(button, movie) {
            console.log('[ContinueWatch] 🔧 Настройка обработчика кнопки');
            
            // ✅ Вариант 1: Стандартный hover:enter
            button.on('hover:enter', function() {
                handleButtonClick(movie);
            });
            
            // ✅ Вариант 2: Прямой click для Android
            button.on('click', function(e) {
                console.log('[ContinueWatch] 🖱️ Click событие поймано');
                e.preventDefault();
                e.stopPropagation();
                handleButtonClick(movie);
            });
            
            // ✅ Вариант 3: Touch события для мобильных устройств
            button.on('touchstart', function(e) {
                console.log('[ContinueWatch] 📱 Touch событие поймано');
                e.preventDefault();
                e.stopPropagation();
            });
            
            button.on('touchend', function(e) {
                console.log('[ContinueWatch] 📱 Touch end событие поймано');
                e.preventDefault();
                e.stopPropagation();
                handleButtonClick(movie);
            });
            
            // ✅ Добавляем атрибуты для лучшей доступности
            button.attr('tabindex', '0');
            button.attr('role', 'button');
            button.attr('aria-label', 'Продолжить просмотр');
            
            console.log('[ContinueWatch] ✅ Обработчики настроены');
        }

        function handleButtonClick(movie) {
            if (buttonClickLock) {
                console.log('[ContinueWatch] 🔒 Кнопка заблокирована');
                return;
            }
            
            buttonClickLock = true;
            console.log('[ContinueWatch] 🎬 КНОПКА НАЖАТА - начинаем обработку');
            
            // Показываем визуальную обратную связь
            currentButton.addClass('button--active');
            
            try {
                processButtonClick(movie);
            } catch (error) {
                console.error('[ContinueWatch] ❌ Ошибка в обработчике:', error);
                Lampa.Noty.show('Ошибка: ' + error.message);
            }
            
            // Восстанавливаем через 1 секунду
            setTimeout(function() {
                buttonClickLock = false;
                if (currentButton) {
                    currentButton.removeClass('button--active');
                }
                console.log('[ContinueWatch] 🔓 Кнопка разблокирована');
            }, 1000);
        }

        function processButtonClick(movie) {
            console.log('[ContinueWatch] 🔍 Получаем данные фильма:', movie.title);
            
            var title = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title) : 
                (movie.original_title || movie.original_name);
            
            if (!title) {
                console.error('[ContinueWatch] ❌ Не удалось определить title');
                Lampa.Noty.show('Ошибка: не найден заголовок');
                return;
            }
            
            console.log('[ContinueWatch] 📝 Title:', title);
            
            var hash = Lampa.Utils.hash(title);
            console.log('[ContinueWatch] 🔑 Basic hash:', hash);
            
            // Для сериалов используем последний просмотренный эпизод
            if (movie.number_of_seasons) {
                console.log('[ContinueWatch] 📺 Это сериал, ищем последний эпизод');
                var last = Lampa.Storage.get('online_watched_last', '{}');
                if (typeof last === 'string') {
                    try { 
                        last = JSON.parse(last); 
                        console.log('[ContinueWatch] 📋 Last watched data:', last);
                    } catch(e) { 
                        console.error('[ContinueWatch] ❌ Ошибка парсинга last_watched:', e);
                        last = {}; 
                    }
                }
                
                var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title);
                console.log('[ContinueWatch] 🔑 Title hash для сериала:', titleHash);
                
                var filed = last[titleHash];
                console.log('[ContinueWatch] 📊 Последний эпизод:', filed);
                
                if (filed && filed.season && filed.episode) {
                    var episodeHashString = [filed.season, filed.episode, movie.original_name || movie.original_title].join('');
                    hash = Lampa.Utils.hash(episodeHashString);
                    console.log('[ContinueWatch] 🔑 Episode hash:', hash, 'для S' + filed.season + 'E' + filed.episode);
                }
            }
            
            console.log('[ContinueWatch] 🔎 Ищем параметры для hash:', hash);
            var savedParams = getUrlParams(hash);
            
            if (savedParams && savedParams.stream_params) {
                console.log('[ContinueWatch] ✅ Параметры найдены:', savedParams.stream_params);
                launchPlayerWithParams(savedParams.stream_params, movie, hash);
            } else {
                console.log('[ContinueWatch] ❌ Параметры не найдены для hash:', hash);
                Lampa.Noty.show('Параметры не найдены, открываем выбор источника...');
                
                // Показываем выбор источника
                setTimeout(function() {
                    Lampa.Activity.push({
                        url: '',
                        title: movie.title || movie.name,
                        component: 'torrents',
                        movie: movie,
                        page: 1
                    });
                }, 500);
            }
        }

        function launchPlayerWithParams(streamParams, movie, hash) {
            console.log('[ContinueWatch] 🚀 Запуск плеера с параметрами:', streamParams);
            
            var url = buildStreamUrl(streamParams);
            
            if (!url) {
                Lampa.Noty.show('Ошибка: не удалось сформировать URL');
                return;
            }
            
            var playerData = {
                url: url,
                title: streamParams.title,
                card: movie,
                continue_play: true,
                torrent_hash: streamParams.torrent_link
            };
            
            // Добавляем timeline если есть прогресс
            var view = Lampa.Timeline.view(hash);
            if (view && view.percent && view.percent > 0) {
                playerData.timeline = view;
                console.log('[ContinueWatch] ⏱️ Восстанавливаем позицию:', view.time + 'сек');
                playerData.position = view.time;
            }
            
            console.log('[ContinueWatch] 🎬 Player data:', playerData);
            
            try {
                Lampa.Noty.show('Запуск продолжения...');
                
                if (Lampa.Platform.is('android')) {
                    console.log('[ContinueWatch] 📱 Android платформа');
                    
                    // Для Android используем внешний плеер
                    if (typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
                        console.log('[ContinueWatch] ✅ Используем Lampa.Android.openPlayer');
                        Lampa.Android.openPlayer(url, playerData);
                    } else if (typeof AndroidJS !== 'undefined' && AndroidJS.openPlayer) {
                        console.log('[ContinueWatch] ✅ Используем AndroidJS.openPlayer');
                        AndroidJS.openPlayer(url, JSON.stringify(playerData));
                    } else {
                        console.log('[ContinueWatch] ⚠️ Android API недоступно, используем встроенный плеер');
                        Lampa.Player.play(playerData);
                    }
                } else {
                    console.log('[ContinueWatch] 🖥️ Используем встроенный плеер');
                    Lampa.Player.play(playerData);
                }
                
                console.log('[ContinueWatch] ✅ Плеер запущен');
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска плеера:', err);
                Lampa.Noty.show('Ошибка запуска: ' + err.message);
            }
        }

        // ========== ОСТАЛЬНЫЕ ФУНКЦИИ ==========
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
                console.error('[ContinueWatch] ❌ TorrServer URL не настроен!');
                return null;
            }
            
            if (!server_url.match(/^https?:\/\//)) {
                server_url = 'http://' + server_url;
            }
            
            var encodedFileName = encodeURIComponent(params.file_name);
            var playMode = Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play';
            
            var url = server_url + '/stream/' + encodedFileName;
            var urlParams = [];
            if (params.torrent_link) urlParams.push('link=' + params.torrent_link);
            urlParams.push('index=' + params.file_index);
            urlParams.push(playMode);
            
            url += '?' + urlParams.join('&');
            
            console.log('[ContinueWatch] ✅ URL:', url);
            return url;
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
                    source: 'continue_watch_v6.2'
                };
                
                Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                console.log('[ContinueWatch] 💾 Сохранено для hash:', hash);
                
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка сохранения:', e);
            }
        }

        function getUrlParams(hash) {
            if (!hash) return null;
            
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                var result = viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
                console.log('[ContinueWatch] 🔍 Поиск параметров для hash:', hash, '- найдено:', !!result);
                return result;
            } catch(e) {
                console.error('[ContinueWatch] ❌ Ошибка чтения:', e);
                return null;
            }
        }

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
                                currentHash = hash;
                                
                                var file_name = null;
                                var torrent_link = null;
                                var file_index = 0;
                                
                                if (params.torrent_hash && params.path) {
                                    file_name = params.path.split(/[\\\/]/).pop();
                                    torrent_link = params.torrent_hash;
                                    file_index = params.id || params.file_id || 0;
                                } else if (params.url) {
                                    file_name = extractFileName(params.url);
                                    torrent_link = extractTorrentLink(params.url);
                                    file_index = extractFileIndex(params.url);
                                }
                                
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

        function createButton(movie, container) {
            console.log('[ContinueWatch] 🔘 Создание кнопки для:', movie.title);
            
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
            
            console.log('[ContinueWatch] ✅ Кнопка создана и настроена');
            
            // ✅ ТЕСТ: Добавляем принудительный тест через 3 секунды
            setTimeout(function() {
                console.log('[ContinueWatch] 🧪 ТЕСТ: Проверка доступности кнопки в DOM');
                console.log('[ContinueWatch] 🧪 Кнопка в DOM:', document.contains(button[0]));
                console.log('[ContinueWatch] 🧪 Видимость кнопки:', button.is(':visible'));
                console.log('[ContinueWatch] 🧪 Координаты кнопки:', button.offset());
            }, 3000);
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
        
        console.log('[ContinueWatch] 🚀 Версия 6.2 загружена с улучшенной обработкой кнопок');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
