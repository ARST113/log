(() => {
  'use strict';

  const VK_LOGO='https://upload.wikimedia.org/wikipedia/commons/f/f3/VK_Compact_Logo_%282021-present%29.svg';
  const profileFor = title => {
    const profiles = window.FF_VK_PROFILES || {};
    return profiles[title] || null;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
  const formatMembers = value => {
    const count = Number(value || 0);
    return count > 0 ? new Intl.NumberFormat('ru-RU').format(count) + ' подписчиков' : '';
  };

  function vkIconLink(url){
    const label='Открыть ВКонтакте';
    return `<a class="vk-profile-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${label}" title="${label}"><img class="vk-icon-img" src="${VK_LOGO}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`;
  }

  function buildProfile(event){
    const profile = profileFor(event.title);
    if(!profile) return '';
    const description = profile.description || profile.status || '';
    const members = formatMembers(profile.members_count);
    const hasVk = Boolean(profile.url);
    return `
      <section class="vk-profile" aria-label="Описание исполнителя">
        <div class="vk-profile-head">
          ${profile.photo ? `<img class="vk-profile-photo" src="${escapeHtml(profile.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
          <div class="vk-profile-title">
            <span>${hasVk ? 'ВКонтакте' : 'Об исполнителе'}</span>
            <strong>${escapeHtml(profile.name || event.title)}</strong>
            ${profile.activity ? `<small>${escapeHtml(profile.activity)}</small>` : ''}
          </div>
        </div>
        ${description ? `<p class="vk-profile-description">${escapeHtml(description)}</p>` : ''}
        <div class="vk-profile-footer">
          ${members ? `<span>${escapeHtml(members)}</span>` : `<span>${hasVk ? 'Страница исполнителя' : 'Информация о проекте'}</span>`}
          ${hasVk ? `<span class="profile-service-actions">${vkIconLink(profile.url)}</span>` : ''}
        </div>
      </section>`;
  }

  async function insertProfile(eventId){
    if(window.FF_VK_READY){
      try{ await window.FF_VK_READY; }catch{}
    }
    const event = (window.FF_EVENTS || []).find(item => item.id === eventId);
    const sheet = document.querySelector('#sheet');
    if(!event || !sheet || sheet.querySelector('.vk-profile')) return;
    const markup = buildProfile(event);
    if(!markup) return;
    const action = sheet.querySelector('.primary-btn');
    if(action) action.insertAdjacentHTML('beforebegin', markup);
    else sheet.insertAdjacentHTML('beforeend', markup);
  }

  document.addEventListener('click', click => {
    const eventElement = click.target.closest('[data-event]');
    if(!eventElement) return;
    requestAnimationFrame(() => insertProfile(eventElement.dataset.event));
  });
})();