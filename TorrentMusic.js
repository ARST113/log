"use strict";

(function () {
  'use strict';

// ========== AUDIO VISUALIZER (webOS => CSS only) ==========
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

  init: function (videoElement, container) {
    try {
      var isWebOS = !!(window.Lampa && Lampa.Platform && Lampa.Platform.is('webos'));

      // ✅ На webOS разрешаем запуск даже без video/audio
      if (!videoElement && !isWebOS) return false;

      // ✅ webOS => только CSS
      if (isWebOS) this.useWebAudio = false;

      this.isActive = true;
      this.container = container;

      this.createVisualizer(container);

      // ✅ CSS-only режим
      if (!this.useWebAudio) {
        this.initCSSWave();
        this.toggle(true);
        return true;
      }

      // WebAudio (на остальных платформах)
      if (window.AudioContext || window.webkitAudioContext) {
        try {
          this.initWebAudio(videoElement);
          return true;
        } catch (e) {
          console.error('[AudioVisualizer] WebAudio failed, fallback to CSS:', e);
          this.useWebAudio = false;
          this.initCSSWave();
          this.toggle(true);
          return true;
        }
      }

      // если нет AudioContext
      this.useWebAudio = false;
      this.initCSSWave();
      this.toggle(true);
      return true;
    } catch (e) {
      console.error('[AudioVisualizer] Init error:', e);
      this.isActive = false;
      return false;
    }
  },

  createVisualizer: function () {
    // Удаляем старое
    var old = document.querySelectorAll('.player-audio-visualizer');
    for (var i = 0; i < old.length; i++) old[i].remove();

    var wrapper = document.createElement('div');
    wrapper.className = 'player-audio-visualizer';
    wrapper.setAttribute(
      'style',
      'position: fixed !important; ' +
        'bottom: 180px !important; ' +
        'left: 50% !important; ' +
        'transform: translateX(-50%) !important; ' +
        'width: 90% !important; ' +
        'max-width: 1000px !important; ' +
        'z-index: 2147483647 !important; ' +
        'pointer-events: none !important; ' +
        'display: block !important; ' +
        'visibility: visible !important; ' +
        'opacity: 1 !important;'
    );

    var waveDiv = document.createElement('div');
    waveDiv.className = 'audio-wave';
    waveDiv.setAttribute(
      'style',
      'display: none; ' +
        'justify-content: space-around; ' +
        'align-items: flex-end; ' +
        'height: 180px; ' +
        'padding: 0; ' +
        'background: transparent !important; ' +
        'border: none !important;'
    );

    var canvas = document.createElement('canvas');
    canvas.className = 'audio-canvas';
    canvas.width = 1000;
    canvas.height = 220;
    canvas.setAttribute(
      'style',
      'width: 100% !important; ' +
        'height: 220px !important; ' +
        'display: none !important; ' +
        'background: transparent !important; ' +
        'border: none !important;'
    );

    wrapper.appendChild(waveDiv);
    wrapper.appendChild(canvas);
    document.body.appendChild(wrapper);

    this.visualizerWrapper = wrapper;
    this.waveElement = waveDiv;
    this.canvas = canvas;
    this.canvasCtx = canvas.getContext('2d');
  },

  initWebAudio: function (videoElement) {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.85;

    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    if (!this.source) {
      this.source = this.context.createMediaElementSource(videoElement);
      this.source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }

    this.canvas.style.display = 'block';
    this.waveElement.style.display = 'none';

    this.startWebAudioVisualization();
  },

  startWebAudioVisualization: function () {
    var self = this;

    function draw() {
      if (!self.isActive || !self.analyser || !self.canvasCtx) return;

      self.animationId = requestAnimationFrame(draw);
      self.analyser.getByteFrequencyData(self.dataArray);

      self.canvasCtx.clearRect(0, 0, self.canvas.width, self.canvas.height);

      var barWidth = (self.canvas.width / self.bufferLength) * 2.5;
      var x = 0;

      for (var i = 0; i < self.bufferLength; i++) {
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
        self.canvasCtx.fillRect(x, self.canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    }

    draw();
  },

  initCSSWave: function () {
    if (!this.waveElement) return;

    this.waveElement.style.display = 'flex';
    if (this.canvas) this.canvas.style.display = 'none';

    this.waveElement.innerHTML = '';

    var barsCount = 32; // ✅ для webOS легче, чем 40
    for (var i = 0; i < barsCount; i++) {
      var bar = document.createElement('div');
      var hue = Math.floor(Math.random() * 360);

      bar.style.width = '10px';
      bar.style.minHeight = '20px';
      bar.style.background =
        'linear-gradient(to top, hsla(' + hue + ',70%,60%,0.7), hsla(' + ((hue + 60) % 360) + ',70%,60%,0.7))';

      // ✅ ВАЖНО: webOS иногда “гасит” height% в flex — делаем transform: scaleY
      bar.style.transformOrigin = '50% 100%';
      bar.style.animation = 'wave-scale ' + (240 + Math.random() * 260) + 'ms linear infinite alternate';
      bar.style.animationDelay = Math.floor(Math.random() * 150) + 'ms';

      this.waveElement.appendChild(bar);
    }
  },

  toggle: function (isPlaying) {
    if (!this.isActive) return;

    if (!this.useWebAudio && this.waveElement) {
      var bars = this.waveElement.querySelectorAll('div');
      for (var i = 0; i < bars.length; i++) {
        bars[i].style.animationPlayState = isPlaying ? 'running' : 'paused';
      }
      return;
    }

    if (this.useWebAudio && this.context) {
      if (isPlaying) {
        if (this.context.state === 'suspended') this.context.resume();
      } else {
        if (this.context.state === 'running') this.context.suspend();
      }
    }
  },

  destroy: function () {
    this.isActive = false;

    if (this.animationId) cancelAnimationFrame(this.animationId);

    if (this.source) { try { this.source.disconnect(); } catch (e) {} }
    if (this.context) { try { this.context.close(); } catch (e) {} }

    if (this.visualizerWrapper) this.visualizerWrapper.remove();

    this.context = null;
    this.analyser = null;
    this.source = null;
    this.dataArray = null;
    this.bufferLength = null;
    this.animationId = null;
    this.canvas = null;
    this.canvasCtx = null;
    this.waveElement = null;
    this.visualizerWrapper = null;
  }
};

// CSS keyframes (scaleY вместо height%)
(function injectWaveCSS() {
  var styles = document.createElement('style');
  styles.textContent =
    '@keyframes wave-scale {' +
      '0% { transform: scaleY(0.25); opacity: 0.55; }' +
      '100% { transform: scaleY(1.0); opacity: 0.95; }' +
    '}';
  document.head.appendChild(styles);
})();

// ========== INTEGRATION ==========
function integrateVisualizer() {
  var visualizerInstance = null;

  function isWebOS() {
    return !!(window.Lampa && Lampa.Platform && Lampa.Platform.is('webos'));
  }

  function getMediaElement() {
    return (
      document.querySelector('.player video') ||
      document.querySelector('.player audio') ||
      document.querySelector('video') ||
      document.querySelector('audio') ||
      (document.getElementsByTagName('video')[0]) ||
      (document.getElementsByTagName('audio')[0])
    );
  }

  function startVisualizer(forceCSSOnly) {
    if (visualizerInstance) return;

    visualizerInstance = Object.create(AudioVisualizer);

    var ok = visualizerInstance.init(forceCSSOnly ? null : getMediaElement(), document.body);
    if (!ok) return;

    var media = getMediaElement();
    if (media) {
      media.addEventListener('play', function () {
        if (visualizerInstance) visualizerInstance.toggle(true);
      });
      media.addEventListener('pause', function () {
        if (visualizerInstance) visualizerInstance.toggle(false);
      });

      if (!media.paused) visualizerInstance.toggle(true);
    } else {
      visualizerInstance.toggle(true);
    }
  }

  Lampa.Player.listener.follow('start', function () {
    if (isWebOS()) {
      setTimeout(function () { startVisualizer(true); }, 200);
    } else {
      var attempts = 0;
      var t = setInterval(function () {
        attempts++;
        var media = getMediaElement();
        if (media) {
          clearInterval(t);
          startVisualizer(false);
        } else if (attempts > 20) {
          clearInterval(t);
        }
      }, 300);
    }
  });

  Lampa.Player.listener.follow('destroy', function () {
    if (visualizerInstance) {
      visualizerInstance.destroy();
      visualizerInstance = null;
    }
  });
}



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
        var trim_playlist = playlist.map(function (elem) {
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
      var menu = [{
        title: Lampa.Lang.translate('time_reset'),
        timeclear: true
      }];
      if (Lampa.Platform.is('webos')) menu.push({
        title: Lampa.Lang.translate('player_lauch') + ' - WebOS',
        player: 'webos'
      });
      // Android пункт меню оставляем, но он будет перехвачен нашей логикой, если выбран встроенный плеер
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
            // Очистка времени
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
    var u = url + '/api/v2.0/indexers/' + (Lampa.Storage.field('jackett_interview') === 'healthy' ? 'status:healthy' : 'all') + '/results?apikey=' + Lampa.Storage.field('jackett_key') + '&Category%5B%5D=3000&Category%5B%5D=3010&Category%5B%5D=3020&Category%5B%5D=3030&Category%5B%5D=3040&Query=' + encodeURIComponent(params.search);
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
      u = Lampa.Utils.addUrlComponent(u, 'Category[]=3000,3010,3020,3030,3040,3050');
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
      q.push({
        name: 'categories',
        value: '3000,3010,3020,3030,3040,3050'
      });
      if (params.movie.original_language == 'ja') {
        q.push({
          name: 'categories',
          value: '5070'
        });
      }
      q.push({
        name: 'type',
        value: 'search'
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
      this.activity.filter = filter;
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
        known_formats.forEach(function (fmt) {
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
      filterTimeout = setTimeout(function () {
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
                regexCache[search] = {
                  test: function test() {
                    return false;
                  }
                };
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
          "default": 'android'
        },
        field: {
          name: 'Плеер для музыки (Music Search)',
          description: 'Выберите плеер для воспроизведения торрентов из Music Search'
        },
        onChange: function onChange(value) {
          Lampa.Storage.set('player_music_torrent', value);
        }
      });
    }
    function hookPlayer() {
      var original_play = Lampa.Player.play;
      var original_platform_is = Lampa.Platform.is;

      // Слушаем уничтожение плеера, чтобы сбросить спуфинг
      Lampa.Player.listener.follow('destroy', function () {
        if (PLAYER_STATE.spoofed) {
          console.log('MusicSearch: Player destroyed, restoring platform');
          Lampa.Platform.is = PLAYER_STATE.original_platform;
          PLAYER_STATE.spoofed = false;
          PLAYER_STATE.original_platform = null;
        }
      });
      Lampa.Player.play = function (object) {
        var player_mode = Lampa.Storage.field('player_music_torrent');

        // Если это наш файл (с меткой from_music_search)
        if (object && object.from_music_search) {
          // Если выбран встроенный плеер и мы на Андроиде (или уже заспуфлены)
          if (player_mode === 'inner' && (Lampa.Platform.is('android') || PLAYER_STATE.spoofed)) {
            // Если еще не заспуфили - делаем это
            if (!PLAYER_STATE.spoofed) {
              console.log('MusicSearch: Spooofing Android -> False');
              PLAYER_STATE.original_platform = original_platform_is;
              PLAYER_STATE.spoofed = true;
              Lampa.Platform.is = function (what) {
                if (what === 'android') return false;
                return PLAYER_STATE.original_platform(what);
              };
            }

            // Очищаем URL от intent (на всякий случай)
            if (object.url) object.url = object.url.replace('intent:', 'http:');
          }
        }
        original_play(object);
      };
    }
    cleanupUserClarifys();
    window.lmeMusicSearch_ready = true;
    var manifest = {
      type: 'other',
      version: '0.9',
      name: 'Music Search',
      description: 'Fixed Player Switch + Audio + Covers',
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


  if (window.appready) {
    integrateVisualizer();
  } else {
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') integrateVisualizer();
    });
  }

})();
