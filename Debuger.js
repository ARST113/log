(function() {  
    'use strict';  
  
    function startPlugin() {  
        console.log('[ContinueWatch] 🔧 ВЕРСИЯ 7.0: ИСПРАВЛЕННАЯ');  
  
        var METADATA_KEY = 'torrent_stream_metadata';  
        var currentButton = null;  
  
        // ========== СОХРАНЕНИЕ МЕТАДАННЫХ ==========  
        function saveStreamMetadata(data) {  
            if (!data.torrent_hash || !data.timeline || !data.timeline.hash) return;  
              
            var metadata = {  
                torrent_link: data.torrent_hash,  
                file_name: data.path || data.title,  
                file_index: data.file_id || 0,  
                title: data.title,  
                season: data.season,  
                episode: data.episode,  
                timestamp: Date.now()  
            };  
              
            var stored = JSON.parse(localStorage.getItem(METADATA_KEY) || '{}');  
            stored[data.timeline.hash] = { stream_params: metadata };  
            localStorage.setItem(METADATA_KEY, JSON.stringify(stored));  
              
            console.log('[ContinueWatch] 💾 Метаданные сохранены для hash:', data.timeline.hash);  
        }  
  
        // Подписка на запуск плеера  
        Lampa.Listener.follow('player', function(e) {  
            if (e.type === 'start' && e.data && e.data.torrent_hash) {  
                saveStreamMetadata(e.data);  
            }  
        });  
  
        // ========== ПОЛУЧЕНИЕ МЕТАДАННЫХ ==========  
        function getStreamMetadata(hash) {  
            try {  
                var stored = JSON.parse(localStorage.getItem(METADATA_KEY) || '{}');  
                return stored[hash];  
            } catch(e) {  
                console.error('[ContinueWatch] ❌ Ошибка чтения:', e);  
                return null;  
            }  
        }  
  
        // ========== ЗАПУСК ANDROID ПЛЕЕРА ==========  
        function launchAndroidPlayer(streamParams, movie, hash) {  
            console.log('[ContinueWatch] 🚀 ЗАПУСК ANDROID ПЛЕЕРА');  
              
            var torrserver_url = Lampa.Storage.get('torrserver_url') || Lampa.Storage.get('torrserver_url_two');  
            if (!torrserver_url) {  
                Lampa.Noty.show('TorrServer не настроен');  
                return;  
            }  
              
            if (!torrserver_url.match(/^https?:\/\//)) {  
                torrserver_url = 'http://' + torrserver_url;  
            }  
              
            var url = torrserver_url + '/stream/' + encodeURIComponent(streamParams.file_name);  
            url += '?link=' + streamParams.torrent_link;  
            url += '&index=' + (streamParams.file_index || 0);  
            url += '&play';  
              
            console.log('[ContinueWatch] 🌐 URL:', url);  
              
            var view = Lampa.Timeline.view(hash);  
              
            var playerData = {  
                title: streamParams.title || movie.title,  
                poster: movie.poster_path,  
                media: movie.name ? 'tv' : 'movie',  
                timeline: {  
                    hash: hash,  
                    time: Math.round(view.time || 0),  
                    duration: Math.round(view.duration || 0),  
                    percent: view.percent || 0,  
                    handler: function(percent, time, duration) {  
                        Lampa.Timeline.update({  
                            hash: hash,  
                            percent: percent,  
                            time: time,  
                            duration: duration  
                        });  
                    }  
                }  
            };  
              
            if (streamParams.season) playerData.season = streamParams.season;  
            if (streamParams.episode) playerData.episode = streamParams.episode;  
              
            console.log('[ContinueWatch] 🎬 Данные плеера:', playerData);  
            console.log('[ContinueWatch] ⏱️ Позиция:', view.time + 'сек (' + view.percent + '%)');  
              
            try {  
                Lampa.Noty.show('Запуск Android плеера...');  
                Lampa.Android.openPlayer(url, JSON.stringify(playerData));  
                console.log('[ContinueWatch] ✅ Плеер запущен');  
            } catch(err) {  
                console.error('[ContinueWatch] ❌ Ошибка:', err);  
                Lampa.Noty.show('Ошибка: ' + err.message);  
            }  
        }  
  
        // ========== ОБРАБОТКА КНОПКИ ==========  
        function handleButtonClick(movie) {  
            console.log('[ContinueWatch] 🎬 Клик для:', movie.title);  
              
            var title = movie.number_of_seasons ?   
                (movie.original_name || movie.original_title) :   
                (movie.original_title || movie.original_name);  
              
            if (!title) {  
                Lampa.Noty.show('Ошибка: заголовок не найден');  
                return;  
            }  
              
            var hash = Lampa.Utils.hash(title);  
              
            // Для сериалов - найти последний эпизод  
            if (movie.number_of_seasons) {  
                var last = Lampa.Storage.get('online_watched_last', '{}');  
                if (typeof last === 'string') last = JSON.parse(last);  
                  
                var filed = last[Lampa.Utils.hash(title)];  
                if (filed && filed.season !== undefined && filed.episode !== undefined) {  
                    hash = Lampa.Utils.hash([filed.season, filed.episode, title].join(''));  
                    console.log('[ContinueWatch] 🔑 Episode hash:', hash);  
                }  
            }  
              
            var metadata = getStreamMetadata(hash);  
              
            if (metadata && metadata.stream_params) {  
                console.log('[ContinueWatch] ✅ Метаданные найдены');  
                launchAndroidPlayer(metadata.stream_params, movie, hash);  
            } else {  
                console.log('[ContinueWatch] ❌ Метаданные не найдены');  
                Lampa.Noty.show('Откройте файл хотя бы раз');  
                  
                setTimeout(function() {  
                    Lampa.Activity.push({  
                        url: '',  
                        title: movie.title || movie.name,  
                        component: 'torrents',  
                        movie: movie,  
                        page: 1  
                    });  
                }, 1000);  
            }  
        }  
  
        // ========== СОЗДАНИЕ КНОПКИ ==========  
        Lampa.Listener.follow('full', function(e) {  
            if (e.type !== 'complite') return;  
              
            var movie = e.data.movie;  
            var title = movie.original_title || movie.original_name;  
            if (!title) return;  
              
            var hash = Lampa.Utils.hash(title);  
              
            // Для сериалов  
            if (movie.number_of_seasons) {  
                var last = Lampa.Storage.get('online_watched_last', '{}');  
                if (typeof last === 'string') last = JSON.parse(last);  
                var filed = last[Lampa.Utils.hash(title)];  
                if (filed && filed.season && filed.episode) {  
                    hash = Lampa.Utils.hash([filed.season, filed.episode, title].join(''));  
                }  
            }  
              
            var view = Lampa.Timeline.view(hash);  
            if (!view.percent || view.percent < 5 || view.percent > 95) return;  
              
            var metadata = getStreamMetadata(hash);  
            if (!metadata || !metadata.stream_params) return;  
              
            console.log('[ContinueWatch] 🔘 Создание кнопки');  
              
            $('.button--continue-watch').remove();  
              
            var button = $('<div class="full-start__button selector button--continue-watch">' +  
                '<svg viewBox="0 0 24 24" width="24" height="24">' +  
                    '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +  
                '</svg>' +  
                '<span>Продолжить ' + view.percent + '%</span>' +  
                '</div>');  
              
            button.on('hover:enter', function() {  
                handleButtonClick(movie);  
            });  
              
            var container = e.object.activity.render().find('.full-start-new__buttons');  
            if (container.length) {  
                container.prepend(button);  
                currentButton = button;  
                console.log('[ContinueWatch] ✅ Кнопка добавлена');  
            }  
        });  
          
        console.log('[ContinueWatch] ✅ Версия 7.0 загружена');  
    }  
  
    if (window.Lampa && Lampa.Listener) {  
        startPlugin();  
    }  
})();
