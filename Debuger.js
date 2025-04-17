/*
 * Lampa Resume‑Hash Plugin
 * -----------------------
 * Сохраняет torrent‑hash + позицию просмотра и показывает кнопку «Продолжить»
 * в карточке фильма/серии.  Полностью переписанная версия без крэш‑ов buildKey.
 */

(function(){
    /**
     * Имя ключа в Lampa.Storage
     * Формат value:
     * {
     *   [key:string]: {
     *      hash: string,
     *      position: number,   // секунд
     *      updated:  number    // Date.now()
     *   }
     * }
     */
    const STORAGE_FIELD = 'resume_hashes';

    /**
     * Безопасно достаём объект из Storage
     */
    function getStorage(){
        const raw = Lampa.Storage.get(STORAGE_FIELD, '{}');
        try{
            // V1 плагина сохранял массив – на всякий случай преобразуем
            if(Array.isArray(raw)) return {};
            return typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        }catch(e){
            console.warn('[Resume] broken storage – reset', e);
            return {};
        }
    }

    /**
     * Сохраняем состояние обратно
     */
    function setStorage(obj){
        Lampa.Storage.set(STORAGE_FIELD, JSON.stringify(obj), true);
    }

    /**
     * Формируем ключ – одинаково для фильма и эпизода.
     *  - Для фильма:     <id>
     *  - Для сериала:    <id>:<season>:<episode>
     */
    function buildKey(meta){
        if(!meta) return 'unknown';

        /*
         * 1. Универсальный идентификатор карточки.
         *    Для кинопоиска —  kp_id, для tmdb — id, для торрентов может быть torrent_id.
         */
        const id = meta.id || meta.kp_id || meta.torrent_id || meta.hash || meta.url || 'u';

        // Фильм → простой ключ
        if(meta.season === undefined) return String(id);

        // Эпизод сериала
        const season  = Number(meta.season  ?? 0);
        const episode = Number(meta.number  ?? meta.episode ?? 0);

        return `${id}:${season}:${episode}`;
    }

    /**
     * Сохраняем текущий хэш + позицию просмотра
     */
    function saveProgress(meta, hash, seconds){
        if(!hash) return;

        const store = getStorage();
        const key   = buildKey(meta);

        store[key] = {
            hash:     hash,
            position: Math.floor(seconds),
            updated:  Date.now()
        };

        setStorage(store);
        console.debug('[Resume] saved', key, store[key]);
    }

    /**
     * Берём сохранённую позицию (если есть)
     */
    function getProgress(meta){
        const store = getStorage();
        const key   = buildKey(meta);
        return store[key];
    }

    /* -------------------------------------------------------------------- */
    /*  Подписываемся на события проигрывателя                               */
    /* -------------------------------------------------------------------- */

    Lampa.Subscribe.play(function(data){
        // data содержит meta‑инфу и timeline
        const meta  = data.card || data.original_card || {};
        const hash  = data.torrent_hash || data.hash;
        const view  = data.timeline; // Lampa.Timeline.view

        // 1) Момент запуска — сохраняем 0, чтобы знать, что этот хэш вообще есть
        saveProgress(meta, hash, 0);

        // 2) Слушаем прогресс
        if(view){
            // Раз в ~5 сек приходит событие update
            view.on('update', (time)=>{
                saveProgress(meta, hash, time);
            });

            // Финальный «stop» — точно найдёт последнюю позицию
            view.on('stop', (time)=>{
                saveProgress(meta, hash, time);
            });
        }
    });

    /* -------------------------------------------------------------------- */
    /*  Добавляем кнопку «Продолжить» в карточку                             */
    /* -------------------------------------------------------------------- */

    Lampa.Listener.subscribe('full', function(e){
        if(e.type !== 'open') return;

        const card = e.card; // объект карточки (Full)
        const meta = card.data || {};
        const resume = getProgress(meta);

        if(!resume || !resume.hash) return; // ничего не сохраняли

        const label = Lampa.Utils.secondsToTime(resume.position, true);

        card.addButton({
            title:      'Продолжить',
            subtitle:   label,
            icon:       'play',
            id:         'resume',
            action:     ()=>{
                Lampa.Player.play({
                    url:        resume.hash,        // hash → url прокси‑плеера
                    torrent_hash: resume.hash,
                    card:       meta,
                    timeline:   {time: resume.position}
                });
            }
        });
    });

    console.log('%cLampa Resume‑Hash plugin loaded', 'background:#2E8B57;color:#fff;padding:2px 4px');
})();
