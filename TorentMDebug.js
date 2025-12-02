(function () {
    'use strict';

    console.log('[MusicPlugin] Init v7.3 (Granular Focus)');

    var SERVER = {};
    var timers = {};
    var formats_set = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma', 'dsd', 'dsf', 'alac', 'dts', 'ac3']);
    var images_set = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
    var searchCache = new Map();

    var music_css = `
        /* --- MINI PLAYER --- */
        .music-player {
            display: flex;
            align-items: center;
            height: 100%;
            margin-right: 15px;
            position: relative;
        }
        .music-player.hide { display: none !important; }

        /* Контейнер - всегда темный/стеклянный */
        .music-player__container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(30, 30, 30, 0.6); 
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 30px;
            padding: 0 8px 0 15px;
            height: 42px;
            min-width: 180px;
            gap: 8px;
            transition: border-color .3s;
        }
        
        /* Легкая подсветка рамки контейнера при активности внутри */
        .music-player__container:hover {
            border-color: rgba(255, 255, 255, 0.3);
        }

        /* Инфо (текст) */
        .music-player__info {
            display: flex; 
            flex-direction: column; 
            justify-content: center;
            max-width: 140px;
            overflow: hidden;
            cursor: pointer;
            height: 100%;
            padding: 0 8px;
            border-radius: 8px;
            transition: background .2s;
            margin-right: auto;
        }
        
        /* Фокус на тексте (пульт или мышь) */
        .music-player__info.focus,
        .music-player__info:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .music-player__title {
            font-size: 13px; font-weight: 600; color: #fff;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            line-height: 1.1;
        }
        .music-player__artist {
            font-size: 10px; color: rgba(255,255,255,0.6);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            line-height: 1.1;
        }

        /* Группа кнопок */
        .music-player__controls-mini {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* Общий стиль для кнопок (Action, Prev, Next) */
        .music-player__btn-mini,
        .music-player__action {
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            color: #fff; /* Иконка белая по умолчанию */
            background: rgba(255,255,255,0.05); /* Слегка заметный фон */
        }

        /* Размеры кнопок */
        .music-player__btn-mini { width: 28px; height: 28px; }
        .music-player__action { width: 34px; height: 34px; flex-shrink: 0; }

        /* === ГЛАВНЫЙ ФОКУС (КАК В LAMPA) === */
        /* При наведении мышью ИЛИ фокусе с пульта */
        
        .music-player__btn-mini.focus,
        .music-player__btn-mini:hover,
        .music-player__action.focus,
        .music-player__action:hover {
            background: #fff !important;  /* Фон белый */
            color: #000 !important;       /* Иконка черная */
            transform: scale(1.1);        /* Чуть увеличиваем */
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }

        /* SVG иконки */
        .music-player__btn-mini svg,
        .music-player__action svg {
            width: 14px; height: 14px; 
            fill: currentColor; /* Берет цвет от родителя (белый или черный) */
            pointer-events: none;
        }

        /* Play Icon specific */
        .music-player__play-icon {
            display: block; margin-left: 2px;
        }

        /* Визуалайзер */
        .music-player__visualizer {
            display: none; align-items: flex-end; gap: 2px; height: 14px; margin-bottom: 2px;
        }
        .music-player__bar {
            width: 3px; background-color: #4CAF50; border-radius: 1px;
            animation: sound 0ms -800ms linear infinite alternate;
        }
        /* Если кнопка в фокусе (белая), можно сделать бары чуть темнее или оставить зелеными */
        
        @keyframes sound { 0% { height: 3px; } 100% { height: 14px; } }
        .music-player__bar:nth-child(1) { animation-duration: 474ms; }
        .music-player__bar:nth-child(2) { animation-duration: 433ms; }
        .music-player__bar:nth-child(3) { animation-duration: 407ms; }
        .music-player__bar:nth-child(4) { animation-duration: 458ms; }

        .music-player.playing .music-player__play-icon { display: none; }
        .music-player.playing .music-player__visualizer { display: flex; }

        /* Loading */
        .music-player.loading .music-player__action svg,
        .music-player.loading .music-player__visualizer { display: none !important; }
        .music-player.loading .music-player__action:after {
            content: ""; display: block; border: 2px solid currentColor;
            border-top: 2px solid transparent; width: 14px; height: 14px;
            border-radius: 50%; animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }


        /* --- FULLSCREEN --- */
        .music-fullscreen { display: flex; flex-direction: column; height: 100%; }
        .full-player { padding: 40px 20px; text-align: center; max-width: 800px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; align-items: center; }
        .full-player__controls-row { display: flex; justify-content: center; align-items: center; gap: 40px; margin-bottom: 40px; }
        .full-player__btn { width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
        .full-player__btn:hover, .full-player__btn.focus { background: rgba(255,255,255,0.3); transform: scale(1.1); }
        .full-player__btn svg { width: 24px; height: 24px; fill: #fff; }
        .full-player__btn--play { width: 90px; height: 90px; background: #4CAF50; box-shadow: 0 10px 30px rgba(76,175,80,0.4); }
        .full-player__slider-container { width: 100%; max-width: 700px; margin-bottom: 30px; display: flex; align-items: center; gap: 20px; }
        .full-player__time { font-size: 16px; color: #ccc; font-family: monospace; width: 50px; }
        .full-player__slider { flex: 1; height: 30px; display: flex; align-items: center; cursor: pointer; position: relative; }
        .full-player__slider-bg { width: 100%; height: 6px; background: rgba(255,255,255,0.15); border-radius: 3px; position: absolute; }
        .full-player__slider-fill { height: 6px; background: #4CAF50; border-radius: 3px; width: 0%; position: absolute; pointer-events: none; }
        .full-player__slider-thumb { width: 20px; height: 20px; background: #fff; border-radius: 50%; position: absolute; transform: translateX(-50%); box-shadow: 0 2px 8px rgba(0,0,0,0.6); pointer-events: none; left: 0%; }
        .music-albums { padding: 0 20px 50px; }
        .music-album__header { margin: 25px 0 10px; padding-bottom: 8px; border-bottom: 2px solid rgba(255,255,255,0.05); display: flex; align-items: baseline; }
        .music-album__artist { font-size: 22px; font-weight: bold; color: #fff; margin-right: 15px; }
        .music-album__title { font-size: 16px; color: #4CAF50; }
        .music-item { display: flex; align-items: center; padding: 12px 15px; margin-bottom: 4px; background: rgba(255,255,255,0.03); border-radius: 8px; transition: all 0.2s; cursor: pointer; }
        .music-item.focus { background: rgba(255,255,255,0.15); transform: scale(1.01); }
        .music-item.active { background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.3); }
        .music-item__info { flex: 1; min-width: 0; margin: 0 15px; display: flex; flex-direction: column; }
        .music-item__title { font-size: 16px; color: #fff; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .music-item__meta { font-size: 12px; color: #aaa; margin-top: 4px; }
        @media screen and (max-width: 700px) { .music-player { margin-right: 0; } .music-player__info { display: none; } }
    `;

    var templates = {
        music_player: `
            <div class="music-player stop hide">
                <div class="music-player__container">
                    <!-- Text Info (Selector) -->
                    <div class="music-player__info selector" title="Open Player">
                        <div class="music-player__title">Title</div>
                        <div class="music-player__artist">Artist</div>
                    </div>

                    <!-- Controls -->
                    <div class="music-player__controls-mini">
                        <!-- Prev (Selector) -->
                        <div class="music-player__btn-mini music-player__prev selector">
                            <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                        </div>

                        <!-- Action (Selector) -->
                        <div class="music-player__action selector">
                            <svg class="music-player__play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            <div class="music-player__visualizer">
                                <div class="music-player__bar"></div><div class="music-player__bar"></div>
                                <div class="music-player__bar"></div><div class="music-player__bar"></div>
                            </div>
                        </div>

                        <!-- Next (Selector) -->
                        <div class="music-player__btn-mini music-player__next selector">
                            <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z"/></svg>
                        </div>
                    </div>
                </div>
            </div>`,
            
        music_item: `
            <div class="selector music-item">
                <div class="music-item__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18V5l12-2v13"></path>ircle cx="6" cy="18" r="3"></circle>ircle cx="18" cy="16" r="3"></circle></svg></div>
                <div class="music-item__info"><div class="music-item__title">{title}</div><div class="music-item__meta">{format} • {size}</div></div>
            </div>`,
            
        full_player: `
            <div class="full-player">
                <div class="full-player__controls-row">
                    <div class="full-player__btn full-player__prev selector"><svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></div>
                    <div class="full-player__btn full-player__btn--play full-player__play selector"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                    <div class="full-player__btn full-player__next selector"><svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z"/></svg></div>
                </div>
                <div class="full-player__slider-container">
                    <div class="full-player__time full-player__time-current">0:00</div>
                    <div class="full-player__slider selector">
                        <div class="full-player__slider-bg"></div>
                        <div class="full-player__slider-fill"></div>
                        <div class="full-player__slider-thumb"></div>
                    </div>
                    <div class="full-player__time full-player__time-total">0:00</div>
                </div>
            </div>`
    };

    function fillTemplate(html, data) {
        var output = html;
        for (var key in data) output = output.replace(new RegExp('{' + key + '}', 'g'), data[key]);
        return output;
    }
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return "0:00";
        var min = Math.floor(seconds / 60);
        var sec = Math.floor(seconds % 60);
        return min + ":" + (sec < 10 ? "0" + sec : sec);
    }

    function createMusicPlayer() {
        var html = $(templates.music_player);
        var audio = new Audio();
        var currentPlaylist = [];
        var currentTrackIndex = 0;
        var playTimer = null;
        var _this = this;
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";

        audio.addEventListener("timeupdate", function() {
            if (audio.duration && $('.full-player').length) {
                var percent = (audio.currentTime / audio.duration) * 100;
                $('.full-player__slider-fill').css('width', percent + '%');
                $('.full-player__slider-thumb').css('left', percent + '%');
                $('.full-player__time-current').text(formatTime(audio.currentTime));
                $('.full-player__time-total').text(formatTime(audio.duration));
            }
        });

        audio.addEventListener("play", function () { updateState(true); });
        audio.addEventListener("pause", function () { updateState(false); });
        audio.addEventListener("ended", function () { _this.next(); });
        audio.addEventListener("error", function () { updateState(false); html.removeClass('loading'); });
        audio.addEventListener("waiting", function() { html.addClass('loading'); });
        audio.addEventListener("canplay", function() { html.removeClass('loading'); });

        function updateState(isPlaying) {
            html.toggleClass('stop', !isPlaying);
            html.toggleClass('playing', isPlaying);
            html.toggleClass('loading', false);
            var fullPlayBtn = $('.full-player__play svg');
            if (fullPlayBtn.length) {
                fullPlayBtn.html(isPlaying ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' : '<path d="M8 5v14l11-7z"/>');
            }
        }

        this.create = function () {
            if ($('.head__actions .music-player').length === 0) {
                $('.head__actions .open--search').before(html);
            }
        };

        this.setPlaylist = function (playlist) { currentPlaylist = playlist; };
        
        this.play = function (track, playlist) {
            if (playlist) currentPlaylist = playlist;
            currentTrackIndex = currentPlaylist.findIndex(function(t) { return t.url === track.url; });
            if (currentTrackIndex === -1) currentTrackIndex = 0;
            clearTimeout(playTimer);
            var artist = track.artist || track.album || 'Unknown';
            html.find('.music-player__title').text(track.title);
            html.find('.music-player__artist').text(artist);

            if ($('.full-player').length) {
                $('.music-item').removeClass('active').css('background', '');
                $('.music-item').eq(currentTrackIndex).addClass('active').css('background', 'rgba(76, 175, 80, 0.2)');
                $('.full-player__slider-fill').css('width', '0%');
                $('.full-player__slider-thumb').css('left', '0%');
                $('.full-player__time-current').text('0:00');
            }
            html.removeClass('hide');
            html.addClass('loading');
            playTimer = setTimeout(function() { _this.playTrack(track); }, 200);
        };

        this.playTrack = function(track) {
            audio.pause();
            audio.src = '';
            setTimeout(function() {
                audio.src = track.url;
                audio.load();
                audio.play().catch(function(e){ console.error(e); });
            }, 100);
        };

        this.toggle = function() { if (audio.paused) audio.play().catch(function(){}); else audio.pause(); };
        this.next = function() { if (currentPlaylist.length > 0) { currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length; this.play(currentPlaylist[currentTrackIndex], currentPlaylist); } };
        this.prev = function() { if (currentPlaylist.length > 0) { currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length; this.play(currentPlaylist[currentTrackIndex], currentPlaylist); } };
        this.forward = function() { if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); };
        this.rewind = function() { if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 10); };
        this.seek = function(percentage) { if (audio.duration) audio.currentTime = audio.duration * percentage; };

        this.showFullScreen = function() {
            if (currentPlaylist.length === 0) return;
            var modal = $('<div class="music-fullscreen"></div>');
            modal.append(templates.full_player);
            var list = $('<div class="music-albums" style="flex: 1; overflow-y: auto; margin-top: 20px;"></div>');
            currentPlaylist.forEach(function(t, i) {
                var item = $(fillTemplate(templates.music_item, { title: (i+1) + '. ' + t.title, format: t.format || 'MP3', size: '' }));
                if (i === currentTrackIndex) item.addClass('active').css('background', 'rgba(76, 175, 80, 0.2)');
                item.on('hover:enter', function() { _this.play(t, currentPlaylist); });
                list.append(item);
            });
            modal.append(list);
            Lampa.Modal.open({ title: '', html: modal, size: 'full', mask: true, onBack: function() { Lampa.Modal.close(); Lampa.Controller.toggle('head'); } });
            
            $('.full-player__prev').on('hover:enter', function(){ _this.prev(); });
            $('.full-player__next').on('hover:enter', function(){ _this.next(); });
            $('.full-player__play').on('hover:enter', function(){ _this.toggle(); });
            
            var slider = $('.full-player__slider');
            slider.on('click', function(e) {
                var offset = $(this).offset();
                var relX = e.pageX - offset.left;
                var percentage = relX / $(this).width();
                _this.seek(Math.max(0, Math.min(1, percentage)));
            });
            slider.on('hover:enter', function() { _this.toggle(); });
            slider.on('hover:left', function() { _this.rewind(); });
            slider.on('hover:right', function() { _this.forward(); });
            
            Lampa.Controller.add('music_fullscreen', {
                toggle: function(){},
                up: function(){ if (Navigator.canmove('up')) Navigator.move('up'); },
                down: function(){ if (Navigator.canmove('down')) Navigator.move('down'); },
                left: function(){ var f = Navigator.focused(); if (f === slider[0]) _this.rewind(); else if (Navigator.canmove('left')) Navigator.move('left'); },
                right: function(){ var f = Navigator.focused(); if (f === slider[0]) _this.forward(); else if (Navigator.canmove('right')) Navigator.move('right'); },
                enter: function(){ var f = Navigator.focused(); if (f) $(f).trigger('hover:enter'); },
                back: function(){ Lampa.Modal.close(); Lampa.Controller.toggle('head'); }
            });
            Lampa.Controller.toggle('music_fullscreen');
            Lampa.Controller.collectionFocus($('.full-player__play')[0], modal);
            updateState(!audio.paused);
        };

        // Bindings for Mini Player
        html.find('.music-player__info').on('hover:enter', function () { _this.showFullScreen(); });
        html.find('.music-player__action').on('hover:enter', function () { _this.toggle(); });
        html.find('.music-player__prev').on('hover:enter', function () { _this.prev(); });
        html.find('.music-player__next').on('hover:enter', function () { _this.next(); });
    }

    function start(element, movie) { SERVER.object = element; if (movie) SERVER.movie = movie; if (Lampa.Torserver.url()) { loading(); connect(); } else install(); }
    function loading() { Lampa.Modal.open({ title: '', html: Lampa.Template.get('modal_loading'), size: 'large', mask: true, onBack: function onBack() { Lampa.Modal.close(); close(); } }); }
    function connect() { Lampa.Torserver.connected(function () { hash(); }, function () { Lampa.Torserver.error(); }); }
    function hash() { var title = SERVER.object.Title || SERVER.object.title || 'Unknown'; var magnet = SERVER.object.MagnetUri || SERVER.object.Link; Lampa.Torserver.hash({ title: title, link: magnet, poster: SERVER.object.poster, data: { lampa: true, movie: SERVER.movie } }, function (json) { SERVER.hash = json.hash; files(); }, function (echo) { Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('title_error'), text: 'Ошибка добавления: ' + (echo || 'Unknown') })); }); }
    function files() { var repeat = 0, maxAttempts = 60, ts_url = Lampa.Torserver.url(), endpoint = ts_url.replace(/\/$/, '') + '/torrents'; timers.files = setInterval(function () { repeat++; fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify({ action: 'get', hash: SERVER.hash }) }).then(function(response) { return response.json(); }).then(function(json) { if (json && json.file_stats && json.file_stats.length > 0) { clearInterval(timers.files); show(json.file_stats); } }).catch(function(err) {}); if (repeat >= maxAttempts) { Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('title_error'), text: Lampa.Lang.translate('torrent_parser_timeout') })); Lampa.Torserver.clear(); Lampa.Torserver.drop(SERVER.hash); clearInterval(timers.files); } }, 1500); }
    function install() { Lampa.Modal.open({ title: '', html: Lampa.Template.get('torrent_install', {}), size: 'large', onBack: function onBack() { Lampa.Modal.close(); Lampa.Controller.toggle('content'); } }); }
    function close() { Lampa.Torserver.drop(SERVER.hash); Lampa.Torserver.clear(); clearInterval(timers.files); SERVER = {}; }
    var network = new Lampa.Reguest();
    function get(params = {}, oncomplite, onerror) { var safeParamsForKey = { search: params.search, query: params.query, page: params.page || 1, type: Lampa.Storage.field('parser_torrent_type') }; var cacheKey = JSON.stringify(safeParamsForKey); if (searchCache.has(cacheKey)) { oncomplite(searchCache.get(cacheKey)); return; } function complite(data) { searchCache.set(cacheKey, data); oncomplite(data); } var parserType = Lampa.Storage.field('parser_torrent_type'); if (parserType == 'jackett') jackett(Lampa.Utils.checkEmptyUrl(Lampa.Storage.field('jackett_url')), params, complite, onerror); else if (parserType == 'prowlarr') prowlarr(Lampa.Utils.checkEmptyUrl(Lampa.Storage.field('prowlarr_url')), params, complite, onerror); else if (parserType == 'torrserver') { var url = Lampa.Utils.checkEmptyUrl(Lampa.Storage.field(Lampa.Storage.field('torrserver_use_link') == 'two' ? 'torrserver_url_two' : 'torrserver_url')); torrserver(url, params, complite, onerror); } else onerror(Lampa.Lang.translate('torrent_parser_set_link')); }
    function jackett(url, params, oncomplite, onerror) { var u = url + '/api/v2.0/indexers/all/results?apikey=' + Lampa.Storage.field('jackett_key') + '&Category[]=3000&Query=' + encodeURIComponent(params.search); network.native(u, function (json) { if (json.Results) { var results = json.Results.map(function(el) { return { title: el.Title, Title: el.Title, Tracker: el.Tracker, size: Lampa.Utils.bytesToSize(el.Size), PublishDate: el.PublishDate, Seeders: el.Seeders, Peers: el.Peers, MagnetUri: el.MagnetUri || el.Link, hash: Lampa.Utils.hash(el.Title) }; }); oncomplite({ Results: results }); } else onerror(''); }, onerror); }
    function prowlarr(url, params, oncomplite, onerror) { var q = [{name:'apikey',value:Lampa.Storage.field('prowlarr_key')}, {name:'query',value:params.search}, {name:'categories',value:'3000'}, {name:'type',value:'search'}]; var u = Lampa.Utils.buildUrl(url, '/api/v1/search', q); network.native(u, function (json) { if (Array.isArray(json)) { var results = json.filter(function(e) { return e.protocol === 'torrent'; }).map(function(e) { return { title: e.title, Title: e.title, Tracker: e.indexer, size: Lampa.Utils.bytesToSize(e.size), PublishDate: e.publishDate, Seeders: e.seeders, Peers: e.leechers, MagnetUri: e.downloadUrl, hash: Lampa.Utils.hash(e.title) }; }); oncomplite({ Results: results }); } else onerror(''); }, onerror); }
    function torrserver(url, params, oncomplite, onerror) { var u = Lampa.Utils.buildUrl(url, '/search/', [{ name: 'query', value: params.search }]); network.native(u, function (json) { if (Array.isArray(json)) { var results = json.map(function(e) { return { title: e.Title, Title: e.Title, Tracker: e.Tracker, size: e.Size, PublishDate: e.CreateDate, Seeders: e.Seed, Peers: e.Peer, MagnetUri: e.Magnet, hash: Lampa.Utils.hash(e.Title) }; }); oncomplite({ Results: results }); } else onerror(''); }, onerror); }
    function show(files) { try { var coversMap = {}, albums = {}, allImages = []; if (!files || !Array.isArray(files)) return; for (var i = 0; i < files.length; i++) { var file = files[i]; if (!file.path) continue; var ext = file.path.split('.').pop().toLowerCase(); var dir = file.path.substring(0, file.path.lastIndexOf('/')); if (images_set.has(ext)) { file.dir = dir; allImages.push(file); } } for (var i = 0; i < files.length; i++) { var file = files[i]; if (!file.path) continue; var ext = file.path.split('.').pop().toLowerCase(); var pathParts = file.path.split('/'); var dir = file.path.substring(0, file.path.lastIndexOf('/')); if (formats_set.has(ext)) { var trackName = pathParts[pathParts.length - 1].replace('.' + ext, ''); var albumName = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : 'Unknown Album'; var artistName = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : 'Unknown Artist'; var albumKey = artistName + '||' + albumName; if(!albums[albumKey]) albums[albumKey] = { artist: artistName, album: albumName, dir: dir, tracks: [], cover: null }; albums[albumKey].tracks.push({ file: file, title: trackName, format: ext.toUpperCase() }); } } var sortedAlbums = Object.values(albums).sort(function(a,b){ return a.artist.localeCompare(b.artist); }); if (sortedAlbums.length === 0) { Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('empty_title'), text: 'Аудио файлы не найдены' })); return; } sortedAlbums.forEach(function(album) { var bestImage = null; var albumImages = allImages.filter(function(img) { return img.dir === album.dir; }); if (albumImages.length === 0) { var parentDir = album.dir.substring(0, album.dir.lastIndexOf('/')); albumImages = allImages.filter(function(img) { return img.dir === parentDir; }); } if (albumImages.length > 0) { var priorities = ['cover', 'folder', 'front', 'album', 'art']; for (var p = 0; p < priorities.length; p++) { var found = albumImages.find(function(img) { return img.path.toLowerCase().indexOf(priorities[p]) > -1; }); if (found) { bestImage = found; break; } } if (!bestImage) { albumImages.sort(function(a, b) { return b.length - a.length; }); bestImage = albumImages[0]; } } if (bestImage) { album.cover = Lampa.Torserver.stream(bestImage.path, SERVER.hash, bestImage.id).replace('&play', '').replace('?play', '?'); if (album.cover.slice(-1) === '?') album.cover = album.cover.slice(0, -1); } else album.cover = './img/img_broken.svg'; album.tracks.sort(function(a,b){ return a.file.path.localeCompare(b.file.path, undefined, {numeric: true}); }); }); renderList(sortedAlbums); } catch (e) { Lampa.Modal.update(Lampa.Template.get('error', { title: 'Render Error', text: e.message })); } }
    function renderList(albums) { var html = $('<div class="music-albums"></div>'); var allTracksPlaylist = []; albums.forEach(function(album) { var header = $(`<div class="music-album__header"><div class="music-album__artist">${album.artist}</div><div class="music-album__title">${album.album}</div></div>`); html.append(header); album.tracks.forEach(function(trackObj) { var file = trackObj.file; var trackUrl = Lampa.Torserver.stream(file.path, SERVER.hash, file.id); trackUrl += (trackUrl.indexOf('?') > -1 ? '&play' : '?play'); var trackData = { title: trackObj.title, artist: album.artist, album: album.album, url: trackUrl, img: album.cover, from_music_search: true, format: trackObj.format }; allTracksPlaylist.push(trackData); var itemHtml = fillTemplate(templates.music_item, { title: trackObj.title, format: trackObj.format, size: Lampa.Utils.bytesToSize(file.length) }); var item = $(itemHtml); item.on('hover:enter', function() { window.musicPlayer.play(trackData, allTracksPlaylist); }); html.append(item); }); }); Lampa.Modal.update(html); var firstItem = html.find('.music-item').first(); if (firstItem.length) Lampa.Controller.collectionFocus(firstItem, Lampa.Modal.scroll().render()); }
    function component(object) { var scroll = new Lampa.Scroll({mask: false, over: true}); var files = new Lampa.Explorer(object); var filter = new Lampa.Filter(object); var results = []; var filtred = []; var last = false; var filterTimeout; files.clear = function() { scroll.clear(); }; this.destroy = function() { clearTimeout(filterTimeout); network.clear(); files.destroy(); scroll.destroy(); results = null; }; var filter_items = { format: [Lampa.Lang.translate('torrent_parser_any_two')], year: [Lampa.Lang.translate('torrent_parser_any_two')] }; var known_formats = ['FLAC', 'MP3', 'WAV', 'AAC', 'DSD', 'SACD', 'APE', 'DTS', 'AC3']; var i = 50, y = new Date().getFullYear(); while (i--) filter_items.year.push((y - (49 - i)) + ''); scroll.minus(files.render().find('.explorer__files-head')); scroll.body().addClass('torrent-list'); this.create = function () { return this.render(); }; this.render = function () { return files.render(); }; this.start = function () { Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie)); Lampa.Controller.add('lmeMusicSearch', { toggle: function () { Lampa.Controller.collectionSet(scroll.render()); Lampa.Controller.collectionFocus(last || false, scroll.render()); }, up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); }, down: function () { if (Navigator.canmove('down')) Navigator.move('down'); }, left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); }, right: function () { if (Navigator.canmove('right')) Navigator.move('right'); }, back: function () { Lampa.Activity.backward(); } }); Lampa.Controller.toggle('lmeMusicSearch'); this.parse(); }; this.parse = function () { var _this = this; this.activity.loader(true); filter.onSearch = function(value) { Lampa.Activity.replace({ search: value, clarification: true }); }; get(object, function (data) { results = data; _this.build(); _this.activity.loader(false); }, function(err) { files.appendFiles(Lampa.Template.get('error', {title: 'Error', text: err || 'Connection failed'})); _this.activity.loader(false); }); }; this.build = function() { if (!results || !results.Results) return; results.Results.forEach(function(el) { var t = el.Title.toUpperCase(); known_formats.forEach(function(f) { if(t.indexOf(f) > -1 && filter_items.format.indexOf(f) === -1) filter_items.format.push(f); }); }); filter.set('filter', [ { title: 'Format', items: filter_items.format.map(function(f) { return { title: f }; }), stype: 'format' }, { title: 'Year', items: filter_items.year.map(function(f) { return { title: f }; }), stype: 'year' } ]); var _this = this; filter.onSelect = function(type, a, b) { if (type === 'filter') { clearTimeout(filterTimeout); a.subtitle = b.title; filterTimeout = setTimeout(function() { var selectedFormat = a.stype === 'format' ? b.title : null; var selectedYear = a.stype === 'year' ? b.title : null; filtred = results.Results.filter(function(r) { var match = true; if (selectedFormat && selectedFormat !== Lampa.Lang.translate('torrent_parser_any_two')) match = match && r.Title.toUpperCase().indexOf(selectedFormat) > -1; if (selectedYear && selectedYear !== Lampa.Lang.translate('torrent_parser_any_two')) match = match && r.Title.indexOf(selectedYear) > -1; return match; }); _this.showResults(); last = scroll.render().find('.torrent-item:eq(0)')[0]; if (last) { scroll.update(last); Lampa.Controller.collectionFocus(last, scroll.render()); } }, 100); } }; files.appendHead(filter.render()); filtred = results.Results; this.showResults(); }; this.showResults = function() { var _this = this; scroll.clear(); if (!filtred || filtred.length === 0) { scroll.append($('<div style="padding:20px;color:#999;text-align:center;">Ничего не найдено</div>')); files.appendFiles(scroll.render()); Lampa.Controller.collectionSet(scroll.render()); return; } filtred.slice(0, 50).forEach(function(el) { var item = Lampa.Template.get('torrent', { title: el.Title, size: el.size, seeds: el.Seeders, grabs: el.Peers, date: Lampa.Utils.parseTime(el.PublishDate).full, tracker: el.Tracker }); item.on('hover:focus', function(e) { last = e.target; scroll.update(last); }); item.on('hover:enter', function() { start(el, object.movie); }); scroll.append(item); }); files.appendFiles(scroll.render()); Lampa.Controller.collectionSet(scroll.render()); Lampa.Controller.collectionFocus(last || false, scroll.render()); }; }

    function startPlugin() {
        window.lmeMusicSearch_ready = true;
        $('body').append('<style>' + music_css + '</style>');
        window.musicPlayer = new createMusicPlayer();
        
        var original_play = Lampa.Player.play;
        Lampa.Player.play = function(object) {
            if (object && object.from_music_search && window.musicPlayer) return; 
            original_play(object);
        };

        Lampa.Component.add('lmeMusicSearch', component);

        function addBtn() {
            var btn = $(`<li class="menu__item selector">
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18V5l12-2v13"/>ircle cx="6" cy="18" r="3"/>ircle cx="18" cy="16" r="3"/></svg></div>
                <div class="menu__text">Music Search v7.3</div>
            </li>`);
            btn.on('hover:enter', function() {
                Lampa.Activity.push({
                    url: '', title: 'Music Search', component: 'lmeMusicSearch',
                    search: 'Metallica', from_search: true, page: 1, movie: { title: '' }
                });
            });
            $('.menu .menu__list').eq(0).append(btn);
            window.musicPlayer.create();
        }

        if (window.appready) addBtn();
        else Lampa.Listener.follow('app', function(e) { if(e.type==='ready') addBtn(); });
    }

    if (!window.lmeMusicSearch_ready) startPlugin();
})();
