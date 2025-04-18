(function(){
  'use strict';

  console.log('Continue‑view plugin loaded');

  // Регистрируем себя (необязательно)
  Lampa.Manifest.plugins = Lampa.Manifest.plugins || [];
  Lampa.Manifest.plugins.push({
    type:        'addon',
    version:     '1.0.0',
    name:        'Продолжить просмотр',
    description: 'Кнопка возобновления просмотра на последней позиции'
  });

  // Локализация
  Lampa.Lang.add({ continue: { ru: 'Продолжить просмотр', en: 'Continue' } });

  // Стили кнопки
  var css = '\
    .view--continue { \
      background-color: #15bdff; \
      color: white; \
      border-radius: 0.3em; \
      padding: 0.5em 1em; \
      margin-left: 0.5em; \
      display: inline-block; \
    }\
    .view--continue.focus, .view--continue:hover { \
      background-color: #0d8ad1; \
    }';
  $('head').append('<style>' + css + '</style>');

  /**
   * Добавляет кнопку после .view--torrent
   * @param {jQuery} btnEl — элемент .view--torrent
   * @param {Object} card  — объект карточки, может содержать torrent_hash или id
   */
  function addContinueButton(btnEl, card) {
    var views = Lampa.Storage.get('file_view', {});
    // ключ резюме: сначала torrent_hash (для торрентов), иначе id (для карточек фильмов)
    var key = card.torrent_hash || card.id;
    console.log('addContinueButton called, use key:', key);
    if(!key) return;

    var v = views[key];
    console.log('resume data for', key, v);

    // условия: есть прогресс между 0 и 100, кнопка ещё не вставлена
    if(!v || v.percent <= 0 || v.percent >= 100) return;
    if(btnEl.siblings('.view--continue').length) return;

    // создаём кнопку
    var btn = $('<div class="selector view--continue">'+ Lampa.Lang.translate('continue') +'</div>');
    // подпись с таймкодом
    btn.attr('data-subtitle',
      Lampa.Utils.secondsToTime(v.time, true) + ' / ' +
      Lampa.Utils.secondsToTime(v.duration, true)
    );
    // обработчик
    btn.on('hover:enter click', function(){
      console.log('Continuing playback at', v.time);
      Lampa.Player.play(Object.assign({}, card, {
        timeline: { time: v.time, duration: v.duration }
      }));
    });

    btnEl.after(btn);
  }

  // Слушаем открытие полной карточки и вставляем кнопку
  Lampa.Listener.follow('full', function(e){
    if(e.type !== 'complite') return;
    var render     = e.object.activity.render();
    var torrentBtn = render.find('.view--torrent');
    console.log('full event fired, .view--torrent elements:', torrentBtn.length);
    if(!torrentBtn.length) return;

    addContinueButton(torrentBtn, e.data.movie);
  });

  // Ручной тест в консоли: вызов window._testContinue()
  window._testContinue = function(){
    var torrentBtn = $('.view--torrent');
    var movie = Lampa.Activity.active().card || {};
    console.log('TEST addContinueButton args:', torrentBtn, movie);
    addContinueButton(torrentBtn, movie);
    console.log('After test, .view--continue count:', $('.view--continue').length);
  };
  console.log('Continue‑view: _testContinue() ready');

})();
