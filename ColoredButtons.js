Lampa.Platform.tv();

(function() {
  'use strict';

  // Твой оригинальный uTorrent SVG
  const TORRENT_SVG_SOURCE = `
<svg xmlns="http://www.w3.org/2000/svg" x="0" y="0" viewBox="0 0 48 48">
  <path fill="#4caf50" fill-rule="evenodd" d="M23.501,44.125c11.016,0,20-8.984,20-20 c0-11.015-8.984-20-20-20c-11.016,0-20,8.985-20,20C3.501,35.141,12.485,44.125,23.501,44.125z" clip-rule="evenodd"></path>
  <path fill="#fff" fill-rule="evenodd" d="M43.252,27.114C39.718,25.992,38.055,19.625,34,11l-7,1.077 c1.615,4.905,8.781,16.872,0.728,18.853C20.825,32.722,17.573,20.519,15,14l-8,2l10.178,27.081c1.991,0.67,4.112,1.044,6.323,1.044 c0.982,0,1.941-0.094,2.885-0.232l-4.443-8.376c6.868,1.552,12.308-0.869,12.962-6.203c1.727,2.29,4.089,3.183,6.734,3.172 C42.419,30.807,42.965,29.006,43.252,27.114z" clip-rule="evenodd"></path>
</svg>`;

  // SVG для кнопки "Онлайн" - загружаем с GitHub
  let ONLINE_SVG_SOURCE = null;

  // Загрузка SVG с GitHub
  async function loadOnlineSVG() {
    try {
      const response = await fetch('https://raw.githubusercontent.com/ARST113/Buttons-/refs/heads/main/play-video-svgrepo-com.svg');
      ONLINE_SVG_SOURCE = await response.text();
      console.log('✅ SVG для онлайн загружен');
      process(); // Запускаем обработку после загрузки
    } catch (error) {
      console.error('❌ Ошибка загрузки SVG:', error);
    }
  }

  // Собираем DOM-узел SVG из строки
  function buildSVG(svgSource) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgSource.trim(), 'image/svg+xml');
    return doc.documentElement;
  }

  // Безопасно заменить старый <svg> новым, сохранив ключевые атрибуты
  function replaceIconPreservingAttrs(origSvg, newSvgSource) {
    const fresh = buildSVG(newSvgSource);

    // Список атрибутов, которые переносим из исходной иконки
    const keep = ['width','height','class','style','preserveAspectRatio','shape-rendering','aria-hidden','role','focusable'];
    keep.forEach(a => {
      const v = origSvg.getAttribute(a);
      if (v != null && v !== '') fresh.setAttribute(a, v);
    });

    // Заменяем узел на месте
    origSvg.replaceWith(fresh);
  }

  function process() {
    let count = 0;

    // Обработка торрент-кнопок
    const torrentButtons = document.querySelectorAll('.full-start__button.view--torrent.selector');
    torrentButtons.forEach(btn => {
      if (btn.classList.contains('utorrent-svg-applied')) return;
      const svg = btn.querySelector('svg');
      if (svg) {
        replaceIconPreservingAttrs(svg, TORRENT_SVG_SOURCE);
        btn.classList.add('utorrent-svg-applied');
        count++;
      }
    });

    // Обработка онлайн-кнопок (только если SVG загружен)
    if (ONLINE_SVG_SOURCE) {
      const onlineButtons = document.querySelectorAll('.full-start__button.view--online.selector');
      onlineButtons.forEach(btn => {
        if (btn.classList.contains('online-svg-applied')) return;
        const svg = btn.querySelector('svg');
        const span = btn.querySelector('span');
        
        if (svg) {
          replaceIconPreservingAttrs(svg, ONLINE_SVG_SOURCE);
          btn.classList.add('online-svg-applied');
          count++;
        }
        
        // Заменяем текст в <span>
        if (span) {
          span.textContent = 'BWA';
        }
      });
    }

    if (count) console.log('✅ Иконки заменены:', count);
  }

  // Наблюдатель за динамическими вставками
  function observe() {
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList' && m.addedNodes.length) {
          setTimeout(process, 50);
          break;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Инициализация
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadOnlineSVG(); // Загружаем SVG
      process();
      observe();
    });
  } else {
    loadOnlineSVG(); // Загружаем SVG
    process();
    observe();
  }
})();
