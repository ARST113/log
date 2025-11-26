(function () {
    'use strict';

    function startPlugin() {
        window.plugin_torrents_ready = true;

        console.log('PLUGIN: Starting FORCE INTERNAL PLAYER plugin');

        // --- 1. ЖЕСТКАЯ БЛОКИРОВКА НАСТРОЕК ---
        // Используем defineProperty, чтобы никто (даже сама Лампа) не мог изменить эти настройки обратно
        function lockSetting(name, value) {
            try {
                Lampa.Storage.set(name, value);
                // Это предотвращает изменение настройки другими скриптами
                /* Обратите внимание: Lampa.Storage.set перезаписывает значение, 
                   но мы будем надеяться на приоритет нашего плагина */
            } catch (e) {}
        }

        lockSetting('internal_torrclient', true);
        lockSetting('player_torrent', 'inner');
        lockSetting('player_video', 'inner'); // Важно! Иногда торрент превращается в просто "video"
        lockSetting('launch_player', 'inner');

        // --- 2. ПОДМЕНА ПЛАТФОРМЫ (ГЛАВНЫЙ ТРЮК) ---
        // Сохраняем оригинальную функцию проверки платформы
        var original_platform_is = Lampa.Platform.is;

        // --- 3. ПЕРЕХВАТЧИК ВОСПРОИЗВЕДЕНИЯ ---
        var original_play = Lampa.Player.play;

        Lampa.Player.play = function (object) {
            var activity = Lampa.Activity.active();
            var is_our_torrent = activity && activity.component === 'torrents';

            if (is_our_torrent) {
                console.log('PLUGIN: Intercepting Play. Spoofing Platform...');

                // А) УДАЛЯЕМ ВСЕ ПРИЗНАКИ ТОРРЕНТА И ССЫЛКИ НА ВНЕШНИЙ МИР
                if (object) {
                    delete object.torrent_hash;
                    delete object.MagnetUri;
                    delete object.Link;
                    // Удаляем Android-специфичные флаги
                    if(object.url) object.url = object.url.replace('intent:', 'http:');
                }

                // Б) ПОДМЕНЯЕМ ПЛАТФОРМУ
                // Мы временно говорим Лампе: "Мы НЕ Android".
                // Это заставляет player.js пропустить блок "if (android) openExternal"
                // и пойти в блок "else { запуск html5 плеера }"
                Lampa.Platform.is = function(what) {
                    if (what === 'android') return false; // МЫ НЕ АНДРОИД!
                    return original_platform_is(what);
                };

                // В) ОБРАБОТКА CONTINUE WATCHING
                if (activity.continue_watching && object.timeline) {
                    object.timeline.continued = true;
                }
            }

            try {
                // Запускаем плеер. Лампа думает, что это браузер, и открывает внутренний плеер.
                original_play(object);
            } finally {
                // Г) ВОЗВРАЩАЕМ ПЛАТФОРМУ ОБРАТНО
                // Возвращаем как было, чтобы работал пульт и другие функции Android
                // Делаем это с небольшой задержкой, чтобы успела пройти инициализация плеера
                setTimeout(function() {
                    Lampa.Platform.is = original_platform_is;
                    console.log('PLUGIN: Platform restored to Android');
                }, 500);
            }
        };

        // --- 4. ПЕРЕХВАТЧИК START (ДЛЯ ПОДСТРАХОВКИ) ---
        var original_start = Lampa.Player.start;
        Lampa.Player.start = function(data, need, inner) {
             if (need === 'torrent' || (data && data.torrent_hash)) {
                 // Если это торрент - превращаем его в 'online'
                 // Это меняет логику выбора плеера внутри Лампы
                 need = 'online'; 
                 if(data) delete data.torrent_hash;
             }
             original_start(data, need, inner);
        };

        // --- 5. ФИЗИЧЕСКАЯ БЛОКИРОВКА API (НА ВСЯКИЙ СЛУЧАЙ) ---
        function killAndroidAPI() {
            var killer = function() { return false; };
            if (window.AndroidJS) {
                window.AndroidJS.openPlayer = killer;
                window.AndroidJS.openTorrent = killer;
            }
            if (window.Android) {
                window.Android.openPlayer = killer;
                window.Android.openTorrent = killer;
            }
        }
        killAndroidAPI();
        // Повторяем убийство через 1 сек, вдруг Android интерфейс инжектится с задержкой
        setTimeout(killAndroidAPI, 1000);


        function add() {
            // --- 6. ЛОГИКА КНОПКИ ---
            function button_click(data) {
                if (window.Torserver) window.Torserver.clear();

                var year = ((data.movie.first_air_date || data.movie.release_date || '0000') + '').slice(0, 4);
                
                var combinations = {
                    'df': data.movie.original_title,
                    'df_year': data.movie.original_title + ' ' + year,
                    'df_lg': data.movie.original_title + ' ' + data.movie.title,
                    'df_lg_year': data.movie.original_title + ' ' + data.movie.title + ' ' + year,
                    'lg': data.movie.title,
                    'lg_year': data.movie.title + ' ' + year,
                    'lg_df': data.movie.title + ' ' + data.movie.original_title,
                    'lg_df_year': data.movie.title + ' ' + data.movie.original_title + ' ' + year
                };

                Lampa.Activity.push({
                    url: '',
                    title: Lampa.Lang.translate('title_torrents') + ' ...',
                    component: 'torrents',
                    search: combinations[Lampa.Storage.field('parse_lang')],
                    search_one: data.movie.title,
                    search_two: data.movie.original_title,
                    movie: data.movie,
                    page: 1,
                    continue_watching: true 
                });
            };

            // Меню выбора Jackett
            function showJackettSelect(e) {
                var jackett_default = {
                    'jacred.pro': '1', 'jacred.xyz': '1', 'jr.maxvol.pro': '1',
                    'jacblack.ru:9117': '1', 'jac-red.ru': '1', 'jacred.freebie.tom.ru': '1'
                };
                var jackett = {
                    jackett_url: Lampa.Storage.field('jackett_url'),
                    jackett_key: Lampa.Storage.field('jackett_key'),
                    jackett_interview: Lampa.Storage.field('jackett_interview'),
                    jackett_url_pva: Lampa.Storage.get('jackett_url_pva', Lampa.Arrays.getKeys(jackett_default).join(';')),
                    jackett_key_pva: Lampa.Storage.get('jackett_key_pva', Lampa.Arrays.getValues(jackett_default).join(';')),
                    items: []
                };

                function cleanTitle(title) {
                    return title.replace(/https?:\/\//, '').replace(/^#/, '').replace(/:\d+$/, '').replace(/^api\./, '').replace(/jacred.viewbox.dev/, 'viewbox.dev').replace(/jacred.freebie.tom.ru/, 'freebie.tom.ru');
                }
                
                jackett.jackett_url_pva.split(';').forEach(function (item) {
                    jackett.items.push({
                        title: cleanTitle(item),
                        jackett_url: item.toLowerCase().indexOf('#') == 0 ? item.slice(1) : item,
                        jackett_key: '',
                        interview: item.toLowerCase().indexOf('#') == 0 ? 'all' : 'healthy',
                        selected: false
                    });
                });
                var i = 0;
                jackett.jackett_key_pva.split(';').forEach(function (item) {
                    if (jackett.items[i]) jackett.items[i++].jackett_key = item;
                });

                Lampa.Select.show({
                    title: Lampa.Lang.translate('settings_parser_use'),
                    items: jackett.items,
                    onSelect: function onSelect(b) {
                        try {
                            Lampa.Storage.set('jackett_url', b.jackett_url);
                            Lampa.Storage.set('jackett_key', b.jackett_key);
                            Lampa.Storage.set('jackett_interview', b.interview);
                            button_click(e.data);
                        } finally {
                            Lampa.Storage.set('jackett_url', jackett.jackett_url);
                            Lampa.Storage.set('jackett_key', jackett.jackett_key);
                        }
                    },
                    onBack: function onBack() {
                        Lampa.Controller.toggle('content');
                    }
                });
            }

            // --- 7. КНОПКА В ИНТЕРФЕЙСЕ ---
            Lampa.Listener.follow('full', function (e) {
                if (e.type == 'complite') {
                    // Ваша SVG иконка
                    var icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="50px" height="50px" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7585,15.7315v10.24a6.2415,6.2415,0,0,0,6.1855,6.2969l.056,0h0a6.2413,6.2413,0,0,0,6.2417-6.2412l0-.0559v-10.24"/><line x1="30.2415" y1="26.0271" x2="30.2415" y2="32.2685"/><line x1="17.7585" y1="25.9714" x2="17.7585" y2="40.2097"/><circle cx="24" cy="24" r="21.5"/></svg>';
                    
                    var button = '<div class="full-start__button view--torrent">' + icon + '<span>' + Lampa.Lang.translate('title_torrents') + ' ...</span></div>';
                    var btn = $(button);
                    
                    btn.on('hover:enter', function () {
                        showJackettSelect(e);
                    });

                    if (e.data && e.object) {
                        e.object.activity.render().find('.view--torrent').last().after(btn);
                    }
                }
            });

            // Настройки
            Lampa.SettingsApi.addParam({
                component: 'parser',
                param: { name: 'jackett_url_pva', type: 'input', value: '', default: '' },
                field: { name: Lampa.Lang.translate('settings_parser_jackett_link') + ' ...', description: 'jacred.xyz;jacred.ru;#jackett:9117' },
                onChange: function (value) {}
            });
            Lampa.SettingsApi.addParam({
                component: 'parser',
                param: { name: 'jackett_key_pva', type: 'input', value: '', default: '' },
                field: { name: Lampa.Lang.translate('settings_parser_jackett_key') + ' ...', description: 'apiKey' },
                onChange: function (value) {}
            });
            Lampa.Params.select('jackett_url_pva', '', '');
            Lampa.Params.select('jackett_key_pva', '', '');
            Lampa.Settings.main().update();
        }

        if (window.appready) add();
        else {
            Lampa.Listener.follow('app', function (e) {
                if (e.type == 'ready') add();
            });
        }
    }

    if (!window.plugin_torrents_ready) startPlugin();
})();
