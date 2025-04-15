(function(){
    console.log('Return.js plugin loaded');

    function ReturnPlugin(){
        // Подписываемся на событие "details", когда открывается детальная страница контента
        Lampa.Listener.follow('details', function(e) {
            console.log('Return.js: details event received', e);
            if(e.type === 'show'){
                let detailComponent = e.value;
                let itemData = detailComponent.item || {};
                console.log('Return.js: itemData', itemData);

                // Приводим идентификатор к строке
                let contentId = String(itemData.id);
                if(!contentId) {
                    console.log('Return.js: Нет contentId, выходим');
                    return;
                }

                // Находим контейнер, куда вставляются элементы (боковое меню источников).
                // В зависимости от темы и сборки, этот селектор может отличаться.
                let menu = detailComponent.render().querySelector('.view--sources');
                if(!menu) {
                    console.log('Return.js: Контейнер меню не найден');
                    return;
                }

                // Если кнопка уже добавлена – не дублируем её.
                if(menu.querySelector('.continue-button')) {
                    console.log('Return.js: Кнопка уже добавлена');
                    return;
                }

                // Создаем элемент кнопки
                let btn = document.createElement('div');
                btn.className = 'selector__item selector focus-item continue-button';
                btn.title = 'Продолжить просмотр';
                // Используем иконку из предоставленного URL
                btn.innerHTML = `
                    <div class="selector__icon">
                        <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg" 
                             alt="continue" width="24" height="24" style="vertical-align: middle;">
                    </div>
                    <div class="selector__text">Продолжить</div>
                `;
                
                // Обработчик клика: запускает плеер с данными текущего контента.
                btn.addEventListener('click', function(evt) {
                    evt.stopPropagation();
                    evt.preventDefault();
                    console.log('Return.js: Кнопка нажата для contentId', contentId);
                    Lampa.Player.play({
                        url: itemData.url || '',
                        quality: itemData.quality || {},
                        title: itemData.title || 'Без названия',
                        torrent_hash: contentId,
                        timeline: 0  // Можно заменить на сохранённую позицию, если понадобится
                    });
                });
                
                // Вставляем кнопку в найденный контейнер меню
                menu.appendChild(btn);
                console.log('Return.js: Кнопка добавлена в меню');
            }
        });
    }
    
    // Если объект Lampa уже доступен, инициализируем плагин,
    // иначе ожидаем событие 'lampa:start'
    if(window.Lampa){
        console.log('Return.js: Lampa доступна, инициализируем плагин');
        ReturnPlugin();
    } else {
        console.log('Return.js: Lampa не доступна, ждем lampa:start');
        document.addEventListener('lampa:start', ReturnPlugin);
    }
})();
