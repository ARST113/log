;(function(){
    'use strict';
    console.log('[ResumeV3] start');

    /* ---------- CRC‑таблица (одна на сессию) ---------- */
    const crcTable = window.__crcT || (() => {
        const t = new Uint32Array(256);
        for(let n=0;n<256;n++){
            let c=n; for(let k=0;k<8;k++) c = (c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
            t[n]=c>>>0;
        }
        return (window.__crcT = t);
    })();
    const crc32 = s=>{
        let crc=-1;
        for(let i=0;i<s.length;i++)
            crc = (crc>>>8)^crcTable[(crc^s.charCodeAt(i))&0xFF];
        return (crc^-1)>>>0;
    };

    /* ---------- вставка кнопки ---------- */
    function addBtn(full){
        const $wrap = full.find('.full-start-new__buttons');
        if(!$wrap.length){ console.warn('[ResumeV3] .full-start-new__buttons not found'); return; }
        if($wrap.find('.resume-btn').length) return;          // уже есть

        const $btn = $(`
          <div class="full-start__button selector resume-btn" style="margin-left:auto">
            <svg width="26" height="26" viewBox="0 0 24 24"><path fill="#fff"
              d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
            <span>Продолжить</span>
          </div>`);

        /* --- логика resume --- */
        $btn.on('hover:enter', ()=>{                // корректное событие Лампы
            try{
                const cur = Lampa.Activity.active().item || {};
                const hash   = cur.hash;            // SHA1‑hex infoHash
                const index  = cur.file || 1;       // индекс файла в торренте
                if(!hash){ Lampa.Noty.show('Нет хеша — не могу продолжить'); return;}
                const crcKey = crc32(hash + ':' + index);
                const fv = JSON.parse(localStorage.getItem('file_view')||'{}');
                const rec = fv[crcKey];
                if(!rec){
                    Lampa.Noty.show('Нет сохранённого прогресса');
                    return;
                }
                console.log('[ResumeV3] CRC',crcKey,'→',rec);

                /* --- воспроизведение --- */
                Lampa.Player.play({
                    url       : cur.url,
                    timeline  : rec.time,
                    title     : cur.title     || 'Continue',
                    quality   : cur.quality   || {},
                    subtitles : cur.subtitles || []
                });
            }catch(e){ console.error('[ResumeV3]',e); }
        });

        $wrap.append($btn);
        console.log('[ResumeV3] кнопка добавлена');
    }

    /* ---------- инициализация ---------- */
    function init(){
        Lampa.Listener.follow('full', e=>{
            if(e.type==='complite'){
                setTimeout(()=>addBtn(e.object.activity.render()),80);
            }
        });
    }

    if(window.Lampa) init();
    else window.addEventListener('lampa:start', init);
})();
