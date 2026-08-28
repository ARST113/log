from pathlib import Path

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')

OLD_VERSION = "v5.7.0-timeline-direct-20260828"
NEW_VERSION = "v5.8.0-timeline-resolver-20260828"

if OLD_VERSION not in s:
    raise SystemExit(f'expected version {OLD_VERSION} not found')

s = s.replace(OLD_VERSION, NEW_VERSION, 1)

storage_marker = "    // ============================================================\n    // StorageManager\n    // ============================================================\n"
if storage_marker not in s:
    raise SystemExit('StorageManager marker not found')

resolver_module = r'''    // ============================================================
    // OnlineResolverCapture
    // ------------------------------------------------------------
    // Lampac Online resolves a stable episode URL through
    // Lampa.Reguest.native() and receives a short-lived media/proxy URL.
    // Lampa.Reguest publishes request_secuses BEFORE Lampac calls
    // Lampa.Player.play(), so we can remember resolver -> media without
    // opening the Online component on resume.
    // ============================================================

    var OnlineResolverCapture = (function () {
        var installed = false;
        var byMediaUrl = {};
        var lastCapture = null;

        function clonePlain(obj) {
            var out = {};
            if (!obj || typeof obj !== 'object') return out;
            Object.keys(obj).forEach(function (key) {
                var value = obj[key];
                if (value === undefined || typeof value === 'function') return;
                out[key] = value;
            });
            return out;
        }

        function normalizeMediaUrl(url) {
            if (typeof url !== 'string') return '';
            url = url.trim();
            if (!url) return '';
            if (url.indexOf(' or ') !== -1) url = url.split(' or ')[0].trim();
            return Utils.stripFragment(url);
        }

        function looksPlayable(url) {
            url = normalizeMediaUrl(url);
            if (!/^https?:\/\//i.test(url)) return false;
            return /\/proxy(?:-dash)?\//i.test(url) ||
                /\.(?:m3u8?|mpd|mp4|mkv|webm|mov|ts)(?:$|[?#])/i.test(url);
        }

        function refreshAccountParams(url) {
            url = String(url || '').trim();
            if (!url) return '';

            try {
                var parsed = new URL(url, location.href);
                if (!/^https?:$/i.test(parsed.protocol)) return url;

                parsed.searchParams.delete('account_email');
                parsed.searchParams.delete('uid');
                parsed.searchParams.delete('nws_id');

                var email = '';
                var uid = '';
                var nws = '';
                try { email = String(Lampa.Storage.get('account_email', '') || ''); } catch (e) {}
                try { uid = String(Lampa.Storage.get('lampac_unic_id', '') || ''); } catch (e2) {}
                try { nws = String(Lampa.Storage.get('lampac_nws_id', '') || ''); } catch (e3) {}

                if (email) parsed.searchParams.set('account_email', email);
                if (uid) parsed.searchParams.set('uid', uid);
                if (nws) parsed.searchParams.set('nws_id', nws);

                return parsed.toString();
            } catch (e4) {
                return url;
            }
        }

        function currentRequestHeaders(saved) {
            var headers = clonePlain(saved || {});
            try {
                var aes = String(Lampa.Storage.get('aesgcmkey', '') || '');
                if (aes) headers['X-Kit-AesGcm'] = aes;
            } catch (e) {}
            return headers;
        }

        function rememberOne(mediaUrl, resolver) {
            mediaUrl = normalizeMediaUrl(mediaUrl);
            if (!mediaUrl || !looksPlayable(mediaUrl) || !resolver || !resolver.url) return;
            byMediaUrl[mediaUrl] = {
                url: resolver.url,
                headers: clonePlain(resolver.headers || {}),
                capturedAt: Number(resolver.capturedAt || Utils.now())
            };
        }

        function captureSuccess(event) {
            if (!event || !event.params || !event.params.url) return;

            var response = event.data;
            if (typeof response === 'string') {
                try { response = JSON.parse(response); } catch (e) { return; }
            }
            if (!response || typeof response !== 'object') return;

            var requestUrl = String(event.params.url || '').trim();
            var mediaUrl = typeof response.url === 'string' ? response.url : '';
            if (!requestUrl || !mediaUrl || !looksPlayable(mediaUrl)) return;

            // Do not treat a direct media GET as a resolver request.
            if (normalizeMediaUrl(requestUrl) === normalizeMediaUrl(mediaUrl)) return;

            var resolver = {
                url: refreshAccountParams(requestUrl),
                headers: currentRequestHeaders(event.params.headers || {}),
                capturedAt: Utils.now()
            };

            rememberOne(mediaUrl, resolver);

            if (response.quality && typeof response.quality === 'object') {
                Object.keys(response.quality).forEach(function (key) {
                    var value = response.quality[key];
                    if (typeof value !== 'string') return;
                    if (value.indexOf(' or ') !== -1) {
                        value.split(' or ').forEach(function (part) {
                            rememberOne(part, resolver);
                        });
                    } else {
                        rememberOne(value, resolver);
                    }
                });
            }

            lastCapture = {
                mediaUrl: normalizeMediaUrl(mediaUrl),
                resolver: resolver,
                response: response,
                at: Utils.now()
            };
        }

        function lookup(mediaUrl) {
            mediaUrl = normalizeMediaUrl(mediaUrl);
            if (!mediaUrl) return null;
            var found = byMediaUrl[mediaUrl];
            if (!found) return null;
            return {
                url: found.url,
                headers: clonePlain(found.headers || {}),
                capturedAt: Number(found.capturedAt || 0)
            };
        }

        function chooseMediaUrl(json) {
            if (!json || typeof json !== 'object') return '';

            var url = typeof json.url === 'string' ? json.url : '';
            var quality = json.quality && typeof json.quality === 'object' ? json.quality : null;

            if (quality) {
                var preferred = 0;
                try { preferred = parseInt(Lampa.Storage.field('video_quality_default') || 0, 10); } catch (e) {}
                if (preferred) {
                    Object.keys(quality).some(function (key) {
                        if (parseInt(key, 10) === preferred && typeof quality[key] === 'string') {
                            url = quality[key];
                            return true;
                        }
                        return false;
                    });
                }
            }

            if (typeof url === 'string' && url.indexOf(' or ') !== -1) {
                url = url.split(' or ')[0].trim();
            }
            return normalizeMediaUrl(url);
        }

        function resolve(params, callback) {
            params = params || {};
            callback = typeof callback === 'function' ? callback : function () {};

            var resolverUrl = refreshAccountParams(params.online_resolver_url || '');
            if (!resolverUrl || !Lampa.Reguest) {
                callback(null);
                return;
            }

            var network = new Lampa.Reguest();
            try { network.timeout(12000); } catch (e) {}

            var headers = currentRequestHeaders(params.online_resolver_headers || {});

            network.native(
                resolverUrl,
                function (json) {
                    if (typeof json === 'string') {
                        try { json = JSON.parse(json); } catch (e2) { json = null; }
                    }
                    if (!json || typeof json !== 'object' || json.rch) {
                        callback(null);
                        return;
                    }

                    var mediaUrl = chooseMediaUrl(json);
                    if (!mediaUrl) {
                        callback(null);
                        return;
                    }

                    var mediaHeaders = clonePlain(json.headers || {});
                    callback({
                        url: mediaUrl,
                        headers: mediaHeaders,
                        quality: json.quality && typeof json.quality === 'object' ? json.quality : null,
                        segments: json.segments || null,
                        subtitles: json.subtitles || null,
                        subtitles_call: json.subtitles_call || null,
                        hls_manifest_timeout: json.hls_manifest_timeout,
                        resolver_url: resolverUrl,
                        resolver_headers: headers
                    });
                },
                function () {
                    callback(null);
                },
                false,
                { headers: headers }
            );
        }

        function init() {
            if (installed) return;
            installed = true;
            try {
                Lampa.Listener.follow('request_secuses', captureSuccess);
            } catch (e) {
                installed = false;
                Utils.error('Online resolver listener failed', e);
            }
        }

        function status() {
            return {
                installed: installed,
                entries: Object.keys(byMediaUrl).length,
                lastCapture: lastCapture
            };
        }

        return {
            init: init,
            lookup: lookup,
            resolve: resolve,
            status: status,
            refreshAccountParams: refreshAccountParams
        };
    })();

'''

s = s.replace(storage_marker, resolver_module + storage_marker, 1)

old_buildparams = """                isonline: !!session.isOnline,\n                online_context: session.onlineContext || null,\n                url: Utils.stripFragment(session.url || ''),"""
new_buildparams = """                isonline: !!session.isOnline,\n                online_context: session.onlineContext || null,\n                online_resolver_url: session.onlineResolver && session.onlineResolver.url ? String(session.onlineResolver.url) : '',\n                online_resolver_headers: session.onlineResolver && session.onlineResolver.headers ? session.onlineResolver.headers : null,\n                online_resolver_at: session.onlineResolver ? Number(session.onlineResolver.capturedAt || 0) : 0,\n                url: Utils.stripFragment(session.url || ''),"""
if old_buildparams not in s:
    raise SystemExit('buildParams online marker not found')
s = s.replace(old_buildparams, new_buildparams, 1)

old_session = """                torrentHash: String(data.torrent_hash || (item && item.torrent_hash) || ''),\n                isOnline: !!data.isonline,\n                onlineContext: Utils.captureOnlineContext(data, movie),\n                lastRoad: null,"""
new_session = """                torrentHash: String(data.torrent_hash || (item && item.torrent_hash) || ''),\n                isOnline: !!data.isonline,\n                onlineContext: Utils.captureOnlineContext(data, movie),\n                onlineResolver: data.online_resolver_url\n                    ? {\n                        url: String(data.online_resolver_url || ''),\n                        headers: data.online_resolver_headers || {},\n                        capturedAt: Number(data.online_resolver_at || Utils.now())\n                    }\n                    : (data.isonline ? OnlineResolverCapture.lookup(url) : null),\n                lastRoad: null,"""
if old_session not in s:
    raise SystemExit('buildFromPlayData session marker not found')
s = s.replace(old_session, new_session, 1)

old_update_url = """            currentSession.url = url;\n            currentSession.playlistIndex = index;"""
new_update_url = """            currentSession.url = url;\n            if (currentSession.isOnline) {\n                var resolverFromPayload = payload.online_resolver_url\n                    ? {\n                        url: String(payload.online_resolver_url || ''),\n                        headers: payload.online_resolver_headers || {},\n                        capturedAt: Number(payload.online_resolver_at || Utils.now())\n                    }\n                    : OnlineResolverCapture.lookup(url);\n                if (resolverFromPayload) currentSession.onlineResolver = resolverFromPayload;\n            }\n            currentSession.playlistIndex = index;"""
if old_update_url not in s:
    raise SystemExit('updateByPlaylistIndex marker not found')
s = s.replace(old_update_url, new_update_url, 1)

old_patch = """                    data = data || {};\n\n                    var transport = JustPlusTransport.matches() ? 'just' : 'lampa';"""
new_patch = """                    data = data || {};\n\n                    if (data.isonline) {\n                        var mediaForResolver = data.url || data.uri || data.src || '';\n                        var resolverMeta = OnlineResolverCapture.lookup(mediaForResolver);\n                        if (resolverMeta) {\n                            data.online_resolver_url = resolverMeta.url;\n                            data.online_resolver_headers = resolverMeta.headers || {};\n                            data.online_resolver_at = Number(resolverMeta.capturedAt || Utils.now());\n                        }\n                    }\n\n                    var transport = JustPlusTransport.matches() ? 'just' : 'lampa';"""
if old_patch not in s:
    raise SystemExit('Player.play patch marker not found')
s = s.replace(old_patch, new_patch, 1)

old_player_call = """            try {\n                Lampa.Player.play(data);\n            } catch (e3) {\n                Utils.error('Launch from continue failed', e3);\n            }\n        }\n\n        return {"""
new_player_call = """            function startPlayback(resolved) {\n                if (resolved && resolved.url) {\n                    var freshUrl = Utils.stripFragment(resolved.url);\n                    data.url = freshUrl;\n                    data.uri = freshUrl;\n                    data.src = freshUrl;\n\n                    if (activeItem) {\n                        activeItem.url = freshUrl;\n                        activeItem.uri = freshUrl;\n                        activeItem.src = freshUrl;\n                    }\n\n                    if (resolved.headers && Object.keys(resolved.headers).length) data.headers = resolved.headers;\n                    if (resolved.quality) data.quality = resolved.quality;\n                    if (resolved.segments) data.segments = resolved.segments;\n                    if (resolved.subtitles) data.subtitles = resolved.subtitles;\n                    if (resolved.subtitles_call) data.subtitles_call = resolved.subtitles_call;\n                    if (resolved.hls_manifest_timeout !== undefined) {\n                        data.hls_manifest_timeout = resolved.hls_manifest_timeout;\n                    }\n\n                    data.online_resolver_url = resolved.resolver_url || params.online_resolver_url || '';\n                    data.online_resolver_headers = resolved.resolver_headers || params.online_resolver_headers || {};\n                    data.online_resolver_at = Utils.now();\n                }\n\n                try {\n                    Lampa.Player.play(data);\n                } catch (e3) {\n                    Utils.error('Launch from continue failed', e3);\n                }\n            }\n\n            if (params.isonline && params.online_resolver_url) {\n                OnlineResolverCapture.resolve(params, function (resolved) {\n                    // If resolver temporarily fails, keep the previous behavior as a fallback.\n                    // No Online UI is opened in either path.\n                    startPlayback(resolved);\n                });\n                return;\n            }\n\n            startPlayback(null);\n        }\n\n        return {"""
if old_player_call not in s:
    raise SystemExit('launchFromContinue final Player.play block not found')
s = s.replace(old_player_call, new_player_call, 1)

old_transport_init = """        function init() {\n            JustPlusTransport.init();\n            LampaNativeTransport.init();"""
new_transport_init = """        function init() {\n            OnlineResolverCapture.init();\n            JustPlusTransport.init();\n            LampaNativeTransport.init();"""
if old_transport_init not in s:
    raise SystemExit('TransportManager init marker not found')
s = s.replace(old_transport_init, new_transport_init, 1)

old_api = """            transport: {\n                just: JustPlusTransport.getStatus,\n                lampa: LampaNativeTransport.getStatus\n            },"""
new_api = """            transport: {\n                just: JustPlusTransport.getStatus,\n                lampa: LampaNativeTransport.getStatus,\n                onlineResolver: OnlineResolverCapture.status\n            },"""
if old_api in s:
    s = s.replace(old_api, new_api, 1)

PATH.write_text(s, encoding='utf-8')
print('patched', NEW_VERSION, 'chars=', len(s))
