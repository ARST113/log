(function(){
    // Проверяем наличие объекта Lampa
    if(typeof window.Lampa === 'undefined') return;

    // Определяем наш плагин "continue_watch"
    var continueWatchPlugin = {
        name: 'continue_watch',
        
        // Инициализация плагина
        init: function(){
            console.log('Инициализация плагина Continue Watch');

            // Загружаем список сохранённых записей, если они есть (будем хранить массив объектов)
            this.watchlist = Lampa.Storage.get('continue_watch_list') || [];
            
            // Регистрируем обновление данных при закрытии плеера
            this.registerPlayerCallback();
            
            // Добавляем виджет на главную страницу
            this.addWidget();
        },

        // Регистрируем callback, который будет сохранять данные при закрытии плеера
        registerPlayerCallback: function(){
            var _this = this;
            
            // Используем официальный метод callback из документации
            Lampa.Player.callback(function(data){
                if(data && data.id) {
                    // Сохраняем информацию о просмотре
                    _this.updateWatchlist({
                        url: data.url,
                        id: data.id,
                        time: data.time || 0,
                        title: data.title || 'Видео'
                    });
                }
            });
        },

        // Обновляем список сохранённых данных
        updateWatchlist: function(data){
            if(!data || !data.id) return;
            
            // Отладочная информация
            console.log('Сохраняем информацию о просмотре:', data);
            
            // Удаляем предыдущую запись с таким же идентификатором (если уже есть)
            this.watchlist = this.watchlist.filter(function(item){
                return item.id !== data.id;
            });
            
            // Добавляем новую запись в список
            this.watchlist.push(data);
            
            // Ограничиваем список до 10 последних записей
            if(this.watchlist.length > 10) {
                this.watchlist = this.watchlist.slice(-10);
            }
            
            // Сохраняем список в localStorage через Lampa.Storage
            Lampa.Storage.set('continue_watch_list', this.watchlist);
            
            // Обновляем виджет с информацией о продолжении просмотра
            this.addWidget();
        },

        // Добавляем виджет на главную страницу для продолжения просмотра
        addWidget: function(){
            // Находим элемент home-mark из документации
            var container = document.getElementById('home-mark');
            if(!container) return;
            
            // Проверяем существует ли уже наш виджет
            var widgetElement = document.getElementById('continue-watch-widget');
            if(!widgetElement){
                widgetElement = document.createElement('div');
                widgetElement.id = 'continue-watch-widget';
                widgetElement.style.marginTop = '20px';
                container.appendChild(widgetElement);
            }
            
            // Очищаем контейнер
            widgetElement.innerHTML = '';
            
            // Если есть сохранённые данные, отображаем кнопку продолжения просмотра
            if(this.watchlist.length){
                // Получаем последнюю запись
                var lastItem = this.watchlist[this.watchlist.length - 1];
                
                // Формируем заголовок, если есть название видео
                if(lastItem.title) {
                    var title = document.createElement('div');
                    title.innerText = 'Продолжить просмотр: ' + lastItem.title;
                    title.style.fontSize = '18px';
                    title.style.color = '#fff';
                    title.style.marginBottom = '10px';
                    widgetElement.appendChild(title);
                    
                    // Добавим время, если оно есть
                    if(lastItem.time) {
                        var timeInfo = document.createElement('div');
                        timeInfo.innerText = 'Время: ' + this.formatTime(lastItem.time);
                        timeInfo.style.fontSize = '14px';
                        timeInfo.style.color = '#ccc';
                        timeInfo.style.marginBottom = '10px';
                        widgetElement.appendChild(timeInfo);
                    }
                }
                
                // Формируем кнопку для продолжения просмотра
                var btn = document.createElement('button');
                btn.innerText = 'Продолжить просмотр';
                btn.style.padding = '10px 20px';
                btn.style.fontSize = '16px';
                btn.style.backgroundColor = '#15bdff';
                btn.style.border = 'none';
                btn.style.borderRadius = '5px';
                btn.style.color = '#fff';
                btn.style.cursor = 'pointer';
                
                // При нажатии вызываем плеер с восстановленными данными
                btn.onclick = function(){
                    console.log('Запускаем продолжение просмотра:', lastItem);
                    // Запускаем плеер с последними сохраненными данными
                    Lampa.Player.play(lastItem);
                };
                
                // Добавляем кнопку в контейнер
                widgetElement.appendChild(btn);
            }
        },
        
        // Форматирование времени
        formatTime: function(seconds) {
            if(typeof Lampa.Utils !== 'undefined' && typeof Lampa.Utils.secondsToTime === 'function') {
                return Lampa.Utils.secondsToTime(seconds);
            } else {
                // Собственная реализация форматирования времени
                var minutes = Math.floor(seconds / 60);
                var remainingSeconds = Math.floor(seconds % 60);
                return minutes + ':' + (remainingSeconds < 10 ? '0' : '') + remainingSeconds;
            }
        }
    };

    // Инициализируем плагин
    continueWatchPlugin.init();

    // Регистрируем плагин в глобальном объекте Lampa.plugins
    if(!window.Lampa.plugins) window.Lampa.plugins = {};
    window.Lampa.plugins.continue_watch = continueWatchPlugin;
})();
