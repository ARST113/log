window.FF_VK_EXTRA_READY=fetch("vk-manual-profiles-2.json?v=2",{cache:"no-store"})
  .then(function(response){
    if(!response.ok) throw new Error("VK extra profiles HTTP "+response.status);
    return response.json();
  })
  .then(function(profiles){
    window.FF_VK_PROFILES=window.FF_VK_PROFILES||{};
    if(profiles&&typeof profiles==="object") Object.assign(window.FF_VK_PROFILES,profiles);

    const verifiedUrls={
      "Проект-А":"https://vk.com/proekta_okulovka"
    };
    Object.entries(verifiedUrls).forEach(function(entry){
      const title=entry[0],url=entry[1];
      if(window.FF_VK_PROFILES[title]) window.FF_VK_PROFILES[title].url=url;
    });

    window.FF_VK_META=Object.assign({},window.FF_VK_META||{}, {
      matched:Object.keys(window.FF_VK_PROFILES).length,
      total_schedule_musicians:69,
      source:"verified VK links and curated public profiles"
    });
    return window.FF_VK_PROFILES;
  })
  .catch(function(error){
    console.warn("Additional Fantasy Fest VK profiles were not loaded",error);
    return window.FF_VK_PROFILES||{};
  });
window.FF_VK_READY=Promise.all([
  window.FF_VK_READY||Promise.resolve(window.FF_VK_PROFILES||{}),
  window.FF_VK_EXTRA_READY
]).then(function(){return window.FF_VK_PROFILES||{};});