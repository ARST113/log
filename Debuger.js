;(function(){
  'use strict';

  console.log('[ReturnPlugin] загружен');

  // --- 1) Перехват плеера и сохранение "файла" под ключом ---
  const origPlay = Lampa.Player.play;

  Lampa.Player.play = function(data){
    try {
      // определяем key для оффлайн‑торрента или онлайн-карточки
      let key;
      if (data.path_human) {
        // оффлайн‑торрент
        key = Lampa.Utils.hash(data.path_human);
      } else {
        // онлайн-контент
        const card = Lampa.Activity.active().card || {};
        const base = card.number_of_seasons
          ? card.original_name
          : card.original_title;
        key = Lampa.Utils.hash(base || '');
      }

      // сохраняем data
      const map = Lampa.Storage.get('resume_file', {});
      map[key] = data;
      Lampa.Storage.set('resume_file', map);

      console.log('[ReturnPlugin] resume_file saved for', key, data);
    }
    catch(err){
      console.error('[ReturnPlugin] saveLastFile error:', err);
    }

    // вызываем оригинальный play
    return origPlay.call(this, data);
  };


  // --- 2) Инициализация кнопки в полной карточке ---
  function initReturnPlugin(){
    Lampa.Listener.follow('full', function(e){
      if (e.type !== 'complite') return;

      setTimeout(() => {
        try {
          const full = e.object.activity.render();
          const target = full.find('.view--torrent');
          if (!target.length) return;

          // вычисляем тот же ключ
          let key;
          const item = e.object.item || {};
          if (item.path_human) {
            key = Lampa.Utils.hash(item.path_human);
          } else {
            const card = e.data.movie || e.object.item || {};
            const base = card.number_of_seasons
              ? card.original_name
              : card.original_title;
            key = Lampa.Utils.hash(base || '');
          }

          // читаем прогресс и сохранённый data
          const views  = Lampa.Storage.get('file_view',   {});
          const resume = views[key];
          const files   = Lampa.Storage.get('resume_file', {});
          const data    = files[key];

          if (!resume || resume.percent <= 0 || resume.percent >= 100){
            console.log('[ReturnPlugin] пропустить, нет прогресса:', resume);
            return;
          }
          if (!data){
            console.log('[ReturnPlugin] пропустить, нет сохранённого data:', data);
            return;
          }

          // не дублируем кнопку
          if ( target.siblings('.view--continue').length ) {
            return;
          }

          // собираем кнопку
          const btn = $(`
            <div class="full-start__button selector view--continue return--button" 
                 title="Продолжить просмотр">
              <div class="selector__icon">
                <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg"
                     width="24" height="24" alt="⏩">
              </div>
              <div class="selector__text">
                Продолжить (${Lampa.Utils.secondsToTime(resume.time,true)})
              </div>
            </div>
          `);

          // по клику/enter запускаем плеер с сохранённым data + timeline
          btn.on('hover:enter click', function(evt){
            evt.preventDefault();
            evt.stopPropagation();
            console.log('[ReturnPlugin] click continue →', key, resume, data);
            Lampa.Player.play(Object.assign({}, data, {
              timeline: {
                time:     resume.time,
                duration: resume.duration
              }
            }));
          });

          // вставляем перед кнопкой "Смотреть"
          target.before(btn);
          console.log('[ReturnPlugin] кнопка вставлена для', key);

        } catch(err){
          console.error('[ReturnPlugin] ошибка вставки кнопки:', err);
        }
      }, 100);
    });
  }

  // инициализируем сразу или ждём lampa:start
  if (window.Lampa) {
    console.log('[ReturnPlugin] инициализация');
    initReturnPlugin();
  } else {
    console.log('[ReturnPlugin] ждём lampa:start');
    document.addEventListener('lampa:start', initReturnPlugin);
  }

})();
