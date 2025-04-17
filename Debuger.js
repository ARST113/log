/************************  Continue / Return.js  *************************
 * Добавляет кнопку «Продолжить» в карточке фильма/серии и
 * возобновляет воспроизведение с последней сохранённой позиции.
 * Для официальной Lampa – позиция берётся из Storage‑ключа file_view.
 ***********************************************************************/

(function () {
    'use strict';

    /********************* i18n *********************/
    Lampa.Lang.add({
        continue_title:   { ru:'Продолжить', uk:'Продовжити', en:'Continue', zh:'继续',  bg:'Продължи' },
        continue_message:{ ru:'Возобновить просмотр', uk:'Відновити перегляд', en:'Resume', zh:'继续播放', bg:'Продължи гледането' }
    });

    /********************* CRC32 (hex‑hash -> int key) *********************/
    function crc32(str){
        let crc = -1;
        for (let i = 0; i < str.length; i++){
            let c = (crc ^ str.charCodeAt(i)) & 255;
            for (let k = 0; k < 8; k++)
                c = ((c & 1) ? 0xEDB88320 : 0) ^ (c >>> 1);
            crc = (crc >>> 8) ^ c;
        }
        return (crc ^ (-1)) >>> 0;   // 0 … 4 294 967 295
    }

    /********************* основной код *********************/
    function initPlugin(){
        console.log('[ReturnPlugin] init ok');

        Lampa.Listener.follow('full', e => {
            if (e.type !== 'complite') return;

            setTimeout(() => {
                try{
                    const $card = e.object.activity.render();
                    const newUI = (Lampa.Storage.get('card_interface_type') || 'old') === 'new';
                    const $target = newUI ? $card.find('.button--play')
                                          : $card.find('.view--torrent');

                    if (!$target.length){
                        console.warn('[ReturnPlugin] контейнер не найден');
                        return;
                    }

                    /* ---------- создаём / вставляем кнопку ---------- */
                    const btnHTML = `
                       <div class="full-start__button selector view--continue return--button"
                            title="${Lampa.Lang.translate('continue_message')}">
                           <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
                               <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
                           </svg>
                           <span>${Lampa.Lang.translate('continue_title')}</span>
                       </div>`;
                    const $btn = $(btnHTML);

                    // если кнопка уже вставлена — не дублируем
                    if (!$card.find('.return--button').length){
                        $target.before($btn);
                        console.log('[ReturnPlugin] кнопка «Продолжить» вставлена');
                    }

                    /* ---------- обработчик нажатия ---------- */
                    $btn.off('hover:enter').on('hover:enter', () => {
                        console.log('[ReturnPlugin] кнопка нажата');

                        /* 1. URL текущего/последнего плеера */
                        const src = Lampa.Player.src() || '';
                        if (!src){
                            Lampa.Noty.show('Нет активного URL для возобновления');
                            return;
                        }
                        const u     = new URL(src);
                        const link  = u.searchParams.get('link')   || '';
                        const index = u.searchParams.get('index')  || '0';

                        /* 2. CRC32(link+index) – ключ в file_view */
                        const fvKey = crc32(link + index).toString();
                        const fvObj = Lampa.Storage.get('file_view') || {};
                        const saved = fvObj[fvKey]?.time || 0;

                        console.log('[ReturnPlugin] link =', link,
                                    'index =', index,
                                    'crc32 =', fvKey,
                                    'saved time =', saved);

                        /* 3. Запуск плеера */
                        Lampa.Player.play({
                            url     : src,
                            title   : document.title || '',
                            timeline: saved
                        });
                    });

                }catch(err){
                    console.error('[ReturnPlugin] ошибка вставки:', err);
                }
            }, 150); // ждём, пока карточка дорендерится
        });
    }

    /********************* bootstrap *********************/
    if (window.Lampa) initPlugin();
    else document.addEventListener('lampa:start', initPlugin);
})();
