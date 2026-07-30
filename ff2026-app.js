(() => {
  'use strict';

  const EVENTS = Array.isArray(window.FF_EVENTS) ? window.FF_EVENTS : [];
  const VENUE_COLORS = {
    'Сцена «Круг Света»':'#5B8CFF',
    'Сцена «Берег»':'#55C97A',
    'Сцена «Былина»':'#B77CFF',
    'Лекторий':'#F2C14E',
    'Литературная программа':'#FF7A8A',
    'Ристалище':'#35C5C2'
  };
  const VENUE_ORDER = [
    'Сцена «Круг Света»',
    'Сцена «Берег»',
    'Сцена «Былина»',
    'Лекторий',
    'Литературная программа',
    'Ристалище'
  ];
  const DAYS = [
    {id:'2026-07-31',short:'31 июля',long:'Пятница, 31 июля'},
    {id:'2026-08-01',short:'1 августа',long:'Суббота, 1 августа'},
    {id:'2026-08-02',short:'2 августа',long:'Воскресенье, 2 августа'}
  ];

  const state = {
    day:DAYS[0].id,
    view:'schedule',
    venues:new Set(VENUE_ORDER),
    query:'',
    saved:new Set(readSaved())
  };

  const $ = selector => document.querySelector(selector);
  const main = $('#main');
  const dayTabs = $('#dayTabs');
  const venueFilters = $('#venueFilters');
  const searchInput = $('#searchInput');
  const sheet = $('#sheet');
  const sheetBackdrop = $('#sheetBackdrop');
  const toast = $('#toast');

  function readSaved(){
    try{
      const data = JSON.parse(localStorage.getItem('ff26-saved') || '[]');
      return Array.isArray(data) ? data : [];
    }catch{
      return [];
    }
  }

  function minutes(iso){
    const match = String(iso).match(/T(\d{2}):(\d{2})/);
    if(!match) return NaN;
    return Number(match[1]) * 60 + Number(match[2]);
  }
  function fmtTime(iso){
    const match = String(iso).match(/T(\d{2}:\d{2})/);
    return match ? match[1] : '';
  }
  function duration(event){
    const n = minutes(event.end) - minutes(event.start);
    if(!Number.isFinite(n) || n <= 0) return '';
    const h = Math.floor(n/60), m = n%60;
    return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`;
  }
  function esc(value){
    return String(value).replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[char]);
  }
  function color(venue){return VENUE_COLORS[venue] || '#999'}
  function shortVenue(venue){
    return venue.replace('Сцена ','').replaceAll('«','').replaceAll('»','');
  }
  function venueRank(venue){
    const index=VENUE_ORDER.indexOf(venue);
    return index < 0 ? 999 : index;
  }
  function eventSort(a,b){
    return minutes(a.start)-minutes(b.start) || venueRank(a.venue)-venueRank(b.venue) || a.title.localeCompare(b.title,'ru');
  }
  function visibleBase(){
    const query=state.query.trim().toLocaleLowerCase('ru');
    return EVENTS.filter(event =>
      event.day===state.day &&
      state.venues.has(event.venue) &&
      (!query || `${event.title} ${event.venue}`.toLocaleLowerCase('ru').includes(query))
    ).sort(eventSort);
  }
  function allDayEvents(){
    return EVENTS.filter(event=>event.day===state.day).sort(eventSort);
  }
  function overlaps(a,b){
    if(a.day!==b.day) return false;
    const aStart=minutes(a.start),aEnd=minutes(a.end);
    const bStart=minutes(b.start),bEnd=minutes(b.end);
    return Number.isFinite(aStart+aEnd+bStart+bEnd) && aStart < bEnd && bStart < aEnd;
  }
  function conflictCount(event,pool=allDayEvents()){
    return pool.filter(other=>other.id!==event.id && overlaps(event,other)).length;
  }
  function selectedConflicts(){
    const selected=EVENTS.filter(event=>state.saved.has(event.id));
    const ids=new Set();
    for(let i=0;i<selected.length;i++){
      for(let j=i+1;j<selected.length;j++){
        if(overlaps(selected[i],selected[j])){
          ids.add(selected[i].id);
          ids.add(selected[j].id);
        }
      }
    }
    return ids;
  }

  function eventCard(event,selectedConflictIds=new Set()){
    const count=conflictCount(event);
    const saved=state.saved.has(event.id);
    return `
      <article class="event-card ${selectedConflictIds.has(event.id)?'has-conflict':''}" style="--venue:${color(event.venue)}" data-event="${esc(event.id)}">
        <div class="event-time"><strong>${fmtTime(event.start)}</strong><span>до ${fmtTime(event.end)}</span></div>
        <div>
          <div class="event-title">${esc(event.title)}</div>
          <div class="event-meta">
            <span class="badge venue">${esc(shortVenue(event.venue))}</span>
            <span class="badge">${duration(event)}</span>
            ${count?`<span class="badge conflict">${count} пересеч.</span>`:''}
          </div>
        </div>
        <button class="save-btn ${saved?'saved':''}" data-save="${esc(event.id)}" aria-label="${saved?'Убрать из маршрута':'Сохранить в маршрут'}">${saved?'★':'☆'}</button>
      </article>`;
  }

  function renderDays(){
    dayTabs.innerHTML=DAYS.map(day=>
      `<button class="day-tab ${state.day===day.id?'active':''}" data-day="${day.id}">${day.short}</button>`
    ).join('');
  }
  function renderVenues(){
    venueFilters.innerHTML=VENUE_ORDER.map(venue=>`
      <button class="venue-chip ${state.venues.has(venue)?'active':''}" data-venue="${esc(venue)}" style="--venue:${color(venue)}">
        <span class="dot"></span>${esc(shortVenue(venue))}
      </button>`).join('');
  }
  function syncViewButtons(){
    document.querySelectorAll('[data-view]').forEach(button=>{
      button.classList.toggle('active',button.dataset.view===state.view);
    });
  }
  function renderSchedule(){
    const data=visibleBase();
    const day=DAYS.find(item=>item.id===state.day);
    main.innerHTML=`
      <div class="section-head">
        <div><h2>${day.long}</h2><p>Сначала название события, затем площадка</p></div>
        <div class="counter">${data.length} из ${allDayEvents().length}</div>
      </div>
      <div class="timeline">${data.length?data.map(event=>eventCard(event)).join(''):'<div class="empty">По выбранным фильтрам событий нет.</div>'}</div>`;
  }

  function overlapSlices(events){
    const normalized=events.map(event=>({
      event,
      start:minutes(event.start),
      end:minutes(event.end)
    })).filter(item=>Number.isFinite(item.start) && Number.isFinite(item.end) && item.end>item.start);

    const points=[...new Set(normalized.flatMap(item=>[item.start,item.end]))].sort((a,b)=>a-b);
    const slices=[];

    for(let index=0;index<points.length-1;index++){
      const start=points[index];
      const end=points[index+1];
      if(end<=start) continue;

      const active=normalized
        .filter(item=>item.start<end && item.end>start)
        .map(item=>item.event)
        .sort(eventSort);

      if(active.length<2) continue;

      const key=active.map(event=>event.id).sort().join('|');
      const previous=slices.at(-1);
      if(previous && previous.key===key && previous.end===start){
        previous.end=end;
      }else{
        slices.push({start,end,active,key});
      }
    }

    const represented=new Set(slices.flatMap(slice=>slice.active.map(event=>event.id)));
    for(const item of normalized){
      if(represented.has(item.event.id)) continue;
      const partner=normalized.find(other=>other.event.id!==item.event.id && item.start<other.end && other.start<item.end);
      if(!partner) continue;
      const start=Math.max(item.start,partner.start);
      const end=Math.min(item.end,partner.end);
      const active=[item.event,partner.event].sort(eventSort);
      slices.push({start,end,active,key:`fallback:${active.map(event=>event.id).sort().join('|')}`});
    }

    return slices.sort((a,b)=>a.start-b.start || a.end-b.end);
  }
  function hm(value){
    return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  }
  function renderOverlaps(){
    const data=visibleBase();
    const slices=overlapSlices(data);
    const representedVenues=new Set(slices.flatMap(slice=>slice.active.map(event=>event.venue)));
    const venueNote=representedVenues.has('Ристалище') ? '' : '<p style="color:#ffb0b0">Ристалище не попало в текущую выборку: проверьте фильтр площадок или поиск.</p>';

    main.innerHTML=`
      <div class="section-head">
        <div><h2>Одновременные события</h2><p>Точные интервалы, когда идут два события и более</p>${venueNote}</div>
        <div class="counter">${slices.length} интервалов</div>
      </div>
      ${slices.length?slices.map(slice=>`
        <section class="overlap-block">
          <div class="overlap-head">
            <div class="overlap-time">${hm(slice.start)}–${hm(slice.end)}</div>
            <div class="overlap-count">${slice.active.length} одновременно</div>
          </div>
          <div class="overlap-events">
            ${slice.active.map(event=>`
              <div class="overlap-mini" style="--venue:${color(event.venue)}" data-event="${esc(event.id)}">
                <div class="bar"></div>
                <div><strong>${esc(event.title)}</strong><span>${esc(shortVenue(event.venue))} · ${fmtTime(event.start)}–${fmtTime(event.end)}</span></div>
              </div>`).join('')}
          </div>
        </section>`).join(''):'<div class="empty">Для выбранных площадок пересечений нет.</div>'}`;
  }

  function renderSaved(){
    const selected=EVENTS.filter(event=>state.saved.has(event.id)).sort((a,b)=>a.start.localeCompare(b.start));
    const conflicts=selectedConflicts();
    $('#savedStat').textContent=selected.length;
    main.innerHTML=`
      <div class="section-head">
        <div><h2>Мой маршрут</h2><p>${conflicts.size?`Конфликтуют ${conflicts.size} сохранённых событий`:'Пересечений среди выбранного нет'}</p></div>
        <div class="counter">${selected.length} сохранено</div>
      </div>
      ${selected.length?`
        <div class="saved-actions">
          <button class="primary-btn" id="downloadIcs">Скачать мой маршрут</button>
          <button class="secondary-btn" id="clearSaved">Очистить</button>
        </div>
        ${DAYS.map(day=>{
          const items=selected.filter(event=>event.day===day.id);
          return items.length?`<section style="margin-bottom:20px"><div class="section-head"><div><h2 style="font-size:17px">${day.long}</h2></div><div class="counter">${items.length}</div></div><div class="timeline">${items.map(event=>eventCard(event,conflicts)).join('')}</div></section>`:'';
        }).join('')}
      `:'<div class="empty">Нажмите ☆ у события, чтобы собрать личный маршрут и проверить пересечения.</div>'}`;
  }
  function render(){
    renderDays();
    renderVenues();
    syncViewButtons();
    if(state.view==='schedule') renderSchedule();
    if(state.view==='overlaps') renderOverlaps();
    if(state.view==='saved') renderSaved();
    $('#savedStat').textContent=state.saved.size;
  }
  function saveState(){
    try{localStorage.setItem('ff26-saved',JSON.stringify([...state.saved]))}catch{}
  }
  function notify(text){
    toast.textContent=text;
    toast.classList.add('show');
    clearTimeout(notify.timer);
    notify.timer=setTimeout(()=>toast.classList.remove('show'),1500);
  }
  function toggleSave(id){
    if(state.saved.has(id)){
      state.saved.delete(id);
      notify('Удалено из маршрута');
    }else{
      state.saved.add(id);
      notify('Добавлено в маршрут');
    }
    saveState();
    render();
  }
  function showEvent(id){
    const event=EVENTS.find(item=>item.id===id);
    if(!event) return;
    const count=conflictCount(event);
    sheet.innerHTML=`
      <div class="grabber"></div>
      <span class="sheet-label" style="color:${color(event.venue)};background:rgba(255,255,255,.08)">${esc(event.venue)}</span>
      <h3>${esc(event.title)}</h3>
      <div class="sheet-info">
        <div><span>Время</span><strong>${fmtTime(event.start)}–${fmtTime(event.end)}</strong></div>
        <div><span>Продолжительность</span><strong>${duration(event)}</strong></div>
        <div><span>Дата</span><strong>${DAYS.find(day=>day.id===event.day).short}</strong></div>
        <div><span>Пересечения</span><strong>${count?`${count} событий`:'Нет'}</strong></div>
      </div>
      <button class="primary-btn" data-save="${esc(event.id)}">${state.saved.has(event.id)?'Убрать из маршрута':'Добавить в маршрут'}</button>`;
    sheet.classList.add('open');
    sheetBackdrop.classList.add('open');
  }
  function closeSheet(){
    sheet.classList.remove('open');
    sheetBackdrop.classList.remove('open');
  }
  function downloadSelectedIcs(){
    const selected=EVENTS.filter(event=>state.saved.has(event.id)).sort((a,b)=>a.start.localeCompare(b.start));
    const dateTime=iso=>iso.slice(0,16).replaceAll('-','').replace('T','T').replace(':','')+'00';
    const escapeIcs=value=>value.replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');
    const ics=['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN','PRODID:-//Fantasy Fest Route//RU','X-WR-CALNAME:Мой маршрут — Фэнтези Фест 2026','X-WR-TIMEZONE:Europe/Moscow'];
    selected.forEach(event=>ics.push(
      'BEGIN:VEVENT',
      `UID:${event.id}`,
      `DTSTART;TZID=Europe/Moscow:${dateTime(event.start)}`,
      `DTEND;TZID=Europe/Moscow:${dateTime(event.end)}`,
      `SUMMARY:${escapeIcs(`${event.title} — ${event.venue}`)}`,
      `LOCATION:${escapeIcs(event.venue)}`,
      'END:VEVENT'
    ));
    ics.push('END:VCALENDAR');
    const blob=new Blob([ics.join('\r\n')],{type:'text/calendar;charset=utf-8'});
    const link=document.createElement('a');
    link.href=URL.createObjectURL(blob);
    link.download='Мой_маршрут_Фэнтези_Фест_2026.ics';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),500);
  }
  function resetScroll(){
    const controls=$('.control-shell');
    const top=Math.max(0,(controls?.offsetTop || 0));
    window.scrollTo({top,behavior:'auto'});
  }

  document.addEventListener('click',event=>{
    const dayButton=event.target.closest('[data-day]');
    if(dayButton){state.day=dayButton.dataset.day;render();return}

    const viewButton=event.target.closest('[data-view]');
    if(viewButton){state.view=viewButton.dataset.view;render();resetScroll();return}

    const venueButton=event.target.closest('[data-venue]');
    if(venueButton){
      const venue=venueButton.dataset.venue;
      state.venues.has(venue)?state.venues.delete(venue):state.venues.add(venue);
      render();
      return;
    }

    const saveButton=event.target.closest('[data-save]');
    if(saveButton){
      event.stopPropagation();
      toggleSave(saveButton.dataset.save);
      closeSheet();
      return;
    }

    const eventElement=event.target.closest('[data-event]');
    if(eventElement){showEvent(eventElement.dataset.event);return}

    if(event.target.id==='downloadIcs'){downloadSelectedIcs();return}
    if(event.target.id==='clearSaved'){
      state.saved.clear();
      saveState();
      render();
      notify('Маршрут очищен');
    }
  });

  searchInput.addEventListener('input',event=>{
    state.query=event.target.value;
    render();
  });
  $('#clearBtn').addEventListener('click',()=>{
    state.query='';
    searchInput.value='';
    state.venues=new Set(VENUE_ORDER);
    render();
  });
  sheetBackdrop.addEventListener('click',closeSheet);
  document.addEventListener('keydown',event=>{if(event.key==='Escape') closeSheet()});

  render();
})();
