window.FF_YM_PROFILES=window.FF_YM_PROFILES||{};
window.FF_YM_META=window.FF_YM_META||{};
window.FF_YM_READY=fetch("ff2026-yandex.json?ts="+Date.now(),{cache:"no-store"})
  .then(function(response){
    if(!response.ok) throw new Error("Yandex Music database HTTP "+response.status);
    return response.json();
  })
  .then(function(payload){
    if(payload&&payload.profiles&&typeof payload.profiles==="object"){
      window.FF_YM_PROFILES=payload.profiles;
    }
    if(payload&&payload.meta&&typeof payload.meta==="object"){
      window.FF_YM_META=payload.meta;
    }
    return window.FF_YM_PROFILES;
  })
  .catch(function(error){
    console.warn("Yandex Music links were not loaded",error);
    return window.FF_YM_PROFILES;
  });
