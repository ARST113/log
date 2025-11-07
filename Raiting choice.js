(function () {
  'use strict';

  var PLUGIN_NAME = 'local_rating_badge_v8_3_safe_cache';
  var DEBUG = false;
  var log = function () {
    if (!DEBUG) return false;
    var args = ['[badge]'].concat(Array.prototype.slice.call(arguments));
    return console.log.apply(console, args);
  };

  /* ========= Storage helpers ========= */
  var Storage = {
    get: function (k, d) {
      try {
        var v = Lampa.Storage.get(k, d);
        return v == null ? d : v;
      } catch (e) {
        return d;
      }
    },
    set: function (k, v) {
      try {
        Lampa.Storage.set(k, v);
      } catch (e) {}
    },
    cache: function (k, m, d) {
      try {
        return Lampa.Storage.cache(k, m, d);
      } catch (e) {
        return d;
      }
    }
  };

  /* ========= ID helpers ========= */
  function collectIds(obj) {
    var raw = [
      obj && obj.id,
      obj && obj.card_id,
      obj && obj.source_id,
      obj && obj.sourceId,
      obj && obj.movie_id,
      obj && obj.movieId,
      obj && obj.number_id,
      obj && obj.original_id,
      obj && obj.tmdb_id,
      obj && obj.tmdbId,
      obj && obj.imdb_id,
      obj && obj.imdbId,
      obj && obj.kinopoisk_id,
      obj && obj.kinopoiskId,
      obj && obj.filmId,
      obj && obj.movie && obj.movie.id,
      obj && obj.source && obj.source.id
    ];
    var ids = [];
    
    raw.forEach(function (v) {
      if (v == null) return;
      var s = String(v).trim();
      if (!s || s === '0' || s === 'NaN') return;
      ids.push(s);
    });
    
    var uniq = [];
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      var item = ids[i];
      if (!seen[item]) {
        seen[item] = true;
        uniq.push(item);
      }
    }
    
    if (DEBUG && uniq.length === 0) {
      log('⚠️ no ids found in', obj);
    }
    return uniq;
  }

  /* ========= Read rating (cache/fields/TMDB fallback) ========= */
  function getRatingFromCard(card, source) {
    if (!card) return 0;

    if (source === 'kp') {
      var kpVal = card.kp_rating || card.kinopoisk_rating || card.kp_rate || card.kinopoisk_rate || card.rating_kp;
      if (kpVal > 0) return parseFloat(kpVal);
    }
    if (source === 'imdb') {
      var imdbVal = card.imdb_rating || card.imdb_rate || card.imdb_vote_average || card.rating_imdb;
      if (imdbVal > 0) return parseFloat(imdbVal);
    }

    var cache = Storage.cache('kp_rating', 1000, {});
    var ids = collectIds(card);
    
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var rec = cache[id];
      if (!rec) continue;
      if (source === 'kp' && rec.kp > 0) return parseFloat(rec.kp);
      if (source === 'imdb' && rec.imdb > 0) return parseFloat(rec.imdb);
    }

    if (source === 'tmdb') {
      if (card.vote_average > 0) return parseFloat(card.vote_average);
      if (card.rating > 0) return parseFloat(card.rating);
      if (card.vote_count > 0) return 5.0;
      if (card.popularity > 10) return 6.0;
      
      var dateStr = card.release_date || card.first_air_date || '';
      var year = dateStr.slice(0, 4);
      var currentYear = new Date().getFullYear();
      
      if (year && currentYear - Number(year) <= 2) return 5.5;
    }
    return 0;
  }

  /* ========= Safe save (only >0) ========= */
  function saveToCacheForAllIds(movie, payload) {
    if (!payload || (!payload.kp && !payload.imdb)) return;
    if (payload.kp <= 0 && payload.imdb <= 0) return;

    var ids = collectIds(movie);
    if (!ids.length) return;
    
    var cache = Storage.cache('kp_rating', 1000, {});
    var now = Date.now();
    
    ids.forEach(function (id) {
      if (!cache[id]) {
        cache[id] = { kp: 0, imdb: 0, timestamp: now };
      }
      if (payload.kp != null && payload.kp > 0) cache[id].kp = payload.kp;
      if (payload.imdb != null && payload.imdb > 0) cache[id].imdb = payload.imdb;
      cache[id].timestamp = now;
    });
    
    Lampa.Storage.set('kp_rating', cache);
    log('💾 saved ratings', payload, ids);
  }

  /* ========= FULL view scraping ========= */
  function normalizeRoot(root) {
    if (typeof root === 'function') {
      try {
        root = root();
      } catch (e) {}
    }
    if (root && typeof root === 'object' && !root.querySelector && root[0]) {
      root = root[0];
    }
    if (!(root instanceof Element)) root = document;
    return root;
  }

  function hookFullScrape() {
    if (!Lampa || !Lampa.Listener || !Lampa.Listener.follow) return;
    
    Lampa.Listener.follow('full', function (e) {
      if (!e || e.type !== 'complite') return;

      var rawRender = e.object && e.object.activity && e.object.activity.render;
      var renderRoot = normalizeRoot(typeof rawRender === 'function' ? rawRender() : rawRender);

      function getRate(selector) {
        try {
          var el = renderRoot.querySelector(selector);
          if (!el) return 0;
          var valDiv = el.querySelector('div');
          if (!valDiv) return 0;
          var text = valDiv.textContent || '';
          var num = parseFloat(text.trim().replace(',', '.'));
          return isNaN(num) ? 0 : num;
        } catch (error) {
          var docEl = document.querySelector(selector);
          var docValDiv = docEl && docEl.querySelector('div');
          var docText = (docValDiv && docValDiv.textContent) || '';
          var docNum = parseFloat(docText.trim().replace(',', '.'));
          return isNaN(docNum) ? 0 : docNum;
        }
      }

      setTimeout(function () {
        var kp = getRate('.full-start__rate.rate--kp');
        var imdb = getRate('.full-start__rate.rate--imdb');
        if (kp > 0 || imdb > 0) {
          var movie = (e.data && e.data.movie) || e.data || {};
          saveToCacheForAllIds(movie, { kp: kp, imdb: imdb });
          var cards = document.querySelectorAll('.card');
          Array.prototype.forEach.call(cards, processCard);
        } else {
          var movieTitle = e.data && e.data.movie && e.data.movie.title;
          log('⚠️ no DOM ratings found for', movieTitle);
        }
      }, 300);
    });
  }

  /* ========= Badge render ========= */
  var TMDB_ICON = 'https://raw.githubusercontent.com/ARST113/Buttons-/refs/heads/main/the_movie_database.svg';
  var BRAND_ICONS = {
    tmdb: TMDB_ICON,
    kp: 'https://raw.githubusercontent.com/ARST113/star/refs/heads/main/kinopoisk-icon-main.svg',
    imdb: 'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg'
  };

  function getPosterContainer(node) {
    return node.querySelector('.card__view, .card__image, .card__img, .poster, .image, .thumb') || node;
  }

  function ensureHost(node) {
    var c = getPosterContainer(node);
    if (!c || !c.appendChild) return null;
    
    try {
      var cs = getComputedStyle(c);
      if (cs.position === 'static') c.style.position = 'relative';
    } catch (e) {}
    
    var host = c.querySelector(':scope > .local-rate-badge');
    if (!host) {
      host = document.createElement('div');
      host.className = 'local-rate-badge';
      host.style.cssText = 'position:absolute;right:8px;bottom:8px;z-index:50;pointer-events:none;';
      c.appendChild(host);
    }
    
    if (!host.shadowRoot) host.attachShadow({ mode: 'open' });
    return host;
  }

  function renderBadge(node, rating, source) {
    var host = ensureHost(node);
    if (!host) return;

    var num = parseFloat(rating) || 0;
    var val = num > 0 ? num.toFixed(1) : '—';
    var icon = BRAND_ICONS[source] || '';

    host.shadowRoot.innerHTML = 
      '<style>' +
        '.b{display:inline-flex;align-items:center;gap:6px;padding:4px 6px;border-radius:10px;' +
        'font:700 12px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;' +
        'color:#fff;pointer-events:none;opacity:0;transform:scale(.95);transition:all .25s ease;}' +
        '.b.show{opacity:1;transform:scale(1);}' +
        '.b.tmdb{background:#0D253F;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 2px 8px rgba(0,0,0,.45);}' +
        '.b.kp{background:#e85d00;padding:4px 6px;}' +
        '.b.imdb{background:#f5c518;color:#000;text-shadow:none;box-shadow:0 0 4px rgba(0,0,0,.3);}' +
        '.logo{display:inline-block;background-size:contain;background-repeat:no-repeat;background-position:center;}' +
        '.b.tmdb .logo{width:46px;height:18px;}' +
        '.b.kp   .logo{width:22px;height:22px;}' +
        '.b.imdb .logo{width:44px;height:18px;}' +
      '</style>' +
      '<div class="b ' + source + '">' +
        '<span>' + val + '</span>' +
        '<span class="logo" style="' + (icon ? 'background-image:url(\'' + icon + '\')' : '') + '" title="' + source.toUpperCase() + '"></span>' +
      '</div>';

    requestAnimationFrame(function () {
      var badge = host.shadowRoot.querySelector('.b');
      if (badge) badge.classList.add('show');
    });
  }

  /* ========= Apply to cards ========= */
  function processCard(node) {
    if (!node || !node.querySelector) return;
    var data = node.card_data || node.data;
    if (!data) return;
    var source = Storage.get('rating_source', 'kp');
    var r = getRatingFromCard(data, source);
    if (DEBUG) log('render card', data.title, source, r);
    renderBadge(node, r, source);
  }

  function hookCards() {
    if (window[PLUGIN_NAME + '_hooked']) return;
    window[PLUGIN_NAME + '_hooked'] = true;

    if (Lampa && Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('card', function (ev) {
        if (ev && ev.type === 'build' && ev.data && ev.data.object) {
          setTimeout(function () {
            processCard(ev.data.object);
          }, 0);
        }
      });
    }

    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains('card')) {
            processCard(n);
          } else if (n.querySelectorAll) {
            var cards = n.querySelectorAll('.card');
            Array.prototype.forEach.call(cards, processCard);
          }
        }
      }
    });
    
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () {
      var cards = document.querySelectorAll('.card');
      Array.prototype.forEach.call(cards, processCard);
    }, 300);
  }

  /* ========= Settings & init ========= */
  function addSettings() {
    if ((!Lampa || !Lampa.SettingsApi || !Lampa.SettingsApi.addParam) && 
        (!Lampa || !Lampa.Settings || !Lampa.Settings.listener || !Lampa.Settings.listener.add)) {
      return;
    }
    
    function addSelect(cfg) {
      if (Lampa.SettingsApi && Lampa.SettingsApi.addParam) {
        Lampa.SettingsApi.addParam({
          component: 'interface',
          param: { name: cfg.name, type: 'select', values: cfg.values, default: cfg.def },
          field: { name: cfg.title, description: cfg.descr },
          onChange: cfg.onChange
        });
      } else if (Lampa.Settings && Lampa.Settings.listener && Lampa.Settings.listener.add) {
        Lampa.Settings.listener.add({
          component: 'main',
          param: { name: cfg.name, type: 'select', values: cfg.values, default: cfg.def },
          field: { name: cfg.title, description: cfg.descr },
          onChange: cfg.onChange
        });
      }
    }
    
    addSelect({
      name: 'rating_source',
      values: { tmdb: 'TMDB', kp: 'Кинопоиск', imdb: 'IMDb' },
      def: Storage.get('rating_source', 'kp'),
      title: 'Источник рейтинга (из кэша)',
      descr: 'Читает кэш rating_kp_imdb; при открытии карточки синхронизирует значения (без перезаписи нулей)',
      onChange: function (v) {
        Storage.set('rating_source', v);
        var cards = document.querySelectorAll('.card');
        Array.prototype.forEach.call(cards, processCard);
      }
    });
  }

  function hideNative() {
    var s = document.createElement('style');
    s.textContent = 
      '.card .card__view .card__vote,' +
      '.card .card__image .card__vote,' +
      '.card .card__img .card__vote { display:none !important; }';
    document.head.appendChild(s);
  }

  function init() {
    if (window[PLUGIN_NAME + '_inited']) return;
    window[PLUGIN_NAME + '_inited'] = true;
    
    hideNative();
    addSettings();
    hookCards();
    hookFullScrape();
  }

  if (window.appready) {
    init();
  } else if (Lampa && Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (e) {
      if (e && e.type === 'ready') init();
    });
  } else {
    setTimeout(init, 1000);
  }
})();
