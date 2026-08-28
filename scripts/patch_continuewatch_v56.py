from pathlib import Path
import re

PATH = Path('ContinueWatching.js')
s = PATH.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    s = s.replace(old, new, 1)


def insert_before(anchor, addition, label):
    global s
    count = s.count(anchor)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, got {count}')
    s = s.replace(anchor, addition + anchor, 1)


replace_once(
    "var BOOT_VERSION = 'v5.5.0-online-resume-url-routing-20260828';",
    "var BOOT_VERSION = 'v5.6.0-online-reresolve-20260828';",
    'version'
)

replace_once(
    "        syncRecordMaxChars: 9000,\n        syncPlaylistMaxChars: 6000,\n\n        launchLockMs: 3000",
    "        syncRecordMaxChars: 9000,\n        syncPlaylistMaxChars: 6000,\n\n        onlineResolveEnabled: true,\n        onlineResolveTimeoutMs: 20000,\n        onlineResolvePollMs: 250,\n\n        launchLockMs: 3000",
    'online config'
)

# Capture only a tiny serializable slice of the online activity. Direct stream URLs
# are deliberately not enough for online resume because many HLS links expire.
insert_before(
    "        function rememberActivityMovie(movie) {",
    r'''        function captureOnlineContext(data, movie) {
            data = data || {};
            if (!data.isonline) return null;

            var active = null;
            try {
                active = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
            } catch (e) {}

            active = active || {};
            movie = movie || data.card || data.movie || {};

            var context = {
                component: String(active.component || ''),
                url: String(active.url || ''),
                title: String(active.title || ''),
                search: String(active.search || ''),
                search_one: String(active.search_one || ''),
                search_two: String(active.search_two || ''),
                clarification: !!active.clarification,
                similar: active.similar !== false,
                balanser: String(active.balanser || ''),
                page: Number(active.page || 1)
            };

            if (!context.search) context.search = String(movie.title || movie.name || '');
            if (!context.search_one) context.search_one = String(movie.title || movie.name || '');
            if (!context.search_two) context.search_two = String(movie.original_title || movie.original_name || '');

            return context.component ? context : null;
        }

''',
    'capture online context'
)

replace_once(
    "            rememberActivityMovie: rememberActivityMovie\n",
    "            rememberActivityMovie: rememberActivityMovie,\n            captureOnlineContext: captureOnlineContext\n",
    'export online context'
)

replace_once(
    "                profile_id: StorageManager.getProfileId() !== null ? StorageManager.getProfileId() : 'guest',\n                url: Utils.stripFragment(session.url || ''),",
    "                profile_id: StorageManager.getProfileId() !== null ? StorageManager.getProfileId() : 'guest',\n                isonline: !!session.isOnline,\n                online_context: session.onlineContext || null,\n                url: Utils.stripFragment(session.url || ''),",
    'persist online flags'
)

replace_once(
    "                torrentHash: String(data.torrent_hash || (item && item.torrent_hash) || ''),\n                lastRoad: null,",
    "                torrentHash: String(data.torrent_hash || (item && item.torrent_hash) || ''),\n                isOnline: !!data.isonline,\n                onlineContext: Utils.captureOnlineContext(data, movie),\n                lastRoad: null,",
    'session online fields'
)

# Fresh online resolver. It reopens the original online component, waits for the
# canonical episode element, then triggers the source's own hover:enter handler.
# That handler resolves a brand-new stream URL before Player.play is called.
online_transport = r'''    // ============================================================
    // OnlineResolverTransport
    // ============================================================

    var OnlineResolverTransport = (function () {
        var pending = null;
        var timer = null;
        var lastStatus = '';

        function shouldResolve(params) {
            return !!(
                CONFIG.onlineResolveEnabled &&
                params &&
                (params.isonline || (params.online_context && params.online_context.component))
            );
        }

        function stopTimer() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }

        function buildActivity(movie, params) {
            var context = params && params.online_context || {};
            if (!context.component) return null;

            var activity = {
                url: context.url || '',
                title: context.title || '',
                component: context.component,
                movie: movie,
                page: Number(context.page || 1),
                search: context.search || movie.title || movie.name || '',
                search_one: context.search_one || movie.title || movie.name || '',
                search_two: context.search_two || movie.original_title || movie.original_name || '',
                similar: context.similar !== false
            };

            if (context.clarification) activity.clarification = true;
            if (context.balanser) activity.balanser = context.balanser;
            return activity;
        }

        function sameHash(line, hash) {
            return String(line.attr('data-hash') || '') === String(hash || '');
        }

        function targetByHash(hash) {
            if (!hash) return null;
            var found = null;

            try {
                $('.time-line[data-hash]').each(function () {
                    var line = $(this);
                    if (!sameHash(line, hash)) return;
                    var origin = line.closest('.selector');
                    if (origin && origin.length) found = origin;
                });
            } catch (e) {}

            return found && found.length ? found : null;
        }

        function targetByEpisode(season, episode) {
            episode = Number(episode || 0);
            season = Number(season || 0);
            if (!episode) return null;

            var found = null;
            var epRe = new RegExp('(?:^|\\D)0?' + episode + '(?:\\D|$)');
            var seasonRe = season ? new RegExp('(?:сезон|season|s)\\s*[-.:]?\\s*0?' + season, 'i') : null;

            try {
                $('.selector').each(function () {
                    if (found) return;
                    var node = $(this);
                    var text = String(node.text() || '').replace(/\\s+/g, ' ').trim();
                    if (!text) return;
                    if (!/(эпизод|сер(?:ия|ии)?|episode|ep\\.?)/i.test(text)) return;
                    if (!epRe.test(text)) return;
                    if (seasonRe && /(сезон|season|\\bs\\s*\\d)/i.test(text) && !seasonRe.test(text)) return;
                    found = node;
                });
            } catch (e) {}

            return found && found.length ? found : null;
        }

        function triggerTarget() {
            if (!pending) return false;

            var target = targetByHash(pending.hash) || targetByEpisode(pending.season, pending.episode);
            if (!target) return false;

            try {
                target.trigger('hover:enter');
                lastStatus = 'triggered';
                stopTimer();
                return true;
            } catch (e) {
                return false;
            }
        }

        function launch(movie, params) {
            if (!shouldResolve(params)) return false;

            var activity = buildActivity(movie, params);
            if (!activity) return false;

            var hash = String(params.timeline_hash || '') || StorageManager.generateTimelineHash(
                movie,
                Number(params.season || 0),
                Number(params.episode || 0)
            );

            pending = {
                card_key: StorageManager.getMovieKey(movie) || '',
                hash: hash,
                season: Number(params.season || 0),
                episode: Number(params.episode || 0),
                time: Number(params.time || params.position || 0),
                duration: Number(params.duration || 0),
                percent: Number(params.percent || 0),
                started_at: Utils.now()
            };

            lastStatus = 'opening_component';
            stopTimer();

            try {
                Lampa.Activity.push(activity);
            } catch (e) {
                pending = null;
                lastStatus = 'activity_push_failed';
                return false;
            }

            timer = setInterval(function () {
                if (!pending) return stopTimer();

                if (Utils.now() - Number(pending.started_at || 0) > CONFIG.onlineResolveTimeoutMs) {
                    lastStatus = 'timeout';
                    stopTimer();
                    try {
                        Lampa.Noty.show('Не удалось получить свежую ссылку. Выберите серию в источнике.');
                    } catch (e) {}
                    return;
                }

                triggerTarget();
            }, CONFIG.onlineResolvePollMs);

            setTimeout(triggerTarget, 50);
            return true;
        }

        function preparePlayData(data) {
            if (!pending || !data || !data.isonline) return data;

            var explicit = Utils.extractExplicitSE(data) || {};
            var incomingHash = String(data.timeline && data.timeline.hash || '');
            var hashMatch = pending.hash && incomingHash && String(pending.hash) === incomingHash;
            var episodeMatch = Number(explicit.episode || 0) === Number(pending.episode || 0) &&
                (!pending.season || !explicit.season || Number(explicit.season) === Number(pending.season));

            if (!hashMatch && !episodeMatch) return data;

            data.timeline = data.timeline || {};
            data.timeline.hash = incomingHash || pending.hash;
            data.timeline.time = Number(pending.time || 0);
            data.timeline.duration = Number(pending.duration || data.timeline.duration || 0);
            data.timeline.percent = Number(pending.percent || data.timeline.percent || 0);
            data.time = Number(pending.time || 0);
            data.position = Number(pending.time || 0) > 0 ? Number(pending.time) : -1;
            if (pending.duration) data.duration = Number(pending.duration);
            if (pending.percent) data.percent = Number(pending.percent);
            data.continue_watch_online_resolved = true;

            lastStatus = 'fresh_url_received';
            pending = null;
            stopTimer();
            return data;
        }

        function getStatus() {
            return {
                status: lastStatus,
                pending: pending
            };
        }

        return {
            shouldResolve: shouldResolve,
            launch: launch,
            preparePlayData: preparePlayData,
            getStatus: getStatus
        };
    })();

'''

insert_before(
    "    // ============================================================\n    // LampaNativeTransport",
    online_transport,
    'online resolver transport'
)

replace_once(
    "                try {\n                    data = data || {};\n\n                    var transport = JustPlusTransport.matches() ? 'just' : 'lampa';",
    "                try {\n                    data = data || {};\n                    data = OnlineResolverTransport.preparePlayData(data) || data;\n\n                    var transport = JustPlusTransport.matches() ? 'just' : 'lampa';",
    'prepare fresh online play'
)

replace_once(
    "        function launchFromContinue(movie, params) {\n            if (!movie || !params) return;\n            if (!acquireLaunchLock(movie, params)) return;\n\n            var playlist = rebuildPlaylistForLaunch(params);",
    "        function launchFromContinue(movie, params) {\n            if (!movie || !params) return;\n            if (!acquireLaunchLock(movie, params)) return;\n\n            if (OnlineResolverTransport.shouldResolve(params)) {\n                if (OnlineResolverTransport.launch(movie, params)) return;\n            }\n\n            var playlist = rebuildPlaylistForLaunch(params);",
    'route online through resolver'
)

# Expose transport status for debugging without logs.
replace_once(
    "                just: JustPlusTransport.getStatus,\n                lampa: LampaNativeTransport.getStatus",
    "                just: JustPlusTransport.getStatus,\n                online: OnlineResolverTransport.getStatus,\n                lampa: LampaNativeTransport.getStatus",
    'expose online status'
)

replace_once(
    "rememberBootStatus('ready', 'strict card identity + profile isolated sync initialized');",
    "rememberBootStatus('ready', 'online fresh resolver + strict identity initialized');",
    'ready status'
)

PATH.write_text(s, encoding='utf-8')
print('patched', len(s))
