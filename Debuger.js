;(function(){
  'use strict';

  console.log('[ReturnPlugin] инициализация…');

  // ──────────────────────────────────────────────────────────────────────────
  // 1) Перехват Player.play — сохраняем все данные под одним и тем же ключом
  // ──────────────────────────────────────────────────────────────────────────
  const origPlay = Lampa.Player.play;

  Lampa.Player.play = function(data){
    try {
      // 1.1) ключ для сериалов: если есть data.timeline.hash — берём его
      let key = data.timeline && data.timeline.hash;
      if(!key){
        // иначе хешируем карточку
        const c = Lampa.Activity.active().card || {};
        const base = c.original_title || c.original_name || c.title || c.name || '';
        key = Lampa.Utils.hash(base);
      }

      // 1.2) сохраняем "сырые" data под этим ключом
      const map = Lampa.Storage.get('resume_file', {});
      map[key] = data;
      Lampa.Storage.set('resume_file', map);

      console.log('[ReturnPlugin] resume_file сохранён для key=', key);

    } catch(err){
      console.error('[ReturnPlugin] Save error:', err);
    }

    // 1.3) вызываем оригинал
    return origPlay.call(this, data);
  };


  // ──────────────────────────────────────────────────────────────────────────
  // 2) Функция вставки кнопки в полной карточке
  // ──────────────────────────────────────────────────────────────────────────
  function insertButton(){
    Lampa.Listener.follow('full', e => {
      if(e.type !== 'complite') return;

      setTimeout(()=>{
        try {
          const full = e.object.activity.render();

          // ищем оба варианта кнопок «Play»
          const targets = full.find('.view--torrent, .button--play');
          if(!targets.length) return;

          targets.each((i, el) => {
            const $el = $(el);
            // не дублируем
            if($el.siblings('.view--continue').length) return;

            // создаём кнопку
            const btn = $(`
              <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
                <div class="selector__icon">
                  <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg"
                       width="24" height="24" alt="⏩">
                </div>
                <div class="selector__text">Продолжить</div>
              </div>
            `);

            // при клике/enter — пересчитываем всё и стартуем
            btn.on('hover:enter click', evt => {
              evt.preventDefault();
              evt.stopPropagation();

              // 2.1) ключ тот же самый, что в перехвате
              const c = Lampa.Activity.active().card || {};
              let key = e.object.item && e.object.item.timeline && e.object.item.timeline.hash;
              if(!key){
                const base = c.original_title || c.original_name || c.title || c.name || '';
                key = Lampa.Utils.hash(base);
              }

              // 2.2) достаём resume и data
              const views  = Lampa.Storage.get('file_view',   {});
              const resume = views[key];
              const files  = Lampa.Storage.get('resume_file', {});
              const data   = files[key];

              if(!resume || !data){
                return console.warn('[ReturnPlugin] Нет данных для key=', key);
              }

              // 2.3) собираем Timeline и обновляем его
              const timeline = e.object.item && e.object.item.timeline && e.object.item.timeline || Lampa.Timeline.view(key);
              timeline.time     = resume.time;
              timeline.duration = resume.duration;
              Lampa.Timeline.update(timeline);

              console.log('[ReturnPlugin] автозапуск key=', key, resume);

              // 2.4) пуск плейера
              Lampa.Player.play(Object.assign({}, data, { timeline }));
            });

            // 2.5) вставляем кнопку перед target
            $el.before(btn);
            console.log('[ReturnPlugin] кнопка вставлена');
          });

        } catch(err){
          console.error('[ReturnPlugin] Ошибка вставки кнопки:', err);
        }
      }, 100);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3) Запуск плагина
  // ──────────────────────────────────────────────────────────────────────────
  if(window.Lampa){
    console.log('[ReturnPlugin] Lampa готова, запускаем вставку кнопки');
    insertButton();
  } else {
    console.log('[ReturnPlugin] Ждём lampa:start');
    document.addEventListener('lampa:start', insertButton);
  }

})();
