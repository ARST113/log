(function () {
    'use strict';

    if (!window.Lampa) return;

    function init() {

        Lampa.Noty.show('PLUGIN INIT');

        Lampa.Listener.on('state:changed', function (e) {

            const target = e.target || e.targer;

            if (target === 'timeline') {
                Lampa.Noty.show('TIMELINE EVENT');
            }

        });
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
