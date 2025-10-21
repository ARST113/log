(function () {
  'use strict';

  /** ============================
   *  RATING SHADOW BADGE v4
   *  — ключи + прокси + лимитер
   *  — логика нулей (zero series)
   *  — кэш 0 на 3 дня
   *  ============================ */

  const PLUGIN_NAME = 'rating_shadow_badge_v4';
  const DEF_DEBUG = true;

  // ======= Storage helpers =======
  const S = {
    get(name, def){ try { const v = Lampa.Storage.get(name, def); return v==null?def:v; } catch { return def; } },
    set(name, val){ try { Lampa.Storage.set(name, val); } catch {} },
    cache(name, max, empty){ try { return Lampa.Storage.cache(name, max, empty); } catch { return empty || {}; } },
  };

  let DEBUG = !!S.get('kp_debug', DEF_DEBUG);
  const log = (...a) => DEBUG && console.log('[rating]', ...a);

  // ======= URL helpers =======
  function makeRequest() {
    const Ctor = Lampa?.Request || Lampa?.Reguest;
    if (!Ctor) throw new Error('Neither Lampa.Request nor Lampa.Reguest found');
    return new Ctor();
  }
  const addQuery = (base, params) => {
    if (!params || !Object.keys(params).length) return base;
    const q = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
    return base.includes('?') ? `${base}&${q}` : `${base}?${q}`;
  };

  // ======= Keys / Proxies =======
  const API_KEYS = [
    '2a4a0808-81a3-40ae-b0d3-e11335ede616',
    '8c8e1a50-6322-4135-8875-5d40a5420d86',
    'b1b1fe23-b159-4d7b-b18d-2b8a56a24b30',
    '8daf7da0-f4dc-405a-a867-2d850344e1d9'
  ];

  function decodeSecret(arr){ return arr.map(n => String.fromCharCode(n ^ 37)).join(''); }
  const PROXY_SERVERS = {
    proxy2: 'https://cors.nb557.workers.dev:8443/',
    proxy3: 'https://cors557.deno.dev/',
    kp_proxy: 'https://cors.kp556.workers.dev:8443/',
    proxy_apn: 'https://byzkhkgr.deploy.cx/',
    proxy_reyohoho: 'https://reyohoho.ru/',
    proxy_secret: decodeSecret([80,68,77,68,64,3,27,31,85,72,94,20,89,81,12,1,6,26,83,95,64,81,81,23,85,64,68,23]),
  };
  const PROXY_CHAIN = ['proxy2','proxy3','kp_proxy','proxy_apn','proxy_reyohoho'];

  function buildProxiedUrl(proxyId, targetUrl){
    const base = PROXY_SERVERS[proxyId];
    if (!base) return targetUrl;
    if (base.includes('{url}')) return base.replace('{url}', encodeURIComponent(targetUrl));
    if (base.endsWith('/')) return base + targetUrl;
    return base + encodeURIComponent(targetUrl);
  }

  // ======= Config (user-tunable) =======
  const KP_CONFIG = {
    baseUrl: 'https://kinopoiskapiunofficial.tech/',
    timeout: 15000,
    maxRetries: 3,
    useProxy: S.get('kp_proxy_mode', 'auto'),  // 'auto' | 'on' | 'off'
    strategy:  S.get('kp_key_strategy','round-robin'), // 'round-robin'|'random'|'least-used'
    maxConcurrency: Math.max(1, Number(S.get('kp_max_concurrency', 3)) || 3),
  };

  // ======= Stats + Zero-series =======
  const STATS_KEY = 'kp_api_stats_v2';
  const ZERO_COUNT_LIMIT = 3;
  const ZERO_CACHE_TTL = 3 * 24 * 3600 * 1000;    // 3d
  const NONZERO_CACHE_TTL = 30 * 24 * 3600 * 1000; // 30d

  function loadStats(){
    try { return JSON.parse(Lampa.Storage.get(STATS_KEY, '{}')) || {}; } catch { return {}; }
  }
  function saveStats(stats){ try { Lampa.Storage.set(STATS_KEY, JSON.stringify(stats)); } catch {} }

  const API_STATS = (() => {
    const empty = {
      totalRequests: 0,
      keyUsage: {},
      errorsByKey: {},
      zeroCountByKey: {},
      lastUsedKey: null
    };
    API_KEYS.forEach(k => {
      empty.keyUsage[k] = 0;
      empty.errorsByKey[k] = 0;
      empty.zeroCountByKey[k] = 0;
    });
    return Object.assign(empty, loadStats());
  })();

  function bumpError(key){ if (!key) return; API_STATS.errorsByKey[key]=(API_STATS.errorsByKey[key]||0)+1; saveStats(API_STATS); }
  function bumpZero (key){ if (!key) return; API_STATS.zeroCountByKey[key]=(API_STATS.zeroCountByKey[key]||0)+1; saveStats(API_STATS); }
  function resetZero(key){ if (!key) return; API_STATS.zeroCountByKey[key]=0; saveStats(API_STATS); }

  // ======= Rotation + cooldowns =======
  const KEY_COOLDOWN_MS = 12 * 60 * 1000;
  let kpKeyState = {
    idx: Number(S.get('kp_key_idx', 0)) % API_KEYS.length,
    cooldowns: (() => { try { return JSON.parse(Lampa.Storage.get('kp_key_cooldowns', '{}')) || {}; } catch { return {}; } })()
  };
  const isOnCooldown = i => Date.now() < (kpKeyState.cooldowns[i] || 0);
  function markCooldownIndex(i, ms){ kpKeyState.cooldowns[i] = Date.now() + (ms || KEY_COOLDOWN_MS); S.set('kp_key_cooldowns', JSON.stringify(kpKeyState.cooldowns)); }
  function saveKeyIndex(i){ kpKeyState.idx = i; S.set('kp_key_idx', i); }

  function pickIndexByStrategy(strategy){
    const valid = API_KEYS.map((k,i)=>i).filter(i=>{
      if (isOnCooldown(i)) return false;
      const key = API_KEYS[i];
      return (API_STATS.zeroCountByKey[key]||0) < ZERO_COUNT_LIMIT;
    });

    if (!valid.length){
      // все «красные» — выбираем минимальный zeroCount среди не-кулдаун
      let best = null, minZ = Infinity;
      API_KEYS.forEach((k,i)=>{
        const z = API_STATS.zeroCountByKey[k]||0;
        if (!isOnCooldown(i) && z < minZ){ minZ = z; best = i; }
      });
      return best!=null ? best : kpKeyState.idx;
    }

    if (strategy === 'random'){
      return valid[Math.floor(Math.random()*valid.length)];
    }
    if (strategy === 'least-used'){
      let best = null, minU = Infinity;
      valid.forEach(i=>{
        const u = API_STATS.keyUsage[API_KEYS[i]]||0;
        if (u < minU){ minU=u; best=i; }
      });
      return best!=null ? best : valid[0];
    }
    // round-robin по valid
    for (let step=0; step<API_KEYS.length; step++){
      const i = (kpKeyState.idx + step) % API_KEYS.length;
      if (valid.includes(i)) return i;
    }
    return valid[0];
  }

  // ======= Concurrency limiter =======
  const kpLimiter = (() => {
    const Q = []; let inflight = 0; const MAX = KP_CONFIG.maxConcurrency;
    const pump = () => { if (inflight>=MAX || !Q.length) return; const fn=Q.shift(); inflight++; fn().finally(()=>{ inflight--; pump(); }); };
    return (job) => new Promise((resolve, reject)=>{
      const run = () => job().then(resolve, reject);
      Q.push(run); pump();
    });
  })();

  // ======= KP Client =======
  function createAdvancedApiClient(){
    const cfg = KP_CONFIG;

    function tryRequestWith(keyIndex, proxyIndex, url){
      return kpLimiter(() => new Promise((resolve, reject)=>{
        const key = API_KEYS[keyIndex];
        const via = proxyIndex < 0 ? 'direct' : PROXY_CHAIN[proxyIndex];
        const useProxyNow = cfg.useProxy === 'on' || (cfg.useProxy === 'auto' && proxyIndex >= 0);
        const proxiedUrl = useProxyNow ? buildProxiedUrl(PROXY_CHAIN[proxyIndex], url) : url;

        DEBUG && console.log('[rating] try', { key:key.slice(0,8), via, url:proxiedUrl });

        const req = makeRequest();
        req.clear();
        req.timeout(cfg.timeout);
        req.silent(proxiedUrl, function ok(json){
          // успех HTTP → usage++
          saveKeyIndex(keyIndex);
          API_STATS.totalRequests++;
          API_STATS.keyUsage[key] = (API_STATS.keyUsage[key]||0) + 1;
          API_STATS.lastUsedKey = key;
          // сброс серии нулей по факту успешного HTTP на этом ключе — мягкая эвристика
          // (главный сброс делаем по содержимому ответа в fetchKpOrImdb)
          saveStats(API_STATS);
          resolve(json);
        }, function fail(a, c){
          const status = (a && a.status) || (c && c.status) || (typeof a==='number'?a:0) || 0;
          bumpError(key);
          DEBUG && console.warn('[rating] fail', {key:key.slice(0,8), via, status});

          if (status === 429){
            // ключ лимитирован → кулдаун, перескок индекса, дальше пусть внешний цикл сменит ключ
            markCooldownIndex(keyIndex, KEY_COOLDOWN_MS);
            saveKeyIndex((keyIndex + 1) % API_KEYS.length);
            return reject({ type:'key', status });
          }
          if (status === 403){
            // 403: частый случай, когда помогает прокси
            return reject({ type:'network', status });
          }
          // сетевые/CORS/прочие → пробуем другой прокси
          reject({ type:'network', status });
        }, false, { headers: { 'X-API-KEY': key } });
      }));
    }

    async function request(pathOrFull, paramsObj){
      const full = pathOrFull.startsWith('http') ? addQuery(pathOrFull, paramsObj)
                   : addQuery(cfg.baseUrl + pathOrFull, paramsObj);

      const proxies = (cfg.useProxy === 'off') ? [null]
                    : (cfg.useProxy === 'on') ? [0,1,2,3,4]
                    : [null,0,1,2,3,4];

      const start = pickIndexByStrategy(cfg.strategy);
      const loops = API_KEYS.length * cfg.maxRetries;

      for (let kTry=0, i=start; kTry<loops; kTry++){
        const keyIndex = (i + kTry) % API_KEYS.length;
        if (isOnCooldown(keyIndex)) continue;

        for (let p=0; p<proxies.length; p++){
          const proxyIndex = proxies[p]==null ? -1 : proxies[p];

          try {
            const json = await tryRequestWith(keyIndex, proxyIndex, full);
            return json;
          } catch (err) {
            if (err.type === 'key') break; // сменим ключ
            // иначе — просто идём к следующему прокси
          }
        }
      }
      throw new Error('All keys/proxies failed');
    }

    return {
      request,
      getStats(){ return JSON.parse(JSON.stringify(API_STATS)); }
    };
  }

  const kpClient = createAdvancedApiClient();
  window.__kpStats = () => kpClient.getStats();

  // ======= Cache / display =======
  const CACHE_KP       = 'kp_rating_v2';
  const CACHE_DISPLAY  = 'rating_display_cache';
  const displayRead  = () => S.cache(CACHE_DISPLAY, 1000, {});
  const displayWrite = (k, payload)=>{ const c=S.cache(CACHE_DISPLAY,1000,{}); c[k]=payload; S.set(CACHE_DISPLAY,c); };

  function kpRead(id){
    const c = S.cache(CACHE_KP, 1000, {});
    const rec = c[id];
    if (!rec || !rec.timestamp) return null;
    const bothZero = Number(rec.kp)===0 && Number(rec.imdb)===0;
    const ttl = bothZero ? ZERO_CACHE_TTL : NONZERO_CACHE_TTL;
    if (Date.now() - rec.timestamp > ttl) return null;
    return rec;
  }
  function kpWrite(id, data){
    const c = S.cache(CACHE_KP, 1000, {});
    c[id] = { ...data, timestamp: Date.now() };
    S.set(CACHE_KP, c);
  }

  // ======= Source & helpers =======
  const VALID_SOURCES = ['tmdb','kp','imdb'];
  const getSource = ()=>{ const v=S.get('rating_source','tmdb'); return VALID_SOURCES.includes(v)?v:'tmdb'; };

  const cleanTitle = s => (s||'').replace(/[\s.,:;’'`!?]+/g,' ').trim();
  const prepareSearchTitle = q => cleanTitle(q)
    .replace(/^[ \/\\]+/,'').replace(/[ \/\\]+$/,'')
    .replace(/\+( *[+\/\\])+/g,'+').replace(/([+\/\\] *)+\+/g,'+')
    .replace(/( *[\/\\]+ *)+/g,'+');

  function getTmdbRating(card){
    if (card?.vote_average > 0) return String(parseFloat(card.vote_average).toFixed(1));
    if (card?.rating > 0)       return String(parseFloat(card.rating).toFixed(1));
    if (card?.vote_count > 0)   return '5.0';
    if (card?.popularity && card.popularity > 10) return '6.0';
    const y  = (card?.release_date || '').slice(0,4), cy = new Date().getFullYear();
    if (y && cy - Number(y) <= 2) return '5.5';
    return '0.0';
  }

  // ======= Fetch KP/IMDb with zero-logic =======
  function fetchKpOrImdb(item){
    return new Promise(resolve=>{
      const cached = kpRead(item.id);
      if (cached){
        const src = getSource();
        const v = src==='kp' ? cached.kp : cached.imdb;
        // корректируем lastUsedKey серию
        const last = API_STATS.lastUsedKey;
        if (v===0 || v==='0' || v==='0.0') bumpZero(last);
        else resetZero(last);
        return resolve(v ? String(parseFloat(v).toFixed(1)) : '0.0');
      }

      const searchTitle = (item.title || item.name || '').trim();
      const release = (item.release_date || item.first_air_date || item.first_release_date || '0000') + '';
      const year = parseInt(release.substring(0,4)||'0',10);
      const orig = (item.original_title || item.original_name || '').toLowerCase();

      function choose(results){
        if (!results || !results.length){
          kpWrite(item.id, { kp:0, imdb:0 });
          bumpZero(API_KEYS[kpKeyState.idx]);
          return resolve('0.0');
        }
        results.forEach(r => {
          const y = r.start_date || r.year || '0000';
          r._year = parseInt(String(y).substring(0,4),10);
        });
        let cards = results;

        if (orig){
          const t = cards.filter(r=>{
            const a=(r.nameOriginal||r.nameEn||r.en_title||'').toLowerCase();
            const b=(r.nameRu||r.ru_title||r.name||'').toLowerCase();
            return a.includes(orig) || b.includes(orig);
          });
          if (t.length) cards = t;
        }
        if (cards.length>1 && year){
          let y1 = cards.filter(r=>r._year===year);
          if (!y1.length) y1 = cards.filter(r=>r._year && r._year>year-2 && r._year<year+2);
          if (y1.length) cards = y1;
        }

        const pick = cards[0];
        const filmId = pick.filmId || pick.kinopoisk_id || pick.kinopoiskId || pick.id;
        if (!filmId){
          kpWrite(item.id, { kp:0, imdb:0 });
          bumpZero(API_KEYS[kpKeyState.idx]);
          return resolve('0.0');
        }

        kpClient.request('api/v2.2/films/'+filmId).then(data=>{
          const kp   = Number(data?.ratingKinopoisk) || 0;
          const imdb = Number(data?.ratingImdb) || 0;
          kpWrite(item.id, { kp, imdb });

          if (kp===0 && imdb===0) bumpZero(API_KEYS[kpKeyState.idx]);
          else resetZero(API_KEYS[kpKeyState.idx]);

          const src = getSource();
          const val = src==='kp' ? kp : imdb;
          resolve(val ? String(parseFloat(val).toFixed(1)) : '0.0');
        }).catch(()=>{
          kpWrite(item.id, { kp:0, imdb:0 });
          bumpZero(API_KEYS[kpKeyState.idx]);
          resolve('0.0');
        });
      }

      if (item.imdb_id){
        kpClient.request('api/v2.2/films', { imdbId: item.imdb_id }).then(json=>{
          choose(json?.items || json?.films || []);
        }).catch(()=>{
          kpClient.request('api/v2.1/films/search-by-keyword', { keyword: prepareSearchTitle(searchTitle) })
            .then(json=>choose(json?.items || json?.films || []))
            .catch(()=>resolve('0.0'));
        });
      } else {
        kpClient.request('api/v2.1/films/search-by-keyword', { keyword: prepareSearchTitle(searchTitle) })
          .then(json=>choose(json?.items || json?.films || []))
          .catch(()=>resolve('0.0'));
      }
    });
  }

  // ======= Shadow badge =======
  const BRAND_ICONS_KEY='rating_brand_icon_urls_v1';
  const DEFAULT_BRANDS={
    tmdb:'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg',
    kp:'https://raw.githubusercontent.com/ARST113/star/refs/heads/main/kinopoisk-icon-main.svg',
    imdb:'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg'
  };
  let BRAND=DEFAULT_BRANDS; try{ BRAND={...DEFAULT_BRANDS, ...(S.get(BRAND_ICONS_KEY,{})||{})}; }catch{}

  function posterContainer(card){
    return card.querySelector('.card__view, .card__image, .card__img, .poster, .image, .thumb') || card;
  }
  function ensureHost(card){
    const container = posterContainer(card);
    if (!container || !container.appendChild) return null;
    try{ const cs = getComputedStyle(container); if (cs.position === 'static') container.style.position = 'relative'; }catch{}
    let host = container.querySelector(':scope > .lp-rate-badge-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'lp-rate-badge-host';
      host.style.position='absolute';
      host.style.right='8px';
      host.style.bottom='8px';
      host.style.zIndex='50';
      host.style.pointerEvents='none';
      container.appendChild(host);
    }
    if (!host.shadowRoot) host.attachShadow({ mode:'open' });
    return host;
  }
  function renderBadge(card, value, source){
    const host = ensureHost(card);
    if (!host) return;
    const safe = (value && value !== '0.0') ? value : '—';
    const icon = BRAND[source] || '';
    host.shadowRoot.innerHTML = `
      <style>
        .badge{ box-sizing:border-box; display:inline-flex; align-items:center; gap:6px;
          padding:4px 8px; border-radius:8px; min-width:50px; justify-content:center;
          font: 600 12px/1.1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;
          color:#fff; text-shadow:0 1px 1px rgba(0,0,0,.7); pointer-events:none; }
        .badge.rate--tmdb{ background:#0D253F; box-shadow:0 0 0 1px rgba(255,255,255,.06),0 2px 6px rgba(0,0,0,.38); }
        .badge.rate--kp{ background:#ff5500; }
        .badge.rate--imdb{ background:#f5c518; color:#000; text-shadow:none; }
        .value{ font-weight:700 }
        .logo{ display:inline-block; width:48px; height:20px; background-position:center; background-repeat:no-repeat; background-size:contain; }
        @media (max-width:480px){ .logo{ height:18px; } }
      </style>
      <div class="badge rate--${source}">
        <span class="value">${safe}</span>
        <span class="logo" style="${icon ? `background-image:url('${icon}')` : ''}" title="${source.toUpperCase()}"></span>
      </div>
    `;
  }

  function displayKey(item, source){ return `${item.id}:${source}`; }
  function applyRating(card, item, value, source){
    renderBadge(card, value, source);
    displayWrite(displayKey(item, source), { value: value || '0.0', ts: Date.now() });
  }

  function setHideNative(enabled){
    let st = document.getElementById('rating-hide-native-style');
    if (enabled && !st){
      st = document.createElement('style');
      st.id = 'rating-hide-native-style';
      st.textContent = `
        .card .card__view .card__vote,
        .card .card__image .card__vote,
        .card .card__img .card__vote{ display:none !important; }
      `;
      document.head.appendChild(st);
    } else if (!enabled && st){ st.remove(); }
  }

  function quickLocal(card, item, source){
    const d = displayRead()[displayKey(item, source)];
    if (d?.value){ applyRating(card, item, d.value, source); return true; }
    const rec = (source==='kp'||source==='imdb') ? kpRead(item.id) : null;
    if (rec){
      const v = source==='kp' ? rec.kp : rec.imdb;
      if (v){ applyRating(card, item, String(parseFloat(v).toFixed(1)), source); return true; }
    }
    if (source==='tmdb'){
      const v = getTmdbRating(item);
      if (v!=='0.0'){ applyRating(card, item, v, source); return true; }
    }
    return false;
  }

  async function processCard(node){
    if (!node?.querySelector) return;
    const data = node.card_data || node.data;
    if (!data?.id) return;

    const source = getSource();
    if (quickLocal(node, data, source)) return;

    if (source==='tmdb'){
      applyRating(node, data, getTmdbRating(data), 'tmdb');
      return;
    }
    try{
      const val = await fetchKpOrImdb(data);
      applyRating(node, data, val, source);
    }catch(e){
      log('fetch fail', e);
      applyRating(node, data, '0.0', source);
    }
  }

  function hookCards(){
    if (window[PLUGIN_NAME + '_hooked']) return;
    window[PLUGIN_NAME + '_hooked'] = true;

    if (Lampa?.Listener?.follow){
      Lampa.Listener.follow('card', (ev)=>{
        if (ev?.type==='build' && ev?.data?.object) setTimeout(()=>processCard(ev.data.object),0);
      });
    }
    const mo = new MutationObserver(muts=>{
      for (const m of muts){
        for (const n of m.addedNodes){
          if (n.nodeType!==1) continue;
          if (n.classList?.contains('card')) processCard(n);
          else n.querySelectorAll?.('.card')?.forEach(c=>processCard(c));
        }
      }
    });
    mo.observe(document.body,{childList:true,subtree:true});
  }

  // ======= Settings =======
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
    }
  }
  function addSettingsBool({ name, def=false, title, descr, onChange }) {
    if (Lampa?.SettingsApi?.addParam) {
      Lampa.SettingsApi.addParam({
        component: 'interface',
        param: { name, type: 'switch', default: def },
        field: { name: title, description: descr },
        onChange
      });
      return;
    }
    if (Lampa?.Settings?.listener?.add) {
      Lampa.Settings.listener.add({
        component: 'main',
        param: { name, type: 'switch', default: def },
        field: { name: title, description: descr },
        onChange
      });
    }
  }
  function addSettingsNumber({ name, def=3, title, descr, onChange }) {
    const values = {1:'1',2:'2',3:'3',4:'4',5:'5',6:'6'};
    addSettingsSelect({ name, values, def:String(def), title, descr, onChange:(v)=>onChange(Number(v)) });
  }

  function addSettingsUI(){
    addSettingsSelect({
      name:'rating_source',
      values:{ tmdb:'TMDB', kp:'Кинопоиск', imdb:'IMDB' },
      def:S.get('rating_source','tmdb'),
      title:'Источник рейтинга на карточках',
      descr:'TMDB / Кинопоиск / IMDb',
      onChange:(v)=>{
        S.set('rating_source', v);
        Lampa?.Noty?.show('Рейтинг: ' + String(v).toUpperCase());
        document.querySelectorAll('.card').forEach(c=>processCard(c));
      }
    });
    addSettingsBool({
      name:'hide_native_vote',
      def:!!S.get('hide_native_vote', true),
      title:'Скрывать стандартный бейдж в постере',
      descr:'Чтобы не было дубля (наш и штатный).',
      onChange:(val)=>{ S.set('hide_native_vote', val); setHideNative(val); }
    });
    setHideNative(!!S.get('hide_native_vote', true));

    addSettingsSelect({
      name:'kp_key_strategy',
      values:{ 'round-robin':'Round-robin','least-used':'Least-used','random':'Random' },
      def:S.get('kp_key_strategy','round-robin'),
      title:'Стратегия ротации ключей KP',
      descr:'Как выбирать следующий API-ключ',
      onChange:(v)=>{ S.set('kp_key_strategy', v); KP_CONFIG.strategy = v; Lampa?.Noty?.show('Стратегия ключей: ' + v); }
    });

    addSettingsSelect({
      name:'kp_proxy_mode',
      values:{ 'auto':'Авто','on':'Всегда через прокси','off':'Без прокси' },
      def:S.get('kp_proxy_mode','auto'),
      title:'Режим прокси для KP',
      descr:'Авто — сначала прямой, затем цепочка прокси',
      onChange:(v)=>{ S.set('kp_proxy_mode', v); KP_CONFIG.useProxy = v; Lampa?.Noty?.show('Прокси: ' + v); }
    });

    addSettingsBool({
      name:'kp_debug',
      def:!!S.get('kp_debug', DEF_DEBUG),
      title:'DEBUG логи',
      descr:'Подробные логи выбора ключей/прокси',
      onChange:(val)=>{ S.set('kp_debug', !!val); DEBUG = !!val; Lampa?.Noty?.show('DEBUG: ' + (val?'ON':'OFF')); }
    });

    addSettingsNumber({
      name:'kp_max_concurrency',
      def:KP_CONFIG.maxConcurrency,
      title:'Одновременных запросов к KP',
      descr:'Лимитер параллелизма [1..6]',
      onChange:(num)=>{ const n = Math.max(1, Math.min(6, Number(num)||3)); S.set('kp_max_concurrency', n); Lampa?.Noty?.show('Конкурентность KP: '+n); location.reload(); }
    });
  }

  // ======= Init =======
  function init(){
    if (window[PLUGIN_NAME + '_inited']) return;
    window[PLUGIN_NAME + '_inited'] = true;

    try{
      const cur=S.get('rating_source','tmdb');
      if(!VALID_SOURCES.includes(cur)) S.set('rating_source','tmdb');
    }catch{}

    addSettingsUI();
    hookCards();

    setTimeout(()=>document.querySelectorAll('.card').forEach(c=>processCard(c)),300);
  }

  if (window.appready) init();
  else if (Lampa?.Listener?.follow) Lampa.Listener.follow('app',(e)=>{ if(e?.type==='ready') init(); });
  else setTimeout(init, 1000);
})();
