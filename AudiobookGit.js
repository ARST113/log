(function() {
  'use strict';

  var VERSION = '0.3.20';
  var RUNTIME_KEY = '__lampacAudiobooksRuntime';
  var previousRuntime = window[RUNTIME_KEY];

  if (previousRuntime && previousRuntime.version == VERSION && previousRuntime.active) return;

  if (previousRuntime && previousRuntime.stop) {
    try {
      previousRuntime.stop();
    } catch (e) {}
  }

  var runtime = {
    version: VERSION,
    active: true,
    timers: [],
    menuObserver: null,
    fullObserver: null,
    searchSource: null,
    fullHookInstalled: false,
    visualizerHookInstalled: false,
    visualizerInitTimer: 0,
    playerMonitor: 0,
    controllerHookInstalled: false
  };

  window[RUNTIME_KEY] = runtime;
  window.lampacAudiobooksPluginVersion = VERSION;
  window.lampacAudiobooksPluginReady = true;

  function isCurrentRuntime() {
    return window[RUNTIME_KEY] === runtime && runtime.active;
  }

  function later(callback, delay) {
    var timer = setTimeout(function() {
      if (isCurrentRuntime()) callback();
    }, delay);

    runtime.timers.push(timer);
    return timer;
  }

  runtime.stop = function() {
    runtime.active = false;

    runtime.timers.forEach(function(timer) {
      clearTimeout(timer);
    });
    runtime.timers = [];

    if (runtime.visualizerInitTimer) {
      clearInterval(runtime.visualizerInitTimer);
      runtime.visualizerInitTimer = 0;
    }

    if (runtime.playerMonitor) {
      clearInterval(runtime.playerMonitor);
      runtime.playerMonitor = 0;
    }

    if (runtime.menuObserver && runtime.menuObserver.disconnect) {
      try {
        runtime.menuObserver.disconnect();
      } catch (e) {}
    }

    if (runtime.fullObserver && runtime.fullObserver.disconnect) {
      try {
        runtime.fullObserver.disconnect();
      } catch (e) {}
    }

    if (runtime.searchSource && window.Lampa && Lampa.Search && Lampa.Search.removeSource) {
      try {
        Lampa.Search.removeSource(runtime.searchSource);
      } catch (e) {}
    }

    if (typeof AudiobookPlayerView != 'undefined' && AudiobookPlayerView && AudiobookPlayerView.destroy) {
      try {
        AudiobookPlayerView.destroy();
      } catch (e) {}
    }

    if (typeof AUDIOBOOK_PLAYER_ACTIVE != 'undefined') AUDIOBOOK_PLAYER_ACTIVE = false;
    if (typeof ACTIVE_PLAYER_META != 'undefined') ACTIVE_PLAYER_META = null;
    if (typeof CURRENT_AUDIOBOOK_PLAYLIST != 'undefined') CURRENT_AUDIOBOOK_PLAYLIST = [];
  };

  var COMPONENT = 'lampac_audiobooks';
  var SOURCE = 'lampac_audiobooks';
  var PAGE_SIZE = 20;
  var DEFAULT_API_BASE = 'http://lampac.fun';
  var API_BASE = DEFAULT_API_BASE;
  window.lampacAudiobooksApiBase = API_BASE;
  var BOOK_CACHE = window.__lampacAudiobooksBookCache || {};
  window.__lampacAudiobooksBookCache = BOOK_CACHE;
  var SEARCH_SOURCE = null;
  var SOURCE_TITLE = {
    knigavuhe: '\u041a\u043d\u0438\u0433\u0430 \u0432 \u0443\u0445\u0435',
    akniga: 'Akniga'
  };

  window.lampacAudiobooksDebug = {
    version: VERSION,
    apiBase: API_BASE,
    defaultApiBase: DEFAULT_API_BASE
  };

  function cleanApiBase(value) {
    return (value || '').toString().replace(/\/$/, '');
  }

  function scriptApiBase() {
    var src = '';
    var scripts;
    var match;

    if (document.currentScript && document.currentScript.src) {
      src = document.currentScript.src;
    }

    if (!src) {
      scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && scripts[i].src.indexOf('audiobook') >= 0) {
          src = scripts[i].src;
          break;
        }
      }
    }

    match = src.match(/[?&](?:api|server)=([^&#]+)/i);
    if (!match || !match[1]) return '';

    try {
      return cleanApiBase(decodeURIComponent(match[1]));
    } catch (e) {
      return cleanApiBase(match[1]);
    }
  }

  function detectApiBase() {
    var explicit = cleanApiBase(window.lampacAudiobooksApiBase || '');
    var fromScript = scriptApiBase();
    var pageOrigin = '';

    if (explicit) return explicit;
    if (fromScript) return fromScript;

    if (window.location && window.location.origin) {
      pageOrigin = cleanApiBase(window.location.origin);

      if (/^https?:\/\/(?:www\.)?lampac\.fun(?::\d+)?$/i.test(pageOrigin)) {
        return pageOrigin;
      }
    }

    return cleanApiBase(DEFAULT_API_BASE);
  }

  function addParam(url, key, value) {
    if (value === undefined || value === null || value === '') return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }

  function absoluteUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf('//') === 0) return (location.protocol || 'https:') + url;
    if (url.charAt(0) === '/') return API_BASE + url;
    return API_BASE ? API_BASE + '/' + url.replace(/^\/+/, '') : url;
  }

  function normalizeAudiobookImageUrl(url) {
    if (!url) return '';

    var value = url.toString();
    var marker = '/audiobooks/img?';
    var index = value.indexOf(marker);

    if (index < 0) return '';

    var http = value.lastIndexOf('http://', index);
    var https = value.lastIndexOf('https://', index);
    var pos = Math.max(http, https);

    if (pos >= 0) return value.slice(pos);
    return absoluteUrl(value);
  }

  function patchLampaImageApi() {
    if (!Lampa.Api || !Lampa.Api.img || Lampa.Api._lampacAudiobooksImagePatch) return;

    var original = Lampa.Api.img;

    Lampa.Api.img = function(url, size) {
      var direct = normalizeAudiobookImageUrl(url);

      if (direct) return direct;

      return original.apply(this, arguments);
    };

    Lampa.Api._lampacAudiobooksImagePatch = true;
  }

  function audioUrl(url) {
    var full = absoluteUrl(url);
    var origin = API_BASE || (window.location && window.location.origin) || '';

    if (!full) return '';

    origin = origin.replace(/\/$/, '');

    if (/^https?:\/\//i.test(full) && origin && full.indexOf(origin + '/') !== 0) {
      return apiUrl('/audiobooks/audio', { url: full });
    }

    return full;
  }

  function apiUrl(path, params) {
    var url = /^https?:\/\//i.test(path) ? path : API_BASE + path;

    params = params || {};
    for (var key in params) {
      if (params.hasOwnProperty(key)) url = addParam(url, key, params[key]);
    }

    if (window.Lampa && Lampa.Storage && Lampa.Storage.get) {
      var uid = Lampa.Storage.get('lampac_unic_id', '') || '';
      var email = Lampa.Storage.get('account_email', '') || '';
      var profile = Lampa.Storage.get('lampac_profile_id', '') || '';

      if (uid && url.indexOf('uid=') < 0) url = addParam(url, 'uid', uid);
      if (email && url.indexOf('account_email=') < 0) url = addParam(url, 'account_email', email);
      if (profile && url.indexOf('profile_id=') < 0) url = addParam(url, 'profile_id', profile);
    }

    return url;
  }

  function escapeHtml(value) {
    return $('<div>').text(value || '').html();
  }

  function shortText(value, length) {
    value = (value || '').replace(/\s+/g, ' ').trim();
    if (!length || value.length <= length) return value;
    return value.slice(0, length - 1).trim() + '\u2026';
  }

  function normalize(value) {
    return (value || '')
      .toString()
      .toLowerCase()
      .replace(/\u0451/g, '\u0435')
      .replace(/&quot;|&laquo;|&raquo;/g, ' ')
      .replace(/[^a-z\u0430-\u044f0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizePerson(value) {
    var parts = normalize(value).split(' ').filter(function(part) {
      return part.length > 1;
    });

    parts.sort();
    return parts.join(' ');
  }

  function bookKey(book) {
    return Lampa.Utils.hash(['audiobook', book.source || 'knigavuhe', book.url || book.name || ''].join(':'));
  }

  function requestJSON(url, onDone, onError, timeout) {
    var network = new Lampa.Reguest();
    network.timeout(timeout || 30000);
    network.silent(url, function(data) {
      if (typeof data == 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          if (onError) onError(e);
          return;
        }
      }

      if (data && data.accsdb && data.accsdb.msg) {
        if (onError) onError(data.accsdb.msg);
        return;
      }

      onDone(data);
    }, function(a, b) {
      if (onError) onError(a || b || 'network');
    });
  }

  function requestPromise(url, timeout) {
    return new Promise(function(resolve, reject) {
      requestJSON(url, resolve, reject, timeout);
    });
  }

  function sourceTitle(source) {
    return SOURCE_TITLE[source] || source || '\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a';
  }

  function makeSearchQuery(book) {
    var parts = [];
    if (book.author && book.author != '\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043d') parts.push(book.author);
    if (book.name) parts.push(book.name);
    return parts.join(' ').trim() || book.name || '';
  }

  function makeGenres(book) {
    var genres = [];

    if (book.seriesName) {
      genres.push({
        id: Lampa.Utils.hash('series:' + book.seriesName),
        name: book.seriesName
      });
    }

    if (book.author) {
      genres.push({
        id: Lampa.Utils.hash('author:' + book.author),
        name: book.author
      });
    }

    return genres;
  }

  function durationToMinutes(value) {
    var text = (value || '').toString().toLowerCase();
    var hours = text.match(/(\d+)\s*(?:\u0447|\u0447\u0430\u0441|h)/);
    var minutes = text.match(/(\d+)\s*(?:\u043c|\u043c\u0438\u043d|min)/);
    var total = 0;

    if (hours) total += parseInt(hours[1], 10) * 60;
    if (minutes) total += parseInt(minutes[1], 10);

    return total || 0;
  }

  function ensureLampaCardDefaults(card) {
    card = card || {};

    if (!Array.isArray(card.genres)) card.genres = [];
    if (!Array.isArray(card.genre_ids)) card.genre_ids = [];
    if (!Array.isArray(card.production_countries)) card.production_countries = [];
    if (!Array.isArray(card.origin_country)) card.origin_country = [];
    if (!Array.isArray(card.spoken_languages)) card.spoken_languages = [];
    if (!Array.isArray(card.production_companies)) card.production_companies = [];
    if (!Array.isArray(card.countries)) card.countries = [];
    if (!Array.isArray(card.seasons)) card.seasons = [];

    card.runtime = parseInt(card.runtime || 0, 10) || 0;
    card.vote_average = parseFloat(card.vote_average || 0) || 0;
    card.vote_count = parseInt(card.vote_count || 0, 10) || 0;
    card.popularity = parseFloat(card.popularity || 0) || 0;
    card.budget = parseInt(card.budget || 0, 10) || 0;
    card.revenue = parseInt(card.revenue || 0, 10) || 0;
    card.number_of_episodes = parseInt(card.number_of_episodes || 0, 10) || 0;
    card.number_of_seasons = parseInt(card.number_of_seasons || 0, 10) || 0;
    card.tagline = card.tagline || '';
    card.status = card.status || '';
    card.homepage = card.homepage || '';
    card.adult = !!card.adult;

    return card;
  }

  function cardFromBook(book) {
    book = book || {};

    var id = bookKey(book);
    var image = absoluteUrl(book.preview) || './img/img_broken.svg';
    var title = book.name || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430';
    var year = new Date().getFullYear() + '';
    var card = {
      id: id,
      title: title,
      name: title,
      original_title: book.author || title,
      original_name: book.author || title,
      overview: book.description || '',
      description: book.description || '',
      poster_path: '',
      backdrop_path: '',
      background_image: image,
      img: image,
      poster: image,
      production_countries: [],
      origin_country: [],
      spoken_languages: [],
      production_companies: [],
      countries: [],
      genre_ids: [],
      seasons: [],
      runtime: durationToMinutes(book.duration),
      vote_count: 0,
      popularity: 0,
      budget: 0,
      revenue: 0,
      tagline: '',
      status: '',
      homepage: '',
      adult: false,
      number_of_episodes: 0,
      number_of_seasons: 0,
      vote_average: book.duration ? 0 : 0,
      release_date: year + '-01-01',
      first_air_date: '',
      original_language: 'ru',
      media_type: 'movie',
      type: 'movie',
      source: SOURCE,
      method: 'movie',
      genres: makeGenres(book),
      audiobook_url: book.url || '',
      audiobook_source: book.source || 'knigavuhe',
      audiobook_reader: book.reader || '',
      audiobook_duration: book.duration || '',
      audiobook_series: book.seriesName || '',
      audiobook_number: book.numberInSeries || '',
      audiobook_book: book
    };

    ensureLampaCardDefaults(card);

    BOOK_CACHE[id] = book;
    if (book.url) BOOK_CACHE[book.url] = book;

    return card;
  }

  function bookFromCard(card) {
    card = card || {};

    return card.audiobook_book ||
      BOOK_CACHE[card.id] ||
      BOOK_CACHE[card.audiobook_url] ||
      {
        source: card.audiobook_source || 'knigavuhe',
        url: card.audiobook_url || '',
        name: card.title || card.name || '',
        author: card.original_title || card.original_name || '',
        reader: card.audiobook_reader || '',
        duration: card.audiobook_duration || '',
        preview: card.img || card.poster || card.poster_path || '',
        description: card.overview || card.description || ''
      };
  }

  function isAudiobookCard(card) {
    return !!(card && (card.source == SOURCE || card.audiobook_url || card.audiobook_source));
  }

  function rankAknigaCandidate(candidate, baseBook) {
    var baseName = normalize(baseBook.name);
    var candidateName = normalize(candidate.name);
    var baseAuthor = normalize(baseBook.author);
    var candidateAuthor = normalize(candidate.author);
    var score = 0;

    if (!candidateName || !baseName) return 0;

    if (candidateName == baseName) score += 90;
    else if (candidateName.indexOf(baseName) >= 0 || baseName.indexOf(candidateName) >= 0) score += 65;
    else {
      var words = baseName.split(' ');
      var hits = 0;
      for (var i = 0; i < words.length; i++) {
        if (words[i].length > 2 && candidateName.indexOf(words[i]) >= 0) hits++;
      }
      if (words.length) score += Math.round(40 * hits / words.length);
    }

    if (baseAuthor && candidateAuthor) {
      if (candidateAuthor == baseAuthor) score += 35;
      else if (candidateAuthor.indexOf(baseAuthor) >= 0 || baseAuthor.indexOf(candidateAuthor) >= 0) score += 22;
    }

    if (baseBook.seriesName && candidate.seriesName && normalize(baseBook.seriesName) == normalize(candidate.seriesName)) score += 10;
    if (baseBook.numberInSeries && candidate.numberInSeries && baseBook.numberInSeries == candidate.numberInSeries) score += 8;

    return score;
  }

  function loadBook(book) {
    return requestPromise(apiUrl('/audiobooks/book', {
      source: book.source || 'knigavuhe',
      url: book.url
    }), 70000).then(function(detail) {
      return mergeBook(book, detail || {});
    });
  }

  function mergeBook(fallback, detail) {
    var result = {};
    var key;

    fallback = fallback || {};
    detail = detail || {};

    for (key in fallback) if (fallback.hasOwnProperty(key)) result[key] = fallback[key];
    for (key in detail) {
      if (detail.hasOwnProperty(key) && detail[key] !== null && detail[key] !== '') result[key] = detail[key];
    }

    result.items = detail.items || fallback.items || [];
    return result;
  }

  function collectVoices(cardBook) {
    return loadBook(cardBook).then(function(baseBook) {
      var query = makeSearchQuery(baseBook);
      var searchUrl = apiUrl('/audiobooks/search', {
        source: 'akniga',
        query: query,
        limit: 8,
        offset: 0
      });

      return requestPromise(searchUrl, 45000).then(function(items) {
        items = items || [];

        items.sort(function(a, b) {
          return rankAknigaCandidate(b, baseBook) - rankAknigaCandidate(a, baseBook);
        });

        var matches = [];
        for (var i = 0; i < items.length; i++) {
          if (rankAknigaCandidate(items[i], baseBook) >= 45) matches.push(items[i]);
          if (matches.length >= 4) break;
        }

        if (!matches.length && items.length && rankAknigaCandidate(items[0], baseBook) >= 30) matches.push(items[0]);

        var loaders = matches.map(function(item) {
          return loadBook(item).catch(function() {
            return null;
          });
        });

        return Promise.all(loaders).then(function(details) {
          var books = [baseBook];

          details.forEach(function(book) {
            if (book && book.items && book.items.length) books.push(book);
          });

          return prepareVoices(books);
        });
      }).catch(function() {
        return prepareVoices([baseBook]);
      });
    });
  }

  function voiceName(book) {
    var source = sourceTitle(book.source);
    var reader = book.reader || '\u0411\u0435\u0437 \u0438\u043c\u0435\u043d\u0438';
    return source + ': ' + reader;
  }

  function voiceSubtitle(book) {
    var meta = [];
    if (book.duration) meta.push(book.duration);
    if (book.items && book.items.length > 1) meta.push(book.items.length + ' \u0444\u0430\u0439\u043b\u043e\u0432');
    if (book.name) meta.push(shortText(book.name, 42));
    return meta.join(' \u2022 ');
  }

  function prepareVoices(books) {
    var voices = [];
    var exists = {};

    books.forEach(function(book) {
      if (!book || !book.items || !book.items.length) return;

      var voiceKey = normalizePerson(book.reader || '');
      var titleKey = normalize(book.name || '');
      var key = voiceKey && titleKey
        ? [voiceKey, titleKey].join('|')
        : [book.source || '', normalize(book.reader || ''), titleKey, book.url || ''].join('|');

      if (exists[key]) return;
      exists[key] = true;

      voices.push({
        key: key,
        title: voiceName(book),
        subtitle: voiceSubtitle(book),
        book: book,
        playlist: buildPlaylist(book)
      });
    });

    voices = voices.filter(function(voice) {
      return voice.playlist.length > 0;
    });

    voices.sort(function(a, b) {
      if (a.book.source == 'knigavuhe' && b.book.source != 'knigavuhe') return -1;
      if (a.book.source != 'knigavuhe' && b.book.source == 'knigavuhe') return 1;
      return a.title.localeCompare(b.title);
    });

    return voices;
  }

  function buildPlaylist(book) {
    var items = (book.items || []).slice(0);

    items.sort(function(a, b) {
      return (parseInt(a.fileIndex, 10) || 0) - (parseInt(b.fileIndex, 10) || 0);
    });

    var image = absoluteUrl(book.preview) || './img/img_broken.svg';
    var card = makePlayerCard(book);
    var source = sourceTitle(book.source);

    return items.filter(function(item) {
      return !!item.fileurl;
    }).map(function(item, index) {
      var chapterTitle = item.title || book.name || ('\u0424\u0430\u0439\u043b ' + (index + 1));
      var bookTitle = book.name || chapterTitle;
      var timelineHash = Lampa.Utils.hash(['audiobook', book.source, book.url, item.fileIndex, index].join(':'));
      var meta = {
        title: bookTitle,
        chapter: chapterTitle,
        chapter_index: index + 1,
        description: item.description || chapterTitle || book.description || '',
        author: book.author || '',
        reader: book.reader || '',
        duration: book.duration || '',
        image: image
      };

      return {
        title: chapterTitle,
        name: chapterTitle,
        first_title: bookTitle,
        movie_title: bookTitle,
        original_title: book.author || '',
        url: audioUrl(item.fileurl),
        timeline: Lampa.Timeline.view(timelineHash),
        img: image,
        poster: image,
        background_image: image,
        card: card,
        source_name: source,
        audiobook_meta: meta,
        from_lampac_audiobooks: true
      };
      
