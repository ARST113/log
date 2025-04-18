(function(){
    'use strict';

    // Добавляем стили для кнопки
    var style = `
    .view--continue {
      background-color: #15bdff;
      color: #fff;
    }
    .view--continue.focus,
    .view--continue:hover {
      background-color: #0d8ad1;
    }
    `;
    $('head').append('<style>' + style + '</style>');

    /**
     * Добавить кнопку "Продолжить просмотр" рядом со стандартной кнопкой
     * @param {jQuery} render  - контейнер c кнопкой запуска (.view--torrent)
     * @param {Object} card    - объект карточки (movie) с полями url, quality, title и т.д.
     */
    function addContinueBtn(render, card) {
        // Получаем сохранённый прогресс
        var views = Lampa.Storage.get('file_view', {});
        var key   = card.torrent_hash || card.id;
        var v     = views[key];

        if(v && v.percent > 0 && v.percent < 100) {
            // Формируем кнопку
            var btn = $(
                '<div class="full-start__button selector view--continue" ' +
                'data-subtitle="' + Lampa.Utils.secondsToTime(v.time, true) + '/' + Lampa.Utils.secondsToTime(v.duration, true) + '">Продолжить просмотр</div>'
            );

            // При клике вызываем плеер с передачей timeline
            btn.on('hover:enter click', function(){
                Lampa.Player.play(Object.assign({}, card, {
                    timeline: {
                        time:     v.time,
                        duration: v.duration
                    }
                }));
            });

            // Вставляем кнопку после стандартной
            render.after(btn);
        }
    }

    // Слушаем событие полного просмотра карточки
    Lampa.Listener.follow('full', function(e) {
        if(e.type === 'complite') {
            var root  = e.object.activity.render();
            var node  = root.find('.view--torrent');
            var movie = e.data.movie;

            if(node.length && root.find('.view--continue').length === 0) {
                addContinueBtn(node, movie);
            }
        }
    });

    // Регистрируем плагин в манифесте
    Lampa.Manifest.plugins = Lampa.Manifest.plugins || [];
    Lampa.Manifest.plugins.push({
        type:        'addon',
        version:     '1.0.0',
        name:        'Продолжить просмотр',
        description: 'Добавляет кнопку «Продолжить просмотр» в полную карточку'
    });

})();
