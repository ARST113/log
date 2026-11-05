'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const script = fs.readFileSync(path.join(__dirname, '..', 'ContinueWatching.js'), 'utf8');
const fixture = {
  Storage: { field: () => 'ru' },
  Api: {
    img: (p, size) => 'https://image.tmdb.org/t/p/' + size + p,
    seasons: (_card, _list, done) => done({
      1: { episodes: [
        { season_number: 1, episode_number: 1, name: 'Пилот', still_path: '/pilot.jpg' },
        { season_number: 1, episode_number: 2, name: 'Развязка', still_path: '/final.jpg' }
      ] }
    })
  }
};
const api = new Function('Lampa', 'window', 'return ' + script)(fixture, {
  plugin_watch_resume_ready: true
});
const cardTV = {
  id: 1399, source: 'tmdb', type: 'tv', name: 'Тестовый сериал',
  poster_path: '/poster.jpg', backdrop_path: '/back.jpg', imdb_id: 'tt0944947',
  images: { logos: [{ file_path: '/logo.png', aspect_ratio: 3, iso_639_1: 'ru' }] }
};

test('movie retains timeline and URL while receiving artwork/title/IDs', async () => {
  const card = { id: 7, source: 'tmdb', type: 'movie', title: 'Фильм',
    poster_path: '/movie.jpg', imdb_id: 'tt007' };
  const item = { url: 'http://localhost/movie.mkv', title: 'release.1080p.mkv',
    timeline: { hash: 'movie', handler() {} }, subtitles: [{ url: '/sub.srt' }] };
  const result = await api.enrichResumePayload(fixture, { card, playlist: [item], item });
  assert.equal(result.item.title, 'Фильм');
  assert.match(result.item.thumbnail, /\/movie\.jpg$/);
  assert.equal(result.item.imdb_id, 'tt007');
  assert.equal(result.item.url, item.url);
  assert.equal(result.item.timeline, item.timeline);
  assert.deepEqual(result.item.subtitles, item.subtitles);
  assert.equal(item.thumbnail, undefined);
});

test('series conveys different episode titles/images, logo, backdrop, season and stable selection', async () => {
  const items = [
    { url: 'http://localhost/e1.mkv', title: 'S01E01.1080p.mkv', season: 1, episode: 1, timeline: { hash: 'e1' } },
    { url: 'http://localhost/e2.mkv', title: 'S01E02.1080p.mkv', season: 1, episode: 2, timeline: { hash: 'e2' } }
  ];
  const result = await api.enrichResumePayload(fixture, {
    card: cardTV, playlist: items, item: items[1], mode: 'torrent'
  });
  assert.deepEqual(result.playlist.map(x => x.episode_title), ['Пилот', 'Развязка']);
  assert.match(result.playlist[0].thumbnail, /\/pilot\.jpg$/);
  assert.match(result.playlist[1].thumbnail, /\/final\.jpg$/);
  assert.match(result.item.background, /\/back\.jpg$/);
  assert.match(result.item.logo, /\/logo\.png$/);
  assert.equal(result.item, result.playlist[1]);
  assert.equal(result.item.season, 1);
  assert.equal(result.item.episode, 2);
  assert.equal(result.item.timeline.hash, 'e2');
  assert.equal(result.item.first_title, 'Тестовый сериал');
});

test('online sources already carrying an episode name keep it when catalog is offline', async () => {
  const offline = { Storage: fixture.Storage, Api: { img: fixture.Api.img } };
  const item = { url: 'https://example.test/video.m3u8', season: 1, episode: 4, episode_title: 'Оригинальное название' };
  const result = await api.enrichResumePayload(offline, { card: cardTV, item, playlist: [item], mode: 'online' });
  assert.equal(result.item.title, 'Оригинальное название');
  assert.match(result.item.thumbnail, /\/back\.jpg$/);
});

test('anime episode without catalog entry uses correct episode number and backdrop', async () => {
  const offline = { Storage: fixture.Storage, Api: { img: fixture.Api.img } };
  const item = { url: 'https://example.test/part17.mkv', title: 'S02E17.2160p.mkv', season: 2, episode: 17 };
  const result = await api.enrichResumePayload(offline, {
    card: { id: 42, source: 'tmdb', type: 'tv', name: 'Аниме', backdrop_path: '/anime.jpg' },
    item, playlist: [item]
  });
  assert.equal(result.item.title, 'Серия 17');
  assert.equal(result.item.episode, 17);
  assert.match(result.item.thumbnail, /\/anime\.jpg$/);
});

test('no catalog data or image still launches with original media URL', async () => {
  const broken = { Storage: fixture.Storage, Api: { seasons() { throw new Error('offline'); } } };
  const item = { url: 'http://localhost/f.mkv', timeline: { hash: 'fallback' }, season: 1, episode: 3 };
  const result = await api.enrichResumePayload(broken, {
    card: { id: 17, source: 'tmdb', type: 'tv', name: 'Тест' }, item, playlist: [item]
  });
  assert.equal(result.item.title, 'Серия 3');
  assert.equal(result.item.thumbnail, '');
  assert.equal(result.item.url, item.url);
});

test('orchestrator moves completed episode to next one without stale progress', async () => {
  const items = [
    { url: 'http://localhost/e1', season: 1, episode: 8, timeline: { hash: 'h1' } },
    { url: 'http://localhost/e2', season: 2, episode: 1, timeline: { hash: 'h2' } }
  ];
  const record = {
    mode: 'torrent', updated_at: 100, episode: { season: 1, episode: 8, timeline_hash: 'h1' },
    progress: { time: 95, duration: 100, percent: 95 }
  };
  let launched;
  const run = api.createResumeOrchestrator({
    store: { find: () => ({ modes: { torrent: record } }) },
    torrent: { resolve: async () => ({ item: items[0], playlist: items }) },
    online: { resolve: () => { throw new Error('unexpected'); } },
    launcher: { launch: async payload => { launched = payload; } }
  });
  await run.resume(cardTV);
  assert.equal(launched.item, items[1]);
  assert.equal(launched.progress.time, 0);
  assert.equal(launched.progress.percent, 0);
  assert.equal(launched.mode, 'torrent');
  assert.equal(launched.card, cardTV);
});

test('native online/PidTor launch is left untouched by torrent metadata launcher', async () => {
  const record = {
    mode: 'online', updated_at: 100, episode: { season: 1, episode: 2, timeline_hash: 'h2' },
    progress: { time: 45, duration: 100, percent: 45 }
  };
  let invoked = false;
  const run = api.createResumeOrchestrator({
    store: { find: () => ({ modes: { online: record } }) },
    online: { resolve: async () => ({ launched: true }) },
    torrent: { resolve: () => { throw new Error('unexpected'); } },
    launcher: { launch: () => { invoked = true; } }
  });
  await run.resume(cardTV);
  assert.equal(invoked, false);
});
