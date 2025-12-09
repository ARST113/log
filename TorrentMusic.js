(function () {
    'use strict';

    var SERVER = {};
    var timers = {};
    var callback;
    var callback_back;
    var autostart_timer;
    var autostart_progress;
    
    // Форматы
    var formats_set = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma', 'dsd', 'dsf', 'alac', 'dts', 'ac3']);
    var images_set = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);

    var searchCache = new Map();
    
    // Глобальное состояние для управления плеером
    var PLAYER_STATE = {
        spoofed: false,
        original_platform: null
    };

    var MUSIC_PLAYER_STATE = {
        overlay: null,
        shuffle: Lampa.Storage.get('music_search_shuffle', false),
        styles_injected: false,
        pending_playlist_context: null
    };

    function start(element, movie) {
      SERVER.object = element;
      if (movie) SERVER.movie = movie;
      if (Lampa.Platform.is('android') && !Lampa.Storage.field('internal_torrclient')) {
        Lampa.Android.openTorrent(SERVER);
        if (movie && movie.id) Lampa.Favorite.add('history', movie, 100);
        if (callback) callback();
      } else if (Lampa.Torserver.url()) {
        loading();
        connect();
      } else install();
    }

    function open(hash, movie) {
      SERVER.hash = hash;
      if (movie) SERVER.movie = movie;
      if (Lampa.Platform.is('android') && !Lampa.Storage.field('internal_torrclient')) {
        Lampa.Android.playHash(SERVER);
        if (callback) callback();
      } else if (Lampa.Torserver.url()) {
        loading();
        files();
      } else install();
    }

    function loading() {
      Lampa.Modal.open({
        title: '',
        html: Lampa.Template.get('modal_loading'),
        size: 'large',
        mask: true,
        onBack: function onBack() {
          Lampa.Modal.close();
          close();
        }
      });
    }

    function connect() {
      Lampa.Torserver.connected(function () {
        hash();
      }, function (echo) {
        Lampa.Torserver.error();
      });
    }

    function hash() {
      Lampa.Torserver.hash({
        title: SERVER.object.title,
        link: SERVER.object.MagnetUri || SERVER.object.Link,
        poster: SERVER.object.poster,
        data: {
          lampa: true,
          movie: SERVER.movie
        }
      }, function (json) {
        SERVER.hash = json.hash;
        files();
      }, function (echo) {
        var jac = Lampa.Storage.field('parser_torrent_type') == 'jackett';
        var tpl = Lampa.Template.get('torrent_nohash', {
          title: Lampa.Lang.translate('title_error'),
          text: Lampa.Lang.translate('torrent_parser_no_hash'),
          url: SERVER.object.MagnetUri || SERVER.object.Link,
          echo: echo
        });
        if (jac) tpl.find('.is--torlook').remove();else tpl.find('.is--jackett').remove();
        Lampa.Modal.update(tpl);
      });
    }

    function files() {
      var repeat = 0;
      var maxAttempts = 60; 
      
      timers.files = setInterval(function () {
        repeat++;
        Lampa.Torserver.files(SERVER.hash, function (json) {
          if (json.file_stats) {
            clearInterval(timers.files);
            show(json.file_stats);
          }
        });
        if (repeat >= maxAttempts) {
          Lampa.Modal.update(Lampa.Template.get('error', {
            title: Lampa.Lang.translate('title_error'),
            text: Lampa.Lang.translate('torrent_parser_timeout')
          }));
          Lampa.Torserver.clear();
          Lampa.Torserver.drop(SERVER.hash);
          clearInterval(timers.files);
        }
      }, 1000); 
    }

    function install() {
      Lampa.Modal.open({
        title: '',
        html: Lampa.Template.get('torrent_install', {}),
        size: 'large',
        onBack: function onBack() {
          Lampa.Modal.close();
          Lampa.Controller.toggle('content');
        }
      });
    }

    function show(files) {
      var filteredFiles = [];
      var coversMap = {}; 

      for (var i = 0; i < files.length; i++) {
          var file = files[i];
          var ext = file.path.split('.').pop().toLowerCase();
          var dir = file.path.substring(0, file.path.lastIndexOf('/')); 

          if (formats_set.has(ext)) {
              filteredFiles.push(file);
          } 
          else if (images_set.has(ext)) {
              var fname = file.path.split('/').pop().toLowerCase();
              var isPriority = fname.indexOf('cover') > -1 || fname.indexOf('folder') > -1 || fname.indexOf('front') > -1;
              if (!coversMap[dir] || isPriority) {
                  coversMap[dir] = file;
              }
          }
      }
      
      if (filteredFiles.length === 0) {
          Lampa.Modal.update(Lampa.Template.get('error', {
            title: Lampa.Lang.translate('empty_title'),
            text: 'Аудио файлы не найдены (Audio files not found)'
          }));
          return;
      }

      filteredFiles.forEach(function(audioFile) {
          var dir = audioFile.path.substring(0, audioFile.path.lastIndexOf('/'));
          if (coversMap[dir]) {
              audioFile.cover_file = coversMap[dir]; 
          }
      });

      filteredFiles.sort(function (a, b) {
        return a.path.localeCompare(b.path, undefined, {numeric: true, sensitivity: 'base'});
      });

      var active = Lampa.Activity.active(),
        movie = active.movie || SERVER.movie || {};
      
      var plays = Lampa.Torserver.clearFileName(filteredFiles);
      
      list(plays, {
        movie: movie,
        files: filteredFiles
      });
    }
    
    function preload(data, run) {
      var need_preload = Lampa.Torserver.ip() && data.url.indexOf(Lampa.Torserver.ip()) > -1 && data.url.indexOf('&preload') > -1;
      if (need_preload) {
        var checkout;
        var network = new Lampa.Reguest(); 
        var first = true;
        
        Lampa.Loading.start(function () {
          clearInterval(checkout);
          network.clear();
          Lampa.Loading.stop(); 
        });
        
        var update = function update() {
          network.timeout(2000);
          network.silent(first ? data.url : data.url.replace('preload', 'stat'), function (res) {
            var pb = res.preloaded_bytes || 0,
              ps = res.preload_size || 0,
              sp = res.download_speed ? Lampa.Utils.bytesToSize(res.download_speed * 8, true) : '0.0';
            var progress = Math.min(100, pb * 100 / ps);
            if (progress >= 95 || isNaN(progress)) {
              Lampa.Loading.stop(); 
              clearInterval(checkout);
              run();
            } else {
              Lampa.Loading.setText(Math.round(progress) + '%' + ' - ' + sp); 
            }
          });
          first = false;
        };
        checkout = setInterval(update, 1000);
        update();
      } else run();
    }

    function list(items, params) {
      var html = $('<div class="torrent-files"></div>');
      var playlist = [];
      var scroll_to_element;
      var first_item;
      
      Lampa.Listener.send('torrent_file', {
        type: 'list_open',
        items: items
      });

      var folder = '';
      var fragment = document.createDocumentFragment();

      items.forEach(function (element, inx) {
        var exe = element.path.split('.').pop().toLowerCase();
        var view = Lampa.Timeline.view(SERVER.hash + element.id); // Уникальный хеш для трека
        
        var coverUrl = './img/img_broken.svg';
        if (element.cover_file) {
            coverUrl = Lampa.Torserver.stream(element.cover_file.path, SERVER.hash, element.cover_file.id);
        }

        Lampa.Arrays.extend(element, {
          title: element.path_human,
          first_title: params.movie.name || params.movie.title,
          size: Lampa.Utils.bytesToSize(element.length),
          url: Lampa.Torserver.stream(element.path, SERVER.hash, element.id),
          torrent_hash: SERVER.hash,
          timeline: view || {},
          img: coverUrl, 
          exe: exe,
          // ВАЖНО: Маркер для нашего хука плеера
          from_music_search: true 
        });
        
        var item = Lampa.Template.get('torrent_file', element);
        
        // Для аудио таймлайн можно показывать, если есть прогресс
        if (view && view.percent) {
             item.append(Lampa.Timeline.render(view));
        }

        if (params.movie.title) element.title = params.movie.title;

        item[0].visibility = 'hidden';
        if (view && view.percent > 0) scroll_to_element = item;

        element.title = (element.fname || element.title).replace(/<[^>]*>?/gm, '');
        playlist.push(element);

        bindItemEvents(item, element, playlist, params);

        if (element.folder_name && element.folder_name !== folder) {
          var folderDiv = document.createElement('div');
          folderDiv.className = 'torrnet-folder-name' + (folder ? '' : ' selector');
          folderDiv.innerText = element.folder_name;
          fragment.appendChild(folderDiv);
          folder = element.folder_name;
        }

        fragment.appendChild(item[0]);

        if (!first_item) first_item = item;
        
        Lampa.Listener.send('torrent_file', {
          type: 'render',
          element: element,
          item: item,
          items: items
        });
      });

      if (items.length == 0) {
          html = Lampa.Template.get('error', {
            title: Lampa.Lang.translate('empty_title'),
            text: Lampa.Lang.translate('torrent_parser_nofiles')
          });
      } else {
          Lampa.Modal.title(Lampa.Lang.translate('title_files'));
          html[0].appendChild(fragment);
      }

      if (playlist.length == 1 && first_item) autostart(first_item);
      
      Lampa.Modal.update(html);
      if (scroll_to_element) Lampa.Controller.collectionFocus(scroll_to_element, Lampa.Modal.scroll().render());
    }

    function bindItemEvents(item, element, playlist, params) {
        item.on('hover:enter', function () {
          stopAutostart();
          
          // Проверка на Android перенесена внутрь hookPlayer
          
          if (params.movie.id) Lampa.Favorite.add('history', params.movie, 100);
          
          // Подготавливаем плейлист
          if (playlist.length > 1) {
            // Клонируем элементы, чтобы не портить исходные данные, и гарантируем наличие from_music_search
            var trim_playlist = playlist.map(function(elem) {
                return {
                    title: elem.title,
                    url: elem.url,
                    timeline: elem.timeline,
                    img: elem.img,
                    from_music_search: true // ВАЖНО: передаем метку в плейлист
                };
            });
            element.playlist = trim_playlist;
          }
          
          preload(element, function () {
            Lampa.Player.play(element);
            Lampa.Player.playlist(playlist);
            Lampa.Player.callback(function () {
              Lampa.Controller.toggle('modal');
            });
            Lampa.Player.stat(element.url);
            if (callback) {
              callback();
              callback = false;
            }
          });
        }).on('hover:long', function () {
            stopAutostart();
            var enabled = Lampa.Controller.enabled().name;
            var menu = [{ title: Lampa.Lang.translate('time_reset'), timeclear: true }];
            if (Lampa.Platform.is('webos')) menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - WebOS', player: 'webos' });
            // Android пункт меню оставляем, но он будет перехвачен нашей логикой, если выбран встроенный плеер
            if (Lampa.Platform.is('android')) menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Android', player: 'android' });
            menu.push({ title: Lampa.Lang.translate('player_lauch') + ' - Lampa', player: 'lampa' });
            if (!Lampa.Platform.tv()) menu.push({ title: Lampa.Lang.translate('copy_link'), link: true });
            
            Lampa.Select.show({
                title: Lampa.Lang.translate('title_action'),
                items: menu,
                onBack: function onBack() { Lampa.Controller.toggle(enabled); },
                onSelect: function onSelect(a) {
                    if (a.timeclear) {
                        // Очистка времени
                    }
                    if (a.link) {
                        Lampa.Utils.copyTextToClipboard(element.url.replace('&preload', '&play'), 
                            function () { Lampa.Noty.show(Lampa.Lang.translate('copy_secuses')); }, 
                            function () { Lampa.Noty.show(Lampa.Lang.translate('copy_error')); }
                        );
                    }
                    Lampa.Controller.toggle(enabled);
                    if (a.player) {
                        Lampa.Player.runas(a.player);
                        item.trigger('hover:enter');
                    }
                }
            });
        }).on('hover:focus', function () {
          Lampa.Helper.show('torrents_view', Lampa.Lang.translate('helper_torrents_view'), item);
        }).on('visible', function () {
          var img = item.find('img');
          img[0].onload = function () { img.addClass('loaded'); };
          img[0].src = img.attr('data-src');
        });
    }

    function injectMusicPlayerStyles() {
        if (MUSIC_PLAYER_STATE.styles_injected) return;

        var styles = document.createElement('style');
        styles.id = 'music-search-player-styles';
        styles.textContent = `
            body.music-search-player--active .player-panel__info,
            body.music-search-player--active .player-panel__title {
                color: #f0f4ff !important;
            }

            .music-search-player__overlay {
                position: fixed;
                bottom: 2.5vh;
                right: 2vh;
                z-index: 9999;
                background: radial-gradient(120% 120% at 30% 10%, rgba(255,255,255,0.08), rgba(15,25,35,0.95));
                border: 1px solid rgba(255,255,255,0.08);
                box-shadow: 0 14px 40px rgba(0,0,0,0.4);
                border-radius: 18px;
                padding: 16px;
                min-width: 320px;
                display: flex;
                gap: 14px;
                backdrop-filter: blur(18px);
                animation: music-search-fade-in 220ms ease-out;
            }

            .music-search-player__overlay:before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: inherit;
                background: linear-gradient(135deg, rgba(100,198,255,0.08), rgba(124,92,255,0.12));
                pointer-events: none;
            }

            .music-search-player__cover {
                width: 86px;
                height: 86px;
                border-radius: 14px;
                overflow: hidden;
                flex-shrink: 0;
                position: relative;
                box-shadow: 0 10px 24px rgba(0,0,0,0.35);
            }

            .music-search-player__cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .music-search-player__body {
                position: relative;
                z-index: 1;
                display: grid;
                gap: 6px;
                align-content: center;
                color: #f9fbff;
                max-width: 360px;
            }

            .music-search-player__title {
                font-size: 16px;
                font-weight: 700;
                line-height: 1.3;
                margin: 0;
            }

            .music-search-player__subtitle {
                font-size: 13px;
                color: #c5d3ea;
                opacity: 0.9;
                margin: 0;
            }

            .music-search-player__actions {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 4px;
            }

            .music-search-player__pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                border-radius: 999px;
                padding: 8px 12px;
                background: rgba(255,255,255,0.08);
                color: #e5ecff;
                font-size: 12px;
                letter-spacing: 0.02em;
                border: 1px solid rgba(255,255,255,0.07);
            }

            .music-search-player__pill svg {
                width: 16px;
                height: 16px;
            }

            .music-search-player__shuffle {
                border: none;
                background: linear-gradient(135deg, #64c6ff, #7c5cff);
                color: #fff;
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
                box-shadow: 0 12px 24px rgba(124,92,255,0.35);
            }

            .music-search-player__shuffle[aria-pressed="true"] {
                box-shadow: 0 12px 24px rgba(124,92,255,0.6);
            }

            .music-search-player__shuffle:active {
                transform: translateY(1px);
                opacity: 0.9;
            }

            .music-search-player__shuffle svg {
                width: 18px;
                height: 18px;
            }

            @keyframes music-search-fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to   { opacity: 1; transform: translateY(0); }
            }
        `;

        document.head.appendChild(styles);
        MUSIC_PLAYER_STATE.styles_injected = true;
    }

    function shufflePlaylist(list, current) {
        if (!Array.isArray(list)) return list;
        var copy = list.slice();
        var currentUrl = current && current.url;

        for (var i = copy.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var _ref = [copy[j], copy[i]];
            copy[i] = _ref[0];
            copy[j] = _ref[1];
        }

        if (currentUrl) {
            var idx = copy.findIndex(function (item) { return item.url === currentUrl; });
            if (idx > 0) {
                var currentItem = copy.splice(idx, 1)[0];
                copy.unshift(currentItem);
            }
        }

        return copy;
    }

    function renderMusicOverlay(object) {
        injectMusicPlayerStyles();

        if (MUSIC_PLAYER_STATE.overlay) MUSIC_PLAYER_STATE.overlay.remove();

        var overlay = document.createElement('div');
        overlay.className = 'music-search-player__overlay';

        var cover = document.createElement('div');
        cover.className = 'music-search-player__cover';
        var img = document.createElement('img');
        img.src = object.img || './img/img_broken.svg';
        cover.appendChild(img);

        var body = document.createElement('div');
        body.className = 'music-search-player__body';

        var title = document.createElement('p');
        title.className = 'music-search-player__title';
        title.textContent = object.title || object.first_title || Lampa.Lang.translate('title_player');

        var subtitle = document.createElement('p');
        subtitle.className = 'music-search-player__subtitle';
        subtitle.textContent = object.first_title || 'TorrentMusic.js';

        var pill = document.createElement('span');
        pill.className = 'music-search-player__pill';
        pill.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12a8 8 0 1016 0A8 8 0 004 12zm8-5a1 1 0 011 1v3.586l2.121 2.122a1 1 0 11-1.414 1.414l-2.414-2.414A1 1 0 0111 12V8a1 1 0 011-1z" fill="currentColor"/></svg>' + Lampa.Lang.translate('player_time_start');

        var actions = document.createElement('div');
        actions.className = 'music-search-player__actions';

        var shuffleBtn = document.createElement('button');
        shuffleBtn.type = 'button';
        shuffleBtn.className = 'music-search-player__shuffle';
        shuffleBtn.setAttribute('aria-pressed', MUSIC_PLAYER_STATE.shuffle);
        shuffleBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h3.5l3-4 5 6H20"/><path d="M4 4h3.5l8 12H20"/><path d="M18 4h3v3"/><path d="M18 4l3 3"/><path d="M18 20h3v-3"/><path d="M18 20l3-3"/></svg>' + Lampa.Lang.translate('player_random') + (MUSIC_PLAYER_STATE.shuffle ? ' ✓' : '');

        shuffleBtn.addEventListener('click', function () {
            MUSIC_PLAYER_STATE.shuffle = !MUSIC_PLAYER_STATE.shuffle;
            Lampa.Storage.set('music_search_shuffle', MUSIC_PLAYER_STATE.shuffle);
            shuffleBtn.setAttribute('aria-pressed', MUSIC_PLAYER_STATE.shuffle);
            shuffleBtn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h3.5l3-4 5 6H20"/><path d="M4 4h3.5l8 12H20"/><path d="M18 4h3v3"/><path d="M18 4l3 3"/><path d="M18 20h3v-3"/><path d="M18 20l3-3"/></svg>' + Lampa.Lang.translate('player_random') + (MUSIC_PLAYER_STATE.shuffle ? ' ✓' : '');

            var ctx = MUSIC_PLAYER_STATE.pending_playlist_context;
            if (ctx && ctx.list && ctx.object) {
                var base = ctx.original ? ctx.original.slice() : (ctx.list.slice ? ctx.list.slice() : ctx.list);
                var updatedList = MUSIC_PLAYER_STATE.shuffle ? shufflePlaylist(base, ctx.object) : base;
                ctx.skip_shuffle = true;
                ctx.list = updatedList;
                if (!ctx.original && base) ctx.original = base.slice();
                Lampa.Player.playlist(updatedList);
            }
        });

        actions.appendChild(shuffleBtn);
        body.appendChild(title);
        body.appendChild(subtitle);
        body.appendChild(actions);
        body.appendChild(pill);

        overlay.appendChild(cover);
        overlay.appendChild(body);

        document.body.appendChild(overlay);

        document.body.classList.add('music-search-player--active');
        MUSIC_PLAYER_STATE.overlay = overlay;
    }

    function clearMusicOverlay() {
        if (MUSIC_PLAYER_STATE.overlay && MUSIC_PLAYER_STATE.overlay.parentNode) {
            MUSIC_PLAYER_STATE.overlay.parentNode.removeChild(MUSIC_PLAYER_STATE.overlay);
        }
        MUSIC_PLAYER_STATE.overlay = null;
        document.body.classList.remove('music-search-player--active');
    }

    function autostart(item) {
      var tim = Date.now();
      var div = $('<div class="torrent-serial__progress"></div>');
      autostart_timer = setInterval(function () {
        var dif = (Date.now() - tim) / 1000;
        div.css('height', Math.round(dif / 10 * 100) + '%');
        if (dif > 10) {
          stopAutostart();
          item.trigger('hover:enter');
        }
      }, 10);
      Lampa.Keypad.listener.follow('keydown', listenKeydown);
      autostart_progress = div;
      item.prepend(div);
    }
    function listenKeydown() {
      stopAutostart();
      Lampa.Keypad.listener.remove('keydown', listenKeydown);
    }
    function stopAutostart() {
      clearInterval(autostart_timer);
      if (autostart_progress) autostart_progress.remove();
      autostart_progress = null;
    }
    function opened(call) {
      callback = call;
    }
    function back(call) {
      callback_back = call;
    }
    function close() {
      Lampa.Torserver.drop(SERVER.hash);
      Lampa.Torserver.clear();
      clearInterval(timers.files);
      if (callback_back) {
        callback_back();
      } else {
        Lampa.Controller.toggle('content');
      }
      callback_back = false;
      SERVER = {};
      clearInterval(autostart_timer);
      Lampa.Listener.send('torrent_file', {
        type: 'list_close'
      });
    }
    var Torrent = {
      start: start,
      open: open,
      opened: opened,
      back: back
    };

    var url;
    var network = new Lampa.Reguest();
    function init() {
      Lampa.Storage.set('parser_torrent_type', Lampa.Storage.get('parser_torrent_type') || 'jackett');
      var source = {
        title: Lampa.Lang.translate('title_parser'),
        search: function search(params, oncomplite) {
          get({
            search: decodeURIComponent(params.query),
            other: true,
            from_search: true
          }, function (json) {
            json.title = Lampa.Lang.translate('title_parser');
            json.results = json.Results.slice(0, 20);
            json.Results = null;
            json.results.forEach(function (element) {
              element.Title = Lampa.Utils.shortText(element.Title, 110);
            });
            oncomplite(json.results.length ? [json] : []);
          }, function () {
            oncomplite([]);
          });
        },
        onCancel: function onCancel() {
          network.clear();
        },
        params: {
          lazy: true,
          align_left: true,
          isparser: true,
          card_events: {
            onMenu: function onMenu() {}
          }
        },
        onMore: function onMore(params, close) {
          close();
          Lampa.Activity.push({
            url: '',
            title: Lampa.Lang.translate('title_torrents'),
            component: 'torrents',
            search: params.query,
            from_search: true,
            noinfo: true,
            movie: {
              title: params.query,
              original_title: '',
              img: './img/img_broken.svg',
              genres: []
            },
            page: 1
          });
        },
        onSelect: function onSelect(params, close) {
          Torrent.start(params.element, {
            title: params.element.Title
          });
          Lampa.Torrent.back(params.line.toggle.bind(params.line));
        }
      };
      function addSource() {
        var reg = Lampa.Platform.is('android') ? true : Lampa.Torserver.url();
        if (Lampa.Storage.field('parse_in_search') && reg) Lampa.Search.addSource(source);
      }
      Lampa.Storage.listener.follow('change', function (e) {
        if (e.name == 'parse_in_search' || e.name == 'torrserver_url' || e.name == 'torrserver_url_two' || e.name == 'torrserver_use_link') {
          Lampa.Search.removeSource(source);
          addSource();
        }
      });
      addSource();
    }
    
    function get() {
      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var oncomplite = arguments.length > 1 ? arguments[1] : undefined;
      var onerror = arguments.length > 2 ? arguments[2] : undefined;
      
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
      function error(e) {
        onerror(e);
      }
      
      if (Lampa.Storage.field('parser_torrent_type') == 'jackett') {
        if (Lampa.Storage.field('jackett_url')) {
          url = Lampa.Utils.checkEmptyUrl(Lampa.Storage.field('jackett_url'));
          var ignore = false; 
          if (ignore) error('');else {
            jackett(params, complite, error);
          }
        } else {
          error(Lampa.Lang.translate('torrent_parser_set_link') + ': Jackett');
        }
      } else if (Lampa.Storage.field('parser_torrent_type') == 'prowlarr') {
        if (Lampa.Storage.field('prowlarr_url')) {
          url = Lampa.Utils.checkEmptyUrl(Lampa.Storage.field('prowlarr_url'));
          prowlarr(params, complite, error);
        } else {
          error(Lampa.Lang.translate('torrent_parser_set_link') + ': Prowlarr');
        }
      } else if (Lampa.Storage.field('parser_torrent_type') == 'torrserver') {
        if (Lampa.Storage.field(Lampa.Storage.field('torrserver_use_link') == 'two' ? 'torrserver_url_two' : 'torrserver_url')) {
          url = Lampa.Utils.checkEmptyUrl(Lampa.Storage.field(Lampa.Storage.field('torrserver_use_link') == 'two' ? 'torrserver_url_two' : 'torrserver_url'));
          torrserver(params, complite, error);
        } else {
          error(Lampa.Lang.translate('torrent_parser_set_link') + ': TorrServer');
        }
      }
    }
    function viewed(hash) {
      var view = Lampa.Storage.cache('torrents_view', 5000, []);
      return view.indexOf(hash) > -1;
    }
    function jackett() {
      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var oncomplite = arguments.length > 1 ? arguments[1] : undefined;
      var onerror = arguments.length > 2 ? arguments[2] : undefined;
      network.timeout(1000 * Lampa.Storage.field('parse_timeout'));
      var u = url + '/api/v2.0/indexers/' + (Lampa.Storage.field('jackett_interview') === 'healthy' ? 'status:healthy' : 'all') + '/results?apikey=' + Lampa.Storage.field('jackett_key') + '&Category%5B%5D=3020&Category%5B%5D=3040&Category%5B%5D=100375&Query=' + encodeURIComponent(params.search);
      if (!params.from_search) {
        var genres = params.movie.genres.map(function (a) {
          return a.name;
        });
        if (!params.clarification) {
          u = Lampa.Utils.addUrlComponent(u, 'title=' + encodeURIComponent(params.movie.title));
          u = Lampa.Utils.addUrlComponent(u, 'title_original=' + encodeURIComponent(params.movie.original_title));
        }
        u = Lampa.Utils.addUrlComponent(u, 'year=' + encodeURIComponent(((params.movie.release_date || params.movie.first_air_date || '0000') + '').slice(0, 4)));
        u = Lampa.Utils.addUrlComponent(u, 'is_serial=' + (params.movie.original_name ? '2' : params.other ? '0' : '1'));
        u = Lampa.Utils.addUrlComponent(u, 'genres=' + encodeURIComponent(genres.join(',')));
        u = Lampa.Utils.addUrlComponent(u, 'Category[]=' + (params.movie.number_of_seasons > 0 ? 5000 : 2000) + (params.movie.original_language == 'ja' ? ',5070' : ''));
      }
      network["native"](u, function (json) {
        if (json.Results) {
          json.Results = json.Results.filter(function (element) {
            return element.TrackerId !== "toloka";
          });
          json.Results.forEach(function (element) {
            element.PublisTime = Lampa.Utils.strToTime(element.PublishDate);
            element.hash = Lampa.Utils.hash(element.Title);
            element.viewed = viewed(element.hash);
            element.size = Lampa.Utils.bytesToSize(element.Size);
          });
          oncomplite(json);
        } else onerror(Lampa.Lang.translate('torrent_parser_no_responce') + ' (' + url + ')');
      }, function (a, c) {
        onerror(Lampa.Lang.translate('torrent_parser_no_responce') + ' (' + url + ')');
      });
    }

    function prowlarr() {
      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var oncomplite = arguments.length > 1 ? arguments[1] : undefined;
      var onerror = arguments.length > 2 ? arguments[2] : undefined;
      var q = [];
      q.push({
        name: 'apikey',
        value: Lampa.Storage.field('prowlarr_key')
      });
      q.push({
        name: 'query',
        value: params.search
      });
      if (!params.from_search) {
        var isSerial = !!params.movie.original_name;
        if (params.movie.number_of_seasons > 0) {
          q.push({
            name: 'categories',
            value: '5000'
          });
        }
        if (params.movie.original_language == 'ja') {
          q.push({
            name: 'categories',
            value: '5070'
          });
        }
        q.push({
          name: 'type',
          value: isSerial ? 'tvsearch' : 'search'
        });
      }
      var u = Lampa.Utils.buildUrl(url, '/api/v1/search', q);
      network.timeout(1000 * Lampa.Storage.field('parse_timeout'));
      network["native"](u, function (json) {
        if (Array.isArray(json)) {
          oncomplite({
            Results: json.filter(function (e) {
              return e.protocol === 'torrent';
            }).map(function (e) {
              var hash = Lampa.Utils.hash(e.title);
              return {
                Title: e.title,
                Tracker: e.indexer,
                size: Lampa.Utils.bytesToSize(e.size),
                PublishDate: Lampa.Utils.strToTime(e.publishDate),
                Seeders: parseInt(e.seeders),
                Peers: parseInt(e.leechers),
                MagnetUri: e.downloadUrl,
                viewed: viewed(hash),
                hash: hash
              };
            })
          });
        } else {
          onerror(Lampa.Lang.translate('torrent_parser_request_error') + ' (' + JSON.stringify(json) + ')');
        }
      }, function () {
        onerror(Lampa.Lang.translate('torrent_parser_no_responce') + ' (' + url + ')');
      });
    }
    function torrserver() {
      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var oncomplite = arguments.length > 1 ? arguments[1] : undefined;
      var onerror = arguments.length > 2 ? arguments[2] : undefined;
      network.timeout(1000 * Lampa.Storage.field('parse_timeout'));
      var u = Lampa.Utils.buildUrl(url, '/search/', [{
        name: 'query',
        value: params.search
      }]);
      network["native"](u, function (json) {
        if (Array.isArray(json)) {
          oncomplite({
            Results: json.map(function (e) {
              var hash = Lampa.Utils.hash(e.Title);
              return {
                Title: e.Title,
                Tracker: e.Tracker,
                size: e.Size,
                PublishDate: Lampa.Utils.strToTime(e.CreateDate),
                Seeders: parseInt(e.Seed),
                Peers: parseInt(e.Peer),
                MagnetUri: e.Magnet,
                viewed: viewed(hash),
                CategoryDesc: e.Categories,
                bitrate: '-',
                hash: hash
              };
            })
          });
        } else onerror(Lampa.Lang.translate('torrent_parser_request_error') + ' (' + JSON.stringify(json) + ')');
      }, function (a, c) {
        onerror(Lampa.Lang.translate('torrent_parser_no_responce') + ' (' + url + ')');
      });
    }
    function clear() {
      network.clear();
    }
    var Parser = {
      init: init,
      get: get,
      jackett: jackett,
      clear: clear
    };

    function component(object) {
      console.log('object', object);
      var network = new Lampa.Reguest();
      var scroll = new Lampa.Scroll({
        mask: true,
        over: true
      });
      var files = new Lampa.Explorer(object);
      var filter;
      var results = [];
      var filtred = [];
      var total_pages = 1;
      var last;
      var initialized;
      var filterTimeout; 

      var filter_items = {
        quality: [Lampa.Lang.translate('torrent_parser_any_one'), '4k', '1080p', '720p'],
        tracker: [Lampa.Lang.translate('torrent_parser_any_two')],
        year: [Lampa.Lang.translate('torrent_parser_any_two')],
        format: [Lampa.Lang.translate('torrent_parser_any_two')] 
      };
      
      var filter_translate = {
        quality: Lampa.Lang.translate('torrent_parser_quality'),
        tracker: Lampa.Lang.translate('torrent_parser_tracker'),
        year: Lampa.Lang.translate('torrent_parser_year'),
        format: 'Format' 
      };
      
      var filter_multiple = ['quality', 'tracker', 'format']; 
      var sort_translate = {
        Seeders: Lampa.Lang.translate('torrent_parser_sort_by_seeders'),
        Size: Lampa.Lang.translate('torrent_parser_sort_by_size'),
        Title: Lampa.Lang.translate('torrent_parser_sort_by_name'),
        Tracker: Lampa.Lang.translate('torrent_parser_sort_by_tracker'),
        PublisTime: Lampa.Lang.translate('torrent_parser_sort_by_date'),
        viewed: Lampa.Lang.translate('torrent_parser_sort_by_viewed')
      };
      
      var i = 50,
        y = new Date().getFullYear();
      while (i--) {
        filter_items.year.push(y - (49 - i) + '');
      }
      
      var viewed = Lampa.Storage.cache('torrents_view', 5000, []);
      
      var regexCache = {};

      scroll.minus(files.render().find('.explorer__files-head'));
      scroll.body().addClass('torrent-list');
      this.create = function () {
        return this.render();
      };
      this.initialize = function () {
        var _this = this;
        this.activity.loader(true);
        this.parse();
        scroll.onEnd = this.next.bind(this);
        return this.render();
      };
      this.parse = function () {
        var _this2 = this;
        filter = new Lampa.Filter(object);
        Parser.get(object, function (data) {
          results = data;
          _this2.build();
          Lampa.Layer.update(scroll.render(true));
          _this2.activity.loader(false);
          _this2.activity.toggle();
        }, function (text) {
          _this2.empty(Lampa.Lang.translate('torrent_error_connect') + ': ' + text);
        });
        filter.onSearch = function (value) {
          Lampa.Activity.replace({
            search: value,
            clarification: true
          });
        };
        filter.onBack = function () {
          _this2.start();
        };
        filter.render().find('.selector').on('hover:focus', function (e) {
          e.target;
        });
        filter.addButtonBack();
        files.appendHead(filter.render());
      };
      this.empty = function (descr) {
        var empty = new Lampa.Empty({
          descr: descr
        });
        files.render().find('.explorer__files-head').addClass('hide');
        files.appendFiles(empty.render(filter.empty()));
        empty.render().find('.simple-button').on('hover:enter', function () {
          filter.render().find('.filter--search').trigger('hover:enter');
        });
        this.start = empty.start;
        this.activity.loader(false);
        this.activity.toggle();
      };
      this.listEmpty = function () {
        var em = Lampa.Template.get('empty_filter');
        var bn = $('<div class="simple-button selector"><span>' + Lampa.Lang.translate('filter_clarify') + '</span></div>');
        bn.on('hover:enter', function () {
          filter.render().find('.filter--filter').trigger('hover:enter');
        });
        em.find('.empty-filter__title').remove();
        em.find('.empty-filter__buttons').removeClass('hide').append(bn);
        scroll.append(em);
      };
      this.buildSorted = function () {
        var need = Lampa.Storage.get('torrents_sort', 'Seeders');
        var select = [{
          title: Lampa.Lang.translate('torrent_parser_sort_by_seeders'),
          sort: 'Seeders'
        }, {
          title: Lampa.Lang.translate('torrent_parser_sort_by_size'),
          sort: 'Size'
        }, {
          title: Lampa.Lang.translate('torrent_parser_sort_by_name'),
          sort: 'Title'
        }, {
          title: Lampa.Lang.translate('torrent_parser_sort_by_tracker'),
          sort: 'Tracker'
        }, {
          title: Lampa.Lang.translate('torrent_parser_sort_by_date'),
          sort: 'PublisTime'
        }, {
          title: Lampa.Lang.translate('torrent_parser_sort_by_viewed'),
          sort: 'viewed'
        }];
        select.forEach(function (element) {
          if (element.sort === need) element.selected = true;
        });
        filter.sort(results.Results, need);
        this.sortWithPopular();
        filter.set('sort', select);
        this.selectedSort();
      };
      this.sortWithPopular = function () {
        var popular = [];
        var other = [];
        results.Results.forEach(function (a) {
          if (a.viewing_request) popular.push(a);else other.push(a);
        });
        popular.sort(function (a, b) {
          return b.viewing_average - a.viewing_average;
        });
        results.Results = popular.concat(other);
      };
      this.cardID = function () {
        return object.movie.id + ':' + (object.movie.number_of_seasons ? 'tv' : 'movie');
      };
      this.getFilterData = function () {
        var all = Lampa.Storage.cache('torrents_filter_data', 500, {});
        var cid = this.cardID();
        return all[cid] || Lampa.Storage.get('torrents_filter', '{}');
      };
      this.setFilterData = function (filter) {
        var all = Lampa.Storage.cache('torrents_filter_data', 500, {});
        var cid = this.cardID();
        all[cid] = filter;
        Lampa.Storage.set('torrents_filter_data', all);
        Lampa.Storage.set('torrents_filter', filter);
      };
      
      this.buildFilterd = function () {
        var need = this.getFilterData();
        var select = [];
        var add = function add(type, title) {
          var items = filter_items[type];
          var subitems = [];
          var multiple = filter_multiple.indexOf(type) >= 0;
          var value = need[type];
          if (multiple) value = Lampa.Arrays.toArray(value);
          items.forEach(function (name, i) {
            subitems.push({
              title: name,
              checked: multiple && value.indexOf(name) >= 0,
              checkbox: multiple && i > 0,
              noselect: true,
              index: i
            });
          });
          select.push({
            title: title,
            subtitle: multiple ? value.length ? value.join(', ') : items[0] : typeof value === 'undefined' ? items[0] : items[value],
            items: subitems,
            noselect: true,
            stype: type
          });
        };
        
        filter_items.tracker = [Lampa.Lang.translate('torrent_parser_any_two')];
        filter_items.format = [Lampa.Lang.translate('torrent_parser_any_two')]; 

        var known_formats = ['FLAC', 'MP3', 'WAV', 'AAC', 'ALAC', 'DSD', 'SACD', 'APE', 'DTS', 'AC3'];

        results.Results.forEach(function (element) {
          var tracker = element.Tracker;
          var title = element.Title.toUpperCase();

          tracker.split(',').forEach(function (t) {
            if (filter_items.tracker.indexOf(t.trim()) === -1) filter_items.tracker.push(t.trim());
          });

          known_formats.forEach(function(fmt) {
            if (title.indexOf(fmt) !== -1) {
                if (filter_items.format.indexOf(fmt) === -1) filter_items.format.push(fmt);
            }
          });
          if (title.indexOf('320') !== -1 && filter_items.format.indexOf('MP3') === -1) {
             filter_items.format.push('MP3');
          }
        });
        
        need.tracker = Lampa.Arrays.removeNoIncludes(Lampa.Arrays.toArray(need.tracker), filter_items.tracker);
        need.format = Lampa.Arrays.removeNoIncludes(Lampa.Arrays.toArray(need.format), filter_items.format);
        this.setFilterData(need);
        
        select.push({
          title: Lampa.Lang.translate('torrent_parser_reset'),
          reset: true
        });
        
        add('format', 'Format'); 
        add('tracker', Lampa.Lang.translate('torrent_parser_tracker'));
        add('year', Lampa.Lang.translate('torrent_parser_year'));
        
        filter.set('filter', select);
        this.selectedFilter();
      };

      this.selectedFilter = function () {
        var need = this.getFilterData(),
          select = [];
        for (var _i2 in need) {
          if (need[_i2]) {
            if (Lampa.Arrays.isArray(need[_i2])) {
              if (need[_i2].length) select.push(filter_translate[_i2] + ':' + need[_i2].join(', '));
            } else {
              select.push(filter_translate[_i2] + ': ' + filter_items[_i2][need[_i2]]);
            }
          }
        }
        filter.chosen('filter', select);
      };
      this.selectedSort = function () {
        var select = Lampa.Storage.get('torrents_sort', 'Seeders');
        filter.chosen('sort', [sort_translate[select]]);
      };
      this.build = function () {
        var _this3 = this;
        this.buildSorted();
        this.buildFilterd();
        this.filtred();
        filter.onSelect = function (type, a, b) {
          if (type === 'sort') {
            Lampa.Storage.set('torrents_sort', a.sort);
            filter.sort(results.Results, a.sort);
            _this3.sortWithPopular();
          } else {
            if (a.reset) {
              _this3.setFilterData({});
              _this3.buildFilterd();
            } else {
              a.items.forEach(function (n) {
                return n.checked = false;
              });
              var filter_data = _this3.getFilterData();
              filter_data[a.stype] = filter_multiple.indexOf(a.stype) >= 0 ? [] : b.index;
              a.subtitle = b.title;
              _this3.setFilterData(filter_data);
            }
          }
          _this3.applyFilter();
          _this3.start();
        };
        filter.onCheck = function (type, a, b) {
          var data = _this3.getFilterData(),
            need = Lampa.Arrays.toArray(data[a.stype]);
          if (b.checked && need.indexOf(b.title)) need.push(b.title);else if (!b.checked) Lampa.Arrays.remove(need, b.title);
          data[a.stype] = need;
          _this3.setFilterData(data);
          a.subtitle = need.length ? need.join(', ') : a.items[0].title;
          _this3.applyFilter();
        };
        if (results.Results.length) this.showResults();else {
          this.empty(Lampa.Lang.translate('torrent_parser_empty'));
        }
      };
      
      this.applyFilter = function () {
        clearTimeout(filterTimeout);
        var _this = this;
        filterTimeout = setTimeout(function() {
            _this.filtred();
            _this.selectedFilter();
            _this.selectedSort();
            _this.reset();
            _this.showResults();
            last = scroll.render().find('.torrent-item:eq(0)')[0];
            if (last) scroll.update(last);else scroll.reset();
        }, 100); 
      };
      
      this.filtred = function () {
        var filter_data = this.getFilterData();
        var filter_any = false;
        for (var _i3 in filter_data) {
          var filr = filter_data[_i3];
          if (filr) {
            if (Lampa.Arrays.isArray(filr)) {
              if (filr.length) filter_any = true;
            } else filter_any = true;
          }
        }
        filtred = results.Results.filter(function (element) {
          if (filter_any) {
            var passed = false,
              nopass = false,
              title = element.Title.toLowerCase(),
              tracker = element.Tracker;
            var tra = Lampa.Arrays.toArray(filter_data.tracker),
                yer = filter_data.year,
                fmt = Lampa.Arrays.toArray(filter_data.format); 

            var test = function test(search, test_index) {
              if (!regexCache[search]) {
                  try {
                      regexCache[search] = new RegExp(search);
                  } catch (e) {
                      regexCache[search] = { test: function() { return false; } }; 
                  }
              }
              return test_index ? title.indexOf(search) >= 0 : regexCache[search].test(title);
            };

            var check = function check(search, invert) {
              if (test(search)) {
                if (invert) nopass = true;else passed = true;
              } else {
                if (invert) passed = true;else nopass = true;
              }
            };
            var includes = function includes(type, arr) {
              if (!arr.length) return;
              var any = false;
              arr.forEach(function (a) {
                if (type === 'tracker') {
                  if (tracker.split(',').find(function (t) {
                    return t.trim().toLowerCase() === a.toLowerCase();
                  })) any = true;
                }
                if (type === 'format') {
                    if (title.indexOf(a.toLowerCase()) >= 0) any = true;
                    if (a === 'MP3' && title.indexOf('320') >= 0) any = true;
                }
              });
              if (any) passed = true;else nopass = true;
            };
            
            includes('tracker', tra);
            includes('format', fmt); 
            
            if (yer) {
              check(filter_items.year[yer]);
            }
            return nopass ? false : passed;
          } else return true;
        });
      };
      
      this.showResults = function () {
        total_pages = Math.ceil(filtred.length / 20);
        if (filtred.length) {
          this.append(filtred.slice(0, 20));
        } else {
          this.listEmpty();
        }
        files.appendFiles(scroll.render());
      };
      this.reset = function () {
        last = false;
        scroll.clear();
      };
      this.next = function () {
        if (object.page < 15 && object.page < total_pages) {
          object.page++;
          var offset = (object.page - 1) * 20;
          this.append(filtred.slice(offset, offset + 20), true);
        }
      };
      this.loadMagnet = function (element, call) {
        var _this4 = this;
        Parser.marnet(element, function () {
          Lampa.Modal.close();
          element.poster = object.movie.img;
          _this4.start();
          if (call) call();else Torrent.start(element, object.movie);
        }, function (text) {
          Lampa.Modal.update(Lampa.Template.get('error', {
            title: Lampa.Lang.translate('title_error'),
            text: text
          }));
        });
        Lampa.Modal.open({
          title: '',
          html: Lampa.Template.get('modal_pending', {
            text: Lampa.Lang.translate('torrent_get_magnet')
          }),
          onBack: function onBack() {
            Lampa.Modal.close();
            network.clear();
            Lampa.Controller.toggle('content');
          }
        });
      };
      this.mark = function (element, item, add) {
        if (add) {
          if (viewed.indexOf(element.hash) === -1) {
            viewed.push(element.hash);
            item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
          }
        } else {
          element.viewed = true;
          Lampa.Arrays.remove(viewed, element.hash);
          item.find('.torrent-item__viewed').remove();
        }
        element.viewed = add;
        Lampa.Storage.set('torrents_view', viewed);
        if (!add) Lampa.Storage.remove('torrents_view', element.hash);
      };
      this.addToBase = function (element) {
        Lampa.Torserver.add({
          poster: object.movie.img,
          title: object.movie.title + ' / ' + object.movie.original_title,
          link: element.MagnetUri || element.Link,
          data: {
            lampa: true,
            movie: object.movie
          }
        }, function () {
          Lampa.Noty.show(object.movie.title + ' - ' + Lampa.Lang.translate('torrent_parser_added_to_mytorrents'));
        });
      };
      this.append = function (items, append) {
        var _this5 = this;
        items.forEach(function (element) {
          var date = Lampa.Utils.parseTime(element.PublishDate);
          var bitrate = object.movie.runtime ? Lampa.Utils.calcBitrate(element.Size, object.movie.runtime) : 0;
          Lampa.Arrays.extend(element, {
            title: element.Title,
            date: date.full,
            tracker: element.Tracker,
            bitrate: bitrate,
            size: !isNaN(parseInt(element.Size)) ? Lampa.Utils.bytesToSize(element.Size) : element.size,
            seeds: element.Seeders,
            grabs: element.Peers
          });
          var item = Lampa.Template.get('torrent', element);
          
          if (!bitrate) item.find('.bitrate').remove();
          if (element.viewed) item.append('<div class="torrent-item__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
          if (!element.size || parseInt(element.size) === 0) item.find('.torrent-item__size').remove();
          item.on('hover:focus', function (e) {
            last = e.target;
            scroll.update($(e.target), true);
            Lampa.Helper.show('torrents', Lampa.Lang.translate('helper_torrents'), item);
          }).on('hover:hover hover:touch', function (e) {
            last = e.target;
            Navigator.focused(last);
          }).on('hover:enter', function (e) {
            last = e.target;
            Lampa.Torrent.opened(function () {
              _this5.mark(element, item, true);
            });
            if (element.reguest && !element.MagnetUri) {
              _this5.loadMagnet(element);
            } else {
              element.poster = object.movie.img;
              _this5.start();
              Torrent.start(element, object.movie);
            }
            Lampa.Listener.send('torrent', {
              type: 'onenter',
              element: element,
              item: item
            });
          }).on('hover:long', function () {
            var enabled = Lampa.Controller.enabled().name;
            var menu = [{
              title: Lampa.Lang.translate('torrent_parser_add_to_mytorrents'),
              tomy: true
            }, {
              title: Lampa.Lang.translate('torrent_parser_label_title'),
              subtitle: Lampa.Lang.translate('torrent_parser_label_descr'),
              mark: true
            }, {
              title: Lampa.Lang.translate('torrent_parser_label_cancel_title'),
              subtitle: Lampa.Lang.translate('torrent_parser_label_cancel_descr'),
              unmark: true
            }];
            Lampa.Listener.send('torrent', {
              type: 'onlong',
              element: element,
              item: item,
              menu: menu
            });
            Lampa.Select.show({
              title: Lampa.Lang.translate('title_action'),
              items: menu,
              onBack: function onBack() {
                Lampa.Controller.toggle(enabled);
              },
              onSelect: function onSelect(a) {
                if (a.tomy) {
                  if (element.reguest && !element.MagnetUri) {
                    _this5.loadMagnet(element, function () {
                      _this5.addToBase(element);
                    });
                  } else _this5.addToBase(element);
                } else if (a.mark) {
                  _this5.mark(element, item, true);
                } else if (a.unmark) {
                  _this5.mark(element, item, false);
                }
                Lampa.Controller.toggle(enabled);
              }
            });
          });
          Lampa.Listener.send('torrent', {
            type: 'render',
            element: element,
            item: item
          });
          scroll.append(item);
          if (append) Lampa.Controller.collectionAppend(item);
        });
      };
      this.back = function () {
        Lampa.Activity.backward();
      };
      this.start = function () {
        if (Lampa.Activity.active().activity !== this.activity) return;
        if (!initialized) {
          initialized = true;
          this.initialize();
        }
        Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
        Lampa.Controller.add('content', {
          toggle: function toggle() {
            Lampa.Controller.collectionSet(scroll.render(), files.render(true));
            Lampa.Controller.collectionFocus(last || false, scroll.render(true));
          },
          update: function update() {},
          up: function up() {
            if (Navigator.canmove('up')) {
              Navigator.move('up');
            } else Lampa.Controller.toggle('head');
          },
          down: function down() {
            Navigator.move('down');
          },
          right: function right() {
            if (Navigator.canmove('right')) Navigator.move('right');else filter.render().find('.filter--filter').trigger('hover:enter');
          },
          left: function left() {
            var poster = files.render().find('.explorer-card__head-img');
            if (poster.hasClass('focus')) Lampa.Controller.toggle('menu');else if (Navigator.canmove('left')) Navigator.move('left');else Navigator.focus(poster[0]);
          },
          back: this.back
        });
        Lampa.Controller.toggle('content');
      };
      this.pause = function () {};
      this.stop = function () {};
      this.render = function () {
        return files.render();
      };
      this.destroy = function () {
        network.clear();
        Parser.clear();
        files.destroy();
        scroll.destroy();
        results = null;
        network = null;
      };
    }

    function startPlugin() {
      function cleanupUserClarifys() {
        var clarifys = Lampa.Storage.get('user_clarifys', '{}');
        if (clarifys.undefined && Array.isArray(clarifys.undefined)) {
          if (clarifys.undefined.length > 3) {
            clarifys.undefined = clarifys.undefined.slice(-3);
          }
        }
        Lampa.Storage.set('user_clarifys', clarifys);
      }

      function addSettings() {
         Lampa.SettingsApi.addParam({
             component: 'player',
             param: {
                 name: 'player_music_torrent',
                 type: 'select',
                 values: {
                     'android': 'Android (Внешний)',
                     'inner': 'Lampa (Встроенный)'
                 },
                 default: 'android'
             },
             field: {
                 name: 'Плеер для музыки (Music Search)',
                 description: 'Выберите плеер для воспроизведения торрентов из Music Search'
             },
             onChange: function(value) {
                 Lampa.Storage.set('player_music_torrent', value);
             }
         });
      }

      function hookPlayer() {
         var original_play = Lampa.Player.play;
         var original_playlist = Lampa.Player.playlist;
         var original_platform_is = Lampa.Platform.is;

         // Слушаем уничтожение плеера, чтобы сбросить спуфинг и UI
         Lampa.Player.listener.follow('destroy', function() {
             if (PLAYER_STATE.spoofed) {
                 console.log('MusicSearch: Player destroyed, restoring platform');
                 Lampa.Platform.is = PLAYER_STATE.original_platform;
                 PLAYER_STATE.spoofed = false;
                 PLAYER_STATE.original_platform = null;
             }
             MUSIC_PLAYER_STATE.pending_playlist_context = null;
             clearMusicOverlay();
         });

         Lampa.Player.play = function (object) {
             var player_mode = Lampa.Storage.field('player_music_torrent');

             if (object && object.from_music_search) {
                 MUSIC_PLAYER_STATE.pending_playlist_context = {
                     object: object,
                     list: object.playlist || null,
                     original: object.playlist && object.playlist.slice ? object.playlist.slice() : null,
                     skip_shuffle: false
                 };
                 renderMusicOverlay(object);

                 if (player_mode === 'inner' && (Lampa.Platform.is('android') || PLAYER_STATE.spoofed)) {
                     if (!PLAYER_STATE.spoofed) {
                         console.log('MusicSearch: Spooofing Android -> False');
                         PLAYER_STATE.original_platform = original_platform_is;
                         PLAYER_STATE.spoofed = true;

                         Lampa.Platform.is = function(what) {
                             if (what === 'android') return false;
                             return PLAYER_STATE.original_platform(what);
                         };
                     }

                     if (object.url) object.url = object.url.replace('intent:', 'http:');
                 }
             } else {
                 MUSIC_PLAYER_STATE.pending_playlist_context = null;
                 clearMusicOverlay();
             }

             original_play(object);
         };

         Lampa.Player.playlist = function(list) {
             var ctx = MUSIC_PLAYER_STATE.pending_playlist_context;
             if (ctx && Array.isArray(list)) {
                 if (!ctx.original) ctx.original = list.slice();

                 if (!ctx.skip_shuffle && MUSIC_PLAYER_STATE.shuffle) {
                     list = shufflePlaylist(list, ctx.object);
                 }

                 ctx.list = list;
                 ctx.skip_shuffle = false;
             } else {
                 MUSIC_PLAYER_STATE.pending_playlist_context = null;
             }

             original_playlist(list);
         };
      }

      cleanupUserClarifys();
      window.lmeMusicSearch_ready = true;
      
      var manifest = {
        type: 'other',
        version: '1.0',
        name: 'Music Search',
        description: 'Music-styled player with shuffle, covers and player switch',
        component: 'lmeMusicSearch'
      };
      Lampa.Manifest.plugins = manifest;
      Lampa.Component.add('lmeMusicSearch', component);
      
      function add() {
        var button = $("<li class=\"menu__item selector\">\n            <div class=\"menu__ico\">\n                <svg width=\"60\" height=\"60\" viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\">\n                    <path d=\"M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\" fill=\"white\"/>\n                </svg>\n            </div>\n            <div class=\"menu__text\">".concat(manifest.name, "</div>\n        </li>"));
        button.on('hover:enter', function () {
          Lampa.Activity.push({
            url: '',
            title: manifest.name,
            component: manifest.component,
            search: 'Metallica',
            from_search: true,
            noinfo: true,
            movie: {
              title: '',
              original_title: '',
              img: './img/img_broken.svg',
              genres: []
            },
            page: 1
          });
        });
        $('.menu .menu__list').eq(0).append(button);
      }

      if (window.appready) {
          add();
          addSettings();
          hookPlayer();
      } else {
        Lampa.Listener.follow('app', function (e) {
          if (e.type === 'ready') {
              add();
              addSettings();
              hookPlayer();
          }
        });
      }
    }
    if (!window.lmeMusicSearch_ready) startPlugin();

})();
