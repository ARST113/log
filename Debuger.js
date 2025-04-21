(function(){
  'use strict';
  
  // --- 1. Вставляем CSS-правила ---
  const css = `
    /* базовый вид: белое полное заливка, чёрный текст/иконка */
    .return--button {
      background-color: #fff !important;
      color: #000 !important;
    }
    /* отступ между иконкой и текстом */
    .return--button .selector__icon {
      margin-right: 0.5em !important;
    }
    /* при наведении/фокусе — прозрачный фон + белая рамка */
    .return--button:hover,
    .return--button.focus {
      background-color: transparent !important;
      border: 1px solid #fff !important;
      color: #000 !important;
    }
    /* сброс любых лишних отступов у текста */
    .return--button .selector__text {
      margin-left: 0 !important;
    }
  `;
  $('head').append(`<style>${css}</style>`);
  

  // --- 2. Переопределяем Player.play, чтобы сохранять под корректным ключом ---
  (function(){
    const origPlay = Lampa.Player.play;
    Lampa.Player.play = function(data){
      // вычисляем ключ по timeline.hash, иначе по baseHash
      const timelineHash = data.timeline && data.timeline.hash
                         ? String(data.timeline.hash)
                         : '';
      const baseHash = String(
        Lampa.Utils.hash(
          (data.card && (data.card.original_title||data.card.original_name))
          || data.title
          || ''
        )
      );
      const key = timelineHash || baseHash;
      
      // сохраняем
      try {
        const map = Lampa.Storage.get('resume_file', {});
        map[key] = data;
        Lampa.Storage.set('resume_file', map);
        console.log('[ReturnPlugin] saved resume_file →', key, data);
      } catch(e){
        console.error('[ReturnPlugin] save resume_file error', e);
      }
      
      // оригинальный запуск плеера
      return origPlay.call(this, data);
    };
    console.log('[ReturnPlugin] Player.play wrapped');
  })();
  

  // --- 3. Вставляем кнопку на полный экран и ловим клик/hover:enter ---
  function insertButton(){
    Lampa.Listener.follow('full', e => {
      if(e.type !== 'complite') return;
      // чуть ждем, чтобы DOM точно собрался
      setTimeout(()=>{
        const root   = e.object.activity.render();
        const target = root.find('.view--torrent, .button--play');
        // не вставляем, если уже есть
        if(!target.length || target.siblings('.return--button').length) return;
        
        const btn = $(`
          <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
            <div class="selector__icon">
              <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg"
                   width="24" height="24" alt="▶▶">
            </div>
            <div class="selector__text">Продолжить</div>
          </div>
        `);
        
        btn.on('hover:enter click', evt => {
          evt.preventDefault();
          evt.stopPropagation();
          
          // те же ключи, что и в override
          const card = Lampa.Activity.active().card || {};
          const baseHash = String(
            Lampa.Utils.hash(
              card.original_title||card.original_name||card.title||card.name||''
            )
          );
          let timelineHash = '';
          if(e.object.item && e.object.item.timeline && e.object.item.timeline.hash){
            timelineHash = String(e.object.item.timeline.hash);
          }
          
          const key = timelineHash || baseHash;
          const views = Lampa.Storage.get('file_view',    {});
          const files = Lampa.Storage.get('resume_file',  {});
          const resume = views[key] || null;
          const data   = files[key] || null;
          
          if(!resume || !data){
            return console.warn('[ReturnPlugin] нет данных для автозапуска, key=', key);
          }
          
          // восстанавливаем timeline
          const tl = data.timeline || Lampa.Timeline.view(key);
          tl.time     = resume.time;
          tl.duration = resume.duration;
          Lampa.Timeline.update(tl);
          
          console.log('[ReturnPlugin] launching resume key=', key, resume);
          Lampa.Player.play(Object.assign({}, data, { timeline: tl }));
        });
        
        target.before(btn);
        console.log('[ReturnPlugin] button inserted');
      },100);
    });
  }
  
  if(window.Lampa) insertButton();
  else document.addEventListener('lampa:start', insertButton);

  console.log('[ReturnPlugin] initialized');
})();
