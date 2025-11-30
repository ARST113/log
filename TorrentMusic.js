(function () {
    'use strict';

    var SERVER = {};
    var timers = {};
    var callback;
    var callback_back;
    var autostart_timer;
    var autostart_progress;
    var formats_individual = ['vob', 'm2ts'];
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
        //Torserver.error()

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
      timers.files = setInterval(function () {
        repeat++;
        Lampa.Torserver.files(SERVER.hash, function (json) {
          if (json.file_stats) {
            clearInterval(timers.files);
            show(json.file_stats);
          }
        });
        if (repeat >= 45) {
          Lampa.Modal.update(Lampa.Template.get('error', {
            title: Lampa.Lang.translate('title_error'),
            text: Lampa.Lang.translate('torrent_parser_timeout')
          }));
          Lampa.Torserver.clear();
          Lampa.Torserver.drop(SERVER.hash);
        }
      }, 2000);
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
      files.sort(function (a, b) {
        var an = a.path.replace(/\d+/g, function (m) {
          return m.length > 3 ? m : ('000' + m).substr(-4);
        });
        var bn = b.path.replace(/\d+/g, function (m) {
          return m.length > 3 ? m : ('000' + m).substr(-4);
        });
        return an.localeCompare(bn);
      });
      var active = Lampa.Activity.active(),
        movie = active.movie || SERVER.movie || {};
      var plays = Lampa.Torserver.clearFileName(files);
      var seasons = [];
      plays.forEach(function (element) {
        var info = Lampa.Torserver.parse({
          movie: movie,
          files: plays,
          filename: element.path_human,
          path: element.path
        });
        if (info.serial && info.season && seasons.indexOf(info.season) == -1) {
          seasons.push(info.season);
        }
      });
      if (seasons.length) {
        Lampa.Api.seasons(movie, seasons, function (data) {
          list(plays, {
            movie: movie,
            seasons: data,
            files: files
          });
        });
      } else {
        list(plays, {
          movie: movie,
          files: files
        });
      }
    }
    
    // --- ФУНКЦИЯ PRELOAD ---
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
    // -------------------------------------

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
      items.forEach(function (element, inx) {
        var exe = element.path.split('.').pop().toLowerCase();
        var info = Lampa.Torserver.parse({
          movie: params.movie,
          files: items,
          filename: element.path_human,
          path: element.path,
          is_file: formats_individual.indexOf(exe) >= 0
        });
        var view = Lampa.Timeline.view(info.hash);
        var item;
        Lampa.Arrays.extend(element, {
          season: info.season,
          episode: info.episode,
          title: element.path_human,
          first_title: params.movie.name || params.movie.title,
          size: Lampa.Utils.bytesToSize(element.length),
          url: Lampa.Torserver.stream(element.path, SERVER.hash, element.id),
          torrent_hash: SERVER.hash,
          ffprobe: SERVER.object && SERVER.object.ffprobe ? SERVER.object.ffprobe : false,
          timeline: view,
          air_date: '--',
          img: './img/img_broken.svg',
          exe: exe
