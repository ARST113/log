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
  const MAP_HEIGHT = 1085;
  const MAX_ZOOM_MULTIPLIER = 3.2;

  const VENUES = {
    'Сцена «Былина»': { number: 4, x: 11.8, y: 29.7, color: '#a170ff', label: 'Сцена «Былина»' },
    'Сцена «Берег»': { number: 5, x: 31.5, y: 28.3, color: '#44c06b', label: 'Сцена «Берег»' },
    'Ристалище': { number: 7, x: 26.7, y: 39.4, color: '#23b9c3', label: 'Ристалище' },
    'Сцена «Круг Света»': { number: 13, x: 56.4, y: 35.0, color: '#4f7fff', label: 'Сцена «Круг Света»' },
    'Литературная программа': { number: 14, x: 48.3, y: 45.0, color: '#f26f83', label: 'Литературная секция' },
    'Лекторий': { number: 15, x: 55.2, y: 44.5, color: '#e7b844', label: 'Лекторий' }
  };

  const main = document.querySelector('#main');
  const viewTabs = document.querySelector('#viewTabs');
  const bottomNav = document.querySelector('.bottom-nav');
  const dayControls = document.querySelector('.control-shell');
  const sheet = document.querySelector('#sheet');
  const sheetBackdrop = document.querySelector('#sheetBackdrop');

  if (!main || !viewTabs || !bottomNav || !dayControls || !sheet || !sheetBackdrop || !EVENTS.length) return;

  let mapActive = false;
  let mapImageUrl = '';
  let mapImagePromise = null;
  let interactionController = null;

  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function loadMapImage() {
    if (mapImageUrl) return Promise.resolve(mapImageUrl);
    if (!mapImagePromise) {
      mapImagePromise = Promise.all(MAP_PARTS.map(path =>
        fetch(path, { cache: 'force-cache' }).then(response => {
          if (!response.ok) throw new Error(`Не удалось загрузить часть карты: ${response.status}`);
          return response.text();
        })
      )).then(parts => {
        mapImageUrl = `data:image/png;base64,${parts.join('').replace(/\s+/g, '')}`;
        return mapImageUrl;
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

  function routeEvents(day) {
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
    return events.find(event => minutes(event.end) > now.minutes) || events[0] || null;
  }

  function routePoints(events) {
    const points = [];
    events.forEach(event => {
      const point = VENUES[event.venue];
      if (!point) return;
      const previous = points.at(-1);
      if (!previous || previous.venue !== event.venue) {
        points.push({ venue: event.venue, x: point.x, y: point.y });
      }
    });
    return points;
  }

  function focusPoint(events, upcoming) {
    const point = upcoming ? VENUES[upcoming.venue] : null;
    if (point) return { x: point.x / 100, y: point.y / 100 };
    const points = routePoints(events);
    if (points.length) {
      return {
        x: points.reduce((sum, item) => sum + item.x, 0) / points.length / 100,
        y: points.reduce((sum, item) => sum + item.y, 0) / points.length / 100
      };
    }
    return { x: 0.37, y: 0.36 };
  }

  function routeLine(points) {
    if (points.length < 2) return '';
    const values = points.map(point => `${point.x},${point.y}`).join(' ');
    return `
      <svg class="map-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="map-route-shadow" points="${values}"/>
        <polyline class="map-route-main" points="${values}"/>
      </svg>`;
  }

  function markerHtml(venue, events, next, day) {
    const point = VENUES[venue];
    const savedCount = events.filter(event => event.venue === venue).length;
    const isNext = Boolean(next && next.venue === venue);
    return `
      <button class="map-venue-marker ${savedCount ? 'is-saved' : 'is-idle'} ${isNext ? 'is-next' : ''}"
        data-route-venue="${esc(venue)}"
        style="--x:${point.x}%;--y:${point.y}%;--venue:${point.color}"
        aria-label="${esc(`${point.label}: ${eventsAtVenue(day, venue).length} событий`)}">
        <span class="map-venue-pin"><span class="map-venue-number">${point.number}</span></span>
        <span class="map-venue-label">${esc(point.label)}</span>
        ${savedCount ? `<span class="map-venue-count">${savedCount}</span>` : ''}
      </button>`;
  }

  function syncLayoutMetrics() {
    const top = Math.ceil(dayControls.getBoundingClientRect().height || 72);
    const bottom = Math.ceil(bottomNav.getBoundingClientRect().height || 76);
    document.documentElement.style.setProperty('--ff-map-top', `${top}px`);
    document.documentElement.style.setProperty('--ff-map-bottom', `${bottom}px`);
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
            <span class="route-venue-star" aria-hidden="true">${saved.has(event.id) ? '★' : '›'}</span>
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
    const events = routeEvents(day);
    const next = nextEvent(events, day);
    const points = routePoints(events);
    const focus = focusPoint(events, next);

    main.innerHTML = `
      <section class="map-v5" id="routeMapScreen">
        <div class="map-viewport" id="routeMapViewport" aria-label="Карта фестиваля">
          <div class="map-stage" id="routeMapStage">
            <img class="map-base-image" alt="Карта Фэнтези Феста 2026" draggable="false">
            ${routeLine(points)}
            <div class="map-venues">
              ${Object.keys(VENUES).map(venue => markerHtml(venue, events, next, day)).join('')}
            </div>
          </div>
          <div class="map-objective">
            <span>${next ? 'Следующая цель' : `Карта · ${dayTitle(day)}`}</span>
            <strong>${next ? `${time(next.start)} · ${esc(next.title)}` : 'Тяните карту одним пальцем. Масштабируйте двумя пальцами.'}</strong>
          </div>
          <div class="map-gesture-hint">Сведите или разведите два пальца для масштаба</div>
          <div class="map-tools" aria-label="Быстрые действия">
            <button type="button" data-map-action="zoom-out" aria-label="Уменьшить">−</button>
            <button type="button" data-map-action="reset" aria-label="Показать весь маршрут">⌖</button>
            <button type="button" data-map-action="zoom-in" aria-label="Увеличить">+</button>
          </div>
        </div>
      </section>`;

    loadMapImage().then(url => {
      const image = document.querySelector('.map-base-image');
      if (!image) return;
      if (url) {
        image.src = url;
        image.classList.add('is-loaded');
      } else {
        image.alt = 'Карта временно не загрузилась';
      }
    });

    requestAnimationFrame(() => setupMapInteractions(focus));
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
      sheet.classList.remove('route-venue-sheet');
      document.documentElement.style.removeProperty('--ff-map-top');
      document.documentElement.style.removeProperty('--ff-map-bottom');
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
    bottomButton.innerHTML = `
      <span class="ff-map-nav-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z"/><path d="M8 4v13M16 7v13"/></svg>
      </span>Карта`;
    bottomNav.append(bottomButton);
  }

  function setupMapInteractions(initialFocus) {
    interactionController?.abort();
    interactionController = new AbortController();
    const { signal } = interactionController;

    const viewport = document.querySelector('#routeMapViewport');
    const stage = document.querySelector('#routeMapStage');
    const screen = document.querySelector('#routeMapScreen');
    if (!viewport || !stage || !screen) return;

    const view = { scale: 1, fitScale: 1, x: 0, y: 0 };
    const pointers = new Map();
    let dragStart = null;
    let pinchStart = null;
    let resizeObserver = null;
    let frame = 0;

    const maxScale = () => view.fitScale * MAX_ZOOM_MULTIPLIER;

    const clampView = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const scaledWidth = MAP_WIDTH * view.scale;
      const scaledHeight = MAP_HEIGHT * view.scale;
      const minX = width - scaledWidth;
      const minY = height - scaledHeight;

      view.x = scaledWidth <= width ? (width - scaledWidth) / 2 : Math.max(minX, Math.min(0, view.x));
      view.y = scaledHeight <= height ? (height - scaledHeight) / 2 : Math.max(minY, Math.min(0, view.y));
    };

    const applyNow = () => {
      frame = 0;
      clampView();
      stage.style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`;
      stage.style.setProperty('--poi-scale-inverse', String(view.fitScale / view.scale));
    };

    const requestApply = () => {
      if (!frame) frame = requestAnimationFrame(applyNow);
    };

    const fitScaleValue = () => Math.max(viewport.clientWidth / MAP_WIDTH, viewport.clientHeight / MAP_HEIGHT);

    const normalizedCenter = () => ({
      x: (viewport.clientWidth / 2 - view.x) / (MAP_WIDTH * view.scale),
      y: (viewport.clientHeight / 2 - view.y) / (MAP_HEIGHT * view.scale)
    });

    const centerOn = (focus, scale = view.fitScale) => {
      view.scale = Math.max(view.fitScale, Math.min(maxScale(), scale));
      view.x = viewport.clientWidth / 2 - focus.x * MAP_WIDTH * view.scale;
      view.y = viewport.clientHeight / 2 - focus.y * MAP_HEIGHT * view.scale;
      requestApply();
    };

    const fitStage = ({ preserve = false } = {}) => {
      const previousFit = view.fitScale || 1;
      const focus = preserve ? normalizedCenter() : initialFocus;
      const ratio = preserve ? view.scale / previousFit : 1;
      view.fitScale = fitScaleValue();
      centerOn(focus, view.fitScale * ratio);
    };

    const zoomAt = (targetScale, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const nextScale = Math.max(view.fitScale, Math.min(maxScale(), targetScale));
      if (Math.abs(nextScale - view.scale) < 0.001) return;

      const contentX = (px - view.x) / view.scale;
      const contentY = (py - view.y) / view.scale;
      view.x = px - contentX * nextScale;
      view.y = py - contentY * nextScale;
      view.scale = nextScale;
      viewport.classList.add('is-interacted');
      requestApply();
    };

    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAt(view.scale * (event.deltaY < 0 ? 1.12 : 0.9), event.clientX, event.clientY);
    }, { passive: false, signal });

    viewport.addEventListener('dblclick', event => {
      event.preventDefault();
      zoomAt(view.scale < view.fitScale * 1.8 ? view.scale * 1.5 : view.fitScale, event.clientX, event.clientY);
    }, { signal });

    viewport.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      viewport.classList.add('is-interacted');
      viewport.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 1) {
        dragStart = { x: event.clientX, y: event.clientY, mapX: view.x, mapY: view.y };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale: view.scale,
          x: view.x,
          y: view.y,
          midpointX: (a.x + b.x) / 2,
          midpointY: (a.y + b.y) / 2
        };
      }
    }, { signal });

    viewport.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const midpointX = (a.x + b.x) / 2;
        const midpointY = (a.y + b.y) / 2;
        const rect = viewport.getBoundingClientRect();
        const startX = pinchStart.midpointX - rect.left;
        const startY = pinchStart.midpointY - rect.top;
        const contentX = (startX - pinchStart.x) / pinchStart.scale;
        const contentY = (startY - pinchStart.y) / pinchStart.scale;

        view.scale = Math.max(view.fitScale, Math.min(maxScale(), pinchStart.scale * distance / Math.max(1, pinchStart.distance)));
        view.x = midpointX - rect.left - contentX * view.scale;
        view.y = midpointY - rect.top - contentY * view.scale;
        requestApply();
      } else if (pointers.size === 1 && dragStart) {
        view.x = dragStart.mapX + event.clientX - dragStart.x;
        view.y = dragStart.mapY + event.clientY - dragStart.y;
        requestApply();
      }
    }, { signal });

    const endPointer = event => {
      pointers.delete(event.pointerId);
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        dragStart = { x: remaining.x, y: remaining.y, mapX: view.x, mapY: view.y };
      } else {
        dragStart = null;
      }
      pinchStart = null;
    };

    viewport.addEventListener('pointerup', endPointer, { signal });
    viewport.addEventListener('pointercancel', endPointer, { signal });
    viewport.addEventListener('pointerleave', endPointer, { signal });

    screen.addEventListener('click', event => {
      const action = event.target.closest('[data-map-action]')?.dataset.mapAction;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (action === 'zoom-in') zoomAt(view.scale * 1.18, cx, cy);
      if (action === 'zoom-out') zoomAt(view.scale * 0.86, cx, cy);
      if (action === 'reset') centerOn(initialFocus, view.fitScale);
    }, { signal });

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        syncLayoutMetrics();
        fitStage({ preserve: true });
      });
      resizeObserver.observe(viewport);
      resizeObserver.observe(dayControls);
      resizeObserver.observe(bottomNav);
      signal.addEventListener('abort', () => resizeObserver?.disconnect(), { once: true });
    } else {
      window.addEventListener('resize', () => {
        syncLayoutMetrics();
        fitStage({ preserve: true });
      }, { passive: true, signal });
    }

    signal.addEventListener('abort', () => {
      if (frame) cancelAnimationFrame(frame);
    }, { once: true });

    fitStage();
  }

  injectTabs();
  loadMapImage();

  document.addEventListener('click', event => {
    const venueMarker = event.target.closest('[data-route-venue]');
    if (mapActive && venueMarker) {
      event.preventDefault();
      event.stopPropagation();
      openVenueSheet(venueMarker.dataset.routeVenue);
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

    if (mapActive && event.target.closest('[data-save]')) {
      setTimeout(renderRouteMap, 0);
      return;
    }

    if (event.target.closest('.route-venue-list [data-event]')) {
      sheet.classList.remove('route-venue-sheet');
    }
  });
})();