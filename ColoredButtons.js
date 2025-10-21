Lampa.Platform.tv();

(function() {
  'use strict';

  // Твой оригинальный uTorrent SVG (уменьшим viewBox до 48, размеры подставим из исходной иконки)
  const TORRENT_SVG_SOURCE = `
<svg xmlns="http://www.w3.org/2000/svg" x="0" y="0" viewBox="0 0 48 48">
  <path fill="#4caf50" fill-rule="evenodd" d="M23.501,44.125c11.016,0,20-8.984,20-20 c0-11.015-8.984-20-20-20c-11.016,0-20,8.985-20,20C3.501,35.141,12.485,44.125,23.501,44.125z" clip-rule="evenodd"></path>
  <path fill="#fff" fill-rule="evenodd" d="M43.252,27.114C39.718,25.992,38.055,19.625,34,11l-7,1.077 c1.615,4.905,8.781,16.872,0.728,18.853C20.825,32.722,17.573,20.519,15,14l-8,2l10.178,27.081c1.991,0.67,4.112,1.044,6.323,1.044 c0.982,0,1.941-0.094,2.885-0.232l-4.443-8.376c6.868,1.552,12.308-0.869,12.962-6.203c1.727,2.29,4.089,3.183,6.734,3.172 C42.419,30.807,42.965,29.006,43.252,27.114z" clip-rule="evenodd"></path>
</svg>`;

  // Собираем DOM-узел SVG из строки
  function buildTorrentSVG() {
    const parser = new DOMParser(); // разбираем как SVG-документ[web:50]
    const doc = parser.parseFromString(TORRENT_SVG_SOURCE.trim(), 'image/svg+xml'); // создаём DOM для SVG[web:50]
    const fresh = doc.documentElement;
    return fresh;
  }

  // Безопасно заменить старый <svg> новым, сохранив ключевые атрибуты
  function replaceIconPreservingAttrs(origSvg) {
    const fresh = buildTorrentSVG();

    // Список атрибутов, которые переносим из исходной иконки, чтобы не ломать сетку/геометрию
    const keep = ['width','height','class','style','preserveAspectRatio','shape-rendering','aria-hidden','role','focusable'];
    keep.forEach(a => {
      const v = origSvg.getAttribute(a);
      if (v != null && v !== '') fresh.setAttribute(a, v);
    });

    // Если у исходной был inline-стиль размеров через computed width/height отсутствует — ничего не ставим, чтобы тема управляла через CSS
    // Никаких margin/padding тут не добавляем, всё оставляем теме

    // Заменяем узел на месте
    origSvg.replaceWith(fresh); // атомарная замена элемента без вмешательства в стили родителя[web:44]
  }

  function process() {
    const buttons = document.querySelectorAll('.full-start__button.view--torrent.selector');
    let count = 0;
    buttons.forEach(btn => {
      if (btn.classList.contains('utorrent-svg-applied')) return;
      const svg = btn.querySelector('svg');
      if (svg) {
        replaceIconPreservingAttrs(svg); // только подменяем содержимое иконки[web:44]
        btn.classList.add('utorrent-svg-applied');
        count++;
      }
    });
    if (count) console.log('✅ uTorrent SVG replaced:', count);
  }

  // Наблюдатель за динамическими вставками (никаких стилей не меняет)
  function observe() {
    const mo = new MutationObserver(muts => { // реакция только на добавление DOM-узлов[web:49]
      for (const m of muts) {
        if (m.type === 'childList' && m.addedNodes.length) {
          setTimeout(process, 50);
          break;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true }); // следим за потомками[web:49]
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { process(); observe(); }); // ждём DOM и только меняем SVG[web:52]
  } else {
    process(); observe(); // если DOM уже готов — сразу работаем[web:52]
  }
})();
