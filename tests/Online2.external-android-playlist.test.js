'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pluginFile = path.join(__dirname, '..', 'Online2.js');
const source = fs.readFileSync(pluginFile, 'utf8');
const context = {
  setTimeout,
  clearTimeout,
  window: { __ONLINE2_TEST_MODE__: true }
};

vm.runInNewContext(source, context, { filename: pluginFile });
const api = context.window.Online2Test;

assert(api, 'test API must be exported');
assert.equal(api.concurrency, 1, 'RCH pre-resolution must stay sequential');
assert.equal(api.itemTimeout, 9000);
assert.equal(api.globalTimeout, 15000);
assert.equal(api.previous, 1);
assert.equal(api.next, 2);
assert(source.includes("item.season && Lampa.Platform.is('android') && Lampa.Storage.field('player') !== 'inner'"));
assert(source.includes('window.Online2RchHandshake = function(response, ready)'), 'Online2 must expose the narrow RCH compatibility hook');
assert(source.includes('rchRun(response, function()'), 'the hook must pass the full response to the existing RCH owner');

const builderSource = source.slice(
  source.indexOf('this.buildExternalAndroidPlaylist'),
  source.indexOf('this.display = function')
);
assert(!builderSource.includes('elem.stream'), 'raw call endpoint must not enter the Android playlist builder');
assert(!builderSource.includes('elem.mark()'), 'pre-resolution must not mark an episode watched');

const mark = function mark() {};
const target = {
  title: 'Episode 2',
  callback: mark,
  subtitles: ['fallback']
};
const applied = api.applyResolvedPlaylistData(target, {
  qualitys: { '1080p': 'source-quality' },
  segments: { intro: [0, 10] }
}, {
  url: 'https://cdn.example/episode-2.m3u8',
  headers: { Referer: 'https://example.test/' },
  subtitles_call: 'https://example.test/subtitles'
}, {
  quality: { '720p': 'resolved-quality' },
  segments: { intro: [1, 11] },
  hls_manifest_timeout: 9000
});

assert.equal(applied, true);
assert.equal(target.url, 'https://cdn.example/episode-2.m3u8');
assert.deepEqual(target.headers, { Referer: 'https://example.test/' });
assert.deepEqual(target.quality, { '720p': 'resolved-quality' });
assert.deepEqual(target.segments, { intro: [1, 11] });
assert.deepEqual(target.subtitles, ['fallback'], 'existing subtitles survive when resolver does not replace them');
assert.equal(target.subtitles_call, 'https://example.test/subtitles');
assert.equal(target.hls_manifest_timeout, 9000);
assert.strictEqual(target.callback, mark, 'watch mark callback must be preserved');

const rejected = { title: 'Episode 3' };
assert.equal(api.applyResolvedPlaylistData(rejected, {}, { rch: true }, {}), false);
assert.equal(rejected.url, undefined, 'RCH handshake payload is not a playable URL');

async function queueAndContiguousFailureTest() {
  const items = [
    { title: 'Episode 1', method: 'call' },
    { title: 'Episode 2', method: 'call' },
    { title: 'Episode 3', method: 'call' },
    { title: 'Episode 4', method: 'call' }
  ];
  const calls = [];
  let active = 0;
  let maxActive = 0;

  const results = await new Promise((resolve) => {
    api.resolveExternalAndroidPlaylist(items, 0, (item, done) => {
      calls.push(item.title);
      active++;
      maxActive = Math.max(maxActive, active);
      setTimeout(() => {
        active--;
        if (item.title === 'Episode 2') done({ rch: true }, {});
        else done({ url: `https://cdn.example/${item.title}.m3u8` }, { segments: { intro: [0, 5] } });
        done({ url: 'https://cdn.example/duplicate.m3u8' }, {});
      }, 2);
    }, resolve);
  });

  assert.deepEqual(calls, ['Episode 2', 'Episode 3'], 'only the +2 bounded lookahead is resolved');
  assert.equal(maxActive, 1, 'resolver must not create an RCH request storm');
  assert.equal(results[1], null, 'RCH handshake payload is rejected');
  assert.equal(results[2].stream.url, 'https://cdn.example/Episode 3.m3u8');
  assert.equal(results[3], undefined, 'items outside the bounded window are untouched');

  const current = { title: 'Episode 1', url: 'https://cdn.example/episode-1.m3u8' };
  const episode3 = { title: 'Episode 3', url: results[2].stream.url };
  const playlist = api.contiguousPlaylistWindow([current, null, episode3, null], 0);
  assert.deepEqual(Array.from(playlist, (item) => item.title), ['Episode 1'], 'failed E2 must not silently make E3 the next item');
}

function globalBudgetTest() {
  const timers = [];
  const timeoutContext = {
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
    window: { __ONLINE2_TEST_MODE__: true }
  };
  vm.runInNewContext(source, timeoutContext, { filename: pluginFile });
  const timeoutApi = timeoutContext.window.Online2Test;
  let lateCallback;
  let completions = 0;
  timeoutApi.resolveExternalAndroidPlaylist([
    { method: 'call' },
    { method: 'call' }
  ], 0, (_item, done) => {
    lateCallback = done;
  }, () => {
    completions++;
  });

  const budget = timers.find((timer) => timer.delay === 15000);
  assert(budget, 'global launch budget must be armed');
  budget.callback();
  assert.equal(completions, 1, 'global budget must release a hung resolver');
  lateCallback({ url: 'https://cdn.example/late.m3u8' }, {});
  assert.equal(completions, 1, 'late network completion must be ignored');
}

function methodPlayAndWindowOrderTest() {
  const items = [
    { title: 'Episode 1', method: 'call' },
    { title: 'Episode 2', method: 'call' },
    { title: 'Episode 3', method: 'play', url: 'https://cdn.example/episode-3.m3u8' },
    { title: 'Episode 4', method: 'call' },
    { title: 'Episode 5', method: 'call' }
  ];
  const calls = [];
  api.resolveExternalAndroidPlaylist(items, 1, (item, done) => {
    calls.push(item.title);
    done({ url: `https://cdn.example/${item.title}.m3u8` }, {});
  }, () => {});
  assert.deepEqual(calls, ['Episode 4', 'Episode 1'], 'method=play remains direct and items beyond +2 are not resolved');

  const cells = items.map((item) => ({ title: item.title, url: item.url || `resolved://${item.title}` }));
  const playlist = api.contiguousPlaylistWindow(cells, 1);
  assert.deepEqual(Array.from(playlist, (item) => item.title), [
    'Episode 1',
    'Episode 2',
    'Episode 3',
    'Episode 4'
  ], 'window keeps one previous, current, and two next entries in source order');
}

queueAndContiguousFailureTest().then(() => {
  globalBudgetTest();
  methodPlayAndWindowOrderTest();
  console.log('Online2 external Android playlist regression tests: PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
