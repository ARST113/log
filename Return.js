(function(){
    'use strict';

    // Если объект Lampa не инициализирован, плагин не работает
    if (typeof window.Lampa === 'undefined') return;

    // Задаём ключ для хранения данных о возобновлении просмотра конкретных торрентов
    var storageKey = 'continue_watch_torrent_list';

    // Плагин для работы с возобновлением просмотра для торрентов
    var continueTorrentWatch = {
        // Загружаем уже сохранённые данные или начинаем с пустого массива
        watchList: Lampa.Storage.get(storageKey) || [],

        // Инициализация плагина: регистрируем обработчики
        init: function(){
            // Регистрируем callback плеера, чтобы при закрытии плеера сохранять данные
            if (Lampa.Player && typeof Lampa.Player.callback === 'function'){
                Lampa.Player.callback(this.onPlayerClose.bind(this));
            }

            // Подписываемся на событие открытия детальной карточки (full view)
            // Если в вашей сборке карточка открывается по другому событию, подкорректируйте имя (например, "full" или "complite")
            Lampa.Listener.follow('full_start', this.onCardOpen.bind(this));
        },

        // Функция onPlayerClose вызывается при закрытии плеера.
        // Она должна получать объект с данными о воспроизведении, например:
        // { id: 'movie_123', url: 'http://example.com/stream?file_index=3', time: 125, file_index: 3, title: "Название фильма" }
        onPlayerClose: function(data){
            if (!data || !data.id) return;

            // Удаляем записи для данного фильма (если уже существуют)
            this.watchList = this.watchList.filter(function(item){
                return item.id !== data.id;
            });
            // Добавляем обновлённые данные в список
            this.watchList.push(data);
            // Сохраняем в Lampa.Storage
            Lampa.Storage.set(storageKey, this.watchList);
        },

        // Функция onCardOpen вызывается при открытии детальной карточки (режим full).
        // Здесь мы проверяем, есть ли сохранённые данные для данного фильма/сериала
        onCardOpen: function(viewData){
            if (!viewData || viewData.component !== 'full') return;
            var cardData = viewData.data || {};

            // Определяем идентификатор. В разных сборках он может храниться в разных полях.
            // Подберите нужное вам поле: например, cardData.id, cardData.tmdb_id или cardData.imdb_id.
            var movieId = cardData.id || cardData.tmdb_id || cardData.imdb_id;
            if (!movieId) return;

            // Ищем сохранённые данные для данного фильма
            var record = this.watchList.find(function(item){
                return item.id === movieId;
            });
            if (!record) return; // Если данных нет – кнопка не добавляется

            // Создаем кнопку «Продолжить»
            var btn = document.createElement('button');
            btn.innerText = 'Продолжить';
            // Присваиваем класс для стилизации – можно задать нужный вид через CSS
            btn.className = 'continue-watch-torrent-button selector';

            // По клику запускаем плеер с сохраненными параметрами.
            // В resume-объекте должны храниться URL с индексом файла (или другие параметры), чтобы воспроизведение началось там, где остановились.
            btn.addEventListener('click', function(){
                Lampa.Player.play(record);
            });

            // Определяем, куда вставить кнопку.
            // В плагине для торрентов часто используется контейнер с классом .full-start-new__buttons (после других кнопок)
            var container = document.querySelector('.full-start-new__buttons');
            // Если контейнер не найден, можно использовать другой (например, в карточке может быть .movie__details .info__buttons)
            if (!container) {
                container = document.querySelector('.movie__details .info__buttons');
            }
            if (container) {
                // Иногда карточка может ещё не быть полностью отрисована – можно добавить небольшую задержку
                setTimeout(function(){
                    container.appendChild(btn);
                }, 500);
            } else {
                console.log('Container for continue-watch button not found.');
            }
        }
    };

    // Инициализируем плагин
    continueTorrentWatch.init();

    // Регистрируем плагин в глобальном объекте
    if (!window.Lampa.plugins) window.Lampa.plugins = {};
    window.Lampa.plugins.continue_torrent_watch = continueTorrentWatch;

})();
