'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const nativeParse = require('./fixtures/lampa-episode-parser');
const source = fs.readFileSync(path.join(__dirname, '..', 'ContinueWatching.js'), 'utf8');
const api = vm.runInNewContext(source.replace('    return exports;',
    '    exports.createCapture = createCapture; exports.createRecipeStore = createRecipeStore;\n    return exports;'),
    {setTimeout, clearTimeout, setInterval, clearInterval, console});

const movie = {source:'tmdb', id:120, media_type:'movie', title:'Native torrent film',
    original_title:'Native torrent film', release_date:'2001-12-18'};
const infohash = 'B'.repeat(40);
const sharedHash = 'timeline:Native torrent film';

function emitter() {
    const listeners = [];
    return {
        follow(name, callback) {listeners.push({name, callback});},
        remove(name, callback) {const index = listeners.findIndex(item => item.name === name && item.callback === callback); if (index >= 0) listeners.splice(index, 1);},
        send(name, data) {listeners.filter(item => item.name === name).slice().forEach(item => item.callback(data));},
        count(name) {return listeners.filter(item => !name || item.name === name).length;}
    };
}

function fixture(coreTime, files = [{id:2, path:'01.Film.mkv'}]) {
    const values = {player_torrent:'android', playlist_next:false};
    const roads = {[sharedHash]:{time:coreTime, duration:13699, percent:coreTime / 13699 * 100},
        'timeline:99.Other.m2ts':{time:88, duration:2000, percent:4.4}};
    const origin = {component:'full', movie};
    let nativeRequest;
    let playlist = [];
    const Lampa = {
        Storage:{get(key, fallback) {return key in values ? values[key] : fallback;},
            set(key, value) {values[key] = value;}, field(key) {return values[key];}},
        Platform:{is:platform => platform === 'android'},
        Listener:emitter(),
        Activity:{active:() => origin, push() {throw new Error('Continue must not open a torrent activity');}},
        Timeline:{listener:emitter(),
            view(hash) {return {...roads[hash], hash, handler(percent, time, duration) {
                roads[hash] = {percent, time, duration};
                Lampa.Timeline.listener.send('update', {data:{hash, road:{percent, time, duration}}});
            }};}
        },
        Player:{listener:emitter(),
            play(data) {
                // Core emits create synchronously before handing data to Android.
                // Capture's earlier listener stages the new unconfirmed session first.
                let allowed = true;
                this.listener.send('create', {data, abort() {allowed = false;}});
                if (!allowed) return;
                // Android.openPlayer >=98 refreshes data and every playlist timeline
                // from core persistence before serializing for the native consumer.
                const refreshedData = {...data, timeline:Lampa.Timeline.view(data.timeline.hash)};
                const refreshedPlaylist = data.playlist.map(item => ({...item,
                    timeline:Lampa.Timeline.view(item.timeline.hash)}));
                // MainActivity chooses the current playlist element by stream URL;
                // JustPlayer converts that element's persisted seconds to milliseconds.
                const currentIndex = refreshedPlaylist.findIndex(item => item.url === refreshedData.url);
                const current = refreshedPlaylist[currentIndex];
                nativeRequest = {currentIndex, currentUrl:current.url, fileId:current.id,
                    dataTime:refreshedData.timeline.time, positionMs:current.timeline.time * 1000};
                Promise.resolve().then(() => this.listener.send('external', refreshedData));
            },
            playlist(items) {Lampa.PlayerPlaylist.set(items);}
        },
        PlayerPlaylist:{listener:emitter(), get:() => playlist,
            set(items) {playlist = items; this.listener.send('set', {playlist:items, position:nativeRequest.currentIndex});}},
        Torserver:{
            files(hash, success) {success({hash:infohash, file_stats:files});},
            clearFileName(items) {return items.map(file => ({...file, path_human:file.path.replace(/\.[^.]+$/, '')}));},
            parse(data) {const parsed = nativeParse(data); return {...parsed, hash:'timeline:' + parsed.hash_string};},
            stream(filePath, hash, id) {return 'https://fresh-torserver.test/stream/' + filePath + '?link=' + hash + '&index=' + id + '&play';}
        }
    };
    const record = {mode:'torrent', updated_at:1000,
        episode:{season:0, episode:0, timeline_hash:sharedHash},
        progress:{time:343, duration:13699, percent:2.5},
        torrent:{infohash, file_index:2, file_path:'01.Film.mkv', torrent_title:movie.title}};
    const orchestrator = api.createResumeOrchestrator({
        store:{find:() => ({last_mode:'torrent', modes:{torrent:record}})},
        torrent:api.createTorrentAdapter(Lampa),
        online:{resolve() {throw new Error('unexpected online mode');}},
        launcher:api.createPlayerLauncher(Lampa)
    });
    return {Lampa, roads, values, origin, record, orchestrator, nativeRequest:() => nativeRequest};
}

for (const coreTime of [0, 20]) {
    test('Android reread resumes saved torrent at 343 seconds when core Timeline is ' + coreTime, async () => {
        const f = fixture(coreTime);
        await f.orchestrator.resume(movie);
        assert.equal(f.nativeRequest().fileId, 2);
        assert.equal(f.nativeRequest().positionMs, 343000,
            'native seek must use the saved recipe after Android rereads core Timeline');
        assert.equal(f.nativeRequest().dataTime, 343);
        assert.equal(f.values.playlist_next, false, 'temporary native playlist setting is restored after external');
        assert.equal(f.Lampa.Player.listener.count(), 0, 'native priming and completion listeners must be released');
        assert.equal(f.Lampa.Activity.active(), f.origin);
    });
}

test('Android native current URL keeps the saved second file despite a shared film hash', async () => {
    const f = fixture(0, [{id:1, path:'00.Sample.mkv'}, {id:2, path:'01.Film.mkv'}, {id:3, path:'99.Other.m2ts'}]);
    await f.orchestrator.resume(movie);
    assert.equal(f.nativeRequest().currentIndex, 1);
    assert.equal(f.nativeRequest().fileId, 2);
    assert.match(f.nativeRequest().currentUrl, /\/01\.Film\.mkv\?link=B{40}&index=2&play$/);
    assert.deepEqual(f.roads['timeline:99.Other.m2ts'], {time:88, duration:2000, percent:4.4},
        'resuming one file must preserve another file with a different timeline hash');
    assert.equal(f.nativeRequest().positionMs, 343000,
        'the current second file must retain saved progress through native Timeline reread');
    assert.equal(f.Lampa.Player.listener.count(), 0);
});

test('native torrent priming preserves the previous confirmed external online progress with a shared hash', async () => {
    const f = fixture(365);
    const store = api.createRecipeStore(f.Lampa);
    const capture = api.createCapture(f.Lampa, store);
    capture.start();
    try {
        const oldOnline = {card:movie, isonline:true, season:0, episode:0,
            url:'https://online.test/film.mp4',
            timeline:{...f.Lampa.Timeline.view(sharedHash), time:365, duration:10705, percent:3.4},
            lampac_resume:{mode:'online', online:{component:'lampac', balanser:'phantom', search:{title:movie.title}}}};
        f.Lampa.Player.listener.send('create', {data:oldOnline, abort() {}});
        f.Lampa.Player.listener.send('external', oldOnline);
        const onlineBefore = JSON.parse(JSON.stringify(store.find(movie).modes.online));
        assert.equal(onlineBefore.progress.time, 365);
        store.upsert(movie, {...f.record, updated_at:Date.now() + 1000});
        const orchestrator = api.createResumeOrchestrator({store, torrent:api.createTorrentAdapter(f.Lampa),
            online:{resolve() {throw new Error('unexpected online mode');}}, launcher:api.createPlayerLauncher(f.Lampa)});
        await orchestrator.resume(movie);
        assert.deepEqual(JSON.parse(JSON.stringify(store.find(movie).modes.online)), onlineBefore,
            'new core Timeline progress must not be committed to the previous confirmed online session');
        assert.equal(f.nativeRequest().positionMs, 343000);
        assert.equal(store.find(movie).modes.torrent.progress.time, 343);
        assert.equal(f.Lampa.Player.listener.count('create'), 1, 'only capture remains after scoped native priming');
    } finally {capture.stop();}
    assert.equal(f.Lampa.Player.listener.count(), 0);
    assert.equal(f.Lampa.Timeline.listener.count(), 0);
});
