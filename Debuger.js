(function(){
    'use strict';
    
    // Добавляем переводы
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

    console.log('[EnhancedPlugin] Плагин продолжения просмотра загружен');
    
    function initEnhancedPlugin() {
        Lampa.Listener.follow('full', function(e) {
            if(e.type === 'complite'){
                setTimeout(function(){
                    try {
                        const fullContainer = e.object.activity.render();
                        const cardInterfaceType = Lampa.Storage.get('card_interface_type') || 'old';
                        let target;
                        
                        // Определяем позицию для вставки
                        if(cardInterfaceType === 'new'){
                            target = fullContainer.find('.button--play');
                        } else {
                            target = fullContainer.find('.view--torrent');
                        }
                        
                        // Создаем кнопку с локализацией
                        const btnHtml = `
                        <div class="full-start__button selector view--continue enhanced--button" 
                             title="${Lampa.Lang.translate('continue_message')}"
                             data-subtitle="v2.1">
                            <div class="selector__icon">
                                <svg height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
                                </svg>
                            </div>
                            <div class="selector__text">#{continue_title}</div>
                        </div>`;
                        
                        const $btn = $(Lampa.Lang.translate(btnHtml));

                        // Обработчик клика
                        $btn.on('hover:enter', function(evt) {
                            evt.preventDefault();
                            evt.stopPropagation();
                            
                            // Получаем данные о текущем контенте
                            const item = e.object.item || {};
                            const savedPosition = Lampa.Storage.get('video_progress_' + item.id) || 0;

                            if(savedPosition > 0) {
                                Lampa.Player.play({
                                    url: item.url,
                                    quality: item.quality,
                                    title: item.title,
                                    torrent_hash: item.id,
                                    timeline: savedPosition
                                });
                            } else {
                                Lampa.Noty.show(Lampa.Lang.translate('online_query_start') + 
                                ` "${item.title}" ` + 
                                Lampa.Lang.translate('online_query_end'));
                            }
                        });

                        // Вставка в интерфейс
                        if(target && target.length) {
                            target.before($btn);
                            console.log('[EnhancedPlugin] Кнопка добавлена');
                        }
                    } catch(err) {
                        console.error('[EnhancedPlugin] Ошибка:', err);
                    }
                }, 150);
            }
        });
    }

    // Инициализация
    if(window.Lampa) {
        initEnhancedPlugin();
    } else {
        document.addEventListener('lampa:start', initEnhancedPlugin);
    }
})();
