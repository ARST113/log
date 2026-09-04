(function () {
    'use strict';

    var VERSION = 'v6.2.5-lampac-key-sync-20260904';
    var STORAGE_BASE = 'continue_watch_v6';
    var PENDING_BASE = 'continue_watch_v6_pending';
    var OUTBOX_BASE = 'continue_watch_v6_outbox';
    var LAMPAC_BASE = 'https://lampac.fun';
    var REMOTE_SCHEMA = 1;
    var REMOTE_PATH = 'continuewatch';
    var REMOTE_TIMEOUT = 8000;
    var REMOTE_DEBOUNCE = 650;
    var MIN_TIME = 5;
    var SYNC_MAX = 9000;
    var EXTERNAL_SETTLE = 1500;
    var EXTERNAL_WINDOW = 5000;
    var COMPLETION_PERCENT_TOLERANCE = 8;
    var COMPLETION_JUMP_TOLERANCE = 45;
    var TORRENT_HASH_FALLBACK = 2000;
    var ONLINE_CANDIDATE_TIMEOUT = 15000;
    var ONLINE_LAUNCH_DEADLINE = 30000;
    var ONLINE_RESOLVER_CAPTURE_MAX_AGE = 5 * 60 * 1000;
    var ONLINE_RESOLVER_CARD_FALLBACK_MAX_AGE = 15000;

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
        playerListenerPatched: false,
        playerPlaylistPatched: false,
        playerCaptureData: null,
        playerCaptureAt: 0,
        torrentPatched: false,
        installed: false,
        syncFlushTimer: null,
        remoteBusy: false,
        remoteQueued: false,
        remoteTimer: null,
        remoteGeneration: 0,
        remoteIdentityKey: null,
        remoteGetOk: 0,
        remoteSetOk: 0,
        controllerNode: null,
        controllerState: '',
        onlineLaunchSeed: null
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
    function resolverSelection(url, fallback) {
        fallback = fallback || {};
        var out = {
            provider: str(fallback.provider || fallback.balanser || '').trim().toLowerCase(),
            translation: str(fallback.translation || fallback.voice || '').trim().toLowerCase()
        };
        try {
            var u = new URL(str(url), location.href);
            var provider = u.pathname.match(/\/(?:lite\/)?([^/]+)\/(?:video|serial|movie|episodes?)(?:\/|$)/i);
            if (provider) out.provider = str(provider[1]).trim().toLowerCase();
            var keys = ['t', 'translation', 'voice', 'voiceover', 'dub'];
            for (var i = 0; i < keys.length; i++) {
                var value = u.searchParams.get(keys[i]);
                if (value !== null && value !== '') { out.translation = str(value).trim().toLowerCase(); break; }
            }
        } catch (e) {}
        return out;
    }
    function selectionKey(selection) {
        selection = selection || {};
        var provider = str(selection.provider).trim().toLowerCase();
        var translation = str(selection.translation).trim().toLowerCase();
        return provider || translation ? provider + '|' + translation : '';
    }
    function selectionMatches(expected, actual) {
        expected = expected || {}; actual = actual || {};
        var ep = str(expected.provider).trim().toLowerCase(), ap = str(actual.provider).trim().toLowerCase();
        var et = str(expected.translation).trim().toLowerCase(), at = str(actual.translation).trim().toLowerCase();
        if (ep && ap && ep !== ap) return false;
        if (et && at && et !== at) return false;
        if (et && !at) return false;
        return true;
    }
    function onlineSelection(online) {
        online = online || {};
        var candidates = [{ url: online.resolver_url || '', selection: online.selection || {} }];
        (online.items || []).forEach(function (item) {
            item = item || {};
            candidates.push({ url: item.resolver_url || '', selection: item.selection || {} });
        });
        for (var i = 0; i < candidates.length; i++) {
            var selection = resolverSelection(candidates[i].url, candidates[i].selection);
            if (selectionKey(selection)) return selection;
        }
        return {};
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
    function currentActivityMovie() {
        try {
            var a = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
            return a && (a.movie || a.card || (a.params && a.params.movie)) || null;
        } catch (e) { return null; }
    }
    function getMovieFromData(data) {
        data = data || {};
        return data.card || data.movie || (data.currentItem && data.currentItem.card) || currentActivityMovie() || state.lastMovie || {};
    }
    function activeMovie() {
        var m = currentActivityMovie();
        if (m) state.lastMovie = m;
        return m || state.lastMovie;
    }
    function profileId() {
        var a = null;
        try { a = Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account; } catch (e) {}
        try { if (!a) a = Lampa.Storage.get('account', {}); } catch (e2) {}
        if (a && a.profile && a.profile.id !== undefined && a.profile.id !== null && a.profile.id !== '') return str(a.profile.id);
        try {
            var configured = str(Lampa.Storage.get('lampac_profile_id', '')).trim();
            if (configured) return configured;
        } catch (e0) {}
        return 'default';
    }
    function remoteProfileId() {
        try {
            var configured = str(Lampa.Storage.get('lampac_profile_id', '')).trim();
            if (configured) return configured;
        } catch (e) {}
        return '';
    }
    function storageKeyForProfile(profile) { return STORAGE_BASE + '_' + profile; }
    function pendingKeyForProfile(profile) { return PENDING_BASE + '_' + profile; }
    function outboxKeyForProfile(profile) { return OUTBOX_BASE + '_' + profile; }
    function storageKey() { return storageKeyForProfile(profileId()); }
    function pendingKey() { return pendingKeyForProfile(profileId()); }
    function outboxKey() { return outboxKeyForProfile(profileId()); }
    function lampacTokenFromUrl(value) {
        try {
            var u = new URL(str(value), location.href);
            if (str(u.hostname).toLowerCase() !== 'lampac.fun') return '';
            var pathMatch = u.pathname.match(/^\/sync\/js\/([^/]+)$/i);
            var token = pathMatch ? decodeURIComponent(pathMatch[1]) :
                (u.pathname === '/sync.js' ? str(u.searchParams.get('token') || '') : '');
            return str(token).trim();
        } catch (e) { return ''; }
    }
    function registeredLampacToken() {
        var plugins = [];
        try { plugins = Lampa.Storage.get('plugins', []); } catch (e) {}
        if (typeof plugins === 'string') {
            try { plugins = JSON.parse(plugins); } catch (e2) { plugins = []; }
        }
        if (!Array.isArray(plugins)) return '';
        for (var i = 0; i < plugins.length; i++) {
            var plugin = plugins[i];
            var enabled = true;
            var url = plugin;
            if (plugin && typeof plugin === 'object') {
                url = plugin.url;
                enabled = plugin.status === true || str(plugin.status) === '1';
            }
            if (!enabled) continue;
            var token = lampacTokenFromUrl(url);
            if (token) return token;
        }
        return '';
    }
    function discoverLampacToken() {
        var scripts = [];
        try { scripts = document && document.scripts ? document.scripts : []; } catch (e) {}
        for (var i = 0; i < scripts.length; i++) {
            var token = lampacTokenFromUrl(scripts[i] && scripts[i].src);
            if (token) return token;
        }
        return registeredLampacToken();
    }
    function lampacIdentity() {
        return { token: discoverLampacToken(), profile_id: remoteProfileId() };
    }
    function lampacStorageUrl(action, identity) {
        identity = identity || lampacIdentity();
        var u = new URL('/storage/' + (action === 'set' ? 'set' : 'get'), LAMPAC_BASE);
        u.searchParams.set('path', REMOTE_PATH);
        u.searchParams.set('pathfile', STORAGE_BASE + (identity.profile_id ? '_' + identity.profile_id : ''));
        if (identity.profile_id) u.searchParams.set('profile_id', identity.profile_id);
        if (identity.token) u.searchParams.set('token', identity.token);
        return u.toString();
    }
    function remoteAvailable(identity) {
        identity = identity || lampacIdentity();
        return !!identity.token;
    }
    function identityFingerprint(identity) {
        identity = identity || {};
        return [identity.token, identity.profile_id].map(str).join('\u001f');
    }
    function remoteContext() {
        var profile = profileId();
        var identity = lampacIdentity();
        return {
            profile: profile,
            storageKey: storageKeyForProfile(profile),
            outboxKey: outboxKeyForProfile(profile),
            identity: identity,
            identityKey: identityFingerprint(identity),
            generation: state.remoteGeneration,
            getUrl: lampacStorageUrl('get', identity),
            setUrl: lampacStorageUrl('set', identity)
        };
    }
    function remoteContextCurrent(context) {
        return !!context && context.generation === state.remoteGeneration && context.profile === profileId() &&
            context.identityKey === identityFingerprint(lampacIdentity());
    }
    function detectRemoteIdentityChange() {
        var nextIdentityKey = identityFingerprint(lampacIdentity());
        if (state.remoteIdentityKey === null) {
            state.remoteIdentityKey = nextIdentityKey;
            return false;
        }
        if (state.remoteIdentityKey === nextIdentityKey) return false;
        state.remoteIdentityKey = nextIdentityKey;
        state.remoteGeneration += 1;
        seedOutboxFromStore();
        syncRemote('identity-script');
        refreshUI();
        return true;
    }
    function markRemote(action, status) {
        if (status === 'ok') {
            if (action === 'get') state.remoteGetOk += 1;
            if (action === 'set') state.remoteSetOk += 1;
        }
        try {
            var marker = document.getElementById('cw6-style');
            if (!marker || !marker.setAttribute) return;
            marker.setAttribute('data-cw-version', VERSION);
            marker.setAttribute('data-cw-remote-state', action + '-' + status);
            marker.setAttribute('data-cw-remote-gets', str(state.remoteGetOk));
            marker.setAttribute('data-cw-remote-sets', str(state.remoteSetOk));
        } catch (e) {}
    }
    function remoteResponseStatus(value) {
        var parsed = value;
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (e) { return 'invalid'; }
        }
        return parsed && typeof parsed === 'object' && parsed.success === false ? 'rejected' : 'ok';
    }
    function remoteErrorStatus(value) {
        var status = num(value && (value.status || value.statusCode));
        return status > 0 ? 'error-' + status : 'error';
    }
    function remoteRequest(action, body, callback, requestUrl) {
        var settled = false;
        var timer = null;
        function finish(value, status) {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            markRemote(action, status || 'error');
            callback(value);
        }
        if ((!requestUrl && !remoteAvailable()) || !Lampa.Reguest) return finish(null, 'disabled');
        markRemote(action, 'start');
        timer = setTimeout(function () { finish(null, 'timeout'); }, REMOTE_TIMEOUT);
        try {
            if (action === 'set' && typeof $ !== 'undefined' && $ && $.ajax) {
                $.ajax({
                    url: requestUrl || lampacStorageUrl(action),
                    type: 'POST',
                    data: body,
                    async: true,
                    cache: false,
                    contentType: false,
                    processData: false,
                    timeout: REMOTE_TIMEOUT,
                    success: function (data) { finish(data, remoteResponseStatus(data)); },
                    error: function (error) { finish(null, remoteErrorStatus(error)); }
                });
                return;
            }
            var request = new Lampa.Reguest();
            try { request.timeout(REMOTE_TIMEOUT); } catch (e) {}
            request.native(requestUrl || lampacStorageUrl(action), function (data) { finish(data, remoteResponseStatus(data)); }, function () { finish(null, 'error'); },
                action === 'set' ? body : false);
        } catch (e2) { finish(null, 'error'); }
    }
    function parseRemoteDocument(value) {
        if (typeof value === 'string') {
            try { value = JSON.parse(value); } catch (e) { return null; }
        }
        if (!value || typeof value !== 'object') return null;
        if (value.success === false) return value.msg === 'outFile' ? { schema: REMOTE_SCHEMA, updated_at: 0, records: {}, needs_write: true } : null;
        if (value.data !== undefined) {
            value = value.data;
            if (typeof value === 'string') {
                if (!value.trim()) return { schema: REMOTE_SCHEMA, updated_at: 0, records: {}, needs_write: true };
                try { value = JSON.parse(value); } catch (e2) { return null; }
            }
        }
        if (!value || typeof value !== 'object' || value.schema !== REMOTE_SCHEMA || !value.records ||
            typeof value.records !== 'object' || Array.isArray(value.records)) return null;
        return { schema: REMOTE_SCHEMA, updated_at: num(value.updated_at), records: value.records };
    }
    function copyRecord(record) {
        var copy = deepCopy(record);
        if (!copy || !copy.card_key) return null;
        return copy;
    }
    function redactRemoteValue(value, key) {
        if (typeof value === 'string') {
            if (key === 'resolver_url') return portableRemoteResolver(value);
            if (/^(?:https?:)?\/\//i.test(value)) return undefined;
            return value;
        }
        if (!value || typeof value !== 'object') return value;
        Object.keys(value).forEach(function (childKey) {
            var normalized = str(childKey).toLowerCase();
            if (normalized === 'token' || normalized === 'account_email' || normalized === 'uid' ||
                normalized === 'nws_id' || normalized === 'aesgcmkey' || normalized === 'headers' ||
                normalized === 'authorization' || normalized === 'account' || normalized === 'resolver_headers' ||
                normalized === 'rch' || normalized === 'rch_body') {
                delete value[childKey];
                return;
            }
            if (normalized === 'url' || normalized === 'uri' || normalized === 'src' || normalized === 'direct_url' || normalized === 'proxy_url') {
                delete value[childKey];
                return;
            }
            var cleaned = redactRemoteValue(value[childKey], normalized);
            if (cleaned === undefined) delete value[childKey]; else value[childKey] = cleaned;
        });
        return value;
    }
    function remoteProjectionRecord(record) {
        var copy = copyRecord(record);
        if (!copy) return null;
        sanitizeRemoteRecordResolvers(copy);
        redactRemoteValue(copy, '');
        var corrected = normalizeRoad(copy, { external: false, initial_time: num(copy.time), created_at: now() });
        if (corrected.completion_guard) {
            copy.time = corrected.time;
            copy.duration = corrected.duration;
            copy.percent = corrected.percent;
            copy.completion_guard = corrected.completion_guard;
        }
        compactRecord(copy);
        return copy;
    }
    function chooseMergedRecord(oldRecord, candidate) {
        if (!oldRecord) return candidate;
        if (sameRecordPosition(oldRecord, candidate) && candidate.completion_guard && !oldRecord.completion_guard && num(oldRecord.percent) < 100 && num(candidate.time) <= num(oldRecord.time)) return oldRecord;
        if (sameRecordPosition(oldRecord, candidate) && oldRecord.completion_guard && !candidate.completion_guard && num(candidate.percent) < 100 && num(candidate.time) >= num(oldRecord.time)) return candidate;
        if (num(candidate.activity_at) > num(oldRecord.activity_at)) return candidate;
        if (num(candidate.activity_at) < num(oldRecord.activity_at)) return oldRecord;
        if (rejectEqualTimeDowngrade(oldRecord, candidate)) return oldRecord;
        if (rejectEqualTimeDowngrade(candidate, oldRecord)) return candidate;
        return candidate;
    }
    function mergeRecordMaps() {
        var merged = {};
        for (var i = 0; i < arguments.length; i++) {
            var map = arguments[i] || {};
            Object.keys(map).forEach(function (key) {
                var candidate = copyRecord(map[key]);
                if (!candidate) return;
                merged[key] = chooseMergedRecord(merged[key], candidate);
            });
        }
        return merged;
    }
    function remoteProjectionMaps(records) {
        var projected = {};
        Object.keys(records || {}).forEach(function (key) {
            var record = remoteProjectionRecord(records[key]);
            if (record) projected[key] = record;
        });
        return projected;
    }
    function diagnosticProjection(value) {
        var record = remoteProjectionRecord(value);
        if (record) return record;
        return redactRemoteValue(deepCopy(value), '');
    }
    function diagnosticProjectionMaps(records) {
        var projected = {};
        Object.keys(records || {}).forEach(function (key) {
            projected[key] = diagnosticProjection(records[key]);
        });
        return projected;
    }
    function pullRemote(callback) {
        var context = remoteContext();
        if (!remoteAvailable(context.identity)) return callback(false, null);
        remoteRequest('get', null, function (response) {
            if (!remoteContextCurrent(context)) return callback(false, null);
            var document = parseRemoteDocument(response);
            if (!document) return callback(false, null);
            var merged = mergeRecordMaps(remoteProjectionMaps(document.records), readStore(context.storageKey), readOutboxByKey(context.outboxKey));
            writeStoreByKey(context.storageKey, merged);
            refreshUI();
            callback(true, document);
        }, context.getUrl);
    }
    function pushRemote(records, callback, requestUrl) {
        var document = { schema: REMOTE_SCHEMA, updated_at: now(), records: remoteProjectionMaps(records) };
        remoteRequest('set', JSON.stringify(document), function (response) {
            if (typeof response === 'string') { try { response = JSON.parse(response); } catch (e) { response = null; } }
            callback(!!response && !(response.success === false), document);
        }, requestUrl);
    }
    function recordMapsEqual(a, b) {
        var left = remoteProjectionMaps(a), right = remoteProjectionMaps(b);
        var leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
        if (leftKeys.length !== rightKeys.length) return false;
        for (var i = 0; i < leftKeys.length; i++) {
            if (leftKeys[i] !== rightKeys[i] || json(left[leftKeys[i]]) !== json(right[rightKeys[i]])) return false;
        }
        return true;
    }
    function scheduleRemoteSync(reason) {
        if (state.remoteTimer) clearTimeout(state.remoteTimer);
        state.remoteTimer = setTimeout(function () { state.remoteTimer = null; syncRemote(reason || 'debounce'); }, REMOTE_DEBOUNCE);
    }
    function syncRemote(reason) {
        var context = remoteContext();
        if (!remoteAvailable(context.identity)) return false;
        if (state.remoteBusy) { state.remoteQueued = true; return false; }
        state.remoteBusy = true;
        var attempts = 0;
        function stale() { return !remoteContextCurrent(context); }
        function finish() {
            state.remoteBusy = false;
            if (!state.remoteQueued) return;
            state.remoteQueued = false;
            scheduleRemoteSync('queued');
        }
        function apply(document) {
            var merged = mergeRecordMaps(remoteProjectionMaps(document.records), readStore(context.storageKey), readOutboxByKey(context.outboxKey));
            writeStoreByKey(context.storageKey, merged);
            refreshUI();
            return merged;
        }
        function verifyAfterPush() {
            remoteRequest('get', null, function (response) {
                if (stale()) return finish();
                var verified = parseRemoteDocument(response);
                if (!verified) return finish();
                var merged = apply(verified);
                if (recordMapsEqual(verified.records, merged) || attempts >= 3) return finish();
                writeAttempt(verified);
            }, context.getUrl);
        }
        function writeAttempt(remote) {
            if (stale()) return finish();
            var merged = apply(remote);
            if (!remote.needs_write && recordMapsEqual(remote.records, merged)) return finish();
            attempts += 1;
            pushRemote(merged, function (ok) { if (stale() || !ok) return finish(); verifyAfterPush(); }, context.setUrl);
        }
        remoteRequest('get', null, function (response) {
            if (stale()) return finish();
            var remote = parseRemoteDocument(response);
            if (!remote) return finish();
            writeAttempt(remote);
        }, context.getUrl);
        return true;
    }
    function readStore(key) {
        try {
            var v = Lampa.Storage.get(key, {});
            return v && typeof v === 'object' ? v : {};
        } catch (e) { return {}; }
    }
    function store() { return readStore(storageKey()); }
    function readOutboxByKey(key) {
        try {
            var raw = localStorage.getItem(key);
            var v = raw ? JSON.parse(raw) : {};
            return v && typeof v === 'object' ? v : {};
        } catch (e) { return {}; }
    }
    function readOutbox() { return readOutboxByKey(outboxKey()); }
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
        if (!record || !record.card_key) return;
        var portableRecord = deepCopy(record) || clone(record);
        sanitizeRecordResolvers(portableRecord);
        var out = readOutbox();
        var key = recordKey(portableRecord.card_key);
        var old = out[key];
        if (old) sanitizeRecordResolvers(old);
        if (!old || (num(portableRecord.activity_at) >= num(old.activity_at) && !rejectEqualTimeDowngrade(old, portableRecord))) {
            out[key] = portableRecord;
        }
        writeOutbox(out);
    }
    function writeStoreByKey(key, v) {
        try { Lampa.Storage.set(key, v); } catch (e) {}
    }
    function writeStore(v) { writeStoreByKey(storageKey(), v); }
    function flushOutbox(forceWrite) {
        var out = readOutbox();
        if (!Object.keys(out).length) { refreshUI(); if (forceWrite) scheduleRemoteSync('outbox'); return false; }
        var all = store();
        var changed = false;
        var outboxChanged = false;
        Object.keys(out).forEach(function (key) {
            var local = out[key];
            var remote = all[key];
            if (!local || !local.card_key) return;
            if (sanitizeRecordResolvers(local)) { out[key] = local; outboxChanged = true; }
            if (remote && sanitizeRecordResolvers(remote)) changed = true;
            var localNewer = !remote || num(local.activity_at) > num(remote.activity_at);
            var localRicherAtTie = remote && num(local.activity_at) === num(remote.activity_at) &&
                richnessCompatible(remote, local) && recordItemCount(local) > recordItemCount(remote);
            if (localNewer || localRicherAtTie) {
                all[key] = deepCopy(local) || clone(local);
                changed = true;
            } else if (remote && num(local.activity_at) === num(remote.activity_at) &&
                richnessCompatible(remote, local) && recordItemCount(remote) > recordItemCount(local)) {
                out[key] = deepCopy(remote) || clone(remote);
                outboxChanged = true;
            }
        });
        if (outboxChanged) writeOutbox(out);
        if (changed || forceWrite) writeStore(all);
        refreshUI();
        scheduleRemoteSync('outbox');
        return changed;
    }
    function scheduleSyncFlush() {
        if (state.syncFlushTimer) clearTimeout(state.syncFlushTimer);
        state.syncFlushTimer = setTimeout(function () { state.syncFlushTimer = null; flushOutbox(true); }, 6500);
    }
    function seedOutboxFromStore() {
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
    function recordItemCount(record) {
        if (!record) return 0;
        if (record.source === 'online' && record.online && Array.isArray(record.online.items)) return record.online.items.length;
        if (record.source === 'torrent' && record.torrent && Array.isArray(record.torrent.items)) return record.torrent.items.length;
        return 0;
    }
    function sameRecordPosition(a, b) {
        var ah = str(a && a.timeline_hash), bh = str(b && b.timeline_hash);
        if (ah || bh) return !!(ah && bh && ah === bh);
        return num(a && a.season) === num(b && b.season) && num(a && a.episode) === num(b && b.episode) &&
            num(a && a.current_index) === num(b && b.current_index);
    }
    function richnessCompatible(a, b) {
        if (!a || !b || a.card_key !== b.card_key || a.source !== b.source || !sameRecordPosition(a, b)) return false;
        if (a.source === 'online') {
            var aKey = selectionKey(onlineSelection(a.online || {}));
            var bKey = selectionKey(onlineSelection(b.online || {}));
            return aKey === bKey;
        }
        if (a.source === 'torrent') {
            var at = a.torrent || {}, bt = b.torrent || {};
            var ah = str(at.hash), bh = str(bt.hash);
            var am = str(at.magnet), bm = str(bt.magnet);
            if (ah && bh && ah !== bh) return false;
            if (am && bm && am !== bm) return false;
            return true;
        }
        return false;
    }
    function rejectEqualTimeDowngrade(old, record) {
        return !!(old && record && num(old.activity_at) === num(record.activity_at) && richnessCompatible(old, record) &&
            recordItemCount(record) < recordItemCount(old));
    }
    function saveRecord(record) {
        if (!record || !record.card_key) return false;
        sanitizeRecordResolvers(record);
        compactRecord(record);
        var all = store();
        var key = recordKey(record.card_key);
        var old = all[key];
        if (old && num(old.activity_at) > num(record.activity_at)) return false;
        if (rejectEqualTimeDowngrade(old, record)) return false;
        queueOutbox(record);
        all[key] = deepCopy(record) || record;
        writeStore(all);
        scheduleSyncFlush();
        return true;
    }
    function compactRecord(r) {
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

    function timelineView(hash) {
        try { return hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null; } catch (e) { return null; }
    }
    function normalizeRoad(road, session) {
        road = road || {}; session = session || {};
        var out = clone(road);
        var time = num(road.time), duration = num(road.duration), percent = num(road.percent);
        var derived = duration > 0 ? Math.round(time / duration * 100) : 0;
        var claimsCompletion = percent >= 100;
        var mismatch = claimsCompletion && duration >= 60 && derived + COMPLETION_PERCENT_TOLERANCE < 100;
        var elapsed = session.created_at ? Math.max(0, (now() - num(session.created_at)) / 1000) : 0;
        var initial = num(session.initial_time);
        var external = session.external !== undefined ? !!session.external : isJustExternal();
        var impossible = external && claimsCompletion && duration >= 60 && elapsed <= 180 &&
            initial <= duration * 0.1 && time >= duration * 0.98 &&
            time > initial + elapsed + COMPLETION_JUMP_TOLERANCE;

        if (impossible) {
            var previous = session.last_road || {};
            time = Math.max(num(previous.time || initial), Math.min(time, initial + elapsed));
        }
        if (mismatch || impossible) {
            percent = duration > 0 ? Math.round(time / duration * 100) : 0;
            out.time = time;
            out.duration = duration;
            out.percent = clamp(percent, 0, 100);
            out.completion_guard = mismatch ? 'percent_time_mismatch' : 'impossible_position_jump';
        }
        return out;
    }
    function guardRoadInPlace(road, session) {
        var corrected = normalizeRoad(road, session);
        if (!corrected.completion_guard) return '';
        road.time = corrected.time;
        road.duration = corrected.duration;
        road.percent = corrected.percent;
        road.completion_guard = corrected.completion_guard;
        return corrected.completion_guard;
    }
    function mergeRecordRoad(record, live) {
        record = record || {}; live = live || {};
        var out = { time: num(record.time), duration: num(record.duration), percent: num(record.percent) };
        if (!record.completion_guard) {
            out.time = Math.max(out.time, num(live.time));
            out.duration = Math.max(out.duration, num(live.duration));
            out.percent = Math.max(out.percent, num(live.percent));
        }
        if (!out.percent && out.time && out.duration) out.percent = Math.round(out.time / out.duration * 100);
        out.percent = clamp(out.percent, 0, 100);
        return out;
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
        if (out.completion_guard && num(best.road.percent) >= 100) return out;
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
        out.completion_guard = '';
        out.activity_at = best.updated;
        if (out.torrent) out.torrent.index = best.idx;
        if (out.online) out.online.index = best.idx;
        return out;
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
    function identifiedPlaylistIndex(data, playlist, currentUrl) {
        data = data || {}; playlist = playlist || [];
        var current = data.currentItem || {};
        var dh = data.timeline && data.timeline.hash ? str(data.timeline.hash) :
            (current.timeline && current.timeline.hash ? str(current.timeline.hash) : '');
        for (var i = 0; i < playlist.length; i++) {
            if (dh && playlist[i].timeline && str(playlist[i].timeline.hash) === dh) return i;
        }
        var target = explicitItemSE(current) || explicitItemSE(data);
        if (target) {
            for (var j = 0; j < playlist.length; j++) {
                var candidate = explicitItemSE(playlist[j]);
                if (candidate && candidate.season === target.season && candidate.episode === target.episode) return j;
            }
        }
        for (var k = 0; k < playlist.length; k++) {
            var u = cleanUrl(playlist[k].url || playlist[k].uri || playlist[k].src || '');
            if (u && currentUrl && u === currentUrl) return k;
        }
        return -1;
    }
    function playlistIndex(data, playlist, currentUrl) {
        data = data || {}; playlist = playlist || [];
        var identified = identifiedPlaylistIndex(data, playlist, currentUrl);
        if (identified >= 0) return identified;
        var idx = data.playlist_index !== undefined ? num(data.playlist_index) : (data.start_index !== undefined ? num(data.start_index) : -1);
        if (idx >= 0 && idx < playlist.length) return idx;
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
        var previousSession = state.session;
        var source = sourceOf(data);
        var url = cleanUrl(data.url || data.uri || data.src || '');
        var inheritedOnline = source === 'other' && previousSession && previousSession.source === 'online' &&
            previousSession.card_key === cardKey(movie) && identifiedPlaylistIndex(data, previousSession.playlist, url) >= 0;
        if (inheritedOnline) source = 'online';
        if (source === 'other') return null;
        var list = normalizePlaylist(data.playlist || []);

        if (!list.length && previousSession && previousSession.card_key === cardKey(movie) && previousSession.source === source) {
            list = previousSession.playlist.map(function (x) { return clone(x); });
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
            if (list[idx]) applyMeta(list[idx], playbackMeta(data));
        }

        var session = {
            source: source,
            card_key: cardKey(movie),
            movie: movie,
            url: url,
            playlist: list,
            index: idx,
            capture_index: idx,
            capture_season: num(se.season),
            capture_episode: num(se.episode),
            season: num(se.season),
            episode: num(se.episode),
            hash: h,
            torrent_hash: str(data.torrent_hash || (item && item.torrent_hash) || ''),
            resolver: null,
            active_meta: playbackMeta(data),
            created_at: now(),
            initial_time: num(data.time || data.position || (data.timeline && data.timeline.time)),
            external: isJustExternal(),
            last_road: null
        };
        if (source === 'torrent') {
            var parsed = parseStream(url);
            if (!session.torrent_hash && parsed) session.torrent_hash = parsed.hash;
            var seed = state.torrentSeedByCard[session.card_key];
            session.magnet = seed ? seed.magnet : '';
        } else if (source === 'online') {
            session.resolver = lookupResolver(url, session.card_key, item, session.movie);
            var onlineSeed = state.onlineLaunchSeed;
            if (onlineSeed && onlineSeed.card_key === session.card_key) {
                session.online_full_defs = deepCopy(onlineSeed.defs) || [];
                session.online_full_index = num(onlineSeed.index);
                session.online_window_index = num(onlineSeed.window_index);
                session.online_seed_activity = num(onlineSeed.activity_at);
                session.online_seed_descriptor = deepCopy(onlineSeed.online) || {};
                session.online_selection = onlineSelection(onlineSeed.online);
            } else if (inheritedOnline && previousSession) {
                session.online_full_defs = deepCopy(previousSession.online_full_defs) || [];
                session.online_full_index = num(previousSession.online_full_index);
                session.online_window_index = num(previousSession.online_window_index);
                session.online_seed_activity = num(previousSession.online_seed_activity);
                session.online_seed_descriptor = deepCopy(previousSession.online_seed_descriptor) || {};
                session.online_selection = clone(previousSession.online_selection || {});
            }
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
    function onlineDescriptor(session, currentRuntimeIndex) {
        if (!session || session.source !== 'online') return null;
        var list = session.playlist.length ? session.playlist : [{}];
        var selectedRuntimeIndex = currentRuntimeIndex === undefined ? num(session.index) : num(currentRuntimeIndex);
        var captureIndex = session.capture_index === undefined ? num(session.index) : num(session.capture_index);
        var synthesisBase = freshSessionResolverShape(session);
        var items = list.map(function (item, idx) {
            item = item || {};
            var se = itemSE(item, idx);
            var h = exactHash(item, session.movie, se.season, se.episode);
            var raw = typeof item.url === 'string' ? cleanUrl(item.url) : '';
            var resolver = lookupResolver(raw, session.card_key, item, session.movie);
            if (resolver && !resolverMatchesItem(resolver.url, item)) resolver = null;
            if (idx === captureIndex && session.resolver && resolverMatchesItem(session.resolver.url, item)) resolver = session.resolver;
            var explicitResolver = str(item.resolver_url).trim();
            var carriedResolver = !resolver && explicitResolver ? portableResolver(explicitResolver) : '';
            if (carriedResolver && !carriedResolverCompatible(carriedResolver, item, synthesisBase)) carriedResolver = '';
            var carriedSelection = carriedResolver ? resolverSelection(carriedResolver, item.selection || {}) : {};
            var synthesized = !resolver && !explicitResolver ? synthesizeResolverForItem(synthesisBase, item) : null;
            var meta = playbackMeta(item);
            if (idx === captureIndex) meta = mergeMeta(meta, session.active_meta || {});
            return {
                title: str(item.title || item.name || (idx === captureIndex ? session.movie.name || session.movie.title || '' : '')),
                season: num(se.season), episode: num(se.episode), hash: h,
                img: str(item.thumbnail || item.img || ''),
                voice_name: str(item.voice_name || ''),
                direct_url: raw && !isTransientOnline(raw) ? raw : '',
                resolver_url: resolver ? portableResolver(resolver.url) : (carriedResolver || str(synthesized && synthesized.url)),
                resolver_headers: resolver ? portableResolverHeaders(resolver.headers) : portableResolverHeaders(carriedResolver ? item.resolver_headers : (synthesized && synthesized.headers)),
                selection: resolver ? resolverSelection(resolver.url, {}) : (selectionKey(carriedSelection) ? carriedSelection : clone(synthesized && synthesized.selection || {})),
                meta: meta
            };
        });
        var descriptorIndex = selectedRuntimeIndex;
        var fullDefs = Array.isArray(session.online_full_defs) ? session.online_full_defs : [];
        var baseOnline = session.online_seed_descriptor || {};
        var currentStore = store();
        var currentRecord = currentStore[recordKey(session.card_key)];
        if (currentRecord && currentRecord.card_key === session.card_key && currentRecord.source === 'online' &&
            currentRecord.online && Array.isArray(currentRecord.online.items)) {
            var runtimeSelection = onlineSelection({ items: items });
            var expectedSelection = selectionKey(session.online_selection) ? session.online_selection :
                (selectionKey(runtimeSelection) ? runtimeSelection : onlineSelection(baseOnline));
            var storedSelection = onlineSelection(currentRecord.online);
            var expectedKey = selectionKey(expectedSelection);
            var storedKey = selectionKey(storedSelection);
            var selectionMatchesStore = !expectedKey || !storedKey || expectedKey === storedKey;
            var storedDefs = currentRecord.online.items;
            var richer = storedDefs.length > fullDefs.length;
            var freshEnough = num(currentRecord.activity_at) > num(session.online_seed_activity) && storedDefs.length >= fullDefs.length;
            if (selectionMatchesStore && (richer || freshEnough)) {
                fullDefs = storedDefs;
                baseOnline = currentRecord.online;
            }
        }
        if (fullDefs.length >= items.length && fullDefs.length) {
            var offset = num(session.online_full_index) - num(session.online_window_index);
            var merged = fullDefs.map(function (def) { return deepCopy(def) || clone(def || {}); });
            items.forEach(function (live, runtimeIndex) {
                var fullIndex = -1;
                for (var i = 0; i < merged.length; i++) {
                    if (live.hash && merged[i] && str(merged[i].hash) === str(live.hash)) { fullIndex = i; break; }
                }
                if (fullIndex < 0 && (num(live.season) || num(live.episode))) {
                    for (var j = 0; j < merged.length; j++) {
                        if (merged[j] && num(merged[j].season) === num(live.season) && num(merged[j].episode) === num(live.episode)) { fullIndex = j; break; }
                    }
                }
                if (fullIndex < 0 && offset + runtimeIndex >= 0 && offset + runtimeIndex < merged.length) fullIndex = offset + runtimeIndex;
                if (fullIndex < 0 || fullIndex >= merged.length) return;
                var saved = merged[fullIndex] || {};
                Object.keys(live || {}).forEach(function (key) {
                    var value = live[key];
                    if ((key === 'resolver_url' || key === 'direct_url') && !value) return;
                    if (key === 'selection' && !selectionKey(value)) return;
                    if (key === 'meta') saved.meta = mergeMeta(saved.meta || {}, value || {});
                    else saved[key] = value;
                });
                merged[fullIndex] = saved;
                if (runtimeIndex === selectedRuntimeIndex) descriptorIndex = fullIndex;
            });
            items = merged;
        }
        items.forEach(function (item) {
            if (!item) return;
            item.resolver_url = item.resolver_url && resolverMatchesItem(item.resolver_url, item) ? portableResolver(item.resolver_url) : '';
            item.resolver_headers = item.resolver_url ? portableResolverHeaders(item.resolver_headers) : {};
        });
        var activeDescriptor = items[descriptorIndex] || {};
        var sessionResolver = session.resolver ? portableResolver(session.resolver.url) : '';
        var sessionSelection = session.resolver ? resolverSelection(session.resolver.url, {}) : {};
        var sessionDirect = isTransientOnline(session.url) ? '' : session.url;
        var baseMatchesActive = descriptorIndex === num(baseOnline.index);
        var captureMatchesActive = selectedRuntimeIndex === captureIndex && resolverMatchesItem(sessionResolver, activeDescriptor);
        var baseResolver = baseMatchesActive && baseOnline.resolver_url && resolverMatchesItem(baseOnline.resolver_url, activeDescriptor)
            ? portableResolver(baseOnline.resolver_url) : '';
        var activeResolver = str(activeDescriptor.resolver_url || '') || (captureMatchesActive ? sessionResolver : '') ||
            baseResolver;
        var activeHeaders = activeDescriptor.resolver_url ? activeDescriptor.resolver_headers :
            (captureMatchesActive && session.resolver ? session.resolver.headers : (baseResolver ? baseOnline.resolver_headers : {}));
        var activeSelection = resolverSelection(activeResolver, activeDescriptor.selection || {});
        return {
            resolver_url: activeResolver,
            resolver_headers: portableResolverHeaders(activeHeaders),
            selection: selectionKey(activeSelection) ? activeSelection : (captureMatchesActive && selectionKey(sessionSelection) ? sessionSelection : clone(baseMatchesActive ? baseOnline.selection || {} : {})),
            direct_url: str(activeDescriptor.direct_url || '') || (captureMatchesActive ? sessionDirect : '') || str(baseMatchesActive ? baseOnline.direct_url || '' : ''),
            index: descriptorIndex,
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
            episode_title: str(item.title || item.name || ''),
            source: session.source,
            activity_at: num(activityAt || road.updated || now()),
            season: num(se.season),
            episode: num(se.episode),
            timeline_hash: str(h),
            time: num(road.time),
            duration: num(road.duration),
            percent: clamp(road.percent || (road.duration ? Math.round(num(road.time) / num(road.duration) * 100) : 0), 0, 100),
            completion_guard: str(road.completion_guard || ''),
            current_index: session.source === 'online' && Array.isArray(session.online_full_defs) && session.online_full_defs.length
                ? num(session.online_full_index) - num(session.online_window_index) + num(itemIndex)
                : num(itemIndex),
            poster: str(session.movie.poster_path || session.movie.img || session.movie.poster || '')
        };
        if (session.source === 'torrent') r.torrent = torrentDescriptor(session);
        if (session.source === 'online') {
            r.online = onlineDescriptor(session, itemIndex);
            if (r.online) r.current_index = num(r.online.index);
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
        var baselineRoads = {};
        d.items.forEach(function (it) {
            var road = timelineView(it.hash) || {};
            baselines[it.hash] = num(road.updated);
            baselineRoads[it.hash] = { time: num(road.time), duration: num(road.duration), percent: num(road.percent), updated: num(road.updated) };
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
            baseline_roads: baselineRoads,
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
        p.events.push({ hash: str(hash), seen: now(), updated: num(road.updated || now()), time: num(road.time), duration: num(road.duration), percent: num(road.percent), completion_guard: str(road.completion_guard || '') });
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
        });
        return {
            source: 'torrent', card_key: p.card_key, movie: movie, url: '', playlist: list,
            index: num(p.torrent.index), season: 0, episode: 0, hash: '', torrent_hash: p.torrent.hash,
            magnet: p.torrent.magnet || '', resolver: null, created_at: p.launched_at,
            initial_time: num(p.baseline_roads && p.torrent.items[p.torrent.index] && p.baseline_roads[p.torrent.items[p.torrent.index].hash] && p.baseline_roads[p.torrent.items[p.torrent.index].hash].time),
            external: true, last_road: null
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
        candidates.forEach(function (candidate) {
            var baseline = p.baseline_roads && p.baseline_roads[candidate.item.hash] || {};
            candidate.road = normalizeRoad(candidate.road, {
                created_at: p.launched_at,
                initial_time: num(baseline.time),
                external: true,
                last_road: baseline
            });
        });
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
        var idx = findSessionItem(hash);
        var pending = readPending();
        var pendingMatch = pendingItem(pending, hash);

        if (idx >= 0 && state.session) {
            guardRoadInPlace(road, state.session);
        } else if (pendingMatch) {
            var baseline = pending.baseline_roads && pending.baseline_roads[hash] || {};
            guardRoadInPlace(road, {
                created_at: pending.launched_at,
                initial_time: num(baseline.time),
                external: true,
                last_road: baseline
            });
        }

        if (isJustExternal() && appendPendingEvent(hash, road)) return;

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
        var captureMovie = currentActivityMovie() || state.lastMovie;
        var captureCardKey = cardKey(captureMovie);
        if (!captureCardKey) return;
        var resolver = { url: str(event.params.url), headers: clone(event.params.headers || {}), at: now(), card_key: captureCardKey };
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
    function resolverIdentityMatchesMovie(shape, movie) {
        if (!shape || !shape.identity || !movie) return false;
        var source = str(movie.source || '').trim().toLowerCase();
        var expected = {
            id: [movie.id, movie.movie_id],
            tmdb_id: [movie.tmdb_id, movie.tmdbId],
            kinopoisk_id: [movie.kinopoisk_id],
            imdb_id: [movie.imdb_id]
        };
        if (!source || source === 'tmdb') expected.tmdb_id.push(movie.id);
        function contains(list, value) {
            value = str(value).trim().toLowerCase();
            if (!value) return false;
            for (var i = 0; i < list.length; i++) {
                if (str(list[i]).trim().toLowerCase() === value) return true;
            }
            return false;
        }
        var matched = false;
        Object.keys(expected).forEach(function (key) {
            if (shape.identity[key] !== undefined && contains(expected[key], shape.identity[key])) matched = true;
        });
        return matched;
    }
    function lookupResolver(media, expectedCardKey, item, movie) {
        var resolver = state.resolverByMedia[normalizeMedia(media)] || null;
        if (!expectedCardKey) return resolver;
        if (resolver && resolver.card_key === expectedCardKey) return resolver;

        var target = explicitItemSE(item);
        if (!target) return null;
        var selectionHint = clone(item && item.selection || {});
        if (!selectionHint.translation) selectionHint.translation = str(item && (item.voice_name || item.voice || '')).trim();
        var expectedSelection = resolverSelection('', selectionHint);
        var best = null;
        var bestSelection = '';
        var ambiguous = false;
        Object.keys(state.resolverByMedia).forEach(function (key) {
            var candidate = state.resolverByMedia[key];
            var capturedAt = num(candidate && candidate.at);
            if (!candidate || candidate.card_key !== expectedCardKey || !capturedAt ||
                now() < capturedAt - 1000 || now() - capturedAt > ONLINE_RESOLVER_CARD_FALLBACK_MAX_AGE) return;
            var shape = safeResolverShape(candidate.url);
            if (!shape || shape.season !== target.season || shape.episode !== target.episode) return;
            if (!resolverIdentityMatchesMovie(shape, movie)) return;
            if (selectionKey(expectedSelection) && !selectionMatches(expectedSelection, shape.selection)) return;
            var candidateSelection = selectionKey(shape.selection);
            if (!selectionKey(expectedSelection) && best && candidateSelection !== bestSelection) ambiguous = true;
            if (!best || capturedAt > num(best.at)) {
                best = candidate;
                bestSelection = candidateSelection;
            }
        });
        return ambiguous ? null : best;
    }
    function isTransientOnline(url) { return /\/proxy(?:-dash)?\//i.test(str(url)); }
    function portableResolver(url) {
        url = str(url);
        if (!url) return '';
        try {
            var u = new URL(url, location.href);
            stripLocalResolverParams(u);
            return u.toString();
        } catch (e) { return url; }
    }
    function portableRemoteResolver(url) {
        url = str(url);
        if (!url) return '';
        try {
            var u = new URL(url, location.href);
            stripLocalResolverParams(u);
            stripRemoteResolverParams(u);
            return u.toString();
        } catch (e) { return ''; }
    }
    function stripLocalResolverParams(u) {
        var remove = [];
        try {
            u.searchParams.forEach(function (_value, key) {
                var normalized = str(key).toLowerCase();
                if (normalized === 'authorization' || normalized === 'account' || normalized === 'headers' ||
                    normalized === 'account_email' || normalized === 'uid' || normalized === 'nws_id') remove.push(key);
            });
            remove.forEach(function (key) { u.searchParams.delete(key); });
        } catch (e) {}
        return u;
    }
    function stripRemoteResolverParams(u) {
        var remove = [];
        try {
            u.searchParams.forEach(function (_value, key) {
                var normalized = str(key).toLowerCase();
                if (normalized === 'token' || normalized === 'aesgcmkey' || normalized === 'authorization' ||
                    normalized === 'account' || normalized === 'headers' || normalized === 'account_email' ||
                    normalized === 'uid' || normalized === 'nws_id') remove.push(key);
            });
            remove.forEach(function (key) { u.searchParams.delete(key); });
        } catch (e) {}
        return u;
    }
    function portableResolverHeaders(saved) {
        var headers = clone(saved || {});
        Object.keys(headers).forEach(function (key) {
            if (str(key).toLowerCase() === 'x-kit-aesgcm') delete headers[key];
        });
        return headers;
    }
    function sanitizeRecordResolvers(record) {
        var online = record && record.online;
        if (!online) return false;
        var changed = false;
        function sanitize(entry) {
            if (!entry) return;
            var oldUrl = str(entry.resolver_url || '');
            var oldHeaders = json(entry.resolver_headers || {});
            entry.resolver_url = oldUrl ? portableResolver(oldUrl) : '';
            entry.resolver_headers = portableResolverHeaders(entry.resolver_headers);
            if (entry.resolver_url !== oldUrl || json(entry.resolver_headers) !== oldHeaders) changed = true;
        }
        sanitize(online);
        (online.items || []).forEach(sanitize);
        return changed;
    }
    function sanitizeRemoteRecordResolvers(record) {
        var online = record && record.online;
        if (!online) return false;
        function sanitize(entry) {
            if (!entry) return;
            entry.resolver_url = entry.resolver_url ? portableRemoteResolver(entry.resolver_url) : '';
            entry.resolver_headers = portableResolverHeaders(entry.resolver_headers);
        }
        sanitize(online);
        (online.items || []).forEach(sanitize);
        return true;
    }
    function positiveInteger(value) {
        var text = str(value).trim();
        return /^\d+$/.test(text) && num(text) > 0 ? num(text) : 0;
    }
    function explicitItemSE(item) {
        item = item || {};
        var season = item.season !== undefined ? item.season : (item.season_number !== undefined ? item.season_number : item.s);
        var episode = item.episode !== undefined ? item.episode : (item.episode_number !== undefined ? item.episode_number : item.e);
        season = positiveInteger(season);
        episode = positiveInteger(episode);
        return season && episode ? { season: season, episode: episode } : null;
    }
    function safeResolverShape(url) {
        if (!/^https?:\/\//i.test(str(url).trim())) return null;
        try {
            var u = new URL(str(url));
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
            if (u.username || u.password) return null;
            if (!/^\/lite\/[A-Za-z0-9._-]+\/(?:video|serial|episodes?)\/?$/i.test(u.pathname)) return null;
            var shortS = u.searchParams.getAll('s'), shortE = u.searchParams.getAll('e');
            var longS = u.searchParams.getAll('season'), longE = u.searchParams.getAll('episode');
            var shortPair = shortS.length === 1 && shortE.length === 1 && !longS.length && !longE.length;
            var longPair = longS.length === 1 && longE.length === 1 && !shortS.length && !shortE.length;
            if (!shortPair && !longPair) return null;
            var seasonKey = shortPair ? 's' : 'season';
            var episodeKey = shortPair ? 'e' : 'episode';
            var season = positiveInteger(u.searchParams.get(seasonKey));
            var episode = positiveInteger(u.searchParams.get(episodeKey));
            if (!season || !episode) return null;
            var translationCount = 0, translationInvalid = false;
            ['t','translation','voice','voiceover','dub'].forEach(function (key) {
                var values = u.searchParams.getAll(key);
                if (values.length > 1) translationInvalid = true;
                if (values.length === 1 && str(values[0]).trim()) translationCount++;
            });
            if (translationInvalid || translationCount > 1) return null;
            var identity = {};
            ['id','tmdb_id','kinopoisk_id','imdb_id'].forEach(function (key) {
                var values = u.searchParams.getAll(key);
                if (values.length === 1 && str(values[0]).trim()) identity[key] = str(values[0]);
                else if (values.length) identity.invalid = '1';
            });
            if (identity.invalid || !Object.keys(identity).length) return null;
            return {
                url: u, origin: str(u.origin).toLowerCase(), path: str(u.pathname).toLowerCase(),
                season_key: seasonKey, episode_key: episodeKey, season: season, episode: episode,
                identity: identity, selection: resolverSelection(u.toString(), {})
            };
        } catch (e) { return null; }
    }
    function sameResolverIdentity(a, b) {
        if (!a || !b || a.origin !== b.origin || a.path !== b.path ||
            a.season_key !== b.season_key || a.episode_key !== b.episode_key ||
            selectionKey(a.selection) !== selectionKey(b.selection)) return false;
        var keys = ['id','tmdb_id','kinopoisk_id','imdb_id'];
        for (var i = 0; i < keys.length; i++) {
            if (str(a.identity[keys[i]]) !== str(b.identity[keys[i]])) return false;
        }
        return true;
    }
    function freshSessionResolverShape(session) {
        var resolver = session && session.resolver;
        var capturedAt = num(resolver && resolver.at);
        var sessionAt = num(session && session.created_at);
        if (!resolver || !session || !resolver.card_key || resolver.card_key !== session.card_key || !capturedAt || !sessionAt ||
            sessionAt < capturedAt - 1000 || sessionAt - capturedAt > ONLINE_RESOLVER_CAPTURE_MAX_AGE) return null;
        var shape = safeResolverShape(resolver.url);
        var captureSeason = positiveInteger(session.capture_season || session.season);
        var captureEpisode = positiveInteger(session.capture_episode || session.episode);
        if (!shape || shape.season !== captureSeason || shape.episode !== captureEpisode) return null;
        shape.headers = portableResolverHeaders(resolver.headers);
        return shape;
    }
    function carriedResolverCompatible(url, item, synthesisBase) {
        var selection = resolverSelection(url, {});
        var expected = resolverSelection('', item && item.selection || {});
        if (selectionKey(expected) && selectionKey(expected) !== selectionKey(selection)) return false;
        var target = explicitItemSE(item);
        var shape = safeResolverShape(url);
        if (!target || !shape || shape.season !== target.season || shape.episode !== target.episode) return false;
        return !synthesisBase || sameResolverIdentity(synthesisBase, shape);
    }
    function synthesizeResolverForItem(base, item) {
        var target = explicitItemSE(item);
        if (!base || !target) return null;
        var expected = resolverSelection('', item && item.selection || {});
        if (selectionKey(expected) && selectionKey(expected) !== selectionKey(base.selection)) return null;
        try {
            var u = new URL(base.url.toString());
            u.searchParams.set(base.season_key, str(target.season));
            u.searchParams.set(base.episode_key, str(target.episode));
            return { url: portableResolver(u.toString()), headers: clone(base.headers || {}), selection: clone(base.selection || {}) };
        } catch (e) { return null; }
    }
    function resolverMatchesItem(url, item, requireCoordinates) {
        if (!url) return false;
        try {
            var parsed = new URL(str(url));
            if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password || !looksOnlineResolver(parsed.toString())) return false;
            var shortS = parsed.searchParams.getAll('s'), shortE = parsed.searchParams.getAll('e');
            var longS = parsed.searchParams.getAll('season'), longE = parsed.searchParams.getAll('episode');
            var hasCoordinates = shortS.length || shortE.length || longS.length || longE.length;
            if (!hasCoordinates) return !requireCoordinates;
            var shortPair = shortS.length === 1 && shortE.length === 1 && !longS.length && !longE.length;
            var longPair = longS.length === 1 && longE.length === 1 && !shortS.length && !shortE.length;
            if (!shortPair && !longPair) return false;
            var season = positiveInteger(parsed.searchParams.get(shortPair ? 's' : 'season'));
            var episode = positiveInteger(parsed.searchParams.get(shortPair ? 'e' : 'episode'));
            if (!season || !episode) return false;
            var target = explicitItemSE(item);
            return !target || (season === target.season && episode === target.episode);
        } catch (e) { return false; }
    }
    function activeRchConnectionId(host) {
        try {
            var registry = window.rch_nws || {};
            var entry = registry[str(host)] || registry[str(host).split(':')[0]];
            return str(entry && entry.connectionId || '');
        } catch (e) { return ''; }
    }
    function localizeResolver(url) {
        url = str(url);
        if (!url) return '';
        try {
            var u = new URL(url, location.href);
            stripLocalResolverParams(u);
            var email = str(Lampa.Storage.get('account_email', ''));
            var uid = str(Lampa.Storage.get('lampac_unic_id', ''));
            var nws = activeRchConnectionId(u.host) || str(Lampa.Storage.get('lampac_nws_id', ''));
            if (email) u.searchParams.set('account_email', email);
            if (uid) u.searchParams.set('uid', uid);
            if (nws) u.searchParams.set('nws_id', nws);
            return u.toString();
        } catch (e) { return url; }
    }
    function onlineHeaders(saved) {
        var h = portableResolverHeaders(saved);
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
    function normalizedOnlineIndex(online) {
        online = online || {};
        return Math.max(0, Math.min(Math.max(0, (online.items || []).length - 1), num(online.index)));
    }
    function onlineRecordIndex(record) {
        var online = record && record.online || {};
        var items = Array.isArray(online.items) ? online.items : [];
        var hash = str(record && record.timeline_hash);
        var i;
        if (hash) {
            for (i = 0; i < items.length; i++) if (items[i] && str(items[i].hash) === hash) return i;
        }
        var season = positiveInteger(record && record.season);
        var episode = positiveInteger(record && record.episode);
        if (season && episode) {
            for (i = 0; i < items.length; i++) {
                if (items[i] && num(items[i].season) === season && num(items[i].episode) === episode) return i;
            }
            var expectedSelection = resolverSelection(online.resolver_url || '', online.selection || {});
            var coordinateMatches = [];
            for (i = 0; i < items.length; i++) {
                var resolverUrl = str(items[i] && (items[i].resolver_url || (looksOnlineResolver(items[i].direct_url) ? items[i].direct_url : '')));
                var shape = safeResolverShape(resolverUrl);
                if (!shape || shape.season !== season || shape.episode !== episode) continue;
                var actualSelection = resolverSelection(resolverUrl, items[i] && items[i].selection || {});
                if (selectionKey(expectedSelection) && !selectionMatches(expectedSelection, actualSelection)) continue;
                coordinateMatches.push(i);
            }
            if (coordinateMatches.length === 1) return coordinateMatches[0];
            if (coordinateMatches.length > 1) return -1;
        }
        return Math.max(0, Math.min(Math.max(0, items.length - 1), num(record && record.current_index !== undefined ? record.current_index : online.index)));
    }
    function onlineResolverForRecord(record) {
        var o = record && record.online || {};
        var idx = onlineRecordIndex(record);
        if (idx < 0) return null;
        var item = o.items && o.items[idx] || {};
        var savedIndex = normalizedOnlineIndex(o);
        var expected = selectionKey(item.selection) ? item.selection : resolverSelection(item.resolver_url || '', {});
        if (!selectionKey(expected) && idx === savedIndex) {
            expected = selectionKey(o.selection) ? o.selection : resolverSelection(o.resolver_url || '', {});
        }
        var candidates = [
            { url: item.resolver_url || '', headers: item.resolver_headers || {}, top: false },
            { url: o.resolver_url || '', headers: o.resolver_headers || {}, top: true }
        ];
        for (var i = 0; i < candidates.length; i++) {
            if (!candidates[i].url) continue;
            var requireCoordinates = candidates[i].top && idx !== savedIndex;
            if (!resolverMatchesItem(candidates[i].url, { season: record && record.season, episode: record && record.episode }, requireCoordinates)) continue;
            var actual = resolverSelection(candidates[i].url, {});
            if (selectionKey(expected) && !selectionMatches(expected, actual)) continue;
            candidates[i].selection = actual;
            return candidates[i];
        }
        return null;
    }
    function resolveOnlineCandidate(resolver, callback, launchDeadline) {
        if (!resolver || !resolver.url || !Lampa.Reguest) return callback(null);
        var deadline = Math.min(num(launchDeadline) || now() + ONLINE_CANDIDATE_TIMEOUT, now() + ONLINE_CANDIDATE_TIMEOUT);
        var limit = Math.max(0, deadline - now());
        if (!limit) return callback(null);
        var settled = false;
        var retried = false;
        var timer = setTimeout(function () { finish(null); }, limit);
        function finish(result) {
            if (settled) return;
            if (result && now() >= deadline) result = null;
            settled = true;
            if (timer) clearTimeout(timer);
            callback(result);
        }
        function request() {
            if (settled || now() >= deadline) return finish(null);
            var n = new Lampa.Reguest();
            try { n.timeout(Math.max(1, deadline - now())); } catch (e) {}
            try {
                n.native(localizeResolver(resolver.url), function (d) {
                    if (settled) return;
                    if (now() >= deadline) return finish(null);
                    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e2) { d = null; } }
                    if (d && d.rch) {
                        if (retried) return finish(null);
                        var handshake = window.Online2RchHandshake;
                        if (typeof handshake !== 'function') return finish(null);
                        retried = true;
                        var ready = false;
                        try {
                            var accepted = handshake(d, function () {
                                if (ready || settled) return;
                                ready = true;
                                request();
                            }, function () { return !settled && now() < deadline; });
                            if (accepted === false && !ready) finish(null);
                        } catch (e3) { finish(null); }
                        return;
                    }
                    var u = chooseOnlineUrl(d);
                    finish(u && !looksOnlineResolver(u) ? { url: u, data: d || {}, selection: resolver.selection || {} } : null);
                }, function () {
                    if (settled) return;
                    if (now() >= deadline) return finish(null);
                    finish(null);
                }, false, { headers: onlineHeaders(resolver.headers) });
            } catch (e4) { finish(null); }
        }
        request();
    }
    function resolveOnline(record, callback, launchDeadline) {
        var resolver = onlineResolverForRecord(record);
        if (!resolver) return callback(null);
        onlineNoty('RESOLVE ' + shortUrl(resolver.url));
        resolveOnlineCandidate(resolver, function (resolved) {
            onlineNoty(resolved ? 'RESOLVE OK ' + shortUrl(resolved.url) : 'RESOLVE FAIL');
            callback(resolved);
        }, launchDeadline);
    }
    function looksOnlineResolver(url) {
        try {
            var u = new URL(str(url), location.href);
            return /^\/lite\/[^/]+\/(?:video|serial|movie|episodes?)(?:\/|$)/i.test(u.pathname);
        } catch (e) { return false; }
    }
    function directOnlineUrl(def) {
        var url = cleanUrl(def && def.direct_url || '');
        return url && !looksOnlineResolver(url) ? url : '';
    }
    function onlineResolverForItem(def, fallbackSelection) {
        def = def || {};
        var url = str(def.resolver_url || '');
        if (!url && looksOnlineResolver(def.direct_url)) url = str(def.direct_url);
        if (!url) return null;
        var expected = def.selection || fallbackSelection || resolverSelection(url, {});
        var actual = resolverSelection(url, expected || {});
        if (selectionKey(expected) && !selectionMatches(expected, actual)) return null;
        return { url: url, headers: def.resolver_headers || {}, selection: actual };
    }
    function applyResolvedOnlineItem(item, resolved) {
        if (!item || !resolved || !resolved.url || looksOnlineResolver(resolved.url)) return false;
        item.url = resolved.url; item.uri = resolved.url; item.src = resolved.url;
        if (resolved.data) applyMeta(item, playbackMeta(resolved.data));
        item.online_selection = clone(resolved.selection || {});
        return true;
    }
    function prepareOnlineWindow(defs, list, idx, fallbackSelection, launchDeadline, callback) {
        var last = Math.min(defs.length - 1, idx + 2);
        var first = idx;
        var forward = idx;
        var stoppedForward = false;
        var done = false;
        var tasks = [];
        for (var i = idx + 1; i <= last; i++) tasks.push(i);
        if (idx > 0) tasks.push(idx - 1);
        var globalTimer = null;

        function finish() {
            if (done) return;
            done = true;
            if (globalTimer) clearTimeout(globalTimer);
            var windowList = list.slice(first, forward + 1);
            var current = idx - first;
            windowList.forEach(function (item, index) { item.playlist_index = index; });
            callback({ list: windowList, index: current });
        }
        function resolvedAt(index, resolved) {
            if (done) return;
            if (now() >= num(launchDeadline)) return finish();
            if (!applyResolvedOnlineItem(list[index], resolved)) {
                if (index > idx) stoppedForward = true;
            } else if (index > idx) {
                forward = index;
            } else {
                first = index;
            }
            next();
        }
        function next() {
            if (done) return;
            if (now() >= num(launchDeadline)) return finish();
            if (!tasks.length) return finish();
            var index = tasks.shift();
            if (index > idx && stoppedForward) return next();
            var def = defs[index] || {};
            var resolver = onlineResolverForItem(def, fallbackSelection);
            if (resolver) {
                var remaining = num(launchDeadline) - now();
                if (remaining <= 0) return finish();
                var firstForward = index === idx + 1;
                if (!firstForward && remaining < ONLINE_CANDIDATE_TIMEOUT) return resolvedAt(index, null);
                resolveOnlineCandidate(resolver, function (resolved) { resolvedAt(index, resolved); }, launchDeadline);
                return;
            }
            var direct = directOnlineUrl(def);
            resolvedAt(index, direct ? { url: direct, data: {}, selection: def.selection || fallbackSelection || {} } : null);
        }
        if (now() >= num(launchDeadline)) return finish();
        globalTimer = setTimeout(finish, Math.max(0, num(launchDeadline) - now()));
        next();
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
        var saved = str(t.hash || '');
        if (!t.magnet || !Lampa.Torserver || !Lampa.Torserver.hash) return callback(saved);
        var settled = false;
        var timer = saved ? setTimeout(function () { finish(saved); }, TORRENT_HASH_FALLBACK) : null;
        function finish(hash) {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            callback(str(hash || saved || ''));
        }
        try {
            Lampa.Torserver.hash({
                title: record.title || movieTitle(movie), link: t.magnet,
                poster: record.poster || '', data: { lampa: true, movie: movie }
            }, function (x) { finish(x && x.hash); }, function () { finish(saved); });
        } catch (e) { finish(saved); }
    }
    function rebuildTorrent(record, movie, hash) {
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
    function launchTorrent(movie, record) {
        ensureTorrent(record, movie, function (hash) {
            var list = rebuildTorrent(record, movie, hash);
            if (!list.length) return noty('Не удалось восстановить торрент-плейлист');
            var idx = Math.max(0, Math.min(list.length - 1, num(record.current_index)));
            for (var i = 0; i < list.length; i++) if (record.timeline_hash && list[i].timeline && str(list[i].timeline.hash) === str(record.timeline_hash)) idx = i;
            var item = clone(list[idx]);
            var live = timelineView(record.timeline_hash) || {};
            var resumeRoad = mergeRecordRoad(record, live);
            var time = resumeRoad.time;
            var dur = resumeRoad.duration;
            var per = resumeRoad.percent;
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
        var launchDeadline = now() + ONLINE_LAUNCH_DEADLINE;
        onlineNoty('CONTINUE S' + num(record.season) + 'E' + num(record.episode) + ' ' + formatTime(record.time));
        resolveOnline(record, function (resolved) {
            var online = record.online || {};
            var defs = Array.isArray(online.items) && online.items.length ? online.items : [{
                title: record.episode_title || record.title, season: record.season, episode: record.episode,
                hash: record.timeline_hash, direct_url: online.direct_url || '', meta: {}
            }];
            var idx = onlineRecordIndex(record);
            if (idx < 0) return noty('Не удалось однозначно определить серию');
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
                item.time = num(road.time);
                item.position = item.time > 0 ? item.time : -1;
                item.duration = num(road.duration);
                item.percent = num(road.percent);
                return item;
            });
            var activeDef = defs[idx] || {};
            var allowTopFallback = idx === normalizedOnlineIndex(online);
            var u = resolved && resolved.url ? resolved.url : (directOnlineUrl(activeDef) ||
                (allowTopFallback ? directOnlineUrl({ direct_url: online.direct_url }) : ''));
            if (!u) return noty('Не удалось получить свежую ссылку серии');
            var live = timelineView(record.timeline_hash) || {};
            var resumeRoad = mergeRecordRoad(record, live);
            var time = resumeRoad.time;
            var dur = resumeRoad.duration;
            var per = resumeRoad.percent;
            var d = clone(list[idx] || {});
            d.url = u; d.uri = u; d.src = u;
            d.title = activeDef.title || record.episode_title || record.title || movieTitle(movie);
            d.card = movie; d.movie = movie;
            d.season = num(record.season || activeDef.season); d.episode = num(record.episode || activeDef.episode); d.isonline = true;
            var onlineTimeline = timelineView(record.timeline_hash) || d.timeline || { hash: record.timeline_hash, time: 0, duration: 0, percent: 0 };
            onlineTimeline.hash = record.timeline_hash; onlineTimeline.time = time; onlineTimeline.duration = dur; onlineTimeline.percent = per;
            d.timeline = onlineTimeline;
            d.time = time; d.position = time > 0 ? time : -1; d.duration = dur; d.percent = per;
            d.playlist_index = idx; d.start_index = idx;
            d.online_selection = clone(resolved && resolved.selection || online.selection || activeDef.selection || {});
            d.continue_watch_v6 = true;
            if (resolved && resolved.data) applyMeta(d, playbackMeta(resolved.data));
            list[idx] = deepCopy(d) || clone(d);
            prepareOnlineWindow(defs, list, idx, d.online_selection, launchDeadline, function (prepared) {
                d.playlist_index = prepared.index; d.start_index = prepared.index;
                if (prepared.list[prepared.index]) prepared.list[prepared.index].start_index = prepared.index;
                d.currentItem = deepCopy(prepared.list[prepared.index]) || clone(prepared.list[prepared.index]);
                d.playlist = prepared.list;
                onlineNoty('PLAYER ' + shortUrl(u) + ' playlist=' + prepared.list.length + ' title=' + str(d.title).slice(0, 35));
                try {
                    state.onlineLaunchSeed = {
                        card_key: cardKey(movie),
                        defs: deepCopy(defs) || [],
                        index: idx,
                        window_index: prepared.index,
                        activity_at: num(record.activity_at),
                        online: deepCopy(online) || {}
                    };
                    Lampa.Player.play(d);
                    if (Lampa.Player.playlist) Lampa.Player.playlist(prepared.list);
                } catch (e) { noty('Ошибка запуска online'); }
                finally { state.onlineLaunchSeed = null; }
            });
        }, launchDeadline);
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
    function hydrateOnlinePlaylist(input) {
        var session = state.session;
        if (!session || session.source !== 'online') return false;
        var hadPlaylist = !!session.playlist.length;
        var list = normalizePlaylist(input);
        if (!list.length) return false;
        var matched = -1;
        var currentHash = str(session.hash);
        var currentUrl = cleanUrl(session.url);
        for (var i = 0; i < list.length; i++) {
            var itemHash = list[i].timeline && str(list[i].timeline.hash);
            if (currentHash && itemHash && itemHash === currentHash) { matched = i; break; }
        }
        if (matched < 0 && currentUrl) {
            for (var j = 0; j < list.length; j++) {
                var itemUrl = typeof list[j].url === 'string' ? cleanUrl(list[j].url) : '';
                if (itemUrl && itemUrl === currentUrl) { matched = j; break; }
            }
        }
        if (matched < 0 && list.length === 1) {
            var replacement = list[0] || {};
            var active = currentActivityMovie();
            var replacementMovie = replacement.card || replacement.movie || null;
            var replacementSE = itemSE(replacement, 0);
            var sameActiveCard = active && cardKey(active) === session.card_key;
            var sameReplacementCard = !replacementMovie || cardKey(replacementMovie) === session.card_key;
            if (sameActiveCard && sameReplacementCard && mediaType(session.movie) === 'tv' && replacementSE.season && replacementSE.episode) matched = 0;
        }
        if (matched < 0) return false;
        for (var k = 0; k < list.length; k++) {
            var itemSEValue = itemSE(list[k], k);
            list[k].season = num(list[k].season || itemSEValue.season);
            list[k].episode = num(list[k].episode || itemSEValue.episode);
            if (!list[k].timeline) list[k].timeline = {};
            if (!list[k].timeline.hash) list[k].timeline.hash = exactHash(list[k], session.movie, list[k].season, list[k].episode);
        }
        var current = list[matched] || {};
        var currentSE = itemSE(current, matched);
        session.playlist = list;
        session.index = matched;
        if (!hadPlaylist) {
            session.capture_index = matched;
            session.capture_season = num(currentSE.season || session.capture_season);
            session.capture_episode = num(currentSE.episode || session.capture_episode);
        }
        session.season = num(currentSE.season || session.season);
        session.episode = num(currentSE.episode || session.episode);
        session.hash = str(current.timeline && current.timeline.hash || exactHash(current, session.movie, session.season, session.episode) || session.hash);
        return true;
    }
    function capturePlayerSession(data) {
        data = data || {};
        if (state.playerCaptureData === data && now() - state.playerCaptureAt < 1000) return state.session;
        state.playerCaptureData = data;
        state.playerCaptureAt = now();
        try {
            var session = buildSession(data);
            if (session) {
                state.session = session;
                if (session.source === 'torrent' && isJustExternal()) writePending(session);
            }
            return session;
        } catch (e) {
            try { console.warn('[CW6] capture failed', e); } catch (ee) {}
            return null;
        }
    }
    function patchPlayer() {
        if (!Lampa.Player) return;
        if (!state.playerListenerPatched && Lampa.Player.listener && Lampa.Player.listener.follow) {
            try {
                Lampa.Player.listener.follow('create', function (event) {
                    capturePlayerSession(event && event.data ? event.data : event);
                });
                state.playerListenerPatched = true;
            } catch (eListener) {}
        }
        if (!state.playerPatched && typeof Lampa.Player.play === 'function') {
            var old = Lampa.Player.play;
            Lampa.Player.play = function (data) {
                capturePlayerSession(data || {});
                return old.apply(this, arguments);
            };
            Lampa.Player.__cw6_patched = VERSION;
            state.playerPatched = true;
        }
        if (!state.playerPlaylistPatched && typeof Lampa.Player.playlist === 'function') {
            var oldPlaylist = Lampa.Player.playlist;
            Lampa.Player.playlist = function (list) {
                try { hydrateOnlinePlaylist(list); } catch (e) { try { console.warn('[CW6] playlist capture failed', e); } catch (ee) {} }
                return oldPlaylist.apply(this, arguments);
            };
            Lampa.Player.__cw6_playlist_patched = VERSION;
            state.playerPlaylistPatched = true;
        }
    }

    function injectStyle() {
        var st = document.getElementById('cw6-style');
        if (!st) { st = document.createElement('style'); st.id = 'cw6-style'; document.head.appendChild(st); }
        try { if (st.setAttribute) st.setAttribute('data-cw-version', VERSION); } catch (e) {}
        st.textContent =
            '.button--continue-watch-native-just{opacity:1!important;pointer-events:auto!important;cursor:pointer!important;position:relative!important}' +
            '.button--continue-watch-native-just .continue-watch-native-just-icon{flex-shrink:0;pointer-events:none!important}' +
            '.button--continue-watch-native-just span,.button--continue-watch-native-just:after{pointer-events:none!important}' +
            '.button--continue-watch-native-just span{white-space:nowrap}' +
            '.button--continue-watch-native-just[data-cwu-subtitle]:after{content:attr(data-cwu-subtitle);display:none!important;margin-left:.45em;font-size:.72em;line-height:1;opacity:.65;white-space:nowrap;transform:translateY(.06em)}' +
            '.button--continue-watch-native-just:hover:after,.button--continue-watch-native-just.focus:after{display:inline-block!important}';
    }
    function eventMovie(event) {
        var activity = event && event.object && event.object.activity;
        return event && event.data && (event.data.movie || event.data.card) ||
            event && event.object && (event.object.movie || event.object.card) ||
            event && event.object && event.object.data && (event.object.data.movie || event.object.data.card) ||
            activity && (activity.movie || activity.card || (activity.params && activity.params.movie)) || null;
    }
    function cardRoot(candidate) {
        try {
            if (candidate && candidate.find) {
                if (candidate.is && candidate.is('.full-start-new,.full-start')) return candidate.first();
                var closest = candidate.closest && candidate.closest('.full-start-new,.full-start').first();
                if (closest && closest.length) return closest;
                var nested = candidate.find('.full-start-new,.full-start').last();
                if (nested && nested.length) return nested;
            }
            var x = $('.full-start-new,.full-start').last();
            return x && x.length ? x : null;
        } catch (e) { return null; }
    }
    function buttonContainer(root) {
        if (root.is && root.is('.full-start-new__buttons,.buttons--container')) return root.first();
        var c = root.find('.full-start-new__buttons').first();
        if (!c.length) c = root.find('.buttons--container').first();
        return c;
    }
    function recordRoad(r) {
        var live = r && r.timeline_hash ? timelineView(r.timeline_hash) : null;
        return mergeRecordRoad(r, live);
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
    function buttonStateKey(movie, r, road) {
        return cardKey(movie) + '|' + str(r.activity_at) + '|' + r.source + '|' + r.timeline_hash + '|' + road.time + '|' + road.percent;
    }
    function refreshUI(exactMovie, exactRoot) {
        var queuedMovie = exactMovie || null;
        var queuedRoot = exactRoot || null;
        if (state.uiTimer) clearTimeout(state.uiTimer);
        state.uiTimer = setTimeout(function () {
            var movie = queuedMovie || currentActivityMovie(), root = cardRoot(queuedRoot);
            if (!movie || !root) return;
            var r = getRecord(movie), old = root.find('.cw6-button,.button--continue-watch-native-just');
            if (!r) { old.remove(); return; }
            var road = recordRoad(r);
            var movieKey = cardKey(movie);
            var key = buttonStateKey(movie, r, road);
            if (old.length && old.attr('data-card-key') === movieKey && old.attr('data-state') === key) return;
            old.remove();
            var c = buttonContainer(root); if (!c || !c.length) return;
            var b = makeButton(movie, r).attr('data-card-key', movieKey).attr('data-state', key);
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

    function install() {
        if (state.installed) return;
        state.installed = true;
        state.remoteIdentityKey = identityFingerprint(lampacIdentity());
        injectStyle(); seedOutboxFromStore();
        try { $('.button--continue-watch-native-just,.button--continue-watch-ddd,.continue-watch-ddd-source').remove(); } catch (eOld) {}
        patchTorrent(); patchPlayer();
        try { Lampa.Timeline.listener.follow('update', onTimeline); } catch (e) {}
        try { Lampa.Listener.follow('request_secuses', captureResolver); } catch (e2) {}
        try {
            if (Lampa.Storage && Lampa.Storage.listener && Lampa.Storage.listener.follow) {
                Lampa.Storage.listener.follow('change', function (e) {
                    if (!e) return;
                    if (e.name === storageKey()) refreshUI();
                    if (e.name === 'plugins') {
                        detectRemoteIdentityChange();
                    }
                    if (e.name === 'account' || e.name === 'account_email' || e.name === 'lampac_unic_id' || e.name === 'lampac_profile_id') {
                        state.remoteIdentityKey = identityFingerprint(lampacIdentity());
                        state.remoteGeneration += 1;
                        setTimeout(function () { seedOutboxFromStore(); flushOutbox(true); syncRemote('identity'); refreshUI(); }, 5500);
                    }
                });
            }
        } catch (eStorage) {}
        try {
            Lampa.Listener.follow('full', function (e) {
                var m = eventMovie(e) || currentActivityMovie();
                var root = cardRoot(e && e.body);
                if (m) state.lastMovie = m;
                setTimeout(function () { refreshUI(m, root); }, 100);
                setTimeout(function () { refreshUI(m, root); }, 500);
            });
        } catch (e3) {}
        try { window.addEventListener('focus', function () { scheduleReconcile(); syncRemote('focus'); refreshUI(); }); } catch (e4) {}
        try { document.addEventListener('visibilitychange', function () { if (document.visibilityState !== 'hidden') { scheduleReconcile(); syncRemote('visibility'); refreshUI(); } }); } catch (e5) {}
        setInterval(function () { patchTorrent(); patchPlayer(); detectRemoteIdentityChange(); refreshUI(); }, 1800);
        setTimeout(reconcilePending, 1000);
        syncRemote('install');
        setTimeout(function () { flushOutbox(true); syncRemote('recovery'); refreshUI(); }, 7500);
        setTimeout(function () { flushOutbox(true); syncRemote('recovery'); refreshUI(); }, 17000);

        window.ContinueWatchV6 = {
            version: VERSION,
            record: function () { var m = activeMovie(); return m ? remoteProjectionRecord(getRecord(m)) : null; },
            session: function () { return state.session; },
            pending: readPending,
            reconcile: reconcilePending,
            launch: function () { var m = activeMovie(); if (m) launch(m); },
            source: function () { var r = activeMovie() ? getRecord(activeMovie()) : null; return r && r.source; },
            sync: function () { return { key: storageKey(), outbox: diagnosticProjectionMaps(readOutbox()), store: diagnosticProjectionMaps(store()) }; }
        };
        if (window.__CONTINUE_WATCH_TEST_MODE__) {
            window.ContinueWatchV6.testing = {
                normalizeRoad: normalizeRoad,
                guardRoadInPlace: guardRoadInPlace,
                mergeRecordRoad: mergeRecordRoad,
                resolverSelection: resolverSelection,
                selectionMatches: selectionMatches,
                onlineResolverForRecord: onlineResolverForRecord,
                localizeResolver: localizeResolver,
                ensureTorrent: ensureTorrent,
                buttonStateKey: buttonStateKey,
                cardKey: cardKey,
                getMovieFromData: getMovieFromData,
                discoverLampacToken: discoverLampacToken,
                lampacIdentity: lampacIdentity,
                remoteProfileId: remoteProfileId,
                lampacStorageUrl: lampacStorageUrl,
                mergeRecordMaps: mergeRecordMaps,
                pullRemote: pullRemote,
                pushRemote: pushRemote,
                syncRemote: syncRemote
            };
        }
    }

    if (window.appready) install();
    else {
        try { Lampa.Listener.follow('app', function (e) { if (e && e.type === 'ready') install(); }); } catch (e) {}
        setTimeout(install, 1200);
        setTimeout(install, 4000);
    }
})();
