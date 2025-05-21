// === Mobile Poster Upgrade v1.3 ========================================
(function () {
    'use strict';

    /*  Запускаемся везде, кроме Android-TV / WebOS-TV */
    if (window.Lampa && Lampa.Platform && Lampa.Platform.is('tv')) return;

    const BIG = window.devicePixelRatio >= 2 ? 'w1280' : 'w780';

    function upscale($p){
        const style = $p.attr('style') || '';
        const re = /\/w\d+\//;
        if (!re.test(style)) return;
        const better = style.replace(re, `/${BIG}/`);
        if (better === style) return;
        $p.attr('style', better);
        console.log('[PosterUpgrade] upscale ok');
    }

    function observe($p){
        if ($p.hasClass('loaded')) upscale($p);
        const obs = new MutationObserver(() => upscale($p));
        obs.observe($p[0], {attributes:true, attributeFilter:['class','style']});
        $p.one('DOMNodeRemoved', () => obs.disconnect());
    }

    function onFull(e){
        if (e.type !== 'complite') return;
        const $root = e.object.activity.render
                     ? e.object.activity.render()
                     : $(e.object);
        const $poster = $root.find('.full-start-new__poster, .full-start__poster');
        if ($poster.length) observe($poster);
    }

    Lampa.Listener.follow('full', onFull);
    console.log('[PosterUpgrade] init, target =', BIG);
})();
