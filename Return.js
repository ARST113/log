(function(){
    "use strict";

    if (!window.Lampa) {
        console.error("Torrent Continue Plugin: Lampa не найден. Плагин не запускается.");
        return;
    }
    
    // Ключ хранения для данных о незавершённом просмотре торрентов
    var TORRENT_WATCH_KEY = 'torrent_continue_watch_list';
    
    var torrentContinuePlugin = {
        // Загружаем сохранённые записи или начинаем с пустого массива
        watchList: Lampa.Storage.get(TORRENT_WATCH_KEY, []),
        
        init: function(){
            console.log("Torrent Continue Plugin: Инициализация плагина");
            
            // Регистрируем callback плеера, если он поддерживается
            if (Lampa.Player && typeof Lampa.Player.callback === "function") {
                console.log("Torrent Continue Plugin: Регистрирую callback для Lampa.Player");
                Lampa.Player.callback(this.onPlayerClose.bind(this));
            } else {
                console.warn("Torrent Continue Plugin: Lampa.Player.callback не найден");
            }
            
            // Подписываемся на событие открытия карточки
            // Обратите внимание: если в вашей сборке событие называется не 'full' или тип не 'complite', смените это здесь!
            Lampa.Listener.follow('full', this.onCardOpen.bind(this));
            console.log("Torrent Continue Plugin: Подписан на событие 'full'");
        },
        
        /**
         * onPlayerClose – вызывается при закрытии плеера.
         * Объект data должен иметь вид:
         * {
         *    id:              <ID карточки фильма/сериала>,
         *    url:             <URL потока (с нужным file_index)>,
         *    time:            <позиция воспроизведения>,
         *    file_index:      <номер файла внутри торрента>,
         *    title:           <название фильма/сериала>,
         *    torrent_hash:    <хеш торрента>
         * }
         */
        onPlayerClose: function(data) {
            console.log("Torrent Continue Plugin: onPlayerClose вызван с данными:", data);
            if (!data || !data.id) {
                console.warn("Torrent Continue Plugin: Отсутствуют данные или data.id");
                return;
            }
            // Убираем предыдущую запись для данного фильма
            this.watchList = this.watchList.filter(function(item){
                return item.id !== data.id;
            });
            // Добавляем новую запись
            this.watchList.push(data);
            Lampa.Storage.set(TORRENT_WATCH_KEY, this.watchList);
            console.log("Torrent Continue Plugin: Данные сохранены для ID =", data.id);
        },
        
        /**
         * onCardOpen – вызывается при открытии полной карточки (событие "full" с типом "complite").
         * Здесь мы проверяем, есть ли сохранённые данные для текущего фильма/сериала, и если да – вставляем кнопку "Продолжить".
         */
        onCardOpen: function(viewData) {
            console.log("Torrent Continue Plugin: onCardOpen вызван. viewData:", viewData);
            if (!viewData || viewData.type !== "complite") {
                console.log("Torrent Continue Plugin: Тип события не complite. Выхожу.");
                return;
            }
            
            // Получаем данные карточки — возможно, они лежат в viewData.data.movie или просто viewData.data
            var cardData = viewData.data.movie || viewData.data;
            if (!cardData) {
                console.warn("Torrent Continue Plugin: Нет данных карточки");
                return;
            }
            
            // Извлекаем идентификатор фильма. Если в вашей сборке другой ключ, измените здесь.
            var movieId = cardData.id || cardData.tmdb_id || cardData.imdb_id;
            console.log("Torrent Continue Plugin: Определён ID карточки =", movieId);
            if (!movieId) {
                console.warn("Torrent Continue Plugin: ID карточки не найден");
                return;
            }
            
            // Ищем сохранённую запись для данного фильма
            var record = this.watchList.find(function(item){
                return item.id === movieId;
            });
            if (!record) {
                console.log("Torrent Continue Plugin: Нет сохранённых данных для фильма с ID =", movieId);
                return;
            }
            console.log("Torrent Continue Plugin: Найдена запись для восстановления:", record);
            
            // Используем шаблон для кнопки. Если шаблон не зарегистрирован — регистрируем его.
            if (!Lampa.Template.get("resume-button")) {
                var resumeTemplate = `<div class="full-start__button selector button--resume-torrent">
                                            {icon}
                                            <span>{text}</span>
                                        </div>`;
                Lampa.Template.add("resume-button", resumeTemplate);
                console.log("Torrent Continue Plugin: Шаблон 'resume-button' создан");
            }
            
            // Задаём текстовый значок (используем, например, символ ▶)
            var iconText = "▶";
            
            // Генерируем кнопку через шаблон, подставляя значок и текст "Продолжить"
            var btn = $(Lampa.Template.get("resume-button", {
                icon: iconText,
                text: "Продолжить"
            }));
            console.log("Torrent Continue Plugin: Кнопка 'Продолжить' сформирована");
            
            // Привязываем событие: по клику запускаем плеер с сохранёнными параметрами (resume)
            btn.on("hover:enter", function(){
                console.log("Torrent Continue Plugin: Кнопка 'Продолжить' нажата. Запускается Lampa.Player.play с данными:", record);
                Lampa.Player.play(record);
            });
            
            // Определяем контейнер для вставки кнопки.
            // Если в вашей сборке контейнер называется по-другому, измените селекторы.
            var container = document.querySelector(".full-start-new__buttons") ||
                            document.querySelector(".full-start__buttons") ||
                            document.querySelector(".movie__details .info__buttons");
            
            if (container) {
                container.appendChild(btn[0]); // btn – jQuery объект, берем DOM-элемент
                console.log("Torrent Continue Plugin: Кнопка 'Продолжить' добавлена в контейнер:", container);
            } else {
                console.warn("Torrent Continue Plugin: Контейнер для кнопки не найден. Проверьте селекторы.");
            }
        }
    };

    // Инициируем плагин
    torrentContinuePlugin.init();
    console.log("Torrent Continue Plugin: Инициализация завершена");
    
    // Регистрируем плагин в глобальном объекте Lampa.plugins, чтобы его можно было использовать во всей системе
    if (!window.Lampa.plugins) window.Lampa.plugins = {};
    window.Lampa.plugins.torrent_continue_plugin = torrentContinuePlugin;
    console.log("Torrent Continue Plugin: Плагин зарегистрирован в Lampa.plugins");
    
})();
