(function () {
  'use strict';

  const PLUGIN_NAME = 'local_rating_badge_v8_2_single_tmdb_icon';
  const DEBUG = false;
  const log = (...a)=>DEBUG&&console.log('[badge]',...a);

  /* ========= Storage helpers ========= */
  const Storage = {
    get(k,d){ try{const v=Lampa.Storage.get(k,d);return v==null?d:v;}catch{return d} },
    set(k,v){ try{Lampa.Storage.set(k,v);}catch{} },
    cache(k,m,d){ try{return Lampa.Storage.cache(k,m,d);}catch{return d} }
  };

  /* ========= ID helpers ========= */
  function collectIds(obj){
    const raw = [
      obj?.id, obj?.card_id, obj?.source_id, obj?.sourceId,
      obj?.movie_id, obj?.movieId, obj?.number_id, obj?.original_id,
      obj?.tmdb_id, obj?.tmdbId,
      obj?.imdb_id, obj?.imdbId,
      obj?.kinopoisk_id, obj?.kinopoiskId, obj?.filmId
    ];
    const ids = [];
    raw.forEach(v=>{
      if(v==null) return;
      const s = String(v).trim();
      if(!s || s==='0' || s==='NaN') return;
      ids.push(s);
    });
    return Array.from(new Set(ids));
  }

  /* ========= Read rating (cache/fields/TMDB fallback) ========= */
  function getRatingFromCard(card, source){
    if(!card) return 0;

    // прямые поля (если другой плагин положил в объект)
    if(source==='kp'){
      const v = card.kp_rating || card.kinopoisk_rating || card.kp_rate || card.kinopoisk_rate || card.rating_kp;
      if(v>0) return parseFloat(v);
    }
    if(source==='imdb'){
      const v = card.imdb_rating || card.imdb_rate || card.imdb_vote_average || card.rating_imdb;
      if(v>0) return parseFloat(v);
    }

    // кэш rating_kp_imdb
    const cache = Storage.cache('kp_rating', 1000, {});
    const ids = collectIds(card);
    for(const id of ids){
      const rec = cache[id];
      if(!rec) continue;
      if(source==='kp'   && rec.kp>0)   return parseFloat(rec.kp);
      if(source==='imdb' && rec.imdb>0) return parseFloat(rec.imdb);
    }

    // TMDB fallback
    if(source==='tmdb'){
      if(card.vote_average>0) return parseFloat(card.vote_average);
      if(card.rating>0)       return parseFloat(card.rating);
      if(card.vote_count>0)   return 5.0;
      if(card.popularity>10)  return 6.0;
      const y=(card.release_date||card.first_air_date||'').slice(0,4),
            cy=new Date().getFullYear();
      if(y && cy-Number(y)<=2) return 5.5;
    }
    return 0;
  }

  /* ========= Save rating into cache under ALL ids ========= */
  function saveToCacheForAllIds(movie, payload){
    const ids = collectIds(movie);
    if(!ids.length) return;
    const cache = Storage.cache('kp_rating', 1000, {});
    const now = Date.now();
    ids.forEach(id=>{
      cache[id] = cache[id] || { kp:0, imdb:0, timestamp: now };
      if(payload.kp   != null) cache[id].kp   = payload.kp;
      if(payload.imdb != null) cache[id].imdb = payload.imdb;
      cache[id].timestamp = now;
    });
    Lampa.Storage.set('kp_rating', cache);
    log('saved', payload, ids);
  }

  /* ========= FULL view scraping (robust, incl. mobile) ========= */
  function normalizeRoot(root){
    if(typeof root === 'function'){ try { root = root(); } catch {} }
    if(root && typeof root === 'object' && !root.querySelector && root[0]) root = root[0];
    if(!(root instanceof Element)) root = document;
    return root;
  }

  function hookFullScrape(){
    if(!Lampa?.Listener?.follow) return;
    Lampa.Listener.follow('full', (e)=>{
      if(e?.type!=='complite') return;

      const rawRender = e.object?.activity?.render;
      const renderRoot = normalizeRoot(typeof rawRender==='function' ? rawRender() : rawRender);

      const getRate = (selector)=>{
        try{
          const el = renderRoot.querySelector(selector);
          if(!el) return 0;
          const valDiv = el.querySelector('div');
          if(!valDiv) return 0;
          const num = parseFloat((valDiv.textContent||'').trim().replace(',','.'));
          return isNaN(num)?0:num;
        }catch{
          const el = document.querySelector(selector);
          const valDiv = el?.querySelector?.('div');
          const num = parseFloat((valDiv?.textContent||'').trim().replace(',','.'));
          return isNaN(num)?0:num;
        }
      };

      const kp   = getRate('.full-start__rate.rate--kp');
      const imdb = getRate('.full-start__rate.rate--imdb');

      if(kp>0 || imdb>0){
        const movie = e.data?.movie || e.data || {};
        saveToCacheForAllIds(movie, { kp: kp>0?kp:null, imdb: imdb>0?imdb:null });
        document.querySelectorAll('.card').forEach(processCard);
      }
    });
  }

  /* ========= Badge render ========= */

  // только этот URL для TMDB-логотипа (как просил)
  const TMDB_ICON = 'https://raw.githubusercontent.com/ARST113/Buttons-/refs/heads/main/the_movie_database.svg';

  const BRAND_ICONS = {
    tmdb: TMDB_ICON,
    kp:   'https://raw.githubusercontent.com/ARST113/star/refs/heads/main/kinopoisk-icon-main.svg',
    imdb: 'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg'
  };

  function getPosterContainer(node){
    return node.querySelector('.card__view, .card__image, .card__img, .poster, .image, .thumb') || node;
  }
  function ensureHost(node){
    const c = getPosterContainer(node);
    if(!c || !c.appendChild) return null;
    try{ const cs=getComputedStyle(c); if(cs.position==='static') c.style.position='relative'; }catch{}
    let host = c.querySelector(':scope > .local-rate-badge');
    if(!host){
      host = document.createElement('div');
      host.className = 'local-rate-badge';
      host.style.cssText = 'position:absolute;right:8px;bottom:8px;z-index:50;pointer-events:none;';
      c.appendChild(host);
    }
    if(!host.shadowRoot) host.attachShadow({mode:'open'});
    return host;
  }

  function renderBadge(node, rating, source){
    const host = ensureHost(node); if(!host) return;

    const num = parseFloat(rating)||0;
    const val = num>0 ? num.toFixed(1) : '—';
    const icon = BRAND_ICONS[source]||'';

    host.shadowRoot.innerHTML = `
      <style>
        .b{display:inline-flex;align-items:center;gap:6px;padding:4px 6px;border-radius:10px;
           font:700 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;
           color:#fff;pointer-events:none;opacity:0;transform:scale(.95);transition:all .25s ease;}
        .b.show{opacity:1;transform:scale(1);}
        .b.tmdb{background:#0D253F;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 2px 8px rgba(0,0,0,.45);}
        .b.kp{background:#e85d00;padding:4px 6px;}
        .b.imdb{background:#f5c518;color:#000;text-shadow:none;box-shadow:0 0 4px rgba(0,0,0,.3);}

        .logo{display:inline-block;background-size:contain;background-repeat:no-repeat;background-position:center;}

        /* TMDB логотип: чтобы не терялся на тёмной теме можно включить фильтр.
           По-умолчанию выключен — сохраняем внешний вид твоего SVG как есть.
           Если нужно осветлить, раскомментируй строку с filter ниже. */
        .b.tmdb .logo{width:46px;height:18px; /* filter: brightness(0) invert(1); */ }

        .b.kp   .logo{width:22px;height:22px;}
        .b.imdb .logo{width:44px;height:18px;}
      </style>
      <div class="b ${source}">
        <span>${val}</span>
        <span class="logo" style="${icon?`background-image:url('${icon}')`:''}" title="${source.toUpperCase()}"></span>
      </div>
    `;

    requestAnimationFrame(()=>host.shadowRoot.querySelector('.b')?.classList.add('show'));
  }

  /* ========= Apply to cards ========= */
  function processCard(node){
    if(!node?.querySelector) return;
    const data = node.card_data || node.data;
    if(!data) return;
    const source = Storage.get('rating_source','kp');
    const r = getRatingFromCard(data, source);
    renderBadge(node, r, source);
  }

  function hookCards(){
    if(window[PLUGIN_NAME+'_hooked']) return;
    window[PLUGIN_NAME+'_hooked'] = true;

    if(Lampa?.Listener?.follow){
      Lampa.Listener.follow('card', ev=>{
        if(ev?.type==='build' && ev?.data?.object) setTimeout(()=>processCard(ev.data.object),0);
      });
    }

    const mo = new MutationObserver(muts=>{
      for(const m of muts){
        for(const n of m.addedNodes){
          if(n.nodeType!==1) continue;
          if(n.classList?.contains('card')) processCard(n);
          else n.querySelectorAll?.('.card')?.forEach(processCard);
        }
      }
    });
    mo.observe(document.body, { childList:true, subtree:true });

    setTimeout(()=>document.querySelectorAll('.card').forEach(processCard), 300);
  }

  /* ========= Settings & init ========= */
  function addSettings(){
    if(!Lampa?.SettingsApi?.addParam && !Lampa?.Settings?.listener?.add) return;
    const addSelect = cfg=>{
      if(Lampa.SettingsApi?.addParam){
        Lampa.SettingsApi.addParam({
          component:'interface',
          param:{name:cfg.name,type:'select',values:cfg.values,default:cfg.def},
          field:{name:cfg.title,description:cfg.descr},
          onChange:cfg.onChange
        });
      } else if(Lampa?.Settings?.listener?.add){
        Lampa.Settings.listener.add({
          component:'main',
          param:{name:cfg.name,type:'select',values:cfg.values,default:cfg.def},
          field:{name:cfg.title,description:cfg.descr},
          onChange:cfg.onChange
        });
      }
    };
    addSelect({
      name:'rating_source',
      values:{ tmdb:'TMDB', kp:'Кинопоиск', imdb:'IMDb' },
      def:Storage.get('rating_source','kp'),
      title:'Источник рейтинга (из кэша)',
      descr:'Читает кэш rating_kp_imdb; при открытии карточки синхронизирует значения',
      onChange:v=>{
        Storage.set('rating_source', v);
        document.querySelectorAll('.card').forEach(processCard);
      }
    });
  }

  function hideNative(){
    const s=document.createElement('style');
    s.textContent = `
      .card .card__view .card__vote,
      .card .card__image .card__vote,
      .card .card__img .card__vote { display:none !important; }
    `;
    document.head.appendChild(s);
  }

  function init(){
    if(window[PLUGIN_NAME+'_inited']) return;
    window[PLUGIN_NAME+'_inited']=true;
    hideNative();
    addSettings();
    hookCards();
    hookFullScrape(); // скрейп KP/IMDb из карточки
  }

  if(window.appready) init();
  else if(Lampa?.Listener?.follow) Lampa.Listener.follow('app', e=>{ if(e?.type==='ready') init(); });
  else setTimeout(init, 1000);
})();
