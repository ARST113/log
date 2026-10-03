const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../wwwroot/audiobook2.js'), 'utf8');
const boundary = source.indexOf('  function escapeHtml(value)');
assert.ok(boundary > 0, 'API helpers must be present');
const apiSource = source.slice(0, boundary) + '\nwindow.testApi = { detectApiBase, apiUrl, absoluteUrl, audioUrl, normalizeAudiobookImageUrl, updateApiConfiguration, safeDebugDetails };\n})();';

function load({ preset, key, storedKey, storedBase, src = '', scripts = [] } = {}) {
  const context = {
    window: { location: { origin: 'https://unrelated.example' } },
    document: { currentScript: { src }, getElementsByTagName: () => scripts.map(src => ({ src })) }
  };
  if (preset !== undefined) context.window.lampacAudiobooks2ApiBase = preset;
  if (key !== undefined) context.window.lampacAudiobooks2ApiKey = key;
  if (storedKey !== undefined || storedBase !== undefined) {
    const stored = { audiobooks2_api_key: storedKey, audiobooks2_api_base: storedBase };
    context.Lampa = { Storage: { get: name => stored[name] || '', set: (name, value) => stored[name] = value } };
    context.window.Lampa = context.Lampa;
  }
  vm.runInNewContext(apiSource, context);
  return context.window;
}

for (const [name, input, expected] of [
  ['explicit own server wins', { preset: 'https://own.example/', src: 'https://script.example/audiobook2.js' }, 'https://own.example'],
  ['direct backend script', { src: 'https://own.example/audiobook2.js?v=2' }, 'https://own.example'],
  ['backend script with access prefix', { src: 'https://own.example/access/demo/audiobook2.js' }, 'https://own.example/access/demo'],
  ['local server precedes script server', { storedBase: 'https://local.example', src: 'https://script.example/audiobook2.js' }, 'https://local.example'],
  ['explicit server precedes local server', { preset: 'https://own.example', storedBase: 'https://local.example' }, 'https://own.example'],
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
assert.equal(auth.absoluteUrl('/access/demo/audiobooks/img?url=image'), 'https://own.example/access/demo/audiobooks/img?url=image&api_key=demo%20key');
assert.equal(auth.audioUrl('/access/demo/audio/play/1/0'), 'https://own.example/access/demo/audio/play/1/0?api_key=demo%20key');
assert.equal(auth.apiUrl('/access/demo/audio/search', { q: 'book' }), 'https://own.example/access/demo/audio/search?q=book&api_key=demo%20key');
assert.equal(auth.normalizeAudiobookImageUrl('https://own.example/access/demo/audiobooks/img?url=image'), 'https://own.example/access/demo/audiobooks/img?url=image&api_key=demo%20key');
assert.equal(auth.absoluteUrl('https://images.example/cover.jpg'), 'https://images.example/cover.jpg');
assert.equal(auth.apiUrl('https://own.example/outside-prefix'), 'https://own.example/outside-prefix');
assert.equal(auth.apiUrl('https://own.example.evil/steal'), 'https://own.example.evil/steal');
assert.equal(auth.audioUrl('https://audio.example/chapter.mp3'), 'https://own.example/access/demo/audiobooks/audio?url=https%3A%2F%2Faudio.example%2Fchapter.mp3&api_key=demo%20key');
assert.equal(load({ src: 'https://own.example/audiobook2.js?api_key=script-demo' }).testApi.apiUrl('/healthz'), 'https://own.example/healthz?api_key=script-demo');
assert.equal(load({ preset: 'https://own.example', storedKey: 'storage-demo' }).testApi.apiUrl('/healthz'), 'https://own.example/healthz?api_key=storage-demo');

const mutable = load({ storedBase: 'https://first.example', storedKey: 'first-demo' });
mutable.__lampacAudiobooks2Runtime.requestCache.cached = { value: 'old' };
mutable.__lampacAudiobooks2BookCache.cached = { name: 'old' };
mutable.testApi.updateApiConfiguration('audiobooks2_api_base', 'https://second.example');
mutable.testApi.updateApiConfiguration('audiobooks2_api_key', 'second-demo');
assert.equal(mutable.testApi.apiUrl('/healthz'), 'https://second.example/healthz?api_key=second-demo', 'local changes take effect in the live runtime');
assert.equal(Object.keys(mutable.__lampacAudiobooks2Runtime.requestCache).length, 0, 'changing credentials clears request cache');
assert.equal(Object.keys(mutable.__lampacAudiobooks2BookCache).length, 0, 'changing server clears book cache');
mutable.testApi.updateApiConfiguration('audiobooks2_api_key', '');
assert.equal(mutable.testApi.apiUrl('/healthz'), 'https://second.example/healthz', 'local key can be removed');
const safe = mutable.testApi.safeDebugDetails({ url: 'https://own.example/access/private-demo/audio?api_key=secret-demo' });
assert.doesNotMatch(JSON.stringify(safe), /private-demo|secret-demo/, 'debug output redacts path and query credentials');
const notices = [];
const settings = [];
const components = [];
const fullContext = {
  window: { appready: true, location: { origin: 'https://unrelated.example' }, addEventListener() {}, removeEventListener() {} },
  document: { currentScript: null, getElementsByTagName: () => [], addEventListener() {}, removeEventListener() {} },
  navigator: {},
  Lampa: { Noty: { show: message => notices.push(message) }, SettingsApi: { addComponent: spec => components.push(spec), addParam: spec => settings.push(spec) }, Network: function () { throw new Error('Unexpected network initialization'); } },
  $: () => ({ remove() {} }),
  clearTimeout() {}, clearInterval() {}
};
fullContext.window.Lampa = fullContext.Lampa;
vm.runInNewContext(source, fullContext);
assert.equal(fullContext.window.lampacAudiobooks2PluginReady, false, 'unconfigured full plugin stays disabled');
assert.equal(fullContext.window.__lampacAudiobooks2Runtime.active, false, 'unconfigured runtime stops');
assert.equal(notices.length, 1, 'user sees configuration guidance');
assert.match(notices[0], /сервер/i);
assert.equal(components.length, 1, 'server settings are available before configuration');
assert.deepEqual(settings.map(spec => spec.param.name), ['audiobooks2_api_base', 'audiobooks2_api_key']);
let editOptions;
let editCallback;
let displayedKey;
let enter;
let valueCreated = false;
fullContext.Lampa.Input = { edit: (options, callback) => { editOptions = options; editCallback = callback; } };
const valueNode = { length: 1, text: value => displayedKey = value, insertAfter: () => valueCreated = true };
fullContext.$ = html => {
  assert.match(html, /settings-param__value/);
  return valueNode;
};
const staticRow = {
  find: selector => selector === '.settings-param__value'
    ? (valueCreated ? valueNode : { length: 0, text() {} })
    : { length: 1 },
  append: () => valueCreated = true,
  on: (event, callback) => enter = callback
};
settings[1].onRender(staticRow);
assert.equal(valueCreated, true, 'static setting creates a visible value when Lampa omits the container');
assert.equal(displayedKey, 'Не указан', 'key value is not displayed');
enter();
assert.equal(editOptions.nosave, true, 'key editor does not retain input history');
assert.equal(editOptions.password, true, 'key editor masks its input');
settings[1].onChange('secret-demo');
settings[1].onRender(staticRow);
assert.equal(displayedKey, 'Сохранён', 'saved key displays only its status');
enter();
assert.equal(editOptions.value, 'secret-demo', 'existing key initializes the masked editor');
editCallback(editOptions.value); // Lampa Back returns the initial value, rather than null.
assert.equal(displayedKey, 'Сохранён', 'canceling the editor preserves the saved key');
console.log('PASS: API configuration, authenticated URLs, blank startup, local settings');
