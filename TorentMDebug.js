"use strict";

(function () {
  'use strict';

  // ========== AUDIO VISUALIZER (БЕЗ ФОНА, ЦВЕТНЫЕ ВОЛНЫ) ==========
  var AudioVisualizer = {
    context: null,
    analyser: null,
    source: null,
    dataArray: null,
    bufferLength: null,
    animationId: null,
    canvas: null,
    canvasCtx: null,
    isActive: false,
    waveElement: null,
    useWebAudio: true,
    container: null,
    visualizerWrapper: null,
    frameCount: 0,

    init: function(videoElement, container) {
      try {
        if (!videoElement) {
          console.warn('[AudioVisualizer] No video element');
          return false;
        }

        if (!this.isAudioFile(videoElement.src)) {
          console.log('[AudioVisualizer] Not audio:', videoElement.src);
          return false;
        }

        console.log('[AudioVisualizer] Initializing...');
        this.isActive = true;
        this.container = container;
        this.createVisualizer(container);

        if (this.useWebAudio && (window.AudioContext || window.webkitAudioContext)) {
          try {
            this.initWebAudio(videoElement);
          } catch(e) {
            console.error('[AudioVisualizer] WebAudio failed:', e);
            this.useWebAudio = false;
            this.initCSSWave();
          }
        } else {
          console.log('[AudioVisualizer] Using CSS fallback');
          this.useWebAudio = false;
          this.initCSSWave();
        }

        console.log('[AudioVisualizer] ✅ Init complete');
        return true;
      } catch(e) {
        console.error('[AudioVisualizer] Init error:', e);
        this.isActive = false;
        return false;
      }
    },

    isAudioFile: function(url) {
      if (!url) return false;
      var formats = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma', 'dsd', 'dsf', 'alac', 'dts', 'ac3'];
      var ext = url.split('.').pop().toLowerCase().split('?')[0];
      return formats.indexOf(ext) !== -1;
    },

    createVisualizer: function(container) {
      console.log('[AudioVisualizer] Creating visualizer...');

      var old = document.querySelectorAll('.player-audio-visualizer');
      for(var i = 0; i < old.length; i++) {
        old[i].remove();
      }

      var wrapper = document.createElement('div');
      wrapper.className = 'player-audio-visualizer';
      wrapper.setAttribute('style', 
        'position: fixed !important; ' +
        'bottom: 180px !important; ' +
        'left: 50% !important; ' +
        'transform: translateX(-50%) !important; ' +
        'width: 90% !important; ' +
        'max-width: 1000px !important; ' +
        'z-index: 99999 !important; ' +
        'pointer-events: none !important; ' +
        'display: block !important; ' +
        'visibility: visible !important; ' +
        'opacity: 1 !important;'
      );

      var waveDiv = document.createElement('div');
      waveDiv.className = 'audio-wave';
      waveDiv.setAttribute('style',
        'display: none; ' +
        'justify-content: space-around; ' +
        'align-items: flex-end; ' +
        'height: 180px; ' +
        'padding: 0; ' +
        'background: transparent !important; ' +
        'backdrop-filter: none !important; ' +
        'border-radius: 0; ' +
        'box-shadow: none !important; ' +
        'border: none !important;'
      );

      var canvas = document.createElement('canvas');
      canvas.className = 'audio-canvas';
      canvas.width = 1000;
      canvas.height = 220;
      canvas.setAttribute('style',
        'width: 100% !important; ' +
        'height: 220px !important; ' +
        'display: block !important; ' +
        'border-radius: 0 !important; ' +
        'background: transparent !important; ' +
        'backdrop-filter: none !important; ' +
        'box-shadow: none !important; ' +
        'border: none !important; ' +
        'visibility: visible !important;'
      );

      wrapper.appendChild(waveDiv);
      wrapper.appendChild(canvas);
      document.body.appendChild(wrapper);

      this.visualizerWrapper = wrapper;
      this.waveElement = waveDiv;
      this.canvas = canvas;
      this.canvasCtx = canvas.getContext('2d');

      console.log('[AudioVisualizer] ✅ Canvas:', canvas.width, 'x', canvas.height);
    },

    initWebAudio: function(videoElement) {
      console.log('[AudioVisualizer] Init WebAudio...');

      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.85;

      this.bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(this.bufferLength);

      console.log('[AudioVisualizer] Buffer:', this.bufferLength, 'bars');

      if (!this.source) {
        this.source = this.context.createMediaElementSource(videoElement);
        this.source.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      }

      this.canvas.style.display = 'block';
      this.waveElement.style.display = 'none';

      console.log('[AudioVisualizer] ✅ Starting visualization');
      this.startWebAudioVisualization();
    },

    startWebAudioVisualization: function() {
      var self = this;

      function draw() {
        if (!self.isActive || !self.analyser || !self.canvasCtx) {
          return;
        }

        self.animationId = requestAnimationFrame(draw);
        self.analyser.getByteFrequencyData(self.dataArray);
        self.frameCount++;

        if (self.frameCount % 120 === 0) {
          console.log('[AudioVisualizer] 🎵 Frame', self.frameCount);
        }

        self.canvasCtx.clearRect(0, 0, self.canvas.width, self.canvas.height);

        var barWidth = (self.canvas.width / self.bufferLength) * 2.5;
        var x = 0;

        for(var i = 0; i < self.bufferLength; i++) {
          var barHeight = (self.dataArray[i] / 255) * self.canvas.height * 0.95;

          var gradient = self.canvasCtx.createLinearGradient(
            0, 
            self.canvas.height - barHeight, 
            0, 
            self.canvas.height
          );

          gradient.addColorStop(0, 'rgba(100, 180, 255, 0.7)');
          gradient.addColorStop(0.3, 'rgba(150, 120, 255, 0.7)');
          gradient.addColorStop(0.6, 'rgba(255, 100, 180, 0.7)');
          gradient.addColorStop(1, 'rgba(255, 140, 80, 0.7)');

          self.canvasCtx.fillStyle = gradient;

          self.canvasCtx.fillRect(
            x, 
            self.canvas.height - barHeight, 
            barWidth - 2, 
            barHeight
          );

          x += barWidth;
        }
      }

      draw();
    },

    initCSSWave: function() {
      console.log('[AudioVisualizer] CSS wave...');

      this.waveElement.style.display = 'flex';
      this.canvas.style.display = 'none';
      this.waveElement.innerHTML = '';

      for(var i = 0; i < 40; i++) {
        var bar = document.createElement('div');
        var hue = Math.floor(Math.random() * 360);
        bar.setAttribute('style',
          'width: 8px; ' +
          'min-height: 30px; ' +
          'border-radius: 0; ' +
          'background: linear-gradient(to top, ' +
            'hsla(' + hue + ', 70%, 60%, 0.7), ' +
            'hsla(' + ((hue + 60) % 360) + ', 70%, 60%, 0.7)); ' +
          'animation: wave-anim ' + (200 + Math.random() * 300) + 'ms ease-in-out infinite alternate; ' +
          'animation-delay: ' + (Math.random() * 150) + 'ms;'
        );
        this.waveElement.appendChild(bar);
      }

      console.log('[AudioVisualizer] ✅ CSS wave ready');
    },

    toggle: function(isPlaying) {
      if (!this.isActive) return;

      if (this.useWebAudio && this.context) {
        if (isPlaying) {
          if (this.context.state === 'suspended') {
            this.context.resume();
          }
        } else {
          if (this.context.state === 'running') {
            this.context.suspend();
          }
        }
      } else if (this.waveElement) {
        var bars = this.waveElement.querySelectorAll('div');
        for(var i = 0; i < bars.length; i++) {
          bars[i].style.animationPlayState = isPlaying ? 'running' : 'paused';
        }
      }
    },

    destroy: function() {
      console.log('[AudioVisualizer] Destroying...');
      this.isActive = false;

      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }

      if (this.source) {
        try { this.source.disconnect(); } catch(e) {}
      }

      if (this.context) {
        try { this.context.close(); } catch(e) {}
      }

      if (this.visualizerWrapper) {
        this.visualizerWrapper.remove();
      }
    }
  };

  var styles = document.createElement('style');
  styles.textContent = '@keyframes wave-anim { 0% { height: 35%; opacity: 0.6; } 100% { height: 100%; opacity: 0.9; } }';
  document.head.appendChild(styles);

  // ========== INTEGRATION ==========

  function integrateVisualizer() {
    var visualizerInstance = null;

    function getVideoElement() {
      return document.querySelector('.player video') || 
             document.querySelector('video') ||
             (document.getElementsByTagName('video')[0]);
    }

    function tryInitialize() {
      var attempts = 0;

      var checkInterval = setInterval(function() {
        attempts++;

        var video = getVideoElement();

        if (video && !visualizerInstance) {
          clearInterval(checkInterval);

          visualizerInstance = Object.create(AudioVisualizer);
          var ok = visualizerInstance.init(video, document.body);

          if (ok) {
            console.log('[MusicSearch] ✅ Visualizer running');

            video.addEventListener('play', function() {
              if (visualizerInstance) visualizerInstance.toggle(true);
            });

            video.addEventListener('pause', function() {
              if (visualizerInstance) visualizerInstance.toggle(false);
            });

            if (!video.paused) {
              visualizerInstance.toggle(true);
            }
          }
        } else if (attempts >= 15) {
          clearInterval(checkInterval);
        }
      }, 300);
    }

    Lampa.Player.listener.follow('start', function() {
      setTimeout(tryInitialize, 500);
    });

    Lampa.Player.listener.follow('destroy', function() {
      if (visualizerInstance) {
        visualizerInstance.destroy();
        visualizerInstance = null;
      }
    });
  }

  // ========== MAIN PLUGIN ==========

  'use strict';

  var SERVER = {};
  var timers = {};
  var callback;
  var callback_back;
  var autostart_timer;
  var autostart_progress;

  var formats_set = new Set(['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'ape', 'wma', 'dsd', 'dsf', 'alac', 'dts', 'ac3']);
  var images_set = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
  var searchCache = new Map();

  var PLAYER_STATE = {
    spoofed: false,
    original_platform: null
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
      } else if (images_set.has(ext)) {
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
    filteredFiles.forEach(function (audioFile) {
      var dir = audioFile.path.substring(0, audioFile.path.lastIndexOf('/'));
      if (coversMap[dir]) {
        audioFile.cover_file = coversMap[dir];
      }
    });
    filteredFiles.sort(function (a, b) {
      return a.path.localeCompare(b.path, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    });
    var active = Lampa.Activity.active(),
      movie = active.movie || SERVER.movie || {};
    var plays = Lampa.Torserver.clearFileName(filteredFiles);
    list(plays, {
      movie: movie,
      files: filteredFiles
    });
  }

  // ✅ ПЕРЕПИСАННАЯ ФУНКЦИЯ PRELOAD - ЧИТАЕТ НАСТРОЙКУ 'player_torrent'
  function preload(data, run) {
    // ✅ ЧИТАЕМ НАСТРОЙКУ ИЗ ВАШЕГО ПЛАГИНА
    var player_mode = Lampa.Storage.field('player_torrent');
    
    console.log('MusicSearch: preload called, player_torrent =', player_mode);
    
    // Если выбран встроенный плеер - пропускаем предзагрузку
    if (player_mode === 'inner') {
      console.log('MusicSearch: INNER mode - SKIPPING preload');
      run();
      return;
    }
    
    // Для внешнего плеера оставляем стандартную логику
    var need_preload = Lampa.Torserver.ip() && data.url.indexOf(Lampa.Torserver.ip()) > -1 && data.url.indexOf('&preload') > -1;
    
    if (need_preload) {
      console.log('MusicSearch: ANDROID mode - using preload');
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
    } else {
      run();
    }
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
      var view = Lampa.Timeline.view(SERVER.hash + element.id);

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
        from_music_search: true
      });
      
      var item = Lampa.Template.get('torrent_file', element);

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

      if (params.movie.id) Lampa.Favorite.add('history', params.movie, 100);

      if (playlist.length > 1) {
        var trim_playlist = playlist.map(function (elem) {
          return {
            title: elem.title,
            url: elem.url,
            timeline: elem.timeline,
            img: elem.img,
            torrent_hash: elem.torrent_hash,
            from_music_search: true
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
      var menu = [{
        title: Lampa.Lang.translate('time_reset'),
        timeclear: true
      }];
      if (Lampa.Platform.is('webos')) menu.push({
        title: Lampa.Lang.translate('player_lauch') + ' - WebOS',
        player: 'webos'
      });
      if (Lampa.Platform.is('android')) menu.push({
        title: Lampa.Lang.translate('player_lauch') + ' - Android',
        player: 'android'
      });
      menu.push({
        title: Lampa.Lang.translate('player_lauch') + ' - Lampa',
        player: 'lampa'
      });
      if (!Lampa.Platform.tv()) menu.push({
        title: Lampa.Lang.translate('copy_link'),
        link: true
      });
      
      Lampa.Select.show({
        title: Lampa.Lang.translate('title_action'),
        items: menu,
        onBack: function onBack() {
          Lampa.Controller.toggle(enabled);
        },
        onSelect: function onSelect(a) {
          if (a.timeclear) {
            Lampa.Timeline.clear(SERVER.hash + element.id);
          }
          if (a.link) {
            Lampa.Utils.copyTextToClipboard(element.url.replace('&preload', '&play'), function () {
              Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
            }, function () {
              Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
            });
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
      img[0].onload = function () {
        img.addClass('loaded');
      };
      img[0].src = img.attr('data-src');
    });
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

  // Parser и component код остается без изменений...
  // (весь остальной код парсера, компонента и т.д.)

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

    // ✅ УБРАНА ФУНКЦИЯ addSettings() - используем только настройку из вашего плагина

    // ✅ ПЕРЕХВАТ ПЛЕЕРА ЧИТАЕТ НАСТРОЙКУ 'player_torrent'
    function hookPlayer() {
      var original_play = Lampa.Player.play;
      var original_platform_is = Lampa.Platform.is;

      Lampa.Player.listener.follow('destroy', function () {
        if (PLAYER_STATE.spoofed) {
          console.log('MusicSearch: Player destroyed, restoring platform');
          Lampa.Platform.is = PLAYER_STATE.original_platform;
          PLAYER_STATE.spoofed = false;
          PLAYER_STATE.original_platform = null;
        }
      });

      Lampa.Player.play = function (object) {
        // ✅ ЧИТАЕМ НАСТРОЙКУ ИЗ ВАШЕГО ПЛАГИНА
        var player_mode = Lampa.Storage.field('player_torrent');

        console.log('MusicSearch: Player.play, player_torrent =', player_mode, 'from_music_search =', !!object.from_music_search);

        if (object && object.from_music_search) {
          console.log('MusicSearch: Music file detected');
          
          if (player_mode === 'inner') {
            console.log('MusicSearch: Using INNER player - spoofing platform');
            
            if (!PLAYER_STATE.spoofed) {
              PLAYER_STATE.original_platform = original_platform_is;
              PLAYER_STATE.spoofed = true;
              
              Lampa.Platform.is = function (what) {
                if (what === 'android') {
                  console.log('MusicSearch: Platform.is(android) -> FALSE');
                  return false;
                }
                return PLAYER_STATE.original_platform(what);
              };
            }

            if (object.url) {
              object.url = object.url.replace('intent:', 'http:');
            }
            
            Lampa.Storage.set('internal_torrclient', true);
          } else {
            console.log('MusicSearch: Using ANDROID player - standard behavior');
          }
        }
        
        original_play(object);
      };
    }

    cleanupUserClarifys();
    window.lmeMusicSearch_ready = true;
    
    var manifest = {
      type: 'other',
      version: '1.0',
      name: 'Music Search',
      description: 'Controlled by "Плеер для торрентов" setting',
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
      // ✅ УБРАН ВЫЗОВ addSettings()
      hookPlayer();
    } else {
      Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') {
          add();
          // ✅ УБРАН ВЫЗОВ addSettings()
          hookPlayer();
        }
      });
    }
  }
  
  if (!window.lmeMusicSearch_ready) startPlugin();

  if (window.appready) {
    integrateVisualizer();
  } else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') integrateVisualizer();
    });
  }

})();
