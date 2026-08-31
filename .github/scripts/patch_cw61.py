from pathlib import Path
import re

p = Path('ContinueWatching.js')
s = p.read_text(encoding='utf-8')

def sub(pattern, repl, label, flags=re.S):
    global s
    s2, n = re.subn(pattern, repl, s, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 replacement, got {n}')
    s = s2

s = s.replace("var VERSION = 'v6.0.0-clean-timeline-core-20260830';", "var VERSION = 'v6.1.0-sync-metadata-ux-20260831';", 1)
s = s.replace("var PENDING_BASE = 'continue_watch_v6_pending';", "var PENDING_BASE = 'continue_watch_v6_pending';\n    var OUTBOX_BASE = 'continue_watch_v6_outbox';", 1)
s = s.replace("        installed: false\n    };", "        installed: false,\n        syncKeys: {},\n        syncFlushTimer: null,\n        controllerNode: null,\n        controllerState: ''\n    };", 1)

sub(
    r"    function clone\(obj\) \{.*?\n    \}\n    function json\(v\)",
    '''    function clone(obj) {
        var out = {};
        if (!obj || typeof obj !== 'object') return out;
        Object.keys(obj).forEach(function (k) {
            var v = obj[k];
            if (v === undefined || typeof v === 'function') return;
            out[k] = v;
        });
        return out;
    }
    function deepCopy(value) {
        if (value === undefined || value === null) return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
    }
    function playbackMeta(source) {
        source = source || {};
        var meta = {};
        ['segments','subtitles','quality','headers','ffprobe','translate','voiceovers'].forEach(function (key) {
            if (source[key] !== undefined && typeof source[key] !== 'function') {
                var copy = deepCopy(source[key]);
                if (copy !== null && copy !== undefined) meta[key] = copy;
            }
        });
        ['hls_manifest_timeout','voice_name','subtitles_call','first_title'].forEach(function (key) {
            if (source[key] !== undefined && source[key] !== null && typeof source[key] !== 'function') meta[key] = source[key];
        });
        var image = source.thumbnail || source.img || source.image || source.still_path || '';
        if (image) meta.thumbnail = str(image);
        return meta;
    }
    function mergeMeta(a, b) {
        var out = clone(a || {});
        Object.keys(b || {}).forEach(function (key) { if (b[key] !== undefined) out[key] = b[key]; });
        return out;
    }
    function applyMeta(target, meta) {
        if (!target || !meta) return target;
        Object.keys(meta).forEach(function (key) {
            if (meta[key] === undefined) return;
            var copy = deepCopy(meta[key]);
            target[key] = copy === null ? meta[key] : copy;
        });
        if (meta.thumbnail) { target.thumbnail = meta.thumbnail; if (!target.img) target.img = meta.thumbnail; }
        return target;
    }
    function json(v)''',
    'helpers'
)

sub(
    r"    function storageKey\(\) \{.*?\n    function compactRecord\(r\)",
    '''    function storageKey() { return STORAGE_BASE + '_' + profileId(); }
    function pendingKey() { return PENDING_BASE + '_' + profileId(); }
    function outboxKey() { return OUTBOX_BASE + '_' + profileId(); }
    function ensureSync() {
        if (profileId() === 'guest') return;
        var key = storageKey();
        if (state.syncKeys[key]) return;
        try {
            Lampa.Storage.sync(key, 'object_object');
            state.syncKeys[key] = true;
        } catch (e) {}
    }
    function store() {
        ensureSync();
        try {
            var v = Lampa.Storage.get(storageKey(), {});
            return v && typeof v === 'object' ? v : {};
        } catch (e) { return {}; }
    }
    function readOutbox() {
        try {
            var raw = localStorage.getItem(outboxKey());
            var v = raw ? JSON.parse(raw) : {};
            return v && typeof v === 'object' ? v : {};
        } catch (e) { return {}; }
    }
    function writeOutbox(v) {
        try {
            var keys = Object.keys(v || {});
            if (keys.length > 120) {
                keys.sort(function (a, b) { return num(v[b] && v[b].activity_at) - num(v[a] && v[a].activity_at); });
                var keep = {};
                keys.slice(0, 120).forEach(function (k) { keep[k] = v[k]; });
                v = keep;
            }
            localStorage.setItem(outboxKey(), JSON.stringify(v || {}));
        } catch (e) {}
    }
    function queueOutbox(record) {
        if (!record || !record.card_key || profileId() === 'guest') return;
        var out = readOutbox();
        var key = recordKey(record.card_key);
        var old = out[key];
        if (!old || num(record.activity_at) >= num(old.activity_at)) out[key] = deepCopy(record) || clone(record);
        writeOutbox(out);
    }
    function writeStore(v) {
        try { Lampa.Storage.set(storageKey(), v); } catch (e) {}
    }
    function flushOutbox(forceWrite) {
        if (profileId() === 'guest') return false;
        ensureSync();
        var out = readOutbox();
        if (!Object.keys(out).length) { refreshUI(); return false; }
        var all = store();
        var changed = false;
        Object.keys(out).forEach(function (key) {
            var local = out[key];
            var remote = all[key];
            if (!local || !local.card_key) return;
            if (!remote || num(local.activity_at) > num(remote.activity_at)) {
                all[key] = deepCopy(local) || clone(local);
                changed = true;
            }
        });
        if (changed || forceWrite) writeStore(all);
        refreshUI();
        return changed;
    }
    function scheduleSyncFlush() {
        if (state.syncFlushTimer) clearTimeout(state.syncFlushTimer);
        state.syncFlushTimer = setTimeout(function () { state.syncFlushTimer = null; flushOutbox(true); }, 6500);
    }
    function seedOutboxFromStore() {
        if (profileId() === 'guest') return;
        var all = store();
        Object.keys(all || {}).forEach(function (key) {
            var r = all[key];
            if (r && r.card_key) queueOutbox(r);
        });
    }
    function getRecord(movie) {
        var key = recordKey(movie);
        if (!key) return null;
        var all = store();
        var r = all[key];
        if (!r || r.card_key !== cardKey(movie)) return null;
        var effective = reconcileRecordTimeline(r);
        if (effective && num(effective.activity_at) > num(r.activity_at)) {
            setTimeout(function () { saveRecord(effective); }, 0);
        }
        return effective || r;
    }
    function saveRecord(record) {
        if (!record || !record.card_key) return false;
        compactRecord(record);
        var all = store();
        var key = recordKey(record.card_key);
        var old = all[key];
        if (old && num(old.activity_at) > num(record.activity_at)) return false;
        queueOutbox(record);
        all[key] = deepCopy(record) || record;
        writeStore(all);
        scheduleSyncFlush();
        return true;
    }
    function compactRecord(r)''',
    'storage sync block'
)

sub(
    r"    function compactRecord\(r\) \{.*?\n    \}\n\n    function timelineView",
    '''    function compactRecord(r) {
        if (!r) return r;
        function stripHeavyMeta(item, keepSegments) {
            if (!item || !item.meta) return;
            delete item.meta.subtitles;
            delete item.meta.quality;
            delete item.meta.headers;
            delete item.meta.ffprobe;
            delete item.meta.translate;
            delete item.meta.voiceovers;
            if (!keepSegments) delete item.meta.segments;
        }
        if (json(r).length <= SYNC_MAX) return r;
        if (r.torrent && r.torrent.items) r.torrent.items.forEach(function (i) { delete i.img; });
        if (r.online && r.online.items) r.online.items.forEach(function (i) { delete i.img; });
        delete r.poster;
        if (json(r).length <= SYNC_MAX) return r;
        if (r.torrent && r.torrent.items) r.torrent.items.forEach(function (i, idx) { if (idx !== num(r.current_index)) stripHeavyMeta(i, true); });
        if (r.online && r.online.items) r.online.items.forEach(function (i, idx) { if (idx !== num(r.current_index)) stripHeavyMeta(i, true); });
        if (json(r).length <= SYNC_MAX) return r;
        if (r.torrent && r.torrent.items) r.torrent.items.forEach(function (i) { if (i.title) i.title = str(i.title).slice(0, 70); if (i.file_name) i.file_name = str(i.file_name).slice(0, 180); });
        if (r.online && r.online.items) r.online.items.forEach(function (i) { if (i.title) i.title = str(i.title).slice(0, 70); });
        if (json(r).length <= SYNC_MAX) return r;
        if (r.torrent && r.torrent.items) r.torrent.items.forEach(function (i) { stripHeavyMeta(i, true); });
        if (r.online && r.online.items) r.online.items.forEach(function (i) { stripHeavyMeta(i, true); });
        return r;
    }

    function timelineView''',
    'compactRecord'
)

sub(
    r"    function timelineView\(hash\) \{.*?\n    \}\n    function timelineHash",
    '''    function timelineView(hash) {
        try { return hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null; } catch (e) { return null; }
    }
    function reconcileRecordTimeline(record) {
        if (!record) return record;
        var out = deepCopy(record) || clone(record);
        var items = out.source === 'torrent' && out.torrent && out.torrent.items
            ? out.torrent.items
            : (out.source === 'online' && out.online && out.online.items ? out.online.items : []);
        if (!items.length) return out;
        var best = null;
        items.forEach(function (it, idx) {
            if (!it || !it.hash) return;
            var road = timelineView(it.hash) || {};
            var updated = num(road.updated);
            if (!updated || (!num(road.time) && !num(road.percent))) return;
            if (!best || updated > best.updated) best = { idx: idx, it: it, road: road, updated: updated };
        });
        if (!best || best.updated <= num(out.activity_at)) return out;
        if (out.source === 'torrent' && num(best.road.percent) >= 100 && best.idx + 1 < items.length) {
            best = { idx: best.idx + 1, it: items[best.idx + 1], road: { time: 0, duration: 0, percent: 0, updated: best.updated }, updated: best.updated };
        }
        out.current_index = best.idx;
        out.season = num(best.it.season);
        out.episode = num(best.it.episode);
        out.timeline_hash = str(best.it.hash);
        out.time = num(best.road.time);
        out.duration = num(best.road.duration);
        out.percent = clamp(best.road.percent || (best.road.duration ? Math.round(num(best.road.time) / num(best.road.duration) * 100) : 0), 0, 100);
        out.activity_at = best.updated;
        if (out.torrent) out.torrent.index = best.idx;
        if (out.online) out.online.index = best.idx;
        return out;
    }
    function timelineHash''',
    'timeline reconcile'
)

s = s.replace(
"        if (list.length) {\n            for (var i = 0; i < list.length; i++) {\n                var pse = itemSE(list[i], i);\n                list[i].season = num(list[i].season || pse.season);\n                list[i].episode = num(list[i].episode || pse.episode);\n                if (!list[i].timeline) list[i].timeline = {};\n                if (!list[i].timeline.hash) list[i].timeline.hash = exactHash(list[i], movie, list[i].season, list[i].episode);\n            }\n        }",
"        if (list.length) {\n            for (var i = 0; i < list.length; i++) {\n                var pse = itemSE(list[i], i);\n                list[i].season = num(list[i].season || pse.season);\n                list[i].episode = num(list[i].episode || pse.episode);\n                if (!list[i].timeline) list[i].timeline = {};\n                if (!list[i].timeline.hash) list[i].timeline.hash = exactHash(list[i], movie, list[i].season, list[i].episode);\n            }\n            if (list[idx]) applyMeta(list[idx], playbackMeta(data));\n        }", 1)

s = s.replace(
"            resolver: null,\n            created_at: now(),",
"            resolver: null,\n            active_meta: playbackMeta(data),\n            created_at: now(),", 1)

sub(
    r"    function torrentDescriptor\(session\) \{.*?\n    \}\n\n    function recordFrom",
    '''    function torrentDescriptor(session) {
        if (!session || session.source !== 'torrent') return null;
        var items = [];
        var list = session.playlist.length ? session.playlist : [session.movie || {}];
        for (var i = 0; i < list.length; i++) {
            var item = list[i] || {};
            var parsed = parseStream(item.url || item.uri || item.src || '');
            var se = itemSE(item, i);
            var h = exactHash(item, session.movie, se.season, se.episode);
            var meta = playbackMeta(item);
            if (i === num(session.index)) meta = mergeMeta(meta, session.active_meta || {});
            items.push({
                file_id: parsed ? num(parsed.file_id) : num(item.file_index !== undefined ? item.file_index : (item.id !== undefined ? item.id : i)),
                file_name: parsed && parsed.file_name ? parsed.file_name : str(item.file_name || item.filename || item.path_human || item.path || item.title || ''),
                title: str(item.title || item.name || ''),
                season: num(se.season),
                episode: num(se.episode),
                hash: h,
                img: str(item.img || item.thumbnail || ''),
                meta: meta
            });
        }
        return {
            hash: session.torrent_hash || (items[session.index] && parseStream(session.url) ? parseStream(session.url).hash : ''),
            magnet: session.magnet || '',
            index: session.index,
            items: items
        };
    }
    function onlineDescriptor(session) {
        if (!session || session.source !== 'online') return null;
        var list = session.playlist.length ? session.playlist : [{}];
        var items = list.map(function (item, idx) {
            item = item || {};
            var se = itemSE(item, idx);
            var h = exactHash(item, session.movie, se.season, se.episode);
            var raw = typeof item.url === 'string' ? cleanUrl(item.url) : '';
            var resolver = lookupResolver(raw);
            if (idx === num(session.index) && session.resolver) resolver = session.resolver;
            var meta = playbackMeta(item);
            if (idx === num(session.index)) meta = mergeMeta(meta, session.active_meta || {});
            return {
                title: str(item.title || item.name || (idx === num(session.index) ? session.movie.name || session.movie.title || '' : '')),
                season: num(se.season), episode: num(se.episode), hash: h,
                img: str(item.thumbnail || item.img || ''),
                voice_name: str(item.voice_name || ''),
                direct_url: raw && !isTransientOnline(raw) ? raw : '',
                resolver_url: resolver ? portableResolver(resolver.url) : '',
                resolver_headers: resolver ? clone(resolver.headers || {}) : {},
                meta: meta
            };
        });
        return {
            resolver_url: session.resolver ? portableResolver(session.resolver.url) : '',
            resolver_headers: session.resolver ? clone(session.resolver.headers || {}) : {},
            direct_url: isTransientOnline(session.url) ? '' : session.url,
            index: num(session.index),
            items: items
        };
    }

    function recordFrom''',
    'descriptors'
)

s = s.replace(
"            title: movieTitle(session.movie),\n            source: session.source,",
"            title: movieTitle(session.movie),\n            episode_title: str(item.title || item.name || ''),\n            source: session.source,", 1)

sub(
    r"        if \(session.source === 'torrent'\) r.torrent = torrentDescriptor\(session\);\n        if \(session.source === 'online'\) \{.*?\n        \}\n        return r;",
    '''        if (session.source === 'torrent') r.torrent = torrentDescriptor(session);
        if (session.source === 'online') r.online = onlineDescriptor(session);
        return r;''',
    'record online'
)

sub(
    r"        var list = p\.torrent\.items\.map\(function \(it\) \{\n            return \{.*?\n            \};\n        \}\);",
    '''        var list = p.torrent.items.map(function (it) {
            var item = {
                title: it.title,
                season: it.season,
                episode: it.episode,
                timeline: { hash: it.hash },
                file_index: it.file_id,
                file_name: it.file_name,
                img: it.img,
                torrent_hash: p.torrent.hash
            };
            applyMeta(item, it.meta || {});
            return item;
        });''',
    'pending metadata'
)

sub(
    r"    function rebuildTorrent\(record, movie, hash\) \{.*?\n    \}\n    function launchTorrent",
    '''    function rebuildTorrent(record, movie, hash) {
        var t = record.torrent || {}, list = [];
        (t.items || []).forEach(function (it, idx) {
            var h = it.hash || timelineHash(movie, it.season, it.episode);
            var road = timelineView(h) || {};
            var u = torrentUrl(it.file_name, hash || t.hash, it.file_id);
            var item = {
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
            };
            applyMeta(item, it.meta || {});
            list.push(item);
        });
        return list;
    }
    function launchTorrent''',
    'rebuild torrent'
)

sub(
    r"    function launchOnline\(movie, record\) \{.*?\n    \}\n    function launch\(movie\)",
    '''    function launchOnline(movie, record) {
        onlineNoty('CONTINUE S' + num(record.season) + 'E' + num(record.episode) + ' ' + formatTime(record.time));
        resolveOnline(record, function (resolved) {
            var online = record.online || {};
            var defs = Array.isArray(online.items) && online.items.length ? online.items : [{
                title: record.episode_title || record.title, season: record.season, episode: record.episode,
                hash: record.timeline_hash, direct_url: online.direct_url || '', meta: {}
            }];
            var idx = Math.max(0, Math.min(defs.length - 1, num(record.current_index !== undefined ? record.current_index : online.index)));
            var list = defs.map(function (it, i) {
                var h = it.hash || timelineHash(movie, it.season, it.episode);
                var road = timelineView(h) || {};
                var item = {
                    url: it.direct_url || '', uri: it.direct_url || '', src: it.direct_url || '',
                    title: it.title || ('Эпизод ' + (it.episode || i + 1)),
                    name: it.title || '', season: num(it.season), episode: num(it.episode),
                    voice_name: it.voice_name || '', thumbnail: it.img || '', img: it.img || '',
                    timeline: timelineView(h) || { hash: h, time: num(road.time), duration: num(road.duration), percent: num(road.percent) }
                };
                applyMeta(item, it.meta || {});
                return item;
            });
            var activeDef = defs[idx] || {};
            var u = resolved && resolved.url ? resolved.url : (activeDef.direct_url || online.direct_url || '');
            if (!u) return noty('Не удалось получить свежую ссылку серии');
            var live = timelineView(record.timeline_hash) || {};
            var time = Math.max(num(record.time), num(live.time));
            var dur = Math.max(num(record.duration), num(live.duration));
            var per = Math.max(num(record.percent), num(live.percent));
            var d = list[idx] || {};
            d.url = u; d.uri = u; d.src = u;
            d.title = activeDef.title || record.episode_title || record.title || movieTitle(movie);
            d.card = movie; d.movie = movie;
            d.season = num(record.season || activeDef.season); d.episode = num(record.episode || activeDef.episode); d.isonline = true;
            var onlineTimeline = timelineView(record.timeline_hash) || d.timeline || { hash: record.timeline_hash, time: 0, duration: 0, percent: 0 };
            onlineTimeline.hash = record.timeline_hash; onlineTimeline.time = time; onlineTimeline.duration = dur; onlineTimeline.percent = per;
            d.timeline = onlineTimeline;
            d.time = time; d.position = time > 0 ? time : -1; d.duration = dur; d.percent = per;
            d.playlist = list; d.playlist_index = idx; d.start_index = idx; d.currentItem = d;
            d.continue_watch_v6 = true;
            if (resolved && resolved.data) applyMeta(d, playbackMeta(resolved.data));
            list[idx] = d;
            onlineNoty('PLAYER ' + shortUrl(u) + ' playlist=' + list.length + ' title=' + str(d.title).slice(0, 35));
            try {
                Lampa.Player.play(d);
                if (Lampa.Player.playlist) Lampa.Player.playlist(list);
            } catch (e) { noty('Ошибка запуска online'); }
        });
    }
    function launch(movie)''',
    'launch online'
)

sub(
    r"    function injectStyle\(\) \{.*?\n    function install\(\)",
    '''    function injectStyle() {
        var st = document.getElementById('cw6-style');
        if (!st) { st = document.createElement('style'); st.id = 'cw6-style'; document.head.appendChild(st); }
        st.textContent =
            '.button--continue-watch-native-just{opacity:1!important;pointer-events:auto!important;cursor:pointer!important;position:relative!important}' +
            '.button--continue-watch-native-just .continue-watch-native-just-icon{flex-shrink:0;pointer-events:none!important}' +
            '.button--continue-watch-native-just span,.button--continue-watch-native-just:after{pointer-events:none!important}' +
            '.button--continue-watch-native-just span{white-space:nowrap}' +
            '.button--continue-watch-native-just[data-cwu-subtitle]:after{content:attr(data-cwu-subtitle);display:none!important;margin-left:.45em;font-size:.72em;line-height:1;opacity:.65;white-space:nowrap;transform:translateY(.06em)}' +
            '.button--continue-watch-native-just:hover:after,.button--continue-watch-native-just.focus:after{display:inline-block!important}';
    }
    function cardRoot() {
        try { var x = $('.full-start-new').last(); return x && x.length ? x : null; } catch (e) { return null; }
    }
    function buttonContainer(root) {
        var c = root.find('.full-start-new__buttons').first();
        if (!c.length) c = root.find('.buttons--container').first();
        return c;
    }
    function recordRoad(r) {
        var road = { time: num(r && r.time), duration: num(r && r.duration), percent: num(r && r.percent) };
        var live = r && r.timeline_hash ? timelineView(r.timeline_hash) : null;
        if (live) {
            road.time = Math.max(road.time, num(live.time));
            road.duration = Math.max(road.duration, num(live.duration));
            road.percent = Math.max(road.percent, num(live.percent));
        }
        if (!road.percent && road.time && road.duration) road.percent = Math.round(road.time / road.duration * 100);
        road.percent = clamp(road.percent, 0, 100);
        return road;
    }
    function subtitle(r, road) {
        var p = [];
        if (r.media_type === 'tv' && r.season && r.episode) p.push('S' + r.season + 'E' + r.episode);
        if (road && road.time) p.push(formatTime(road.time));
        return p.join(' / ');
    }
    function makeButton(movie, r) {
        var road = recordRoad(r);
        var sub = $('<div>').text(subtitle(r, road)).html();
        var dash = (road.percent * 65.97 / 100).toFixed(2);
        var b = $('<div class="full-start__button selector view--continue-watch button--continue-watch button--continue-watch-native-just cw6-button" data-cwu-subtitle="' + sub + '">' +
            '<svg class="continue-watch-native-just-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1.7" fill="none" opacity="0.22"></circle>' +
            '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="' + dash + ' 65.97" transform="rotate(-90 12 12)"></circle>' +
            '<path d="M9 7.7v8.6c0 .55.6.89 1.08.6l6.62-4.3a.72.72 0 0 0 0-1.2l-6.62-4.3A.7.7 0 0 0 9 7.7z" fill="currentColor"></path></svg><span>Продолжить</span></div>');
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
            var r = getRecord(movie), old = root.find('.cw6-button,.button--continue-watch-native-just');
            if (!r) { old.remove(); return; }
            var road = recordRoad(r);
            var key = str(r.activity_at) + '|' + r.source + '|' + r.timeline_hash + '|' + road.time + '|' + road.percent;
            if (old.length && old.attr('data-state') === key) return;
            old.remove();
            var c = buttonContainer(root); if (!c || !c.length) return;
            var b = makeButton(movie, r).attr('data-state', key);
            var before = c.find('> .view--torrent').first();
            var trailer = c.find('> .view--trailer').first();
            if (before.length) before.before(b); else if (trailer.length) trailer.before(b); else c.prepend(b);
            try {
                var en = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled() : null;
                if (en && en.name === 'full_start' && Lampa.Controller.collectionAppend) {
                    if (state.controllerNode !== b[0] || state.controllerState !== key) {
                        Lampa.Controller.collectionAppend(b);
                        state.controllerNode = b[0]; state.controllerState = key;
                    }
                }
            } catch (e) {}
        }, 80);
    }

    function install()''',
    'ux block'
)

s = s.replace(
"        ensureSync(); injectStyle();",
"        ensureSync(); injectStyle(); seedOutboxFromStore();", 1)

s = s.replace(
"        try { Lampa.Listener.follow('request_secuses', captureResolver); } catch (e2) {}",
"        try { Lampa.Listener.follow('request_secuses', captureResolver); } catch (e2) {}\n        try {\n            Lampa.Listener.follow('worker_storage', function (e) {\n                if (!e || e.type !== 'insert' || e.name !== storageKey()) return;\n                setTimeout(function () { flushOutbox(true); refreshUI(); }, 180);\n            });\n        } catch (eSync) {}\n        try {\n            if (Lampa.Storage && Lampa.Storage.listener && Lampa.Storage.listener.follow) {\n                Lampa.Storage.listener.follow('change', function (e) {\n                    if (!e) return;\n                    if (e.name === storageKey()) refreshUI();\n                    if (e.name === 'account') setTimeout(function () { ensureSync(); seedOutboxFromStore(); flushOutbox(true); refreshUI(); }, 5500);\n                });\n            }\n        } catch (eStorage) {}", 1)

s = s.replace(
"        setTimeout(reconcilePending, 1000);",
"        setTimeout(reconcilePending, 1000);\n        setTimeout(function () { ensureSync(); flushOutbox(true); refreshUI(); }, 7500);\n        setTimeout(function () { ensureSync(); flushOutbox(true); refreshUI(); }, 17000);", 1)

s = s.replace(
"            source: function () { var r = activeMovie() ? getRecord(activeMovie()) : null; return r && r.source; }",
"            source: function () { var r = activeMovie() ? getRecord(activeMovie()) : null; return r && r.source; },\n            sync: function () { return { key: storageKey(), outbox: readOutbox(), store: store() }; }", 1)

# Sanity guards
for must in [
    "v6.1.0-sync-metadata-ux-20260831",
    "worker_storage",
    "continue_watch_v6_outbox",
    "Lampa.Player.playlist(list)",
    "segments",
    "onlineDescriptor",
    "button--continue-watch-native-just"
]:
    if must not in s:
        raise SystemExit(f'missing guard: {must}')

p.write_text(s, encoding='utf-8')
Path('ContinueWatching-v6.1.js').write_text(s, encoding='utf-8')
print('patched', len(s), 'chars')
