window.FF_VK_PROFILES=window.FF_VK_PROFILES||{};
window.FF_VK_META={source:"manual",version:2};
window.FF_VK_READY=fetch("vk-manual-profiles.json?v=2",{cache:"no-store"})
  .then(function(response){
    if(!response.ok) throw new Error("VK profiles HTTP "+response.status);
    return response.json();
  })
  .then(function(profiles){
    if(profiles&&typeof profiles==="object") Object.assign(window.FF_VK_PROFILES,profiles);
    window.FF_VK_META.matched=Object.keys(window.FF_VK_PROFILES).length;
    return window.FF_VK_PROFILES;
  })
  .catch(function(error){
    console.warn("Fantasy Fest VK profiles were not loaded",error);
    return window.FF_VK_PROFILES;
  });
