(function(){
  'use strict';

  // Удаляем старые экземпляры кнопки
  $('.return--button').remove();

  // Вставляем стили
  const css = `
    /* default: прозрачный фон, белый текст и иконка */
    .return--button {
      background-color: transparent !important;
      color: #fff !important;
      border: none !important;
      padding: 0.5em 1em !important;
    }
    .return--button .selector__icon {
      margin-right: 0.5em !important;
    }
    .return--button img {
      filter: invert(100%) !important; /* иконка белая */
    }

    /* hover/focus: белый фон, чёрный текст и иконка, чёрная рамка */
    .return--button:hover,
    .return--button.focus {
      background-color: #fff !important;
      color: #000 !important;
      border: 1px solid #000 !important;
    }
    .return--button:hover img,
    .return--button.focus img {
      filter: none !important; /* иконка чёрная */
    }
  `;
  $('head').append(`<style>${css}</style>`);

  // Оборачиваем Player.play, чтобы сохранять data под ключом
  (function(){
    const origPlay = Lampa.Player.play;
    Lampa.Player.play = function(data){
      // вычисляем ключ: сначала timeline.hash, затем базовый hash от названия
      const tlHash = data.timeline && data.timeline.hash
                    ? String(data.timeline.hash)
                    : '';
      const baseHash = String(
        Lampa.Utils.hash(
          (data.card && (data.card.original_title || data.card.original_name))
          || data.title || ''
        )
      );
      const key = tlHash || baseHash;
      try {
        const map = Lampa.Storage.get('resume_file', {});
        map[key] = data;
        Lampa.Storage.set('resume_file', map);
        console.log('[ReturnPlugin] resume_file saved →', key, data);
      } catch(e) {
        console.error('[ReturnPlugin] save error', e);
      }
      return origPlay.call(this, data);
    };
    console.log('[ReturnPlugin] Player.play wrapped');
  })();

  // Вставляем кнопку на full-странице
  function insertButton(){
    Lampa.Listener.follow('full', e => {
      if(e.type !== 'complite') return;
      setTimeout(() => {
        const root = e.object.activity.render();
        if(root.find('.return--button').length) return;

        const target = root.find('.view--torrent, .button--play');
        if(!target.length) return;

        const btn = $(
          `<div class="full-start__button selector view--continue return--button" title="Продолжить">
             <div class="selector__icon">
               <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg"
                    width="24" height="24" alt="">
             </div>
             <div class="selector__text">Продолжить</div>
           </div>`
        );

        btn.on('hover:enter click', evt => {
          evt.preventDefault(); evt.stopPropagation();

          const card = Lampa.Activity.active().card || {};
          const baseHash = String(
            Lampa.Utils.hash(
              card.original_title||card.original_name||card.title||card.name||''
            )
          );
          let tlHash = '';
          if(e.object.item && e.object.item.timeline && e.object.item.timeline.hash) {
            tlHash = String(e.object.item.timeline.hash);
          }
          const key = tlHash || baseHash;

          const views = Lampa.Storage.get('file_view', {});
          const files = Lampa.Storage.get('resume_file', {});
          const resume = views[key];
          const data   = files[key];
          if(!resume || !data) {
            console.warn('[ReturnPlugin] нет данных для key=', key);
            return;
          }

          // восстанавливаем timeline и запускаем
          const tl = data.timeline || Lampa.Timeline.view(key);
          tl.time     = resume.time;
          tl.duration = resume.duration;
          Lampa.Timeline.update(tl);

          Lampa.Player.play(Object.assign({}, data, {timeline: tl}));
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
