'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const nativeParse = require('./fixtures/lampa-episode-parser');

const source = fs.readFileSync(path.join(__dirname, '..', 'ContinueWatching.js'), 'utf8');
const marker = '    return exports;';
const api = vm.runInNewContext(source.replace(marker,
    '    exports.createCapture = createCapture; exports.createRecipeStore = createRecipeStore; exports.itemMatch = itemMatch; exports.sameItem = sameItem;\n' + marker),
    {setTimeout, clearTimeout, setInterval, clearInterval, console});
const infohash = 'A'.repeat(40);
const movie = {source:'tmdb', id:880001, media_type:'movie', title:'Torrent film', original_title:'Torrent film', release_date:'2021-01-01'};
const series = {source:'tmdb', id:880001, media_type:'tv', name:'Torrent series', original_title:'Torrent series', number_of_seasons:2};

function emitter() {
    const listeners = [];
    return {
        follow(name, callback) {listeners.push({name, callback});},
        remove(name, callback) {const index = listeners.findIndex(item => item.name === name && item.callback === callback); if (index >= 0) listeners.splice(index, 1);},
        send(name, data) {listeners.filter(item => item.name === name).slice().forEach(item => item.callback(data));}
    };
}

function filename(file) {
    return file.path.split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
}

function nativeInfo(card, file) {
    const parsed = nativeParse({movie:card, path:file.path, filename:filename(file), is_file:/\.(vob|m2ts)$/i.test(file.path)});
    return {...parsed, hash:'timeline:' + parsed.hash_string};
}

function savedRecord(card, file, percent = 18) {
    const parsed = nativeInfo(card, file);
    return {mode:'torrent', updated_at:1000,
        episode:{season:parsed.season, episode:parsed.episode, timeline_hash:parsed.hash},
        progress:{time:321, duration:1800, percent},
        torrent:{infohash, file_index:file.id, file_path:file.path, torrent_title:card.title || card.name}};
}

function fixture(card, files, {external = false} = {}) {
    const values = {};
    const roads = {};
    const played = [];
    const viewedWrites = [];
    const origin = {component:'full', movie:card};
    let playlist = [];
    let current = null;
    const Lampa = {
        Storage:{get(key, fallback) {return key in values ? values[key] : fallback;}, set(key, value) {values[key] = value;}, field(key) {return values[key];}},
        Activity:{active:() => origin, push() {throw new Error('torrent continuation must keep the full card active');}},
        Platform:{is:() => false}, Listener:emitter(),
        Timeline:{listener:emitter(),
            view(hash) {return {...roads[hash], hash, handler(percent, time, duration) {Lampa.Timeline.update({hash, percent, time, duration});}};},
            update(data) {const road = {time:data.time || 0, duration:data.duration || 0, percent:data.percent || 0}; roads[data.hash] = road; this.listener.send('update', {data:{hash:data.hash, road}});}},
        Player:{listener:emitter(), opened:() => Boolean(current),
            play(data) {
                this.listener.send('create', {data});
                current = data;
                played.push(data);
                if (external) Promise.resolve().then(() => this.listener.send('external', data));
                else this.listener.send('start', data);
            },
            playlist(items) {Lampa.PlayerPlaylist.set(items);},
            destroy() {current = null; this.listener.send('destroy', {});}},
        PlayerPlaylist:{listener:emitter(), get:() => playlist,
            set(items) {
                playlist = items;
                // Native Lampa chooses the position by the current URL before episode.
                const position = Math.max(0, items.findIndex(item => item.url === (current && current.url)));
                this.listener.send('set', {playlist:items, position});
            }},
        Torserver:{
            files(hash, success) {success({hash:infohash, file_stats:files});},
            clearFileName(items) {return items.map(file => ({...file, path_human:filename(file)}));},
            parse(data) {const parsed = nativeParse(data); return {...parsed, hash:'timeline:' + parsed.hash_string};},
            stream(filePath, hash, id) {return 'https://fresh-torserver.test/stream/' + encodeURIComponent(filePath) + '?link=' + hash + '&index=' + id + '&play';},
            viewed(hash, success) {success([]);},
            viewedSet(hash, id, timecode) {viewedWrites.push({hash, id, timecode});}}
    };
    // These core listeners are installed before the plugin. Native select destroys
    // the old player, plays the new item synchronously, then restores the playlist.
    Lampa.Player.listener.follow('destroy', () => {playlist = [];});
    Lampa.PlayerPlaylist.listener.follow('select', event => {
        const retained = playlist;
        Lampa.Player.destroy();
        event.item.continue_play = true;
        Lampa.Player.play(event.item);
        Lampa.PlayerPlaylist.set(retained);
    });
    const store = api.createRecipeStore(Lampa);
    const writer = api.createTorrentTimecodeWriter(Lampa);
    const capture = api.createCapture(Lampa, store, {writeTorrentTimecode:writer.write});
    const adapter = api.createTorrentAdapter(Lampa, {timeoutMs:100, pollMs:1});
    const orchestrator = api.createResumeOrchestrator({store, torrent:adapter,
        online:{resolve() {throw new Error('unexpected online mode');}}, launcher:api.createPlayerLauncher(Lampa)});
    return {Lampa, values, played, viewedWrites, origin, store, capture, orchestrator,
        item(file, time = 7) {const parsed = nativeInfo(card, file); return {...file, card, season:parsed.season, episode:parsed.episode,
            torrent_hash:infohash, url:Lampa.Torserver.stream(file.path, infohash, file.id), timeline:{...Lampa.Timeline.view(parsed.hash), time, duration:1800}};}};
}

test('film card resumes its saved non-first torrent file even above 90 percent', async () => {
    const files = [{id:1, path:'00.Sample.mkv'}, {id:2, path:'Film.1080p.mkv'}];
    const f = fixture(movie, files);
    f.store.upsert(movie, savedRecord(movie, files[1], 95));
    await f.orchestrator.resume(movie, () => {throw new Error('must not open the Torrent screen');});
    assert.equal(f.played[0].id, 2);
    assert.equal(f.played[0].timeline.time, 321);
    assert.equal(f.Lampa.Activity.active(), f.origin);
});

test('torrent TV completion advances from the saved file when episode hashes collide', async () => {
    const files = [{id:1, path:'Series.S01E01.A.mkv'}, {id:2, path:'Series.S01E01.B.mkv'}, {id:3, path:'Series.S01E02.mkv'}];
    const f = fixture(series, files);
    f.store.upsert(series, savedRecord(series, files[1], 90));
    await f.orchestrator.resume(series);
    assert.equal(f.played[0].id, 3);
    assert.equal(f.played[0].episode, 2);
    assert.equal(f.played[0].timeline.time, 0);
});

test('torrent TV below the completion threshold keeps the saved file and position', async () => {
    const files = [{id:1, path:'Series.S01E01.A.mkv'}, {id:2, path:'Series.S01E01.B.mkv'}, {id:3, path:'Series.S01E02.mkv'}];
    const f = fixture(series, files);
    f.store.upsert(series, savedRecord(series, files[1], 89.99));
    await f.orchestrator.resume(series);
    assert.equal(f.played[0].id, 2);
    assert.equal(f.played[0].timeline.time, 321);
});

test('a completed final torrent file errors instead of replaying another file with the same episode hash', async () => {
    const files = [{id:1, path:'Series.S01E01.A.mkv'}, {id:2, path:'Series.S01E01.B.mkv'}];
    const f = fixture(series, files);
    f.store.upsert(series, savedRecord(series, files[1], 90));
    const before = JSON.stringify(f.store.read());
    await assert.rejects(f.orchestrator.resume(series), /resume-next-episode-missing/);
    assert.equal(f.played.length, 0);
    assert.equal(JSON.stringify(f.store.read()), before);
});

for (const extension of ['m2ts', 'vob']) {
    test(extension + ' restoration retains native individual-file timeline and saved position', async () => {
        const files = [{id:1, path:'Disc/part-a.' + extension}, {id:2, path:'Disc/part-b.' + extension}];
        const f = fixture(movie, files);
        f.store.upsert(movie, savedRecord(movie, files[1], 95));
        await f.orchestrator.resume(movie);
        assert.equal(f.played[0].id, 2);
        assert.equal(f.played[0].timeline.hash, 'timeline:Disc/part-b.' + extension);
        assert.equal(f.played[0].timeline.time, 321);
    });
}

test('direct launcher capture keeps the second film file after its late playlist set', async () => {
    const files = [{id:1, path:'00.Sample.mkv'}, {id:2, path:'Film.mkv'}, {id:3, path:'99.Sample.mkv'}];
    const f = fixture(movie, files);
    f.store.upsert(movie, savedRecord(movie, files[1]));
    f.capture.start();
    try {
        await f.orchestrator.resume(movie);
        f.Lampa.Timeline.update({hash:'timeline:Torrent film', time:600, duration:7200, percent:8.3});
        f.Lampa.Player.destroy();
        const saved = f.store.find(movie).modes.torrent;
        assert.equal(saved.torrent.file_index, 2);
        assert.equal(saved.torrent.file_path, 'Film.mkv');
        assert.equal(saved.progress.time, 600);
    } finally {f.capture.stop();}
});

test('torrent capture identifies the selected file before matching its shared film timeline', () => {
    const files = [{id:1, path:'00.Sample.mkv'}, {id:2, path:'Film.mkv'}];
    const f = fixture(movie, files);
    const playlist = files.map(file => f.item(file));
    assert.equal(api.itemMatch(playlist, {...playlist[1]}).id, 2);
    assert.equal(api.sameItem(playlist[0], playlist[1]), false);
    assert.equal(api.sameItem(playlist[1], {...playlist[1]}), true);
});

test('native torrent file capture preserves the selected film through play, playlist, and onenter', () => {
    const files = [{id:1, path:'00.Sample.mkv'}, {id:2, path:'Film.mkv'}, {id:3, path:'99.Sample.mkv'}];
    const f = fixture(movie, files);
    const playlist = files.map(file => f.item(file));
    const data = {...playlist[1], playlist};
    f.capture.start();
    try {
        f.Lampa.Player.play(data);
        f.Lampa.Player.playlist(playlist);
        f.Lampa.Listener.send('torrent_file', {type:'onenter', element:data, params:{movie}});
        f.Lampa.Timeline.update({hash:'timeline:Torrent film', time:600, duration:7200, percent:8.3});
        f.Lampa.Player.destroy();
        const saved = f.store.find(movie).modes.torrent;
        assert.equal(saved.torrent.file_index, 2);
        assert.equal(saved.torrent.file_path, 'Film.mkv');
        assert.equal(saved.progress.time, 600);
    } finally {f.capture.stop();}
});

test('core playlist selection changes the current film file even when its timeline hash is shared', () => {
    const files = [{id:1, path:'Film.A.mkv'}, {id:2, path:'Film.B.mkv'}, {id:3, path:'Film.C.mkv'}];
    const f = fixture(movie, files);
    const playlist = files.map(file => f.item(file));
    f.capture.start();
    try {
        f.Lampa.Player.play({...playlist[0], playlist});
        f.Lampa.Player.playlist(playlist);
        f.Lampa.PlayerPlaylist.listener.send('select', {playlist, position:1, item:playlist[1]});
        f.Lampa.Timeline.update({hash:'timeline:Torrent film', time:72, duration:7200, percent:1});
        f.Lampa.Player.destroy();
        const saved = f.store.find(movie).modes.torrent;
        assert.equal(saved.torrent.file_index, 2);
        assert.equal(saved.progress.time, 72);
    } finally {f.capture.stop();}
});

test('asynchronous external launch keeps the selected film file with a shared timeline hash', async () => {
    const files = [{id:1, path:'00.Sample.mkv'}, {id:2, path:'Film.mkv'}, {id:3, path:'99.Sample.mkv'}];
    const f = fixture(movie, files, {external:true});
    f.store.upsert(movie, savedRecord(movie, files[1]));
    f.capture.start();
    try {
        await f.orchestrator.resume(movie);
        f.Lampa.Timeline.update({hash:'timeline:Torrent film', time:600, duration:7200, percent:8.3});
        const saved = f.store.find(movie).modes.torrent;
        assert.equal(saved.torrent.file_index, 2);
        assert.equal(saved.progress.time, 600);
    } finally {f.capture.stop();}
});

test('external series progress still follows a distinct episode hash and writes its correct file timecode', async () => {
    const files = [{id:1, path:'Series.S01E01.mkv'}, {id:2, path:'Series.S01E02.mkv'}];
    const f = fixture(series, files, {external:true});
    f.values.torrserver_tracktimecode = true;
    f.store.upsert(series, savedRecord(series, files[0]));
    f.capture.start();
    try {
        await f.orchestrator.resume(series);
        f.Lampa.Timeline.update({hash:'timeline:12Torrent series', time:45, duration:1800, percent:2.5});
        const saved = f.store.find(series).modes.torrent;
        assert.equal(saved.episode.episode, 2);
        assert.equal(saved.torrent.file_index, 2);
        assert.equal(saved.progress.time, 45);
        assert.deepEqual(f.viewedWrites.at(-1), {hash:infohash, id:2, timecode:45});
    } finally {f.capture.stop();}
});
