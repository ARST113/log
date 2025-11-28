(function () {
    'use strict';

    function startPlugin() {
        window.plugin_torrents_ready = true;

        // --- 1. ДОБАВЛЯЕМ НАСТРОЙКУ В МЕНЮ ---
        function addSettings() {
            // Расширяем выбор плееров для торрентов
            // Обычно на Android там только {android: 'Android'}
            // Мы добавляем 'inner': 'Встроенный'
            
            Lampa.SettingsApi.addParam({
                component: 'player',
                param: {
                    name: 'player_torrent',
                    type: 'select',
                    values: {
                        'android': 'Android (Внешний)',
                        'inner': 'Lampa (Встроенный)' // Наш добавленный пункт
                    },
                    default: 'android'
                },
                field: {
                    name: Lampa.Lang.translate('settings_player_type_torrent'), // Тип плеера для торрентов
                    description: 'Выберите плеер для воспроизведения торрентов'
                },
                onChange: function(value) {
                    console.log('Plugin: Player type changed to', value);
                    // При изменении сразу сохраняем, чтобы логика подхватила
                    Lampa.Storage.set('player_torrent', value);
                }
            });
        }

        // --- 2. ЛОГИКА ПЕРЕХВАТА (РАБОТАЕТ ТОЛЬКО ЕСЛИ ВЫБРАН "ВСТРОЕННЫЙ") ---
        function hookPlayer() {
            var original_play = Lampa.Player.play;
            var original_platform_is = Lampa.Platform.is;

            Lampa.Player.play = function (object) {
                // 1. Проверяем, что сейчас активен компонент торрентов
                var activity = Lampa.Activity.active();
                var is_torrent_component = activity && activity.component === 'torrents';

                // 2. Проверяем, ЧТО выбрал пользователь в настройках
                var player_mode = Lampa.Storage.field('player_torrent');

                // ПРИМЕНЯЕМ ЛОГИКУ ТОЛЬКО ЕСЛИ ВЫБРАН "ВСТРОЕННЫЙ" (inner)
                if (is_torrent_component && player_mode === 'inner') {
                    console.log('Plugin: Mode is INNER. Applying spoofing...');

                    // А) Очистка данных (удаляем признаки торрента для Android)
                    if (object) {
                        delete object.torrent_hash;
                        delete object.MagnetUri;
                        delete object.Link;
                        if(object.url) object.url = object.url.replace('intent:', 'http:');
                    }

                    // Б) Подмена платформы (спуфинг)
                    // Говорим Лампе, что мы не на Андроиде, чтобы она не пыталась вызвать Intent
                    Lampa.Platform.is = function(what) {
                        if (what === 'android') return false; 
                        return original_platform_is(what);
                    };

                    // В) Принудительная установка внутреннего клиента (на всякий случай)
                    Lampa.Storage.set('internal_torrclient', true);

                    try {
                        // Запускаем плеер (Лампа думает, что это браузер -> открывает встроенный)
                        original_play(object);
                    } finally {
                        // Г) Возвращаем всё как было через 500мс
                        setTimeout(function() {
                            Lampa.Platform.is = original_platform_is;
                            console.log('Plugin: Platform restored to Android');
                        }, 500);
                    }
                } 
                else {
                    // Если выбран "Android" или это не торрент — ничего не трогаем,
                    // работает стандартная логика Лампы.
                    console.log('Plugin: Mode is EXTERNAL (or not torrent). Using default behavior.');
                    original_play(object);
                }
            };
            
            // Также перехватываем start() для полной надежности, 
            // чтобы перебить логику выбора до инициализации play()
            var original_start = Lampa.Player.start;
            Lampa.Player.start = function(data, need, inner) {
                var player_mode = Lampa.Storage.field('player_torrent');
                
                // Если это торрент И выбран встроенный плеер
                if ((need === 'torrent' || (data && data.torrent_hash)) && player_mode === 'inner') {
                     // Подменяем тип на 'online', чтобы обойти проверки Android в player.js
                     need = 'online'; 
                     if(data) delete data.torrent_hash;
                }
                original_start(data, need, inner);
            };
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
