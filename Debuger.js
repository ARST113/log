(function(){
    'use strict';

    console.log('[ReturnPlugin] плагин Return.js загружен');

    /**
     * Сохраняет последний запущенный файл (torrent) под ключом таймлайна контента
     */
    function saveLastFile(data) {
        if (!data || !data.torrent_hash) return;

        // Берём активную карточку из Lampa.Activity
        var card = Lampa.Activity.active().card || {};
        // Определяем базовую строку для хеша
        var base = card.number_of_seasons
            ? card.original_name
            : card.original_title;
        if (!base) return;

        var key = Lampa.Utils.hash(base);
        // Читаем мапу из localStorage, добавляем новый entry и сохраняем обратно
        var map = Lampa.Storage.get('resume_file', {});
        map[key] = data;
        Lampa.Storage.set('resume_file', map);
        console.log('[ReturnPlugin] resume_file saved for', key, data);
    }

    // Подписываемся на событие запуска плеера, чтобы сохранить file
    Lampa.Player.listener.follow('start', saveLastFile);


    /**
     * Вставляет кнопку «Продолжить просмотр» на полной карточке
     */
    function initReturnPlugin() {
        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;

            // небольшая задержка, чтобы DOM успел обновиться
            setTimeout(function(){
                try {
                    var fullContainer = e.object.activity.render();

                    // На старом интерфейсе кнопка «Смотреть» имеет класс .view--torrent
                    var target = fullContainer.find('.view--torrent');
                    console.log('[ReturnPlugin] full event fired, .view--torrent elements:', target.length);

                    if (!target.length) {
                        console.warn('[ReturnPlugin] Целевой контейнер для кнопки не найден');
                        return;
                    }

                    // Берём карточку из e.data.movie (или fallback e.object.item)
                    var card = e.data.movie || e.object.item || {};
                    var base = card.number_of_seasons
                        ? card.original_name
                        : card.original_title;
                    if (!base) return;

                    var key = Lampa.Utils.hash(base);
                    console.log('[ReturnPlugin] looking for resume data for key:', key);

                    // Читаем прогресс и сохранённые file
                    var views    = Lampa.Storage.get('file_view', {});
                    var resume   = views[key];
                    var filesMap = Lampa.Storage.get('resume_file', {});
                    var file     = filesMap[key];

                    if (!resume || resume.percent <= 0 || resume.percent >= 100) {
                        console.warn('[ReturnPlugin] нет прогресса для resume:', resume);
                        return;
                    }
                    if (!file) {
                        console.warn('[ReturnPlugin] нет сохранённого файла для resume:', file);
                        return;
                    }

                    // Не дублировать кнопку
                    if ( target.siblings('.view--continue').length ) {
                        console.log('[ReturnPlugin] кнопка уже вставлена');
                        return;
                    }

                    // Собираем HTML кнопки
                    var btnHtml = `
                        <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
                            <div class="selector__icon">
                                <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg"
                                     alt="Продолжить" width="24" height="24" style="vertical-align: middle;">
                            </div>
                            <div class="selector__text">
                                Продолжить (${Lampa.Utils.secondsToTime(resume.time, true)})
                            </div>
                        </div>`;
                    var $btn = $(btnHtml);

                    // Обработчик клика / hover:enter
                    $btn.on('hover:enter click', function(evt){
                        evt.preventDefault();
                        evt.stopPropagation();
                        console.log('[ReturnPlugin] кнопка "Продолжить" нажата, запускаем плеер с resume');
                        Lampa.Player.play(Object.assign({}, file, {
                            timeline: {
                                time:     resume.time,
                                duration: resume.duration
                            }
                        }));
                    });

                    // Вставляем кнопку перед кнопкой "Смотреть"
                    target.before($btn);
                    console.log('[ReturnPlugin] кнопка "Продолжить" успешно вставлена');

                } catch (err) {
                    console.error('[ReturnPlugin] Ошибка при вставке кнопки:', err);
                }
            }, 100);
        });
    }

    // Инициализация: если Lampa уже доступна — сразу, иначе ждём события lampa:start
    if (window.Lampa) {
        console.log('[ReturnPlugin] Lampa доступна, инициализируем плагин');
        initReturnPlugin();
    } else {
        console.log('[ReturnPlugin] Lampa не доступна, ждём lampa:start');
        document.addEventListener('lampa:start', initReturnPlugin);
    }

})();
