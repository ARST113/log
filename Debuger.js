(function(){
  'use strict';

  //
  // ——— 1. CSS для кнопки — белая иконка по‑умолчанию, чёрная при hover/focus
  //
  Lampa.Template.add('return_css', `
    <style>
      .view--continue .selector__icon img {
        filter: invert(1);
        transition: filter 0.15s ease;
      }
      .view--continue:hover .selector__icon img,
      .view--continue.focus .selector__icon img {
        filter: invert(0);
      }
    </style>
  `);
  $('body').append(Lampa.Template.get('return_css', {}, true));

  //
  // ——— 2. Переопределим Player.play, чтобы сохранять resume_file под одинаковым ключом
  //
  const origPlay = Lampa.Player.play;
  Lampa.Player.play = function(data){
    try {
      // если в data есть поле card — берём его
      const card = data.card || Lampa.Activity.active().card || {};
      // одинаковая логика хеша, что и у Lampa.Timeline
      const base = card.number_of_seasons
        ? (card.original_name  || card.title || '')
        : (card.original_title || card.title || '');
      const key = Lampa.Utils.hash(base);

      const map = Lampa.Storage.get('resume_file', {});
      map[key] = data;
      Lampa.Storage.set('resume_file', map);

      console.log('[ReturnPlugin] resume_file saved for key=', key, data);
    }
    catch(err){
      console.error('[ReturnPlugin] save resume_file error', err);
    }

    // вызываем оригинал
    return origPlay.call(this, data);
  };

  //
  // ——— 3. Функция вставки кнопки и её обработчик
  //
  function initReturnPlugin(){
    Lampa.Listener.follow('full', function(e){
      if(e.type === 'complite'){
        setTimeout(function(){
          try {
            const fullContainer = e.object.activity.render();
            const uiType = Lampa.Storage.get('card_interface_type') || 'old';
            const target = uiType === 'new'
              ? fullContainer.find('.button--play')
              : fullContainer.find('.view--torrent');

            const btnHtml = `
              <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
                <div class="selector__icon">
                  <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg"
                       alt="▶▶" width="24" height="24" style="vertical-align: middle;">
                </div>
                <div class="selector__text">Продолжить</div>
              </div>`;
            const $btn = $(btnHtml);

            $btn.on('hover:enter click', function(evt){
              evt.preventDefault();
              evt.stopPropagation();
              console.log('[ReturnPlugin] Continue clicked');

              // вычисляем ключ точно так же
              const card = Lampa.Activity.active().card || {};
              const base = card.number_of_seasons
                ? (card.original_name  || card.title || '')
                : (card.original_title || card.title || '');
              const key = Lampa.Utils.hash(base);

              const views  = Lampa.Storage.get('file_view',   {});
              const resume = views[key];
              const files  = Lampa.Storage.get('resume_file', {});
              const file   = files[key];

              if(!resume || !file){
                console.warn('[ReturnPlugin] Нет данных для key=', key);
                return;
              }

              // и запускаем плеер с таймлайном
              Lampa.Player.play(Object.assign({}, file, {
                timeline: {
                  time:     resume.time,
                  duration: resume.duration
                }
              }));
            });

            if(target && target.length){
              target.before($btn);
              console.log('[ReturnPlugin] button inserted');
            } else {
              console.warn('[ReturnPlugin] target for continue-button not found');
            }
          }
          catch(err){
            console.error('[ReturnPlugin] Ошибка вставки кнопки', err);
          }
        }, 100);
      }
    });
  }

  // ——— 4. Инициализируем
  if(window.Lampa){
    initReturnPlugin();
  } else {
    document.addEventListener('lampa:start', initReturnPlugin);
  }

  console.log('[ReturnPlugin] initialized');
})();
