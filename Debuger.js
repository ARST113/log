(function(){
  'use strict';

  console.log('Continue‑view plugin loaded');

  // Регистрируем себя в манифесте (необязательно)
  Lampa.Manifest.plugins = Lampa.Manifest.plugins || [];
  Lampa.Manifest.plugins.push({
    type:        'addon',
    version:     '1.0.0',
    name:        'Продолжить просмотр',
    description: 'Кнопка возобновления просмотра на последней позиции'
  });

  // Локаль для кнопки
  Lampa.Lang.add({
    continue: { ru: 'Продолжить просмотр', en: 'Continue' }
  });

  // Стили
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
   * Создает кнопку "Продолжить просмотр"
   */
  function addContinueButton(container, card) {
    var views = Lampa.Storage.get('file_view', {});
    var key   = card.torrent_hash || card.id;
    var v     = views[key];
    console.log('addContinueButton for key', key, v);

    if(!v || v.percent <= 0 || v.percent >= 100) return;
    if(container.find('.view--continue').length) return;

    var btn = $('<div class="selector view--continue">'+
                Lampa.Lang.translate('continue') +
                '</div>');

    // подпись с таймкодом
    btn.attr('data-subtitle',
      Lampa.Utils.secondsToTime(v.time,     true) + ' / ' +
      Lampa.Utils.secondsToTime(v.duration, true)
    );

    btn.on('hover:enter click', function(){
      console.log('Continue button clicked, resume at', v.time);
      Lampa.Player.play(Object.assign({}, card, {
        timeline: { time: v.time, duration: v.duration }
      }));
    });

    container.append(btn);
  }

  // Слушаем открытие полной карточки
  Lampa.Listener.follow('full', function(e){
    if(e.type !== 'complite') return;

    var render = e.object.activity.render();
    var torrentBtn = render.find('.view--torrent');
    console.log('full event, found .view--torrent:', torrentBtn.length);
    if(!torrentBtn.length) return;

    addContinueButton(torrentBtn.parent(), e.data.movie);
  });

  // Функция для ручного теста из консоли
  window._testContinue = function(){
    var container = $('.view--torrent').parent();
    var movie     = Lampa.Activity.active().card || {};
    console.log('TEST addContinueButton:', container, movie);
    addContinueButton(container, movie);
    console.log('After test, buttons:', $('.view--continue').length);
  };
  console.log('Continue‑view: _testContinue() ready');

})();
