// === Poster Intercept (mobile) v1.0.0 ===============================
var PosterInterceptInfo = {
    type:        'other',
    component:   'poster_intercept',
    version:     '1.0.0',
    author:      'your-nick',
    name:        'Poster Intercept (mobile)',
    description: 'Заставляет Lampa запрашивать w780/w1280 постер в карточке'
};

(function () {
    'use strict';

    // работаем только на телефонах / планшетах
    if (!Lampa.Platform || !(Lampa.Platform.is('android') || Lampa.Platform.is('ios'))) {
        return;
    }

    // подменяем сразу после инициализации Template
    const waitTemplate = setInterval(() => {
        if (window.Template && Template.getPoster) {
            clearInterval(waitTemplate);

            const original = Template.getPoster;
            const BIG = window.devicePixelRatio >= 2 ? 'w1280' : 'w780';

            Template.getPoster = function (path, size) {
                // апскейлим только когда запрашивают «средний» плакат
                if (size === 'w342' || size === 'w500') size = BIG;
                return original.call(this, path, size);
            };

            console.log('[PosterIntercept] активен, target =', BIG);
        }
    }, 10); // проверка каждые 10 мс, обычно хватает < 100 мс
})();
