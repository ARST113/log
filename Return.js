/**
 * Продолжить просмотр - виджет
 * Создает виджет на главной странице, показывающий последние просмотренные элементы
 * При клике запускает воспроизведение сразу с сохраненной позиции
 */

(function() {
    // Конфигурация
    const MAX_HISTORY_ITEMS = 10; // Максимальное количество элементов в истории
    const STORAGE_KEY = 'continue_watching'; // Ключ для хранения в Storage

    /**
     * Сохраняет текущий элемент в историю просмотров
     * @param {Object} card - Объект карточки с метаданными о просматриваемом элементе
     * @param {Object} params - Дополнительные параметры, такие как текущий адрес
     */
    function saveToHistory(card, params) {
        if (!card || !card.id) return;
        
        // Получаем текущую историю или инициализируем пустой массив
        let history = Lampa.Storage.get(STORAGE_KEY, []);
        
        // Создаем элемент истории
        const historyItem = {
            id: card.id,
            title: card.title || card.name || 'Неизвестно',
            poster: card.poster || card.img || '',
            timestamp: Date.now(),
            time: card.timeline ? card.timeline.time : 0,
            duration: card.timeline ? card.timeline.duration : 0,
            address: params ? params.url || '' : '',
            card: card // Сохраняем оригинальный объект карточки
        };
        
        // Удаляем этот элемент, если он уже существует (для предотвращения дубликатов)
        history = history.filter(item => item.id !== historyItem.id);
        
        // Добавляем новый элемент в начало массива
        history.unshift(historyItem);
        
        // Ограничиваем размер истории
        if (history.length > MAX_HISTORY_ITEMS) {
            history = history.slice(0, MAX_HISTORY_ITEMS);
        }
        
        // Сохраняем в Storage
        Lampa.Storage.set(STORAGE_KEY, history);
    }
    
    /**
     * Получаем все элементы из истории
     * @returns {Array} Элементы истории
     */
    function getHistoryItems() {
        return Lampa.Storage.get(STORAGE_KEY, []);
    }
    
    /**
     * Форматирует время для отображения
     * @param {Number} seconds - Время в секундах
     * @returns {String} Отформатированное время
     */
    function formatTime(seconds) {
        return Lampa.Utils.secondsToTime(seconds);
    }
    
    /**
     * Вычисляет процент прогресса
     * @param {Number} time - Текущее время в секундах
     * @param {Number} duration - Общая продолжительность в секундах
     * @returns {Number} Процент прогресса (0-100)
     */
    function calculateProgress(time, duration) {
        if (!duration || duration === 0) return 0;
        let progress = (time / duration) * 100;
        return Math.min(100, Math.max(0, progress)); // Ограничиваем между 0-100
    }
    
    /**
     * Воспроизвести видео с сохраненной позиции
     * @param {Object} item - Элемент истории просмотра
     */
    function playVideo(item) {
        if (!item || !item.card) return;
        
        // Создаем объект для плеера
        const playData = {
            url: item.card.url || item.card.season ? undefined : item.card.link,
            title: item.title,
            timeline: {
                time: item.time,
                duration: item.duration
            }
        };
        
        // Добавляем необходимые поля из карточки
        if (item.card.quality) playData.quality = item.card.quality;
        if (item.card.subtitles) playData.subtitles = item.card.subtitles;
        if (item.card.translate) playData.translate = item.card.translate;
        if (item.card.playlist) playData.playlist = item.card.playlist;
        if (item.card.url) playData.url = item.card.url;
        
        // Для сериалов (если есть season и episode)
        if (item.card.season) {
            // Если это сериал, копируем все данные из карточки для корректного воспроизведения
            Object.assign(playData, item.card);
        }
        
        // Запуск плеера
        Lampa.Player.play(playData);
        
        // Сообщаем что мы запустили видео из виджета продолжения просмотра
        Lampa.Player.callback(function() {
            Lampa.Controller.toggle('content');
        });
    }
    
    /**
     * Создает виджет продолжения просмотра для главной страницы
     */
    function createWidget() {
        // Регистрируем виджет
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                // Добавляем виджет на главную страницу
                const continueWatchingWidget = {
                    title: 'Продолжить просмотр',
                    tag: 'continue_watching',
                    classes: 'continue-watching',
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 16.5V7.5L16 12L10 16.5Z" fill="currentColor"/></svg>',
                    data: getHistoryItems
                };
                
                Lampa.Listener.follow('app.element.create', function(element) {
                    if (element.element && element.element.tag === 'continue_watching') {
                        renderItems(element.body);
                    }
                });
                
                // Добавляем виджет на главную страницу
                Lampa.Listener.follow('app.ready', function() {
                    Lampa.Component.add('continue_watching', continueWatchingWidget);
                });
            }
        });
    }
    
    /**
     * Отрисовка элементов истории в виджете
     * @param {HTMLElement} container - Контейнер для отрисовки элементов
     */
    function renderItems(container) {
        const items = getHistoryItems();
        
        if (!items || items.length === 0) {
            container.innerHTML = '<div class="empty-list">Нет недавно просмотренных элементов</div>';
            return;
        }
        
        let html = '<div class="items-container">';
        
        items.forEach((item) => {
            const progress = calculateProgress(item.time, item.duration);
            const timeString = formatTime(item.time) + (item.duration ? ' / ' + formatTime(item.duration) : '');
            
            html += `
                <div class="continue-item" data-id="${item.id}">
                    <div class="continue-poster">
                        <img src="${item.poster}" alt="${item.title}">
                        <div class="continue-progress">
                            <div class="continue-progress-bar" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    <div class="continue-title">${item.title}</div>
                    <div class="continue-time">${timeString}</div>
                </div>
            `;
        });
        
        html += '</div>';
        container.innerHTML = html;
        
        // Добавляем обработчики событий к элементам
        const itemElements = container.querySelectorAll('.continue-item');
        itemElements.forEach((element) => {
            element.addEventListener('click', function() {
                const id = this.dataset.id;
                const item = items.find(i => i.id === id);
                
                if (item && item.card) {
                    // Сразу запускаем воспроизведение с сохраненной позиции
                    playVideo(item);
                }
            });
        });
    }
    
    /**
     * Инициализация плагина
     */
    function init() {
        // Добавляем стили для виджета
        const style = document.createElement('style');
        style.textContent = `
            .continue-watching .items-container {
                display: flex;
                overflow-x: auto;
                padding: 10px 0;
            }
            
            .continue-watching .continue-item {
                width: 200px;
                margin-right: 15px;
                cursor: pointer;
                position: relative;
            }
            
            .continue-watching .continue-poster {
                position: relative;
                width: 100%;
                height: 300px;
                border-radius: 8px;
                overflow: hidden;
            }
            
            .continue-watching .continue-poster img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .continue-watching .continue-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background-color: rgba(255, 255, 255, 0.3);
            }
            
            .continue-watching .continue-progress-bar {
                height: 100%;
                background-color: #15bdff;
            }
            
            .continue-watching .continue-title {
                margin-top: 8px;
                font-weight: bold;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .continue-watching .continue-time {
                font-size: 12px;
                color: #999;
            }
            
            .continue-watching .empty-list {
                padding: 20px;
                text-align: center;
                color: #999;
            }
        `;
        document.head.appendChild(style);
        
        // Подписываемся на события плеера для сохранения истории
        Lampa.Listener.follow('player', function(e) {
            if (e.type === 'destroy') {
                // Плеер был закрыт, сохраняем текущую карточку и время
                if (e.object && e.object.card) {
                    saveToHistory(e.object.card, e.object.params);
                }
            }
        });
        
        // Создаем виджет
        createWidget();
        
        // Добавляем синхронизацию Storage
        Lampa.Storage.sync(STORAGE_KEY, 'array_object_id');
    }
    
    // Запускаем инициализацию, когда приложение готово
    Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') {
            init();
        }
    });
})();
