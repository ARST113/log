;(function(){
  'use strict';

  // ——— Утилиты ——————————————————————————————————————————————————————————————————
  function cardTitle(card = {}) {
    return card.original_title
        || card.original_name
        || card.title
        || card.name
        || '';
  }

  function makeKey(data, card) {
    // 1) сериал: явно заданы season/episode
    if (data.season != null && data.episode != null) {
      return String(Lampa.Utils.hash(`${data.season}:${data.episode}:${cardTitle(card)}`));
    }
    // 2) эпизод/фильм: есть timeline.hash
    if (data.timeline && data.timeline.hash) {
      return String(data.timeline.hash);
    }
    // 3) фолбэк по названию
    return String(Lampa.Utils.hash(cardTitle(card)));
  }

  // ——— Переопределяем Player.play для сохранения полного data ——————————————————
  (function(){
    const origPlay = Lampa.Player.play;
    Lampa.Player.play = function(data){
      const key = makeKey(data, data.card);
      const map = Lampa.Storage.get('resume_file', {});
      map[key] = data;
      Lampa.Storage.set('resume_file', map);
      console.log('[ReturnPlugin] saved resume_file →', key);
      return origPlay.call(this, data);
    };
    console.log('[ReturnPlugin] Player.play wrapped');
  })();

  // ——— Создание и встраивание кнопки ——————————————————————————————————————————
  function insertButton(root, key, data, resume){
    if (root.find('.view--continue').length) return;

    const btn = $(`
      <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
        <div class="selector__icon">
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path d="M4 4h4v16H4V4zm6 8l10 6V6l-10 6z" fill="currentColor"/>
          </svg>
        </div>
        <div class="selector__text">Продолжить</div>
      </div>
    `);

    btn.on('hover:enter click', e => {
      e.preventDefault();
      e.stopPropagation();

      const tl = data.timeline || {};
      tl.time     = resume.time;
      tl.duration = resume.duration;
      Lampa.Timeline.update(tl);

      console.log('[ReturnPlugin] resume play →', key, resume);
      Lampa.Player.play(Object.assign({}, data, { timeline: tl }));
    });

    const target = root.find('.view--torrent, .button--play').first();
    if (target.length) target.before(btn);
  }

  // ——— Подписка на full‑view ——————————————————————————————————————————————————
  Lampa.Listener.follow('full', e => {
    if (e.type !== 'complite') return;
    const root = e.object.activity.render();
    const card = e.object.card;
    const tl   = e.object.timeline || {};
    const key  = makeKey({ season: tl.season, episode: tl.episode, timeline: tl }, card);
    const fv   = Lampa.Storage.get('file_view', {});
    const rf   = Lampa.Storage.get('resume_file', {});
    if (fv[key] && rf[key]) insertButton(root, key, rf[key], fv[key]);
  });

  // ——— Подписка на Lampac (экраны эпизодов) ——————————————————————————————————————————
  Lampa.Listener.follow('lampac', e => {
    if (e.type !== 'complite') return;
    const root = $('.activity--lampac');
    const item = e.object.activity.object.item || {};
    const card = e.object.card;
    const key  = makeKey({ season: item.season, episode: item.episode }, card);
    const fv   = Lampa.Storage.get('file_view', {});
    const rf   = Lampa.Storage.get('resume_file', {});
    if (fv[key] && rf[key]) insertButton(root, key, rf[key], fv[key]);
  });

  console.log('[ReturnPlugin] initialized');
})();
