(function(){
    console.log('PLUGIN CONTINUE: загружен плагин');
    
    function ContinueViewingPlugin(){
        Lampa.Listener.follow('details', function(e) {
            console.log('PLUGIN CONTINUE: Событие details получено', e);
            // Работать только после отрисовки страницы (тип show)
            if(e.type === 'show'){
                let detailComponent = e.value;
                let itemData = detailComponent.item || {};
                console.log('PLUGIN CONTINUE: itemData', itemData);
                
                // Приводим id к строке
                let contentId = String(itemData.id);
                // Определяем тип контента, по умолчанию movie
                let mediaType = itemData.media || 'movie';
                console.log('PLUGIN CONTINUE: contentId:', contentId, 'mediaType:', mediaType);
                if(!contentId) {
                    console.log('PLUGIN CONTINUE: Нет contentId, выходим');
                    return;
                }

                // Получаем данные из хранилища
                let viewed = Lampa.Storage.get('torrents_view') || [];
                let filterData = Lampa.Storage.get('torrents_filter_data') || {};
                console.log('PLUGIN CONTINUE: torrents_view', viewed);
                console.log('PLUGIN CONTINUE: torrents_filter_data', filterData);
                
                let found = false;
                // Проверяем, содержится ли contentId в torrents_view (массив строк)
                if(viewed.indexOf(contentId) >= 0){
                    found = true;
                    console.log('PLUGIN CONTINUE: ID найден в torrents_view');
                }
                // Формируем ключ для torrents_filter_data: "id:media" например "1195506:movie"
                let filterKey = contentId + ':' + mediaType;
                if(filterData[filterKey]){
                    found = true;
                    console.log('PLUGIN CONTINUE: Ключ найден в torrents_filter_data:', filterKey);
                }
                
                if(found){
                    // Получаем контейнер бокового меню с источниками
                    let menu = detailComponent.render().querySelector('.view--sources');
                    console.log('PLUGIN CONTINUE: Найден контейнер меню', menu);
                    if(!menu){
                        console.log('PLUGIN CONTINUE: Контейнер меню не найден');
                        return;
                    }
                    // Если кнопка уже добавлена, ничего не делаем
                    if(menu.querySelector('.continue-button')){
                        console.log('PLUGIN CONTINUE: Кнопка уже добавлена');
                        return;
                    }
                    
                    // Создаем кнопку "Продолжить"
                    let btn = document.createElement('div');
                    btn.className = 'selector__item selector focus-item continue-button';
                    btn.title = 'Продолжить просмотр';
                    // Вставляем SVG-иконку (иконка Play) из спецификации W3C
                    btn.innerHTML = `
                        <div class="selector__icon">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                        <div class="selector__text">Продолжить</div>
                    `;
                    
                    btn.addEventListener('click', function(evt){
                        evt.stopPropagation();
                        evt.preventDefault();
                        console.log('PLUGIN CONTINUE: Кнопка нажата для ID', contentId);
                        
                        // Запускаем плеер; если у вас есть сохранённая позиция, можно подставить timeline
                        Lampa.Player.play({
                            url: itemData.url || '',
                            quality: itemData.quality || {},
                            title: itemData.title || 'Без названия',
                            torrent_hash: contentId,
                            timeline: 0 // Здесь можно заменить на сохранённое время, если оно где-то хранится
                        });
                    });
                    
                    // Вставляем кнопку в контейнер меню
                    menu.appendChild(btn);
                    console.log('PLUGIN CONTINUE: Кнопка добавлена в меню');
                } else {
                    console.log('PLUGIN CONTINUE: Контент не найден в torrents_view или torrents_filter_data');
                }
            }
        });
    }
    
    // Инициализируем плагин, если Lampa уже доступна или после события lampa:start
    if(window.Lampa){
        console.log('PLUGIN CONTINUE: Lampa доступна, инициализируем');
        ContinueViewingPlugin();
    } else {
        console.log('PLUGIN CONTINUE: Lampa не доступна, ожидаем lampa:start');
        document.addEventListener('lampa:start', ContinueViewingPlugin);
    }
})();
