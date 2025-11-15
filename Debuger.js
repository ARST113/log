// Lampa.Plugin - Continue Watch DEBUG v1.0

(function() {
    'use strict';

    function startPlugin() {
        console.log('[ContinueWatch][DEBUG] Плагин запущен (DEBUG версия)');

        var currentHash = null;
        var activeButtons = {};

        function formatTime(seconds) {
            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);
            if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            return m + ':' + (s < 10 ? '0' : '') + s;
        }

        function extractFileName(url) {
            var match = url.match(/\/stream\/([^?]+)/);
            try { return match ? decodeURIComponent(match[1]) : null; } catch(e) { return match ? match[1] : null; }
        }
        function extractTorrentLink(url) {
            var match = url.match(/[?&]link=([^&]+)/);
            return match ? match[1] : null;
        }
        function extractFileIndex(url) {
            var match = url.match(/[?&]index=(\d+)/);
            return match ? parseInt(match[1]) : 0;
        }
        function buildStreamUrl(params) {
            var torrserver_url = Lampa.Storage.get('torrserver_url');
            var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
            var server_url = Lampa.Storage.field('torrserver_use_link') == 'two' ?
                (torrserver_url_two || torrserver_url) :
                (torrserver_url || torrserver_url_two);
            if (!server_url) return null;
            if (!server_url.match(/^https?:\/\//)) server_url = 'http://' + server_url;
            var encodedFileName = encodeURIComponent(params.file_name);
            var playMode = Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play';
            var url = server_url + '/stream/' + encodedFileName;
            var urlParams = [];
            if (params.torrent_link) urlParams.push('link=' + params.torrent_link);
            urlParams.push('index=' + params.file_index);
            urlParams.push(playMode);
            url += '?' + urlParams.join('&');
            return url;
        }
        function saveUrlParams(hash, data) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                if (!viewed[hash]) viewed[hash] = {duration: 0, time: 0, percent: 0, profile: 0};
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
                console.log('[ContinueWatch][DEBUG] ✓ Параметры сохранены в Timeline для hash:', hash);
            } catch(e) {
                console.error('[ContinueWatch][DEBUG] Ошибка сохранения параметров:', e);
            }
        }
        function getUrlParams(hash) {
            try {
                var viewed = Lampa.Storage.get(Lampa.Timeline.filename(), {});
                return viewed[hash] && viewed[hash].stream_params ? viewed[hash] : null;
            } catch(e) {
                console.error('[ContinueWatch][DEBUG] Ошибка чтения параметров:', e);
                return null;
            }
        }

        function createOrUpdateButton(movie, container) {
            var title = movie.number_of_seasons ?
                (movie.original_name || movie.original_title) :
                (movie.original_title || movie.original_name);
            console.log('[ContinueWatch][DEBUG] TITLE:', title);
            if (!title) {
                console.log('[ContinueWatch][DEBUG] no title, exit');
                return;
            }
            var hash = Lampa.Utils.hash(title);
            var view = Lampa.Timeline.view(hash);
            console.log('[ContinueWatch][DEBUG] INITIAL hash:', hash, 'timeline:', JSON.stringify(view));
            if (movie.number_of_seasons) {
                var last = Lampa.Storage.get('online_watched_last', '{}');
                if (typeof last === 'string') {
                    try { last = JSON.parse(last); } catch(e) { last = {}; }
                }
                var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title);
                var filed = last[titleHash];
                console.log('[ContinueWatch][DEBUG] last:', last, 'filed:', filed);
                if (filed && filed.season && filed.episode) {
                    hash = Lampa.Utils.hash([
                        filed.season,
                        filed.season > 10 ? ':' : '',
                        filed.episode,
                        movie.original_name || movie.original_title
                    ].join(''));
                    view = Lampa.Timeline.view(hash);
                    console.log('[ContinueWatch][DEBUG] series hash:', hash, 'timeline:', JSON.stringify(view));
                }
            }

            // Лог всех этапов прогресса
            console.log('[ContinueWatch][DEBUG] Проверка прогресса:', view.percent, 'hash:', hash);
            if (!view.percent) {
                console.log('[ContinueWatch][DEBUG] нет/нулевой прогресс, кнопка не будет добавлена, view:', view);
                return;
            }
            if (view.percent < 5) {
                console.log('[ContinueWatch][DEBUG] прогресс слишком маленький (<5%) percent:', view.percent);
                return;
            }
            if (view.percent > 95) {
                console.log('[ContinueWatch][DEBUG] прогресс слишком большой (>95%) percent:', view.percent);
                return;
            }

            var percent = view.percent;
            var timeStr = formatTime(view.time);
            var savedParams = getUrlParams(hash);
            var findContainer = container || $('.full-start-new__buttons, .full-start__buttons, .details-buttons, .full-start__bottom, [class*=start__buttons]');
            console.log('[ContinueWatch][DEBUG] CONTEXT:', {
                percent: percent,
                timeStr: timeStr,
                hash: hash,
                timeline: view,
                savedParams: !!savedParams,
                movie: movie,
                findContainer: findContainer.length
            });

            if (!findContainer.length) {
                console.log('[ContinueWatch][DEBUG] ❌ Не найден контейнер для кнопки');
                return;
            }

            console.log('[ContinueWatch][DEBUG] Добавляем кнопку "Продолжить просмотр"');
            var button = $('<div class="full-start__button selector button--continue-watch" style="position: relative; background: #dedede; color:black;">' +
                '<svg viewBox="0 0 24 24" width="24" height="24" fill="none">' +
                '<path d="M8 5v14l11-7L8 5z" fill="currentColor"/>' +
                '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" ' +
                'stroke-dasharray="' + (percent * 65.97 / 100).toFixed(2) + ' 65.97" transform="rotate(-90 12 12)"/>' +
                '</svg>' +
                '<span>Продолжить ' + percent + '% ('+timeStr+')</span>' +
                '</div>');
            button.on('hover:enter', function() {
                alert('[DEBUG] Кнопка "Продолжить просмотр": timeline ' + view.time + ' сек ('+ percent +'%)');
            });
            findContainer.prepend(button);
            console.log('[ContinueWatch][DEBUG] ✅ Кнопка добавлена на карточку');
        }

        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;
            console.log('[ContinueWatch][DEBUG] ========== Обработка карточки ==========');
            var movie = e.data.movie;
            var container = e.object.activity.render().find('.full-start-new__buttons, .full-start__buttons, .details-buttons, .full-start__bottom, [class*=start__buttons]');
            console.log('[ContinueWatch][DEBUG] Проверка контейнера:', container.length);
            createOrUpdateButton(movie, container);
            console.log('[ContinueWatch][DEBUG] ========================================');
        });

        Lampa.Timeline.listener.follow('update', function(data) {
            console.log('[ContinueWatch][DEBUG] Timeline обновлен, hash:', data.hash);
            if (data.hash && activeButtons[data.hash]) {
                var buttonData = activeButtons[data.hash];
                var container = buttonData.button.parent();
                if (container.length && $.contains(document, container[0])) {
                    console.log('[ContinueWatch][DEBUG] 🔄 Обновляем кнопку для hash:', data.hash);
                    createOrUpdateButton(buttonData.movie, container);
                } else {
                    delete activeButtons[data.hash];
                    console.log('[ContinueWatch][DEBUG] 🗑️ Кнопка удалена (контейнер не в DOM)');
                }
            }
        });

        Lampa.Activity.listener.follow('backward', function() {
            console.log('[ContinueWatch][DEBUG] Очистка активных кнопок');
            activeButtons = {};
        });
    }

    // Ждём загрузки Lampa перед запуском плагина
    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        console.error('[ContinueWatch][DEBUG] ❌ Lampa не найдена');
    }
})();
