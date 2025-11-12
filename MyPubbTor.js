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

    var parsersInfo = [
      { base: 'lampa_app', name: 'Lampa.app', settings: { url: 'lampa.app', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jacred_viewbox_dev', name: 'Viewbox', settings: { url: 'jacred.viewbox.dev', key: 'viewbox', parser_torrent_type: 'jackett' } },
      { base: 'unknown', name: 'Unknown', settings: { url: '188.119.113.252:9117', key: '1', parser_torrent_type: 'jackett' } },
      { base: 'trs_my_to', name: 'Trs.my.to', settings: { url: 'trs.my.to:9118', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jacred_my_to', name: 'Jacred.my.to', settings: { url: 'jacred.my.to', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jacred_xyz', name: 'Jacred.xyz', settings: { url: 'jacred.xyz', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jac_red_ru', name: 'jac-red.ru', settings: { url: 'jac-red.ru', key: '', parser_torrent_type: 'jackett' } },

      // Добавленные новые парсеры
      { base: 'jacred_pro', name: 'Jacred.pro', settings: { url: 'jacred.pro', key: '', parser_torrent_type: 'jackett' } },
      { base: 'ru_jacred_pro', name: 'Ru.jacred.pro', settings: { url: 'ru.jacred.pro', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jr_maxvol_pro', name: 'Jr.maxvol.pro', settings: { url: 'jr.maxvol.pro', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jacblack_ru', name: 'Jacblack.ru:9117', settings: { url: 'jacblack.ru:9117', key: '', parser_torrent_type: 'jackett' } },
      { base: 'spawn_pp_ua', name: 'Spawn.pp', settings: { url: 'spawn.pp.ua:59117', key: '2', parser_torrent_type: 'jackett' } },
      
      // Новые парсеры
      { base: 'lampa32', name: 'Lampa32', settings: { url: '62.60.149.237:2601', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jacred_maxvol_pro', name: 'Jacred Maxvol Pro', settings: { url: 'jr.maxvol.pro', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jacred_ru', name: 'Jacred RU', settings: { url: 'jac-red.ru', key: '', parser_torrent_type: 'jackett' } },
      { base: 'jac_black', name: 'Jac Black', settings: { url: 'jacblack.ru:9117', key: '', parser_torrent_type: 'jackett' } }
    ];

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
      })
        .then(response => {
          console.log("Парсер " + parser.name + " доступен (статус: " + response.status + ")");
          parserStatuses[parser.base] = 'online';
          callback(true);
        })
        .catch((error) => {
          fetch('http://' + url, { 
            method: 'HEAD'
          })
            .then(response => {
              console.log("Парсер " + parser.name + " доступен (альтернативная проверка)");
              parserStatuses[parser.base] = 'online';
              callback(true);
            })
            .catch(() => {
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

      parsersInfo.forEach(function(parser) {
        parserStatuses[parser.base] = 'checking';
      });
      
      updateSelectOptions();
      
      var checkedCount = 0;
      parsersInfo.forEach(function(parser) {
        checkSingleParser(parser, function(isOnline) {
          checkedCount++;
          updateSelectOptions();
          updateParserDisplay();
          
          if (checkedCount === parsersInfo.length) {
            checkInProgress = false;
          }
        });
      });
    }

    // Обновление цветов в выпадающем списке
    function updateSelectOptions() {
      setTimeout(function() {
        $('.selectbox-item').each(function() {
          var itemText = $(this).text().trim();
          var parser = parsersInfo.find(function(p) {
            return p.name === itemText;
          });
          
          if (parser && parserStatuses[parser.base]) {
            var status = parserStatuses[parser.base];
            var color = status === 'checking' ? '#ffeb3b' : status === 'online' ? '#4caf50' : '#f44336';
            
            $(this).css({
              'color': color,
              'transition': 'color 0.3s ease'
            });
            
            // Добавляем индикатор статуса
            $(this).find('.status-indicator').remove();
            var indicator = status === 'checking' ? '⟳' : status === 'online' ? '●' : '●';
            $(this).prepend('<span class="status-indicator" style="margin-right: 8px; color: ' + color + ';">' + indicator + '</span>');
          }
        });
      }, 100);
    }

    // Обновление отображения парсеров с цветами и индикаторами
    function updateParserDisplay() {
      var settingsItem = $('div[data-name="lme_url_two"]');
      var currentParser = Lampa.Storage.get("lme_url_two");
      
      // Обновляем цвет выбранного парсера
      if (parserStatuses[currentParser]) {
        var status = parserStatuses[currentParser];
        var color = status === 'checking' ? '#ffeb3b' : status === 'online' ? '#4caf50' : '#f44336';
        settingsItem.find('.settings-param__value').css({
          'color': color,
          'transition': 'color 0.3s ease'
        });
      }
    }

    // Функция проверки состояния текущего парсера
    function checkAlive(type) {
      if (type === "parser") {
        var parserBase = Lampa.Storage.get("lme_url_two");
        var parser = parsersInfo.find(function (p) { return p.base === parserBase; });
        
        if (parser) {
          var settingsItem = $('div[data-name="lme_url_two"]');
          
          // Устанавливаем желтый цвет с анимацией во время проверки
          settingsItem.find('.settings-param__value').css({
            'color': '#ffeb3b',
            'transition': 'color 0.3s ease'
          });
          
          parserStatuses[parser.base] = 'checking';
          
          checkSingleParser(parser, function(isOnline) {
            var color = isOnline ? '#4caf50' : '#f44336';
            settingsItem.find('.settings-param__value').css({
              'color': color,
              'transition': 'color 0.3s ease'
            });
          });
        }
      }
    }

    // Обновляем список значений для селектора с индикаторами
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
        onChange: function (value) {
          changeParser();
          checkAlive("parser");
          Lampa.Settings.update();
        },
        onRender: function (item) {
          $('.settings-param__value p.parserName').remove();
          changeParser();
          
          setTimeout(function () {
            var settingsItem = $('div[data-name="lme_url_two"]');
            var currentParser = Lampa.Storage.get("lme_url_two");
            
            // Добавляем индикатор выбора (галочку/кружок)
            if (currentParser && currentParser !== 'no_parser') {
              var indicator = '<span style="color: #4caf50; margin-left: 8px;">✓</span>';
              settingsItem.find('.settings-param__value').append(indicator);
            }
            
            // Слушатель клика на селектор для обновления отображения
            settingsItem.on('click', function() {
              setTimeout(function() {
                updateSelectOptions();
              }, 150);
            });
            
            if (Lampa.Storage.field('parser_use')) {
              item.show();
              $('.settings-param__name', item).css('color', 'f3d900');
              $('div[data-name="lme_url_two"]').insertAfter('div[data-children="parser"]');
              
              // Проверяем состояние текущего парсера при рендере
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

    // Слушатель открытия раздела парсеров - запускаем проверку заранее
    Lampa.Settings.listener.follow('open', function(e) {
      if (e.name === 'parser') {
        console.log('Раздел парсеров открыт - запускаем предварительную проверку');
        checkAllParsers();
      }
    });

    // Восстанавливаем слушатель для вызова проверки живости при переключении выбора
    Lampa.Controller.listener.follow('toggle', (e) => {
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
      if (window.appready) add();
      else {
        Lampa.Listener.follow('app', function (e) {
          if (e.type === 'ready') add();
        });
      }
    }

    if (!window.plugin_lmepublictorr_ready) startPlugin();

})();
