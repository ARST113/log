(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__CONTINUE_WATCH_DDD_INTEGRATED_LOADER__) return;
    window.__CONTINUE_WATCH_DDD_INTEGRATED_LOADER__ = true;

    var CORE_URL = 'https://cdn.jsdelivr.net/gh/ARST113/log@92e23a3e333162ec24dcf52ff6159304354976a1/Debuger.js';
    var FIX_VERSION = 'series-meta-pointer-ui-v3';
    var pendingRefreshTimer = null;

    function log() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[ContinueWatchDDD]');
            console.log.apply(console, args);
        } catch (e) {}
    }

    function warn() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[ContinueWatchDDD WARN]');
            console.warn.apply(console, args);
        } catch (e) {}
    }

    function noty(message, level) {
        try {
            if (window.Lampa && Lampa.Noty && Lampa.Noty.show && (level === undefined || level <= 2)) {
                Lampa.Noty.show('[DDD] ' + message);
            }
        } catch (e) {}
    }

    function now() {
        return Date.now ? Date.now() : new Date().getTime();
    }

    function toInt(value) {
        if (value === undefined || value === null || value === '') return 0;
        var n = Number(value);
        if (!isFinite(n)) return 0;
        return Math.floor(n);
    }

    function firstInt(obj, keys) {
        if (!obj || typeof obj !== 'object') return 0;
        for (var i = 0; i < keys.length; i++) {
            var value = obj[keys[i]];
            if (value !== undefined && value !== null && value !== '') {
                var n = toInt(value);
                if (n > 0) return n;
            }
        }
        return 0;
    }

    function firstText(obj, keys) {
        if (!obj || typeof obj !== 'object') return '';
        for (var i = 0; i < keys.length; i++) {
            var value = obj[keys[i]];
            if (typeof value === 'string' && value.trim()) return value.trim();
        }
        return '';
    }

    function stripFragment(url) {
        if (typeof url !== 'string') return url;
        var p = url.indexOf('#');
        return p >= 0 ? url.substring(0, p) : url;
    }

    function safeDecode(value) {
        try { return decodeURIComponent(value); } catch (e) { return value; }
    }

    function parseStreamUrl(url) {
        if (!url || typeof url !== 'string') return null;
        url = stripFragment(url);
        var fileMatch = url.match(/\/stream\/([^?]+)/);
        var linkMatch = url.match(/[?&]link=([^&#]+)/);
        var indexMatch = url.match(/[?&]index=(\d+)/);
        if (!fileMatch || !linkMatch) return null;
        return {
            file_name: safeDecode(fileMatch[1]),
            torrent_link: safeDecode(linkMatch[1]),
            file_index: indexMatch ? parseInt(indexMatch[1], 10) : 0
        };
    }

    function streamIdentity(url) {
        var parsed = parseStreamUrl(url);
        if (!parsed) return stripFragment(url || '');
        return [
            parsed.torrent_link || '',
            parsed.file_index !== undefined ? parsed.file_index : '',
            parsed.file_name || ''
        ].join('|');
    }

    function parseText(text) {
        if (!text || typeof text !== 'string') return null;
        var m;

        m = text.match(/S(?:eason)?\s*0?(\d{1,2})\s*[\.\-_: ]*\s*E(?:p(?:isode)?)?\s*0?(\d{1,4})/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0 };

        m = text.match(/(\d{1,2})\s*[xх×]\s*0?(\d{1,4})/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0 };

        m = text.match(/(\d{1,2})\s*сезон.*?(\d{1,4})\s*(?:сер|эпизод)/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0 };

        m = text.match(/сезон\s*[-–—:]?\s*0?(\d{1,2}).*?(?:сер(?:ия|ии|и)?|эпизод)\s*[-–—:]?\s*0?(\d{1,4})/i);
        if (m) return { season: parseInt(m[1], 10) || 0, episode: parseInt(m[2], 10) || 0 };

        m = text.match(/(?:эпизод|сер(?:ия|ии|и)?|episode|ep\.?|сер\.)\s*[-–—:]?\s*0?(\d{1,4})/i);
        if (m) return { season: 0, episode: parseInt(m[1], 10) || 0 };

        m = text.match(/\bE\s*0?(\d{1,4})\b/i);
        if (m) return { season: 0, episode: parseInt(m[1], 10) || 0 };

        return null;
    }

    function readSeriesFields(data) {
        data = data || {};
        var season = firstInt(data, ['season', 'season_number', 'season_num', 'seasonNumber', 'seasonIndex', 's']);
        var episode = firstInt(data, ['episode', 'episode_number', 'episode_num', 'episodeNumber', 'episodeIndex', 'number', 'num', 'e']);

        if (!season || !episode) {
            var fields = [
                data.title,
                data.name,
                data.episode_title,
                data.file_name,
                data.filename,
                data.path,
                data.path_human,
                data.folder_name,
                data.subtitle,
                data.label,
                data.text,
                data.info
            ];

            for (var i = 0; i < fields.length; i++) {
                var parsed = parseText(fields[i]);
                if (!parsed) continue;
                if (!season && parsed.season) season = parsed.season;
                if (!episode && parsed.episode) episode = parsed.episode;
                break;
            }
        }

        if (episode > 0 && !season) season = 1;
        return { season: season || 0, episode: episode || 0 };
    }

    function looksLikeEpisodeItem(item) {
        var text = firstText(item, ['title', 'name', 'episode_title', 'file_name', 'filename', 'path_human', 'path']);
        if (!text) return false;
        return /(эпизод|сер(?:ия|ии|и)?|episode|\bS\d{1,2}\s*E\d{1,4}\b|\b\d{1,2}[xх×]\d{1,4}\b)/i.test(text);
    }

    function findPlaylistIndexByUrl(playlist, url) {
        if (!Array.isArray(playlist) || !url) return -1;
        var cleanTarget = stripFragment(url);
        var targetIdentity = streamIdentity(url);

        for (var i = 0; i < playlist.length; i++) {
            var itemUrl = playlist[i] && playlist[i].url;
            if (!itemUrl) continue;
            if (stripFragment(itemUrl) === cleanTarget) return i;
            if (streamIdentity(itemUrl) === targetIdentity) return i;
        }

        return -1;
    }

    function readSelectedIndex(params, playlist) {
        var fields = ['playlist_index', 'ddd_start_index', 'start_index', 'playlistIndex'];

        for (var i = 0; i < fields.length; i++) {
            var key = fields[i];
            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                var n = toInt(params[key]);
                if (n >= 0 && (!playlist || !playlist.length || n < playlist.length)) return n;
            }
        }

        if (params.url) {
            var byUrl = findPlaylistIndexByUrl(playlist, params.url);
            if (byUrl >= 0) return byUrl;
        }

        return Array.isArray(playlist) && playlist.length ? 0 : -1;
    }

    function isSeriesLike(params) {
        params = params || {};
        if (toInt(params.season) > 0 || toInt(params.episode) > 0) return true;

        var movie = params.card || params.movie || {};
        if (toInt(movie.number_of_seasons) > 0) return true;
        if (String(movie.media_type || movie.type || '').toLowerCase() === 'tv') return true;

        var list = Array.isArray(params.playlist) ? params.playlist : [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i] || {};
            if (toInt(item.season) > 0 || toInt(item.episode) > 0) return true;
            if (toInt(item.season_number) > 0 || toInt(item.episode_number) > 0) return true;
            if (looksLikeEpisodeItem(item)) return true;
        }

        return false;
    }

    function normalizePlaylistItem(item, index, selectedIndex, allowIndexFallback) {
        if (!item || typeof item !== 'object') return false;

        var meta = readSeriesFields(item);
        var changed = false;

        if ((!meta.episode || !meta.season) && allowIndexFallback && (looksLikeEpisodeItem(item) || index === selectedIndex)) {
            if (!meta.episode && index >= 0) {
                meta.episode = index + 1;
                changed = true;
            }
            if (meta.episode && !meta.season) {
                meta.season = 1;
                changed = true;
            }
        }

        if (meta.season > 0 && toInt(item.season) !== meta.season) {
            item.season = meta.season;
            changed = true;
        }
        if (meta.episode > 0 && toInt(item.episode) !== meta.episode) {
            item.episode = meta.episode;
            changed = true;
        }
        if (!item.episode_title) {
            var title = firstText(item, ['episode_title', 'title', 'name']);
            if (title) {
                item.episode_title = title;
                changed = true;
            }
        }

        return changed;
    }

    function normalizeParams(params) {
        if (!params || typeof params !== 'object') return params;

        var playlist = Array.isArray(params.playlist) ? params.playlist : null;
        var selectedIndex = readSelectedIndex(params, playlist);
        var selectedItem = playlist && selectedIndex >= 0 ? playlist[selectedIndex] : null;
        var changed = false;
        var seriesLike = isSeriesLike(params);

        if (playlist) {
            for (var i = 0; i < playlist.length; i++) {
                if (normalizePlaylistItem(playlist[i], i, selectedIndex, true)) changed = true;
            }
        }

        var paramsMeta = readSeriesFields(params);
        var selectedMeta = selectedItem ? readSeriesFields(selectedItem) : { season: 0, episode: 0 };
        var season = paramsMeta.season || selectedMeta.season || 0;
        var episode = paramsMeta.episode || selectedMeta.episode || 0;

        if ((!season || !episode) && selectedIndex >= 0 && (seriesLike || playlist)) {
            if (!episode) episode = selectedIndex + 1;
            if (!season) season = 1;
        }
        if (episode > 0 && !season) season = 1;

        if (season > 0 && toInt(params.season) !== season) {
            params.season = season;
            changed = true;
        }
        if (episode > 0 && toInt(params.episode) !== episode) {
            params.episode = episode;
            changed = true;
        }

        if (playlist && selectedIndex >= 0) {
            if (toInt(params.playlist_index) !== selectedIndex) {
                params.playlist_index = selectedIndex;
                changed = true;
            }
            if (params.ddd_start_index === undefined) params.ddd_start_index = selectedIndex;
            if (params.start_index === undefined) params.start_index = selectedIndex;
        }

        if (selectedItem) {
            var title = firstText(selectedItem, ['episode_title', 'title', 'name']);
            if (title && params.episode_title !== title) {
                params.episode_title = title;
                changed = true;
            }
            if (!params.timeline && selectedItem.timeline) {
                params.timeline = selectedItem.timeline;
                changed = true;
            }
        }

        if (changed) {
            log('series meta normalized', 'S' + (params.season || 0) + 'E' + (params.episode || 0), 'pi=' + (params.playlist_index !== undefined ? params.playlist_index : '-'), params.episode_title || params.title || '');
        }

        return params;
    }

    function getMovieKeyFromData(data) {
        if (!data) return '';
        if (data.movie_key) return data.movie_key;
        if (data.movie_id) return 'id:' + data.movie_id;

        var title = data.original_title || data.title || '';
        try {
            if (title && window.Lampa && Lampa.Utils && Lampa.Utils.hash) return 'title:' + Lampa.Utils.hash(title);
        } catch (e) {}

        return '';
    }

    function normalizeStorageRecord(record, hash) {
        if (!record || typeof record !== 'object') return false;
        if (!record.file_name && !record.torrent_link && !Array.isArray(record.playlist)) return false;

        var beforeSeason = toInt(record.season);
        var beforeEpisode = toInt(record.episode);
        var beforeTitle = record.episode_title || '';
        var beforePi = toInt(record.playlist_index);

        normalizeParams(record);

        if (record.season && record.episode && !record.timestamp) {
            record.timestamp = now();
        }

        var changed =
            beforeSeason !== toInt(record.season) ||
            beforeEpisode !== toInt(record.episode) ||
            beforeTitle !== (record.episode_title || '') ||
            beforePi !== toInt(record.playlist_index);

        if (changed) {
            log('storage record normalized', hash, 'S' + (record.season || 0) + 'E' + (record.episode || 0), 'fi=' + (record.file_index !== undefined ? record.file_index : '-'), 'pi=' + (record.playlist_index !== undefined ? record.playlist_index : '-'));
        }

        return changed;
    }

    function isCandidateRecord(record) {
        return !!(
            record &&
            typeof record === 'object' &&
            record.file_name &&
            record.torrent_link &&
            toInt(record.season) > 0 &&
            toInt(record.episode) > 0
        );
    }

    function isBetterRecord(a, b) {
        if (!b) return true;

        var at = toInt(a.timestamp);
        var bt = toInt(b.timestamp);
        if (at !== bt) return at > bt;

        var as = toInt(a.season);
        var bs = toInt(b.season);
        if (as !== bs) return as > bs;

        return toInt(a.episode) > toInt(b.episode);
    }

    function rebuildLastPointers(value) {
        var best = {};

        Object.keys(value).forEach(function (hash) {
            if (hash === '__last_by_movie') return;

            var record = value[hash];
            if (!isCandidateRecord(record)) return;

            var movieKey = getMovieKeyFromData(record);
            if (!movieKey) return;

            if (isBetterRecord(record, best[movieKey] && best[movieKey].record)) {
                best[movieKey] = {
                    hash: hash,
                    record: record
                };
            }
        });

        var oldPointers = value.__last_by_movie || {};
        var nextPointers = {};
        var changed = false;

        Object.keys(oldPointers).forEach(function (movieKey) {
            if (!best[movieKey]) nextPointers[movieKey] = oldPointers[movieKey];
        });

        Object.keys(best).forEach(function (movieKey) {
            var item = best[movieKey];
            var record = item.record;
            var pointer = {
                hash: item.hash,
                season: toInt(record.season),
                episode: toInt(record.episode),
                timestamp: toInt(record.timestamp) || now()
            };

            var old = oldPointers[movieKey];
            if (
                !old ||
                old.hash !== pointer.hash ||
                toInt(old.season) !== pointer.season ||
                toInt(old.episode) !== pointer.episode ||
                toInt(old.timestamp) !== pointer.timestamp
            ) {
                changed = true;
            }

            nextPointers[movieKey] = pointer;
        });

        value.__last_by_movie = nextPointers;
        return changed;
    }

    function getLatestRecord(value) {
        var latest = null;

        Object.keys(value || {}).forEach(function (hash) {
            if (hash === '__last_by_movie') return;
            var record = value[hash];
            if (!isCandidateRecord(record)) return;
            if (!latest || isBetterRecord(record, latest)) latest = record;
        });

        return latest;
    }

    function buildContinueLabel(record) {
        if (!record) return '';

        var label = 'Продолжить S' + toInt(record.season) + ' E' + toInt(record.episode);
        var title = record.episode_title || record.title || '';

        if (title) label += ' · ' + title;

        return label;
    }

    function patchTextNodes(root, label) {
        if (!root || !label) return false;

        var changed = false;
        var walker;

        try {
            walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        } catch (e) {
            return false;
        }

        var node;
        while ((node = walker.nextNode())) {
            var text = node.nodeValue || '';
            if (text.indexOf('Продолжить S') === -1) continue;

            var replaced = text.replace(/Продолжить\s+S\d+\s+E\d+(?:\s*·\s*[^\n\r]*)?/g, label);
            if (replaced !== text) {
                node.nodeValue = replaced;
                changed = true;
            }
        }

        return changed;
    }

    function scheduleVisibleRefresh(value) {
        var latest = getLatestRecord(value);
        var label = buildContinueLabel(latest);
        if (!label) return;

        if (pendingRefreshTimer) clearTimeout(pendingRefreshTimer);

        pendingRefreshTimer = setTimeout(function () {
            pendingRefreshTimer = null;

            try {
                if (patchTextNodes(document.body, label)) {
                    log('visible continue label refreshed', label);
                }
            } catch (e) {
                warn('visible refresh failed', e);
            }
        }, 120);
    }

    function normalizeStorageMap(value) {
        if (!value || typeof value !== 'object') return value;

        var changed = false;

        Object.keys(value).forEach(function (hash) {
            if (hash === '__last_by_movie') return;
            if (normalizeStorageRecord(value[hash], hash)) changed = true;
        });

        if (rebuildLastPointers(value)) changed = true;

        if (changed) scheduleVisibleRefresh(value);

        return value;
    }

    function isContinueWatchStorageKey(key) {
        return typeof key === 'string' && key.indexOf('continue_watch_params') === 0;
    }

    function installStoragePatch() {
        if (!window.Lampa || !Lampa.Storage || !Lampa.Storage.set) return false;
        if (Lampa.Storage.__ddd_series_storage_patch_v3) return true;

        var originalSet = Lampa.Storage.set;
        Lampa.Storage.set = function (key, value) {
            var shouldPatch = isContinueWatchStorageKey(key);

            try {
                if (shouldPatch) normalizeStorageMap(value);
            } catch (e) {
                warn('storage normalize failed', e);
            }

            var result = originalSet.apply(this, arguments);

            try {
                if (shouldPatch) scheduleVisibleRefresh(value);
            } catch (e2) {}

            return result;
        };

        Lampa.Storage.__ddd_series_storage_patch = true;
        Lampa.Storage.__ddd_series_storage_patch_v3 = true;
        log('storage patch installed', FIX_VERSION);
        return true;
    }

    function installPlayerPatch() {
        if (!window.Lampa || !Lampa.Player || !Lampa.Player.play) return false;
        if (!Lampa.Player.__continue_watch_ddd_patched_v3) return false;
        if (Lampa.Player.__ddd_series_meta_integrated_patch_v3) return true;

        var originalPlay = Lampa.Player.play;
        Lampa.Player.play = function (params) {
            try {
                normalizeParams(params);
            } catch (e) {
                warn('series normalize failed', e);
            }
            return originalPlay.call(this, params);
        };

        Lampa.Player.__ddd_series_meta_integrated_patch = true;
        Lampa.Player.__ddd_series_meta_integrated_patch_v3 = true;
        log('player patch installed', FIX_VERSION);
        return true;
    }

    function installPatches() {
        installStoragePatch();
        installPlayerPatch();

        window.ContinueWatchDDDSeriesMeta = {
            version: FIX_VERSION,
            normalizeParams: normalizeParams,
            normalizeStorageMap: normalizeStorageMap,
            readSeriesFields: readSeriesFields,
            rebuildLastPointers: rebuildLastPointers,
            scheduleVisibleRefresh: scheduleVisibleRefresh
        };
    }

    function waitPlayerPatchInstall() {
        var started = now();
        var timer = setInterval(function () {
            installPatches();

            if (window.Lampa && Lampa.Player && Lampa.Player.__ddd_series_meta_integrated_patch_v3) {
                clearInterval(timer);
                noty('series meta patch installed', 2);
                return;
            }

            if (now() - started > 30000) {
                clearInterval(timer);
                warn('player patch install timeout; storage patch remains active');
            }
        }, 300);
    }

    function loadCore() {
        installPatches();

        if (window.__CONTINUE_WATCH_DDD_LAYER_V3__) {
            waitPlayerPatchInstall();
            return;
        }

        var script = document.createElement('script');
        script.src = CORE_URL;
        script.async = true;
        script.onload = waitPlayerPatchInstall;
        script.onerror = function () {
            warn('failed to load core Debuger.js', CORE_URL);
            noty('core load failed', 0);
        };
        document.head.appendChild(script);
    }

    loadCore();
})();
