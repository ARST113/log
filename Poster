// 1. Убираем TV-проверку
function startPlugin() {
    // Удаляем эту проверку:
    // if (!Lampa.Platform.screen('tv')) return console.log('Cardify', 'no tv');
    
    // Остальной код инициализации
}

// 2. Адаптируем стили для разных устройств
const style = `
    <style>
    .cardify-preview {
        width: 120px; /* Для мобильных */
        height: 80px;
        @media (min-width: 768px) {
            width: 160px; /* Для планшетов */
            height: 100px;
        }
        @media (min-width: 1024px) {
            width: 200px; /* Десктоп */
            height: 120px;
        }
    }

    .cardify-trailer__controlls {
        flex-direction: column; /* Вертикальное расположение на мобильных */
        @media (min-width: 768px) {
            flex-direction: row; /* Горизонтальное на больших экранах */
        }
    }
    </style>
`;

// 3. Добавляем обработку тач-событий
class Player {
    constructor(object, video) {
        this.html.on('click tap', () => this.handleTouch());
    }

    handleTouch() {
        if (Lampa.Platform.is('mobile')) {
            this.togglePlayback();
        }
    }
}

// 4. Адаптивная загрузка изображений
function video(data) {
    return {
        img: `https://img.youtube.com/vi/${key}/${
            Lampa.Platform.is('mobile') ? 'mqdefault' : 'maxresdefault'
        }.jpg`
    }
}

// 5. Универсальный обработчик управления
Lampa.Controller.add('cardify_trailer', {
    back: function() {
        if (Lampa.Platform.is('tv')) {
            // TV-логика
        } else {
            // Мобильная/десктоп логика
        }
    }
});

// 6. Адаптация YouTube плеера
const playerParams = {
    playerVars: {
        controls: Lampa.Platform.is('tv') ? 0 : 1, // Показываем контролы на нетв
        fs: Lampa.Platform.is('tv') ? 0 : 1 // Разрешаем полноэкранный режим
    }
};

// 7. Оптимизация производительности
function updatePosters() {
    if (Lampa.Platform.is('mobile')) {
        requestIdleCallback(() => loadImages());
    } else {
        loadImages();
    }
}
