'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pluginFile = path.join(__dirname, '..', 'NewTorrents.js');
const source = fs.readFileSync(pluginFile, 'utf8');

function harness(seed) {
    const storage = Object.assign({}, seed || {});
    const runs = [];
    const plays = [];
    let storageListener = null;
    let active = { component: 'full' };
    let setting = null;

    const Lampa = {
        Storage: {
            field(name) { return storage[name]; },
            get(name) { return storage[name]; },
            set(name, value) {
                storage[name] = value;
                if (storageListener) storageListener({ name: name });
            },
            listener: {
                follow(type, fn) {
                    if (type === 'change') storageListener = fn;
                }
            }
        },
        SettingsApi: {
            addParam(config) {
                setting = config;
            }
        },
        Lang: {
            translate() {
                return 'Torrent player';
            }
        },
        Activity: {
            active() {
                return active;
            }
        },
        Player: {
            runas(mode) {
                runs.push(mode);
            },
            play(object) {
                plays.push(object);
                return 'played';
            }
        },
        Listener: {
            follow() {}
        }
    };

    const sandbox = {
        window: { Lampa: Lampa, appready: true, console: console },
        Lampa: Lampa,
        console: console,
        setInterval(fn) {
            fn();
            return 1;
        },
        clearInterval() {}
    };

    sandbox.window.window = sandbox.window;
    vm.runInNewContext(source, sandbox);

    return {
        Lampa: Lampa,
        storage: storage,
        runs: runs,
        plays: plays,
        get setting() { return setting; },
        setActive(value) { active = value; }
    };
}

{
    const h = harness({});
    assert.equal(h.storage.player_torrent, 'inner');
    assert.equal(h.storage.internal_torrclient, true);
    assert.equal(h.storage.new_torrents_v2_migrated, true);
    assert.ok(h.setting, 'player setting should be registered');
}

{
    const h = harness({
        new_torrents_v2_migrated: true,
        player_torrent: 'inner',
        internal_torrclient: true
    });

    h.Lampa.Player.play({
        url: 'http://127.0.0.1:8090/stream/movie.mkv?link=HASH&index=0&play',
        torrent_hash: 'HASH'
    });

    assert.deepEqual(h.runs, ['inner']);
    assert.equal(h.plays[0].launch_player, 'inner');
}

{
    const h = harness({
        new_torrents_v2_migrated: true,
        player_torrent: 'inner',
        internal_torrclient: true
    });

    h.Lampa.Player.play({ url: 'https://example.com/video.mp4' });
    assert.deepEqual(h.runs, []);
}

{
    const h = harness({
        new_torrents_v2_migrated: true,
        player_torrent: 'inner',
        internal_torrclient: true
    });

    h.setActive({ component: 'torrents' });
    h.Lampa.Player.play({ url: 'http://example/anything' });
    assert.deepEqual(h.runs, ['inner']);
}

{
    const h = harness({
        new_torrents_v2_migrated: true,
        player_torrent: 'inner',
        internal_torrclient: true
    });

    h.setting.onChange('android');
    assert.equal(h.storage.player_torrent, 'android');
    assert.equal(h.storage.internal_torrclient, false);

    h.Lampa.Player.play({
        torrent_hash: 'HASH',
        url: 'http://127.0.0.1:8090/stream/a?link=HASH&index=0'
    });

    assert.deepEqual(h.runs, []);
}

console.log('NewTorrents tests: OK');
