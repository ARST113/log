(function () {
  'use strict';

  // ========================================================================
  // ЛОГИКА ПЛАГвИНА CONTINUE WATCH (Синхронизация, Плеер, Параметры)
  // ========================================================================

  // 1. Настройки и Синхронизация CUB
  Lampa.Storage.sync('continue_watch_params', 'object_object');
  console.log('[ContinueWatch] 🔧 Init: CUB Sync active');

  // 2. Очистка старых данных (старше 30 дней)
  function cleanupOldParams() {
    try {
      var params = Lampa.Storage.get('continue_watch_params', {});
      var now = Date.now();
      var thirtyDays = 30 * 24 * 60 * 60 * 1000;
      var changed = false;
      for (var hash in params) {
        if (params[hash].timestamp && now - params[hash].timestamp > thirtyDays) {
          delete params[hash];
          changed = true;
        }
      }
      if (changed) Lampa.Storage.set('continue_watch_params', params);
    } catch (e) {}
  }

  // 3. Получение параметров (учитывает хеши)
  function getStreamParams(movie) {
    if (!movie) return null;
    var title = movie.number_of_seasons ? movie.original_name || movie.original_title || movie.name || movie.title : movie.original_title || movie.original_name || movie.title || movie.name;
    if (!title) return null;

    var hash = Lampa.Utils.hash(title);

    // Спец. обработка для сериалов (если смотрели конкретную серию)
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
    // Сначала ищем по точному хешу, если нет - пробуем альтернативные варианты названия
    return params[hash] || params[Lampa.Utils.hash(title)] || null;
  }

  // 4. Формирование ссылки для TorrServer
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

  // 5. Запуск плеера
  function launchPlayer(movie, params) {
    var url = buildStreamUrl(params);
    if (!url) return;

    // Вычисляем хеш для Timeline (истории просмотра)
    var title = movie.number_of_seasons ? movie.original_name || movie.original_title || movie.name || movie.title : movie.original_title || movie.original_name || movie.title || movie.name;
    var hash = Lampa.Utils.hash(title);
    
    if (params.season && params.episode) {
        var separator = params.season > 10 ? ':' : '';
        hash = Lampa.Utils.hash([params.season, separator, params.episode, title].join(''));
    }

    var view = Lampa.Timeline.view(hash);
    
    // Добавляем обновление прогресса
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

    // Если есть прогресс, уведомляем
    if (view && view.percent > 0) Lampa.Noty.show('Восстанавливаем позицию...');

    Lampa.Player.play(playerData);
  }

  // 6. ПАТЧ (Перехват запуска плеера для сохранения данных)
  function patchPlayer() {
    var originalPlay = Lampa.Player.play;
    Lampa.Player.play = function (params) {
      // Если это торрент-поток
      if (params && (params.torrent_hash || (params.url && params.url.includes('/stream/')))) {
         var movie = params.card || params.movie || (Lampa.Activity.active() && Lampa.Activity.active().movie);
         if (movie) {
            var baseTitle = movie.number_of_seasons ? movie.original_name || movie.original_title : movie.original_title || movie.original_name;
            if (baseTitle) {
               var hash;
               // Хеш для сериалов или фильмов
               if (params.season && params.episode) {
                 var separator = params.season > 10 ? ':' : '';
                 hash = Lampa.Utils.hash([params.season, separator, params.episode, baseTitle].join(''));
               } else {
                 hash = Lampa.Utils.hash(baseTitle);
               }

               // Сохраняем параметры потока
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
  // ВИЗУАЛЬНАЯ ЧАСТЬ (Как в BwaRC)
  // ========================================================================

  var buttonTemplate = '<div class="full-start__button selector button--continue-watch" style="margin-top: 1px;">' + 
                       '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' + 
                       '<span>Продолжить</span>' + 
                       '</div>';

  function addButton(data) {
    // Проверка: не добавлять, если кнопка уже есть
    if (data.render.parent().find('.button--continue-watch').length) return;

    // 1. ПРОВЕРЯЕМ, ЕСТЬ ЛИ ЧТО ПРОДОЛЖАТЬ
    var params = getStreamParams(data.movie);
    if (!params) return; // Если истории нет, кнопку НЕ показываем

    // 2. Создаем кнопку
    var btn = $(buttonTemplate);

    // Если это сериал, добавим инфо о серии в подсказку или subtitle
    if (params.season && params.episode) {
        btn.find('span').text('S' + params.season + ' E' + params.episode);
    }

    // 3. Навешиваем обработчик
    btn.on('hover:enter click', function () {
        launchPlayer(data.movie, params);
    });

    // 4. Вставляем ПОСЛЕ кнопки торрентов (как в BwaRC, но .after)
    // BwaRC использует .render.after(btn), где render это .view--torrent
    data.render.after(btn);
  }

  function startPlugin() {
    // Инициализация патчей
    patchPlayer();
    cleanupOldParams();

    // Слушатель события открытия карточки (как в BwaRC)
    Lampa.Listener.follow('full', function (e) {
      if (e.type == 'complite') {
        // Ищем кнопку торрентов, чтобы прицепиться к ней
        var torrentBtn = e.object.activity.render().find('.view--torrent');
        if (torrentBtn.length) {
            addButton({
              render: torrentBtn,
              movie: e.data.movie
            });
        }
      }
    });

    // Резервная проверка для уже открытой карточки (если плагин загрузился позже)
    try {
        var active = Lampa.Activity.active();
        if (active && active.component == 'full') {
            var torrentBtn = active.activity.render().find('.view--torrent');
            if (torrentBtn.length) {
                addButton({
                    render: torrentBtn,
                    movie: active.card
                });
            }
        }
    } catch(e) {}
  }

  if (window.Lampa && Lampa.Listener) {
    startPlugin();
    console.log('[ContinueWatch] ✅ Button plugin loaded (BwaRC style)');
  }

})();
