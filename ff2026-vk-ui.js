(() => {
  'use strict';

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

  function buildProfile(event){
    const profile = profileFor(event.title);
    if(!profile) return '';
    const description = profile.description || profile.status || '';
    const members = formatMembers(profile.members_count);
    return `
      <section class="vk-profile" aria-label="Описание сообщества ВКонтакте">
        <div class="vk-profile-head">
          ${profile.photo ? `<img class="vk-profile-photo" src="${escapeHtml(profile.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
          <div class="vk-profile-title">
            <span>Сообщество ВКонтакте</span>
            <strong>${escapeHtml(profile.name || event.title)}</strong>
            ${profile.activity ? `<small>${escapeHtml(profile.activity)}</small>` : ''}
          </div>
        </div>
        ${description ? `<p class="vk-profile-description">${escapeHtml(description)}</p>` : ''}
        <div class="vk-profile-footer">
          ${members ? `<span>${escapeHtml(members)}</span>` : '<span>Официальная страница исполнителя</span>'}
          ${profile.url ? `<a class="vk-profile-link" href="${escapeHtml(profile.url)}" target="_blank" rel="noopener noreferrer">Открыть ВК</a>` : ''}
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
