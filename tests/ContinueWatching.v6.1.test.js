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
    let active = null;
    const storage = {};
    const local = {};
    const roads = {};
    const listeners = {};
    const timelineListeners = [];

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
        Player: { play(data) { return data; }, playlist() {} },
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
            this.timeout = function () {};
            this.native = function (_url, _ok, fail) { if (fail) fail(); };
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
        location: { href: 'https://lampac.fun/', protocol: 'https:' },
        localStorage: {
            getItem(key) { return Object.prototype.hasOwnProperty.call(local, key) ? local[key] : null; },
            setItem(key, value) { local[key] = String(value); },
            removeItem(key) { delete local[key]; }
        },
        setTimeout() { return 1; },
        clearTimeout() {},
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
        setActive(movie) { active = movie; },
        setClock(value) { clock = value; }
    };
}

const h = harness();
const t = h.api.testing;

assert.equal(h.api.version, 'v6.1.1-technical-resume-fix-20260902');

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

console.log('ContinueWatching v6.1.1: 14 fixtures passed');
