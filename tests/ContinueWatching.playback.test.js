'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'ContinueWatching.js'), 'utf8');
const marker = '    return exports;';
const series = {source: 'tmdb', id: 4242, name: 'Resume fixture', original_name: 'Resume fixture', media_type: 'tv', number_of_seasons: 1};

test('switching the Lampac sync ID resets the in-memory resume store to the selected owner', () => {
    const values = {lampac_sync_owner_v1: 'server|base|'};
    const storage = {get(key, fallback) { return key in values ? values[key] : fallback; }, set(key, value) { values[key] = value; }};
    const store = loadApi().createRecipeStore({Storage: storage});
    store.upsert(series, onlineRecord());
    const basic = JSON.parse(JSON.stringify(store.read()));
    values.lampac_sync_owner_v1 = 'server|custom|';
    values.lampac_resume_history_v1 = {schema: 1, cards: {}};
    values.lampac_resume_history_cache_v1 = {schema: 1, cards: {}};
    store.mergeSynced();
    assert.equal(Object.keys(store.read().cards).length, 0);
    assert.equal(Object.keys(values.lampac_resume_history_v1.cards).length, 0);
    values.lampac_sync_owner_v1 = 'server|base|';
    values.lampac_resume_history_v1 = basic;
    values.lampac_resume_history_cache_v1 = basic;
    store.mergeSynced();
    assert.ok(store.find(series));
    assert.equal(store.find(series).modes.online.online.balanser, 'phantom');
});

function loadApi($) {
    return vm.runInNewContext(source.replace(marker,
        '    exports.createCapture = createCapture; exports.createRecipeStore = createRecipeStore; exports.renderButton = renderButton; exports.chooseResumeTarget = chooseResumeTarget;\n' + marker),
    {$, setTimeout, clearTimeout, setInterval, clearInterval, console});
}

function emitter() {
    const listeners = [];
    return {
        follow(name, fn) {listeners.push({name, fn});},
        remove(name, fn) {const i = listeners.findIndex(item => item.name === name && item.fn === fn); if (i >= 0) listeners.splice(i, 1);},
        send(name, data) {listeners.filter(item => item.name === name).forEach(item => item.fn(data));},
        count() {return listeners.length;}
    };
}

function onlineRecord(episode = 1) {
    return {mode: 'online', updated_at: 1000, episode: {season: 1, episode, timeline_hash: 'h' + episode},
        progress: {time: 321, duration: 1800}, online: {component: 'lampac', balanser: 'phantom', season_index: 0, voice_index: 0, search: {title: series.name}}};
}

function fixture($) {
    const values = {active_balanser: 'phantom', online_balanser: 'pidtor', online_last_balanser: {[series.id]: 'pidtor'}};
    const roads = {};
    let active = {component: 'lampac', movie: series};
    let playlist = [];
    let current = null;
    let opened = false;
    const played = [];
    const Lampa = {
        Storage: {get(key, fallback) {return key in values ? values[key] : fallback;}, set(key, value) {values[key] = value;}, field(key) {return values[key];}},
        Activity: {active: () => active},
        Platform: {is: () => false},
        Player: {listener: emitter(), opened: () => opened,
            play(data) {
                let run = true;
                this.listener.send('create', {data, abort() {run = false;}});
                if (!run) return;
                current = data;
                opened = true;
                played.push(data);
                this.listener.send('start', data);
            },
            playlist(items) {Lampa.PlayerPlaylist.set(items);},
            destroy() {
                opened = false;
                current = null;
                this.listener.send('destroy', {});
            }
        },
        PlayerPlaylist: {listener: emitter(),
            get: () => playlist,
            set(items) {
                playlist = items;
                const position = Math.max(0, playlist.findIndex(item => item.timeline.hash === (current && current.timeline.hash)));
                this.listener.send('set', {playlist, position});
            }
        },
        Timeline: {listener: emitter(),
            view(hash) {return {...(roads[hash] || {}), hash, handler(percent, time, duration) {Lampa.Timeline.update({hash, percent, time, duration});}};},
            update(data) {
                const road = {time: data.time || 0, duration: data.duration || 0, percent: data.percent || 0};
                roads[data.hash] = road;
                this.listener.send('update', {data: {hash: data.hash, road}});
            }
        },
        Listener: emitter()
    };
    // Lampa installs these core listeners before third-party plugins. In particular,
    // select destroys playback before the plugin's select callback receives the event.
    Lampa.Player.listener.follow('start', data => Lampa.PlayerPlaylist.set(data.playlist || playlist));
    Lampa.Player.listener.follow('destroy', () => {playlist = [];});
    Lampa.PlayerPlaylist.listener.follow('select', event => {
        const retained = playlist;
        Lampa.Player.destroy();
        event.item.continue_play = true;
        Lampa.Player.play(event.item);
        Lampa.PlayerPlaylist.set(retained);
    });
    const api = loadApi($);
    return {api, Lampa, values, roads, played, store: api.createRecipeStore(Lampa),
        activate(value) {active = value;},
        item(episode, time = 0) {return {url: 'https://media.invalid/' + episode + '.mp4', season: 1, episode, timeline: {...Lampa.Timeline.view('h' + episode), time, duration: 1800}};}
    };
}

test('the core next-episode lifecycle updates the saved online episode', () => {
    const f = fixture();
    const capture = f.api.createCapture(f.Lampa, f.store);
    capture.start();
    try {
        const playlist = [f.item(1, 321), f.item(2, 7), f.item(3)];
        f.Lampa.Player.play({...playlist[0], isonline: true, playlist});
        assert.equal(f.store.find(series).modes.online.episode.episode, 1);
        f.Lampa.PlayerPlaylist.listener.send('select', {playlist, position: 1, item: playlist[1]});
        const saved = f.store.find(series).modes.online;
        assert.equal(saved.episode.episode, 2);
        assert.equal(saved.episode.timeline_hash, 'h2');
        assert.equal(saved.progress.time, 7);
        assert.equal(saved.online.balanser, 'phantom');
        assert.equal(f.api.createRecipeStore(f.Lampa).find(series).modes.online.episode.episode, 2);
    } finally {capture.stop();}
});

test('late internal progress for the previous episode cannot undo playlist selection', () => {
    const f = fixture();
    const capture = f.api.createCapture(f.Lampa, f.store);
    capture.start();
    try {
        const playlist = [f.item(1, 321), f.item(2, 7)];
        f.Lampa.Player.play({...playlist[0], isonline: true, playlist});
        f.Lampa.PlayerPlaylist.listener.send('select', {playlist, position: 1, item: playlist[1]});
        f.Lampa.Timeline.update({hash: 'h1', time: 1790, duration: 1800, percent: 99});
        f.Lampa.Player.destroy();
        assert.equal(f.store.find(series).modes.online.episode.episode, 2);
        assert.equal(f.store.find(series).modes.online.progress.time, 7);
    } finally {capture.stop();}
});

function collection(nodes = []) {
    return {
        length: nodes.length,
        find(selector) {return collection(nodes.flatMap(node => node.find ? node.find(selector) : []));},
        last() {return collection(nodes.slice(-1));},
        filter(selector) {return collection(nodes.filter(node => node.lampac && selector === '.lampac--button'));},
        each(fn) {nodes.forEach((node, index) => fn(index, node)); return this;},
        eq(index) {return collection(nodes.slice(index, index + 1));},
        attr(name) {return nodes[0] && nodes[0][name];},
        text() {return nodes[0] && nodes[0].text || '';},
        trigger(name) {nodes.forEach(node => node.trigger && node.trigger(name)); return this;}
    };
}

function nativeFixture({hiddenPhantom = false, duplicateButtons = false, destroyOnBack = false, missingPhantom = false, noEpisodes = false} = {}) {
    const $ = node => collection([node]);
    const f = fixture($);
    let genericLaunches = 0;
    let backCalls = 0;
    let selectedSource = '';
    const nodes = (noEpisodes ? [] : [1, 2]).map(episode => ({
        find(selector) {
            if (selector === '.time-line') return [{'data-hash': 'h' + episode}];
            if (selector === '.online-prestige__episode-number') return [{text: String(episode).padStart(2, '0')}];
            return [];
        },
        trigger() {f.Lampa.Player.play({...f.item(episode), isonline: true});}
    }));
    const replayRoot = collection([{find(selector) {return selector === '.online-prestige--full' ? nodes : [];}}]);
    const origin = {component: 'full', movie: series};
    f.activate(origin);
    f.Lampa.Activity.push = context => {
        const wanted = f.values.online_last_balanser[series.id];
        selectedSource = !missingPhantom && wanted === 'phantom' && (!hiddenPhantom || context.lampac_custom_select === wanted) ? wanted : 'pidtor';
        f.values.active_balanser = selectedSource;
        f.activate({...context, activity: {render: () => replayRoot}});
    };
    f.Lampa.Activity.backward = () => {
        backCalls++;
        f.activate(origin);
        if (destroyOnBack) f.Lampa.Player.destroy();
    };
    const lampac = {lampac: true, trigger() {f.Lampa.Activity.push({component: 'lampac', movie: series});}};
    const generic = {trigger() {genericLaunches++; f.values.online_last_balanser[series.id] = 'pidtor'; f.Lampa.Activity.push({component: 'lampac', movie: series});}};
    const actions = duplicateButtons ? [lampac, generic] : [lampac];
    const container = {find: selector => selector === '.view--online' ? actions : []};
    const root = collection([{find(selector) {
        if (selector === '.full-start-new__buttons, .full-start__buttons') return [container];
        if (selector === '.view--online') return actions;
        return [];
    }}]);
    return {...f, event: {body: root}, genericLaunches: () => genericLaunches, backCalls: () => backCalls, selectedSource: () => selectedSource};
}

async function resumeNative(f, record = onlineRecord(), card = series) {
    return f.api.createNativeOnline(f.Lampa, {timeoutMs: 100, pollMs: 1}).launch(card, record,
        (mode, context) => f.api.openSameMode(f.event, mode, context, f.Lampa));
}

test('the legacy online action prefers the Lampac button when another plugin adds one', () => {
    const f = nativeFixture({duplicateButtons: true});
    assert.equal(f.api.openSameMode(f.event, 'online'), true);
    assert.equal(f.genericLaunches(), 0);
});

test('Continue restores Phantom explicitly even when default source selection would choose PidTor', async () => {
    const f = nativeFixture({hiddenPhantom: true, duplicateButtons: true});
    await resumeNative(f);
    assert.equal(f.selectedSource(), 'phantom');
    assert.equal(f.genericLaunches(), 0);
    assert.equal(f.played[0].timeline.time, 321);
});

test('successful native resume keeps its playback activity alive', async () => {
    const f = nativeFixture({destroyOnBack: true});
    await resumeNative(f);
    assert.equal(f.Lampa.Player.opened(), true);
    assert.equal(f.Lampa.Activity.active().component, 'lampac');
    assert.equal(f.backCalls(), 0);
});

function directFixture({noEpisodes = false, seasonEpisodes = [[1, 2]]} = {}) {
    const f = nativeFixture({hiddenPhantom: true});
    const origin = f.Lampa.Activity.active();
    let destroyed = 0;
    const nodesFor = seasonIndex => (noEpisodes ? [] : seasonEpisodes[seasonIndex] || []).map(episode => ({
        find(selector) {
            if (selector === '.time-line') return [{'data-hash': seasonIndex ? String(seasonIndex + 1) + episode + series.original_name : 'h' + episode}];
            if (selector === '.online-prestige__episode-number') return [{text: String(episode).padStart(2, '0')}];
            return [];
        },
        trigger() {
            const hash = seasonIndex ? String(seasonIndex + 1) + episode + series.original_name : 'h' + episode;
            f.Lampa.Player.play({...f.item(episode), season:seasonIndex + 1, timeline:{...f.Lampa.Timeline.view(hash), duration:1800}, isonline:true});
        }
    }));
    f.Lampa.Utils = {hash: value => value};
    f.Lampa.Component = {get(name) {
        if (name !== 'lampac') return null;
        return function (context) {
            let nodes = [];
            const root = collection([{find: selector => selector === '.online-prestige--full' ? nodes : []}]);
            this.create = () => root;
            this.render = () => root;
            this.initialize = () => {
                f.values.active_balanser = context.lampac_custom_select;
                nodes = nodesFor(f.values.online_choice_phantom[series.id].season);
            };
            this.destroy = () => {destroyed++;};
        };
    }};
    return {...f, origin, destroyed: () => destroyed};
}

test('supported online components resume directly without opening the online screen', async () => {
    const f = directFixture();
    await resumeNative(f);
    assert.equal(f.Lampa.Activity.active(), f.origin, 'the series card must stay active behind playback');
    assert.equal(f.values.active_balanser, 'phantom');
    assert.equal(f.played[0].timeline.time, 321);
    assert.equal(f.destroyed(), 0, 'lazy playlist resolvers must remain available');
    f.Lampa.Player.destroy();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.destroyed(), 1, 'the detached resolver must be released on player close');
});

test('native resume waits for Lampac source discovery lasting a minute', async t => {
    t.mock.timers.enable({apis: ['setTimeout', 'setInterval']});
    const f = directFixture();
    const Constructor = f.Lampa.Component.get('lampac');
    f.Lampa.Component.get = () => function(context) {
        const instance = new Constructor(context);
        const render = instance.render;
        let ready = false;
        instance.render = () => ready ? render() : collection([]);
        setTimeout(() => {ready = true;}, 60000);
        return instance;
    };
    const result = f.api.createNativeOnline(f.Lampa).launch(series, onlineRecord())
        .then(() => ({success: true}), error => ({error: error.message}));
    await Promise.resolve();
    t.mock.timers.tick(60000);
    t.mock.timers.tick(100);
    assert.deepEqual(await result, {success: true});
    assert.equal(f.played[0].timeline.time, 321);
    assert.equal(f.Lampa.Activity.active(), f.origin);
});

test('native resume uses the saved provider list without waiting for availability probes', async () => {
    const f = directFixture();
    const Constructor = f.Lampa.Component.get('lampac');
    let requested = '';
    f.Lampa.Component.get = () => function(context) {
        const instance = new Constructor(context);
        const initialize = instance.initialize;
        instance.requestParams = url => {requested = url; return url;};
        instance.initialize = () => {
            const url = instance.requestParams('https://lampac.invalid/lite/events?life=true');
            // Availability probes can leave a saved, reachable provider hidden indefinitely.
            if (url.includes('life=false')) initialize();
        };
        return instance;
    };
    const result = await resumeNative(f).then(() => ({success:true}), error => ({error:error.message}));
    assert.deepEqual(result, {success:true});
    assert.equal(requested, 'https://lampac.invalid/lite/events?life=false');
    assert.equal(f.played[0].timeline.time, 321);
    assert.equal(f.values.active_balanser, 'phantom');
});

test('direct resume retains its resolver during the core next-episode transition', async () => {
    const f = directFixture();
    await resumeNative(f);
    const playlist = [f.played[0], {...f.item(2), isonline: true}];
    f.Lampa.PlayerPlaylist.set(playlist);
    f.Lampa.PlayerPlaylist.listener.send('select', {playlist, position: 1, item: playlist[1]});
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.destroyed(), 0);
    assert.equal(f.Lampa.Activity.active(), f.origin);
    f.Lampa.Player.destroy();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.destroyed(), 1);
});

test('direct resume dismisses the loading controller before the player starts', async () => {
    const f = directFixture();
    f.store.upsert(series, onlineRecord());
    let prepared = false;
    let preparedAtStart = false;
    f.Lampa.Player.listener.follow('start', () => {preparedAtStart = prepared;});
    const orchestrator = f.api.createResumeOrchestrator({store: f.store,
        online: f.api.createOnlineAdapter(f.Lampa, {}, f.api.createNativeOnline(f.Lampa, {timeoutMs: 100, pollMs: 1})),
        torrent: {resolve() {throw new Error('unexpected torrent');}}, launcher: {launch() {throw new Error('unexpected launcher');}}});
    await orchestrator.resume(series, () => {throw new Error('unexpected online screen');}, () => {prepared = true;});
    assert.equal(preparedAtStart, true, 'closing the loader after start steals navigation from the player');
    f.Lampa.Player.destroy();
    await new Promise(resolve => setTimeout(resolve, 5));
});

test('a detached resume releases its resolver and listeners when the source times out', async () => {
    const f = directFixture({noEpisodes: true});
    const listenersBefore = f.Lampa.Player.listener.count();
    await assert.rejects(resumeNative(f), /resume-online-timeout/);
    assert.equal(f.Lampa.Activity.active(), f.origin);
    assert.equal(f.destroyed(), 1);
    assert.equal(f.Lampa.Player.listener.count(), listenersBefore);
    assert.equal(f.played.length, 0);
});

test('the Continue icon reflects the saved percentage rather than a fixed arc', () => {
    const f = fixture();
    const arc = progress => {
        const html = f.api.renderButton(f.Lampa, 'S01E01', progress);
        const match = html.match(/stroke-dasharray="([\d.]+) 65\.97"/);
        assert.ok(match, 'Continue must display a watched-progress circle');
        return Number(match[1]);
    };
    assert.ok(Math.abs(arc({percent: 25}) - 16.49) < 0.02);
    assert.ok(Math.abs(arc({percent: 75}) - 49.48) < 0.02);
    assert.equal(arc({percent: 120}), 65.97);
    assert.equal(arc({percent: -10}), 0);
    assert.ok(Math.abs(arc({time: 900, duration: 1800}) - 32.98) < 0.02);
});

test('resume keeps the current episode below 90 percent and advances at 90 percent', () => {
    const f = fixture();
    const playlist = [f.item(1), f.item(2)];
    for (const percent of [85, 89.99]) {
        const record = {...onlineRecord(), progress:{percent, time:percent * 18, duration:1800}};
        const target = f.api.chooseResumeTarget(record, playlist);
        assert.equal(target.index, 0);
        assert.equal(target.time, record.progress.time);
    }
    for (const percent of [90, 99, 100]) {
        const target = f.api.chooseResumeTarget({...onlineRecord(), progress:{percent, time:percent * 18, duration:1800}}, playlist);
        assert.equal(target.index, 1);
        assert.equal(target.progress.time, 0);
        assert.equal(target.progress.percent, 0);
    }
});

test('the completion rule also derives 90 percent from elapsed time and duration', () => {
    const f = fixture();
    const target = f.api.chooseResumeTarget({...onlineRecord(), progress:{time:1620, duration:1800}}, [f.item(1), f.item(2)]);
    assert.equal(target.index, 1);
    assert.equal(target.progress.time, 0);
});

test('a completed final playlist item cannot silently restart the same watched episode', () => {
    const f = fixture();
    const record = {...onlineRecord(2), progress:{time:1620, duration:1800, percent:90}};
    assert.throws(() => f.api.chooseResumeTarget(record, [f.item(1), f.item(2)]), /resume-next-episode-missing/);
    assert.equal(record.progress.time, 1620);
});

test('the button offers the next episode at 90 percent and Continue below the threshold', () => {
    const f = fixture();
    assert.match(f.api.renderButton(f.Lampa, 'S01E01', {percent:89.99}), /Continue.*S01E01/);
    const next = f.api.renderButton(f.Lampa, 'S01E01', {percent:90});
    assert.match(next, /Next episode/);
    assert.doesNotMatch(next, /Continue.*S01E01/);
});

test('native direct resume starts the next episode from zero at the completion threshold', async () => {
    const f = directFixture();
    await resumeNative(f, {...onlineRecord(), progress:{time:1620, duration:1800, percent:90}});
    assert.equal(f.played[0].episode, 2);
    assert.equal(f.played[0].timeline.time, 0);
    f.Lampa.Player.destroy();
    await new Promise(resolve => setTimeout(resolve, 5));
});

test('native direct resume derives completion when only time and duration were saved', async () => {
    const f = directFixture();
    await resumeNative(f, {...onlineRecord(), progress:{time:1620, duration:1800}});
    assert.equal(f.played[0].episode, 2);
    assert.equal(f.played[0].timeline.time, 0);
    f.Lampa.Player.destroy();
    await new Promise(resolve => setTimeout(resolve, 5));
});

test('completion of the last episode resumes the first episode of the next season', async () => {
    const f = directFixture({seasonEpisodes:[[1,2],[1,2]]});
    const record = {...onlineRecord(2), progress:{time:1620, duration:1800, percent:90}};
    await resumeNative(f, record, {...series, number_of_seasons:2});
    assert.equal(f.played[0].season, 2);
    assert.equal(f.played[0].episode, 1);
    assert.equal(f.played[0].timeline.time, 0);
    assert.equal(record.episode.season, 1);
    assert.equal(record.episode.episode, 2);
    f.Lampa.Player.destroy();
    await new Promise(resolve => setTimeout(resolve, 5));
});

test('a completed final series episode keeps its progress when no next season exists', async () => {
    const f = directFixture();
    const record = {...onlineRecord(2), progress:{time:1620, duration:1800, percent:90}};
    await assert.rejects(resumeNative(f, record), /resume-next-episode-missing/);
    assert.equal(f.played.length, 0);
    assert.equal(f.roads.h2, undefined);
    assert.equal(record.progress.time, 1620);
});

test('loading the plugin after a full card restores its Continue button immediately', () => {
    let added = 0;
    const api = loadApi(html => ({on() {return this;},html}));
    const action = {length:1,after() {added++;}};
    const absent = {length:0,remove() {},last() {return this;}};
    const container = {length:1,last() {return this;},find(selector) {return selector==='.view--online' ? action : absent;}};
    const root = {find(selector) {return selector==='.full-start-new__buttons, .full-start__buttons' ? container : absent;}};
    const Lampa = {Listener:emitter(),Activity:{active:() => ({component:'full',card:series,activity:{render:()=>root}})}};
    const store = {find:()=>({modes:{online:onlineRecord()}}),subscribe:()=>()=>{}};
    const button = api.createResumeButton(Lampa,store,{resume() {throw new Error('unexpected playback');}});
    action.last=()=>action;
    button.start();
    assert.equal(added,1,'a deep link can finish rendering before external plugins load');
    button.stop();
});

const film = {source:'tmdb', id:603, media_type:'movie', title:'The Matrix', release_date:'1999-03-30'};
function filmRecord(percent = 2) {
    return {...onlineRecord(0), episode:{season:0, episode:0, timeline_hash:'film-hash'},
        progress:{time:152, duration:8589, percent}, online:{component:'lampac', balanser:'phantom', season_index:0, search:{title:film.title}}};
}

function cardButtonFixture(card, record) {
    const inserted = [];
    const api = loadApi(html => ({html, on(name, callback) {this[name] = callback; return this;}}));
    const action = {length:1, last() {return this;}, after(button) {inserted.push(button);}};
    const absent = {length:0, remove() {}, last() {return this;}};
    const container = {length:1, last() {return this;}, find(selector) {return selector==='.view--online' ? action : absent;}};
    const root = {find(selector) {return selector==='.full-start-new__buttons, .full-start__buttons' ? container : absent;}};
    const Lampa = {Listener:emitter(), Activity:{active:() => ({component:'full',card,activity:{render:()=>root}})}};
    const values = {};
    Lampa.Storage = {get(key, fallback) {return key in values ? values[key] : fallback;}, set(key, value) {values[key] = value;}};
    const store = api.createRecipeStore(Lampa);
    if (record) store.upsert(card,record);
    let resumed = null;
    const controller = api.createResumeButton(Lampa,store,{async resume(selected) {resumed = selected;}});
    controller.start();
    return {inserted, controller, resumed:()=>resumed};
}

test('the film card offers Continue and sends its own card to restoration', async () => {
    const f = cardButtonFixture(film,filmRecord());
    try {
        assert.equal(f.inserted.length,1,'saved film progress must create a card button');
        assert.match(f.inserted[0].html,/<span>Continue<\/span>/);
        assert.doesNotMatch(f.inserted[0].html,/S00E00|Next episode/);
        await f.inserted[0]['hover:enter']();
        assert.equal(f.resumed(),film);
    } finally {f.controller.stop();}
});

test('a film above 90 percent still offers Continue without an episode label', () => {
    const f = cardButtonFixture(film,filmRecord(95));
    try {
        assert.equal(f.inserted.length,1);
        assert.match(f.inserted[0].html,/<span>Continue<\/span>/);
        assert.doesNotMatch(f.inserted[0].html,/Next episode|S00E00/);
    } finally {f.controller.stop();}
});

test('a film without saved history has no Continue button', () => {
    const f = cardButtonFixture(film,null);
    try {assert.equal(f.inserted.length,0);} finally {f.controller.stop();}
});

test('a synchronized anime card retains its season and episode label', () => {
    const anime = {...series, id:1429, name:'Attack on Titan'};
    const f = cardButtonFixture(anime,onlineRecord(2));
    try {
        assert.equal(f.inserted.length,1);
        assert.match(f.inserted[0].html,/Continue.*S01E02/);
    } finally {f.controller.stop();}
});

test('film restoration above 90 percent keeps its saved position in a single-item playlist', () => {
    const api = loadApi();
    const item = {season:0,episode:0,timeline:{hash:'film-hash'},url:'https://example.test/film.mp4'};
    const target = api.chooseResumeTarget(filmRecord(95),[item]);
    assert.equal(target.item,item);
    assert.equal(target.time,152);
});

test('native film restoration above 90 percent starts the saved film rather than advancing episodes', async () => {
    const f = fixture(node=>collection([node]));
    const origin = {component:'full',movie:film};
    f.activate(origin);
    f.Lampa.Utils = {hash:value=>value};
    const node = {find(selector) {return selector==='.time-line' ? [{'data-hash':'film-hash'}] : [];},
        trigger() {f.Lampa.Player.play({card:film,season:0,episode:0,url:'https://example.test/film.mp4',
            timeline:{...f.Lampa.Timeline.view('film-hash'),duration:8589},isonline:true});}};
    f.Lampa.Component = {get() {return function (context) {
        const root = collection([{find:selector=>selector==='.online-prestige--full' ? [node] : []}]);
        this.create = ()=>root; this.render = ()=>root;
        this.initialize = ()=>{f.values.active_balanser=context.lampac_custom_select;}; this.destroy = ()=>{};
    };}};
    try {
        await f.api.createNativeOnline(f.Lampa,{timeoutMs:100,pollMs:1}).launch(film,filmRecord(95));
        assert.equal(f.played.length,1);
        assert.equal(f.played[0].timeline.time,152);
        assert.equal(f.Lampa.Activity.active(),origin);
    } finally {f.Lampa.Player.destroy(); await new Promise(resolve=>setTimeout(resolve,5));}
});

test('an unavailable saved provider fails before starting playback or changing history', async () => {
    const f = nativeFixture({missingPhantom: true});
    f.store.upsert(series, onlineRecord());
    const before = JSON.stringify(f.store.read());
    const listenersBefore = f.Lampa.Player.listener.count();
    await assert.rejects(resumeNative(f), /resume-online-source/);
    assert.equal(f.played.length, 0);
    assert.equal(Object.keys(f.roads).length, 0);
    assert.equal(JSON.stringify(f.store.read()), before);
    assert.equal(f.Lampa.Player.listener.count(), listenersBefore);
});

test('a resume timeout cannot navigate away from another title opened while waiting', async () => {
    const f = nativeFixture({noEpisodes: true});
    const listenersBefore = f.Lampa.Player.listener.count();
    const pending = resumeNative(f);
    const checked = assert.rejects(pending, /resume-online-timeout/);
    await new Promise(resolve => setTimeout(resolve, 5));
    const other = {component: 'full', movie: {...series, id: 9999}};
    f.activate(other);
    await checked;
    assert.equal(f.Lampa.Activity.active(), other);
    assert.equal(f.backCalls(), 0);
    assert.equal(f.played.length, 0);
    assert.equal(f.Lampa.Player.listener.count(), listenersBefore);
});

test('the orchestrator forwards saved activity context to the online opener', async () => {
    const f = nativeFixture({hiddenPhantom: true, duplicateButtons: true});
    f.store.upsert(series, onlineRecord());
    const orchestrator = f.api.createResumeOrchestrator({store: f.store,
        online: f.api.createOnlineAdapter(f.Lampa, {}, f.api.createNativeOnline(f.Lampa, {timeoutMs: 100, pollMs: 1})),
        torrent: {resolve() {throw new Error('unexpected torrent');}}, launcher: {launch() {throw new Error('unexpected launcher');}}});
    await orchestrator.resume(series, (mode, context) => f.api.openSameMode(f.event, mode, context, f.Lampa));
    assert.equal(f.selectedSource(), 'phantom');
});

test('saving the next episode retains unrelated titles and the torrent mode of this title', () => {
    const f = fixture();
    const unrelated = {...series, id: 9999, name: 'Unrelated'};
    f.store.upsert(unrelated, onlineRecord(3));
    const torrent = {mode: 'torrent', updated_at: 1000, episode: {season: 1, episode: 1}, progress: {time: 56},
        torrent: {infohash: 'A'.repeat(40), magnet: 'magnet:?xt=urn:btih:' + 'A'.repeat(40), file_path: 'Episode 1.mkv', file_index: 1}};
    f.store.upsert(series, torrent);
    const beforeOther = JSON.stringify(f.store.find(unrelated));
    const beforeTorrent = JSON.stringify(f.store.find(series).modes.torrent);
    const capture = f.api.createCapture(f.Lampa, f.store);
    capture.start();
    try {
        const playlist = [f.item(1, 321), f.item(2, 7)];
        f.Lampa.Player.play({...playlist[0], isonline: true, playlist});
        f.Lampa.PlayerPlaylist.listener.send('select', {playlist, position: 1, item: playlist[1]});
        assert.equal(f.store.find(series).modes.online.episode.episode, 2);
        assert.equal(JSON.stringify(f.store.find(unrelated)), beforeOther);
        assert.equal(JSON.stringify(f.store.find(series).modes.torrent), beforeTorrent);
    } finally {capture.stop();}
});

test('external online progress advances the episode and ignores the stale launch position', () => {
    const f = fixture();
    const capture = f.api.createCapture(f.Lampa, f.store);
    capture.start();
    try {
        const playlist = [f.item(1, 321), f.item(2)];
        const data = {...playlist[0], isonline: true, playlist};
        f.Lampa.Player.play(data);
        f.Lampa.Player.listener.send('external', data);
        f.Lampa.Timeline.update({hash: 'h2', time: 45, duration: 1800, percent: 2.5});
        assert.equal(f.store.find(series).modes.online.episode.episode, 2);
        assert.equal(f.store.find(series).modes.online.progress.time, 45);
        f.Lampa.Timeline.update({hash: 'h1', time: 321, duration: 1800, percent: 321 / 1800 * 100});
        assert.equal(f.store.find(series).modes.online.episode.episode, 2);
    } finally {capture.stop();}
});

test('playlist context is retained when the native plugin supplies its playlist after start', () => {
    const f = fixture();
    const capture = f.api.createCapture(f.Lampa, f.store);
    capture.start();
    try {
        const playlist = [f.item(1, 321), f.item(2, 7)];
        f.Lampa.Player.play({...playlist[0], isonline: true});
        f.Lampa.Player.playlist(playlist);
        f.Lampa.PlayerPlaylist.listener.send('select', {playlist, position: 1, item: playlist[1]});
        assert.equal(f.store.find(series).modes.online.episode.episode, 2);
        assert.equal(f.store.find(series).modes.online.online.balanser, 'phantom');
    } finally {capture.stop();}
});

test('the next episode imports into another client through the existing synchronization schema', () => {
    const sender = fixture();
    const receiver = fixture();
    receiver.store.upsert(series, onlineRecord());
    const capture = sender.api.createCapture(sender.Lampa, sender.store);
    capture.start();
    try {
        const playlist = [sender.item(1, 321), sender.item(2, 7)];
        sender.Lampa.Player.play({...playlist[0], isonline: true, playlist});
        sender.Lampa.PlayerPlaylist.listener.send('select', {playlist, position: 1, item: playlist[1]});
        receiver.values.lampac_resume_history_v1 = JSON.parse(JSON.stringify(sender.values.lampac_resume_history_v1));
        receiver.store.mergeSynced();
        const saved = receiver.api.createRecipeStore(receiver.Lampa).find(series).modes.online;
        assert.equal(saved.episode.episode, 2);
        assert.equal(saved.progress.time, 7);
        assert.equal(saved.online.balanser, 'phantom');
    } finally {capture.stop();}
});
