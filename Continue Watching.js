// Lampa.Plugin - Continue Watch v4.0 (Final)

(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" ЗАПУЩЕН');
        console.log('[ContinueWatch] Версия: 4.0 - Финальная с улучшениями');
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

        function extractFileName(url) {
            var match = url.match(/\/stream\/([^?]+)/);
            if (match) {
                // Декодируем если было закодировано
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

        // ✅ Улучшенная функция формирования URL
        function buildStreamUrl(params) {
            var torrserver_url = Lampa.Storage.get('torrserver_url');
            var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
            
            var server_url = Lampa.Storage.field('torrserver_use_link') == 'two' 
                ? (torrserver_url_two || torrserver_url) 
                : (torrserver_url || torrserver_url_two);
            
            if (!server_url) {
                console.error('[ContinueWatch] TorrServer URL не настроен!');
                return null;
            }
            
            if (!server_url.match(/^https?:\/\//)) {
                server_url = 'http://' + server_url;
                console.log('[ContinueWatch] ⚠️ Добавлен протокол http://', server_url);
            }
            
            // ✅ Кодируем имя файла и учитываем настройку preload
            var encodedFileName = encodeURIComponent(params.file_name);
            var playMode = Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play';
            
            var url = server_url + '/stream/' + encodedFileName;
            
            // Формируем параметры
            var urlParams = [];
            if (params.torrent_link) urlParams.push('link=' + params.torrent_link);
            urlParams.push('index=' + params.file_index);
            urlParams.push(playMode);
            
            url += '?' + urlParams.join('&');
            
            console.log('[ContinueWatch] 🔗 Сформирован URL:', url);
            console.log('[ContinueWatch] 📡 Сервер:', server_url);
            console.log('[ContinueWatch] 📁 Имя файла:', params.file_name);
            console.log('[ContinueWatch] 🔑 Link (hash торрента):', params.torrent_link);
            console.log('[ContinueWatch] 📂 Индекс файла:', params.file_index);
            console.log('[ContinueWatch] 🎬 Режим:', playMode);
            
            return url;
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
                
                viewed[hash].stream_params = {
                    file_name: data.file_name,
                    torrent_link: data.torrent_link,
                    file_index: data.file_index,
                    title: data.title,
                    season: data.season,
                    episode: data.episode,
                    timestamp: Date.now()
                };
                
                Lampa.Storage.set(Lampa.Timeline.filename(), viewed);
                
                console.log('[ContinueWatch] ✓ Параметры сохранены в Timeline для hash:', hash);
                console.log('[ContinueWatch] ✓ Имя файла:', data.file_name);
                console.log('[ContinueWatch] ✓ Torrent link:', data.torrent_link);
                console.log('[ContinueWatch] ✓ Индекс файла:', data.file_index);
            } catch(e) {
                console.error('[ContinueWatch] Ошибка сохранения параметров:', e);
            }
        }

        function getUrlParams(hash) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                return viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
            } catch(e) {
                console.error('[ContinueWatch] Ошибка чтения параметров:', e);
                return null;
            }
        }

        // ========== СОЗДАНИЕ КНОПКИ НА КАРТОЧКЕ ==========
          
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
              
            console.log('[ContinueWatch] ========================================');
            console.log('[ContinueWatch] Обработка карточки');
              
            var movie = e.data.movie;
            
            var title = movie.number_of_seasons ? 
                (movie.original_name || movie.original_title) : 
                (movie.original_title || movie.original_name);
              
            if (!title) {
                console.log('[ContinueWatch] ⚠️ Название не найдено, выход');
                return;
            }
              
            console.log('[ContinueWatch] Название:', title);
            console.log('[ContinueWatch] Тип:', movie.number_of_seasons ? 'Сериал/Аниме' : 'Фильм');
              
            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);
              
            console.log('[ContinueWatch] Hash:', hash);
            console.log('[ContinueWatch] Прогресс из Timeline:', view.percent + '%');
              
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
              
            if (!view.percent || view.percent < 5 || view.percent > 95) {
                console.log('[ContinueWatch] ⚠️ Прогресс не подходит:', view.percent + '% (нужно 5-95%)');
                return;
            }
              
            var percent = view.percent;
            var timeStr = formatTime(view.time);
            var savedParams = getUrlParams(hash);
              
            console.log('[ContinueWatch] Сохраненные параметры найдены?', Boolean(savedParams));
              
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
              
            button.on('hover:enter', function() {
                console.log('[ContinueWatch] ========================================');
                console.log('[ContinueWatch] 🎬 КНОПКА "ПРОДОЛЖИТЬ" НАЖАТА');
                console.log('[ContinueWatch] ========================================');
                  
                if (savedParams && savedParams.stream_params) {
                    console.log('[ContinueWatch] ✓ Параметры найдены в Timeline');
                    
                    var url = buildStreamUrl(savedParams.stream_params);
                    
                    if (!url) {
                        Lampa.Noty.show('TorrServer не настроен');
                        return;
                    }
                    
                    // ✅ Добавляем torrent_hash для совместимости с плагинами
                    var playerData = {
                        url: url,
                        title: savedParams.stream_params.title,
                        timeline: view,
                        card: movie,
                        continue_play: true,
                        torrent_hash: savedParams.stream_params.torrent_link
                    };
                      
                    console.log('[ContinueWatch] Запуск плеера с Timeline:', view.percent + '%,', view.time, 'сек');
                    console.log('[ContinueWatch] 🚫 Реклама будет пропущена (continue_play: true)');
                      
                    try {
                        if (Lampa.Platform.is('android')) {
                            console.log('[ContinueWatch] 📱 Платформа Android обнаружена');
                              
                            playerData.position = view.time || -1;
                              
                            if (typeof Lampa.Android !== 'undefined' && typeof Lampa.Android.openPlayer === 'function') {
                                Lampa.Android.openPlayer(url, playerData);
                                console.log('[ContinueWatch] ✅ Внешний плеер запущен через Lampa.Android.openPlayer');
                            } else if (typeof AndroidJS !== 'undefined' && typeof AndroidJS.openPlayer === 'function') {
                                AndroidJS.openPlayer(url, JSON.stringify(playerData));
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
                    console.log('[ContinueWatch] ⚠️ Параметры не найдены, запуск компонента torrents');
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
                console.log('[ContinueWatch] Link:', link);
                  
                if (data && data.timeline && data.timeline.hash) {
                    var hash = data.timeline.hash;
                    currentHash = hash;
                    
                    var file_name = extractFileName(link);
                    var torrent_link = extractTorrentLink(link);
                    var file_index = extractFileIndex(link);
                    
                    // ✅ Сохраняем только если это TorrServer URL
                    if (file_name !== null && torrent_link) {
                        saveUrlParams(hash, {
                            file_name: file_name,
                            torrent_link: torrent_link,
                            file_index: file_index,
                            title: data.title || 'Unknown',
                            season: data.season,
                            episode: data.episode
                        });
                    } else {
                        console.log('[ContinueWatch] ⚠️ Это не TorrServer URL, пропускаем');
                    }
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
                    
                    var file_name = extractFileName(data.url);
                    var torrent_link = extractTorrentLink(data.url);
                    var file_index = extractFileIndex(data.url);
                    
                    // ✅ Сохраняем только если это TorrServer URL
                    if (file_name !== null && torrent_link) {
                        saveUrlParams(hash, {
                            file_name: file_name,
                            torrent_link: torrent_link,
                            file_index: file_index,
                            title: data.title || 'Unknown',
                            season: data.season,
                            episode: data.episode
                        });
                    } else {
                        console.log('[ContinueWatch] ⚠️ Это не TorrServer URL, пропускаем');
                    }
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
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
