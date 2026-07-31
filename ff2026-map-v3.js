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
  const MAP_ASPECT = 1536 / 1085;
  const MAX_SCALE = 4;
  const DRAG_SPEED = 1.35;

  const VENUES = {
    'Сцена «Былина»': { number: 4, x: 11.8, y: 29.7, color: '#B77CFF', label: 'Сцена «Былина»' },
    'Сцена «Берег»': { number: 5, x: 31.5, y: 28.3, color: '#55C97A', label: 'Сцена «Берег»' },
    'Ристалище': { number: 7, x: 26.7, y: 39.4, color: '#35C5C2', label: 'Ристалище' },
    'Сцена «Круг Света»': { number: 13, x: 56.4, y: 35, color: '#5B8CFF', label: 'Сцена «Круг Света»' },
    'Литературная программа': { number: 14, x: 48.3, y: 45, color: '#FF7A8A', label: 'Литературная секция' },
    'Лекторий': { number: 15, x: 55.2, y: 44.5, color: '#F2C14E', label: 'Лекторий' }
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

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

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
    return events.find(event => minutes(event.end) > now.minutes) || null;
  }

  function groupedVenues(events) {
    return Object.entries(VENUES).map(([venue, point]) => ({
      venue,
      point,
      events: events.filter(event => event.venue === venue)
    }));
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
    return { x: .43, y: .38 };
  }

  function markerSvg() {
    return `
      <svg viewBox="0 0 48 58" aria-hidden="true">
        <path class="marker-aura" d="M24 1C11.3 1 2 10.5 2 23.1c0 16.8 22 33.9 22 33.9s22-17.1 22-33.9C46 10.5 36.7 1 24 1Z"/>
        <path class="marker-core" d="M24 7.5c-9.2 0-16.2 6.8-16.2 15.9 0 11.7 10.8 23.2 16.2 28.2 5.4-5 16.2-16.5 16.2-28.2C40.2 14.3 33.2 7.5 24 7.5Z"/>
        <path class="marker-rune" d="M24 13.2 27 20l7.4.7-5.6 4.9 1.7 7.2-6.5-3.7-6.5 3.7 1.7-7.2-5.6-4.9L21 20l3-6.8Z"/>
      </svg>`;
  }

  function routeLine(points) {
    if (points.length < 2) return '';
    const values = points.map(point => `${point.x},${point.y}`).join(' ');
    return `
      <svg class="route-map-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline class="route-line-shadow" points="${values}"/>
        <polyline class="route-line-main" points="${values}"/>
      </svg>`;
  }

  function markerHtml(group, upcoming, day) {
    const hasSaved = group.events.length > 0;
    const isNext = Boolean(upcoming && group.events.some(event => event.id === upcoming.id));
    const allCount = eventsAtVenue(day, group.venue).length;
    const title = `${group.point.label}: ${allCount} событий на ${dayTitle(day)}`;

    return `
      <button class="route-marker ${hasSaved ? 'is-saved' : 'is-location-only'} ${isNext ? 'is-next' : ''}"
        style="--x:${group.point.x}%;--y:${group.point.y}%;--marker:${group.point.color}"
        data-route-venue="${esc(group.venue)}"
        aria-label="${esc(title)}" title="${esc(title)}">
        ${markerSvg()}
        <span class="route-marker-number">${group.point.number}</span>
        <span class="route-marker-label">${esc(group.point.label)}</span>
      </button>`;
  }

  function syncLayoutMetrics() {
    const height = Math.ceil(dayControls.getBoundingClientRect().height || 72);
    document.documentElement.style.setProperty('--ff-map-top', `${height}px`);
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
    const events = selectedEvents(day);
    const upcoming = nextEvent(events, day);
    const groups = groupedVenues(events);
    const points = routePoints(events);
    const focus = focusPoint(events, upcoming);

    main.innerHTML = `
      <section class="route-map-screen" id="routeMapScreen">
        <div class="route-map-viewport" id="routeMapViewport">
          <div class="route-map-stage" id="routeMapStage">
            <img class="route-map-image" alt="Карта Фэнтези Феста 2026" draggable="false">
            ${routeLine(points)}
            <div class="route-map-markers">
              ${groups.map(group => markerHtml(group, upcoming, day)).join('')}
            </div>
          </div>

          <div class="route-map-objective-card">
            <span>${upcoming ? 'Следующая цель' : `Карта · ${dayTitle(day)}`}</span>
            <strong>${upcoming ? `${time(upcoming.start)} · ${esc(upcoming.title)}` : 'Нажмите на точку, чтобы открыть программу площадки'}</strong>
          </div>

          <div class="route-map-controls" aria-label="Управление масштабом">
            <button type="button" data-map-action="zoom-in" aria-label="Увеличить карту">+</button>
            <div class="route-map-scale" data-map-scale>100%</div>
            <button type="button" data-map-action="zoom-out" aria-label="Уменьшить карту">−</button>
            <button type="button" data-map-action="reset" aria-label="Вернуть к следующей цели" title="Вернуть к следующей цели">⌖</button>
          </div>

          <div class="route-map-hint">Нажмите на сцену, чтобы увидеть все её события</div>
        </div>
      </section>`;

    loadMapImage().then(url => {
      const image = document.querySelector('.route-map-image');
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

    const view = { scale: 1, x: 0, y: 0 };
    const base = { width: 0, height: 0 };
    const pointers = new Map();
    let dragStart = null;
    let pinchStart = null;
    let resizeObserver = null;

    const clampView = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const scaledWidth = base.width * view.scale;
      const scaledHeight = base.height * view.scale;
      const minX = Math.min(0, width - scaledWidth);
      const minY = Math.min(0, height - scaledHeight);
      view.x = Math.max(minX, Math.min(0, view.x));
      view.y = Math.max(minY, Math.min(0, view.y));
    };

    const apply = () => {
      clampView();
      stage.style.setProperty('--ff-map-pin-inverse', String(1 / view.scale));
      stage.style.transform = `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`;
      const scaleLabel = screen.querySelector('[data-map-scale]');
      if (scaleLabel) scaleLabel.textContent = `${Math.round(view.scale * 100)}%`;
    };

    const normalizedCenter = () => {
      if (!base.width || !base.height) return initialFocus;
      return {
        x: (viewport.clientWidth / 2 - view.x) / (base.width * view.scale),
        y: (viewport.clientHeight / 2 - view.y) / (base.height * view.scale)
      };
    };

    const fitStage = ({ preserve = false } = {}) => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height) return;

      const focus = preserve ? normalizedCenter() : initialFocus;
      base.width = Math.max(width, height * MAP_ASPECT);
      base.height = base.width / MAP_ASPECT;
      stage.style.width = `${base.width}px`;
      stage.style.height = `${base.height}px`;

      if (!preserve) view.scale = 1;
      view.x = width / 2 - focus.x * base.width * view.scale;
      view.y = height / 2 - focus.y * base.height * view.scale;
      apply();
    };

    const zoomAt = (targetScale, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const nextScale = Math.max(1, Math.min(MAX_SCALE, targetScale));
      if (Math.abs(nextScale - view.scale) < .001) return;

      const contentX = (px - view.x) / view.scale;
      const contentY = (py - view.y) / view.scale;
      view.x = px - contentX * nextScale;
      view.y = py - contentY * nextScale;
      view.scale = nextScale;
      viewport.classList.add('is-interacted');
      apply();
    };

    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAt(view.scale * (event.deltaY < 0 ? 1.2 : .82), event.clientX, event.clientY);
    }, { passive: false, signal });

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

        view.scale = Math.max(1, Math.min(MAX_SCALE,
          pinchStart.scale * distance / Math.max(1, pinchStart.distance)
        ));
        view.x = midpointX - rect.left - contentX * view.scale;
        view.y = midpointY - rect.top - contentY * view.scale;
        apply();
      } else if (pointers.size === 1 && dragStart) {
        view.x = dragStart.mapX + (event.clientX - dragStart.x) * DRAG_SPEED;
        view.y = dragStart.mapY + (event.clientY - dragStart.y) * DRAG_SPEED;
        apply();
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

    screen.addEventListener('click', event => {
      const action = event.target.closest('[data-map-action]')?.dataset.mapAction;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = viewport.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      if (action === 'zoom-in') zoomAt(view.scale * 1.5, centerX, centerY);
      if (action === 'zoom-out') zoomAt(view.scale / 1.5, centerX, centerY);
      if (action === 'reset') fitStage();
    }, { signal });

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => {
        syncLayoutMetrics();
        fitStage({ preserve: true });
      });
      resizeObserver.observe(viewport);
      resizeObserver.observe(dayControls);
      signal.addEventListener('abort', () => resizeObserver?.disconnect(), { once: true });
    } else {
      window.addEventListener('resize', () => {
        syncLayoutMetrics();
        fitStage({ preserve: true });
      }, { passive: true, signal });
    }

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
    }

    if (event.target.closest('.route-venue-list [data-event]')) {
      sheet.classList.remove('route-venue-sheet');
    }
  });
})();
