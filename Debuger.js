(function(){
    'use strict';

    // Добавляем переводы из кода 1
    Lampa.Lang.add({
        continue_title: {
            ru: 'Продолжить',
            uk: 'Продовжити',
            en: 'Continue',
            zh: '继续',
            bg: 'Продължи'
        },
        continue_message: {
            ru: 'Возобновить просмотр с последней позиции',
            uk: 'Відновити перегляд з останньої позиції',
            en: 'Resume from last position',
            zh: '从上次位置继续',
            bg: 'Продължи от последна позиция'
        }
    });

    console.log('[MergedPlugin] Плагин объединённой кнопки загружен');

    function initMergedPlugin() {
        // Отслеживаем событие формирования полной карточки
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                setTimeout(function() {
                    try {
                        const fullContainer = e.object.activity.render();
                        const cardInterfaceType = Lampa.Storage.get('card_interface_type') || 'old';
                        
                        // Определяем куда вставлять кнопку
                        let target;
                        if (cardInterfaceType === 'new') {
                            target = fullContainer.find('.button--play');
                        } else {
                            target = fullContainer.find('.view--torrent');
                        }

                        // Создаем единую кнопку
                        const btnHtml = `
                        <div class="full-start__button selector view--continue merged--button" 
                             title="${Lampa.Lang.translate('continue_message')}">
                            <div class="selector__icon">
                                <svg height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
                                </svg>
                            </div>
                            <div class="selector__text">#{continue_title}</div>
                        </div>`;

                        // Применяем переводы и превращаем в jQuery-элемент
                        const $btn = $(Lampa.Lang.translate(btnHtml));

                        // Обработчик клика (hover:enter для Lampa)
                        $btn.on('hover:enter', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();

                            // Получаем данные о текущем контенте — url, качество, название и т.д.
                            const item = e.object.item || {};
                            // Смотрим, есть ли у нас сохранённая позиция
                            const savedPosition = Lampa.Storage.get('video_progress_' + item.id) || 0;

                            // Запускаем плеер — здесь совмещён подход из кода 2
                            Lampa.Player.play({
                                url: item.url || '',
                                quality: item.quality || {},
                                title: item.title || 'Без названия',
                                torrent_hash: item.id,
                                // Если позиция есть, стартуем с неё, иначе — 0
                                timeline: savedPosition
                            });
                        });

                        // Вставляем кнопку перед целевым элементом
                        if (target && target.length) {
                            target.before($btn);
                            console.log('[MergedPlugin] Кнопка «Продолжить» вставлена');
                        } else {
                            console.warn('[MergedPlugin] Не найден контейнер для кнопки');
                        }
                    } catch (err) {
                        console.error('[MergedPlugin] Ошибка вставки кнопки:', err);
                    }
                }, 150);
            }
        });
    }

    // Инициализируем плагин
    if (window.Lampa) {
        console.log('[MergedPlugin] Lampa доступна, инициализация...');
        initMergedPlugin();
    } else {
        console.log('[MergedPlugin] Ждем событие lampa:start...');
        document.addEventListener('lampa:start', initMergedPlugin);
    }
})();
