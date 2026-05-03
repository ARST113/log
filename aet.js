(function () {
    'use strict';

    if (!window.Lampa) return;

    if (window.__DDD_LOCAL_BRIDGE_TEST_PLUGIN_V2__) {
        try {
            console.log('[DDD-LOCAL-BRIDGE-V2]', 'already loaded');
            if (window.Lampa && Lampa.Noty) Lampa.Noty.show('DDD bridge v2 already loaded');
        } catch (e) {}
        return;
    }

    window.__DDD_LOCAL_BRIDGE_TEST_PLUGIN_V2__ = true;

    var TAG = '[DDD-LOCAL-BRIDGE-V2]';

    var PORT = 39677;
    var HOST = 'http://127.0.0.1:' + PORT;

    var STORAGE_KEY = 'ddd_local_bridge_last_v2';

    var patched = false;
    var lastSession = null;
    var lastNotyTs = 0;
    var lastNotyFingerprint = '';

    var LIVE_EVENT_MAX_AGE_MS = 30000;
    var NOTY_INTERVAL_MS = 4500;

    function clog() {
        try {
            console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
        } catch (e) {}
    }

    function noty(msg, force) {
        try {
            msg = String(msg);
            clog(msg);

            var now = Date.now();
            var fp = msg;

            if (!force) {
                if (fp === lastNotyFingerprint && now - lastNotyTs < NOTY_INTERVAL_MS) return;
                if (now - lastNotyTs < NOTY_INTERVAL_MS) return;
            }

            lastNotyTs = now;
            lastNotyFingerprint = fp;

            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show(msg);
            }
        } catch (e) {}
    }

    function safeString(v, def) {
        if (v === undefined || v === null) return def || '';
        return String(v);
    }

    function isStreamUrl(url) {
        return typeof url === 'string' && url.indexOf('/stream/') !== -1;
    }

    function stripFragment(url) {
        if (!url || typeof url !== 'string') return '';
        var i = url.indexOf('#');
        return i >= 0 ? url.substring(0, i) : url;
    }

    function getFragment(url) {
        if (!url || typeof url !== 'string') return '';
        var i = url.indexOf('#');
        return i >= 0 ? url.substring(i + 1) : '';
    }

    function encodeParams(obj) {
        var out = [];

        Object.keys(obj).forEach(function (key) {
            var val = obj[key];

            if (val === undefined || val === null || val === '') return;

            out.push(
                encodeURIComponent(key) + '=' + encodeURIComponent(String(val))
            );
        });

        return out.join('&');
    }

    function decodeParamValue(v) {
        try {
            return decodeURIComponent(String(v || '').replace(/\+/g, ' '));
        } catch (e) {
            return String(v || '');
        }
    }

    function getQueryParam(url, name) {
        if (!url || typeof url !== 'string') return null;

        var clean = stripFragment(url);
        var qIndex = clean.indexOf('?');

        if (qIndex < 0) return null;

        var query = clean.substring(qIndex + 1);
        var parts = query.split('&');

        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            var eq = p.indexOf('=');

            var k = eq >= 0 ? p.substring(0, eq) : p;
            var v = eq >= 0 ? p.substring(eq + 1) : '';

            if (decodeParamValue(k) === name) {
                return decodeParamValue(v);
            }
        }

        return null;
    }

    function getStreamFileName(url) {
        if (!url || typeof url !== 'string') return '';

        var clean = stripFragment(url);
        var m = clean.match(/\/stream\/([^?]+)/);

        if (!m) return '';

        return decodeParamValue(m[1]);
    }

    function getUrlFileIndex(url) {
        var v = getQueryParam(url, 'index');

        if (v === null || v === '') return null;

        var n = parseInt(v, 10);

        return isNaN(n) ? null : n;
    }

    function getUrlTorrentLink(url) {
        var v = getQueryParam(url, 'link');

        if (v === null || v === '') return '';

        return String(v);
    }

    function normalizeComparableUrl(url) {
        return stripFragment(url || '')
            .replace(/&amp;/g, '&')
            .replace(/\u0026/g, '&')
            .replace(/\u003d/g, '=');
    }

    function sameStreamUrl(a, b) {
        if (!a || !b) return false;

        var aa = normalizeComparableUrl(a);
        var bb = normalizeComparableUrl(b);

        if (aa === bb) return true;

        var ai = getUrlFileIndex(aa);
        var bi = getUrlFileIndex(bb);

        var al = getUrlTorrentLink(aa);
        var bl = getUrlTorrentLink(bb);

        if (
            ai !== null &&
            bi !== null &&
            ai === bi &&
            al &&
            bl &&
            al === bl
        ) {
            return true;
        }

        var af = getStreamFileName(aa);
        var bf = getStreamFileName(bb);

        if (
            af &&
            bf &&
            af === bf &&
            al &&
            bl &&
            al === bl
        ) {
            return true;
        }

        return false;
    }

    function getCardTitle(card) {
        if (!card) return '';

        return safeString(
            card.original_name ||
            card.original_title ||
            card.name ||
            card.title ||
            ''
        );
    }

    function getDisplayTitleFromParams(params) {
        if (!params) return '';

        if (params.title) return safeString(params.title);
        if (params.episode_title) return safeString(params.episode_title);

        if (params.card) {
            return safeString(params.card.name || params.card.title || getCardTitle(params.card));
        }

        return '';
    }

    function guessSeasonEpisodeFromText(text) {
        text = safeString(text);

        if (!text) return { season: 0, episode: 0 };

        var m;

        m = text.match(/S(?:eason)?\s*0?(\d{1,2})\s*[\.\-_: ]*\s*E(?:p(?:isode)?)?\s*0?(\d{1,3})/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0
            };
        }

        m = text.match(/(\d{1,2})\s*[xх×]\s*0?(\d{1,3})/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0
            };
        }

        m = text.match(/(\d{1,2})\s*сезон.*?(\d{1,3})\s*(?:сер|эп|вып)/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0
            };
        }

        return { season: 0, episode: 0 };
    }

    function getSeasonEpisodeFromItem(item, fallbackSeason, fallbackEpisode, itemIndex) {
        item = item || {};

        var season = 0;
        var episode = 0;

        if (item.season !== undefined && item.season !== null) {
            season = parseInt(item.season, 10) || 0;
        }

        if (item.episode !== undefined && item.episode !== null) {
            episode = parseInt(item.episode, 10) || 0;
        }

        if (!season || !episode) {
            var guessed = guessSeasonEpisodeFromText(
                [
                    item.title,
                    item.name,
                    item.file_name,
                    item.filename,
                    item.path,
                    item.url
                ].join(' ')
            );

            if (!season && guessed.season) season = guessed.season;
            if (!episode && guessed.episode) episode = guessed.episode;
        }

        if (!season && fallbackSeason) season = parseInt(fallbackSeason, 10) || 0;

        if (!episode) {
            if (fallbackEpisode) episode = parseInt(fallbackEpisode, 10) || 0;
            else if (typeof itemIndex !== 'undefined') episode = Number(itemIndex) + 1;
        }

        return {
            season: season || 0,
            episode: episode || 0
        };
    }

    function makeSessionId(params) {
        try {
            if (params && params.timeline && params.timeline.hash) {
                return 'ddd_' + String(params.timeline.hash);
            }

            var title = '';

            if (params && params.card) {
                title = getCardTitle(params.card);
            }

            if (!title && params && params.url) {
                title = getStreamFileName(params.url);
            }

            var season = params && params.season ? params.season : 0;
            var episode = params && params.episode ? params.episode : 0;
            var index = params && params.url ? getUrlFileIndex(params.url) : 0;
            var link = params && params.url ? getUrlTorrentLink(params.url) : '';

            var raw = [
                title || 'unknown',
                season || 0,
                episode || 0,
                index || 0,
                link || ''
            ].join(':');

            if (window.Lampa && Lampa.Utils && Lampa.Utils.hash) {
                return 'ddd_' + Lampa.Utils.hash(raw);
            }
        } catch (e) {
            clog('makeSessionId error', e);
        }

        return 'ddd_' + Date.now();
    }

    function detectPlaylistIndex(params) {
        if (!params) return 0;

        var playlist = Array.isArray(params.playlist) ? params.playlist : null;
        var currentUrl = params.url || '';

        if (playlist && playlist.length && currentUrl) {
            for (var i = 0; i < playlist.length; i++) {
                if (playlist[i] && sameStreamUrl(currentUrl, playlist[i].url)) {
                    return i;
                }
            }
        }

        var candidates = [
            params.playlist_index,
            params.playlistIndex,
            params.start_index,
            params.startIndex,
            params.index,
            params.id
        ];

        for (var c = 0; c < candidates.length; c++) {
            if (candidates[c] !== undefined && candidates[c] !== null && candidates[c] !== '') {
                var n = parseInt(candidates[c], 10);
                if (!isNaN(n) && n >= 0) return n;
            }
        }

        if (playlist && playlist.length && currentUrl) {
            var currentFileIndex = getUrlFileIndex(currentUrl);

            if (currentFileIndex !== null) {
                for (var j = 0; j < playlist.length; j++) {
                    var itemIndex = getUrlFileIndex(playlist[j] && playlist[j].url);

                    if (itemIndex !== null && itemIndex === currentFileIndex) {
                        return j;
                    }
                }
            }
        }

        return 0;
    }

    function appendLocalBridge(url, sid, token, itemIndex, startIndex, meta) {
        if (!isStreamUrl(url)) return url;

        var clean = stripFragment(url);

        meta = meta || {};

        var fragment = encodeParams({
            ddd_mode: 'local',
            ddd_client: 'lampa',
            ddd_sid: sid,
            ddd_port: PORT,
            ddd_token: token,

            ddd_i: itemIndex || 0,
            ddd_start: startIndex || 0,

            ddd_title: meta.title || '',
            ddd_season: meta.season || '',
            ddd_episode: meta.episode || '',
            ddd_playlist_size: meta.playlistSize || ''
        });

        return clean + '#' + fragment;
    }

    function makePlaylistSnapshot(params, startIndex) {
        var out = [];
        var playlist = params && Array.isArray(params.playlist) ? params.playlist : null;

        var fallbackSeason = params && params.season ? params.season : 0;
        var fallbackEpisode = params && params.episode ? params.episode : 0;

        if (playlist && playlist.length) {
            for (var i = 0; i < playlist.length; i++) {
                var item = playlist[i] || {};
                var se = getSeasonEpisodeFromItem(item, fallbackSeason, 0, i);

                var title =
                    item.title ||
                    item.name ||
                    item.episode_title ||
                    getStreamFileName(item.url) ||
                    ('item ' + (i + 1));

                out.push({
                    index: i,
                    title: safeString(title),
                    season: se.season,
                    episode: se.episode,
                    url: stripFragment(item.url || '')
                });
            }
        } else if (params && params.url) {
            var seSingle = getSeasonEpisodeFromItem(params, fallbackSeason, fallbackEpisode, startIndex);

            out.push({
                index: startIndex || 0,
                title: getDisplayTitleFromParams(params) || getStreamFileName(params.url),
                season: seSingle.season,
                episode: seSingle.episode,
                url: stripFragment(params.url)
            });
        }

        return out;
    }

    function patchPlaylistUrls(params, sid, token, startIndex) {
        if (!params) return params;

        var playlist = Array.isArray(params.playlist) ? params.playlist : null;
        var playlistSize = playlist && playlist.length ? playlist.length : 1;

        if (params.url && isStreamUrl(params.url)) {
            var currentSE = getSeasonEpisodeFromItem(
                params,
                params.season || 0,
                params.episode || 0,
                startIndex
            );

            params.url = appendLocalBridge(
                params.url,
                sid,
                token,
                startIndex,
                startIndex,
                {
                    title: getDisplayTitleFromParams(params),
                    season: currentSE.season,
                    episode: currentSE.episode,
                    playlistSize: playlistSize
                }
            );
        }

        if (playlist && playlist.length) {
            var newPlaylist = [];

            for (var i = 0; i < playlist.length; i++) {
                var oldItem = playlist[i] || {};
                var newItem = {};

                for (var k in oldItem) {
                    if (Object.prototype.hasOwnProperty.call(oldItem, k)) {
                        newItem[k] = oldItem[k];
                    }
                }

                if (newItem.url && isStreamUrl(newItem.url)) {
                    var se = getSeasonEpisodeFromItem(newItem, params.season || 0, 0, i);

                    newItem.url = appendLocalBridge(
                        newItem.url,
                        sid,
                        token,
                        i,
                        startIndex,
                        {
                            title: newItem.title || newItem.name || getStreamFileName(newItem.url),
                            season: se.season,
                            episode: se.episode,
                            playlistSize: playlist.length
                        }
                    );
                }

                newPlaylist.push(newItem);
            }

            params.playlist = newPlaylist;
        }

        return params;
    }

    function saveLastSession(session) {
        lastSession = session;

        try {
            Lampa.Storage.set(STORAGE_KEY, session);
        } catch (e) {
            clog('saveLastSession failed', e);
        }

        clog('saved session', session);
    }

    function getLastSession() {
        if (lastSession) return lastSession;

        try {
            lastSession = Lampa.Storage.get(STORAGE_KEY, null);
        } catch (e) {
            lastSession = null;
        }

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

        if (typeof fetch === 'function') {
            var controller = typeof AbortController !== 'undefined'
                ? new AbortController()
                : null;

            var timer = controller
                ? setTimeout(function () {
                    try {
                        controller.abort();
                    } catch (e) {}
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
            }).then(function (data) {
                if (timer) clearTimeout(timer);
                return data;
            }).catch(function (e) {
                if (timer) clearTimeout(timer);
                throw e;
            });
        }

        return new Promise(function (resolve, reject) {
            try {
                var xhr = new XMLHttpRequest();
                var done = false;

                var timer2 = setTimeout(function () {
                    if (done) return;
                    done = true;

                    try {
                        xhr.abort();
                    } catch (e) {}

                    reject(new Error('timeout'));
                }, timeoutMs);

                xhr.open('GET', url, true);
                xhr.setRequestHeader('Cache-Control', 'no-store');

                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4 || done) return;

                    done = true;
                    clearTimeout(timer2);

                    if (xhr.status < 200 || xhr.status >= 300) {
                        reject(new Error('HTTP ' + xhr.status + ': ' + xhr.responseText));
                        return;
                    }

                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch (e) {
                        resolve(xhr.responseText);
                    }
                };

                xhr.onerror = function () {
                    if (done) return;

                    done = true;
                    clearTimeout(timer2);
                    reject(new Error('XHR error'));
                };

                xhr.send();
            } catch (e) {
                reject(e);
            }
        });
    }

    function normalizeEvents(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.value)) return data.value;
        if (data && Array.isArray(data.Value)) return data.Value;
        if (data && Array.isArray(data.events)) return data.events;
        return [];
    }

    function getEventTs(ev) {
        if (!ev) return 0;

        var p = ev.payload || {};

        return Number(ev.ts || p.ts || 0) || 0;
    }

    function isLiveEvent(ev) {
        if (!ev) return false;

        if (ev.type === 'SessionFinished') return false;

        return (
            ev.type === 'PositionTick' ||
            ev.type === 'PlaybackStateChanged' ||
            ev.type === 'PlaylistItemChanged' ||
            ev.type === 'SessionStarted'
        );
    }

    function eventHasPlaybackPayload(ev) {
        var p = ev && ev.payload ? ev.payload : null;

        if (!p) return false;

        return (
            typeof p.position !== 'undefined' ||
            typeof p.windowIndex !== 'undefined' ||
            typeof p.duration !== 'undefined' ||
            typeof p.uri !== 'undefined'
        );
    }

    function findBestPlaybackEvent(state, eventsRaw) {
        var now = Date.now();
        var events = normalizeEvents(eventsRaw);

        var candidates = [];

        if (state && state.type !== 'SessionFinished' && eventHasPlaybackPayload(state)) {
            var stTs = getEventTs(state);

            if (!stTs || Math.abs(now - stTs) <= LIVE_EVENT_MAX_AGE_MS) {
                candidates.push(state);
            }
        }

        for (var i = events.length - 1; i >= 0; i--) {
            var ev = events[i];

            if (!isLiveEvent(ev)) continue;
            if (!eventHasPlaybackPayload(ev)) continue;

            var ts = getEventTs(ev);

            if (ts && Math.abs(now - ts) > LIVE_EVENT_MAX_AGE_MS) {
                continue;
            }

            candidates.push(ev);
        }

        for (var j = 0; j < candidates.length; j++) {
            var p = candidates[j].payload || {};

            if (
                typeof p.windowIndex !== 'undefined' &&
                typeof p.position !== 'undefined'
            ) {
                return candidates[j];
            }
        }

        for (var k = 0; k < candidates.length; k++) {
            var p2 = candidates[k].payload || {};

            if (typeof p2.position !== 'undefined') {
                return candidates[k];
            }
        }

        for (var f = events.length - 1; f >= 0; f--) {
            if (events[f] && events[f].type === 'SessionFinished' && eventHasPlaybackPayload(events[f])) {
                return events[f];
            }
        }

        return state || null;
    }

    function findPlaylistSize(state, eventsRaw, session) {
        var events = normalizeEvents(eventsRaw);

        if (state && state.payload && typeof state.payload.playlistSize !== 'undefined') {
            return state.payload.playlistSize;
        }

        for (var i = events.length - 1; i >= 0; i--) {
            var p = events[i] && events[i].payload ? events[i].payload : {};

            if (typeof p.playlistSize !== 'undefined') {
                return p.playlistSize;
            }
        }

        if (session && typeof session.playlistSize !== 'undefined') {
            return session.playlistSize;
        }

        return '?';
    }

    function getItemFromSession(session, index) {
        if (!session || !Array.isArray(session.items)) return null;

        index = parseInt(index, 10);

        if (isNaN(index)) return null;

        if (index >= 0 && index < session.items.length) {
            return session.items[index];
        }

        return null;
    }

    function describePlayback(best, state, eventsRaw, session) {
        var p = best && best.payload ? best.payload : {};

        var pos = Number(p.position || 0);
        var dur = Number(p.duration || 0);

        var idx = typeof p.windowIndex !== 'undefined'
            ? p.windowIndex
            : (
                session && typeof session.startIndex !== 'undefined'
                    ? session.startIndex
                    : '?'
            );

        var item = getItemFromSession(session, idx);

        var title =
            (item && item.title) ||
            (p.currentItem && (p.currentItem.title || p.currentItem.filename)) ||
            p.title ||
            (session && session.title) ||
            '';

        var season =
            (item && item.season) ||
            p.season ||
            (session && session.season) ||
            0;

        var episode =
            (item && item.episode) ||
            p.episode ||
            (session && session.episode) ||
            0;

        var playlistSize = findPlaylistSize(state, eventsRaw, session);
        var type = best && best.type ? best.type : 'unknown';

        var se = '';

        if (season || episode) {
            se = ', S' + (season || '?') + 'E' + (episode || '?');
        }

        var titlePart = title ? ', ' + title : '';

        return (
            'DDD OK: ' +
            type +
            ', ' +
            formatMs(pos) +
            ' / ' +
            formatMs(dur) +
            ', index=' +
            idx +
            ', list=' +
            playlistSize +
            se +
            titlePart
        );
    }

    function probeLastState(showFail) {
        var session = getLastSession();

        if (!session || !session.sid || !session.token) {
            if (showFail) noty('DDD probe: нет session', true);
            return Promise.resolve(false);
        }

        var pingUrl = HOST + '/ping';
        var stateUrl =
            HOST +
            '/state?sid=' +
            encodeURIComponent(session.sid) +
            '&token=' +
            encodeURIComponent(session.token);

        var eventsUrl =
            HOST +
            '/events?sid=' +
            encodeURIComponent(session.sid) +
            '&token=' +
            encodeURIComponent(session.token);

        var stateResult = null;

        clog('probe ping', pingUrl);
        clog('probe state', stateUrl);
        clog('probe events', eventsUrl);

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
                var msg = describePlayback(best, stateResult, eventsRaw, session);

                noty(msg, showFail);

                return true;
            })
            .catch(function (e) {
                clog('probe failed', e);

                if (showFail) {
                    noty('DDD state FAIL: ' + (e && e.message ? e.message : e), true);
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

        if (Lampa.Player.__ddd_local_bridge_v2_patched) {
            patched = true;
            noty('DDD bridge v2: Player.play уже patched', true);
            return;
        }

        var originalPlay = Lampa.Player.play;

        Lampa.Player.play = function (params) {
            try {
                if (params && isStreamUrl(params.url)) {
                    var startIndex = detectPlaylistIndex(params);
                    var sid = makeSessionId(params);
                    var token = sid;

                    var playlistSize =
                        params.playlist && Array.isArray(params.playlist)
                            ? params.playlist.length
                            : 1;

                    var items = makePlaylistSnapshot(params, startIndex);
                    var selectedItem = items[startIndex] || items[0] || null;

                    patchPlaylistUrls(params, sid, token, startIndex);

                    saveLastSession({
                        sid: sid,
                        token: token,
                        port: PORT,
                        ts: Date.now(),

                        title: selectedItem
                            ? selectedItem.title
                            : getDisplayTitleFromParams(params),

                        season: selectedItem
                            ? selectedItem.season
                            : (params.season || 0),

                        episode: selectedItem
                            ? selectedItem.episode
                            : (params.episode || 0),

                        startIndex: startIndex,
                        playlistSize: playlistSize,
                        items: items
                    });

                    params.__ddd_local_bridge = {
                        enabled: true,
                        mode: 'local',
                        sid: sid,
                        token: token,
                        port: PORT,
                        startIndex: startIndex,
                        playlistSize: playlistSize
                    };

                    noty(
                        'DDD bridge added: start=' +
                        startIndex +
                        ', playlist=' +
                        playlistSize +
                        (
                            selectedItem
                                ? ', S' + selectedItem.season + 'E' + selectedItem.episode + ', ' + selectedItem.title
                                : ''
                        ),
                        true
                    );

                    clog('patched player params', params);
                }
            } catch (e) {
                clog('Player.play patch error', e);
                noty('DDD patch error: ' + (e && e.message ? e.message : e), true);
            }

            return originalPlay.call(this, params);
        };

        Lampa.Player.__ddd_local_bridge_v2_patched = true;
        patched = true;

        noty('DDD bridge v2 loaded: Player.play patched', true);
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
                    }, 700);
                }
            });
        } catch (e) {}

        try {
            window.addEventListener('focus', function () {
                setTimeout(function () {
                    probeLastState(true);
                }, 700);
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
        window.DDDLocalBridgeV2 = {
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

                noty('DDD bridge session cleared', true);
            },

            host: function () {
                return HOST;
            }
        };
    }

    function init() {
        patchPlayerPlay();
        installWakeChecks();
        installManualApi();

        noty('DDD local bridge v2 plugin loaded', true);

        setTimeout(function () {
            probeLastState(false);
        }, 1500);
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e && e.type === 'ready') init();
        });
    }
})();
