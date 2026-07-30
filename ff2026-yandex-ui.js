(() => {
  'use strict';

  const MUSIC_VENUES=new Set([
    'Сцена «Круг Света»',
    'Сцена «Берег»',
    'Сцена «Былина»'
  ]);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
  const DIRECT_ARTIST_URL=/^https:\/\/music\.yandex\.ru\/artist\/\d+\/?$/;
  const iconMarkup=()=>`
    <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100" height="100" viewBox="0 0 50 50" aria-hidden="true" focusable="false">
      <path fill="#ffca28" d="M43.79,18.14l-5.07,4.06C38.9,23.11,39,24.04,39,25c0,7.72-6.28,14-14,14s-14-6.28-14-14 c0-7.04,5.22-12.88,12-13.86V5.1C12.9,6.11,5,14.65,5,25c0,11.03,8.97,20,20,20s20-8.97,20-20C45,22.59,44.57,20.28,43.79,18.14z"></path>
      <circle cx="25" cy="25" r="7" fill="#f4511e"></circle>
      <path fill="#f4511e" d="M39.99,11.77l-3.41,5.37c-1.79-2.63-4.46-4.63-7.58-5.56V5.4C33.33,6.28,37.17,8.57,39.99,11.77z"></path>
      <rect width="3" height="16" x="29" y="9" fill="#f4511e"></rect>
    </svg>`;

  async function insertYandexLink(eventId){
    if(window.FF_YM_READY){
      try{await window.FF_YM_READY}catch{}
    }
    const event=(window.FF_EVENTS||[]).find(item=>item.id===eventId);
    const sheet=document.querySelector('#sheet');
    if(!event||!MUSIC_VENUES.has(event.venue)||!sheet||sheet.querySelector('.ym-profile-link')) return;

    const profile=(window.FF_YM_PROFILES||{})[event.title];
    if(!profile||profile.kind!=='artist'||!DIRECT_ARTIST_URL.test(String(profile.url||''))) return;

    const label=`Слушать ${profile.name||event.title} в Яндекс Музыке`;
    const link=`<a class="ym-profile-link" href="${escapeHtml(profile.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}" title="Яндекс Музыка">${iconMarkup()}</a>`;
    const footer=sheet.querySelector('.vk-profile-footer');
    if(footer){
      let actions=footer.querySelector('.profile-service-actions');
      if(!actions){
        footer.insertAdjacentHTML('beforeend','<span class="profile-service-actions"></span>');
        actions=footer.querySelector('.profile-service-actions');
      }
      actions.insertAdjacentHTML('beforeend',link);
      return;
    }

    const action=sheet.querySelector('.primary-btn');
    const standalone=`<div class="ym-profile ym-profile--icon-only">${link}</div>`;
    if(action) action.insertAdjacentHTML('beforebegin',standalone);
    else sheet.insertAdjacentHTML('beforeend',standalone);
  }

  document.addEventListener('click',click=>{
    const eventElement=click.target.closest('[data-event]');
    if(!eventElement) return;
    requestAnimationFrame(()=>insertYandexLink(eventElement.dataset.event));
  });
})();