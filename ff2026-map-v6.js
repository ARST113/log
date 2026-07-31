(() => {
  'use strict';

  const EVENTS = Array.isArray(window.FF_EVENTS) ? window.FF_EVENTS : [];
  const STORAGE_KEY = 'ff26-saved';
  const WORLD_WIDTH = 1080;
  const WORLD_HEIGHT = 1920;
  const MAX_ZOOM = 3.25;

  const VENUES = {
    'Сцена «Былина»': { number: 4, x: 235, y: 505, color: '#9a63e8', label: 'Сцена «Былина»' },
    'Сцена «Берег»': { number: 5, x: 600, y: 495, color: '#48b969', label: 'Сцена «Берег»' },
    'Ристалище': { number: 7, x: 355, y: 755, color: '#34b8bd', label: 'Ристалище' },
    'Сцена «Круг Света»': { number: 13, x: 770, y: 965, color: '#507ee8', label: 'Сцена «Круг Света»' },
    'Литературная программа': { number: 14, x: 350, y: 1160, color: '#e96b7d', label: 'Литературная секция' },
    'Лекторий': { number: 15, x: 600, y: 1150, color: '#d9aa37', label: 'Лекторий' }
  };

  const main = document.querySelector('#main');
  const viewTabs = document.querySelector('#viewTabs');
  const bottomNav = document.querySelector('.bottom-nav');
  const dayControls = document.querySelector('.control-shell');
  const sheet = document.querySelector('#sheet');
  const sheetBackdrop = document.querySelector('#sheetBackdrop');

  if (!main || !viewTabs || !bottomNav || !dayControls || !sheet || !sheetBackdrop || !EVENTS.length) return;

  let mapActive = false;
  let interactionController = null;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
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
    const match = String(iso).match(/T(\d{2}:\d{2})/);
    return match ? match[1] : '';
  }

  function minutes(iso) {
    const match = String(iso).match(/T(\d{2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  }

  function currentDay() {
    return document.querySelector('.day-tab.active')?.dataset.day || '2026-07-31';
  }

  function dayTitle(day) {
    return ({
      '2026-07-31': '31 июля',
      '2026-08-01': '1 августа',
      '2026-08-02': '2 августа'
    })[day] || day;
  }

  function moscowNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value || '';
    return {
      day: `${get('year')}-${get('month')}-${get('day')}`,
      minutes: Number(get('hour')) * 60 + Number(get('minute'))
    };
  }

  function selectedEvents(day) {
    const saved = readSaved();
    return EVENTS
      .filter(event => saved.has(event.id) && event.day === day && VENUES[event.venue])
      .sort((a, b) => minutes(a.start) - minutes(b.start) || a.title.localeCompare(b.title, 'ru'));
  }

  function eventsAtVenue(day, venue) {
    return EVENTS
      .filter(event => event.day === day && event.venue === venue)
      .sort((a, b) => minutes(a.start) - minutes(b.start) || a.title.localeCompare(b.title, 'ru'));
  }

  function nextEvent(events, day) {
    if (!events.length) return null;
    const now = moscowNow();
    if (now.day !== day) return events[0];
    return events.find(event => minutes(event.end) > now.minutes) || events[0];
  }

  function routePoints(events) {
    const points = [];
    events.forEach(event => {
      const point = VENUES[event.venue];
      if (!point) return;
      const previous = points.at(-1);
      if (!previous || previous.venue !== event.venue) points.push({ venue: event.venue, x: point.x, y: point.y });
    });
    return points;
  }

  function routeLine(points) {
    if (points.length < 2) return '';
    const values = points.map(point => `${point.x},${point.y}`).join(' ');
    return `
      <svg class="ff-map-v6-route" viewBox="0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}" aria-hidden="true">
        <polyline class="ff-route-shadow" points="${values}"/>
        <polyline class="ff-route-main" points="${values}"/>
      </svg>`;
  }

  function markerHtml(venue, routeEvents, next) {
    const point = VENUES[venue];
    const savedCount = routeEvents.filter(event => event.venue === venue).length;
    const isNext = next?.venue === venue;
    const classes = ['ff-map-v6-marker', savedCount ? 'is-saved' : 'is-idle', isNext ? 'is-next' : ''].filter(Boolean).join(' ');
    return `
      <button class="${classes}" data-route-venue="${esc(venue)}"
        style="--x:${point.x / WORLD_WIDTH * 100}%;--y:${point.y / WORLD_HEIGHT * 100}%;--pin:${point.color}">
        <span class="ff-map-v6-marker-pin"><span>${point.number}</span></span>
        <span class="ff-map-v6-marker-label">${esc(point.label)}</span>
        ${savedCount ? `<span class="ff-map-v6-marker-count">${savedCount}</span>` : ''}
      </button>`;
  }

  function syncLayoutMetrics() {
    document.documentElement.style.setProperty('--ff-map-top', `${Math.ceil(dayControls.getBoundingClientRect().height || 72)}px`);
    document.documentElement.style.setProperty('--ff-map-bottom', `${Math.ceil(bottomNav.getBoundingClientRect().height || 78)}px`);
  }

  function syncMapButtons() {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('active'));
    document.querySelectorAll('[data-map-view]').forEach(button => button.classList.add('active'));
  }

  function openVenueSheet(venue) {
    const point = VENUES[venue];
    if (!point) return;
    const day = currentDay();
    const saved = readSaved();
    const items = eventsAtVenue(day, venue);
    const savedCount = items.filter(event => saved.has(event.id)).length;

    sheet.classList.add('route-venue-sheet');
    sheet.innerHTML = `
      <div class="grabber"></div>
      <span class="sheet-label" style="color:${point.color};background:rgba(255,255,255,.08)">Точка ${point.number}</span>
      <h3>${esc(point.label)}</h3>
      <div class="route-venue-summary">${dayTitle(day)} · ${items.length} событий${savedCount ? ` · ${savedCount} в маршруте` : ''}</div>
      <div class="route-venue-list">
        ${items.length ? items.map(event => `
          <button class="route-venue-event ${saved.has(event.id) ? 'is-saved' : ''}" data-event="${esc(event.id)}">
            <span class="route-venue-time">${time(event.start)}<small>${time(event.end)}</small></span>
            <span class="route-venue-copy"><strong>${esc(event.title)}</strong><small>${saved.has(event.id) ? 'Добавлено в мой маршрут' : 'Нажмите, чтобы открыть событие'}</small></span>
            <span class="route-venue-star">${saved.has(event.id) ? '★' : '›'}</span>
          </button>`).join('') : '<div class="empty">На этот день событий на площадке нет.</div>'}
      </div>`;
    sheet.classList.add('open');
    sheetBackdrop.classList.add('open');
  }

  function renderRouteMap() {
    if (!mapActive) return;
    syncMapButtons();
    syncLayoutMetrics();

    const day = currentDay();
    const events = selectedEvents(day);
    const next = nextEvent(events, day);
    const points = routePoints(events);

    main.innerHTML = `
      <section class="ff-map-v6" id="ffMapV6">
        <div class="ff-map-v6-viewport" id="ffMapV6Viewport">
          <div class="ff-map-v6-stage" id="ffMapV6Stage">
            ${MAP_SVG}
            ${routeLine(points)}
            <div class="ff-map-v6-markers">
              ${Object.keys(VENUES).map(venue => markerHtml(venue, events, next)).join('')}
            </div>
          </div>
          <div class="ff-map-v6-objective">
            <span>${next ? 'Следующая цель' : `Карта · ${dayTitle(day)}`}</span>
            <strong>${next ? `${time(next.start)} · ${esc(next.title)}` : 'Нажмите на площадку, чтобы открыть её программу'}</strong>
          </div>
          <div class="ff-map-v6-hint">Двигайте одним пальцем · масштабируйте двумя</div>
          <button class="ff-map-v6-reset" type="button" data-map-reset aria-label="Вернуть общий вид">⌖</button>
        </div>
      </section>`;

    requestAnimationFrame(setupInteractions);
  }

  function setMapActive(active) {
    mapActive = active;
    document.body.classList.toggle('ff-route-map-active', active);
    document.querySelectorAll('[data-map-view]').forEach(button => button.classList.toggle('active', active));
    if (active) {
      document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('active'));
      window.scrollTo({ top: 0, behavior: 'auto' });
      renderRouteMap();
    } else {
      interactionController?.abort();
      interactionController = null;
      document.documentElement.style.removeProperty('--ff-map-top');
      document.documentElement.style.removeProperty('--ff-map-bottom');
      sheet.classList.remove('route-venue-sheet');
    }
  }

  function injectTabs() {
    if (viewTabs.querySelector('[data-map-view]') || bottomNav.querySelector('[data-map-view]')) return;
    viewTabs.classList.add('ff-has-map');
    bottomNav.classList.add('ff-has-map');

    const topButton = document.createElement('button');
    topButton.className = 'view-tab ff-map-view-button';
    topButton.dataset.mapView = 'map';
    topButton.textContent = 'Карта';
    viewTabs.append(topButton);

    const bottomButton = document.createElement('button');
    bottomButton.className = 'ff-map-view-button';
    bottomButton.dataset.mapView = 'map';
    bottomButton.innerHTML = `<span class="ff-map-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z"/><path d="M8 4v13M16 7v13"/></svg></span>Карта`;
    bottomNav.append(bottomButton);
  }

  function setupInteractions() {
    interactionController?.abort();
    interactionController = new AbortController();
    const { signal } = interactionController;
    const viewport = document.querySelector('#ffMapV6Viewport');
    const stage = document.querySelector('#ffMapV6Stage');
    if (!viewport || !stage) return;

    const view = { scale: 1, minScale: 1, x: 0, y: 0 };
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    let raf = 0;
    let resizeObserver = null;

    const maxScale = () => view.minScale * MAX_ZOOM;

    const clamp = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const sw = WORLD_WIDTH * view.scale;
      const sh = WORLD_HEIGHT * view.scale;
      const minX = vw - sw;
      const minY = vh - sh;
      view.x = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(minX, view.x));
      view.y = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(minY, view.y));
    };

    const applyNow = () => {
      raf = 0;
      clamp();
      stage.style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`;
      stage.style.setProperty('--ff-pin-inverse', String(view.minScale / view.scale));
    };

    const apply = () => {
      if (!raf) raf = requestAnimationFrame(applyNow);
    };

    const setCover = ({ preserve = false } = {}) => {
      const previousMin = view.minScale || 1;
      const center = preserve ? {
        x: (viewport.clientWidth / 2 - view.x) / (WORLD_WIDTH * view.scale),
        y: (viewport.clientHeight / 2 - view.y) / (WORLD_HEIGHT * view.scale)
      } : { x: .5, y: .5 };
      const ratio = preserve ? view.scale / previousMin : 1;
      view.minScale = Math.max(viewport.clientWidth / WORLD_WIDTH, viewport.clientHeight / WORLD_HEIGHT);
      view.scale = Math.max(view.minScale, Math.min(maxScale(), view.minScale * ratio));
      view.x = viewport.clientWidth / 2 - center.x * WORLD_WIDTH * view.scale;
      view.y = viewport.clientHeight / 2 - center.y * WORLD_HEIGHT * view.scale;
      apply();
    };

    const zoomAt = (targetScale, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const nextScale = Math.max(view.minScale, Math.min(maxScale(), targetScale));
      if (Math.abs(nextScale - view.scale) < .001) return;
      const contentX = (px - view.x) / view.scale;
      const contentY = (py - view.y) / view.scale;
      view.scale = nextScale;
      view.x = px - contentX * nextScale;
      view.y = py - contentY * nextScale;
      viewport.classList.add('is-interacted');
      apply();
    };

    viewport.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      viewport.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      viewport.classList.add('is-interacted');
      if (pointers.size === 1) {
        drag = { x: event.clientX, y: event.clientY, mapX: view.x, mapY: view.y };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale: view.scale,
          x: view.x,
          y: view.y,
          midX: (a.x + b.x) / 2,
          midY: (a.y + b.y) / 2
        };
      }
    }, { signal });

    viewport.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const rect = viewport.getBoundingClientRect();
        const startX = pinch.midX - rect.left;
        const startY = pinch.midY - rect.top;
        const contentX = (startX - pinch.x) / pinch.scale;
        const contentY = (startY - pinch.y) / pinch.scale;
        view.scale = Math.max(view.minScale, Math.min(maxScale(), pinch.scale * distance / Math.max(1, pinch.distance)));
        view.x = midX - rect.left - contentX * view.scale;
        view.y = midY - rect.top - contentY * view.scale;
        apply();
      } else if (pointers.size === 1 && drag) {
        view.x = drag.mapX + event.clientX - drag.x;
        view.y = drag.mapY + event.clientY - drag.y;
        apply();
      }
    }, { signal });

    const end = event => {
      pointers.delete(event.pointerId);
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        drag = { x: remaining.x, y: remaining.y, mapX: view.x, mapY: view.y };
      } else drag = null;
      pinch = null;
    };

    viewport.addEventListener('pointerup', end, { signal });
    viewport.addEventListener('pointercancel', end, { signal });

    viewport.addEventListener('dblclick', event => {
      event.preventDefault();
      zoomAt(view.scale < view.minScale * 1.8 ? view.scale * 1.55 : view.minScale, event.clientX, event.clientY);
    }, { signal });

    viewport.querySelector('[data-map-reset]')?.addEventListener('click', () => setCover(), { signal });

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        syncLayoutMetrics();
        setCover({ preserve: true });
      });
      resizeObserver.observe(viewport);
      resizeObserver.observe(dayControls);
      resizeObserver.observe(bottomNav);
      signal.addEventListener('abort', () => resizeObserver?.disconnect(), { once: true });
    }

    signal.addEventListener('abort', () => { if (raf) cancelAnimationFrame(raf); }, { once: true });
    setCover();
  }

  injectTabs();

  document.addEventListener('click', event => {
    const venue = event.target.closest('[data-route-venue]');
    if (mapActive && venue) {
      event.preventDefault();
      event.stopPropagation();
      openVenueSheet(venue.dataset.routeVenue);
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
      requestAnimationFrame(renderRouteMap);
      return;
    }
    if (mapActive && event.target.closest('[data-save]')) setTimeout(renderRouteMap, 0);
    if (event.target.closest('.route-venue-list [data-event]')) sheet.classList.remove('route-venue-sheet');
  });
})();
