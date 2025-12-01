(function () {
    'use strict';

    // ========================================================================
    // КОНФИГУРАЦИЯ И СТИЛИ
    // ========================================================================
    
    var SERVER = {};
    var timers = {};
    var formats_set = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma', 'dsd', 'dsf', 'alac', 'dts', 'ac3']);
    var images_set = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
    var searchCache = new Map();

    // CSS СТИЛИ
    var music_css = `
        .music-player {
            display: flex;
            align-items: center;
            border-radius: 0.3em;
            padding: 0.2em 0.8em;
            background-color: #2b2b2b;
            min-width: 220px;
            margin-right: 10px;
            transition: all 0.3s;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .music-player.hide { display: none !important; }
        .music-player__cover {
            width: 36px;
            height: 36px;
            border-radius: 4px;
            margin-right: 10px;
            object-fit: cover;
            background: #000;
        }
        .music-player__info {
            flex: 1;
            min-width: 0;
            margin-right: 15px;
            max-width: 150px;
        }
        .music-player__name {
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #fff;
            line-height: 1.2;
        }
        .music-player__artist {
            font-size: 11px;
            color: #aaa;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
        }
        .music-player__controls {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .music-player__button {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 0.2s;
        }
        .music-player__button:hover, .music-player__button.focus {
            background: rgba(255, 255, 255, 0.15);
        }
        /* Visualizer */
        @keyframes sound {
            0% { height: 3px; }
            100% { height: 14px; }
        }
        .music-player__visualizer {
            display: flex;
            align-items: center;
            gap: 2px;
            height: 16px;
            align-items: flex-end;
        }
        .music-player__bar {
            width: 3px;
            background-color: #4CAF50;
            animation: sound 0ms -800ms linear infinite alternate;
            border-radius: 1px;
        }
        .music-player.stop .music-player__bar { animation: none; height: 3px; }
        .music-player__bar:nth-child(1) { animation-duration: 474ms; }
        .music-player__bar:nth-child(2) { animation-duration: 433ms; }
        .music-player__bar:nth-child(3) { animation-duration: 407ms; }
        .music-player__bar:nth-child(4) { animation-duration: 458ms; }
        
        .music-player.loading .music-player__play svg { display: none; }
        .music-player.loading .music-player__play:after {
            content: "";
            display: block;
            border: 2px solid rgba(255,255,255,0.2);
            border-top: 2px solid #fff;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        /* LIST ITEMS */
        .music-albums { padding: 0 20px 20px; }
        .music-album__header {
            margin: 25px 0 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid rgba(255,255,255,0.05);
            display: flex;
            align-items: baseline;
        }
        .music-album__artist { font-size: 22px; font-weight: bold; color: #fff; margin-right: 15px; }
        .music-album__title { font-size: 16px; color: #4CAF50; }
        
        .music-item {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            margin-bottom: 4px;
            background: rgba(255,255,255,0.03);
            border-radius: 6px;
            transition: all 0.2s;
            cursor: pointer;
        }
        .music-item.focus { background: rgba(255,255,255,0.15); transform: scale(1.01); }
        .music-item__icon {
            width: 30px;
            height: 30px;
            border-radius: 4px;
            background: rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            flex-shrink: 0;
        }
        .music-item__info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .music-item__title { font-size: 15px; color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .music-item__meta { font-size: 11px; color: #888; margin-top: 2px; }
        .music-item__format { 
            background: rgba(255,255,255,0.1); 
            padding: 1px 4px; 
            border-radius: 3px; 
            margin-right: 6px; 
            font-weight: bold;
            font-size: 9px;
        }
        .music-item__size { color: #666; }
        
        @media screen and (max-width: 580px) {
            .music-player { min-width: auto; max-width: 160px; }
            .music-player__info { display: none; }
        }
    `;

    // ШАБЛОНЫ
    var templates = {
        music_player: `
            <div class="music-player stop hide">
                <img class="music-player__cover" src="./img/img_broken.svg" />
                <div class="music-player__info">
                    <div class="music-player__name">Player</div>
                    <div class="music-player__artist">Ready</div>
                </div>
                <div class="music-player__controls">
                    <div class="music-player__button music-player__prev selector">
                        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="white"/></svg>
                    </div>
                    <div class="music-player__button music-player__play selector">
                        <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white"/></svg>
                        <div class="music-player__visualizer" style="display:none">
                            <i class="music-player__bar"></i><i class="music-player__bar"></i><i class="music-player__bar"></i><i class="music-player__bar"></i>
                        </div>
                    </div>
                    <div class="music-player__button music-player__next selector">
                        <svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z" fill="white"/></svg>
                    </div>
                </div>
            </div>
        `,
        music_item: `
            <div class="selector music-item">
                <div class="music-item__icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2">
                        <path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>
                    </svg>
                </div>
                <div class="music-item__info">
                    <div class="music-item__title">{title}</div>
                    <div class="music-item__meta">
                        <span class="music-item__format">{format}</span>
                        <span class="music-item__size">{size}</span>
                    </div>
                </div>
            </div>
        `
    };

    // ========================================================================
    // CLASS: MUSIC PLAYER (Mini)
    // ========================================================================
    function createMusicPlayer() {
        var html = $(templates.music_player);
        var audio = new Audio();
        var url = '';
        var played = false;
        var currentPlaylist = [];
        var currentTrackIndex = 0;
        var _this = this;

        // --- Event Listeners ---
        audio.addEventListener("play", function () {
            played = true;
            updateState(true);
        });
        audio.addEventListener("pause", function () {
            played = false;
            updateState(false);
        });
        audio.addEventListener("ended", function () {
            _this.next();
        });
        audio.addEventListener("error", function (e) {
            Lampa.Noty.show('Ошибка воспроизведения аудио');
            updateState(false);
        });
        audio.addEventListener("waiting", function() {
            html.addClass('loading');
        });
        audio.addEventListener("canplay", function() {
            html.removeClass('loading');
        });

        function updateState(isPlaying) {
            html.toggleClass('stop', !isPlaying);
            html.toggleClass('loading', false);
            if (isPlaying) {
                html.find('.play-icon').hide();
                html.find('.music-player__visualizer').show();
            } else {
                html.find('.play-icon').show();
                html.find('.music-player__visualizer').hide();
            }
        }

        function playUrl(src) {
            audio.src = src;
            var p = audio.play();
            if (p) {
                p.catch(function(e) { console.log('Audio play error', e); updateState(false); });
            }
        }

        // --- Public Methods ---
        this.create = function () {
            if ($('.head__actions .music-player').length === 0) {
                $('.head__actions .open--search').before(html);
            }
        };

        this.setPlaylist = function (playlist) {
            currentPlaylist = playlist;
        };

        this.play = function (track, playlist) {
            if (playlist) currentPlaylist = playlist;
            
            // Найти индекс
            currentTrackIndex = currentPlaylist.findIndex(function(t) { return t.url === track.url; });
            if (currentTrackIndex === -1) currentTrackIndex = 0;

            this.playTrack(track);
        };

        this.playTrack = function(track) {
            url = track.url;
            
            // UI Update
            html.find('.music-player__name').text(track.title);
            html.find('.music-player__artist').text(track.artist || track.album || '');
            html.find('.music-player__cover').attr('src', track.img || './img/img_broken.svg');
            html.removeClass('hide');

            playUrl(url);
        };

        this.toggle = function() {
            if (audio.paused) audio.play(); else audio.pause();
        };

        this.next = function() {
            if (currentPlaylist.length > 0) {
                currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length;
                this.playTrack(currentPlaylist[currentTrackIndex]);
            }
        };

        this.prev = function() {
            if (currentPlaylist.length > 0) {
                currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
                this.playTrack(currentPlaylist[currentTrackIndex]);
            }
        };

        this.stop = function() {
            audio.pause();
            audio.currentTime = 0;
            html.addClass('hide');
        };

        // UI Interactions
        html.find('.music-player__play').on('hover:enter click', function () { _this.toggle(); });
        html.find('.music-player__next').on('hover:enter click', function () { _this.next(); });
        html.find('.music-player__prev').on('hover:enter click', function () { _this.prev(); });
    }

    // ========================================================================
    // PARSER & TORRSERVER LOGIC
    // ========================================================================
    
    function start(element, movie) {
      SERVER.object = element;
      if (movie) SERVER.movie = movie;
      if (Lampa.Torserver.url()) {
        loading();
        connect();
      } else install();
    }

    function loading() {
      Lampa.Modal.open({
        title: '',
        html: Lampa.Template.get('modal_loading'),
        size: 'large',
        mask: true,
        onBack: function onBack() { Lampa.Modal.close(); close(); }
      });
    }

    function connect() {
      Lampa.Torserver.connected(function () { hash(); }, function (echo) { Lampa.Torserver.error(); });
    }

    function hash() {
      Lampa.Torserver.hash({
        title: SERVER.object.title,
        link: SERVER.object.MagnetUri || SERVER.object.Link,
        poster: SERVER.object.poster,
        data: { lampa: true, movie: SERVER.movie }
      }, function (json) {
        SERVER.hash = json.hash;
        files();
      }, function (echo) {
        var tpl = Lampa.Template.get('torrent_nohash', {
          title: Lampa.Lang.translate('title_error'),
          text: Lampa.Lang.translate('torrent_parser_no_hash'),
          url: SERVER.object.MagnetUri || SERVER.object.Link,
          echo: echo
        });
        tpl.find('.is--torlook').remove();
        Lampa.Modal.update(tpl);
      });
    }

    function files() {
      var repeat = 0;
      timers.files = setInterval(function () {
        repeat++;
        Lampa.Torserver.files(SERVER.hash, function (json) {
          if (json.file_stats) {
            clearInterval(timers.files);
            show(json.file_stats);
          }
        });
        if (repeat >= 60) {
          Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('title_error'), text: Lampa.Lang.translate('torrent_parser_timeout') }));
          Lampa.Torserver.clear(); Lampa.Torserver.drop(SERVER.hash); clearInterval(timers.files);
        }
      }, 1000); 
    }

    function install() {
      Lampa.Modal.open({
        title: '',
        html: Lampa.Template.get('torrent_install', {}),
        size: 'large',
        onBack: function onBack() { Lampa.Modal.close(); Lampa.Controller.toggle('content'); }
      });
    }

    // ========================================================================
    // GROUPING & DISPLAY LOGIC
    // ========================================================================

    function show(files) {
        var coversMap = {};
        var albums = {}; 

        // 1. First Pass: Collect Covers & Group Audio
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            var ext = file.path.split('.').pop().toLowerCase();
            var dir = file.path.substring(0, file.path.lastIndexOf('/'));
            var pathParts = file.path.split('/');

            // Collect Cover
            if (images_set.has(ext)) {
                var fname = file.path.split('/').pop().toLowerCase();
                var isPriority = fname.indexOf('cover') > -1 || fname.indexOf('folder') > -1 || fname.indexOf('front') > -1;
                if (!coversMap[dir] || isPriority) {
                    coversMap[dir] = file;
                }
            }
            
            // Collect Audio
            if (formats_set.has(ext)) {
                var trackName = pathParts[pathParts.length - 1].replace('.' + ext, '');
                var albumName = 'Unknown Album';
                var artistName = 'Unknown Artist';

                if (pathParts.length >= 2) albumName = pathParts[pathParts.length - 2];
                if (pathParts.length >= 3) artistName = pathParts[pathParts.length - 3];

                var albumKey = artistName + '||' + albumName;

                if (!albums[albumKey]) {
                    albums[albumKey] = {
                        artist: artistName,
                        album: albumName,
                        dir: dir,
                        tracks: []
                    };
                }

                albums[albumKey].tracks.push({
                    file: file,
                    title: trackName,
                    format: ext.toUpperCase()
                });
            }
        }

        var sortedAlbums = Object.values(albums).sort(function(a, b) {
            return a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album);
        });

        if (sortedAlbums.length === 0) {
            Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('empty_title'), text: 'No audio files found' }));
            return;
        }

        // Assign Covers
        sortedAlbums.forEach(function(album) {
            if (coversMap[album.dir]) {
                album.cover = Lampa.Torserver.stream(coversMap[album.dir].path, SERVER.hash, coversMap[album.dir].id);
            }
        });

        // Sort Tracks
        sortedAlbums.forEach(function(album) {
            album.tracks.sort(function(a, b) {
                return a.file.path.localeCompare(b.file.path, undefined, {numeric: true, sensitivity: 'base'});
            });
        });

        renderList(sortedAlbums, SERVER.movie);
    }

    function renderList(albums, movie) {
        var html = $('<div class="music-albums"></div>');
        var allTracksPlaylist = []; 

        albums.forEach(function(album) {
            var header = $(`
                <div class="music-album__header">
                    <div class="music-album__artist">${album.artist}</div>
                    <div class="music-album__title">${album.album}</div>
                </div>
            `);
            html.append(header);

            album.tracks.forEach(function(trackObj) {
                var file = trackObj.file;
                var trackUrl = Lampa.Torserver.stream(file.path, SERVER.hash, file.id);
                var cover = album.cover || './img/img_broken.svg';

                var trackData = {
                    title: trackObj.title,
                    artist: album.artist,
                    album: album.album,
                    url: trackUrl,
                    img: cover,
                    from_music_search: true
                };
                allTracksPlaylist.push(trackData);

                var item = $(Lampa.Template.get('music_item', {
                    title: trackObj.title,
                    format: trackObj.format,
                    size: Lampa.Utils.bytesToSize(file.length)
                }));

                item.on('hover:enter click', function() {
                    if (window.musicPlayer) {
                        window.musicPlayer.play(trackData, allTracksPlaylist);
                    } else {
                        Lampa.Noty.show('Player not initialized');
                    }
                });

                html.append(item);
            });
        });

        Lampa.Modal.update(html);
        
        var firstItem = html.find('.music-item').first();
        if (firstItem.length) {
            Lampa.Controller.collectionFocus(firstItem, Lampa.Modal.scroll().render());
        }
    }

    function close() {
        Lampa.Torserver.drop(SERVER.hash);
        Lampa.Torserver.clear();
        clearInterval(timers.files);
        SERVER = {};
    }

    // ========================================================================
    // PARSER CORE
    // ========================================================================
    
    var network = new Lampa.Reguest();
    
    function get(params = {}, oncomplite, onerror) {
        var safeParamsForKey = {
            search: params.search,
            query: params.query,
            movieId: params.movie ? params.movie.id : 0,
            page: params.page || 1,
            type: Lampa.Storage.field('parser_torrent_type') 
        };
        var cacheKey = JSON.stringify(safeParamsForKey);
        
        if (searchCache.has(cacheKey)) {
            oncomplite(searchCache.get(cacheKey));
            return;
        }

        function complite(data) {
            searchCache.set(cacheKey, data); 
            oncomplite(data);
        }

        if (Lampa.Storage.field('parser_torrent_type') == 'jackett') {
            var url = Lampa.Utils.checkEmptyUrl(Lampa.Storage.field('jackett_url'));
            jackett(url, params, complite, onerror);
        } else {
            // Fallback for non-jackett users or implement other parsers similarly
            onerror('Only Jackett supported in this view');
        }
    }

    function jackett(url, params, oncomplite, onerror) {
        var u = url + '/api/v2.0/indexers/all/results?apikey=' + Lampa.Storage.field('jackett_key') + '&Category[]=3000&Query=' + encodeURIComponent(params.search);
        network.native(u, function (json) {
            if (json.Results) {
                var results = json.Results.map(function(el) {
                    return {
                        Title: el.Title,
                        Tracker: el.Tracker,
                        size: Lampa.Utils.bytesToSize(el.Size),
                        PublishDate: el.PublishDate,
                        Seeders: el.Seeders,
                        Peers: el.Peers,
                        MagnetUri: el.MagnetUri || el.Link,
                        hash: Lampa.Utils.hash(el.Title)
                    };
                });
                oncomplite({ Results: results });
            } else onerror('');
        }, onerror);
    }

    // ========================================================================
    // COMPONENT INTERFACE
    // ========================================================================

    function component(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var results = [];
        var filtred = [];
        
        var filter_items = { 
            format: [Lampa.Lang.translate('torrent_parser_any_two')], 
            year: [Lampa.Lang.translate('torrent_parser_any_two')] 
        };
        var known_formats = ['FLAC', 'MP3', 'WAV', 'AAC', 'DSD', 'SACD', 'APE', 'DTS', 'AC3'];
        var i = 50, y = new Date().getFullYear();
        while (i--) filter_items.year.push((y - (49 - i)) + '');

        scroll.minus(files.render().find('.explorer__files-head'));
        scroll.body().addClass('torrent-list');

        this.create = function () { return this.render(); };
        this.render = function () { return files.render(); };
        this.start = function () {
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
            this.parse();
        };

        this.parse = function () {
            var _this = this;
            this.activity.loader(true); // FIX: Используем instance метод
            get(object, function (data) {
                results = data;
                _this.build();
                _this.activity.loader(false); // FIX
            }, function() {
                files.appendFiles(Lampa.Template.get('error', {title: 'Error', text: 'Connection failed'}));
                _this.activity.loader(false); // FIX
            });
        };

        this.build = function() {
            results.Results.forEach(function(el) {
                var t = el.Title.toUpperCase();
                known_formats.forEach(function(f) { if(t.indexOf(f) > -1 && filter_items.format.indexOf(f) === -1) filter_items.format.push(f); });
            });
            
            filter.set('filter', [
                { title: 'Format', items: filter_items.format.map(function(f) { return { title: f }; }), stype: 'format' },
                { title: 'Year', items: filter_items.year.map(function(f) { return { title: f }; }), stype: 'year' }
            ]);
            
            var _this = this;
            filter.onSelect = function(type, a, b) {
                filtred = results.Results.filter(function(r) {
                    if (b.stype === 'format' && b.title !== Lampa.Lang.translate('torrent_parser_any_two')) return r.Title.toUpperCase().indexOf(b.title) > -1;
                    return true;
                });
                _this.showResults();
            };
            
            files.appendHead(filter.render());
            filtred = results.Results;
            this.showResults();
        };

        this.showResults = function() {
            scroll.clear();
            filtred.slice(0, 50).forEach(function(el) {
                var item = Lampa.Template.get('torrent', {
                    title: el.Title,
                    size: el.size,
                    seeds: el.Seeders,
                    grabs: el.Peers,
                    date: Lampa.Utils.parseTime(el.PublishDate).full,
                    tracker: el.Tracker
                });
                item.on('hover:enter', function() {
                    start(el, object.movie);
                });
                scroll.append(item);
            });
            files.appendFiles(scroll.render());
        };
    }

    // ========================================================================
    // BOOTSTRAP
    // ========================================================================

    function startPlugin() {
        window.lmeMusicSearch_ready = true;
        
        $('body').append('<style>' + music_css + '</style>');

        window.musicPlayer = new createMusicPlayer();

        // 4. Hook Player - Отключаем стандартный плеер для музыки
        var original_play = Lampa.Player.play;
        Lampa.Player.play = function(object) {
            if (object && object.from_music_search && window.musicPlayer) {
                // Если это музыка из плагина - не делаем ничего, так как играет наш MusicPlayer
                return; 
            }
            original_play(object);
        };

        Lampa.Component.add('lmeMusicSearch', component);

        function addBtn() {
            var btn = $(`<li class="menu__item selector">
                <div class="menu__ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
                <div class="menu__text">Music Search v1.1</div>
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
