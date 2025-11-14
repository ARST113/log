// Lampa.Plugin

(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" ЗАПУЩЕН');
        console.log('[ContinueWatch] Версия: 2.0 с интеграцией Timeline и синхронизацией');
        console.log('[ContinueWatch] ========================================');

        var currentHash = null;

        // ========== УТИЛИТЫ ==========
          
        function formatTime(seconds) {
            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);
            if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        // ✅ НОВОЕ: Используем систему Timeline для хранения URL
        function saveUrlToTimeline(hash, data) {
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
                
                // Добавляем URL к существующей записи Timeline
                viewed[hash].url = data.url;
                viewed[hash].title = data.title;
                viewed[hash].season = data.season;
                viewed[hash].episode = data.episode;
                viewed[hash].timestamp = Date.now();
                
                Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                
                console.log('[ContinueWatch] ✓ URL сохранен в Timeline для hash:', hash);
                console.log('[ContinueWatch] ✓ Filename:', Lampa.Timeline.filename());
                
                // ✅ Отправляем через Socket для синхронизации (если премиум)
                if (Lampa.Account && Lampa.Account.hasPremium && Lampa.Account.hasPremium()) {
                    console.log('[ContinueWatch] ✓ Отправка через Socket (премиум активен)');
                }
            } catch(e) {
                console.error('[ContinueWatch] Ошибка сохранения URL в Timeline:', e);
            }
        }

        // ✅ НОВОЕ: Чтение URL из Timeline
        function getUrlFromTimeline(hash) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                return viewed[hash] && viewed[hash].url ? viewed[hash] : null;
            } catch(e) {
                console.error('[ContinueWatch] Ошибка чтения URL из Timeline:', e);
                return null;
            }
        }

        // ========== СОЗДАНИЕ КНОПКИ НА КАРТОЧКЕ ==========
          
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
              
            console.log('[ContinueWatch] ========================================');
            console.log('[ContinueWatch] Обработка карточки');
              
            var movie = e.data.movie;
            
            // Правильное определение названия для фильмов/сериалов/аниме
            var title = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title) : 
                (movie.original_title || movie.original_name);
              
            if (!title) {
                console.log('[ContinueWatch] ⚠️ Название не найдено, выход');
                return;
            }
              
            console.log('[ContinueWatch] Название:', title);
            console.log('[ContinueWatch] Тип:', movie.number_of_seasons ? 'Сериал/Аниме' : 'Фильм');
              
            // Получаем hash и прогресс
            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);
              
            console.log('[ContinueWatch] Hash:', hash);
            console.log('[ContinueWatch] Прогресс из Timeline:', view.percent + '%');
              
            // Для сериалов/аниме - проверяем последний эпизод
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
                  
                console.log('[ContinueWatch] TitleHash для сериала:', titleHash);
                console.log('[ContinueWatch] Данные последнего эпизода:', filed);
                
                if (filed && filed.season && filed.episode) {
                    hash = Lampa.Utils.hash([
                        filed.season,
                        filed.season > 10 ? ':' : '',
                        filed.episode,
                        movie.original_name || movie.original_title
                    ].join(''));
                    view = Lampa.Timeline.view(hash);
                    console.log('[ContinueWatch] Эпизод S' + filed.season + 'E' + filed.episode);
                    console.log('[ContinueWatch] Hash эпизода:', hash);
                    console.log('[ContinueWatch] Прогресс эпизода:', view.percent + '%');
                }
            }
              
            // Проверяем подходит ли прогресс
            if (!view.percent || view.percent < 5 || view.percent > 95) {
                console.log('[ContinueWatch] ⚠️ Прогресс не подходит:', view.percent + '% (нужно 5-95%)');
                return;
            }
              
            var percent = view.percent;
            var timeStr = formatTime(view.time);
            
            // ✅ НОВОЕ: Читаем URL из Timeline
            var savedUrl = getUrlFromTimeline(hash);
              
            console.log('[ContinueWatch] Сохраненный URL найден?', Boolean(savedUrl));
              
            // Создаем кнопку
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
              
            // Обработчик клика
            button.on('hover:enter', function() {
                console.log('[ContinueWatch] ========================================');
                console.log('[ContinueWatch] 🎬 КНОПКА "ПРОДОЛЖИТЬ" НАЖАТА');
                console.log('[ContinueWatch] ========================================');
                  
                if (savedUrl) {
                    console.log('[ContinueWatch] ✓ URL найден в Timeline');
                    console.log('[ContinueWatch] URL:', savedUrl.url);
                    console.log('[ContinueWatch] Название:', savedUrl.title);
                      
                    var playerData = {
                        url: savedUrl.url,
                        title: savedUrl.title,
                        timeline: view,
                        card: movie,
                        continue_play: true
                    };
                      
                    console.log('[ContinueWatch] Запуск плеера с Timeline:', view.percent + '%,', view.time, 'сек');
                    console.log('[ContinueWatch] 🚫 Реклама будет пропущена (continue_play: true)');
                      
                    try {
                        if (Lampa.Platform.is('android')) {
                            console.log('[ContinueWatch] 📱 Платформа Android обнаружена');
                              
                            var playUrl = savedUrl.url.replace('&preload', '&play');
                            playerData.url = playUrl;
                            playerData.position = view.time || -1;
                              
                            if (typeof Lampa.Android !== 'undefined' && typeof Lampa.Android.openPlayer === 'function') {
                                Lampa.Android.openPlayer(playUrl, playerData);
                                console.log('[ContinueWatch] ✅ Внешний плеер запущен через Lampa.Android.openPlayer');
                            } else if (typeof AndroidJS !== 'undefined' && typeof AndroidJS.openPlayer === 'function') {
                                AndroidJS.openPlayer(playUrl, JSON.stringify(playerData));
                                console.log('[ContinueWatch] ✅ Внешний плеер запущен через AndroidJS.openPlayer');
                            } else {
                                console.log('[ContinueWatch] ⚠️ Android API недоступен, используем встроенный плеер');
                                Lampa.Player.play(playerData);
                            }
                        } else {
                            console.log('[ContinueWatch] 🖥️ Запуск встроенного плеера');
                            Lampa.Player.play(playerData);
                        }
                          
                        console.log('[ContinueWatch] ✅ Плеер запущен успешно!');
                    } catch(err) {
                        console.error('[ContinueWatch] ❌ Ошибка запуска:', err);
                        Lampa.Noty.show('Ошибка запуска: ' + err.message);
                    }
                } else {
                    console.log('[ContinueWatch] ⚠️ URL не найден, запуск компонента torrents');
                    Lampa.Activity.push({
                        url: '',
                        title: movie.title || movie.name,
                        component: 'torrents',
                        movie: movie,
                        page: 1
                    });
                }
                  
                console.log('[ContinueWatch] ========================================');
            });
              
            // Добавляем кнопку в контейнер
            var container = e.object.activity.render().find('.full-start-new__buttons');
              
            if (container.length) {
                container.prepend(button);
                console.log('[ContinueWatch] ✅ Кнопка добавлена на карточку');
            } else {
                console.log('[ContinueWatch] ⚠️ Контейнер .full-start-new__buttons не найден');
            }
              
            console.log('[ContinueWatch] ========================================');
        });
          
        // ========== ПЕРЕХВАТ ANDROID.OPENPLAYER ==========
          
        if (Lampa.Platform.is('android') && typeof Lampa.Android !== 'undefined' && Lampa.Android.openPlayer) {
            var originalOpenPlayer = Lampa.Android.openPlayer;
            Lampa.Android.openPlayer = function(link, data) {
                console.log('[ContinueWatch] 📱 Перехват Android.openPlayer');
                  
                if (data && data.timeline && data.timeline.hash) {
                    var hash = data.timeline.hash;
                    currentHash = hash;
                    
                    // ✅ Сохраняем в Timeline
                    saveUrlToTimeline(hash, {
                        url: link,
                        title: data.title || 'Unknown',
                        season: data.season,
                        episode: data.episode
                    });
                }
                  
                return originalOpenPlayer.call(this, link, data);
            };
            console.log('[ContinueWatch] ✅ Android.openPlayer перехвачен');
        }
          
        // ========== ПЕРЕХВАТ PLAYER.PLAY ==========
          
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function(data) {
            console.log('[ContinueWatch] ----------------------------------------');
            console.log('[ContinueWatch] 📺 Перехват Player.play()');
              
            if (data && data.url) {
                console.log('[ContinueWatch] URL:', data.url);
                console.log('[ContinueWatch] Title:', data.title);
                console.log('[ContinueWatch] Season:', data.season);
                console.log('[ContinueWatch] Episode:', data.episode);
                  
                // Определяем hash правильно
                var hash = null;
                if (data.timeline && data.timeline.hash) {
                    hash = data.timeline.hash;
                    console.log('[ContinueWatch] Hash из timeline:', hash);
                } else if (data.season && data.episode && data.card) {
                    var baseTitle = data.card.number_of_seasons ? 
                        (data.card.original_name || data.card.original_title) :
                        (data.card.original_title || data.card.original_name);
                    
                    hash = Lampa.Utils.hash([
                        data.season,
                        data.season > 10 ? ':' : '',
                        data.episode,
                        baseTitle
                    ].join(''));
                    console.log('[ContinueWatch] Hash для эпизода S' + data.season + 'E' + data.episode + ':', hash);
                    console.log('[ContinueWatch] BaseTitle:', baseTitle);
                } else if (data.card) {
                    var cardTitle = data.card.number_of_seasons ? 
                        (data.card.original_name || data.card.original_title) :
                        (data.card.original_title || data.card.original_name);
                    hash = Lampa.Utils.hash(cardTitle);
                    console.log('[ContinueWatch] Hash из card:', hash);
                } else if (data.title) {
                    hash = Lampa.Utils.hash(data.title);
                    console.log('[ContinueWatch] Hash из title:', hash);
                }
                  
                if (hash) {
                    currentHash = hash;
                    console.log('[ContinueWatch] ✓ currentHash установлен:', currentHash);
                      
                    // ✅ Сохраняем в Timeline
                    saveUrlToTimeline(hash, {
                        url: data.url,
                        title: data.title || 'Unknown',
                        season: data.season,
                        episode: data.episode
                    });
                }
            }
              
            console.log('[ContinueWatch] ----------------------------------------');
            return originalPlay.call(this, data);
        };
          
        // ========== АВТОСОХРАНЕНИЕ ПРОГРЕССА ==========
          
        Lampa.Player.listener.follow('timeupdate', function(e) {
            if (!currentHash) return;
              
            var video = document.querySelector('video');
            if (!video) return;
              
            var time = video.currentTime;
            var duration = video.duration;
              
            if (!time || !duration || duration === 0) return;
              
            if (Math.floor(time) % 10 === 0 && Math.floor(time) !== Math.floor(video.lastSavedTime || 0)) {
                video.lastSavedTime = time;
                  
                var percent = Math.round((time / duration) * 100);
                  
                // ✅ Timeline.update автоматически синхронизируется через Socket
                Lampa.Timeline.update({
                    hash: currentHash,
                    percent: percent,
                    time: time,
                    duration: duration
                });
                  
                console.log('[ContinueWatch] 💾 Автосохранение:', Math.floor(time), 'сек (' + percent + '%)');
            }
        });

        // ========== ФИНАЛЬНОЕ СОХРАНЕНИЕ ПРИ ЗАКРЫТИИ ==========
          
        Lampa.Player.listener.follow('destroy', function() {
            console.log('[ContinueWatch] ========================================');
            console.log('[ContinueWatch] 🛑 Плеер закрывается');
              
            if (!currentHash) {
                console.log('[ContinueWatch] ⚠️ currentHash не установлен');
                return;
            }
              
            var video = document.querySelector('video');
            if (video) {
                var time = video.currentTime;
                var duration = video.duration;
                  
                if (time && duration && duration > 0) {
                    var percent = Math.round((time / duration) * 100);
                      
                    Lampa.Timeline.update({
                        hash: currentHash,
                        percent: percent,
                        time: time,
                        duration: duration
                    });
                      
                    console.log('[ContinueWatch] 💾 Прогресс сохранен при закрытии:', Math.floor(time), 'сек (' + percent + '%)');
                }
            }
            
            currentHash = null;
        });
        
        // ========== МИГРАЦИЯ СТАРЫХ ДАННЫХ ==========
        
        // ✅ Мигрируем старые данные из continue_watch_urls в Timeline (если есть)
        try {
            var oldData = localStorage.getItem('continue_watch_urls');
            if (oldData) {
                console.log('[ContinueWatch] 🔄 Найдены старые данные, начинаем миграцию...');
                var oldUrls = JSON.parse(oldData);
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                var migrated = 0;
                
                for (var hash in oldUrls) {
                    if (viewed[hash]) {
                        viewed[hash].url = oldUrls[hash].url;
                        viewed[hash].title = oldUrls[hash].title;
                        viewed[hash].season = oldUrls[hash].season;
                        viewed[hash].episode = oldUrls[hash].episode;
                        viewed[hash].timestamp = oldUrls[hash].timestamp;
                        migrated++;
                    }
                }
                
                if (migrated > 0) {
                    Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                    console.log('[ContinueWatch] ✅ Мигрировано записей:', migrated);
                    localStorage.removeItem('continue_watch_urls');
                    console.log('[ContinueWatch] ✅ Старое хранилище удалено');
                }
            }
        } catch(e) {
            console.error('[ContinueWatch] Ошибка миграции:', e);
        }
    }

    // Запускаем плагин
    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
