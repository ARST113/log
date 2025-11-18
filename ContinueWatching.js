"use strict";
(function () {
    'use strict';

    // ========================================================================
    // 1. ЛОГИКА CONTINUE WATCH (Внутренние функции)
    // ========================================================================

    // Настройки синхронизации
    Lampa.Storage.sync('continue_watch_params', 'object_object');

    function cleanupOldParams() {
        try {
            var params = Lampa.Storage.get('continue_watch_params', {});
            var now = Date.now();
            var changed = false;
            for (var hash in params) {
                if (params[hash].timestamp && now - params[hash].timestamp > 30 * 24 * 60 * 60 * 1000) {
                    delete params[hash];
                    changed = true;
                }
            }
            if (changed) Lampa.Storage.set('continue_watch_params', params);
        } catch (e) {}
    }

    function getStreamParams(movie) {
        if (!movie) return null;
        var title = movie.number_of_seasons ? movie.original_name || movie.original_title || movie.name || movie.title : movie.original_title || movie.original_name || movie.title || movie.name;
        if (!title) return null;

        var hash = Lampa.Utils.hash(title);

        // Логика для сериалов
        if (movie.number_of_seasons) {
            try {
                var last = Lampa.Storage.get('online_watched_last', '{}');
                if (typeof last === 'string') last = JSON.parse(last);
                var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title || title);
                var filed = last[titleHash];
                if (filed && filed.season !== undefined && filed.episode !== undefined) {
                    var separator = filed.season > 10 ? ':' : '';
                    hash = Lampa.Utils.hash([filed.season, separator, filed.episode, title].join(''));
                }
            } catch (e) {}
        }

        var params = Lampa.Storage.get('continue_watch_params', {});
        return params[hash] || params[Lampa.Utils.hash(title)] || null;
    }

    function buildStreamUrl(params) {
        if (!params || !params.file_name || !params.torrent_link) return null;
        var torrserver_url = Lampa.Storage.get('torrserver_url');
        var torrserver_url_two = Lampa.Storage.get('torrserver_url_two');
        var server_url = Lampa.Storage.field('torrserver_use_link') == 'two' ? torrserver_url_two || torrserver_url : torrserver_url || torrserver_url_two;

        if (!server_url) {
            Lampa.Noty.show('TorrServer не настроен');
            return null;
        }
        if (!server_url.match(/^https?:\/\//)) server_url = 'http://' + server_url;

        var url = server_url + '/stream/' + encodeURIComponent(params.file_name);
        var query = [];
        if (params.torrent_link) query.push('link=' + params.torrent_link);
        query.push('index=' + (params.file_index || 0));
        query.push(Lampa.Storage.field('torrserver_preload') ? 'preload' : 'play');

        return url + '?' + query.join('&');
    }

    function launchPlayer(movie, params) {
        var url = buildStreamUrl(params);
        if (!url) return;

        var title = movie.number_of_seasons ? movie.original_name || movie.original_title || movie.name || movie.title : movie.original_title || movie.original_name || movie.title || movie.name;
        var hash = Lampa.Utils.hash(title);

        if (params.season && params.episode) {
            var separator = params.season > 10 ? ':' : '';
            hash = Lampa.Utils.hash([params.season, separator, params.episode, title].join(''));
        }

        var view = Lampa.Timeline.view(hash);

        if (view) {
            view.handler = function (percent, time, duration) {
                Lampa.Timeline.update({ hash: hash, percent: percent, time: time, duration: duration });
            };
        }

        var playerData = {
            url: url,
            title: params.title || movie.title,
            card: movie,
            torrent_hash: params.torrent_link,
            timeline: view
        };

        if (view && view.percent > 0) Lampa.Noty.show('Восстанавливаем позицию...');

        Lampa.Player.play(playerData);
    }

    function patchPlayer() {
        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (params) {
            if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
                var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
                if (movie) {
                    var baseTitle = movie.number_of_seasons ? movie.original_name || movie.original_title : movie.original_title || movie.original_name;
                    if (baseTitle) {
                        var hash;
                        if (params.season && params.episode) {
                            var separator = params.season > 10 ? ':' : '';
                            hash = Lampa.Utils.hash([params.season, separator, params.episode, baseTitle].join(''));
                        } else {
                            hash = Lampa.Utils.hash(baseTitle);
                        }

                        if (hash) {
                            var matchFile = params.url && params.url.match(/\/stream\/([^?]+)/);
                            var matchLink = params.url && params.url.match(/[?&]link=([^&]+)/);
                            var matchIndex = params.url && params.url.match(/[?&]index=(\d+)/);

                            if (matchFile && matchLink) {
                                var store = Lampa.Storage.get('continue_watch_params', {});
                                store[hash] = {
                                    file_name: decodeURIComponent(matchFile[1]),
                                    torrent_link: matchLink[1],
                                    file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                    title: baseTitle,
                                    season: params.season,
                                    episode: params.episode,
                                    timestamp: Date.now()
                                };
                                Lampa.Storage.set('continue_watch_params', store);
                            }
                        }
                    }
                }
            }
            return originalPlay.call(this, params);
        };
    }

    // ========================================================================
    // 2. ИНТЕГРАЦИЯ КНОПКИ (Как в примере Multiparser)
    // ========================================================================

    function handleContinueClick(movieData) {
        var params = getStreamParams(movieData);
        if (!params) {
            Lampa.Noty.show('Нет сохраненной истории');
            return;
        }
        launchPlayer(movieData, params);
    }

    function setupContinueButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                
                // Проверяем наличие истории, чтобы решить, показывать ли кнопку
                // (Можно убрать проверку, если кнопка нужна всегда)
                var params = getStreamParams(e.data.movie);
                var labelText = 'Продолжить';
                if (params && params.season && params.episode) {
                    labelText += ' (S' + params.season + ' E' + params.episode + ')';
                }

                // Создаем кнопку с правильной структурой для Lampa (как в примере)
                var continueButtonHtml = `
                    <div class="full-start__button selector button--continue-watch" tabindex="0">
                        <div class="full-start__button-icon">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        </div>
                        <div class="full-start__button-text">${labelText}</div>
                    </div>
                `;

                var continueBtn = $(continueButtonHtml);
                
                // Обработчик (как в примере)
                continueBtn.on('hover:enter', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleContinueClick(e.data.movie);
                }).on('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleContinueClick(e.data.movie);
                });

                // Добавляем кнопку в правильное место (копия логики Multiparser)
                if (e.data && e.object) {
                    var activity = e.object.activity;
                    var render = activity.render();
                    
                    // Ищем кнопку торрентов
                    var torrentBtn = render.find('.view--torrent').last();
                    
                    if (torrentBtn.length) {
                        // Вставляем ПОСЛЕ кнопки торрентов
                        torrentBtn.after(continueBtn);
                    } else {
                        // Если кнопки торрентов нет, добавляем в конец контейнера кнопок
                        var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons');
                        if (buttonsContainer.length) {
                            buttonsContainer.append(continueBtn);
                        } else {
                            render.find('.full-start__button').last().after(continueBtn);
                        }
                    }
                    
                    console.log("[ContinueWatch] Кнопка добавлена");
                }
            }
        });
    }

    function add() {
        // Инициализация логики
        patchPlayer();
        cleanupOldParams();
        
        // Даем время Lampa полностью загрузиться (как в примере)
        setTimeout(function() {
            setupContinueButton();
        }, 2000);
    }

    function startPlugin() {
        window.plugin_continue_watch_ready = true;
        if (window.appready) {
            add();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type === 'ready') add();
            });
        }
    }

    if (!window.plugin_continue_watch_ready) startPlugin();
})();
