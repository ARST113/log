// ==UserScript==
// @name         Lampa / Continue Playing
// @description  Кнопка «Продолжить» на карточке фильма/серии
// @match        *://lampa/*
// ==/UserScript==

/*  ──────────────────── util ────────────────────  */
function crc32(str){
    let crc = -1;
    for (let i = 0; i < str.length; i++){
        let c = (crc ^ str.charCodeAt(i)) & 255;
        for (let k = 0; k < 8; k++) c = ((c & 1) ? 0xEDB88320 : 0) ^ (c >>> 1);
        crc = (crc >>> 8) ^ c;
    }
    return (crc ^ (-1)) >>> 0;          // uint32
}

function getSavedPosition(link, index){
    const key     = crc32(link + index);          // то же, что делает Lampa
    const fview   = Lampa.Storage.get('file_view') || {};
    const rec     = fview[key];
    return rec && rec.time ? rec.time : 0;
}

/*  ──────────────────── main UI ────────────────────  */
function injectButton(){
    // контейнер с кнопками на странице описания фильма/серии
    const $panel = $('.about__actions, .info__actions').first();
    if(!$panel.length) return;

    if($panel.find('.btn--continue').length) return;      // уже вставили

    const $btn = $(`
        <div class="selector button btn btn--green btn--continue">
            <span>Продолжить</span>
        </div>`);

    $panel.prepend($btn);

    $btn.on('hover:enter', async ()=>{

        console.log('[ContinuePlugin] кнопка нажата');

        /* пытаемся извлечь данные последней выбранной раздачи ----------------- */
        // 1) контейнер активного TorrServer‑потока
        const activeItem = $('.torrent-item.selector--checked').first();
        if(!activeItem.length){
            Lampa.Noty.show('Нет выбранного торрента');
            return;
        }

        const link  = activeItem.data('hash');           // hex‑хэш .torrent
        const index = activeItem.data('index') || 0;     // номер файла
        if(!link){ Lampa.Noty.show('Не найден hash торрента'); return; }

        const resumeTime = getSavedPosition(link, index);
        console.log('[ContinuePlugin] resumeTime =', resumeTime);

        /* 2) эмулируем штатную кнопку «Смотреть» ------------------------------ */
        $('.button--play:eq(0)').trigger('hover:enter');

        /* 3) ждём появления <video> и делаем seek ----------------------------- */
        const waitVideo = ()=>new Promise(res=>{
            let t = setInterval(()=>{
                const v = $('video.player-video__video')[0];
                if(v && v.readyState >= 2){ clearInterval(t); res(v); }
            }, 500);
        });

        try{
            const video = await waitVideo();
            if(resumeTime){
                video.currentTime = resumeTime;
                console.log('[ContinuePlugin] перемотка на', resumeTime);
            }
        }catch(e){
            console.error('[ContinuePlugin] video seek error:', e);
        }
    });
}

/*  ──────────────────── boot strap ────────────────────  */
function init(){
    // кнопку вставляем каждый раз при открытии карточки
    Lampa.Listener.follow('activity', e=>{
        if(e.type === 'view' && /about|full/.test(e.name)) setTimeout(injectButton, 500);
    });
}

/* ждём, пока Lampa загрузится */
if(window.Lampa) init();
else document.addEventListener('lampa:start', init, {once:true});
