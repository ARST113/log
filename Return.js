(function(){
    "use strict";
    if(!window.Lampa) {
        console.error("Torrent Continue Plugin: Lampa не найден. Плагин не запускается.");
        return;
    }
    
    // Ключ для хранения данных о незавершённом просмотре торрентов
    var TORRENT_WATCH_KEY = 'torrent_continue_watch_list';
    
    var torrentContinuePlugin = {
        // Загружаем сохранённые записи или начинаем с пустого массива
        watchList: Lampa.Storage.get(TORRENT_WATCH_KEY, []),
        
        // Инициализация плагина
        init: function(){
            console.log("Torrent Continue Plugin: Инициализация плагина");
            // Регистрируем callback плеера, если он существует
            if(Lampa.Player && typeof Lampa.Player.callback === 'function'){
                console.log("Torrent Continue Plugin: Регистрирую callback для Lampa.Player");
                Lampa.Player.callback(this.onPlayerClose.bind(this));
            } else {
                console.warn("Torrent Continue Plugin: Lampa.Player.callback не найден");
            }
            
            // Подписываемся на событие открытия полной карточки (используем 'full' - при необходимости можно изменить на 'full_start')
            Lampa.Listener.follow('full', this.onCardOpen.bind(this));
            console.log("Torrent Continue Plugin: Подписан на событие 'full'");
        },
        
        /**
         * Вызывается при закрытии плеера.
         * Объект data должен иметь вид:
         * {
         *    id: <ID карточки>,
         *    url: <URL потока>,
         *    time: <позиция воспроизведения>,
         *    file_index: <номер файла внутри торрента>,
         *    title: <название фильма/сериала>,
         *    torrent_hash: <хеш торрента>
         * }
         */
        onPlayerClose: function(data){
            console.log("Torrent Continue Plugin: onPlayerClose вызван с данными:", data);
            if (!data || !data.id) {
                console.warn("Torrent Continue Plugin: Отсутствует data или data.id");
                return;
            }
            // Удаляем старую запись с таким же ID
            this.watchList = this.watchList.filter(function(item){
                return item.id !== data.id;
            });
            // Добавляем актуальные данные
            this.watchList.push(data);
            Lampa.Storage.set(TORRENT_WATCH_KEY, this.watchList);
            console.log("Torrent Continue Plugin: Запись сохранена для фильма с id =", data.id);
        },
        
        /**
         * Вызывается при открытии полной карточки (событие "full", тип "complite").
         * Если для текущей карточки найден сохранённый прогресс, вставляет кнопку "Продолжить".
         */
        onCardOpen: function(viewData){
            console.log("Torrent Continue Plugin: onCardOpen вызван с viewData:", viewData);
            if (!viewData || viewData.type !== 'complite') {
                console.log("Torrent Continue Plugin: Событие не complite, выхожу");
                return;
            }
            
            // Получаем данные о фильме; может быть viewData.data.movie или viewData.data
            var cardData = viewData.data.movie || viewData.data;
            if (!cardData) {
                console.warn("Torrent Continue Plugin: Нет данных карточки");
                return;
            }
            // Определяем ID фильма (или сериала)
            var movieId = cardData.id || cardData.tmdb_id || cardData.imdb_id;
            console.log("Torrent Continue Plugin: Найден ID фильма:", movieId);
            if (!movieId) return;
            
            // Ищем запись о незавершённом просмотре для этого фильма
            var record = this.watchList.find(function(item){
                return item.id === movieId;
            });
            if (!record) {
                console.log("Torrent Continue Plugin: Нет сохранённых данных для фильма с id", movieId);
                return;
            }
            console.log("Torrent Continue Plugin: Найдена сохранённая запись:", record);
            
            // Регистрируем шаблон кнопки, если он еще не добавлен
            if (!Lampa.Template.get('resume-button')) {
                var resumeTemplate = `<div class="full-start__button selector button--resume-torrent">
                                            {icon}
                                            <span>{text}</span>
                                        </div>`;
                Lampa.Template.add('resume-button', resumeTemplate);
                console.log("Torrent Continue Plugin: Шаблон 'resume-button' добавлен");
            }
            
            // Определяем текстовый значок (пока используем текст)
            var iconText = "▶";  // Или можно использовать другой символ/строку
            
            // Создаем кнопку через шаблон, подставляя текстовый значок и текст кнопки "Продолжить"
            var btn = $(Lampa.Template.get('resume-button', {
                icon: iconText,
                text: "Продолжить"
            }));
            console.log("Torrent Continue Plugin: Кнопка 'Продолжить' создана");
            
            // Привязываем обработчик события, при клике на кнопку запускаем плеер с сохраненными данными
            btn.on('hover:enter', function(){
                console.log("Torrent Continue Plugin: Нажата кнопка 'Продолжить'. Запускаю Lampa.Player.play с данными:", record);
                Lampa.Player.play(record);
            });
            
            // Определяем контейнер для вставки кнопки; если контейнер не найден, выводим в консоль предупреждение
            var container = document.querySelector('.full-start-new__buttons') ||
                            document.querySelector('.full-start__buttons') ||
                            document.querySelector('.movie__details .info__buttons');
            
            if (container) {
                container.appendChild(btn[0]); // btn – jQuery-объект, поэтому берем DOM-элемент
                console.log("Torrent Continue Plugin: Кнопка 'Продолжить' добавлена в контейнер:", container);
            } else {
                console.warn("Torrent Continue Plugin: Не найден контейнер для кнопки 'Продолжить'");
            }
        }
    };
    
    // Инициализируем плагин
    torrentContinuePlugin.init();
    console.log("Torrent Continue Plugin: Инициализация завершена");
    
    // Регистрируем плагин в глобальном объекте Lampa.plugins
    if (!window.Lampa.plugins) window.Lampa.plugins = {};
    window.Lampa.plugins.torrent_continue_plugin = torrentContinuePlugin;
    console.log("Torrent Continue Plugin: Плагин зарегистрирован в Lampa.plugins");
    
})();
