// ==UserScript==
// @name         Lampa – Resume (с сохранением torrent_hash)
// @version      0.1
// @author       you
// @match        *://*/*
// ==/UserScript==

(() => {
  'use strict';

  /******************************************************************
   * 0. CRC‑32 (компактная) – нужна один раз, не меняйте
   ******************************************************************/
  const crc32 = s => {
    let crc = -1;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i);
      for (let k = 0; k < 8; k++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  };

  /******************************************************************
   * 1. Сохраняем hex‑hash при ПЕРВОМ запуске плеера
   ******************************************************************/
  Lampa.Listener.follow('play', e => {
    if (!e?.data?.torrent_hash) return;

    const key   = buildKey(e.data);            // «634649:movie» или «1399:S02E05»
    const store = Lampa.Storage.get('resume_hashes', {});
    if (!store[key]) {                         // не перезаписываем – достаточно 1 раз
      store[key] = e.data.torrent_hash;
      Lampa.Storage.set('resume_hashes', store);
      console.log('[Resume] сохранён hash для', key);
    }
  });

  /******************************************************************
   * 2. Когда формируется полная карточка – ищем позицию
   ******************************************************************/
  Lampa.Listener.follow('full', e => {
    if (e.type !== 'complite') return;

    const item = e.object.item;                // данные карточки
    const key  = buildKey(item);
    const hex  = (Lampa.Storage.get('resume_hashes', {})[key]) || null;
    if (!hex) return;                          // hash ещё не знаем → нечего продолжать

    const crc  = crc32(hex);
    const fv   = Lampa.Storage.get('file_view', {});
    if (!(crc in fv)) return;                  // человек не смотрел или почистил кэш

    const pos  = fv[crc].time || 0;
    insertResumeButton(e.object.activity.render(), pos); // рендерим кнопку
  });

  /******************************************************************
   * 3. Вспомогательные функции
   ******************************************************************/
  function buildKey(item){
    // сериал → id + сезон/эпизод, фильм → id + 'movie'
    if (item.number)
      return `${item.id}:S${item.season.toString().padStart(2,'0')}E${item.number.toString().padStart(2,'0')}`;
    return `${item.id}:${item.media_type || 'movie'}`;
  }

  function insertResumeButton($cardRoot, seconds){
    if (!$cardRoot) return;
    // куда вставлять – подбирайте селектор под свою тему/версию
    const $actions = $cardRoot.find('.full-start__buttons , .info__actions').first();
    if (!$actions.length) return console.warn('[Resume] не найден контейнер кнопок');

    const $btn = $(`
      <div class="full-start__button selector view--continue resume--btn">
        <div class="selector__text">Продолжить&nbsp;${formatTime(seconds)}</div>
      </div>`);

    $btn.on('click', () => {
      console.log('[Resume] Play from', seconds);
      // дублируем самый обычный клик по «Play» – Lampa сама подтянет нужный link
      $actions.find('.view--torrent,.button--play').first().trigger('click');
      // после старта плеера Lampa возьмёт позицию из file_view и перемотает
    });

    $actions.prepend($btn);
  }

  const formatTime = s => new Date(s*1000).toISOString().substr(s >= 3600 ? 11 : 14, 8);

  console.log('[Resume] плагин инициализирован');
})();
