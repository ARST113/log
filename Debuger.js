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
   * @param {Object} card  — объект карточки с torrent_hash или id
   */
  function addContinueButton(btnEl, card) {
    var views = Lampa.Storage.get('file_view', {});
    var key   = card.torrent_hash;
    if(!key) return;

    var v = views[key];
    console.log('addContinueButton for key', key, v);

    // условия: есть прогресс, и кнопка ещё не вставлена
    if(!v || v.percent <= 0 || v.percent >= 100) return;
    if(btnEl.siblings('.view--continue').length) return;

    var btn = $('<div class="selector view--continue">'+ Lampa.Lang.translate('continue') +'</div>');
    btn.attr('data-subtitle',
      Lampa.Utils.secondsToTime(v.time, true) + ' / ' +
      Lampa.Utils.secondsToTime(v.duration, true)
    );
    btn.on('hover:enter click', function(){
      console.log('Continuing at', v.time);
      Lampa.Player.play(Object.assign({}, card, { timeline: { time: v.time, duration: v.duration } }));
    });

    btnEl.after(btn);
  }

  // Слушаем полную карточку и вставляем после кнопки "Смотреть"
  Lampa.Listener.follow('full', function(e){
    if(e.type !== 'complite') return;
    var render    = e.object.activity.render();
    var torrentBtn = render.find('.view--torrent');
    console.log('full event, found torrentBtn:', torrentBtn.length);
    if(!torrentBtn.length) return;
    addContinueButton(torrentBtn, e.data.movie);
  });

  // Для ручного теста из консоли
  window._testContinue = function(){
    var torrentBtn = $('.view--torrent');
    var movie = Lampa.Activity.active().card || {};
    console.log('TEST addContinueButton args:', torrentBtn, movie);
    addContinueButton(torrentBtn, movie);
    console.log('After test, count:', $('.view--continue').length);
  };
  console.log('Continue‑view: _testContinue() ready');

})();
