(() => {
  'use strict';

  const SEARCH_ALIASES={
    ':LUDENVEN:':'LÜDENVËN',
    'Артмис (Мария Розалка)':'Мария Розалка',
    'Дэн Назгул и Nazgul Band':'Дэн Назгул',
    "Канцлер Ги & Bregan D'Ert":'Канцлер Ги',
    'Сергей Хоббит и Instruktor':'Сергей Хоббит',
    'Septimiy и Симфоническое фэнтези':'Septimiy',
    'V Стихий':'5 Стихий',
    'Infornal F.':'Infornal FuckЪ',
    'Ростислав Чебыкин и «4т-Бэнд»':'Ростислав Чебыкин'
  };
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
  const fallbackProfile=title=>{
    const query=SEARCH_ALIASES[title]||title;
    return {
      name:title,
      kind:'search',
      url:'https://music.yandex.ru/search?text='+encodeURIComponent(query)
    };
  };

  async function insertYandexLink(eventId){
    if(window.FF_YM_READY){
      try{await window.FF_YM_READY}catch{}
    }
    const event=(window.FF_EVENTS||[]).find(item=>item.id===eventId);
    const sheet=document.querySelector('#sheet');
    if(!event||!sheet||sheet.querySelector('.ym-profile-link')) return;
    const profile=(window.FF_YM_PROFILES||{})[event.title]||fallbackProfile(event.title);
    if(!profile.url) return;

    const label=profile.kind==='artist'?'Слушать в Яндекс Музыке':'Найти в Яндекс Музыке';
    const link=`<a class="ym-profile-link" href="${escapeHtml(profile.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</a>`;
    const footer=sheet.querySelector('.vk-profile-footer');
    if(footer){
      footer.insertAdjacentHTML('beforeend',link);
      return;
    }

    const action=sheet.querySelector('.primary-btn');
    const standalone=`<section class="ym-profile"><div><span>Яндекс Музыка</span><strong>${escapeHtml(profile.name||event.title)}</strong></div>${link}</section>`;
    if(action) action.insertAdjacentHTML('beforebegin',standalone);
    else sheet.insertAdjacentHTML('beforeend',standalone);
  }

  document.addEventListener('click',click=>{
    const eventElement=click.target.closest('[data-event]');
    if(!eventElement) return;
    requestAnimationFrame(()=>insertYandexLink(eventElement.dataset.event));
  });
})();
