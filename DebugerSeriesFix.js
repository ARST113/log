(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.__DDD_SERIES_META_FIX__) return;
    window.__DDD_SERIES_META_FIX__ = true;

    var PLUGIN_NAME = 'DDDSeriesMetaFix';
    var PLUGIN_VERSION = 'v1.0.0';
    var INSTALL_TIMEOUT_MS = 30000;
    var INSTALL_INTERVAL_MS = 400;

    function log() {
        try {
            if (console && console.log) {
                var args = Array.prototype.slice.call(arguments);
                args.unshift('[' + PLUGIN_NAME + ']');
                console.log.apply(console, args);
            }
        } catch (e) {}
    }

    function warn() {
        try {
            if (console && console.warn) {
                var args = Array.prototype.slice.call(arguments);
                args.unshift('[' + PLUGIN_NAME + ']');
                console.warn.apply(console, args);
            }
        } catch (e) {}
    }

    function toNumber(value) {
        if (value === undefined || value === null || value === '') return 0;

        var n = Number(value);
        if (!isFinite(n)) return 0;

        return Math.floor(n);
    }

    function firstNumber(obj, keys) {
        if (!obj || typeof obj !== 'object') return 0;

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = obj[key];

            if (value !== undefined && value !== null && value !== '') {
                var n = toNumber(value);
                if (n > 0) return n;
            }
        }

        return 0;
    }

    function firstString(obj, keys) {
        if (!obj || typeof obj !== 'object') return '';

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = obj[key];

            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }

        return '';
    }

    function stripFragment(url) {
        if (typeof url !== 'string') return url;

        var p = url.indexOf('#');
        return p >= 0 ? url.substring(0, p) : url;
    }

    function safeDecode(value) {
        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value;
        }
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
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0
            };
        }

        m = text.match(/(\d{1,2})\s*[xх×]\s*0?(\d{1,4})/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0
            };
        }

        m = text.match(/(\d{1,2})\s*сезон.*?(\d{1,4})\s*сер/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0
            };
        }

        m = text.match(/сезон\s*[-–—:]?\s*0?(\d{1,2}).*?(?:сер(?:ия|ии|и)?|эпизод)\s*[-–—:]?\s*0?(\d{1,4})/i);
        if (m) {
            return {
                season: parseInt(m[1], 10) || 0,
                episode: parseInt(m[2], 10) || 0
            };
        }

        m = text.match(/(?:эпизод|сер(?:ия|ии|и)?|episode|ep\.?|сер\.)\s*[-–—:]?\s*0?(\d{1,4})/i);
        if (m) {
            return {
                season: 0,
                episode: parseInt(m[1], 10) || 0
            };
        }

        m = text.match(/\bE\s*0?(\d{1,4})\b/i);
        if (m) {
            return {
                season: 0,
                episode: parseInt(m[1], 10) || 0
            };
        }

        return null;
    }

    function extractSeriesMeta(data) {
        data = data || {};

        var season = firstNumber(data, [
            'season',
            'season_number',
            'season_num',
            'seasonNumber',
            'seasonIndex',
            's'
        ]);

        var episode = firstNumber(data, [
            'episode',
            'episode_number',
            'episode_num',
            'episodeNumber',
            'episodeIndex',
            'number',
            'num',
            'e'
        ]);

        if (season > 0 && episode > 0) {
            return {
                season: season,
                episode: episode,
                source: 'fields'
            };
        }

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

            if (parsed) {
                if (!season && parsed.season) season = parsed.season;
                if (!episode && parsed.episode) episode = parsed.episode;

                if (episode > 0 && !season) season = 1;

                return {
                    season: season,
                    episode: episode,
                    source: 'text'
                };
            }
        }

        if (episode > 0 && !season) season = 1;

        return {
            season: season || 0,
            episode: episode || 0,
            source: season && episode ? 'fields-partial' : ''
        };
    }

    function looksLikeEpisodeItem(item) {
        var text = firstString(item, [
            'title',
            'name',
            'episode_title',
            'file_name',
            'filename',
            'path_human',
            'path'
        ]);

        if (!text) return false;

        return /(эпизод|сер(?:ия|ии|и)?|episode|\bS\d{1,2}\s*E\d{1,4}\b|\b\d{1,2}[xх×]\d{1,4}\b)/i.test(text);
    }

    function isSeriesLike(params) {
        params = params || {};

        if (toNumber(params.season) > 0 || toNumber(params.episode) > 0) return true;

        var movie = params.card || params.movie || {};
        if (toNumber(movie.number_of_seasons) > 0) return true;
        if (String(movie.media_type || movie.type || '').toLowerCase() === 'tv') return true;

        var list = Array.isArray(params.playlist) ? params.playlist : [];

        for (var i = 0; i < list.length; i++) {
            var item = list[i] || {};
            if (toNumber(item.season) > 0 || toNumber(item.episode) > 0) return true;
            if (toNumber(item.season_number) > 0 || toNumber(item.episode_number) > 0) return true;
            if (looksLikeEpisodeItem(item)) return true;
        }

        return false;
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
        var fields = ['playlist_index', 'ddd_start_index', 'start_index', 'playlistIndex', 'index'];

        for (var i = 0; i < fields.length; i++) {
            var key = fields[i];

            if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
                var n = toNumber(params[key]);
                if (n >= 0 && (!playlist || !playlist.length || n < playlist.length)) return n;
            }
        }

        if (params.url) {
            var byUrl = findPlaylistIndexByUrl(playlist, params.url);
            if (byUrl >= 0) return byUrl;
        }

        return Array.isArray(playlist) && playlist.length ? 0 : -1;
    }

    function normalizePlaylistItem(item, index, selectedIndex, allowIndexFallback) {
        if (!item || typeof item !== 'object') return null;

        var meta = extractSeriesMeta(item);
        var changed = false;

        if ((!meta.episode || !meta.season) && allowIndexFallback && looksLikeEpisodeItem(item)) {
            if (!meta.episode && index >= 0) {
                meta.episode = index + 1;
                changed = true;
            }

            if (meta.episode && !meta.season) {
                meta.season = 1;
                changed = true;
            }
        }

        if ((!meta.episode || !meta.season) && allowIndexFallback && index === selectedIndex) {
            if (!meta.episode && index >= 0) {
                meta.episode = index + 1;
                changed = true;
            }

            if (meta.episode && !meta.season) {
                meta.season = 1;
                changed = true;
            }
        }

        if (meta.episode > 0 && !meta.season) {
            meta.season = 1;
            changed = true;
        }

        if (meta.season > 0 && item.season !== meta.season) {
            item.season = meta.season;
            changed = true;
        }

        if (meta.episode > 0 && item.episode !== meta.episode) {
            item.episode = meta.episode;
            changed = true;
        }

        if (!item.episode_title) {
            var title = firstString(item, ['title', 'name']);
            if (title) {
                item.episode_title = title;
                changed = true;
            }
        }

        return {
            season: meta.season || 0,
            episode: meta.episode || 0,
            changed: changed,
            source: meta.source || (changed ? 'fallback' : '')
        };
    }

    function normalizeParams(params) {
        if (!params || typeof params !== 'object') return params;

        var playlist = Array.isArray(params.playlist) ? params.playlist : null;
        var seriesLike = isSeriesLike(params);
        var selectedIndex = readSelectedIndex(params, playlist);
        var selectedItem = playlist && selectedIndex >= 0 ? playlist[selectedIndex] : null;
        var anyChanged = false;

        if (playlist && seriesLike) {
            for (var i = 0; i < playlist.length; i++) {
                var itemMeta = normalizePlaylistItem(
                    playlist[i],
                    i,
                    selectedIndex,
                    true
                );

                if (itemMeta && itemMeta.changed) anyChanged = true;
            }
        }

        var paramsMeta = extractSeriesMeta(params);
        var selectedMeta = selectedItem ? extractSeriesMeta(selectedItem) : { season: 0, episode: 0 };

        var season = paramsMeta.season || selectedMeta.season || 0;
        var episode = paramsMeta.episode || selectedMeta.episode || 0;

        if ((!season || !episode) && seriesLike && selectedIndex >= 0) {
            episode = episode || selectedIndex + 1;
            season = season || 1;
        }

        if (episode > 0 && !season) season = 1;

        if (season > 0 && toNumber(params.season) !== season) {
            params.season = season;
            anyChanged = true;
        }

        if (episode > 0 && toNumber(params.episode) !== episode) {
            params.episode = episode;
            anyChanged = true;
        }

        if (playlist && selectedIndex >= 0) {
            if (toNumber(params.playlist_index) !== selectedIndex) {
                params.playlist_index = selectedIndex;
                anyChanged = true;
            }

            if (params.ddd_start_index === undefined) params.ddd_start_index = selectedIndex;
            if (params.start_index === undefined) params.start_index = selectedIndex;
        }

        if (selectedItem) {
            var selectedTitle = firstString(selectedItem, ['episode_title', 'title', 'name']);

            if (selectedTitle && params.episode_title !== selectedTitle) {
                params.episode_title = selectedTitle;
                anyChanged = true;
            }

            if (!params.timeline && selectedItem.timeline) {
                params.timeline = selectedItem.timeline;
                anyChanged = true;
            }
        }

        if (anyChanged) {
            log(
                'normalized',
                'S' + (params.season || 0) + 'E' + (params.episode || 0),
                'pi=' + (params.playlist_index !== undefined ? params.playlist_index : '-'),
                params.episode_title || params.title || ''
            );
        }

        return params;
    }

    function installPatch() {
        if (!window.Lampa || !Lampa.Player || !Lampa.Player.play) return false;

        if (!Lampa.Player.__continue_watch_ddd_patched_v3) {
            return false;
        }

        if (Lampa.Player.__ddd_series_meta_fix_patched) return true;

        var originalPlay = Lampa.Player.play;

        Lampa.Player.play = function (params) {
            try {
                normalizeParams(params);
            } catch (e) {
                warn('normalize failed', e);
            }

            return originalPlay.call(this, params);
        };

        Lampa.Player.__ddd_series_meta_fix_patched = true;

        try {
            if (Lampa.Noty && Lampa.Noty.show) {
                Lampa.Noty.show('[DDD] series meta fix installed');
            }
        } catch (e) {}

        log('installed', PLUGIN_VERSION);
        return true;
    }

    function startInstallLoop() {
        var startedAt = Date.now ? Date.now() : new Date().getTime();

        var timer = setInterval(function () {
            if (installPatch()) {
                clearInterval(timer);
                return;
            }

            var now = Date.now ? Date.now() : new Date().getTime();
            if (now - startedAt > INSTALL_TIMEOUT_MS) {
                clearInterval(timer);
                warn('install timeout: Debuger.js patch was not detected');
            }
        }, INSTALL_INTERVAL_MS);
    }

    window.DDDSeriesMetaFix = {
        version: PLUGIN_VERSION,
        normalizeParams: normalizeParams,
        extractSeriesMeta: extractSeriesMeta,
        install: installPatch
    };

    startInstallLoop();
})();
