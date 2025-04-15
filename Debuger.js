// HTML-шаблон кнопки
const stubButton = `
    <div class="full-start__button selector view--stub_button">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/>
        </svg>
        <span>Заглушка</span>
    </div>
`;

// Логика вставки
Lampa.Listener.follow('full', function(e) {
    if (e.type === 'complite') {
        const render = e.object.activity.render();
        const buttonsContainer = render.find('.full-start__buttons');
        
        if (buttonsContainer.length) {
            // Добавляем кнопку в контейнер
            buttonsContainer.append($(stubButton));
            
            // Убираем стандартное поведение
            render.find('.view--stub_button')
                .off('click hover:enter')
                .css({
                    'opacity': '0.5',
                    'cursor': 'default'
                });
        }
    }
});
