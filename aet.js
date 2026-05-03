(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__DDD_LOCAL_TEST_PLUGIN__) return;
    window.__DDD_LOCAL_TEST_PLUGIN__ = true;

    const TAG = '[DDD-LOCAL-TEST]';

    const DEFAULT_HOST = 'http://127.0.0.1:39677';
    const DEFAULT_SID = 'test123';
    const DEFAULT_TOKEN = 'test123';

    let inited = false;

    function consoleLog() {
        try {
            console.log.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
        } catch (e) {}
    }

    function noty(msg) {
        consoleLog(msg);

        try {
            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show(String(msg));
            }
        } catch (e) {}
    }

    function fetchWithTimeout(url, timeoutMs) {
        timeoutMs = timeoutMs || 3000;

        const controller = typeof AbortController !== 'undefined'
            ? new AbortController()
            : null;

        const timer = controller
            ? setTimeout(function () {
                controller.abort();
            }, timeoutMs)
            : null;

        return fetch(url, {
            method: 'GET',
            cache: 'no-store',
            mode: 'cors',
            signal: controller ? controller.signal : undefined
        }).finally(function () {
            if (timer) clearTimeout(timer);
        });
    }

    function formatMs(ms) {
        ms = Number(ms || 0);

        if (!ms || ms < 0) return '0:00';

        const sec = Math.floor(ms / 1000);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;

        if (h > 0) {
            return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }

        return m + ':' + String(s).padStart(2, '0');
    }

    function normalizeEvents(data) {
        if (Array.isArray(data)) return data;

        if (data && Array.isArray(data.value)) return data.value;
        if (data && Array.isArray(data.Value)) return data.Value;

        return [];
    }

    function buildUrl(path, params) {
        const query = new URLSearchParams(params || {}).toString();
        return DEFAULT_HOST + path + (query ? '?' + query : '');
    }

    async function testPing() {
        const url = buildUrl('/ping');

        consoleLog('PING request:', url);

        const res = await fetchWithTimeout(url, 3000);
        const text = await res.text();

        consoleLog('PING status:', res.status);
        consoleLog('PING body:', text);

        if (!res.ok) {
            throw new Error('Ping HTTP ' + res.status + ': ' + text);
        }

        return text;
    }

    async function testState(sid, token) {
        const url = buildUrl('/state', {
            sid: sid,
            token: token
        });

        consoleLog('STATE request:', url);

        const res = await fetchWithTimeout(url, 3000);
        const text = await res.text();

        consoleLog('STATE status:', res.status);
        consoleLog('STATE raw:', text);

        if (!res.ok) {
            throw new Error('State HTTP ' + res.status + ': ' + text);
        }

        return JSON.parse(text);
    }

    async function testEvents(sid, token) {
        const url = buildUrl('/events', {
            sid: sid,
            token: token
        });

        consoleLog('EVENTS request:', url);

        const res = await fetchWithTimeout(url, 3000);
        const text = await res.text();

        consoleLog('EVENTS status:', res.status);
        consoleLog('EVENTS raw:', text);

        if (!res.ok) {
            throw new Error('Events HTTP ' + res.status + ': ' + text);
        }

        return JSON.parse(text);
    }

    async function runFullTest(sid, token) {
        sid = sid || DEFAULT_SID;
        token = token || sid || DEFAULT_TOKEN;

        noty('DDD test: start');

        try {
            await testPing();
            noty('DDD ping OK');
        } catch (e) {
            consoleLog('PING failed:', e);
            noty('DDD ping FAIL: ' + (e.message || e));
            return false;
        }

        let state = null;

        try {
            state = await testState(sid, token);

            const payload = state && state.payload ? state.payload : {};
            const position = Number(payload.position || 0);
            const duration = Number(payload.duration || 0);
            const windowIndex = typeof payload.windowIndex !== 'undefined'
                ? payload.windowIndex
                : '?';

            noty(
                'DDD state OK: ' +
                formatMs(position) +
                ' / ' +
                formatMs(duration) +
                ', index=' +
                windowIndex
            );

            consoleLog('STATE parsed:', state);
        } catch (e) {
            consoleLog('STATE failed:', e);
            noty('DDD state FAIL: ' + (e.message || e));
            return false;
        }

        try {
            const eventsRaw = await testEvents(sid, token);
            const events = normalizeEvents(eventsRaw);

            const last = events.length ? events[events.length - 1] : null;
            const lastType = last && last.type ? last.type : 'none';

            noty('DDD events OK: ' + events.length + ', last=' + lastType);

            consoleLog('EVENTS parsed:', events);
        } catch (e) {
            consoleLog('EVENTS failed:', e);
            noty('DDD events FAIL: ' + (e.message || e));
        }

        return true;
    }

    function installManualApi() {
        window.DDDLocalTest = {
            run: runFullTest,
            ping: testPing,
            state: function (sid, token) {
                return testState(sid || DEFAULT_SID, token || sid || DEFAULT_TOKEN);
            },
            events: function (sid, token) {
                return testEvents(sid || DEFAULT_SID, token || sid || DEFAULT_TOKEN);
            }
        };

        consoleLog('Manual API installed: window.DDDLocalTest.run("test123","test123")');
    }

    function init() {
        if (inited) return;
        inited = true;

        installManualApi();

        noty('DDD local test plugin loaded');

        setTimeout(function () {
            runFullTest(DEFAULT_SID, DEFAULT_TOKEN);
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
