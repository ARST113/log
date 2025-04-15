(function(){
    /**
     * Плагин «Продолжить просмотр»
     * 
     * При открытии детальной карточки (details) плагин получает объект itemData,
     * содержащий информацию о контенте (в частности, его id и media).
     * Затем он считывает из Lampa.Storage:
     *   - torrents_view: массив id (строк)
     *   - torrents_filter_data: объект с ключами вида "id:media"
     * Если контент найден хотя бы в одном из этих хранилищ, 
     * плагин добавляет кнопку «Продолжить просмотр» в блок меню (класс .view--sources).
     * По клику вызывается Lampa.Player.play с передачей базовых параметров.
     */
    function ContinueViewingPlugin() {
        Lampa.Listener.follow('details', function(e) {
            if(e.type === 'show'){
                // Получаем компонент деталей
                let detailComponent = e.value;
                // Объект с данными о контенте (данные должны быть сгенерированы Лампой)
                let itemData = detailComponent.item || {};
                // Приводим id к строке (так как в хранилище id хранятся как строки)
                let contentId = String(itemData.id);
                // Определяем тип контента, например "movie" или "tv"
                let mediaType = itemData.media || 'movie';
                
                if(!contentId) return;
                
                // Считываем массив просмотренных id
                let viewed = Lampa.Storage.get('torrents_view') || [];
                // Считываем настройки фильтров, где ключ формируется как "id:media"
                let filterData = Lampa.Storage.get('torrents_filter_data') || {};
                
                // Флаг: если контент найден в истории или фильтрах
                let found = false;
                if(viewed.indexOf(contentId) >= 0){
                    found = true;
                }
                // Формируем ключ для проверки в torrents_filter_data
                let filterKey = contentId + ':' + mediaType;
                if(filterData[filterKey]){
                    found = true;
                }
                
                if(found){
                    // Получаем контейнер бокового меню для источников
                    let menu = detailComponent.render().querySelector('.view--sources');
                    if(!menu) return;
                    
                    // Если кнопка уже была добавлена, не добавляем её повторно
                    if(menu.querySelector('.continue-button')) return;
                    
                    // Создаем элемент кнопки
                    let btn = document.createElement('div');
                    btn.className = 'selector__item selector focus-item continue-button';
                    btn.title = 'Продолжить просмотр';
                    // Используем стандартную SVG-иконку (иконка play)
                    btn.innerHTML = `
                        <div class="selector__icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </div>
                        <div class="selector__text">Продолжить</div>
                    `;
                    
                    // При клике запускаем плеер с параметрами из itemData
                    btn.addEventListener('click', function(evt) {
                        evt.stopPropagation();
                        evt.preventDefault();
                        // Здесь timeline можно подставить, если сохранены конкретные данные,
                        // на данный момент задаем timeline равным 0 (начать с начала продолжения)
                        Lampa.Player.play({
                            url: itemData.url || '',
                            quality: itemData.quality || {},
                            title: itemData.title || 'Без названия',
                            torrent_hash: contentId,
                            timeline: 0
                        });
                    });
                    
                    // Вставляем кнопку в конец контейнера меню
                    menu.appendChild(btn);
                }
            }
        });
    }
    
    // Инициализируем плагин сразу, если Lampa уже доступна,
    // иначе ждем события 'lampa:start'
    if(window.Lampa) {
        ContinueViewingPlugin();
    } else {
        document.addEventListener('lampa:start', ContinueViewingPlugin);
    }
})();
