(function () {
    'use strict';

    if (!window.Lampa) return;

    function init() {

        Lampa.Listener.on('state:changed', function (e) {

            // выводим ключевые поля
            let info = [];

            if (e.target) info.push('target:' + e.target);
            if (e.targer) info.push('targer:' + e.targer);
            if (e.type) info.push('type:' + e.type);
            if (e.reason) info.push('reason:' + e.reason);

            Lampa.Noty.show('EVENT → ' + info.join(' | '));

        });
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
