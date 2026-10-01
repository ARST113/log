'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'ContinueWatching.js'), 'utf8');
const marker = '    return exports;';
assert.equal(source.split(marker).length, 2, 'the production bundle must have one export boundary');
const api = vm.runInThisContext(source.replace(marker,
    '    exports.cardIdentity = cardIdentity; exports.createRecipeStore = createRecipeStore; exports.createCapture = createCapture; exports.mergeHistory = mergeHistory;\n' + marker));
const series = {source: 'tmdb', id: 42, media_type: 'tv', number_of_seasons: 2, name: 'Synthetic series'};
const movie = {source: 'tmdb', id: 42, media_type: 'movie', title: 'Synthetic movie', release_date: '2021-01-01'};
function emitter() {
    const callbacks = [];
    return {
        follow(name, fn) {callbacks.push({name, fn});},
        remove(name, fn) {const i = callbacks.findIndex(item => item.name === name && item.fn === fn); if (i >= 0) callbacks.splice(i, 1);},
        send(name, data) {callbacks.filter(item => item.name === name).forEach(item => item.fn(data));}
    };
}
function fixture() {
    const values = {};
    const Lampa = {
        Storage: {get(key, fallback) {return key in values ? values[key] : fallback;}, set(key, value) {values[key] = value;}},
        Player: {listener: emitter()}, PlayerPlaylist: {listener: emitter()}, Timeline: {listener: emitter()}, Listener: emitter()
    };
    return {Lampa, values, store: api.createRecipeStore(Lampa)};
}
function record(time, episode = 4) {
    return {mode: 'online', updated_at: time, episode: {season: episode ? 1 : 0, episode},
        progress: {time, duration: 4428}, online: {balanser: 'spectre', search: {title: episode ? series.name : movie.title, year: 2021}}};
}
function play(Lampa, card, time, episode) {
    const item = {card, season: episode ? 1 : 0, episode, timeline: {hash: episode ? 'series-s1e4' : 'movie', time, duration: 4428},
        lampac_resume: {mode: 'online', online: {balanser: 'spectre', search: {title: card.name || card.title, year: 2021}}}};
    Lampa.Player.listener.send('create', {data: item});
    Lampa.Player.listener.send('start', item);
}
test('published player capture preserves S1E4 after a film with the same TMDB ID', () => {
    const {Lampa, store} = fixture();
    const capture = api.createCapture(Lampa, store);
    capture.start();
    try {
        play(Lampa, series, 2066, 4);
        play(Lampa, movie, 120, 0);
        const reopened = api.createRecipeStore(Lampa);
        assert.equal(reopened.find(series).modes.online.episode.episode, 4);
        assert.equal(reopened.find(series).modes.online.progress.time, 2066);
        assert.equal(reopened.find(movie).modes.online.progress.time, 120);
        assert.equal(Object.keys(reopened.read().cards).length, 2);
    } finally {capture.stop();}
});
test('existing series keys remain readable without migrating saved history', () => {
    const {store} = fixture();
    store.upsert(series, record(2066));
    assert.equal(api.cardIdentity(series).key, 'tmdb:42');
    assert.equal(store.read().cards['tmdb:42'].modes.online.progress.time, 2066);
});
test('native films without media_type cannot overwrite a series', () => {
    const {store} = fixture();
    store.upsert(series, record(2066));
    store.upsert({source: 'tmdb', id: 42, title: movie.title, release_date: movie.release_date}, record(120, 0));
    assert.equal(store.find(series).modes.online.episode.episode, 4);
});
test('movie aliases still join the same film across catalogs without joining TV aliases', () => {
    const {Lampa, store} = fixture();
    store.upsert({...movie, imdb_id: 'tt1000002'}, record(120, 0));
    const reloaded = api.createRecipeStore(Lampa);
    assert.equal(reloaded.find({source: 'cub', id: 900, media_type: 'movie', imdb_id: 'tt1000002'}).modes.online.progress.time, 120);
    assert.equal(reloaded.find({...series, imdb_id: 'tt1000002'}), null);
});
test('synchronized film and series records are merged independently', () => {
    const first = fixture().store;
    const second = fixture().store;
    first.upsert(series, record(2066));
    second.upsert(movie, record(3000, 0));
    const history = api.mergeHistory(first.read(), second.read());
    assert.equal(Object.keys(history.cards).length, 2);
    assert.equal(history.cards[api.cardIdentity(series).key].modes.online.episode.episode, 4);
    assert.equal(history.cards[api.cardIdentity(movie).key].modes.online.episode.episode, 0);
});
