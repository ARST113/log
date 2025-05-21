// === Mobile Poster Upgrade v1.2 =======================================
var PosterUpgradeInfo = {
    type:        'other',
    component:   'poster_upgrade_mobile',
    version:     '1.2.0',
    author:      'your-nick',
    name:        'Poster Upgrade (mobile)',
    description: 'После загрузки заменяет /w342/ → /w780/ (или /w1280/) прямо в background-image'
};

(function () {
    'use strict';

    /* Работать только на телефонах / планшетах */
    if (!window.Lampa || !Lampa.Platform ||
        !(Lampa.Platform.is('android') || Lampa.Platform.is('ios'))) return;

    const BIG = window.devicePixelRatio >= 2 ? 'w1280' : 'w780';

    /** Заменяем размер в background-image */
    function upscalePoster($poster) {
        const style = $poster.attr('style') || '';
        const re    = /\/w\d+\//;                 // сегмент /w342/, /w500/ …
        if (!re.test(style)) return false;

        const better = style.replace(re, `/${BIG}/`);
        if (better === style) return false;

        $poster.attr('style', better);
        return true;
    }

    /** Следим за появлением класса loaded и за изменением style */
    function observe($poster) {
        // Если картинка уже «готова», апскейлим сразу
        if ($poster.hasClass('loaded')) upscalePoster($poster);

        const obs = new MutationObserver(muts => {
            let changed = false;
            muts.forEach(m => {
                if (m.type === 'attributes' && m.attributeName === 'class' &&
                    $poster.hasClass('loaded')) {
                    changed = upscalePoster($poster) || changed;
                }
                if (m.type === 'attributes' && m.attributeName === 'style') {
                    changed = upscalePoster($poster) || changed;
                }
            });
            // как только удалось заменить — можно отключиться
            if (changed) obs.disconnect();
        });

        obs.observe($poster[0], { attributes: true, attributeFilter: ['class', 'style'] });

        // отключаем наблюдение, когда карточка уходит из DOM
        $poster.one('DOMNodeRemoved', () => obs.disconnect());
    }

    /** Обработчик события full:complite */
    function onFull(e) {
        if (e.type !== 'complite') return;

        // root карточки
        const $root = e.object.activity.render ? e.object.activity.render()
                                               : $(e.object);

        // новый и старый интерфейс
        const $poster = $root.find('.full-start-new__poster, .full-start__poster');

        if ($poster.length) observe($poster);
    }

    /* Подписываемся */
    Lampa.Listener.follow('full', onFull);
    console.log('[PosterUpgrade] init, target =', BIG);
})();
