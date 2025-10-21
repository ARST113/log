(function() {
    'use strict';

    const torrentSVG = `
<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="26" height="26" viewBox="0 0 48 48">
  <path fill="#4caf50" fill-rule="evenodd" d="M23.501,44.125c11.016,0,20-8.984,20-20c0-11.015-8.984-20-20-20c-11.016,0-20,8.985-20,20C3.501,35.141,12.485,44.125,23.501,44.125z" clip-rule="evenodd"></path>
  <path fill="#fff" fill-rule="evenodd" d="M43.252,27.114C39.718,25.992,38.055,19.625,34,11l-7,1.077c1.615,4.905,8.781,16.872,0.728,18.853C20.825,32.722,17.573,20.519,15,14l-8,2l10.178,27.081c1.991,0.67,4.112,1.044,6.323,1.044c0.982,0,1.941-0.094,2.885-0.232l-4.443-8.376c6.868,1.552,12.308-0.869,12.962-6.203c1.727,2.29,4.089,3.183,6.734,3.172C42.419,30.807,42.965,29.006,43.252,27.114z" clip-rule="evenodd"></path>
</svg>
    `;

    function replaceTorrentIcon() {
        const containers = document.querySelectorAll('.full-start__button.view--torrent.selector');
        let replaced = 0;

        containers.forEach(function(container) {
            if (container.classList.contains('torrent-icon-replaced')) return;
            const origIcon = container.querySelector('svg');
            if (origIcon) {
                origIcon.outerHTML = torrentSVG;
                container.classList.add('torrent-icon-replaced');
                replaced++;
            }
        });

        if (replaced > 0) {
            console.log('✅ Replaced', replaced, 'torrent SVG icons');
        }
    }

    function startObserving() {
        const observer = new MutationObserver(function(mutations) {
            let shouldReplace = false;
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldReplace = true;
                }
            });
            if (shouldReplace) setTimeout(replaceTorrentIcon, 100);
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        console.log('🔍 MutationObserver started');
        return observer;
    }

    function init() {
        const style = document.createElement('style');
        style.textContent = `
            .torrent-icon-replaced svg {
                border-radius: 50%;
                margin-right: 8px;
                vertical-align: middle;
                transition: box-shadow .2s;
                background: transparent;
                width: 26px;
                height: 26px;
            }
            /* Наведение — можно добавить дополнительный эффект, напр. тень */
            .torrent-container-colored:hover .torrent-icon-replaced svg {
                box-shadow: 0 0 0 2px #4caf5030;
                /* Или добавить ярче фон, если нужно */
            }
        `;
        document.head.appendChild(style);

        startObserving();
        setTimeout(replaceTorrentIcon, 300);
        setInterval(replaceTorrentIcon, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            init();
        });
    } else {
        init();
    }

    window.forceReplaceTorrentIcon = function() {
        replaceTorrentIcon();
    };
})();
