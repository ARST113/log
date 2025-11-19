"use strict";
(function () {
    'use strict';

    // ========================================================================
    // ПЕРЕМЕННЫЕ КЭША (ОПТИМИЗАЦИЯ)
    // ========================================================================
    var MEMORY_CACHE = null;        // Кэш параметров просмотра
    var WATCHED_LAST_CACHE = null;  // Кэш истории просмотров (серии)
    var TORRSERVER_CACHE = null;    // Кэш URL торсервера
    var SAVE_TIMEOUT = null;        // Таймер для Debounce сохранения

    // ========================================================================
    // 1. СИСТЕМА КЭШИРОВАНИЯ И СИНХРОНИЗАЦИИ
    // ========================================================================
    
    Lampa.Storage.sync('continue_watch_params', 'object_object');

    // Слушаем изменения в хранилище (чтобы сбросить кэш, если прилетела синхра)
    Lampa.Storage.listener.follow('change', function(e) {
        if (e.name === 'continue_watch_params') MEMORY_CACHE = null;
        if (e.name === 'online_watched_last') WATCHED_LAST_CACHE = null;
        if (e.name === 'torrserver_url' || e.name === 'torrserver_url_two' || e.name === 'torrserver_use_link') TORRSERVER_CACHE = null;
    });

    function getParams() {
        if (!MEMORY_CACHE) MEMORY_CACHE = Lampa.Storage.get('continue_watch_params', {});
        return MEMORY_CACHE;
    }

    // Debounce для сохранения (не чаще раза в 500мс)
    function setParams(data) {
        MEMORY_CACHE = data;
        clearTimeout(SAVE_TIMEOUT);
        SAVE_TIMEOUT = setTimeout(function() {
            Lampa.Storage.set('continue_watch_params', data);
        }, 500);
    }

    // Оптимизированное получение истории просмотров
    function getWatchedLast() {
        if (!WATCHED_LAST_CACHE) {
            var last = Lampa.Storage.get('online_watched_last', '{}');
            WATCHED_LAST_CACHE = typeof last === 'string' ? JSON.parse(last) : last;
        }
        return WATCHED_LAST_CACHE;
    }

    // Оптимизированное получение URL Торсервера
    function getTorrServerUrl() {
        if (!TORRSERVER_CACHE) {
            var url = Lampa.Storage.get('torrserver_url');
            var url_two = Lampa.Storage.get('torrserver_url_two');
            var use_two = Lampa.Storage.field('torrserver_use_link') == 'two';
            var final_url = use_two ? (url_two || url) : (url || url_two);
            
            if (final_url) {
                if (!final_url.match(/^https?:\/\//)) final_url = 'http://' + final_url;
                final_url = final_url.replace(/\/$/, '');
            }
            TORRSERVER_CACHE = final_url;
        }
        return TORRSERVER_CACHE;
    }

    // ========================================================================
    // 2. ЛОГИКА
    // ========================================================================

    function formatTime(seconds) {
        if (!seconds) return '';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        return h > 0 ? 
            h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s : 
            m + ':' + (s < 10 ? '0' : '') + s;
    }

    function cleanupOldParams() {
        setTimeout(function() {
            try {
                var params = getParams();
                var now = Date.now();
                var changed = false;
                for (var hash in params) {
                    if (params[hash].timestamp && now - params[hash].timestamp > 30 * 24 * 60 * 60 * 1000) {
                        delete params[hash];
                        changed = true;
                    }
                }
                if (changed) setParams(params);
            } catch (e) {}
        }, 5000);
    }

    function getStreamParams(movie) {
        if (!movie) return null;
        var title = movie.number_of_seasons ? movie.original_name || movie.original_title || movie.name : movie.original_title || movie.title || movie.name;
        if (!title) return null;
        
        var hash = Lampa.Utils.hash(title);

        if (movie.number_of_seasons) {
            try {
                // ИСПОЛЬЗУЕМ КЭШ
                var last = getWatchedLast();
                var titleHash = Lampa.Utils.hash(movie.original_name || movie.original_title || title);
                var filed = last[titleHash];
                if (filed && filed.season !== undefined && filed.episode !== undefined) {
                    var separator = filed.season > 10 ? ':' : '';
                    hash = Lampa.Utils.hash([filed.season, separator, filed.episode, title].join(''));
                }
            } catch (e) {}
        }
        
        var params = getParams();
        return params[hash] || params[Lampa.Utils.hash(title)] || null;
    }

    function buildStreamUrl(params) {
        if (!params || !params.file_name || !params.torrent_link) return null;
        
        // ИСПОЛЬЗУЕМ КЭШ
        var server_url = getTorrServerUrl();

        if (!server_url) {
            Lampa.Noty.show('TorrServer не настроен');
            return null;
        }

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
                                var store = getParams();
                                store[hash] = {
                                    file_name: decodeURIComponent(matchFile[1]),
                                    torrent_link: matchLink[1],
                                    file_index: matchIndex ? parseInt(matchIndex[1]) : 0,
                                    title: baseTitle,
                                    season: params.season,
                                    episode: params.episode,
                                    timestamp: Date.now()
                                };
                                // Сохраняем через Debounce
                                setParams(store);
                            }
                        }
                    }
                }
            }
            return originalPlay.call(this, params);
        };
    }

    // ========================================================================
    // 3. ИНТЕГРАЦИЯ КНОПКИ
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

                    // getStreamParams теперь работает быстро благодаря кэшу
                    var params = getStreamParams(e.data.movie);
                    
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

                    var labelText = 'Продолжить';
                    if (params && params.season && params.episode) {
                        labelText += ' S' + params.season + ' E' + params.episode;
                    }
                    
                    if (timeStr) {
                        labelText += ' (' + timeStr + ')';
                    }

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
                    
                    // ТОЛЬКО HOVER:ENTER (как ты просил)
                    continueBtn.on('hover:enter', function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        handleContinueClick(e.data.movie);
                    });

                    var torrentBtn = render.find('.view--torrent').last();
                    var buttonsContainer = render.find('.full-start-new__buttons, .full-start__buttons').first();

                    if (torrentBtn.length) {
                        torrentBtn.after(continueBtn);
                    } else if (buttonsContainer.length) {
                        buttonsContainer.append(continueBtn);
                    } else {
                        render.find('.full-start__button').last().after(continueBtn);
                    }

                    Lampa.Controller.toggle('content'); 
                    console.log("[ContinueWatch] v15 (Optimized + Cached)");

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
