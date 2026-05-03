(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__DDD_LOCAL_PROBE_PLUGIN__) return;
    window.__DDD_LOCAL_PROBE_PLUGIN__ = true;

    var TAG = '[DDD-LOCAL-PROBE]';
    var PORT = 39677;
    var HOST = 'http://127.0.0.1:' + PORT;

    var lastSession = null;
    var lastOkStateTs = 0;
    var patched = false;

    function clog() {
        try {
            console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
        } catch (e) {}
    }

    function noty(msg) {
        clog(msg);
        try {
            if (window.Lampa && Lampa.Noty) Lampa.Noty.show(String(msg));
        } catch (e) {}
    }

    function isStreamUrl(url) {
        return typeof url === 'string' && url.indexOf('/stream/') !== -1;
    }

    function encodeParams(obj) {
        var out = [];

        Object.keys(obj).forEach(function (key) {
            if (obj[key] === undefined || obj[key] === null) return;
            out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(obj[key])));
        });

        return out.join('&');
    }

    function stripFragment(url) {
        var i = url.indexOf('#');
        return i >= 0 ? url.substring(0, i) : url;
    }

    function makeSessionId(params) {
        try {
            if (params && params.timeline && params.timeline.hash) {
                return String(params.timeline.hash);
            }

            if (params && params.card) {
                var card = params.card;
                var title = card.original_name || card.original_title || card.name || card.title || '';
                var season = params.season || 0;
                var episode = params.episode || 0;

                if (title) {
                    return 'ddd_' + Lampa.Utils.hash([season, episode, title].join(':'));
                }
            }
        } catch (e) {}

        return 'ddd_' + Date.now();
    }

    function appendLocalBridge(url, sid, token, index) {
        if (!isStreamUrl(url)) return url;

        var clean = stripFragment(url);

        var fragment = encodeParams({
            ddd_mode: 'local',
            ddd_client: 'lampa',
            ddd_sid: sid,
            ddd_port: PORT,
            ddd_token: token,
            ddd_i: index || 0
        });

        return clean + '#' + fragment;
    }

    function saveLastSession(session) {
        lastSession = session;

        try {
            Lampa.Storage.set('ddd_local_probe_last', session);
        } catch (e) {}

        clog('saved session', session);
    }

    function getLastSession() {
        if (lastSession) return lastSession;

        try {
            lastSession = Lampa.Storage.get('ddd_local_probe_last', null);
        } catch (e) {}

        return lastSession;
    }

    function formatMs(ms) {
        ms = Number(ms || 0);
        if (!ms || ms < 0) return '0:00';

        var sec = Math.floor(ms / 1000);
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;

        if (h > 0) {
            return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }

        return m + ':' + String(s).padStart(2, '0');
    }

    function fetchJson(url, timeoutMs) {
        timeoutMs = timeoutMs || 3000;

        var controller = typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;

        var timer = controller
            ? setTimeout(function () {
                controller.abort();
            }, timeoutMs)
            : null;

        return fetch(url, {
            method: 'GET',
            cache: 'no-store',
            mode: 'cors',
            signal: controller ? controller.signal : undefined
        }).then(function (res) {
            return res.text().then(function (txt) {
                if (!res.ok) {
                    throw new Error('HTTP ' + res.status + ': ' + txt);
                }

                try {
                    return JSON.parse(txt);
                } catch (e) {
                    return txt;
                }
            });
        }).finally(function () {
            if (timer) clearTimeout(timer);
        });
    }

    function probeLastState(showFail) {
        var session = getLastSession();

        if (!session || !session.sid || !session.token) {
            if (showFail) noty('DDD probe: нет session');
            return Promise.resolve(false);
        }

        var pingUrl = HOST + '/ping';
        var stateUrl = HOST + '/state?sid=' + encodeURIComponent(session.sid) + '&token=' + encodeURIComponent(session.token);

        clog('probe ping', pingUrl);
        clog('probe state', stateUrl);

        return fetchJson(pingUrl, 2500)
            .then(function (ping) {
                clog('ping ok', ping);
                return fetchJson(stateUrl, 2500);
            })
            .then(function (state) {
                clog('state ok', state);

                var p = state && state.payload ? state.payload : {};
                var pos = Number(p.position || 0);
                var dur = Number(p.duration || 0);
                var idx = typeof p.windowIndex !== 'undefined' ? p.windowIndex : '?';
                var type = state && state.type ? state.type : 'unknown';

                var now = Date.now();

                if (now - lastOkStateTs > 5000) {
                    lastOkStateTs = now;

                    noty(
                        'DDD state OK: ' +
                        type +
                        ', ' +
                        formatMs(pos) +
                        ' / ' +
                        formatMs(dur) +
                        ', index=' +
                        idx
                    );
                }

                return true;
            })
            .catch(function (e) {
                clog('probe failed', e);

                if (showFail) {
                    noty('DDD state FAIL: ' + (e.message || e));
                }

                return false;
            });
    }

    function patchPlayerPlay() {
        if (patched) return;
        if (!Lampa.Player || !Lampa.Player.play) {
            setTimeout(patchPlayerPlay, 500);
            return;
        }

        var originalPlay = Lampa.Player.play;

        Lampa.Player.play = function (params) {
            try {
                if (params && isStreamUrl(params.url)) {
                    var sid = makeSessionId(params);
                    var token = sid;

                    params.url = appendLocalBridge(params.url, sid, token, params.file_index || 0);

                    if (params.playlist && Array.isArray(params.playlist)) {
                        for (var i = 0; i < params.playlist.length; i++) {
                            if (params.playlist[i] && params.playlist[i].url) {
                                params.playlist[i].url = appendLocalBridge(params.playlist[i].url, sid, token, i);
                            }
                        }
                    }

                    saveLastSession({
                        sid: sid,
                        token: token,
                        port: PORT,
                        ts: Date.now(),
                        title: params.title || '',
                        playlistSize: params.playlist && Array.isArray(params.playlist)
                            ? params.playlist.length
                            : 1
                    });

                    noty('DDD bridge added: playlist=' + ((params.playlist && params.playlist.length) || 1));
                    clog('patched player params', params);
                }
            } catch (e) {
                clog('play patch error', e);
                noty('DDD patch error: ' + (e.message || e));
            }

            return originalPlay.call(this, params);
        };

        Lampa.Player.__ddd_local_probe_patched = true;
        patched = true;

        noty('DDD local probe: Player.play patched');
    }

    function installWakeChecks() {
        setInterval(function () {
            probeLastState(false);
        }, 4000);

        try {
            document.addEventListener('visibilitychange', function () {
                if (!document.hidden) {
                    setTimeout(function () {
                        probeLastState(true);
                    }, 800);
                }
            });
        } catch (e) {}

        try {
            window.addEventListener('focus', function () {
                setTimeout(function () {
                    probeLastState(true);
                }, 800);
            });
        } catch (e) {}

        try {
            Lampa.Listener.follow('app', function (e) {
                if (e && (e.type === 'ready' || e.type === 'resume')) {
                    setTimeout(function () {
                        probeLastState(true);
                    }, 1000);
                }
            });
        } catch (e) {}
    }

    function installManualApi() {
        window.DDDLocalProbe = {
            probe: function () {
                return probeLastState(true);
            },
            last: function () {
                return getLastSession();
            }
        };
    }

    function init() {
        patchPlayerPlay();
        installWakeChecks();
        installManualApi();

        noty('DDD local probe loaded');

        setTimeout(function () {
            probeLastState(false);
        }, 1500);
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
