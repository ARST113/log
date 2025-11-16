// Lampa.Plugin - Continue Watch v6.8 (Fixed External Android Player)
(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] 🔧 ВЕРСИЯ 6.8: ИСПРАВЛЕННЫЙ ВНЕШНИЙ ПЛЕЕР ДЛЯ ANDROID');

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
                launchWithExternalPlayer(savedParams.stream_params, movie, hash);
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
                        launchWithExternalPlayer(altParams.stream_params, movie, alternativeHashes[i]);
                        return;
                    }
                }
                
                Lampa.Noty.show('Открываем выбор источника...');
                setTimeout(function() {
                    Lampa.Activity.push({
                        url: '',
                        title: movie.title || movie.name,
                        component: 'full',
                        movie: movie
                    });
                }, 1000);
                
                resetButton();
            }
        }

        function launchWithExternalPlayer(streamParams, movie, hash) {
            console.log('[ContinueWatch] 🚀 ЗАПУСК ВНЕШНЕГО ANDROID ПЛЕЕРА');
            
            var url = buildStreamUrl(streamParams);
            if (!url) {
                Lampa.Noty.show('Ошибка формирования URL');
                resetButton();
                return;
            }
            
            // ВАЖНО: Заменяем &preload на &play для Android
            url = url.replace('&preload', '&play');
            console.log('[ContinueWatch] 🌐 Android URL:', url);
            
            var playerData = {
                url: url,
                title: streamParams.title || movie.title,
                card: movie,
                torrent_hash: streamParams.torrent_link, // Оставляем для внешнего плеера
                continue_play: true
            };
            
            // Добавляем прогресс воспроизведения
            var view = Lampa.Timeline.view(hash);
            if (view && view.percent > 0) {
                playerData.timeline = view;
                playerData.position = view.time;
                console.log('[ContinueWatch] ⏱️ Восстанавливаем позицию:', view.time + 'сек');
            }
            
            console.log('[ContinueWatch] 🎬 Данные для внешнего плеера:', playerData);
            
            try {
                Lampa.Noty.show('Запуск Android плеера...');
                
                // ВАЖНО: Прямой вызов Android.openPlayer с правильными параметрами
                if (typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
                    console.log('[ContinueWatch] ✅ Прямой вызов Lampa.Android.openPlayer');
                    Lampa.Android.openPlayer(url, playerData);
                } else if (typeof AndroidJS !== 'undefined' && AndroidJS.openPlayer) {
                    console.log('[ContinueWatch] ✅ Прямой вызов AndroidJS.openPlayer');
                    AndroidJS.openPlayer(url, JSON.stringify(playerData));
                } else {
                    console.log('[ContinueWatch] ⚠️ Android API недоступно, используем стандартный метод');
                    // Используем стандартный метод с установкой плеера
                    Lampa.Player.runas('android');
                    Lampa.Player.play(playerData);
                }
                
                console.log('[ContinueWatch] ✅ Внешний плеер запущен!');
                resetButton();
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска внешнего плеера:', err);
                Lampa.Noty.show('Ошибка: ' + err.message);
                resetButton();
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
            
            console.log('[ContinueWatch] ✅ URL построен');
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

        function createButton(movie, container) {
            console.log('[ContinueWatch] 🔘 Создание кнопки');
            
            $('.button--continue-watch').remove();
            
            var button = $('<div class="full-start__button selector button--continue-watch" style="border: 2px solid rgba(255,255,255,0.3); margin: 10px 0; padding: 12px 20px; border-radius: 8px; background: rgba(255,255,255,0.1);">' +
                '<div style="display: flex; align-items: center; justify-content: center;">' +
                    '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
                        '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +
                    '</svg>' +
                    '<span style="margin-left: 12px; font-weight: bold;">Продолжить просмотр</span>' +
                '</div>' +
            '</div>');
            
            setupButtonHandler(button, movie);
            container.prepend(button);
            currentButton = button;
            
            console.log('[ContinueWatch] ✅ Кнопка создана');
        }

        // ========== ИНИЦИАЛИЗАЦИЯ ==========
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
            
            setTimeout(function() {
                var movie = e.data.movie;
                var container = e.object.activity.render().find('.full-start-new__buttons, .full-start__buttons, .full__buttons, [class*="buttons"]').first();
                
                if (!container.length) return;
                
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
        
        console.log('[ContinueWatch] ✅ Версия 6.8 загружена (исправленный внешний плеер)');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
