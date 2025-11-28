(function () {
    'use strict';

    function startPlugin() {
        window.plugin_torrents_ready = true;

        // --- 1. ДОБАВЛЯЕМ НАСТРОЙКУ В МЕНЮ ---
        function addSettings() {
            Lampa.SettingsApi.addParam({
                component: 'player',
                param: {
                    name: 'player_torrent',
                    type: 'select',
                    values: {
                        'android': 'Android (Внешний)',
                        'inner': 'Lampa (Встроенный)'
                    },
                    default: 'android'
                },
                field: {
                    name: Lampa.Lang.translate('settings_player_type_torrent'),
                    description: 'Выберите плеер для воспроизведения торрентов'
                },
                onChange: function(value) {
                    console.log('Plugin: Player type changed to', value);
                    Lampa.Storage.set('player_torrent', value);
                }
            });
        }

        // --- 2. ЛОГИКА ПЕРЕХВАТА ---
        function hookPlayer() {
            var original_play = Lampa.Player.play;
            var original_platform_is = Lampa.Platform.is;

            Lampa.Player.play = function (object) {
                // 1. Проверяем активность и компонент
                var activity = Lampa.Activity.active();
                var is_torrent_component = activity && activity.component === 'torrents';

                // 2. Проверяем настройку
                var player_mode = Lampa.Storage.field('player_torrent');

                // ЕСЛИ ВЫБРАН "ВСТРОЕННЫЙ" И ЭТО ТОРРЕНТ
                if (is_torrent_component && player_mode === 'inner') {
                    console.log('Plugin: Mode is INNER. Spoofing platform, keeping torrent data...');

                    // ВАЖНО: Мы НЕ удаляем object.torrent_hash!
                    // Если его удалить, Лампа не включит буфер предзагрузки.
                    
                    // А) Исправляем URL для Android (убираем intent)
                    if (object && object.url) {
                         object.url = object.url.replace('intent:', 'http:');
                    }

                    // Б) Подмена платформы (Спуфинг)
                    // Это самое главное. Лампа видит torrent_hash и хочет запустить внешний плеер.
                    // Она спрашивает: "Я на Андроиде?". Мы отвечаем: "Нет".
                    // Она думает: "Ну ладно, тогда запускаю встроенный плеер с поддержкой буфера".
                    Lampa.Platform.is = function(what) {
                        if (what === 'android') return false; 
                        return original_platform_is(what);
                    };

                    // В) Принудительные настройки для гарантии
                    Lampa.Storage.set('internal_torrclient', true);

                    try {
                        original_play(object);
                    } finally {
                        // Г) Возвращаем "Андроид" на место с задержкой, чтобы интерфейс не сломался
                        setTimeout(function() {
                            Lampa.Platform.is = original_platform_is;
                            console.log('Plugin: Platform restored to Android');
                        }, 500);
                    }
                } 
                else {
                    // Стандартное поведение
                    original_play(object);
                }
            };
            
            // Player.start нам больше не нужно ломать, так как мы хотим сохранить тип 'torrent'
            // чтобы сработала логика preloader'а.
            // Оставляем original_start без изменений или просто не трогаем его.
        }

        // --- ИНИЦИАЛИЗАЦИЯ ---
        if (window.appready) {
            addSettings();
            hookPlayer();
        } else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type == 'ready') {
                    addSettings();
                    hookPlayer();
                }
            });
        }
    }

    if (!window.plugin_torrents_ready) startPlugin();
})();
