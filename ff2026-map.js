(() => {
  'use strict';

  const EVENTS = Array.isArray(window.FF_EVENTS) ? window.FF_EVENTS : [];
  const STORAGE_KEY = 'ff26-saved';
  const MAP_IMAGE = 'ff2026-map.svg?v=1';
  const MAP_ASPECT = 1536 / 1085;

  const VENUES = {
    'Сцена «Былина»': {
      number: 4,
      x: 11.8,
      y: 29.7,
      color: '#B77CFF',
      label: 'Сцена «Былина»'
    },
    'Сцена «Берег»': {
      number: 5,
      x: 31.5,
      y: 28.3,
      color: '#55C97A',
      label: 'Сцена «Берег»'
    },
    'Ристалище': {
      number: 7,
      x: 26.7,
      y: 39.4,
      color: '#35C5C2',
      label: 'Ристалище'
    },
    'Сцена «Круг Света»': {
      number: 13,
      x: 56.4,
      y: 35.0,
      color: '#5B8CFF',
      label: 'Сцена «Круг Света»'
    },
    'Литературная программа': {
      number: 14,
      x: 48.3,
      y: 45.0,
      color: '#FF7A8A',
      label: 'Литературная секция'
    },
    'Лекторий': {
      number: 15,
      x: 55.2,
      y: 44.5,
      color: '#F2C14E',
      label: 'Лекторий'
    }
  };

  let mapActive = false;
  let transform = { scale: 1, x: 0, y: 0 };

  const main = document.querySelector('#main');
  const viewTabs = document.querySelector('#viewTabs');
  const bottomNav = document.querySelector('.bottom-nav');

  if (!main || !viewTabs || !bottomNav || !EVENTS.length) return;

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

  function getSelected(day) {
    const saved = readSaved();
    return EVENTS
      .filter(event => saved.has(event.id) && event.day === day && VENUES[event.venue])
      .sort((a, b) => minutes(a.start) - minutes(b.start) || a.title.localeCompare(b.title, 'ru'));
  }

  function getNextEvent(events, day) {
    if (!events.length) return null;
    const now = moscowNow();
    if (now.day !== day) return events[0];
    return events.find(event => minutes(event.end) > now.minutes) || null;
  }

  function groupByVenue(events) {
    return Object.entries(VENUES).map(([venue, point]) => ({
      venue,
      point,
      events: events.filter(event => event.venue === venue)
    }));
  }

  function routePoints(events) {
    const compact = [];
    events.forEach(event => {
      const point = VENUES[event.venue];
      if (!point) return;
      const previous = compact.at(-1);
      if (!previous || previous.venue !== event.venue) {
        compact.push({ venue: event.venue, x: point.x, y: point.y });
      }
    });
    return compact;
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

  function markerHtml(group, nextEvent) {
    const hasEvents = group.events.length > 0;
    const isNext = Boolean(nextEvent && group.events.some(event => event.id === nextEvent.id));
    const first = group.events[0];
    const title = hasEvents
      ? `${group.point.label}: ${group.events.map(event => `${time(event.start)} ${event.title}`).join('; ')}`
      : `${group.point.label}, точка ${group.point.number}`;

    return `
      <button class="route-marker ${hasEvents ? 'is-saved' : ''} ${isNext ? 'is-next' : ''}"
        style="--x:${group.point.x}%;--y:${group.point.y}%;--marker:${group.point.color}"
        ${first ? `data-event="${esc(first.id)}"` : ''}
        aria-label="${esc(title)}" title="${esc(title)}">
        ${markerSvg()}
        <span class="route-marker-number">${group.point.number}</span>
        ${group.events.length > 1 ? `<span class="route-marker-count">${group.events.length}</span>` : ''}
        <span class="route-marker-label">${esc(group.point.label)}</span>
      </button>`;
  }

  function journalHtml(events, nextEvent, day) {
    if (!events.length) {
      return `
        <div class="route-empty">
          <strong>Маршрут на ${dayTitle(day)} пока пуст</strong>
          <span>Добавьте события звёздочкой в расписании. Они появятся на карте и соединятся линией по времени.</span>
          <button class="secondary-btn" data-view="schedule">Перейти к расписанию</button>
        </div>`;
    }

    const now = moscowNow();
    return `
      <section class="quest-journal" aria-label="Журнал маршрута">
        <div class="quest-journal-head">
          <div><span>Журнал заданий</span><strong>${dayTitle(day)}</strong></div>
          <span>${events.length} ${events.length === 1 ? 'событие' : events.length < 5 ? 'события' : 'событий'}</span>
        </div>
        <div class="quest-list">
          ${events.map((event, index) => {
            const isNext = nextEvent?.id === event.id;
            const isPast = now.day === day && minutes(event.end) <= now.minutes;
            return `
              <button class="quest-item ${isNext ? 'is-next' : ''} ${isPast ? 'is-past' : ''}" data-event="${esc(event.id)}" style="--quest:${VENUES[event.venue].color}">
                <span class="quest-step">${index + 1}</span>
                <span class="quest-copy">
                  <strong>${esc(event.title)}</strong>
                  <span>${time(event.start)}–${time(event.end)} · ${esc(VENUES[event.venue].label)}</span>
                </span>
                <span class="quest-map-number">№ ${VENUES[event.venue].number}</span>
              </button>`;
          }).join('')}
        </div>
      </section>`;
  }

  function renderRouteMap() {
    if (!mapActive) return;

    const day = currentDay();
    const events = getSelected(day);
    const nextEvent = getNextEvent(events, day);
    const groups = groupByVenue(events);
    const points = routePoints(events);
    transform = { scale: 1, x: 0, y: 0 };

    main.innerHTML = `
      <div class="section-head route-map-heading">
        <div>
          <h2>Карта моего маршрута</h2>
          <p>${events.length ? 'События соединены в хронологическом порядке' : 'На карте показаны шесть площадок расписания'}</p>
        </div>
        <div class="counter">${events.length} сохранено</div>
      </div>

      <section class="route-map-shell" id="routeMapShell">
        <div class="route-map-toolbar">
          <div class="route-map-objective">
            <span>${nextEvent ? 'Следующая цель' : 'Навигация'}</span>
            <strong>${nextEvent ? `${time(nextEvent.start)} · ${esc(nextEvent.title)}` : 'Выберите события в расписании'}</strong>
          </div>
          <div class="route-map-controls" aria-label="Масштаб карты">
            <button type="button" data-map-action="zoom-out" aria-label="Уменьшить">−</button>
            <button type="button" data-map-action="reset" aria-label="Сбросить масштаб">1×</button>
            <button type="button" data-map-action="zoom-in" aria-label="Увеличить">+</button>
            <button type="button" data-map-action="fullscreen" aria-label="Открыть на весь экран" title="На весь экран">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>
            </button>
          </div>
        </div>

        <div class="route-map-viewport" id="routeMapViewport" style="--map-aspect:${MAP_ASPECT}">
          <div class="route-map-stage" id="routeMapStage">
            <img class="route-map-image" src="${MAP_IMAGE}" alt="Карта Фэнтези Феста 2026" draggable="false">
            ${routeLine(points)}
            <div class="route-map-markers">
              ${groups.map(group => markerHtml(group, nextEvent)).join('')}
            </div>
          </div>
          <div class="route-map-hint">Двигайте карту пальцем · сведите или разведите пальцы для масштаба</div>
        </div>
      </section>

      ${journalHtml(events, nextEvent, day)}
    `;

    requestAnimationFrame(setupMapInteractions);
  }

  function setMapActive(active) {
    mapActive = active;
    document.body.classList.toggle('ff-route-map-active', active);
    document.querySelectorAll('[data-map-view]').forEach(button => button.classList.toggle('active', active));
    if (active) {
      document.querySelectorAll('[data-view]').forEach(button => button.classList.remove('active'));
      renderRouteMap();
      const controls = document.querySelector('.control-shell');
      window.scrollTo({ top: Math.max(0, controls?.offsetTop || 0), behavior: 'auto' });
    }
  }

  function injectTabs() {
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

  function setupMapInteractions() {
    const viewport = document.querySelector('#routeMapViewport');
    const stage = document.querySelector('#routeMapStage');
    const shell = document.querySelector('#routeMapShell');
    if (!viewport || !stage || !shell) return;

    const pointers = new Map();
    let dragStart = null;
    let pinchStart = null;

    const clamp = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      const stageWidth = stage.offsetWidth * transform.scale;
      const stageHeight = stage.offsetHeight * transform.scale;
      const minX = Math.min(0, width - stageWidth);
      const minY = Math.min(0, height - stageHeight);
      transform.x = Math.max(minX, Math.min(0, transform.x));
      transform.y = Math.max(minY, Math.min(0, transform.y));
    };

    const apply = () => {
      clamp();
      stage.style.transform = `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.scale})`;
      const reset = shell.querySelector('[data-map-action="reset"]');
      if (reset) reset.textContent = `${transform.scale.toFixed(transform.scale < 2 ? 1 : 0)}×`;
    };

    const zoomAt = (factor, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const nextScale = Math.max(1, Math.min(4, transform.scale * factor));
      if (nextScale === transform.scale) return;
      const contentX = (px - transform.x) / transform.scale;
      const contentY = (py - transform.y) / transform.scale;
      transform.x = px - contentX * nextScale;
      transform.y = py - contentY * nextScale;
      transform.scale = nextScale;
      apply();
    };

    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? 1.18 : 0.84, event.clientX, event.clientY);
    }, { passive: false });

    viewport.addEventListener('dblclick', event => {
      event.preventDefault();
      zoomAt(transform.scale > 1.8 ? 1 / transform.scale : 1.7, event.clientX, event.clientY);
    });

    viewport.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      viewport.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        dragStart = { x: event.clientX, y: event.clientY, mapX: transform.x, mapY: transform.y };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale: transform.scale,
          x: transform.x,
          y: transform.y,
          midpointX: (a.x + b.x) / 2,
          midpointY: (a.y + b.y) / 2
        };
      }
    });

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
        transform.scale = Math.max(1, Math.min(4, pinchStart.scale * distance / Math.max(1, pinchStart.distance)));
        transform.x = midpointX - rect.left - contentX * transform.scale;
        transform.y = midpointY - rect.top - contentY * transform.scale;
        apply();
      } else if (pointers.size === 1 && dragStart) {
        transform.x = dragStart.mapX + event.clientX - dragStart.x;
        transform.y = dragStart.mapY + event.clientY - dragStart.y;
        apply();
      }
    });

    const endPointer = event => {
      pointers.delete(event.pointerId);
      if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        dragStart = { x: remaining.x, y: remaining.y, mapX: transform.x, mapY: transform.y };
      } else {
        dragStart = null;
      }
      pinchStart = null;
    };

    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointercancel', endPointer);

    shell.addEventListener('click', event => {
      const action = event.target.closest('[data-map-action]')?.dataset.mapAction;
      if (!action) return;
      if (action === 'zoom-in') {
        const rect = viewport.getBoundingClientRect();
        zoomAt(1.3, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      if (action === 'zoom-out') {
        const rect = viewport.getBoundingClientRect();
        zoomAt(0.77, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      if (action === 'reset') {
        transform = { scale: 1, x: 0, y: 0 };
        apply();
      }
      if (action === 'fullscreen') {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else shell.requestFullscreen?.();
      }
    });

    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(viewport);
    apply();
  }

  injectTabs();

  document.addEventListener('click', event => {
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
  });

  document.addEventListener('fullscreenchange', () => {
    const button = document.querySelector('[data-map-action="fullscreen"]');
    if (!button) return;
    button.classList.toggle('is-active', Boolean(document.fullscreenElement));
  });
})();
