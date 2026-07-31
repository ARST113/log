(() => {
  'use strict';

  const EVENTS = Array.isArray(window.FF_EVENTS) ? window.FF_EVENTS : [];
  const STORAGE_KEY = 'ff26-saved';
  const MAP_PARTS = [
    'ff2026-map-data-0.txt?v=3',
    'ff2026-map-data-1.txt?v=3',
    'ff2026-map-data-2.txt?v=3',
    'ff2026-map-data-3.txt?v=3'
  ];
  const MAP_WIDTH = 1536;
  const MAP_HEIGHT = 890;
  const ORIGINAL_IMAGE_HEIGHT = 1085;
  const BASE_OVERSCAN = 1.06;
  const MAX_ZOOM = 2.6;

  const POIS = [
    { n:1,  x:780,  y:166, name:'Парковка 1' },
    { n:2,  x:220,  y:178, name:'Парковка 2' },
    { n:3,  x:42,   y:295, name:'Медпункт 1' },
    { n:4,  x:70,   y:381, name:'Сцена «Былина»', venue:'Сцена «Былина»' },
    { n:5,  x:403,  y:337, name:'Сцена «Берег»', venue:'Сцена «Берег»' },
    { n:6,  x:176,  y:451, name:'Мастер-классы' },
    { n:7,  x:312,  y:514, name:'Танцы, косплей, сражения', venue:'Ристалище' },
    { n:8,  x:436,  y:517, name:'Таверна «Секира»' },
    { n:9,  x:132,  y:616, name:'Антуражная торговля' },
    { n:10, x:535,  y:617, name:'Магазин «Секира»' },
    { n:11, x:618,  y:422, name:'Лучная секция' },
    { n:12, x:921,  y:307, name:'Зона досмотра' },
    { n:13, x:837,  y:416, name:'Сцена «Круг Света»', venue:'Сцена «Круг Света»' },
    { n:14, x:750,  y:548, name:'Литературная секция', venue:'Литературная программа' },
    { n:15, x:841,  y:548, name:'Лекторий', venue:'Лекторий' },
    { n:16, x:991,  y:560, name:'Медпункт 2' },
    { n:17, x:612,  y:669, name:'Не антуражная ярмарка' },
    { n:18, x:153,  y:835, name:'Антуражный лагерь' },
    { n:19, x:490,  y:858, name:'Пристань' },
    { n:20, x:1133, y:328, name:'Авто и мото кемпинг' },
    { n:21, x:1308, y:237, name:'Палаточная гостиница' },
    { n:22, x:1414, y:222, name:'Душ Енота' },
    { n:23, x:1118, y:699, name:'Шумный туристический лагерь' },
    { n:24, x:1337, y:699, name:'Тихий туристический лагерь' }
  ];

  const main = document.querySelector('#main');
  const viewTabs = document.querySelector('#viewTabs');
  const bottomNav = document.querySelector('.bottom-nav');
  const dayControls = document.querySelector('.control-shell');
  const sheet = document.querySelector('#sheet');
  const sheetBackdrop = document.querySelector('#sheetBackdrop');

  if (!main || !viewTabs || !bottomNav || !dayControls || !sheet || !sheetBackdrop || !EVENTS.length) return;

  let mapActive = false;
  let mapImageUrl = '';
  let croppedMapUrl = '';
  let mapImagePromise = null;
  let interactionController = null;

  function esc(value) {
    return String(value)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll(String.fromCharCode(34),'&quot;')
      .replaceAll(String.fromCharCode(39),'&#39;');
  }

  function loadMapImage() {
    if (croppedMapUrl) return Promise.resolve(croppedMapUrl);
    if (!mapImagePromise) {
      mapImagePromise = Promise.all(MAP_PARTS.map(path =>
        fetch(path, { cache:'force-cache' }).then(response => {
          if (!response.ok) throw new Error(`Не удалось загрузить часть карты: ${response.status}`);
          return response.text();
        })
      )).then(parts => {
        mapImageUrl = `data:image/png;base64,${parts.join('').replaceAll(' ','').replaceAll(String.fromCharCode(10),'').replaceAll(String.fromCharCode(13),'').replaceAll(String.fromCharCode(9),'')}`;
        return new Promise(resolve => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = MAP_WIDTH;
            canvas.height = MAP_HEIGHT;
            const ctx = canvas.getContext('2d', { alpha:false });
            ctx.drawImage(image, 0, 0, MAP_WIDTH, ORIGINAL_IMAGE_HEIGHT, 0, 0, MAP_WIDTH, ORIGINAL_IMAGE_HEIGHT);
            canvas.toBlob(blob => {
              croppedMapUrl = blob ? URL.createObjectURL(blob) : mapImageUrl;
              resolve(croppedMapUrl);
            }, 'image/webp', 0.92);
          };
          image.onerror = () => resolve(mapImageUrl);
          image.src = mapImageUrl;
        });
      }).catch(error => {
        console.error(error);
        return '';
      });
    }
    return mapImagePromise;
  }

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return new Set(Array.isArray(value) ? value : []);
    } catch {
      return new Set();
    }
  }

  function time(iso) {
    return String(iso).slice(11,16);
  }

  function minutes(iso) {
    const value = String(iso);
    return Number(value.slice(11,13)) * 60 + Number(value.slice(14,16));
  }

  function currentDay() {
    return document.querySelector('.day-tab.active')?.dataset.day || '2026-07-31';
  }

  function dayTitle(day) {
    return ({
      '2026-07-31':'31 июля',
      '2026-08-01':'1 августа',
      '2026-08-02':'2 августа'
    })[day] || day;
  }

  function moscowNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '';
    return {
      day:`${get('year')}-${get('month')}-${get('day')}`,
      minutes:Number(get('hour')) * 60 + Number(get('minute'))
    };
  }

  function savedEvents(day) {
    const saved = readSaved();
    return EVENTS
      .filter(event => saved.has(event.id) && event.day === day && POIS.some(poi => poi.venue === event.venue))
      .sort((a,b) => minutes(a.start) - minutes(b.start) || a.title.localeCompare(b.title, 'ru'));
  }

  function eventsAtVenue(day, venue) {
    return EVENTS
      .filter(event => event.day === day && event.venue === venue)
      .sort((a,b) => minutes(a.start) - minutes(b.start) || a.title.localeCompare(b.title, 'ru'));
  }

  function nextEvent(events, day) {
    if (!events.length) return null;
    const now = moscowNow();
    if (now.day !== day) return events[0];
    return events.find(event => minutes(event.end) > now.minutes) || events[0];
  }

  function routePoints(events) {
    const result = [];
    events.forEach(event => {
      const poi = POIS.find(item => item.venue === event.venue);
      if (!poi) return;
      if (!result.length || result.at(-1).venue !== event.venue) {
        result.push({ venue:event.venue, x:poi.x, y:poi.y });
      }
    });
    return result;
  }

  function focusPoint(events, upcoming) {
    if (upcoming) {
      const poi = POIS.find(item => item.venue === upcoming.venue);
      if (poi) return { x:poi.x / MAP_WIDTH, y:poi.y / MAP_HEIGHT };
    }
    const route = routePoints(events);
    if (route.length) {
      return {
        x:route.reduce((sum,item) => sum + item.x, 0) / route.length / MAP_WIDTH,
        y:route.reduce((sum,item) => sum + item.y, 0) / route.length / MAP_HEIGHT
      };
    }
    return { x:0.47, y:0.48 };
  }

  function routeSvg(points) {
    if (points.length < 2) return '';
    const values = points.map(point => `${point.x},${point.y}`).join(' ');
    return `
      <svg class='ff7-route' viewBox='0 0 ${MAP_WIDTH} ${MAP_HEIGHT}' aria-hidden='true'>
        <polyline class='ff7-route-shadow' points='${values}'/>
        <polyline class='ff7-route-line' points='${values}'/>
      </svg>`;
  }

  function poiHtml(poi, events, upcoming) {
    const count = poi.venue ? events.filter(event => event.venue === poi.venue).length : 0;
    const isNext = Boolean(upcoming && poi.venue === upcoming.venue);
    return `
      <button class='ff7-poi ${count ? 'is-saved' : ''} ${isNext ? 'is-next' : ''}'
        style='--x:${poi.x}px;--y:${poi.y}px'
        data-poi-number='${poi.n}'
        aria-label='${esc(`${poi.n}. ${poi.name}`)}'>
        <span class='ff7-hit-ring'></span>
        ${count ? `<span class='ff7-event-count'>${count}</span>` : ''}
      </button>`;
  }

  function syncLayoutMetrics() {
    const top = Math.ceil(dayControls.getBoundingClientRect().height || 72);
    const bottom = Math.ceil(bottomNav.getBoundingClientRect().height || 78);
    document.documentElement.style.setProperty('--ff7-top', `${top}px`);
    document.documentElement.style.setProperty('--ff7-bottom', `${bottom}px`);
  }

  function syncMapButtons() {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('[data-map-view]').forEach(button => button.classList.add('active'));
  }

  function openPoiSheet(number) {
    const poi = POIS.find(item => item.n === Number(number));
    if (!poi) return;
    const day = currentDay();
    const saved = readSaved();
    const items = poi.venue ? eventsAtVenue(day, poi.venue) : [];
    const savedCount = items.filter(event => saved.has(event.id)).length;

    sheet.classList.add('route-venue-sheet');
    sheet.innerHTML = `
      <div class='grabber'></div>
      <span class='sheet-label'>Точка ${poi.n}</span>
      <h3>${esc(poi.name)}</h3>
      ${poi.venue ? `
        <div class='route-venue-summary'>${dayTitle(day)} · ${items.length} событий${savedCount ? ` · ${savedCount} в маршруте` : ''}</div>
        <div class='route-venue-list'>
          ${items.length ? items.map(event => `
            <button class='route-venue-event ${saved.has(event.id) ? 'is-saved' : ''}' data-event='${esc(event.id)}'>
              <span class='route-venue-time'>${time(event.start)}<small>${time(event.end)}</small></span>
              <span class='route-venue-copy'><strong>${esc(event.title)}</strong><small>${saved.has(event.id) ? 'Добавлено в маршрут' : 'Открыть событие'}</small></span>
              <span class='route-venue-star'>${saved.has(event.id) ? '★' : '›'}</span>
            </button>`).join('') : `<div class='empty'>На этот день событий нет.</div>`}
        </div>` : `
        <div class='route-venue-summary'>${dayTitle(day)}</div>
        <div class='empty'>Эта точка отмечена на оригинальной карте. Отдельного расписания для неё нет.</div>`}
    `;
    sheet.classList.add('open');
    sheetBackdrop.classList.add('open');
  }

  function renderMap() {
    if (!mapActive) return;
    syncMapButtons();
    syncLayoutMetrics();
    const day = currentDay();
    const events = savedEvents(day);
    const upcoming = nextEvent(events, day);
    const route = routePoints(events);
    const focus = focusPoint(events, upcoming);

    main.innerHTML = `
      <section class='ff7-map-screen' id='ff7MapScreen'>
        <div class='ff7-viewport' id='ff7Viewport'>
          <div class='ff7-stage' id='ff7Stage'>
            <img class='ff7-map-image' alt='Оригинальная карта Фэнтези Феста 2026' draggable='false'>
            ${routeSvg(route)}
            <div class='ff7-pois'>
              ${POIS.map(poi => poiHtml(poi, events, upcoming)).join('')}
            </div>
          </div>
          <div class='ff7-objective'>
            <span>${upcoming ? 'Следующая цель' : `Карта · ${dayTitle(day)}`}</span>
            <strong>${upcoming ? `${time(upcoming.start)} · ${esc(upcoming.title)}` : 'Оригинальная схема. Двигайте карту во все стороны.'}</strong>
          </div>
          <button class='ff7-reset' type='button' data-map-reset aria-label='Вернуть исходный вид'>⌖</button>
          <div class='ff7-hint'>Одним пальцем — движение · двумя — масштаб</div>
        </div>
      </section>`;

    loadMapImage().then(url => {
      const image = document.querySelector('.ff7-map-image');
      if (!image) return;
      if (url) {
        image.src = url;
        image.classList.add('is-loaded');
      }
    });

    requestAnimationFrame(() => setupInteractions(focus));
  }

  function setMapActive(active) {
    mapActive = active;
    document.body.classList.toggle('ff7-active', active);
    document.querySelectorAll('[data-map-view]').forEach(button => button.classList.toggle('active', active));
    if (active) {
      document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('active'));
      window.scrollTo({ top:0, behavior:'auto' });
      renderMap();
    } else {
      interactionController?.abort();
      interactionController = null;
      sheet.classList.remove('route-venue-sheet');
      document.documentElement.style.removeProperty('--ff7-top');
      document.documentElement.style.removeProperty('--ff7-bottom');
    }
  }

  function injectTabs() {
    if (viewTabs.querySelector('[data-map-view]') || bottomNav.querySelector('[data-map-view]')) return;
    viewTabs.classList.add('ff-has-map');
    bottomNav.classList.add('ff-has-map');

    const top = document.createElement('button');
    top.className = 'view-tab ff-map-view-button';
    top.dataset.mapView = 'map';
    top.textContent = 'Карта';
    viewTabs.append(top);

    const bottom = document.createElement('button');
    bottom.className = 'ff-map-view-button';
    bottom.dataset.mapView = 'map';
    bottom.innerHTML = `<span class='ff-map-nav-icon'><svg viewBox='0 0 24 24'><path d='m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z'/><path d='M8 4v13M16 7v13'/></svg></span>Карта`;
    bottomNav.append(bottom);
  }

  function setupInteractions(initialFocus) {
    interactionController?.abort();
    interactionController = new AbortController();
    const { signal } = interactionController;
    const viewport = document.querySelector('#ff7Viewport');
    const stage = document.querySelector('#ff7Stage');
    const screen = document.querySelector('#ff7MapScreen');
    if (!viewport || !stage || !screen) return;

    const view = { scale:1, minScale:1, x:0, y:0 };
    const pointers = new Map();
    let dragStart = null;
    let pinchStart = null;
    let frame = 0;
    let resizeObserver = null;

    const maxScale = () => view.minScale * MAX_ZOOM;

    const clamp = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const scaledWidth = MAP_WIDTH * view.scale;
      const scaledHeight = MAP_HEIGHT * view.scale;
      const minX = width - scaledWidth;
      const minY = height - scaledHeight;
      view.x = scaledWidth <= width ? (width - scaledWidth) / 2 : Math.max(minX, Math.min(0, view.x));
      view.y = scaledHeight <= height ? (height - scaledHeight) / 2 : Math.max(minY, Math.min(0, view.y));
    };

    const apply = () => {
      frame = 0;
      clamp();
      stage.style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`;
      stage.style.setProperty('--ff7-inverse', String(view.minScale / view.scale));
    };

    const requestApply = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    const centerOn = (focus, scale) => {
      view.scale = Math.max(view.minScale, Math.min(maxScale(), scale));
      view.x = viewport.clientWidth / 2 - focus.x * MAP_WIDTH * view.scale;
      view.y = viewport.clientHeight / 2 - focus.y * MAP_HEIGHT * view.scale;
      requestApply();
    };

    const normalizedCenter = () => ({
      x:(viewport.clientWidth / 2 - view.x) / (MAP_WIDTH * view.scale),
      y:(viewport.clientHeight / 2 - view.y) / (MAP_HEIGHT * view.scale)
    });

    const fit = ({ preserve=false }={}) => {
      const oldMin = view.minScale || 1;
      const focus = preserve ? normalizedCenter() : initialFocus;
      const ratio = preserve ? view.scale / oldMin : BASE_OVERSCAN;
      view.minScale = Math.max(viewport.clientWidth / MAP_WIDTH, viewport.clientHeight / MAP_HEIGHT);
      centerOn(focus, view.minScale * ratio);
    };

    const zoomAt = (scale, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const nextScale = Math.max(view.minScale, Math.min(maxScale(), scale));
      const contentX = (px - view.x) / view.scale;
      const contentY = (py - view.y) / view.scale;
      view.scale = nextScale;
      view.x = px - contentX * nextScale;
      view.y = py - contentY * nextScale;
      viewport.classList.add('is-used');
      requestApply();
    };

    viewport.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      viewport.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
      viewport.classList.add('is-used');
      if (pointers.size === 1) {
        dragStart = { x:event.clientX, y:event.clientY, mapX:view.x, mapY:view.y };
      } else if (pointers.size === 2) {
        const [a,b] = [...pointers.values()];
        pinchStart = {
          distance:Math.hypot(a.x-b.x, a.y-b.y), scale:view.scale,
          x:view.x, y:view.y, midX:(a.x+b.x)/2, midY:(a.y+b.y)/2
        };
      }
    }, { signal });

    viewport.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
      if (pointers.size === 2 && pinchStart) {
        const [a,b] = [...pointers.values()];
        const distance = Math.hypot(a.x-b.x, a.y-b.y);
        const midX = (a.x+b.x)/2;
        const midY = (a.y+b.y)/2;
        const rect = viewport.getBoundingClientRect();
        const sx = pinchStart.midX - rect.left;
        const sy = pinchStart.midY - rect.top;
        const contentX = (sx - pinchStart.x) / pinchStart.scale;
        const contentY = (sy - pinchStart.y) / pinchStart.scale;
        view.scale = Math.max(view.minScale, Math.min(maxScale(), pinchStart.scale * distance / Math.max(1, pinchStart.distance)));
        view.x = midX - rect.left - contentX * view.scale;
        view.y = midY - rect.top - contentY * view.scale;
        requestApply();
      } else if (pointers.size === 1 && dragStart) {
        view.x = dragStart.mapX + event.clientX - dragStart.x;
        view.y = dragStart.mapY + event.clientY - dragStart.y;
        requestApply();
      }
    }, { signal });

    const end = event => {
      pointers.delete(event.pointerId);
      if (pointers.size === 1) {
        const point = [...pointers.values()][0];
        dragStart = { x:point.x, y:point.y, mapX:view.x, mapY:view.y };
      } else dragStart = null;
      pinchStart = null;
    };

    viewport.addEventListener('pointerup', end, { signal });
    viewport.addEventListener('pointercancel', end, { signal });

    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAt(view.scale * (event.deltaY < 0 ? 1.12 : .9), event.clientX, event.clientY);
    }, { passive:false, signal });

    screen.querySelector('[data-map-reset]')?.addEventListener('click', () => fit(), { signal });

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        syncLayoutMetrics();
        fit({ preserve:true });
      });
      resizeObserver.observe(viewport);
      resizeObserver.observe(dayControls);
      resizeObserver.observe(bottomNav);
      signal.addEventListener('abort', () => resizeObserver?.disconnect(), { once:true });
    }

    signal.addEventListener('abort', () => {
      if (frame) cancelAnimationFrame(frame);
    }, { once:true });

    fit();
  }

  injectTabs();
  loadMapImage();

  document.addEventListener('click', event => {
    const poi = event.target.closest('[data-poi-number]');
    if (mapActive && poi) {
      event.preventDefault();
      event.stopPropagation();
      openPoiSheet(poi.dataset.poiNumber);
      return;
    }
    if (event.target.closest('[data-map-view]')) {
      event.preventDefault();
      setMapActive(true);
      return;
    }
    if (event.target.closest('[data-view]')) {
      if (mapActive) setMapActive(false);
      return;
    }
    if (mapActive && event.target.closest('[data-day]')) {
      requestAnimationFrame(renderMap);
      return;
    }
    if (mapActive && event.target.closest('[data-save]')) {
      setTimeout(renderMap, 0);
    }
  });
})();