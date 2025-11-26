(function () {
    'use strict';

    function startPlugin() {
        window.plugin_torrents_ready = true;

        // --- ПЕРЕХВАТ ФУНКЦИИ PLAY ---
        // Это необходимо для обработки флага continue_watching, 
        // так как мы не можем изменить код внутри src/components/torrents.js
        var original_play = Lampa.Player.play;

        Lampa.Player.play = function (object) {
            var activity = Lampa.Activity.active();

            // Проверяем, что это торрент и установлен наш флаг
            if (activity && activity.component === 'torrents' && activity.continue_watching) {
                if (object && object.timeline) {
                    // Устанавливаем флаг продолжения просмотра
                    object.timeline.continued = true;
                    console.log('Plugin: Flag timeline.continued set to TRUE via wrapper');
                }
            }

            // Вызываем оригинальный плеер
            original_play(object);
        };

        function add() {
            // Основная функция запуска
            function button_click(data) {
                // 1. ГАРАНТИРОВАННОЕ ВКЛЮЧЕНИЕ ВНУТРЕННЕГО ПЛЕЕРА
                // internal_torrclient - общий флаг
                Lampa.Storage.set('internal_torrclient', true);
                // player_torrent - конкретный выбор плеера на Android (inner = встроенный)
                Lampa.Storage.set('player_torrent', 'inner');

                // Очистка Torserver перед поиском
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
                    // Передаем параметр для перехватчика
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

            Lampa.Listener.follow('full', function (e) {
                if (e.type == 'complite') {
                    // ИКОНКА (Play в круге)
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
