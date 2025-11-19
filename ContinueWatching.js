"use strict";
(function () {
    'use strict';

    // ========================================================================
    // 1. ЛОГИКА (Без изменений)
    // ========================================================================
    
    Lampa.Storage.sync('continue_watch_params', 'object_object');

    function formatTime(seconds) {
        if (!seconds) return '';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

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
    // 2. ИНТЕГРАЦИЯ КНОПКИ (НАТИВНАЯ СТРУКТУРА ДЛЯ АНИМАЦИИ)
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
            if (e.type === 'complite') {
                setTimeout(function() {
                    var activity = e.object.activity;
                    var render = activity.render();
                    
                    if (render.find('.button--continue-watch').length) return;

                    var params = getStreamParams(e.data.movie);
                    
                    // --- ПОДГОТОВКА ДАННЫХ ---
                    var percent = 0;
                    var timeStr = "";

                    if (params) {
                        var title = e.data.movie.number_of_seasons ? 
                            (e.data.movie.original_name || e.data.movie.original_title) : 
                            (e.data.movie.original_title || e.data.movie.original_name);
                        
                        var hash = Lampa.Utils.hash(title);
                        if (params.season && params.episode) {
                            var separator = params.season > 10 ? ':' : '';
                            hash = Lampa.Utils.hash([params.season, separator, params.episode, title].join(''));
                        }
                        
                        var view = Lampa.Timeline.view(hash);
                        if (view) {
                            percent = view.percent || 0;
                            timeStr = formatTime(view.time || 0);
                        }
                    }

                    // Текст кнопки
                    var labelText = 'Продолжить';
                    if (params && params.season && params.episode) {
                        labelText += ' S' + params.season + ' E' + params.episode;
                    }
                    
                    if (timeStr) {
                        labelText += ' (' + timeStr + ')';
                    }

                    // --- HTML КНОПКИ (НАТИВНАЯ СТРУКТУРА) ---
                    // ВАЖНО: Используем структуру <svg>...</svg><span>Текст</span>
                    // Именно наличие тега <span> позволяет Lampa автоматически сворачивать/разворачивать кнопку
                    var continueButtonHtml = `
                        <div class="full-start__button selector button--continue-watch">
                            <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                                <path d="M8 5v14l11-7L8 5z" fill="currentColor"/>
                                <circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.5" fill="none" 
                                    stroke-dasharray="${(percent * 65.97 / 100).toFixed(2)} 65.97" transform="rotate(-90 12 12)"/>
                            </svg>
                            <span>${labelText}</span>
                        </div>
                    `;

                    var continueBtn = $(continueButtonHtml);
                    
                    continueBtn.on('hover:enter click', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        handleContinueClick(e.data.movie);
                    });

                    // --- ВСТАВКА ---
                    var torrentBtn = render.find('.view--torrent').last();
                    var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

                    if (torrentBtn.length) {
                        torrentBtn.after(continueBtn);
                    } else if (buttonsContainer.length) {
                        buttonsContainer.append(continueBtn);
                    } else {
                        render.find('.full-start__button').last().after(continueBtn);
                    }

                    // Обновляем навигацию
                    Lampa.Controller.toggle('content'); 
                    console.log("[ContinueWatch] Кнопка добавлена (нативная структура)");

                }, 100); 
            }
        });
    }

    function add() {
        patchPlayer();
        cleanupOldParams();
        setupContinueButton();
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
