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
                        const fullContainer = e.object.activity.render();
                        const cardInterfaceType = Lampa.Storage.get('card_interface_type') || 'old';

                        // Выбираем целевой контейнер для вставки кнопки:
                        // для нового интерфейса – перед элементом .button--play, для старого – перед .view--torrent
                        let target;
                        if (cardInterfaceType === 'new') {
                            target = fullContainer.find('.button--play');
                        } else {
                            target = fullContainer.find('.view--torrent');
                        }
                        console.log('[MergedPlugin] Найден целевой контейнер:', target.length);

                        // Попробуем получить данные о контенте.
                        // В разных сборках данные могут лежать в e.object.item или в e.object.data.
                        const item = e.object.item || e.object.data || {};
                        console.log('[MergedPlugin] Получены данные о контенте (item):', item);

                        // Если item.id не определён, попробуем найти его в DOM через текст заголовка (примерный вариант)
                        let contentId = item.id;
                        if (!contentId) {
                            // Пример: если в заголовке, например, содержится id, можно его извлечь
                            let headerText = fullContainer.find('.function__name').text().trim();
                            // Предположим, id — это числовая последовательность в начале строки
                            let foundId = headerText.match(/^\d+/);
                            contentId = foundId ? foundId[0] : undefined;
                            console.log('[MergedPlugin] Получен id из DOM:', contentId);
                        } else {
                            // Приводим к строке
                            contentId = String(contentId);
                        }

                        if (!contentId) {
                            console.warn('[MergedPlugin] Не удалось получить идентификатор контента');
                        }

                        // Читаем объект с данными прогресса из localStorage под ключом "file_view"
                        const progress = Lampa.Storage.get('file_view') || {};
                        const timeline = progress[contentId] ? progress[contentId].time : 0;
                        console.log('[MergedPlugin] item.id:', contentId, 'timeline:', timeline);

                        // Формируем HTML для кнопки "Продолжить"
                        const btnHtml = `
                        <div class="full-start__button selector view--continue merged--button" 
                             title="${Lampa.Lang.translate('continue_message')}">
                            <div class="selector__icon">
                                <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg" 
                                     alt="${Lampa.Lang.translate('continue_title')}" width="24" height="24" 
                                     style="vertical-align: middle; margin-right: 5px;">
                            </div>
                            <div class="selector__text">${Lampa.Lang.translate('continue_title')}</div>
                        </div>`;

                        const $btn = $(btnHtml);

                        // Обработчик клика – запускает плеер с параметрами, используя сохранённую позицию
                        $btn.on('hover:enter', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();
                            console.log('[MergedPlugin] Кнопка "Продолжить" нажата');

                            // Используем данные из item – url, quality, title и contentId
                            Lampa.Player.play({
                                url: item.url || '',
                                quality: item.quality || {},
                                title: item.title || 'Без названия',
                                torrent_hash: contentId,
                                timeline: timeline
                            });
                        });

                        // Если целевой контейнер найден, вставляем кнопку перед ним
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

    // Инициализируем плагин: если Lampa доступна, сразу, иначе ждем lampa:start
    if (window.Lampa) {
        console.log('[MergedPlugin] Lampa доступна, инициализация...');
        initMergedPlugin();
    } else {
        console.log('[MergedPlugin] Lampa не доступна, ждем lampa:start...');
        document.addEventListener('lampa:start', initMergedPlugin);
    }
})();
