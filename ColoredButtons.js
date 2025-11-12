"use strict";

Lampa.Platform.tv();

(function () {
  'use strict';

  var TORRENT_SVG_SOURCE = "\n<svg xmlns=\"http://www.w3.org/2000/svg\" x=\"0\" y=\"0\" viewBox=\"0 0 48 48\">\n  <path fill=\"#4caf50\" fill-rule=\"evenodd\" d=\"M23.501,44.125c11.016,0,20-8.984,20-20 c0-11.015-8.984-20-20-20c-11.016,0-20,8.985-20,20C3.501,35.141,12.485,44.125,23.501,44.125z\" clip-rule=\"evenodd\"></path>\n  <path fill=\"#fff\" fill-rule=\"evenodd\" d=\"M43.252,27.114C39.718,25.992,38.055,19.625,34,11l-7,1.077 c1.615,4.905,8.781,16.872,0.728,18.853C20.825,32.722,17.573,20.519,15,14l-8,2l10.178,27.081c1.991,0.67,4.112,1.044,6.323,1.044 c0.982,0,1.941-0.094,2.885-0.232l-4.443-8.376c6.868,1.552,12.308-0.869,12.962-6.203c1.727,2.29,4.089,3.183,6.734,3.172 C42.419,30.807,42.965,29.006,43.252,27.114z\" clip-rule=\"evenodd\"></path>\n</svg>";

  var ONLINE_SVG_SOURCE = null;
  var REYOHOHO_SVG_SOURCE = null;
  var lastActiveButton = null;

  function loadOnlineSVG() {
    fetch('https://raw.githubusercontent.com/ARST113/Buttons-/refs/heads/main/play-video-svgrepo-com.svg').then(function (response) {
      return response.text();
    }).then(function (svg) {
      ONLINE_SVG_SOURCE = svg;
      console.log('✅ SVG для онлайн загружен');
      process();
    })["catch"](function (error) {
      console.error('❌ Ошибка загрузки SVG:', error);
    });
  }

  function loadReyohohoSVG() {
    fetch('https://raw.githubusercontent.com/ARST113/Buttons-/refs/heads/main/AIVector_clapperboard.svg').then(function (response) {
      return response.text();
    }).then(function (svg) {
      REYOHOHO_SVG_SOURCE = svg;
      console.log('✅ SVG для reyohoho загружен');
      process();
    })["catch"](function (error) {
      console.error('❌ Ошибка загрузки SVG reyohoho:', error);
    });
  }

  function buildSVG(svgSource) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgSource.trim(), 'image/svg+xml');
    return doc.documentElement;
  }

  function replaceIconPreservingAttrs(origSvg, newSvgSource, options) {
    try {
      var fresh = buildSVG(newSvgSource);
      var keep = ['width', 'height', 'class', 'style', 'preserveAspectRatio', 'shape-rendering', 'aria-hidden', 'role', 'focusable'];
      keep.forEach(function (a) {
        var v = origSvg.getAttribute(a);
        if (v != null && v !== '') fresh.setAttribute(a, v);
      });

      // Применяем кастомные настройки если есть
      if (options) {
        if (options.width) fresh.setAttribute('width', options.width);
        if (options.height) fresh.setAttribute('height', options.height);
        if (options.className) fresh.classList.add(options.className);
      }

      origSvg.replaceWith(fresh);
      return true;
    } catch (error) {
      console.error('Ошибка при замене иконки:', error);
      return false;
    }
  }

  function getPluginName(btn) {
    if (!btn) return 'Online';
    var pluginName = btn.getAttribute('data-subtitle');
    if (pluginName) {
      var shortName = pluginName.split(' ')[0];
      if (pluginName.includes('by Skaz')) {
        shortName = 'Z01';
      }
      return shortName;
    }
    return 'Online';
  }

  function attachHoverEnter(btn) {
    if (btn.classList.contains('hover-enter-attached')) return;
    btn.addEventListener('hover:enter', function (e) {
      lastActiveButton = btn;
      console.log('🎯 hover:enter на кнопке:', getPluginName(btn));
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.keyCode === 13) {
        lastActiveButton = btn;
        console.log('🎯 Enter на кнопке:', getPluginName(btn));
      }
    });
    btn.addEventListener('click', function (e) {
      lastActiveButton = btn;
      console.log('🎯 Click на кнопке:', getPluginName(btn));
    });
    btn.classList.add('hover-enter-attached');
  }

  function watchTitle() {
    var lastCheck = '';
    function checkAndUpdate() {
      var titleElement = document.querySelector('.head__title');
      if (titleElement) {
        var currentText = titleElement.textContent.trim();
        if (currentText !== lastCheck) {
          lastCheck = currentText;
          if (currentText === 'Онлайн' && lastActiveButton) {
            var pluginName = getPluginName(lastActiveButton);
            requestAnimationFrame(function () {
              titleElement.textContent = pluginName + " - Online";
              console.log("✅ Заголовок изменён на: " + pluginName + " - Online");
            });
          }
        }
      }
    }

    var observer = new MutationObserver(function (mutations) {
      var titleChanged = mutations.some(function (mutation) {
        return mutation.type === 'childList' || mutation.type === 'characterData' || mutation.target && mutation.target.classList && mutation.target.classList.contains('head__title');
      });
      if (titleChanged) {
        setTimeout(checkAndUpdate, 10);
      }
    });

    var titleElement = document.querySelector('.head__title');
    if (titleElement) {
      observer.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    var bodyObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType === 1 && node.querySelector) {
              var title = node.querySelector('.head__title');
              if (title && !title.hasAttribute('data-title-watched')) {
                title.setAttribute('data-title-watched', 'true');
                observer.observe(title, {
                  childList: true,
                  characterData: true,
                  subtree: true
                });
              }
            }
          });
        }
      });
    });
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Функция для добавления CSS стилей
  function addCustomStyles() {
    var style = document.createElement('style');
    style.textContent = `
      /* Убираем анимацию трансформации для reyohoho кнопок */
      .full-start__button.view--reyohoho_mod.selector {
        transition: opacity 0.3s ease !important;
      }
      .full-start__button.view--reyohoho_mod.selector:hover,
      .full-start__button.view--reyohoho_mod.selector:focus {
        transform: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function process() {
    var count = 0;

    // Торрент-кнопки - обрабатываем все
    var torrentButtons = document.querySelectorAll('.full-start__button.view--torrent.selector');
    torrentButtons.forEach(function (btn) {
      if (btn.classList.contains('utorrent-svg-applied')) return;
      var svg = btn.querySelector('svg');
      if (svg) {
        if (replaceIconPreservingAttrs(svg, TORRENT_SVG_SOURCE)) {
          btn.classList.add('utorrent-svg-applied');
          count++;
        }
      }
    });

    // Онлайн-кнопки - обрабатываем только BwaRC и Cinema
    if (ONLINE_SVG_SOURCE) {
      var onlineButtons = document.querySelectorAll('.full-start__button.view--online.selector');
      onlineButtons.forEach(function (btn) {
        // Всегда добавляем обработчики hover
        attachHoverEnter(btn);

        // Пропускаем если уже обработана
        if (btn.classList.contains('online-svg-applied')) return;

        var pluginName = getPluginName(btn);
        console.log('Проверяем плагин:', pluginName, btn);

        // Меняем иконку и текст для BwaRC
        if (pluginName.toLowerCase().includes('bwa')) {
          // Используем setTimeout для отложенного выполнения, чтобы не мешать рендерингу Lampa
          setTimeout(function() {
            if (!btn.parentNode) {
              console.log('❌ Кнопка BwaRC больше не существует, пропускаем');
              return;
            }

            var svg = btn.querySelector('svg');
            var span = btn.querySelector('span');

            if (svg && !svg.classList.contains('custom-svg-replaced')) {
              if (replaceIconPreservingAttrs(svg, ONLINE_SVG_SOURCE)) {
                svg.classList.add('custom-svg-replaced');
                count++;
              }
            }

            if (span && span.textContent !== 'BWA') {
              span.textContent = 'BWA';
            }

            btn.classList.add('online-svg-applied');
            console.log('✅ Применены изменения для плагина BwaRC');
          }, 50);
        } 
        // Меняем только текст для Cinema
        else if (pluginName.toLowerCase().includes('cinema')) {
          setTimeout(function() {
            if (!btn.parentNode) return;

            var span = btn.querySelector('span');
            if (span && span.textContent !== 'Cinema') {
              span.textContent = 'Cinema';
            }
            btn.classList.add('online-svg-applied');
            console.log('✅ Текст изменен на Cinema для плагина cinema');
          }, 50);
        } 
        // Для других плагинов просто отмечаем как обработанные, чтобы не трогать в будущем
        else {
          btn.classList.add('online-svg-applied');
          console.log('⚠️ Плагин ' + pluginName + ' отмечен как обработанный (без изменений)');
        }
      });
    }

    // Обрабатываем кнопки reyohoho_mod
    if (REYOHOHO_SVG_SOURCE) {
      var reyohohoButtons = document.querySelectorAll('.full-start__button.view--reyohoho_mod.selector');
      reyohohoButtons.forEach(function (btn) {
        // Всегда добавляем обработчики hover
        attachHoverEnter(btn);

        // Пропускаем если уже обработана
        if (btn.classList.contains('reyohoho-svg-applied')) return;

        var svg = btn.querySelector('svg');
        if (svg) {
          setTimeout(function() {
            if (!btn.parentNode) return;

            // Заменяем иконку без указания размера - будет использоваться стандартный размер как у BWA
            if (replaceIconPreservingAttrs(svg, REYOHOHO_SVG_SOURCE, {
              className: 'reyohoho-custom-icon'
            })) {
              btn.classList.add('reyohoho-svg-applied');
              count++;
              console.log('✅ Иконка заменена для reyohoho_mod (стандартный размер)');
            }
          }, 50);
        }
      });
    }

    if (count) console.log('✅ Иконки заменены:', count);
  }

  function observe() {
    var mo = new MutationObserver(function (muts) {
      var needsUpdate = false;
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].type === 'childList' && muts[i].addedNodes.length) {
          needsUpdate = true;
          break;
        }
      }
      if (needsUpdate) {
        // Используем несколько попыток с задержками для надежности
        setTimeout(process, 100);
        setTimeout(process, 500);
        setTimeout(process, 1000);
      }
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    // Добавляем кастомные стили
    addCustomStyles();

    loadOnlineSVG();
    loadReyohohoSVG();
    // Запускаем обработку несколько раз с задержками
    setTimeout(process, 100);
    setTimeout(process, 500);
    setTimeout(process, 1000);
    observe();
    watchTitle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
