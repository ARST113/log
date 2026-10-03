(function() {
  'use strict';

  var VERSION = '2.0.11-own-server-key';
  var RUNTIME_KEY = '__lampacAudiobooks2Runtime';
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
    controllerHookInstalled: false,
    playerUiObserver: null,
    fullButtonMissingLogged: false,
    fullRestoreToken: 0,
    fullRestoreUntil: 0,
    lastFullPlaybackBook: null,
    lastFullMovie: null,
    requestCache: {},
    bookCacheOrder: [],
    headPlayer: null,
    headPlayerObserver: null,
    fullTypeCleanupTimer: 0,
    currentAudiobookVoices: []
  };

  window[RUNTIME_KEY] = runtime;
  window.lampacAudiobooks2PluginVersion = VERSION;
  window.lampacAudiobooks2PluginReady = true;

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

    if (runtime.fullTypeCleanupTimer) {
      clearTimeout(runtime.fullTypeCleanupTimer);
      runtime.fullTypeCleanupTimer = 0;
    }

    if (runtime.playerUiObserver && runtime.playerUiObserver.disconnect) {
      try {
        runtime.playerUiObserver.disconnect();
      } catch (e) {}
      runtime.playerUiObserver = null;
    }

    if (runtime.headPlayerObserver && runtime.headPlayerObserver.disconnect) {
      try {
        runtime.headPlayerObserver.disconnect();
      } catch (e) {}
      runtime.headPlayerObserver = null;
    }

    try { $('.lampac-audiobook2-head-player').remove(); } catch (e) {}

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
    if (typeof CURRENT_AUDIOBOOK_VOICES != 'undefined') CURRENT_AUDIOBOOK_VOICES = [];
    if (typeof ACTIVE_AUDIOBOOK_ITEM != 'undefined') ACTIVE_AUDIOBOOK_ITEM = null;
    if (typeof unbindAudiobookProgressMedia != 'undefined') unbindAudiobookProgressMedia();
    runtime.currentAudiobookVoices = [];
  };

  var COMPONENT = 'lampac_audiobooks2';
  var SOURCE = 'lampac_audiobooks2';
  var PAGE_SIZE = 20;
  var DEFAULT_API_BASE = '';
  var PRESET_API_BASE = window.lampacAudiobooks2ApiBase || '';
  var API_BASE = '';
  var API_KEY = '';
  var API_CONFIGURATION_ERROR = 'Укажите адрес своего сервера в window.lampacAudiobooks2ApiBase или загрузите audiobook2.js с собственного бэкенда.';
  var BOOK_CACHE = window.__lampacAudiobooks2BookCache || {};
  window.__lampacAudiobooks2BookCache = BOOK_CACHE;
  var SEARCH_SOURCE = null;
  var CONTINUE_KEY = 'lampac_audiobooks2_continue';
  var REQUEST_CACHE_TTL = 5 * 60 * 1000;
  var BOOK_CACHE_LIMIT = 450;
  var AUDIOBOOK_GENRES = [
    '\u0421\u043e\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0439 \u043b\u044e\u0431\u043e\u0432\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u041f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0442\u0440\u0438\u043b\u043b\u0435\u0440',
    '\u042d\u043f\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u0444\u044d\u043d\u0442\u0435\u0437\u0438',
    '\u041a\u043b\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0434\u0435\u0442\u0435\u043a\u0442\u0438\u0432',
    '\u0418\u0441\u0442\u043e\u0440\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u043b\u044e\u0431\u043e\u0432\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d',
    'Young Adult \u0444\u044d\u043d\u0442\u0435\u0437\u0438',
    '\u0410\u043d\u0442\u0438\u0443\u0442\u043e\u043f\u0438\u044f',
    '\u0421\u0430\u043c\u043e\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435',
    '\u041a\u043e\u0441\u043c\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043e\u043f\u0435\u0440\u0430',
    '\u041c\u0435\u043c\u0443\u0430\u0440\u044b',
    '\u041f\u043e\u043b\u0438\u0446\u0435\u0439\u0441\u043a\u0438\u0439 \u0434\u0435\u0442\u0435\u043a\u0442\u0438\u0432',
    '\u0422\u0451\u043c\u043d\u043e\u0435 \u0444\u044d\u043d\u0442\u0435\u0437\u0438',
    '\u0420\u043e\u043c\u0430\u043d\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0435 \u0444\u044d\u043d\u0442\u0435\u0437\u0438',
    '\u0422\u0440\u0438\u043b\u043b\u0435\u0440 \u043e \u0441\u0435\u0440\u0438\u0439\u043d\u044b\u0445 \u0443\u0431\u0438\u0439\u0446\u0430\u0445',
    '\u0413\u043e\u0440\u043e\u0434\u0441\u043a\u043e\u0435 \u0444\u044d\u043d\u0442\u0435\u0437\u0438',
    '\u0411\u0438\u043e\u0433\u0440\u0430\u0444\u0438\u0438 \u0438 \u0430\u0432\u0442\u043e\u0431\u0438\u043e\u0433\u0440\u0430\u0444\u0438\u0438',
    '\u0418\u0441\u0442\u043e\u0440\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043f\u0440\u043e\u0437\u0430',
    '\u042d\u0440\u043e\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0440\u043e\u043c\u0430\u043d',
    'Young Adult \u043b\u044e\u0431\u043e\u0432\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u0425\u043e\u0440\u0440\u043e\u0440',
    '\u041f\u043e\u0441\u0442\u0430\u043f\u043e\u043a\u0430\u043b\u0438\u043f\u0441\u0438\u0441',
    '\u041a\u0438\u0431\u0435\u0440\u043f\u0430\u043d\u043a',
    '\u041f\u0430\u0440\u0430\u043d\u043e\u0440\u043c\u0430\u043b\u044c\u043d\u044b\u0439 \u043b\u044e\u0431\u043e\u0432\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u041c\u043e\u0442\u0438\u0432\u0430\u0446\u0438\u043e\u043d\u043d\u044b\u0435 \u043a\u043d\u0438\u0433\u0438',
    '\u0414\u0435\u0442\u0441\u043a\u0438\u0435 \u043a\u043d\u0438\u0436\u043a\u0438 \u0441 \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0430\u043c\u0438',
    '\u041c\u0430\u0433\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0440\u0435\u0430\u043b\u0438\u0437\u043c',
    '\u0428\u043f\u0438\u043e\u043d\u0441\u043a\u0438\u0439 \u0442\u0440\u0438\u043b\u043b\u0435\u0440',
    '\u041b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u043d\u0430\u044f \u043f\u0440\u043e\u0437\u0430',
    'True crime',
    '\u041a\u0443\u043b\u0438\u043d\u0430\u0440\u043d\u044b\u0435 \u043a\u043d\u0438\u0433\u0438',
    '\u0418\u0441\u0442\u043e\u0440\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0434\u0435\u0442\u0435\u043a\u0442\u0438\u0432',
    '\u041d\u0430\u0443\u0447\u043d\u043e-\u043f\u043e\u043f\u0443\u043b\u044f\u0440\u043d\u0430\u044f \u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430',
    '\u0420\u043e\u043c\u0430\u043d\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043a\u043e\u043c\u0435\u0434\u0438\u044f',
    'Young Adult \u0430\u043d\u0442\u0438\u0443\u0442\u043e\u043f\u0438\u044f',
    '\u0421\u0435\u043c\u0435\u0439\u043d\u0430\u044f \u0441\u0430\u0433\u0430',
    '\u041c\u0438\u0441\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0442\u0440\u0438\u043b\u043b\u0435\u0440',
    '\u041a\u043d\u0438\u0433\u0438 \u043f\u043e \u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0438\u0438 \u043e\u0442\u043d\u043e\u0448\u0435\u043d\u0438\u0439',
    '\u0424\u044d\u043d\u0442\u0435\u0437\u0438 \u043e \u0434\u0440\u0430\u043a\u043e\u043d\u0430\u0445',
    '\u0421\u043e\u0446\u0438\u0430\u043b\u044c\u043d\u0430\u044f \u043d\u0430\u0443\u0447\u043d\u0430\u044f \u0444\u0430\u043d\u0442\u0430\u0441\u0442\u0438\u043a\u0430',
    '\u041f\u0443\u0442\u0435\u0432\u043e\u0434\u0438\u0442\u0435\u043b\u0438 \u0438 \u0442\u0440\u0430\u0432\u0435\u043b\u043e\u0433\u0438',
    '\u041f\u043e\u0434\u0440\u043e\u0441\u0442\u043a\u043e\u0432\u044b\u0439 \u0434\u0435\u0442\u0435\u043a\u0442\u0438\u0432',
    '\u041b\u044e\u0431\u043e\u0432\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d \u043e \u043c\u0438\u043b\u043b\u0438\u0430\u0440\u0434\u0435\u0440\u0430\u0445',
    '\u0412\u043e\u0435\u043d\u043d\u0430\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f',
    '\u0413\u043e\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u0421\u0442\u0438\u043c\u043f\u0430\u043d\u043a',
    '\u041c\u0435\u0434\u0438\u0446\u0438\u043d\u0441\u043a\u0438\u0439 \u0442\u0440\u0438\u043b\u043b\u0435\u0440',
    '\u041a\u043d\u0438\u0433\u0438 \u043f\u043e \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438 \u0438 \u0442\u0430\u0439\u043c-\u043c\u0435\u043d\u0435\u0434\u0436\u043c\u0435\u043d\u0442\u0443',
    '\u0421\u043f\u043e\u0440\u0442\u0438\u0432\u043d\u044b\u0439 \u043b\u044e\u0431\u043e\u0432\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u0414\u0435\u0442\u0441\u043a\u043e\u0435 \u0444\u044d\u043d\u0442\u0435\u0437\u0438',
    '\u042e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0442\u0440\u0438\u043b\u043b\u0435\u0440',
    '\u0425\u0440\u043e\u043d\u043e\u0444\u0430\u043d\u0442\u0430\u0441\u0442\u0438\u043a\u0430',
    '\u041f\u0440\u0438\u043a\u043b\u044e\u0447\u0435\u043d\u0447\u0435\u0441\u043a\u0430\u044f \u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430',
    '\u042d\u0437\u043e\u0442\u0435\u0440\u0438\u043a\u0430',
    '\u0412\u0434\u043e\u0445\u043d\u043e\u0432\u043b\u044f\u044e\u0449\u0438\u0435 \u043c\u0435\u043c\u0443\u0430\u0440\u044b',
    '\u0420\u043e\u043c\u0430\u043d \u043e\u0442 \u0432\u0440\u0430\u0433\u043e\u0432 \u043a \u0432\u043e\u0437\u043b\u044e\u0431\u043b\u0435\u043d\u043d\u044b\u043c',
    '\u0422\u0432\u0451\u0440\u0434\u0430\u044f \u043d\u0430\u0443\u0447\u043d\u0430\u044f \u0444\u0430\u043d\u0442\u0430\u0441\u0442\u0438\u043a\u0430',
    'Young Adult \u0441\u043e\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u0430\u044f \u043f\u0440\u043e\u0437\u0430',
    '\u0422\u0440\u0438\u043b\u043b\u0435\u0440-\u043a\u0430\u0442\u0430\u0441\u0442\u0440\u043e\u0444\u0430',
    '\u041a\u043d\u0438\u0433\u0438 \u043f\u043e \u0444\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u043e\u0439 \u0433\u0440\u0430\u043c\u043e\u0442\u043d\u043e\u0441\u0442\u0438',
    '\u0424\u044d\u043d\u0442\u0435\u0437\u0438 \u043e \u0444\u0435\u0439\u0440\u0438',
    '\u041a\u043e\u043c\u0438\u043a\u0441\u044b \u0438 \u0433\u0440\u0430\u0444\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u0440\u043e\u043c\u0430\u043d\u044b',
    '\u0420\u0435\u043b\u0438\u0433\u0438\u043e\u0437\u043d\u0430\u044f \u0438 \u0434\u0443\u0445\u043e\u0432\u043d\u0430\u044f \u043b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430',
    'Young Adult \u0445\u043e\u0440\u0440\u043e\u0440',
    '\u0421\u043f\u043e\u0440\u0442\u0438\u0432\u043d\u0430\u044f \u0434\u0440\u0430\u043c\u0430',
    '\u041a\u0443\u043b\u0438\u043d\u0430\u0440\u043d\u0430\u044f \u043f\u0440\u043e\u0437\u0430',
    '\u041f\u043e\u043b\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0442\u0440\u0438\u043b\u043b\u0435\u0440',
    '\u041f\u043e\u043f\u0443\u043b\u044f\u0440\u043d\u0430\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f',
    '\u0414\u0430\u0440\u043a \u0440\u043e\u043c\u0430\u043d\u0441',
    '\u0421\u0431\u043e\u0440\u043d\u0438\u043a\u0438 \u0440\u0430\u0441\u0441\u043a\u0430\u0437\u043e\u0432',
    '\u041d\u0430\u0443\u0447\u043d\u0430\u044f \u0444\u0430\u043d\u0442\u0430\u0441\u0442\u0438\u043a\u0430',
    '\u041f\u043e\u044d\u0437\u0438\u044f',
    '\u042e\u043c\u043e\u0440\u0438\u0441\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043f\u0440\u043e\u0437\u0430',
    '\u0420\u043e\u0436\u0434\u0435\u0441\u0442\u0432\u0435\u043d\u0441\u043a\u0438\u0439 \u043b\u044e\u0431\u043e\u0432\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u041a\u0440\u0438\u043c\u0438\u043d\u0430\u043b\u044c\u043d\u0430\u044f \u0436\u0443\u0440\u043d\u0430\u043b\u0438\u0441\u0442\u0438\u043a\u0430',
    '\u0417\u0434\u043e\u0440\u043e\u0432\u044c\u0435, \u0444\u0438\u0442\u043d\u0435\u0441 \u0438 \u043f\u0438\u0442\u0430\u043d\u0438\u0435',
    '\u0412\u0430\u043c\u043f\u0438\u0440\u0441\u043a\u0438\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u041f\u043e\u043f\u0443\u043b\u044f\u0440\u043d\u0430\u044f \u0444\u0438\u043b\u043e\u0441\u043e\u0444\u0438\u044f',
    '\u0414\u0435\u0442\u0435\u043a\u0442\u0438\u0432-\u043d\u0443\u0430\u0440',
    '\u041a\u043d\u0438\u0433\u0438 \u043f\u043e \u043b\u0438\u0434\u0435\u0440\u0441\u0442\u0432\u0443',
    '\u041b\u0438\u0442\u0420\u041f\u0413',
    '\u0421\u043a\u0430\u043d\u0434\u0438\u043d\u0430\u0432\u0441\u043a\u0438\u0439 \u043d\u0443\u0430\u0440',
    'New Adult \u0430\u043d\u0442\u0438\u0443\u0442\u043e\u043f\u0438\u044f',
    '\u0412\u043e\u0435\u043d\u043d\u0430\u044f \u043f\u0440\u043e\u0437\u0430',
    '\u0418\u0441\u043a\u0443\u0441\u0441\u0442\u0432\u043e \u0438 \u0444\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u044f',
    '\u041c\u043e\u0440\u0441\u043a\u0438\u0435 \u043f\u0440\u0438\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f',
    '\u041a\u043b\u0438\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u0444\u0430\u043d\u0442\u0430\u0441\u0442\u0438\u043a\u0430',
    '\u0421\u0430\u0442\u0438\u0440\u0430',
    '\u0420\u0443\u043a\u043e\u0434\u0435\u043b\u0438\u0435 \u0438 \u0445\u043e\u0431\u0431\u0438',
    '\u041c\u0435\u0434\u0438\u0442\u0430\u0446\u0438\u044f \u0438 \u043e\u0441\u043e\u0437\u043d\u0430\u043d\u043d\u043e\u0441\u0442\u044c',
    '\u041a\u0438\u0431\u0435\u0440\u0442\u0440\u0438\u043b\u043b\u0435\u0440',
    '\u041b\u0438\u0442\u0435\u0440\u0430\u0442\u0443\u0440\u0430 \u043e \u043f\u0443\u0442\u0435\u0448\u0435\u0441\u0442\u0432\u0438\u044f\u0445',
    '\u042d\u043f\u0438\u0441\u0442\u043e\u043b\u044f\u0440\u043d\u044b\u0439 \u0440\u043e\u043c\u0430\u043d',
    '\u0422\u0440\u0438\u043b\u043b\u0435\u0440 \u043e \u0432\u044b\u0436\u0438\u0432\u0430\u043d\u0438\u0438',
    '\u0414\u0440\u0430\u043c\u0430\u0442\u0443\u0440\u0433\u0438\u044f',
    '\u0420\u043e\u043c\u0430\u043d \u0432\u0437\u0440\u043e\u0441\u043b\u0435\u043d\u0438\u044f',
    '\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043d\u0430\u0443\u043a\u0438',
    '\u041a\u043d\u0438\u0433\u0438 \u0434\u043b\u044f \u0440\u043e\u0434\u0438\u0442\u0435\u043b\u0435\u0439',
    '\u041d\u043e\u0432\u0435\u043b\u043b\u0438\u0437\u0430\u0446\u0438\u0438',
    '\u0410\u043b\u044c\u0442\u0435\u0440\u043d\u0430\u0442\u0438\u0432\u043d\u0430\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f',
    '\u042d\u0441\u0441\u0435\u0438\u0441\u0442\u0438\u043a\u0430 \u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u043f\u0440\u043e\u0437\u0430'
  ];
  var AUDIOBOOK_MAIN_ROWS = [
    { title: '\u041d\u043e\u0432\u0438\u043d\u043a\u0438 \u0438 \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0435', query: '' },
    { title: '\u0424\u0430\u043d\u0442\u0430\u0441\u0442\u0438\u043a\u0430 \u0438 \u0444\u044d\u043d\u0442\u0435\u0437\u0438', query: '\u0444\u0430\u043d\u0442\u0430\u0441\u0442\u0438\u043a\u0430 \u0444\u044d\u043d\u0442\u0435\u0437\u0438' },
    { title: '\u0414\u0435\u0442\u0435\u043a\u0442\u0438\u0432\u044b \u0438 \u0442\u0440\u0438\u043b\u043b\u0435\u0440\u044b', query: '\u0434\u0435\u0442\u0435\u043a\u0442\u0438\u0432 \u0442\u0440\u0438\u043b\u043b\u0435\u0440' },
    { title: '\u041f\u0440\u0438\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f', query: '\u043f\u0440\u0438\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f' },
    { title: '\u041a\u043b\u0430\u0441\u0441\u0438\u043a\u0430', query: '\u043a\u043b\u0430\u0441\u0441\u0438\u043a\u0430' },
    { title: '\u0414\u0435\u0442\u0441\u043a\u043e\u0435', query: '\u0434\u0435\u0442\u0441\u043a\u0438\u0435 \u0441\u043a\u0430\u0437\u043a\u0438' },
    { title: '\u041f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0438\u044f \u0438 \u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435', query: '\u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0438\u044f \u0441\u0430\u043c\u043e\u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435' },
    { title: '\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0438 \u0431\u0438\u043e\u0433\u0440\u0430\u0444\u0438\u0438', query: '\u0438\u0441\u0442\u043e\u0440\u0438\u044f \u0431\u0438\u043e\u0433\u0440\u0430\u0444\u0438\u044f \u043c\u0435\u043c\u0443\u0430\u0440\u044b' },
    { title: '\u0423\u0436\u0430\u0441\u044b \u0438 \u043c\u0438\u0441\u0442\u0438\u043a\u0430', query: '\u0443\u0436\u0430\u0441\u044b \u043c\u0438\u0441\u0442\u0438\u043a\u0430' },
    { title: '\u041b\u0438\u0442\u0420\u041f\u0413 \u0438 \u043f\u043e\u043f\u0430\u0434\u0430\u043d\u0446\u044b', query: '\u043b\u0438\u0442\u0440\u043f\u0433 \u043f\u043e\u043f\u0430\u0434\u0430\u043d\u0446\u044b' }
  ];
  AUDIOBOOK_GENRES = AUDIOBOOK_MAIN_ROWS.filter(function(row) {
    return !!row.query;
  }).map(function(row) {
    return row.title;
  });
  var SOURCE_TITLE = {
    all: '\u0412\u0441\u0435 \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438',
    audio_fdb: 'AudioBook 2',
    izibuk_graphql: 'IziBuk',
    pda_izibuk_html: 'IziBuk PDA',
    archive_org: 'Archive.org',
    akniga: 'Akniga',
    knigavuhe: '\u041a\u043d\u0438\u0433\u0430 \u0432 \u0443\u0445\u0435',
    yakniga: 'YaKniga',
    audioboo_org: 'Audioboo',
    poleknig_com: 'PoleKnig',
    otrub_in: 'Otrub',
    slushat_knigi_com: 'Slushat Knigi',
    slushkinvsem_ru: 'Slushkinvsem',
    audioknigi_pro: 'Audioknigi Pro',
    audioknigivse_ru: 'AudioknigiVse',
    aume_ru: 'Aume',
    knigoblud_club: 'Knigoblud',
    baza_knig_rip: 'Baza Knig',
    uknig_com: 'UKnig',
    mp3knig_net: 'MP3Knig',
    audiokniga_one: 'Audiokniga One',
    listenbook_ru: 'ListenBook',
    lis10book_com: 'Lis10Book',
    m_knigavuhe_org: '\u041a\u043d\u0438\u0433\u0430 \u0432 \u0443\u0445\u0435',
    audiopolka_club: 'Audiopolka',
    author_today_fantlab: 'Author.Today / FantLab'
  };
  var FDB_PROVIDER_MENU = [
    { id: 'all', title: SOURCE_TITLE.all },
    { id: 'izibuk_graphql', title: SOURCE_TITLE.izibuk_graphql },
    { id: 'archive_org', title: SOURCE_TITLE.archive_org },
    { id: 'akniga', title: SOURCE_TITLE.akniga },
    { id: 'knigavuhe', title: SOURCE_TITLE.knigavuhe },
    { id: 'yakniga', title: SOURCE_TITLE.yakniga },
    { id: 'pda_izibuk_html', title: SOURCE_TITLE.pda_izibuk_html },
    { id: 'lis10book_com', title: SOURCE_TITLE.lis10book_com },
    { id: 'poleknig_com', title: SOURCE_TITLE.poleknig_com },
    { id: 'uknig_com', title: SOURCE_TITLE.uknig_com },
    { id: 'knigoblud_club', title: SOURCE_TITLE.knigoblud_club },
    { id: 'audioboo_org', title: SOURCE_TITLE.audioboo_org },
    { id: 'slushat_knigi_com', title: SOURCE_TITLE.slushat_knigi_com },
    { id: 'slushkinvsem_ru', title: SOURCE_TITLE.slushkinvsem_ru },
    { id: 'audioknigi_pro', title: SOURCE_TITLE.audioknigi_pro },
    { id: 'audioknigivse_ru', title: SOURCE_TITLE.audioknigivse_ru },
    { id: 'audiokniga_one', title: SOURCE_TITLE.audiokniga_one },
    { id: 'baza_knig_rip', title: SOURCE_TITLE.baza_knig_rip },
    { id: 'listenbook_ru', title: SOURCE_TITLE.listenbook_ru },
    { id: 'mp3knig_net', title: SOURCE_TITLE.mp3knig_net },
    { id: 'otrub_in', title: SOURCE_TITLE.otrub_in },
    { id: 'aume_ru', title: SOURCE_TITLE.aume_ru }
  ];

  window.lampacAudiobooks2Debug = {
    version: VERSION,
    apiBase: API_BASE,
    defaultApiBase: DEFAULT_API_BASE
  };

  function audiobookDebugEnabled() {
    try {
      if (window.lampacAudiobooks2DebugEnabled === true) return true;
      if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return Lampa.Storage.get('lampac_audiobooks2_debug', '0') == '1';
    } catch (e) {}
    return false;
  }

  function audiobookUiLog(event, details) {
    if (!audiobookDebugEnabled() || !window.console || !console.log) return;
    try {
      console.log('[Audiobooks][PlayerUI] ' + event, details || {});
    } catch (e) {}
  }

  function audiobookFullButtonLog(event, details) {
    if (!audiobookDebugEnabled() || !window.console || !console.log) return;
    try {
      console.log('[Audiobooks][FullButton] ' + event, details || {});
    } catch (e) {}
  }

  function cleanApiBase(value) {
    value = (value || '').toString().replace(/^\s+|\s+$/g, '').replace(/\/+$/, '');
    return /^https?:\/\/[^\/?#\s]+(?:\/[^?#\s]*)?$/i.test(value) ? value : '';
  }

  function pluginScriptSource() {
    var src = '';
    var scripts;

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

    return src;
  }

  function scriptApiBase() {
    var src = pluginScriptSource();
    var match;

    match = src.match(/[?&](?:api|server)=([^&#]+)/i);
    if (match && match[1]) {
      try {
        return cleanApiBase(decodeURIComponent(match[1]));
      } catch (e) {
        return cleanApiBase(match[1]);
      }
    }

    match = src.match(/^(https?:\/\/[^?#]+)\/[^\/?#]+(?:[?#]|$)/i);
    return match && match[1] ? cleanApiBase(match[1]) : '';
  }

  function detectApiBase() {
    if (PRESET_API_BASE) return cleanApiBase(PRESET_API_BASE);
    return scriptApiBase();
  }

  function detectApiKey() {
    var match;
    if (window.lampacAudiobooks2ApiKey) return window.lampacAudiobooks2ApiKey.toString();
    match = pluginScriptSource().match(/[?&]api_key=([^&#]+)/i);
    if (match && match[1]) {
      try { return decodeURIComponent(match[1]); } catch (e) { return ''; }
    }
    try {
      if (window.Lampa && Lampa.Storage && Lampa.Storage.get) return (Lampa.Storage.get('audiobooks2_api_key', '') || '').toString();
    } catch (e) {}
    return '';
  }

  API_BASE = detectApiBase();
  API_KEY = detectApiKey();
  window.lampacAudiobooks2ApiBase = API_BASE;
  window.lampacAudiobooks2Debug.apiBase = API_BASE;
  window.lampacAudiobooks2Debug.configurationError = API_BASE ? '' : API_CONFIGURATION_ERROR;

  function addParam(url, key, value) {
    if (value === undefined || value === null || value === '') return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }

  function withApiKey(url) {
    if (!API_KEY || !API_BASE || /[?&]api_key=/i.test(url)) return url;
    if (url !== API_BASE && url.indexOf(API_BASE + '/') !== 0 && url.indexOf(API_BASE + '?') !== 0) return url;
    return addParam(url, 'api_key', API_KEY);
  }

  function absoluteUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return withApiKey(url);
    if (url.indexOf('//') === 0) return withApiKey((location.protocol || 'https:') + url);
    if (url.charAt(0) === '/') return withApiKey(API_BASE + url);
    return API_BASE ? withApiKey(API_BASE + '/' + url.replace(/^\/+/, '')) : url;
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

    if (pos >= 0) return absoluteUrl(value.slice(pos));
    return absoluteUrl(value);
  }

  function patchLampaImageApi() {
    if (!Lampa.Api || !Lampa.Api.img || Lampa.Api._lampacAudiobooks2ImagePatch) return;

    var original = Lampa.Api.img;

    Lampa.Api.img = function(url, size) {
      var direct = normalizeAudiobookImageUrl(url);

      if (direct) return direct;

      return original.apply(this, arguments);
    };

    Lampa.Api._lampacAudiobooks2ImagePatch = true;
  }

  function audioUrl(url) {
    var full = absoluteUrl(url);
    var origin = API_BASE;

    if (!full) return '';

    origin = origin.replace(/\/$/, '');

    if (/^https?:\/\//i.test(full) && origin && full.indexOf(origin + '/') !== 0) {
      return apiUrl('/audiobooks/audio', { url: full });
    }

    return full;
  }

  function apiUrl(path, params) {
    if (!API_BASE) throw new Error(API_CONFIGURATION_ERROR);
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

    return withApiKey(url);
  }

  function escapeHtml(value) {
    return $('<div>').text(value || '').html();
  }

  function shortText(value, length) {
    value = (value || '').replace(/\s+/g, ' ').trim();
    if (!length || value.length <= length) return value;
    return value.slice(0, length - 1).trim() + '\u2026';
  }

  function firstAuthorName(value) {
    return (value || '').toString().split(/[;,]/)[0].replace(/\s+/g, ' ').trim();
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
    return Lampa.Utils.hash(['audiobook2', book.source || 'audio_fdb', book.url || book.name || ''].join(':'));
  }

  function jsonClone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
  }

  function cacheableRequest(url) {
    return /\/audio\/(?:search|catalog|work\/)/i.test(url || '');
  }

  function cachedJSON(url) {
    var item = runtime.requestCache && runtime.requestCache[url];
    if (!item || Date.now() - item.time > REQUEST_CACHE_TTL) return null;
    return jsonClone(item.data);
  }

  function saveJSONCache(url, data) {
    if (!cacheableRequest(url)) return;
    runtime.requestCache = runtime.requestCache || {};
    runtime.requestCache[url] = { time: Date.now(), data: jsonClone(data) };
    var keys = Object.keys(runtime.requestCache);
    if (keys.length > 160) {
      keys.sort(function(a, b) { return runtime.requestCache[b].time - runtime.requestCache[a].time; });
      keys.slice(160).forEach(function(key) { delete runtime.requestCache[key]; });
    }
  }

  function limitBookCache() {
    var keys = Object.keys(BOOK_CACHE || {});
    if (keys.length <= BOOK_CACHE_LIMIT) return;
    keys.slice(0, Math.max(0, keys.length - BOOK_CACHE_LIMIT)).forEach(function(key) {
      try { delete BOOK_CACHE[key]; } catch (e) {}
    });
  }

  function requestJSON(url, onDone, onError, timeout) {
    var cached = cacheableRequest(url) ? cachedJSON(url) : null;
    if (cached !== null) {
      setTimeout(function() { onDone(cached); }, 0);
      return { clear: function() {} };
    }
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

      saveJSONCache(url, data);
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

  function secondsToClock(seconds) {
    seconds = parseInt(seconds || 0, 10) || 0;
    if (!seconds) return '';
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    if (h && m) return h + ' \u0447 ' + m + ' \u043c\u0438\u043d';
    if (h) return h + ' \u0447';
    return m + ' \u043c\u0438\u043d';
  }

  function displayNames(list) {
    if (!Array.isArray(list)) return '';
    return list.map(function(item) {
      return item && (item.display_name || item.name || item.title) || '';
    }).filter(Boolean).join(', ');
  }

  function chooseEdition(work, preferredEditionId) {
    var editions = work && Array.isArray(work.editions) ? work.editions : [];
    if (!editions.length) return null;
    if (preferredEditionId) {
      for (var i = 0; i < editions.length; i++) {
        if (editions[i] && editions[i].id == preferredEditionId) return editions[i];
      }
    }
    editions = editions.slice(0);
    editions.sort(function(a, b) {
      var ac = ((a.sources || [])[0] && (a.sources || [])[0].chapters || []).length || a.chapter_count || 0;
      var bc = ((b.sources || [])[0] && (b.sources || [])[0].chapters || []).length || b.chapter_count || 0;
      if (bc != ac) return bc - ac;
      return (parseFloat(b.quality_score || 0) || 0) - (parseFloat(a.quality_score || 0) || 0);
    });
    return editions[0];
  }

  function chooseSource(edition, preferredSourceId) {
    var sources = edition && Array.isArray(edition.sources) ? edition.sources : [];
    if (!sources.length) return null;
    if (preferredSourceId) {
      for (var i = 0; i < sources.length; i++) {
        if (sources[i] && sources[i].id == preferredSourceId) return sources[i];
      }
    }
    sources = sources.slice(0);
    sources.sort(function(a, b) {
      return ((b.chapters || []).length || 0) - ((a.chapters || []).length || 0);
    });
    return sources[0];
  }

  function bookFromFdbWork(work, preferredEditionId, preferredSourceId) {
    work = work || {};
    var edition = chooseEdition(work, preferredEditionId) || {};
    var source = chooseSource(edition, preferredSourceId) || {};
    var chapters = Array.isArray(source.chapters) ? source.chapters.slice(0) : [];
    var voiceCount = 0;
    var sourceCount = 0;
    chapters.sort(function(a, b) {
      return (parseInt(a.chapter_index, 10) || 0) - (parseInt(b.chapter_index, 10) || 0);
    });

    (work.editions || []).forEach(function(item) {
      var hasPlayable = false;
      (item.sources || []).forEach(function(src) {
        if ((src.chapters || []).some(function(chapter) { return !!(chapter.proxy_url || chapter.audio_url); })) {
          hasPlayable = true;
          sourceCount++;
        }
      });
      if (hasPlayable) voiceCount++;
    });

    return {
      source: source.provider || 'audio_fdb',
      url: work.id || source.page_url || source.external_id || '',
      fdb_work_id: work.id || '',
      fdb_edition_id: edition.id || '',
      fdb_source_id: source.id || '',
      fdb_series_id: work.series && work.series.id || '',
      author: displayNames(work.authors),
      name: work.title || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430',
      seriesName: work.series && work.series.title || '',
      numberInSeries: '',
      description: work.description || '',
      reader: displayNames(edition.narrators),
      duration: secondsToClock(edition.duration_seconds),
      preview: work.poster_url || '',
      genres: displayNames(work.genres),
      voiceCount: voiceCount,
      sourceCount: sourceCount,
      _fdb_work: work,
      items: chapters.map(function(chapter, index) {
        var seconds = parseInt(chapter.duration_seconds || 0, 10) || 0;
        return {
          fileurl: chapter.proxy_url || chapter.audio_url || '',
          fileIndex: parseInt(chapter.chapter_index, 10) || index,
          title: chapter.title || ('\u0413\u043b\u0430\u0432\u0430 ' + (index + 1)),
          startTime: 0,
          endTime: seconds
        };
      })
    };
  }

  function booksFromFdbWork(work) {
    var result = [];
    var editions = work && Array.isArray(work.editions) ? work.editions : [];

    editions.forEach(function(edition) {
      (edition.sources || []).forEach(function(source) {
        result.push(bookFromFdbWork(work, edition.id, source.id));
      });
    });

    if (!result.length) result.push(bookFromFdbWork(work));
    return result;
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
      audiobook2_url: book.url || '',
      audiobook2_source: book.source || 'audio_fdb',
      audiobook_reader: book.reader || '',
      audiobook_duration: book.duration || '',
      audiobook_series: book.seriesName || '',
      audiobook_number: book.numberInSeries || '',
      audiobook_fdb_work_id: book.fdb_work_id || '',
      audiobook_fdb_edition_id: book.fdb_edition_id || '',
      audiobook_fdb_source_id: book.fdb_source_id || '',
      audiobook_fdb_series_id: book.fdb_series_id || '',
      audiobook_book: book,
      params: {
        emit: {
          onCreate: function() {
            var root = this.html && this.html.jquery ? this.html : $(this.html);
            root.addClass('card--lampac-audiobook2');
            root.attr('data-lampac-audiobook2-card', '1');
            root.find('.card__type,[class*="card__type"]').remove();
          }
        }
      }
    };

    ensureLampaCardDefaults(card);

    BOOK_CACHE[id] = book;
    if (book.url) BOOK_CACHE[book.url] = book;
    limitBookCache();

    return card;
  }

  function bookFromCard(card) {
    card = card || {};

    var remembered = card.audiobook_book ||
      BOOK_CACHE[card.id] ||
      BOOK_CACHE[card.audiobook2_url] ||
      BOOK_CACHE[card.audiobook_url] ||
      findContinueBookForCard(card);

    return remembered ||
      {
        source: card.audiobook2_source || card.audiobook_source || 'audio_fdb',
        url: card.audiobook2_url || card.audiobook_url || '',
        fdb_work_id: card.audiobook_fdb_work_id || card.audiobook2_url || card.audiobook_url || '',
        fdb_edition_id: card.audiobook_fdb_edition_id || '',
        fdb_source_id: card.audiobook_fdb_source_id || '',
        fdb_series_id: card.audiobook_fdb_series_id || '',
        name: card.title || card.name || '',
        author: card.original_title || card.original_name || '',
        reader: card.audiobook_reader || '',
        duration: card.audiobook_duration || '',
        preview: card.img || card.poster || card.poster_path || '',
        seriesName: card.audiobook_series || '',
        description: card.overview || card.description || ''
      };
  }


  function continueBookId(book) {
    var workId;
    var url;
    var title;
    var author;

    book = book || {};
    workId = book.fdb_work_id || book.audiobook_fdb_work_id || '';
    url = book.url || book.audiobook2_url || book.audiobook_url || '';
    title = normalize(book.name || book.title || '');
    author = normalizePerson(book.author || book.original_title || book.original_name || '');

    /*
     * Continue list identity must be book-level, not voice/source-level.
     * FDB editions and provider sources are different voices of the same work.
     */
    if (workId) return 'work:' + workId;
    if (/^work:/i.test(url || '')) return 'work:' + url;
    if (title) return 'title:' + title + '|author:' + author;

    return [book.source || 'audio_fdb', url || book.name || ''].join('|');
  }

  function dedupeContinueBooks(list) {
    var result = [];
    var exists = {};

    if (!Array.isArray(list)) return result;

    list.forEach(function(item) {
      var id;

      if (!item || typeof item != 'object') return;

      id = continueBookId(item);
      if (!id) return;

      if (exists[id]) return;
      exists[id] = true;
      result.push(item);
    });

    return result;
  }

  function loadContinueBooks() {
    var value = [];
    try {
      value = Lampa.Storage && Lampa.Storage.get ? Lampa.Storage.get(CONTINUE_KEY, []) : [];
      if (typeof value == 'string') value = JSON.parse(value || '[]');
    } catch (e) { value = []; }
    return dedupeContinueBooks(Array.isArray(value) ? value : []);
  }

  function saveContinueBooks(list) {
    try { if (Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set(CONTINUE_KEY, dedupeContinueBooks(list || []).slice(0, 60)); } catch (e) {}
  }

  function rememberAudiobook(book, meta) {
    if (!book) return;
    var clone;
    try { clone = JSON.parse(JSON.stringify(book)); } catch (e) { clone = book; }

    meta = meta || {};
    clone.source = clone.source || 'audio_fdb';
    clone._listened_at = Date.now();
    clone._last_chapter = meta.chapter || meta.title || clone._last_chapter || '';
    clone._last_chapter_index = parseInt(meta.chapter_index || clone._last_chapter_index || 0, 10) || 0;
    clone._last_file_index = parseInt(meta.file_index || meta.fileIndex || clone._last_file_index || 0, 10) || 0;

    if (typeof meta.time !== 'undefined') clone._last_time = parseFloat(meta.time || 0) || 0;
    else clone._last_time = parseFloat(clone._last_time || 0) || 0;

    if (typeof meta.percent !== 'undefined') clone._last_percent = parseInt(meta.percent || 0, 10) || 0;
    else clone._last_percent = parseInt(clone._last_percent || 0, 10) || 0;

    if (typeof meta.media_duration !== 'undefined') clone._last_media_duration = parseFloat(meta.media_duration || 0) || 0;
    else clone._last_media_duration = parseFloat(clone._last_media_duration || 0) || 0;

    clone._last_voice_key = meta.voice_key || clone._last_voice_key || '';
    clone._last_voice_title = meta.voice_title || clone._last_voice_title || '';
    clone._last_reader = meta.reader || clone._last_reader || clone.reader || '';
    clone._last_fdb_edition_id = meta.fdb_edition_id || clone._last_fdb_edition_id || clone.fdb_edition_id || '';
    clone._last_fdb_source_id = meta.fdb_source_id || clone._last_fdb_source_id || clone.fdb_source_id || '';
    clone._last_source = meta.source || clone._last_source || clone.source || '';

    var id = continueBookId(clone);
    var list = loadContinueBooks().filter(function(item) { return continueBookId(item) != id; });
    list.unshift(clone);
    saveContinueBooks(list);
  }

  function continueCards() {
    return loadContinueBooks().map(function(book) { return cardFromBook(book); });
  }

  function findContinueBookForCard(card) {
    card = card || {};

    var workId = card.audiobook_fdb_work_id || card.audiobook2_url || card.audiobook_url || '';
    var title = normalize(card.title || card.name || '');
    var author = normalizePerson(card.original_title || card.original_name || '');
    var list = loadContinueBooks();

    for (var i = 0; i < list.length; i++) {
      var book = list[i] || {};
      if (workId && (book.fdb_work_id == workId || book.url == workId)) return book;
      if (title && normalize(book.name || '') == title) {
        var bookAuthor = normalizePerson(book.author || '');
        if (!author || !bookAuthor || author == bookAuthor) return book;
      }
    }

    return null;
  }

  function findContinueBookForBook(book) {
    book = book || {};

    var directId = continueBookId(book);
    var workId = book.fdb_work_id || book.url || '';
    var title = normalize(book.name || '');
    var author = normalizePerson(book.author || '');
    var list = loadContinueBooks();

    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};

      if (directId && continueBookId(item) == directId) return item;
      if (workId && (item.fdb_work_id == workId || item.url == workId)) return item;
      if (title && normalize(item.name || '') == title) {
        var itemAuthor = normalizePerson(item.author || '');
        if (!author || !itemAuthor || author == itemAuthor) return item;
      }
    }

    return null;
  }

  function mergeResumeBook(primary, fallback) {
    var result = {};
    var key;

    fallback = fallback || {};
    primary = primary || {};

    for (key in fallback) if (fallback.hasOwnProperty(key)) result[key] = fallback[key];
    for (key in primary) if (primary.hasOwnProperty(key) && typeof primary[key] != 'undefined' && primary[key] !== null && primary[key] !== '') result[key] = primary[key];

    return result;
  }

  function voiceResumeScore(voice, resumeBook) {
    var book = voice && voice.book ? voice.book : {};
    var score = 0;

    resumeBook = resumeBook || {};
    if (!voice) return 0;

    if (resumeBook._last_voice_key && voice.key && resumeBook._last_voice_key == voice.key) score += 1000;
    if (resumeBook._last_fdb_source_id && book.fdb_source_id && resumeBook._last_fdb_source_id == book.fdb_source_id) score += 900;
    if (resumeBook.fdb_source_id && book.fdb_source_id && resumeBook.fdb_source_id == book.fdb_source_id) score += 850;
    if (resumeBook._last_fdb_edition_id && book.fdb_edition_id && resumeBook._last_fdb_edition_id == book.fdb_edition_id) score += 700;
    if (resumeBook.fdb_edition_id && book.fdb_edition_id && resumeBook.fdb_edition_id == book.fdb_edition_id) score += 650;
    if (resumeBook._last_voice_title && voice.title && resumeBook._last_voice_title == voice.title) score += 600;
    if (resumeBook._last_reader && book.reader && normalizePerson(resumeBook._last_reader) == normalizePerson(book.reader)) score += 300;
    if (resumeBook.reader && book.reader && normalizePerson(resumeBook.reader) == normalizePerson(book.reader)) score += 250;
    if (resumeBook.source && book.source && resumeBook.source == book.source) score += 50;

    return score;
  }

  function chooseResumeVoice(voices, book) {
    var remembered = findContinueBookForBook(book) || null;
    var resumeBook = mergeResumeBook(remembered || {}, book || {});
    var best = voices && voices.length ? voices[0] : null;
    var bestScore = -1;

    (voices || []).forEach(function(voice) {
      var score = voiceResumeScore(voice, resumeBook);
      if (score > bestScore) {
        bestScore = score;
        best = voice;
      }
    });

    return {
      voice: best,
      resumeBook: bestScore > 0 ? resumeBook : (remembered || book || {})
    };
  }

  function resolveResumePlaylistIndex(playlist, resumeBook) {
    var index;
    var fileIndex;
    var chapter;

    playlist = playlist || [];
    resumeBook = resumeBook || {};

    index = parseInt(resumeBook._last_chapter_index || 0, 10) || 0;
    if (index > 0 && playlist[index - 1]) return index - 1;

    if (typeof resumeBook._last_file_index !== 'undefined' && resumeBook._last_file_index !== '') {
      fileIndex = parseInt(resumeBook._last_file_index || 0, 10) || 0;
      for (var i = 0; i < playlist.length; i++) {
        if (parseInt(playlist[i].audiobook_file_index || 0, 10) == fileIndex) return i;
      }
    }

    chapter = normalize(resumeBook._last_chapter || '');
    if (chapter) {
      for (var j = 0; j < playlist.length; j++) {
        if (normalize(playlist[j].title || playlist[j].name || '') == chapter) return j;
      }
    }

    return 0;
  }

  function resolveResumeTime(item, resumeBook) {
    var time = 0;

    resumeBook = resumeBook || {};

    if (typeof resumeBook._last_time !== 'undefined') {
      time = parseFloat(resumeBook._last_time || 0) || 0;
      if (time > 0) return time;
    }

    try {
      if (item && item.timeline && item.timeline.time) time = parseFloat(item.timeline.time || 0) || 0;
    } catch (e) {
      time = 0;
    }

    return time > 0 ? time : 0;
  }

  function captureCurrentAudiobookResume() {
    var media = audiobookCurrentMedia();
    var item = ACTIVE_AUDIOBOOK_ITEM || null;
    var meta;

    saveActiveAudiobookProgress(true);

    if (!item) return {};

    meta = getAudiobookMeta(item);

    if (media && isFinite(media.currentTime)) {
      meta.time = parseFloat(media.currentTime || 0) || 0;
      if (isFinite(media.duration) && media.duration > 0) {
        meta.media_duration = media.duration;
        meta.percent = Math.max(0, Math.min(100, Math.round((meta.time / media.duration) * 100)));
      }
    }

    return {
      _last_chapter: meta.chapter || '',
      _last_chapter_index: meta.chapter_index || 0,
      _last_file_index: meta.file_index || 0,
      _last_time: meta.time || 0,
      _last_percent: meta.percent || 0,
      _last_media_duration: meta.media_duration || 0,
      _last_voice_key: meta.voice_key || '',
      _last_voice_title: meta.voice_title || '',
      _last_reader: meta.reader || '',
      _last_fdb_edition_id: meta.fdb_edition_id || '',
      _last_fdb_source_id: meta.fdb_source_id || '',
      _last_source: meta.source || ''
    };
  }


  function isAudiobookCard(card) {
    return !!(card && (
      card.source == SOURCE ||
      card.audiobook_book ||
      card.audiobook_fdb_work_id ||
      card.audiobook2_url ||
      card.audiobook2_source ||
      findContinueBookForCard(card)
    ));
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
    book = book || {};

    var workId = book.fdb_work_id || (/^work:/i.test(book.url || '') ? book.url : '');
    if (!workId && book._fdb_work) return Promise.resolve(book);
    if (!workId) return Promise.resolve(book);

    return requestPromise(apiUrl('/audio/work/' + encodeURIComponent(workId)), 70000).then(function(work) {
      var detail = bookFromFdbWork(work || {}, book.fdb_edition_id, book.fdb_source_id);
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
      var books = baseBook && baseBook._fdb_work ? booksFromFdbWork(baseBook._fdb_work) : [baseBook];
      if (!books.some(function(book) { return book && book.items && book.items.length; })) books = [baseBook];
      return prepareVoices(books);
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
      var sourceKey = book.fdb_source_id || book.fdb_edition_id || book.source || book.url || '';
      var key = [voiceKey || normalize(book.reader || ''), titleKey, sourceKey].join('|');

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
      var ap = a.playlist && a.playlist.length || 0;
      var bp = b.playlist && b.playlist.length || 0;
      if (bp != ap) return bp - ap;
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
      var timelineHash = Lampa.Utils.hash(['audiobook', book.fdb_work_id || book.url, book.fdb_edition_id || '', book.fdb_source_id || book.source, item.fileIndex, index].join(':'));
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
        audiobook_chapter_index: index + 1,
        audiobook_file_index: parseInt(item.fileIndex, 10) || index,
        audiobook_fdb_edition_id: book.fdb_edition_id || '',
        audiobook_fdb_source_id: book.fdb_source_id || '',
        audiobook_meta: meta,
        from_lampac_audiobooks2: true
      };
    });
  }

  function makePlayerCard(book) {
    return cardFromBook(book);
  }

  var AUDIOBOOK_PLAYER_ACTIVE = false;
  var ACTIVE_PLAYER_META = null;
  var CURRENT_AUDIOBOOK_PLAYLIST = [];
  var CURRENT_AUDIOBOOK_VOICES = [];
  var ACTIVE_AUDIOBOOK_ITEM = null;
  var ACTIVE_AUDIOBOOK_PROGRESS_MEDIA = null;
  var ACTIVE_AUDIOBOOK_PROGRESS_HANDLER = null;
  var ACTIVE_AUDIOBOOK_PROGRESS_LAST_SAVE = 0;
  var LAST_AUDIOBOOK_TRACK_AT = 0;
  var AUDIOBOOK_PLAYER_TRANSITION_TOKEN = 0;
  var AUDIOBOOK_WAKE_LOCK = null;

  function requestAudiobookWakeLock() {
    if (!navigator || !navigator.wakeLock || !navigator.wakeLock.request || document.visibilityState == 'hidden') return;
    try {
      var promise = navigator.wakeLock.request('screen');
      if (promise && promise.then) {
        promise.then(function(lock) {
          AUDIOBOOK_WAKE_LOCK = lock;
        }).catch(function() {});
      }
    } catch (e) {}
  }

  function releaseAudiobookWakeLock() {
    var lock = AUDIOBOOK_WAKE_LOCK;
    AUDIOBOOK_WAKE_LOCK = null;
    if (!lock || !lock.release) return;
    try {
      var promise = lock.release();
      if (promise && promise.catch) promise.catch(function() {});
    } catch (e) {}
  }

  document.addEventListener('visibilitychange', function() {
    if (AUDIOBOOK_PLAYER_ACTIVE && document.visibilityState == 'visible') requestAudiobookWakeLock();
  });

  function forceAudiobookInnerPlayer() {
    try {
      if (Lampa.Player && Lampa.Player.runas) {
        Lampa.Player.runas('inner');
      }
    } catch (e) {}
  }

  
function stopAudiobookCurrentMedia() {
  var media = audiobookCurrentMedia();
  var nodes = [];

  try {
    nodes = Array.prototype.slice.call(document.querySelectorAll('.player video, .player audio'));
  } catch (e) {
    nodes = [];
  }

  if (media && nodes.indexOf(media) < 0) nodes.push(media);
  if (!media && nodes.length) media = nodes[0];

  nodes.forEach(function(node) {
    if (!node) return;

    try { node.pause(); } catch (e) {}

    if (media && node !== media) {
      try { node.currentTime = 0; } catch (e2) {}
      try { node.removeAttribute('src'); } catch (e3) {}
      try { node.load(); } catch (e4) {}
    }
  });

  return media || null;
}

  

function prepareAudiobookTimelineForResume(item, resumeTime, duration, percent) {
    if (!item) return;

    resumeTime = parseFloat(resumeTime || item.audiobook_resume_time || 0) || 0;
    duration = parseFloat(duration || item.audiobook_resume_duration || 0) || 0;
    percent = parseFloat(percent || item.audiobook_resume_percent || 0) || 0;

    if (resumeTime <= 0) return;

    if (!percent && duration > 0) percent = Math.round((resumeTime / duration) * 100);
    percent = Math.max(0, Math.min(100, percent || 0));

    item.audiobook_resume_time = resumeTime;
    item.audiobook_resume_duration = duration;
    item.audiobook_resume_percent = percent;

    try {
      if (item.timeline) {
        item.timeline.time = resumeTime;
        if (duration > 0) item.timeline.duration = duration;
        if (percent > 0) item.timeline.percent = percent;
      }
    } catch (e) {}
  }

  function playAudiobookItemInCurrentMedia(item, list) {
    var media;
    var promise;
    var resumeTime = 0;
    var resumeDuration = 0;
    var resumePercent = 0;
    var sameUrl = false;
    var previousMuted = false;
    var shouldMuteDuringSwitch = false;
    var restoredSound = false;
    var resumeApplied = false;
    var restoreTimer = 0;
    var onLoadedMetadata;
    var onCanPlay;
    var onSeeked;

    if (!item || !item.url) return false;

    media = stopAudiobookCurrentMedia();
    if (!media) return false;

    forceAudiobookInnerPlayer();

    try {
      if (typeof item.audiobook_resume_time !== 'undefined') resumeTime = parseFloat(item.audiobook_resume_time || 0) || 0;
      else if (item.timeline && item.timeline.time) resumeTime = parseFloat(item.timeline.time) || 0;
      if (typeof item.audiobook_resume_duration !== 'undefined') resumeDuration = parseFloat(item.audiobook_resume_duration || 0) || 0;
      if (typeof item.audiobook_resume_percent !== 'undefined') resumePercent = parseFloat(item.audiobook_resume_percent || 0) || 0;
    } catch (e) {
      resumeTime = 0;
      resumeDuration = 0;
      resumePercent = 0;
    }

    prepareAudiobookTimelineForResume(item, resumeTime, resumeDuration, resumePercent);

    try {
      sameUrl = !!(media.currentSrc && decodeAudiobookUrl(media.currentSrc) == decodeAudiobookUrl(item.url));
      if (!sameUrl && media.src) sameUrl = decodeAudiobookUrl(media.src) == decodeAudiobookUrl(item.url);
    } catch (e2) {
      sameUrl = false;
    }

    shouldMuteDuringSwitch = !!(resumeTime > 2 || !sameUrl);

    try { previousMuted = !!media.muted; } catch (e3) { previousMuted = false; }
    if (shouldMuteDuringSwitch) {
      try { media.muted = true; } catch (e4) {}
    }

    function cleanupListeners() {
      try { media.removeEventListener('loadedmetadata', onLoadedMetadata); } catch (e5) {}
      try { media.removeEventListener('canplay', onCanPlay); } catch (e6) {}
      try { media.removeEventListener('seeked', onSeeked); } catch (e7) {}
      if (restoreTimer) {
        clearTimeout(restoreTimer);
        restoreTimer = 0;
      }
    }

    function restoreSound() {
      if (restoredSound) return;
      restoredSound = true;
      cleanupListeners();
      if (shouldMuteDuringSwitch) {
        try { media.muted = previousMuted; } catch (e8) {}
      }
    }

    function applyResumeTime() {
      var current = 0;
      var duration = 0;

      if (!resumeTime || !isFinite(resumeTime) || resumeTime < 2) {
        resumeApplied = true;
        return true;
      }

      try { current = parseFloat(media.currentTime || 0) || 0; } catch (e9) { current = 0; }
      try { duration = parseFloat(media.duration || 0) || 0; } catch (e10) { duration = 0; }

      if (duration > 0 && isFinite(duration) && resumeTime >= duration - 3) {
        resumeApplied = true;
        return true;
      }

      if (Math.abs(current - resumeTime) <= 0.75) {
        resumeApplied = true;
        return true;
      }

      try {
        media.currentTime = resumeTime;
        resumeApplied = true;
        return true;
      } catch (e11) {
        return false;
      }
    }

    onLoadedMetadata = function() {
      applyResumeTime();
      if (!resumeTime || resumeTime < 2) restoreSound();
    };

    onCanPlay = function() {
      if (!resumeApplied) applyResumeTime();
      if (!resumeTime || resumeTime < 2) restoreSound();
      else restoreTimer = setTimeout(restoreSound, 140);
    };

    onSeeked = function() {
      restoreTimer = setTimeout(restoreSound, 60);
    };

    try {
      media.addEventListener('loadedmetadata', onLoadedMetadata);
      media.addEventListener('canplay', onCanPlay);
      media.addEventListener('seeked', onSeeked);
    } catch (e12) {}

    try {
      if (!sameUrl) {
        media.src = item.url;
        if (media.setAttribute) media.setAttribute('src', item.url);
      }
    } catch (e13) {
      restoreSound();
      return false;
    }

    try {
      if (media.readyState >= 1) {
        applyResumeTime();
        if (!resumeTime || resumeTime < 2) restoreSound();
      }
    } catch (e14) {}

    try { if (!sameUrl) media.load(); } catch (e15) {}

    bindAudiobookProgressMedia(item, media);

    try {
      promise = media.play();
      if (promise && promise.catch) promise.catch(function() { restoreSound(); });
    } catch (e16) {
      restoreSound();
      return false;
    }

    restoreTimer = setTimeout(restoreSound, resumeTime > 2 ? 1400 : 350);

    try { Lampa.Player.playlist(list || []); } catch (e17) {}

    return true;
  }

  function unbindAudiobookProgressMedia() {
    if (ACTIVE_AUDIOBOOK_PROGRESS_MEDIA && ACTIVE_AUDIOBOOK_PROGRESS_HANDLER) {
      try { ACTIVE_AUDIOBOOK_PROGRESS_MEDIA.removeEventListener('timeupdate', ACTIVE_AUDIOBOOK_PROGRESS_HANDLER); } catch (e) {}
      try { ACTIVE_AUDIOBOOK_PROGRESS_MEDIA.removeEventListener('pause', ACTIVE_AUDIOBOOK_PROGRESS_HANDLER); } catch (e2) {}
      try { ACTIVE_AUDIOBOOK_PROGRESS_MEDIA.removeEventListener('ended', ACTIVE_AUDIOBOOK_PROGRESS_HANDLER); } catch (e3) {}
    }

    ACTIVE_AUDIOBOOK_PROGRESS_MEDIA = null;
    ACTIVE_AUDIOBOOK_PROGRESS_HANDLER = null;
  }

  function bindAudiobookProgressMedia(item, media) {
    if (!item || !item.from_lampac_audiobooks2) return false;

    media = media || audiobookCurrentMedia();
    if (!media) return false;

    if (ACTIVE_AUDIOBOOK_PROGRESS_MEDIA === media && ACTIVE_AUDIOBOOK_PROGRESS_HANDLER) {
      ACTIVE_AUDIOBOOK_ITEM = item;
      return true;
    }

    unbindAudiobookProgressMedia();

    ACTIVE_AUDIOBOOK_ITEM = item;
    ACTIVE_AUDIOBOOK_PROGRESS_MEDIA = media;
    ACTIVE_AUDIOBOOK_PROGRESS_HANDLER = function() {
      saveActiveAudiobookProgress(false);
    };

    try { media.addEventListener('timeupdate', ACTIVE_AUDIOBOOK_PROGRESS_HANDLER); } catch (e) {}
    try { media.addEventListener('pause', ACTIVE_AUDIOBOOK_PROGRESS_HANDLER); } catch (e2) {}
    try { media.addEventListener('ended', ACTIVE_AUDIOBOOK_PROGRESS_HANDLER); } catch (e3) {}

    return true;
  }

  function scheduleAudiobookProgressBind(item) {
    [80, 250, 700, 1400].forEach(function(delay) {
      later(function() {
        if (!AUDIOBOOK_PLAYER_ACTIVE || ACTIVE_AUDIOBOOK_ITEM !== item) return;
        bindAudiobookProgressMedia(item);
      }, delay);
    });
  }

  function saveActiveAudiobookProgress(force) {
    var item = ACTIVE_AUDIOBOOK_ITEM;
    var media = ACTIVE_AUDIOBOOK_PROGRESS_MEDIA || audiobookCurrentMedia();
    var now = Date.now();
    var time = 0;
    var duration = 0;
    var percent = 0;
    var meta;

    if (!item || !item.from_lampac_audiobooks2 || !media) return;
    if (!force && now - ACTIVE_AUDIOBOOK_PROGRESS_LAST_SAVE < 3500) return;

    try { time = parseFloat(media.currentTime || 0) || 0; } catch (e) { time = 0; }
    try { duration = parseFloat(media.duration || 0) || 0; } catch (e2) { duration = 0; }

    if (!force && !time && !duration) return;

    if (duration > 0 && isFinite(duration)) {
      percent = Math.max(0, Math.min(100, Math.round((time / duration) * 100)));
    }

    try {
      if (item.timeline) {
        item.timeline.time = time;
        item.timeline.duration = duration;
        item.timeline.percent = percent;
        if (item.timeline.handler && duration > 0) item.timeline.handler(percent, time, duration);
      }
    } catch (e3) {}

    meta = getAudiobookMeta(item);
    meta.time = time;
    meta.media_duration = duration;
    meta.percent = percent;

    try { if (item.card) rememberAudiobook(bookFromCard(item.card), meta); } catch (e4) {}

    ACTIVE_AUDIOBOOK_PROGRESS_LAST_SAVE = now;
  }

  
function scheduleAudiobookResumeSeek(item) {
    var resumeTime = item ? parseFloat(item.audiobook_resume_time || 0) || 0 : 0;
    var corrected = false;

    if (!resumeTime || resumeTime < 2) return;

    [650, 1800].forEach(function(delay) {
      later(function() {
        var media;
        var src;
        var current = 0;
        var wasMuted = false;

        if (corrected) return;
        if (!AUDIOBOOK_PLAYER_ACTIVE || ACTIVE_AUDIOBOOK_ITEM !== item) return;

        media = audiobookCurrentMedia();
        if (!media) return;

        try { src = media.currentSrc || media.src || ''; } catch (e) { src = ''; }
        if (item.url && src && decodeAudiobookUrl(src) != decodeAudiobookUrl(item.url) && src.indexOf(item.url) < 0) return;

        try { current = parseFloat(media.currentTime || 0) || 0; } catch (e2) { current = 0; }

        /* Do not keep re-seeking while playback is already around the expected point.
         * The fallback exists only for Android/WebView cases where native resume ignored timeline.time
         * and started from zero. Muting prevents the audible "scratched disc" jump.
         */
        if (Math.abs(current - resumeTime) <= 1.2) return;
        if (current > 3 && Math.abs(current - resumeTime) < 8) return;
        if (current > 8) return;

        try { wasMuted = !!media.muted; } catch (e3) { wasMuted = false; }
        try { media.muted = true; } catch (e4) {}
        try {
          if (!media.duration || resumeTime < media.duration - 3) {
            media.currentTime = resumeTime;
            corrected = true;
          }
        } catch (e5) {}
        setTimeout(function() {
          try { media.muted = wasMuted; } catch (e6) {}
        }, 120);
      }, delay);
    });
  }

  function getAudiobookMeta(item) {
    item = item || {};
    var meta = item.audiobook_meta || {};
    var card = item.card || {};
    var result = {
      title: meta.title || item.movie_title || item.first_title || card.title || card.name || item.title || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430',
      chapter: meta.chapter || item.title || item.name || '',
      chapter_index: parseInt(meta.chapter_index || item.audiobook_chapter_index || item.chapter_index || 0, 10) || 0,
      description: meta.description || item.description || meta.chapter || item.title || item.name || card.description || card.overview || '',
      author: meta.author || item.original_title || card.original_title || card.original_name || '',
      reader: meta.reader || item.audiobook_voice_reader || card.audiobook_reader || '',
      duration: meta.duration || card.audiobook_duration || '',
      image: absoluteUrl(meta.image || item.img || item.poster || item.background_image || card.img || card.poster || card.background_image || '') || './img/img_broken.svg',
      voice_key: item.audiobook_voice_key || '',
      voice_title: item.audiobook_voice_title || item.translate_name || '',
      fdb_edition_id: item.audiobook_fdb_edition_id || card.audiobook_fdb_edition_id || '',
      fdb_source_id: item.audiobook_fdb_source_id || card.audiobook_fdb_source_id || '',
      source: card.audiobook2_source || card.audiobook_source || item.source_name || '',
      file_index: parseInt(item.audiobook_file_index || item.fileIndex || 0, 10) || 0
    };

    if (typeof item.audiobook_resume_time !== 'undefined') result.time = parseFloat(item.audiobook_resume_time || 0) || 0;

    return result;
  }

  function activateAudiobookTrack(item) {
    if (!item || !item.from_lampac_audiobooks2) return false;

    AUDIOBOOK_PLAYER_ACTIVE = true;
    ACTIVE_AUDIOBOOK_ITEM = item;
    LAST_AUDIOBOOK_TRACK_AT = Date.now();
    ACTIVE_PLAYER_META = getAudiobookMeta(item);
    try { if (item.card) rememberAudiobook(bookFromCard(item.card), ACTIVE_PLAYER_META); } catch (e) {}
    requestAudiobookWakeLock();
    scheduleAudiobookProgressBind(item);
    scheduleAudiobookResumeSeek(item);


    if (typeof AudiobookPlayerView != 'undefined' && AudiobookPlayerView && AudiobookPlayerView.refresh) {
      AudiobookPlayerView.refresh(ACTIVE_PLAYER_META);
    }

    later(function() {
      if (typeof AudiobookPlayerView != 'undefined' && AudiobookPlayerView && AudiobookPlayerView.refresh) {
        AudiobookPlayerView.refresh(ACTIVE_PLAYER_META);
      }
      scheduleAudiobookProgressBind(item);
      scheduleAudiobookResumeSeek(item);
    }, 120);
    return true;
  }

  
function playVoice(voices, voice, options) {
    options = options || {};

    if (!voice || !voice.playlist || !voice.playlist.length) {
      Lampa.Noty.show('\u041d\u0435\u0442 \u0444\u0430\u0439\u043b\u043e\u0432 \u0434\u043b\u044f \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u044f');
      return;
    }

    var selectedIndex = voices.indexOf(voice);
    var errorHandled = false;
    var resumeBook = options.resumeBook || null;
    var startIndex = 0;
    var resumeTime = 0;
    var switchInCurrentPlayer = false;
    var opened = false;
    var playedInline = false;

    if (!resumeBook) resumeBook = findContinueBookForBook(voice.book) || {};

    CURRENT_AUDIOBOOK_VOICES = voices || [];
    runtime.currentAudiobookVoices = CURRENT_AUDIOBOOK_VOICES;

    try { opened = !!(Lampa.Player && Lampa.Player.opened && Lampa.Player.opened()); } catch (e) { opened = false; }
    switchInCurrentPlayer = !!(AUDIOBOOK_PLAYER_ACTIVE && opened);

    var handleError = function(object, next) {
      var nextVoice = voices[selectedIndex + 1];

      if (errorHandled) return;
      errorHandled = true;

      if (nextVoice) {
        Lampa.Noty.show('\u041f\u0440\u043e\u0431\u0443\u044e \u0434\u0440\u0443\u0433\u0443\u044e \u043e\u0437\u0432\u0443\u0447\u043a\u0443');
        if (next) next(nextVoice.playlist[0].url);
        setTimeout(function() {
          playVoice(voices, nextVoice, { resumeBook: captureCurrentAudiobookResume() });
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
        voiceRef: item,
        onSelect: function() {
          playVoice(voices, item, { resumeBook: captureCurrentAudiobookResume() });
        }
      };
    });

    var first = {};
    var playlist = voice.playlist.map(function(item) {
      var clone = {};
      for (var key in item) if (item.hasOwnProperty(key)) clone[key] = item[key];
      return clone;
    });

    startIndex = resolveResumePlaylistIndex(playlist, resumeBook);
    resumeTime = resolveResumeTime(playlist[startIndex], resumeBook);

    playlist.forEach(function(item) {
      item.translate_name = voice.title;
      item.voiceovers = voiceovers;
      item.error = handleError;
      item.audiobook_voice_key = voice.key || '';
      item.audiobook_voice_title = voice.title || '';
      item.audiobook_voice_reader = voice.book && voice.book.reader || '';
      item.audiobook_fdb_edition_id = voice.book && voice.book.fdb_edition_id || item.audiobook_fdb_edition_id || '';
      item.audiobook_fdb_source_id = voice.book && voice.book.fdb_source_id || item.audiobook_fdb_source_id || '';
    });

    for (var key in playlist[startIndex]) {
      if (playlist[startIndex].hasOwnProperty(key)) first[key] = playlist[startIndex][key];
    }

    first.title = voice.book.name || first.title;
    first.name = voice.book.name || first.name || first.title;
    first.first_title = voice.book.name || first.first_title || first.title;
    first.movie_title = voice.book.name || first.movie_title || first.title;
    first.img = absoluteUrl(voice.book.preview) || first.img || './img/img_broken.svg';
    first.poster = first.img;
    first.background_image = first.img;
    first.translate_name = voice.title;
    first.voiceovers = voiceovers;
    first.error = handleError;
    first.audiobook_voice_key = voice.key || '';
    first.audiobook_voice_title = voice.title || '';
    first.audiobook_voice_reader = voice.book.reader || '';
    first.audiobook_fdb_edition_id = voice.book.fdb_edition_id || first.audiobook_fdb_edition_id || '';
    first.audiobook_fdb_source_id = voice.book.fdb_source_id || first.audiobook_fdb_source_id || '';
    first.audiobook_resume_time = resumeTime || 0;
    first.audiobook_resume_duration = resumeBook && resumeBook._last_media_duration || 0;
    first.audiobook_resume_percent = resumeBook && resumeBook._last_percent || 0;
    prepareAudiobookTimelineForResume(first, resumeTime, first.audiobook_resume_duration, first.audiobook_resume_percent);
    if (playlist[startIndex]) {
      playlist[startIndex].audiobook_resume_time = resumeTime || 0;
      playlist[startIndex].audiobook_resume_duration = first.audiobook_resume_duration || 0;
      playlist[startIndex].audiobook_resume_percent = first.audiobook_resume_percent || 0;
      prepareAudiobookTimelineForResume(playlist[startIndex], resumeTime, first.audiobook_resume_duration, first.audiobook_resume_percent);
    }

    if (Lampa.Favorite && Lampa.Favorite.add) {
      Lampa.Favorite.add('history', first.card, 100);
    }

    if (opened && !switchInCurrentPlayer) {
      try {
        saveActiveAudiobookProgress(true);
        Lampa.Player.close();
      } catch (e2) {}
    }

    first.audiobook_meta = {
      title: voice.book.name || first.movie_title || first.title || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430',
      chapter: playlist[startIndex].title || first.title || '',
      chapter_index: startIndex + 1,
      description: (playlist[startIndex].audiobook_meta && playlist[startIndex].audiobook_meta.description) || playlist[startIndex].title || first.title || voice.book.description || '',
      author: voice.book.author || '',
      reader: voice.book.reader || '',
      duration: voice.book.duration || '',
      image: first.img || './img/img_broken.svg',
      voice_key: voice.key || '',
      voice_title: voice.title || '',
      fdb_edition_id: voice.book.fdb_edition_id || '',
      fdb_source_id: voice.book.fdb_source_id || '',
      file_index: first.audiobook_file_index || 0,
      time: resumeTime || 0
    };

    rememberAudiobook(voice.book, first.audiobook_meta);

    CURRENT_AUDIOBOOK_PLAYLIST = playlist;
    activateAudiobookTrack(first);
    forceAudiobookInnerPlayer();

    if (switchInCurrentPlayer) {
      playedInline = playAudiobookItemInCurrentMedia(first, playlist);

      if (playedInline) {
        scheduleAudiobookResumeSeek(first);

        if (Lampa.PlayerPanel && Lampa.PlayerPanel.setVoiceovers) {
          try { Lampa.PlayerPanel.setVoiceovers(voiceovers); } catch (e3) {}
        }

        try {
          Lampa.Player.callback(function() {
            saveActiveAudiobookProgress(true);
            Lampa.Controller.toggle('content');
          });
        } catch (e4) {}

        later(function() {
          bindAudiobookProgressMedia(first);
          scheduleAudiobookResumeSeek(first);
          if (typeof AudiobookPlayerView != 'undefined' && AudiobookPlayerView && AudiobookPlayerView.refresh) {
            AudiobookPlayerView.refresh(ACTIVE_PLAYER_META);
            AudiobookPlayerView.scheduleMountRetries('voiceovers:inline-switch');
            AudiobookPlayerView.syncPanelCollection(AudiobookPlayerView.lastFocus, true);
          }
        }, 120);

        later(function() {
          if (!AudiobookPlayerView || !AudiobookPlayerView.view || !AudiobookPlayerView.view.length) return;
          AudiobookPlayerView.scheduleMountRetries('voiceovers:inline-switch-late');
        }, 500);

        return;
      }

      try {
        saveActiveAudiobookProgress(true);
        if (Lampa.Player && Lampa.Player.close) Lampa.Player.close();
      } catch (e5) {}
    }

    Lampa.Player.play(first);
    Lampa.Player.playlist(playlist);
    scheduleAudiobookResumeSeek(first);
    later(function() {
      bindAudiobookProgressMedia(first);
      scheduleAudiobookResumeSeek(first);
      if (typeof AudiobookPlayerView != 'undefined' && AudiobookPlayerView && AudiobookPlayerView.refresh) {
        AudiobookPlayerView.refresh(ACTIVE_PLAYER_META);
      }
    }, 350);
    Lampa.Player.callback(function() {
      saveActiveAudiobookProgress(true);
      Lampa.Controller.toggle('content');
    });
    if (Lampa.PlayerPanel && Lampa.PlayerPanel.setVoiceovers) {
      try {
        Lampa.PlayerPanel.setVoiceovers(voiceovers);
      } catch (e6) {}
    }
    later(function() {
      if (!AudiobookPlayerView || !AudiobookPlayerView.view || !AudiobookPlayerView.view.length) return;
      AudiobookPlayerView.scheduleMountRetries('voiceovers:set');
    }, 120);
  }

  function startPlayback(book) {
    if (Lampa.Loading) {
      Lampa.Loading.start();
      if (Lampa.Loading.setText) Lampa.Loading.setText('\u0418\u0449\u0443 \u043e\u0437\u0432\u0443\u0447\u043a\u0438...');
    }

    collectVoices(book).then(function(voices) {
      var choice;

      if (Lampa.Loading) Lampa.Loading.stop();

      if (!voices.length) {
        Lampa.Noty.show('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0430\u0443\u0434\u0438\u043e\u0444\u0430\u0439\u043b\u044b');
        return;
      }

      choice = chooseResumeVoice(voices, book);
      playVoice(voices, choice.voice || voices[0], { resumeBook: choice.resumeBook || book || {} });
    }).catch(function() {
      if (Lampa.Loading) Lampa.Loading.stop();
      Lampa.Noty.show('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0430\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0443');
    });
  }

  function showBookCard(book) {
    var enabled = Lampa.Controller.enabled().name;
    var image = absoluteUrl(book.preview) || './img/img_broken.svg';
    var author = firstAuthorName(book.author);
    var meta = [];
    var authorButton = author
      ? '<div class="selector simple-button lampac-audiobook2-detail__author"><span>\u0410\u0432\u0442\u043e\u0440</span></div>'
      : '';

    if (book.author) meta.push(book.author);
    if (book.reader) meta.push('\u0427\u0438\u0442\u0430\u0435\u0442: ' + book.reader);
    if (book.genres) meta.push(book.genres);
    if (book.duration) meta.push(book.duration);
    if (book.seriesName) meta.push(book.seriesName + (book.numberInSeries ? ' #' + book.numberInSeries : ''));

    var html = $(
      '<div class="lampac-audiobook2-detail">' +
        '<div class="lampac-audiobook2-detail__cover"><img src="' + escapeHtml(image) + '" /></div>' +
        '<div class="lampac-audiobook2-detail__body">' +
          '<div class="lampac-audiobook2-detail__source">' + escapeHtml(sourceTitle(book.source)) + '</div>' +
          '<div class="lampac-audiobook2-detail__title">' + escapeHtml(book.name || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430') + '</div>' +
          '<div class="lampac-audiobook2-detail__meta">' + escapeHtml(meta.join(' \u2022 ')) + '</div>' +
          '<div class="lampac-audiobook2-detail__descr">' + escapeHtml(shortText(book.description || '', 520)) + '</div>' +
          '<div class="lampac-audiobook2-detail__footer">' +
            '<div class="selector simple-button lampac-audiobook2-detail__listen"><span>\u0421\u043b\u0443\u0448\u0430\u0442\u044c</span></div>' +
            authorButton +
          '</div>' +
        '</div>' +
      '</div>'
    );

    html.find('.lampac-audiobook2-detail__listen').on('hover:enter', function() {
      Lampa.Modal.close();
      Lampa.Controller.toggle(enabled);
      startPlayback(book);
    });

    html.find('.lampac-audiobook2-detail__author').on('hover:enter', function() {
      Lampa.Modal.close();
      Lampa.Controller.toggle(enabled);
      openAuthorSearch(author);
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
      '<div class="lampac-audiobook2-card selector">' +
        '<div class="lampac-audiobook2-card__cover"><img loading="lazy" decoding="async" data-src="' + escapeHtml(image) + '" src="./img/img_broken.svg" /></div>' +
        '<div class="lampac-audiobook2-card__body">' +
          '<div class="lampac-audiobook2-card__source">' + escapeHtml(sourceTitle(book.source)) + '</div>' +
          '<div class="lampac-audiobook2-card__title">' + escapeHtml(book.name || '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430') + '</div>' +
          '<div class="lampac-audiobook2-card__meta">' + escapeHtml(meta.join(' \u2022 ')) + '</div>' +
          '<div class="lampac-audiobook2-card__descr">' + escapeHtml(shortText(book.description || '', 210)) + '</div>' +
        '</div>' +
        '<div class="lampac-audiobook2-card__action">\u0421\u043b\u0443\u0448\u0430\u0442\u044c</div>' +
      '</div>'
    );

    item.on('hover:enter', function() {
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
        item.find('.lampac-audiobook2-card__cover').addClass('loaded');
      };
      img.src = img.getAttribute('data-src');
    }

    item.on('visible', loadImage);
    loadImage();

    return item;
  }

  function genreFromParams(params) {
    var value = '';
    params = params || {};
    value = params.genre || params.audiobook_genre || params.url || params.id || '';
    try { value = decodeURIComponent(value || ''); } catch (e) {}
    value = (value || '').toString().replace(/^genre:/, '').trim();
    return AUDIOBOOK_GENRES.indexOf(value) >= 0 ? value : '';
  }

  function providerFromParams(params) {
    var value = '';
    params = params || {};
    value = params.provider || params.audiobook_provider || params.url || params.id || 'all';
    try { value = decodeURIComponent(value || ''); } catch (e) {}
    value = (value || '').toString().replace(/-page-\d+$/, '').trim();
    if (!value || value.indexOf('genre:') === 0 || value.indexOf('lampac-audiobooks2') === 0) return 'all';
    for (var i = 0; i < FDB_PROVIDER_MENU.length; i++) {
      if (FDB_PROVIDER_MENU[i].id == value) return value;
    }
    return 'all';
  }

  function seriesIdFromParams(params) {
    var value = '';
    params = params || {};
    value = params.series_id || params.audiobook_series_id || params.url || params.id || '';
    try { value = decodeURIComponent(value || ''); } catch (e) {}
    value = (value || '').toString().replace(/-page-\d+$/, '').trim();
    return value.indexOf('series:') === 0 ? value : '';
  }

  function sourceList(params, onComplete, onError) {
    params = params || {};

    var rawQuery = params.query || params.search || '';
    var query = '';
    var genre = genreFromParams(params);
    var provider = providerFromParams(params);
    var seriesId = seriesIdFromParams(params);
    var seriesTitle = params.series_title || params.audiobook_series || '';
    var page = parseInt(params.page || 1, 10) || 1;

    try {
      query = decodeURIComponent(rawQuery || '');
    } catch (e) {
      query = rawQuery || '';
    }

    query = (query || '').replace(/\s+/g, ' ').trim();
    var effectiveQuery = query || genre || '';

    var catalogUrl = seriesId
      ? apiUrl('/audio/series/' + encodeURIComponent(seriesId) + '/books', {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE
      })
      : !effectiveQuery && provider == 'all'
        ? apiUrl('/audio/catalog', {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE
        })
        : apiUrl('/audio/search', {
        provider: provider,
        query: effectiveQuery,
        genre: genre || '',
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE
        });

    requestJSON(catalogUrl, function(items) {
      items = items || [];

      if (!Array.isArray(items)) {
        items = items.results || items.items || items.data || [];
      }

      if (!Array.isArray(items)) items = [];

      var cards = items.map(function(item) {
        return cardFromBook(item && item.editions ? bookFromFdbWork(item) : item);
      });
      if (!query && !genre && page == 1) {
        var exists = {};
        cards.forEach(function(card) { exists[card.id] = true; });
        continueCards().reverse().forEach(function(card) {
          if (!exists[card.id]) cards.unshift(card);
        });
      }

      var hasMore = cards.length >= PAGE_SIZE;
      var nextPage = hasMore ? page + 1 : false;
      var title = provider == 'all' ? '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2' : sourceTitle(provider);
      if (query) title = '\u041f\u043e\u0438\u0441\u043a: ' + query;
      else if (seriesId) title = '\u0421\u0435\u0440\u0438\u044f: ' + (seriesTitle || seriesId.replace(/^series:[^:]+:/, ''));
      else if (genre) title = '\u0416\u0430\u043d\u0440: ' + genre;

      onComplete({
        url: seriesId || (genre ? 'genre:' + genre : provider),
        title: title,
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
    }, function(error) {
      if (window.console && console.error) console.error('[Audiobooks] catalog request failed:', catalogUrl, error);
      if (onError) onError(error);
    }, 45000);
  }

  function makeStaticRowPart(row) {
    return function(callback) {
      callback(row && row.results && row.results.length ? row : { results: [] });
    };
  }

  function continueRow() {
    var cards = continueCards().slice(0, PAGE_SIZE);
    if (!cards.length) return null;

    return {
      url: 'lampac-audiobooks2-continue',
      title: '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u043f\u0440\u043e\u0441\u043b\u0443\u0448\u0438\u0432\u0430\u043d\u0438\u0435',
      source: SOURCE,
      page: 1,
      pages: 1,
      total_pages: 1,
      total_results: cards.length,
      more: false,
      next: false,
      nomore: true,
      results: cards
    };
  }

  function makeAudiobookListPart(options, rowTitle) {
    return function(callback) {
      sourceList(options || {}, function(row) {
        row = row || {};
        if (rowTitle) row.title = rowTitle;
        callback(row && row.results && row.results.length ? row : { results: [] });
      }, function() {
        callback({ results: [] });
      });
    };
  }

  function sourceMain(params, onComplete, onError) {
    params = params || {};

    var parts = [];
    var ready = false;

    function buildParts() {
      var local = continueRow();
      parts = [];

      if (local) parts.push(makeStaticRowPart(local));

      AUDIOBOOK_MAIN_ROWS.forEach(function(row, index) {
        parts.push(makeAudiobookListPart({
          url: index ? 'genre:' + row.title : 'all',
          provider: 'all',
          page: 1,
          query: row.query || ''
        }, row.title));
      });
    }

    function loadPart(partLoaded, partEmpty) {
      if (!ready) {
        ready = true;
        buildParts();
      }

      if (Lampa.Api && Lampa.Api.partNext) Lampa.Api.partNext(parts, 4, partLoaded, partEmpty);
      else if (parts.length) parts.shift()(partLoaded);
      else if (partEmpty) partEmpty();
    }

    loadPart(onComplete, onError);
    return loadPart;
  }

  function sourceCategory(params, onComplete, onError) {
    params = params || {};

    sourceList({
      url: params.url || 'all',
      provider: params.provider || params.audiobook_provider || params.url || 'all',
      page: params.page || 1,
      query: params.query || params.search || '',
      genre: params.genre || params.audiobook_genre || ''
    }, function(row) {
      if (!row.title || row.title == '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2') row.title = '\u041d\u043e\u0432\u0438\u043d\u043a\u0438 \u0438 \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0435';
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
    fullCard.media_type = 'movie';
    fullCard.type = 'movie';
    fullCard.method = 'movie';
    fullCard.media = 'movie';
    fullCard.tv = false;
    fullCard.card_type = false;
    ensureLampaCardDefaults(fullCard);

    if (onComplete) onComplete({ movie: fullCard });
  }

  function sourceMenu(params, onComplete) {
    var items = FDB_PROVIDER_MENU.map(function(provider) {
      return { title: provider.title, id: provider.id, provider: provider.id };
    });
    AUDIOBOOK_GENRES.forEach(function(name) {
      items.push({ title: name, id: 'genre:' + name, genre: name });
    });
    onComplete(items);
  }

  function registerAudiobooksSource() {
    if (!Lampa.Api || !Lampa.Api.sources) return false;

    var api = {
      _lampacVersion: VERSION,
      main: sourceMain,
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

    if (window.__lampacAudiobooks2SearchSource && Lampa.Search.removeSource) {
      try {
        Lampa.Search.removeSource(window.__lampacAudiobooks2SearchSource);
      } catch (e) {}
    }

    SEARCH_SOURCE = {
      title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2',
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
          url: 'all',
          provider: 'all',
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
          url: 'all',
          title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2',
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

    runtime.searchSource = SEARCH_SOURCE;
    window.__lampacAudiobooks2SearchSource = SEARCH_SOURCE;
    Lampa.Search.addSource(SEARCH_SOURCE);
    return true;
  }

  function openCatalog() {
    registerAudiobooksSource();

    Lampa.Activity.push({
      url: 'lampac-audiobooks2-main',
      title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2',
      component: 'main',
      source: SOURCE,
      card_type: true,
      page: 1,
      search: '',
      query: ''
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

  function openAuthorSearch(author) {
    author = firstAuthorName(author);
    if (!author) return;

    registerAudiobooksSource();

    Lampa.Activity.push({
      url: 'author:' + encodeURIComponent(author),
      title: '\u0410\u0432\u0442\u043e\u0440: ' + author,
      component: 'category_full',
      source: SOURCE,
      card_type: true,
      page: 1,
      search: author,
      query: author
    });
  }

  function openSeriesSearch(book) {
    var seriesId = book && book.fdb_series_id || '';
    var seriesTitle = book && book.seriesName || '';

    if (!seriesId) return;

    registerAudiobooksSource();

    Lampa.Activity.push({
      url: seriesId,
      title: '\u0421\u0435\u0440\u0438\u044f: ' + (seriesTitle || seriesId),
      component: 'category_full',
      source: SOURCE,
      card_type: true,
      page: 1,
      search: '',
      query: '',
      series_id: seriesId,
      audiobook_series_id: seriesId,
      series_title: seriesTitle,
      audiobook_series: seriesTitle
    });
  }

  function seriesButtonLabel(seriesName) {
    return shortText(seriesName, 18) || '\u0421\u0435\u0440\u0438\u044f';
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
        url: 'all',
        title: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2',
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
    if (!Lampa.Activity) return;

    if (!Lampa.Activity._lampacAudiobooks2OriginalPush) {
      Lampa.Activity._lampacAudiobooks2OriginalPush = Lampa.Activity.push;
      Lampa.Activity._lampacAudiobooks2OriginalReplace = Lampa.Activity.replace;
    }

    if (Lampa.Activity._lampacAudiobooks2SearchBridgeInstalled) return;

    Lampa.Activity.push = function(params) {
      var activeRuntime = window[RUNTIME_KEY];

      if (activeRuntime && activeRuntime.active && activeRuntime.shouldCatchSearch && activeRuntime.shouldCatchSearch(params)) {
        setTimeout(function() {
          var currentRuntime = window[RUNTIME_KEY];
          if (currentRuntime && currentRuntime.active && currentRuntime.openSearch) currentRuntime.openSearch();
        }, 10);
        return;
      }

      return Lampa.Activity._lampacAudiobooks2OriginalPush.apply(this, arguments);
    };

    Lampa.Activity.replace = function(params) {
      var activeRuntime = window[RUNTIME_KEY];

      if (activeRuntime && activeRuntime.active && activeRuntime.shouldCatchSearch && activeRuntime.shouldCatchSearch(params)) {
        setTimeout(function() {
          var currentRuntime = window[RUNTIME_KEY];
          if (currentRuntime && currentRuntime.active && currentRuntime.openSearch) currentRuntime.openSearch();
        }, 10);
        return;
      }

      return Lampa.Activity._lampacAudiobooks2OriginalReplace.apply(this, arguments);
    };

    Lampa.Activity._lampacAudiobooks2SearchBridgeInstalled = true;
  }

  runtime.shouldCatchSearch = function(params) {
    return params && params.component == 'search' && isAudiobooksActive();
  };

  runtime.openSearch = openAudiobooksSearch;

  function reapplyPluginBindings() {
    if (!isCurrentRuntime()) return;
    registerAudiobooksSource();
    if (!runtime.searchSource) registerAudiobooksSearchSource();
    patchGlobalSearchRoute();
    addMenuButton();
  }

  function scheduleReapplyPluginBindings() {
    later(reapplyPluginBindings, 1500);
    later(reapplyPluginBindings, 4500);
  }

  window.lampacAudiobooks2Open = openCatalog;



  // Inline audiobook icon: an open book with headphones. No external request.
  // SVG sizing is intentionally delegated to Lampa containers.
  var AUDIOBOOK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path fill="currentColor" d="M256 94.8C205.8 57.4 143.5 42.1 82 51.4c-12.8 1.9-22 13-22 25.9v259.2c0 15.9 14.7 27.7 30.1 24.1 55.4-12.8 111.4-.7 150.8 32.3 8.7 7.3 21.4 7.3 30.1 0 39.4-33 95.4-45.1 150.8-32.3 15.4 3.6 30.1-8.2 30.1-24.1V77.3c0-12.9-9.2-24-22-25.9-61.5-9.3-123.8 6-174 43.4ZM236 341.7c-39.7-23.5-84.8-32.8-128-26.2V96.2c43.2-6.6 88.3 2.7 128 26.2v219.3Zm168-26.2c-43.2-6.6-88.3 2.7-128 26.2V122.4c39.7-23.5 84.8-32.8 128-26.2v219.3Z"/><path fill="currentColor" d="M256 0C132.3 0 32 100.3 32 224v18.4C13.4 247.8 0 265 0 285.3v69.4C0 378.7 19.3 398 43.3 398H76V225.3H64V224C64 118 150 32 256 32s192 86 192 192v1.3h-12V398h32.7c24 0 43.3-19.3 43.3-43.3v-69.4c0-20.3-13.4-37.5-32-42.9V224C480 100.3 379.7 0 256 0Z"/></svg>';

  function bindMenuButton(menuItem) {
    menuItem.find('.menu__ico').html(AUDIOBOOK_ICON);
    menuItem.find('.menu__text').text('\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438');
    menuItem.off('.lampac-audiobooks2');
    menuItem.on('hover:enter.lampac-audiobooks2', function() {
      if (isCurrentRuntime()) openCatalog();
    });
  }

  function createMenuButton() {
    var menuItem = $(
      '<li data-action="lampac-audiobooks2" class="menu__item selector">' +
        '<div class="menu__ico">' + AUDIOBOOK_ICON + '</div>' +
        '<div class="menu__text">\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2</div>' +
      '</li>'
    );

    bindMenuButton(menuItem);
    return menuItem;
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

    return list.find('.menu__item').last();
  }

  function addMenuButton(attempt) {
    if (!isCurrentRuntime()) return;

    var list = findMenuList();
    var all = $('.menu .menu__item[data-action="lampac-audiobooks2"]');
    var menuItem = all.first();
    var anchor;

    if (!list.length) {
      if ((attempt || 0) < 40) {
        later(function() {
          addMenuButton((attempt || 0) + 1);
        }, 250);
      }
      return;
    }

    all.not(menuItem).remove();

    if (!menuItem.length) {
      menuItem = createMenuButton();
      anchor = findMenuAnchor(list);

      if (anchor.length) anchor.after(menuItem);
      else list.append(menuItem);
    } else {
      bindMenuButton(menuItem);
    }
  }

  function watchMenu() {
    if (!window.MutationObserver || runtime.menuObserver) return;

    var timer = 0;
    runtime.menuObserver = new MutationObserver(function() {
      clearTimeout(timer);
      timer = setTimeout(function() {
        if (!isCurrentRuntime()) return;
        if (!$('.menu .menu__item[data-action="lampac-audiobooks2"]').length) addMenuButton();
      }, 250);
    });

    runtime.menuObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.lampacAudiobooks2MenuWatcher = runtime.menuObserver;
  }

  window.lampacAudiobooks2AddMenuButton = addMenuButton;


  function cleanupAudiobookFullTypeLabels(render) {
    var scope;
    var full;

    render = render && render.length ? render : $();
    scope = render.length ? render : $(document.body);

    full = scope.find('.full-start-new, .full-start').addBack('.full-start-new, .full-start').first();
    if (!full.length) return;

    full.addClass('full--lampac-audiobook2');

    full.find('.card__type,.full-start__type,.full-start-new__type,.full-start__tag,.full-start-new__tag,.full-start__quality,.full-start-new__quality,.full-start__marker,.full-start-new__marker').remove();
    full.find('div,span').filter(function() {
      var text = '';
      var cls = '';
      try { text = ($(this).text() || '').replace(/\s+/g, ' ').trim(); } catch (e) {}
      try { cls = String(this.className || ''); } catch (e2) {}
      return text == 'TV' && /(type|tag|quality|marker|status|card|full-start)/i.test(cls);
    }).remove();
  }

  function scheduleAudiobookFullTypeCleanup(render) {
    cleanupAudiobookFullTypeLabels(render);
    clearTimeout(runtime.fullTypeCleanupTimer);
    runtime.fullTypeCleanupTimer = setTimeout(function() {
      if (!isCurrentRuntime()) return;
      cleanupAudiobookFullTypeLabels(render);
    }, 220);
  }

  function getActiveFullContext(event) {
    var active = null;
    var object = event && event.object ? event.object : {};
    var data = event && event.data ? event.data : {};
    var activity = object.activity || null;
    var movie = null;
    var source = '';
    var candidates = [];

    try {
      active = Lampa.Activity && Lampa.Activity.active ? Lampa.Activity.active() : null;
    } catch (e) {}

    if (!activity && active && active.activity) activity = active.activity;

    candidates.push(data.movie);
    candidates.push(data.card);
    candidates.push(object.movie);
    candidates.push(object.card);
    candidates.push(active && active.movie);
    candidates.push(active && active.card);
    candidates.push(activity && activity.movie);
    candidates.push(activity && activity.card);
    candidates.push(data);

    for (var i = 0; i < candidates.length; i++) {
      if (isAudiobookCard(candidates[i])) {
        movie = candidates[i];
        break;
      }
    }

    source = object.source || data.source || (active && active.source) || (movie && movie.source) || '';

    if (!movie && source == SOURCE) {
      movie = (active && (active.movie || active.card)) || (activity && (activity.movie || activity.card)) || data.movie || data.card || data;
    }

    return {
      active: active,
      activity: activity,
      movie: movie,
      source: source,
      isAudiobook: !!(movie && isAudiobookCard(movie)) || source == SOURCE
    };
  }

  function elementIsVisible(element) {
    if (!element) return false;

    try {
      return !!(element.offsetWidth || element.offsetHeight || (element.getClientRects && element.getClientRects().length));
    } catch (e) {
      return false;
    }
  }

  function firstVisible(collection) {
    var visible;

    collection = collection || $();
    if (!collection.length) return $();

    visible = collection.filter(function() {
      return elementIsVisible(this);
    }).first();

    return visible.length ? visible : collection.first();
  }

  function getFullRender(context) {
    var contextual = $();
    var full = $();
    var activity = $();

    if (context && context.activity && context.activity.render) {
      try {
        contextual = context.activity.render();
      } catch (e) {}
    }

    /*
     * After Player.close() Lampa briefly keeps the previous Full activity in
     * DOM while another activity is still active. Prefer the Full card which
     * is actually visible instead of the first matching node in document.
     */
    full = firstVisible($('.full-start-new, .full-start'));
    if (full.length && elementIsVisible(full[0])) {
      activity = full.closest('.activity').first();
      return activity.length ? activity : full.parent();
    }

    if (contextual && contextual.length) return contextual;

    if (full.length) {
      activity = full.closest('.activity').first();
      return activity.length ? activity : full.parent();
    }

    return $();
  }

  function bindListenButton(listenButton, playbackBook) {
    var lastEnter = 0;
    if (!listenButton || !listenButton.length) return listenButton;

    /*
     * During return from Player the Full activity can be visible before
     * Activity.active() exposes its audiobook card again. Keep the existing
     * click handler in that short window instead of replacing it with a
     * handler bound to an undefined book.
     */
    if (!playbackBook) return listenButton;

    listenButton
      .off('.lampac-audiobooks2')
      .on('hover:enter.lampac-audiobooks2 click.lampac-audiobooks2', function() {
        var now = Date.now();
        if (now - lastEnter < 500) return;
        lastEnter = now;
        if (!isCurrentRuntime()) return;
        startPlayback(playbackBook);
      });

    return listenButton;
  }

  var AUDIOBOOK_LISTEN_ICON = AUDIOBOOK_ICON.replace('<svg ', '<svg class="lampac-audiobook2-listen__svg" ');
  var AUDIOBOOK_AUTHOR_ICON = '<svg class="lampac-audiobook2-author__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-3.31 0-7 1.67-7 4v1c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-1c0-2.33-3.69-4-7-4z"/></svg>';
  var AUDIOBOOK_SERIES_ICON = '<svg class="lampac-audiobook2-series__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4.75C4 3.78 4.78 3 5.75 3h10.5C17.22 3 18 3.78 18 4.75V6h.25C19.22 6 20 6.78 20 7.75v11.5c0 .41-.34.75-.75.75H7.75C6.78 20 6 19.22 6 18.25V18h-.25C4.78 18 4 17.22 4 16.25V4.75ZM5.75 4.5a.25.25 0 0 0-.25.25v11.5c0 .14.11.25.25.25h10.5c.14 0 .25-.11.25-.25V4.75a.25.25 0 0 0-.25-.25H5.75Zm12.25 3v8.75c0 .97-.78 1.75-1.75 1.75H7.5v.25c0 .14.11.25.25.25h10.75V7.75a.25.25 0 0 0-.25-.25H18ZM7.75 7h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5Zm0 3.5h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5Z"/></svg>';

  function authorButtonLabel(author) {
    return shortText(firstAuthorName(author), 18) || '\u0410\u0432\u0442\u043e\u0440';
  }

  function repairListenButtonMarkup(listenButton, playbackBook) {
    var svg;
    var label;
    var broken;

    if (!listenButton || !listenButton.length) return listenButton;

    /*
     * Use the native Full-card button contract used by Lampa:
     * icon + <span>label</span> + button--book. Lampa itself controls the
     * compact size and expands the focused button to reveal the label.
     * The plugin only repairs missing markup after returning from Player.
     */
    svg = listenButton.children('svg.lampac-audiobook2-listen__svg').first();
    label = listenButton.children('span').first();
    broken = !svg.length || svg.find('path').length < 2 || !label.length;

    if (broken) {
      listenButton.empty().append(AUDIOBOOK_LISTEN_ICON + '<span>\u0421\u043b\u0443\u0448\u0430\u0442\u044c</span>');
      audiobookFullButtonLog('icon:rebuilt', { title: playbackBook && playbackBook.name || '' });
      svg = listenButton.children('svg.lampac-audiobook2-listen__svg').first();
      label = listenButton.children('span').first();
    }

    if (label && label.length) label.text('\u0421\u043b\u0443\u0448\u0430\u0442\u044c');

    listenButton
      .addClass('button--book')
      .removeClass('hide hidden')
      .attr('data-subtitle', '\u0421\u043b\u0443\u0448\u0430\u0442\u044c')
      .attr('aria-label', '\u0421\u043b\u0443\u0448\u0430\u0442\u044c')
      .attr('data-lampac-audiobook2-listen', '1')
      .css({ opacity: '1', animation: 'none' });

    if (svg && svg.length) {
      svg
        .attr('aria-hidden', 'true')
        .attr('focusable', 'false')
        .css({ display: 'block', visibility: 'visible', opacity: '1' });
      svg.find('path').css({ fill: 'currentColor' });
    }

    return bindListenButton(listenButton, playbackBook);
  }

  function bindAuthorButton(authorButton, playbackBook) {
    var author = firstAuthorName(playbackBook && playbackBook.author);
    if (!authorButton || !authorButton.length || !author) return authorButton;

    authorButton
      .off('.lampac-audiobooks2')
      .on('hover:enter.lampac-audiobooks2 click.lampac-audiobooks2', function() {
        if (!isCurrentRuntime()) return;
        openAuthorSearch(author);
      });

    return authorButton;
  }

  function bindSeriesButton(seriesButton, playbackBook) {
    if (!seriesButton || !seriesButton.length || !playbackBook || !playbackBook.fdb_series_id) return seriesButton;

    seriesButton
      .off('.lampac-audiobooks2')
      .on('hover:enter.lampac-audiobooks2 click.lampac-audiobooks2', function() {
        if (!isCurrentRuntime()) return;
        openSeriesSearch(playbackBook);
      });

    return seriesButton;
  }

  function repairAuthorButtonMarkup(authorButton, playbackBook) {
    var author = firstAuthorName(playbackBook && playbackBook.author);
    var label = authorButton && authorButton.length ? authorButton.children('span').first() : $();

    if (!authorButton || !authorButton.length || !author) return authorButton;

    if (!authorButton.children('svg.lampac-audiobook2-author__svg').length || !label.length) {
      authorButton.empty().append(AUDIOBOOK_AUTHOR_ICON + '<span></span>');
      label = authorButton.children('span').first();
    }

    if (label.length) label.text(authorButtonLabel(author));

    authorButton
      .addClass('button--book')
      .removeClass('hide hidden')
      .attr('data-subtitle', '\u0410\u0432\u0442\u043e\u0440: ' + author)
      .attr('aria-label', '\u0410\u0432\u0442\u043e\u0440: ' + author)
      .attr('data-lampac-audiobook2-author', '1')
      .css({ opacity: '1', animation: 'none' });

    authorButton.find('svg').css({ display: 'block', visibility: 'visible', opacity: '1' });
    authorButton.find('path').css({ fill: 'currentColor' });

    return bindAuthorButton(authorButton, playbackBook);
  }

  function makeAuthorButton(playbackBook) {
    var authorButton = $(
      '<div class="full-start__button selector view--audiobook-author button--book" data-lampac-audiobook2-author="1">' +
        AUDIOBOOK_AUTHOR_ICON +
        '<span></span>' +
      '</div>'
    );

    return repairAuthorButtonMarkup(authorButton, playbackBook);
  }

  function repairSeriesButtonMarkup(seriesButton, playbackBook) {
    var seriesName = playbackBook && playbackBook.seriesName || '';
    var label = seriesButton && seriesButton.length ? seriesButton.children('span').first() : $();

    if (!seriesButton || !seriesButton.length || !playbackBook || !playbackBook.fdb_series_id) return seriesButton;

    if (!seriesButton.children('svg.lampac-audiobook2-series__svg').length || !label.length) {
      seriesButton.empty().append(AUDIOBOOK_SERIES_ICON + '<span></span>');
      label = seriesButton.children('span').first();
    }

    if (label.length) label.text(seriesButtonLabel(seriesName));

    seriesButton
      .addClass('button--book')
      .removeClass('hide hidden')
      .attr('data-subtitle', '\u0421\u0435\u0440\u0438\u044f: ' + (seriesName || playbackBook.fdb_series_id))
      .attr('aria-label', '\u0421\u0435\u0440\u0438\u044f: ' + (seriesName || playbackBook.fdb_series_id))
      .attr('data-lampac-audiobook2-series', '1')
      .css({ opacity: '1', animation: 'none' });

    seriesButton.find('svg').css({ display: 'block', visibility: 'visible', opacity: '1' });
    seriesButton.find('path').css({ fill: 'currentColor' });

    return bindSeriesButton(seriesButton, playbackBook);
  }

  function makeSeriesButton(playbackBook) {
    var seriesButton = $(
      '<div class="full-start__button selector view--audiobook-series button--book" data-lampac-audiobook2-series="1">' +
        AUDIOBOOK_SERIES_ICON +
        '<span></span>' +
      '</div>'
    );

    return repairSeriesButtonMarkup(seriesButton, playbackBook);
  }

  /*
   * Repair buttons which are already present in DOM before consulting the
   * active Full-card context. On return from Player Lampa redraws the action
   * bar asynchronously: the plugin button can survive as an empty shell while
   * Activity.active() temporarily no longer exposes the audiobook card.
   */
  function repairExistingListenButtons(playbackBook, logResult) {
    var buttons = $('.view--audiobook-listen');
    var book = playbackBook || runtime.lastFullPlaybackBook || null;

    if (!buttons.length) return 0;

    buttons.each(function() {
      repairListenButtonMarkup($(this), book);
    });

    if (logResult) {
      audiobookFullButtonLog('restore:direct-repair', {
        buttons: buttons.length,
        hasBook: !!book,
        title: book && book.name || '',
        visible: buttons.filter(function() { return elementIsVisible(this); }).length,
        svg: buttons.find('svg.lampac-audiobook2-listen__svg').length,
        span: buttons.find('span').length
      });
    }

    return buttons.length;
  }

  function makeListenButton(playbackBook) {
    var listenButton = $(
      '<div class="full-start__button selector view--audiobook-listen button--book" data-lampac-audiobook2-listen="1" data-subtitle="\u0421\u043b\u0443\u0448\u0430\u0442\u044c" aria-label="\u0421\u043b\u0443\u0448\u0430\u0442\u044c">' +
        AUDIOBOOK_LISTEN_ICON +
        '<span>\u0421\u043b\u0443\u0448\u0430\u0442\u044c</span>' +
      '</div>'
    );

    return repairListenButtonMarkup(listenButton, playbackBook);
  }

  function findDirectFullButtonsContainer(render) {
    var container = $();
    var candidates = $();
    var selectors = [
      '.full-start-new__buttons',
      '.full-start__buttons',
      '.full-start__buttons-wrap',
      '.full-start__buttons-container'
    ];

    for (var i = 0; i < selectors.length; i++) {
      candidates = render && render.length ? render.find(selectors[i]) : $();
      container = firstVisible(candidates);
      if (container.length && elementIsVisible(container[0])) return container;
    }

    for (var j = 0; j < selectors.length; j++) {
      container = firstVisible($(selectors[j]));
      if (container.length && elementIsVisible(container[0])) return container;
    }

    for (var k = 0; k < selectors.length; k++) {
      candidates = render && render.length ? render.find(selectors[k]) : $();
      if (candidates.length) return candidates.first();
    }

    container = render && render.length
      ? render.find('.button--play, .view--bookmark, .button--bookmark, .view--more, .button--more').first().parent()
      : $();

    if (container.length) return container;
    return $();
  }

  function expandDirectFullButtons(render) {
    var container = findDirectFullButtonsContainer(render);
    var torrentButton;
    if (!container.length) return container;

    container.find('.button--play, .view--play, .view--watch').remove();

    torrentButton = render.find('.full-start__button.view--torrent, .full-start__button.button--torrent').not('.view--audiobook-torrent').first();
    if (torrentButton.length && !torrentButton.closest(container).length) container.append(torrentButton.detach());

    container.find('.view--torrent, .button--torrent').removeClass('hide hidden').css({ display: '', opacity: '1' });
    return container;
  }

  function insertListenButton(container, listenButton) {
    var anchor;
    if (!container || !container.length) return false;

    anchor = container.find('.view--torrent, .button--torrent').first();
    if (anchor.length) { anchor.before(listenButton); return true; }

    anchor = container.find('.view--bookmark, .button--bookmark, .view--favorite, .button--favorite').first();
    if (anchor.length) { anchor.before(listenButton); return true; }

    anchor = container.find('.view--more, .button--more').first();
    if (anchor.length) { anchor.before(listenButton); return true; }

    container.prepend(listenButton);
    return true;
  }

  function insertAuthorButton(container, authorButton) {
    var anchor;
    if (!container || !container.length) return false;

    anchor = container.find('.view--audiobook-listen').first();
    if (anchor.length) { anchor.after(authorButton); return true; }

    anchor = container.find('.view--bookmark, .button--bookmark, .view--favorite, .button--favorite').first();
    if (anchor.length) { anchor.before(authorButton); return true; }

    container.append(authorButton);
    return true;
  }

  function insertSeriesButton(container, seriesButton) {
    var anchor;
    if (!container || !container.length) return false;

    anchor = container.find('.view--audiobook-author').first();
    if (anchor.length) { anchor.after(seriesButton); return true; }

    anchor = container.find('.view--audiobook-listen').first();
    if (anchor.length) { anchor.after(seriesButton); return true; }

    anchor = container.find('.view--bookmark, .button--bookmark, .view--favorite, .button--favorite').first();
    if (anchor.length) { anchor.before(seriesButton); return true; }

    container.append(seriesButton);
    return true;
  }

  function ensureFullAuthorButton(container, render, playbackBook) {
    var author = firstAuthorName(playbackBook && playbackBook.author);
    var current;
    var all;
    var authorButton;

    if (!container || !container.length) return false;

    if (!author) {
      $('.view--audiobook-author').remove();
      return false;
    }

    current = render && render.length ? render.find('.view--audiobook-author').first() : $();
    if (!current.length) current = $('.view--audiobook-author').first();

    all = $('.view--audiobook-author');
    if (current.length) all.not(current).remove();

    if (current.length) {
      if (!$.contains(container[0], current[0])) insertAuthorButton(container, current.detach());
      repairAuthorButtonMarkup(current, playbackBook);
      return true;
    }

    authorButton = makeAuthorButton(playbackBook);
    return insertAuthorButton(container, authorButton);
  }

  function ensureFullSeriesButton(container, render, playbackBook) {
    var current;
    var all;
    var seriesButton;

    if (!container || !container.length) return false;

    if (!playbackBook || !playbackBook.fdb_series_id) {
      $('.view--audiobook-series').remove();
      return false;
    }

    current = render && render.length ? render.find('.view--audiobook-series').first() : $();
    if (!current.length) current = $('.view--audiobook-series').first();

    all = $('.view--audiobook-series');
    if (current.length) all.not(current).remove();

    if (current.length) {
      if (!$.contains(container[0], current[0])) insertSeriesButton(container, current.detach());
      repairSeriesButtonMarkup(current, playbackBook);
      return true;
    }

    seriesButton = makeSeriesButton(playbackBook);
    return insertSeriesButton(container, seriesButton);
  }

  function makeRestoreContext(context) {
    var movie;

    context = context || {};
    movie = runtime.lastFullMovie;

    if (!movie && runtime.lastFullPlaybackBook) {
      movie = {
        source: SOURCE,
        audiobook_book: runtime.lastFullPlaybackBook,
        audiobook2_url: runtime.lastFullPlaybackBook.url || '',
        audiobook2_source: runtime.lastFullPlaybackBook.source || 'audio_fdb',
        audiobook_fdb_work_id: runtime.lastFullPlaybackBook.fdb_work_id || runtime.lastFullPlaybackBook.url || ''
      };
    }

    if (!movie) return context;

    return {
      active: context.active || null,
      activity: context.activity || null,
      movie: movie,
      source: SOURCE,
      isAudiobook: true
    };
  }

  function ensureFullListenButton(event, allowRestoreFallback) {
    var context;
    var render;
    var container;
    var playbackBook;
    var current;
    var all;
    var listenButton;
    var fallbackAllowed;

    if (!isCurrentRuntime()) return false;

    repairExistingListenButtons(runtime.lastFullPlaybackBook, false);

    context = getActiveFullContext(event);
    var visibleFull = firstVisible($('.full-start-new, .full-start'));

    fallbackAllowed = !!allowRestoreFallback &&
      Date.now() <= runtime.fullRestoreUntil &&
      !!runtime.lastFullPlaybackBook &&
      !!visibleFull.length &&
      elementIsVisible(visibleFull[0]);

    if ((!context.isAudiobook || !context.movie) && fallbackAllowed) {
      context = makeRestoreContext(context);
      audiobookFullButtonLog('restore:fallback-context', {
        title: runtime.lastFullPlaybackBook && runtime.lastFullPlaybackBook.name || ''
      });
    }

    if (!context.isAudiobook || !context.movie) {
      return !!$('.view--audiobook-listen').length;
    }

    render = getFullRender(context);
    if (!render.length) return false;
    scheduleAudiobookFullTypeCleanup(render);

    container = expandDirectFullButtons(render);
    if (!container.length) {
      if (!runtime.fullButtonMissingLogged) {
        runtime.fullButtonMissingLogged = true;
        audiobookFullButtonLog('container:missing', { source: context.source || '', title: context.movie && (context.movie.title || context.movie.name) || '' });
      }
      return false;
    }

    runtime.fullButtonMissingLogged = false;
    render.find('.view--audiobook-torrent').remove();
    playbackBook = bookFromCard(context.movie) || runtime.lastFullPlaybackBook;
    runtime.lastFullPlaybackBook = playbackBook || runtime.lastFullPlaybackBook;
    runtime.lastFullMovie = context.movie || runtime.lastFullMovie;

    current = render.find('.view--audiobook-listen').first();

    /*
     * The old Full activity can remain in DOM after Player.close(). Reuse its
     * control only as a source node, then move it into the visible action bar.
     */
    if (!current.length && allowRestoreFallback) {
      current = $('.view--audiobook-listen').first();
    }

    all = $('.view--audiobook-listen');
    if (current.length) all.not(current).remove();

    if (current.length) {
      if (!$.contains(container[0], current[0])) {
        insertListenButton(container, current.detach());
        audiobookFullButtonLog('restore:moved-to-visible-container', {
          title: playbackBook && playbackBook.name || ''
        });
      }
      repairListenButtonMarkup(current, playbackBook);
      ensureFullAuthorButton(container, render, playbackBook);
      ensureFullSeriesButton(container, render, playbackBook);
      return true;
    }

    listenButton = makeListenButton(playbackBook);
    if (!insertListenButton(container, listenButton)) return false;
    ensureFullAuthorButton(container, render, playbackBook);
    ensureFullSeriesButton(container, render, playbackBook);
    audiobookFullButtonLog('inserted', { title: playbackBook && playbackBook.name || '' });
    return true;
  }

  function refreshActiveFullListenButton() { ensureFullListenButton(null, false); }

  function scheduleFullListenButtonRestore(reason) {
    var delays = [0, 80, 220, 500, 1000, 1800, 3000, 4500];
    var token = ++runtime.fullRestoreToken;

    runtime.fullRestoreUntil = Date.now() + 5200;
    audiobookFullButtonLog('restore:scheduled', { reason: reason || 'unknown', token: token });

    delays.forEach(function(delay) {
      later(function() {
        if (token != runtime.fullRestoreToken) return;
        audiobookFullButtonLog('restore:attempt', { reason: reason || 'unknown', delay: delay, token: token });
        repairExistingListenButtons(runtime.lastFullPlaybackBook, true);
        ensureFullListenButton(null, true);
      }, delay);
    });
  }

  function watchFullButtons() {
    if (!window.MutationObserver || runtime.fullObserver) return;
    var timer = 0;
    runtime.fullObserver = new MutationObserver(function() {
      clearTimeout(timer);
      timer = setTimeout(function() {
        if (!isCurrentRuntime()) return;
        refreshActiveFullListenButton();
      }, 180);
    });
    runtime.fullObserver.observe(document.body, { childList: true, subtree: true });
  }

  function addFullListenButton() {
    if (!Lampa.Listener || runtime.fullHookInstalled) return;
    runtime.fullHookInstalled = true;

    Lampa.Listener.follow('full', function(event) {
      var context;

      if (!isCurrentRuntime() || !event || event.type != 'complite') return;

      context = getActiveFullContext(event);

      /*
       * A newly opened non-audiobook Full card cancels the temporary restore
       * window so the previous audiobook action cannot leak into another card.
       */
      if (!context.isAudiobook) {
        runtime.fullRestoreUntil = 0;
        $('.view--audiobook-listen').remove();
        return;
      }

      scheduleAudiobookFullTypeCleanup(getFullRender(context));
      later(function() { ensureFullListenButton(event, false); }, 80);
      later(function() { ensureFullListenButton(event, false); }, 450);
      later(function() { ensureFullListenButton(event, false); }, 900);
      later(function() { ensureFullListenButton(event, false); }, 1600);
    });

    watchFullButtons();
    later(refreshActiveFullListenButton, 350);
    later(refreshActiveFullListenButton, 900);
  }

  function injectStyles() {
    $('#lampac-audiobooks2-style').remove();

    $('body').append(
      '<style id="lampac-audiobooks2-style">' +
      '.lampac-audiobooks2-list{padding-bottom:2em}' +
      '.lampac-audiobook2-card{position:relative;display:flex;align-items:stretch;gap:1.2em;padding:1em 1.2em;margin:0 0 .8em 0;border-radius:.45em;background:rgba(255,255,255,.055);border:2px solid transparent;min-height:11em;overflow:hidden}' +
      '.lampac-audiobook2-card.focus,.lampac-audiobook2-card:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28)}' +
      '.lampac-audiobook2-card__cover{width:7em;min-width:7em;height:9.8em;border-radius:.35em;background:rgba(255,255,255,.08);overflow:hidden}' +
      '.lampac-audiobook2-card__cover img{width:100%;height:100%;object-fit:cover;opacity:.01;transition:opacity .2s}' +
      '.lampac-audiobook2-card__cover.loaded img{opacity:1}' +
      '.lampac-audiobook2-card__body{min-width:0;flex:1;padding-right:8.5em}' +
      '.lampac-audiobook2-card__source{font-size:1em;opacity:.55;margin-bottom:.35em}' +
      '.lampac-audiobook2-card__title{font-size:1.55em;line-height:1.16;font-weight:600;margin-bottom:.35em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}' +
      '.lampac-audiobook2-card__meta{font-size:1.05em;line-height:1.35;opacity:.72;margin-bottom:.55em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.lampac-audiobook2-card__descr{font-size:.98em;line-height:1.35;opacity:.52;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}' +
      '.lampac-audiobook2-card__action{position:absolute;right:1.2em;top:50%;transform:translateY(-50%);padding:.65em 1.05em;border-radius:.35em;background:#fff;color:#111;font-weight:600;white-space:nowrap}' +
      '.card--lampac-audiobook2 .card__type{display:none!important}' +
      '.full--lampac-audiobook2 .card__type,.full--lampac-audiobook2 .full-start__type,.full--lampac-audiobook2 .full-start-new__type,.full--lampac-audiobook2 .full-start__tag,.full--lampac-audiobook2 .full-start-new__tag,.full--lampac-audiobook2 .full-start__quality,.full--lampac-audiobook2 .full-start-new__quality,.full--lampac-audiobook2 .full-start__marker,.full--lampac-audiobook2 .full-start-new__marker{display:none!important}' +
      '.card--lampac-audiobook2 [class*="card__type"]{display:none!important}' +
      '.lampac-audiobook2-detail{display:flex;gap:2em;align-items:flex-start;padding:1em .3em 1.4em}' +
      '.lampac-audiobook2-detail__cover{width:13em;min-width:13em;aspect-ratio:2/3;border-radius:.45em;overflow:hidden;background:rgba(255,255,255,.08)}' +
      '.lampac-audiobook2-detail__cover img{width:100%;height:100%;object-fit:cover}' +
      '.lampac-audiobook2-detail__body{flex:1;min-width:0}' +
      '.lampac-audiobook2-detail__source{font-size:1.1em;opacity:.55;margin-bottom:.5em}' +
      '.lampac-audiobook2-detail__title{font-size:2.35em;line-height:1.1;font-weight:700;margin-bottom:.35em}' +
      '.lampac-audiobook2-detail__meta{font-size:1.15em;line-height:1.45;opacity:.72;margin-bottom:1em}' +
      '.lampac-audiobook2-detail__descr{font-size:1.08em;line-height:1.5;opacity:.68;max-height:13.5em;overflow:hidden}' +
      '.lampac-audiobook2-detail__footer{display:flex;gap:.7em;margin-top:1.6em}' +
      '.lampac-audiobook2-detail__listen,.lampac-audiobook2-detail__author{margin:0}' +
      '.full-start-new__buttons .view--audiobook-listen,.full-start__buttons .view--audiobook-listen{opacity:1!important;animation:none!important}' +
      '.full-start-new__buttons .view--audiobook-listen>.lampac-audiobook2-listen__svg,.full-start__buttons .view--audiobook-listen>.lampac-audiobook2-listen__svg{display:block!important;width:1.55em!important;height:1.55em!important;min-width:1.55em!important;min-height:1.55em!important;visibility:visible!important;opacity:1!important;color:currentColor!important;fill:currentColor!important;-webkit-flex-shrink:0!important;flex-shrink:0!important}' +

      '.view--audiobook-listen>.lampac-audiobook2-listen__svg path{fill:currentColor!important}' +
      '.full-start-new__buttons .view--audiobook-author,.full-start__buttons .view--audiobook-author{opacity:1!important;animation:none!important}' +
      '.full-start-new__buttons .view--audiobook-author>.lampac-audiobook2-author__svg,.full-start__buttons .view--audiobook-author>.lampac-audiobook2-author__svg{display:block!important;width:1.55em!important;height:1.55em!important;min-width:1.55em!important;min-height:1.55em!important;visibility:visible!important;opacity:1!important;color:currentColor!important;fill:currentColor!important;-webkit-flex-shrink:0!important;flex-shrink:0!important}' +
      '.view--audiobook-author>.lampac-audiobook2-author__svg path{fill:currentColor!important}' +
      '.full-start-new__buttons .view--audiobook-series,.full-start__buttons .view--audiobook-series{opacity:1!important;animation:none!important}' +
      '.full-start-new__buttons .view--audiobook-series>.lampac-audiobook2-series__svg,.full-start__buttons .view--audiobook-series>.lampac-audiobook2-series__svg{display:block!important;width:1.55em!important;height:1.55em!important;min-width:1.55em!important;min-height:1.55em!important;visibility:visible!important;opacity:1!important;color:currentColor!important;fill:currentColor!important;-webkit-flex-shrink:0!important;flex-shrink:0!important}' +
      '.view--audiobook-series>.lampac-audiobook2-series__svg path{fill:currentColor!important}' +
      '.player.player--audiobook{background:#000!important}' +
      '.player.player--audiobook .player-video__display{opacity:0!important}' +
      '.player.player--audiobook .player-info,.player.player--audiobook .player-footer{display:none!important}' +
      '.player.player--audiobook .player-panel{display:block!important;position:absolute!important;top:0!important;right:0!important;bottom:0!important;left:0!important;background:transparent!important;visibility:visible!important;opacity:1!important}' +
      '.player.player--audiobook .player-panel> :not(.player-audiobook-books){display:none!important}' +
      '.player.player--audiobook .player-audiobook-view{position:absolute;top:0;right:0;bottom:0;left:0;z-index:6;display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:center;align-items:center;box-sizing:border-box;color:#fff;pointer-events:none}' +
      '.player.player--audiobook .player-audiobook-view__top{position:absolute;top:2.2em;left:3em;right:3em;min-width:0}' +
      '.player.player--audiobook .player-audiobook-view__title{font-size:1.35em;font-weight:600;line-height:1.18;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.player.player--audiobook .player-audiobook-view__author{margin-top:.3em;font-size:1em;opacity:.55;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.player.player--audiobook .player-audiobook-view__center{position:absolute;left:50%;top:36%;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:center;align-items:center;text-align:center}' +
      '.player.player--audiobook .player-audiobook-view__cover{width:18em;height:18em;object-fit:cover;border-radius:.5em;background:rgba(255,255,255,.06);box-shadow:0 .8em 2.3em rgba(0,0,0,.52)}' +
      '.player.player--audiobook .player-audiobook-view__duration{margin-top:1.05em;font-size:1.02em;font-weight:600;opacity:.43}' +
      '.player.player--audiobook .player-audiobook-view__timeline-area{position:absolute;left:3em;right:3em;bottom:6.7em;pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-view__timeline-slot{width:100%}' +
      '.player.player--audiobook .player-audiobook-view__timeline-slot .player-panel__timeline{display:block!important;width:100%!important;margin:0!important;padding:0!important}' +
      '.player.player--audiobook .player-audiobook-view__timeline-slot .player-panel__timeline *{pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-view__dock{position:absolute;left:50%;bottom:1.35em;-webkit-transform:translateX(-50%);transform:translateX(-50%);display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;gap:.18em;width:76vw;max-width:48em;padding:.28em .42em;border-radius:1.35em;background:rgba(255,255,255,.075);pointer-events:auto;box-sizing:border-box}' +
      '.player.player--audiobook .player-audiobook-view__dock .button{display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;margin:0!important;padding:.72em!important;width:2.9em!important;height:2.9em!important;box-sizing:border-box!important;border-radius:50%!important;background:transparent!important}' +
      '.player.player--audiobook .player-audiobook-view__dock .button.focus{background:rgba(255,255,255,.16)!important}' +
      '.player.player--audiobook .player-audiobook-view__dock .button svg{width:1.35em!important;height:1.35em!important}' +
      '.player.player--audiobook .player-audiobook-view__chapter{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;gap:.5em;min-width:0;-webkit-flex:1;flex:1;padding:.62em .78em;border-radius:1em;pointer-events:auto;overflow:hidden}' +
      '.player.player--audiobook .player-audiobook-view__chapter.focus,.player.player--audiobook .player-audiobook-view__chapter:hover{background:rgba(255,255,255,.14)}' +
      '.player.player--audiobook .player-audiobook-view__chapter svg{width:1em;height:1em;min-width:1em;opacity:.72}' +
      '.player.player--audiobook .player-audiobook-view__chapter-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.96em;line-height:1.15}' +
      '.player.player--audiobook .player-audiobook-view__description-open{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;width:2.9em;height:2.9em;border-radius:50%;font-size:1.45em;line-height:1;pointer-events:auto;box-sizing:border-box}' +
      '.player.player--audiobook .player-audiobook-view__description-open.focus,.player.player--audiobook .player-audiobook-view__description-open:hover{background:rgba(255,255,255,.16)}' +
      '.player.player--audiobook.player--audiobook-modal-open .player-audiobook-view{visibility:visible!important}' +
      '.audiobook-description{padding:1.1em 1.25em;font-size:1.08em;line-height:1.55;white-space:normal}' +
      '.audiobook-description__text{white-space:normal}' +
      '.audiobook-description__footer{display:-webkit-flex;display:flex;margin-top:1.25em}' +
      '.audiobook-description__close{margin:0}' +
      '.audiobook-chapters{padding:.4em 0}' +
      '.audiobook-chapters__item{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;padding:1em 1.2em;border-bottom:1px solid rgba(255,255,255,.1)}' +
      '.audiobook-chapters__index{width:3em;opacity:.5}' +
      '.audiobook-chapters__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.audiobook-chapters__item.focus{background:rgba(255,255,255,.12)}' +
      '@media(max-width:700px) and (orientation:portrait){.lampac-audiobook2-card{gap:.8em;padding:.8em;min-height:9.5em}.lampac-audiobook2-card__cover{width:5.8em;min-width:5.8em;height:8.2em}.lampac-audiobook2-card__body{padding-right:0}.lampac-audiobook2-card__action{position:static;align-self:flex-end;transform:none;margin-left:auto}.lampac-audiobook2-card__descr{display:none}.lampac-audiobook2-detail{display:block}.lampac-audiobook2-detail__cover{width:9em;min-width:9em;margin-bottom:1em}.lampac-audiobook2-detail__title{font-size:1.8em}.player.player--audiobook .player-audiobook-view__top{top:5.6em;left:1.6em;right:1.6em}.player.player--audiobook .player-audiobook-view__title{font-size:1.1em}.player.player--audiobook .player-audiobook-view__author{font-size:.92em}.player.player--audiobook .player-audiobook-view__center{top:36%}.player.player--audiobook .player-audiobook-view__cover{width:78vw;height:78vw;max-width:22em;max-height:22em;border-radius:.35em}.player.player--audiobook .player-audiobook-view__duration{margin-top:1.2em}.player.player--audiobook .player-audiobook-view__timeline-area{left:1.5em;right:1.5em;bottom:7.3em}.player.player--audiobook .player-audiobook-view__dock{bottom:1.15em;width:calc(100% - 3em);padding:.22em .3em}.player.player--audiobook .player-audiobook-view__chapter-text{font-size:.86em}}' +
      '@media(min-width:701px), (orientation:landscape){.player.player--audiobook .player-audiobook-view__top{display:none}.player.player--audiobook .player-audiobook-view__cover{width:17em;height:17em}.player.player--audiobook .player-audiobook-view__duration{font-size:.98em}.player.player--audiobook .player-audiobook-view__timeline-area{left:2.2em;right:2.2em;bottom:6.25em}.player.player--audiobook .player-audiobook-view__dock{bottom:1.1em;width:72vw;max-width:46em}}' +
      '</style>'
    );

    $('#lampac-audiobooks2-books-player-style').remove();
    $('body').append(
      '<style id="lampac-audiobooks2-books-player-style">' +
      '.player.player--audiobook .player-audiobook-books{position:absolute;top:0;right:0;bottom:0;left:0;z-index:7;box-sizing:border-box;color:#fff;pointer-events:none;background:#000}' +
      '.player.player--audiobook .player-audiobook-books__top{position:absolute;top:2.2em;left:2.2em;right:2.2em;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;gap:1em;pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-books__back,.player.player--audiobook .player-audiobook-books__top-button{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;width:3.1em;height:3.1em;min-width:3.1em;border-radius:50%;background:rgba(255,255,255,.09);box-sizing:border-box}' +
      '.player.player--audiobook .player-audiobook-books__back.focus,.player.player--audiobook .player-audiobook-books__top-button.focus,.player.player--audiobook .player-audiobook-books__back:hover,.player.player--audiobook .player-audiobook-books__top-button:hover{background:rgba(255,255,255,.2)}' +
      '.player.player--audiobook .player-audiobook-books__back svg,.player.player--audiobook .player-audiobook-books__top-button svg{width:1.5em;height:1.5em}' +
      '.player.player--audiobook .player-audiobook-books__heading{min-width:0;-webkit-flex:1;flex:1}' +
      '.player.player--audiobook .player-audiobook-books__title{font-size:1.28em;font-weight:600;line-height:1.18;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.player.player--audiobook .player-audiobook-books__author{margin-top:.28em;font-size:1em;line-height:1.15;opacity:.52;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.player.player--audiobook .player-audiobook-books__top-actions{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;gap:.75em}' +
      '.player.player--audiobook .player-audiobook-books__more{display:none!important}' +
      '.player.player--audiobook .player-audiobook-books__center{position:absolute;left:50%;top:40%;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);display:-webkit-flex;display:flex;-webkit-flex-direction:column;flex-direction:column;-webkit-align-items:center;align-items:center;text-align:center;pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-books__cover{width:20em;height:20em;object-fit:cover;border-radius:.4em;background:rgba(255,255,255,.06);box-shadow:0 1.3em 3em rgba(0,0,0,.64)}' +
      '.player.player--audiobook .player-audiobook-books__duration{margin-top:1.3em;font-size:1.12em;font-weight:600;opacity:.43;white-space:nowrap}' +
      '.player.player--audiobook .player-audiobook-books__chapter{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;gap:.52em;margin-top:.9em;max-width:min(82vw,42em);padding:.55em .9em;border-radius:1.4em;box-sizing:border-box;pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-books__chapter.focus,.player.player--audiobook .player-audiobook-books__chapter:hover{background:rgba(255,255,255,.13)}' +
      '.player.player--audiobook .player-audiobook-books__chapter svg{width:1.15em;height:1.15em;min-width:1.15em;opacity:.78}' +
      '.player.player--audiobook .player-audiobook-books__chapter-text{font-size:1em;font-weight:600;line-height:1.18;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.player.player--audiobook .player-audiobook-books__controls{position:absolute;left:50%;bottom:9.6em;-webkit-transform:translateX(-50%);transform:translateX(-50%);display:-webkit-flex;display:flex;-webkit-flex-wrap:nowrap;flex-wrap:nowrap;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;gap:.72em;width:min(96vw,58em);pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-books__control-group{display:-webkit-flex;display:flex;-webkit-flex-wrap:nowrap;flex-wrap:nowrap;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;gap:.28em}' +
      '.player.player--audiobook .player-audiobook-books__control,.player.player--audiobook .player-audiobook-books__chapter-nav-slot{display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;width:3.45em;height:3.45em;border-radius:50%;box-sizing:border-box;font-size:1em}' +
      '.player.player--audiobook .player-audiobook-books__control.focus,.player.player--audiobook .player-audiobook-books__control:hover,.player.player--audiobook .player-audiobook-books__chapter-nav-slot .button.focus{background:rgba(255,255,255,.13)}' +
      '.player.player--audiobook .player-audiobook-books__timer.active{background:rgba(255,255,255,.2)}' +
      '.player.player--audiobook .player-audiobook-books__control svg{width:2em;height:2em}' +
      '.player.player--audiobook .player-audiobook-books__chapter-nav-slot .button{display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;margin:0!important;padding:.62em!important;width:3.45em!important;height:3.45em!important;border-radius:50%!important;background:transparent!important;box-sizing:border-box!important}' +
      '.player.player--audiobook .player-audiobook-books__chapter-nav-slot .button svg{width:1.55em!important;height:1.55em!important}' +
      '.player.player--audiobook .player-audiobook-books__control--play{width:5.5em;height:5.5em;background:rgba(255,255,255,.78);color:#000}' +
      '.player.player--audiobook .player-audiobook-books__control--play.focus,.player.player--audiobook .player-audiobook-books__control--play:hover{background:#fff}' +
      '.player.player--audiobook .player-audiobook-books__control--play svg{width:2.6em;height:2.6em}' +
      '.player.player--audiobook .player-audiobook-books__speed{font-size:1.14em}' +
      '.player.player--audiobook .player-audiobook-books__timeline{position:absolute;left:3em;right:3em;bottom:5.7em;pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-books__timeline-slot{width:100%}' +
      '.player.player--audiobook .player-audiobook-books__timeline-slot .player-panel__timeline{display:block!important;width:100%!important;margin:0!important;padding:0!important}' +
      '.player.player--audiobook .player-audiobook-books__timeline-slot .player-panel__timeline *{pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-books__timeline-times-slot{width:100%;margin-top:.5em}' +
      '.player.player--audiobook .player-audiobook-books__timeline-times-slot .player-panel__line-one{display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:space-between!important;justify-content:space-between!important;margin:0!important;font-size:.95em!important;opacity:.72!important}' +
      '.player.player--audiobook .player-audiobook-books__timeline-times-slot .player-panel__timenow,.player.player--audiobook .player-audiobook-books__timeline-times-slot .player-panel__timeend{display:block!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities{position:absolute;left:2.5em;right:2.5em;bottom:1.25em;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;pointer-events:auto}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot{display:-webkit-flex;display:flex;-webkit-flex-wrap:nowrap;flex-wrap:nowrap;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;gap:1em;min-height:3em}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot .button,.player.player--audiobook .player-audiobook-books__utilities-slot .player-panel__quality{display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;margin:0!important;min-width:3em!important;height:3em!important;padding:.65em!important;border-radius:50%!important;box-sizing:border-box!important;background:transparent!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot .button.focus,.player.player--audiobook .player-audiobook-books__utilities-slot .player-panel__quality.focus{background:rgba(255,255,255,.15)!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot svg{width:1.35em!important;height:1.35em!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot:empty{display:none}' +
      '.player.player--audiobook.player--audiobook-modal-open .player-audiobook-books{visibility:visible!important}' +
      '@media(max-width:700px) and (orientation:portrait){.player.player--audiobook .player-audiobook-books__top{top:4.9em;left:1.55em;right:1.55em;gap:.8em}.player.player--audiobook .player-audiobook-books__back,.player.player--audiobook .player-audiobook-books__top-button{width:3.05em;height:3.05em;min-width:3.05em}.player.player--audiobook .player-audiobook-books__title{font-size:1.08em}.player.player--audiobook .player-audiobook-books__author{font-size:.92em}.player.player--audiobook .player-audiobook-books__center{top:37.2%}.player.player--audiobook .player-audiobook-books__cover{width:77vw;height:77vw;max-width:22em;max-height:22em}.player.player--audiobook .player-audiobook-books__duration{margin-top:1.35em;font-size:1em}.player.player--audiobook .player-audiobook-books__chapter{margin-top:.82em;max-width:calc(100vw - 4em);font-size:.95em}.player.player--audiobook .player-audiobook-books__controls{bottom:15.5em;width:calc(100% - 1.6em);gap:.48em}.player.player--audiobook .player-audiobook-books__control-group{gap:.18em}.player.player--audiobook .player-audiobook-books__control,.player.player--audiobook .player-audiobook-books__chapter-nav-slot{width:2.72em;height:2.72em;min-width:2.72em}.player.player--audiobook .player-audiobook-books__chapter-nav-slot .button{width:2.72em!important;height:2.72em!important;min-width:2.72em!important;padding:.42em!important}.player.player--audiobook .player-audiobook-books__chapter-nav-slot .button svg{width:1.3em!important;height:1.3em!important}.player.player--audiobook .player-audiobook-books__control svg{width:1.68em;height:1.68em}.player.player--audiobook .player-audiobook-books__control--play{width:4.35em;height:4.35em;min-width:4.35em}.player.player--audiobook .player-audiobook-books__control--play svg{width:2.22em;height:2.22em}.player.player--audiobook .player-audiobook-books__speed{font-size:.98em}.player.player--audiobook .player-audiobook-books__timeline{left:1.55em;right:1.55em;bottom:9.5em}.player.player--audiobook .player-audiobook-books__utilities{left:1.4em;right:1.4em;bottom:3.35em}}' +
      '@media(min-width:701px) and (orientation:landscape){.player.player--audiobook .player-audiobook-books__top{top:1.45em;left:2em;right:2em}.player.player--audiobook .player-audiobook-books__center{left:31%;top:46%;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%)}.player.player--audiobook .player-audiobook-books__cover{width:min(39vh,14em);height:min(39vh,14em)}.player.player--audiobook .player-audiobook-books__duration{margin-top:.85em;font-size:1em}.player.player--audiobook .player-audiobook-books__chapter{margin-top:.65em;max-width:min(36vw,30em);font-size:.92em}.player.player--audiobook .player-audiobook-books__controls{left:68%;top:48%;bottom:auto;-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);width:min(62vw,54em);gap:.72em}.player.player--audiobook .player-audiobook-books__timeline{left:2em;right:2em;bottom:4.75em}.player.player--audiobook .player-audiobook-books__utilities{left:2em;right:2em;bottom:.55em}}' +
      '</style>'
    );

    /* Remove obsolete player-spacing patch from earlier iterations. */
    $('#lampac-audiobooks2-books-player-fix-style').remove();

    $('#lampac-audiobooks2-native-controls-style').remove();
    $('#lampac-audiobooks2-books-player-fix-style').remove();
    $('body').append(
      '<style id="lampac-audiobooks2-native-controls-style">' +
      /* Native controls stay native. Only rewind icons use the visual language from the earlier audiobook player. */
      '.player.player--audiobook .player-audiobook-books__controls{display:-webkit-flex!important;display:flex!important;-webkit-flex-wrap:nowrap!important;flex-wrap:nowrap!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;gap:1.1em!important;width:min(96vw,72em)!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot,.player.player--audiobook .player-audiobook-books__native-chapter-slot,.player.player--audiobook .player-audiobook-books__aux-slot,.player.player--audiobook .player-audiobook-books__inline-utilities-slot{display:-webkit-flex!important;display:flex!important;-webkit-flex-wrap:nowrap!important;flex-wrap:nowrap!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;-webkit-flex-shrink:0!important;flex-shrink:0!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot{gap:.62em!important}' +
      '.player.player--audiobook .player-audiobook-books__native-chapter-slot{gap:.52em!important}' +
      '.player.player--audiobook .player-audiobook-books__aux-slot{gap:.52em!important}' +
      '.player.player--audiobook .player-audiobook-books__inline-utilities-slot{gap:.52em!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rprev{-webkit-order:10!important;order:10!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play{-webkit-order:20!important;order:20!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rnext{-webkit-order:30!important;order:30!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .button,.player.player--audiobook .player-audiobook-books__native-chapter-slot .button{position:relative!important;display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;-webkit-flex-shrink:0!important;flex-shrink:0!important;margin:0!important;padding:.72em!important;width:3.7em!important;height:3.7em!important;min-width:3.7em!important;border-radius:50%!important;box-sizing:border-box!important;background:transparent!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .button.focus,.player.player--audiobook .player-audiobook-books__native-chapter-slot .button.focus{background:#fff!important;color:#000!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .button svg,.player.player--audiobook .player-audiobook-books__native-chapter-slot .button svg{width:1.72em!important;height:1.72em!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rprev,.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rnext{background:rgba(255,255,255,.08)!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rprev.focus,.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rnext.focus{background:#fff!important;color:#000!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rprev svg,.player.player--audiobook .player-audiobook-books__native-seek-slot .player-panel__rnext svg{opacity:1!important;width:2em!important;height:2em!important}' +
      '.player.player--audiobook .player-audiobook-books__chapter{pointer-events:none!important;background:transparent!important;padding:.15em 0!important;border-radius:0!important;gap:0!important}' +
      '.player.player--audiobook .player-audiobook-books__chapter svg{display:none!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play{width:5.6em!important;height:5.6em!important;min-width:5.6em!important;background:rgba(255,255,255,.08)!important;color:#fff!important;overflow:hidden!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play.focus,.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play:hover{background:#fff!important;color:#000!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play>div{position:absolute!important;left:50%!important;top:50%!important;display:block!important;-webkit-transform:translate(-50%,-50%) scale(1)!important;transform:translate(-50%,-50%) scale(1)!important;opacity:1!important;-webkit-transition:opacity .18s ease,-webkit-transform .18s ease!important;transition:opacity .18s ease,transform .18s ease!important;will-change:opacity,transform}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play>div:first-child{opacity:0!important;-webkit-transform:translate(-50%,-50%) scale(.78)!important;transform:translate(-50%,-50%) scale(.78)!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play.lampac-audiobook2-native-paused>div:first-child{opacity:1!important;-webkit-transform:translate(-50%,-50%) scale(1)!important;transform:translate(-50%,-50%) scale(1)!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play.lampac-audiobook2-native-paused>div:last-child{opacity:0!important;-webkit-transform:translate(-50%,-50%) scale(.78)!important;transform:translate(-50%,-50%) scale(.78)!important}' +
      '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play svg{width:2.55em!important;height:2.55em!important}' +
      '.player.player--audiobook .player-audiobook-books__timer,.player.player--audiobook .player-audiobook-books__speed{display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;-webkit-flex-shrink:0!important;flex-shrink:0!important;width:3.7em!important;height:3.7em!important;min-width:3.7em!important;margin:0!important}' +
      '.player.player--audiobook .player-audiobook-books__timer.focus,.player.player--audiobook .player-audiobook-books__speed.focus{background:#fff!important;color:#000!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot{gap:1.9em!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot .button{display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;margin:0!important;padding:.68em!important;width:3.25em!important;height:3.25em!important;min-width:3.25em!important;border-radius:50%!important;box-sizing:border-box!important;background:transparent!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot .button.focus{background:#fff!important;color:#000!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities-slot .button svg{width:1.55em!important;height:1.55em!important}' +
      '.player.player--audiobook .player-audiobook-books__inline-utilities-slot .button{display:-webkit-flex!important;display:flex!important;-webkit-align-items:center!important;align-items:center!important;-webkit-justify-content:center!important;justify-content:center!important;margin:0!important;padding:.48em!important;width:2.85em!important;height:2.85em!important;min-width:2.85em!important;border-radius:50%!important;box-sizing:border-box!important;background:transparent!important}' +
      '.player.player--audiobook .player-audiobook-books__inline-utilities-slot .button.focus{background:#fff!important;color:#000!important}' +
      '.player.player--audiobook .player-audiobook-books__inline-utilities-slot .button svg{width:1.42em!important;height:1.42em!important}' +
      '.player.player--audiobook .player-audiobook-books__inline-utilities-slot:empty{display:none!important}' +
      '.player.player--audiobook .player-audiobook-books__utilities{display:none!important}' +
      '@media(max-width:700px) and (orientation:portrait){' +
        '.player.player--audiobook .player-audiobook-books__top{top:2.2em!important;left:1.35em!important;right:1.35em!important}' +
        '.player.player--audiobook .player-audiobook-books__center{top:32.8%!important}' +
        '.player.player--audiobook .player-audiobook-books__cover{width:68vw!important;height:68vw!important;min-width:14.8em!important;min-height:14.8em!important;max-width:24em!important;max-height:24em!important}' +
        '.player.player--audiobook .player-audiobook-books__duration{margin-top:.78em!important;font-size:1.06em!important}' +
        '.player.player--audiobook .player-audiobook-books__chapter{margin-top:.58em!important;max-width:calc(100vw - 2.4em)!important;font-size:1.02em!important}' +
        '.player.player--audiobook .player-audiobook-books__controls{bottom:15.2em!important;width:calc(100% - 1.2em)!important;-webkit-flex-wrap:wrap!important;flex-wrap:wrap!important;gap:.48em .72em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot{-webkit-order:10!important;order:10!important;-webkit-flex-basis:100%!important;flex-basis:100%!important;gap:.58em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-chapter-slot{-webkit-order:20!important;order:20!important}' +
        '.player.player--audiobook .player-audiobook-books__aux-slot{-webkit-order:30!important;order:30!important}' +
        '.player.player--audiobook .player-audiobook-books__inline-utilities-slot{-webkit-order:40!important;order:40!important}' +
        '.player.player--audiobook .player-audiobook-books__native-chapter-slot,.player.player--audiobook .player-audiobook-books__aux-slot,.player.player--audiobook .player-audiobook-books__inline-utilities-slot{gap:.4em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot .button,.player.player--audiobook .player-audiobook-books__native-chapter-slot .button,.player.player--audiobook .player-audiobook-books__inline-utilities-slot .button{width:3.25em!important;height:3.25em!important;min-width:3.25em!important;padding:.54em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot .button svg,.player.player--audiobook .player-audiobook-books__native-chapter-slot .button svg,.player.player--audiobook .player-audiobook-books__inline-utilities-slot .button svg{width:1.68em!important;height:1.68em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play{width:5.85em!important;height:5.85em!important;min-width:5.85em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play svg{width:2.88em!important;height:2.88em!important}' +
        '.player.player--audiobook .player-audiobook-books__timer,.player.player--audiobook .player-audiobook-books__speed{width:3.25em!important;height:3.25em!important;min-width:3.25em!important;font-size:1.02em!important}' +
        '.player.player--audiobook .player-audiobook-books__timeline{bottom:3.25em!important;left:1.35em!important;right:1.35em!important}' +
      '}' +
      '@media(max-height:700px) and (orientation:portrait){' +
        '.player.player--audiobook .player-audiobook-books__top{top:1.7em!important}' +
        '.player.player--audiobook .player-audiobook-books__center{top:31.5%!important}' +
        '.player.player--audiobook .player-audiobook-books__cover{width:62vw!important;height:62vw!important;min-width:13.2em!important;min-height:13.2em!important;max-width:18.5em!important;max-height:18.5em!important}' +
        '.player.player--audiobook .player-audiobook-books__duration{margin-top:.64em!important}' +
        '.player.player--audiobook .player-audiobook-books__chapter{margin-top:.46em!important;font-size:.96em!important}' +
        '.player.player--audiobook .player-audiobook-books__controls{bottom:10.1em!important;gap:.36em .58em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot .button,.player.player--audiobook .player-audiobook-books__native-chapter-slot .button,.player.player--audiobook .player-audiobook-books__inline-utilities-slot .button{width:3.05em!important;height:3.05em!important;min-width:3.05em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot .lampac-audiobook2-native-play{width:5.35em!important;height:5.35em!important;min-width:5.35em!important}' +
        '.player.player--audiobook .player-audiobook-books__timer,.player.player--audiobook .player-audiobook-books__speed{width:3.05em!important;height:3.05em!important;min-width:3.05em!important}' +
        '.player.player--audiobook .player-audiobook-books__timeline{bottom:2.45em!important}' +
      '}' +
      '@media(min-width:701px) and (orientation:landscape){' +
        '.player.player--audiobook .player-audiobook-books__controls{left:69%!important;width:min(61vw,64em)!important;gap:1.1em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-seek-slot{gap:.62em!important}' +
        '.player.player--audiobook .player-audiobook-books__native-chapter-slot,.player.player--audiobook .player-audiobook-books__aux-slot{gap:.52em!important}' +
      '}' +
      '</style>'
    );
  }

  function compactPlayerTitle(value) {
    var title = (value || '').toString().replace(/\s+/g, ' ').trim();
    var shortTitle;

    if (!title) return '';

    shortTitle = title.split(/[.:]/)[0].trim() || title;

    if (/^[\u0410-\u042f\u04010-9\s\-]+$/.test(shortTitle)) {
      shortTitle = shortTitle.toLowerCase();
      shortTitle = shortTitle.charAt(0).toUpperCase() + shortTitle.slice(1);
    }

    return shortTitle;
  }

  function audiobookCurrentMedia() {
    var media = null;

    try {
      if (Lampa.PlayerVideo && Lampa.PlayerVideo.video) media = Lampa.PlayerVideo.video();
    } catch (e) {}

    if (!media) media = document.querySelector('.player video, .player audio');
    if (!media) media = document.querySelector('video, audio');

    return media;
  }

  function audiobookNativePanel() {
    var panel = null;

    try {
      if (Lampa.PlayerPanel && Lampa.PlayerPanel.render) panel = Lampa.PlayerPanel.render();
    } catch (e) {}

    if (!panel || !panel.length) panel = $('.player-panel').first();
    return panel;
  }

  function isAudiobookMobilePortrait() {
    var width = window.innerWidth || document.documentElement.clientWidth || 0;
    var height = window.innerHeight || document.documentElement.clientHeight || 0;

    try {
      if (window.matchMedia && window.matchMedia('(max-width:700px) and (orientation:portrait)').matches) return true;
    } catch (e) {}

    return !!(width && height && width <= 700 && height >= width);
  }

  function triggerNativePlayerControl(selector) {
    var panel = audiobookNativePanel();
    var control = panel && panel.length ? panel.find(selector).first() : $();

    if (!control.length) control = $(selector).first();
    if (!control.length) return false;

    control.trigger('hover:enter');
    return true;
  }

  function audiobookSeekBy(seconds) {
    var media = audiobookCurrentMedia();

    if (media && isFinite(media.currentTime)) {
      try {
        media.currentTime = Math.max(0, Math.min(media.duration || Infinity, media.currentTime + seconds));
        return;
      } catch (e) {}
    }

    triggerNativePlayerControl(seconds < 0 ? '.player-panel__rprev' : '.player-panel__rnext');
  }

  function audiobookTogglePlayback() {
    var media = audiobookCurrentMedia();

    if (media) {
      try {
        if (media.paused) {
          var promise = media.play();
          if (promise && promise.catch) promise.catch(function() {});
        } else {
          media.pause();
        }
        return;
      } catch (e) {}
    }

    triggerNativePlayerControl('.player-panel__playpause');
  }

  function decodeAudiobookUrl(value) {
    try {
      return decodeURIComponent(value || '');
    } catch (e) {
      return value || '';
    }
  }

  function currentAudiobookPlaylistIndex() {
    var list = CURRENT_AUDIOBOOK_PLAYLIST || [];
    var media = audiobookCurrentMedia();
    var currentUrl = media ? (media.currentSrc || media.src || '') : '';
    var currentDecoded = decodeAudiobookUrl(currentUrl);
    var index = -1;

    if (!list.length) return -1;

    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].url && (list[i].url == currentUrl || decodeAudiobookUrl(list[i].url) == currentDecoded)) {
        index = i;
        break;
      }
    }

    if (index < 0 && ACTIVE_PLAYER_META && ACTIVE_PLAYER_META.chapter_index) index = ACTIVE_PLAYER_META.chapter_index - 1;
    if (index < 0) index = 0;

    return Math.max(0, Math.min(list.length - 1, index));
  }

  function audiobookPlayPlaylistIndex(index) {
  var list = CURRENT_AUDIOBOOK_PLAYLIST || [];
  var item;
  var playedInline = false;

  index = parseInt(index, 10);
  if (!list.length || !isFinite(index)) return;

  index = Math.max(0, Math.min(list.length - 1, index));
  item = list[index];
  if (!item) return;

  item.from_lampac_audiobooks2 = true;
  prepareAudiobookTimelineForResume(item, item.audiobook_resume_time || 0, item.audiobook_resume_duration || 0, item.audiobook_resume_percent || 0);

  forceAudiobookInnerPlayer();
  activateAudiobookTrack(item);

  playedInline = playAudiobookItemInCurrentMedia(item, list);

  if (!playedInline) {
    forceAudiobookInnerPlayer();
    try { Lampa.Player.runas('inner'); } catch (e) {}
    try { Lampa.Player.play(item); } catch (e2) {}
    try { Lampa.Player.playlist(list); } catch (e3) {}
  }

  later(function() {
    forceAudiobookInnerPlayer();

    if (typeof AudiobookPlayerView != 'undefined' && AudiobookPlayerView && AudiobookPlayerView.refresh) {
      AudiobookPlayerView.refresh(ACTIVE_PLAYER_META);
    }
  }, 120);
}

  function audiobookSwitchChapter(direction, skipNative) {
  var list = CURRENT_AUDIOBOOK_PLAYLIST || [];
  var index;
  var nextIndex;

  if (!list.length) return;

  index = currentAudiobookPlaylistIndex();
  if (index < 0) index = 0;

  nextIndex = Math.max(0, Math.min(list.length - 1, index + direction));
  if (nextIndex == index) return;

  audiobookPlayPlaylistIndex(nextIndex);
}

  function bindAudiobookAction(element, handler) {
    var lastAction = 0;
    if (!element || !element.length) return;

    element
      .off('hover:enter.lampac-audiobooks2 click.lampac-audiobooks2')
      .on('hover:enter.lampac-audiobooks2 click.lampac-audiobooks2', function(event) {
        var now = Date.now();
        if (now - lastAction < 320) return;
        lastAction = now;
        handler.call(this, event);
      });
  }

  var AUDIOBOOK_ICON_REWIND_15 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><text x="8.1" y="15.2" fill="currentColor" stroke="none" font-size="7.6" font-family="Arial">15</text></svg>';
  var AUDIOBOOK_ICON_FORWARD_30 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/><text x="8.1" y="15.2" fill="currentColor" stroke="none" font-size="7.6" font-family="Arial">30</text></svg>';

  function replaceAudiobookControlSvg(node, svg, marker) {
    if (!node || !node.length || !svg) return;
    if (node.attr('data-lampac-audiobook2-icon') == marker) return;
    if (!node.attr('data-lampac-audiobook2-original-html')) node.attr('data-lampac-audiobook2-original-html', node.html());
    node.html(svg);
    node.attr('data-lampac-audiobook2-icon', marker);
  }

  var AudiobookPlayerView = {
    root: null,
    panel: null,
    view: null,
    title: null,
    author: null,
    cover: null,
    duration: null,
    chapter: null,
    chapterText: null,
    speed: null,
    timerButton: null,
    playIcon: null,
    pauseIcon: null,
    playPauseButton: null,
    utilitySlot: null,
    nativeNodes: {},
    nativeMarkers: {},
    nativeHomes: {},
    nativeHidden: {},
    nativeControllers: {},
    video: null,
    videoHandlers: null,
    sleepTimer: 0,
    sleepUntil: 0,
    preferredRate: 1,
    lastFocus: null,
    mountRetryToken: 0,
    mountObserverTimer: 0,
    ignoreMutationsUntil: 0,
    controllerName: 'lampac_audiobook_panel',
    controllerInstalled: false,
    collectionDirty: true,

    renderRoot: function() {
      var render;
      try {
        render = Lampa.Player && Lampa.Player.render ? Lampa.Player.render() : null;
      } catch (e) {
        render = null;
      }
      if (!render || !render.length) render = $('.player').first();
      return render;
    },

    storedNodeUsable: function(node) {
      var element = node && node.length ? node[0] : null;

      if (!element) return false;
      if (this.root && this.root.length && $.contains(this.root[0], element)) return true;
      if (this.view && this.view.length && $.contains(this.view[0], element)) return true;
      return !!element.parentNode;
    },

    releaseStoredNode: function(key) {
      var marker = this.nativeMarkers[key];
      if (marker && marker.parentNode) {
        try { marker.parentNode.removeChild(marker); } catch (e) {}
      }
      delete this.nativeMarkers[key];
      delete this.nativeHomes[key];
      delete this.nativeNodes[key];
      delete this.nativeHidden[key];
      delete this.nativeControllers[key];
    },

    storeAndMove: function(key, node, target) {
      var marker;
      var parent;
      if (!node || !node.length || !target || !target.length) return false;

      /*
       * Player.render() may be detached from document while Lampa is switching
       * between player states. A node inside that detached player root is still
       * valid. Do not discard its marker merely because document.contains() is
       * temporarily false.
       */
      if (this.nativeNodes[key] && !this.storedNodeUsable(this.nativeNodes[key])) {
        this.releaseStoredNode(key);
      }

      if (!node.closest('.player-audiobook-books').length && node[0].parentNode) {
        parent = node[0].parentNode;

        if (!this.nativeHomes[key]) {
          this.nativeHomes[key] = { parent: parent, next: node[0].nextSibling };
          this.nativeControllers[key] = node.attr('data-controller');
        }

        if (!this.nativeMarkers[key]) {
          marker = document.createComment('lampac-audiobooks2-' + key);
          parent.insertBefore(marker, node[0]);
          this.nativeMarkers[key] = marker;
        }
      }

      this.nativeNodes[key] = node;
      if (node.parent()[0] !== target[0]) {
        target.append(node);
        this.collectionDirty = true;
      }
      return true;
    },

    findMovable: function(selector, key) {
      var stored = this.nativeNodes[key];
      var node;

      if (this.storedNodeUsable(stored)) return stored;
      if (stored) this.releaseStoredNode(key);

      node = this.root.find(selector).filter(function() {
        return !$(this).closest('.player-audiobook-books').length;
      }).first();

      if (!node.length) node = this.root.find(selector).first();
      return node;
    },

    restoreNativeNodes: function() {
      var marker;
      var home;
      var panel;
      var node;
      var originalHtml;
      var originalController;
      var restored = [];
      var keys = {};
      var key;

      for (key in this.nativeNodes) if (this.nativeNodes.hasOwnProperty(key)) keys[key] = true;
      for (key in this.nativeMarkers) if (this.nativeMarkers.hasOwnProperty(key)) keys[key] = true;
      for (key in this.nativeHomes) if (this.nativeHomes.hasOwnProperty(key)) keys[key] = true;

      audiobookUiLog('native:restore-start', {
        keys: Object.keys(keys),
        markerKeys: Object.keys(this.nativeMarkers || {}),
        homeKeys: Object.keys(this.nativeHomes || {})
      });

      panel = this.panel && this.panel.length ? this.panel : audiobookNativePanel();

      for (key in keys) {
        if (!keys.hasOwnProperty(key)) continue;
        marker = this.nativeMarkers[key];
        home = this.nativeHomes[key];
        node = this.nativeNodes[key];

        if (!node || !node.length) continue;

        node
          .removeClass('lampac-audiobook2-native-control lampac-audiobook2-native-play lampac-audiobook2-native-paused lampac-audiobook2-native-utility')
          .off('.lampac-audiobooks2-native');
        originalHtml = node.attr('data-lampac-audiobook2-original-html');
        if (typeof originalHtml != 'undefined') {
          node.html(originalHtml);
          node.removeAttr('data-lampac-audiobook2-original-html data-lampac-audiobook2-icon');
        }

        originalController = this.nativeControllers[key];
        if (typeof originalController == 'undefined' || originalController === null) node.removeAttr('data-controller');
        else node.attr('data-controller', originalController);

        if (this.nativeHidden[key]) node.addClass('hide');
        else node.removeClass('hide');

        if (marker && marker.parentNode) {
          try {
            marker.parentNode.insertBefore(node[0], marker);
            marker.parentNode.removeChild(marker);
            restored.push(key + ':marker');
            continue;
          } catch (e) {}
        }

        if (home && home.parent) {
          try {
            if (home.next && home.next.parentNode === home.parent) home.parent.insertBefore(node[0], home.next);
            else home.parent.appendChild(node[0]);
            restored.push(key + ':home');
            continue;
          } catch (e2) {}
        }

        /* Defensive recovery for sessions already damaged by an older build. */
        if (panel && panel.length) {
          try {
            panel.append(node);
            restored.push(key + ':panel-fallback');
          } catch (e3) {}
        }
      }

      for (key in this.nativeMarkers) {
        if (!this.nativeMarkers.hasOwnProperty(key)) continue;
        marker = this.nativeMarkers[key];
        if (marker && marker.parentNode) {
          try { marker.parentNode.removeChild(marker); } catch (e4) {}
        }
      }

      this.nativeNodes = {};
      this.nativeMarkers = {};
      this.nativeHomes = {};
      this.nativeHidden = {};
      this.nativeControllers = {};

      audiobookUiLog('native:restore-complete', {
        restored: restored
      });
    },

    moveUtility: function(key, selector) {
      var node;
      if (!this.utilitySlot || !this.utilitySlot.length) return;
      node = this.findMovable(selector, key);
      if (node && node.length) this.storeAndMove(key, node, this.utilitySlot);
    },

    bindMovedNativeClicks: function() {
      var self = this;

      if (!this.view || !this.view.length) return;

      function clearCapture(node) {
        if (!node || !node.__lampacAudiobookNativeCapture) return;
        try { node.removeEventListener('click', node.__lampacAudiobookNativeCapture, true); } catch (e) {}
        node.__lampacAudiobookNativeCapture = null;
      }

      if (!isAudiobookMobilePortrait()) {
        this.view.find('.player-panel__rprev,.player-panel__rnext,.player-panel__prev,.player-panel__next,.player-panel__tracks,.player-panel__playlist')
          .each(function() { clearCapture(this); })
          .off('click.lampac-audiobooks2-native hover:enter.lampac-audiobooks2-native');
        return;
      }

      function runNativeAction(node, event, handler) {
        var now = Date.now();

        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopImmediatePropagation) event.stopImmediatePropagation();
        else if (event && event.stopPropagation) event.stopPropagation();

        if (node.__lampacAudiobookLastNativeAction && now - node.__lampacAudiobookLastNativeAction < 280) return;
        node.__lampacAudiobookLastNativeAction = now;

        handler.call(node, event);

        self.bindVideo();
        self.syncVideoState();
        self.collectionDirty = true;
        self.syncPanelCollection(node, true);
      }

      function bind(selector, handler) {
        self.view.find(selector)
          .each(function() {
            var node = this;
            clearCapture(node);
            node.__lampacAudiobookNativeCapture = function(event) {
              runNativeAction(node, event, handler);
            };
            try { node.addEventListener('click', node.__lampacAudiobookNativeCapture, true); } catch (e) {}
          })
          .off('click.lampac-audiobooks2-native hover:enter.lampac-audiobooks2-native')
          .on('click.lampac-audiobooks2-native hover:enter.lampac-audiobooks2-native', function(event) {
            runNativeAction(this, event, handler);
          });
      }

      bind('.player-panel__rprev', function() { audiobookSeekBy(-15); });
      bind('.player-panel__rnext', function() { audiobookSeekBy(30); });
      bind('.player-panel__prev', function() { audiobookSwitchChapter(-1, true); });
      bind('.player-panel__next', function() { audiobookSwitchChapter(1, true); });
      bind('.player-panel__tracks', function() { openAudiobookVoiceovers(true); });
      bind('.player-panel__playlist', function() { openAudiobookChapters(true); });
    },

    mountNativeControls: function(reason) {
      var self = this;
      var timeline;
      var timelineTimes;
      var seekSlot;
      var chapterSlot;
      var utilitySlot;
      var rprev;
      var playpause;
      var rnext;
      var prev;
      var next;
      var status = {};

      if (!this.root || !this.root.length || !this.view || !this.view.length) return { mandatory: false };

      this.ignoreMutationsUntil = Date.now() + 140;
      audiobookUiLog('mount:start', { reason: reason || 'direct', title: ACTIVE_PLAYER_META && ACTIVE_PLAYER_META.title || '', chapter: ACTIVE_PLAYER_META && ACTIVE_PLAYER_META.chapter_index || 0 });

      seekSlot = this.view.find('.player-audiobook-books__native-seek-slot');
      chapterSlot = this.view.find('.player-audiobook-books__native-chapter-slot');
      utilitySlot = this.view.find('.player-audiobook-books__inline-utilities-slot');
      if (!utilitySlot.length) utilitySlot = this.view.find('.player-audiobook-books__utilities-slot');

      if (!this.root.find('.player-panel').length) {
        audiobookUiLog('mount:native-panel-missing', {
          reason: reason || 'direct',
          rootChildren: this.root.children().map(function() { return this.className || this.tagName || ''; }).get()
        });
      }

      function move(key, selector, slot, className, visible, controller) {
        var node = self.findMovable(selector, key);
        status[key] = !!(node && node.length);
        audiobookUiLog('mount:' + key, { found: status[key], selector: selector, reason: reason || 'direct' });
        if (!node || !node.length || !slot || !slot.length) return null;

        if (!self.nativeHidden.hasOwnProperty(key)) self.nativeHidden[key] = node.hasClass('hide');
        node.addClass('lampac-audiobook2-native-control ' + (className || ''));
        node.attr('data-controller', self.controllerName);
        if (visible !== false && node.hasClass('hide')) {
          node.removeClass('hide');
          self.collectionDirty = true;
        }
        self.storeAndMove(key, node, slot);
        return node;
      }

      function dedupe(selector, key) {
        var keep = self.nativeNodes[key];
        var kept = keep && keep.length ? keep[0] : null;
        if (!kept) return;
        self.view.find(selector).each(function() {
          if (this === kept) return;
          try { $(this).remove(); } catch (e) {}
        });
      }

      timeline = move('timeline', '.player-panel__timeline', this.view.find('.player-audiobook-books__timeline-slot'), '', true, this.controllerName);
      if (timeline && timeline.length) timeline.attr('data-controller', this.controllerName);

      timelineTimes = move('timeline-times', '.player-panel__line-one', this.view.find('.player-audiobook-books__timeline-times-slot'), '', true, 'player_panel');

      rprev = move('rprev', '.player-panel__rprev', seekSlot, '', true, 'player_panel');
      playpause = move('playpause', '.player-panel__playpause', seekSlot, 'lampac-audiobook2-native-play', true, 'player_panel');
      rnext = move('rnext', '.player-panel__rnext', seekSlot, '', true, 'player_panel');

      prev = move('prev', '.player-panel__prev', chapterSlot, '', true, 'player_panel');
      next = move('next', '.player-panel__next', chapterSlot, '', true, 'player_panel');

      move('tracks', '.player-panel__tracks', utilitySlot, 'lampac-audiobook2-native-utility', true, 'player_panel');
      move('playlist', '.player-panel__playlist', utilitySlot, 'lampac-audiobook2-native-utility', true, 'player_panel');

      replaceAudiobookControlSvg(rprev, AUDIOBOOK_ICON_REWIND_15, 'rewind-15');
      replaceAudiobookControlSvg(rnext, AUDIOBOOK_ICON_FORWARD_30, 'forward-30');

      this.playPauseButton = playpause || this.view.find('.lampac-audiobook2-native-play').first();
      this.playIcon = this.playPauseButton && this.playPauseButton.length ? this.playPauseButton.children().eq(0) : $();
      this.pauseIcon = this.playPauseButton && this.playPauseButton.length ? this.playPauseButton.children().eq(1) : $();

      dedupe('.player-panel__timeline', 'timeline');
      dedupe('.player-panel__line-one', 'timeline-times');
      dedupe('.player-panel__rprev', 'rprev');
      dedupe('.player-panel__playpause', 'playpause');
      dedupe('.player-panel__rnext', 'rnext');
      dedupe('.player-panel__prev', 'prev');
      dedupe('.player-panel__next', 'next');
      dedupe('.player-panel__tracks', 'tracks');
      dedupe('.player-panel__playlist', 'playlist');
      this.bindMovedNativeClicks();

      if (utilitySlot && utilitySlot.length) {
        var hideUtilities = !utilitySlot.children('.selector:not(.hide)').length;
        if (utilitySlot.hasClass('hide') != hideUtilities) {
          utilitySlot.toggleClass('hide', hideUtilities);
          this.collectionDirty = true;
        }
      }
      status.mandatory = !!(status.timeline && status.rprev && status.playpause && status.rnext);
      audiobookUiLog('mount:complete', { reason: reason || 'direct', mandatory: status.mandatory, status: status });
      return status;
    },

    scheduleMountRetries: function(reason) {
      var self = this;
      var token = ++this.mountRetryToken;
      var delays = [0, 100, 350, 900];

      delays.forEach(function(delay, index) {
        later(function() {
          var result;
          if (!AUDIOBOOK_PLAYER_ACTIVE || token != self.mountRetryToken || !self.view || !self.view.length) return;
          audiobookUiLog('retry:mount', { reason: reason || 'unknown', attempt: index + 1, delay: delay });
          result = self.mountNativeControls((reason || 'unknown') + ':' + delay);
          self.bindVideo();
          self.bindPanelFocus();
          self.syncVideoState();
          if (result && result.mandatory) self.syncPanelCollection(null, false);
          if (result && result.mandatory && result.timeline && result.rprev && result.playpause && result.rnext && result.prev && result.next && result.tracks && result.playlist) {
            self.mountRetryToken++;
          }
        }, delay);
      });
    },

    installPlayerObserver: function() {
      var self = this;
      if (!window.MutationObserver || !this.root || !this.root.length) return;
      if (runtime.fullTypeCleanupTimer) {
      clearTimeout(runtime.fullTypeCleanupTimer);
      runtime.fullTypeCleanupTimer = 0;
    }

    if (runtime.playerUiObserver && runtime.playerUiObserver.disconnect) {
        try { runtime.playerUiObserver.disconnect(); } catch (e) {}
      }

      runtime.playerUiObserver = new MutationObserver(function(mutations) {
        var relevant = false;
        if (!isCurrentRuntime() || !AUDIOBOOK_PLAYER_ACTIVE || Date.now() < self.ignoreMutationsUntil) return;

        for (var i = 0; i < mutations.length; i++) {
          var target = mutations[i] && mutations[i].target;
          if (!target) continue;
          if (target.nodeType != 1) target = target.parentElement;
          if (target && $(target).closest('.player-audiobook-books').length) continue;
          relevant = true;
          break;
        }

        if (!relevant) return;
        clearTimeout(self.mountObserverTimer);
        self.mountObserverTimer = setTimeout(function() {
          self.collectionDirty = true;
          self.scheduleMountRetries('dom:external-mutation');
        }, 120);
      });

      runtime.playerUiObserver.observe(this.root[0], { childList: true, subtree: true });
      audiobookUiLog('observer:installed', {});
    },

    unbindVideo: function() {
      if (!this.video || !this.videoHandlers) return;
      try {
        this.video.removeEventListener('play', this.videoHandlers.sync);
        this.video.removeEventListener('pause', this.videoHandlers.sync);
        this.video.removeEventListener('ratechange', this.videoHandlers.sync);
        this.video.removeEventListener('loadedmetadata', this.videoHandlers.loadedmetadata);
        this.video.removeEventListener('canplay', this.videoHandlers.canplay);
      } catch (e) {}
      this.video = null;
      this.videoHandlers = null;
    },

    bindVideo: function() {
      var self = this;
      var video = audiobookCurrentMedia();

      if (!video) {
        audiobookUiLog('video:missing', {});
        return;
      }
      if (this.video === video && this.videoHandlers) {
        this.syncVideoState();
        return;
      }

      this.unbindVideo();
      this.video = video;
      this.videoHandlers = {
        sync: function(event) {
          audiobookUiLog('video:' + (event && event.type || 'sync'), { paused: !!video.paused });
          self.syncVideoState();
          if (event && event.type == 'play') self.scheduleMountRetries('video:play');
        },
        loadedmetadata: function() {
          audiobookUiLog('video:loadedmetadata', { duration: video.duration || 0 });
          self.syncVideoState();
          self.scheduleMountRetries('video:loadedmetadata');
        },
        canplay: function() {
          audiobookUiLog('video:canplay', { duration: video.duration || 0 });
          self.syncVideoState();
          self.scheduleMountRetries('video:canplay');
        }
      };

      try {
        video.addEventListener('play', this.videoHandlers.sync);
        video.addEventListener('pause', this.videoHandlers.sync);
        video.addEventListener('ratechange', this.videoHandlers.sync);
        video.addEventListener('loadedmetadata', this.videoHandlers.loadedmetadata);
        video.addEventListener('canplay', this.videoHandlers.canplay);
        if (this.preferredRate && Math.abs((video.playbackRate || 1) - this.preferredRate) > .01) video.playbackRate = this.preferredRate;
      } catch (e) {}

      audiobookUiLog('video:bind', { src: video.currentSrc || video.src || '' });
      this.syncVideoState();
    },

    syncVideoState: function() {
      var video = this.video || audiobookCurrentMedia();
      var rate = video && video.playbackRate ? video.playbackRate : 1;
      var paused = !video || video.paused;

      if (this.speed && this.speed.length) this.speed.text((Math.round(rate * 100) / 100) + 'x');
      if (this.playPauseButton && this.playPauseButton.length) this.playPauseButton.toggleClass('lampac-audiobook2-native-paused', paused);
      if (this.timerButton && this.timerButton.length) this.timerButton.toggleClass('active', !!this.sleepUntil);
    },

    cycleSpeed: function() {
      var video = this.video || audiobookCurrentMedia();
      var values = [1, 1.5, 2];
      var current;
      var next = values[0];

      if (!video) return;
      current = parseFloat(video.playbackRate || 1);

      for (var i = 0; i < values.length; i++) {
        if (Math.abs(values[i] - current) < .01) {
          next = values[(i + 1) % values.length];
          break;
        }
      }

      this.preferredRate = next;
      try { video.playbackRate = next; } catch (e) {}
      try { if (Lampa.Storage && Lampa.Storage.set) Lampa.Storage.set('player_speed', next == 1 ? 'default' : String(next)); } catch (e) {}
      this.syncVideoState();
    },

    setSleepTimer: function(minutes) {
      var self = this;
      if (this.sleepTimer) clearTimeout(this.sleepTimer);
      this.sleepTimer = 0;
      this.sleepUntil = 0;

      if (!minutes) {
        this.syncVideoState();
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('\u0422\u0430\u0439\u043c\u0435\u0440 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d');
        return;
      }

      this.sleepUntil = Date.now() + minutes * 60000;
      this.sleepTimer = setTimeout(function() {
        var video = self.video || audiobookCurrentMedia();
        try { if (video && !video.paused) video.pause(); } catch (e) {}
        self.sleepTimer = 0;
        self.sleepUntil = 0;
        self.syncVideoState();
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('\u0422\u0430\u0439\u043c\u0435\u0440 \u0441\u043d\u0430: \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u0435 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e');
      }, minutes * 60000);

      this.syncVideoState();
      if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('\u0422\u0430\u0439\u043c\u0435\u0440 \u0441\u043d\u0430: ' + minutes + ' \u043c\u0438\u043d');
    },

    openSleepTimer: function() {
      var self = this;
      var enabled = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled().name : 'player';
      var items = [
        { title: '\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c', minutes: 0 },
        { title: '15 \u043c\u0438\u043d', minutes: 15 },
        { title: '30 \u043c\u0438\u043d', minutes: 30 },
        { title: '45 \u043c\u0438\u043d', minutes: 45 },
        { title: '60 \u043c\u0438\u043d', minutes: 60 }
      ];

      if (!Lampa.Select || !Lampa.Select.show) return;

      Lampa.Select.show({
        title: '\u0422\u0430\u0439\u043c\u0435\u0440 \u0441\u043d\u0430',
        items: items,
        onBack: function() {
          try { Lampa.Controller.toggle(enabled); } catch (e) {}
          later(function() { self.syncPanelCollection(self.timerButton); }, 0);
        },
        onSelect: function(item) {
          self.setSleepTimer(item.minutes || 0);
          try { Lampa.Controller.toggle(enabled); } catch (e) {}
          later(function() { self.syncPanelCollection(self.timerButton); }, 0);
        }
      });
    },

    bindPanelFocus: function() {
      var self = this;
      if (!this.view || !this.view.length) return;

      this.view.find('.selector')
        .attr('data-controller', this.controllerName)
        .off('hover:focus.lampac-audiobooks2 hover:hover.lampac-audiobooks2 hover:touch.lampac-audiobooks2')
        .on('hover:focus.lampac-audiobooks2', function(e) {
          self.lastFocus = e.currentTarget || this;
          audiobookUiLog('controller:focus', {
            className: self.lastFocus && self.lastFocus.className || '',
            controller: $(self.lastFocus).attr('data-controller') || ''
          });
        })
        .on('hover:hover.lampac-audiobooks2 hover:touch.lampac-audiobooks2', function(e) {
          self.lastFocus = e.currentTarget || this;
          try { if (window.Navigator && Navigator.focus) Navigator.focus(self.lastFocus); } catch (err) {}
        });
    },

    isTimelineFocused: function() {
      return !!(this.lastFocus && $(this.lastFocus).hasClass('player-panel__timeline'));
    },

    syncPanelCollection: function(focusTarget, force) {
      var enabled = '';
      var target;
      var visibleCount = 0;

      if (!this.view || !this.view.length || !Lampa.Controller) return;

      try { enabled = Lampa.Controller.enabled && Lampa.Controller.enabled().name; } catch (e) {}
      if (enabled != this.controllerName) return;
      if (!force && !this.collectionDirty) return;

      this.bindPanelFocus();
      target = focusTarget || this.lastFocus;
      if (target && target.jquery) target = target[0];
      if (!target || !document.documentElement.contains(target) || target.offsetParent === null) {
        target = this.view.find('.lampac-audiobook2-native-play:visible').first()[0];
      }
      if (!target) target = this.view.find('.selector:visible').first()[0];

      visibleCount = this.view.find('.selector:visible').length;
      try { Lampa.Controller.collectionSet(this.view, false, true); } catch (e) {}
      try {
        if (target && window.Navigator && Navigator.focus) Navigator.focus(target);
        else if (target) Lampa.Controller.collectionFocus(target, this.view, true);
      } catch (e2) {}

      this.lastFocus = target || this.lastFocus;
      this.collectionDirty = false;
      audiobookUiLog('controller:collection-rebuilt', {
        active: enabled,
        visible: visibleCount,
        focus: target && target.className || ''
      });
    },

    installController: function() {
      var self = this;
      if (!Lampa.Controller || !Lampa.Controller.add) return;

      Lampa.Controller.add(this.controllerName, {
        toggle: function() {
          self.collectionDirty = true;
          self.syncPanelCollection(self.lastFocus, true);
        },
        left: function() {
          if (self.isTimelineFocused()) triggerNativePlayerControl('.player-panel__rprev');
          else {
            try { if (window.Navigator && Navigator.move) Navigator.move('left'); } catch (e) {}
          }
        },
        right: function() {
          if (self.isTimelineFocused()) triggerNativePlayerControl('.player-panel__rnext');
          else {
            try { if (window.Navigator && Navigator.move) Navigator.move('right'); } catch (e) {}
          }
        },
        up: function() {
          try { if (window.Navigator && Navigator.move) Navigator.move('up'); } catch (e) {}
        },
        down: function() {
          try { if (window.Navigator && Navigator.move) Navigator.move('down'); } catch (e) {}
        },
        gone: function() {
          if (self.view && self.view.length) self.view.find('.selector').removeClass('focus');
        },
        back: function() {
          self.closePlayer();
        }
      });

      this.controllerInstalled = true;
    },

    activatePanel: function(focusTarget, force) {
      var enabled = '';
      if (!this.view || !this.view.length || !Lampa.Controller || !Lampa.Controller.toggle) return;

      this.installController();
      try { enabled = Lampa.Controller.enabled && Lampa.Controller.enabled().name || ''; } catch (e) {}

      if (focusTarget && focusTarget.jquery) focusTarget = focusTarget[0];
      if (focusTarget && document.documentElement.contains(focusTarget)) this.lastFocus = focusTarget;

      if (enabled != this.controllerName) {
        try { Lampa.Controller.toggle(this.controllerName); } catch (e2) {}
      } else {
        this.syncPanelCollection(this.lastFocus, !!force);
      }
    },

    installNativePanelHook: function() {
      this.installController();
    },

    addCurrentBook: function() {
      var item = CURRENT_AUDIOBOOK_PLAYLIST && CURRENT_AUDIOBOOK_PLAYLIST[0];
      var card = item && item.card;

      if (card && Lampa.Favorite && Lampa.Favorite.add) {
        try { Lampa.Favorite.add('history', card, 100); } catch (e) {}
      }

      if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('\u041a\u043d\u0438\u0433\u0430 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0430 \u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u044e');
    },

    closePlayer: function() {
      prepareAudiobookPlayerClose('ui:back');

      try {
        if (Lampa.Player && Lampa.Player.close) Lampa.Player.close();
      } catch (e) {}
    },

    ensure: function() {
      var self = this;
      var root = this.renderRoot();

      if (!root || !root.length) {
        audiobookUiLog('ensure:root-missing', {});
        return null;
      }
      audiobookUiLog('ensure:root-found', { title: ACTIVE_PLAYER_META && ACTIVE_PLAYER_META.title || '' });

      if (this.root && this.root.length && this.root[0] !== root[0]) this.destroy();

      this.root = root;
      this.root.addClass('player--audiobook');
      this.panel = audiobookNativePanel();

      this.view = this.root.find('.player-audiobook-books').first();

      if (!this.view.length) {
        this.view = $(
          '<div class="player-audiobook-books">' +
            '<div class="player-audiobook-books__top">' +
              '<div class="player-audiobook-books__back selector">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>' +
              '</div>' +
              '<div class="player-audiobook-books__heading">' +
                '<div class="player-audiobook-books__title"></div>' +
                '<div class="player-audiobook-books__author"></div>' +
              '</div>' +
              '<div class="player-audiobook-books__top-actions">' +
                '<div class="player-audiobook-books__top-button player-audiobook-books__add selector">' +
                  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
                '</div>' +
                '<div class="player-audiobook-books__top-button player-audiobook-books__more selector">' +
                  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="player-audiobook-books__center">' +
              '<img class="player-audiobook-books__cover" src="./img/img_broken.svg" />' +
              '<div class="player-audiobook-books__duration"></div>' +
              '<div class="player-audiobook-books__chapter">' +
                '<span class="player-audiobook-books__chapter-text"></span>' +
              '</div>' +
            '</div>' +
            '<div class="player-audiobook-books__controls">' +
              '<div class="player-audiobook-books__native-seek-slot"></div>' +
              '<div class="player-audiobook-books__native-chapter-slot"></div>' +
              '<div class="player-audiobook-books__aux-slot">' +
                '<div class="player-audiobook-books__control player-audiobook-books__timer selector">' +
                  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"/><path d="M12 13V9M9 2h6M12 6V4"/></svg>' +
                '</div>' +
                '<div class="player-audiobook-books__control player-audiobook-books__speed selector">1x</div>' +
              '</div>' +
              '<div class="player-audiobook-books__inline-utilities-slot"></div>' +
            '</div>' +
            '<div class="player-audiobook-books__timeline">' +
              '<div class="player-audiobook-books__timeline-slot"></div>' +
              '<div class="player-audiobook-books__timeline-times-slot"></div>' +
            '</div>' +
            '<div class="player-audiobook-books__utilities">' +
              '<div class="player-audiobook-books__utilities-slot"></div>' +
            '</div>' +
          '</div>'
        );

        this.root.append(this.view);
        this.collectionDirty = true;
        audiobookUiLog('ensure:view-created', {});
      }

      this.title = this.view.find('.player-audiobook-books__title');
      this.author = this.view.find('.player-audiobook-books__author');
      this.cover = this.view.find('.player-audiobook-books__cover');
      this.duration = this.view.find('.player-audiobook-books__duration');
      this.chapter = this.view.find('.player-audiobook-books__chapter');
      this.chapterText = this.view.find('.player-audiobook-books__chapter-text');
      this.speed = this.view.find('.player-audiobook-books__speed');
      this.timerButton = this.view.find('.player-audiobook-books__timer');
      this.playPauseButton = this.view.find('.lampac-audiobook2-native-play').first();
      this.playIcon = this.playPauseButton.length ? this.playPauseButton.children().eq(0) : $();
      this.pauseIcon = this.playPauseButton.length ? this.playPauseButton.children().eq(1) : $();
      this.utilitySlot = this.view.find('.player-audiobook-books__inline-utilities-slot');
      if (!this.utilitySlot.length) this.utilitySlot = this.view.find('.player-audiobook-books__utilities-slot');

      bindAudiobookAction(this.view.find('.player-audiobook-books__back'), function() {
        self.closePlayer();
      });

      bindAudiobookAction(this.view.find('.player-audiobook-books__add'), function() {
        self.addCurrentBook();
      });

      this.view.find('.player-audiobook-books__more')
        .removeClass('selector')
        .off('hover:enter.lampac-audiobooks2 click.lampac-audiobooks2');

      this.chapter
        .removeClass('selector')
        .off('hover:enter.lampac-audiobooks2 click.lampac-audiobooks2');

      bindAudiobookAction(this.speed, function() {
        self.cycleSpeed();
      });

      bindAudiobookAction(this.view.find('.player-audiobook-books__timer'), function() {
        self.openSleepTimer();
      });

      this.mountNativeControls('ensure');
      this.bindVideo();
      this.bindPanelFocus();
      this.installNativePanelHook();
      this.installPlayerObserver();
      this.activatePanel(this.lastFocus || this.view.find('.lampac-audiobook2-native-play').first(), !this.lastFocus);
      this.scheduleMountRetries('ensure');
      return this.view;
    },

    refresh: function(meta) {
      var view;
      var chapter;

      if (meta) ACTIVE_PLAYER_META = meta;
      if (!ACTIVE_PLAYER_META) return;

      view = this.ensure();
      if (!view) return;

      chapter = ACTIVE_PLAYER_META.chapter || (ACTIVE_PLAYER_META.chapter_index ? ('\u0413\u043b\u0430\u0432\u0430 ' + ACTIVE_PLAYER_META.chapter_index) : '\u0421\u043e\u0434\u0435\u0440\u0436\u0430\u043d\u0438\u0435');

      this.title.text(compactPlayerTitle(ACTIVE_PLAYER_META.title || ''));
      this.author.text(ACTIVE_PLAYER_META.author || ACTIVE_PLAYER_META.reader || '');
      this.duration.text(ACTIVE_PLAYER_META.duration ? ACTIVE_PLAYER_META.duration : '');
      this.chapterText.text(chapter);
      this.cover.attr('src', ACTIVE_PLAYER_META.image || './img/img_broken.svg');
      this.cover.off('error.lampac-audiobooks2').on('error.lampac-audiobooks2', function() {
        $(this).attr('src', './img/img_broken.svg');
      });

      this.mountNativeControls('refresh');
      this.bindVideo();
      this.syncVideoState();
      this.bindPanelFocus();
      this.activatePanel(this.lastFocus, false);
      this.scheduleMountRetries('refresh');
    },

    destroy: function() {
      this.unbindVideo();
      if (this.sleepTimer) clearTimeout(this.sleepTimer);
      this.sleepTimer = 0;
      this.sleepUntil = 0;
      releaseAudiobookWakeLock();
      this.lastFocus = null;
      this.preferredRate = 1;
      this.collectionDirty = true;
      this.mountRetryToken++;
      clearTimeout(this.mountObserverTimer);
      this.mountObserverTimer = 0;
      if (runtime.fullTypeCleanupTimer) {
      clearTimeout(runtime.fullTypeCleanupTimer);
      runtime.fullTypeCleanupTimer = 0;
    }

    if (runtime.playerUiObserver && runtime.playerUiObserver.disconnect) {
        try { runtime.playerUiObserver.disconnect(); } catch (e) {}
        runtime.playerUiObserver = null;
      }
      this.restoreNativeNodes();

      if (this.view && this.view.length) this.view.remove();
      if (this.root && this.root.length) this.root.removeClass('player--audiobook player--audiobook-modal-open');

      this.root = null;
      this.panel = null;
      this.view = null;
      this.title = null;
      this.author = null;
      this.cover = null;
      this.duration = null;
      this.chapter = null;
      this.chapterText = null;
      this.speed = null;
      this.timerButton = null;
      this.playIcon = null;
      this.pauseIcon = null;
      this.playPauseButton = null;
      this.utilitySlot = null;
    }
  };

  function prepareAudiobookPlayerClose(reason) {
    var hasView = !!(AudiobookPlayerView && AudiobookPlayerView.view && AudiobookPlayerView.view.length);

    if (!AUDIOBOOK_PLAYER_ACTIVE && !hasView) return;

    audiobookUiLog('close:prepare', {
      reason: reason || 'unknown',
      active: !!AUDIOBOOK_PLAYER_ACTIVE,
      hasView: hasView,
      nativeKeys: Object.keys(AudiobookPlayerView.nativeNodes || {}),
      markerKeys: Object.keys(AudiobookPlayerView.nativeMarkers || {}),
      homeKeys: Object.keys(AudiobookPlayerView.nativeHomes || {})
    });

    saveActiveAudiobookProgress(true);

    /*
     * Lampa destroys PlayerPanel before detaching the player root.
     * Native controls must be returned to PlayerPanel synchronously,
     * before Lampa.Player.close() starts its own destroy sequence.
     */
    try { AudiobookPlayerView.destroy(); } catch (e) {}

    unbindAudiobookProgressMedia();
    AUDIOBOOK_PLAYER_ACTIVE = false;
    ACTIVE_PLAYER_META = null;
    ACTIVE_AUDIOBOOK_ITEM = null;
    CURRENT_AUDIOBOOK_PLAYLIST = [];
    CURRENT_AUDIOBOOK_VOICES = [];
    runtime.currentAudiobookVoices = [];

    scheduleFullListenButtonRestore(reason || 'close');
  }

  var AUDIOBOOK_MODAL_CLOSING = false;

  function setAudiobookModalState(opened) {
    var root = AudiobookPlayerView && AudiobookPlayerView.root;
    if (!root || !root.length) return;
    root.toggleClass('player--audiobook-modal-open', !!opened);
  }

  function closeAudiobookModal(enabled) {
    if (AUDIOBOOK_MODAL_CLOSING) return;
    AUDIOBOOK_MODAL_CLOSING = true;
    setAudiobookModalState(false);
    try { Lampa.Modal.close(); } catch (e) {}
    later(function() {
      AUDIOBOOK_MODAL_CLOSING = false;
      AudiobookPlayerView.syncPanelCollection();
    }, 0);
  }

  function openAudiobookDescription() {
    return;
  }

  function restoreAudiobookPanelController(enabled, focusTarget) {
    try {
      if (Lampa.Controller && Lampa.Controller.toggle && enabled) Lampa.Controller.toggle(enabled);
    } catch (e) {}

    later(function() {
      if (AudiobookPlayerView && AudiobookPlayerView.syncPanelCollection) {
        AudiobookPlayerView.syncPanelCollection(focusTarget || null, true);
      }
    }, 0);
  }

  function openAudiobookVoiceovers(skipNative) {
  var enabled = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled().name : 'player';
  var list = CURRENT_AUDIOBOOK_PLAYLIST || [];
  var currentIndex = currentAudiobookPlaylistIndex();
  var item = currentIndex >= 0 ? list[currentIndex] : list[0];
  var voiceovers = item && item.voiceovers ? item.voiceovers : [];
  var voices = CURRENT_AUDIOBOOK_VOICES || runtime.currentAudiobookVoices || [];
  var items;

  if (!skipNative && triggerNativePlayerControl('.player-panel__tracks')) return;

  if ((!voiceovers || !voiceovers.length) && voices && voices.length) {
    voiceovers = voices.map(function(voice, index) {
      var selected = false;

      try {
        selected = !!(item && item.translate_name && voice && voice.title == item.translate_name);
      } catch (e) {
        selected = false;
      }

      return {
        title: voice.title || voice.name || ('\u041e\u0437\u0432\u0443\u0447\u043a\u0430 ' + (index + 1)),
        subtitle: voice.subtitle || '',
        selected: selected,
        voiceRef: voice,
        onSelect: function() {
          playVoice(voices, voice, { resumeBook: captureCurrentAudiobookResume() });
        }
      };
    });
  }

  if (!voiceovers || voiceovers.length < 2 || !Lampa.Select || !Lampa.Select.show) {
    if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('\u041d\u0435\u0442 \u0434\u0440\u0443\u0433\u0438\u0445 \u043e\u0437\u0432\u0443\u0447\u0435\u043a');
    restoreAudiobookPanelController(enabled, AudiobookPlayerView && AudiobookPlayerView.lastFocus);
    return;
  }

  setAudiobookModalState(false);

  items = voiceovers.map(function(voice, index) {
    return {
      title: voice.title || voice.name || ('\u041e\u0437\u0432\u0443\u0447\u043a\u0430 ' + (index + 1)),
      subtitle: voice.subtitle || '',
      selected: !!voice.selected,
      index: index,
      voice: voice
    };
  });

  Lampa.Select.show({
    title: '\u041e\u0437\u0432\u0443\u0447\u043a\u0430',
    items: items,
    onBack: function() {
      restoreAudiobookPanelController(enabled, AudiobookPlayerView && AudiobookPlayerView.lastFocus);
    },
    onSelect: function(item) {
      var resumeBook = captureCurrentAudiobookResume();

      if (!item || !item.voice) {
        restoreAudiobookPanelController(enabled, AudiobookPlayerView && AudiobookPlayerView.lastFocus);
        return;
      }

      if (item.voice.voiceRef && voices && voices.length) {
        playVoice(voices, item.voice.voiceRef, { resumeBook: resumeBook });
      } else if (item.voice.onSelect) {
        try { item.voice.onSelect(); } catch (e) {}
      }

      restoreAudiobookPanelController(enabled, AudiobookPlayerView && AudiobookPlayerView.lastFocus);
    }
  });
}

  function openAudiobookChapters(skipNative) {
    var enabled = Lampa.Controller && Lampa.Controller.enabled ? Lampa.Controller.enabled().name : 'player';
    var list = CURRENT_AUDIOBOOK_PLAYLIST || [];
    var currentIndex = currentAudiobookPlaylistIndex();
    var items;

    if (!skipNative && triggerNativePlayerControl('.player-panel__playlist')) return;

    if (!list.length || !Lampa.Select || !Lampa.Select.show) {
      if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('\u0421\u043f\u0438\u0441\u043e\u043a \u0433\u043b\u0430\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d');
      return;
    }

    setAudiobookModalState(false);

    items = list.map(function(item, index) {
      var meta = item && item.audiobook_meta ? item.audiobook_meta : {};
      var title = meta.chapter || item.title || item.name || ('\u0413\u043b\u0430\u0432\u0430 ' + (index + 1));

      return {
        title: title,
        subtitle: meta.title || item.movie_title || item.first_title || '',
        selected: index == currentIndex,
        index: index
      };
    });

    Lampa.Select.show({
      title: '\u0413\u043b\u0430\u0432\u044b',
      items: items,
      onBack: function() {
        restoreAudiobookPanelController(enabled, AudiobookPlayerView && AudiobookPlayerView.lastFocus);
      },
      onSelect: function(item) {
        if (item) audiobookPlayPlaylistIndex(item.index);
        restoreAudiobookPanelController(enabled, AudiobookPlayerView && AudiobookPlayerView.lastFocus);
      }
    });
  }

  function installPlayerPlayBridge() {
  if (!Lampa.Player || !Lampa.Player.play) return;
  if (!Lampa.Player._lampacAudiobooks2OriginalPlay) Lampa.Player._lampacAudiobooks2OriginalPlay = Lampa.Player.play;

  runtime.onPlayerPlay = function(object) {
    if (object && object.from_lampac_audiobooks2) {
      forceAudiobookInnerPlayer();
      activateAudiobookTrack(object);
    }
  };

  if (Lampa.Player._lampacAudiobooks2PlayBridgeInstalled) return;

  Lampa.Player.play = function(object) {
    var activeRuntime = window[RUNTIME_KEY];

    if (activeRuntime && activeRuntime.active && activeRuntime.onPlayerPlay) {
      try { activeRuntime.onPlayerPlay(object); } catch (e) {}
    }

    return Lampa.Player._lampacAudiobooks2OriginalPlay.apply(this, arguments);
  };

  Lampa.Player._lampacAudiobooks2PlayBridgeInstalled = true;
}

  function installPlayerCloseBridge() {
    if (!Lampa.Player || !Lampa.Player.close) return;

    if (!Lampa.Player._lampacAudiobooks2OriginalClose) {
      Lampa.Player._lampacAudiobooks2OriginalClose = Lampa.Player.close;
    }

    runtime.onBeforePlayerClose = function(reason) {
      prepareAudiobookPlayerClose(reason || 'player.close');
    };

    if (Lampa.Player._lampacAudiobooks2CloseBridgeInstalled) return;

    Lampa.Player.close = function() {
      var activeRuntime = window[RUNTIME_KEY];

      if (activeRuntime && activeRuntime.active && activeRuntime.onBeforePlayerClose) {
        try { activeRuntime.onBeforePlayerClose('player.close'); } catch (e) {}
      }

      return Lampa.Player._lampacAudiobooks2OriginalClose.apply(this, arguments);
    };

    Lampa.Player._lampacAudiobooks2CloseBridgeInstalled = true;
  }

  function integrateAudiobookPlayer() {
    if (!Lampa.Player || !Lampa.Player.listener || runtime.visualizerHookInstalled) return;
    runtime.visualizerHookInstalled = true;

    Lampa.Player.listener.follow('start', function(data) {
      if (!isCurrentRuntime()) return;
      AUDIOBOOK_PLAYER_TRANSITION_TOKEN++;
      if (data && data.from_lampac_audiobooks2) activateAudiobookTrack(data);
      if (!AUDIOBOOK_PLAYER_ACTIVE) return;
      later(function() { AudiobookPlayerView.refresh(ACTIVE_PLAYER_META); }, 80);
      later(function() { AudiobookPlayerView.refresh(ACTIVE_PLAYER_META); }, 350);
      later(function() { AudiobookPlayerView.scheduleMountRetries('player:start'); }, 700);
    });

    Lampa.Player.listener.follow('destroy', function() {
      var token;

      if (!isCurrentRuntime()) return;
      token = ++AUDIOBOOK_PLAYER_TRANSITION_TOKEN;

      /*
       * The full-card action bar is redrawn immediately after leaving Player.
       * Rehydrate the audiobook button independently from delayed player cleanup.
       */
      scheduleFullListenButtonRestore('player:destroy');

      /*
       * Public Lampa.Player.close() is intercepted before native teardown.
       * This delayed branch is a defensive fallback for alternative exit paths.
       * Playlist chapter transitions normally emit a subsequent start event,
       * which invalidates the token before this fallback runs.
       */
      later(function() {
        var opened = false;

        if (token != AUDIOBOOK_PLAYER_TRANSITION_TOKEN) return;

        try { opened = !!(Lampa.Player.opened && Lampa.Player.opened()); } catch (e) {}

        if (opened) {
          if (AUDIOBOOK_PLAYER_ACTIVE && ACTIVE_PLAYER_META) AudiobookPlayerView.refresh(ACTIVE_PLAYER_META);
          return;
        }

        prepareAudiobookPlayerClose('player:destroy-fallback');
      }, 1200);
    });
  }

  function startPlugin() {
    if (!isCurrentRuntime() || runtime.started) return;
    runtime.started = true;

    if (!API_BASE) {
      window.lampacAudiobooks2PluginReady = false;
      if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(API_CONFIGURATION_ERROR);
      runtime.stop();
      return;
    }

    injectStyles();
    try { $('.lampac-audiobook2-head-player').remove(); } catch (e) {}
    patchLampaImageApi();

    var manifest = {
      type: 'other',
      version: VERSION,
      name: '\u0410\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0438 2',
      description: 'AudioBook FDB: IziBuk, Archive.org \u0438 HTML-\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438 RuBook',
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
    installPlayerPlayBridge();
    installPlayerCloseBridge();
    integrateAudiobookPlayer();
  }

  function ready() {
    if (!isCurrentRuntime()) return;

    if (typeof Lampa == 'undefined' || typeof $ == 'undefined') {
      later(ready, 250);
      return;
    }

    if (window.appready) startPlugin();
    else {
      Lampa.Listener.follow('app', function(e) {
        if (isCurrentRuntime() && e.type == 'ready') startPlugin();
      });
    }
  }

  ready();
})();
