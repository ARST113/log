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

function harness(options = {}) {
    let clock = 2_000_000;
    let nextTimerId = 1;
    let active = null;
    let requestHandler = null;
    const storage = {};
    const local = {};
    const roads = {};
    const listeners = {};
    const playerListeners = {};
    const timelineListeners = [];
    const timelineUpdates = [];
    const timers = new Map();
    const intervals = [];
    const androidLaunches = [];
    const playlistCalls = [];
    const scriptUrls = Array.isArray(options.scripts) ? options.scripts.slice() : [];
    const storageListeners = [];
    const requests = [];
    let storageSyncCalls = 0;
    let localStorageGetError = false;
    let localStorageSetError = false;
    let localStorageRemoveError = false;
    const $ = jqueryStub();

    $.ajax = function (settings) {
        const request = {
            url: settings.url,
            post: String(settings.type || 'GET').toUpperCase() === 'POST' ? settings.data : false,
            params: {
                transport: 'jquery',
                contentType: settings.contentType,
                processData: settings.processData,
                cache: settings.cache
            },
            timeout: Number(settings.timeout || 0)
        };
        requests.push(request);
        if (requestHandler) return requestHandler({ ...request, ok: settings.success, fail: settings.error });
        if (settings.error) settings.error({ status: 0 });
    };

    const Android = {
        openPlayer(link, data) {
            const serialized = JSON.stringify(data);
            const parsed = JSON.parse(serialized);
            const nativePlaylist = Array.isArray(parsed.playlist) && parsed.playlist.length ? parsed.playlist : [parsed];
            const nativeCurrent = nativePlaylist.find((item) => item && item.url === parsed.url) || nativePlaylist[0] || {};
            const nativePositionMs = Math.trunc(Number(nativeCurrent.timeline && nativeCurrent.timeline.time || 0) * 1000);
            androidLaunches.push({ link, data, serialized, parsed, nativePositionMs });
            return serialized;
        }
    };

    function emitPlayer(name, event) {
        (playerListeners[name] || []).forEach((callback) => callback(event));
    }

    function internalPlayerPlay(data) {
        let run = true;
        emitPlayer('create', { data, abort() { run = false; } });
        if (!run) return null;
        emitPlayer('start', data);
        if (options.androidTimelineRefresh) {
            const refresh = (item) => {
                if (!item || !item.timeline || !item.timeline.hash) return;
                const road = Lampa.Timeline.view(item.timeline.hash) || {
                    hash: item.timeline.hash, time: 0, duration: 0, percent: 0, updated: 0
                };
                item.timeline.time = Number(road.time || 0);
                item.timeline.duration = Number(road.duration || 0);
                item.timeline.percent = Number(road.percent || 0);
                item.timeline.updated = Number(road.updated || 0);
            };
            refresh(data);
            (data.playlist || []).forEach(refresh);
        }
        return Android.openPlayer(data.url, data);
    }

    const document = {
        head: { appendChild() {} },
        visibilityState: 'visible',
        scripts: scriptUrls.map((src) => ({ src })),
        getElementById() { return null; },
        createElement() { return {}; },
        addEventListener(name, callback) { (listeners['document:' + name] ||= []).push(callback); },
        removeEventListener(name, callback) {
            const key = 'document:' + name;
            listeners[key] = (listeners[key] || []).filter((listener) => listener !== callback);
        }
    };

    const Lampa = {
        Account: { Permit: { access: options.accountAccess !== false, account: { profile: { id: 7 } } } },
        Activity: { active: () => active ? { movie: active } : null },
        Controller: { enabled() { return null; }, collectionAppend() {} },
        Listener: { follow(name, callback) { (listeners[name] ||= []).push(callback); } },
        Noty: { show() {} },
        Platform: { is(name) { return !!(options.androidPlatform || options.justExternal) && name === 'android'; } },
        Plugins: {
            awaits() { return Array.isArray(options.pluginAwaits) ? options.pluginAwaits.slice() : []; },
            loaded() { return Array.isArray(options.pluginLoaded) ? options.pluginLoaded.slice() : []; },
            get() { return Array.isArray(options.pluginGet) ? options.pluginGet.slice() : []; }
        },
        Android,
        Player: {
            listener: { follow(name, callback) { (playerListeners[name] ||= []).push(callback); } },
            play(data) { return internalPlayerPlay(data); },
            playlist(data) { playlistCalls.push(data); }
        },
        Storage: {
            listener: { follow(name, callback) { if (name === 'change') storageListeners.push(callback); } },
            field(name) {
                if (name === 'player') return options.player || '';
                if (name === 'player_torrent') return options.playerTorrent || (options.justExternal ? 'android' : '');
                return '';
            },
            get(key, fallback) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback; },
            set(key, value) { storage[key] = value; },
            sync() { storageSyncCalls += 1; }
        },
        Timeline: {
            listener: { follow(name, callback) { if (name === 'update') timelineListeners.push(callback); } },
            view(hash) { return roads[hash] || null; },
            update(params) {
                const road = JSON.parse(JSON.stringify(params));
                roads[params.hash] = road;
                timelineUpdates.push(road);
                timelineListeners.forEach((callback) => callback({ hash: params.hash, road }));
            }
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
                const request = { url, post, params, timeout };
                requests.push(request);
                if (requestHandler) return requestHandler({ ...request, ok, fail });
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
        navigator: { maxTouchPoints: options.phone ? 5 : 0, userAgent: '' },
        innerWidth: options.phone ? 412 : 1920,
        innerHeight: options.phone ? 915 : 1080,
        rch_nws: { 'lampac.fun': { connectionId: 'live-rch-session' } },
        location: { href: 'https://lampac.fun/', protocol: 'https:' },
        localStorage: {
            getItem(key) {
                if (localStorageGetError) throw new Error('localStorage get blocked');
                return Object.prototype.hasOwnProperty.call(local, key) ? local[key] : null;
            },
            setItem(key, value) {
                if (localStorageSetError) throw new Error('localStorage set blocked');
                local[key] = String(value);
            },
            removeItem(key) {
                if (localStorageRemoveError) throw new Error('localStorage remove blocked');
                delete local[key];
            }
        },
        setTimeout(callback, delay) {
            const id = nextTimerId++;
            const normalized = Number(delay || 0);
            timers.set(id, { callback, delay: normalized, due: clock + normalized });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        setInterval(callback, delay) {
            const id = intervals.length + 1;
            intervals.push({ id, callback, delay: Number(delay || 0), active: true });
            return id;
        },
        clearInterval(id) {
            const interval = intervals.find((entry) => entry.id === id);
            if (interval) interval.active = false;
        },
        Lampa,
        $
    };
    context.addEventListener = function (name, callback) { (listeners['window:' + name] ||= []).push(callback); };
    context.removeEventListener = function (name, callback) {
        const key = 'window:' + name;
        listeners[key] = (listeners[key] || []).filter((listener) => listener !== callback);
    };
    context.window = context;
    context.window.appready = true;
    context.window.__CONTINUE_WATCH_TEST_MODE__ = true;

    vm.runInNewContext(source, context, { filename: pluginFile });

    return {
        get api() { return context.window.ContinueWatchV6; },
        Lampa,
        storage,
        local,
        roads,
        listeners,
        timelineListeners,
        timelineUpdates,
        androidLaunches,
        playlistCalls,
        requests,
        rch_nws: context.rch_nws,
        setRequestHandler(handler) { requestHandler = handler; },
        reloadPlugin(version) {
            delete context.window.__CW_V6_VERSION__;
            const reloadSource = version
                ? source.replace(/var VERSION = '[^']+';/, "var VERSION = '" + version + "';")
                : source;
            vm.runInNewContext(reloadSource, context, { filename: pluginFile });
            return context.window.ContinueWatchV6;
        },
        setScripts(scripts) { document.scripts = (scripts || []).map((src) => ({ src })); },
        setAccountProfile(id) { Lampa.Account.Permit.account = id === null ? {} : { profile: { id } }; },
        setAccountAccess(value) { Lampa.Account.Permit.access = !!value; },
        dispatchPlayerEvent(name, event) { emitPlayer(name, event); },
        dispatchStorageChange(name) { storageListeners.forEach((callback) => callback({ name })); },
        dispatchWindowEvent(name) { (listeners['window:' + name] || []).forEach((callback) => callback()); },
        setVisibility(value) { document.visibilityState = value; (listeners['document:visibilitychange'] || []).forEach((callback) => callback()); },
        storageSyncCalls() { return storageSyncCalls; },
        setRchHook(handler) {
            if (handler) context.window.Online2RchHandshake = handler;
            else delete context.window.Online2RchHandshake;
        },
        setLocalStorageErrors(value = {}) {
            localStorageGetError = !!value.get;
            localStorageSetError = !!value.set;
            localStorageRemoveError = !!value.remove;
        },
        setActive(movie) { active = movie; },
        internalPlayerPlay,
        setClock(value) { clock = value; },
        schedule(callback, delay) { return context.setTimeout(callback, delay); },
        advance(milliseconds) {
            const target = clock + Number(milliseconds || 0);
            while (true) {
                const due = Array.from(timers.entries())
                    .filter((entry) => entry[1].due <= target)
                    .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
                if (!due) break;
                const [id, timer] = due;
                if (!timers.delete(id)) continue;
                clock = timer.due;
                timer.callback();
            }
            clock = target;
        },
        now() { return clock; },
        fireTimeouts(delay) {
            const selected = Array.from(timers.entries()).filter((entry) => entry[1].delay === delay);
            selected.forEach(([id, timer]) => {
                if (!timers.delete(id)) return;
                timer.callback();
            });
        },
        fireIntervals(delay) {
            intervals.filter((entry) => entry.active && (delay === undefined || entry.delay === Number(delay))).forEach((entry) => entry.callback());
        },
        activeIntervalCount(delay) {
            return intervals.filter((entry) => entry.active && (delay === undefined || entry.delay === Number(delay))).length;
        },
        pendingTimerCount(delay) {
            return Array.from(timers.values()).filter((entry) => delay === undefined || entry.delay === Number(delay)).length;
        }
    };
}

const h = harness();
const t = h.api.testing;

assert.equal(h.api.version, 'v6.2.14-live-card-pull-20260904');

assert.deepEqual(
    t.normalizeSegments('{"duration_ms":2696000,"skip":[{"start":62,"end":152}],"ad":[{"start":0,"end":12}]}', 3697),
    { duration_ms: 2_696_000, skip: [{ start: 62, end: 152 }], ad: [{ start: 0, end: 12 }] },
    'canonical Just+ reference duration must survive even when runtime file duration differs'
);
assert.deepEqual(
    t.normalizeSegments({ intro: [0, 75], recap: [{ from: 76, to: 90 }], commercial: [[100, 120]] }, 3697),
    { duration_ms: 3_697_000, skip: [{ start: 0, end: 75 }, { start: 76, end: 90 }], ad: [{ start: 100, end: 120 }] },
    'legacy Lampac segment shapes must map to Just+ skip/ad arrays'
);
assert.equal(t.normalizeSegments({ intro: [5, 5], unknown: [{ start: 1, end: 2 }] }, 100), null,
    'invalid or unknown segment metadata must be omitted so Just+ online fallback remains enabled');

{
    const onlineAndroid = harness({ androidPlatform: true, player: 'android' });
    assert.equal(onlineAndroid.api.testing.isJustExternal({ isonline: true, url: 'https://media.example/online.m3u8' }), true,
        'online Android routing must read the player setting');
    const torrentAndroid = harness({ androidPlatform: true, playerTorrent: 'android' });
    assert.equal(torrentAndroid.api.testing.isJustExternal({ torrent_hash: 'route-hash', url: 'http://127.0.0.1/stream/e1?link=route-hash&index=0' }), true,
        'torrent Android routing must read the player_torrent setting');
    const desktop = harness({ player: 'android', playerTorrent: 'android' });
    assert.equal(desktop.api.testing.isJustExternal({ isonline: true }), false,
        'desktop playback must not be classified as Android external');
    const forcedAndroid = harness({ androidPlatform: true });
    assert.equal(forcedAndroid.api.testing.isJustExternal({ isonline: true, launch_player: 'android' }), true,
        'an explicit Android launch override must be classified as external');
    const forcedInner = harness({ androidPlatform: true, player: 'android', playerTorrent: 'android' });
    assert.equal(forcedInner.api.testing.isJustExternal({ isonline: true, launch_player: 'inner' }), false,
        'an explicit inner override must beat the stored Android player setting');
    assert.equal(forcedInner.api.testing.isJustExternal({ torrent_hash: 'forced-lampa', launch_player: 'lampa' }), false,
        'an explicit Lampa override must beat the stored Android torrent player setting');
    const torrentFallback = harness({ androidPlatform: true });
    torrentFallback.Lampa.Torserver = { gstWork() { return false; } };
    assert.equal(torrentFallback.api.testing.isJustExternal({ torrent_hash: 'fallback-hash' }), true,
        'torrent playback must follow Lampa Android fallback when the internal GST player is unavailable');
}

{
    const env = harness({ androidPlatform: true, player: 'inner', playerTorrent: 'inner' });
    const movie = { id: 7784, media_type: 'tv', title: 'External event authority', original_name: 'External event authority' };
    const data = {
        card: movie, movie, torrent_hash: 'external-event-torrent', season: 1, episode: 1,
        url: 'http://127.0.0.1:8090/stream/S01E01.mkv?link=external-event-torrent&index=0&play',
        timeline: { hash: 'external-event-e1', time: 0, duration: 3000, percent: 0 },
        playlist: [{
            torrent_hash: 'external-event-torrent', file_name: 'S01E01.mkv', file_index: 0,
            season: 1, episode: 1,
            url: 'http://127.0.0.1:8090/stream/S01E01.mkv?link=external-event-torrent&index=0&play',
            timeline: { hash: 'external-event-e1', time: 0, duration: 3000, percent: 0 }
        }]
    };
    env.setActive(movie);
    env.Lampa.Player.play(data);
    assert.equal(env.api.session().external, false,
        'storage inference remains false before Lampa confirms the external route');
    assert.equal(env.api.pending(), null);
    env.dispatchPlayerEvent('external', data);
    assert.equal(env.api.session().external, true,
        'the authoritative Lampa external event must upgrade the captured session');
    assert.equal(env.api.pending().torrent.hash, 'external-event-torrent',
        'an externally launched torrent must persist a return checkpoint');
}

{
    const env = harness({ androidPlatform: true, player: 'android', playerTorrent: 'android' });
    const collisionHash = 'cross-source-collision';
    const torrentMovie = { id: 7785, media_type: 'tv', title: 'Old torrent pending', original_name: 'Old torrent pending' };
    const torrentData = {
        card: torrentMovie, movie: torrentMovie, torrent_hash: 'collision-torrent', season: 1, episode: 1,
        url: 'http://127.0.0.1:8090/stream/S01E01.mkv?link=collision-torrent&index=0&play',
        timeline: { hash: collisionHash, time: 10, duration: 3000, percent: 1 },
        playlist: [{ torrent_hash: 'collision-torrent', file_name: 'S01E01.mkv', file_index: 0, season: 1, episode: 1,
            url: 'http://127.0.0.1:8090/stream/S01E01.mkv?link=collision-torrent&index=0&play',
            timeline: { hash: collisionHash, time: 10, duration: 3000, percent: 1 } }]
    };
    env.setActive(torrentMovie);
    env.Lampa.Player.play(torrentData);
    assert.equal(env.api.pending().torrent.hash, 'collision-torrent');
    const pendingEventsBefore = (env.api.pending().events || []).length;

    const onlineMovie = { id: 7786, media_type: 'tv', title: 'Current online session', original_name: 'Current online session' };
    const onlineData = {
        card: onlineMovie, movie: onlineMovie, isonline: true, season: 1, episode: 1,
        url: 'https://media.example/collision-online-e1.m3u8',
        timeline: { hash: collisionHash, time: 10, duration: 3000, percent: 1 },
        playlist: [{ isonline: true, season: 1, episode: 1, url: 'https://media.example/collision-online-e1.m3u8',
            timeline: { hash: collisionHash, time: 10, duration: 3000, percent: 1 } }]
    };
    env.setActive(onlineMovie);
    env.Lampa.Player.play(onlineData);
    env.timelineListeners.forEach((listener) => listener({
        hash: collisionHash, road: { time: 55, duration: 3000, percent: 2, updated: 2_000_100 }
    }));
    const saved = env.api.record();
    assert.equal(saved.source, 'online',
        'a current online update must not be intercepted by an unrelated torrent pending entry');
    assert.equal(saved.time, 55);
    assert.equal((env.api.pending().events || []).length, pendingEventsBefore,
        'the stale torrent pending must not collect current online events');
}

function seedDelayedOnline(env, id) {
    const movie = { id, media_type: 'tv', title: 'Delayed ' + id, original_name: 'Delayed ' + id };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=' + id + '&s=1&e=' + episode + '&t=Original';
    env.storage.continue_watch_v6_7 ||= {};
    env.storage.continue_watch_v6_7[recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: env.now(),
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'd' + id + '-1',
        time: 75, duration: 3000, percent: 3, current_index: 0,
        online: {
            index: 0, resolver_url: resolver(1), selection: { provider: 'zetflix', translation: 'original' },
            items: [1, 2, 3].map((episode) => ({
                title: 'E' + episode, season: 1, episode, hash: 'd' + id + '-' + episode,
                resolver_url: resolver(episode), selection: { provider: 'zetflix', translation: 'original' }, meta: {}
            }))
        }
    };
    env.setActive(movie);
    return { movie, resolver, recordKey };
}

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
    assert.equal(t.buttonStateKey(movieA, record, road), t.cardKey(movieA) + '|10|online|h|20|2',
        'button state must remain backward-compatible so a v6.2.9 refresh loop leaves the new button in place');
}

{
    assert.equal(typeof t.buttonOwnedByCurrentVersion, 'function',
        'refresh must distinguish an unowned legacy button from the current plugin button');
    const stateKey = 'stable-state';
    function button(attrs) {
        return { length: 1, attr(name) { return attrs[name]; } };
    }
    assert.equal(t.buttonOwnedByCurrentVersion(button({ 'data-state': stateKey }), stateKey), false,
        'a legacy button without an owner marker must be replaced once');
    assert.equal(t.buttonOwnedByCurrentVersion(button({ 'data-state': stateKey, 'data-cw-owner-version': h.api.version }), stateKey), true,
        'the current version must keep its own button');
    assert.equal(t.buttonOwnedByCurrentVersion(button({ 'data-state': stateKey, 'data-cw-owner-version': 'v6.2.9' }), stateKey), false,
        'a button owned by an older version must be replaced');
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
    const canonicalSegments = {
        duration_ms: 3_697_000,
        skip: [{ start: 0, end: 75 }, { start: 3480, end: 3697 }],
        ad: []
    };
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
    assert.deepEqual(payload.segments, canonicalSegments,
        'legacy Lampac segments must be normalized to the Just+ 1.3.10 Intent contract');
    assert.deepEqual(payload.currentItem.segments, canonicalSegments);
    assert.deepEqual(payload.playlist[1].segments, canonicalSegments);
    assert.equal(payload.currentItem.playlist, undefined);
    assert.equal(payload.playlist[1].playlist, undefined);
}

{
    const env = harness({ androidPlatform: true, player: 'android', androidTimelineRefresh: true });
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 7782, media_type: 'tv', title: 'Newer native timeline', original_name: 'Newer native timeline' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_075,
            season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'newer-native-e2',
            time: 332, duration: 5401, percent: 6, current_index: 0,
            online: {
                index: 0,
                items: [{ title: 'E2', season: 1, episode: 2, hash: 'newer-native-e2', direct_url: 'https://media.example/newer-native-e2.m3u8', meta: {} }]
            }
        }
    };
    env.roads['newer-native-e2'] = { hash: 'newer-native-e2', time: 401, duration: 5401, percent: 7, updated: 2_000_100 };
    env.setActive(movie);
    env.api.launch();
    assert.equal(env.androidLaunches[0].nativePositionMs, 401000,
        'a newer native position must remain authoritative at launch');
    assert.equal(env.timelineUpdates.length, 0,
        'remote hydration must not overwrite a newer native timeline road');
}

{
    const env = harness({ androidPlatform: true, player: 'android', androidTimelineRefresh: true });
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 7781, media_type: 'tv', title: 'Native timeline refresh', original_name: 'Native timeline refresh' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_075,
            season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'native-refresh-e2',
            time: 332.040333, duration: 5401.24, percent: 6, current_index: 1,
            online: {
                index: 1,
                items: [
                    { title: 'E1', season: 1, episode: 1, hash: 'native-refresh-e1', direct_url: 'https://media.example/native-e1.m3u8', meta: {} },
                    { title: 'E2', season: 1, episode: 2, hash: 'native-refresh-e2', direct_url: 'https://media.example/native-e2.m3u8', meta: {} }
                ]
            }
        }
    };
    env.setActive(movie);
    env.api.launch();
    const launch = env.androidLaunches[0];
    assert.equal(launch.nativePositionMs, 332040,
        'receiver launch must survive Lampa Android refreshing timeline from its local file_view snapshot');
    assert.equal(env.timelineUpdates.length, 1,
        'Continue must prime only the selected episode timeline before native launch');
    assert.equal(env.timelineUpdates[0].hash, 'native-refresh-e2');
    assert.equal(env.timelineUpdates[0].received, true,
        'timeline hydration must be marked received so Lampa does not echo it to CUB');
    assert.equal(env.timelineUpdates[0].updated, 2_000_075,
        'remote activity timestamp must remain authoritative during local hydration');
    assert.equal(env.storage[storageKey][recordKey].activity_at, 2_000_075,
        'synthetic timeline hydration must not create a newer Continue record');
}

{
    const env = harness({ androidPlatform: true, playerTorrent: 'android', androidTimelineRefresh: true });
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 7783, media_type: 'tv', title: 'Torrent native timeline refresh', original_name: 'Torrent native timeline refresh' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const torrentHash = 'native-torrent-7783';
    env.storage.torrserver_url = 'http://127.0.0.1:8090';
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'torrent', activity_at: 2_000_080,
            season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'native-torrent-e2',
            time: 210.125, duration: 3000, percent: 7, current_index: 1,
            torrent: {
                hash: torrentHash, index: 1,
                items: [
                    { file_id: 0, file_name: 'S01E01.mkv', title: 'E1', season: 1, episode: 1, hash: 'native-torrent-e1', meta: {} },
                    { file_id: 1, file_name: 'S01E02.mkv', title: 'E2', season: 1, episode: 2, hash: 'native-torrent-e2', meta: {} }
                ]
            }
        }
    };
    env.setActive(movie);
    env.api.launch();
    const launch = env.androidLaunches[0];
    assert.equal(launch.nativePositionMs, 210125,
        'torrent Continue must survive Lampa Android refreshing the active file timeline');
    assert.equal(env.timelineUpdates.length, 1,
        'torrent Continue must prime only the selected file timeline before native launch');
    assert.equal(env.timelineUpdates[0].hash, 'native-torrent-e2');
    assert.equal(env.timelineUpdates[0].received, true);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 7772, media_type: 'tv', title: 'Capture click fake zero', original_name: 'Capture click fake zero' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 2_000_050,
            season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'fake-zero-e2',
            time: 146, duration: 5401, percent: 3, current_index: 2,
            online: {
                index: 2,
                items: [
                    { title: '0 episode', direct_url: 'https://media.example/fake-zero.m3u8', meta: {} },
                    { title: 'E1', season: 1, episode: 1, hash: 'fake-zero-e1', direct_url: 'https://media.example/fake-zero-e1.m3u8', meta: {} },
                    { title: 'E2', season: 1, episode: 2, hash: 'fake-zero-e2', direct_url: 'https://media.example/fake-zero-e2.m3u8', meta: {} }
                ]
            }
        }
    };
    env.setActive(movie);
    const pointerListeners = env.listeners['window:pointerdown'] || [];
    const clickListeners = env.listeners['window:click'] || [];
    assert.ok(pointerListeners.length, 'plugin must install a window-level pointer handler before document competitors');
    assert.ok(clickListeners.length, 'plugin must install a window-level click handler before document competitors');
    const pointerStopped = { prevent: 0, propagation: 0, immediate: 0 };
    const pointerEvent = {
        pointerType: 'mouse',
        target: { closest(selector) { return selector === '.cw6-button' ? {} : null; } },
        preventDefault() { pointerStopped.prevent += 1; },
        stopPropagation() { pointerStopped.propagation += 1; },
        stopImmediatePropagation() { pointerStopped.immediate += 1; }
    };
    pointerListeners[pointerListeners.length - 1](pointerEvent);
    let competingPointerLaunches = 0;
    if (!pointerStopped.immediate) competingPointerLaunches += 1;
    assert.equal(competingPointerLaunches, 0,
        'window pointer capture must stop an earlier-registered document handler before it can open E1');
    assert.deepEqual(pointerStopped, { prevent: 1, propagation: 1, immediate: 1 });
    assert.equal(env.androidLaunches.length, 0, 'pointerdown must block competitors without launching before click');
    const stopped = { prevent: 0, propagation: 0, immediate: 0 };
    const clickEvent = {
        target: { closest(selector) { return selector === '.cw6-button' ? {} : null; } },
        preventDefault() { stopped.prevent += 1; },
        stopPropagation() { stopped.propagation += 1; },
        stopImmediatePropagation() { stopped.immediate += 1; }
    };
    clickListeners[clickListeners.length - 1](clickEvent);
    assert.deepEqual(stopped, { prevent: 1, propagation: 1, immediate: 1 });
    assert.equal(env.androidLaunches.length, 1, 'capture handler must launch exactly once');
    const payload = env.androidLaunches[0].parsed;
    assert.equal(payload.episode, 2);
    assert.equal(payload.playlist_index, 1, 'prepared window may omit the leading fake zero item');
    assert.equal(payload.playlist[payload.playlist_index].episode, 2);
    assert.equal(payload.time, 146);
    clickListeners[clickListeners.length - 1](clickEvent);
    assert.equal(env.androidLaunches.length, 1, 'a second capture click inside 800ms must not launch twice');
}

{
    const env = harness({ phone: true });
    const pointerListeners = env.listeners['window:pointerdown'] || [];
    const stopped = { prevent: 0, propagation: 0, immediate: 0 };
    const event = {
        pointerType: 'mouse',
        target: { closest(selector) { return selector === '.cw6-button' ? {} : null; } },
        preventDefault() { stopped.prevent += 1; },
        stopPropagation() { stopped.propagation += 1; },
        stopImmediatePropagation() { stopped.immediate += 1; }
    };
    pointerListeners.forEach((listener) => listener(event));
    assert.deepEqual(stopped, { prevent: 0, propagation: 0, immediate: 0 },
        'phone pointer events must remain untouched so tap UX is unchanged');
}

{
    const env = harness();
    const movie = { id: 7788, media_type: 'movie', title: 'Hot reload probe' };
    env.setActive(movie);
    const staleFullListener = (env.listeners.full || [])[0];
    assert.equal(typeof staleFullListener, 'function');
    assert.equal(env.activeIntervalCount(1800), 1);
    const reloaded = env.reloadPlugin('v6.2.11-hot-reload-probe');
    assert.equal(env.activeIntervalCount(1800), 1,
        'hot reload must retire the previous refresh loop before installing the new version');
    ['click', 'pointerdown', 'mousedown'].forEach((name) => {
        assert.equal((env.listeners['window:' + name] || []).length, 1,
            'hot reload must leave exactly one ' + name + ' capture handler');
        assert.equal((env.listeners['document:' + name] || []).length, 0,
            'current capture handlers must not share document with earlier competitors');
    });
    const stateKey = reloaded.testing.buttonStateKey(
        { id: 1, media_type: 'movie' },
        { activity_at: 1, source: 'online', timeline_hash: 'h' },
        { time: 1, percent: 1 }
    );
    assert.equal(stateKey, 'tmdb:movie:1|1|online|h|1|1',
        'the reloaded version must preserve the state key understood by v6.2.9');
    assert.equal(reloaded.testing.buttonOwnedByCurrentVersion({
        length: 1,
        attr(name) { return name === 'data-state' ? stateKey : (name === 'data-cw-owner-version' ? reloaded.version : undefined); }
    }, stateKey), true);
    staleFullListener({ data: { movie } });
    env.advance(500);
    assert.equal(env.pendingTimerCount(80), 0,
        'callbacks retained from the previous version must not schedule stale UI refreshes after hot reload');
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
    assert.deepEqual(calls.slice(1).map((entry) => entry.timeout), [15000, 15000, 15000]);
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
    assert.deepEqual(payload.playlist[1].segments, { skip: [{ start: 2, end: 6 }], ad: [] });
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
    h.fireTimeouts(15000);
    assert.equal(h.androidLaunches.length, before + 1, 'hard 15 s candidate deadline must release current exactly once');
    lateReady();
    assert.equal(requests, 1, 'a late handshake callback must not retry after the hard deadline');
    assert.equal(h.androidLaunches.length, before + 1, 'a late handshake callback must not duplicate or extend the launch');
    h.fireTimeouts(30000);
    assert.equal(h.androidLaunches.length, before + 1, 'cleared global deadline must not duplicate the launch');
    assert.deepEqual(h.androidLaunches[h.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
    h.setRequestHandler(null);
    h.setRchHook(null);
}

{
    const env = harness();
    seedDelayedOnline(env, 790);
    const startedAt = env.now();
    const requests = [];
    env.setRequestHandler(({ url, ok, timeout }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        requests.push({ episode, at: env.now() - startedAt, timeout });
        env.schedule(() => ok({
            url: 'https://media.example/d790-' + episode + '.m3u8',
            headers: { Referer: 'https://metadata.example/d790-' + episode }
        }), 12000);
    });
    env.api.launch();
    assert.equal(env.androidLaunches.length, 0);
    env.advance(11999);
    assert.equal(env.androidLaunches.length, 0, 'current resolver remains pending before 12 s');
    env.advance(1);
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2], 'E2 starts immediately after current resolves');
    assert.deepEqual(requests.map((entry) => entry.at), [0, 12000]);
    assert.deepEqual(requests.map((entry) => entry.timeout), [15000, 15000]);
    env.advance(11999);
    assert.equal(env.androidLaunches.length, 0, 'E2 remains pending before its 12 s response');
    env.advance(1);
    assert.equal(env.now() - startedAt, 24000);
    assert.equal(env.androidLaunches.length, 1, 'current@12 s plus E2@12 s launches once at 24 s');
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2], 'E3 must not start with only 6 s left');
    const payload = env.androidLaunches[0].parsed;
    assert.deepEqual(payload.playlist.map((item) => item.episode), [1, 2]);
    assert.equal(payload.playlist[1].headers.Referer, 'https://metadata.example/d790-2');
}

{
    const env = harness();
    seedDelayedOnline(env, 791);
    const startedAt = env.now();
    const requests = [];
    env.setRequestHandler(({ url, ok, timeout }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        requests.push({ episode, at: env.now() - startedAt, timeout });
        if (episode === 1) env.schedule(() => ok({ url: 'https://media.example/d791-1.m3u8' }), 12000);
    });
    env.api.launch();
    assert.deepEqual(requests.map((entry) => entry.episode), [1]);
    env.advance(12000);
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2]);
    env.advance(14999);
    assert.equal(env.androidLaunches.length, 0);
    env.advance(1);
    assert.equal(env.androidLaunches.length, 1, 'E2 candidate timeout must release current exactly once');
    assert.equal(env.now() - startedAt, 27000);
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2], 'timed-out E2 must stop contiguous resolution before E3');
    assert.deepEqual(env.androidLaunches[0].parsed.playlist.map((item) => item.episode), [1]);
}

{
    const env = harness();
    seedDelayedOnline(env, 792);
    const startedAt = env.now();
    const requests = [];
    let lateActive = true;
    let handshakeCalls = 0;
    env.setRchHook((_response, ready, isActive) => {
        handshakeCalls++;
        assert.equal(isActive(), true, 'RCH starts inside the candidate budget');
        env.schedule(() => {
            lateActive = isActive();
            ready();
        }, 5000);
        return true;
    });
    env.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        requests.push({ episode, at: env.now() - startedAt });
        if (episode === 1) env.schedule(() => ok({ url: 'https://media.example/d792-1.m3u8' }), 12000);
        else if (episode === 2) env.schedule(() => ok({ rch: true, nws: 'wss://lampac.fun/rch' }), 14000);
        else throw new Error('late RCH must not reach E3');
    });
    env.api.launch();
    env.advance(30000);
    assert.equal(env.androidLaunches.length, 1, 'candidate/global deadline path launches current once');
    assert.equal(handshakeCalls, 1);
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2]);
    assert.deepEqual(env.androidLaunches[0].parsed.playlist.map((item) => item.episode), [1]);
    env.advance(1000);
    assert.equal(lateActive, false, 'handshake callback after the absolute 30 s launch deadline is inactive');
    assert.equal(env.androidLaunches.length, 1, 'late RCH ready callback cannot duplicate or mutate launch');
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2], 'late RCH ready callback cannot retry');
}

{
    const env = harness();
    const seeded = seedDelayedOnline(env, 793);
    const startedAt = env.now();
    const savedRecord = env.storage.continue_watch_v6_7[seeded.recordKey];
    savedRecord.online.direct_url = 'https://media.example/d793-1-fallback.m3u8';
    savedRecord.online.items[0].direct_url = 'https://media.example/d793-1-fallback.m3u8';
    const requests = [];
    let currentOk;
    let episode2Ok;
    env.setRequestHandler(({ url, ok, timeout }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        requests.push({ episode, at: env.now() - startedAt, timeout });
        if (episode === 1) currentOk = ok;
        else if (episode === 2) episode2Ok = ok;
        else throw new Error('E3 must remain optional inside the final sub-15 s budget');
    });
    env.api.launch();
    env.setClock(startedAt + 15001);
    currentOk({ url: 'https://media.example/d793-1-too-late.m3u8' });
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2], 'mandatory E2 starts with the remaining 14999 ms');
    assert.equal(requests[1].timeout, 14999, 'E2 candidate is capped by the absolute launch deadline');
    assert.equal(env.androidLaunches.length, 0);
    env.setClock(startedAt + 29900);
    episode2Ok({ url: 'https://media.example/d793-2.m3u8' });
    assert.equal(env.androidLaunches.length, 1);
    assert.deepEqual(requests.map((entry) => entry.episode), [1, 2], 'optional E3 is not started with 100 ms remaining');
    assert.equal(env.androidLaunches[0].parsed.url, 'https://media.example/d793-1-fallback.m3u8');
    assert.deepEqual(env.androidLaunches[0].parsed.playlist.map((item) => item.episode), [1, 2]);
    env.setClock(startedAt + 31000);
    episode2Ok({ url: 'https://media.example/d793-2-late.m3u8' });
    env.advance(0);
    assert.equal(env.androidLaunches.length, 1, 'late duplicate E2 callback cannot relaunch or mutate the queue');
}

{
    const env = harness();
    const seeded = seedDelayedOnline(env, 794);
    const startedAt = env.now();
    const savedRecord = env.storage.continue_watch_v6_7[seeded.recordKey];
    savedRecord.online.direct_url = 'https://media.example/d794-1-fallback.m3u8';
    savedRecord.online.items[0].direct_url = 'https://media.example/d794-1-fallback.m3u8';
    const requests = [];
    let currentOk;
    env.setRequestHandler(({ url, ok }) => {
        requests.push(Number(new URL(url).searchParams.get('e')));
        currentOk = ok;
    });
    env.api.launch();
    env.setClock(startedAt + 30001);
    currentOk({ url: 'https://media.example/d794-1-after-deadline.m3u8' });
    assert.equal(env.androidLaunches.length, 1, 'stalled event loop must finalize the stored current fallback exactly once');
    assert.deepEqual(requests, [1], 'no neighbor starts at or after the absolute launch deadline');
    assert.equal(env.androidLaunches[0].parsed.url, 'https://media.example/d794-1-fallback.m3u8');
    assert.deepEqual(env.androidLaunches[0].parsed.playlist.map((item) => item.episode), [1]);
    currentOk({ rch: true, nws: 'wss://lampac.fun/rch' });
    env.advance(0);
    assert.equal(env.androidLaunches.length, 1, 'late success/RCH and delayed timer tasks cannot duplicate launch');
    assert.deepEqual(requests, [1]);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 800, media_type: 'tv', title: 'Lazy carried resolvers', original_name: 'Lazy carried resolvers' };
    const cardKey = h.api.testing.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const endpoint = (episode) => 'https://lampac.fun/lite/zetflix/video?id=800&s=1&e=' + episode + '&t=Original&account_email=private%40example.test&uid=private-uid&nws_id=private-nws';
    const currentUrl = 'https://media.example/lazy-800-e1.m3u8';
    const cells = [1, 2, 3].map((episode) => ({
        title: 'E' + episode,
        url: episode === 1 ? currentUrl : function lazyResolver() {},
        resolver_url: endpoint(episode),
        resolver_headers: { 'X-Kit-AesGcm': 'runtime-aes' },
        season: 1,
        episode,
        timeline: { hash: 'lazy-800-' + episode }
    }));
    const current = Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined });
    h.setActive(movie);
    h.setClock(4_000_000);
    h.Lampa.Player.play(current);
    const playlistCallCount = h.playlistCalls.length;
    h.Lampa.Player.playlist(cells);
    assert.equal(h.playlistCalls.length, playlistCallCount + 1, 'playlist wrapper must preserve the original Player.playlist call');
    assert.strictEqual(h.playlistCalls[h.playlistCalls.length - 1], cells, 'original playlist receives the unchanged input object');
    h.timelineListeners.forEach((listener) => listener({
        hash: 'lazy-800-1', road: { time: 150, duration: 3000, percent: 5, updated: 4_000_100 }
    }));
    const saved = h.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 3, 'lazy Online2 playlist must remain complete after timeline save');
    const portableE2 = new URL(saved.online.items[1].resolver_url);
    assert.equal(portableE2.pathname, '/lite/zetflix/video');
    assert.equal(portableE2.searchParams.get('e'), '2');
    assert.equal(portableE2.searchParams.get('t'), 'Original');
    assert.equal(portableE2.searchParams.has('account_email'), false);
    assert.equal(portableE2.searchParams.has('uid'), false);
    assert.equal(portableE2.searchParams.has('nws_id'), false);
    assert.deepEqual(saved.online.items[1].resolver_headers, {}, 'device AES must not be persisted in synchronized resolver metadata');
    assert.deepEqual(saved.online.items[1].selection, { provider: 'zetflix', translation: 'original' });

    const resolverCalls = [];
    h.storage.aesgcmkey = 'runtime-aes';
    h.setRequestHandler(({ url, ok, params }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        resolverCalls.push(episode);
        assert.equal(params.headers['X-Kit-AesGcm'], 'runtime-aes');
        ok({ url: 'https://media.example/lazy-800-e' + episode + '.m3u8' });
    });
    const before = h.androidLaunches.length;
    h.api.launch();
    assert.equal(h.androidLaunches.length, before + 1, 'carried lazy resolvers must produce one circular-safe Continue launch');
    assert.deepEqual(resolverCalls, [1, 2, 3]);
    const payload = h.androidLaunches[h.androidLaunches.length - 1].parsed;
    assert.deepEqual(payload.playlist.map((item) => item.episode), [1, 2, 3]);
    assert.doesNotThrow(() => JSON.stringify(payload));
    h.setRequestHandler(null);
    delete h.storage.aesgcmkey;
}

{
    ['stale', 'missing'].forEach((indexMode, caseIndex) => {
        const env = harness();
        const storageKey = 'continue_watch_v6_7';
        const movie = { id: 810 + caseIndex, media_type: 'tv', title: 'Internal switch ' + indexMode, original_name: 'Internal switch ' + indexMode };
        const cardKey = env.api.testing.cardKey(movie);
        const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
        const endpoint = (episode) => 'https://lampac.fun/lite/zetflix/video?id=' + movie.id + '&s=1&e=' + episode + '&t=Original';
        const media = (episode) => 'https://media.example/internal-' + indexMode + '-e' + episode + '.m3u8';
        const cells = [1, 2].map((episode) => ({
            title: 'E' + episode,
            url: episode === 1 ? media(episode) : function lazyResolver() {},
            resolver_url: endpoint(episode),
            season: 1,
            episode,
            timeline: { hash: 'internal-' + indexMode + '-e' + episode }
        }));

        env.setActive(movie);
        env.setClock(4_050_000 + caseIndex * 10_000);
        env.listeners.request_secuses.forEach((listener) => listener({
            params: { url: endpoint(1) }, data: { url: media(1) }
        }));
        env.Lampa.Player.play(Object.assign({}, cells[0], {
            card: movie, movie, isonline: true, playlist: cells, playlist_index: 0
        }));
        env.Lampa.Player.playlist(cells);
        env.timelineListeners.forEach((listener) => listener({
            hash: cells[0].timeline.hash,
            road: { time: 25, duration: 3000, percent: 1, updated: env.now() + 100 }
        }));

        env.listeners.request_secuses.forEach((listener) => listener({
            params: { url: endpoint(2) }, data: { url: media(2) }
        }));
        const next = Object.assign({}, cells[1], { url: media(2) });
        delete next.isonline;
        delete next.playlist;
        if (indexMode === 'stale') next.playlist_index = 0;
        else delete next.playlist_index;
        env.internalPlayerPlay(next);

        assert.equal(env.api.session().episode, 2,
            'an internal online E2 play with a ' + indexMode + ' numeric index must replace the E1 capture session');
        assert.equal(env.api.session().hash, cells[1].timeline.hash);
        assert.equal(env.api.session().url, media(2));
        assert.equal(new URL(env.api.session().resolver.url).searchParams.get('e'), '2',
            'the active capture session must retain the E2 resolver needed by HDVB Continue');

        env.timelineListeners.forEach((listener) => listener({
            hash: cells[1].timeline.hash,
            road: { time: 35, duration: 3000, percent: 1, updated: env.now() + 200 }
        }));
        const saved = env.storage[storageKey][recordKey];
        assert.equal(saved.episode, 2, 'the internal E2 switch must persist E2');
        assert.equal(saved.timeline_hash, cells[1].timeline.hash);
        assert.equal(saved.online.items[saved.current_index].episode, 2);

        const resolvedEpisodes = [];
        env.setRequestHandler(({ url, ok }) => {
            const episode = Number(new URL(url).searchParams.get('e'));
            resolvedEpisodes.push(episode);
            ok({ url: media(episode) + '?fresh=1' });
        });
        const before = env.androidLaunches.length;
        env.api.launch();
        assert.equal(resolvedEpisodes[0], 2, 'Continue must resolve E2 before any neighbor');
        assert.equal(env.androidLaunches.length, before + 1);
        assert.equal(env.androidLaunches[before].parsed.episode, 2);
        assert.equal(env.androidLaunches[before].parsed.url, media(2) + '?fresh=1');
    });
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 108978, media_type: 'tv', title: 'Sherlock', original_name: 'Sherlock' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = 'https://lampac.fun/lite/hdvb/video?id=108978&s=1&e=1&t=HDVB&token=hdvb-session-token';
    const media = 'https://media.example/sherlock-s1e1.m3u8';
    const episode = {
        title: 'S1 E1', url: media, season: 1, episode: 1,
        timeline: { hash: 'sherlock-108978-1' }
    };

    env.setActive(movie);
    env.listeners.request_secuses.forEach((listener) => listener({
        params: { url: resolver }, data: { url: media }
    }));
    env.Lampa.Player.play(Object.assign({}, episode, { card: movie, movie, isonline: true, playlist: [episode], playlist_index: 0 }));
    env.timelineListeners.forEach((listener) => listener({
        hash: 'sherlock-108978-1', road: { time: 343, duration: 5280, percent: 6, updated: 4_100_100 }
    }));

    const saved = env.storage[storageKey][recordKey];
    assert.equal(new URL(saved.online.resolver_url).searchParams.get('token'), 'hdvb-session-token',
        'same-device Sherlock resume must retain the HDVB resolver token locally');

    let resumeResolverUrl = '';
    env.setRequestHandler(({ url, ok, fail }) => {
        resumeResolverUrl = url;
        if (new URL(url).searchParams.get('token') !== 'hdvb-session-token') return fail();
        ok({ url: 'https://media.example/sherlock-s1e1-fresh.m3u8' });
    });
    env.api.launch();
    assert.equal(env.androidLaunches.length, 2,
        'direct Continue must resolve the saved HDVB episode into a fresh Android player link');
    assert.equal(env.androidLaunches[1].parsed.url, 'https://media.example/sherlock-s1e1-fresh.m3u8');
    assert.equal(env.androidLaunches[1].parsed.time, 343,
        'direct Continue must pass the saved Sherlock position to the resumed Android player');
    assert.equal(new URL(resumeResolverUrl).searchParams.get('token'), 'hdvb-session-token',
        'direct Continue must preserve the local HDVB provider token through Reguest.native');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 19885, media_type: 'tv', title: 'Sherlock', original_name: 'Sherlock' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = 'https://lampac.fun/lite/hdvb/video?id=19885&s=1&e=2&t=Dub&token=hdvb-e2-token';
    const responseMedia = 'https://lampac.fun/proxy/hdvb-response-e2.m3u8';
    const playerMedia = 'https://lampac.fun/proxy/hdvb-player-rewritten-e2.m3u8';
    const episode = {
        title: 'Этюд в розовых тонах', url: playerMedia, season: 1, episode: 2,
        timeline: { hash: 'sherlock-19885-2' }
    };

    env.setActive(movie);
    env.listeners.request_secuses.forEach((listener) => listener({
        params: { url: resolver }, data: { url: responseMedia }
    }));
    env.Lampa.Player.play(Object.assign({}, episode, {
        card: movie, movie, isonline: true, playlist: [episode], playlist_index: 0
    }));
    env.timelineListeners.forEach((listener) => listener({
        hash: 'sherlock-19885-2', road: { time: 277, duration: 5381, percent: 5, updated: 4_110_100 }
    }));

    const saved = env.storage[storageKey][recordKey];
    assert.equal(new URL(saved.online.resolver_url).searchParams.get('token'), 'hdvb-e2-token',
        'a same-card HDVB resolver must survive when the player rewrites the response media URL');

    env.setRequestHandler(({ url, ok, fail }) => {
        if (new URL(url).searchParams.get('token') !== 'hdvb-e2-token') return fail();
        ok({ url: 'https://media.example/sherlock-s1e2-fresh.m3u8' });
    });
    const before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(env.androidLaunches.length, before + 1,
        'direct Continue must resolve a rewritten HDVB playback URL through the fresh same-card resolver');
    assert.equal(env.androidLaunches[before].parsed.episode, 2);
    assert.equal(env.androidLaunches[before].parsed.time, 277);
}

{
    const env = harness();
    const movieA = { id: 111, media_type: 'tv', title: 'Late A', original_name: 'Late A' };
    const movieB = { id: 222, kinopoisk_id: 111, media_type: 'tv', title: 'Current B', original_name: 'Current B' };
    const resolverA = 'https://lampac.fun/lite/hdvb/video?id=111&s=1&e=2&t=Dub&token=late-a-token';
    env.setActive(movieB);
    env.listeners.request_secuses.forEach((listener) => listener({
        params: { url: resolverA }, data: { url: 'https://lampac.fun/proxy/late-a-response.m3u8' }
    }));
    env.Lampa.Player.play({
        card: movieB, movie: movieB, isonline: true, season: 1, episode: 2,
        title: 'B E2', url: 'https://lampac.fun/proxy/current-b-rewritten.m3u8',
        timeline: { hash: 'current-b-e2' }
    });
    env.timelineListeners.forEach((listener) => listener({
        hash: 'current-b-e2', road: { time: 90, duration: 1000, percent: 9, updated: 4_111_100 }
    }));
    const saved = env.api.record();
    assert.equal(saved.online.resolver_url, '',
        'a late response from card A must never become the rewritten-media resolver for card B');
}

{
    const env = harness();
    const movie = { id: 333, media_type: 'tv', title: 'Ambiguous voice', original_name: 'Ambiguous voice' };
    env.setActive(movie);
    ['MVO', 'DVO'].forEach((voice, index) => {
        env.setClock(4_112_000 + index);
        env.listeners.request_secuses.forEach((listener) => listener({
            params: { url: 'https://lampac.fun/lite/hdvb/video?id=333&s=1&e=2&t=' + voice + '&token=' + voice.toLowerCase() },
            data: { url: 'https://lampac.fun/proxy/voice-' + voice.toLowerCase() + '.m3u8' }
        }));
    });
    env.Lampa.Player.play({
        card: movie, movie: movie, isonline: true, season: 1, episode: 2,
        title: 'E2', url: 'https://lampac.fun/proxy/ambiguous-rewritten.m3u8',
        timeline: { hash: 'ambiguous-e2' }
    });
    env.timelineListeners.forEach((listener) => listener({
        hash: 'ambiguous-e2', road: { time: 91, duration: 1000, percent: 9, updated: 4_112_100 }
    }));
    assert.equal(env.api.record().online.resolver_url, '',
        'rewritten media without a voice selection must fail closed when multiple fresh translations match');
}

{
    const env = harness();
    const movie = { id: 444, media_type: 'tv', title: 'Expired resolver', original_name: 'Expired resolver' };
    env.setActive(movie);
    env.setClock(4_113_000);
    env.listeners.request_secuses.forEach((listener) => listener({
        params: { url: 'https://lampac.fun/lite/hdvb/video?id=444&s=1&e=2&t=Dub&token=expired-token' },
        data: { url: 'https://lampac.fun/proxy/expired-response.m3u8' }
    }));
    env.setClock(4_129_001);
    env.Lampa.Player.play({
        card: movie, movie: movie, isonline: true, season: 1, episode: 2,
        title: 'E2', url: 'https://lampac.fun/proxy/expired-rewritten.m3u8',
        timeline: { hash: 'expired-e2' }
    });
    env.timelineListeners.forEach((listener) => listener({
        hash: 'expired-e2', road: { time: 92, duration: 1000, percent: 9, updated: 4_129_100 }
    }));
    assert.equal(env.api.record().online.resolver_url, '',
        'the card-scoped rewritten-media fallback must reject resolver captures older than 15 seconds');
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 801, media_type: 'tv', title: 'Unsupported resolver schema', original_name: 'Unsupported resolver schema' };
    const cardKey = h.api.testing.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const endpoint = (episode) => 'https://lampac.fun/lite/zetflix/movie?id=801&s=1&e=' + episode + '&t=Original';
    const currentUrl = 'https://media.example/lazy-801-e1.m3u8';
    const cells = [
        {
            title: 'E1', url: currentUrl, resolver_url: endpoint(1), resolver_headers: { 'X-Kit-AesGcm': 'runtime-aes' },
            season: 1, episode: 1, timeline: { hash: 'lazy-801-1' }
        },
        {
            title: 'E2', url: function lazyResolver() {},
            resolver_url: 'https://user:password@lampac.fun/lite/zetflix/video?id=other&s=1&e=2&t=Fox+Life',
            season: 1, episode: 2, timeline: { hash: 'lazy-801-2' }
        },
        { title: 'E3', url: function lazyResolver() {}, season: 1, episode: 3, timeline: { hash: 'lazy-801-3' } }
    ];
    h.setActive(movie);
    h.setClock(4_100_000);
    h.listeners.request_secuses[0]({
        params: { url: endpoint(1), headers: { 'X-Kit-AesGcm': 'runtime-aes' } },
        data: { url: currentUrl }
    });
    h.Lampa.Player.play(Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined }));
    h.Lampa.Player.playlist(cells);
    h.timelineListeners.forEach((listener) => listener({
        hash: 'lazy-801-1', road: { time: 160, duration: 3000, percent: 5, updated: 4_100_100 }
    }));
    const saved = h.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 3);
    assert.equal(saved.online.items[1].resolver_url, '', 'userinfo/mismatched explicit resolver must fail closed');
    assert.equal(saved.online.items[2].resolver_url, '', 'unsupported current schema must not synthesize a missing neighbor resolver');

    const resolverCalls = [];
    h.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        resolverCalls.push(episode);
        if (episode !== 1) throw new Error('non-synthetic movie resolver must stop before E2/E3 network calls');
        ok({ url: 'https://media.example/lazy-801-e1.m3u8' });
    });
    const before = h.androidLaunches.length;
    h.api.launch();
    assert.equal(h.androidLaunches.length, before + 1);
    assert.deepEqual(resolverCalls, [1]);
    assert.deepEqual(h.androidLaunches[h.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
    h.setRequestHandler(null);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 803, media_type: 'tv', title: 'Built-in Lampac lazy playlist', original_name: 'Built-in Lampac lazy playlist' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const currentUrl = 'https://media.example/builtin-803-e1.m3u8';
    const sourceResolver = 'https://lampac.fun/lite/zetflix/video?id=803&s=1&e=1&t=Original&Account_Email=source%40example.test&UID=source-device&NwS_Id=source-rch';
    let lazyCalls = 0;
    const cells = Array.from({ length: 10 }, (_value, index) => {
        const episode = index + 1;
        return {
            title: 'E' + episode,
            url: episode === 1 ? currentUrl : function lazyResolver() { lazyCalls++; throw new Error('lazy resolver must not be invoked'); },
            season: 1,
            episode,
            timeline: { hash: 'builtin-803-' + episode }
        };
    });
    env.setActive(movie);
    env.setClock(4_150_000);
    env.listeners.request_secuses[0]({
        params: { url: sourceResolver, headers: { 'X-Kit-AesGcm': 'source-device-aes' } },
        data: { url: currentUrl }
    });
    env.Lampa.Player.play(Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined }));
    env.Lampa.Player.playlist(cells);
    env.timelineListeners.forEach((listener) => listener({
        hash: 'builtin-803-1', road: { time: 165, duration: 3000, percent: 6, updated: 4_150_100 }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(lazyCalls, 0, 'playlist capture must never execute built-in lazy URL functions');
    assert.equal(saved.online.items.length, 10);
    saved.online.items.forEach((item, index) => {
        const resolver = new URL(item.resolver_url);
        assert.equal(resolver.pathname, '/lite/zetflix/video');
        assert.equal(resolver.searchParams.get('id'), '803');
        assert.equal(resolver.searchParams.get('s'), '1');
        assert.equal(resolver.searchParams.get('e'), String(index + 1));
        assert.equal(resolver.searchParams.get('t'), 'Original');
        const normalizedKeys = Array.from(resolver.searchParams.keys()).map((key) => key.toLowerCase());
        assert.equal(normalizedKeys.includes('account_email'), false);
        assert.equal(normalizedKeys.includes('uid'), false);
        assert.equal(normalizedKeys.includes('nws_id'), false);
        assert.deepEqual(item.selection, { provider: 'zetflix', translation: 'original' });
        assert.deepEqual(item.resolver_headers, {}, 'source-device AES must not cross synchronized storage');
    });

    env.storage.account_email = 'target@example.test';
    env.storage.lampac_unic_id = 'target-device';
    env.storage.lampac_nws_id = 'stale-target-rch';
    const resolverCalls = [];
    let expectedAes = '';
    env.setRequestHandler(({ url, ok, params }) => {
        const resolver = new URL(url);
        resolverCalls.push(Number(resolver.searchParams.get('e')));
        const normalizedKeys = Array.from(resolver.searchParams.keys()).map((key) => key.toLowerCase());
        assert.equal(resolver.searchParams.get('account_email'), 'target@example.test');
        assert.equal(resolver.searchParams.get('uid'), 'target-device');
        assert.equal(resolver.searchParams.get('nws_id'), 'live-rch-session');
        assert.equal(normalizedKeys.filter((key) => key === 'account_email').length, 1);
        assert.equal(normalizedKeys.filter((key) => key === 'uid').length, 1);
        assert.equal(normalizedKeys.filter((key) => key === 'nws_id').length, 1);
        const aesKeys = Object.keys(params.headers).filter((key) => key.toLowerCase() === 'x-kit-aesgcm');
        assert.equal(aesKeys.length, expectedAes ? 1 : 0);
        if (expectedAes) assert.equal(params.headers[aesKeys[0]], expectedAes);
        ok({ url: 'https://media.example/builtin-803-e' + resolver.searchParams.get('e') + '.m3u8' });
    });
    delete env.storage.aesgcmkey;
    let before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(env.androidLaunches.length, before + 1);
    assert.deepEqual(resolverCalls, [1, 2, 3]);
    assert.deepEqual(env.androidLaunches[env.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1, 2, 3]);
    expectedAes = 'target-device-aes';
    env.storage.aesgcmkey = expectedAes;
    before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(env.androidLaunches.length, before + 1);
    assert.deepEqual(resolverCalls, [1, 2, 3, 1, 2, 3]);
    assert.equal(lazyCalls, 0);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 804, media_type: 'tv', title: 'No-base carried validation', original_name: 'No-base carried validation' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const currentUrl = 'https://media.example/no-base-804-e1.m3u8';
    const currentResolver = 'https://lampac.fun/lite/zetflix/video?id=804&s=1&e=1&t=Original';
    const cells = [
        { title: 'E1', url: currentUrl, resolver_url: currentResolver, season: 1, episode: 1, timeline: { hash: 'no-base-804-1' } },
        {
            title: 'E2', url: function lazyResolver() {},
            resolver_url: 'https://evil.example/lite/attacker/video?t=Original',
            season: 1, episode: 2, timeline: { hash: 'no-base-804-2' }
        }
    ];
    env.setActive(movie);
    env.setClock(4_175_000);
    env.Lampa.Player.play(Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined }));
    env.Lampa.Player.playlist(cells);
    env.timelineListeners.forEach((listener) => listener({
        hash: 'no-base-804-1', road: { time: 120, duration: 3000, percent: 4, updated: 4_175_100 }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.online.items[1].resolver_url, '', 'no-base carried resolver without stable identity and coordinates must fail closed');
    const requestedHosts = [];
    env.setRequestHandler(({ url, ok }) => {
        const parsed = new URL(url);
        requestedHosts.push(parsed.host);
        assert.equal(parsed.host, 'lampac.fun', 'the rejected carried host must never be requested');
        ok({ url: 'https://media.example/no-base-804-e1.m3u8' });
    });
    env.api.launch();
    assert.deepEqual(requestedHosts, ['lampac.fun']);
    assert.deepEqual(env.androidLaunches[env.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 805, media_type: 'tv', title: 'Legacy resolver secret migration', original_name: 'Legacy resolver secret migration' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const legacyResolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=805&s=1&e=' + episode + '&t=Original&ACCOUNT_EMAIL=source%40example.test&Uid=source-device&nWs_Id=source-rch';
    const items = Array.from({ length: 10 }, (_value, index) => ({
        title: 'E' + (index + 1), season: 1, episode: index + 1, hash: 'legacy-805-' + (index + 1),
        resolver_url: legacyResolver(index + 1),
        resolver_headers: { 'x-KIT-aESgCm': 'source-device-aes', 'X-Series': String(index + 1) },
        selection: { provider: 'zetflix', translation: 'original' }, meta: {}
    }));
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 4_180_000,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'legacy-805-1',
        time: 100, duration: 3000, percent: 3, current_index: 0,
        online: {
            index: 0, resolver_url: legacyResolver(1),
            resolver_headers: { 'X-Kit-AesGcm': 'source-device-aes', 'X-Series': 'top' },
            selection: { provider: 'zetflix', translation: 'original' }, items
        }
    };
    env.setActive(movie);
    env.setClock(4_180_100);
    const calls = [];
    env.setRequestHandler(({ url, ok, params }) => {
        const parsed = new URL(url);
        const episode = Number(parsed.searchParams.get('e'));
        calls.push(episode);
        assert.equal(Array.from(parsed.searchParams.keys()).some((key) => ['account_email', 'uid'].includes(key.toLowerCase())), false);
        assert.equal(Object.keys(params.headers).some((key) => key.toLowerCase() === 'x-kit-aesgcm'), false);
        ok({ url: 'https://media.example/legacy-805-e' + episode + '.m3u8' });
    });
    env.api.launch();
    assert.deepEqual(calls, [1, 2, 3]);
    env.timelineListeners.forEach((listener) => listener({
        hash: 'legacy-805-1', road: { time: 180, duration: 3000, percent: 6, updated: 4_180_200 }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 10, 'a partial runtime window must preserve the full stored definition list');
    [saved.online].concat(saved.online.items).forEach((entry) => {
        const parsed = new URL(entry.resolver_url);
        const normalizedKeys = Array.from(parsed.searchParams.keys()).map((key) => key.toLowerCase());
        assert.equal(normalizedKeys.some((key) => key === 'account_email' || key === 'uid' || key === 'nws_id'), false);
        assert.equal(Object.keys(entry.resolver_headers || {}).some((key) => key.toLowerCase() === 'x-kit-aesgcm'), false);
    });
    assert.equal(saved.online.items[9].resolver_headers['X-Series'], '10', 'non-device resolver headers must survive migration');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movieA = { id: 9910, media_type: 'tv', title: 'Resolver owner A', original_name: 'Resolver owner A' };
    const movieB = { id: 9911, media_type: 'tv', title: 'Resolver owner B', original_name: 'Resolver owner B' };
    const sharedMediaUrl = 'https://media.example/shared-cross-card.m3u8';
    env.setClock(4_190_000);
    env.setActive(movieA);
    env.listeners.request_secuses[0]({
        params: { url: 'https://lampac.fun/lite/zetflix/video?id=9910&s=1&e=1&t=Original', headers: {} },
        data: { url: sharedMediaUrl }
    });

    const cells = [
        { title: 'B E1', url: sharedMediaUrl, season: 1, episode: 1, timeline: { hash: 'cross-card-9911-1' } },
        { title: 'B E2', url: function lazyResolver() {}, season: 1, episode: 2, timeline: { hash: 'cross-card-9911-2' } }
    ];
    env.setClock(4_190_100);
    env.setActive(movieB);
    env.Lampa.Player.play(Object.assign({}, cells[0], { card: movieB, movie: movieB, isonline: true, playlist: undefined }));
    env.Lampa.Player.playlist(cells);
    assert.equal(env.api.session().resolver, null, 'a captured resolver bound to card A must not attach to card B sharing the same media URL');
    env.timelineListeners.forEach((listener) => listener({
        hash: 'cross-card-9911-1', road: { time: 130, duration: 3000, percent: 4, updated: 4_190_200 }
    }));
    const recordKey = 'c_' + env.Lampa.Utils.hash(env.api.testing.cardKey(movieB));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 2);
    assert.equal(saved.online.items[0].resolver_url, '');
    assert.equal(saved.online.items[1].resolver_url, '', 'card B must not synthesize E2 from card A identity');
    let requests = 0;
    env.setRequestHandler(() => { requests++; throw new Error('cross-card captured resolver must never be requested'); });
    const before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(requests, 0);
    assert.equal(env.androidLaunches.length, before + 1);
    assert.deepEqual(env.androidLaunches[env.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
}

{
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 802, media_type: 'tv', title: 'Canonical split playlist', original_name: 'Canonical split playlist' };
    const cardKey = h.api.testing.cardKey(movie);
    const recordKey = 'c_' + h.Lampa.Utils.hash(cardKey);
    const currentUrl = 'https://media.example/canonical-802-e1.m3u8';
    const cells = Array.from({ length: 10 }, (_value, index) => {
        const episode = index + 1;
        return {
            title: 'E' + episode,
            url: episode === 1 ? currentUrl : function lazyResolver() {},
            resolver_url: 'https://lampac.fun/lite/zetflix/video?id=802&s=1&e=' + episode + '&t=Original',
            resolver_headers: { 'X-Kit-AesGcm': 'runtime-aes' },
            season: 1,
            episode,
            timeline: { hash: 'canonical-802-' + episode }
        };
    });
    assert.equal(h.storage[storageKey][recordKey], undefined, 'canonical split regression starts with an empty card record');
    h.setActive(movie);
    h.setClock(4_200_000);
    h.Lampa.Player.play(Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined }));
    h.Lampa.Player.playlist(cells);
    h.timelineListeners.forEach((listener) => listener({
        hash: 'canonical-802-1', road: { time: 170, duration: 3000, percent: 6, updated: 4_200_100 }
    }));
    const saved = h.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 10, 'play(E1) followed by playlist(E1..E10) must hydrate the current session');
    assert.equal(saved.current_index, 0);
    assert.equal(saved.online.index, 0);
    assert.equal(saved.timeline_hash, 'canonical-802-1');
    assert.equal(saved.online.items[0].hash, 'canonical-802-1');
    assert.equal(saved.online.items[9].episode, 10);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const outboxKey = 'continue_watch_v6_outbox_7';
    const movie = { id: 809, media_type: 'tv', title: 'Outbox equal-time richness', original_name: 'Outbox equal-time richness' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=809&s=1&e=' + episode + '&t=Original';
    const activityAt = 4_900_100;
    const cells = Array.from({ length: 10 }, (_value, index) => {
        const episode = index + 1;
        return {
            title: 'E' + episode, url: episode === 1 ? 'https://media.example/outbox-809-e1.m3u8' : function lazyResolver() {},
            resolver_url: resolver(episode), season: 1, episode, timeline: { hash: 'outbox-809-' + episode }
        };
    });
    env.setActive(movie);
    env.setClock(activityAt);
    env.Lampa.Player.play(Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined }));
    env.Lampa.Player.playlist(cells);
    env.timelineListeners.forEach((listener) => listener({
        hash: 'outbox-809-1', road: { time: 140, duration: 3000, percent: 5, updated: activityAt }
    }));
    const rich = JSON.parse(JSON.stringify(env.storage[storageKey][recordKey]));
    assert.equal(rich.online.items.length, 10);
    assert.equal(JSON.parse(env.local[outboxKey])[recordKey].online.items.length, 10);

    const poor = JSON.parse(JSON.stringify(rich));
    poor.online.items = poor.online.items.slice(0, 1);
    env.storage[storageKey][recordKey] = poor;
    assert.equal(env.storage[storageKey][recordKey].online.items.length, 1, 'remote synchronization may expose the equal-time poor snapshot before flush');
    env.fireTimeouts(6500);
    assert.equal(env.storage[storageKey][recordKey].online.items.length, 10, 'equal-time rich outbox must repair a poorer compatible synchronized record');
    assert.equal(JSON.parse(env.local[outboxKey])[recordKey].online.items.length, 10, 'the rich outbox snapshot must survive the merge');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 810, media_type: 'tv', title: 'Deferred reconcile race', original_name: 'Deferred reconcile race' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const originalResolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=810&s=1&e=' + episode + '&t=Original';
    const activityAt = 5_000_100;
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 5_000_000,
        season: 1, episode: 1, episode_title: 'Old E1', timeline_hash: 'race-810-1',
        time: 60, duration: 3000, percent: 2, current_index: 0,
        online: {
            index: 0, resolver_url: originalResolver(1),
            selection: { provider: 'zetflix', translation: 'original' },
            items: [{
                title: 'Old E1', season: 1, episode: 1, hash: 'race-810-1',
                resolver_url: originalResolver(1),
                selection: { provider: 'zetflix', translation: 'original' }, meta: {}
            }]
        }
    };
    env.roads['race-810-1'] = { time: 180, duration: 3000, percent: 6, updated: activityAt };
    env.setActive(movie);
    env.setClock(activityAt);
    const reconciled = env.api.record();
    assert.equal(reconciled.activity_at, activityAt, 'getRecord must expose the newer timeline before its deferred save');
    assert.equal(reconciled.online.items.length, 1, 'the deferred reconcile snapshot intentionally remains the old one-item playlist');

    const currentUrl = 'https://media.example/race-810-e1.m3u8';
    const cells = Array.from({ length: 10 }, (_value, index) => {
        const episode = index + 1;
        return {
            title: 'E' + episode,
            url: episode === 1 ? currentUrl : function lazyResolver() {},
            resolver_url: originalResolver(episode),
            resolver_headers: { 'X-Kit-AesGcm': 'runtime-aes' },
            season: 1,
            episode,
            timeline: { hash: 'race-810-' + episode }
        };
    });
    env.Lampa.Player.play(Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined }));
    env.Lampa.Player.playlist(cells);
    env.timelineListeners.forEach((listener) => listener({ hash: 'race-810-1', road: env.roads['race-810-1'] }));
    let saved = env.storage[storageKey][recordKey];
    assert.equal(saved.activity_at, activityAt);
    assert.equal(saved.online.items.length, 10, 'the canonical playlist wins before the deferred stale callback runs');
    assert.equal(new URL(saved.online.items[1].resolver_url).searchParams.get('e'), '2');

    env.advance(0);
    saved = env.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 10, 'equal-time deferred one-item reconcile must not overwrite the richer compatible playlist');
    assert.equal(saved.time, 180);
    assert.equal(saved.current_index, 0);
    assert.equal(saved.online.index, 0);
    assert.equal(saved.timeline_hash, 'race-810-1');
    assert.equal(new URL(saved.online.items[1].resolver_url).searchParams.get('e'), '2');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 811, media_type: 'tv', title: 'Torrent richness upgrade', original_name: 'Torrent richness upgrade' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const torrentHash = 'torrent-811';
    const activityAt = 6_000_100;
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'torrent', activity_at: activityAt,
        season: 1, episode: 1, episode_title: 'Old E1', timeline_hash: 'torrent-811-1',
        time: 100, duration: 3000, percent: 3, current_index: 0,
        torrent: {
            hash: torrentHash, magnet: 'magnet:?xt=urn:btih:' + torrentHash, index: 0,
            items: [{ file_id: 0, file_name: 'S01E01.mkv', title: 'Old E1', season: 1, episode: 1, hash: 'torrent-811-1', meta: {} }]
        }
    };
    const cells = Array.from({ length: 10 }, (_value, index) => {
        const episode = index + 1;
        return {
            title: 'E' + episode,
            file_name: 'S01E' + String(episode).padStart(2, '0') + '.mkv',
            url: 'http://127.0.0.1:8090/stream/S01E' + String(episode).padStart(2, '0') + '.mkv?link=' + torrentHash + '&index=' + index + '&play',
            torrent_hash: torrentHash,
            season: 1,
            episode,
            timeline: { hash: 'torrent-811-' + episode }
        };
    });
    env.setActive(movie);
    env.setClock(activityAt);
    env.Lampa.Player.play({
        card: movie, movie, url: cells[0].url, torrent_hash: torrentHash,
        playlist: cells, playlist_index: 0, timeline: { hash: 'torrent-811-1' }
    });
    env.timelineListeners.forEach((listener) => listener({
        hash: 'torrent-811-1', road: { time: 200, duration: 3000, percent: 7, updated: activityAt }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.activity_at, activityAt);
    assert.equal(saved.torrent.items.length, 10, 'an equal-time compatible torrent upgrade from one item to ten must be accepted');
    assert.equal(saved.torrent.hash, torrentHash);
    assert.equal(saved.torrent.index, 0);
    assert.equal(saved.torrent.items[9].episode, 10);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 812, media_type: 'tv', title: 'Selection conflict', original_name: 'Selection conflict' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const originalResolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=812&s=1&e=' + episode + '&t=Original';
    const foxResolver = 'https://lampac.fun/lite/zetflix/video?id=812&s=1&e=1&t=Fox+Life';
    const activityAt = 7_000_100;
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: activityAt,
        season: 1, episode: 1, episode_title: 'Original E1', timeline_hash: 'selection-812-1',
        time: 100, duration: 3000, percent: 3, current_index: 0,
        online: {
            index: 0, resolver_url: originalResolver(1),
            selection: { provider: 'zetflix', translation: 'original' },
            items: Array.from({ length: 10 }, (_value, index) => ({
                title: 'Original E' + (index + 1), season: 1, episode: index + 1, hash: 'original-812-' + (index + 1),
                resolver_url: originalResolver(index + 1),
                selection: { provider: 'zetflix', translation: 'original' }, meta: {}
            }))
        }
    };
    const currentUrl = 'https://media.example/selection-812-fox-e1.m3u8';
    const foxItem = {
        title: 'Fox E1', url: currentUrl, resolver_url: foxResolver,
        resolver_headers: { 'X-Kit-AesGcm': 'fox-runtime-aes' },
        season: 1, episode: 1, timeline: { hash: 'selection-812-1' }
    };
    env.setActive(movie);
    env.setClock(activityAt);
    env.Lampa.Player.play(Object.assign({}, foxItem, { card: movie, movie, isonline: true, playlist: [foxItem], playlist_index: 0 }));
    env.timelineListeners.forEach((listener) => listener({
        hash: 'selection-812-1', road: { time: 220, duration: 3000, percent: 7, updated: activityAt }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.online.items.length, 1, 'a different active translation must not inherit the richer stored translation playlist');
    assert.deepEqual(saved.online.items[0].selection, { provider: 'zetflix', translation: 'fox life' });
    assert.equal(new URL(saved.online.items[0].resolver_url).searchParams.get('t'), 'Fox Life');
    assert.equal(saved.online.items.some((item) => item.selection && item.selection.translation === 'original'), false);
    assert.equal(saved.online.items.some((item) => /^Original E/.test(item.title)), false);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 813, media_type: 'tv', title: 'Equal-time episode switch', original_name: 'Equal-time episode switch' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const torrentHash = 'torrent-813';
    const activityAt = 7_100_100;
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'torrent', activity_at: activityAt,
        season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'torrent-813-1',
        time: 100, duration: 3000, percent: 3, current_index: 0,
        torrent: {
            hash: torrentHash, magnet: 'magnet:?xt=urn:btih:' + torrentHash, index: 0,
            items: Array.from({ length: 10 }, (_value, index) => ({
                file_id: index, file_name: 'S01E' + String(index + 1).padStart(2, '0') + '.mkv',
                title: 'E' + (index + 1), season: 1, episode: index + 1, hash: 'torrent-813-' + (index + 1), meta: {}
            }))
        }
    };
    const current = {
        card: movie, movie, title: 'E2', file_name: 'S01E02.mkv',
        url: 'http://127.0.0.1:8090/stream/S01E02.mkv?link=' + torrentHash + '&index=1&play',
        torrent_hash: torrentHash, season: 1, episode: 2,
        timeline: { hash: 'torrent-813-2' }
    };
    env.setActive(movie);
    env.setClock(activityAt);
    env.Lampa.Player.play(Object.assign({}, current, { playlist: [current], playlist_index: 0 }));
    env.timelineListeners.forEach((listener) => listener({
        hash: 'torrent-813-2', road: { time: 15, duration: 3000, percent: 1, updated: activityAt }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.torrent.items.length, 1, 'a real episode switch at the same timestamp must not be mistaken for a stale richness downgrade');
    assert.equal(saved.episode, 2);
    assert.equal(saved.timeline_hash, 'torrent-813-2');
    assert.equal(saved.torrent.items[0].hash, 'torrent-813-2');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 9920, media_type: 'tv', title: 'Captured movie resolver', original_name: 'Captured movie resolver' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const currentUrl = 'https://lampac.fun/proxy/captured-9920-e1.m3u8';
    const currentResolver = 'https://lampac.fun/lite/provider/movie?id=9920&s=1&e=1&t=Original';
    const cells = [
        { title: 'E1', url: currentUrl, season: 1, episode: 1, timeline: { hash: 'captured-9920-1' } },
        { title: 'E2', url: function lazyResolver() {}, season: 1, episode: 2, timeline: { hash: 'captured-9920-2' } }
    ];
    env.setActive(movie);
    env.setClock(7_150_000);
    env.listeners.request_secuses[0]({ params: { url: currentResolver, headers: {} }, data: { url: currentUrl } });
    env.Lampa.Player.play(Object.assign({}, cells[0], { card: movie, movie, isonline: true, playlist: undefined }));
    env.Lampa.Player.playlist(cells);
    env.timelineListeners.forEach((listener) => listener({
        hash: 'captured-9920-1', road: { time: 90, duration: 3000, percent: 3, updated: 7_150_100 }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.online.direct_url, '', 'transient current URL must not become the fallback');
    assert.equal(new URL(saved.online.resolver_url).pathname, '/lite/provider/movie');
    assert.equal(new URL(saved.online.items[0].resolver_url).pathname, '/lite/provider/movie');
    assert.equal(saved.online.items[1].resolver_url, '', 'movie endpoint remains ineligible for neighbor synthesis');
    const calls = [];
    env.setRequestHandler(({ url, ok }) => {
        calls.push(Number(new URL(url).searchParams.get('e')));
        ok({ url: 'https://media.example/captured-9920-e1.m3u8' });
    });
    const before = env.androidLaunches.length;
    env.api.launch();
    assert.deepEqual(calls, [1], 'valid card-bound non-synthetic current resolver must still be requested');
    assert.equal(env.androidLaunches.length, before + 1);
    assert.deepEqual(env.androidLaunches[env.androidLaunches.length - 1].parsed.playlist.map((item) => item.episode), [1]);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 814, media_type: 'tv', title: 'GOT internal episode switch', original_name: 'Game of Thrones' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=814&s=1&e=' + episode + '&t=Fox+Life';
    const selection = { provider: 'zetflix', translation: 'fox life' };
    const defs = Array.from({ length: 10 }, (_value, index) => ({
        title: index ? 'Episode ' + (index + 1) : 'Winter Is Coming',
        season: 1, episode: index + 1, hash: 'got-switch-814-' + (index + 1),
        resolver_url: resolver(index + 1), selection, meta: {}
    }));
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 7_200_000,
        season: 1, episode: 1, episode_title: 'Winter Is Coming', timeline_hash: 'got-switch-814-1',
        time: 25, duration: 3600, percent: 1, current_index: 0,
        online: { index: 0, resolver_url: resolver(1), selection, items: defs }
    };
    env.setActive(movie);
    env.setClock(7_200_100);
    const resolverCalls = [];
    env.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        resolverCalls.push(episode);
        ok({ url: 'https://media.example/got-switch-814-e' + episode + '.m3u8' });
    });
    env.api.launch();
    assert.deepEqual(resolverCalls, [1, 2, 3]);
    resolverCalls.length = 0;

    env.timelineListeners.forEach((listener) => listener({
        hash: 'got-switch-814-2', road: { time: 30, duration: 3600, percent: 1, updated: 7_200_200 }
    }));
    env.timelineListeners.forEach((listener) => listener({
        hash: 'got-switch-814-2', road: { time: 42, duration: 3600, percent: 1, updated: 7_200_300 }
    }));
    const saved = env.storage[storageKey][recordKey];
    assert.equal(saved.season, 1);
    assert.equal(saved.episode, 2);
    assert.equal(saved.time, 42);
    assert.equal(saved.timeline_hash, 'got-switch-814-2');
    assert.equal(saved.current_index, 1, 'timeline E2 must map to the full definition index instead of stale session E1');
    assert.equal(saved.online.index, 1);
    assert.equal(new URL(saved.online.resolver_url).searchParams.get('e'), '2', 'top resolver must follow the active E2 descriptor');
    assert.equal(new URL(saved.online.items[1].resolver_url).searchParams.get('e'), '2');

    const before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(resolverCalls[0], 2, 'repeat Continue must resolve E2 first, never stale E1');
    assert.equal(env.androidLaunches.length, before + 1);
    const payload = env.androidLaunches[env.androidLaunches.length - 1].parsed;
    assert.equal(payload.episode, 2);
    assert.equal(payload.time, 42);
    assert.equal(payload.playlist[payload.playlist_index].episode, 2);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 815, media_type: 'tv', title: 'Corrupt online index migration', original_name: 'Corrupt online index migration' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=815&s=1&e=' + episode + '&t=Fox+Life';
    const items = [1, 2, 3].map((episode) => ({
        title: 'E' + episode, season: 1, episode, hash: 'corrupt-815-' + episode,
        resolver_url: resolver(episode), selection: { provider: 'zetflix', translation: 'fox life' }, meta: {}
    }));
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 7_300_000,
        season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'corrupt-815-2',
        time: 42, duration: 3600, percent: 1, current_index: 0,
        online: {
            index: 0, resolver_url: resolver(1), selection: { provider: 'zetflix', translation: 'fox life' }, items
        }
    };
    env.setActive(movie);
    const calls = [];
    env.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        calls.push(episode);
        ok({ url: 'https://media.example/corrupt-815-e' + episode + '.m3u8' });
    });
    env.api.launch();
    assert.equal(calls[0], 2, 'timeline hash must migrate a stale numeric index to E2 before resolver selection');
    const payload = env.androidLaunches[env.androidLaunches.length - 1].parsed;
    assert.equal(payload.episode, 2);
    assert.equal(payload.time, 42);
    assert.equal(payload.playlist[payload.playlist_index].episode, 2);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 819, media_type: 'tv', title: 'Resolver-owned episode index', original_name: 'Resolver-owned episode index' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/zetflix/video?id=819&s=1&e=' + episode + '&t=Original';
    const selection = { provider: 'zetflix', translation: 'original' };
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 7_305_000,
            season: 1, episode: 2, episode_title: 'E2 title', timeline_hash: 'runtime-e2-hash',
            time: 44, duration: 3430, percent: 1, current_index: 0,
            online: {
                index: 0, resolver_url: resolver(1), selection,
                items: [
                    { title: 'E1 title', season: 0, episode: 0, hash: 'opaque-e1', resolver_url: resolver(1), selection, meta: {} },
                    { title: 'E2 title', season: 0, episode: 0, hash: 'opaque-e2', resolver_url: resolver(2), selection, meta: {} }
                ]
            }
        }
    };
    env.setActive(movie);
    const calls = [];
    env.setRequestHandler(({ url, ok }) => {
        const episode = Number(new URL(url).searchParams.get('e'));
        calls.push(episode);
        ok({ url: 'https://media.example/resolver-owned-e' + episode + '.m3u8' });
    });
    env.api.launch();
    assert.equal(calls[0], 2,
        'resolver coordinates must recover E2 when saved numeric indices and item coordinates are stale');
    const payload = env.androidLaunches[env.androidLaunches.length - 1].parsed;
    assert.equal(payload.episode, 2);
    assert.equal(payload.title, 'E2 title');
    assert.equal(payload.url, 'https://media.example/resolver-owned-e2.m3u8');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 820, media_type: 'tv', title: 'Resolver selection index', original_name: 'Resolver selection index' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (voice) => 'https://lampac.fun/lite/zetflix/video?id=820&s=1&e=2&t=' + encodeURIComponent(voice);
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 7_306_000,
            season: 1, episode: 2, episode_title: 'E2 Original', timeline_hash: 'selection-e2',
            time: 45, duration: 3400, percent: 1, current_index: 0,
            online: {
                index: 0, selection: { provider: 'zetflix', translation: 'original' },
                items: [
                    { title: 'E2 Fox', resolver_url: resolver('Fox Life'), selection: { provider: 'zetflix', translation: 'fox life' }, meta: {} },
                    { title: 'E2 Original', resolver_url: resolver('Original'), selection: { provider: 'zetflix', translation: 'original' }, meta: {} }
                ]
            }
        }
    };
    env.setActive(movie);
    const translations = [];
    env.setRequestHandler(({ url, ok }) => {
        translations.push(new URL(url).searchParams.get('t'));
        ok({ url: 'https://media.example/selection-e2.m3u8' });
    });
    env.api.launch();
    assert.equal(translations[0], 'Original',
        'resolver-coordinate recovery must retain the saved translation while sharing progress');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 821, media_type: 'tv', title: 'Ambiguous resolver index', original_name: 'Ambiguous resolver index' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (voice) => 'https://lampac.fun/lite/zetflix/video?id=821&s=1&e=2&t=' + encodeURIComponent(voice);
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 7_307_000,
            season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'ambiguous-e2',
            time: 46, duration: 3400, percent: 1, current_index: 0,
            online: {
                index: 0,
                items: [
                    { title: 'E2 Fox', resolver_url: resolver('Fox Life'), selection: {}, meta: {} },
                    { title: 'E2 Original', resolver_url: resolver('Original'), selection: {}, meta: {} }
                ]
            }
        }
    };
    env.setActive(movie);
    let requests = 0;
    env.setRequestHandler(() => { requests += 1; });
    const before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(requests, 0, 'different translations with no saved selection must fail closed');
    assert.equal(env.androidLaunches.length, before);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 822, media_type: 'tv', title: 'Episode title resolver rebuild', original_name: 'Episode title resolver rebuild' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolver = (episode) => 'https://lampac.fun/lite/hdvb/video?id=822&s=1&e=' + episode + '&t=Dub';
    const selection = { provider: 'hdvb', translation: 'dub' };
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 7_308_000,
            season: 1, episode: 2, episode_title: 'The second episode', timeline_hash: 'runtime-second-hash',
            time: 127, duration: 3430, percent: 4, current_index: 0,
            online: {
                index: 0, resolver_url: resolver(1), selection,
                items: [
                    { title: 'The first episode', hash: 'opaque-first', resolver_url: resolver(1), selection, meta: {} },
                    { title: 'The second episode', hash: 'opaque-second', resolver_url: '', selection, meta: {} }
                ]
            }
        }
    };
    env.setActive(movie);
    const episodes = [];
    env.setRequestHandler(({ url, ok }) => {
        episodes.push(Number(new URL(url).searchParams.get('e')));
        ok({ url: 'https://media.example/title-rebuild-e2.m3u8' });
    });
    env.api.launch();
    assert.equal(episodes[0], 2,
        'a same-movie selected resolver may be rebuilt from E1 to the uniquely titled saved E2');
    const payload = env.androidLaunches[env.androidLaunches.length - 1].parsed;
    assert.equal(payload.episode, 2);
    assert.equal(payload.title, 'The second episode');
    assert.equal(payload.url, 'https://media.example/title-rebuild-e2.m3u8');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 824, media_type: 'tv', title: 'Resolver rebuild voice mismatch', original_name: 'Resolver rebuild voice mismatch' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 7_308_500,
            season: 1, episode: 2, episode_title: 'E2 Original', timeline_hash: 'voice-mismatch-e2',
            time: 75, duration: 3000, percent: 3, current_index: 0,
            online: {
                index: 0,
                resolver_url: 'https://lampac.fun/lite/hdvb/video?id=824&s=1&e=1&t=Fox',
                selection: { provider: 'hdvb', translation: 'fox' },
                items: [
                    { title: 'E1 Fox' },
                    { title: 'E2 Original', selection: { provider: 'hdvb', translation: 'original' } }
                ]
            }
        }
    };
    env.setActive(movie);
    let requests = 0;
    env.setRequestHandler(() => { requests += 1; });
    const before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(requests, 0, 'an E1 Fox resolver must not be rebuilt for an E2 Original selection');
    assert.equal(env.androidLaunches.length, before);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 823, media_type: 'tv', title: 'Foreign resolver rejection', original_name: 'Foreign resolver rejection' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    env.storage[storageKey] = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'online', activity_at: 7_309_000,
            season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'foreign-e2',
            time: 60, duration: 3000, percent: 2, current_index: 0,
            online: {
                index: 0,
                resolver_url: 'https://lampac.fun/lite/hdvb/video?id=999999&s=1&e=1&t=Dub',
                selection: { provider: 'hdvb', translation: 'dub' },
                items: [{ title: 'E1' }, { title: 'E2' }]
            }
        }
    };
    env.setActive(movie);
    let requests = 0;
    env.setRequestHandler(() => { requests += 1; });
    const before = env.androidLaunches.length;
    env.api.launch();
    assert.equal(requests, 0, 'a resolver belonging to another movie must never be rebuilt for E2');
    assert.equal(env.androidLaunches.length, before);
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 816, media_type: 'tv', title: 'Mismatched current resolver', original_name: 'Mismatched current resolver' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolverE1 = 'https://lampac.fun/lite/zetflix/video?id=816&s=1&e=1&t=Fox+Life';
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 7_310_000,
        season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'mismatch-816-2',
        time: 42, duration: 3600, percent: 1, current_index: 0,
        online: {
            index: 0, resolver_url: resolverE1, selection: { provider: 'zetflix', translation: 'fox life' },
            items: [
                { title: 'E1', season: 1, episode: 1, hash: 'mismatch-816-1', resolver_url: resolverE1, selection: { provider: 'zetflix', translation: 'fox life' }, meta: {} },
                { title: 'E2', season: 1, episode: 2, hash: 'mismatch-816-2', resolver_url: resolverE1, selection: { provider: 'zetflix', translation: 'fox life' }, meta: {} }
            ]
        }
    };
    env.setActive(movie);
    let requests = 0;
    env.setRequestHandler(() => { requests++; throw new Error('E1 resolver must not be used for active E2'); });
    env.api.launch();
    assert.equal(requests, 0, 'mismatched item and top resolver coordinates must fail closed');
    assert.equal(env.androidLaunches.length, 0, 'no stale E1 URL may be launched as E2');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 817, media_type: 'tv', title: 'Opaque top ownership', original_name: 'Opaque top ownership' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const selection = { provider: 'provider', translation: 'original' };
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 7_320_000,
        season: 1, episode: 2, episode_title: 'E2', timeline_hash: 'opaque-817-2',
        time: 42, duration: 3600, percent: 1, current_index: 0,
        online: {
            index: 0,
            resolver_url: 'https://lampac.fun/lite/provider/video?token=e1-only&t=Original',
            direct_url: 'https://media.example/opaque-817-e1-stale.m3u8',
            selection,
            items: [
                { title: 'E1', season: 1, episode: 1, hash: 'opaque-817-1', selection, meta: {} },
                { title: 'E2', season: 1, episode: 2, hash: 'opaque-817-2', selection, meta: {} }
            ]
        }
    };
    env.setActive(movie);
    let requests = 0;
    env.setRequestHandler(() => { requests++; throw new Error('stale opaque top resolver must not be requested'); });
    env.api.launch();
    assert.equal(requests, 0, 'migrated E2 cannot borrow an opaque resolver owned by saved index E1');
    assert.equal(env.androidLaunches.length, 0, 'migrated E2 cannot borrow stale top direct URL owned by E1');
}

{
    const env = harness();
    const storageKey = 'continue_watch_v6_7';
    const movie = { id: 818, media_type: 'tv', title: 'Active selection ownership', original_name: 'Active selection ownership' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const original = { provider: 'zetflix', translation: 'original' };
    const fox = { provider: 'zetflix', translation: 'fox life' };
    const resolver = (episode, voice) => 'https://lampac.fun/lite/zetflix/video?id=818&s=1&e=' + episode + '&t=' + encodeURIComponent(voice);
    env.storage[storageKey] = {};
    env.storage[storageKey][recordKey] = {
        v: 6, card_key: cardKey, source: 'online', activity_at: 7_330_000,
        season: 1, episode: 2, episode_title: 'E2 Fox', timeline_hash: 'selection-owner-818-2',
        time: 42, duration: 3600, percent: 1, current_index: 0,
        online: {
            index: 0, resolver_url: resolver(1, 'Original'), selection: original,
            items: [
                { title: 'E1 Original', season: 1, episode: 1, hash: 'selection-owner-818-1', resolver_url: resolver(1, 'Original'), selection: original, meta: {} },
                { title: 'E2 Fox', season: 1, episode: 2, hash: 'selection-owner-818-2', resolver_url: resolver(2, 'Fox Life'), selection: fox, meta: {} }
            ]
        }
    };
    env.setActive(movie);
    const calls = [];
    env.setRequestHandler(({ url, ok }) => {
        const parsed = new URL(url);
        calls.push({ episode: Number(parsed.searchParams.get('e')), translation: parsed.searchParams.get('t') });
        ok({ url: 'https://media.example/selection-owner-818-e2.m3u8' });
    });
    env.api.launch();
    assert.deepEqual(calls[0], { episode: 2, translation: 'Fox Life' }, 'active E2 selection must override stale top E1 selection after index migration');
    assert.equal(env.androidLaunches[0].parsed.episode, 2);
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

{
    const pathToken = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(pathToken.api.testing.discoverLampacToken(), 'arx.lamp');

    const queryToken = harness({ scripts: ['https://lampac.fun/sync.js?token=tol'] });
    assert.equal(queryToken.api.testing.discoverLampacToken(), 'tol');

    const changedToken = harness({ scripts: ['https://lampac.fun/sync/js/nast'] });
    changedToken.storage.account_email = 'viewer@example.test';
    changedToken.storage.lampac_unic_id = 'device-id';
    changedToken.storage.lampac_profile_id = 'family room';
    const requestsBeforeUrlHelpers = changedToken.requests.length;
    const getUrl = new URL(changedToken.api.testing.lampacStorageUrl('get'));
    const setUrl = new URL(changedToken.api.testing.lampacStorageUrl('set'));
    assert.equal(getUrl.protocol, 'https:');
    assert.equal(getUrl.host, 'lampac.fun');
    assert.equal(getUrl.pathname, '/storage/get');
    assert.equal(setUrl.pathname, '/storage/set');
    assert.equal(getUrl.searchParams.get('token'), 'nast');
    assert.equal(getUrl.searchParams.get('path'), 'continuewatch');
    assert.equal(getUrl.searchParams.get('pathfile'), 'continue_watch_v6');
    assert.equal(getUrl.searchParams.has('account_email'), false, 'storage sync must not expose the Lampa email');
    assert.equal(getUrl.searchParams.has('uid'), false, 'storage sync must not expose the device uid');
    assert.equal(getUrl.searchParams.has('profile_id'), false, 'the arbitrary key must not be split by an internal Lampac profile');
    changedToken.setScripts(['https://untrusted.example/sync/js/evil']);
    assert.equal(changedToken.api.testing.discoverLampacToken(), 'nast',
        'an untrusted URL must not replace the last validated Lampac key');
    assert.equal(changedToken.requests.length, requestsBeforeUrlHelpers, 'identity/URL helpers must not themselves make network requests');
    assert.equal(changedToken.storageSyncCalls(), 0);
}

{
    const persisted = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(persisted.api.testing.discoverLampacToken(), 'arx.lamp');
    persisted.setScripts([]);
    assert.equal(persisted.api.testing.discoverLampacToken(), 'arx.lamp',
        'the last validated Lampac key must survive startup pruning of the temporary plugin entry');
    persisted.setScripts(['https://lampac.fun/sync/js/tol']);
    assert.equal(persisted.api.testing.discoverLampacToken(), 'tol',
        'a newly configured arbitrary Lampac key must replace the persisted key');
    persisted.setScripts([]);
    assert.equal(persisted.api.testing.discoverLampacToken(), 'tol');
}

{
    const rebooted = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(rebooted.api.testing.discoverLampacToken(), 'arx.lamp');
    rebooted.setScripts([]);
    rebooted.storage.plugins = [];
    rebooted.storage.account_plugins = [];
    rebooted.setRequestHandler(({ post, ok }) => ok(post ? { success: true } : { success: true, data: '' }));
    const beforeReload = rebooted.requests.length;
    rebooted.reloadPlugin('v6.2.13-reload-probe');
    assert.ok(rebooted.requests.slice(beforeReload).some((request) =>
        !request.post && new URL(request.url).searchParams.get('token') === 'arx.lamp'),
    'a fresh plugin boot must contact Lampac with the persisted key even after both registries and script tags were pruned');
}

{
    const privateInit = harness({ scripts: ['https://lampac.fun/privateinit.js?account_email=&uid=device-id'] });
    assert.equal(privateInit.api.testing.discoverLampacToken(), '',
        'Lampac device uid must not be reused as a storage synchronization key');
    assert.equal(privateInit.requests.length, 0,
        'private-init device identity alone must not enable the ContinueWatching storage lifecycle');
    const invc = harness({ scripts: ['https://lampac.fun/invc-ws.js?uid=device-id&token=arx.lamp'] });
    assert.equal(invc.api.testing.discoverLampacToken(), 'arx.lamp',
        'an explicit token on the exact Lampac websocket bootstrap URL may expose the configured key');
    const childSync = harness({ scripts: ['https://lampac.fun/timecode/js/nast'] });
    assert.equal(childSync.api.testing.discoverLampacToken(), 'nast',
        'Lampac timecode/bookmark child scripts must retain the explicit synchronization key');
    const untrusted = harness({ scripts: [
        'https://untrusted.example/invc-ws.js?uid=evil',
        'https://lampac.fun/lite/hdvb/video?uid=provider-secret'
    ] });
    assert.equal(untrusted.api.testing.discoverLampacToken(), '',
        'generic provider and foreign uid parameters must never become storage synchronization keys');
}

{
    const accountRegistry = harness();
    accountRegistry.storage.account_plugins = [{ url: 'https://lampac.fun/sync/js/tol', status: 1 }];
    assert.equal(accountRegistry.api.testing.discoverLampacToken(), 'tol',
        'enabled account plugins must participate in key discovery');
    const runtimeRegistry = harness({ pluginLoaded: ['https://lampac.fun/sync/js/nast'] });
    assert.equal(runtimeRegistry.api.testing.discoverLampacToken(), 'nast',
        'the runtime loaded-plugin list must cover cached inline plugin execution without script.src');
}

{
    const disabled = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(disabled.api.testing.discoverLampacToken(), 'arx.lamp');
    disabled.setLocalStorageErrors({ remove: true });
    disabled.storage.plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 0 }];
    assert.equal(disabled.api.testing.discoverLampacToken(), '',
        'an explicitly disabled key must veto runtime/cache fallback and clear the remembered identity');
    disabled.storage.plugins = [];
    assert.equal(disabled.api.testing.discoverLampacToken(), '',
        'a disabled key must not revive after the disabled registry row disappears');
    disabled.storage.plugins = [
        { url: 'https://lampac.fun/sync/js/arx.lamp', status: 0 },
        { url: 'https://lampac.fun/sync/js/nast', status: 1 }
    ];
    assert.equal(disabled.api.testing.discoverLampacToken(), 'nast',
        'an enabled replacement key must win while the previous key remains explicitly disabled');
}

{
    const removeFailure = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(removeFailure.api.testing.discoverLampacToken(), 'arx.lamp');
    removeFailure.setLocalStorageErrors({ remove: true });
    removeFailure.storage.plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 0 }];
    assert.equal(removeFailure.api.testing.discoverLampacToken(), '');
    removeFailure.setScripts([]);
    removeFailure.storage.plugins = [];
    const reloaded = removeFailure.reloadPlugin('v6.2.13-remove-failure-reload');
    assert.equal(reloaded.testing.discoverLampacToken(), '',
        'a disabled key must remain revoked after reload even when localStorage.removeItem fails');
    assert.equal(removeFailure.storageSyncCalls(), 0,
        'persisting the local Lampac token revocation must not invoke CUB synchronization');
}

{
    const getFailure = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(getFailure.api.testing.discoverLampacToken(), 'arx.lamp');
    getFailure.setLocalStorageErrors({ get: true });
    getFailure.storage.plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 0 }];
    assert.equal(getFailure.api.testing.discoverLampacToken(), '');
    getFailure.setScripts([]);
    getFailure.storage.plugins = [];
    getFailure.setLocalStorageErrors({});
    const reloaded = getFailure.reloadPlugin('v6.2.13-get-failure-reload');
    assert.equal(reloaded.testing.discoverLampacToken(), '',
        'a transient localStorage.getItem failure must not prevent durable revocation of the known key');
}

{
    const changed = harness({
        scripts: ['https://lampac.fun/sync/js/arx.lamp'],
        pluginLoaded: ['https://lampac.fun/sync/js/arx.lamp'],
        pluginAwaits: ['https://lampac.fun/sync/js/arx.lamp'],
        pluginGet: [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 1 }]
    });
    assert.equal(changed.api.testing.discoverLampacToken(), 'arx.lamp');
    changed.storage.plugins = [{ url: 'https://lampac.fun/sync/js/tol', status: 1 }];
    assert.equal(changed.api.testing.discoverLampacToken(), 'tol',
        'the newly configured local key must beat stale awaits/loaded/DOM entries');
    changed.storage.plugins.push({ url: 'https://lampac.fun/sync/js/nast', status: 1 });
    assert.equal(changed.api.testing.discoverLampacToken(), 'nast',
        'the most recently configured arbitrary key must win among enabled local entries');
    changed.storage.plugins = [];
    assert.equal(changed.api.testing.discoverLampacToken(), '',
        'removing the active replacement key must disable sync instead of reviving a stale runtime key');
    assert.equal(changed.api.testing.discoverLampacToken(), '');
}

{
    const multiple = harness({
        scripts: [
            'https://lampac.fun/timecode/js/arx.lamp',
            'https://lampac.fun/bookmark/js/tol'
        ]
    });
    multiple.storage.plugins = [
        { url: 'https://lampac.fun/sync/js/arx.lamp', status: 1 },
        { url: 'https://lampac.fun/sync/js/tol', status: 1 }
    ];
    assert.equal(multiple.api.testing.discoverLampacToken(), 'tol');
    multiple.storage.plugins = [];
    assert.equal(multiple.api.testing.discoverLampacToken(), '');
    assert.equal(multiple.api.testing.discoverLampacToken(), '',
        'removing multiple configured keys must revoke every stale child/runtime candidate, not only the selected key');
}

{
    const removed = harness();
    removed.storage.plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 1 }];
    assert.equal(removed.api.testing.discoverLampacToken(), 'arx.lamp');
    removed.storage.plugins = [];
    assert.equal(removed.api.testing.discoverLampacToken(), '',
        'removing a key after this runtime observed it must revoke the in-memory and persistent identity');
    assert.equal(removed.api.testing.discoverLampacToken(), '');
}

{
    const storageFailure = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(storageFailure.api.testing.discoverLampacToken(), 'arx.lamp');
    storageFailure.setLocalStorageErrors({ set: true });
    storageFailure.setScripts(['https://lampac.fun/sync/js/tol']);
    assert.equal(storageFailure.api.testing.discoverLampacToken(), 'tol');
    storageFailure.setScripts([]);
    assert.equal(storageFailure.api.testing.discoverLampacToken(), 'tol',
        'an in-memory validated switch must not fall back to the old key when localStorage set fails');
    const reloaded = storageFailure.reloadPlugin('v6.2.13-set-failure-reload');
    assert.equal(reloaded.testing.discoverLampacToken(), '',
        'after a failed replacement write, reload must fail closed instead of reviving the superseded cached key');
}

{
    const loggedOut = harness({ accountAccess: false });
    loggedOut.storage.account_plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 1 }];
    assert.equal(loggedOut.api.testing.discoverLampacToken(), '',
        'a stale account_plugins cache must not reactivate sync after account logout');
}

{
    const accountLogout = harness();
    accountLogout.storage.account_plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 1 }];
    assert.equal(accountLogout.api.testing.discoverLampacToken(), 'arx.lamp');
    accountLogout.setAccountAccess(false);
    assert.equal(accountLogout.api.testing.discoverLampacToken(), '',
        'an account-scoped key must be forgotten immediately when the active account logs out');
}

{
    const accountPrivacy = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    assert.equal(accountPrivacy.api.testing.discoverLampacToken(), 'arx.lamp');
    accountPrivacy.setScripts([]);
    accountPrivacy.storage.account_plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 1 }];
    accountPrivacy.setLocalStorageErrors({ remove: true });
    assert.equal(accountPrivacy.api.testing.discoverLampacToken(), 'arx.lamp');
    const cacheRecord = JSON.parse(accountPrivacy.local.continue_watch_v6_lampac_token);
    assert.equal(cacheRecord.disabled, true);
    assert.equal(cacheRecord.token, '',
        'an account-scoped key must leave only a token-free tombstone when raw cache removal is blocked');
    assert.equal((accountPrivacy.storage.continue_watch_v6_lampac_token_veto || []).includes('arx.lamp'), false,
        'an account-scoped key must not be persisted in the local veto registry');
    accountPrivacy.setAccountAccess(false);
    accountPrivacy.storage.account_plugins = [];
    const reloaded = accountPrivacy.reloadPlugin('v6.2.13-account-privacy-reload');
    assert.equal(reloaded.testing.discoverLampacToken(), '',
        'the token-free tombstone must prevent account-key revival after logout and reload');
}

{
    const accountStaleRuntime = harness({
        scripts: ['https://lampac.fun/timecode/js/arx.lamp'],
        pluginLoaded: ['https://lampac.fun/bookmark/js/arx.lamp']
    });
    accountStaleRuntime.storage.account_plugins = [{ url: 'https://lampac.fun/sync/js/arx.lamp', status: 1 }];
    assert.equal(accountStaleRuntime.api.testing.discoverLampacToken(), 'arx.lamp');
    accountStaleRuntime.setAccountAccess(false);
    accountStaleRuntime.storage.account_plugins = [];
    assert.equal(accountStaleRuntime.api.testing.discoverLampacToken(), '');
    const reloaded = accountStaleRuntime.reloadPlugin('v6.2.13-account-stale-runtime-reload');
    assert.equal(reloaded.testing.discoverLampacToken(), '',
        'logout must keep stale account child/runtime URLs blocked after plugin reload without persisting the account key');
    accountStaleRuntime.storage.plugins = [{ url: 'https://lampac.fun/sync/js/tol', status: 1 }];
    assert.equal(reloaded.testing.discoverLampacToken(), 'tol',
        'an explicit new local configuration must clear the account tombstone and enable its arbitrary key');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    env.storage.lampac_profile_id = 'lampac-profile';
    env.setAccountProfile('account-profile');
    assert.equal(env.api.testing.storageKey(), 'continue_watch_v6_account-profile', 'the active account profile must select the local store before the Lampac fallback');
    env.setAccountProfile(null);
    assert.equal(env.api.testing.storageKey(), 'continue_watch_v6_lampac-profile', 'lampac_profile_id must be used when the active account has no profile');
    delete env.storage.lampac_profile_id;
    assert.equal(env.api.testing.storageKey(), 'continue_watch_v6_default', 'default must be used when neither active nor Lampac profile is available');
}

{
    const phone = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    phone.setAccountProfile('phone-account-profile');
    const browser = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    browser.setAccountProfile(null);
    const phoneUrl = new URL(phone.api.testing.lampacStorageUrl('get'));
    const browserUrl = new URL(browser.api.testing.lampacStorageUrl('get'));
    assert.equal(phoneUrl.searchParams.get('pathfile'), 'continue_watch_v6',
        'the shared Lampac key must not be split by the phone Lampa account profile');
    assert.equal(browserUrl.searchParams.get('pathfile'), 'continue_watch_v6',
        'a fresh browser using the same Lampac key must address the same remote document');
    assert.equal(phoneUrl.searchParams.has('profile_id'), false);
    assert.equal(browserUrl.searchParams.has('profile_id'), false);
    assert.notEqual(phone.api.testing.storageKey(), browser.api.testing.storageKey(),
        'local stores remain isolated even though the Lampac key selects one shared remote namespace');
}

{
    const env = harness();
    env.setRequestHandler(({ post, ok }) => ok(post ? { success: true } : { success: false, msg: 'outFile' }));
    assert.equal(env.requests.length, 0, 'remote sync is disabled before a Lampac key script exists');
    env.setScripts(['https://lampac.fun/sync/js/arx.lamp']);
    env.fireIntervals(1800);
    assert.ok(env.requests.some((request) => !request.post && new URL(request.url).pathname === '/storage/get'),
        'adding a Lampac key script after plugin install must automatically trigger a remote GET');
    assert.ok(env.requests.some((request) => request.post && new URL(request.url).pathname === '/storage/set'),
        'a missing key-selected document must then be initialized with a JSON POST');
}

{
    const env = harness();
    env.setRequestHandler(({ post, ok }) => ok(post ? { success: true } : { success: false, msg: 'outFile' }));
    assert.equal(env.requests.length, 0, 'remote sync is disabled before an enabled Lampac plugin is registered');
    env.storage.plugins = [{ url: 'https://lampac.fun/sync/js/tol', status: 1 }];
    env.fireIntervals(1800);
    const gets = env.requests.filter((request) => !request.post);
    const posts = env.requests.filter((request) => request.post);
    assert.ok(gets.some((request) => new URL(request.url).searchParams.get('token') === 'tol'),
        'an enabled Lampac key stored in the plugin registry must trigger a remote GET even without a script element');
    assert.ok(posts.some((request) => new URL(request.url).searchParams.get('token') === 'tol'),
        'a missing registry-key namespace must be repaired with a schema-1 POST');
    assert.equal(env.storageSyncCalls(), 0, 'registry discovery must not invoke CUB Storage.sync');
}

{
    const env = harness();
    env.setRequestHandler(({ ok }) => ok({ success: true, data: '' }));
    env.storage.plugins = [
        { url: 'https://lampac.fun/sync/js/missing-status' },
        { url: 'https://lampac.fun/sync/js/disabled', status: 0 }
    ];
    env.fireIntervals(1800);
    assert.equal(env.requests.length, 0,
        'object registry entries without an explicit enabled status must not activate remote sync');

    env.storage.plugins = ['https://lampac.fun/sync/js/legacy'];
    env.fireIntervals(1800);
    assert.ok(env.requests.some((request) => new URL(request.url).searchParams.get('token') === 'legacy'),
        'legacy string plugin entries remain enabled for compatibility with older Lampa storage');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    let stored = '';
    env.setRequestHandler(({ post, ok }) => {
        if (post) { stored = post; return ok({ success: true }); }
        return ok({ success: true, data: stored });
    });
    env.api.testing.syncRemote('repair-empty-file');
    const repaired = JSON.parse(stored);
    assert.equal(repaired.schema, 1, 'a zero-length Storage file must be repaired into a schema-1 document');
    assert.deepEqual(repaired.records, {});
}

function syncRecord(env, id, activityAt, itemCount) {
    const movie = { id, media_type: 'tv', title: 'Synced ' + id, original_name: 'Synced ' + id };
    const cardKey = env.api.testing.cardKey(movie);
    return {
        key: 'c_' + env.Lampa.Utils.hash(cardKey),
        movie,
        value: {
            v: 6, card_key: cardKey, source: 'online', activity_at: activityAt,
            season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'sync-' + id + '-1',
            time: 42, duration: 3000, percent: 2, current_index: 0,
            online: {
                index: 0,
                resolver_url: 'https://lampac.fun/lite/zetflix/video?id=' + id + '&s=1&e=1&t=Original',
                selection: { provider: 'zetflix', translation: 'original' },
                items: Array.from({ length: itemCount || 1 }, (_value, index) => ({
                    title: 'E' + (index + 1), season: 1, episode: index + 1, hash: 'sync-' + id + '-' + (index + 1),
                    resolver_url: 'https://lampac.fun/lite/zetflix/video?id=' + id + '&s=1&e=' + (index + 1) + '&t=Original',
                    selection: { provider: 'zetflix', translation: 'original' }, meta: {}
                }))
            }
        }
    };
}

{
    const env = harness({
        scripts: ['https://lampac.fun/sync/js/nast'],
        androidPlatform: true,
        player: 'android'
    });
    const local = syncRecord(env, 940, 3_400_000, 3);
    local.value.season = 1;
    local.value.episode = 2;
    local.value.episode_title = 'E2';
    local.value.timeline_hash = local.value.online.items[1].hash;
    local.value.time = 50.571;
    local.value.duration = 2880.405;
    local.value.percent = 1;
    local.value.current_index = 1;
    local.value.online.index = 1;
    local.value.online.resolver_url = local.value.online.items[1].resolver_url;
    env.storage.continue_watch_v6_7 = { [local.key]: JSON.parse(JSON.stringify(local.value)) };
    env.setActive(local.movie);

    const remote = JSON.parse(JSON.stringify(local.value));
    remote.activity_at = 3_400_100;
    remote.season = 1;
    remote.episode = 3;
    remote.episode_title = 'E3';
    remote.timeline_hash = remote.online.items[2].hash;
    remote.time = 92.272333;
    remote.percent = 3;
    remote.current_index = 2;
    remote.online.index = 2;
    remote.online.resolver_url = remote.online.items[2].resolver_url;
    let postCount = 0;
    let resolverCount = 0;
    let heldGet = null;
    env.setRequestHandler(({ url, post, ok }) => {
        if (post) {
            postCount += 1;
            return ok({ success: true });
        }
        if (new URL(url).pathname !== '/storage/get') {
            resolverCount += 1;
            return ok({ url: 'https://media.example/live-card-e3.m3u8' });
        }
        if (!heldGet) {
            heldGet = { ok };
            return;
        }
        return ok({
            schema: 1,
            updated_at: 3_400_100,
            records: { [local.key]: remote }
        });
    });

    const beforeOpen = env.requests.length;
    const fullListener = (env.listeners.full || [])[env.listeners.full.length - 1];
    fullListener({ type: 'start', data: { movie: local.movie } });
    const openRequests = env.requests.slice(beforeOpen);
    assert.equal(openRequests.filter((request) => !request.post).length, 1,
        'opening a card must immediately start a read-only Lampac freshness pull');
    assert.ok(heldGet, 'the card freshness GET must be observable while it is in flight');

    const clickListeners = env.listeners['window:click'] || [];
    const clickEvent = {
        target: { closest(selector) { return selector === '.cw6-button' ? {} : null; } },
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
    };
    clickListeners[clickListeners.length - 1](clickEvent);
    env.advance(1_000);
    clickListeners[clickListeners.length - 1](clickEvent);
    assert.equal(resolverCount, 0,
        'Continue must not resolve the stale local episode while the card pull is in flight');
    assert.equal(env.androidLaunches.length, 0,
        'Continue must wait for the in-flight Lampac response before launching');

    heldGet.ok({
        schema: 1,
        updated_at: 3_400_100,
        records: { [local.key]: remote }
    });
    assert.equal(postCount, 0,
        'a newer remote card record must not be written back during card hydration');
    assert.equal(env.api.record().episode, 3);
    assert.equal(env.api.record().current_index, 2);
    assert.equal(env.api.record().time, 92.272333,
        'the visible client must replace its stale local Continue position before launch');
    assert.ok(resolverCount > 0, 'the hydrated episode must resolve only after the remote response');
    assert.equal(env.androidLaunches.length, 1,
        'repeated Continue clicks during one freshness pull must produce exactly one launch');
    assert.equal(env.androidLaunches[0].parsed.episode, 3);
    assert.equal(env.androidLaunches[0].parsed.time, 92.272333);

    const afterStart = env.requests.length;
    fullListener({ type: 'build', data: { movie: local.movie } });
    fullListener({ type: 'complite', data: { movie: local.movie } });
    env.advance(650);
    assert.equal(env.requests.length, afterStart,
        'non-start full lifecycle events must not create a Lampac GET storm');
}

{
    const env = harness({
        scripts: ['https://lampac.fun/sync/js/arx.lamp'],
        androidPlatform: true,
        player: 'android'
    });
    const local = syncRecord(env, 947, 3_600_000, 2);
    env.storage.continue_watch_v6_7 = { [local.key]: JSON.parse(JSON.stringify(local.value)) };
    env.setActive(local.movie);
    const remoteTol = JSON.parse(JSON.stringify(local.value));
    remoteTol.activity_at = 3_600_100;
    remoteTol.episode = 2;
    remoteTol.episode_title = 'E2';
    remoteTol.timeline_hash = remoteTol.online.items[1].hash;
    remoteTol.time = 77;
    remoteTol.current_index = 1;
    remoteTol.online.index = 1;
    remoteTol.online.resolver_url = remoteTol.online.items[1].resolver_url;
    let heldArxGet = null;
    let tolGets = 0;
    env.setRequestHandler(({ url, post, ok }) => {
        if (post) return ok({ success: true });
        const parsed = new URL(url);
        if (parsed.pathname !== '/storage/get') return ok({ url: 'https://media.example/key-switch-e2.m3u8' });
        const token = parsed.searchParams.get('token');
        if (token === 'arx.lamp' && !heldArxGet) { heldArxGet = ok; return; }
        if (token === 'tol') {
            tolGets += 1;
            return ok({ schema: 1, updated_at: 3_600_100, records: { [local.key]: remoteTol } });
        }
        return ok({ schema: 1, updated_at: 0, records: {} });
    });
    const fullListener = (env.listeners.full || [])[env.listeners.full.length - 1];
    fullListener({ type: 'start', data: { movie: local.movie } });
    assert.ok(heldArxGet, 'the old-key card GET must be in flight before the key switch');
    const clickListeners = env.listeners['window:click'] || [];
    clickListeners[clickListeners.length - 1]({
        target: { closest(selector) { return selector === '.cw6-button' ? {} : null; } },
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
    });
    env.storage.plugins = [{ url: 'https://lampac.fun/sync/js/tol', status: 1 }];
    env.dispatchStorageChange('plugins');
    assert.ok(tolGets >= 1,
        'changing the Lampac key must immediately replace an obsolete in-flight card pull');
    assert.equal(env.androidLaunches.length, 1,
        'a Continue click waiting on the old key must resume from the newly selected key');
    assert.equal(env.androidLaunches[0].parsed.episode, 2);
    assert.equal(env.androidLaunches[0].parsed.time, 77);
    heldArxGet({ schema: 1, updated_at: 3_600_200, records: {} });
    assert.equal(env.androidLaunches.length, 1,
        'the eventual old-key response must not produce a second launch');
}

{
    const env = harness({
        scripts: ['https://lampac.fun/sync/js/nast'],
        androidPlatform: true,
        player: 'android'
    });
    const cardA = syncRecord(env, 948, 3_610_000, 1);
    const cardB = syncRecord(env, 949, 3_610_100, 1);
    env.storage.continue_watch_v6_7 = {
        [cardA.key]: JSON.parse(JSON.stringify(cardA.value)),
        [cardB.key]: JSON.parse(JSON.stringify(cardB.value))
    };
    env.setActive(cardA.movie);
    let heldGet = null;
    env.setRequestHandler(({ url, post, ok }) => {
        if (post) return ok({ success: true });
        if (new URL(url).pathname !== '/storage/get') return ok({ url: 'https://media.example/stale-card.m3u8' });
        if (!heldGet) { heldGet = ok; return; }
        return ok({ schema: 1, updated_at: 3_610_100, records: {} });
    });
    const fullListener = (env.listeners.full || [])[env.listeners.full.length - 1];
    fullListener({ type: 'start', data: { movie: cardA.movie } });
    const clickListeners = env.listeners['window:click'] || [];
    clickListeners[clickListeners.length - 1]({
        target: { closest(selector) { return selector === '.cw6-button' ? {} : null; } },
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
    });
    env.setActive(cardB.movie);
    fullListener({ type: 'start', data: { movie: cardB.movie } });
    heldGet({ schema: 1, updated_at: 3_610_100, records: {} });
    assert.equal(env.androidLaunches.length, 0,
        'a delayed freshness response must not launch a card the user has already left');
}

{
    const env = harness({
        scripts: ['https://lampac.fun/sync/js/nast'],
        androidPlatform: true,
        player: 'android'
    });
    const card = syncRecord(env, 950, 3_620_000, 1);
    env.storage.continue_watch_v6_7 = { [card.key]: JSON.parse(JSON.stringify(card.value)) };
    env.setActive(card.movie);
    let heldGet = null;
    env.setRequestHandler(({ url, post, ok }) => {
        if (post) return ok({ success: true });
        if (new URL(url).pathname !== '/storage/get') return ok({ url: 'https://media.example/left-card.m3u8' });
        if (!heldGet) { heldGet = ok; return; }
        return ok({ schema: 1, updated_at: 0, records: {} });
    });
    const fullListener = (env.listeners.full || [])[env.listeners.full.length - 1];
    fullListener({ type: 'start', data: { movie: card.movie } });
    const clickListeners = env.listeners['window:click'] || [];
    clickListeners[clickListeners.length - 1]({
        target: { closest(selector) { return selector === '.cw6-button' ? {} : null; } },
        preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {}
    });
    env.setActive(null);
    env.advance(8_000);
    assert.equal(env.androidLaunches.length, 0,
        'a freshness timeout must not launch after the user has left the card for the menu');
    heldGet({ schema: 1, updated_at: 3_620_100, records: {} });
    assert.equal(env.androidLaunches.length, 0,
        'a late response must remain inert after the user has left the card');
}

{
    const env = harness({ androidPlatform: true, playerTorrent: 'android' });
    const movie = { id: 951, media_type: 'tv', title: 'Stale timeline runtime', original_name: 'Stale timeline runtime' };
    const item = {
        torrent_hash: 'stale-runtime-torrent', file_name: 'S01E01.mkv', file_index: 0,
        season: 1, episode: 1,
        url: 'http://127.0.0.1:8090/stream/S01E01.mkv?link=stale-runtime-torrent&index=0&play',
        timeline: { hash: 'stale-runtime-e1', time: 0, duration: 3000, percent: 0 }
    };
    env.setActive(movie);
    env.Lampa.Player.play(Object.assign({}, item, {
        card: movie, movie, playlist: [item], playlist_index: 0
    }));
    const staleTimelineListener = env.timelineListeners[0];
    const pendingKey = 'continue_watch_v6_pending_7';
    const outboxKey = 'continue_watch_v6_outbox_7';
    const pendingBefore = env.local[pendingKey];
    const storeBefore = JSON.stringify(env.storage.continue_watch_v6_7 || {});
    const outboxBefore = env.local[outboxKey];
    env.reloadPlugin('v6.2.14-stale-timeline-probe');
    staleTimelineListener({
        hash: 'stale-runtime-e1',
        road: { time: 42, duration: 3000, percent: 1, updated: 3_630_100 }
    });
    env.advance(1_500);
    assert.equal(env.local[pendingKey], pendingBefore,
        'a Timeline listener retained from an old runtime must not append or clear pending progress');
    assert.equal(JSON.stringify(env.storage.continue_watch_v6_7 || {}), storeBefore,
        'a Timeline listener retained from an old runtime must not mutate the current local store');
    assert.equal(env.local[outboxKey], outboxBefore,
        'a Timeline listener retained from an old runtime must not mutate the current outbox');
}

{
    const env = harness({ androidPlatform: true, player: 'android' });
    const online = syncRecord(env, 952, 3_640_000, 1);
    env.storage.continue_watch_v6_7 = { [online.key]: JSON.parse(JSON.stringify(online.value)) };
    env.setActive(online.movie);
    let heldResolver = null;
    env.setRequestHandler(({ ok }) => { if (!heldResolver) heldResolver = ok; });
    env.api.launch();
    assert.ok(heldResolver, 'the old runtime online resolver must remain in flight for the reload regression');
    env.reloadPlugin('v6.2.14-stale-online-launch-probe');
    heldResolver({ url: 'https://media.example/stale-runtime-online.m3u8' });
    assert.equal(env.androidLaunches.length, 0,
        'an online resolver callback owned by the previous runtime must not open the player');
}

{
    const env = harness({ androidPlatform: true, playerTorrent: 'android' });
    const movie = { id: 953, media_type: 'tv', title: 'Stale torrent launch', original_name: 'Stale torrent launch' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    env.storage.continue_watch_v6_7 = {
        [recordKey]: {
            v: 6, card_key: cardKey, source: 'torrent', activity_at: 3_650_000,
            season: 1, episode: 1, episode_title: 'E1', timeline_hash: 'stale-torrent-e1',
            time: 60, duration: 3000, percent: 2, current_index: 0,
            torrent: {
                hash: 'saved-stale-hash', magnet: 'magnet:?xt=urn:btih:stale-runtime', index: 0,
                items: [{
                    file_id: 0, file_name: 'S01E01.mkv', title: 'E1', season: 1, episode: 1,
                    hash: 'stale-torrent-e1', meta: {}
                }]
            }
        }
    };
    let heldHash = null;
    env.Lampa.Torserver = {
        hash(_params, ok) { heldHash = ok; },
        stream(fileName, hash, fileId) { return 'http://127.0.0.1:8090/stream/' + fileName + '?link=' + hash + '&index=' + fileId; },
        toPlayUrl(url) { return url; }
    };
    env.setActive(movie);
    env.api.launch();
    assert.ok(heldHash, 'the old runtime torrent hash resolver must remain in flight for the reload regression');
    env.reloadPlugin('v6.2.14-stale-torrent-launch-probe');
    heldHash({ hash: 'resolved-stale-hash' });
    assert.equal(env.androidLaunches.length, 0,
        'a torrent hash callback owned by the previous runtime must not open the player');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
    const local = syncRecord(env, 944, 9_000_000, 2);
    local.value.episode = 2;
    local.value.time = 240;
    local.value.current_index = 1;
    local.value.online.index = 1;
    local.value.timeline_hash = local.value.online.items[1].hash;
    const remote = syncRecord(env, 944, 8_000_000, 2);
    remote.value.episode = 1;
    remote.value.time = 30;
    env.storage.continue_watch_v6_7 = { [local.key]: JSON.parse(JSON.stringify(local.value)) };
    env.setActive(local.movie);
    let getCount = 0;
    let postCount = 0;
    env.setRequestHandler(({ post, ok }) => {
        if (post) { postCount += 1; return ok({ success: true }); }
        getCount += 1;
        return ok({ schema: 1, updated_at: 8_000_000, records: { [remote.key]: remote.value } });
    });
    const fullListener = (env.listeners.full || [])[env.listeners.full.length - 1];
    fullListener({ type: 'start', data: { movie: local.movie } });
    assert.equal(getCount, 1, 'card hydration must perform exactly one Lampac GET');
    assert.equal(postCount, 0,
        'opening a card must remain read-only even when the local clock makes stale local data look newer');
    assert.equal(env.api.record().episode, 2);
    assert.equal(env.api.record().time, 240);
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    const local = syncRecord(env, 945, 3_500_000, 1);
    const staleRuntimeRemote = syncRecord(env, 946, 3_500_100, 1);
    env.storage.continue_watch_v6_7 = { [local.key]: JSON.parse(JSON.stringify(local.value)) };
    let heldGet = null;
    env.setRequestHandler(({ post, ok }) => {
        if (post) return ok({ success: true });
        if (!heldGet) { heldGet = ok; return; }
        return ok({ schema: 1, updated_at: 0, records: {} });
    });
    env.api.testing.syncRemote('old-runtime-in-flight');
    assert.ok(heldGet, 'the old runtime GET must remain in flight for the hot-reload regression');
    env.reloadPlugin('v6.2.14-hot-reload-inflight-probe');
    const requestCountAfterReload = env.requests.length;
    const postCountAfterReload = env.requests.filter((request) => request.post).length;
    heldGet({
        schema: 1,
        updated_at: 3_500_100,
        records: { [staleRuntimeRemote.key]: staleRuntimeRemote.value }
    });
    assert.deepEqual(Object.keys(env.storage.continue_watch_v6_7), [local.key],
        'an in-flight GET owned by the previous runtime must not mutate local Continue data');
    assert.equal(env.requests.filter((request) => request.post).length, postCountAfterReload,
        'an in-flight GET owned by the previous runtime must not add a POST after hot reload');
    assert.equal(env.requests.length, requestCountAfterReload,
        'retiring the old runtime must not add a request while its stale callback unwinds');
}

{
    const env = harness({
        scripts: ['https://lampac.fun/sync/js/arx.lamp'],
        androidPlatform: true,
        player: 'android'
    });
    let remoteDocument = null;
    env.setRequestHandler(({ post, ok }) => {
        if (post) {
            remoteDocument = JSON.parse(post);
            return ok({ success: true });
        }
        if (!remoteDocument) return ok({ success: false, msg: 'outFile' });
        return ok({ success: true, data: JSON.stringify(remoteDocument) });
    });
    const movie = { id: 7787, media_type: 'tv', title: 'Android return to Lampac', original_name: 'Android return to Lampac' };
    const cardKey = env.api.testing.cardKey(movie);
    const recordKey = 'c_' + env.Lampa.Utils.hash(cardKey);
    const resolverUrl = 'https://lampac.fun/lite/hdvb/serial?id=7787&s=1&e=2&t=Dub';
    const mediaUrl = 'https://media.example/android-return-e2.m3u8';
    env.setActive(movie);
    env.listeners.request_secuses[0]({ params: { url: resolverUrl, headers: {} }, data: { url: mediaUrl } });
    env.Lampa.Player.play({
        card: movie, movie, isonline: true, season: 1, episode: 2, title: 'E2',
        url: mediaUrl,
        timeline: { hash: 'android-return-e2', time: 332, duration: 3000, percent: 11 },
        playlist: [{ isonline: true, season: 1, episode: 2, title: 'E2', url: mediaUrl,
            timeline: { hash: 'android-return-e2', time: 332, duration: 3000, percent: 11 } }]
    });
    env.timelineListeners.forEach((listener) => listener({
        hash: 'android-return-e2', road: { time: 375, duration: 3000, percent: 13, updated: 2_000_100 }
    }));
    assert.equal(env.storage.continue_watch_v6_7[recordKey].time, 375,
        'the Just+ return timeline must update the local Continue record immediately');
    env.advance(7_150);
    assert.ok(remoteDocument && remoteDocument.records[recordKey],
        'the Android online return must reach the Lampac key-selected document after the flush timer');
    assert.equal(remoteDocument.records[recordKey].source, 'online');
    assert.equal(remoteDocument.records[recordKey].episode, 2);
    assert.equal(remoteDocument.records[recordKey].time, 375);
}

{
    const phone = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    phone.setAccountProfile('phone-profile');
    phone.storage.lampac_profile_id = 'phone-internal-profile';
    const browser = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    browser.setAccountProfile(null);
    browser.storage.lampac_profile_id = 'browser-internal-profile';
    const seeded = syncRecord(phone, 900, 2_990_000, 2);
    phone.storage['continue_watch_v6_phone-profile'] = { [seeded.key]: seeded.value };
    let remoteDocument = null;
    function bindSharedLampac(env) {
        env.setRequestHandler(({ url, post, params, ok }) => {
            const parsed = new URL(url);
            assert.equal(parsed.searchParams.get('token'), 'arx.lamp');
            assert.equal(parsed.searchParams.get('pathfile'), 'continue_watch_v6');
            assert.equal(parsed.searchParams.has('profile_id'), false,
                'the Lampac key alone must select the cross-device remote document');
            if (post) {
                assert.equal(typeof post, 'string', 'Lampac Storage body must be sent as the raw POST body');
                assert.equal(params.transport, 'jquery', 'Lampac Storage POST must match the official jQuery transport');
                assert.equal(params.contentType, false, 'Lampac Storage POST must not synthesize a form content type');
                assert.equal(params.processData, false, 'Lampac Storage JSON must not be form-processed');
                assert.equal(params.cache, false);
                remoteDocument = JSON.parse(post);
                return ok({ success: true });
            }
            if (!remoteDocument) return ok({ success: false, msg: 'outFile' });
            return ok({ success: true, data: JSON.stringify(remoteDocument) });
        });
    }
    bindSharedLampac(phone);
    phone.api.testing.syncRemote('phone-seed');
    assert.ok(remoteDocument && remoteDocument.records[seeded.key],
        'the account-profile phone must publish into the key-selected Lampac document');

    bindSharedLampac(browser);
    browser.api.testing.pullRemote(() => {});
    assert.ok(browser.storage['continue_watch_v6_browser-internal-profile'][seeded.key],
        'a browser with a different internal profile and the same key must hydrate the phone record');
    assert.equal(browser.storage['continue_watch_v6_browser-internal-profile'][seeded.key].episode, 1);
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    const remoteMovie = syncRecord(env, 901, 3_000_000, 1);
    env.setRequestHandler(({ ok }) => ok({ schema: 1, updated_at: 3_000_000, records: { [remoteMovie.key]: remoteMovie.value } }));
    env.api.testing.pullRemote(() => {});
    env.setActive(remoteMovie.movie);
    assert.equal(env.api.record().card_key, remoteMovie.value.card_key, 'a schema-1 remote movie must hydrate the local record store');
    assert.equal(new URL(env.requests[0].url).pathname, '/storage/get');

    const localMovie = syncRecord(env, 902, 3_010_000, 1);
    env.storage.continue_watch_v6_7 = { [localMovie.key]: localMovie.value };
    const remoteSeries = syncRecord(env, 903, 3_020_000, 2);
    env.setRequestHandler(({ ok }) => ok({ schema: 1, updated_at: 3_020_000, records: { [remoteSeries.key]: remoteSeries.value } }));
    env.api.testing.pullRemote(() => {});
    assert.deepEqual(Object.keys(env.api.sync().store).sort(), [localMovie.key, remoteSeries.key].sort(), 'pull must union disjoint remote and local records');

    const rich = syncRecord(env, 904, 3_030_000, 10);
    const poor = syncRecord(env, 904, 3_030_000, 1);
    env.storage.continue_watch_v6_7 = { [poor.key]: poor.value };
    env.local.continue_watch_v6_outbox_7 = JSON.stringify({ [rich.key]: rich.value });
    env.setRequestHandler(({ ok }) => ok({ schema: 1, updated_at: 3_030_000, records: { [poor.key]: poor.value } }));
    env.api.testing.pullRemote(() => {});
    assert.equal(env.api.sync().store[rich.key].online.items.length, 10, 'equal-time rich outbox playlist must not be downgraded by a poorer remote playlist');
}

{
    [
        'not-json',
        { schema: 2, updated_at: 1, records: {} },
        { accsdb: { stale: true } },
        null
    ].forEach((response, index) => {
        const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
        const original = syncRecord(env, 910 + index, 3_100_000 + index, 2);
        const originalStore = { [original.key]: original.value };
        const originalOutbox = { [original.key]: original.value };
        env.storage.continue_watch_v6_7 = JSON.parse(JSON.stringify(originalStore));
        env.local.continue_watch_v6_outbox_7 = JSON.stringify(originalOutbox);
        env.setRequestHandler(({ ok, fail }) => response === null ? fail() : ok(response));
        env.api.testing.pullRemote(() => {});
        assert.equal(JSON.stringify(env.storage.continue_watch_v6_7), JSON.stringify(originalStore), 'invalid remote response ' + index + ' must leave local store byte-for-byte intact');
        assert.equal(env.local.continue_watch_v6_outbox_7, JSON.stringify(originalOutbox), 'invalid remote response ' + index + ' must leave outbox byte-for-byte intact');
    });
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/nast'] });
    const local = syncRecord(env, 920, 3_200_000, 2);
    local.value.online.direct_url = 'https://media.example/transient-proxy/video.m3u8';
    local.value.online.resolver_url += '&account_email=source%40example.test&uid=source-device&nws_id=source-rch&token=source-resolver-token&aesgcmkey=source-resolver-aes';
    local.value.online.resolver_headers = { 'X-Kit-AesGcm': 'secret', Authorization: 'Bearer private' };
    local.value.online.items[0].meta.segments = [{
        duration: 4, type: 'video/mp2t', url: 'https://segment.example/part-1.ts',
        uri: 'https://segment.example/part-1-uri.ts', src: 'https://segment.example/part-1-src.ts'
    }];
    local.value.online.items[0].meta.transport = {
        url: 'https://media.example/nested-url.m3u8', uri: 'https://media.example/nested-uri.m3u8', src: 'https://media.example/nested-src.m3u8'
    };
    local.value.online.items[0].meta.quality = { '1080': 'https://signed.example/video.m3u8?token=private' };
    local.value.online.items[0].meta.headers = { Authorization: 'Bearer nested-private' };
    local.value.online.items[0].meta.rch = { body: 'source-rch-body' };
    env.storage.continue_watch_v6_7 = { [local.key]: local.value };
    env.local.continue_watch_v6_outbox_7 = JSON.stringify({ [local.key]: local.value });
    let getCount = 0;
    const server = syncRecord(env, 921, 3_200_100, 1);
    env.setRequestHandler(({ url, post, params, ok }) => {
        if (post) return ok({ success: true });
        getCount += 1;
        if (getCount === 1) return ok({ schema: 1, updated_at: 0, records: {} });
        if (getCount === 2) return ok({ schema: 1, updated_at: 3_200_100, records: { [server.key]: server.value } });
        return ok({ schema: 1, updated_at: 3_200_200, records: { [server.key]: server.value, [local.key]: local.value } });
    });
    env.api.testing.syncRemote('test');
    const posts = env.requests.filter((request) => request.post);
    assert.equal(new URL(posts[0].url).pathname, '/storage/set');
    const firstBody = JSON.parse(posts[0].post);
    assert.equal(firstBody.schema, 1);
    assert.equal(firstBody.records[local.key].season, 1);
    assert.equal(firstBody.records[local.key].episode, 1);
    assert.equal(firstBody.records[local.key].current_index, 0);
    assert.equal(firstBody.records[local.key].online.items.length, 2);
    assert.deepEqual(firstBody.records[local.key].online.items[0].meta.segments, [{ duration: 4, type: 'video/mp2t' }], 'remote segments must retain timing/type but not media locations');
    const normalizedBodyKeys = Object.keys(firstBody.records[local.key].online).map((key) => key.toLowerCase());
    assert.equal(normalizedBodyKeys.some((key) => ['token', 'account_email', 'uid', 'nws_id', 'aesgcmkey', 'rch'].includes(key)), false);
    assert.equal(JSON.stringify(firstBody).includes('source@example.test'), false);
    assert.equal(JSON.stringify(firstBody).includes('source-device'), false);
    assert.equal(JSON.stringify(firstBody).includes('source-rch'), false);
    assert.equal(JSON.stringify(firstBody).includes('source-resolver-token'), false, 'remote body must not retain resolver query credentials');
    assert.equal(JSON.stringify(firstBody).includes('source-resolver-aes'), false, 'remote body must not retain resolver AES query credentials');
    assert.equal(JSON.stringify(firstBody).includes('Bearer private'), false);
    assert.equal(JSON.stringify(firstBody).includes('Bearer nested-private'), false);
    assert.equal(JSON.stringify(firstBody).includes('source-rch-body'), false);
    assert.equal(JSON.stringify(firstBody).includes('transient-proxy'), false);
    ['segment.example', 'nested-url.m3u8', 'nested-uri.m3u8', 'nested-src.m3u8'].forEach((needle) => {
        assert.equal(JSON.stringify(firstBody).includes(needle), false, 'remote body must not retain nested transient media URL ' + needle);
    });
    assert.equal(JSON.stringify(firstBody).includes('signed.example'), false, 'remote body must not retain scalar signed URL maps');
    assert.equal(env.storage.continue_watch_v6_7[local.key].online.direct_url, 'https://media.example/transient-proxy/video.m3u8', 'remote sync must not strip same-device direct playback URLs from the local store');
    assert.equal(env.storage.continue_watch_v6_7[local.key].online.resolver_headers.Authorization, 'Bearer private', 'remote sync must not strip same-device resolver headers from the local store');
    assert.equal(new URL(env.storage.continue_watch_v6_7[local.key].online.resolver_url).searchParams.get('token'), 'source-resolver-token', 'remote sync must not strip same-device resolver tokens from the local store');
    assert.equal(posts.length, 2, 'a verification document missing the local record must produce one merged repair POST');
    const repair = JSON.parse(posts[1].post);
    assert.ok(repair.records[local.key]);
    assert.ok(repair.records[server.key]);
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/security-probe'] });
    const storageKey = 'continue_watch_v6_7';
    const local = syncRecord(env, 922, 3_210_000, 1);
    const malformed = syncRecord(env, 923, 3_210_100, 1);
    const sensitiveSentinels = ['legitimate-hdvb-token', 'adversarial-aes', 'adversarial-authorization', 'adversarial-account', 'adversarial-headers'];
    const resolver = 'https://lampac.fun/lite/hdvb/video?id=922&s=1&e=1&t=HDVB&ToKeN=legitimate-hdvb-token&AeSgCmKeY=adversarial-aes&AUTHORIZATION=adversarial-authorization&AcCoUnT=adversarial-account&HeAdErS=adversarial-headers&AcCoUnT_EmAiL=adversarial-account&UiD=adversarial-account&NwS_iD=adversarial-account';
    local.value.time = 343;
    local.value.online.resolver_url = resolver;
    local.value.online.selection = { provider: 'hdvb', translation: 'hdvb' };
    local.value.online.items[0].resolver_url = resolver;
    local.value.online.items[0].selection = { provider: 'hdvb', translation: 'hdvb' };
    local.value.online.Authorization = 'adversarial-authorization';
    local.value.online.AcCoUnT = 'adversarial-account';
    local.value.online.HeAdErS = 'adversarial-headers';
    local.value.online.direct_url = 'https://media.example/diagnostic-transient.m3u8';
    local.value.online.items[0].meta.transport = { url: 'https://media.example/diagnostic-nested.m3u8' };
    malformed.value.online.resolver_url = 'https://[invalid/?ToKeN=legitimate-hdvb-token&AeSgCmKeY=adversarial-aes&AUTHORIZATION=adversarial-authorization&AcCoUnT=adversarial-account&HeAdErS=adversarial-headers';
    malformed.value.online.items[0].resolver_url = malformed.value.online.resolver_url;
    env.storage[storageKey] = { [local.key]: local.value, [malformed.key]: malformed.value };
    env.local.continue_watch_v6_outbox_7 = JSON.stringify({ [local.key]: local.value, [malformed.key]: malformed.value });
    env.setActive(local.movie);

    const diagnostic = JSON.stringify({ record: env.api.record(), sync: env.api.sync() });
    const posted = [];
    let serverRecords = {};
    env.setRequestHandler(({ post, ok }) => {
        if (post) {
            const body = JSON.parse(post);
            posted.push(body);
            serverRecords = body.records;
            return ok({ success: true });
        }
        return ok({ schema: 1, updated_at: 3_210_200, records: serverRecords });
    });
    env.api.testing.syncRemote('security-probe');
    const remoteBody = JSON.stringify(posted[0] || {});
    let nativeResolverUrl = '';
    env.setRequestHandler(({ url, ok, fail }) => {
        nativeResolverUrl = url;
        if (new URL(url).searchParams.get('ToKeN') !== 'legitimate-hdvb-token') return fail();
        ok({ url: 'https://media.example/security-probe-fresh.m3u8' });
    });
    env.api.launch();
    assert.deepEqual({
        diagnostic: sensitiveSentinels.filter((secret) => diagnostic.includes(secret)),
        remote: sensitiveSentinels.filter((secret) => remoteBody.includes(secret)),
        nativeToken: new URL(nativeResolverUrl).searchParams.get('ToKeN'),
        resumeTime: env.androidLaunches[0] && env.androidLaunches[0].parsed.time
    }, { diagnostic: [], remote: [], nativeToken: 'legitimate-hdvb-token', resumeTime: 343 },
    'mixed-case credential aliases must be hidden publicly/remotely while the local HDVB token still resumes at 343 seconds');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
    const local = syncRecord(env, 930, 3_300_000, 1);
    env.storage.continue_watch_v6_7 = { [local.key]: local.value };
    env.local.continue_watch_v6_outbox_7 = JSON.stringify({ [local.key]: local.value });
    env.setRequestHandler(({ post, ok }) => ok(post ? { success: true } : { schema: 1, updated_at: 0, records: {} }));
    env.api.testing.syncRemote('conflict');
    assert.equal(env.requests.filter((request) => request.post).length, 3, 'one cycle must make no more than three conflict-repair POST attempts');
    assert.ok(env.local.continue_watch_v6_outbox_7, 'bounded conflict retries must retain the durable outbox');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    const installedRequests = env.requests.length;
    assert.ok(installedRequests >= 1, 'install with a Lampac identity must start remote hydration');
    env.setRequestHandler(({ ok }) => ok({ schema: 1, updated_at: 0, records: {} }));
    env.dispatchWindowEvent('focus');
    assert.ok(env.requests.length > installedRequests, 'focus must cause a later Lampac pull');
    const afterFocus = env.requests.length;
    env.setVisibility('visible');
    assert.ok(env.requests.length > afterFocus, 'visible visibilitychange must cause a later Lampac pull');
    ['account', 'account_email', 'lampac_unic_id', 'lampac_profile_id'].forEach((name) => {
        const before = env.requests.length;
        env.dispatchStorageChange(name);
        env.advance(5_500);
        assert.ok(env.requests.length > before, name + ' changes must cause a later Lampac pull');
    });
    assert.equal(env.storageSyncCalls(), 0, 'no lifecycle path may invoke CUB Storage.sync');
    const diagnostic = JSON.stringify(env.api.sync());
    assert.equal(diagnostic.includes('arx.lamp'), false);
    assert.equal(diagnostic.includes('account_email'), false);
    assert.equal(diagnostic.includes('lampac_unic_id'), false);
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/a%20token%2Fwith%3Fchars'] });
    env.setAccountProfile('device-profile');
    env.storage.lampac_profile_id = 'shared-lampac-profile';
    assert.equal(env.api.testing.storageKey(), 'continue_watch_v6_device-profile', 'local state remains scoped to the active Lampa profile');
    const remoteUrl = new URL(env.api.testing.lampacStorageUrl('get'));
    assert.equal(env.api.testing.discoverLampacToken(), 'a token/with?chars');
    assert.equal(remoteUrl.searchParams.get('token'), 'a token/with?chars');
    assert.equal(remoteUrl.searchParams.get('pathfile'), 'continue_watch_v6', 'the arbitrary Lampac key must select one shared remote document across device profiles');
    assert.equal(remoteUrl.searchParams.has('profile_id'), false, 'internal Lampac profile ids must not split key-based Continue sync');
    env.setAccountProfile(null);
    assert.equal(JSON.stringify(env.api.sync()).includes('shared-lampac-profile'), false,
        'public sync diagnostics must not expose an internal Lampac profile id');
}

{
    const emailOnly = harness();
    emailOnly.storage.account_email = 'email-only@example.test';
    const emailUrl = new URL(emailOnly.api.testing.lampacStorageUrl('get'));
    assert.equal(emailUrl.searchParams.has('account_email'), false);
    assert.equal(emailUrl.searchParams.has('uid'), false);
    emailOnly.api.testing.syncRemote('email-only');
    assert.equal(emailOnly.requests.length, 0, 'email without a Lampac sync key must not enable remote storage');
    const uidOnly = harness();
    uidOnly.storage.lampac_unic_id = 'uid-only-device';
    const uidUrl = new URL(uidOnly.api.testing.lampacStorageUrl('get'));
    assert.equal(uidUrl.searchParams.has('uid'), false);
    assert.equal(uidUrl.searchParams.has('account_email'), false);
    uidOnly.api.testing.syncRemote('uid-only');
    assert.equal(uidOnly.requests.length, 0, 'device uid without a Lampac sync key must not enable remote storage');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
    const local = syncRecord(env, 950, 3_500_000, 1);
    const newer = syncRecord(env, 950, 3_500_100, 1);
    newer.value.time = 99;
    env.storage.continue_watch_v6_7 = { [local.key]: local.value };
    env.setRequestHandler(({ ok }) => ok({ schema: 1, updated_at: 3_500_100, records: { [newer.key]: newer.value } }));
    env.api.testing.pullRemote(() => {});
    assert.equal(env.api.sync().store[local.key].time, 99, 'a valid newer remote record must win the same-key merge');

    const partial = syncRecord(env, 951, 3_500_200, 1);
    partial.value.time = 300; partial.value.duration = 3000; partial.value.percent = 10;
    const falseComplete = syncRecord(env, 951, 3_500_300, 1);
    falseComplete.value.time = 20; falseComplete.value.duration = 3000; falseComplete.value.percent = 100;
    env.storage.continue_watch_v6_7 = { [partial.key]: partial.value };
    env.setRequestHandler(({ ok }) => ok({ schema: 1, updated_at: 3_500_300, records: { [falseComplete.key]: falseComplete.value } }));
    env.api.testing.pullRemote(() => {});
    assert.equal(env.api.sync().store[partial.key].time, 300, 'an implausible remote completion must not replace valid partial local progress');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
    const torrent = syncRecord(env, 960, 3_600_000, 1);
    torrent.value.source = 'torrent';
    torrent.value.season = 2; torrent.value.episode = 5; torrent.value.current_index = 3;
    torrent.value.torrent = { index: 3, hash: 'torrent-hash', magnet: 'magnet:?xt=urn:btih:abc', items: [{ hash: 'torrent-e5', season: 2, episode: 5, file_name: 'E5.mkv', meta: { segments: [{ duration: 4, type: 'video/mp2t' }] } }] };
    delete torrent.value.online;
    env.setRequestHandler(({ ok }) => ok({ success: false, msg: 'outFile' }));
    env.storage.continue_watch_v6_7 = { [torrent.key]: torrent.value };
    env.api.testing.syncRemote('torrent');
    const body = JSON.parse(env.requests.filter((request) => request.post)[0].post);
    assert.equal(body.records[torrent.key].season, 2);
    assert.equal(body.records[torrent.key].episode, 5);
    assert.equal(body.records[torrent.key].current_index, 3);
    assert.equal(body.records[torrent.key].torrent.index, 3);
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
    const local = syncRecord(env, 970, 3_700_000, 1);
    const late = syncRecord(env, 971, 3_700_100, 1);
    env.storage.continue_watch_v6_7 = { [local.key]: local.value };
    let lateGet = null;
    env.setRequestHandler(({ post, ok }) => { if (!post && !lateGet) lateGet = ok; });
    env.api.testing.syncRemote('timeout');
    env.advance(8_000);
    lateGet({ schema: 1, updated_at: 3_700_100, records: { [late.key]: late.value } });
    assert.deepEqual(Object.keys(env.api.sync().store), [local.key], 'a late GET callback after timeout must be ignored exactly once');
    assert.equal(env.requests.filter((request) => request.post).length, 0, 'a timed-out GET must not initiate a late POST');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
    let held = null;
    let getCalls = 0;
    env.setRequestHandler(({ post, ok, fail }) => {
        if (post) return fail();
        getCalls += 1;
        if (!held) { held = ok; return; }
        fail();
    });
    env.api.testing.syncRemote('first');
    env.api.testing.syncRemote('coalesced-one');
    env.api.testing.syncRemote('coalesced-two');
    held({ schema: 1, updated_at: 0, records: {} });
    env.advance(650);
    assert.equal(getCalls, 2, 'busy sync calls must coalesce to one serialized follow-up cycle');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    env.setAccountProfile('profile-a');
    const localA = syncRecord(env, 940, 3_400_000, 1);
    const remoteA = syncRecord(env, 941, 3_400_100, 1);
    const localB = syncRecord(env, 942, 3_400_200, 1);
    env.storage['continue_watch_v6_profile-a'] = { [localA.key]: localA.value };
    env.storage['continue_watch_v6_profile-b'] = { [localB.key]: localB.value };
    let heldGet = null;
    env.setRequestHandler(({ post, ok, fail }) => {
        if (!post && !heldGet) { heldGet = ok; return; }
        fail();
    });
    env.api.testing.syncRemote('profile-a');
    assert.ok(heldGet, 'the profile-A GET must remain in flight for the profile-switch regression');
    env.setAccountProfile('profile-b');
    env.dispatchStorageChange('account');
    heldGet({ schema: 1, updated_at: 3_400_100, records: { [remoteA.key]: remoteA.value } });
    assert.deepEqual(Object.keys(env.storage['continue_watch_v6_profile-b']).sort(), [localB.key], 'a stale profile-A response must not merge into profile B local storage');
    assert.equal(env.requests.filter((request) => request.post).length, 0, 'a stale profile-A response must never POST its records to profile B');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/arx.lamp'] });
    const staleRemote = syncRecord(env, 943, 3_410_100, 1);
    let heldArxGet = null;
    let tolGets = 0;
    env.setRequestHandler(({ url, post, ok, fail }) => {
        if (post) return fail();
        const token = new URL(url).searchParams.get('token');
        if (token === 'arx.lamp' && !heldArxGet) { heldArxGet = ok; return; }
        if (token === 'tol') { tolGets += 1; return ok({ schema: 1, updated_at: 0, records: {} }); }
        fail();
    });
    env.api.testing.syncRemote('held-arx');
    assert.ok(heldArxGet, 'the old-key GET must remain in flight for the key-switch regression');
    env.storage.plugins = [{ url: 'https://lampac.fun/sync/js/tol', status: 1 }];
    env.dispatchStorageChange('plugins');
    heldArxGet({ schema: 1, updated_at: 3_410_100, records: { [staleRemote.key]: staleRemote.value } });
    env.advance(650);
    assert.equal(env.api.sync().store[staleRemote.key], undefined,
        'a response from the previous Lampac key must not merge after the identity changes');
    assert.ok(tolGets >= 1, 'the serialized follow-up cycle must target the newly configured key');
}

{
    const env = harness({ scripts: ['https://lampac.fun/sync/js/tol'] });
    const local = syncRecord(env, 980, 3_800_000, 1);
    local.value.time = 300; local.value.duration = 0; local.value.percent = 0;
    const falseComplete = syncRecord(env, 980, 3_800_100, 1);
    falseComplete.value.time = 20; falseComplete.value.duration = 3000; falseComplete.value.percent = 100;
    env.storage.continue_watch_v6_7 = { [local.key]: local.value };
    let gets = 0;
    let serverDocument = null;
    env.setRequestHandler(({ post, ok }) => {
        if (post) { serverDocument = JSON.parse(post); return ok({ success: true }); }
        gets += 1;
        return ok({ schema: 1, updated_at: gets === 1 ? 3_800_100 : 3_800_200,
            records: gets === 1 ? { [local.key]: falseComplete.value } : serverDocument.records });
    });
    env.api.testing.syncRemote('time-only-partial');
    const posts = env.requests.filter((request) => request.post);
    assert.equal(env.api.sync().store[local.key].time, 300, 'a guarded false completion must not replace a time-only local partial');
    assert.equal(JSON.parse(posts[0].post).records[local.key].time, 300, 'the repair POST must converge remote state to the valid local time-only partial');
    assert.equal(gets, 2, 'the completed repair must perform one initial and one verification GET');
    assert.equal(posts.length, 1, 'the verification state must converge after one POST');
    assert.equal(serverDocument.records[local.key].time, env.api.sync().store[local.key].time, 'verification must return the actual POST body as converged server state');
}

{
    const env = harness();
    const local = syncRecord(env, 981, 3_810_000, 1);
    local.value.time = 300; local.value.duration = 0; local.value.percent = 0;
    const guardedLower = JSON.parse(JSON.stringify(local.value));
    guardedLower.activity_at = 3_810_100; guardedLower.time = 20; guardedLower.percent = 1; guardedLower.completion_guard = 'percent_time_mismatch';
    const guardedAdvanced = JSON.parse(JSON.stringify(local.value));
    guardedAdvanced.activity_at = 3_810_200; guardedAdvanced.time = 400; guardedAdvanced.percent = 1; guardedAdvanced.completion_guard = 'percent_time_mismatch';
    const nextEpisode = JSON.parse(JSON.stringify(guardedLower));
    nextEpisode.activity_at = 3_810_300; nextEpisode.episode = 2; nextEpisode.timeline_hash = 'sync-981-2';
    assert.equal(env.api.testing.mergeRecordMaps({ [local.key]: local.value }, { [local.key]: guardedLower })[local.key].time, 300, 'same-position lower guarded time must lose');
    assert.equal(env.api.testing.mergeRecordMaps({ [local.key]: local.value }, { [local.key]: guardedAdvanced })[local.key].time, 400, 'same-position guarded elapsed time that advances must win');
    assert.equal(env.api.testing.mergeRecordMaps({ [local.key]: local.value }, { [local.key]: nextEpisode })[local.key].episode, 2, 'newer next-episode progress must use normal activity ordering even with lower elapsed time');
}

{
    const env = harness();
    const movie = { id: 108978, media_type: 'tv', title: 'Reacher', original_name: 'Reacher' };
    const e1 = { title: 'Episode 1', season: 1, episode: 1, url: 'https://media.example/reacher-e1.m3u8', timeline: { hash: 'reacher-e1' } };
    const e2 = { title: 'Первый танец', season: 1, episode: 2, url: 'https://media.example/reacher-e2.m3u8', timeline: { hash: 'reacher-e2' } };
    env.setActive(movie);
    env.Lampa.Player.play(Object.assign({}, e1, { card: movie, movie, isonline: true, playlist: [e1], playlist_index: 0, duration: 3275 }));
    env.timelineListeners.forEach((listener) => listener({ hash: 'reacher-e1', road: { time: 143, duration: 3275, percent: 4, updated: 3_899_000 } }));
    let saved = env.api.sync().store['c_' + env.Lampa.Utils.hash(env.api.testing.cardKey(movie))];
    assert.equal(saved.episode, 1);
    assert.equal(saved.time, 143);
    env.Lampa.Player.playlist([Object.assign({}, e2, { duration: 3205 })]);
    env.timelineListeners.forEach((listener) => listener({ hash: 'reacher-e2', road: { time: 198, duration: 3205, percent: 6, updated: 3_900_000 } }));
    saved = env.api.sync().store['c_' + env.Lampa.Utils.hash(env.api.testing.cardKey(movie))];
    assert.equal(saved.episode, 2, 'a web-player Next metadata transition must save episode 2');
    assert.equal(saved.episode_title, 'Первый танец');
    assert.equal(saved.time, 198);
}

{
    const env = harness();
    const reacher = { id: 108978, media_type: 'tv', title: 'Reacher', original_name: 'Reacher' };
    const other = { id: 999999, media_type: 'tv', title: 'Other', original_name: 'Other' };
    const e1 = { title: 'E1', season: 1, episode: 1, url: 'https://media.example/e1.m3u8', timeline: { hash: 'safe-e1' } };
    const unrelated = { title: 'Other E2', season: 1, episode: 2, url: 'https://media.example/other-e2.m3u8', timeline: { hash: 'other-e2' } };
    env.setActive(reacher);
    env.Lampa.Player.play(Object.assign({}, e1, { card: reacher, movie: reacher, isonline: true, playlist: [e1], playlist_index: 0 }));
    env.timelineListeners.forEach((listener) => listener({ hash: 'safe-e1', road: { time: 143, duration: 3275, percent: 4, updated: 4_000_000 } }));
    env.setActive(other);
    env.Lampa.Player.playlist([unrelated]);
    env.timelineListeners.forEach((listener) => listener({ hash: 'other-e2', road: { time: 198, duration: 3205, percent: 6, updated: 4_001_000 } }));
    const saved = env.storage['continue_watch_v6_7']['c_' + env.Lampa.Utils.hash(env.api.testing.cardKey(reacher))];
    assert.equal(saved.episode, 1, 'unrelated singleton playlist metadata must not overwrite the active Reacher session');
    assert.equal(saved.time, 143);
}

console.log('ContinueWatching v6.2.14 regression fixtures: PASS');
