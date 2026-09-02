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

assert.equal(h.api.version, 'v6.1.5-online-next-window-20260902');

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
    assert.deepEqual(calls.slice(1).map((entry) => entry.timeout), [5000, 5000, 5000]);
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
    h.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        calls.push(episode);
        if (episode === 1) ok({ url: 'https://media.example/f1.m3u8' });
        else if (episode === 2) ok({ rch: { nested: { retry: true } } });
        else throw new Error('E3 must not be resolved after E2 failed');
    });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();

    assert.equal(h.androidLaunches.length, before + 1, 'RCH neighbor failure must still launch current exactly once');
    assert.deepEqual(calls, [1, 2], 'failed E2 must prevent any E3 resolution attempt');
    const payload = h.androidLaunches[h.androidLaunches.length - 1].parsed;
    assert.deepEqual(payload.playlist.map((item) => item.episode), [1], 'failed E2 and every later item must be removed contiguously');
    assert.equal(payload.playlist_index, 0);
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
    let lateOk;
    h.setRequestHandler(({ ok }) => { lateOk = ok; });
    h.setActive(movie);
    const before = h.androidLaunches.length;
    h.api.launch();
    assert.equal(h.androidLaunches.length, before, 'current waits only while the bounded neighbor request is pending');
    h.fireTimeouts(14000);
    assert.equal(h.androidLaunches.length, before + 1, 'global 14 s deadline must release current exactly once');
    lateOk({ url: 'https://media.example/too-late-e2.m3u8' });
    h.fireTimeouts(5000);
    assert.equal(h.androidLaunches.length, before + 1, 'a late neighbor callback after the global deadline must not duplicate or extend the launch');
    assert.deepEqual(h.androidLaunches[h.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
    h.setRequestHandler(null);
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

console.log('ContinueWatching v6.1.5: 25 fixtures passed');
