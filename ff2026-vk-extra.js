window.FF_VK_EXTRA_READY=Promise.all([
  fetch("vk-manual-profiles-2.json?v=3",{cache:"no-store"}).then(function(response){
    if(!response.ok) throw new Error("VK extra profiles HTTP "+response.status);
    return response.json();
  }),
  fetch("vk-groups-map.json?v=3",{cache:"no-store"}).then(function(response){
    if(!response.ok) throw new Error("VK map HTTP "+response.status);
    return response.json();
  })
]).then(function(results){
  const profiles=results[0]||{};
  const communityMap=results[1]||{};
  window.FF_VK_PROFILES=window.FF_VK_PROFILES||{};

  if(profiles&&typeof profiles==="object") Object.assign(window.FF_VK_PROFILES,profiles);

  Object.entries(communityMap).forEach(function(entry){
    const title=entry[0];
    const identifier=entry[1];
    if(title.startsWith("_")||!identifier) return;
    const url=String(identifier).startsWith("http")
      ? String(identifier)
      : "https://vk.com/"+String(identifier).replace(/^\/+/,"");
    if(!window.FF_VK_PROFILES[title]){
      window.FF_VK_PROFILES[title]={name:title,description:"",activity:"",members_count:0,source:"verified-map"};
    }
    window.FF_VK_PROFILES[title].url=url;
  });

  const withVk=Object.values(window.FF_VK_PROFILES).filter(function(profile){
    return profile&&profile.url;
  }).length;

  window.FF_VK_META=Object.assign({},window.FF_VK_META||{}, {
    matched:Object.keys(window.FF_VK_PROFILES).length,
    with_vk:withVk,
    total_schedule_musicians:69,
    source:"verified VK community map and curated public profiles"
  });
  return window.FF_VK_PROFILES;
}).catch(function(error){
  console.warn("Additional Fantasy Fest VK profiles were not loaded",error);
  return window.FF_VK_PROFILES||{};
});
window.FF_VK_READY=Promise.all([
  window.FF_VK_READY||Promise.resolve(window.FF_VK_PROFILES||{}),
  window.FF_VK_EXTRA_READY
]).then(function(){return window.FF_VK_PROFILES||{};});