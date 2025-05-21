// Паспорт (опционально, но удобно для списка «Расширения»)
var PosterUpscaleInfo = {
    type:        'other',
    component:   'poster_upscale',
    version:     '1.0.1',
    author:      'your-github-or-nick',
    name:        'Poster Upscale (mobile)',
    description: 'Загружает полноразмерный постер на мобильных устройствах'
};

(function () {
    'use strict';

    const TARGET_WIDTH = window.devicePixelRatio >= 2 ? 1280 : 780;

    function isMobile() {
        return Lampa.Platform && (Lampa.Platform.is('android') || Lampa.Platform.is('ios'));
    }

    function upscalePoster($img) {
        let src = $img.attr('src') || $img.attr('data-src');
        if (!src || !/\/w\d+\//.test(src)) return;

        const bigger = src.replace(/\/w\d+\//, `/w${TARGET_WIDTH}/`);
        if (bigger === src) return;

        // Откат на случай 404
        $img.one('error', () => {
            console.warn('[PosterUpscalePlugin] 404, возвращаю прежний постер');
            $img.attr('src', src).attr('data-src', src);
        });

        $img
            .attr('src', bigger)
            .attr('data-src', bigger)
            .removeClass('lazyload')
            .addClass('loaded');
    }

    function handleFullCard(e) {
        if (e.type !== 'complite' || !isMobile()) return;
        setTimeout(() => {
            const $root = e.object.activity.render ? e.object.activity.render() : $(e.object);
            let $img = $root.find('.full-start-new__poster img.full--poster');
            if (!$img.length) $img = $root.find('.full-start__poster img.full--poster');
            if ($img.length) upscalePoster($img);
        }, 25);
    }

    Lampa.Listener.follow('full', handleFullCard);
    console.log('[PosterUpscalePlugin] init; target width =', TARGET_WIDTH);
})();
