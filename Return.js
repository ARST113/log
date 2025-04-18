;(function(){
  'use strict';
  
  // 1) Переопределяем Player.play, чтобы сохранять под правильным ключом
  (function(){
    const origPlay = Lampa.Player.play;
    Lampa.Player.play = function(data){
      // вычисляем ключ: 1) по timeline.hash, 2) fallback — по base
      const key = data.timeline && data.timeline.hash
                ? String(data.timeline.hash)
                : String(Lampa.Utils.hash(
                    (data.card && data.card.original_title)
                    || (data.card && data.card.original_name)
                    || data.title || ''
                  ));
      
      // сохраняем «data» под этим же ключом
      try {
        const map = Lampa.Storage.get('resume_file', {});
        map[key] = data;
        Lampa.Storage.set('resume_file', map);
        console.log('[ReturnPlugin] saved resume_file →', key, data);
      } catch(e){
        console.error('[ReturnPlugin] save resume_file error', e);
      }
      
      // дальше оригинальная логика
      return origPlay.call(this, data);
    };
    console.log('[ReturnPlugin] Player.play wrapped');
  })();
  
  // 2) Вставляем кнопку и отвечаем на клик
  function insertButton(){
    Lampa.Listener.follow('full', e => {
      if(e.type !== 'complite') return;
      setTimeout(() => {
        const root = e.object.activity.render();
        // target — либо старая .view--torrent, либо новая .button--play
        const target = root.find('.view--torrent, .button--play');
        
        if(!target.length || target.siblings('.view--continue').length) return;
        
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
          
          // вычисляем два ключа: timelineHash и baseHash
          const card = Lampa.Activity.active().card || {};
          const baseHash = String(Lampa.Utils.hash(
            card.original_title || card.original_name || card.title || card.name || ''
          ));
          
          // timelineHash мы можем достать из уже существующего timeline (если лента рисовалась ранее)
          // или из e.object.item.timeline
          let timelineHash = '';
          if(e.object.item && e.object.item.timeline && e.object.item.timeline.hash){
            timelineHash = String(e.object.item.timeline.hash);
          } else {
            // ещё можно принудительно создать:
            // const tl = Lampa.Timeline.view(baseHash);
            // timelineHash = String(tl.hash);
          }
          
          // теперь пробуем взять resume и data под этим ключом
          const views = Lampa.Storage.get('file_view', {});
          const files = Lampa.Storage.get('resume_file', {});
          
          let resume = timelineHash && views[timelineHash]
                     ? views[timelineHash]
                     : views[baseHash];
          
          let data   = timelineHash && files[timelineHash]
                     ? files[timelineHash]
                     : files[baseHash];
          
          // если под timelineHash ничего нет, а под baseHash есть — всё ок
          // если же под baseHash ничего нет, но есть под старым card.id — можно сделать аналогичный фоллбэк,
          // но для большинства torrent-сценариев достаточно этих двух.
          
          if(!resume || !data){
            return console.warn('[ReturnPlugin] нет данных для авто‑старта (hash):', {
              timelineHash, baseHash, resume, data
            });
          }
          
          // восстанавливаем Timeline
          const timeline = data.timeline || Lampa.Timeline.view(
            timelineHash || baseHash
          );
          timeline.time     = resume.time;
          timeline.duration = resume.duration;
          Lampa.Timeline.update(timeline);
          
          console.log('[ReturnPlugin] launching with key →',
            timelineHash || baseHash, resume);
          
          // и наконец автозапуск
          Lampa.Player.play(Object.assign({}, data, { timeline }));
        });
        
        target.before(btn);
        console.log('[ReturnPlugin] button inserted');
      }, 100);
    });
  }
  
  if(window.Lampa) insertButton();
  else document.addEventListener('lampa:start', insertButton);

  console.log('[ReturnPlugin] initialized');
})();
