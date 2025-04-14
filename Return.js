onCardOpen: function(viewData){
    if (!viewData || viewData.component !== 'full') return;
    var cardData = viewData.data || {};

    var movieId = cardData.id || cardData.tmdb_id || cardData.imdb_id;
    if (!movieId) return;

    // Отладочная информация
    console.log('onCardOpen - movieId:', movieId);
    console.log('watchList:', this.watchList);

    var record = this.watchList.find(function(item){
        return item.id === movieId;
    });
    
    if (!record) {
        console.log('Данных для просмотра не найдено');
        return;
    }
    
    console.log('Найдены данные для возобновления просмотра:', record);

    var btn = document.createElement('button');
    btn.innerText = 'Продолжить';
    btn.className = 'continue-watch-torrent-button selector';
    
    btn.addEventListener('click', function(){
        Lampa.Player.play(record);
    });

    // Более универсальный поиск контейнера
    var possibleContainers = [
        '.full-start-new__buttons',
        '.movie__details .info__buttons',
        '.card-view__buttons',  // Добавьте больше селекторов
        '.view--torrent .card-view__buttons'  // И еще
    ];
    
    var container = null;
    for (var i = 0; i < possibleContainers.length; i++) {
        container = document.querySelector(possibleContainers[i]);
        if (container) break;
    }
    
    if (container) {
        console.log('Найден контейнер для кнопки:', container);
        setTimeout(function(){
            container.appendChild(btn);
            console.log('Кнопка добавлена');
        }, 500);
    } else {
        console.log('Контейнер для кнопки не найден. Доступны элементы:');
        // Вывод всех элементов с кнопками для анализа
        document.querySelectorAll('button').forEach(function(el) {
            console.log(el.parentNode);
        });
    }
}
