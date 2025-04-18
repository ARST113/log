(function(){
  'use strict';

  // Вставляем стили для фильтра белого/чёрного цвета иконки
  Lampa.Template.add('return_css', `
    <style>
      .view--continue .selector__icon svg {
        fill: white !important;
        transition: fill 0.15s ease !important;
      }
      .view--continue:hover .selector__icon svg,
      .view--continue.focus .selector__icon svg {
        fill: black !important; 
      }
    </style>
  `);
  $('body').append(Lampa.Template.get('return_css', {}, true));

  // Переопределяем плеер, сохраняем resume_file
  const origPlay = Lampa.Player.play;
  Lampa.Player.play = function(data){
    try {
      const card = data.card || Lampa.Activity.active().card || {};
      const base = card.original_title || card.original_name || card.title || card.name || '';
      const key  = Lampa.Utils.hash(base);
      const map  = Lampa.Storage.get('resume_file', {});
      map[key] = data;
      Lampa.Storage.set('resume_file', map);
      console.log('[ReturnPlugin] resume_file saved for key=', key, data);
    } catch(err) {
      console.error('[ReturnPlugin] save resume_file error', err);
    }
    return origPlay.call(this, data);
  };

  // Инициализация кнопки Continue
  function initReturnPlugin(){
    Lampa.Listener.follow('full', function(e){
      if(e.type !== 'complite') return;
      setTimeout(()=>{
        try {
          const fc   = e.object.activity.render();
          const type = Lampa.Storage.get('card_interface_type') || 'old';
          const tgt  = type === 'new' ? fc.find('.button--play') : fc.find('.view--torrent');

          // Вставляем inline SVG, чтобы не зависеть от внешнего URL
          const btnHtml = `
            <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
              <div class="selector__icon">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <div class="selector__text">Продолжить</div>
            </div>`;
          const $btn = $(btnHtml);

          $btn.on('hover:enter click', function(evt){
            evt.preventDefault(); evt.stopPropagation();
            console.log('[ReturnPlugin] Continue clicked');
            const card = Lampa.Activity.active().card || {};
            const base = card.original_title || card.original_name || card.title || card.name || '';
            const key  = Lampa.Utils.hash(base);
            const views  = Lampa.Storage.get('file_view', {});
            const resume = views[key];
            const files  = Lampa.Storage.get('resume_file', {});
            const file   = files[key];
            if(!resume || !file) return console.warn('[ReturnPlugin] Нет данных для key=', key);
            Lampa.Player.play(Object.assign({}, file, { timeline:{ time:resume.time, duration:resume.duration }}));
          });

          if(tgt && tgt.length){
            tgt.before($btn);
            console.log('[ReturnPlugin] button inserted');
          }
        } catch(err){ console.error('[ReturnPlugin] insert error', err); }
      }, 100);
    });
  }

  if(window.Lampa) initReturnPlugin();
  else document.addEventListener('lampa:start', initReturnPlugin);

  console.log('[ReturnPlugin] initialized with inline SVG icon');
})();
