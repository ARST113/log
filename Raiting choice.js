(function () {
  'use strict';

  const PLUGIN_NAME = 'rating_unified_v16_nolampa_rotating_darktmdb';
  const DEBUG = true;

  const log = (...a) => DEBUG && console.log('[rating]', ...a);

  // ---------- Совместимость: Request / Reguest ----------
  function makeRequest() {
    const Ctor = Lampa?.Request || Lampa?.Reguest;
    if (!Ctor) throw new Error('Neither Lampa.Request nor Lampa.Reguest found');
    return new Ctor();
  }

  // ---------- Совместимость: addUrl helpers ----------
  const addParam = (base, key, val) => {
    try {
      if (Lampa?.Utils && (Lampa.Utils.addUrlComponent || Lampa.Utils.addUrlParam)) {
        const fn = Lampa.Utils.addUrlComponent || Lampa.Utils.addUrlParam;
        return fn(base, `${key}=${encodeURIComponent(val)}`);
      }
    } catch (e) {}
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${key}=${encodeURIComponent(val)}`;
  };

  // ---------- Настройки (селект) ----------
  function addSettingsSelect({ name, values, def, title, descr, onChange }) {
    if (Lampa?.SettingsApi?.addParam) {
      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: { name, type: 'select', values, default: def },
        field: { name: title, description: descr },
        onChange
      });
      return;
    }
    if (Lampa?.Settings?.listener?.add) {
      Lampa.Settings.listener.add({
        component: 'main',
        param: { name, type: 'select', values, default: def },
        field: { name: title, description: descr },
        onChange
      });
      return;
    }
    log('⚠️ Settings API not found — using Storage only.');
  }

  // ---------- Ротация ключей KinopoiskUnofficial ----------
  const API_KEYS = [
    '2a4a0808-81a3-40ae-b0d3-e11335ede616',
    '8c8e1a50-6322-4135-8875-5d40a5420d86'
  ];
  const KEY_COOLDOWN_MS = 12 * 60 * 1000; // 12 минут

  let kpKeyState = {
    idx: Number(Lampa.Storage.get('kp_key_idx', 0)) % API_KEYS.length,
    cooldowns: (() => {
      try { return JSON.parse(Lampa.Storage.get('kp_key_cooldowns', '{}')) || {}; }
      catch(e){ return {}; }
    })()
  };

  function isOnCooldown(i) {
    const until = kpKeyState.cooldowns[i] || 0;
    return Date.now() < until;
  }
  function markCooldown(i, retryAfterMs) {
    const until = Date.now() + (retryAfterMs || KEY_COOLDOWN_MS);
    kpKeyState.cooldowns[i] = until;
    try { Lampa.Storage.set('kp_key_cooldowns', JSON.stringify(kpKeyState.cooldowns)); } catch(e){}
  }
  function saveKeyIndex(i) {
    kpKeyState.idx = i;
    try { Lampa.Storage.set('kp_key_idx', i); } catch(e){}
  }
  function pickStartIndex() {
    for (let step = 0; step < API_KEYS.length; step++) {
      const i = (kpKeyState.idx + step) % API_KEYS.length;
      if (!isOnCooldown(i)) return i;
    }
    return kpKeyState.idx;
  }

  function kpSilent(req, url, onOk, onFail) {
    let start = pickStartIndex();
    let attempt = 0;

    const tryOnce = () => {
      if (attempt >= API_KEYS.length) {
        onFail && onFail();
        return;
      }
      const i = (start + attempt) % API_KEYS.length;
      const key = API_KEYS[i];

      req.clear();
      req.timeout(15000);
      req.silent(url, function success(json) {
        saveKeyIndex(i);
        onOk && onOk(json);
      }, function error(a, c) {
        const status =
          (a && a.status) || (c && c.status) ||
          (typeof a === 'number' ? a : 0);
        if (status === 429 || status === 403) {
          markCooldown(i, KEY_COOLDOWN_MS);
        }
        attempt++;
        tryOnce();
      }, false, { headers: { 'X-API-KEY': key } });
    };

    tryOnce();
  }

  function kpFetchJson(url) {
    const req = makeRequest();
    return new Promise((resolve, reject) => {
      kpSilent(req, url, resolve, reject);
    });
  }

  // ---------- Ключи кэшей ----------
  const CACHE_KP = 'kp_rating';
  const CACHE_DISPLAY = 'rating_display_cache';

  // ---------- Память процесса ----------
  const memory = {
    values: new Map(),             // id -> { kp, imdb, ts }
    nodesProcessed: new WeakSet(), // DOM-узлы карточек
  };

  // ---------- Нормализация ----------
  const cleanTitle = str => (str || '').replace(/[\s.,:;’'`!?]+/g, ' ').trim();

  // ---------- Работа с Lampa.Storage.cache ----------
  function storageCacheGet(name, max, empty) {
    try { return Lampa.Storage.cache(name, max, empty); }
    catch (e) { return empty || {}; }
  }
  function displayCacheRead() {
    return storageCacheGet(CACHE_DISPLAY, 1000, {});
  }
  function displayCacheWrite(key, payload) {
    const cache = storageCacheGet(CACHE_DISPLAY, 1000, {});
    cache[key] = payload;
    Lampa.Storage.set(CACHE_DISPLAY, cache);
  }
  function readKP(id) {
    const cache = storageCacheGet(CACHE_KP, 1000, {});
    const rec = cache[id];
    if (!rec) return null;
    const month = 30 * 24 * 3600 * 1000;
    if (!rec.timestamp || Date.now() - rec.timestamp > month) return null;
    return rec;
  }
  function writeKP(id, data) {
    const cache = storageCacheGet(CACHE_KP, 1000, {});
    cache[id] = { ...data, timestamp: Date.now() };
    Lampa.Storage.set(CACHE_KP, cache);
  }

  // ---------- Источник ----------
  const VALID_SOURCES = ['tmdb','kp','imdb'];
  function sanitizeSource(val) { return VALID_SOURCES.includes(val) ? val : 'tmdb'; }
  function getSource() {
    try { return sanitizeSource(Lampa.Storage.get('rating_source', 'tmdb')); }
    catch (e) { return 'tmdb'; }
  }

  // ---------- TMDB (быстро, без сети) ----------
  function getTmdbRating(card) {
    if (card?.vote_average > 0) return String(parseFloat(card.vote_average).toFixed(1));
    if (card?.rating > 0) return String(parseFloat(card.rating).toFixed(1));
    if (card?.vote_count > 0) return '5.0';
    if (card?.popularity && card.popularity > 10) return '6.0';
    const y = (card?.release_date || '').slice(0,4);
    const cy = new Date().getFullYear();
    if (y && cy - Number(y) <= 2) return '5.5';
    return '0.0';
  }

  // ---------- Kinopoisk/IMDB (через ротацию ключей) ----------
  function prepareSearchTitle(q) {
    return cleanTitle(q)
      .replace(/^[ \/\\]+/, '')
      .replace(/[ \/\\]+$/, '')
      .replace(/\+( *[+\/\\])+/g, '+')
      .replace(/([+\/\\] *)+\+/g, '+')
      .replace(/( *[\/\\]+ *)+/g, '+');
  }

  function fetchKpOrImdb(item) {
    return new Promise(resolve => {
      const cached = readKP(item.id);
      if (cached) {
        const src = getSource();
        const v = src === 'kp' ? cached.kp : cached.imdb;
        return resolve(v ? String(parseFloat(v).toFixed(1)) : '0.0');
      }

      const base = 'https://kinopoiskapiunofficial.tech/';
      const searchTitle = (item.title || item.name || '').trim();
      const release = (item.release_date || item.first_air_date || item.first_release_date || '0000') + '';
      const year = parseInt(release.substring(0,4) || '0', 10);
      const orig = (item.original_title || item.original_name || '').toLowerCase();

      function choose(results) {
        if (!results || !results.length) {
          writeKP(item.id, { kp: 0, imdb: 0 });
          return resolve('0.0');
        }
        results.forEach(r => {
          const y = r.start_date || r.year || '0000';
          r.tmp_year = parseInt(String(y).substring(0,4), 10);
        });

        let cards = results;

        if (orig) {
          const t = cards.filter(r => {
            const a = (r.nameOriginal || r.nameEn || r.en_title || '').toLowerCase();
            const b = (r.nameRu || r.ru_title || r.name || '').toLowerCase();
            return a.includes(orig) || b.includes(orig);
          });
          if (t.length) cards = t;
        }

        if (cards.length > 1 && year) {
          let y1 = cards.filter(r => r.tmp_year === year);
          if (!y1.length) y1 = cards.filter(r => r.tmp_year && r.tmp_year > year - 2 && r.tmp_year < year + 2);
          if (y1.length) cards = y1;
        }

        const pick = cards[0];
        const filmId = pick.filmId || pick.kinopoisk_id || pick.kinopoiskId || pick.id;
        if (!filmId) {
          writeKP(item.id, { kp: 0, imdb: 0 });
          return resolve('0.0');
        }

        const detailsUrl = base + 'api/v2.2/films/' + filmId;
        kpFetchJson(detailsUrl).then((data)=>{
          const kp = data?.ratingKinopoisk || 0;
          const imdb = data?.ratingImdb || 0;
          writeKP(item.id, { kp, imdb });
          const src = getSource();
          const val = src === 'kp' ? kp : imdb;
          resolve(val ? String(parseFloat(val).toFixed(1)) : '0.0');
        }).catch(()=>{
          writeKP(item.id, { kp: 0, imdb: 0 });
          resolve('0.0');
        });
      }

      if (item.imdb_id) {
        const url = addParam(base + 'api/v2.2/films', 'imdbId', item.imdb_id);
        kpFetchJson(url).then(json=>{
          choose(json?.items || json?.films || []);
        }).catch(()=>{
          const u2 = addParam(base + 'api/v2.1/films/search-by-keyword', 'keyword', prepareSearchTitle(searchTitle));
          kpFetchJson(u2).then(json=>{
            choose(json?.items || json?.films || []);
          }).catch(()=> resolve('0.0'));
        });
      } else {
        const url = addParam(base + 'api/v2.1/films/search-by-keyword', 'keyword', prepareSearchTitle(searchTitle));
        kpFetchJson(url).then(json=>{
          choose(json?.items || json?.films || []);
        }).catch(()=> resolve('0.0'));
      }
    });
  }

  // ---------- Стили (тёмный TMDB + логотипы-место) ----------
  function ensureStyles() {
    if (window[PLUGIN_NAME + '_styles']) return;
    window[PLUGIN_NAME + '_styles'] = true;

    const css = `
      .card__vote{
        display:inline-flex;align-items:center;gap:4px;
        padding:4px 8px;border-radius:4px;min-width:50px;
        justify-content:center;font-size:12px
      }
      .card__vote .source--name{
        display:inline-block;flex-shrink:0;
        height:18px;line-height:18px;width:48px;
        background-repeat:no-repeat;background-position:center;background-size:contain;
        opacity:.95
      }

      .rate--tmdb{
        background:#0D253F; /* тёмный фон как на скрине TMDB */
        color:#fff;
        box-shadow:0 0 0 1px rgba(255,255,255,.06),0 2px 6px rgba(0,0,0,.38);
      }
      .rate--kp{background:#ff5500;color:#fff}
      .rate--imdb{background:#f5c518;color:#000}

      .card__vote .rating-value{ text-shadow:0 1px 1px rgba(0,0,0,.7) }

      @media (min-width:481px){ .card__vote .source--name{ height:20px } }
    `;
    const st = document.createElement('style');
    st.id = 'rating-core-style';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------- Иконки брендов (URL) + Storage ----------
  const BRAND_ICONS_KEY = 'rating_brand_icon_urls_v1';

  function applyBrandIcons(urls) {
    try {
      const current = (Lampa.Storage.get(BRAND_ICONS_KEY, {}) || {});
      const saved = {
        tmdb: urls.tmdb ?? current.tmdb,
        kp:   urls.kp   ?? current.kp,
        imdb: urls.imdb ?? current.imdb
      };
      Lampa.Storage.set(BRAND_ICONS_KEY, saved);

      const old = document.getElementById('rating-brand-icons-style');
      if (old) old.remove();

      const parts = [];
      if (saved.tmdb) parts.push(`.rate--tmdb  .source--name{ background-image:url("${saved.tmdb}"); }`);
      if (saved.kp)   parts.push(`.rate--kp    .source--name{ background-image:url("${saved.kp}"); }`);
      if (saved.imdb) parts.push(`.rate--imdb  .source--name{ background-image:url("${saved.imdb}"); }`);

      const css = parts.join('\n');
      const st = document.createElement('style');
      st.id = 'rating-brand-icons-style';
      st.textContent = css;
      document.head.appendChild(st);

      document.querySelectorAll('.card .card__vote .source--name').forEach(badge=>{
        badge.style.transform = 'translateZ(0)';
        requestAnimationFrame(()=>{ badge.style.transform = ''; });
      });
    } catch (e) {
      console.log('[rating] applyBrandIcons error', e);
    }
  }

  (function restoreBrandIcons(){
    try{
      const saved = Lampa.Storage.get(BRAND_ICONS_KEY, {});
      if (saved && Object.keys(saved).length) applyBrandIcons(saved);
    }catch(e){}
  })();

  // ---------- Применение рейтинга к карточке ----------
  function displayCacheKey(item, source) { return `${item.id}:${source}`; }

  function applyRatingToCard($card, item, value, source) {
    if (!$card?.querySelector) return;
    const badge = $card.querySelector('.card__vote');
    if (!badge) return;

    badge.classList.remove('rate--tmdb','rate--kp','rate--imdb');
    badge.classList.add(`rate--${source}`);

    const safe = (value && value !== '0.0') ? value : '—';
    badge.innerHTML = `
      <span class="rating-value">${safe}</span>
      <span class="source--name" title="${source.toUpperCase()}"></span>
    `;

    $card.dataset.ratingValue = safe;
    $card.dataset.ratingSource = source;

    displayCacheWrite(displayCacheKey(item, source), { value: safe, ts: Date.now() });
  }

  // ---------- Быстрый локальный путь без сети ----------
  function tryApplyFromLocal($card, item, source) {
    const badge = $card.querySelector('.card__vote');
    if (!badge) return false;

    if ($card.dataset.ratingValue && $card.dataset.ratingSource === source) {
      applyRatingToCard($card, item, $card.dataset.ratingValue, source);
      return true;
    }

    const mem = memory.values.get(item.id);
    if (mem && mem[source]) {
      applyRatingToCard($card, item, mem[source], source);
      return true;
    }

    const disp = displayCacheRead()[displayCacheKey(item, source)];
    if (disp?.value) {
      applyRatingToCard($card, item, disp.value, source);
      return true;
    }

    if (source === 'kp' || source === 'imdb') {
      const rec = readKP(item.id);
      if (rec) {
        const v = source === 'kp' ? rec.kp : rec.imdb;
        if (v) {
          const val = String(parseFloat(v).toFixed(1));
          applyRatingToCard($card, item, val, source);
          return true;
        }
      }
    } else if (source === 'tmdb') {
      const val = getTmdbRating(item);
      if (val !== '0.0') {
        applyRatingToCard($card, item, val, source);
        return true;
      }
    }

    return false;
  }

  // ---------- Основная обработка карточки ----------
  async function processCardNode(node) {
    if (!node?.querySelector) return;
    memory.nodesProcessed.add(node);

    const data = node.card_data || node.data;
    if (!data?.id) return;

    ensureStyles();

    let source = getSource();
    if (!VALID_SOURCES.includes(source)) {
      source = 'tmdb';
      try { Lampa.Storage.set('rating_source', 'tmdb'); } catch(e){}
      if (Lampa?.Noty) Lampa.Noty.show('Рейтинг: TMDB');
    }

    const badge = node.querySelector('.card__vote');
    if (!badge) return;

    if (tryApplyFromLocal(node, data, source)) return;

    if (source === 'tmdb') {
      const v = getTmdbRating(data);
      applyRatingToCard(node, data, v, 'tmdb');
      return;
    }

    try {
      const val = await fetchKpOrImdb(data);
      applyRatingToCard(node, data, val, source);
    } catch (e) {
      log('fetch rating failed', e);
      applyRatingToCard(node, data, '0.0', source);
    }
  }

  // ---------- Подписки на события карточек и фолбэк ----------
  function hookCardEvents() {
    if (window[PLUGIN_NAME + '_hooked']) return;
    window[PLUGIN_NAME + '_hooked'] = true;

    if (Lampa?.Listener?.follow) {
      Lampa.Listener.follow('card', (ev) => {
        if (ev?.type === 'build' && ev?.data?.object) {
          setTimeout(() => processCardNode(ev.data.object), 0);
        }
      });
    }

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) {
            if (n.classList?.contains('card')) {
              processCardNode(n);
            } else {
              const cards = n.querySelectorAll?.('.card');
              if (cards?.length) cards.forEach((c) => processCardNode(c));
            }
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- Настройки (без LAMPA) ----------
  function addSettingsUI() {
    addSettingsSelect({
      name: 'rating_source',
      values: { tmdb: 'TMDB', kp: 'Кинопоиск', imdb: 'IMDB' },
      def: 'tmdb',
      title: 'Источник рейтинга на карточках',
      descr: 'Выберите, какой рейтинг отображать на карточках',
      onChange: (val) => {
        val = sanitizeSource(val);
        try { Lampa.Storage.set('rating_source', val); } catch (e) {}
        if (Lampa?.Noty) Lampa.Noty.show(`Рейтинг: ${String(val).toUpperCase()}`);

        document.querySelectorAll('.card').forEach((c) => {
          delete c.dataset.ratingValue;
          delete c.dataset.ratingSource;
          memory.nodesProcessed.delete(c);
          processCardNode(c);
        });
      }
    });
  }

  // ---------- Инициализация ----------
  function init() {
    if (window[PLUGIN_NAME + '_inited']) return;
    window[PLUGIN_NAME + '_inited'] = true;

    try {
      try {
        const cur = Lampa.Storage.get('rating_source', 'tmdb');
        if (!VALID_SOURCES.includes(cur)) Lampa.Storage.set('rating_source', 'tmdb');
      } catch(e){}

      addSettingsUI();
      hookCardEvents();

      setTimeout(() => {
        document.querySelectorAll('.card').forEach((c) => processCardNode(c));
      }, 300);
    } catch (e) {
      log('init error', e);
    }
  }

  // ---------- Вставляем официальные логотипы (TMDB/KP/IMDb) ----------
  function injectOfficialBrandIconsOnce() {
    if (window[PLUGIN_NAME + '_brands_applied']) return;
    window[PLUGIN_NAME + '_brands_applied'] = true;

    applyBrandIcons({
      tmdb: 'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg',
      kp:   'https://raw.githubusercontent.com/ARST113/star/refs/heads/main/kinopoisk-icon-main.svg',
      imdb: 'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg'
    });
  }

  // ---------- Старт плагина ----------
  if (window.appready) {
    injectOfficialBrandIconsOnce();
    init();
  } else if (Lampa?.Listener?.follow) {
    Lampa.Listener.follow('app', (e) => {
      if (e?.type === 'ready') {
        injectOfficialBrandIconsOnce();
        init();
      }
    });
  } else {
    setTimeout(() => {
      injectOfficialBrandIconsOnce();
      init();
    }, 1200);
  }
})();
