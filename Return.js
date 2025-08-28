(function ResumeTorrentConsole(){
  'use strict';

  // --- настройки+сервис ---
  const STORE_KEY  = 'resume_torrent_state_console';
  const MAX_MOVIES = 200;
  const MAX_EPIS   = 400;

  // стили и очистка старых кнопок
  $('.return--button, .resume-torrent-btn').remove();
  (function injectCSS(){
    const css = `
    .resume-torrent-btn{background:transparent!important;color:#fff!important;border:none!important;padding:.5em 1em!important}
    .resume-torrent-btn .selector__icon{margin-right:.5em!important}
    .resume-torrent-btn img{filter:invert(100%)!important}
    .resume-torrent-btn:hover,.resume-torrent-btn.focus{background:#fff!important;color:#000!important;border:1px solid #000!important}
    .resume-torrent-btn:hover img,.resume-torrent-btn.focus img{filter:none!important}
    `;
    $('head').append(`<style>${css}</style>`);
  })();

  const state = Lampa.Storage.get(STORE_KEY, { movies:{}, episodes:{} });
  try { Lampa.Storage.sync(STORE_KEY, 'object_object'); } catch(_) {}

  const originalPlay = Lampa.Player.play;

  // --- утилиты ---
  const urlHit = s => typeof s === 'string' && /magnet:|\.torrent|ts:\/\//i.test(s);
  function isTorrentPlay(d){
    if (!d) return false;
    if (d.torrent_hash) return true;
    if (urlHit(d.url)) return true;
    if (Array.isArray(d.playlist) && d.playlist.some(p => p && urlHit(p.url))) return true;
    return false;
  }
  function fvKeys(){
    const fv = Lampa.Storage.get('file_view', {}) || {};
    return Object.keys(fv);
  }
  function detectNewFileCode(before){
    const after = fvKeys();
    for (let i=0;i<after.length;i++) if (before.indexOf(after[i]) === -1) return after[i];
    return null;
  }
  function mediaType(card){ return card?.media_type || (card?.first_air_date ? 'tv' : 'movie'); }

  function minimalLastData(data){
    const keep = ['quality','title','translate','subtitles','card','torrent_hash','playlist','season','episode','episod'];
    const out = {};
    keep.forEach(k => { if (data[k] != null) out[k] = data[k]; });
    if (data.card){
      const c = data.card;
      out.card = {
        id: c.id,
        name: c.name || c.title,
        media_type: c.media_type || (c.first_air_date ? 'tv' : 'movie'),
        first_air_date: c.first_air_date,
        release_date: c.release_date
      };
    }
    delete out.url; // принципиально не храним поток
    return out;
  }

  function extractEpisodeInfo(data){
    let s = Number.isInteger(data?.season) ? data.season : null;
    let eRaw = (data && (data.episode ?? data.episod));
    let e = Number.isInteger(eRaw) ? eRaw : null;

    const text = [data?.title, data?.episode_title, data?.name].filter(Boolean).join(' ');
    const pats = [
      /S\s*(\d+)\s*E\s*(\d+)/i,      // S1 E2 / S01 E02
      /S(\d+)\s*E(\d+)/i,            // S1E2
      /(\d+)\s*season.*?(\d+)\s*episode/i,
      /сезон\s*(\d+).*?сер(?:ия|ии|)\s*(\d+)/i,
      /с(\d+)\s*е(\d+)/i
    ];
    if (s==null || e==null){
      for (const re of pats){
        const m = re.exec(text);
        if (m){ if (s==null) s = +m[1]; if (e==null) e = +m[2]; break; }
      }
    }
    if (s==null || e==null){
      const el = document.querySelector('.focus, .selector.focus, .focused');
      if (el){
        const dsS = el.getAttribute('data-season') || el.dataset?.season;
        const dsE = el.getAttribute('data-episode') || el.getAttribute('data-episod') || el.dataset?.episode || el.dataset?.episod;
        if (s==null && dsS!=null) s = parseInt(dsS,10);
        if (e==null && dsE!=null) e = parseInt(dsE,10);
        if (s==null || e==null){
          const txt = (el.textContent||'').trim();
          for (const re of pats){
            const m = re.exec(txt);
            if (m){ if (s==null) s = +m[1]; if (e==null) e = +m[2]; break; }
          }
        }
      }
    }
    return (Number.isInteger(s) && Number.isInteger(e)) ? {season:s, episode:e, ok:true} : {season:null, episode:null, ok:false};
  }

  function makeEpisodeKey(cardId, s, e){
    return (Number.isInteger(s) && Number.isInteger(e)) ? `tv:${cardId}:s${s}e${e}` : `tv:${cardId}:custom:${Date.now()}`;
  }

  function capMap(map, max){
    const entries = Object.entries(map).sort((a,b)=> (b[1]?.savedAt||0) - (a[1]?.savedAt||0));
    return entries.length<=max ? map : Object.fromEntries(entries.slice(0,max));
  }
  function persist(){
    state.movies   = capMap(state.movies,   MAX_MOVIES);
    state.episodes = capMap(state.episodes, MAX_EPIS);
    Lampa.Storage.set(STORE_KEY, state, false);
  }
  function findLatestEpisodeEntry(cardId){
    let best = null, key = null;
    for (const [k,v] of Object.entries(state.episodes)){
      if (k.startsWith('tv:'+cardId+':')){
        if (!best || (v.savedAt > best.savedAt)){ best = v; key = k; }
      }
    }
    return {entry:best, key};
  }
  function applyTimelineFromFileView(data, fileCode){
    if (!fileCode) return data;
    const rec = (Lampa.Storage.get('file_view', {}) || {})[fileCode];
    if (rec && typeof rec.time==='number' && typeof rec.duration==='number'){
      data.timeline = {
        time: rec.time,
        duration: rec.duration,
        percent: rec.percent || Math.floor(rec.time / Math.max(1, rec.duration) * 100)
      };
    }
    return data;
  }

  // --- перехват запуска плеера ---
  Lampa.Player.play = function(data){
    const torrent = isTorrentPlay(data);
    const before  = torrent ? fvKeys() : null;

    const type   = mediaType(data?.card);
    const cardId = data?.card?.id;

    // подставим таймлайн сразу, если у нас уже был fileCode
    if (torrent && cardId){
      if (type==='movie'){
        const m = state.movies[cardId];
        if (m?.fileCode) applyTimelineFromFileView(data, m.fileCode);
      } else {
        const info = extractEpisodeInfo(data);
        if (info.ok){
          const ek = makeEpisodeKey(cardId, info.season, info.episode);
          const e  = state.episodes[ek];
          if (e?.fileCode) applyTimelineFromFileView(data, e.fileCode);
        } else {
          const {entry} = findLatestEpisodeEntry(cardId);
          if (entry?.fileCode) applyTimelineFromFileView(data, entry.fileCode);
        }
      }
    }

    const lastData = torrent ? minimalLastData(data) : null;

    // запуск оригинала
    originalPlay.call(Lampa.Player, data);

    if (!torrent || !cardId) return;

    // одноразовый callback закрытия
    const onClose = () => {
      setTimeout(() => {
        const code = detectNewFileCode(before || []);
        const now  = Date.now();

        if (mediaType(data?.card)==='movie'){
          const prev = state.movies[cardId];
          state.movies[cardId] = {
            fileCode: code || prev?.fileCode || null,
            lastData: lastData || prev?.lastData || null,
            savedAt:  now
          };
        } else {
          const info = extractEpisodeInfo(data);
          const key  = info.ok ? makeEpisodeKey(cardId, info.season, info.episode)
                               : makeEpisodeKey(cardId, null, null);
          const prev = state.episodes[key];
          state.episodes[key] = {
            fileCode: code || prev?.fileCode || null,
            lastData: lastData || prev?.lastData || null,
            savedAt:  now
          };
        }

        persist();
        try { Lampa.Player.callback(null); } catch(_) {}
      }, 250);
    };
    try { Lampa.Player.callback(onClose); } catch(_) {}
  };

  // --- кнопка «Продолжить» на full-карте ---
  function injectContinueButton(){
    Lampa.Listener.follow('full', function(e){
      if (!['complite','complete'].includes(e.type)) return;
      try{
        const root = e.object?.activity?.render?.();
        const card = e.object?.activity?.card;
        if (!root || !root.length || !card?.id) return;

        const type = mediaType(card);
        let entry=null, label='';

        if (type==='movie'){
          entry = state.movies[card.id];
        } else {
          const got = findLatestEpisodeEntry(card.id);
          entry = got.entry;
          if (got.key && /:s\d+e\d+$/i.test(got.key)) label = got.key.split(':').pop().toUpperCase() + ' · ';
        }
        if (!entry || !(entry.fileCode || entry.lastData)) return;

        const fv = entry.fileCode ? (Lampa.Storage.get('file_view', {})[entry.fileCode] || null) : null;
        const seconds = fv && typeof fv.time==='number' ? fv.time : 0;
        const pretty = (Lampa.Utils?.secondsToTime) ? Lampa.Utils.secondsToTime(Math.floor(seconds), true)
                                                    : (Math.round(seconds/60)+' мин');

        const $panel = root.find('.full-actions, .full__actions, .full-descr__buttons, .button--play').first();
        if (!$panel.length || root.find('.resume-torrent-btn').length) return;

        const $btn = $(`
          <div class="full-start__button selector view--continue resume-torrent-btn" title="Продолжить">
            <div class="selector__icon">
              <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg" width="24" height="24" alt="">
            </div>
            <div class="selector__text">▶️ Продолжить ${label}${pretty}</div>
          </div>`);

        $btn.on('hover:enter click', function(ev){
          ev.preventDefault(); ev.stopPropagation();
          const data = Object.assign({}, entry.lastData || {});
          if (entry.fileCode) applyTimelineFromFileView(data, entry.fileCode);
          Lampa.Player.play(data);
        });

        if ($panel.hasClass('button--play')) $panel.after($btn);
        else $panel.prepend($btn);
      } catch(err){ console.log('[ResumeTorrentConsole] inject error', err); }
    });
  }

  if (window.Lampa) injectContinueButton();
  else document.addEventListener('lampa:start', injectContinueButton);

  console.log('[ResumeTorrentConsole] ready');
})();
