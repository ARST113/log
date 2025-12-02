(function () {
    'use strict';

    // ========================================================================
    // 1. КОНФИГУРАЦИЯ И CSS
    // ========================================================================
    
    var SERVER = {};
    var timers = {};
    var formats_set = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma', 'dsd', 'dsf', 'alac', 'dts', 'ac3']);
    var images_set = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
    var searchCache = new Map();

    var music_css = `
        .music-player{display:flex;align-items:center;border-radius:0.3em;padding:0.2em 0.8em;background-color:#2b2b2b;min-width:240px;margin-right:10px;transition:all 0.3s;border:1px solid rgba(255,255,255,0.1);position:relative}
        .music-player.hide{display:none!important}
        .music-player__cover{width:40px;height:40px;border-radius:4px;margin-right:10px;object-fit:cover;background:#000}
        .music-player__info{flex:1;min-width:0;margin-right:15px;max-width:160px;display:flex;flex-direction:column;justify-content:center}
        .music-player__name{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;line-height:1.2}
        .music-player__artist{font-size:11px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}
        .music-player__status{font-size:9px;color:#4CAF50;margin-top:2px;height:12px;overflow:hidden;white-space:nowrap;opacity:0.8}
        .music-player__controls{display:flex;align-items:center;gap:5px}
        .music-player__button{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background 0.2s}
        .music-player__button:hover,.music-player__button.focus{background:rgba(255,255,255,0.15)}
        .music-player__visualizer{display:flex;align-items:flex-end;gap:2px;height:16px}
        .music-player__bar{width:3px;background-color:#4CAF50;animation:sound 0ms -800ms linear infinite alternate;border-radius:1px}
        @keyframes sound{0%{height:3px}100%{height:14px}}.music-player.stop .music-player__bar{animation:none;height:3px}
        .music-player__bar:nth-child(1){animation-duration:474ms}.music-player__bar:nth-child(2){animation-duration:433ms}.music-player__bar:nth-child(3){animation-duration:407ms}
        .music-player__bar:nth-child(4){animation-duration:458ms}
        .music-player.loading .music-player__play svg{display:none}
        .music-player.loading .music-player__play:after{content:"";display:block;border:2px solid rgba(255,255,255,0.2);border-top:2px solid #fff;width:14px;height:14px;border-radius:50%;animation:spin 1s linear infinite}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        .music-albums{padding:0 20px 20px}
        .music-album__header{margin:25px 0 10px;padding-bottom:8px;border-bottom:2px solid rgba(255,255,255,0.05);display:flex;align-items:baseline}
        .music-album__artist{font-size:22px;font-weight:bold;color:#fff;margin-right:15px}.music-album__title{font-size:16px;color:#4CAF50}
        .music-item{display:flex;align-items:center;padding:8px 12px;margin-bottom:4px;background:rgba(255,255,255,0.03);border-radius:6px;transition:all 0.2s;cursor:pointer}
        .music-item.focus{background:rgba(255,255,255,0.15);transform:scale(1.01)}.music-item__icon{width:30px;height:30px;border-radius:4px;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;margin-right:12px;flex-shrink:0}
        .music-item__info{flex:1;min-width:0;display:flex;flex-direction:column}.music-item__title{font-size:15px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .music-item__meta{font-size:11px;color:#888;margin-top:2px}.music-item__format{background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;margin-right:6px;font-weight:bold;font-size:9px}
        .music-item__size{color:#666}
        .music-playlist{padding:20px}
        .music-playlist__header{font-size:20px;font-weight:bold;color:#fff;margin-bottom:15px;display:flex;align-items:center;justify-content:space-between}
        .music-playlist__count{font-size:14px;color:#888;font-weight:normal}
        .music-playlist__item{display:flex;align-items:center;padding:10px;margin-bottom:4px;background:rgba(255,255,255,0.03);border-radius:6px;transition:all 0.2s;cursor:pointer}
        .music-playlist__item.active{background:rgba(76,175,80,0.2);border:1px solid rgba(76,175,80,0.4)}
        .music-playlist__item.focus{background:rgba(255,255,255,0.15);transform:scale(1.01)}
        .music-playlist__item-num{width:30px;text-align:center;font-size:14px;color:#666;flex-shrink:0}
        .music-playlist__item-info{flex:1;min-width:0;margin:0 10px}
        .music-playlist__item-title{font-size:14px;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .music-playlist__item-artist{font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
        .music-playlist__item-format{background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:3px;font-size:10px;color:#aaa;flex-shrink:0}
        .music-playlist__empty{text-align:center;padding:40px 20px;color:#666;font-size:14px}
        @media screen and (max-width:580px){.music-player{min-width:auto;max-width:160px}.music-player__info{display:none}}
    `;

    var templates = {
        music_player: `
            <div class="music-player stop hide">
                <img class="music-player__cover" src="./img/img_broken.svg" />
                <div class="music-player__info">
                    <div class="music-player__name">Player</div>
                    <div class="music-player__artist">Ready</div>
                    <div class="music-player__status">Готов</div>
                </div>
                <div class="music-player__controls">
                    <div class="music-player__button music-player__playlist selector" title="Playlist">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    </div>
                    <div class="music-player__button music-player__prev selector"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="white"/></svg></div>
                    <div class="music-player__button music-player__play selector">
                        <svg class="play-icon" width="16" height="16" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white"/></svg>
                        <div class="music-player__visualizer" style="display:none"><i class="music-player__bar"></i><i class="music-player__bar"></i><i class="music-player__bar"></i><i class="music-player__bar"></i></div>
                    </div>
                    <div class="music-player__button music-player__next selector"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z" fill="white"/></svg></div>
                </div>
            </div>`,
        music_item: `
            <div class="selector music-item">
                <div class="music-item__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2"><path d="M9 18V5l12-2v13"></path>ircle cx="6" cy="18" r="3"></circle>ircle cx="18" cy="16" r="3"></circle></svg></div>
                <div class="music-item__info"><div class="music-item__title">{title}</div><div class="music-item__meta"><span class="music-item__format">{format}</span><span class="music-item__size">{size}</span></div></div>
            </div>`
    };

    function fillTemplate(html, data) {
        var output = html;
        for (var key in data) output = output.replace(new RegExp('{' + key + '}', 'g'), data[key]);
        return output;
    }

    // ========================================================================
    // 2. PLAYER LOGIC
    // ========================================================================
    function createMusicPlayer() {
        var html = $(templates.music_player);
        var audio = new Audio();
        var currentPlaylist = [];
        var currentTrackIndex = 0;
        var playTimer = null;
        var _this = this;

        audio.crossOrigin = "anonymous";
        audio.preload = "auto";

        audio.addEventListener("play", function () { updateState(true); setStatus('Играет'); console.log('[MusicPlayer] Playing:', audio.src); });
        audio.addEventListener("pause", function () { updateState(false); setStatus('Пауза'); console.log('[MusicPlayer] Paused'); });
        audio.addEventListener("ended", function () { _this.next(); });
        
        audio.addEventListener("error", function (e) {
            var errorCode = audio.error ? audio.error.code : 0;
            if (errorCode === 4) setStatus('Формат не поддерживается');
            else if (errorCode === 3) setStatus('Ошибка декодирования');
            else if (errorCode === 2) setStatus('Ошибка сети');
            else if (errorCode === 1) setStatus('Загрузка прервана');
            else setStatus('Ошибка воспроизведения');
            updateState(false);
            html.removeClass('loading');
        });
        
        audio.addEventListener("waiting", function() { html.addClass('loading'); setStatus('Буферизация...'); });
        audio.addEventListener("canplay", function() { html.removeClass('loading'); });
        audio.addEventListener("loadeddata", function() { html.removeClass('loading'); });

        function setStatus(text) { html.find('.music-player__status').text(text); }
        function updateState(isPlaying) {
            html.toggleClass('stop', !isPlaying);
            html.toggleClass('loading', false);
            html.find('.play-icon').toggle(!isPlaying);
            html.find('.music-player__visualizer').toggle(isPlaying);
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
            html.find('.music-player__name').text(track.title);
            html.find('.music-player__artist').text(track.artist || track.album || '');
            html.find('.music-player__cover').attr('src', track.img || './img/img_broken.svg');
            html.removeClass('hide');
            html.addClass('loading');
            setStatus('Загрузка...');
            playTimer = setTimeout(function() { _this.playTrack(track); }, 200);
        };

        this.playTrack = function(track) {
            audio.pause();
            audio.src = '';
            setTimeout(function() {
                audio.src = track.url;
                audio.load();
                var playPromise = audio.play();
                if (playPromise) {
                    playPromise.catch(function(error) {
                        if (error.name !== 'AbortError') {
                            setStatus('Не удалось запустить');
                            updateState(false);
                        }
                    });
                }
            }, 100);
        };

        this.toggle = function() { if (audio.paused) audio.play().catch(function(){}); else audio.pause(); };
        
        this.next = function() {
            if (currentPlaylist.length > 0) {
                currentTrackIndex = (currentTrackIndex + 1) % currentPlaylist.length;
                this.play(currentPlaylist[currentTrackIndex], currentPlaylist);
            }
        };
        
        this.prev = function() {
            if (currentPlaylist.length > 0) {
                currentTrackIndex = (currentTrackIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
                this.play(currentPlaylist[currentTrackIndex], currentPlaylist);
            }
        };
        
        this.stop = function() { audio.pause(); audio.src = ''; html.addClass('hide'); };

        // НОВАЯ ФУНКЦИЯ: Показать плейлист
        this.showPlaylist = function() {
            if (currentPlaylist.length === 0) {
                Lampa.Noty.show('Плейлист пуст');
                return;
            }

            var playlistHtml = $('<div class="music-playlist"></div>');
            var header = $('<div class="music-playlist__header">Текущий плейлист <span class="music-playlist__count">' + currentPlaylist.length + ' треков</span></div>');
            playlistHtml.append(header);

            var currentUrl = audio.src;
            
            currentPlaylist.forEach(function(track, index) {
                var isActive = track.url === currentUrl;
                var item = $('<div class="music-playlist__item selector' + (isActive ? ' active' : '') + '"></div>');
                
                item.append($('<div class="music-playlist__item-num">' + (index + 1) + '</div>'));
                
                var info = $('<div class="music-playlist__item-info"></div>');
                info.append($('<div class="music-playlist__item-title">' + track.title + '</div>'));
                info.append($('<div class="music-playlist__item-artist">' + (track.artist || track.album || 'Unknown') + '</div>'));
                item.append(info);
                
                item.append($('<div class="music-playlist__item-format">' + (track.format || 'MP3') + '</div>'));
                
                item.on('hover:enter', function() {
                    _this.play(track, currentPlaylist);
                    Lampa.Modal.close();
                });
                
                playlistHtml.append(item);
            });

            Lampa.Modal.open({
                title: '',
                html: playlistHtml,
                size: 'medium',
                mask: true,
                onBack: function() {
                    Lampa.Modal.close();
                    Lampa.Controller.toggle('head');
                }
            });

            // Устанавливаем фокус на активный трек или первый
            var activeItem = playlistHtml.find('.music-playlist__item.active');
            var firstItem = activeItem.length ? activeItem : playlistHtml.find('.music-playlist__item').first();
            
            if (firstItem.length) {
                Lampa.Controller.collectionFocus(firstItem[0], playlistHtml);
            }
        };

        html.find('.music-player__playlist').on('hover:enter', function () { _this.showPlaylist(); });
        html.find('.music-player__play').on('hover:enter', function () { _this.toggle(); });
        html.find('.music-player__next').on('hover:enter', function () { _this.next(); });
        html.find('.music-player__prev').on('hover:enter', function () { _this.prev(); });
    }

    // ========================================================================
    // 3. TORRSERVER LOGIC
    // ========================================================================
    function start(element, movie) {
      SERVER.object = element;
      if (movie) SERVER.movie = movie;
      if (Lampa.Torserver.url()) { loading(); connect(); } else install();
    }
    function loading() { Lampa.Modal.open({ title: '', html: Lampa.Template.get('modal_loading'), size: 'large', mask: true, onBack: function onBack() { Lampa.Modal.close(); close(); } }); }
    function connect() { Lampa.Torserver.connected(function () { hash(); }, function () { Lampa.Torserver.error(); }); }
    function hash() {
      var title = SERVER.object.Title || SERVER.object.title || 'Unknown';
      var magnet = SERVER.object.MagnetUri || SERVER.object.Link;
      Lampa.Torserver.hash({ title: title, link: magnet, poster: SERVER.object.poster, data: { lampa: true, movie: SERVER.movie } }, 
        function (json) { SERVER.hash = json.hash; files(); }, 
        function (echo) { Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('title_error'), text: 'Ошибка добавления: ' + (echo || 'Unknown') })); }
      );
    }
    function files() {
      var repeat = 0, maxAttempts = 60, ts_url = Lampa.Torserver.url(), endpoint = ts_url.replace(/\/$/, '') + '/torrents'; 
      timers.files = setInterval(function () {
        repeat++;
        fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: JSON.stringify({ action: 'get', hash: SERVER.hash }) })
        .then(function(response) { return response.json(); })
        .then(function(json) { if (json && json.file_stats && json.file_stats.length > 0) { clearInterval(timers.files); show(json.file_stats); } })
        .catch(function(err) {}); 
        if (repeat >= maxAttempts) {
          Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('title_error'), text: Lampa.Lang.translate('torrent_parser_timeout') }));
          Lampa.Torserver.clear(); Lampa.Torserver.drop(SERVER.hash); clearInterval(timers.files);
        }
      }, 1500); 
    }
    function install() { Lampa.Modal.open({ title: '', html: Lampa.Template.get('torrent_install', {}), size: 'large', onBack: function onBack() { Lampa.Modal.close(); Lampa.Controller.toggle('content'); } }); }
    function show(files) {
        try {
            var coversMap = {}, albums = {}; 
            if (!files || !Array.isArray(files)) return;
            for (var i = 0; i < files.length; i++) {
                var file = files[i]; if (!file.path) continue;
                var ext = file.path.split('.').pop().toLowerCase();
                var dir = file.path.substring(0, file.path.lastIndexOf('/'));
                var pathParts = file.path.split('/');
                if (images_set.has(ext)) {
                    var fname = file.path.split('/').pop().toLowerCase();
                    var isPriority = fname.indexOf('cover') > -1 || fname.indexOf('folder') > -1 || fname.indexOf('front') > -1;
                    if (!coversMap[dir] || isPriority) coversMap[dir] = file;
                }
                if (formats_set.has(ext)) {
                    var trackName = pathParts[pathParts.length - 1].replace('.' + ext, '');
                    var albumName = pathParts.length >= 2 ? pathParts[pathParts.length - 2] : 'Unknown Album';
                    var artistName = pathParts.length >= 3 ? pathParts[pathParts.length - 3] : 'Unknown Artist';
                    var albumKey = artistName + '||' + albumName;
                    if(!albums[albumKey]) albums[albumKey] = { artist: artistName, album: albumName, dir: dir, tracks: [], cover: null };
                    albums[albumKey].tracks.push({ file: file, title: trackName, format: ext.toUpperCase() });
                }
            }
            var sortedAlbums = Object.values(albums).sort(function(a,b){ return a.artist.localeCompare(b.artist); });
            if (sortedAlbums.length === 0) { Lampa.Modal.update(Lampa.Template.get('error', { title: Lampa.Lang.translate('empty_title'), text: 'Аудио файлы не найдены' })); return; }
            sortedAlbums.forEach(function(album) {
                if (coversMap[album.dir]) album.cover = Lampa.Torserver.stream(coversMap[album.dir].path, SERVER.hash, coversMap[album.dir].id);
                else album.cover = './img/img_broken.svg';
                album.tracks.sort(function(a,b){ return a.file.path.localeCompare(b.file.path, undefined, {numeric: true}); });
            });
            renderList(sortedAlbums);
        } catch (e) { Lampa.Modal.update(Lampa.Template.get('error', { title: 'Render Error', text: e.message })); }
    }
    function renderList(albums) {
        var html = $('<div class="music-albums"></div>');
        var allTracksPlaylist = []; 
        albums.forEach(function(album) {
            var header = $(`<div class="music-album__header"><div class="music-album__artist">${album.artist}</div><div class="music-album__title">${album.album}</div></div>`);
            html.append(header);
            album.tracks.forEach(function(trackObj) {
                var file = trackObj.file;
                var trackUrl = Lampa.Torserver.stream(file.path, SERVER.hash, file.id);
                trackUrl += (trackUrl.indexOf('?') > -1 ? '&play' : '?play');
                var trackData = { title: trackObj.title, artist: album.artist, album: album.album, url: trackUrl, img: album.cover, from_music_search: true, format: trackObj.format };
                allTracksPlaylist.push(trackData);
                var itemHtml = fillTemplate(templates.music_item, { title: trackObj.title, format: trackObj.format, size: Lampa.Utils.bytesToSize(file.length) });
                var item = $(itemHtml);
                item.on('hover:enter', function() { window.musicPlayer.play(trackData, allTracksPlaylist); });
                html.append(item);
            });
        });
        Lampa.Modal.update(html);
        var firstItem = html.find('.music-item').first();
        if (firstItem.length) Lampa.Controller.collectionFocus(firstItem, Lampa.Modal.scroll().render());
    }
    function close() { Lampa.Torserver.drop(SERVER.hash); Lampa.Torserver.clear(); clearInterval(timers.files); SERVER = {}; }

    // ========================================================================
    // 5. PARSERS
    // ========================================================================
    var network = new Lampa.Reguest();
    function get(params = {}, oncomplite, onerror) {
        var safeParamsForKey = { search: params.search, query: params.query, page: params.page || 1, type: Lampa.Storage.field('parser_torrent_type') };
        var cacheKey = JSON.stringify(safeParamsForKey);
        if (searchCache.has(cacheKey)) { oncomplite(searchCache.get(cacheKey)); return; }
        function complite(data) { searchCache.set(cacheKey, data); oncomplite(data); }
        var parserType = Lampa.Storage.field('parser_torrent_type');
        if (parserType == 'jackett') jackett(Lampa.Utils.checkEmptyUrl(Lampa.Storage.field('jackett_url')), params, complite, onerror);
        else if (parserType == 'prowlarr') prowlarr(Lampa.Utils.checkEmptyUrl(Lampa.Storage.field('prowlarr_url')), params, complite, onerror);
        else if (parserType == 'torrserver') {
            var url = Lampa.Utils.checkEmptyUrl(Lampa.Storage.field(Lampa.Storage.field('torrserver_use_link') == 'two' ? 'torrserver_url_two' : 'torrserver_url'));
            torrserver(url, params, complite, onerror);
        } else onerror(Lampa.Lang.translate('torrent_parser_set_link'));
    }
    function jackett(url, params, oncomplite, onerror) {
        var u = url + '/api/v2.0/indexers/all/results?apikey=' + Lampa.Storage.field('jackett_key') + '&Category[]=3000&Query=' + encodeURIComponent(params.search);
        network.native(u, function (json) {
            if (json.Results) {
                var results = json.Results.map(function(el) { return { title: el.Title, Title: el.Title, Tracker: el.Tracker, size: Lampa.Utils.bytesToSize(el.Size), PublishDate: el.PublishDate, Seeders: el.Seeders, Peers: el.Peers, MagnetUri: el.MagnetUri || el.Link, hash: Lampa.Utils.hash(el.Title) }; });
                oncomplite({ Results: results });
            } else onerror('');
        }, onerror);
    }
    function prowlarr(url, params, oncomplite, onerror) {
        var q = [{name:'apikey',value:Lampa.Storage.field('prowlarr_key')}, {name:'query',value:params.search}, {name:'categories',value:'3000'}, {name:'type',value:'search'}];
        var u = Lampa.Utils.buildUrl(url, '/api/v1/search', q);
        network.native(u, function (json) {
            if (Array.isArray(json)) {
                var results = json.filter(function(e) { return e.protocol === 'torrent'; }).map(function(e) { return { title: e.title, Title: e.title, Tracker: e.indexer, size: Lampa.Utils.bytesToSize(e.size), PublishDate: e.publishDate, Seeders: e.seeders, Peers: e.leechers, MagnetUri: e.downloadUrl, hash: Lampa.Utils.hash(e.title) }; });
                oncomplite({ Results: results });
            } else onerror('');
        }, onerror);
    }
    function torrserver(url, params, oncomplite, onerror) {
        var u = Lampa.Utils.buildUrl(url, '/search/', [{ name: 'query', value: params.search }]);
        network.native(u, function (json) {
            if (Array.isArray(json)) {
                var results = json.map(function(e) { return { title: e.Title, Title: e.Title, Tracker: e.Tracker, size: e.Size, PublishDate: e.CreateDate, Seeders: e.Seed, Peers: e.Peer, MagnetUri: e.Magnet, hash: Lampa.Utils.hash(e.Title) }; });
                oncomplite({ Results: results });
            } else onerror('');
        }, onerror);
    }

    // ========================================================================
    // 6. MAIN COMPONENT
    // ========================================================================
    
    function component(object) {
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var results = [];
        var filtred = [];
        var last = false;
        var filterTimeout;
        
        files.clear = function() { scroll.clear(); };
        this.destroy = function() { 
            clearTimeout(filterTimeout);
            network.clear(); 
            files.destroy(); 
            scroll.destroy(); 
            results = null; 
        };

        var filter_items = { format: [Lampa.Lang.translate('torrent_parser_any_two')], year: [Lampa.Lang.translate('torrent_parser_any_two')] };
        var known_formats = ['FLAC', 'MP3', 'WAV', 'AAC', 'DSD', 'SACD', 'APE', 'DTS', 'AC3'];
        var i = 50, y = new Date().getFullYear();
        while (i--) filter_items.year.push((y - (49 - i)) + '');

        scroll.minus(files.render().find('.explorer__files-head'));
        scroll.body().addClass('torrent-list');

        this.create = function () { return this.render(); };
        this.render = function () { return files.render(); };

        this.start = function () {
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
            
            Lampa.Controller.add('lmeMusicSearch', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('lmeMusicSearch');
            this.parse();
        };

        this.parse = function () {
            var _this = this;
            this.activity.loader(true); 
            filter.onSearch = function(value) { Lampa.Activity.replace({ search: value, clarification: true }); };
            get(object, function (data) {
                results = data; 
                _this.build(); 
                _this.activity.loader(false); 
            }, function(err) {
                files.appendFiles(Lampa.Template.get('error', {title: 'Error', text: err || 'Connection failed'})); 
                _this.activity.loader(false); 
            });
        };

        this.build = function() {
            if (!results || !results.Results) return;
            results.Results.forEach(function(el) {
                var t = el.Title.toUpperCase();
                known_formats.forEach(function(f) { 
                    if(t.indexOf(f) > -1 && filter_items.format.indexOf(f) === -1) filter_items.format.push(f); 
                });
            });
            filter.set('filter', [
                { title: 'Format', items: filter_items.format.map(function(f) { return { title: f }; }), stype: 'format' },
                { title: 'Year', items: filter_items.year.map(function(f) { return { title: f }; }), stype: 'year' }
            ]);
            
            var _this = this;
            
            filter.onSelect = function(type, a, b) {
                if (type === 'filter') {
                    clearTimeout(filterTimeout);
                    a.subtitle = b.title;
                    
                    filterTimeout = setTimeout(function() {
                        var selectedFormat = a.stype === 'format' ? b.title : null;
                        var selectedYear = a.stype === 'year' ? b.title : null;
                        
                        filtred = results.Results.filter(function(r) {
                            var match = true;
                            if (selectedFormat && selectedFormat !== Lampa.Lang.translate('torrent_parser_any_two')) {
                                match = match && r.Title.toUpperCase().indexOf(selectedFormat) > -1;
                            }
                            if (selectedYear && selectedYear !== Lampa.Lang.translate('torrent_parser_any_two')) {
                                match = match && r.Title.indexOf(selectedYear) > -1;
                            }
                            return match;
                        });
                        
                        _this.showResults();
                        last = scroll.render().find('.torrent-item:eq(0)')[0];
                        if (last) {
                            scroll.update(last);
                            Lampa.Controller.collectionFocus(last, scroll.render());
                        }
                    }, 100);
                }
            };
            
            files.appendHead(filter.render());
            filtred = results.Results;
            this.showResults();
        };

        this.showResults = function() {
            var _this = this;
            scroll.clear();
            if (!filtred || filtred.length === 0) {
                scroll.append($('<div style="padding:20px;color:#999;text-align:center;">Ничего не найдено</div>'));
                files.appendFiles(scroll.render());
                Lampa.Controller.collectionSet(scroll.render());
                return;
            }
            
            filtred.slice(0, 50).forEach(function(el) {
                var item = Lampa.Template.get('torrent', {
                    title: el.Title, size: el.size, seeds: el.Seeders, grabs: el.Peers,
                    date: Lampa.Utils.parseTime(el.PublishDate).full, tracker: el.Tracker
                });
                
                item.on('hover:focus', function(e) {
                    last = e.target;
                    scroll.update(last);
                });
                
                item.on('hover:enter', function() { 
                    start(el, object.movie); 
                });
                
                scroll.append(item);
            });
            
            files.appendFiles(scroll.render());
            Lampa.Controller.collectionSet(scroll.render());
            Lampa.Controller.collectionFocus(last || false, scroll.render());
        };
    }

    // ========================================================================
    // 7. INIT
    // ========================================================================
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
                <div class="menu__text">Music Search v5.2</div>
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
