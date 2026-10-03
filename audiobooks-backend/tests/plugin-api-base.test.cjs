const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../wwwroot/audiobook2.js'), 'utf8');
const boundary = source.indexOf('  function escapeHtml(value)');
assert.ok(boundary > 0, 'API helpers must be present');
const apiSource = source.slice(0, boundary) + '\nwindow.testApi = { detectApiBase, apiUrl, absoluteUrl, audioUrl, normalizeAudiobookImageUrl };\n})();';

function load({ preset, key, storedKey, src = '', scripts = [] } = {}) {
  const context = {
    window: { location: { origin: 'https://unrelated.example' } },
    document: { currentScript: { src }, getElementsByTagName: () => scripts.map(src => ({ src })) }
  };
  if (preset !== undefined) context.window.lampacAudiobooks2ApiBase = preset;
  if (key !== undefined) context.window.lampacAudiobooks2ApiKey = key;
  if (storedKey !== undefined) {
    context.Lampa = { Storage: { get: name => name === 'audiobooks2_api_key' ? storedKey : '' } };
    context.window.Lampa = context.Lampa;
  }
  vm.runInNewContext(apiSource, context);
  return context.window;
}

for (const [name, input, expected] of [
  ['explicit own server wins', { preset: 'https://own.example/', src: 'https://script.example/audiobook2.js' }, 'https://own.example'],
  ['direct backend script', { src: 'https://own.example/audiobook2.js?v=2' }, 'https://own.example'],
  ['backend script with access prefix', { src: 'https://own.example/access/demo/audiobook2.js' }, 'https://own.example/access/demo'],
  ['script query API', { src: 'https://cdn.example/audiobook2.js?api=https%3A%2F%2Fown.example' }, 'https://own.example'],
  ['last matching script', { scripts: ['https://own.example/audiobook2.js'] }, 'https://own.example'],
  ['no configured server', {}, ''],
  ['blob script without server', { src: 'blob:https://unrelated.example/abcd' }, ''],
  ['invalid explicit server must not fall back', { preset: 'javascript:alert(1)', src: 'https://script.example/audiobook2.js' }, ''],
  ['invalid query server must not fall back', { src: 'https://cdn.example/audiobook2.js?api=javascript%3Aalert(1)' }, '']
]) {
  const state = load(input);
  assert.equal(state.lampacAudiobooks2ApiBase, expected, name);
  if (expected) assert.equal(state.testApi.apiUrl('/audio/search', { q: 'book' }), expected + '/audio/search?q=book', name);
  else assert.throws(() => state.testApi.apiUrl('/audio/search'), /server|сервер/i, name + ': requests require a configured server');
}

const auth = load({ preset: 'https://own.example/access/demo', key: 'demo key' }).testApi;
assert.equal(auth.apiUrl('/audio/search', { q: 'book' }), 'https://own.example/access/demo/audio/search?q=book&api_key=demo%20key');
assert.equal(auth.absoluteUrl('/audiobooks/img?url=https%3A%2F%2Fimages.example'), 'https://own.example/access/demo/audiobooks/img?url=https%3A%2F%2Fimages.example&api_key=demo%20key');
assert.equal(auth.audioUrl('/audio/play/1/0'), 'https://own.example/access/demo/audio/play/1/0?api_key=demo%20key');
assert.equal(auth.normalizeAudiobookImageUrl('https://own.example/access/demo/audiobooks/img?url=image'), 'https://own.example/access/demo/audiobooks/img?url=image&api_key=demo%20key');
assert.equal(auth.absoluteUrl('https://images.example/cover.jpg'), 'https://images.example/cover.jpg');
assert.equal(auth.apiUrl('https://own.example/outside-prefix'), 'https://own.example/outside-prefix');
assert.equal(auth.apiUrl('https://own.example.evil/steal'), 'https://own.example.evil/steal');
assert.equal(auth.audioUrl('https://audio.example/chapter.mp3'), 'https://own.example/access/demo/audiobooks/audio?url=https%3A%2F%2Faudio.example%2Fchapter.mp3&api_key=demo%20key');
assert.equal(load({ src: 'https://own.example/audiobook2.js?api_key=script-demo' }).testApi.apiUrl('/healthz'), 'https://own.example/healthz?api_key=script-demo');
assert.equal(load({ preset: 'https://own.example', storedKey: 'storage-demo' }).testApi.apiUrl('/healthz'), 'https://own.example/healthz?api_key=storage-demo');
const notices = [];
const fullContext = {
  window: { appready: true, location: { origin: 'https://unrelated.example' }, addEventListener() {}, removeEventListener() {} },
  document: { currentScript: null, getElementsByTagName: () => [], addEventListener() {}, removeEventListener() {} },
  navigator: {},
  Lampa: { Noty: { show: message => notices.push(message) }, Network: function () { throw new Error('Unexpected network initialization'); } },
  $: () => ({ remove() {} }),
  clearTimeout() {}, clearInterval() {}
};
fullContext.window.Lampa = fullContext.Lampa;
vm.runInNewContext(source, fullContext);
assert.equal(fullContext.window.lampacAudiobooks2PluginReady, false, 'unconfigured full plugin stays disabled');
assert.equal(fullContext.window.__lampacAudiobooks2Runtime.active, false, 'unconfigured runtime stops');
assert.equal(notices.length, 1, 'user sees configuration guidance');
assert.match(notices[0], /сервер/i);
console.log('PASS: 9 API configuration cases, 10 authenticated URL cases, full plugin disabled without a server');
