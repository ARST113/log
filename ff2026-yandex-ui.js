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
  const iconMarkup=()=>`
    <svg class="ym-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8.1 6.8v8.4M12 4.8v14.4M15.9 7.8v6.4" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>
    </svg>`;

  async function insertYandexLink(eventId){
    if(window.FF_YM_READY){
      try{await window.FF_YM_READY}catch{}
    }
    const event=(window.FF_EVENTS||[]).find(item=>item.id===eventId);
    const sheet=document.querySelector('#sheet');
    if(!event||!MUSIC_VENUES.has(event.venue)||!sheet||sheet.querySelector('.ym-profile-link')) return;

    const profile=(window.FF_YM_PROFILES||{})[event.title];
    if(!profile||profile.kind!=='artist'||!profile.url) return;

    const label='Слушать в Яндекс Музыке';
    const link=`<a class="ym-profile-link" href="${escapeHtml(profile.url)}" target="_blank" rel="noopener noreferrer" aria-label="${label}" title="${label}">${iconMarkup()}</a>`;
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
    const standalone=`<section class="ym-profile"><span>Слушать</span>${link}</section>`;
    if(action) action.insertAdjacentHTML('beforebegin',standalone);
    else sheet.insertAdjacentHTML('beforeend',standalone);
  }

  document.addEventListener('click',click=>{
    const eventElement=click.target.closest('[data-event]');
    if(!eventElement) return;
    requestAnimationFrame(()=>insertYandexLink(eventElement.dataset.event));
  });
})();
