(function () {
  'use strict';

  const PLUGIN_NAME = 'rating_shadow_badge_v3_proxy';
  const DEBUG = true;
  const log = (...a) => DEBUG && console.log('[rating]', ...a);

  // =============== Compat: Request / Reguest ==================
  function makeRequest() {
    const Ctor = Lampa?.Request || Lampa?.Reguest;
    if (!Ctor) throw new Error('Neither Lampa.Request nor Lampa.Reguest found');
    return new Ctor();
  }

  // =============== URL helpers ==================
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
  const toQuery = (obj={}) =>
    Object.keys(obj).map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`).join('&');

  // =============== 🔐 Ключи и прокси ===============
  // 1) API ключи
  const API_KEYS = [
    '2a4a0808-81a3-40ae-b0d3-e11335ede616',
    '8c8e1a50-6322-4135-8875-5d40a5420d86',
    'b1b1fe23-b159-4d7b-b18d-2b8a56a24b30',
    '8daf7da0-f4dc-405a-a867-2d850344e1d9'
  ];

  // 2) Прокси
  function decodeSecret(arr){ // простая расшифровка; если не нужна — игнорим
    return arr.map(n => String.fromCharCode(n ^ 37)).join('');
  }
  const PROXY_SERVERS = {
    proxy2: 'https://cors.nb557.workers.dev:8443/',
    proxy3: 'https://cors557.deno.dev/',
    proxy_reyohoho: 'https://reyohoho.ru/',
    proxy_apn: 'https://byzkhkgr.deploy.cx/',
    proxy_secret: decodeSecret([80,68,77,68,64,3,27,31,85,72,94,20,89,81,12,1,6,26,83,95,64,81,81,23,85,64,68,23]),
    kp_proxy: 'https://cors.kp556.workers.dev:8443/'
  };
  // порядок фолбэков
  const PROXY_CHAIN = ['proxy2','proxy3','kp_proxy','proxy_apn','proxy_reyohoho'];

  // Определяем как проксировать URL:
  // - "{url}" в шаблоне -> подставляем encodeURIComponent(url)
  // - иначе если заканчивается на "/" -> просто конкатенируем proxy + url
  // - иначе -> proxy + encodeURIComponent(url)
  function buildProxiedUrl(proxyId, targetUrl){
    const base = PROXY_SERVERS[proxyId];
    if (!base) return targetUrl;
    if (base.includes('{url}')) return base.replace('{url}', encodeURIComponent(targetUrl));
    if (base.endsWith('/')) return base + targetUrl;
    return base + encodeURIComponent(targetUrl);
  }

  // =============== ⚙️ Конфиг KP API + стратегии ===============
  const KP_CONFIG = {
    baseUrl: 'https://kinopoiskapiunofficial.tech/',
    timeout: 15000,
    maxRetries: 3,
    useProxy: 'auto', // 'auto' | 'off' | 'on'
    strategy: 'round-robin' // 'round-robin' | 'random' | 'least-used'
  };

  const ROTATION_STRATEGIES = {
    'round-robin': 'Последовательная ротация по кругу',
    'least-used': 'Выбор наименее использованного ключа',
    'random': 'Случайный выбор ключа'
  };

  // =============== 📊 Статистика по ключам ===============
  const STATS_KEY = 'kp_api_stats_v1';
  function loadStats(){
    try { return JSON.parse(Lampa.Storage.get(STATS_KEY, '{}')) || {}; } catch { return {}; }
  }
  function saveStats(stats){ try { Lampa.Storage.set(STATS_KEY, JSON.stringify(stats)); } catch {} }

  const API_STATS = (()=>{
    const empty = {
      totalRequests: 0,
      keyUsage: {},
      errorsByKey: {},
      lastUsedKey: null
    };
    API_KEYS.forEach(k=>{
      empty.keyUsage[k] = 0;
      empty.errorsByKey[k] = 0;
    });
    return Object.assign(empty, loadStats());
  })();

  function bumpUsage(key){
    API_STATS.totalRequests++;
    if (API_STATS.keyUsage[key] == null) API_STATS.keyUsage[key] = 0;
    API_STATS.keyUsage[key]++;
    API_STATS.lastUsedKey = key;
    saveStats(API_STATS);
  }
  function bumpError(key){
    if (API_STATS.errorsByKey[key] == null) API_STATS.errorsByKey[key] = 0;
    API_STATS.errorsByKey[key]++;
    saveStats(API_STATS);
  }

  // =============== ⛓️‍💥 Ротация ключей + кулдауны ===============
  const KEY_COOLDOWN_MS = 12 * 60 * 1000;
  let kpKeyState = {
    idx: Number(Lampa.Storage.get('kp_key_idx', 0)) % API_KEYS.length,
    cooldowns: (() => { try { return JSON.parse(Lampa.Storage.get('kp_key_cooldowns', '{}')) || {}; } catch { return {}; } })()
  };
  const isOnCooldown = i => Date.now() < (kpKeyState.cooldowns[i] || 0);
  function markCooldownIndex(i, ms){ kpKeyState.cooldowns[i] = Date.now() + (ms || KEY_COOLDOWN_MS); try{ Lampa.Storage.set('kp_key_cooldowns', JSON.stringify(kpKeyState.cooldowns)); }catch{} }
  function saveKeyIndex(i){ kpKeyState.idx = i; try{ Lampa.Storage.set('kp_key_idx', i);}catch{} }

  function pickIndexByStrategy(strategy){
    if (strategy === 'random') {
      const candidates = API_KEYS.map((_,i)=>i).filter(i=>!isOnCooldown(i));
      return candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : kpKeyState.idx;
    }
    if (strategy === 'least-used') {
      let best = null, bestVal = Infinity;
      API_KEYS.forEach((k,i)=>{
        if (isOnCooldown(i)) return;
        const u = API_STATS.keyUsage[k] ?? 0;
        if (u < bestVal) { bestVal = u; best = i; }
      });
      return best != null ? best : kpKeyState.idx;
    }
    // round-robin
    for (let step=0; step<API_KEYS.length; step++){
      const i = (kpKeyState.idx + step) % API_KEYS.length;
      if (!isOnCooldown(i)) return i;
    }
    return kpKeyState.idx;
  }

  // =============== 🧠 Клиент KP с прокси и ротацией ===============
  function createAdvancedApiClient(name, options={}){
    const cfg = Object.assign({}, KP_CONFIG, options);

    function tryRequestWith(keyIndex, proxyIndex, url){
      return new Promise((resolve, reject)=>{
        const key = API_KEYS[keyIndex];
        const useProxyNow = cfg.useProxy === 'on' || (cfg.useProxy === 'auto' && proxyIndex >= 0);
        const proxiedUrl = useProxyNow
          ? buildProxiedUrl(PROXY_CHAIN[proxyIndex], url)
          : url;

        const req = makeRequest();
        req.clear();
        req.timeout(cfg.timeout);
        req.silent(proxiedUrl, function ok(json){
          saveKeyIndex(keyIndex);
          bumpUsage(key);
          resolve(json);
        }, function fail(a, c){
          const status = (a && a.status) || (c && c.status) || (typeof a==='number'?a:0) || 0;
          // 429/403 — проблема ключа -> кулдаун и пробуем другой ключ
          if (status === 429 || status === 403) {
            markCooldownIndex(keyIndex, KEY_COOLDOWN_MS);
            bumpError(key);
            reject({ type:'key', status });
          } else {
            // сеть/CORS -> попробуем другой прокси
            bumpError(key);
            reject({ type:'network', status });
          }
        }, false, { headers: { 'X-API-KEY': key } });
      });
    }

    async function request(pathOrFull, paramsObj){
      // собрать URL
      const url = pathOrFull.startsWith('http')
        ? (paramsObj ? addParam(pathOrFull, toQuery(paramsObj)) : pathOrFull)
        : (cfg.baseUrl + pathOrFull + (paramsObj ? ('?' + toQuery(paramsObj)) : ''));

      // периметр перебора = ключи × (прокси + прямой)
      const maxKeyLoops = API_KEYS.length * cfg.maxRetries;
      let keyPick = pickIndexByStrategy(cfg.strategy);

      // 1) без прокси → 2) цепочка прокси
      const proxies = (cfg.useProxy === 'off') ? [null] :
        (cfg.useProxy === 'on') ? [0,1,2,3,4] : [null,0,1,2,3,4];

      for (let kTry=0, i=keyPick; kTry<maxKeyLoops; kTry++){
        const keyIndex = (i + kTry) % API_KEYS.length;
        if (isOnCooldown(keyIndex)) continue;

        for (let p=0; p<proxies.length; p++){
          const proxyIndex = proxies[p] == null ? -1 : proxies[p];

          try {
            const json = await tryRequestWith(keyIndex, proxyIndex, url);
            return json;
          } catch (err) {
            // если «ключ» — крутим ключ; если «сеть» — пробуем след. прокси
            if (err.type === 'key') break; // уйдём на новый ключ
            // иначе просто next proxy в цикле
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

  // Создаём клиент KP (можно регулировать стратегию/таймаут/прокси)
  const kpClient = createAdvancedApiClient('kinopoisk', {
    strategy: 'round-robin', // 'round-robin' | 'random' | 'least-used'
    timeout: 15000,
    useProxy: 'auto' // 'auto' (пробуем без, затем прокси) | 'on' (всегда через прокси) | 'off'
  });
  // для отладки из консоли:
  window.__kpStats = () => kpClient.getStats();

  // =============== Остальной функционал плагина (бейдж в Shadow) ===============
  // Cache
  const CACHE_KP = 'kp_rating';
  const CACHE_DISPLAY = 'rating_display_cache';
  const storageCacheGet = (name, max, empty) => { try { return Lampa.Storage.cache(name, max, empty); } catch { return empty || {}; } };
  const displayCacheRead = () => storageCacheGet(CACHE_DISPLAY, 1000, {});
  const displayCacheWrite = (k, payload)=>{ const c=storageCacheGet(CACHE_DISPLAY,1000,{}); c[k]=payload; Lampa.Storage.set(CACHE_DISPLAY,c); };
  function readKP(id){ const c=storageCacheGet(CACHE_KP,1000,{}), rec=c[id]; if(!rec) return null; const month=30*24*3600*1000; return (!rec.timestamp||Date.now()-rec.timestamp>month)?null:rec; }
  function writeKP(id,data){ const c=storageCacheGet(CACHE_KP,1000,{}); c[id]={...data,timestamp:Date.now()}; Lampa.Storage.set(CACHE_KP,c); }

  // Источник
  const VALID_SOURCES = ['tmdb','kp','imdb'];
  const getSource = ()=> { try{ const v=Lampa.Storage.get('rating_source','tmdb'); return VALID_SOURCES.includes(v)?v:'tmdb'; }catch{ return 'tmdb'; } };

  // TMDB быстрый
  function getTmdbRating(card){
    if (card?.vote_average > 0) return String(parseFloat(card.vote_average).toFixed(1));
    if (card?.rating > 0) return String(parseFloat(card.rating).toFixed(1));
    if (card?.vote_count > 0) return '5.0';
    if (card?.popularity && card.popularity > 10) return '6.0';
    const y = (card?.release_date || '').slice(0,4), cy = new Date().getFullYear();
    if (y && cy - Number(y) <= 2) return '5.5';
    return '0.0';
  }

  // Поиск/детали KP/IMDb через наш клиент
  const cleanTitle = s => (s||'').replace(/[\s.,:;’'`!?]+/g,' ').trim();
  const prepareSearchTitle = q => cleanTitle(q).replace(/^[ \/\\]+/,'').replace(/[ \/\\]+$/,'').replace(/\+( *[+\/\\])+/g,'+').replace(/([+\/\\] *)+\+/g,'+').replace(/( *[\/\\]+ *)+/g,'+');

  function fetchKpOrImdb(item){
    return new Promise(resolve=>{
      const cached = readKP(item.id);
      if (cached) {
        const src=getSource(); const v = src==='kp'?cached.kp:cached.imdb;
        return resolve(v?String(parseFloat(v).toFixed(1)):'0.0');
      }

      const searchTitle = (item.title||item.name||'').trim();
      const release = (item.release_date||item.first_air_date||item.first_release_date||'0000')+'';
      const year = parseInt(release.substring(0,4)||'0',10);
      const orig = (item.original_title||item.original_name||'').toLowerCase();

      function choose(results){
        if(!results||!results.length){ writeKP(item.id,{kp:0,imdb:0}); return resolve('0.0'); }
        results.forEach(r=>{ const y=r.start_date||r.year||'0000'; r.tmp_year=parseInt(String(y).substring(0,4),10); });
        let cards=results;

        if(orig){
          const t=cards.filter(r=>{
            const a=(r.nameOriginal||r.nameEn||r.en_title||'').toLowerCase();
            const b=(r.nameRu||r.ru_title||r.name||'').toLowerCase();
            return a.includes(orig)||b.includes(orig);
          });
          if(t.length) cards=t;
        }
        if(cards.length>1&&year){
          let y1=cards.filter(r=>r.tmp_year===year);
          if(!y1.length) y1=cards.filter(r=>r.tmp_year&&r.tmp_year>year-2&&r.tmp_year<year+2);
          if(y1.length) cards=y1;
        }

        const pick=cards[0];
        const filmId=pick.filmId||pick.kinopoisk_id||pick.kinopoiskId||pick.id;
        if(!filmId){ writeKP(item.id,{kp:0,imdb:0}); return resolve('0.0'); }

        kpClient.request('api/v2.2/films/'+filmId).then(data=>{
          const kp=data?.ratingKinopoisk||0, imdb=data?.ratingImdb||0;
          writeKP(item.id,{kp,imdb});
          const src=getSource(); const val = src==='kp'?kp:imdb;
          resolve(val?String(parseFloat(val).toFixed(1)):'0.0');
        }).catch(()=>{ writeKP(item.id,{kp:0,imdb:0}); resolve('0.0'); });
      }

      if(item.imdb_id){
        kpClient.request('api/v2.2/films', { imdbId: item.imdb_id }).then(json=>{
          choose(json?.items||json?.films||[]);
        }).catch(()=>{
          kpClient.request('api/v2.1/films/search-by-keyword', { keyword: prepareSearchTitle(searchTitle) })
            .then(json=>choose(json?.items||json?.films||[]))
            .catch(()=>resolve('0.0'));
        });
      } else {
        kpClient.request('api/v2.1/films/search-by-keyword', { keyword: prepareSearchTitle(searchTitle) })
          .then(json=>choose(json?.items||json?.films||[]))
          .catch(()=>resolve('0.0'));
      }
    });
  }

  // =============== Shadow-DOM бейдж на постере ===============
  const BRAND_ICONS_KEY='rating_brand_icon_urls_v1';
  const DEFAULT_BRANDS={
    tmdb:'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg',
    kp:'https://raw.githubusercontent.com/ARST113/star/refs/heads/main/kinopoisk-icon-main.svg',
    imdb:'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg'
  };
  let BRAND=DEFAULT_BRANDS; try{ BRAND={...DEFAULT_BRANDS, ...(Lampa.Storage.get(BRAND_ICONS_KEY,{})||{})}; }catch{}

  function findPosterContainer(card){
    return card.querySelector('.card__view, .card__image, .card__img, .poster, .image, .thumb') || card;
  }
  function ensureBadgeHost(card){
    const container = findPosterContainer(card);
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
    if (!host.shadowRoot) host.attachShadow({ mode: 'open' });
    return host;
  }

  function renderBadge(card, value, source){
    const host = ensureBadgeHost(card);
    if (!host) return;
    const safe = (value && value !== '0.0') ? value : '—';
    const icon = BRAND[source] || '';
    host.shadowRoot.innerHTML = `
      <style>
        .badge{
          box-sizing:border-box;
          display:inline-flex; align-items:center; gap:6px;
          padding:4px 8px; border-radius:8px; min-width:50px;
          justify-content:center; font: 600 12px/1.1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;
          color:#fff; text-shadow:0 1px 1px rgba(0,0,0,.7); pointer-events:none;
        }
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

  function displayCacheKey(item, source){ return `${item.id}:${source}`; }
  function applyRatingToCard($card, item, value, source){
    renderBadge($card, value, source);
    displayCacheWrite(displayCacheKey(item, source), { value: value || '0.0', ts: Date.now() });
  }

  // скрывать нативный кружок в постере
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
    } else if (!enabled && st){
      st.remove();
    }
  }

  // быстрый локальный рендер
  function tryApplyFromLocal($card, item, source){
    const disp = displayCacheRead()[displayCacheKey(item, source)];
    if (disp?.value){ applyRatingToCard($card, item, disp.value, source); return true; }
    const rec = (source==='kp'||source==='imdb') ? readKP(item.id) : null;
    if (rec){
      const v = source==='kp' ? rec.kp : rec.imdb;
      if (v){ applyRatingToCard($card, item, String(parseFloat(v).toFixed(1)), source); return true; }
    }
    if (source==='tmdb'){
      const v = getTmdbRating(item);
      if (v!=='0.0'){ applyRatingToCard($card, item, v, source); return true; }
    }
    return false;
  }

  // обработка карточки
  async function processCardNode(node){
    if (!node?.querySelector) return;
    const data = node.card_data || node.data;
    if (!data?.id) return;

    const source = getSource();

    if (tryApplyFromLocal(node, data, source)) return;

    if (source==='tmdb'){
      applyRatingToCard(node, data, getTmdbRating(data), 'tmdb');
      return;
    }
    try{
      const val = await fetchKpOrImdb(data);
      applyRatingToCard(node, data, val, source);
    }catch(e){
      log('fetch rating failed', e);
      applyRatingToCard(node, data, '0.0', source);
    }
  }

  // наблюдатели
  function hookCardEvents(){
    if (window[PLUGIN_NAME + '_hooked']) return;
    window[PLUGIN_NAME + '_hooked'] = true;

    if (Lampa?.Listener?.follow) {
      Lampa.Listener.follow('card', (ev)=>{
        if (ev?.type==='build' && ev?.data?.object) setTimeout(()=>processCardNode(ev.data.object),0);
      });
    }
    const mo = new MutationObserver(muts=>{
      for (const m of muts){
        for (const n of m.addedNodes){
          if (n.nodeType!==1) continue;
          if (n.classList?.contains('card')) processCardNode(n);
          else n.querySelectorAll?.('.card')?.forEach(c=>processCardNode(c));
        }
      }
    });
    mo.observe(document.body,{childList:true,subtree:true});
  }

  // Настройки
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

  function addSettingsUI(){
    addSettingsSelect({
      name:'rating_source',
      values:{ tmdb:'TMDB', kp:'Кинопоиск', imdb:'IMDB' },
      def:'tmdb',
      title:'Источник рейтинга на карточках',
      descr:'TMDB / Кинопоиск / IMDb',
      onChange:(v)=>{
        try{ Lampa.Storage.set('rating_source', v);}catch{}
        if (Lampa?.Noty) Lampa.Noty.show('Рейтинг: ' + String(v).toUpperCase());
        document.querySelectorAll('.card').forEach(c=>processCardNode(c));
      }
    });
    addSettingsBool({
      name:'hide_native_vote',
      def:true,
      title:'Скрывать стандартный бейдж в постере',
      descr:'Избегает дубля (наш бейдж и штатный).',
      onChange:(val)=>{ try{ Lampa.Storage.set('hide_native_vote', val);}catch{} setHideNative(val); }
    });
    const hide = !!Lampa.Storage.get('hide_native_vote', true);
    setHideNative(hide);

    // бонус: выбор стратегии ротации (необязательно)
    addSettingsSelect({
      name:'kp_key_strategy',
      values:{ 'round-robin':'Round-robin','least-used':'Least-used','random':'Random' },
      def:'round-robin',
      title:'Стратегия ротации ключей KP',
      descr:'Как выбирать следующий API-ключ',
      onChange:(v)=>{ KP_CONFIG.strategy = v; if (Lampa?.Noty) Lampa.Noty.show('Стратегия ключей: ' + v); }
    });

    addSettingsSelect({
      name:'kp_proxy_mode',
      values:{ 'auto':'Авто','on':'Всегда через прокси','off':'Без прокси' },
      def:'auto',
      title:'Режим прокси для KP',
      descr:'Авто — сначала прямой запрос, затем цепочка прокси',
      onChange:(v)=>{ KP_CONFIG.useProxy = v; if (Lampa?.Noty) Lampa.Noty.show('Прокси: ' + v); }
    });
  }

  // Инициализация
  function init(){
    if (window[PLUGIN_NAME + '_inited']) return;
    window[PLUGIN_NAME + '_inited'] = true;

    try{
      const cur=Lampa.Storage.get('rating_source','tmdb');
      if(!VALID_SOURCES.includes(cur)) Lampa.Storage.set('rating_source','tmdb');
    }catch{}

    addSettingsUI();
    hookCardEvents();

    setTimeout(()=>document.querySelectorAll('.card').forEach(c=>processCardNode(c)),300);
  }

  if (window.appready) init();
  else if (Lampa?.Listener?.follow) Lampa.Listener.follow('app',(e)=>{ if(e?.type==='ready') init(); });
  else setTimeout(init, 1000);
})();
