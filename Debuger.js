(function(){
    'use strict';

    // Добавляем переводы для кнопки «Продолжить»
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

    console.log('[MergedPlugin] Плагин Return.js (MergedPlugin) загружен');

    function initMergedPlugin() {
        // Подписываемся на событие формирования полной карточки деталей
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                setTimeout(function() {
                    try {
                        // Получаем корневой элемент страницы деталей
                        const fullContainer = e.object.activity.render();
                        const cardInterfaceType = Lampa.Storage.get('card_interface_type') || 'old';

                        // Определяем целевой контейнер для вставки кнопки
                        let target;
                        if (cardInterfaceType === 'new') {
                            target = fullContainer.find('.button--play');
                        } else {
                            target = fullContainer.find('.view--torrent');
                        }
                        console.log('[MergedPlugin] Найден целевой контейнер:', target.length);

                        // Формируем HTML для кнопки "Продолжить" с использованием переводов
                        const btnHtml = `
                        <div class="full-start__button selector view--continue merged--button" 
                             title="${Lampa.Lang.translate('continue_message')}">
                            <div class="selector__icon">
                                <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg" 
                                     alt="${Lampa.Lang.translate('continue_title')}" width="24" height="24" style="vertical-align: middle; margin-right: 5px;">
                            </div>
                            <div class="selector__text">${Lampa.Lang.translate('continue_title')}</div>
                        </div>`;

                        const $btn = $(btnHtml);

                        // Обработчик клика: запускает плеер с параметрами, включая сохранённую позицию из "file_view"
                        $btn.on('hover:enter', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();
                            console.log('[MergedPlugin] Кнопка "Продолжить" нажата');

                            // Получаем данные о текущем контенте из объекта деталей
                            const item = e.object.item || {};
                            // Читаем объект прогресса, хранящийся в "file_view"
                            const progress = Lampa.Storage.get('file_view') || {};
                            // Если для текущего item.id есть сохранённые данные, берем поле time, иначе 0
                            const timeline = progress[String(item.id)] ? progress[String(item.id)].time : 0;
                            console.log('[MergedPlugin] item.id:', item.id, 'timeline:', timeline);

                            Lampa.Player.play({
                                url: item.url || '',
                                quality: item.quality || {},
                                title: item.title || 'Без названия',
                                torrent_hash: item.id,
                                timeline: timeline
                            });
                        });

                        // Вставляем кнопку перед целевым элементом
                        if (target && target.length) {
                            target.before($btn);
                            console.log('[MergedPlugin] Кнопка "Продолжить" вставлена');
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

    // Инициализация: если объект Lampa доступен, сразу запускаем, иначе ждём события lampa:start
    if (window.Lampa) {
        console.log('[MergedPlugin] Lampa доступна, инициализация...');
        initMergedPlugin();
    } else {
        console.log('[MergedPlugin] Lampa не доступна, ждем lampa:start...');
        document.addEventListener('lampa:start', initMergedPlugin);
    }
})();
