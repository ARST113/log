(function () {
  'use strict';

  const PLUGIN_NAME = 'rating_shadow_badge_v2_fix';
  const DEBUG = true;
  const log = (...a) => DEBUG && console.log('[rating]', ...a);

  // ====== Compat: Request / Reguest ======
  function makeRequest() {
    const Ctor = Lampa?.Request || Lampa?.Reguest;
    if (!Ctor) throw new Error('Neither Lampa.Request nor Lampa.Reguest found');
    return new Ctor();
  }

  // ====== URL helper ======
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

  // ====== Settings helpers ======
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

  // ====== KinopoiskUnofficial API keys rotation ======
  const API_KEYS = [
    '2a4a0808-81a3-40ae-b0d3-e11335ede616',
    '8c8e1a50-6322-4135-8875-5d40a5420d86'
  ];
  const KEY_COOLDOWN_MS = 12 * 60 * 1000;

  let kpKeyState = {
    idx: Number(Lampa.Storage.get('kp_key_idx', 0)) % API_KEYS.length,
    cooldowns: (() => { try { return JSON.parse(Lampa.Storage.get('kp_key_cooldowns', '{}')) || {}; } catch { return {}; } })()
  };

  const isOnCooldown = i => Date.now() < (kpKeyState.cooldowns[i] || 0);
  function markCooldown(i, ms) {
    kpKeyState.cooldowns[i] = Date.now() + (ms || KEY_COOLDOWN_MS);
    try { Lampa.Storage.set('kp_key_cooldowns', JSON.stringify(kpKeyState.cooldowns)); } catch {}
  }
  function saveKeyIndex(i){ kpKeyState.idx = i; try{ Lampa.Storage.set('kp_key_idx', i);}catch{} }
  function pickStartIndex(){
    for (let s=0; s<API_KEYS.length; s++){
      const i=(kpKeyState.idx+s)%API_KEYS.length;
      if(!isOnCooldown(i)) return i;
    }
    return kpKeyState.idx;
  }
  function kpSilent(req, url, onOk, onFail){
    let start = pickStartIndex(), attempt = 0;
    const next = () => {
      if (attempt >= API_KEYS.length) return onFail && onFail();
      const i = (start + attempt) % API_KEYS.length;
      const key = API_KEYS[i];
      req.clear(); req.timeout(15000);
      req.silent(url, (json)=>{ saveKeyIndex(i); onOk && onOk(json); }, (a,c)=>{
        const status = (a && a.status) || (c && c.status) || (typeof a==='number'?a:0);
        if (status===429 || status===403) markCooldown(i);
        attempt++; next();
      }, false, { headers: { 'X-API-KEY': key } });
    };
    next();
  }
  const kpFetchJson = (url)=> new Promise((res,rej)=> kpSilent(makeRequest(), url, res, rej));

  // ====== Cache ======
  const CACHE_KP = 'kp_rating';
  const CACHE_DISPLAY = 'rating_display_cache';
  const storageCacheGet = (name, max, empty) => { try { return Lampa.Storage.cache(name, max, empty); } catch { return empty || {}; } };
  const displayCacheRead = () => storageCacheGet(CACHE_DISPLAY, 1000, {});
  const displayCacheWrite = (k, payload)=>{ const c=storageCacheGet(CACHE_DISPLAY,1000,{}); c[k]=payload; Lampa.Storage.set(CACHE_DISPLAY,c); };
  function readKP(id){ const c=storageCacheGet(CACHE_KP,1000,{}), rec=c[id]; if(!rec) return null; const month=30*24*3600*1000; return (!rec.timestamp||Date.now()-rec.timestamp>month)?null:rec; }
  function writeKP(id,data){ const c=storageCacheGet(CACHE_KP,1000,{}); c[id]={...data,timestamp:Date.now()}; Lampa.Storage.set(CACHE_KP,c); }

  // ====== Sources ======
  const VALID_SOURCES = ['tmdb','kp','imdb'];
  const getSource = ()=> { try{ const v=Lampa.Storage.get('rating_source','tmdb'); return VALID_SOURCES.includes(v)?v:'tmdb'; }catch{ return 'tmdb'; } };

  // ====== TMDB quick ======
  function getTmdbRating(card){
    if (card?.vote_average > 0) return String(parseFloat(card.vote_average).toFixed(1));
    if (card?.rating > 0) return String(parseFloat(card.rating).toFixed(1));
    if (card?.vote_count > 0) return '5.0';
    if (card?.popularity && card.popularity > 10) return '6.0';
    const y = (card?.release_date || '').slice(0,4), cy = new Date().getFullYear();
    if (y && cy - Number(y) <= 2) return '5.5';
    return '0.0';
  }

  // ====== KP/IMDb fetch ======
  const cleanTitle = s => (s||'').replace(/[\s.,:;’'`!?]+/g,' ').trim();
  const prepareSearchTitle = q => cleanTitle(q).replace(/^[ \/\\]+/,'').replace(/[ \/\\]+$/,'').replace(/\+( *[+\/\\])+/g,'+').replace(/([+\/\\] *)+\+/g,'+').replace(/( *[\/\\]+ *)+/g,'+');

  function fetchKpOrImdb(item){
    return new Promise(resolve=>{
      const cached = readKP(item.id);
      if (cached) {
        const src=getSource(); const v = src==='kp'?cached.kp:cached.imdb;
        return resolve(v?String(parseFloat(v).toFixed(1)):'0.0');
      }
      const base='https://kinopoiskapiunofficial.tech/';
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

        kpFetchJson(base+'api/v2.2/films/'+filmId).then(data=>{
          const kp=data?.ratingKinopoisk||0, imdb=data?.ratingImdb||0;
          writeKP(item.id,{kp,imdb});
          const src=getSource(); const val = src==='kp'?kp:imdb;
          resolve(val?String(parseFloat(val).toFixed(1)):'0.0');
        }).catch(()=>{ writeKP(item.id,{kp:0,imdb:0}); resolve('0.0'); });
      }

      if(item.imdb_id){
        kpFetchJson(addParam(base+'api/v2.2/films','imdbId',item.imdb_id)).then(json=>{
          choose(json?.items||json?.films||[]);
        }).catch(()=>{
          kpFetchJson(addParam(base+'api/v2.1/films/search-by-keyword','keyword',prepareSearchTitle(searchTitle)))
            .then(json=>choose(json?.items||json?.films||[]))
            .catch(()=>resolve('0.0'));
        });
      } else {
        kpFetchJson(addParam(base+'api/v2.1/films/search-by-keyword','keyword',prepareSearchTitle(searchTitle)))
          .then(json=>choose(json?.items||json?.films||[]))
          .catch(()=>resolve('0.0'));
      }
    });
  }

  // ====== Brand icons (used inside Shadow) ======
  const BRAND_ICONS_KEY='rating_brand_icon_urls_v1';
  const DEFAULT_BRANDS={
    tmdb:'https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg',
    kp:'https://raw.githubusercontent.com/ARST113/star/refs/heads/main/kinopoisk-icon-main.svg',
    imdb:'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg'
  };
  let BRAND=DEFAULT_BRANDS; try{ BRAND={...DEFAULT_BRANDS, ...(Lampa.Storage.get(BRAND_ICONS_KEY,{})||{})}; }catch{}

  // ====== host placement: poster container ======
  function findPosterContainer(card){
    return card.querySelector('.card__view, .card__image, .card__img, .poster, .image, .thumb') || card;
  }
  function ensureBadgeHost(card){
    const container = findPosterContainer(card);
    if (!container || !container.appendChild) return null;
    try{
      const cs = getComputedStyle(container);
      if (cs.position === 'static') container.style.position = 'relative';
    }catch{}
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

  // ====== Hide native Lampa badge (optional) ======
  function setHideNative(enabled){
    let st = document.getElementById('rating-hide-native-style');
    if (enabled && !st){
      st = document.createElement('style');
      st.id = 'rating-hide-native-style';
      st.textContent = `
        /* скрываем штатный кружок внутри постера */
        .card .card__view .card__vote,
        .card .card__image .card__vote,
        .card .card__img .card__vote{ display:none !important; }
      `;
      document.head.appendChild(st);
    } else if (!enabled && st){
      st.remove();
    }
  }

  // ====== Fast local path ======
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

  // ====== Process card ======
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

  // ====== Observe cards ======
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

  // ====== Settings UI ======
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
  }

  // ====== Init ======
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

  // ====== Start ======
  if (window.appready) init();
  else if (Lampa?.Listener?.follow) Lampa.Listener.follow('app',(e)=>{ if(e?.type==='ready') init(); });
  else setTimeout(init, 1000);
})();
