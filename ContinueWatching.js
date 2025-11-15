// Lampa.Plugin - Continue Watch v5.7 (CORS Fix)
(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch] ========================================');
        console.log('[ContinueWatch] ПЛАГИН "ПРОДОЛЖИТЬ ПРОСМОТР" v5.7');
        console.log('[ContinueWatch] ========================================');

        // ========== CORS FIX ==========
        function applyCorsFix() {
            console.log('[ContinueWatch] 🔧 Применяем CORS fix');
            
            // Перехватываем XMLHttpRequest для добавления CORS headers
            var originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
                if (url && url.includes('tsarea.tv')) {
                    this.withCredentials = true;
                    console.log('[ContinueWatch] ✅ CORS headers applied to:', url);
                }
                return originalOpen.apply(this, arguments);
            };

            // Перехватываем fetch для добавления CORS headers
            var originalFetch = window.fetch;
            window.fetch = function(resource, options) {
                if (typeof resource === 'string' && resource.includes('tsarea.tv')) {
                    options = options || {};
                    options.mode = 'cors';
                    options.credentials = 'include';
                    console.log('[ContinueWatch] ✅ CORS fix applied to fetch:', resource);
                }
                return originalFetch(resource, options);
            };

            // Патч для Video элемента
            var originalSetAttribute = HTMLVideoElement.prototype.setAttribute;
            HTMLVideoElement.prototype.setAttribute = function(name, value) {
                if (name === 'src' && value && value.includes('tsarea.tv')) {
                    console.log('[ContinueWatch] ✅ CORS fix for video src:', value);
                    // Добавляем crossOrigin атрибут
                    originalSetAttribute.call(this, 'crossOrigin', 'anonymous');
                }
                return originalSetAttribute.apply(this, arguments);
            };
        }

        // ========== УЛУЧШЕННАЯ ФУНКЦИЯ BUILD STREAM URL ==========
        function buildStreamUrl(params) {
            console.log('[ContinueWatch] 🛠️ Сборка URL из параметров:', params);
            
            // Сначала пробуем использовать встроенный Torserver.stream
            if (typeof Lampa.Torserver !== 'undefined' && Lampa.Torserver.stream && params.path && params.torrent_link) {
                try {
                    var url = Lampa.Torserver.stream(
                        params.path,
                        params.torrent_link,
                        params.file_index
                    );
                    console.log('[ContinueWatch] ✅ URL сформирован через Torserver.stream():', url);
                    
                    // ✅ ДОБАВЛЕНО: Добавляем timestamp для избежания кэширования CORS
                    url += (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
                    return url;
                } catch(e) {
                    console.error('[ContinueWatch] ❌ Ошибка Torserver.stream():', e);
                }
            }
            
            // Fallback: ручное формирование URL
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
            
            // ✅ ДОБАВЛЕНО: Добавляем timestamp для избежания кэширования CORS
            url += '&_t=' + Date.now();
            
            console.log('[ContinueWatch] ✅ Собранный URL (fallback):', url);
            return url;
        }

        // ========== УЛУЧШЕННЫЙ ЗАПУСК ПЛЕЕРА ==========
        function launchPlayer(url, currentSavedParams, currentView, currentData) {
            var playerData = {
                url: url,
                title: currentSavedParams.stream_params.title,
                timeline: currentView,
                card: currentData.movie,
                continue_play: true,
                torrent_hash: currentSavedParams.stream_params.torrent_link
            };
            
            // ✅ ДОБАВЛЕНО: CORS атрибуты для video
            playerData.cors = true;
            playerData.crossOrigin = 'anonymous';
            
            // Сохраняем дополнительные параметры
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
            
            console.log('[ContinueWatch] 🎬 Запуск плеера с CORS fix:', url);
            
            // Показываем уведомление о запуске
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
                
                console.log('[ContinueWatch] 🖥️ Запуск встроенного плеера с CORS fix');
                
                // ✅ ДОБАВЛЕНО: Патч для Lampa.Player с CORS поддержкой
                patchLampaPlayerForCors();
                
                Lampa.Player.play(playerData);
                
            } catch(err) {
                console.error('[ContinueWatch] ❌ Ошибка запуска:', err);
                Lampa.Noty.show('Ошибка запуска: ' + err.message);
                showSourceReselectDialog(currentData.movie);
            }
        }

        // ========== ПАТЧ ДЛЯ LAMPA PLAYER CORS ==========
        function patchLampaPlayerForCors() {
            if (window.lampaPlayerCorsPatched) return;
            
            console.log('[ContinueWatch] 🔧 Патч Lampa Player для CORS');
            
            // Перехватываем создание video элемента
            var originalCreateVideo = Lampa.Player.createVideo;
            if (originalCreateVideo) {
                Lampa.Player.createVideo = function() {
                    var video = originalCreateVideo();
                    console.log('[ContinueWatch] ✅ Video element created with CORS attributes');
                    video.crossOrigin = 'anonymous';
                    video.setAttribute('crossorigin', 'anonymous');
                    return video;
                };
            }
            
            window.lampaPlayerCorsPatched = true;
        }

        // ========== ПРОВЕРКА И АВТОМАТИЧЕСКОЕ ИСПРАВЛЕНИЕ CORS ==========
        function checkAndFixCors() {
            // Проверяем, открыт ли сайт с www или без
            var currentOrigin = window.location.origin;
            var expectedOrigin = 'http://lampa.mx';
            
            if (currentOrigin !== expectedOrigin) {
                console.log('[ContinueWatch] 🔄 Обнаружено несовпадение origin:', {
                    current: currentOrigin,
                    expected: expectedOrigin
                });
                
                // Применяем CORS fix
                applyCorsFix();
                
                // Показываем предупреждение пользователю
                setTimeout(function() {
                    Lampa.Noty.show('Применены исправления для CORS...');
                }, 1000);
            }
        }

        // ========== ИНИЦИАЛИЗАЦИЯ ==========
        
        // Применяем CORS fix при загрузке
        applyCorsFix();
        checkAndFixCors();
        
        // Дальнейшая инициализация плагина...
        // [ОСТАЛЬНОЙ КОД ПЛАГИНА ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ]
        
        console.log('[ContinueWatch] 🚀 Плагин успешно загружен v5.7 с CORS fix');
    }

    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch] ❌ Lampa не найдена');
    }
})();
