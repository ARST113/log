'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pluginFile = path.join(__dirname, '..', 'ContinueWatching.js');
const source = fs.readFileSync(pluginFile, 'utf8');

function jqueryStub() {
    function Stub() {
        this.length = 0;
        this.attrs = {};
    }
    ['on', 'off', 'remove', 'before', 'prepend', 'append', 'text'].forEach((name) => {
        Stub.prototype[name] = function () { return this; };
    });
    ['find', 'first', 'last', 'filter', 'closest'].forEach((name) => {
        Stub.prototype[name] = function () { return new Stub(); };
    });
    Stub.prototype.is = function () { return false; };
    Stub.prototype.html = function () { return ''; };
    Stub.prototype.attr = function (name, value) {
        if (arguments.length === 1) return this.attrs[name];
        this.attrs[name] = String(value);
        return this;
    };
    return function $() { return new Stub(); };
}

function harness() {
    let clock = 2_000_000;
    let nextTimerId = 1;
    let active = null;
    let requestHandler = null;
    const storage = {};
    const local = {};
    const roads = {};
    const listeners = {};
    const timelineListeners = [];
    const timers = new Map();
    const androidLaunches = [];

    const Android = {
        openPlayer(link, data) {
            const serialized = JSON.stringify(data);
            androidLaunches.push({ link, data, serialized, parsed: JSON.parse(serialized) });
            return serialized;
        }
    };

    const document = {
        head: { appendChild() {} },
        visibilityState: 'visible',
        getElementById() { return null; },
        createElement() { return {}; },
        addEventListener() {}
    };

    const Lampa = {
        Account: { Permit: { account: { profile: { id: 7 } } } },
        Activity: { active: () => active ? { movie: active } : null },
        Controller: { enabled() { return null; }, collectionAppend() {} },
        Listener: { follow(name, callback) { (listeners[name] ||= []).push(callback); } },
        Noty: { show() {} },
        Platform: { is() { return false; } },
        Android,
        Player: { play(data) { return Android.openPlayer(data.url, data); }, playlist() {} },
        Storage: {
            listener: { follow() {} },
            field() { return ''; },
            get(key, fallback) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback; },
            set(key, value) { storage[key] = value; },
            sync() {}
        },
        Timeline: {
            listener: { follow(name, callback) { if (name === 'update') timelineListeners.push(callback); } },
            view(hash) { return roads[hash] || null; }
        },
        Utils: {
            hash(value) {
                value = String(value);
                let result = 0;
                for (let i = 0; i < value.length; i++) result = ((result << 5) - result + value.charCodeAt(i)) | 0;
                return String(result >>> 0);
            }
        },
        Reguest: function Reguest() {
            let timeout = 0;
            this.timeout = function (value) { timeout = Number(value || 0); };
            this.native = function (url, ok, fail, post, params) {
                if (requestHandler) return requestHandler({ url, ok, fail, post, params, timeout });
                if (fail) fail();
            };
        }
    };

    const context = {
        console,
        JSON,
        Math,
        URL,
        URLSearchParams,
        Date: class FakeDate extends Date { static now() { return clock; } },
        window: null,
        document,
        navigator: { maxTouchPoints: 0, userAgent: '' },
        rch_nws: { 'lampac.fun': { connectionId: 'live-rch-session' } },
        location: { href: 'https://lampac.fun/', protocol: 'https:' },
        localStorage: {
            getItem(key) { return Object.prototype.hasOwnProperty.call(local, key) ? local[key] : null; },
            setItem(key, value) { local[key] = String(value); },
            removeItem(key) { delete local[key]; }
        },
        setTimeout(callback, delay) {
            const id = nextTimerId++;
            timers.set(id, { callback, delay: Number(delay || 0) });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        setInterval() { return 1; },
        clearInterval() {},
        Lampa,
        $: jqueryStub()
    };
    context.window = context;
    context.window.appready = true;
    context.window.__CONTINUE_WATCH_TEST_MODE__ = true;

    vm.runInNewContext(source, context, { filename: pluginFile });

    return {
        api: context.window.ContinueWatchV6,
        Lampa,
        storage,
        local,
        roads,
        listeners,
        timelineListeners,
        androidLaunches,
        rch_nws: context.rch_nws,
        setRequestHandler(handler) { requestHandler = handler; },
        setRchHook(handler) {
            if (handler) context.window.Online2RchHandshake = handler;
            else delete context.window.Online2RchHandshake;
        },
        setActive(movie) { active = movie; },
        setClock(value) { clock = value; },
        fireTimeouts(delay) {
            const selected = Array.from(timers.entries()).filter((entry) => entry[1].delay === delay);
            selected.forEach(([id, timer]) => {
                if (!timers.delete(id)) return;
                timer.callback();
            });
        }
    };
}

const h = harness();
const t = h.api.testing;

assert.equal(h.api.version, 'v6.1.6-online-rch-retry-20260902');

{
    const result = t.normalizeRoad(
        { time: 21.918, duration: 2885, percent: 100 },
        { created_at: 1_978_000, initial_time: 0, external: true }
    );
    assert.equal(result.completion_guard, 'percent_time_mismatch');
    assert.equal(result.percent, 1);
}

{
    const result = t.normalizeRoad(
        { time: 2885, duration: 2885, percent: 100 },
        { created_at: 1_978_000, initial_time: 0, external: true, last_road: { time: 0 } }
    );
    assert.equal(result.completion_guard, 'impossible_position_jump');
    assert(result.time <= 22.001);
}

{
    const result = t.normalizeRoad(
        { time: 2885, duration: 2885, percent: 100 },
        { created_at: -1_000_000, initial_time: 0, external: true }
    );
    assert.equal(result.completion_guard, undefined);
    assert.equal(result.percent, 100);
}

{
    const result = t.normalizeRoad(
        { time: 950, duration: 1000, percent: 95 },
        { created_at: 1_999_000, initial_time: 0, external: true }
    );
    assert.equal(result.completion_guard, undefined, 'seeking below 100% remains valid');
}

{
    const result = t.normalizeRoad(
        { time: 1000, duration: 1000, percent: 100 },
        { created_at: 1_990_000, initial_time: 800, external: true }
    );
    assert.equal(result.completion_guard, undefined, 'a credits/segment skip from a late position remains valid');
}

{
    const road = { time: 21.918, duration: 2885, percent: 100 };
    assert.equal(t.guardRoadInPlace(road, { created_at: 1_978_000, initial_time: 0, external: true }), 'percent_time_mismatch');
    assert.equal(road.percent, 1);
}

{
    const result = t.mergeRecordRoad(
        { time: 21.918, duration: 2885, percent: 1, completion_guard: 'percent_time_mismatch' },
        { time: 2885, duration: 2885, percent: 100 }
    );
    assert.equal(result.time, 21.918);
    assert.equal(result.percent, 1);
}

{
    const selection = t.resolverSelection('https://lampac.fun/lite/zetflix/video?id=1&t=Fox+Life', {});
    assert.deepEqual(JSON.parse(JSON.stringify(selection)), { provider: 'zetflix', translation: 'fox life' });
    assert.equal(t.selectionMatches(selection, { provider: 'zetflix', translation: 'tvshows' }), false);
}

{
    let hashSuccess;
    const results = [];
    let calls = 0;
    h.Lampa.Torserver = {
        hash(_object, success) { calls++; hashSuccess = success; }
    };
    t.ensureTorrent({ title: 'Saved', torrent: { hash: 'saved-hash', magnet: 'magnet:?xt=urn:btih:saved-hash' } }, {}, (hash) => results.push(hash));
    assert.equal(calls, 1, 'saved hash must not skip the registration attempt');
    assert.deepEqual(results, [], 'registration gets a short chance to return a current hash');
    h.fireTimeouts(2000);
    assert.deepEqual(results, ['saved-hash'], 'a suppressed Torserver callback must fall back to the saved hash');
    hashSuccess({ hash: 'late-hash' });
    assert.deepEqual(results, ['saved-hash'], 'a late success must not trigger a second launch');
}

{
    let hashSuccess;
    const results = [];
    h.Lampa.Torserver = {
        hash(_object, success) { hashSuccess = success; }
    };
    t.ensureTorrent({ title: 'Fresh', torrent: { hash: 'saved-hash', magnet: 'magnet:?xt=urn:btih:saved-hash' } }, {}, (hash) => results.push(hash));
    hashSuccess({ hash: 'fresh-hash' });
    h.fireTimeouts(2000);
    assert.deepEqual(results, ['fresh-hash'], 'success before the deadline must win and cancel fallback');
}

{
    const results = [];
    h.Lampa.Torserver = {
        hash(_object, _success, fail) { fail(new Error('offline')); }
    };
    t.ensureTorrent({ title: 'Failure', torrent: { hash: 'saved-hash', magnet: 'magnet:?xt=urn:btih:saved-hash' } }, {}, (hash) => results.push(hash));
    h.fireTimeouts(2000);
    assert.deepEqual(results, ['saved-hash'], 'registration failure must use the saved hash exactly once');
}

{
    let hashSuccess;
    const results = [];
    h.Lampa.Torserver = {
        hash(_object, success) { hashSuccess = success; }
    };
    t.ensureTorrent({ title: 'No fallback', torrent: { hash: '', magnet: 'magnet:?xt=urn:btih:new-hash' } }, {}, (hash) => results.push(hash));
    h.fireTimeouts(2000);
    assert.deepEqual(results, [], 'an absent saved hash must not create an invalid timed fallback');
    hashSuccess({ hash: 'new-hash' });
    assert.deepEqual(results, ['new-hash']);
}

{
    const chosen = t.onlineResolverForRecord({
        current_index: 0,
        online: {
            selection: { provider: 'zetflix', translation: 'dub okko' },
            resolver_url: 'https://lampac.fun/lite/zetflix/video?id=2&t=TVShows',
            items: [{ resolver_url: 'https://lampac.fun/lite/zetflix/video?id=2&t=DUB+okko' }]
        }
    });
    assert(chosen.url.includes('DUB+okko'));
}

{
    h.storage.account_email = 'viewer@example.test';
    h.storage.lampac_unic_id = 'device-id';
    h.storage.lampac_nws_id = 'stale-rch-session';
    const localized = new URL(t.localizeResolver('https://lampac.fun/lite/zetflix/video?id=2&t=DUB+okko'));
    assert.equal(localized.searchParams.get('nws_id'), 'live-rch-session', 'active Online2 RCH session must beat stale storage');
    assert.equal(localized.searchParams.get('uid'), 'device-id');
    assert.equal(localized.searchParams.get('account_email'), 'viewer@example.test');

    delete h.rch_nws['lampac.fun'];
    const fallback = new URL(t.localizeResolver('https://lampac.fun/lite/zetflix/video?id=2'));
    assert.equal(fallback.searchParams.get('nws_id'), 'stale-rch-session', 'stored RCH id remains the compatibility fallback');
}

{
    const movieA = { id: 1, media_type: 'movie', title: 'A' };
    const movieB = { id: 2, media_type: 'movie', title: 'B' };
    const record = { activity_at: 10, source: 'online', timeline_hash: 'h' };
    const road = { time: 20, percent: 2 };
    assert.notEqual(t.buttonStateKey(movieA, record, road), t.buttonStateKey(movieB, record, road));
}

{
    const key = 'continue_watch_v6_7';
    h.storage[key] = { first: { time: 1 } };
    assert(h.api.sync().store.first);
    h.storage[key] = { first: { time: 1 }, remote: { time: 2 } };
    assert(h.api.sync().store.remote, 'store() must read the synchronized object again');
}

{
    const movieA = { id: 10, media_type: 'movie', title: 'Old' };
    const movieB = { id: 11, media_type: 'movie', title: 'Current' };
    h.setActive(movieA);
    h.api.record();
    h.setActive(movieB);
    assert.equal(t.cardKey(t.getMovieFromData({})), t.cardKey(movieB), 'current Activity must beat stale lastMovie');
}

{
    const storageKey = 'continue_watch_v6_7';
    const outboxKey = 'continue_watch_v6_outbox_7';
    h.storage[storageKey] = {};
    delete h.local[outboxKey];
    const movie = { id: 777, media_type: 'tv', title: 'Shared progress', original_name: 'Shared progress' };
    h.setActive(movie);

    function playTranslation(name, mediaUrl, position, updated) {
        h.listeners.request_secuses[0]({
            params: { url: 'https://lampac.fun/lite/zetflix/video?id=777&s=1&e=1&t=' + encodeURIComponent(name), headers: {} },
            data: { url: mediaUrl }
        });
        h.Lampa.Player.play({
            isonline: true,
            card: movie,
            season: 1,
            episode: 1,
            timeline: { hash: 'shared-hash', time: position, duration: 1000, percent: Math.round(position / 10) },
            time: position,
            duration: 1000,
            percent: Math.round(position / 10),
            url: mediaUrl
        });
        h.roads['shared-hash'] = { time: position, duration: 1000, percent: Math.round(position / 10), updated };
        h.timelineListeners[0]({ hash: 'shared-hash', road: h.roads['shared-hash'] });
    }

    playTranslation('MVO', 'https://lampac.fun/proxy/mvo.m3u8', 30, 2_000_100);
    h.setClock(2_001_000);
    playTranslation('DVO', 'https://lampac.fun/proxy/dvo.m3u8', 45, 2_001_100);

    const records = Object.keys(h.storage[storageKey]);
    assert.equal(records.length, 1, 'translations must share one card progress record');
    const saved = h.storage[storageKey][records[0]];
    assert.equal(saved.time, 45);
    assert.equal(saved.online.selection.translation, 'dvo');
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 778, media_type: 'tv', title: 'Playlist serialization', original_name: 'Playlist serialization' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const segments = [{ start: 0, end: 75, type: 'intro' }, { start: 3480, end: 3697, type: 'credits' }];
    h.storage[storageKey] ||= {};
    h.storage[storageKey][recordKey] = {
        v: 6,
        card_key: cardKey,
        source: 'online',
        activity_at: 2_000_000,
        season: 1,
        episode: 2,
        episode_title: 'The Kingsroad',
        timeline_hash: 'got-s01e02',
        time: 320,
        duration: 3697,
        percent: 9,
        current_index: 1,
        online: {
            index: 1,
            direct_url: 'https://media.example/got-s01e02.m3u8',
            selection: { provider: 'zetflix', translation: 'fox life' },
            items: [
                {
                    title: 'Winter Is Coming', season: 1, episode: 1, hash: 'got-s01e01',
                    direct_url: 'https://media.example/got-s01e01.m3u8', meta: {}
                },
                {
                    title: 'The Kingsroad', season: 1, episode: 2, hash: 'got-s01e02',
                    direct_url: 'https://media.example/got-s01e02.m3u8', meta: { segments }
                }
            ]
        }
    };
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();

    assert.equal(h.androidLaunches.length, before + 1, 'Continue must reach the mocked Android player');
    const launch = h.androidLaunches[h.androidLaunches.length - 1];
    assert.doesNotThrow(() => JSON.stringify(launch.data), 'Android launch data must stay JSON-serializable');
    assert.notStrictEqual(launch.data, launch.data.playlist[1], 'root launch data must not be its playlist item');
    assert.notStrictEqual(launch.data.currentItem, launch.data, 'currentItem must not reference the root launch data');
    assert.notStrictEqual(launch.data.currentItem, launch.data.playlist[1], 'currentItem and playlist item must be independent snapshots');

    const payload = launch.parsed;
    assert.equal(payload.playlist.length, 2);
    assert.equal(payload.playlist_index, 1);
    assert.equal(payload.start_index, 1);
    assert.equal(payload.url, 'https://media.example/got-s01e02.m3u8');
    assert.equal(payload.title, 'The Kingsroad');
    assert.equal(payload.position, 320);
    assert.equal(payload.time, 320);
    assert.equal(payload.duration, 3697);
    assert.equal(payload.currentItem.title, 'The Kingsroad');
    assert.equal(payload.currentItem.position, 320);
    assert.equal(payload.playlist[1].title, 'The Kingsroad');
    assert.equal(payload.playlist[1].position, 320);
    assert.deepEqual(payload.segments, segments);
    assert.deepEqual(payload.currentItem.segments, segments);
    assert.deepEqual(payload.playlist[1].segments, segments);
    assert.equal(payload.currentItem.playlist, undefined);
    assert.equal(payload.playlist[1].playlist, undefined);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 779, media_type: 'tv', title: 'Resolved window', original_name: 'Resolved window' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const selection = { provider: 'zetflix', translation: 'fox life' };
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=779&s=1&e=' + episode + '&t=Fox+Life';
    const nestedSubtitles = [{ label: 'RU', file: 'https://media.example/subs/e2.vtt', meta: { forced: false } }];
    const calls = [];
    h.roads.e1 = { time: 55, duration: 3000, percent: 2 };
    h.roads.e3 = { time: 17, duration: 3200, percent: 1 };
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_100,
        season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'e2',
        time: 320, duration: 3100, percent: 10, current_index: 1,
        online: {
            index: 1, resolver_url: resolver(2), resolver_headers: { 'X-Series': 'current' }, selection,
            items: [
                { title: 'E1', season: 1, episode: 1, hash: 'e1', direct_url: resolver(1), selection, meta: {} },
                { title: 'E2', season: 1, episode: 2, hash: 'e2', resolver_url: resolver(2), resolver_headers: { 'X-Series': 'e2' }, selection, meta: {} },
                { title: 'E3', season: 1, episode: 3, hash: 'e3', resolver_url: resolver(3), resolver_headers: { 'X-Series': 'e3' }, selection, meta: {} },
                { title: 'E4', season: 1, episode: 4, hash: 'e4', resolver_url: resolver(4), resolver_headers: { 'X-Series': 'e4' }, selection, meta: {} }
            ]
        }
    };
    h.setRequestHandler(({ url, ok, timeout, params }) => {
        const parsed = new URL(url);
        const episode = Number(parsed.searchParams.get('e'));
        calls.push({ episode, timeout, headers: params.headers });
        const response = {
            url: 'https://media.example/stream/e' + episode + '.m3u8',
            headers: { Referer: 'https://media.example/e' + episode },
            quality: { 1080: 'https://media.example/quality/e' + episode + '.m3u8' },
            segments: [{ start: episode, end: episode + 5, type: 'intro' }],
            subtitles: episode === 2 ? nestedSubtitles : []
        };
        ok(episode % 2 ? response : JSON.stringify(response));
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();

    assert.equal(h.androidLaunches.length, before + 1, 'resolved window must launch current exactly once');
    assert.deepEqual(calls.map((entry) => entry.episode), [2, 3, 4, 1], 'current resolves once, then next two and previous resolve sequentially');
    assert.deepEqual(calls.slice(1).map((entry) => entry.timeout), [9000, 9000, 9000]);
    assert.equal(calls[1].headers['X-Series'], 'e3', 'each neighbor must use its own saved resolver headers');
    const payload = h.androidLaunches[h.androidLaunches.length - 1].parsed;
    assert.deepEqual(payload.playlist.map((item) => item.episode), [1, 2, 3, 4]);
    assert.deepEqual(payload.playlist.map((item) => item.url), [1, 2, 3, 4].map((episode) => 'https://media.example/stream/e' + episode + '.m3u8'));
    assert.equal(payload.playlist_index, 1);
    assert.equal(payload.start_index, 1);
    assert.equal(payload.position, 320);
    assert.equal(payload.playlist[0].position, 55);
    assert.equal(payload.playlist[2].position, 17);
    assert.equal(payload.playlist[2].headers.Referer, 'https://media.example/e3');
    assert.equal(payload.playlist[2].quality['1080'], 'https://media.example/quality/e3.m3u8');
    assert.deepEqual(payload.subtitles, nestedSubtitles, 'nested current metadata survives the real Android stringify/parse boundary');
    assert.deepEqual(payload.currentItem.subtitles, nestedSubtitles);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 783, media_type: 'tv', title: 'RCH retry success', original_name: 'RCH retry success' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=783&s=1&e=' + episode + '&t=Original';
    const calls = [];
    const requestUrls = [];
    const handshakes = [];
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_150,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'r1',
        time: 65, duration: 3000, percent: 2, current_index: 0,
        online: {
            index: 0, resolver_url: resolver(1), selection: { provider: 'zetflix', translation: 'original' },
            items: [1, 2, 3].map((episode) => ({
                title: 'E' + episode, season: 1, episode, hash: 'r' + episode,
                resolver_url: resolver(episode), selection: { provider: 'zetflix', translation: 'original' }, meta: {}
            }))
        }
    };
    h.setRchHook((response, ready) => {
        handshakes.push(response);
        ready();
        return true;
    });
    h.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        calls.push(episode);
        requestUrls.push(url);
        if (episode === 2 && calls.filter((value) => value === 2).length === 1) {
            ok({ rch: true, nws: 'wss://lampac.fun/rch', request_id: 'full-response-e2' });
        } else {
            ok({
                url: 'https://media.example/r' + episode + '.m3u8',
                headers: { Referer: 'https://metadata.example/e' + episode },
                segments: [{ start: episode, end: episode + 4, type: 'intro' }]
            });
        }
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();

    assert.equal(h.androidLaunches.length, before + 1, 'successful RCH retry launches current exactly once');
    assert.deepEqual(calls, [1, 2, 2, 3], 'E2 retries the exact resolver once before contiguous E3');
    assert.equal(requestUrls[1], requestUrls[2], 'RCH retry must use the exact same localized resolver URL');
    assert.equal(handshakes.length, 1, 'only one handshake is attempted');
    assert.equal(handshakes[0].request_id, 'full-response-e2', 'the full RCH response reaches the Online2 hook');
    const payload = h.androidLaunches[h.androidLaunches.length - 1].parsed;
    assert.deepEqual(payload.playlist.map((item) => item.episode), [1, 2, 3]);
    assert.equal(payload.playlist[1].url, 'https://media.example/r2.m3u8');
    assert.equal(payload.playlist[1].headers.Referer, 'https://metadata.example/e2');
    assert.deepEqual(payload.playlist[1].segments, [{ start: 2, end: 6, type: 'intro' }]);
    h.setRchHook(null);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 780, media_type: 'tv', title: 'Contiguous failure', original_name: 'Contiguous failure' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=780&s=1&e=' + episode + '&t=Original';
    const calls = [];
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_200,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'f1',
        time: 80, duration: 3000, percent: 3, current_index: 0,
        online: {
            index: 0, resolver_url: resolver(1), selection: { provider: 'zetflix', translation: 'original' },
            items: [1, 2, 3].map((episode) => ({
                title: 'E' + episode, season: 1, episode, hash: 'f' + episode,
                resolver_url: resolver(episode), selection: { provider: 'zetflix', translation: 'original' }, meta: {}
            }))
        }
    };
    let handshakeCount = 0;
    h.setRchHook((_response, ready) => {
        handshakeCount++;
        ready();
        return true;
    });
    h.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        calls.push(episode);
        if (episode === 1) ok({ url: 'https://media.example/f1.m3u8' });
        else if (episode === 2) ok({ rch: { nested: { retry: true } }, nws: 'wss://lampac.fun/rch' });
        else throw new Error('E3 must not be resolved after E2 failed');
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();

    assert.equal(h.androidLaunches.length, before + 1, 'RCH neighbor failure must still launch current exactly once');
    assert.deepEqual(calls, [1, 2, 2], 'a repeated RCH response fails after exactly one retry and prevents E3');
    assert.equal(handshakeCount, 1, 'repeated RCH must not start a second handshake');
    const payload = h.androidLaunches[h.androidLaunches.length - 1].parsed;
    assert.deepEqual(payload.playlist.map((item) => item.episode), [1], 'failed E2 and every later item must be removed contiguously');
    assert.equal(payload.playlist_index, 0);
    h.timelineListeners.forEach((listener) => listener({ hash: 'f1', road: { time: 95, duration: 3000, percent: 3, updated: 2_000_500 } }));
    assert.equal(h.storage[storageKey][recordKey].online.items.length, 3, 'temporary fail-closed window must not overwrite full online definitions');
    assert.equal(h.storage[storageKey][recordKey].online.items[1].resolver_url, resolver(2), 'unresolved E2 definition survives the fail-closed save');
    assert.equal(h.storage[storageKey][recordKey].current_index, 0, 'runtime window index maps back to the full definition index');
    h.setRchHook(null);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 785, media_type: 'tv', title: 'Fresh full definitions', original_name: 'Fresh full definitions' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=785&s=1&e=' + episode + '&t=Original';
    const makeDefs = (count) => Array.from({ length: count }, (_value, index) => {
        const episode = index + 1;
        return {
            title: 'E' + episode, season: 1, episode, hash: 'z' + episode,
            resolver_url: resolver(episode), selection: { provider: 'zetflix', translation: 'original' }, meta: {}
        };
    });
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_600,
        season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'z2',
        time: 70, duration: 3000, percent: 2, current_index: 1,
        online: {
            index: 1, resolver_url: resolver(2), selection: { provider: 'zetflix', translation: 'original' },
            items: makeDefs(5)
        }
    };
    h.setRchHook((_response, ready) => { ready(); return true; });
    h.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        if (episode === 2) ok({ url: 'https://media.example/z2.m3u8' });
        else if (episode === 3) ok({ rch: true, nws: 'wss://lampac.fun/rch' });
        else if (episode === 1) ok({ url: 'https://media.example/z1.m3u8' });
        else throw new Error('fail-closed E3 must prevent later resolution');
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();
    assert.equal(h.androidLaunches.length, before + 1);
    assert.deepEqual(h.androidLaunches[h.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1, 2]);

    const freshDefs = [{
        title: 'E0', season: 1, episode: 0, hash: 'z0', resolver_url: resolver(0),
        selection: { provider: 'zetflix', translation: 'original' }, meta: {}
    }].concat(makeDefs(5));
    freshDefs[5].meta = { segments: [{ start: 1, end: 5, type: 'intro' }] };
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_001_000,
        season: 1, episode: 5, episode_title: 'Fresh E5', timeline_hash: 'z5',
        time: 20, duration: 3000, percent: 1, current_index: 5,
        online: {
            index: 5, resolver_url: resolver(5), selection: { provider: 'zetflix', translation: 'original' },
            items: freshDefs
        }
    };
    h.timelineListeners.forEach((listener) => listener({ hash: 'z2', road: { time: 115, duration: 3000, percent: 4, updated: 2_002_000 } }));
    const saved = h.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 6, 'newer richer same-provider store definitions must survive a stale launch snapshot save');
    assert.equal(saved.online.items[5].resolver_url, resolver(5), 'fresh E5 must not be dropped by the bounded runtime window');
    assert.deepEqual(saved.online.items[5].meta.segments, [{ start: 1, end: 5, type: 'intro' }]);
    assert.equal(saved.current_index, 2, 'prepended E0 must shift runtime E2 to its mapped full-list index');
    assert.equal(saved.online.index, 2);
    assert.equal(saved.online.items[2].hash, 'z2');
    assert.equal(saved.episode, 2);
    assert.equal(saved.time, 115);

    const reordered = [freshDefs[0], freshDefs[3], freshDefs[1], freshDefs[2], freshDefs[4], freshDefs[5]];
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_002_200,
        season: 1, episode: 3, episode_title: 'Reordered E3', timeline_hash: 'z3',
        time: 30, duration: 3000, percent: 1, current_index: 1,
        online: {
            index: 1, resolver_url: resolver(3), selection: { provider: 'zetflix', translation: 'original' },
            items: reordered
        }
    };
    h.timelineListeners.forEach((listener) => listener({ hash: 'z2', road: { time: 130, duration: 3000, percent: 4, updated: 2_002_500 } }));
    const reorderedSaved = h.storage[storageKey][recordKey];
    assert.equal(reorderedSaved.current_index, 3, 'hash identity must locate E2 after a fresh-list reorder');
    assert.equal(reorderedSaved.online.index, 3);
    assert.equal(reorderedSaved.online.items[3].hash, 'z2');
    assert.equal(reorderedSaved.episode, 2);
    assert.equal(reorderedSaved.time, 130);
    h.setRequestHandler(null);
    h.setRchHook(null);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 786, media_type: 'tv', title: 'Provider conflict', original_name: 'Provider conflict' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const zetflix = (episode) => 'https://lampac.fun/lite/zetflix/video?id=786&s=1&e=' + episode;
    const pidtor = (episode) => 'https://lampac.fun/lite/pidtor/video?id=786&s=1&e=' + episode;
    const defs = [1, 2, 3, 4].map((episode) => ({
        title: 'E' + episode, season: 1, episode, hash: 'p' + episode,
        resolver_url: zetflix(episode), selection: { provider: 'zetflix', translation: '' }, meta: {}
    }));
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_002_100,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'p1',
        time: 60, duration: 3000, percent: 2, current_index: 0,
        online: { index: 0, direct_url: 'https://media.example/p1.m3u8', selection: { provider: 'zetflix', translation: '' }, items: defs }
    };
    h.setRchHook(null);
    h.setRequestHandler(({ ok }) => ok({ rch: true, nws: 'wss://lampac.fun/rch' }));
    h.setActive(movie);
    h.api.launch();

    const foreignDefs = [1, 2, 3, 4, 5, 6].map((episode) => ({
        title: 'Foreign E' + episode, season: 1, episode, hash: 'foreign-' + episode,
        resolver_url: pidtor(episode), selection: { provider: 'pidtor', translation: '' }, meta: {}
    }));
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_003_000,
        season: 1, episode: 6, timeline_hash: 'foreign-6', current_index: 5,
        online: { index: 5, resolver_url: pidtor(6), selection: { provider: 'pidtor', translation: '' }, items: foreignDefs }
    };
    h.timelineListeners.forEach((listener) => listener({ hash: 'p1', road: { time: 125, duration: 3000, percent: 4, updated: 2_004_000 } }));
    const saved = h.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 4, 'richer definitions from a mismatched provider must not be merged');
    assert.equal(saved.online.selection.provider, 'zetflix');
    assert(saved.online.items.every((item) => String(item.resolver_url || '').indexOf('/pidtor/') === -1));
    h.setRequestHandler(null);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 787, media_type: 'tv', title: 'Translation conflict', original_name: 'Translation conflict' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const resolver = (episode, voice) => 'https://lampac.fun/lite/zetflix/video?id=787&s=1&e=' + episode + '&t=' + encodeURIComponent(voice);
    const makeDefs = (count, voice) => Array.from({ length: count }, (_value, index) => {
        const episode = index + 1;
        return {
            title: voice + ' E' + episode, season: 1, episode, hash: 'v' + episode,
            resolver_url: resolver(episode, voice), selection: { provider: 'zetflix', translation: voice.toLowerCase() }, meta: {}
        };
    });
    const originalDefs = makeDefs(4, 'Original');
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_004_100,
        season: 1, episode: 1, episode_title: 'Original E1', timeline_hash: 'v1',
        time: 60, duration: 3000, percent: 2, current_index: 0,
        online: {
            index: 0, direct_url: 'https://media.example/v1.m3u8',
            selection: { provider: 'zetflix', translation: 'original' }, items: originalDefs
        }
    };
    h.setRchHook(null);
    h.setRequestHandler(({ ok }) => ok({ rch: true, nws: 'wss://lampac.fun/rch' }));
    h.setActive(movie);
    h.api.launch();

    const foxDefs = makeDefs(6, 'Fox Life');
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_005_000,
        season: 1, episode: 6, timeline_hash: 'v6', current_index: 5,
        online: {
            index: 5, resolver_url: resolver(6, 'Fox Life'),
            selection: { provider: 'zetflix', translation: 'fox life' }, items: foxDefs
        }
    };
    h.timelineListeners.forEach((listener) => listener({ hash: 'v1', road: { time: 140, duration: 3000, percent: 5, updated: 2_006_000 } }));
    const saved = h.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 4, 'same-provider definitions from another translation must not be merged');
    assert.equal(saved.online.selection.provider, 'zetflix');
    assert.equal(saved.online.selection.translation, 'original');
    assert(saved.online.items.every((item) => String(item.resolver_url || '').indexOf('Fox%20Life') === -1));
    assert(saved.online.items.every((item) => item.selection.translation === 'original'));
    h.setRequestHandler(null);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 784, media_type: 'tv', title: 'RCH hook absent', original_name: 'RCH hook absent' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=784&s=1&e=' + episode;
    const calls = [];
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_250,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'a1',
        time: 70, duration: 3000, percent: 2, current_index: 0,
        online: {
            index: 0, direct_url: 'https://media.example/a1.m3u8', selection: {},
            items: [
                { title: 'E1', season: 1, episode: 1, hash: 'a1', direct_url: 'https://media.example/a1.m3u8', meta: {} },
                { title: 'E2', season: 1, episode: 2, hash: 'a2', resolver_url: resolver(2), meta: {} },
                { title: 'E3', season: 1, episode: 3, hash: 'a3', resolver_url: resolver(3), meta: {} }
            ]
        }
    };
    h.setRchHook(null);
    h.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        calls.push(episode);
        if (episode === 2) ok({ rch: true, nws: 'wss://lampac.fun/rch' });
        else throw new Error('E3 must not run without an RCH hook');
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();

    assert.equal(h.androidLaunches.length, before + 1, 'missing hook stays fail-closed and launches current once');
    assert.deepEqual(calls, [2], 'missing hook does not retry RCH or skip to E3');
    assert.deepEqual(h.androidLaunches[h.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 781, media_type: 'tv', title: 'Bounded neighbor', original_name: 'Bounded neighbor' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_300,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 't1',
        time: 90, duration: 3000, percent: 3, current_index: 0,
        online: {
            index: 0, direct_url: 'https://media.example/t1.m3u8', selection: {},
            items: [
                { title: 'E1', season: 1, episode: 1, hash: 't1', direct_url: 'https://media.example/t1.m3u8', meta: {} },
                { title: 'E2', season: 1, episode: 2, hash: 't2', resolver_url: 'https://lampac.fun/lite/zetflix/video?id=781&s=1&e=2', meta: {} }
            ]
        }
    };
    let lateReady;
    let requests = 0;
    h.setRchHook((_response, ready) => {
        lateReady = ready;
        return true;
    });
    h.setRequestHandler(({ ok }) => {
        requests++;
        ok({ rch: true, nws: 'wss://lampac.fun/rch' });
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();
    assert.equal(h.androidLaunches.length, before, 'current waits only while the bounded neighbor request is pending');
    h.fireTimeouts(9000);
    assert.equal(h.androidLaunches.length, before + 1, 'hard 9 s neighbor deadline must release current exactly once');
    lateReady();
    assert.equal(requests, 1, 'a late handshake callback must not retry after the hard deadline');
    assert.equal(h.androidLaunches.length, before + 1, 'a late handshake callback must not duplicate or extend the launch');
    h.fireTimeouts(18000);
    assert.equal(h.androidLaunches.length, before + 1, 'cleared global deadline must not duplicate the launch');
    assert.deepEqual(h.androidLaunches[h.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
    h.setRequestHandler(null);
    h.setRchHook(null);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 782, media_type: 'tv', title: 'Nested resolver output', original_name: 'Nested resolver output' };
    const cardKey = t.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=782&s=1&e=' + episode + '&t=Original';
    const calls = [];
    h.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_400,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'n1',
        time: 75, duration: 3000, percent: 3, current_index: 0,
        online: {
            index: 0, resolver_url: resolver(1), selection: { provider: 'zetflix', translation: 'original' },
            items: [1, 2, 3].map((episode) => ({
                title: 'E' + episode, season: 1, episode, hash: 'n' + episode,
                resolver_url: resolver(episode), selection: { provider: 'zetflix', translation: 'original' }, meta: {}
            }))
        }
    };
    h.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        calls.push(episode);
        if (episode === 1) ok({ url: 'https://media.example/n1.m3u8' });
        else if (episode === 2) ok({ url: resolver(2) });
        else throw new Error('E3 must not be resolved after E2 returned another resolver URL');
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();

    assert.equal(h.androidLaunches.length, before + 1, 'nested resolver output must still launch current exactly once');
    assert.deepEqual(calls, [1, 2], 'nested E2 resolver output must stop before E3');
    const payload = h.androidLaunches[h.androidLaunches.length - 1].parsed;
    assert.deepEqual(payload.playlist.map((item) => item.episode), [1], 'resolver output is not playable and must truncate E2 plus the tail');
    assert.equal(payload.url, 'https://media.example/n1.m3u8');
    h.setRequestHandler(null);
}

console.log('ContinueWatching v6.1.6: 30 fixtures passed');
