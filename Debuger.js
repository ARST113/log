;(function(){
  'use strict';

  console.log('[ReturnPlugin] загружен');

  //
  // 1) Перехват Player.play
  //
  const origPlay = Lampa.Player.play;

  Lampa.Player.play = function(data){
    try {
      // Вычисляем ключ так же, как Lampa.Timeline и file_view
      const card = Lampa.Activity.active().card || {};
      const base = card.original_title 
                 || card.original_name 
                 || card.title 
                 || card.name 
                 || '';
      const key  = Lampa.Utils.hash(base);

      // Сохраняем под этим ключом "сырые" data
      const map = Lampa.Storage.get('resume_file', {});
      map[key] = data;
      Lampa.Storage.set('resume_file', map);

      console.log('[ReturnPlugin] resume_file сохранён для key=', key);
    }
    catch(e){
      console.error('[ReturnPlugin] Ошибка сохранения resume_file:', e);
    }

    // Вызываем оригинальный play
    return origPlay.call(this, data);
  };

  console.log('✅ Player.play переопределён');

  //
  // 2) Вставка кнопки "Продолжить" в полной карточке
  //
  function init(){
    Lampa.Listener.follow('full', function(e){
      if(e.type !== 'complite') return;

      setTimeout(()=>{
        try {
          const full = e.object.activity.render();
          const target = full.find('.view--torrent');
          if(!target.length) return;

          // Вычисляем тот же ключ
          const card = Lampa.Activity.active().card || {};
          const base = card.original_title 
                     || card.original_name 
                     || card.title 
                     || card.name 
                     || '';
          const key  = Lampa.Utils.hash(base);

          // Достаём прогресс и сохранённый data
          const views  = Lampa.Storage.get('file_view',   {});
          const resume = views[key];
          const files  = Lampa.Storage.get('resume_file', {});
          const data   = files[key];

          // Проверяем наличие и разумность
          if(!resume || resume.percent <= 0 || resume.percent >= 100){
            console.log('[ReturnPlugin] нет валидного прогресса для key=', key);
            return;
          }
          if(!data){
            console.log('[ReturnPlugin] нет сохранённого data для key=', key);
            return;
          }

          // Не дублировать кнопку
          if(target.siblings('.view--continue').length) return;

          // Собираем кнопку
          const btn = $(`
            <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
              <div class="selector__icon">
                <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg"
                     width="24" height="24" alt="⏩">
              </div>
              <div class="selector__text">
                Продолжить (${Lampa.Utils.secondsToTime(resume.time, true)})
              </div>
            </div>
          `);

          // По клику/enter — создаём Timeline и стартуем плеер
          btn.on('hover:enter click', function(evt){
            evt.preventDefault();
            evt.stopPropagation();

            // Создаём полноценный Timeline
            const timeline = Lampa.Timeline.view(key);
            timeline.time     = resume.time;
            timeline.duration = resume.duration;

            console.log('[ReturnPlugin] стартуем с key=', key, resume, data);

            Lampa.Player.play(Object.assign({}, data, { timeline }));
          });

          // Вставляем кнопку перед .view--torrent
          target.before(btn);
          console.log('[ReturnPlugin] кнопка вставлена для key=', key);
        }
        catch(err){
          console.error('[ReturnPlugin] Ошибка вставки кнопки:', err);
        }
      }, 100);
    });
  }

  // Инициализация
  if(window.Lampa){
    console.log('[ReturnPlugin] инициализация');
    init();
  } else {
    console.log('[ReturnPlugin] ждём lampa:start');
    document.addEventListener('lampa:start', init);
  }

})();
