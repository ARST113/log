from pathlib import Path

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    s = s.replace(old, new, 1)


replace_once(
    "var BOOT_VERSION = 'v5.6.0-online-reresolve-20260828';",
    "var BOOT_VERSION = 'v5.6.1-desktop-input-focus-20260828';",
    'version'
)

replace_once(
    "        var cardScanQueued = false;\n        var controllerRefreshTimer = null;",
    "        var cardScanQueued = false;\n        var controllerRefreshTimer = null;\n        var controllerRegisteredNode = null;\n        var controllerRegisteredState = '';",
    'controller registration state'
)

old_bind = '''        function bindLaunch(button, movie) {
            function launch() {
                return launchFromButton(button, movie);
            }

            button
                .off('click.continueWatchUniversalLaunch')
                .off('hover:enter.continueWatchUniversalLaunch')
                .on('click.continueWatchUniversalLaunch', launch)
                .on('hover:enter.continueWatchUniversalLaunch', launch);
        }
'''
new_bind = '''        function bindLaunch(button, movie) {
            function launch(event) {
                if (event) {
                    try { event.preventDefault(); } catch (e) {}
                    try { event.stopPropagation(); } catch (e2) {}
                    try { event.stopImmediatePropagation(); } catch (e3) {}
                }
                return launchFromButton(button, movie);
            }

            button
                .off('.continueWatchUniversalLaunch')
                .on('hover:enter.continueWatchUniversalLaunch', function () {
                    return launch();
                })
                .on('click.continueWatchUniversalLaunch', function (event) {
                    return launch(event);
                });

            // Desktop browsers let Lampa's mouse-navigation move controller focus on
            // mousedown before click. Prevent that default focus hop while keeping the
            // actual click handler above. Android/touch does not depend on this branch.
            if (Utils.getPlatformKind() === 'unknown') {
                button
                    .on('mousedown.continueWatchUniversalLaunch', function (event) {
                        try { event.preventDefault(); } catch (e) {}
                        try { event.stopPropagation(); } catch (e2) {}
                    })
                    .on('pointerdown.continueWatchUniversalLaunch', function (event) {
                        if (event && event.pointerType && event.pointerType !== 'mouse') return;
                        try { event.preventDefault(); } catch (e) {}
                        try { event.stopPropagation(); } catch (e2) {}
                    });
            }
        }
'''
replace_once(old_bind, new_bind, 'bindLaunch')

old_refresh = '''        function refreshCardController() {
            function appendButton() {
                try {
                    var current = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled() : null;
                    var buttons = $('.button--continue-watch-native-just').filter(function () {
                        return this.offsetParent !== null;
                    });

                    if (
                        current && current.name === 'full_start' &&
                        buttons.length && Lampa.Controller.collectionAppend
                    ) {
                        Lampa.Controller.collectionAppend(buttons);
                    }
                } catch (e) {}
            }

            appendButton();
            clearTimeout(controllerRefreshTimer);
            controllerRefreshTimer = setTimeout(appendButton, 300);
        }
'''
new_refresh = '''        function refreshCardController(force) {
            function appendButton(forceAppend) {
                try {
                    var current = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled() : null;
                    var buttons = $('.button--continue-watch-native-just').filter(function () {
                        return this.offsetParent !== null;
                    }).first();

                    if (!(
                        current && current.name === 'full_start' &&
                        buttons.length && Lampa.Controller.collectionAppend
                    )) return;

                    var node = buttons[0];
                    var state = String(buttons.attr('data-cwu-state') || '');

                    // collectionAppend rebuilds the controller collection. Repeating it on
                    // every MutationObserver/scan tick makes desktop mouse focus jump to a
                    // neighbouring selector. Register only a new/replaced button.
                    if (!forceAppend && controllerRegisteredNode === node && controllerRegisteredState === state) {
                        return;
                    }

                    Lampa.Controller.collectionAppend(buttons);
                    controllerRegisteredNode = node;
                    controllerRegisteredState = state;
                } catch (e) {}
            }

            appendButton(!!force);
            clearTimeout(controllerRefreshTimer);
            controllerRefreshTimer = setTimeout(function () {
                appendButton(false);
            }, 300);
        }
'''
replace_once(old_refresh, new_refresh, 'refreshCardController')

old_render = '''            if (!existing.length) {
                insertButton(render, createButton(movie, params));
            } else if (String(existing.attr('data-cwu-state') || '') !== stateKey) {
                existing.replaceWith(createButton(movie, params));
            }

            render.find('.button--continue-watch-native-just').each(function () {
                bindLaunch($(this), movie);
            });

            refreshCardController();
'''
new_render = '''            var controllerChanged = false;

            if (!existing.length) {
                insertButton(render, createButton(movie, params));
                controllerChanged = true;
            } else if (String(existing.attr('data-cwu-state') || '') !== stateKey) {
                existing.replaceWith(createButton(movie, params));
                controllerChanged = true;
            }

            render.find('.button--continue-watch-native-just').each(function () {
                bindLaunch($(this), movie);
            });

            if (controllerChanged) refreshCardController(true);
'''
replace_once(old_render, new_render, 'render controller refresh')

old_css = "                    '.button--continue-watch-native-just{opacity:1!important;}' +\n                    '.button--continue-watch-native-just .continue-watch-native-just-icon{flex-shrink:0;}' +"
new_css = "                    '.button--continue-watch-native-just{opacity:1!important;pointer-events:auto!important;cursor:pointer!important;position:relative!important;}' +\n                    '.button--continue-watch-native-just .continue-watch-native-just-icon{flex-shrink:0;pointer-events:none!important;}' +\n                    '.button--continue-watch-native-just span,.button--continue-watch-native-just:after{pointer-events:none!important;}' +"
replace_once(old_css, new_css, 'desktop pointer css')

# Delegated click remains as a fallback for DOM replacements, but direct handlers stop
# immediate propagation first, so desktop gets exactly one launch. No Android behavior
# is removed.

PATH.write_text(s, encoding='utf-8')
print('patched', len(s))
