'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = process.env.FASTONLINE_FILE || path.join(__dirname, '..', 'FastOnline.js');
const raw = fs.readFileSync(filename, 'utf8');
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

// Expose existing closures in the test copy; the distributed plugin has no test API.
const source = raw.replace('    }! function() {', `    }
    window.api = { Extract: H, Playback: J, voices: M, sources: A,
        chooseSources: ee, discover: Y, account: N, server: x, settings: ae, handshake: W, probe: K };
    ! function() {`);
assert.notEqual(source, raw, 'closure instrumentation must match the plugin');

function fixture(values = {}, route = () => ({data: []})) {
    const storage = {...values}, requests = [], notices = [], settings = [], lists = [], flows = [], launches = [];
    const playerListeners = {}; let currentPlayData = {}, currentPlaylist = [];
    function Request() {
        this.timeout = () => {};
        this.silent = (url, ok, fail, data, options) => {
            requests.push({url, data, options});
            try {
                const response = route(new URL(url, 'https://lampac.fun'));
                if (response instanceof Error) { fail(response); return; }
                ok(options && options.dataType === 'text' && typeof response !== 'string'
                    ? JSON.stringify(response) : response);
            } catch (error) { fail(error); }
        };
        this.native = this.silent;
    }
    const context = {
        console, URL, URLSearchParams,
        window: {plugin_init: true, lampac_fastonline_plugin: true},
        location: {host: 'lampac.fun', protocol: 'https:'},
        document: {scripts: [{src: 'https://lampac.fun/sync/js/own-token'}]},
        setTimeout, clearTimeout,
        setInterval: () => 1, clearInterval: () => {},
        Lampa: {
            Reguest: Request,
            Arrays: {isArray: Array.isArray, isObject: v => v && typeof v === 'object',
                getKeys: Object.keys, remove: (a, v) => {const i = a.indexOf(v); if (i >= 0) a.splice(i, 1);},
                insert: (a, i, v) => a.splice(i, 0, v)},
            Utils: {hash: s => String(s), protocol: () => 'https://',
                addUrlComponent: (u, p) => u + (u.includes('?') ? '&' : '?') + p,
                shortText: s => s},
            Storage: {get: (key, fallback) => key in storage ? storage[key] : fallback,
                set: (key, value) => {storage[key] = value;}, field: key => storage[key]},
            Platform: {is: () => false},
            Manifest: {app_digital: 236},
            Timeline: {view: hash => ({hash})},
            Noty: {show: message => notices.push(message)},
            Controller: {enabled: () => ({name: 'content'}), toggle: () => {}},
            Player: {listener: {
                follow: (event,handler) => (playerListeners[event] ||= []).push(handler),
                remove: (event,handler) => {playerListeners[event] = (playerListeners[event] || []).filter(item=>item!==handler);}
                ,send: (event,data) => (playerListeners[event] || []).slice().forEach(handler => handler(data))
                }, playdata: () => currentPlayData,
                runas: () => {}, playlist: items => {currentPlaylist = items;}, play: data => {
                    // Actual Lampa core hides the quality selector by mutating a one-quality payload.
                    if (data.quality && Object.keys(data.quality).length === 1) delete data.quality;
                    currentPlayData = data;
                    launches.push(data);
                    (playerListeners.start || []).slice().forEach(handler => handler(data));
                },
                loading: () => {}, opened: () => false,
                getUrlQuality: quality => quality[Object.keys(quality)[0]].url},
            PlayerPanel: {setFlows: items => flows.push(items)},
            Settings: {listener: {follow: () => {}}},
            SettingsApi: {addParam: param => settings.push(param)},
            Select: {show: list => lists.push(list)},
        }
    };
    vm.runInNewContext(source, context, {filename, timeout: 2000});
    const movie = {id: 100, imdb_id: 'tt100', kinopoisk_id: 100,
        title: 'Film', original_title: 'Film', release_date: '2022-01-01'};
    return {api: context.window.api, context, storage, requests, notices, settings, lists, flows, launches,
        extract: new context.window.api.Extract({movie}),
        playback: new context.window.api.Playback({movie})};
}

test('stale foreign-server and BWA settings cannot redirect a source request', async () => {
    const f = fixture({online_servers: ['https://foreign.example'], online_use_bwa: true,
        online_bwa_code: 'foreign-token', online_sources: ['rezka']}, () => ({data: []}));
    await f.extract.source('rezka');
    assert.equal(new URL(f.requests[0].url).origin, 'https://lampac.fun');
    assert.equal(new URL(f.requests[0].url).pathname, '/lite/rezka');
});

test('old stored selections cannot reintroduce PidTor or arbitrary remote paths', () => {
    const f = fixture({online_sources: ['pidtor', 'PIDTOR', 'rc/pidtor', '//foreign.example', 'rezka']});
    assert.deepEqual(plain(f.api.sources()), ['rezka']);
});

test('source selection contains no PidTor entry', () => {
    const f = fixture();
    f.api.chooseSources();
    assert.equal(f.lists[0].items.some(item => /pidtor/i.test(item.source || '')), false);
});

test('settings offer Lampac sources without BWA or arbitrary-server controls', () => {
    const f = fixture();
    f.api.settings();
    const labels = f.settings.map(item => item.field.name).join(' ');
    assert.doesNotMatch(labels, /BWA|Добавить сервер|Список серверов/);
    assert.match(labels, /Источники|источников/);
});

test('request identity and connection belong to the own Lampac profile', () => {
    const f = fixture({lampac_unic_id: 'own-user', lampac_profile_id: 'profile 2', account_email: 'own@example.test'});
    f.context.window.rch_nws = {'lampac.fun': {connectionId: 'own-connection', type: 'web'}};
    const url = new URL(f.api.account('https://lampac.fun/lite/rezka'));
    assert.equal(url.searchParams.get('uid'), 'own-user');
    assert.equal(url.searchParams.get('profile_id'), 'profile 2');
    assert.equal(url.searchParams.get('account_email'), 'own@example.test');
    assert.equal(url.searchParams.get('token'), 'own-token');
    assert.equal(url.searchParams.get('nws_id'), 'own-connection');
});

test('different named translations are not joined by substring matching', () => {
    assert.equal(fixture().api.voices.compareVoice('LostFilm', 'LostFilm Original'), false);
});

test('unrecognized translations keep their names for independent grouping', () => {
    const items = [{translate: 'English Audio', quality: {'1080p': 'https://cdn.example/a'}},
        {translate: 'Japanese Audio', quality: {'1080p': 'https://cdn.example/b'}}];
    assert.deepEqual(plain(fixture().api.voices.renameTranslate(items)).map(i => i.translate),
        ['English Audio', 'Japanese Audio']);
});

test('same translation aliases still share one group', () => {
    const f = fixture();
    const items = f.api.voices.renameTranslate([{translate: 'Rezka Studio'}, {translate: 'HDrezka Studio'}]);
    assert.equal(f.api.voices.compareVoice(items[0].translate, items[1].translate), true);
});

test('equal numeric qualities merge across sources and remove duplicate reserves', () => {
    const f = fixture();
    const result = f.playback.getQuality([
        {quality: {'1080p': 'https://cdn.example/a or https://cdn.example/b'}},
        {quality: {'1080': 'https://cdn.example/a or https://cdn.example/c'}}
    ]);
    assert.deepEqual(Object.keys(result), ['1080p']);
    assert.equal(result['1080p'].url, 'https://cdn.example/a');
    assert.deepEqual(plain(result['1080p'].reserve), ['https://cdn.example/b', 'https://cdn.example/c']);
});

test('object-shaped quality retains all reserve URLs and skips invalid URLs', () => {
    const f = fixture();
    const result = f.playback.getQuality([{quality: {'1080p': {url: 'https://cdn.example/a',
        reserve: ['https://cdn.example/b', null, '', 'https://cdn.example/a']},
        '720p': null, '480p': {}, auto: undefined}}]);
    assert.deepEqual(Object.keys(result), ['1080p']);
    assert.deepEqual(plain(result['1080p'].reserve), ['https://cdn.example/b']);
});

test('quality menu selects the actual playing reserve', () => {
    const f = fixture();
    const quality = f.playback.getQuality([{quality: {'1080p': 'https://cdn.example/a or https://cdn.example/b'}}]);
    f.playback.setFlowsForQuality({quality, url: 'https://cdn.example/b'});
    assert.equal(f.flows[0].find(flow => flow.url === 'https://cdn.example/b').selected, true);
    assert.equal(f.flows[0].find(flow => flow.url === 'https://cdn.example/a').selected, false);
});

test('failed stream moves to another reserve and then to a lower quality without repeating', () => {
    const f = fixture();
    const quality = f.playback.getQuality([{quality: {'1080p': 'https://cdn.example/a or https://cdn.example/a or https://cdn.example/b',
        '720p': 'https://cdn.example/c'}}]);
    const data = {quality, url: 'https://cdn.example/a'};
    const voice = [{name: 'LostFilm', selected: true}];
    f.playback.getNextVoice(data, voice, url => {data.url = url;});
    assert.equal(data.url, 'https://cdn.example/b');
    f.playback.getNextVoice(data, voice, url => {data.url = url;});
    assert.equal(data.url, 'https://cdn.example/c');
    assert.equal(data.quality_switched, '720p');
});

test('successful sources are kept when another Lampac provider fails', async () => {
    const f = fixture({online_servers: ['lampac.fun'], online_sources: ['rezka', 'alloha']}, url => {
        if (url.pathname.endsWith('/alloha')) return new Error('offline');
        return {balanser: 'rezka', data: [{method: 'play', translate: 'LostFilm',
            quality: {'1080p': 'https://cdn.example/a'}}]};
    });
    const result = await f.extract.query({});
    assert.equal(result.length, 1);
    assert.equal(result[0][0].source_name, 'rezka');
});

test('resolved call errors are excluded while direct playable links remain', async () => {
    const f = fixture({online_servers: ['lampac.fun']}, () => ({error: 'no video'}));
    const result = await f.extract.links([[{method: 'call', url: 'https://lampac.fun/lite/rezka/video'},
        {method: 'play', translate: 'LostFilm', url: 'https://cdn.example/a'}]]);
    assert.equal(result.length, 1);
    assert.equal(result[0].url, 'https://cdn.example/a');
});

test('foreign resolver requests never receive account data or execute', async () => {
    const f = fixture({lampac_unic_id: 'private-user'}, () => ({url: 'https://cdn.example/a'}));
    const result = await f.extract.links([[{method: 'call', url: 'https://foreign.example/lite/rezka/video'}]]);
    assert.equal(f.requests.length, 0);
    assert.equal(result.length, 0);
});

test('series merge the same voice across providers and retain episode source labels', async () => {
    const f = fixture({online_selected_voice: {Film: 'LostFilm'}}, url => ({data: [{method: 'play',
        url: 'https://cdn.example/' + url.searchParams.get('provider'), e: 2, translate: 'LostFilm'}]}));
    const result = await f.extract.voice([
        {source_name: 'rezka', voice: [{name: 'LostFilm', source_name: 'rezka', url: 'https://lampac.fun/voice?provider=rezka'}]},
        {source_name: 'alloha', voice: [{name: 'LostFilm', source_name: 'alloha', url: 'https://lampac.fun/voice?provider=alloha'}]}
    ]);
    assert.equal(result.plays.length, 2);
    assert.deepEqual(plain(result.plays).map(item => item.source_name).sort(), ['alloha', 'rezka']);
    assert(result.plays.every(item => item.e === 2));
});

test('Lampac RCH response retries the same provider through the own handshake', async () => {
    let count = 0, handshakes = 0;
    const f = fixture({}, () => ++count === 1 ? {rch: true, nws: 'wss://lampac.fun/nws'} : {data: []});
    f.context.window.Online2RchHandshake = (response, done) => {handshakes++; done(); return true;};
    await f.extract.source('rezka');
    assert.equal(handshakes, 1);
    assert.equal(f.requests.length, 2);
    assert(f.requests.every(request => new URL(request.url).origin === 'https://lampac.fun'));
});

test('a timed-out RCH attempt cannot block subsequent reconnects', () => {
    const f = fixture();
    const timers = []; let reconnects = 0, failures = 0;
    f.context.setTimeout = fn => {timers.push(fn); return timers.length;};
    f.context.clearTimeout = () => {};
    f.context.NativeWsClient = function() {};
    f.context.window.rch_nws = {'lampac.fun': {Registry: () => {}}};
    f.context.window.nwsClient = {'lampac.fun': {connectionId: null, reconnect: () => {reconnects++;}}};
    f.api.handshake({rch: true}, () => {}, () => {failures++;});
    timers[0]();
    f.api.handshake({rch: true}, () => {}, () => {failures++;});
    assert.equal(reconnects, 2);
    timers[1]();
    assert.equal(failures, 2);
});

test('stale Lampac owner ID cannot bypass a disconnected socket reconnect', () => {
    const f = fixture(); let reconnects = 0, ready = 0;
    f.context.NativeWsClient = function() {};
    f.context.window.rch_nws = {'lampac.fun': {Registry: () => {}, connectionId: 'stale'}};
    f.context.window.nwsClient = {'lampac.fun': {connectionId: null, reconnect: done => {reconnects++; done();}}};
    f.api.handshake({rch: true}, () => {ready++;});
    assert.equal(reconnects, 1);
    assert.equal(ready, 1);
});

test('automatic quality exposes reserves with the playing reserve selected', () => {
    const f = fixture();
    const quality = f.playback.getQuality([{url: 'https://cdn.example/a or https://cdn.example/b'}]);
    f.playback.setFlowsForQuality({quality, url: 'https://cdn.example/b'});
    assert.equal(f.flows[0].length, 2);
    assert.equal(f.flows[0].find(flow => flow.url === 'https://cdn.example/b').selected, true);
});

test('HLS media probe does not disclose the Lampac AES key to the CDN', () => {
    const f = fixture({kit_aesgcmkey: 'private-key'}, () => '#EXTM3U');
    f.api.probe([{url: 'https://cdn.example/master.m3u8'}], () => {});
    assert.equal(f.requests[0].options.headers && f.requests[0].options.headers['X-Kit-AesGcm'], undefined);
});

test('full voice normalization keeps the original language variant separate', () => {
    const f = fixture();
    const voices = f.api.voices.renameTranslate([{translate:'LostFilm'}, {translate:'LostFilm Original'}]);
    assert.equal(f.api.voices.compareVoice(voices[0].translate, voices[1].translate), false);
});

test('movie launch carries the selected stream headers and segments', async () => {
    const f = fixture({player: 'inner'});
    f.playback.movie({translates: [{method:'play', translate:'LostFilm', url:'https://cdn.example/a',
        quality:{'1080p':'https://cdn.example/a'}, headers:{Referer:'https://video.example'},
        segments:[{start:0,end:12}], hls_manifest_timeout:30, subtitles_call:'https://lampac.fun/subs'}]});
    await new Promise(setImmediate);
    assert.equal(f.launches.length, 1);
    assert.deepEqual(plain(f.launches[0].headers), {Referer:'https://video.example'});
    assert.deepEqual(plain(f.launches[0].segments), [{start:0,end:12}]);
    assert.equal(f.launches[0].hls_manifest_timeout, 30);
    assert.equal(f.launches[0].subtitles_call, 'https://lampac.fun/subs');
});

test('inner TV launch carries the selected episode headers, segments and subtitles', async () => {
    const f = fixture({player:'inner'});
    const episode = {number:2,title:'Episode 2',timeline:{hash:'episode2'},mark:()=>{}};
    f.playback.tv({translates:[{name:'LostFilm'}], sources:[], plays:[{e:2,method:'play',translate:'LostFilm',
        url:'https://cdn.example/e2',headers:{Referer:'https://video.example'},
        segments:[{start:0,end:9}],subtitles:[{label:'EN',url:'https://cdn.example/sub.vtt'}]}]}, [episode], episode);
    await new Promise(setImmediate);
    assert.equal(f.launches.length, 1);
    assert.deepEqual(plain(f.launches[0].headers), {Referer:'https://video.example'});
    assert.deepEqual(plain(f.launches[0].segments), [{start:0,end:9}]);
    assert.equal(f.launches[0].subtitles[0].label, 'EN');
});

test('nested reserve objects retain their own media headers', () => {
    const f = fixture();
    const quality = f.playback.getQuality([{quality:{'1080p':{url:'https://cdn.example/a',headers:{Referer:'A'},
        reserve:[{url:'https://cdn.example/b',headers:{Referer:'B'}}]}}}]);
    const data = {quality,url:'https://cdn.example/a'};
    f.playback.applyStreamData(data);
    f.playback.getNextVoice(data,[{selected:true,name:'LostFilm'}],()=>{});
    assert.deepEqual(plain(data.headers), {Referer:'B'});
});

test('manual quality selection applies new metadata before the player reload callback', () => {
    const f = fixture();
    const quality = f.playback.getQuality([
        {quality:{'1080p':'https://cdn.example/a'},headers:{Referer:'A'}},
        {quality:{'720p':'https://cdn.example/b'},headers:{Referer:'B'}}]);
    const data = f.playback.applyStreamData({quality,url:'https://cdn.example/a'});
    f.context.Lampa.Player.playdata = () => data;
    let observed;
    const reload = url => { observed = {url,headers:plain(data.headers)}; };
    if (quality['720p'].call) quality['720p'].call(quality['720p'],reload);
    else reload(quality['720p'].url);
    assert.deepEqual(observed, {url:'https://cdn.example/b',headers:{Referer:'B'}});
});

test('manual flow selection applies new metadata before sending the player event', () => {
    const f = fixture();
    const quality = f.playback.getQuality([
        {quality:{'1080p':'https://cdn.example/a'},headers:{Referer:'A'}},
        {quality:{'1080p':'https://cdn.example/b'},headers:{Referer:'B'}}]);
    const data = f.playback.applyStreamData({quality,url:'https://cdn.example/a'});
    f.context.Lampa.Player.playdata = () => data;
    let observed;
    f.context.Lampa.PlayerPanel.listener = {send:(event,item)=> {observed={event,url:item.url,headers:plain(data.headers)};}};
    f.playback.setFlowsForQuality(data);
    const target = f.flows[0].find(flow=>flow.url==='https://cdn.example/b');
    if (target.onSelect) target.onSelect(target);
    else f.context.Lampa.PlayerPanel.listener.send('flow',target);
    assert.deepEqual(observed, {event:'flow',url:'https://cdn.example/b',headers:{Referer:'B'}});
});

test('one-quality movie retains reserve flow menu and failover after Lampa deletes quality', async () => {
    const f = fixture({player:'inner'});
    f.playback.movie({translates:[
        {method:'play',translate:'LostFilm',quality:{'1080p':'https://cdn.example/a'},headers:{Referer:'A'}},
        {method:'play',translate:'LostFilm',quality:{'1080p':'https://cdn.example/b'},headers:{Referer:'B'}}]});
    await new Promise(setImmediate);
    assert(f.flows.some(items=>Array.isArray(items) && items.length===2), 'merged reserves remain selectable after core launch');
    const data = f.launches[0];
    f.playback.getNextVoice(data,[{name:'LostFilm',selected:true}],()=>{});
    assert.equal(data.url,'https://cdn.example/b');
    assert.deepEqual(plain(data.headers),{Referer:'B'});
});

test('one-quality TV episode retains reserve flows after the core launch', async () => {
    const f = fixture({player:'inner'});
    const episode = {number:2,title:'Episode 2',timeline:{hash:'episode2'},mark:()=>{}};
    f.playback.tv({translates:[{name:'LostFilm'}],sources:[],plays:[
        {e:2,method:'play',translate:'LostFilm',quality:{'720p':'https://cdn.example/e2a'}},
        {e:2,method:'play',translate:'LostFilm',quality:{'720p':'https://cdn.example/e2b'}}]},[episode],episode);
    await new Promise(setImmediate);
    assert(f.flows.some(items=>Array.isArray(items) && items.length===2), 'episode reserves remain selectable after core launch');
});

test('TV reserve menu survives the core destroy/start cycle when advancing episodes', async () => {
    const f = fixture({player:'inner'}); let playlist;
    f.context.Lampa.Player.playlist = items => {playlist=items;};
    const episodes = [2,3].map(number=>({number,title:'Episode '+number,timeline:{hash:'e'+number},mark:()=>{}}));
    f.playback.tv({translates:[{name:'LostFilm'}],sources:[],plays:[
        {e:2,method:'play',translate:'LostFilm',quality:{'720p':'https://cdn.example/e2a or https://cdn.example/e2b'}},
        {e:3,method:'play',translate:'LostFilm',quality:{'720p':'https://cdn.example/e3a or https://cdn.example/e3b'}}]},episodes,episodes[0]);
    await new Promise(setImmediate);
    await new Promise(resolve=>playlist[1].url(resolve));
    f.context.Lampa.Player.listener.send('destroy');
    f.context.Lampa.Player.play(playlist[1]);
    assert.deepEqual(plain(f.flows.at(-1)).map(flow=>flow.url),['https://cdn.example/e3a','https://cdn.example/e3b']);
});
