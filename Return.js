(function(){
    'use strict';
    
    console.log('[ReturnPlugin] плагин Return.js загружен');
    
    function initReturnPlugin() {
        // Подписываемся на событие "full", которое срабатывает при формировании полной страницы деталей
        Lampa.Listener.follow('full', function(e) {
            if(e.type === 'complite'){
                // Задержка для гарантии, что DOM полностью сформирован
                setTimeout(function(){
                    try {
                        // Получаем корневой элемент карточки деталей
                        var fullContainer = e.object.activity.render();
                        
                        // Определяем тип интерфейса (новый или старый)
                        // Для нового интерфейса кнопки находятся в .button--play, для старого — в .view--torrent
                        var cardInterfaceType = Lampa.Storage.get('card_interface_type') || 'old';
                        var target;
                        if(cardInterfaceType === 'new'){
                            target = fullContainer.find('.button--play');
                        } else {
                            target = fullContainer.find('.view--torrent');
                        }
                        console.log('[ReturnPlugin] Найден целевой контейнер:', target);
                        
                        // Создаем HTML для кнопки "Продолжить"
                        var btnHtml = `
                        <div class="full-start__button selector view--continue return--button" title="Продолжить просмотр">
                            <div class="selector__icon">
                                <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg" 
                                     alt="Продолжить" width="24" height="24" style="vertical-align: middle;">
                            </div>
                            <div class="selector__text">Продолжить</div>
                        </div>`;
                        var $btn = $(btnHtml);
                        
                        // Вешаем обработчик клика на кнопку
                        $btn.on('click', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();
                            console.log('[ReturnPlugin] Кнопка "Продолжить" нажата');
                            
                            // Запускаем плеер с данными текущего контента.
                            // Здесь используется объект e.object.item, содержащий информацию о контенте,
                            // например: url, quality, title и id.
                            Lampa.Player.play({
                                url: e.object.item.url || '',
                                quality: e.object.item.quality || {},
                                title: e.object.item.title || 'Без названия',
                                torrent_hash: e.object.item.id,
                                timeline: 0  // При необходимости можно заменить на сохранённую позицию
                            });
                        });
                        
                        // Вставляем нашу кнопку перед целевым элементом
                        if(target && target.length) {
                            target.before($btn);
                            console.log('[ReturnPlugin] Кнопка "Продолжить" успешно вставлена');
                        } else {
                            console.warn('[ReturnPlugin] Целевой контейнер для кнопки не найден');
                        }
                    } catch(err) {
                        console.error('[ReturnPlugin] Ошибка при вставке кнопки:', err);
                    }
                }, 100); // Задержка 100 мс
            }
        });
    }
    
    // Инициализируем плагин сразу, если объект Lampa уже доступен, или ждем событие lampa:start
    if(window.Lampa) {
        console.log('[ReturnPlugin] Lampa доступна, инициализируем плагин');
        initReturnPlugin();
    } else {
        console.log('[ReturnPlugin] Lampa не доступна, ждем lampa:start');
        document.addEventListener('lampa:start', initReturnPlugin);
    }
})();
