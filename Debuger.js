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

    console.log('[MergedPlugin] Плагин Return.js загружен');

    function initMergedPlugin() {
        // Подписываемся на событие формирования полной карточки деталей
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                // Задержка 150 мс для гарантии полной отрисовки DOM
                setTimeout(function() {
                    try {
                        // Получаем корневой элемент страницы деталей
                        const fullContainer = e.object.activity.render();
                        // Определяем тип интерфейса – новый или старый
                        const cardInterfaceType = Lampa.Storage.get('card_interface_type') || 'old';

                        // Выбираем целевой контейнер для вставки кнопок
                        // Для нового интерфейса целевой элемент — .button--play,
                        // для старого — .view--torrent (аналог SorterPlugin)
                        let target;
                        if (cardInterfaceType === 'new') {
                            target = fullContainer.find('.button--play');
                        } else {
                            target = fullContainer.find('.view--torrent');
                        }
                        console.log('[MergedPlugin] Найден целевой контейнер:', target.length);

                        // Формируем HTML для кнопки "Продолжить"
                        // Здесь используется перевод: #{continue_title} и атрибут title с переводом 'continue_message'
                        const btnHtml = `
                        <div class="full-start__button selector view--continue merged--button" 
                             title="${Lampa.Lang.translate('continue_message')}">
                            <div class="selector__icon">
                                <img src="https://raw.githubusercontent.com/ARST113/log/refs/heads/main/cinema-film-movies-add-svgrepo-com.svg" 
                                     alt="${Lampa.Lang.translate('continue_title')}" width="24" height="24" style="vertical-align: middle; margin-right: 5px;">
                            </div>
                            <div class="selector__text">${Lampa.Lang.translate('continue_title')}</div>
                        </div>`;

                        // Преобразуем HTML в jQuery-элемент
                        const $btn = $(btnHtml);

                        // Обработчик клика (в Лампе вместо "click" часто используют "hover:enter")
                        $btn.on('hover:enter', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();
                            console.log('[MergedPlugin] Кнопка "Продолжить" нажата');
                            
                            // Получаем объект с данными о текущем контенте из страницы деталей
                            const item = e.object.item || {};
                            // Читаем сохранённую позицию воспроизведения для данного контента 
                            // (ключ video_progress_ID, где ID берется из item.id)
                            const savedPosition = Lampa.Storage.get('video_progress_' + item.id) || 0;

                            // Запускаем плеер с уже сформированными данными
                            Lampa.Player.play({
                                url: item.url || '',
                                quality: item.quality || {},
                                title: item.title || 'Без названия',
                                torrent_hash: item.id,
                                timeline: savedPosition
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

    // Инициализируем плагин, если Lampa уже доступна, иначе ждем событие lampa:start
    if (window.Lampa) {
        console.log('[MergedPlugin] Lampa доступна, инициализация...');
        initMergedPlugin();
    } else {
        console.log('[MergedPlugin] Lampa не доступна, ждем lampa:start...');
        document.addEventListener('lampa:start', initMergedPlugin);
    }
})();
