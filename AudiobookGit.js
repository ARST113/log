(function() {
  'use strict';

  if (window.lampacAudiobooksPluginVersion == '0.2.15') return;
  window.lampacAudiobooksPluginVersion = '0.2.15';
  window.lampacAudiobooksPluginReady = true;

  var COMPONENT = 'lampac_audiobooks';
  var SOURCE = 'lampac_audiobooks';
  var VERSION = '0.2.15';
  var PAGE_SIZE = 20;
  var API_BASE = detectApiBase();
  var BOOK_CACHE = {};
  var SEARCH_SOURCE = null;
  var SOURCE_TITLE = {
    knigavuhe: '\u041a\u043d\u0438\u0433\u0430 \u0432 \u0443\u0445\u0435',
    akniga: 'Akniga'
  };

  function detectApiBase() {
    var src = '';

    if (document.currentScript && document.currentScript.src) {
      src = document.currentScript.src;
    }

    if (!src) {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        if (scripts[i].src && scripts[i].src.indexOf('/audiobooks.js') >= 0) {
          src = scripts[i].src;
          break;
        }
      }
    }

    if (src && src.indexOf('://') >= 0) {
      return src.replace(/\/audiobooks\.js(?:\?.*)?$/, '').replace(/\/$/, '');
    }

    if (window.location && window.location.origin) return window.location.origin.replace(/\/$/, '');

    return '';
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
    return url;
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
      var title = item.title || book.name || ('\u0424\u0430\u0439\u043b ' + (index + 1));
      var timelineHash = Lampa.Utils.hash(['audiobook', book.source, book.url, item.fileIndex, index].join(':'));

      return {
        title: title,
        original_title: book.author || '',
        url: audioUrl(item.fileurl),
        timeline: Lampa.Timeline.view(timelineHash),
        img: image,
        poster: image,
        card: card,
        source_name: source,
        from_lampac_audiobooks: true
      };
    });
  }

  function makePlayerCard(book) {
    return cardFromBook(book);
  }

  function playVoice(voices, voice) {
    if (!voice || !voice.playlist || !voice.playlist.length) {
      Lampa.Noty.show('\u041d\u0435\u0442 \u0444\u0430\u0439\u043b\u043e\u0432 \u0434\u043b\u044f \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u044f');
      return;
    }

    var selectedIndex = voices.indexOf(voice);
    var errorHandled = false;
    var handleError = function(object, next) {
      var nextVoice = voices[selectedIndex + 1];

      if (errorHandled) return;
      errorHandled = true;

      if (nextVoice) {
        Lampa.Noty.show('\u041f\u0440\u043e\u0431\u0443\u044e \u0434\u0440\u0443\u0433\u0443\u044e \u043e\u0437\u0432\u0443\u0447\u043a\u0443');
        if (next) next(nextVoice.playlist[0].url);
        setTimeout(function() {
          playVoice(voices, nextVoice);
        }, 300);
      } else {
        Lampa.Noty.show('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0441\u0442\u0438 \u0430\u0443\u0434\u0438\u043e');
      }
    };
    var voiceovers = voices.map(function(item) {
      return {
        name: item.title,
        title: item.title,
        subtitle: item.subtitle,
        selected: item.key == voice.key,
        onSelect: function() {
          playVoice(voices, item);
        }
      };
    });

    var first = {};
    var playlist = voice.playlist.map(function(item) {
      var clone = {};
      for (var key in item) if (item.hasOwnProperty(key)) clone[key] = item[key];
      return clone;
    });

    playlist.forEach(function(item) {
      item.translate_name = voice.title;
      item.voiceovers = voiceovers;
      item.error = handleError;
    });

    for (var key in playlist[0]) {
      if (playlist[0].hasOwnProperty(key)) first[key] = playlist[0][key];
    }

    first.title = voice.book.name || first.title;
    first.translate_name = voice.title;
    first.voiceovers = voiceovers;
    first.error = handleError;

    if (Lampa.Favorite && Lampa.Favorite.add) {
      Lampa.Favorite.add('history', first.card, 100);
    }

    if (Lampa.Player.opened && Lampa.Player.opened()) {
      try {
        Lampa.Player.close();
      } catch (e) {}
    }

    Lampa.Player.runas('inner');
    Lampa.Player.play(first);
    Lampa.Player.playlist(playlist);
    Lampa.Player.callback(function() {
      Lampa.Controller.toggle('content');
    });
    if (Lampa.PlayerPanel && Lampa.PlayerPanel.setVoiceovers) {
      try {
        Lampa.PlayerPanel.setVoiceovers(voiceovers);
      } catch (e) {}
    }
  }

  function startPlayback(book) {
    if (Lampa.Loading) {
      Lampa.Loading.start();
      if (Lampa.Loading.setText) Lampa.Loading.setText('\u0418\u0449\u0443 \u043e\u0437\u0432\u0443\u0447\u043a\u0438...');
    }

    collectVoices(book).then(function(voices) {
      if (Lampa.Loading) Lampa.Loading.stop();

      if (!voices.length) {
        Lampa.Noty.show('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0430\u0443\u0434\u0438\u043e\u0444\u0430\u0439\u043b\u044b');
        return;
      }

      playVoice(voices, voices[0]);
    }).catch(function() {
      if (Lampa.Loading) Lampa.Loading.stop();
      Lampa.Noty.show('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0430\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0443');
    });
  }

  function showBookCard(book) {
    var enabled = Lampa.Controller.enabled().name;
    var image = absoluteUrl(book.preview) || './img/img_broken.svg';
    var meta = [];

    if (book.author) meta.push(book.author);
    if (book.reader) meta.push('\u0427\u0438\u0442\u0430\u0435\u0442: ' + book.reader);
    if (book.duration) meta.push(book.duration);
    if (book.seriesName) meta.push(book.seriesName + (book.numberInSeries ? ' #' + book.numberInSeries : ''));

    var html = $(
      '<div class="lampac-audiobook-detail">' +
        '<div class="lampac-audiobook-detail__cover"><img src="' + escapeHtml(image) + '" /></div>' +
        '<div class="lampac-audiobook-detail__body">' +
          '<div class="lampac-audiobook-detail__source">' + escapeHtml(sourceTitle(book.source)) + '</div>' +
          '<div class="lampac-audiobook-detail__title">' + escapeHtml(book.name || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430') + '</div>' +
          '<div class="lampac-audiobook-detail__meta">' + escapeHtml(meta.join(' \u2022 ')) + '</div>' +
          '<div class="lampac-audiobook-detail__descr">' + escapeHtml(shortText(book.description || '', 520)) + '</div>' +
          '<div class="lampac-audiobook-detail__footer">' +
            '<div class="selector simple-button lampac-audiobook-detail__listen"><span>\u0421\u043b\u0443\u0448\u0430\u0442\u044c</span></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    html.find('.lampac-audiobook-detail__listen').on('hover:enter click', function() {
      Lampa.Modal.close();
      Lampa.Controller.toggle(enabled);
      startPlayback(book);
    });

    Lampa.Modal.open({
      title: '',
      html: html,
      size: 'large',
      mask: true,
      onBack: function() {
        Lampa.Modal.close();
        Lampa.Controller.toggle(enabled);
      }
    });
  }

  function renderCatalogItem(book, scroll, onOpen) {
    var image = absoluteUrl(book.preview) || './img/img_broken.svg';
    var meta = [];
    var item;

    if (book.author) meta.push(book.author);
    if (book.reader) meta.push(book.reader);
    if (book.duration) meta.push(book.duration);

    item = $(
      '<div class="lampac-audiobook-card selector">' +
        '<div class="lampac-audiobook-card__cover"><img data-src="' + escapeHtml(image) + '" src="./img/img_broken.svg" /></div>' +
        '<div class="lampac-audiobook-card__body">' +
          '<div class="lampac-audiobook-card__source">' + escapeHtml(sourceTitle(book.source)) + '</div>' +
          '<div class="lampac-audiobook-card__title">' + escapeHtml(book.name || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430') + '</div>' +
          '<div class="lampac-audiobook-card__meta">' + escapeHtml(meta.join(' \u2022 ')) + '</div>' +
          '<div class="lampac-audiobook-card__descr">' + escapeHtml(shortText(book.description || '', 210)) + '</div>' +
        '</div>' +
        '<div class="lampac-audiobook-card__action">\u0421\u043b\u0443\u0448\u0430\u0442\u044c</div>' +
      '</div>'
    );

    item.on('hover:enter click', function() {
      onOpen(book);
    });

    item.on('hover:focus hover:hover hover:touch', function(e) {
      scroll.update($(e.target), true);
    });

    function loadImage() {
      var img = item.find('img')[0];
      img.onerror = function() {
        img.src = './img/img_broken.svg';
      };
      img.onload = function() {
        item.find('.lampac-audiobook-card__cover').addClass('loaded');
      };
      img.src = img.getAttribute('data-src');
    }

    item.on('visible', loadImage);
    loadImage();

    return item;
  }

  function sourceList(params, onComplete, onError) {
    params = params || {};

    var rawQuery = params.query || params.search || '';
    var query = '';
    var page = parseInt(params.page || 1, 10) || 1;

    try {
      query = decodeURIComponent(rawQuery || '');
    } catch (e) {
      query = rawQuery || '';
    }

    requestJSON(apiUrl('/audiobooks/search', {
      source: 'knigavuhe',
      query: query,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }), function(items) {
      items = items || [];

      var cards = items.map(cardFromBook);
      var hasMore = cards.length > 0;
      var nextPage = hasMore ? page + 1 : false;

      onComplete({
        url: params.url || 'knigavuhe',
        title: query ? '\u041f\u043e\u0438\u0441\u043a: ' + query : '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438',
        source: SOURCE,
        page: page,
        pages: hasMore ? 999999 : page,
        total_pages: hasMore ? 999999 : page,
        total_results: hasMore ? 999999 * PAGE_SIZE : ((page - 1) * PAGE_SIZE + cards.length),
        more: hasMore,
        next: nextPage,
        nomore: !hasMore,
        results: cards
      });
    }, onError || function() {}, 45000);
  }

  function sourceCategory(params, onComplete, onError) {
    params = params || {};

    sourceList({
      url: 'knigavuhe',
      page: params.page || 1,
      query: params.query || params.search || ''
    }, function(row) {
      row.title = '\u041d\u043e\u0432\u0438\u043d\u043a\u0438';
      onComplete([row]);
    }, onError);
  }

  function sourceFull(params, onComplete, onError) {
    params = params || {};

    var card = params.card || {};
    var book = bookFromCard(card);
    var fullCard = cardFromBook(book);

    fullCard.runtime = durationToMinutes(book.duration || card.audiobook_duration || '');
    fullCard.vote_average = 0;
    fullCard.audiobook_book = book;
    fullCard.audiobook_duration = book.duration || card.audiobook_duration || '';
    ensureLampaCardDefaults(fullCard);

    if (onComplete) onComplete({ movie: fullCard });
  }

  function sourceMenu(params, onComplete) {
    onComplete([
      {
        title: '\u041d\u043e\u0432\u0438\u043d\u043a\u0438',
        id: 'knigavuhe'
      }
    ]);
  }

  function registerAudiobooksSource() {
    if (!Lampa.Api || !Lampa.Api.sources) return false;

    var api = {
      _lampacVersion: VERSION,
      main: sourceCategory,
      category: sourceCategory,
      list: sourceList,
      full: sourceFull,
      menu: sourceMenu,
      person: function(params, onComplete, onError) {
        if (Lampa.Api.sources.tmdb && Lampa.Api.sources.tmdb.person) {
          Lampa.Api.sources.tmdb.person(params, onComplete, onError);
        } else if (onError) {
          onError();
        }
      },
      clear: function() {}
    };

    Lampa.Api.sources[SOURCE] = api;

    try {
      if (Lampa.Params && Lampa.Params.values && Lampa.Params.values.source) {
        Lampa.Params.values.source[SOURCE] = '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438';
      }
    } catch (e) {}

    return true;
  }

  function registerAudiobooksSearchSource() {
    if (!Lampa.Search || !Lampa.Search.addSource) return false;

    if (SEARCH_SOURCE && Lampa.Search.removeSource) {
      try {
        Lampa.Search.removeSource(SEARCH_SOURCE);
      } catch (e) {}
    }

    SEARCH_SOURCE = {
      title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438',
      search: function(params, onComplete) {
        var query = params && params.query ? params.query : '';

        try {
          query = decodeURIComponent(query || '');
        } catch (e) {
          query = query || '';
        }

        if (!query) {
          onComplete([]);
          return;
        }

        sourceList({
          url: 'knigavuhe',
          page: 1,
          query: query
        }, function(row) {
          row.title = '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438';
          row.source = SOURCE;
          onComplete(row.results && row.results.length ? [row] : []);
        }, function() {
          onComplete([]);
        });
      },
      onCancel: function() {},
      params: {
        lazy: true,
        align_left: true,
        card_events: {
          onMenu: function() {}
        }
      },
      onMore: function(params, close) {
        var query = params && params.query ? params.query : '';

        if (close) close();

        Lampa.Activity.push({
          url: 'knigavuhe',
          title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438',
          component: 'category_full',
          source: SOURCE,
          card_type: true,
          page: 1,
          search: query || '',
          query: query || ''
        });
      },
      onSelect: function(params, close) {
        var element = params && params.element ? params.element : null;

        if (close) close();
        if (!element) return;

        Lampa.Activity.push({
          url: '',
          title: element.title || element.name || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430',
          component: 'full',
          source: SOURCE,
          method: 'movie',
          card: element
        });
      }
    };

    Lampa.Search.addSource(SEARCH_SOURCE);
    return true;
  }

  function openCatalog() {
    registerAudiobooksSource();

    Lampa.Activity.push({
      url: 'knigavuhe',
      title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438',
      component: 'category_full',
      source: SOURCE,
      card_type: true,
      page: 1,
      search: ''
    });
  }

  function isAudiobooksActive() {
    try {
      var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();

      return !!(active && (active.component == COMPONENT || active.source == SOURCE));
    } catch (e) {
      return false;
    }
  }

  function openAudiobooksSearch() {
    var active = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
    var filter = active && active.activity && active.activity.filter;

    if (filter && filter.render) {
      var button = filter.render().find('.filter--search');

      if (button.length) {
        Lampa.Controller.toggle('content');
        button.trigger('hover:enter');
        return;
      }
    }

    if (!Lampa.Input || !Lampa.Input.edit) return;

    Lampa.Input.edit({
      title: '\u041f\u043e\u0438\u0441\u043a \u0430\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433',
      value: active && active.search ? active.search : '',
      placeholder: '\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435, \u0430\u0432\u0442\u043e\u0440, \u0447\u0442\u0435\u0446',
      nosave: true,
      free: true,
      nomic: false
    }, function(value) {
      if (value === null || typeof value == 'undefined') return;

      Lampa.Activity.replace({
        url: 'knigavuhe',
        title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438',
        component: 'category_full',
        source: SOURCE,
        card_type: true,
        page: 1,
        search: value || '',
        query: value || ''
      });
    });
  }

  function patchGlobalSearchRoute() {
    if (!Lampa.Activity || Lampa.Activity._lampacAudiobooksSearchPatch == VERSION) return;

    var originalPush = Lampa.Activity.push;
    var originalReplace = Lampa.Activity.replace;

    function shouldCatch(params) {
      return params && params.component == 'search' && isAudiobooksActive();
    }

    Lampa.Activity.push = function(params) {
      if (shouldCatch(params)) {
        setTimeout(openAudiobooksSearch, 10);
        return;
      }

      return originalPush.apply(this, arguments);
    };

    Lampa.Activity.replace = function(params) {
      if (shouldCatch(params)) {
        setTimeout(openAudiobooksSearch, 10);
        return;
      }

      return originalReplace.apply(this, arguments);
    };

    Lampa.Activity._lampacAudiobooksSearchPatch = VERSION;
  }

  function reapplyPluginBindings() {
    registerAudiobooksSource();
    registerAudiobooksSearchSource();
    patchGlobalSearchRoute();
    addMenuButton();
  }

  function scheduleReapplyPluginBindings() {
    if (window.lampacAudiobooksReapplyVersion == VERSION) return;

    window.lampacAudiobooksReapplyVersion = VERSION;

    setTimeout(reapplyPluginBindings, 1500);
    setTimeout(reapplyPluginBindings, 4500);
  }

  window.lampacAudiobooksOpen = openCatalog;

  var MENU_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M5 3h11a4 4 0 0 1 4 4v14H8a4 4 0 0 1-4-4V4a1 1 0 0 1 1-1Zm1 2v12a2 2 0 0 0 2 2h10V7a2 2 0 0 0-2-2H6Zm3 3h6v2H9V8Zm0 4h6v2H9v-2Zm11-2h1a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-1v-2h1a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-1v-2Z"/></svg>';
  var FULL_ICON = '<svg xmlns="http://www.w3.org/2000/svg" height="70" viewBox="0 0 48 48" fill="none"><path d="M11 10h18c4.4 0 8 3.6 8 8v20H17c-3.3 0-6-2.7-6-6V10Z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M17 10v28M23 18h8M23 26h8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M38 21c3.3 0 6 2.7 6 6v4c0 3.3-2.7 6-6 6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';

  function bindMenuButton(button) {
    button.find('.menu__ico').html(MENU_ICON);
    button.off('hover:enter.lampac-audiobooks click.lampac-audiobooks');
    button.on('hover:enter.lampac-audiobooks click.lampac-audiobooks', openCatalog);
  }

  function createMenuButton() {
    var button = $(
      '<li class="menu__item selector" data-action="lampac-audiobooks">' +
        '<div class="menu__ico">' + MENU_ICON + '</div>' +
        '<div class="menu__text">\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438</div>' +
      '</li>'
    );

    bindMenuButton(button);
    return button;
  }

  function findMenuList() {
    var lists = $('.menu .menu__list, .menu__list');

    for (var i = 0; i < lists.length; i++) {
      var list = $(lists[i]);
      if (list.find('.menu__item').length) return list;
    }

    return lists.eq(0);
  }

  function findMenuAnchor(list) {
    var actions = ['catalog', 'filter', 'tv', 'movie', 'relise', 'anime', 'torrents'];

    for (var i = 0; i < actions.length; i++) {
      var byAction = list.find('[data-action="' + actions[i] + '"]').first();
      if (byAction.length) return byAction;
    }

    var titles = ['\u041a\u0430\u0442\u0430\u043b\u043e\u0433', '\u0424\u0438\u043b\u044c\u0442\u0440', '\u0421\u0435\u0440\u0438\u0430\u043b\u044b', '\u0424\u0438\u043b\u044c\u043c\u044b', '\u0420\u0435\u043b\u0438\u0437\u044b', '\u0410\u043d\u0438\u043c\u0435', '\u0422\u043e\u0440\u0440\u0435\u043d\u0442\u044b'];
    var items = list.find('.menu__item');

    for (var t = 0; t < titles.length; t++) {
      var found = items.filter(function() {
        return $(this).find('.menu__text').text().trim() == titles[t];
      }).first();

      if (found.length) return found;
    }

    return items.last();
  }

  function addMenuButton(attempt) {
    var list = findMenuList();
    var existing;
    var anchor;
    var button;

    if (!list.length) {
      if ((attempt || 0) < 40) {
        setTimeout(function() {
          addMenuButton((attempt || 0) + 1);
        }, 250);
      }
      return;
    }

    existing = $('.menu .menu__item[data-action="lampac-audiobooks"]');
    button = existing.first();
    existing.not(button).remove();

    if (!button.length) button = createMenuButton();
    else bindMenuButton(button);

    anchor = findMenuAnchor(list);

    if (anchor.length) anchor.after(button.detach());
    else list.append(button);

    if ((attempt || 0) < 12) {
      setTimeout(function() {
        addMenuButton((attempt || 0) + 1);
      }, 500);
    }
  }

  function watchMenu() {
    if (!window.MutationObserver || window.lampacAudiobooksMenuWatcher) return;

    var timer = 0;
    window.lampacAudiobooksMenuWatcher = new MutationObserver(function() {
      clearTimeout(timer);
      timer = setTimeout(function() {
        addMenuButton(1000);
      }, 250);
    });

    window.lampacAudiobooksMenuWatcher.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  window.lampacAudiobooksAddMenuButton = addMenuButton;

  function removeWatchButton(render) {
    render.find('.full-start__button').filter(function() {
      var item = $(this);
      var text = item.text().replace(/\s+/g, ' ').trim().toLowerCase();
      var cls = item.attr('class') || '';

      if (item.hasClass('view--audiobook-listen')) return false;
      if (cls.indexOf('button--play') >= 0 || cls.indexOf('view--play') >= 0 || cls.indexOf('view--watch') >= 0) return true;
      if (text == '\u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c' || text == 'watch' || text == 'play') return true;

      return false;
    }).remove();
  }

  function addFullListenButton() {
    if (!Lampa.Listener || window.lampacAudiobooksFullHookVersion == VERSION) return;
    window.lampacAudiobooksFullHookVersion = VERSION;

    Lampa.Listener.follow('full', function(e) {
      if (!e || e.type != 'complite') return;

      var data = e.data || {};
      var movie = data.movie || data.card || data;

      if (!isAudiobookCard(movie)) return;

      setTimeout(function() {
        var render = e.object && e.object.activity && e.object.activity.render ? e.object.activity.render() : $('.full-start').closest('.activity');
        var torrentButton;
        var lastButton;
        var listenButton;

        if (!render || !render.length) return;

        render.find('.view--audiobook-listen').remove();
        removeWatchButton(render);

        listenButton = $(
          '<div class="full-start__button selector view--audiobook-listen button--book">' +
            FULL_ICON +
            '<span>\u0421\u043b\u0443\u0448\u0430\u0442\u044c</span>' +
          '</div>'
        );

        listenButton.on('hover:enter click', function() {
          Lampa.Controller.toggle('content');
          startPlayback(bookFromCard(movie));
        });

        torrentButton = render.find('.view--torrent, .button--torrent').first();

        if (torrentButton.length) {
          torrentButton.before(listenButton);
        } else {
          lastButton = render.find('.full-start__button:last');
          if (lastButton.length) lastButton.after(listenButton);
        }

        try {
          Lampa.Controller.toggle('full_start');
        } catch (err) {}
      }, 80);
    });
  }

  function injectStyles() {
    if ($('#lampac-audiobooks-style').length) return;

    $('body').append(
      '<style id="lampac-audiobooks-style">' +
      '.lampac-audiobooks-list{padding-bottom:2em}' +
      '.lampac-audiobook-card{position:relative;display:flex;align-items:stretch;gap:1.2em;padding:1em 1.2em;margin:0 0 .8em 0;border-radius:.45em;background:rgba(255,255,255,.055);border:2px solid transparent;min-height:11em;overflow:hidden}' +
      '.lampac-audiobook-card.focus,.lampac-audiobook-card:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28)}' +
      '.lampac-audiobook-card__cover{width:7em;min-width:7em;height:9.8em;border-radius:.35em;background:rgba(255,255,255,.08);overflow:hidden}' +
      '.lampac-audiobook-card__cover img{width:100%;height:100%;object-fit:cover;opacity:.01;transition:opacity .2s}' +
      '.lampac-audiobook-card__cover.loaded img{opacity:1}' +
      '.lampac-audiobook-card__body{min-width:0;flex:1;padding-right:8.5em}' +
      '.lampac-audiobook-card__source{font-size:1em;opacity:.55;margin-bottom:.35em}' +
      '.lampac-audiobook-card__title{font-size:1.55em;line-height:1.16;font-weight:600;margin-bottom:.35em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
      '.lampac-audiobook-card__meta{font-size:1.05em;line-height:1.35;opacity:.72;margin-bottom:.55em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.lampac-audiobook-card__descr{font-size:.98em;line-height:1.35;opacity:.52;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}' +
      '.lampac-audiobook-card__action{position:absolute;right:1.2em;top:50%;transform:translateY(-50%);padding:.65em 1.05em;border-radius:.35em;background:#fff;color:#111;font-weight:600;white-space:nowrap}' +
      '.lampac-audiobook-detail{display:flex;gap:2em;align-items:flex-start;padding:1em .3em 1.4em}' +
      '.lampac-audiobook-detail__cover{width:13em;min-width:13em;aspect-ratio:2/3;border-radius:.45em;overflow:hidden;background:rgba(255,255,255,.08)}' +
      '.lampac-audiobook-detail__cover img{width:100%;height:100%;object-fit:cover}' +
      '.lampac-audiobook-detail__body{flex:1;min-width:0}' +
      '.lampac-audiobook-detail__source{font-size:1.1em;opacity:.55;margin-bottom:.5em}' +
      '.lampac-audiobook-detail__title{font-size:2.35em;line-height:1.1;font-weight:700;margin-bottom:.35em}' +
      '.lampac-audiobook-detail__meta{font-size:1.15em;line-height:1.45;opacity:.72;margin-bottom:1em}' +
      '.lampac-audiobook-detail__descr{font-size:1.08em;line-height:1.5;opacity:.68;max-height:13.5em;overflow:hidden}' +
      '.lampac-audiobook-detail__footer{display:flex;margin-top:1.6em}' +
      '.lampac-audiobook-detail__listen{margin:0}' +
      '.player-audiobook-visualizer{position:fixed;left:50%;bottom:9em;transform:translateX(-50%);width:86%;max-width:64em;height:9em;z-index:99999;pointer-events:none;display:block}' +
      '.player-audiobook-visualizer canvas{width:100%;height:100%;display:block;background:transparent}' +
      '.full-start__button.view--audiobook-listen.focus,.full-start__button.view--audiobook-listen:hover{color:#111!important}' +
      '.full-start__button.view--audiobook-listen.focus svg,.full-start__button.view--audiobook-listen:hover svg{color:#111!important;stroke:currentColor!important}' +
      '@media(max-width:700px){.lampac-audiobook-card{gap:.8em;padding:.8em;min-height:9.5em}.lampac-audiobook-card__cover{width:5.8em;min-width:5.8em;height:8.2em}.lampac-audiobook-card__body{padding-right:0}.lampac-audiobook-card__action{position:static;align-self:flex-end;transform:none;margin-left:auto}.lampac-audiobook-card__descr{display:none}.lampac-audiobook-detail{display:block}.lampac-audiobook-detail__cover{width:9em;min-width:9em;margin-bottom:1em}.lampac-audiobook-detail__title{font-size:1.8em}}' +
      '</style>'
    );
  }

  var AudioWave = {
    active: false,
    context: null,
    analyser: null,
    source: null,
    canvas: null,
    ctx: null,
    raf: 0,
    data: null,
    init: function(video) {
      if (!video || this.active) return;
      if (!/\.(mp3|m4a|aac|ogg|wav|flac)(\?|$)/i.test(video.currentSrc || video.src || '')) return;

      this.active = true;
      this.canvas = document.createElement('canvas');
      this.canvas.width = 900;
      this.canvas.height = 140;
      this.ctx = this.canvas.getContext('2d');

      var wrap = document.createElement('div');
      wrap.className = 'player-audiobook-visualizer';
      wrap.appendChild(this.canvas);
      document.body.appendChild(wrap);
      this.wrap = wrap;

      try {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = .84;
        this.source = this.context.createMediaElementSource(video);
        this.source.connect(this.analyser);
        this.analyser.connect(this.context.destination);
        this.data = new Uint8Array(this.analyser.frequencyBinCount);
        this.draw();
      } catch (e) {
        this.destroy();
      }
    },
    draw: function() {
      var self = this;
      var ctx;
      var w;
      var h;
      var step;
      var x;

      if (!this.active || !this.analyser || !this.ctx) return;

      this.raf = requestAnimationFrame(function() {
        self.draw();
      });

      this.analyser.getByteFrequencyData(this.data);
      ctx = this.ctx;
      w = this.canvas.width;
      h = this.canvas.height;
      step = w / this.data.length * 2.4;
      x = 0;

      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < this.data.length; i++) {
        var bar = Math.max(4, this.data[i] / 255 * h);
        var gradient = ctx.createLinearGradient(0, h - bar, 0, h);
        gradient.addColorStop(0, 'rgba(100,180,255,.7)');
        gradient.addColorStop(.4, 'rgba(180,120,255,.65)');
        gradient.addColorStop(.75, 'rgba(255,105,175,.62)');
        gradient.addColorStop(1, 'rgba(255,145,80,.7)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, h - bar, Math.max(2, step - 2), bar);
        x += step;
      }
    },
    toggle: function(play) {
      if (!this.context) return;
      if (play && this.context.state == 'suspended') this.context.resume();
      else if (!play && this.context.state == 'running') this.context.suspend();
    },
    destroy: function() {
      this.active = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.source) {
        try {
          this.source.disconnect();
        } catch (e) {}
      }
      if (this.context) {
        try {
          this.context.close();
        } catch (e) {}
      }
      if (this.wrap) this.wrap.remove();
      this.context = null;
      this.analyser = null;
      this.source = null;
      this.canvas = null;
      this.ctx = null;
      this.wrap = null;
    }
  };

  function integrateVisualizer() {
    if (!Lampa.Player || !Lampa.Player.listener || Lampa.Player._lampacAudiobookVisualizer) return;
    Lampa.Player._lampacAudiobookVisualizer = true;

    Lampa.Player.listener.follow('start', function() {
      setTimeout(function() {
        var video = document.querySelector('.player video') || document.querySelector('video');
        if (!video) return;
        AudioWave.init(video);
        video.addEventListener('play', function() {
          AudioWave.toggle(true);
        });
        video.addEventListener('pause', function() {
          AudioWave.toggle(false);
        });
      }, 700);
    });

    Lampa.Player.listener.follow('destroy', function() {
      AudioWave.destroy();
    });
  }

  function startPlugin() {
    injectStyles();
    patchLampaImageApi();

    var manifest = {
      type: 'other',
      version: VERSION,
      name: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438',
      description: '\u041a\u0430\u0442\u0430\u043b\u043e\u0433 KnigaVuhe + \u043e\u0437\u0432\u0443\u0447\u043a\u0438 Akniga',
      component: COMPONENT
    };

    Lampa.Manifest.plugins = manifest;
    registerAudiobooksSource();
    registerAudiobooksSearchSource();
    patchGlobalSearchRoute();
    addMenuButton();
    scheduleReapplyPluginBindings();
    watchMenu();
    addFullListenButton();
    integrateVisualizer();
  }

  function ready() {
    if (typeof Lampa == 'undefined' || typeof $ == 'undefined') {
      setTimeout(ready, 250);
      return;
    }

    if (window.appready) startPlugin();
    else {
      Lampa.Listener.follow('app', function(e) {
        if (e.type == 'ready') startPlugin();
      });
    }
  }

  ready();
})();
