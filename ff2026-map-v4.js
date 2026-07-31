(() => {
  'use strict';

  const EVENTS = Array.isArray(window.FF_EVENTS) ? window.FF_EVENTS : [];
  const STORAGE_KEY = 'ff26-saved';
  const WORLD = { width: 2400, height: 1500 };
  const MAX_ZOOM = 4.5;

  const POIS = [
    {n:1,id:'parking-1',label:'Парковка 1',short:'Парковка 1',x:1220,y:175,kind:'parking',category:'service'},
    {n:2,id:'parking-2',label:'Парковка 2',short:'Парковка 2',x:335,y:185,kind:'parking',category:'service'},
    {n:3,id:'med-1',label:'Медпункт 1',short:'Медпункт',x:100,y:420,kind:'medical',category:'service'},
    {n:4,id:'stage-bylina',label:'Сцена «Былина»',short:'Былина',x:285,y:535,kind:'stage',category:'stages',venue:'Сцена «Былина»',color:'#a976ff'},
    {n:5,id:'stage-bereg',label:'Сцена «Берег»',short:'Берег',x:675,y:515,kind:'stage',category:'stages',venue:'Сцена «Берег»',color:'#4fc77a'},
    {n:6,id:'workshops',label:'Мастер-классы',short:'Мастер-классы',x:315,y:735,kind:'craft',category:'activities'},
    {n:7,id:'arena',label:'Танцы, косплей, сражения',short:'Ристалище',x:545,y:745,kind:'arena',category:'activities',venue:'Ристалище',color:'#35c5c2'},
    {n:8,id:'tavern',label:'Таверна «Секира»',short:'Таверна',x:690,y:755,kind:'tavern',category:'food'},
    {n:9,id:'themed-market',label:'Антуражная торговля',short:'Торговля',x:330,y:955,kind:'market',category:'trade'},
    {n:10,id:'sekira-shop',label:'Магазин «Секира»',short:'Секира',x:675,y:955,kind:'market',category:'trade'},
    {n:11,id:'archery',label:'Лучная секция',short:'Лучная секция',x:980,y:650,kind:'archery',category:'activities'},
    {n:12,id:'checkpoint',label:'Зона досмотра',short:'Досмотр',x:1390,y:385,kind:'gate',category:'service'},
    {n:13,id:'stage-circle',label:'Сцена «Круг Света»',short:'Круг Света',x:1280,y:700,kind:'stage',category:'stages',venue:'Сцена «Круг Света»',color:'#5b8cff'},
    {n:14,id:'literature',label:'Литературная секция',short:'Литература',x:1185,y:860,kind:'book',category:'stages',venue:'Литературная программа',color:'#ff7187'},
    {n:15,id:'lectures',label:'Лекторий',short:'Лекторий',x:1385,y:855,kind:'book',category:'stages',venue:'Лекторий',color:'#f2bd45'},
    {n:16,id:'med-2',label:'Медпункт 2',short:'Медпункт',x:1535,y:855,kind:'medical',category:'service'},
    {n:17,id:'regular-market',label:'Не антуражная ярмарка',short:'Ярмарка',x:1075,y:1015,kind:'market',category:'trade'},
    {n:18,id:'themed-camp',label:'Антуражный лагерь',short:'Антуражный лагерь',x:395,y:1190,kind:'camp',category:'camps'},
    {n:19,id:'pier',label:'Пристань',short:'Пристань',x:1105,y:1280,kind:'boat',category:'service'},
    {n:20,id:'auto-camp',label:'Авто и мото кемпинг',short:'Автокемпинг',x:1810,y:625,kind:'vehicle',category:'camps'},
    {n:21,id:'hotel-camp',label:'Палаточная гостиница',short:'Палаточная гостиница',x:2025,y:440,kind:'camp',category:'camps'},
    {n:22,id:'showers',label:'Души Енота',short:'Души',x:2220,y:430,kind:'shower',category:'service'},
    {n:23,id:'loud-camp',label:'Шумный туристический лагерь',short:'Шумный лагерь',x:1875,y:1080,kind:'camp',category:'camps'},
    {n:24,id:'quiet-camp',label:'Тихий туристический лагерь',short:'Тихий лагерь',x:2140,y:1135,kind:'camp',category:'camps'}
  ];

  const CATEGORY_META = {
    stages:{label:'Сцены и программа',color:'#d7ef69'},
    activities:{label:'Активности',color:'#49d5d0'},
    service:{label:'Сервис',color:'#8cb7ff'},
    trade:{label:'Торговля',color:'#f2bd45'},
    food:{label:'Еда',color:'#ff9c63'},
    camps:{label:'Лагеря',color:'#a98cff'}
  };

  const main = document.querySelector('#main');
  const viewTabs = document.querySelector('#viewTabs');
  const bottomNav = document.querySelector('.bottom-nav');
  const dayControls = document.querySelector('.control-shell');
  const sheet = document.querySelector('#sheet');
  const sheetBackdrop = document.querySelector('#sheetBackdrop');
  if (!main || !viewTabs || !bottomNav || !dayControls || !sheet || !sheetBackdrop || !EVENTS.length) return;

  let mapActive = false;
  let controller = null;
  let visibleCategories = new Set(Object.keys(CATEGORY_META));
  let layerPanelOpen = false;

  const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const time = iso => String(iso).match(/T(\d{2}:\d{2})/)?.[1] || '';
  const mins = iso => { const m=String(iso).match(/T(\d{2}):(\d{2})/); return m ? Number(m[1])*60+Number(m[2]) : NaN; };
  const currentDay = () => document.querySelector('.day-tab.active')?.dataset.day || '2026-07-31';
  const dayTitle = day => ({'2026-07-31':'31 июля','2026-08-01':'1 августа','2026-08-02':'2 августа'})[day] || day;

  function readSaved(){
    try { const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); return new Set(Array.isArray(value)?value:[]); }
    catch { return new Set(); }
  }

  function selectedEvents(day){
    const saved=readSaved();
    return EVENTS.filter(e=>saved.has(e.id)&&e.day===day).sort((a,b)=>mins(a.start)-mins(b.start));
  }

  function eventsAtPoi(day,poi){
    if(!poi.venue) return [];
    return EVENTS.filter(e=>e.day===day&&e.venue===poi.venue).sort((a,b)=>mins(a.start)-mins(b.start));
  }

  function nextSaved(events,day){
    if(!events.length) return null;
    const now=new Date();
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    const today=`${get('year')}-${get('month')}-${get('day')}`;
    const nowM=Number(get('hour'))*60+Number(get('minute'));
    if(today!==day) return events[0];
    return events.find(e=>mins(e.end)>nowM)||null;
  }

  function poiForVenue(venue){ return POIS.find(p=>p.venue===venue); }

  function routePoiSequence(events){
    const seq=[];
    events.forEach(e=>{
      const poi=poiForVenue(e.venue);
      if(!poi) return;
      if(seq.at(-1)?.id!==poi.id) seq.push(poi);
    });
    return seq;
  }

  function iconSvg(kind){
    const common='viewBox="0 0 24 24" aria-hidden="true"';
    const paths={
      stage:'<path d="M4 18V8l8-4 8 4v10M7 18v-6h10v6M9 9h6"/>',
      parking:'<path d="M7 20V4h6.2a5 5 0 0 1 0 10H7M7 14h6"/>',
      medical:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
      craft:'<path d="m4 20 7-7M14 4l6 6M12 6l6 6M3 17l4 4M14 4l2-2 6 6-2 2"/>',
      arena:'<path d="M7 3 5 21M17 3l2 18M4 8h16M3 16h18M9 8v8M15 8v8"/>',
      tavern:'<path d="M5 4h11v13a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V4Zm11 3h2a3 3 0 0 1 0 6h-2"/>',
      market:'<path d="M4 10h16l-2-6H6l-2 6Zm1 0v10h14V10M9 20v-6h6v6"/>',
      archery:'<path d="M4 20c8-2 14-8 16-16M8 4c4 4 8 8 12 12M12 7l5-2-2 5"/>',
      gate:'<path d="M5 21V7h14v14M8 7V3h8v4M9 21v-8h6v8"/>',
      book:'<path d="M3 5c4-2 7-1 9 1v14c-2-2-5-3-9-1V5Zm18 0c-4-2-7-1-9 1v14c2-2 5-3 9-1V5Z"/>',
      camp:'<path d="m3 20 9-16 9 16M7 20l5-8 5 8M12 4v16"/>',
      boat:'<path d="M4 16h16l-3 4H7l-3-4Zm4 0V8h7l3 8M8 8l7-4v4"/>',
      vehicle:'<path d="M4 15V9l3-4h9l4 4v6M6 15h12M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
      shower:'<path d="M5 9a6 6 0 0 1 12 0v2M17 11h4M18 14v1M21 14v1M15 14v1M18 18v1M21 18v1M15 18v1"/>'
    };
    return `<svg ${common}>${paths[kind]||paths.stage}</svg>`;
  }

  function treeUse(x,y,s=1,tone=0){ return `<use href="#tree${tone%3}" transform="translate(${x} ${y}) scale(${s})"/>`; }
  function tentUse(x,y,s=1,tone=0){ return `<use href="#tent${tone%2}" transform="translate(${x} ${y}) scale(${s})"/>`; }
  function boothUse(x,y,s=1){ return `<use href="#booth" transform="translate(${x} ${y}) scale(${s})"/>`; }

  function buildWorldSvg(route){
    const trees=[];
    const clusters=[
      [40,75,11,90,55],[360,65,12,85,48],[760,90,13,80,50],[1420,55,12,84,52],[1870,90,10,84,55],
      [85,940,12,78,52],[2050,900,12,76,55],[50,1270,9,82,50],[2020,1250,10,86,54]
    ];
    clusters.forEach(([sx,sy,count,dx,dy],ci)=>{
      for(let i=0;i<count;i++){
        const x=sx+(i%5)*dx+((i*31+ci*17)%35);
        const y=sy+Math.floor(i/5)*dy+((i*19)%24);
        trees.push(treeUse(x,y,.75+((i*7)%5)*.08,i+ci));
      }
    });

    const tents=[
      ...Array.from({length:13},(_,i)=>tentUse(1850+(i%5)*90,410+Math.floor(i/5)*78,.9+(i%3)*.08,i)),
      ...Array.from({length:16},(_,i)=>tentUse(1740+(i%6)*95,920+Math.floor(i/6)*82,.88+(i%2)*.1,i)),
      ...Array.from({length:14},(_,i)=>tentUse(2000+(i%5)*88,1050+Math.floor(i/5)*80,.88+(i%3)*.07,i)),
      ...Array.from({length:10},(_,i)=>tentUse(250+(i%5)*90,1080+Math.floor(i/5)*88,.95+(i%2)*.1,i))
    ];

    const booths=[
      ...Array.from({length:8},(_,i)=>boothUse(190+(i%4)*110,850+Math.floor(i/4)*75,.88)),
      ...Array.from({length:8},(_,i)=>boothUse(900+(i%4)*110,930+Math.floor(i/4)*75,.88))
    ];

    const routeLines=route.length>1?route.slice(1).map((p,i)=>`<line x1="${route[i].x}" y1="${route[i].y}" x2="${p.x}" y2="${p.y}" class="world-route-shadow"/><line x1="${route[i].x}" y1="${route[i].y}" x2="${p.x}" y2="${p.y}" class="world-route"/>`).join(''):'';

    return `
      <svg class="ff-world" viewBox="0 0 ${WORLD.width} ${WORLD.height}" role="img" aria-label="Интерактивная карта Фэнтези Феста">
        <defs>
          <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#819a68"/><stop offset=".56" stop-color="#718a5e"/><stop offset="1" stop-color="#627a54"/></linearGradient>
          <linearGradient id="meadow" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a9b982"/><stop offset="1" stop-color="#899f70"/></linearGradient>
          <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#7ea8a7"/><stop offset="1" stop-color="#537b83"/></linearGradient>
          <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d9cca2"/><stop offset="1" stop-color="#b9aa80"/></linearGradient>
          <filter id="softShadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#1a2418" flood-opacity=".38"/></filter>
          <filter id="tinyShadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="3" flood-color="#1a2418" flood-opacity=".42"/></filter>
          <symbol id="tree0" viewBox="-25 -55 50 70"><ellipse cx="0" cy="10" rx="23" ry="8" fill="#223524" opacity=".32"/><path d="M-5 8h10v28H-5z" fill="#5b432d"/><path d="M0-48-23-6h46L0-48Z" fill="#2f5d3c"/><path d="M0-31-20 3h40L0-31Z" fill="#3f7248"/><path d="M0-18-16 12h32L0-18Z" fill="#53845a"/></symbol>
          <symbol id="tree1" viewBox="-28 -52 56 68"><ellipse cx="0" cy="10" rx="24" ry="8" fill="#223524" opacity=".3"/><path d="M-4 5h8v28h-8z" fill="#59412d"/><circle cx="-9" cy="-17" r="19" fill="#315e3c"/><circle cx="10" cy="-20" r="20" fill="#44784c"/><circle cx="0" cy="-34" r="19" fill="#56885b"/></symbol>
          <symbol id="tree2" viewBox="-26 -52 52 68"><ellipse cx="0" cy="10" rx="23" ry="8" fill="#223524" opacity=".3"/><path d="M-4 4h8v28h-8z" fill="#60472f"/><path d="M0-45C-20-36-24-12-12 2 0 15 18 5 22-10 26-29 14-44 0-45Z" fill="#3d7148"/><path d="M-8-35C-18-20-17-7-8 0" fill="none" stroke="#77a36c" stroke-width="4" opacity=".5"/></symbol>
          <symbol id="tent0" viewBox="-40 -40 80 65"><ellipse cy="18" rx="39" ry="10" fill="#253225" opacity=".28"/><path d="M-35 15 0-35 35 15Z" fill="#d6c59a" stroke="#f0e5c3" stroke-width="3"/><path d="M0-35v50M0-35 17 15" stroke="#8b6c4b" stroke-width="3"/><path d="M0-10 17 15H-4Z" fill="#65513c"/></symbol>
          <symbol id="tent1" viewBox="-40 -40 80 65"><ellipse cy="18" rx="39" ry="10" fill="#253225" opacity=".28"/><path d="M-35 15 0-35 35 15Z" fill="#aebd96" stroke="#dfe8ca" stroke-width="3"/><path d="M0-35v50M0-35 17 15" stroke="#6b7659" stroke-width="3"/><path d="M0-10 17 15H-4Z" fill="#4e5a47"/></symbol>
          <symbol id="booth" viewBox="-45 -40 90 75"><ellipse cy="25" rx="44" ry="10" fill="#263424" opacity=".28"/><path d="M-36-5h72v35h-72z" fill="#a68155"/><path d="m-43-5 12-27h62L43-5Z" fill="#d8be86" stroke="#efe2c1" stroke-width="3"/><path d="M-18-32v27M7-32v27" stroke="#9a7049" stroke-width="5"/><path d="M-30 10h60" stroke="#5e4836" stroke-width="5"/></symbol>
          <symbol id="stage" viewBox="-85 -85 170 125"><ellipse cy="35" rx="80" ry="20" fill="#1e2c20" opacity=".34"/><path d="M-70 22h140v18H-70z" fill="#5d4637"/><path d="M-62-30h124v52H-62z" fill="#26372a" stroke="#c9d5b3" stroke-width="5"/><path d="M-74-30 0-78 74-30Z" fill="#6b4f3b" stroke="#e0cfaa" stroke-width="5"/><path d="M-38-10h76v32h-76z" fill="#101b13"/><path d="M-58-25v65M58-25v65" stroke="#c5b88f" stroke-width="6"/></symbol>
          <symbol id="towerGate" viewBox="-90 -90 180 150"><ellipse cy="48" rx="85" ry="18" fill="#233124" opacity=".34"/><path d="M-74-45h45v92h-45zM29-45h45v92H29z" fill="#57634e" stroke="#d2c9a6" stroke-width="5"/><path d="m-82-45 31-35 31 35M20-45l31-35 31 35" fill="#6a4e3b" stroke="#e0cfaa" stroke-width="5"/><path d="M-29 4h58v43h-58z" fill="#2a3328"/><path d="M-51-12h102" stroke="#d2c9a6" stroke-width="7"/></symbol>
          <symbol id="longHall" viewBox="-90 -70 180 120"><ellipse cy="39" rx="86" ry="18" fill="#243326" opacity=".32"/><path d="M-75-22h150v61H-75z" fill="#d0c6a3" stroke="#f0e8cf" stroke-width="4"/><path d="m-85-22 30-36h110l30 36Z" fill="#6b503e" stroke="#e0cfaa" stroke-width="5"/><path d="M-52 2h25v37M28 2h25v37" fill="#405043" stroke="#7c684e" stroke-width="4"/></symbol>
        </defs>

        <rect width="2400" height="1500" fill="url(#ground)"/>
        <path d="M0 250C280 165 530 190 760 260s500 80 760-20 520-150 880-50V980c-320 70-590 35-850-45s-520-85-780 5S400 1100 0 980Z" fill="url(#meadow)"/>
        <path d="M0 1180c350-130 610-40 880 40s540 110 820-10 470-100 700-20v310H0Z" fill="url(#water)"/>
        <path d="M0 1230c340-120 620-15 880 55s520 96 810-30 490-105 710-15" fill="none" stroke="#b4c9b6" stroke-width="24" opacity=".45"/>
        <path d="M-50 330C380 380 710 340 1010 430s590 140 930 75 430-20 520 10" fill="none" stroke="#6b765d" stroke-width="70" opacity=".3"/>
        <path d="M-50 330C380 380 710 340 1010 430s590 140 930 75 430-20 520 10" fill="none" stroke="url(#road)" stroke-width="42"/>
        <path d="M120 820C430 690 710 650 990 700s570 220 940 170 380 40 520 120" fill="none" stroke="#64705a" stroke-width="62" opacity=".26"/>
        <path d="M120 820C430 690 710 650 990 700s570 220 940 170 380 40 520 120" fill="none" stroke="url(#road)" stroke-width="36"/>
        <path d="M760 250c90 240 100 450 30 680" fill="none" stroke="url(#road)" stroke-width="30"/>
        <path d="M1440 350c-40 210-50 430 15 620" fill="none" stroke="url(#road)" stroke-width="30"/>

        <g class="world-terrain">${trees.join('')}</g>
        <g class="world-buildings" filter="url(#softShadow)">
          <use href="#stage" transform="translate(285 560) scale(1.06)"/>
          <use href="#stage" transform="translate(675 540) scale(1.08)"/>
          <use href="#stage" transform="translate(1280 725) scale(1.12)"/>
          <use href="#towerGate" transform="translate(1390 400)"/>
          <use href="#longHall" transform="translate(1185 875) scale(.9)"/>
          <use href="#longHall" transform="translate(1385 875) scale(.9)"/>
          ${tents.join('')}${booths.join('')}
        </g>
        <g class="world-details" filter="url(#tinyShadow)">
          <rect x="590" y="680" width="190" height="105" rx="12" fill="#72563d"/><path d="M575 680h220l-35-55H610Z" fill="#3e2f25"/>
          <circle cx="980" cy="690" r="62" fill="#526b53" stroke="#d8e2bf" stroke-width="12"/><circle cx="980" cy="690" r="37" fill="#d7ef69" opacity=".55"/><circle cx="980" cy="690" r="8" fill="#1b2a1e"/>
          <path d="M1060 1270h250" stroke="#8a6e4e" stroke-width="24"/><path d="M1110 1248v70M1190 1248v70M1270 1248v70" stroke="#654c35" stroke-width="12"/>
          <path d="M1120 1330c60-45 120-45 180 0-60 34-120 34-180 0Z" fill="#7f5e3f" stroke="#d3bf93" stroke-width="5"/>
          <path d="M1190 1325v-65l58 36Z" fill="#ded0a7" stroke="#7b6044" stroke-width="5"/>
          <g transform="translate(1780 620)"><rect x="-80" y="-30" width="140" height="65" rx="12" fill="#c6c9b7"/><rect x="-30" y="-52" width="62" height="28" rx="7" fill="#8ca5a2"/><circle cx="-48" cy="42" r="18" fill="#263128"/><circle cx="38" cy="42" r="18" fill="#263128"/></g>
        </g>
        <g class="world-route-layer">${routeLines}</g>
      </svg>`;
  }

  function markerHtml(poi,day,selected,next){
    const savedHere=poi.venue?selected.filter(e=>e.venue===poi.venue).length:0;
    const isNext=Boolean(next&&poi.venue===next.venue);
    const count=eventsAtPoi(day,poi).length;
    return `<button class="map-poi ${savedHere?'is-saved':''} ${isNext?'is-next':''}" data-poi="${poi.id}" data-category="${poi.category}" style="--x:${poi.x/WORLD.width*100}%;--y:${poi.y/WORLD.height*100}%;--poi:${poi.color||CATEGORY_META[poi.category].color}">
      <span class="poi-ground"></span>
      <span class="poi-figure">${iconSvg(poi.kind)}</span>
      <span class="poi-number">${poi.n}</span>
      ${count?`<span class="poi-count">${count}</span>`:''}
      <span class="poi-label">${esc(poi.short)}</span>
    </button>`;
  }

  function syncMetrics(){
    const top=Math.ceil(dayControls.getBoundingClientRect().height||72);
    document.documentElement.style.setProperty('--ff-map-top',`${top}px`);
  }

  function syncButtons(){
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('[data-map-view]').forEach(b=>b.classList.add('active'));
  }

  function openPoiSheet(poi){
    const day=currentDay();
    const items=eventsAtPoi(day,poi);
    const saved=readSaved();
    sheet.classList.add('route-venue-sheet');
    sheet.innerHTML=`<div class="grabber"></div><span class="sheet-label" style="color:${poi.color||CATEGORY_META[poi.category].color};background:rgba(255,255,255,.08)">Точка ${poi.n}</span><h3>${esc(poi.label)}</h3>
      <div class="route-venue-summary">${dayTitle(day)}${items.length?` · ${items.length} событий`:` · ${CATEGORY_META[poi.category].label}`}</div>
      ${items.length?`<div class="route-venue-list">${items.map(e=>`<button class="route-venue-event ${saved.has(e.id)?'is-saved':''}" data-event="${esc(e.id)}"><span class="route-venue-time">${time(e.start)}<small>${time(e.end)}</small></span><span class="route-venue-copy"><strong>${esc(e.title)}</strong><small>${saved.has(e.id)?'Добавлено в маршрут':'Открыть событие'}</small></span><span class="route-venue-star">${saved.has(e.id)?'★':'›'}</span></button>`).join('')}</div>`:`<div class="poi-description">${descriptionFor(poi)}</div>`}`;
    sheet.classList.add('open');
    sheetBackdrop.classList.add('open');
  }

  function descriptionFor(poi){
    const map={parking:'Зона въезда и парковки транспорта.',medical:'Пункт первой помощи.',craft:'Площадка практических занятий и мастер-классов.',tavern:'Зона отдыха и питания.',market:'Торговая зона фестиваля.',archery:'Площадка стрельбы из лука.',gate:'Главная зона входного контроля.',camp:'Территория размещения палаток.',boat:'Причал и водная зона.',vehicle:'Кемпинг автомобилей и мотоциклов.',shower:'Душевая зона фестиваля.'};
    return map[poi.kind]||'Инфраструктурная точка фестиваля.';
  }

  function layersPanel(){
    return `<div class="map-layer-panel ${layerPanelOpen?'is-open':''}" id="mapLayerPanel"><div class="map-layer-title">Слои карты</div>${Object.entries(CATEGORY_META).map(([key,meta])=>`<button class="map-layer-item ${visibleCategories.has(key)?'is-active':''}" data-layer="${key}"><span style="--layer:${meta.color}"></span>${meta.label}<b>${POIS.filter(p=>p.category===key).length}</b></button>`).join('')}</div>`;
  }

  function renderMap(){
    if(!mapActive) return;
    syncButtons(); syncMetrics();
    const day=currentDay();
    const selected=selectedEvents(day);
    const next=nextSaved(selected,day);
    const route=routePoiSequence(selected);
    const focus=next?poiForVenue(next.venue):(route[0]||POIS.find(p=>p.n===12));
    main.innerHTML=`<section class="map-v4" id="mapV4"><div class="map-viewport" id="mapViewport"><div class="map-stage" id="mapStage">${buildWorldSvg(route)}<div class="map-pois">${POIS.map(p=>markerHtml(p,day,selected,next)).join('')}</div></div>
      <div class="map-objective"><span>${next?'Следующая цель':`Карта · ${dayTitle(day)}`}</span><strong>${next?`${time(next.start)} · ${esc(next.title)}`:'Нажмите на объект, чтобы открыть информацию'}</strong></div>
      <button class="map-layers-button" data-map-ui="layers" aria-label="Слои карты"><svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></svg><span>Слои</span></button>
      ${layersPanel()}
      <div class="map-controls"><button data-map-action="zoom-in" aria-label="Увеличить">+</button><div data-map-scale>100%</div><button data-map-action="zoom-out" aria-label="Уменьшить">−</button><button data-map-action="focus" aria-label="К следующей цели"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button></div>
      <div class="map-hint">Тяните карту одним пальцем · нажмите на фигурку для программы</div>
    </div></section>`;
    requestAnimationFrame(()=>setupMap(focus));
  }

  function setupMap(initialPoi){
    controller?.abort(); controller=new AbortController(); const {signal}=controller;
    const viewport=document.querySelector('#mapViewport'); const stage=document.querySelector('#mapStage'); const root=document.querySelector('#mapV4');
    if(!viewport||!stage||!root) return;
    const view={zoom:1,x:0,y:0,baseScale:1}; const pointers=new Map(); let drag=null; let pinch=null; let raf=0;
    const focusWorld=initialPoi?{x:initialPoi.x,y:initialPoi.y}:{x:WORLD.width*.5,y:WORLD.height*.45};

    const clamp=()=>{
      const sw=WORLD.width*view.baseScale*view.zoom, sh=WORLD.height*view.baseScale*view.zoom;
      view.x=Math.min(0,Math.max(viewport.clientWidth-sw,view.x));
      view.y=Math.min(0,Math.max(viewport.clientHeight-sh,view.y));
    };
    const draw=()=>{raf=0;clamp();const scale=view.baseScale*view.zoom;stage.style.setProperty('--poi-inverse',String(1/scale));stage.style.transform=`translate3d(${view.x}px,${view.y}px,0) scale(${scale})`;root.querySelector('[data-map-scale]').textContent=`${Math.round(view.zoom*100)}%`;};
    const apply=()=>{if(!raf)raf=requestAnimationFrame(draw);};
    const focusOn=(point,keepZoom=false)=>{if(!keepZoom)view.zoom=1;const s=view.baseScale*view.zoom;view.x=viewport.clientWidth/2-point.x*s;view.y=viewport.clientHeight/2-point.y*s;apply();};
    const fit=()=>{view.baseScale=Math.max(viewport.clientWidth/WORLD.width,viewport.clientHeight/WORLD.height)*1.015;focusOn(focusWorld,true);};
    const zoomAt=(target,cx,cy)=>{const rect=viewport.getBoundingClientRect();const px=cx-rect.left,py=cy-rect.top;const old=view.baseScale*view.zoom;const wx=(px-view.x)/old,wy=(py-view.y)/old;view.zoom=Math.max(1,Math.min(MAX_ZOOM,target));const ns=view.baseScale*view.zoom;view.x=px-wx*ns;view.y=py-wy*ns;viewport.classList.add('is-used');apply();};

    viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;viewport.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});viewport.classList.add('is-used');if(pointers.size===1)drag={x:e.clientX,y:e.clientY,mapX:view.x,mapY:view.y};if(pointers.size===2){const[a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:view.zoom,x:view.x,y:view.y,mx:(a.x+b.x)/2,my:(a.y+b.y)/2};}}, {signal});
    viewport.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinch){const[a,b]=[...pointers.values()];const dist=Math.hypot(a.x-b.x,a.y-b.y);zoomAt(pinch.zoom*dist/Math.max(1,pinch.distance),(a.x+b.x)/2,(a.y+b.y)/2);}else if(pointers.size===1&&drag){view.x=drag.mapX+(e.clientX-drag.x);view.y=drag.mapY+(e.clientY-drag.y);apply();}}, {signal});
    const end=e=>{pointers.delete(e.pointerId);if(pointers.size===1){const p=[...pointers.values()][0];drag={x:p.x,y:p.y,mapX:view.x,mapY:view.y};}else drag=null;pinch=null;};
    viewport.addEventListener('pointerup',end,{signal});viewport.addEventListener('pointercancel',end,{signal});
    root.addEventListener('click',e=>{const action=e.target.closest('[data-map-action]')?.dataset.mapAction;if(!action)return;e.preventDefault();e.stopPropagation();const r=viewport.getBoundingClientRect();if(action==='zoom-in')zoomAt(view.zoom*1.4,r.left+r.width/2,r.top+r.height/2);if(action==='zoom-out')zoomAt(view.zoom/1.4,r.left+r.width/2,r.top+r.height/2);if(action==='focus')focusOn(focusWorld);},{signal});
    const ro=new ResizeObserver(fit);ro.observe(viewport);signal.addEventListener('abort',()=>ro.disconnect(),{once:true});fit();
  }

  function setMapActive(active){
    mapActive=active;document.body.classList.toggle('ff-route-map-active',active);document.querySelectorAll('[data-map-view]').forEach(b=>b.classList.toggle('active',active));
    if(active){window.scrollTo({top:0,behavior:'auto'});renderMap();}else{controller?.abort();controller=null;document.documentElement.style.removeProperty('--ff-map-top');sheet.classList.remove('route-venue-sheet');}
  }

  function injectTabs(){
    if(viewTabs.querySelector('[data-map-view]')||bottomNav.querySelector('[data-map-view]'))return;
    viewTabs.classList.add('ff-has-map');bottomNav.classList.add('ff-has-map');
    const top=document.createElement('button');top.className='view-tab ff-map-view-button';top.dataset.mapView='map';top.textContent='Карта';viewTabs.append(top);
    const bottom=document.createElement('button');bottom.className='ff-map-view-button';bottom.dataset.mapView='map';bottom.innerHTML='<span class="ff-map-nav-icon"><svg viewBox="0 0 24 24"><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2V6Z"/><path d="M8 4v13M16 7v13"/></svg></span>Карта';bottomNav.append(bottom);
  }

  injectTabs();
  document.addEventListener('click',e=>{
    const poiButton=e.target.closest('[data-poi]');
    if(mapActive&&poiButton){e.preventDefault();e.stopPropagation();const poi=POIS.find(p=>p.id===poiButton.dataset.poi);if(poi)openPoiSheet(poi);return;}
    const layer=e.target.closest('[data-layer]');
    if(mapActive&&layer){e.preventDefault();e.stopPropagation();const key=layer.dataset.layer;visibleCategories.has(key)?visibleCategories.delete(key):visibleCategories.add(key);document.querySelectorAll(`.map-poi[data-category="${key}"]`).forEach(el=>el.classList.toggle('is-filtered',!visibleCategories.has(key)));layer.classList.toggle('is-active',visibleCategories.has(key));return;}
    if(mapActive&&e.target.closest('[data-map-ui="layers"]')){e.preventDefault();e.stopPropagation();layerPanelOpen=!layerPanelOpen;document.querySelector('#mapLayerPanel')?.classList.toggle('is-open',layerPanelOpen);return;}
    if(e.target.closest('[data-map-view]')){e.preventDefault();setMapActive(true);return;}
    if(e.target.closest('[data-view]')){if(mapActive)setMapActive(false);return;}
    if(mapActive&&e.target.closest('[data-day]')){requestAnimationFrame(renderMap);return;}
    if(mapActive&&e.target.closest('[data-save]'))setTimeout(renderMap,0);
  });
})();
