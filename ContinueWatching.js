(function () {
    'use strict';

    var VERSION = 'v6.0.0-clean-timeline-core-20260830';
    var STORAGE_BASE = 'continue_watch_v6';
    var PENDING_BASE = 'continue_watch_v6_pending';
    var MIN_TIME = 5;
    var SYNC_MAX = 9000;
    var EXTERNAL_SETTLE = 1500;
    var EXTERNAL_WINDOW = 5000;

    if (!window.Lampa) return;
    if (window.__CW_V6_VERSION__ === VERSION) return;
    window.__CW_V6_VERSION__ = VERSION;

    var state = {
        session: null,
        resolverByMedia: {},
        torrentSeedByCard: {},
        lastMovie: null,
        settleTimer: null,
        uiTimer: null,
        playerPatched: false,
        torrentPatched: false,
        installed: false
    };

    function now() { return Date.now ? Date.now() : new Date().getTime(); }
    function num(v) { v = Number(v || 0); return isNaN(v) ? 0 : v; }
    function str(v) { return v === undefined || v === null ? '' : String(v); }
    function clone(obj) {
        var out = {};
        if (!obj || typeof obj !== 'object') return out;
        Object.keys(obj).forEach(function (k) {
            var v = obj[k];
            if (v === undefined || typeof v === 'function') return;
            out[k] = v;
        });
        return out;
    }
    function json(v) { try { return JSON.stringify(v); } catch (e) { return ''; } }
    function clamp(v, a, b) { v = num(v); return Math.max(a, Math.min(b, v)); }
    function formatTime(sec) {
        sec = Math.max(0, Math.floor(num(sec)));
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        function p(x) { return x < 10 ? '0' + x : String(x); }
        return h ? h + ':' + p(m) + ':' + p(s) : m + ':' + p(s);
    }
    function cleanUrl(url) {
        url = str(url).trim();
        var i = url.indexOf('#');
        return i >= 0 ? url.slice(0, i) : url;
    }
    function movieTitle(movie) {
        movie = movie || {};
        return str(movie.original_name || movie.original_title || movie.name || movie.title || '');
    }
    function mediaType(movie) {
        movie = movie || {};
        var t = str(movie.media_type || '').toLowerCase();
        if (t === 'tv' || t === 'movie') return t;
        return movie.original_name || movie.name || movie.number_of_seasons || movie.first_air_date ? 'tv' : 'movie';
    }
    function cardKey(movie) {
        if (!movie) return '';
        var id = movie.id || movie.tmdb_id || movie.tmdbId || movie.movie_id || '';
        var type = mediaType(movie);
        if (id !== '') return 'tmdb:' + type + ':' + id;
        var title = movieTitle(movie);
        var year = str(movie.first_air_date || movie.release_date || movie.year || '').slice(0, 4);
        return title ? 'title:' + type + ':' + Lampa.Utils.hash(title + '|' + year) : '';
    }
    function recordKey(movie) {
        var key = typeof movie === 'string' ? movie : cardKey(movie);
        return key ? 'c_' + Lampa.Utils.hash(key) : '';
    }
    function getMovieFromData(data) {
        data = data || {};
        return data.card || data.movie || (data.currentItem && data.currentItem.card) || state.lastMovie || activeMovie() || {};
    }
    function activeMovie() {
        try {
            var a = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
            var m = a && (a.movie || a.card || (a.params && a.params.movie));
            if (m) state.lastMovie = m;
            return m || state.lastMovie;
        } catch (e) { return state.lastMovie; }
    }
    function profileId() {
        var a = null;
        try { a = Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account; } catch (e) {}
        try { if (!a) a = Lampa.Storage.get('account', {}); } catch (e2) {}
        if (a && a.profile && a.profile.id !== undefined && a.profile.id !== null && a.profile.id !== '') return str(a.profile.id);
        return 'guest';
    }
    function storageKey() { return STORAGE_BASE + '_' + profileId(); }
    function pendingKey() { return PENDING_BASE + '_' + profileId(); }
    function ensureSync() {
        if (profileId() === 'guest') return;
        try { Lampa.Storage.sync(storageKey(), 'object_object'); } catch (e) {}
    }
    function store() {
        ensureSync();
        try {
            var v = Lampa.Storage.get(storageKey(), {});
            return v && typeof v === 'object' ? v : {};
        } catch (e) { return {}; }
    }
    function writeStore(v) {
        try { Lampa.Storage.set(storageKey(), v); } catch (e) {}
    }
    function getRecord(movie) {
        var key = recordKey(movie);
        if (!key) return null;
        var all = store();
        var r = all[key];
        if (!r || r.card_key !== cardKey(movie)) return null;
        return r;
    }
    function saveRecord(record) {
        if (!record || !record.card_key) return false;
        var all = store();
        var key = recordKey(record.card_key);
        var old = all[key];
        if (old && num(old.activity_at) > num(record.activity_at)) return false;
        compactRecord(record);
        all[key] = record;
        writeStore(all);
        return true;
    }
    function compactRecord(r) {
        if (!r) return r;
        if (json(r).length <= SYNC_MAX) return r;
        if (r.torrent && r.torrent.items) {
            r.torrent.items.forEach(function (i) { delete i.img; });
        }
        delete r.poster;
        if (json(r).length <= SYNC_MAX) return r;
        if (r.torrent && r.torrent.items) {
            r.torrent.items.forEach(function (i) {
                if (i.title) i.title = str(i.title).slice(0, 60);
                if (i.file_name) i.file_name = str(i.file_name).slice(0, 160);
            });
        }
        return r;
    }

    function timelineView(hash) {
        try { return hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null; } catch (e) { return null; }
    }
    function timelineHash(movie, season, episode) {
        if (!movie) return '';
        var title = movieTitle(movie);
        if (!title) return '';
        season = num(season); episode = num(episode);
        if (season && episode) return str(Lampa.Utils.hash('' + season + (season > 10 ? ':' : '') + episode + title));
        return str(Lampa.Utils.hash(title));
    }
    function exactHash(item, movie, season, episode) {
        var h = item && item.timeline && item.timeline.hash;
        return h && str(h) !== '0' ? str(h) : timelineHash(movie, season, episode);
    }
    function parseStream(url) {
        url = cleanUrl(url);
        var mFile = url.match(/\/stream\/([^?]+)/i);
        var mLink = url.match(/[?&]link=([^&#]+)/i);
        var mIndex = url.match(/[?&]index=(\d+)/i);
        if (!mLink && !/\/gst\//i.test(url)) return null;
        var gst = url.match(/\/gst\/([^/]+)\/master\.m3u8/i);
        return {
            file_name: mFile ? safeDecode(mFile[1]) : '',
            hash: mLink ? safeDecode(mLink[1]) : (gst ? safeDecode(gst[1]) : ''),
            file_id: mIndex ? parseInt(mIndex[1], 10) : 0
        };
    }
    function safeDecode(v) { try { return decodeURIComponent(str(v)); } catch (e) { return str(v); } }
    function itemSE(item, fallbackIndex) {
        item = item || {};
        var s = num(item.season || item.season_number || item.s);
        var e = num(item.episode || item.episode_number || item.e);
        if (s && e) return { season: s, episode: e };
        var title = str(item.file_name || item.filename || item.title || item.name || '');
        var m = title.match(/\bS(?:eason)?\s*0?(\d{1,2}).*?E(?:p(?:isode)?)?\s*0?(\d{1,3})\b/i) || title.match(/\b0?(\d{1,2})[xх×]0?(\d{1,3})\b/i);
        if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
        return { season: s || 0, episode: e || 0, fallback: fallbackIndex };
    }
    function playlistIndex(data, playlist, currentUrl) {
        data = data || {}; playlist = playlist || [];
        var idx = data.playlist_index !== undefined ? num(data.playlist_index) : (data.start_index !== undefined ? num(data.start_index) : -1);
        if (idx >= 0 && idx < playlist.length) return idx;
        var dh = data.timeline && data.timeline.hash ? str(data.timeline.hash) : '';
        for (var i = 0; i < playlist.length; i++) {
            if (dh && playlist[i].timeline && str(playlist[i].timeline.hash) === dh) return i;
            var u = cleanUrl(playlist[i].url || playlist[i].uri || playlist[i].src || '');
            if (u && currentUrl && u === currentUrl) return i;
        }
        return 0;
    }
    function normalizePlaylist(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return clone(x); });
    }
    function sourceOf(data) {
        data = data || {};
        if (data.torrent_hash || parseStream(data.url || data.uri || data.src || '')) return 'torrent';
        if (data.isonline) return 'online';
        return 'other';
    }
    function isJustExternal() {
        try {
            return Lampa.Platform && Lampa.Platform.is && Lampa.Platform.is('android') && str(Lampa.Storage.field('player_torrent')) === 'android';
        } catch (e) { return false; }
    }

    function buildSession(data) {
        data = data || {};
        var movie = getMovieFromData(data);
        if (!movie || !cardKey(movie)) return null;
        var source = sourceOf(data);
        if (source === 'other') return null;
        var url = cleanUrl(data.url || data.uri || data.src || '');
        var list = normalizePlaylist(data.playlist || []);

        if (!list.length && state.session && state.session.card_key === cardKey(movie) && state.session.source === source) {
            list = state.session.playlist.map(function (x) { return clone(x); });
        }
        var idx = playlistIndex(data, list, url);
        var item = list[idx] || data.currentItem || data;
        var se = itemSE(item, idx);
        if ((!se.season || !se.episode) && data.season && data.episode) {
            se.season = num(data.season); se.episode = num(data.episode);
        }
        var h = data.timeline && data.timeline.hash ? str(data.timeline.hash) : exactHash(item, movie, se.season, se.episode);

        if (list.length) {
            for (var i = 0; i < list.length; i++) {
                var pse = itemSE(list[i], i);
                list[i].season = num(list[i].season || pse.season);
                list[i].episode = num(list[i].episode || pse.episode);
                if (!list[i].timeline) list[i].timeline = {};
                if (!list[i].timeline.hash) list[i].timeline.hash = exactHash(list[i], movie, list[i].season, list[i].episode);
            }
        }

        var session = {
            source: source,
            card_key: cardKey(movie),
            movie: movie,
            url: url,
            playlist: list,
            index: idx,
            season: num(se.season),
            episode: num(se.episode),
            hash: h,
            torrent_hash: str(data.torrent_hash || (item && item.torrent_hash) || ''),
            resolver: null,
            created_at: now(),
            last_road: null
        };
        if (source === 'torrent') {
            var parsed = parseStream(url);
            if (!session.torrent_hash && parsed) session.torrent_hash = parsed.hash;
            var seed = state.torrentSeedByCard[session.card_key];
            session.magnet = seed ? seed.magnet : '';
        } else if (source === 'online') {
            session.resolver = lookupResolver(url);
            onlineNoty('PLAY S' + session.season + 'E' + session.episode + ' resolver=' + (session.resolver ? 'YES' : 'NO'));
        }
        return session;
    }

    function torrentDescriptor(session) {
        if (!session || session.source !== 'torrent') return null;
        var items = [];
        var list = session.playlist.length ? session.playlist : [session.movie || {}];
        for (var i = 0; i < list.length; i++) {
            var item = list[i] || {};
            var parsed = parseStream(item.url || item.uri || item.src || '');
            var se = itemSE(item, i);
            var h = exactHash(item, session.movie, se.season, se.episode);
            items.push({
                file_id: parsed ? num(parsed.file_id) : num(item.file_index !== undefined ? item.file_index : (item.id !== undefined ? item.id : i)),
                file_name: parsed && parsed.file_name ? parsed.file_name : str(item.file_name || item.filename || item.path_human || item.path || item.title || ''),
                title: str(item.title || item.name || ''),
                season: num(se.season),
                episode: num(se.episode),
                hash: h,
                img: str(item.img || item.thumbnail || '')
            });
        }
        return {
            hash: session.torrent_hash || (items[session.index] && parseStream(session.url) ? parseStream(session.url).hash : ''),
            magnet: session.magnet || '',
            index: session.index,
            items: items
        };
    }

    function recordFrom(session, itemIndex, road, activityAt) {
        if (!session) return null;
        var item = session.playlist[itemIndex] || {};
        var se = itemSE(item, itemIndex);
        if (!se.season && session.season) se.season = session.season;
        if (!se.episode && session.episode) se.episode = session.episode;
        var h = exactHash(item, session.movie, se.season, se.episode) || session.hash;
        road = road || {};
        var r = {
            v: 6,
            card_key: session.card_key,
            media_type: mediaType(session.movie),
            movie_id: session.movie.id || session.movie.tmdb_id || '',
            title: movieTitle(session.movie),
            source: session.source,
            activity_at: num(activityAt || road.updated || now()),
            season: num(se.season),
            episode: num(se.episode),
            timeline_hash: str(h),
            time: num(road.time),
            duration: num(road.duration),
            percent: clamp(road.percent || (road.duration ? Math.round(num(road.time) / num(road.duration) * 100) : 0), 0, 100),
            current_index: num(itemIndex),
            poster: str(session.movie.poster_path || session.movie.img || session.movie.poster || '')
        };
        if (session.source === 'torrent') r.torrent = torrentDescriptor(session);
        if (session.source === 'online') {
            r.online = {
                resolver_url: session.resolver ? portableResolver(session.resolver.url) : '',
                resolver_headers: session.resolver ? clone(session.resolver.headers || {}) : {},
                direct_url: isTransientOnline(session.url) ? '' : session.url
            };
        }
        return r;
    }

    function meaningfulRoad(road) {
        if (!road) return false;
        return num(road.time) >= MIN_TIME || num(road.percent) > 0 || num(road.percent) >= 100;
    }
    function findSessionItem(hash) {
        var s = state.session;
        if (!s) return -1;
        if (str(s.hash) === str(hash) && !s.playlist.length) return s.index || 0;
        for (var i = 0; i < s.playlist.length; i++) {
            var h = s.playlist[i].timeline && s.playlist[i].timeline.hash;
            if (h && str(h) === str(hash)) return i;
        }
        return -1;
    }

    function writePending(session) {
        if (!session || session.source !== 'torrent') return;
        var d = torrentDescriptor(session);
        if (!d) return;
        var baselines = {};
        d.items.forEach(function (it) {
            var road = timelineView(it.hash) || {};
            baselines[it.hash] = num(road.updated);
        });
        var p = {
            v: 6,
            card_key: session.card_key,
            movie: {
                id: session.movie.id || session.movie.tmdb_id || '',
                original_name: session.movie.original_name || session.movie.name || '',
                original_title: session.movie.original_title || '',
                name: session.movie.name || session.movie.title || '',
                title: session.movie.title || session.movie.name || '',
                media_type: mediaType(session.movie)
            },
            torrent: d,
            baselines: baselines,
            events: [],
            launched_at: now()
        };
        try { localStorage.setItem(pendingKey(), JSON.stringify(p)); } catch (e) {}
    }
    function readPending() {
        try {
            var s = localStorage.getItem(pendingKey());
            if (!s) return null;
            var p = JSON.parse(s);
            if (!p || p.v !== 6) return null;
            if (now() - num(p.launched_at) > 6 * 3600 * 1000) { localStorage.removeItem(pendingKey()); return null; }
            return p;
        } catch (e) { return null; }
    }
    function savePending(p) { try { localStorage.setItem(pendingKey(), JSON.stringify(p)); } catch (e) {} }
    function clearPending() { try { localStorage.removeItem(pendingKey()); } catch (e) {} }
    function pendingItem(p, hash) {
        if (!p || !p.torrent || !p.torrent.items) return null;
        for (var i = 0; i < p.torrent.items.length; i++) if (str(p.torrent.items[i].hash) === str(hash)) return { item: p.torrent.items[i], index: i };
        return null;
    }
    function appendPendingEvent(hash, road) {
        var p = readPending();
        if (!p || !pendingItem(p, hash)) return false;
        p.events = Array.isArray(p.events) ? p.events : [];
        p.events.push({ hash: str(hash), seen: now(), updated: num(road.updated || now()), time: num(road.time), duration: num(road.duration), percent: num(road.percent) });
        if (p.events.length > 30) p.events = p.events.slice(-30);
        savePending(p);
        scheduleReconcile();
        return true;
    }
    function scheduleReconcile() {
        if (state.settleTimer) clearTimeout(state.settleTimer);
        state.settleTimer = setTimeout(reconcilePending, EXTERNAL_SETTLE);
    }
    function pendingSession(p) {
        if (!p || !p.torrent) return null;
        var movie = p.movie || {};
        var list = p.torrent.items.map(function (it) {
            return {
                title: it.title,
                season: it.season,
                episode: it.episode,
                timeline: { hash: it.hash },
                file_index: it.file_id,
                file_name: it.file_name,
                img: it.img,
                torrent_hash: p.torrent.hash
            };
        });
        return {
            source: 'torrent', card_key: p.card_key, movie: movie, url: '', playlist: list,
            index: num(p.torrent.index), season: 0, episode: 0, hash: '', torrent_hash: p.torrent.hash,
            magnet: p.torrent.magnet || '', resolver: null, created_at: p.launched_at, last_road: null
        };
    }
    function reconcilePending() {
        var p = readPending();
        if (!p || !p.torrent || !p.torrent.items) return false;
        var candidates = [];
        p.torrent.items.forEach(function (it, idx) {
            var road = timelineView(it.hash) || {};
            var base = num(p.baselines && p.baselines[it.hash]);
            if (num(road.updated) > base && num(road.updated) + 3000 >= num(p.launched_at)) {
                candidates.push({ index: idx, item: it, road: road, updated: num(road.updated) });
            }
        });
        (p.events || []).forEach(function (e) {
            var pi = pendingItem(p, e.hash);
            if (!pi) return;
            candidates.push({ index: pi.index, item: pi.item, road: e, updated: num(e.updated || e.seen) });
        });
        if (!candidates.length) return false;
        candidates.sort(function (a, b) { return b.updated - a.updated; });
        var playable = candidates.filter(function (c) { return num(c.road.time) > 0 && num(c.road.duration) > 0 && num(c.road.percent) < 100; });
        var chosen = playable.length ? playable[0] : null;
        if (!chosen) {
            var completed = candidates.filter(function (c) { return num(c.road.percent) >= 100; });
            if (completed.length) {
                completed.sort(function (a, b) { return b.updated - a.updated; });
                var next = completed[0].index + 1;
                if (next < p.torrent.items.length) {
                    chosen = { index: next, item: p.torrent.items[next], road: { time: 0, duration: 0, percent: 0, updated: completed[0].updated }, updated: completed[0].updated };
                } else chosen = completed[0];
            } else chosen = candidates[0];
        }
        var s = pendingSession(p);
        var rec = recordFrom(s, chosen.index, chosen.road, chosen.updated || now());
        if (rec) saveRecord(rec);
        clearPending();
        refreshUI();
        return !!rec;
    }

    function onTimeline(event) {
        var d = event && event.data ? event.data : event;
        if (!d || !d.hash || !d.road) return;
        var hash = str(d.hash), road = d.road || {};

        if (isJustExternal() && appendPendingEvent(hash, road)) return;

        var idx = findSessionItem(hash);
        if (idx < 0) {
            if (appendPendingEvent(hash, road)) return;
            return;
        }
        if (!meaningfulRoad(road)) return;
        var saveIndex = idx;
        var saveRoad = road;
        if (state.session.source === 'torrent' && num(road.percent) >= 100 && idx + 1 < state.session.playlist.length) {
            saveIndex = idx + 1;
            saveRoad = { time: 0, duration: 0, percent: 0, updated: num(road.updated || now()) };
        }
        var rec = recordFrom(state.session, saveIndex, saveRoad, saveRoad.updated || now());
        if (rec) {
            state.session.index = saveIndex;
            state.session.hash = rec.timeline_hash || hash;
            state.session.season = rec.season || state.session.season;
            state.session.episode = rec.episode || state.session.episode;
            state.session.last_road = saveRoad;
            saveRecord(rec);
            refreshUI();
        }
    }

    function normalizeMedia(url) {
        url = cleanUrl(url);
        if (url.indexOf(' or ') !== -1) url = url.split(' or ')[0].trim();
        return url;
    }
    function isPlayable(url) { return /^https?:\/\//i.test(url) && (/\/proxy(?:-dash)?\//i.test(url) || /\.(m3u8?|mpd|mp4|mkv|webm|mov|ts)(?:$|[?#])/i.test(url)); }
    function captureResolver(event) {
        if (!event || !event.params || !event.params.url) return;
        var data = event.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return; } }
        if (!data || typeof data !== 'object' || !data.url) return;
        var media = normalizeMedia(data.url);
        if (!isPlayable(media)) return;
        var resolver = { url: str(event.params.url), headers: clone(event.params.headers || {}), at: now() };
        state.resolverByMedia[media] = resolver;
        if (data.quality && typeof data.quality === 'object') {
            Object.keys(data.quality).forEach(function (q) {
                var u = data.quality[q];
                if (typeof u === 'string') {
                    u.split(' or ').forEach(function (x) { x = normalizeMedia(x); if (isPlayable(x)) state.resolverByMedia[x] = resolver; });
                }
            });
        }
    }
    function lookupResolver(media) { return state.resolverByMedia[normalizeMedia(media)] || null; }
    function isTransientOnline(url) { return /\/proxy(?:-dash)?\//i.test(str(url)); }
    function portableResolver(url) {
        url = str(url);
        try {
            var u = new URL(url, location.href);
            u.searchParams.delete('account_email');
            u.searchParams.delete('uid');
            u.searchParams.delete('nws_id');
            return u.toString();
        } catch (e) { return url; }
    }
    function localizeResolver(url) {
        url = str(url);
        try {
            var u = new URL(url, location.href);
            var email = str(Lampa.Storage.get('account_email', ''));
            var uid = str(Lampa.Storage.get('lampac_unic_id', ''));
            var nws = str(Lampa.Storage.get('lampac_nws_id', ''));
            if (email) u.searchParams.set('account_email', email);
            if (uid) u.searchParams.set('uid', uid);
            if (nws) u.searchParams.set('nws_id', nws);
            return u.toString();
        } catch (e) { return url; }
    }
    function onlineHeaders(saved) {
        var h = clone(saved || {});
        try { var aes = str(Lampa.Storage.get('aesgcmkey', '')); if (aes) h['X-Kit-AesGcm'] = aes; } catch (e) {}
        return h;
    }
    function chooseOnlineUrl(d) {
        var u = d && typeof d.url === 'string' ? d.url : '';
        if (d && d.quality && typeof d.quality === 'object') {
            var pref = 0; try { pref = parseInt(Lampa.Storage.field('video_quality_default') || 0, 10); } catch (e) {}
            if (pref && d.quality[pref]) u = d.quality[pref];
        }
        if (typeof u === 'string' && u.indexOf(' or ') !== -1) u = u.split(' or ')[0];
        return cleanUrl(u);
    }
    function resolveOnline(record, callback) {
        var o = record && record.online;
        if (!o || !o.resolver_url || !Lampa.Reguest) return callback(null);
        onlineNoty('RESOLVE ' + shortUrl(o.resolver_url));
        var n = new Lampa.Reguest();
        try { n.timeout(12000); } catch (e) {}
        n.native(localizeResolver(o.resolver_url), function (d) {
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e2) { d = null; } }
            var u = chooseOnlineUrl(d);
            onlineNoty(u ? 'RESOLVE OK ' + shortUrl(u) : 'RESOLVE EMPTY');
            callback(u ? { url: u, data: d || {} } : null);
        }, function () { onlineNoty('RESOLVE FAIL'); callback(null); }, false, { headers: onlineHeaders(o.resolver_headers) });
    }

    function isPhone() {
        try {
            var touch = num(navigator.maxTouchPoints) > 0 || ('ontouchstart' in window);
            return touch && Math.min(window.innerWidth || 9999, window.innerHeight || 9999) <= 900;
        } catch (e) { return false; }
    }
    function shortUrl(url) {
        try { var u = new URL(str(url), location.href); return (u.host + u.pathname).slice(0, 70); } catch (e) { return str(url).slice(0, 70); }
    }
    function onlineNoty(msg) {
        if (!isPhone()) return;
        try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('[CW6 online] ' + str(msg).slice(0, 180)); } catch (e) {}
    }

    function getTorrserverUrl() {
        try {
            var one = Lampa.Storage.get('torrserver_url');
            var two = Lampa.Storage.get('torrserver_url_two');
            var useTwo = str(Lampa.Storage.field('torrserver_use_link')) === 'two';
            var u = useTwo ? (two || one) : (one || two);
            if (!u) return '';
            u = str(u); if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
            return u.replace(/\/$/, '');
        } catch (e) { return ''; }
    }
    function torrentUrl(fileName, hash, fileId) {
        try {
            if (Lampa.Torserver && Lampa.Torserver.stream) {
                var u = Lampa.Torserver.stream(fileName, hash, fileId);
                if (Lampa.Torserver.toPlayUrl) u = Lampa.Torserver.toPlayUrl(u);
                return u;
            }
        } catch (e) {}
        var srv = getTorrserverUrl();
        if (!srv) return '';
        return srv + '/stream/' + encodeURIComponent(str(fileName).split('/').pop().split('\\').pop()) + '?link=' + encodeURIComponent(hash) + '&index=' + num(fileId) + '&play';
    }
    function ensureTorrent(record, movie, callback) {
        var t = record && record.torrent;
        if (!t) return callback('');
        if (!t.magnet || !Lampa.Torserver || !Lampa.Torserver.hash) return callback(t.hash || '');
        try {
            Lampa.Torserver.hash({
                title: record.title || movieTitle(movie), link: t.magnet,
                poster: record.poster || '', data: { lampa: true, movie: movie }
            }, function (x) { callback(str(x && x.hash || t.hash || '')); }, function () { callback(t.hash || ''); });
        } catch (e) { callback(t.hash || ''); }
    }
    function rebuildTorrent(record, movie, hash) {
        var t = record.torrent || {}, list = [];
        (t.items || []).forEach(function (it, idx) {
            var h = it.hash || timelineHash(movie, it.season, it.episode);
            var road = timelineView(h) || {};
            var u = torrentUrl(it.file_name, hash || t.hash, it.file_id);
            list.push({
                url: u, uri: u, src: u,
                title: it.title || ('Эпизод ' + (it.episode || idx + 1)),
                name: it.title || '', file_name: it.file_name, filename: it.file_name,
                file_index: num(it.file_id), id: num(it.file_id),
                season: num(it.season), episode: num(it.episode),
                torrent_hash: hash || t.hash,
                timeline: (function(){
                    var tline = timelineView(h) || { hash: h, time: 0, duration: 0, percent: 0 };
                    tline.hash = h;
                    tline.time = num(road.time);
                    tline.duration = num(road.duration);
                    tline.percent = num(road.percent);
                    return tline;
                })(),
                img: it.img || '', thumbnail: it.img || ''
            });
        });
        return list;
    }
    function launchTorrent(movie, record) {
        ensureTorrent(record, movie, function (hash) {
            var list = rebuildTorrent(record, movie, hash);
            if (!list.length) return noty('Не удалось восстановить торрент-плейлист');
            var idx = Math.max(0, Math.min(list.length - 1, num(record.current_index)));
            for (var i = 0; i < list.length; i++) if (record.timeline_hash && list[i].timeline && str(list[i].timeline.hash) === str(record.timeline_hash)) idx = i;
            var item = clone(list[idx]);
            var live = timelineView(record.timeline_hash) || {};
            var time = Math.max(num(record.time), num(live.time));
            var dur = Math.max(num(record.duration), num(live.duration));
            var per = Math.max(num(record.percent), num(live.percent));
            item.card = movie; item.movie = movie;
            var activeTimeline = timelineView(record.timeline_hash || (item.timeline && item.timeline.hash)) || item.timeline || {};
            activeTimeline.hash = record.timeline_hash || activeTimeline.hash || '';
            activeTimeline.time = time; activeTimeline.duration = dur; activeTimeline.percent = per;
            item.timeline = activeTimeline;
            item.position = time > 0 ? time : -1; item.time = time; item.duration = dur; item.percent = per;
            item.playlist = list; item.playlist_index = idx; item.start_index = idx;
            item.torrent_hash = hash || record.torrent.hash || 'continue_watch_v6';
            item.continue_watch_v6 = true;
            try {
                Lampa.Player.play(item);
                if (Lampa.Player.playlist) Lampa.Player.playlist(list);
            } catch (e) { noty('Ошибка запуска торрента: ' + (e.message || e)); }
        });
    }
    function launchOnline(movie, record) {
        onlineNoty('CONTINUE S' + num(record.season) + 'E' + num(record.episode) + ' ' + formatTime(record.time));
        resolveOnline(record, function (resolved) {
            var u = resolved && resolved.url ? resolved.url : (record.online && record.online.direct_url || '');
            if (!u) return noty('Не удалось получить свежую ссылку серии');
            var live = timelineView(record.timeline_hash) || {};
            var time = Math.max(num(record.time), num(live.time));
            var dur = Math.max(num(record.duration), num(live.duration));
            var per = Math.max(num(record.percent), num(live.percent));
            var onlineTimeline = timelineView(record.timeline_hash) || { hash: record.timeline_hash, time: 0, duration: 0, percent: 0 };
            onlineTimeline.hash = record.timeline_hash; onlineTimeline.time = time; onlineTimeline.duration = dur; onlineTimeline.percent = per;
            var d = {
                url: u, uri: u, src: u,
                title: record.title || movieTitle(movie), card: movie, movie: movie,
                season: num(record.season), episode: num(record.episode), isonline: true,
                timeline: onlineTimeline,
                time: time, position: time > 0 ? time : -1, duration: dur, percent: per,
                continue_watch_v6: true
            };
            if (resolved && resolved.data) {
                if (resolved.data.headers) d.headers = resolved.data.headers;
                if (resolved.data.quality) d.quality = resolved.data.quality;
                if (resolved.data.segments) d.segments = resolved.data.segments;
                if (resolved.data.subtitles) d.subtitles = resolved.data.subtitles;
                if (resolved.data.hls_manifest_timeout !== undefined) d.hls_manifest_timeout = resolved.data.hls_manifest_timeout;
            }
            onlineNoty('PLAYER ' + shortUrl(u));
            try { Lampa.Player.play(d); if (Lampa.Player.playlist) Lampa.Player.playlist([d]); } catch (e) { noty('Ошибка запуска online'); }
        });
    }
    function launch(movie) {
        var r = getRecord(movie);
        if (!r) return noty('Нет сохраненного просмотра');
        if (r.source === 'torrent' && r.torrent) return launchTorrent(movie, r);
        if (r.source === 'online' && r.online) return launchOnline(movie, r);
        noty('Неизвестный источник продолжения');
    }
    function noty(s) { try { if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(s); } catch (e) {} }

    function patchTorrent() {
        if (state.torrentPatched || !Lampa.Torrent) return;
        if (typeof Lampa.Torrent.start === 'function') {
            var oldStart = Lampa.Torrent.start;
            Lampa.Torrent.start = function (element, movie) {
                try {
                    var key = cardKey(movie || activeMovie());
                    if (key && element) state.torrentSeedByCard[key] = { magnet: str(element.MagnetUri || element.Link || ''), at: now() };
                } catch (e) {}
                return oldStart.apply(this, arguments);
            };
        }
        state.torrentPatched = true;
    }
    function patchPlayer() {
        if (state.playerPatched || !Lampa.Player || typeof Lampa.Player.play !== 'function') return;
        var old = Lampa.Player.play;
        Lampa.Player.play = function (data) {
            try {
                var s = buildSession(data || {});
                if (s) {
                    state.session = s;
                    if (s.source === 'torrent' && isJustExternal()) writePending(s);
                }
            } catch (e) { try { console.warn('[CW6] capture failed', e); } catch (ee) {} }
            return old.apply(this, arguments);
        };
        Lampa.Player.__cw6_patched = VERSION;
        state.playerPatched = true;
    }

    function injectStyle() {
        if (document.getElementById('cw6-style')) return;
        var st = document.createElement('style'); st.id = 'cw6-style';
        st.textContent = '.cw6-button{pointer-events:auto!important;cursor:pointer!important;position:relative!important}.cw6-button svg,.cw6-button span{pointer-events:none!important}.cw6-button[data-sub]:after{content:attr(data-sub);display:none;margin-left:.45em;font-size:.72em;opacity:.65;white-space:nowrap}.cw6-button:hover:after,.cw6-button.focus:after{display:inline-block}';
        document.head.appendChild(st);
    }
    function cardRoot() {
        try { var x = $('.full-start-new').last(); return x && x.length ? x : null; } catch (e) { return null; }
    }
    function buttonContainer(root) {
        var c = root.find('.full-start-new__buttons').first();
        if (!c.length) c = root.find('.buttons--container').first();
        return c;
    }
    function subtitle(r) {
        var p = [];
        if (r.media_type === 'tv' && r.season && r.episode) p.push('S' + r.season + 'E' + r.episode);
        if (r.time) p.push(formatTime(r.time));
        return p.join(' / ');
    }
    function makeButton(movie, r) {
        var b = $('<div class="full-start__button selector view--continue-watch cw6-button" data-sub="' + $('<div>').text(subtitle(r)).html() + '"><svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".3"></circle><path d="M9 7.5v9l7-4.5z" fill="currentColor"></path></svg><span>Продолжить</span></div>');
        var lock = 0;
        function go(e) {
            if (e) { try { e.preventDefault(); e.stopPropagation(); } catch (x) {} }
            if (now() - lock < 800) return false; lock = now(); launch(movie); return false;
        }
        b.on('hover:enter.cw6', go).on('click.cw6', go);
        if (!isPhone()) b.on('mousedown.cw6 pointerdown.cw6', function (e) { if (!e.pointerType || e.pointerType === 'mouse') { e.preventDefault(); e.stopPropagation(); } });
        return b;
    }
    function refreshUI() {
        if (state.uiTimer) clearTimeout(state.uiTimer);
        state.uiTimer = setTimeout(function () {
            var movie = activeMovie(), root = cardRoot();
            if (!movie || !root) return;
            var r = getRecord(movie), old = root.find('.cw6-button');
            if (!r) { old.remove(); return; }
            var key = str(r.activity_at) + '|' + r.source + '|' + r.timeline_hash + '|' + r.time;
            if (old.length && old.attr('data-state') === key) return;
            old.remove();
            var c = buttonContainer(root); if (!c || !c.length) return;
            var b = makeButton(movie, r).attr('data-state', key);
            var before = c.find('> .view--torrent').first();
            if (before.length) before.before(b); else c.prepend(b);
            try {
                var en = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled() : null;
                if (en && en.name === 'full_start' && Lampa.Controller.collectionAppend) Lampa.Controller.collectionAppend(b);
            } catch (e) {}
        }, 80);
    }

    function install() {
        if (state.installed) return;
        state.installed = true;
        ensureSync(); injectStyle();
        try { $('.button--continue-watch-native-just,.button--continue-watch-ddd,.continue-watch-ddd-source').remove(); } catch (eOld) {}
        patchTorrent(); patchPlayer();
        try { Lampa.Timeline.listener.follow('update', onTimeline); } catch (e) {}
        try { Lampa.Listener.follow('request_secuses', captureResolver); } catch (e2) {}
        try {
            Lampa.Listener.follow('full', function (e) {
                var m = e && e.data && e.data.movie; if (m) state.lastMovie = m;
                setTimeout(refreshUI, 100); setTimeout(refreshUI, 500);
            });
        } catch (e3) {}
        try { window.addEventListener('focus', function () { scheduleReconcile(); refreshUI(); }); } catch (e4) {}
        try { document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') { scheduleReconcile(); refreshUI(); } }); } catch (e5) {}
        setInterval(function () { patchTorrent(); patchPlayer(); refreshUI(); }, 1800);
        setTimeout(reconcilePending, 1000);

        window.ContinueWatchV6 = {
            version: VERSION,
            record: function () { var m = activeMovie(); return m ? getRecord(m) : null; },
            session: function () { return state.session; },
            pending: readPending,
            reconcile: reconcilePending,
            launch: function () { var m = activeMovie(); if (m) launch(m); },
            source: function () { var r = activeMovie() ? getRecord(activeMovie()) : null; return r && r.source; }
        };
    }

    if (window.appready) install();
    else {
        try { Lampa.Listener.follow('app', function (e) { if (e && e.type === 'ready') install(); }); } catch (e) {}
        setTimeout(install, 1200);
        setTimeout(install, 4000);
    }
})();