const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../wwwroot/audiobook2.js'), 'utf8');

function harness() {
  const roots = [];
  const timers = [];
  const listeners = {};
  const errors = [];
  let now = 0;
  let active = null;
  class Node {
    constructor(kind, parent) {
      this.kind = kind; this.parent = parent; this.children = []; this.visible = true;
      if (parent) parent.children.push(this);
    }
    get offsetWidth() { return this.visible && (!this.parent || this.parent.offsetWidth) ? 1 : 0; }
    get offsetHeight() { return this.offsetWidth; }
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  function matches(node, selector) {
    return selector.split(',').some(part => ({
      '.activity': 'activity', '.full-start-new': 'full', '.full-start': 'full',
      '.full-start-new__buttons': 'buttons', '.view--audiobook-listen': 'listen'
    })[part.trim()] === node.kind);
  }
  class Collection {
    constructor(nodes = []) { this.nodes = nodes; this.length = nodes.length; nodes.forEach((node, index) => this[index] = node); }
    first() { return new Collection(this.nodes.slice(0, 1)); }
    find(selector) { return new Collection(this.nodes.flatMap(descendants).filter(node => matches(node, selector))); }
    filter(fn) { return new Collection(this.nodes.filter(node => fn.call(node))); }
    parent() { return new Collection(this.nodes.map(node => node.parent).filter(Boolean)); }
    closest(selector) {
      return new Collection(this.nodes.map(node => { while (node && !matches(node, selector)) node = node.parent; return node; }).filter(Boolean));
    }
    not(other) { return new Collection(this.nodes.filter(node => !other.nodes.includes(node))); }
    each(fn) { this.nodes.forEach(node => fn.call(node)); return this; }
    remove() { this.nodes.forEach(node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node); node.parent = null; }); return this; }
    detach() { return this.remove(); }
    prepend(other) { other.detach(); other.nodes.forEach(node => { node.parent = this[0]; this[0].children.unshift(node); }); return this; }
    append(other) { other.detach(); other.nodes.forEach(node => { node.parent = this[0]; this[0].children.push(node); }); return this; }
  }
  function $(value) {
    if (value instanceof Collection) return value;
    if (value instanceof Node) return new Collection([value]);
    if (typeof value === 'string') return new Collection(roots.flatMap(root => [root, ...descendants(root)]).filter(node => matches(node, value)));
    return new Collection();
  }
  $.contains = (parent, child) => { while (child) { if (child === parent) return true; child = child.parent; } return false; };
  const context = {
    window: { appready: false, lampacAudiobooks2ApiBase: 'https://own.example/access/sample-prefix', lampacAudiobooks2ApiKey: 'sample-secret', addEventListener() {}, removeEventListener() {} },
    document: { currentScript: null, getElementsByTagName: () => [], body: {}, addEventListener() {}, removeEventListener() {} },
    Lampa: { Activity: { active: () => active }, Listener: { follow: (name, callback) => listeners[name] = callback }, Storage: { get: (name, fallback) => fallback || '' } },
    $, console: { error: (...args) => errors.push(args), log() {} },
    setTimeout: (callback, delay = 0) => { const timer = { callback, at: now + delay }; timers.push(timer); return timer; },
    clearTimeout: timer => { if (timer) timer.canceled = true; }, clearInterval() {},
    Date: class extends Date { static now() { return now; } },
    __listenerNode: book => { const node = new Node('listen'); node.book = book; return $(node); },
    __failRequest: (url, failed) => failed({ status: 401, url, message: 'sample-secret /access/sample-prefix/' })
  };
  context.window.Lampa = context.Lampa;
  context.window.console = context.console;
  const instrumented = source.replace('  ready();\n})();', `
    // Stub unrelated markup and history; exercise the actual Full context,
    // observer refresh, insertion, identity, and delayed callback lifecycle.
    findContinueBookForCard = function() { return null; };
    repairExistingListenButtons = function() {};
    scheduleAudiobookFullTypeCleanup = function() {};
    expandDirectFullButtons = function(render) { return render.find('.full-start-new__buttons'); };
    makeListenButton = function(book) { return __listenerNode(book); };
    repairListenButtonMarkup = function(node, book) { node[0].book = book; return node; };
    ensureFullAuthorButton = ensureFullSeriesButton = function() {};
    requestJSON = function(url, complete, failed) { __failRequest(url, failed); };
    window.testFull = { install: addFullListenButton, refresh: refreshActiveFullListenButton, ensure: ensureFullListenButton, sourceList: sourceList };
    ready();
  })();`);
  assert.notEqual(instrumented, source, 'VM hooks must be inserted');
  vm.runInNewContext(instrumented, context);
  context.window.testFull.install();
  function scene(card, source = 'tmdb') {
    roots.forEach(root => root.visible = false);
    const root = new Node('activity'); roots.push(root);
    const full = new Node('full', root); new Node('buttons', full);
    const activity = { render: () => $(root) };
    active = { component: 'full', source, card, activity };
    return { root, full, activity, object: active };
  }
  function flush(until) {
    for (;;) {
      const next = timers.filter(timer => !timer.canceled && timer.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      next.canceled = true; now = next.at; next.callback();
    }
    now = until;
  }
  function event(scene, movie) { listeners.full({ type: 'complite', object: scene.object, data: { movie } }); }
  return { context, scene, flush, event, $, Node, errors };
}

function audiobook(id = 1001) {
  const book = { name: 'Example audiobook', source: 'audio_fdb', url: 'work:demo' };
  return { id, source: 'lampac_audiobooks2', audiobook_book: book, title: book.name };
}

{
  const h = harness(); const card = audiobook(); const s = h.scene(card, card.source);
  h.event(s, card); h.flush(2000);
  assert.equal(h.$('.view--audiobook-listen').length, 1, 'initial audiobook has one listen button');
  // Same Full/activity, but frontend clones the card without custom fields
  // and replaces the whole button DOM after every initial timer has finished.
  s.object.card = { id: card.id, title: card.title }; s.object.source = 'tmdb';
  s.full.children = []; new h.Node('buttons', s.full);
  h.context.window.testFull.refresh();
  assert.equal(h.$('.view--audiobook-listen').length, 1, 'late generic same-id redraw preserves listen');
  assert.equal(h.$('.view--audiobook-listen')[0].book, card.audiobook_book, 'restore binds the exact audiobook');
  h.context.window.testFull.refresh(); h.context.window.testFull.refresh();
  assert.equal(h.$('.view--audiobook-listen').length, 1, 'repeated refresh does not duplicate listen');
  h.event(s, s.object.card); h.flush(4000);
  assert.equal(h.$('.view--audiobook-listen').length, 1, 'late generic Full completion preserves the same proved binding');
}

for (const movieId of [2002, 1001]) {
  const h = harness(); const card = audiobook(); const s = h.scene(card, card.source);
  h.event(s, card); h.flush(40);
  const movie = { id: movieId, title: 'Actual movie', source: 'tmdb' };
  const different = h.scene(movie); h.event(different, movie); h.flush(2500);
  assert.equal(h.$('.view--audiobook-listen').length, 0, 'new activity cancels stale audiobook callbacks, even for a colliding id');
  h.context.window.testFull.refresh();
  assert.equal(h.$('.view--audiobook-listen').length, 0, 'movie receives no audiobook button');
}

{
  const h = harness(); const card = audiobook(); const s = h.scene(card, card.source);
  h.event(s, card); h.flush(2000);
  const movie = { id: 2002, title: 'Another movie' };
  s.object.card = movie; s.object.source = 'tmdb';
  h.event(s, movie); h.flush(4000);
  assert.equal(h.$('.view--audiobook-listen').length, 0, 'different ID in the same activity cancels the binding');
}

{
  const h = harness(); const card = audiobook();
  const s = h.scene({ id: card.id, title: 'Unrelated movie' });
  h.event(s, s.object.card); h.flush(2000); h.context.window.testFull.refresh();
  assert.equal(h.$('.view--audiobook-listen').length, 0, 'a generic card ID is never enough to establish an audiobook binding');
}

{
  const h = harness(); const first = audiobook(); const s = h.scene(first, first.source);
  h.event(s, first); h.flush(2000);
  const second = audiobook(1002); second.audiobook_book.name = 'Second audiobook';
  const next = h.scene(second, second.source); h.event(next, second); h.flush(4000);
  assert.equal(h.$('.view--audiobook-listen').length, 1, 'opening another audiobook removes the hidden previous control');
  assert.equal(h.$('.view--audiobook-listen')[0].book, second.audiobook_book, 'the new control uses the new book');
}

{
  const h = harness();
  h.context.window.testFull.sourceList({ provider: 'all' }, () => {}, () => {});
  assert.equal(h.errors.length, 1, 'catalog failure is logged');
  assert.doesNotMatch(JSON.stringify(h.errors), /sample-secret|sample-prefix|api_key=|\/access\//, 'catalog error logging never includes credentials or raw URLs');
}
console.log('PASS: late same-card redraw, activity identity, stale timers, duplicate prevention, private error logging');
