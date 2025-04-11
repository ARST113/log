(function(){
    'use strict';

    Lampa.Listener.follow('activity', (e)=>{
        console.log('[ACTIVITY DEBUG]', e?.object?.activity?.name, e);
    });
})();
