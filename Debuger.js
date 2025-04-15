// 1. Добавляем перевод для заглушки
Lampa.Lang.add({
    stub_title: {
        ru: 'Заглушка',
        uk: 'Заглушка',
        en: 'Stub',
        zh: '存根',
        bg: 'Заглушка'
    },
    stub_message: {
        ru: 'Функция в разработке',
        uk: 'Функція в розробці',
        en: 'Feature in development',
        zh: '功能开发中',
        bg: 'Функцията се разработва'
    }
});

// 2. Создаем шаблон кнопки
const stubButton = `<div class="full-start__button selector view--stub" data-subtitle="v1.0">
    <svg height="30" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
    <span>#{stub_title}</span>
</div>`;

// 3. Добавляем кнопку в интерфейс
Lampa.Listener.follow('full', (e) => {
    if(e.type == 'complite') {
        let btn = $(Lampa.Lang.translate(stubButton));
        
        // 4. Обработчик клика
        btn.on('hover:enter', () => {
            Lampa.Modal.open({
                title: Lampa.Lang.translate('stub_title'),
                html: `<div class="settings-param">
                    <div class="settings-param__value" style="text-align:center;padding:20px">
                        ${Lampa.Lang.translate('stub_message')}
                    </div>
                </div>`,
                onBack: () => Lampa.Modal.close(),
                size: 'medium'
            });
        });

        // 5. Вставляем после кнопки "Торрент"
        e.object.activity.render()
            .find('.view--torrent')
            .after(btn);
    }
});
