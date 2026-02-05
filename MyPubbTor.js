"use strict";

(function () {
  'use strict';

  function translate() {
    Lampa.Lang.add({
      lme_parser: {
        ru: 'Каталог парсеров',
        en: 'Parsers catalog',
        uk: 'Каталог парсерів',
        zh: '解析器目录'
      },
      lme_parser_description: {
        ru: 'Нажмите для выбора парсера из ',
        en: 'Click to select a parser from the ',
        uk: 'Натисніть для вибору парсера з ',
        zh: '单击以从可用的 '
      },
      lme_pubtorr: {
        ru: 'Каталог TorrServer',
        en: 'TorrServer catalog',
        uk: 'Каталог TorrServer',
        zh: '解析器目录'
      },
      lme_pubtorr_description: {
        ru: 'Бесплатные серверы от проекта LME',
        en: 'Free servers from the LME project',
        uk: 'Безкоштовні сервери від проєкту LME',
        zh: '来自 LME 项目的免费服务器 '
      },
      lme_pubtorr_firstrun: {
        ru: "Привет! Ты установил плагин LME PubTorr, учти что если стоит Mods's то в разделе парсеров будет ошибка, которая не влияет на работу. Хочешь избавиться - оставь или LME PubTorr или Mods's.",
        en: "Hello! You have installed the LME PubTorr plugin. Note that if Mods's is enabled, there will be an error in the parsers section that does not affect functionality. If you want to get rid of it, keep either LME PubTorr or Mods's.",
        uk: "Привіт! Ви встановили плагін LME PubTorr, врахуйте, що якщо активовано Mods's, то в розділі парсерів буде помилка, яка не впливає на роботу. Якщо хочете позбутися - залиште або LME PubTorr, або Mods's.",
        zh: "你好！你安装了LME PubTorr插件，请注意，如果启用了Mods's，解析器部分将出现错误，但这不会影响功能。如果你想摆脱它，请保留LME PubTorr或Mods's。"
      }
    });
  }
  var parsersInfo = [{
    base: '89.106.89.250:9117/',
    name: 'MyJackred2',
    settings: {
      url: '89.106.89.250:9117/',
      key: '1',
      parser_torrent_type: 'jackett'
    }
  }, {
    base: 'jac.maxvol.pro',
    name: 'Music',
    settings: {
      url: 'jac.maxvol.pro',
      key: '1',
      parser_torrent_type: 'jackett'
    }
  }, {
    base: 'lampac.fun:8117',
    name: 'Myjacket',
    settings: {
      url: 'https://lampac.fun:8117',
      key: 'cvy139co64s9pu791s2ao7egzzgogocw',
      parser_torrent_type: 'jackett'
    }
  }, {
    base: 'Lampac.fun',
    name: 'Lampac',
    settings: {
      url: 'Lampac.fun',
      key: '1',
      parser_torrent_type: 'jackett'
    }
  }, {
    base: 'jacred_xyz',
    name: 'Jacred XYZ',
    settings: {
      url: 'jacred.xyz',
      key: '',
      parser_torrent_type: 'jackett'
    }
  }];

  // Хранилище статусов парсеров
  var parserStatuses = {};
  var checkInProgress = false;
  function changeParser() {
    var jackettUrlTwo = Lampa.Storage.get("lme_url_two");
    var selectedParser = parsersInfo.find(function (parser) {
      return parser.base === jackettUrlTwo;
    });
    if (selectedParser) {
      var settings = selectedParser.settings;
      Lampa.Storage.set(settings.parser_torrent_type === 'prowlarr' ? "prowlarr_url" : "jackett_url", settings.url);
      Lampa.Storage.set(settings.parser_torrent_type === 'prowlarr' ? "prowlarr_key" : "jackett_key", settings.key);
      Lampa.Storage.set("parser_torrent_type", settings.parser_torrent_type);
    } else {
      console.warn("Jackett URL not found in parsersInfo");
    }
  }

  // Функция проверки одного парсера
  function checkSingleParser(parser, callback) {
    var url = parser.settings.url;
    var checkUrl = 'http://' + url + '/api';
    fetch(checkUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    }).then(function (response) {
      console.log("Парсер " + parser.name + " доступен (статус: " + response.status + ")");
      parserStatuses[parser.base] = 'online';
      callback(true);
    })["catch"](function (error) {
      fetch('http://' + url, {
        method: 'HEAD'
      }).then(function (response) {
        console.log("Парсер " + parser.name + " доступен (альтернативная проверка)");
        parserStatuses[parser.base] = 'online';
        callback(true);
      })["catch"](function () {
        console.error("Парсер " + parser.name + " недоступен");
        parserStatuses[parser.base] = 'offline';
        callback(false);
      });
    });
  }

  // Функция проверки всех парсеров
  function checkAllParsers(forceUpdate) {
    if (checkInProgress && !forceUpdate) return;
    checkInProgress = true;
    parsersInfo.forEach(function (parser) {
      parserStatuses[parser.base] = 'checking';
    });
    updateSelectOptions();
    var checkedCount = 0;
    parsersInfo.forEach(function (parser) {
      checkSingleParser(parser, function (isOnline) {
        checkedCount++;
        updateSelectOptions();
        updateParserDisplay();
        if (checkedCount === parsersInfo.length) {
          checkInProgress = false;
        }
      });
    });
  }

  // Обновление цветов в выпадающем списке БЕЗ точек + блокировка красных
  function updateSelectOptions() {
    setTimeout(function () {
      $('.selectbox-item').each(function () {
        var $item = $(this);
        var itemText = $item.text().trim();
        var parser = parsersInfo.find(function (p) {
          return p.name === itemText;
        });
        if (parser && parserStatuses[parser.base]) {
          var status = parserStatuses[parser.base];
          var color = status === 'checking' ? '#ffeb3b' : status === 'online' ? '#4caf50' : '#f44336';

          // Если парсер offline - блокируем его
          if (status === 'offline') {
            $item.css({
              'color': color + ' !important',
              'font-weight': '700 !important',
              'opacity': '0.5 !important',
              'pointer-events': 'none !important',
              'cursor': 'not-allowed !important',
              'transition': 'color 0.3s ease'
            });
            $item.attr('style', 'color: ' + color + ' !important; font-weight: 700 !important; opacity: 0.5 !important; pointer-events: none !important; cursor: not-allowed !important; transition: color 0.3s ease;');

            // Блокируем клики
            $item.off('click').on('click', function (e) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            });

            // Добавляем класс для идентификации
            $item.addClass('parser-disabled');
          } else {
            // Разблокируем если парсер работает
            $item.css({
              'color': color + ' !important',
              'font-weight': '700 !important',
              'opacity': '1 !important',
              'pointer-events': 'auto !important',
              'cursor': 'pointer !important',
              'transition': 'color 0.3s ease'
            });
            $item.attr('style', 'color: ' + color + ' !important; font-weight: 700 !important; opacity: 1 !important; pointer-events: auto !important; cursor: pointer !important; transition: color 0.3s ease;');
            $item.removeClass('parser-disabled');
          }
        }
      });
    }, 100);
  }

  // Обновление отображения выбранного парсера
  function updateParserDisplay() {
    var settingsItem = $('div[data-name="lme_url_two"]');
    var currentParser = Lampa.Storage.get("lme_url_two");
    if (parserStatuses[currentParser]) {
      var status = parserStatuses[currentParser];
      var color = status === 'checking' ? '#ffeb3b' : status === 'online' ? '#4caf50' : '#f44336';
      settingsItem.find('.settings-param__value').css({
        'color': color + ' !important',
        'font-weight': '700 !important',
        'transition': 'color 0.3s ease'
      });
      settingsItem.find('.settings-param__value').attr('style', 'color: ' + color + ' !important; font-weight: 700 !important; transition: color 0.3s ease;');
    }
  }

  // Функция проверки состояния текущего парсера
  function checkAlive(type) {
    if (type === "parser") {
      var parserBase = Lampa.Storage.get("lme_url_two");
      var parser = parsersInfo.find(function (p) {
        return p.base === parserBase;
      });
      if (parser) {
        var settingsItem = $('div[data-name="lme_url_two"]');
        settingsItem.find('.settings-param__value').css({
          'color': '#ffeb3b !important',
          'font-weight': '700 !important',
          'transition': 'color 0.3s ease'
        });
        parserStatuses[parser.base] = 'checking';
        checkSingleParser(parser, function (isOnline) {
          var color = isOnline ? '#4caf50' : '#f44336';
          settingsItem.find('.settings-param__value').css({
            'color': color + ' !important',
            'font-weight': '700 !important',
            'transition': 'color 0.3s ease'
          });
        });
      }
    }
  }

  // Обновляем список значений для селектора
  var s_values = parsersInfo.reduce(function (prev, _ref) {
    var base = _ref.base,
      name = _ref.name;
    prev[base] = name;
    return prev;
  }, {
    no_parser: 'Не выбран'
  });
  function parserSetting() {
    Lampa.SettingsApi.addParam({
      component: 'parser',
      param: {
        name: 'lme_url_two',
        type: 'select',
        values: s_values,
        "default": 'no_parser'
      },
      field: {
        name: "<div class=\"settings-folder\" style=\"padding:0!important\"><div style=\"font-size:1.0em\">" + Lampa.Lang.translate('lme_parser') + "</div></div>",
        description: Lampa.Lang.translate('lme_parser_description') + " " + parsersInfo.length
      },
      onChange: function onChange(value) {
        // Проверяем, не заблокирован ли выбранный парсер
        var parser = parsersInfo.find(function (p) {
          return p.base === value;
        });
        if (parser && parserStatuses[parser.base] === 'offline') {
          console.warn('Нельзя выбрать недоступный парсер');
          Lampa.Noty.show('Этот парсер недоступен');
          return;
        }
        changeParser();
        checkAlive("parser");
        Lampa.Settings.update();
      },
      onRender: function onRender(item) {
        $('.settings-param__value p.parserName').remove();
        changeParser();
        setTimeout(function () {
          var settingsItem = $('div[data-name="lme_url_two"]');
          var currentParser = Lampa.Storage.get("lme_url_two");

          // Добавляем индикатор выбора (галочку)
          if (currentParser && currentParser !== 'no_parser') {
            var indicator = '<span style="color: #4caf50; margin-left: 8px;">✓</span>';
            settingsItem.find('.settings-param__value').append(indicator);
          }

          // Слушатель клика на селектор для обновления отображения
          settingsItem.on('click', function () {
            setTimeout(function () {
              updateSelectOptions();
            }, 150);
          });
          if (Lampa.Storage.field('parser_use')) {
            item.show();
            $('.settings-param__name', item).css('color', 'f3d900');
            $('div[data-name="lme_url_two"]').insertAfter('div[data-children="parser"]');
            checkAlive("parser");
          } else {
            item.hide();
          }
        });
      }
    });
  }
  var Parser = {
    parserSetting: parserSetting
  };

  // Слушатель открытия раздела парсеров
  Lampa.Settings.listener.follow('open', function (e) {
    if (e.name === 'parser') {
      console.log('Раздел парсеров открыт - запускаем предварительную проверку');
      checkAllParsers();
    }
  });

  // Слушатель для вызова проверки при переключении
  Lampa.Controller.listener.follow('toggle', function (e) {
    if (e.name === 'select') {
      checkAlive("parser");
    }
  });
  Lampa.Platform.tv();
  function add() {
    translate();
    Parser.parserSetting();
  }
  function startPlugin() {
    window.plugin_lmepublictorr_ready = true;
    if (window.appready) add();else {
      Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') add();
      });
    }
  }
  if (!window.plugin_lmepublictorr_ready) startPlugin();
})();
