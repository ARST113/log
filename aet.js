(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__DDD_LOCAL_PROBE_PLUGIN__) return;
    window.__DDD_LOCAL_PROBE_PLUGIN__ = true;

    var TAG = '[DDD-LOCAL-PROBE]';

    var PORT = 39677;
    var HOST = 'http://127.0.0.1:' + PORT;

    var STORAGE_KEY = 'ddd_local_probe_last';

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
            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show(String(msg));
            }
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
        if (!url || typeof url !== 'string') return '';

        var i = url.indexOf('#');
        return i >= 0 ? url.substring(0, i) : url;
    }

    function normalizeUrlForCompare(url) {
        if (!url || typeof url !== 'string') return '';

        return stripFragment(url)
            .replace(/\\u003d/g, '=')
            .replace(/\\u0026/g, '&')
            .replace(/\u003d/g, '=')
            .replace(/\u0026/g, '&');
    }

    function getFileNameFromUrl(url) {
        if (!url || typeof url !== 'string') return '';

        try {
            var clean = stripFragment(url);
            var m = clean.match(/\/stream\/([^?]+)/);

            if (m && m[1]) {
                return decodeURIComponent(m[1]);
            }
        } catch (e) {}

        return '';
    }

    function getShortFileName(url) {
        var file = getFileNameFromUrl(url);

        if (!file) return '';

        if (file.length > 42) {
            return file.slice(0, 39) + '...';
        }

        return file;
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

                if (title && Lampa.Utils && Lampa.Utils.hash) {
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

    function extractSeasonEpisodeFromText(text) {
        if (!text || typeof text !== 'string') {
            return {
                season: undefined,
                episode: undefined
            };
        }

        var m;

        m = text.match(/S(?:eason)?\s*0?(\d{1,2})\s*[\.\-_: ]*\s*E(?:p(?:isode)?)?\s*0?(\d{1,2})/i);
        if (m) {
            return {
                season: parseInt(m[1], 10),
                episode: parseInt(m[2], 10)
            };
        }

        m = text.match(/(\d{1,2})\s*[xх×]\s*0?(\d{1,2})/i);
        if (m) {
            return {
                season: parseInt(m[1], 10),
                episode: parseInt(m[2], 10)
            };
        }

        m = text.match(/(\d{1,2})\s*сезон.*?(\d{1,2})\s*сер/i);
        if (m) {
            return {
                season: parseInt(m[1], 10),
                episode: parseInt(m[2], 10)
            };
        }

        return {
            season: undefined,
            episode: undefined
        };
    }

    function createLightPlaylist(params) {
        var list = [];

        if (params && params.playlist && Array.isArray(params.playlist) && params.playlist.length) {
            for (var i = 0; i < params.playlist.length; i++) {
                var it = params.playlist[i] || {};
                var url = it.url ? stripFragment(it.url) : '';
                var file = getFileNameFromUrl(url);
                var parsed = extractSeasonEpisodeFromText([
                    it.title || '',
                    file || ''
                ].join(' '));

                list.push({
                    index: i,
                    url: url,
                    title: it.title || '',
                    season: typeof it.season !== 'undefined' ? it.season : parsed.season,
                    episode: typeof it.episode !== 'undefined' ? it.episode : parsed.episode,
                    timeline_hash: it.timeline && it.timeline.hash ? String(it.timeline.hash) : '',
                    file: file
                });
            }

            return list;
        }

        if (params && params.url) {
            var oneUrl = stripFragment(params.url);
            var oneFile = getFileNameFromUrl(oneUrl);
            var oneParsed = extractSeasonEpisodeFromText([
                params.title || '',
                oneFile || ''
            ].join(' '));

            list.push({
                index: 0,
                url: oneUrl,
                title: params.title || '',
                season: typeof params.season !== 'undefined' ? params.season : oneParsed.season,
                episode: typeof params.episode !== 'undefined' ? params.episode : oneParsed.episode,
                timeline_hash: params.timeline && params.timeline.hash ? String(params.timeline.hash) : '',
                file: oneFile
            });
        }

        return list;
    }

    function saveLastSession(session) {
        lastSession = session;

        try {
            Lampa.Storage.set(STORAGE_KEY, session);
        } catch (e) {}

        clog('saved session', session);
    }

    function getLastSession() {
        if (lastSession) return lastSession;

        try {
            lastSession = Lampa.Storage.get(STORAGE_KEY, null);
        } catch (e) {}

        return lastSession;
    }

    function fetchJson(url, timeoutMs) {
        timeoutMs = timeoutMs || 3000;

        var controller = typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;

        var timer = null;

        if (controller) {
            timer = setTimeout(function () {
                try {
                    controller.abort();
                } catch (e) {}
            }, timeoutMs);
        }

        return fetch(url, {
            method: 'GET',
            cache: 'no-store',
            mode: 'cors',
            signal: controller ? controller.signal : undefined
        }).then(function (res) {
            if (timer) clearTimeout(timer);

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
        }).catch(function (e) {
            if (timer) clearTimeout(timer);
            throw e;
        });
    }

    function normalizeEvents(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.value)) return data.value;
        if (data && Array.isArray(data.Value)) return data.Value;

        return [];
    }

    function findBestPlaybackEvent(state, eventsRaw) {
        var events = normalizeEvents(eventsRaw);
        var candidates = [];

        if (state) candidates.push(state);

        for (var i = events.length - 1; i >= 0; i--) {
            candidates.push(events[i]);
        }

        for (var j = 0; j < candidates.length; j++) {
            var ev = candidates[j];
            var p = ev && ev.payload ? ev.payload : null;

            if (!p) continue;

            if (
                typeof p.windowIndex !== 'undefined' &&
                typeof p.position !== 'undefined'
            ) {
                return ev;
            }
        }

        for (var k = 0; k < candidates.length; k++) {
            var ev2 = candidates[k];
            var p2 = ev2 && ev2.payload ? ev2.payload : null;

            if (!p2) continue;

            if (typeof p2.position !== 'undefined') {
                return ev2;
            }
        }

        return state || null;
    }

    function findPlaylistSize(eventsRaw, fallback) {
        var events = normalizeEvents(eventsRaw);

        for (var i = events.length - 1; i >= 0; i--) {
            var p = events[i] && events[i].payload ? events[i].payload : {};

            if (typeof p.playlistSize !== 'undefined') {
                return p.playlistSize;
            }
        }

        return fallback;
    }

    function findPlaylistItemForEvent(session, payload) {
        if (!session || !session.playlist || !session.playlist.length || !payload) {
            return null;
        }

        var eventUrl = normalizeUrlForCompare(payload.uri || '');
        var idx = typeof payload.windowIndex !== 'undefined'
            ? Number(payload.windowIndex)
            : -1;

        if (eventUrl) {
            for (var i = 0; i < session.playlist.length; i++) {
                var itemUrl = normalizeUrlForCompare(session.playlist[i].url || '');

                if (itemUrl && itemUrl === eventUrl) {
                    return session.playlist[i];
                }
            }
        }

        if (idx >= 0 && session.playlist[idx]) {
            return session.playlist[idx];
        }

        return null;
    }

    function buildStateMessage(type, payload, playlistSize, item) {
        var pos = Number(payload.position || 0);
        var dur = Number(payload.duration || 0);

        var idx = typeof payload.windowIndex !== 'undefined'
            ? payload.windowIndex
            : '?';

        var parts = [];

        parts.push('DDD OK: ' + type);
        parts.push(formatMs(pos) + ' / ' + formatMs(dur));
        parts.push('index=' + idx);
        parts.push('list=' + playlistSize);

        if (item) {
            if (typeof item.season !== 'undefined' && typeof item.episode !== 'undefined') {
                parts.push('S' + item.season + 'E' + item.episode);
            }

            if (item.title) {
                parts.push(item.title);
            } else if (item.file) {
                parts.push(item.file.length > 28 ? item.file.slice(0, 25) + '...' : item.file);
            }
        } else {
            var file = getShortFileName(payload.uri || '');
            if (file) parts.push(file);
        }

        return parts.join(', ');
    }

    function probeLastState(showFail) {
        var session = getLastSession();

        if (!session || !session.sid || !session.token) {
            if (showFail) noty('DDD probe: нет session');
            return Promise.resolve(false);
        }

        var pingUrl = HOST + '/ping';
        var stateUrl = HOST + '/state?sid=' + encodeURIComponent(session.sid) + '&token=' + encodeURIComponent(session.token);
        var eventsUrl = HOST + '/events?sid=' + encodeURIComponent(session.sid) + '&token=' + encodeURIComponent(session.token);

        clog('probe ping', pingUrl);
        clog('probe state', stateUrl);
        clog('probe events', eventsUrl);

        var stateResult = null;

        return fetchJson(pingUrl, 2500)
            .then(function (ping) {
                clog('ping ok', ping);
                return fetchJson(stateUrl, 2500);
            })
            .then(function (state) {
                stateResult = state;
                clog('state ok', state);
                return fetchJson(eventsUrl, 2500);
            })
            .then(function (eventsRaw) {
                clog('events ok', eventsRaw);

                var best = findBestPlaybackEvent(stateResult, eventsRaw);
                var p = best && best.payload ? best.payload : {};
                var type = best && best.type ? best.type : 'unknown';

                var playlistSize = findPlaylistSize(
                    eventsRaw,
                    session.playlistSize || (session.playlist ? session.playlist.length : '?')
                );

                var item = findPlaylistItemForEvent(session, p);

                clog('best event', best);
                clog('matched playlist item', item);

                var now = Date.now();

                if (now - lastOkStateTs > 5000) {
                    lastOkStateTs = now;
                    noty(buildStateMessage(type, p, playlistSize, item));
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

        if (Lampa.Player && Lampa.Player.__ddd_local_probe_patched) {
            patched = true;
            noty('DDD local probe: Player.play already patched');
            return;
        }

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

                    var lightPlaylist = createLightPlaylist(params);

                    saveLastSession({
                        sid: sid,
                        token: token,
                        port: PORT,
                        ts: Date.now(),
                        title: params.title || '',
                        playlistSize: lightPlaylist.length || 1,
                        playlist: lightPlaylist
                    });

                    noty('DDD bridge added: playlist=' + (lightPlaylist.length || 1));
                    clog('patched player params', params);
                    clog('light playlist', lightPlaylist);
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
            },
            clear: function () {
                lastSession = null;

                try {
                    Lampa.Storage.set(STORAGE_KEY, null);
                } catch (e) {}

                noty('DDD probe storage cleared');
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
