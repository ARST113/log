;(function(){
  'use strict';

  // 1) Оборачиваем Player.play, чтобы сохранять под разными ключами
  (function(){
    const origPlay = Lampa.Player.play;
    Lampa.Player.play = function(data){
      const card = data.card || Lampa.Activity.active().card || {};
      const base = card.original_title
                 || card.original_name
                 || card.title
                 || card.name
                 || '';

      // если это эпизод сериала — хешируем "сезон:серия:название"
      let keySeed;
      if(data.season != null && data.episode != null){
        keySeed = `${data.season}:${data.episode}:${base}`;
      }
      // иначе — как раньше
      else if(data.timeline && data.timeline.hash){
        keySeed = String(data.timeline.hash);
      } else {
        keySeed = base;
      }
      const key = String(Lampa.Utils.hash(keySeed));

      // сохраняем позицию
      try {
        const map = Lampa.Storage.get('resume_file', {});
        map[key] = data;
        Lampa.Storage.set('resume_file', map);
        console.log('[ReturnPlugin] saved resume_file →', key, data);
      } catch(e){
        console.error('[ReturnPlugin] save resume_file error', e);
      }

      return origPlay.call(this, data);
    };
    console.log('[ReturnPlugin] Player.play wrapped');
  })();

  // 2) Функция вставки кнопки
  function insertButton(root){
    if(root.find('.view--continue').length) return;

    const btn = $(`
      <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
        <div class="selector__icon">
          <!-- чёрная SVG‑иконка -->
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M4 4h4v16H4V4zm6 8l10 6V6l-10 6z" fill="currentColor"/>
          </svg>
        </div>
        <div class="selector__text">Продолжить</div>
      </div>
    `);

    // стили для кнопки
    btn.css({
      'margin-left': '0.5em'
    }).on('hover:focus hover:enter', function(){
      btn.toggleClass('focus');
    }).on('hover:enter click', function(e){
      e.preventDefault(); e.stopPropagation();

      // вычисляем тот же keySeed
      const card = Lampa.Activity.active().card || {};
      const base = card.original_title
                 || card.original_name
                 || card.title
                 || card.name
                 || '';

      // если это сериал — сез/сер берём из item
      let season, episode;
      const item = Lampa.Activity.active().activity.object && Lampa.Activity.active().activity.object.item;
      if(item){
        season  = item.season;
        episode = item.episode;
      }

      let keySeed;
      if(season != null && episode != null){
        keySeed = `${season}:${episode}:${base}`;
      } else {
        // fallback — timeline.hash или base
        const tl = item && item.timeline;
        keySeed = tl && tl.hash ? String(tl.hash) : base;
      }
      const key = String(Lampa.Utils.hash(keySeed));

      const fv = Lampa.Storage.get('file_view', {});
      const rf = Lampa.Storage.get('resume_file', {});
      const resume = fv[key];
      const data   = rf[key];

      if(!resume || !data){
        console.warn('[ReturnPlugin] нет сохранённых данных для ключа', key);
        return;
      }

      // восстанавливаем timeline
      const timeline = data.timeline || { hash: key };
      timeline.time     = resume.time;
      timeline.duration = resume.duration;
      Lampa.Timeline.update(timeline);

      console.log('[ReturnPlugin] auto‑play with key →', key, resume);
      Lampa.Player.play(Object.assign({}, data, { timeline }));
    });

    // вставляем перед ▶ кнопкой
    const target = root.find('.view--torrent, .button--play').first();
    if(target.length) target.before(btn);
  }

  // 3) Вешаем на событие отрисовки full‑view
  Lampa.Listener.follow('full', function(e){
    if(e.type === 'complite'){
      setTimeout(()=>{
        const root = e.object.activity.render();
        insertButton(root);
      },50);
    }
  });

  // 4) И аналогично — на отрисовку списка «Торрент» (lampac)
  Lampa.Listener.follow('lampac', function(e){
    if(e.type === 'complite'){
      setTimeout(()=>{
        const root = $('.activity--lampac'); // корень онлайн‑компонента
        insertButton(root);
      },50);
    }
  });

  console.log('[ReturnPlugin] initialized');
})();
