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
      }
    });
  }

  var parsersInfo = [{
    base: '89.106.89.250:9117',
    name: 'MyJackred2',
    settings: {
      url: '89.106.89.250:9117',
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
      url: 'lampac.fun:8117',
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
        changeParser();
        Lampa.Settings.update();
      },
      onRender: function onRender(item) {
        changeParser();
        setTimeout(function () {
          var settingsItem = $('div[data-name="lme_url_two"]');
          var currentParser = Lampa.Storage.get("lme_url_two");

          if (currentParser && currentParser !== 'no_parser') {
            var indicator = '<span style="color: #4caf50; margin-left: 8px;">✓</span>';
            settingsItem.find('.settings-param__value').append(indicator);
          }

          if (Lampa.Storage.field('parser_use')) {
            item.show();
            $('.settings-param__name', item).css('color', 'f3d900');
            $('div[data-name="lme_url_two"]').insertAfter('div[data-children="parser"]');
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

  function add() {
    translate();
    Parser.parserSetting();
  }

  function startPlugin() {
    window.plugin_lmepublictorr_ready = true;
    if (window.appready) add(); else {
      Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') add();
      });
    }
  }

  if (!window.plugin_lmepublictorr_ready) startPlugin();
})();
