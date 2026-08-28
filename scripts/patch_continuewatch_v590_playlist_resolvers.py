from pathlib import Path

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    s = s.replace(old, new, 1)


replace_once(
    "var BOOT_VERSION = 'v5.8.0-timeline-resolver-20260828';",
    "var BOOT_VERSION = 'v5.9.0-online-playlist-resolvers-20260828';",
    'version'
)

# ---------------------------------------------------------------------------
# Replace OnlineResolverCapture with a version that also learns the resolver
# URL for every episode in the current Lampac Online list (not just the active
# media URL). This keeps Timeline as the source of S/E/time while preserving a
# stable way to refresh every online playlist item after sync.
# ---------------------------------------------------------------------------
start = s.index("    var OnlineResolverCapture = (function () {")
end = s.index("    // ============================================================\n    // StorageManager", start)

online_block = r'''    var OnlineResolverCapture = (function () {
        var installed = false;
        var byMediaUrl = {};
        var byEpisodeKey = {};
        var lastCapture = null;
        var lastPlaylistCapture = null;

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

        function isTransientMediaUrl(url) {
            url = normalizeMediaUrl(url);
            return !!(url && /\/proxy(?:-dash)?\//i.test(url));
        }

        function absoluteResolverUrl(url, baseUrl) {
            url = String(url || '').trim();
            if (!url) return '';
            try {
                return new URL(url, baseUrl || location.href).toString();
            } catch (e) {
                return url;
            }
        }

        function portableResolverUrl(url) {
            url = String(url || '').trim();
            if (!url) return '';

            try {
                var parsed = new URL(url, location.href);
                if (!/^https?:$/i.test(parsed.protocol)) return url;

                // These belong to the current device/account and must never be the
                // identity of a synchronized resolver.
                parsed.searchParams.delete('account_email');
                parsed.searchParams.delete('uid');
                parsed.searchParams.delete('nws_id');

                return parsed.toString();
            } catch (e) {
                return url;
            }
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

        function movieIdentity(movie) {
            movie = movie || {};
            var id = movie.id || movie.movie_id || movie.tmdb_id || movie.tmdbId || '';
            var mediaType = Utils.getMediaKind(movie) || '';
            if (id) return mediaType + ':' + String(id);

            var title = Utils.getMovieTitle(movie);
            var year = String(movie.release_date || movie.first_air_date || movie.year || '').slice(0, 4);
            if (title) return mediaType + ':title:' + String(Lampa.Utils.hash([title, year].join('|')));
            return '';
        }

        function episodeKeys(movie, item) {
            item = item || {};
            var keys = [];
            var hash = item.timeline && item.timeline.hash && String(item.timeline.hash) !== '0'
                ? String(item.timeline.hash)
                : String(item.timeline_hash || '');
            if (hash) keys.push('h:' + hash);

            var season = Number(item.season || item.season_number || item.s || 0);
            var episode = Number(item.episode || item.episode_number || item.e || 0);
            var movieKey = movieIdentity(movie);
            if (movieKey && season > 0 && episode > 0) {
                keys.push('m:' + movieKey + '|s:' + season + '|e:' + episode);
            }
            return keys;
        }

        function rememberEpisode(movie, item, resolver) {
            if (!resolver || !resolver.url) return;
            var keys = episodeKeys(movie, item);
            if (!keys.length) return;

            var clean = {
                url: portableResolverUrl(resolver.url),
                headers: clonePlain(resolver.headers || {}),
                capturedAt: Number(resolver.capturedAt || Utils.now())
            };

            keys.forEach(function (key) {
                byEpisodeKey[key] = clean;
            });
        }

        function lookupEpisode(movie, item) {
            var keys = episodeKeys(movie, item);
            for (var i = 0; i < keys.length; i++) {
                var found = byEpisodeKey[keys[i]];
                if (!found) continue;
                return {
                    url: found.url,
                    headers: clonePlain(found.headers || {}),
                    capturedAt: Number(found.capturedAt || 0)
                };
            }
            return null;
        }

        function rememberOne(mediaUrl, resolver) {
            mediaUrl = normalizeMediaUrl(mediaUrl);
            if (!mediaUrl || !looksPlayable(mediaUrl) || !resolver || !resolver.url) return;
            byMediaUrl[mediaUrl] = {
                url: portableResolverUrl(resolver.url),
                headers: clonePlain(resolver.headers || {}),
                capturedAt: Number(resolver.capturedAt || Utils.now())
            };
        }

        function capturePlaylistHtml(event, response) {
            if (typeof response !== 'string') return false;
            if (response.indexOf('videos__item') === -1 || response.indexOf('data-json') === -1) return false;

            var movie = Utils.getActivityMovie();
            if (!movie) return false;

            var requestUrl = String(event && event.params && event.params.url || '').trim();
            var headers = currentRequestHeaders(event && event.params && event.params.headers || {});
            var foundCount = 0;

            try {
                var html = $('<div>' + response + '</div>');
                html.find('.videos__item').each(function () {
                    var node = $(this);
                    var raw = node.attr('data-json');
                    if (!raw) return;

                    var data = null;
                    try { data = JSON.parse(raw); } catch (e) { return; }
                    if (!data || String(data.method || '').toLowerCase() !== 'call' || !data.url) return;

                    var season = Number(node.attr('s') || data.season || data.season_number || 0);
                    var episode = Number(node.attr('e') || data.episode || data.episode_number || 0);
                    if (!season || !episode) return;

                    var resolverUrl = absoluteResolverUrl(data.url, requestUrl || location.href);
                    if (!resolverUrl) return;

                    rememberEpisode(movie, {
                        season: season,
                        episode: episode
                    }, {
                        url: resolverUrl,
                        headers: headers,
                        capturedAt: Utils.now()
                    });
                    foundCount += 1;
                });
            } catch (e2) {
                return false;
            }

            if (foundCount) {
                lastPlaylistCapture = {
                    movie: movieIdentity(movie),
                    entries: foundCount,
                    at: Utils.now()
                };
            }
            return foundCount > 0;
        }

        function captureSuccess(event) {
            if (!event || !event.params || !event.params.url) return;

            var response = event.data;
            if (typeof response === 'string') {
                capturePlaylistHtml(event, response);
                try { response = JSON.parse(response); } catch (e) { return; }
            }
            if (!response || typeof response !== 'object') return;

            var requestUrl = String(event.params.url || '').trim();
            var mediaUrl = typeof response.url === 'string' ? response.url : '';
            if (!requestUrl || !mediaUrl || !looksPlayable(mediaUrl)) return;

            // Do not treat a direct media GET as a resolver request.
            if (normalizeMediaUrl(requestUrl) === normalizeMediaUrl(mediaUrl)) return;

            var resolver = {
                url: portableResolverUrl(requestUrl),
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

        function enrichPlaylist(movie, playlist) {
            if (!Array.isArray(playlist) || !playlist.length) return playlist;
            playlist.forEach(function (item) {
                if (!item || typeof item !== 'object') return;
                if (item.online_resolver_url) {
                    item.online_resolver_url = portableResolverUrl(item.online_resolver_url);
                    return;
                }
                var resolver = lookupEpisode(movie, item);
                if (!resolver) return;
                item.online_resolver_url = resolver.url;
                item.online_resolver_headers = resolver.headers || {};
                item.online_resolver_at = Number(resolver.capturedAt || 0);
            });
            return playlist;
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

            var portable = portableResolverUrl(params.online_resolver_url || '');
            var resolverUrl = refreshAccountParams(portable);
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
                        resolver_url: portable,
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
                episodeEntries: Object.keys(byEpisodeKey).length,
                lastCapture: lastCapture,
                lastPlaylistCapture: lastPlaylistCapture
            };
        }

        return {
            init: init,
            lookup: lookup,
            lookupEpisode: lookupEpisode,
            enrichPlaylist: enrichPlaylist,
            resolve: resolve,
            status: status,
            refreshAccountParams: refreshAccountParams,
            portableResolverUrl: portableResolverUrl,
            isTransientMediaUrl: isTransientMediaUrl
        };
    })();
'''

s = s[:start] + online_block + '\n' + s[end:]

# ---------------------------------------------------------------------------
# Replace compact/expand playlist. Version 2 stores one resolver per online
# episode and compresses common resolver material. Transient /proxy URLs are
# deliberately not the synchronized identity when a resolver exists.
# ---------------------------------------------------------------------------
start = s.index("        function compactPlaylist(playlist, fallbackTorrentLink) {")
end = s.index("        function sanitizeRecord(data) {", start)

compact_block = r'''        function packResolverUrls(packed) {
            var resolverItems = packed.items.filter(function (item) {
                return item && Object.prototype.hasOwnProperty.call(item, 'r');
            });
            if (resolverItems.length < 2) return;

            var urls = resolverItems.map(function (item) { return String(item.r || ''); });
            var rawSize = urls.reduce(function (sum, value) { return sum + value.length; }, 0);

            // Best case for Lampac: same endpoint, same common query, only episode
            // parameters differ. Store the endpoint/common query once.
            try {
                var parsed = urls.map(function (url) { return new URL(url, location.href); });
                var base = parsed[0].origin + parsed[0].pathname;
                var sameBase = parsed.every(function (url) {
                    return url.origin + url.pathname === base;
                });

                if (sameBase) {
                    var common = [];
                    parsed[0].searchParams.forEach(function (value, key) {
                        var allSame = parsed.every(function (url) {
                            var values = url.searchParams.getAll(key);
                            return values.length === 1 && values[0] === value;
                        });
                        if (allSame) common.push([key, value]);
                    });

                    var commonQuery = new URLSearchParams();
                    common.forEach(function (pair) { commonQuery.append(pair[0], pair[1]); });

                    var diffs = parsed.map(function (url) {
                        var diff = new URLSearchParams();
                        url.searchParams.forEach(function (value, key) {
                            var isCommon = common.some(function (pair) {
                                return pair[0] === key && pair[1] === value;
                            });
                            if (!isCommon) diff.append(key, value);
                        });
                        return diff.toString() + (url.hash || '');
                    });

                    var packedSize = base.length + commonQuery.toString().length +
                        diffs.reduce(function (sum, value) { return sum + value.length; }, 0) + 24;

                    if (packedSize + 16 < rawSize) {
                        packed.rm = 'q';
                        packed.ro = base;
                        packed.rc = commonQuery.toString();
                        resolverItems.forEach(function (item, index) {
                            item.r = diffs[index];
                        });
                        return;
                    }
                }
            } catch (e) {}

            var prefix = urls[0] || '';
            for (var i = 1; i < urls.length && prefix; i++) {
                var current = urls[i];
                var max = Math.min(prefix.length, current.length);
                var j = 0;
                while (j < max && prefix.charAt(j) === current.charAt(j)) j += 1;
                prefix = prefix.slice(0, j);
            }

            if (prefix.length >= 32) {
                packed.rm = 'p';
                packed.rb = prefix;
                resolverItems.forEach(function (item) {
                    item.r = String(item.r || '').slice(prefix.length);
                });
            }
        }

        function unpackResolverUrl(item, packed) {
            item = item || {};
            packed = packed || {};
            if (!Object.prototype.hasOwnProperty.call(item, 'r')) return '';

            if (packed.rm === 'q' && packed.ro) {
                try {
                    var url = new URL(String(packed.ro), location.href);
                    var common = new URLSearchParams(String(packed.rc || ''));
                    common.forEach(function (value, key) { url.searchParams.append(key, value); });

                    var diffRaw = String(item.r || '');
                    var hashAt = diffRaw.indexOf('#');
                    var diffQuery = hashAt >= 0 ? diffRaw.slice(0, hashAt) : diffRaw;
                    var hash = hashAt >= 0 ? diffRaw.slice(hashAt) : '';
                    var diff = new URLSearchParams(diffQuery);
                    diff.forEach(function (value, key) { url.searchParams.append(key, value); });
                    if (hash) url.hash = hash;
                    return url.toString();
                } catch (e) {}
            }

            if (packed.rm === 'p') return String(packed.rb || '') + String(item.r || '');
            return String(item.r || '');
        }

        function compactPlaylist(playlist, fallbackTorrentLink) {
            if (!Array.isArray(playlist) || !playlist.length) return null;

            var commonLink = String(fallbackTorrentLink || '');
            var items = [];

            playlist.forEach(function (item, index) {
                item = item || {};
                var rawUrl = item.url || item.uri || item.src || '';
                var url = typeof rawUrl === 'string' ? Utils.stripFragment(rawUrl) : '';
                var parsed = Utils.parseStreamUrl(url);
                if (!commonLink && parsed && parsed.torrent_link) commonLink = parsed.torrent_link;

                var compact = {
                    i: item.file_index !== undefined && item.file_index !== null
                        ? Number(item.file_index)
                        : (parsed && parsed.file_index !== undefined ? Number(parsed.file_index) : index),
                    s: Number(item.season || item.season_number || item.s || 0),
                    e: Number(item.episode || item.episode_number || item.e || 0)
                };

                var fileName = item.file_name || item.filename || item.path || (parsed && parsed.file_name) || '';
                var title = item.title || item.name || item.label || '';
                var hash = item.timeline && item.timeline.hash && String(item.timeline.hash) !== '0'
                    ? String(item.timeline.hash)
                    : '';
                var resolverUrl = item.online_resolver_url
                    ? OnlineResolverCapture.portableResolverUrl(item.online_resolver_url)
                    : '';

                if (fileName) compact.f = String(fileName).slice(0, 220);
                if (title) compact.t = String(title).slice(0, 96);
                if (hash) compact.h = hash;
                if (resolverUrl) compact.r = resolverUrl;

                // Once a stable resolver is known, a short-lived Lampac /proxy URL is
                // not useful after synchronization. Stable direct/stream URLs remain.
                if (!parsed && url && !(resolverUrl && OnlineResolverCapture.isTransientMediaUrl(url))) {
                    compact.u = url;
                }

                items.push(compact);
            });

            var packed = { v: 2, link: commonLink, items: items };
            packResolverUrls(packed);
            var json = Utils.safeJson(packed);

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) { delete item.t; });
                json = Utils.safeJson(packed);
            }

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) { delete item.h; });
                json = Utils.safeJson(packed);
            }

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) {
                    if (Object.prototype.hasOwnProperty.call(item, 'r')) delete item.u;
                });
                json = Utils.safeJson(packed);
            }

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) {
                    if (Object.prototype.hasOwnProperty.call(item, 'r')) delete item.f;
                });
                json = Utils.safeJson(packed);
            }

            if (json.length > CONFIG.syncPlaylistMaxChars) {
                items.forEach(function (item) {
                    if (item.f) item.f = String(item.f).slice(0, 120);
                });
            }

            return packed;
        }

        function expandCompactPlaylist(params) {
            params = params || {};
            var packed = params.playlist_compact;
            if (!packed || !Array.isArray(packed.items)) return [];

            var commonLink = String(packed.link || params.torrent_link || '');

            return packed.items.map(function (item, index) {
                item = item || {};
                var url = String(item.u || '');

                if (!url && item.f && commonLink) {
                    url = buildStreamUrl({
                        file_name: item.f,
                        torrent_link: commonLink,
                        file_index: item.i !== undefined ? Number(item.i) : index
                    }) || '';
                }

                var season = Number(item.s || 0);
                var episode = Number(item.e || 0);
                var hash = String(item.h || '') || generateTimelineHash(params, season, episode);
                var title = item.t || (episode ? String(episode) : '');
                var resolverUrl = unpackResolverUrl(item, packed);

                return {
                    url: url,
                    uri: url,
                    src: url,
                    title: title,
                    name: title,
                    filename: item.f || '',
                    file_name: item.f || '',
                    file_index: item.i !== undefined ? Number(item.i) : index,
                    playlist_index: index,
                    season: season,
                    episode: episode,
                    torrent_hash: params.torrent_hash || '',
                    online_resolver_url: resolverUrl,
                    online_resolver_headers: null,
                    online_resolver_at: Number(params.online_resolver_at || 0),
                    timeline: hash ? { hash: hash, time: 0, duration: 0, percent: 0 } : undefined
                };
            });
        }

'''

s = s[:start] + compact_block + s[end:]

# sanitizeRecord: remove duplicate top-level active resolver and stale proxy URL
old = '''            if (!out.url && out.playlist_compact && Array.isArray(out.playlist_compact.items)) {
                var compactIndex = Number(data.playlist_index || 0);
                if (compactIndex < 0) compactIndex = 0;
                if (compactIndex >= out.playlist_compact.items.length) compactIndex = out.playlist_compact.items.length - 1;
                var compactActive = out.playlist_compact.items[compactIndex];
                if (compactActive && compactActive.u) out.url = Utils.stripFragment(compactActive.u);
            }

            // Duplicated values make one synchronized object unnecessarily large.
'''
new = '''            var compactActive = null;
            var compactResolver = '';
            if (out.playlist_compact && Array.isArray(out.playlist_compact.items)) {
                var compactIndex = Number(data.playlist_index || 0);
                if (compactIndex < 0) compactIndex = 0;
                if (compactIndex >= out.playlist_compact.items.length) compactIndex = out.playlist_compact.items.length - 1;
                compactActive = out.playlist_compact.items[compactIndex];
                compactResolver = compactActive ? unpackResolverUrl(compactActive, out.playlist_compact) : '';
                if (!out.url && compactActive && compactActive.u) out.url = Utils.stripFragment(compactActive.u);
            }

            if (compactResolver) {
                if (
                    out.online_resolver_url &&
                    OnlineResolverCapture.portableResolverUrl(out.online_resolver_url) ===
                        OnlineResolverCapture.portableResolverUrl(compactResolver)
                ) {
                    delete out.online_resolver_url;
                    delete out.online_resolver_headers;
                    delete out.online_resolver_at;
                }

                if (out.isonline && out.url && OnlineResolverCapture.isTransientMediaUrl(out.url)) {
                    delete out.url;
                }
            }

            // Duplicated values make one synchronized object unnecessarily large.
'''
replace_once(old, new, 'sanitize active resolver')

old = '''            if (Utils.safeJson(out).length > CONFIG.syncRecordMaxChars) {
                delete out.img;
                if (out.episode_title && String(out.episode_title).length > 80) {
'''
new = '''            if (Utils.safeJson(out).length > CONFIG.syncRecordMaxChars) {
                delete out.online_context;
                delete out.online_resolver_headers;
                delete out.online_resolver_at;
                delete out.img;
                if (out.episode_title && String(out.episode_title).length > 80) {
'''
replace_once(old, new, 'sanitize oversize metadata')

# normalizePlaylist: never persist a lazy function as a URL
replace_once(
    "                var url = item.url || item.uri || item.src || '';\n                var parsed = Utils.parseStreamUrl(url);",
    "                var rawUrl = item.url || item.uri || item.src || '';\n                var url = typeof rawUrl === 'string' ? rawUrl : '';\n                var parsed = Utils.parseStreamUrl(url);",
    'normalize playlist url type'
)

# buildFromPlayData: enrich normalized playlist with S/E resolver map
replace_once(
    "            var playlist = normalizePlaylist(options.playlist || data.playlist || []);\n            var playlistIndex = inferPlaylistIndex(data, playlist, url);",
    "            var playlist = normalizePlaylist(options.playlist || data.playlist || []);\n            if (data.isonline && playlist.length) OnlineResolverCapture.enrichPlaylist(movie, playlist);\n            var playlistIndex = inferPlaylistIndex(data, playlist, url);",
    'build session enrich playlist'
)

old = '''                onlineResolver: data.online_resolver_url
                    ? {
                        url: String(data.online_resolver_url || ''),
                        headers: data.online_resolver_headers || {},
                        capturedAt: Number(data.online_resolver_at || Utils.now())
                    }
                    : (data.isonline ? OnlineResolverCapture.lookup(url) : null),
'''
new = '''                onlineResolver: data.online_resolver_url
                    ? {
                        url: OnlineResolverCapture.portableResolverUrl(data.online_resolver_url || ''),
                        headers: data.online_resolver_headers || {},
                        capturedAt: Number(data.online_resolver_at || Utils.now())
                    }
                    : (data.isonline
                        ? (OnlineResolverCapture.lookup(url) || OnlineResolverCapture.lookupEpisode(movie, item || data))
                        : null),
'''
replace_once(old, new, 'build session active resolver')

old = '''            if (currentSession.isOnline) {
                var resolverFromPayload = payload.online_resolver_url
                    ? {
                        url: String(payload.online_resolver_url || ''),
                        headers: payload.online_resolver_headers || {},
                        capturedAt: Number(payload.online_resolver_at || Utils.now())
                    }
                    : OnlineResolverCapture.lookup(url);
                if (resolverFromPayload) currentSession.onlineResolver = resolverFromPayload;
            }
'''
new = '''            if (currentSession.isOnline) {
                var resolverFromPayload = payload.online_resolver_url
                    ? {
                        url: OnlineResolverCapture.portableResolverUrl(payload.online_resolver_url || ''),
                        headers: payload.online_resolver_headers || {},
                        capturedAt: Number(payload.online_resolver_at || Utils.now())
                    }
                    : (item && item.online_resolver_url
                        ? {
                            url: OnlineResolverCapture.portableResolverUrl(item.online_resolver_url || ''),
                            headers: item.online_resolver_headers || {},
                            capturedAt: Number(item.online_resolver_at || Utils.now())
                        }
                        : (OnlineResolverCapture.lookup(url) ||
                            OnlineResolverCapture.lookupEpisode(currentSession.movie, item || payload)));
                if (resolverFromPayload) currentSession.onlineResolver = resolverFromPayload;
            }
'''
replace_once(old, new, 'playlist switch resolver')

# Player.patch: attach per-episode resolvers before SessionManager normalizes the playlist
old = '''                    if (data.isonline) {
                        var mediaForResolver = data.url || data.uri || data.src || '';
                        var resolverMeta = OnlineResolverCapture.lookup(mediaForResolver);
                        if (resolverMeta) {
                            data.online_resolver_url = resolverMeta.url;
                            data.online_resolver_headers = resolverMeta.headers || {};
                            data.online_resolver_at = Number(resolverMeta.capturedAt || Utils.now());
                        }
                    }
'''
new = '''                    if (data.isonline) {
                        var movieForResolver = data.card || data.movie || Utils.getActivityMovie() || {};
                        if (Array.isArray(data.playlist) && data.playlist.length) {
                            OnlineResolverCapture.enrichPlaylist(movieForResolver, data.playlist);
                        }

                        var mediaForResolver = data.url || data.uri || data.src || '';
                        var resolverMeta = OnlineResolverCapture.lookup(mediaForResolver) ||
                            OnlineResolverCapture.lookupEpisode(movieForResolver, data);
                        if (resolverMeta) {
                            data.online_resolver_url = resolverMeta.url;
                            data.online_resolver_headers = resolverMeta.headers || {};
                            data.online_resolver_at = Number(resolverMeta.capturedAt || Utils.now());
                        }
                    }
'''
replace_once(old, new, 'player patch resolver enrichment')

# Avoid functions reaching URL parsing when an unsanitized old in-memory playlist is used.
replace_once(
    "                var url = clone.url || clone.uri || clone.src || '';\n\n                if (url) {",
    "                var url = clone.url || clone.uri || clone.src || '';\n                if (typeof url !== 'string') url = '';\n\n                if (url) {",
    'rebuild playlist url type'
)

# Replace launchFromContinue and add lazy resolution for every synchronized online item.
start = s.index("        function launchFromContinue(movie, params) {")
end = s.index("\n\n        return {\n            patchPlayer: patchPlayer,", start)

launch_block = r'''        function applyResolvedToPlaylistItem(item, resolved) {
            if (!item || !resolved || !resolved.url) return false;
            var freshUrl = Utils.stripFragment(resolved.url);
            item.url = freshUrl;
            item.uri = freshUrl;
            item.src = freshUrl;
            if (resolved.headers && Object.keys(resolved.headers).length) item.headers = resolved.headers;
            if (resolved.quality) item.quality = resolved.quality;
            if (resolved.segments) item.segments = resolved.segments;
            if (resolved.subtitles) item.subtitles = resolved.subtitles;
            if (resolved.subtitles_call) item.subtitles_call = resolved.subtitles_call;
            if (resolved.hls_manifest_timeout !== undefined) item.hls_manifest_timeout = resolved.hls_manifest_timeout;
            item.online_resolver_url = resolved.resolver_url || item.online_resolver_url || '';
            item.online_resolver_headers = resolved.resolver_headers || item.online_resolver_headers || {};
            item.online_resolver_at = Utils.now();
            return true;
        }

        function attachLazyOnlineResolvers(playlist, activeIndex) {
            if (!Array.isArray(playlist) || !playlist.length) return;

            var playerType = '';
            try { playerType = String(Lampa.Storage.field('player') || ''); } catch (e) {}
            if (playerType && playerType !== 'inner') return;

            playlist.forEach(function (item, index) {
                if (!item || index === activeIndex || !item.online_resolver_url) return;

                var resolverUrl = OnlineResolverCapture.portableResolverUrl(item.online_resolver_url);
                var resolverHeaders = item.online_resolver_headers || {};
                var oldUrl = typeof item.url === 'string' ? Utils.stripFragment(item.url) : '';
                if (OnlineResolverCapture.isTransientMediaUrl(oldUrl)) oldUrl = '';

                (function (target, portableResolver, headers, fallbackUrl) {
                    target.url = function (call) {
                        OnlineResolverCapture.resolve({
                            online_resolver_url: portableResolver,
                            online_resolver_headers: headers
                        }, function (resolved) {
                            if (!applyResolvedToPlaylistItem(target, resolved)) {
                                target.url = fallbackUrl || '';
                                target.uri = target.url;
                                target.src = target.url;
                            }
                            if (typeof call === 'function') call();
                        });
                    };
                    target.uri = '';
                    target.src = '';
                })(item, resolverUrl, resolverHeaders, oldUrl);
            });
        }

        function launchFromContinue(movie, params) {
            if (!movie || !params) return;
            if (!acquireLaunchLock(movie, params)) return;

            var playlist = rebuildPlaylistForLaunch(params);
            var playlistIndex = Number(params.playlist_index || 0);

            if (playlist && playlist.length) {
                if (isNaN(playlistIndex) || playlistIndex < 0) playlistIndex = 0;
                if (playlistIndex >= playlist.length) playlistIndex = playlist.length - 1;
            } else {
                playlistIndex = 0;
            }

            var activeItem = playlist && playlist.length ? playlist[playlistIndex] : null;
            var rawActiveUrl = activeItem ? (activeItem.url || activeItem.uri || activeItem.src || '') : '';
            var url = typeof rawActiveUrl === 'string' ? Utils.stripFragment(rawActiveUrl) : '';
            if (!url) url = StorageManager.buildLaunchUrl(params);

            var activeResolverUrl = OnlineResolverCapture.portableResolverUrl(
                params.online_resolver_url ||
                (activeItem && activeItem.online_resolver_url) ||
                ''
            );
            var activeResolverHeaders = params.online_resolver_headers ||
                (activeItem && activeItem.online_resolver_headers) || {};

            if (!url && !(params.isonline && activeResolverUrl)) {
                try { Lampa.Noty.show('Не удалось восстановить ссылку просмотра'); } catch (e) {}
                return;
            }

            var season = Number(params.season || 0);
            var episode = Number(params.episode || 0);
            var hash = String(params.timeline_hash || '') || StorageManager.generateTimelineHash(movie, season, episode);
            var timeline = null;

            try {
                timeline = hash && Lampa.Timeline && Lampa.Timeline.view ? Lampa.Timeline.view(hash) : null;
            } catch (e2) {}

            var resumeTime = Math.max(Number(params.time || params.position || 0), Number(timeline && timeline.time || 0));
            var resumeDuration = Math.max(Number(params.duration || 0), Number(timeline && timeline.duration || 0));
            var resumePercent = Math.max(Number(params.percent || 0), Number(timeline && timeline.percent || 0));

            if (!resumePercent && resumeTime > 0 && resumeDuration > 0) {
                resumePercent = Math.round(resumeTime / resumeDuration * 100);
            }

            resumePercent = Utils.clamp(resumePercent, 0, 100);

            if (!timeline || typeof timeline !== 'object') timeline = {};
            timeline.hash = hash;
            timeline.time = resumeTime;
            timeline.duration = resumeDuration;
            timeline.percent = resumePercent;

            var activeImage = Utils.extractImage(activeItem) || Utils.extractImage(params) || Utils.extractImage(movie);
            var parsedLaunch = Utils.parseStreamUrl(url);
            var torrentHash = String(
                params.torrent_hash ||
                Utils.extractTorrentHash(params.torrent_link) ||
                Utils.extractTorrentHash(parsedLaunch && parsedLaunch.torrent_link) ||
                ''
            );
            var compactTorrentLink = params.playlist_compact && params.playlist_compact.link
                ? String(params.playlist_compact.link)
                : '';
            var isTorrentResume = !!(
                params.torrent_hash || params.torrent_link || compactTorrentLink || parsedLaunch
            );

            if (!torrentHash && isTorrentResume) torrentHash = 'continue_watch_external';

            var data = {
                url: url,
                uri: url,
                src: url,
                title: params.episode_title || params.title || Utils.getMovieTitle(movie),
                card: movie,
                movie: movie,
                timeline: timeline,
                time: resumeTime,
                position: resumeTime > 0 ? resumeTime : -1,
                duration: resumeDuration,
                percent: resumePercent,
                playlist: playlist,
                playlist_index: playlistIndex,
                start_index: playlistIndex,
                season: season,
                episode: episode,
                torrent_hash: torrentHash,
                isonline: !!params.isonline,
                continue_watch_universal: true
            };

            if (activeItem) data.currentItem = activeItem;
            if (activeImage) Utils.copyImageFields(data, activeImage);

            function startPlayback(resolved) {
                if (resolved && resolved.url) {
                    var freshUrl = Utils.stripFragment(resolved.url);
                    data.url = freshUrl;
                    data.uri = freshUrl;
                    data.src = freshUrl;

                    if (activeItem) applyResolvedToPlaylistItem(activeItem, resolved);

                    if (resolved.headers && Object.keys(resolved.headers).length) data.headers = resolved.headers;
                    if (resolved.quality) data.quality = resolved.quality;
                    if (resolved.segments) data.segments = resolved.segments;
                    if (resolved.subtitles) data.subtitles = resolved.subtitles;
                    if (resolved.subtitles_call) data.subtitles_call = resolved.subtitles_call;
                    if (resolved.hls_manifest_timeout !== undefined) data.hls_manifest_timeout = resolved.hls_manifest_timeout;

                    data.online_resolver_url = resolved.resolver_url || activeResolverUrl || '';
                    data.online_resolver_headers = resolved.resolver_headers || activeResolverHeaders || {};
                    data.online_resolver_at = Utils.now();
                } else if (
                    params.isonline && activeResolverUrl &&
                    (!url || OnlineResolverCapture.isTransientMediaUrl(url))
                ) {
                    try { Lampa.Noty.show('Не удалось получить свежую ссылку серии'); } catch (e4) {}
                    return;
                }

                if (params.isonline && playlist && playlist.length) {
                    attachLazyOnlineResolvers(playlist, playlistIndex);
                }

                try {
                    Lampa.Player.play(data);
                } catch (e3) {
                    Utils.error('Launch from continue failed', e3);
                }
            }

            if (params.isonline && activeResolverUrl) {
                OnlineResolverCapture.resolve({
                    online_resolver_url: activeResolverUrl,
                    online_resolver_headers: activeResolverHeaders
                }, function (resolved) {
                    startPlayback(resolved);
                });
                return;
            }

            startPlayback(null);
        }
'''

s = s[:start] + launch_block + s[end:]

# Update ready marker wording for diagnostics.
s = s.replace(
    "rememberBootStatus('ready', 'timeline-direct online + Just+ native return initialized');",
    "rememberBootStatus('ready', 'timeline + per-episode online resolvers + Just+ native return initialized');"
)

PATH.write_text(s, encoding='utf-8')
print('patched', len(s))
