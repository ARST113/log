/**
 * Плагин управления кнопками Lampa
 * Версия: 1.2.8-nextgen
 * Автор: @Cheeze_l
 * 
 * Описание:
 * Плагин для управления кнопками на странице фильма/сериала в Lampa.
 * Позволяет изменять порядок кнопок, скрывать/показывать их, группировать в папки,
 * а также управлять режимами отображения текста на кнопках.
 * 
 * Возможности:
 * - Изменение порядка кнопок (перемещение вверх/вниз)
 * - Скрытие/показ кнопок (скрытые кнопки отображаются полупрозрачными в редакторе)
 * - Три режима отображения для каждой кнопки:
 *   • Режим 1 (Стандартный): иконка видна всегда, текст появляется при наведении
 *   • Режим 2 (Минимальный): только иконка, текст всегда скрыт
 *   • Режим 3 (Полный): иконка и текст видны всегда
 * - Создание папок для группировки кнопок
 * - Изменение порядка кнопок внутри папок
 * - Автоматическая группировка по типам (Онлайн, Торренты, Трейлеры и т.д.)
 * - Универсальная работа со всеми типами кнопок (включая кастомные плагины)
 * - Сброс всех настроек к значениям по умолчанию
 * 
 * Технические особенности:
 * - Полная совместимость с ES5 (работает на старых устройствах)
 * - Встроенные polyfills для Array методов (forEach, filter, find, some, indexOf)
 * - Универсальная обработка кнопок любых типов
 * - Автоматическое определение и нормализация структуры кнопок
 * - Сохранение настроек в localStorage
 * 
 * Установка:
 * 
 * Для использования в Lampa:
 * В Лампа открыть "Настройки" → "Расширения" → "Добавить плагин"
 * И прописать: https://mylampa1.github.io/buttons.js
 * 
 * Для использования в Lampac:
 * Добавить в lampainit.js строку:
 * Lampa.Utils.putScriptAsync(["https://mylampa1.github.io/buttons.js"], function() {});
 * 
 * Поддержка автора:
 * Если есть желающие поддержать автора, пишите @Cheeze_l
 */

(function () {
    'use strict';
    if (window.__buttonsNextGenLoaded) return;
    if (!window.Lampa || !Lampa.Storage || !Lampa.Lang || !window.$) return;
    window.__buttonsNextGenLoaded = true;

    // Polyfills для совместимости со старыми устройствами
    if (!Array.prototype.forEach) {
        Array.prototype.forEach = function (callback, thisArg) {
            var T, k;
            if (this == null) throw new TypeError('this is null or not defined');
            var O = Object(this);
            var len = O.length >>> 0;
            if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
            if (arguments.length > 1) T = thisArg;
            k = 0;
            while (k < len) {
                var kValue;
                if (k in O) {
                    kValue = O[k];
                    callback.call(T, kValue, k, O);
                }
                k++;
            }
        };
    }

    if (!Array.prototype.filter) {
        Array.prototype.filter = function (callback, thisArg) {
            if (this == null) throw new TypeError('this is null or not defined');
            var O = Object(this);
            var len = O.length >>> 0;
            if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
            var res = [];
            var T = thisArg;
            var k = 0;
            while (k < len) {
                if (k in O) {
                    var kValue = O[k];
                    if (callback.call(T, kValue, k, O)) res.push(kValue);
                }
                k++;
            }
            return res;
        };
    }

    if (!Array.prototype.find) {
        Array.prototype.find = function (callback, thisArg) {
            if (this == null) throw new TypeError('this is null or not defined');
            var O = Object(this);
            var len = O.length >>> 0;
            if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
            var T = thisArg;
            var k = 0;
            while (k < len) {
                var kValue = O[k];
                if (callback.call(T, kValue, k, O)) return kValue;
                k++;
            }
            return undefined;
        };
    }

    if (!Array.prototype.some) {
        Array.prototype.some = function (callback, thisArg) {
            if (this == null) throw new TypeError('this is null or not defined');
            var O = Object(this);
            var len = O.length >>> 0;
            if (typeof callback !== 'function') throw new TypeError(callback + ' is not a function');
            var T = thisArg;
            var k = 0;
            while (k < len) {
                if (k in O && callback.call(T, O[k], k, O)) return true;
                k++;
            }
            return false;
        };
    }

    if (!Array.prototype.indexOf) {
        Array.prototype.indexOf = function (searchElement, fromIndex) {
            if (this == null) throw new TypeError('this is null or not defined');
            var O = Object(this);
            var len = O.length >>> 0;
            if (len === 0) return -1;
            var n = fromIndex | 0;
            if (n >= len) return -1;
            var k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
            while (k < len) {
                if (k in O && O[k] === searchElement) return k;
                k++;
            }
            return -1;
        };
    }

    var LAMPAC_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M20.331 14.644l-13.794-13.831 17.55 10.075zM2.938 0c-0.813 0.425-1.356 1.2-1.356 2.206v27.581c0 1.006 0.544 1.781 1.356 2.206l16.038-16zM29.512 14.1l-3.681-2.131-4.106 4.031 4.106 4.031 3.756-2.131c1.125-0.893 1.125-2.906-0.075-3.8zM6.538 31.188l17.55-10.075-3.756-3.756z" fill="currentColor"></path></svg>';

    var EXCLUDED_CLASSES = ['button--play', 'button--edit-order', 'button--folder'];

    // Функция перевода
    function getTranslation(key) {
        var translated = Lampa.Lang.translate(key);
        return translated && translated !== key ? translated : key.replace('buttons_plugin_', '');
    }

    // Добавляем переводы для UI элементов плагина
    Lampa.Lang.add({
        buttons_plugin_button_order: {
            uk: 'Порядок кнопок',
            ru: 'Порядок кнопок',
            en: 'Buttons order',
            be: 'Парадак кнопак',
            zh: '按钮顺序'
        },
        buttons_plugin_reset_default: {
            uk: 'Скинути за замовчуванням',
            ru: 'Сбросить по умолчанию',
            en: 'Reset to default',
            be: 'Скінуць па змаўчанні',
            zh: '重置为默认'
        },
        buttons_plugin_button_editor: {
            uk: 'Редактор кнопок',
            ru: 'Редактор кнопок',
            en: 'Buttons editor',
            be: 'Рэдактар кнопак',
            zh: '按钮编辑器'
        },
        buttons_plugin_button_editor_enabled: {
            uk: 'Редактор кнопок включено',
            ru: 'Редактор кнопок включен',
            en: 'Buttons editor enabled',
            be: 'Рэдактар кнопак уключаны',
            zh: '按钮编辑器已启用'
        },
        buttons_plugin_button_editor_disabled: {
            uk: 'Редактор кнопок вимкнено',
            ru: 'Редактор кнопок выключен',
            en: 'Buttons editor disabled',
            be: 'Рэдактар кнопак адключаны',
            zh: '按钮编辑器已禁用'
        },
        buttons_plugin_button_unknown: {
            uk: 'Кнопка',
            ru: 'Кнопка',
            en: 'Button',
            be: 'Кнопка',
            zh: '按钮'
        },
        buttons_plugin_folder_name: {
            uk: 'Назва папки',
            ru: 'Название папки',
            en: 'Folder name',
            be: 'Назва папкі',
            zh: '文件夹名称'
        },
        buttons_plugin_folder_created: {
            uk: 'Папку створено',
            ru: 'Папка создана',
            en: 'Folder created',
            be: 'Папка створана',
            zh: '文件夹已创建'
        },
        buttons_plugin_folder_deleted: {
            uk: 'Папку видалено',
            ru: 'Папка удалена',
            en: 'Folder deleted',
            be: 'Папка выдалена',
            zh: '文件夹已删除'
        },
        buttons_plugin_folder_order: {
            uk: 'Порядок кнопок в папці',
            ru: 'Порядок кнопок в папке',
            en: 'Buttons order in folder',
            be: 'Парадак кнопак у папцы',
            zh: '文件夹中的按钮顺序'
        },
        buttons_plugin_create_folder: {
            uk: 'Створити папку',
            ru: 'Создать папку',
            en: 'Create folder',
            be: 'Стварыць папку',
            zh: '创建文件夹'
        },
        buttons_plugin_select_buttons: {
            uk: 'Виберіть кнопки для папки',
            ru: 'Выберите кнопки для папки',
            en: 'Select buttons for folder',
            be: 'Выберыце кнопкі для папкі',
            zh: '选择文件夹的按钮'
        },
        buttons_plugin_min_2_buttons: {
            uk: 'Виберіть мінімум 2 кнопки',
            ru: 'Выберите минимум 2 кнопки',
            en: 'Select at least 2 buttons',
            be: 'Выберыце мінімум 2 кнопкі',
            zh: '至少选择2个按钮'
        },
        buttons_plugin_edit_order: {
            uk: 'Змінити порядок',
            ru: 'Изменить порядок',
            en: 'Edit order',
            be: 'Змяніць парадак',
            zh: '编辑顺序'
        },
        buttons_plugin_settings_reset: {
            uk: 'Налаштування скинуто',
            ru: 'Настройки сброшены',
            en: 'Settings reset',
            be: 'Налады скінуты',
            zh: '设置已重置'
        },
        buttons_plugin_move: {
            uk: 'Зсув',
            ru: 'Сдвиг',
            en: 'Move',
            be: 'Зрух',
            zh: '移动'
        },
        buttons_plugin_view: {
            uk: 'Вигляд',
            ru: 'Вид',
            en: 'View',
            be: 'Выгляд',
            zh: '视图'
        },
        buttons_plugin_show: {
            uk: 'Показ',
            ru: 'Показ',
            en: 'Show',
            be: 'Паказ',
            zh: '显示'
        }
    });

    var DEFAULT_GROUPS = [
        { name: 'online', patterns: ['online', 'lampac', 'modss', 'showy'] },
        { name: 'torrent', patterns: ['torrent', 'jacred'] },
        { name: 'trailer', patterns: ['trailer', 'rutube'] },
        { name: 'shots', patterns: ['shots'] },
        { name: 'book', patterns: ['book'] },
        { name: 'reaction', patterns: ['reaction'] },
        { name: 'subscribe', patterns: ['subscribe'] }
    ];

    var currentButtons = [];
    var allButtonsCache = [];
    var allButtonsOriginal = [];
    var currentContainer = null;

    // Per-profile settings and CUB-native snapshot synchronization.
    var BM_KEYS = ['button_custom_order','button_item_order','button_hidden','button_display_modes','button_folders','buttons_editor_enabled'];
    var bmEmpty = {button_custom_order:[],button_item_order:[],button_hidden:[],button_display_modes:{},button_folders:[],buttons_editor_enabled:true};
    var bmProfile = null, bmRestoring = false, bmLegacyIds = {};
    var bmCloudKey = 'buttons_ng_cloud_v1';
    function bmClone(x){try{return JSON.parse(JSON.stringify(x))}catch(e){return null}}
    function bmProfileId(){
        var a = Lampa.Storage.get('account', {});
        return a && a.profile && a.profile.id ? String(a.profile.id) : 'guest';
    }
    function bmSnapshot(){
        var state = {};
        BM_KEYS.forEach(function(k){var v=Lampa.Storage.get(k,bmEmpty[k]);state[k]=bmClone(v===null?bmEmpty[k]:v)});
        return state;
    }
    function bmLocalKey(id){return 'buttons_ng_profile_'+id}
    function bmRemote(id){
        if(id==='guest')return null;
        var all=Lampa.Storage.get(bmCloudKey,{});
        var obj=all&&all['profile_'+id];
        return obj&&obj.settings&&typeof obj.updated==='number'?obj:null;
    }
    function bmRestore(settings){
        bmRestoring=true;
        BM_KEYS.forEach(function(k){
            var val=typeof settings[k]==='undefined'?bmEmpty[k]:settings[k];
            Lampa.Storage.set(k,bmClone(val),true);
        });
        bmRestoring=false;
        $('.button--edit-order').toggle(Lampa.Storage.get('buttons_editor_enabled',true)!==false);
    }
    function bmActivate(){
        var id=bmProfileId();
        if(id===bmProfile)return false;
        var local=Lampa.Storage.get(bmLocalKey(id),null);
        if(!local||!local.settings){
            var first=Lampa.Storage.get('buttons_ng_first_profile','');
            // The first signed-in profile inherits an existing guest layout once.
            var guest=Lampa.Storage.get(bmLocalKey('guest'),null);
            var inheritGuest=first==='guest'&&id!=='guest'&&guest&&guest.settings;
            var inherited=inheritGuest?bmClone(guest.settings):(first?bmClone(bmEmpty):bmSnapshot());
            var nonempty=JSON.stringify(inherited)!==JSON.stringify(bmEmpty);
            local={updated:nonempty?1:0,settings:inherited};
            if(!first||inheritGuest)Lampa.Storage.set('buttons_ng_first_profile',id,true);
            Lampa.Storage.set(bmLocalKey(id),local,true);
        }
        var remote=bmRemote(id);
        if(remote&&remote.updated>local.updated){
            local=bmClone(remote);Lampa.Storage.set(bmLocalKey(id),local,true);
        }
        bmProfile=id;bmRestore(local.settings);
        return true;
    }
    function bmSave(){
        if(bmRestoring)return;
        bmActivate();
        var id=bmProfile,previous=Lampa.Storage.get(bmLocalKey(id),null);
        var state={updated:Math.max(Date.now(),(previous&&previous.updated||0)+1),settings:bmSnapshot()};
        Lampa.Storage.set(bmLocalKey(id),bmClone(state),true);
        if(id!=='guest'){
            var cloud=Lampa.Storage.get(bmCloudKey,{});
            if(!cloud||typeof cloud!=='object'||Array.isArray(cloud))cloud={};
            cloud['profile_'+id]=bmClone(state);
            Lampa.Storage.set(bmCloudKey,cloud);
        }
    }
    function bmCloudPull(){
        if(bmActivate()&&currentContainer)reorderButtons(currentContainer,false);
        var remote=bmRemote(bmProfile),local=Lampa.Storage.get(bmLocalKey(bmProfile),null);
        if(!remote||local&&local.updated>=remote.updated)return;
        Lampa.Storage.set(bmLocalKey(bmProfile),bmClone(remote),true);
        bmRestore(remote.settings);
        if(currentContainer)reorderButtons(currentContainer,false);
    }
    function bmOfferLocalCloud(){
        if(bmProfile==='guest')return;
        var local=Lampa.Storage.get(bmLocalKey(bmProfile),null),remote=bmRemote(bmProfile);
        if(!local||!local.settings||(remote&&remote.updated>=local.updated))return;
        var cloud=Lampa.Storage.get(bmCloudKey,{});
        if(!cloud||typeof cloud!=='object'||Array.isArray(cloud))cloud={};
        cloud['profile_'+bmProfile]=bmClone(local);
        Lampa.Storage.set(bmCloudKey,cloud);
    }
    function bmMigrateIds(){
        var mapping=bmLegacyIds, changed=false;
        ['button_hidden','button_custom_order'].forEach(function(k){
            var old=Lampa.Storage.get(k,[]);
            if(!Array.isArray(old))return;
            var next=old.map(function(id){return mapping[id]||id});
            if(JSON.stringify(old)!==JSON.stringify(next)){Lampa.Storage.set(k,next,true);changed=true}
        });
        var items=Lampa.Storage.get('button_item_order',[]);
        if(Array.isArray(items)){
            var it=bmClone(items),diff=false;
            it.forEach(function(e){if(e&&e.type==='button'&&mapping[e.id]&&mapping[e.id]!==e.id){e.id=mapping[e.id];diff=true}});
            if(diff){Lampa.Storage.set('button_item_order',it,true);changed=true}
        }
        var folders=Lampa.Storage.get('button_folders',[]);
        if(Array.isArray(folders)){
            var ff=bmClone(folders),diffF=false;
            ff.forEach(function(f){if(!Array.isArray(f.buttons))return;f.buttons=f.buttons.map(function(id){if(mapping[id]&&mapping[id]!==id){diffF=true;return mapping[id]}return id})});
            if(diffF){Lampa.Storage.set('button_folders',ff,true);changed=true}
        }
        var modes=Lampa.Storage.get('button_display_modes',{});
        if(modes&&typeof modes==='object'){
            var mm=bmClone(modes),diffM=false;
            Object.keys(mapping).forEach(function(id){if(id!==mapping[id]&&Object.prototype.hasOwnProperty.call(mm,id)){mm[mapping[id]]=mm[id];delete mm[id];diffM=true}});
            if(diffM){Lampa.Storage.set('button_display_modes',mm,true);changed=true}
        }
        if(changed)bmSave();
    }


    // Вспомогательная функция для поиска кнопки
    function findButton(btnId) {
        var btn = allButtonsCache.find(function (b) { return getBtnIdentifier(b) === btnId; });
        if (!btn) {
            btn = allButtonsOriginal.find(function (b) { return getBtnIdentifier(b) === btnId; });
        }
        return btn;
    }

    // Вспомогательная функция для получения всех ID кнопок в папках
    function getButtonsInFolders() {
        var folders = getFolders();
        var buttonsInFolders = [];
        folders.forEach(function (folder) {
            buttonsInFolders = buttonsInFolders.concat(folder.buttons);
        });
        return buttonsInFolders;
    }

    function getCustomOrder() {
        return Lampa.Storage.get('button_custom_order', []);
    }

    function setCustomOrder(order) {
        Lampa.Storage.set('button_custom_order', order);
        bmSave();
    }

    function getItemOrder() {
        return Lampa.Storage.get('button_item_order', []);
    }

    function setItemOrder(order) {
        Lampa.Storage.set('button_item_order', order);
        bmSave();
    }

    function getHiddenButtons() {
        return Lampa.Storage.get('button_hidden', []);
    }

    function setHiddenButtons(hidden) {
        Lampa.Storage.set('button_hidden', hidden);
        bmSave();
    }

    function getButtonDisplayModes() {
        return Lampa.Storage.get('button_display_modes', {});
    }

    function setButtonDisplayModes(modes) {
        Lampa.Storage.set('button_display_modes', modes);
        bmSave();
    }

    function getButtonDisplayMode(btnId) {
        var modes = getButtonDisplayModes();
        return modes[btnId] || 1; // По умолчанию режим 1 (стандартный)
    }

    function setButtonDisplayMode(btnId, mode) {
        var modes = getButtonDisplayModes();
        modes[btnId] = mode;
        setButtonDisplayModes(modes);
    }

    function getFolders() {
        return Lampa.Storage.get('button_folders', []);
    }

    function setFolders(folders) {
        Lampa.Storage.set('button_folders', folders);
        bmSave();
    }


    function bmLegacyId(btn){
        var cls=btn.attr('class')||'';
        var text=btn.find('span').text().trim().replace(/\s+/g,'_'),subtitle=btn.attr('data-subtitle')||'';
        if(cls.indexOf('modss')!==-1||text.indexOf('MODS')!==-1||text.indexOf('MOD')!==-1)return 'modss_online_button';
        if(cls.indexOf('showy')!==-1||text.indexOf('Showy')!==-1)return 'showy_online_button';
        var view=cls.split(' ').filter(function(c){return c.indexOf('view--')===0||c.indexOf('button--')===0}).join('_');
        if(!view&&!text)return 'button_unknown';
        return view+'_'+text+(subtitle?'_'+subtitle.replace(/\s+/g,'_').substring(0,30):'');
    }
    function getBtnIdentifier(btn){
        if(!btn||!btn.length)return 'missing';
        var cached=btn.data('buttons-ng-id');
        if(cached)return cached;
        var old=bmLegacyId(btn);
        var classes=(btn.attr('class')||'').split(/\s+/).filter(function(c){
            return c&&c!=='selector'&&c!=='full-start__button'&&c!=='focus'&&
            c!=='active'&&c!=='selected'&&c!=='hover'&&c!=='hidden'&&
            c.indexOf('button-mode-')!==0&&c!=='buttons-ng-enter';
        }).sort();
        var provider=btn.attr('data-source')||btn.attr('data-provider')||
            btn.attr('data-plugin')||btn.attr('data-action')||btn.attr('id')||'';
        var base=classes.join('_')+(provider?'__'+provider:'')||old;
        var stable=(old==='modss_online_button'||old==='showy_online_button')?old:
            'bm2_'+base.replace(/[^a-zA-Z0-9_\-\u0400-\u04ff]/g,'_');
        btn.data('buttons-ng-id',stable);
        if(old!==stable&&!bmLegacyIds[old])bmLegacyIds[old]=stable;
        return stable;
    }

    function detectBtnCategory(button) {
        var classes = button.attr('class') || '';

        // Специальная проверка для Shots - должна быть первой!
        if (classes.indexOf('shots-view-button') !== -1 || classes.indexOf('shots') !== -1) {
            return 'shots';
        }

        for (var i = 0; i < DEFAULT_GROUPS.length; i++) {
            var group = DEFAULT_GROUPS[i];
            for (var j = 0; j < group.patterns.length; j++) {
                if (classes.indexOf(group.patterns[j]) !== -1) {
                    return group.name;
                }
            }
        }

        return 'other';
    }

    function shouldSkipBtn(button) {
        var classes = button.attr('class') || '';
        for (var i = 0; i < EXCLUDED_CLASSES.length; i++) {
            if (classes.indexOf(EXCLUDED_CLASSES[i]) !== -1) {
                return true;
            }
        }
        return false;
    }


    // The native Watch menu takes source buttons from .buttons--container.
    // Keep originals there; expose independent controls through forwarding proxies.
    function groupBtnsByType(container){
        var target=container.find('.full-start-new__buttons').first();
        // Recreate proxies from live sources, never reuse stale cross-card references.
        target.children('.buttons-ng-source-bridge').remove();
        var buttons=target.children('.full-start__button').not('.button--edit-order,.button--folder,.button--play');
        var sources=container.find('.buttons--container').first();
        if(sources.length){
            sources.children('.full-start__button').not('.hide,.button--play').each(function(){
                var original=$(this);
                if(shouldSkipBtn(original))return;
                // Lampac already exposes its Online button outside Watch's source menu.
                if(original.hasClass('view--online')&&original.hasClass('lampac--button')&&
                    target.children('.view--online.lampac--button').not('.buttons-ng-source-bridge').length)return;
                var proxy=original.clone(false,false);
                proxy.removeClass('focus button--priority').addClass('buttons-ng-source-bridge');
                proxy.data('buttons-ng-id',getBtnIdentifier(original));
                proxy.data('buttons-ng-source-ref',this);
                proxy.on('hover:enter hover:long',function(e){
                    var originalNode=proxy.data('buttons-ng-source-ref');
                    var source=$(originalNode);
                    // A provider enabled later may replace the entire native source
                    // container. The old DOM node survives in jQuery but is detached.
                    if(!originalNode||!container[0].contains(originalNode)){
                        var stableId=proxy.data('buttons-ng-id');
                        source=container.find('.buttons--container > .full-start__button').filter(function(){
                            return getBtnIdentifier($(this))===stableId;
                        }).first();
                        if(source.length)proxy.data('buttons-ng-source-ref',source[0]);
                    }
                    if(source.length&&source.closest('.buttons--container').length&&!source.hasClass('hide')){
                        source.trigger(e.type);
                    }
                });
                buttons=buttons.add(proxy);
            });
        }
        var groups={online:[],torrent:[],trailer:[],shots:[],book:[],reaction:[],subscribe:[],other:[]},seen={};
        function add(el){
            var b=$(el);
            if(shouldSkipBtn(b)||b.closest('.person-start__bottom').length)return;
            var base=getBtnIdentifier(b),key=base,i=1;
            while(seen[key]&&seen[key][0]!==el){key=base+'__'+(++i)}
            if(i>1)b.data('buttons-ng-id',key);
            seen[key]=b;
            var type=detectBtnCategory(b);
            if(type==='online'&&b.hasClass('lampac--button')&&!b.hasClass('modss--button')&&!b.hasClass('showy--button')){
                var svg=b.find('svg').first();
                if(svg.length&&!svg.hasClass('modss-online-icon'))svg.replaceWith(LAMPAC_ICON);
            }
            (groups[type]||groups.other).push(b);
        }
        buttons.each(function(){add(this)});
        if(currentContainer&&currentContainer[0]===container[0]){
            allButtonsCache.forEach(function(b){
                if(b&&b[0]&&!b.hasClass('buttons-ng-source-bridge')&&!seen[getBtnIdentifier(b)])add(b[0]);
            });
        }
        return groups;
    }
    var bmSourceObserver=null,bmSourceTimer=null,bmObservedSource=null;
    function bmObserveSources(container){
        if(bmSourceObserver){bmSourceObserver.disconnect();bmSourceObserver=null}
        if(bmSourceTimer){clearTimeout(bmSourceTimer);bmSourceTimer=null}
        bmObservedSource=container.find('.buttons--container').first()[0]||null;
        var root=container[0],strip=container.find('.full-start-new__buttons').first()[0];
        if(!root||!strip||typeof MutationObserver==='undefined')return;
        // Observe the CARD, not just the current source container: when a
        // provider is enabled after startup, it may replace that container.
        // Such replacement disconnects an observer attached to the old node.
        bmSourceObserver=new MutationObserver(function(mutations){
            if(!currentContainer||currentContainer[0]!==root)return;
            if(typeof document!=='undefined'&&!document.documentElement.contains(root))return;
            var liveSource=container.find('.buttons--container').first()[0]||null;
            var changed=liveSource!==bmObservedSource;
            bmObservedSource=liveSource;
            function isSourceContainerNode(node){
                return node&&node.nodeType===1&&
                    ((node.classList&&node.classList.contains('buttons--container'))||
                     (node.querySelector&&node.querySelector('.buttons--container')));
            }
            if(!changed)mutations.forEach(function(m){
                if(changed)return;
                if(m.type==='attributes'){
                    // Focus/hover style changes do not represent source updates.
                    var el=m.target,parent=el.parentNode;
                    if(parent&&parent.classList&&parent.classList.contains('buttons--container')&&
                        el.classList&&el.classList.contains('full-start__button')){
                        var wasHidden=/(^|\s)hide(\s|$)/.test(m.oldValue||'');
                        if(wasHidden!==el.classList.contains('hide'))changed=true;
                    }
                    return;
                }
                if(m.type!=='childList')return;
                var target=m.target;
                if(target&&target.classList&&target.classList.contains('buttons--container')){
                    changed=true;return;
                }
                if(target&&target.closest&&target.closest('.buttons--container')){
                    changed=true;return;
                }
                var added=m.addedNodes||[],removed=m.removedNodes||[];
                for(var i=0;i<added.length;i++){
                    if(isSourceContainerNode(added[i])){changed=true;return}
                    // A plugin may add its control directly to the visible strip.
                    var node=added[i];
                    if(target===strip&&node.nodeType===1&&node.classList&&
                        node.classList.contains('full-start__button')&&
                        !node.hasAttribute('data-buttons-ng-managed')&&
                        !node.classList.contains('button--play')&&
                        !node.classList.contains('button--edit-order')&&
                        !node.classList.contains('button--folder')){
                        changed=true;return;
                    }
                }
                for(var j=0;j<removed.length;j++){
                    if(isSourceContainerNode(removed[j])){changed=true;return}
                }
            });
            if(!changed)return;
            if(bmSourceTimer)clearTimeout(bmSourceTimer);
            bmSourceTimer=setTimeout(function(){
                bmSourceTimer=null;
                if(currentContainer&&currentContainer[0]===root)reorderButtons(container,false);
            },180);
        });
        bmSourceObserver.observe(root,{
            childList:true,subtree:true,attributes:true,
            attributeFilter:['class'],attributeOldValue:true
        });
    }

    function arrangeBtnsByOrder(buttons) {
        var customOrder = getCustomOrder();

        var priority = [];
        var regular = [];

        buttons.forEach(function (btn) {
            var id = getBtnIdentifier(btn);
            if (id === 'modss_online_button' || id === 'showy_online_button') {
                priority.push(btn);
            } else {
                regular.push(btn);
            }
        });

        priority.sort(function (a, b) {
            var idA = getBtnIdentifier(a);
            var idB = getBtnIdentifier(b);
            if (idA === 'modss_online_button') return -1;
            if (idB === 'modss_online_button') return 1;
            if (idA === 'showy_online_button') return -1;
            if (idB === 'showy_online_button') return 1;
            return 0;
        });

        if (!customOrder.length) {
            regular.sort(function (a, b) {
                var typeOrder = ['online', 'torrent', 'trailer', 'shots', 'book', 'reaction', 'subscribe', 'other'];
                var typeA = detectBtnCategory(a);
                var typeB = detectBtnCategory(b);
                var indexA = typeOrder.indexOf(typeA);
                var indexB = typeOrder.indexOf(typeB);
                if (indexA === -1) indexA = 999;
                if (indexB === -1) indexB = 999;
                return indexA - indexB;
            });
            return priority.concat(regular);
        }

        var sorted = [];
        var remaining = regular.slice();

        customOrder.forEach(function (id) {
            for (var i = 0; i < remaining.length; i++) {
                if (getBtnIdentifier(remaining[i]) === id) {
                    sorted.push(remaining[i]);
                    remaining.splice(i, 1);
                    break;
                }
            }
        });

        return priority.concat(sorted).concat(remaining);
    }

    function applyBtnVisibility(buttons) {
        var hidden = getHiddenButtons();
        buttons.forEach(function (btn) {
            var id = getBtnIdentifier(btn);
            if (hidden.indexOf(id) !== -1) {
                btn.addClass('hidden');
            } else {
                btn.removeClass('hidden');
            }
        });
    }

    function applyButtonDisplayModes(buttons) {
        buttons.forEach(function (btn) {
            var id = getBtnIdentifier(btn);
            var mode = getButtonDisplayMode(id);

            // Удаляем все классы режимов
            btn.removeClass('button-mode-1 button-mode-2 button-mode-3');

            // Добавляем класс текущего режима
            btn.addClass('button-mode-' + mode);

            // Универсальная обработка для всех кнопок с нестандартной структурой
            // Проверяем есть ли у кнопки текстовые ноды или span элементы вне SVG
            var hasTextContent = false;
            btn.contents().each(function () {
                if ((this.nodeType === 3 && this.nodeValue.trim()) ||
                    (this.nodeName === 'SPAN' && !$(this).parent().is('svg') && !$(this).hasClass('text-wrapper'))) {
                    hasTextContent = true;
                    return false; // break
                }
            });

            if (hasTextContent) {
                // Сначала разворачиваем все обернутые ноды
                btn.find('.text-wrapper').each(function () {
                    $(this).replaceWith($(this).contents());
                });

                // Получаем все текстовые ноды и span элементы (не в SVG и не специальные классы)
                var nodesToWrap = [];
                btn.contents().each(function () {
                    if (this.nodeType === 3 && this.nodeValue.trim()) { // Text node
                        nodesToWrap.push(this);
                    } else if (this.nodeName === 'SPAN' &&
                        !$(this).parent().is('svg') &&
                        !$(this).hasClass('text-wrapper') &&
                        !$(this).hasClass('shots-view-button__title') &&
                        !$(this).hasClass('shots-view-button__count')) {
                        // Для span элемента - добавляем класс вместо оборачивания
                        $(this).addClass('text-wrapper');
                    }
                });

                // Оборачиваем только текстовые ноды в .text-wrapper
                nodesToWrap.forEach(function (node) {
                    $(node).wrap('<span class="text-wrapper"></span>');
                });
            }
        });
    }

    function animateBtnFadeIn(buttons) {
        buttons.forEach(function (btn,index) {
            btn.css({opacity:'',animation:'button-fade-in 0.26s ease-out both','animation-delay':Math.min(index*0.035,0.22)+'s'});
        });
    }

    function buildEditorBtn() {
        var btn = $('<div class="full-start__button selector button--edit-order" style="order: 9999;">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 29" fill="none"><use xlink:href="#sprite-edit"></use></svg>' +
            '</div>');

        btn.on('hover:enter', function () {
            openEditDialog();
        });

        // Проверяем настройку и скрываем кнопку если редактор выключен
        if (Lampa.Storage.get('buttons_editor_enabled') === false) {
            btn.hide();
        }

        return btn;
    }

    function saveOrder() {
        var order = [];
        currentButtons.forEach(function (btn) {
            order.push(getBtnIdentifier(btn));
        });
        setCustomOrder(order);
    }

    function saveItemOrder() {
        var order = [];
        var items = $('.menu-edit-list .menu-edit-list__item').not('.menu-edit-list__create-folder');

        items.each(function () {
            var $item = $(this);
            var itemType = $item.data('itemType');

            if (itemType === 'folder') {
                order.push({
                    type: 'folder',
                    id: $item.data('folderId')
                });
            } else if (itemType === 'button') {
                order.push({
                    type: 'button',
                    id: $item.data('buttonId')
                });
            }
        });

        setItemOrder(order);
    }

    function applyChanges() {
        if (!currentContainer) return;

        var categories = groupBtnsByType(currentContainer);
        var allButtons = []
            .concat(categories.online)
            .concat(categories.torrent)
            .concat(categories.trailer)
            .concat(categories.shots)
            .concat(categories.book)
            .concat(categories.reaction)
            .concat(categories.subscribe)
            .concat(categories.other);

        allButtons = arrangeBtnsByOrder(allButtons);
        allButtonsCache = allButtons;

        var folders = getFolders();
        var foldersUpdated = false;

        folders.forEach(function (folder) {
            var updatedButtons = [];
            var usedButtons = [];

            folder.buttons.forEach(function (oldBtnId) {
                var found = false;

                for (var i = 0; i < allButtons.length; i++) {
                    var btn = allButtons[i];
                    var newBtnId = getBtnIdentifier(btn);

                    if (usedButtons.indexOf(newBtnId) !== -1) continue;

                    if (newBtnId === oldBtnId) {
                        updatedButtons.push(newBtnId);
                        usedButtons.push(newBtnId);
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    for (var i = 0; i < allButtons.length; i++) {
                        var btn = allButtons[i];
                        var newBtnId = getBtnIdentifier(btn);

                        if (usedButtons.indexOf(newBtnId) !== -1) continue;

                        var text = btn.find('span').text().trim();
                        var classes = btn.attr('class') || '';

                        if ((oldBtnId.indexOf('modss') !== -1 || oldBtnId.indexOf('MODS') !== -1) &&
                            (classes.indexOf('modss') !== -1 || text.indexOf('MODS') !== -1)) {
                            updatedButtons.push(newBtnId);
                            usedButtons.push(newBtnId);
                            found = true;
                            break;
                        } else if ((oldBtnId.indexOf('showy') !== -1 || oldBtnId.indexOf('Showy') !== -1) &&
                            (classes.indexOf('showy') !== -1 || text.indexOf('Showy') !== -1)) {
                            updatedButtons.push(newBtnId);
                            usedButtons.push(newBtnId);
                            found = true;
                            break;
                        }
                    }
                }

                if (!found) {
                    updatedButtons.push(oldBtnId);
                }
            });

            if (updatedButtons.length !== folder.buttons.length ||
                updatedButtons.some(function (id, i) { return id !== folder.buttons[i]; })) {
                folder.buttons = updatedButtons;
                foldersUpdated = true;
            }
        });

        if (foldersUpdated) {
            setFolders(folders);
        }

        // Оптимизация: получаем buttonsInFolders один раз
        var buttonsInFolders = [];
        folders.forEach(function (folder) {
            buttonsInFolders = buttonsInFolders.concat(folder.buttons);
        });

        var filteredButtons = allButtons.filter(function (btn) {
            return buttonsInFolders.indexOf(getBtnIdentifier(btn)) === -1;
        });

        currentButtons = filteredButtons;
        filteredButtons.forEach(function(btn){btn.attr('data-buttons-ng-managed','1')});
        applyBtnVisibility(filteredButtons);
        applyButtonDisplayModes(filteredButtons);

        var targetContainer = currentContainer.find('.full-start-new__buttons');
        if (!targetContainer.length) return;

        // Lampa binds the native Watch menu to .button--play.
        var bmNativePlay = targetContainer.children('.button--play').first().detach();
        targetContainer.find('.full-start__button').not('.button--edit-order').detach();

        var itemOrder = getItemOrder();
        var visibleButtons = [];

        if (itemOrder.length > 0) {
            var addedFolders = [];
            var addedButtons = [];

            itemOrder.forEach(function (item) {
                if (item.type === 'folder') {
                    var folder = folders.find(function (f) { return f.id === item.id; });
                    if (folder) {
                        var folderBtn = createFolderButton(folder);
                        targetContainer.append(folderBtn);
                        visibleButtons.push(folderBtn);
                        addedFolders.push(folder.id);
                    }
                } else if (item.type === 'button') {
                    var btnId = item.id;
                    if (buttonsInFolders.indexOf(btnId) === -1) {
                        var btn = currentButtons.find(function (b) { return getBtnIdentifier(b) === btnId; });
                        if (btn && !btn.hasClass('hidden')) {
                            targetContainer.append(btn);
                            visibleButtons.push(btn);
                            addedButtons.push(btnId);
                        }
                    }
                }
            });

            currentButtons.forEach(function (btn) {
                var btnId = getBtnIdentifier(btn);
                if (addedButtons.indexOf(btnId) === -1 && !btn.hasClass('hidden') && buttonsInFolders.indexOf(btnId) === -1) {
                    var insertBefore = null;
                    var btnType = detectBtnCategory(btn);
                    var typeOrder = ['online', 'torrent', 'trailer', 'shots', 'book', 'reaction', 'subscribe', 'other'];
                    var btnTypeIndex = typeOrder.indexOf(btnType);
                    if (btnTypeIndex === -1) btnTypeIndex = 999;

                    if (btnId === 'modss_online_button' || btnId === 'showy_online_button') {
                        var firstNonPriority = targetContainer.find('.full-start__button').not('.button--edit-order, .button--folder').filter(function () {
                            var id = getBtnIdentifier($(this));
                            return id !== 'modss_online_button' && id !== 'showy_online_button';
                        }).first();

                        if (firstNonPriority.length) {
                            insertBefore = firstNonPriority;
                        }

                        if (btnId === 'showy_online_button') {
                            var modsBtn = targetContainer.find('.full-start__button').filter(function () {
                                return getBtnIdentifier($(this)) === 'modss_online_button';
                            });
                            if (modsBtn.length) {
                                insertBefore = modsBtn.next();
                                if (!insertBefore.length || insertBefore.hasClass('button--edit-order')) {
                                    insertBefore = null;
                                }
                            }
                        }
                    } else {
                        targetContainer.find('.full-start__button').not('.button--edit-order, .button--folder').each(function () {
                            var existingBtn = $(this);
                            var existingId = getBtnIdentifier(existingBtn);

                            if (existingId === 'modss_online_button' || existingId === 'showy_online_button') {
                                return true;
                            }

                            var existingType = detectBtnCategory(existingBtn);
                            var existingTypeIndex = typeOrder.indexOf(existingType);
                            if (existingTypeIndex === -1) existingTypeIndex = 999;

                            if (btnTypeIndex < existingTypeIndex) {
                                insertBefore = existingBtn;
                                return false;
                            }
                        });
                    }

                    if (insertBefore && insertBefore.length) {
                        btn.insertBefore(insertBefore);
                    } else {
                        var editBtn = targetContainer.find('.button--edit-order');
                        if (editBtn.length) {
                            btn.insertBefore(editBtn);
                        } else {
                            targetContainer.append(btn);
                        }
                    }
                    visibleButtons.push(btn);
                }
            });

            folders.forEach(function (folder) {
                if (addedFolders.indexOf(folder.id) === -1) {
                    var folderBtn = createFolderButton(folder);
                    targetContainer.append(folderBtn);
                    visibleButtons.push(folderBtn);
                }
            });
        } else {
            currentButtons.forEach(function (btn) {
                var btnId = getBtnIdentifier(btn);
                if (!btn.hasClass('hidden') && buttonsInFolders.indexOf(btnId) === -1) {
                    targetContainer.append(btn);
                    visibleButtons.push(btn);
                }
            });

            folders.forEach(function (folder) {
                var folderBtn = createFolderButton(folder);
                targetContainer.append(folderBtn);
                visibleButtons.push(folderBtn);
            });
        }

        if (bmNativePlay.length) {
            // Keep the native Watch node for Lampa's groupButtons/source menus,
            // but don't offer it as a separate, non-functional TV focus target.
            bmNativePlay.removeClass('selector focus').addClass('buttons-ng-native-play');
            targetContainer.prepend(bmNativePlay);
        }
        // Re-applying edited layout must not trigger another entrance animation.
        visibleButtons.forEach(function(btn){btn.css({opacity:'',animation:'','animation-delay':''})});

        var editBtn = targetContainer.find('.button--edit-order');
        if (editBtn.length) {
            editBtn.detach();
            targetContainer.append(editBtn);
        }

        // Do not overwrite saved order with transient buttons from this card.

        setTimeout(function () {
            if (currentContainer) {
                setupButtonNavigation(currentContainer);
            }
        }, 100);
    }

    function capitalizeText(str) {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    function getBtnDisplayText(btn, allButtons) {
        var text = btn.find('span').text().trim();
        var classes = btn.attr('class') || '';
        var subtitle = btn.attr('data-subtitle') || '';

        if (!text) {
            var viewClass = classes.split(' ').find(function (c) {
                return c.indexOf('view--') === 0 || c.indexOf('button--') === 0;
            });
            if (viewClass) {
                text = viewClass.replace('view--', '').replace('button--', '').replace(/_/g, ' ');
                text = capitalizeText(text);
            } else {
                text = getTranslation('buttons_plugin_button_unknown');
            }
            return text;
        }

        var sameTextCount = 0;
        allButtons.forEach(function (otherBtn) {
            if (otherBtn.find('span').text().trim() === text) {
                sameTextCount++;
            }
        });

        if (sameTextCount > 1) {
            if (subtitle) {
                return text + ' <span style="opacity:0.5">(' + subtitle.substring(0, 30) + ')</span>';
            }

            var viewClass = classes.split(' ').find(function (c) {
                return c.indexOf('view--') === 0;
            });
            if (viewClass) {
                var identifier = viewClass.replace('view--', '').replace(/_/g, ' ');
                identifier = capitalizeText(identifier);
                if (identifier.toLowerCase() !== text.toLowerCase()) {
                    return text + ' <span style="opacity:0.5">(' + identifier + ')</span>';
                }
            }
            var number=0, total=0, myId=getBtnIdentifier(btn);
            allButtons.forEach(function(b) {
                if(b.find('span').text().trim()===text) {
                    total++;
                    if(getBtnIdentifier(b)===myId) number=total;
                }
            });
            return text + ' <span style="opacity:0.5">(' + (number||1) + '/' + total + ')</span>';
        }

        return text;
    }

    function createFolderButton(folder) {
        var firstBtnId = folder.buttons[0];
        var firstBtn = findButton(firstBtnId);
        var icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
            '</svg>';

        if (firstBtn) {
            var btnIcon = firstBtn.find('svg').first();
            if (btnIcon.length) {
                icon = btnIcon.prop('outerHTML');
            }
        }

        var btn = $('<div class="full-start__button selector button--folder" data-folder-id="' + folder.id + '">' +
            icon +
            '<span>' + folder.name + '</span>' +
            '</div>');

        btn.on('hover:enter', function () {
            openFolderMenu(folder);
        });

        return btn;
    }

    function openFolderMenu(folder) {
        var items = [];

        folder.buttons.forEach(function (btnId) {
            var btn = findButton(btnId);
            if (btn) {
                var displayName = getBtnDisplayText(btn, allButtonsOriginal);
                var iconElement = btn.find('svg').first();
                var icon = iconElement.length ? iconElement.prop('outerHTML') : '';
                var subtitle = btn.attr('data-subtitle') || '';

                var item = {
                    title: displayName.replace(/<[^>]*>/g, ''),
                    button: btn,
                    btnId: btnId
                };

                if (icon) {
                    item.template = 'selectbox_icon';
                    item.icon = icon;
                }

                if (subtitle) {
                    item.subtitle = subtitle;
                }

                items.push(item);
            }
        });

        items.push({
            title: getTranslation('buttons_plugin_edit_order'),
            edit: true
        });

        Lampa.Select.show({
            title: folder.name,
            items: items,
            onSelect: function (item) {
                if (item.edit) {
                    openFolderEditDialog(folder);
                } else {
                    item.button.trigger('hover:enter');
                }
            },
            onBack: function () {
                Lampa.Controller.toggle('full_start');
            }
        });
    }

    function openFolderEditDialog(folder) {
        var list = $('<div class="menu-edit-list"></div>');

        folder.buttons.forEach(function (btnId) {
            var btn = findButton(btnId);
            if (btn) {
                var displayName = getBtnDisplayText(btn, allButtonsOriginal);
                var iconElement = btn.find('svg').first();
                var icon = iconElement.length ? iconElement.clone() : $('<svg></svg>');

                var item = $('<div class="menu-edit-list__item">' +
                    '<div class="menu-edit-list__icon"></div>' +
                    '<div class="menu-edit-list__title">' + displayName + '</div>' +
                    '<div class="menu-edit-list__move move-up selector">' +
                    '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<path d="M2 12L11 3L20 12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
                    '</svg>' +
                    '</div>' +
                    '<div class="menu-edit-list__move move-down selector">' +
                    '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                    '<path d="M2 2L11 11L20 2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
                    '</svg>' +
                    '</div>' +
                    '</div>');

                item.find('.menu-edit-list__icon').append(icon);
                item.data('btnId', btnId);

                item.find('.move-up').on('hover:enter', function () {
                    var prev = item.prev();
                    if (prev.length) {
                        item.insertBefore(prev);
                        saveFolderButtonOrder(folder, list);
                    }
                });

                item.find('.move-down').on('hover:enter', function () {
                    var next = item.next();
                    if (next.length) {
                        item.insertAfter(next);
                        saveFolderButtonOrder(folder, list);
                    }
                });

                list.append(item);
            }
        });

        Lampa.Modal.open({
            title: getTranslation('buttons_plugin_folder_order'),
            html: list,
            size: 'small',
            scroll_to_center: true,
            onBack: function () {
                Lampa.Modal.close();
                updateFolderIcon(folder);
                openFolderMenu(folder);
            }
        });
    }

    function saveFolderButtonOrder(folder, list) {
        var newOrder = [];
        list.find('.menu-edit-list__item').each(function () {
            var btnId = $(this).data('btnId');
            newOrder.push(btnId);
        });

        folder.buttons = newOrder;

        var folders = getFolders();
        for (var i = 0; i < folders.length; i++) {
            if (folders[i].id === folder.id) {
                folders[i].buttons = newOrder;
                break;
            }
        }
        setFolders(folders);

        updateFolderIcon(folder);
    }

    function updateFolderIcon(folder) {
        if (!folder.buttons || folder.buttons.length === 0) return;

        var folderBtn = currentContainer.find('.button--folder[data-folder-id="' + folder.id + '"]');
        if (folderBtn.length) {
            var firstBtnId = folder.buttons[0];
            var firstBtn = findButton(firstBtnId);

            if (firstBtn) {
                var iconElement = firstBtn.find('svg').first();
                if (iconElement.length) {
                    var btnIcon = iconElement.clone();
                    folderBtn.find('svg').replaceWith(btnIcon);
                }
            } else {
                var defaultIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
                    '</svg>';
                folderBtn.find('svg').replaceWith(defaultIcon);
            }
        }
    }

    function createFolder(name, buttonIds) {
        var folders = getFolders();
        var folder = {
            id: 'folder_' + Date.now(),
            name: name,
            buttons: buttonIds
        };
        folders.push(folder);
        setFolders(folders);
        return folder;
    }

    function deleteFolder(folderId) {
        var folders = getFolders();
        folders = folders.filter(function (f) { return f.id !== folderId; });
        setFolders(folders);
    }

    function openCreateFolderDialog() {
        Lampa.Input.edit({
            free: true,
            title: getTranslation('buttons_plugin_folder_name'),
            nosave: true,
            value: '',
            nomic: true
        }, function (folderName) {
            if (!folderName || !folderName.trim()) {
                Lampa.Noty.show(getTranslation('buttons_plugin_folder_name'));
                openEditDialog();
                return;
            }
            openSelectButtonsDialog(folderName.trim());
        });
    }

    function openSelectButtonsDialog(folderName) {
        var selectedButtons = [];
        var list = $('<div class="menu-edit-list"></div>');

        var buttonsInFolders = getButtonsInFolders();
        var sortedButtons = arrangeBtnsByOrder(allButtonsOriginal.slice());

        sortedButtons.forEach(function (btn) {
            var btnId = getBtnIdentifier(btn);

            if (buttonsInFolders.indexOf(btnId) !== -1) {
                return;
            }

            var displayName = getBtnDisplayText(btn, sortedButtons);
            var iconElement = btn.find('svg').first();
            var icon = iconElement.length ? iconElement.clone() : $('<svg></svg>');

            var item = $('<div class="menu-edit-list__item">' +
                '<div class="menu-edit-list__icon"></div>' +
                '<div class="menu-edit-list__title">' + displayName + '</div>' +
                '<div class="menu-edit-list__toggle selector">' +
                '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="1.89111" y="1.78369" width="21.793" height="21.793" rx="3.5" stroke="currentColor" stroke-width="3"/>' +
                '<path d="M7.44873 12.9658L10.8179 16.3349L18.1269 9.02588" stroke="currentColor" stroke-width="3" class="dot" opacity="0" stroke-linecap="round"/>' +
                '</svg>' +
                '</div>' +
                '</div>');

            item.find('.menu-edit-list__icon').append(icon);

            item.find('.menu-edit-list__toggle').on('hover:enter', function () {
                var index = selectedButtons.indexOf(btnId);
                if (index !== -1) {
                    selectedButtons.splice(index, 1);
                    item.find('.dot').attr('opacity', '0');
                } else {
                    selectedButtons.push(btnId);
                    item.find('.dot').attr('opacity', '1');
                }
            });

            list.append(item);
        });

        var createBtn = $('<div class="selector folder-create-confirm">' +
            '<div style="text-align: center; padding: 1em;">' + getTranslation('buttons_plugin_create_folder') + ' "' + folderName + '"</div>' +
            '</div>');

        createBtn.on('hover:enter', function () {
            if (selectedButtons.length < 2) {
                Lampa.Noty.show(getTranslation('buttons_plugin_min_2_buttons'));
                return;
            }

            var folder = createFolder(folderName, selectedButtons);

            var itemOrder = getItemOrder();

            if (itemOrder.length === 0) {
                currentButtons.forEach(function (btn) {
                    itemOrder.push({
                        type: 'button',
                        id: getBtnIdentifier(btn)
                    });
                });
            }

            var folderAdded = false;

            for (var i = 0; i < selectedButtons.length; i++) {
                var btnId = selectedButtons[i];

                for (var j = 0; j < itemOrder.length; j++) {
                    if (itemOrder[j].type === 'button' && itemOrder[j].id === btnId) {
                        if (!folderAdded) {
                            itemOrder[j] = {
                                type: 'folder',
                                id: folder.id
                            };
                            folderAdded = true;
                        } else {
                            itemOrder.splice(j, 1);
                            j--;
                        }
                        break;
                    }
                }

                for (var k = 0; k < currentButtons.length; k++) {
                    if (getBtnIdentifier(currentButtons[k]) === btnId) {
                        currentButtons.splice(k, 1);
                        break;
                    }
                }
            }

            if (!folderAdded) {
                itemOrder.push({
                    type: 'folder',
                    id: folder.id
                });
            }

            setItemOrder(itemOrder);

            Lampa.Modal.close();
            Lampa.Noty.show(getTranslation('buttons_plugin_folder_created') + ' "' + folderName + '"');

            if (currentContainer) {
                currentContainer.data('buttons-processed', false);
                reorderButtons(currentContainer);
            }
            refreshController();
        });

        list.append(createBtn);

        Lampa.Modal.open({
            title: getTranslation('buttons_plugin_select_buttons'),
            html: list,
            size: 'medium',
            scroll_to_center: true,
            onBack: function () {
                Lampa.Modal.close();
                openEditDialog();
            }
        });
    }

    function openEditDialog() {
        if (currentContainer) {
            var categories = groupBtnsByType(currentContainer);
            var allButtons = []
                .concat(categories.online)
                .concat(categories.torrent)
                .concat(categories.trailer)
                .concat(categories.shots)
                .concat(categories.book)
                .concat(categories.reaction)
                .concat(categories.subscribe)
                .concat(categories.other);

            allButtons = arrangeBtnsByOrder(allButtons);
            allButtonsCache = allButtons;

            var folders = getFolders();
            var buttonsInFolders = [];
            folders.forEach(function (folder) {
                buttonsInFolders = buttonsInFolders.concat(folder.buttons);
            });

            var filteredButtons = allButtons.filter(function (btn) {
                return buttonsInFolders.indexOf(getBtnIdentifier(btn)) === -1;
            });

            currentButtons = filteredButtons;
        }

        var list = $('<div class="menu-edit-list"></div>');
        var hidden = getHiddenButtons();
        var folders = getFolders();
        var itemOrder = getItemOrder();

        var createFolderBtn = $('<div class="menu-edit-list__item menu-edit-list__create-folder selector">' +
            '<div class="menu-edit-list__icon">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
            '<line x1="12" y1="11" x2="12" y2="17"></line>' +
            '<line x1="9" y1="14" x2="15" y2="14"></line>' +
            '</svg>' +
            '</div>' +
            '<div class="menu-edit-list__title">' + getTranslation('buttons_plugin_create_folder') + '</div>' +
            '</div>');

        createFolderBtn.on('hover:enter', function () {
            Lampa.Modal.close();
            openCreateFolderDialog();
        });

        // Сначала добавляем кнопку создания папки
        list.append(createFolderBtn);

        // Затем добавляем заголовок с подписями
        var header = $('<div class="menu-edit-list__header">' +
            '<div class="menu-edit-list__header-spacer"></div>' +
            '<div class="menu-edit-list__header-move">' + getTranslation('buttons_plugin_move') + '</div>' +
            '<div class="menu-edit-list__header-mode">' + getTranslation('buttons_plugin_view') + '</div>' +
            '<div class="menu-edit-list__header-toggle">' + getTranslation('buttons_plugin_show') + '</div>' +
            '</div>');
        list.append(header);

        function createFolderItem(folder) {
            var item = $('<div class="menu-edit-list__item folder-item">' +
                '<div class="menu-edit-list__icon">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>' +
                '</svg>' +
                '</div>' +
                '<div class="menu-edit-list__title">' + folder.name + ' <span style="opacity:0.5">(' + folder.buttons.length + ')</span></div>' +
                '<div class="menu-edit-list__move move-up selector">' +
                '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M2 12L11 3L20 12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
                '</svg>' +
                '</div>' +
                '<div class="menu-edit-list__move move-down selector">' +
                '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M2 2L11 11L20 2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
                '</svg>' +
                '</div>' +
                '<div class="menu-edit-list__delete selector">' +
                '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="1.89111" y="1.78369" width="21.793" height="21.793" rx="3.5" stroke="currentColor" stroke-width="3"/>' +
                '<path d="M9.5 9.5L16.5 16.5M16.5 9.5L9.5 16.5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
                '</svg>' +
                '</div>' +
                '</div>');

            item.data('folderId', folder.id);
            item.data('itemType', 'folder');

            item.find('.move-up').on('hover:enter', function () {
                var prev = item.prev();
                while (prev.length && prev.hasClass('menu-edit-list__create-folder')) {
                    prev = prev.prev();
                }
                if (prev.length) {
                    item.insertBefore(prev);
                    saveItemOrder();
                }
            });

            item.find('.move-down').on('hover:enter', function () {
                var next = item.next();
                while (next.length && next.hasClass('folder-reset-button')) {
                    next = next.next();
                }
                if (next.length && !next.hasClass('folder-reset-button')) {
                    item.insertAfter(next);
                    saveItemOrder();
                }
            });

            item.find('.menu-edit-list__delete').on('hover:enter', function () {
                var folderId = folder.id;
                var folderButtons = folder.buttons.slice();

                deleteFolder(folderId);

                var itemOrder = getItemOrder();
                var newItemOrder = [];

                for (var i = 0; i < itemOrder.length; i++) {
                    if (itemOrder[i].type === 'folder' && itemOrder[i].id === folderId) {
                        continue;
                    }
                    if (itemOrder[i].type === 'button') {
                        var isInFolder = false;
                        for (var j = 0; j < folderButtons.length; j++) {
                            if (itemOrder[i].id === folderButtons[j]) {
                                isInFolder = true;
                                break;
                            }
                        }
                        if (isInFolder) {
                            continue;
                        }
                    }
                    newItemOrder.push(itemOrder[i]);
                }

                setItemOrder(newItemOrder);

                var customOrder = getCustomOrder();
                var newCustomOrder = [];
                for (var i = 0; i < customOrder.length; i++) {
                    var found = false;
                    for (var j = 0; j < folderButtons.length; j++) {
                        if (customOrder[i] === folderButtons[j]) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        newCustomOrder.push(customOrder[i]);
                    }
                }
                setCustomOrder(newCustomOrder);

                item.remove();
                Lampa.Noty.show(getTranslation('buttons_plugin_folder_deleted'));

                setTimeout(function () {
                    if (currentContainer) {
                        currentContainer.find('.button--edit-order, .button--folder').remove();
                        currentContainer.data('buttons-processed', false);

                        var targetContainer = currentContainer.find('.full-start-new__buttons');
                        var existingButtons = targetContainer.find('.full-start__button').toArray();

                        allButtonsOriginal.forEach(function (originalBtn) {
                            var btnId = getBtnIdentifier(originalBtn);
                            var exists = false;

                            for (var i = 0; i < existingButtons.length; i++) {
                                if (getBtnIdentifier($(existingButtons[i])) === btnId) {
                                    exists = true;
                                    break;
                                }
                            }

                            if (!exists) {
                                var clonedBtn = originalBtn.clone(true, true);
                                clonedBtn.css({
                                    'opacity': '1',
                                    'animation': 'none'
                                });
                                targetContainer.append(clonedBtn);
                            }
                        });

                        reorderButtons(currentContainer);

                        setTimeout(function () {
                            var updatedItemOrder = [];
                            targetContainer.find('.full-start__button').not('.button--edit-order').each(function () {
                                var $btn = $(this);
                                if ($btn.hasClass('button--folder')) {
                                    var fId = $btn.attr('data-folder-id');
                                    updatedItemOrder.push({
                                        type: 'folder',
                                        id: fId
                                    });
                                } else {
                                    var btnId = getBtnIdentifier($btn);
                                    updatedItemOrder.push({
                                        type: 'button',
                                        id: btnId
                                    });
                                }
                            });
                            setItemOrder(updatedItemOrder);

                            var categories = groupBtnsByType(currentContainer);
                            var allButtons = []
                                .concat(categories.online)
                                .concat(categories.torrent)
                                .concat(categories.trailer)
                                .concat(categories.shots)
                                .concat(categories.book)
                                .concat(categories.reaction)
                                .concat(categories.subscribe)
                                .concat(categories.other);

                            allButtons = arrangeBtnsByOrder(allButtons);
                            allButtonsCache = allButtons;

                            var folders = getFolders();
                            var buttonsInFolders = [];
                            folders.forEach(function (folder) {
                                buttonsInFolders = buttonsInFolders.concat(folder.buttons);
                            });

                            var filteredButtons = allButtons.filter(function (btn) {
                                return buttonsInFolders.indexOf(getBtnIdentifier(btn)) === -1;
                            });

                            currentButtons = filteredButtons;

                            folderButtons.forEach(function (btnId) {
                                var btn = allButtons.find(function (b) { return getBtnIdentifier(b) === btnId; });
                                if (btn) {
                                    var btnItem = createButtonItem(btn);

                                    var inserted = false;
                                    list.find('.menu-edit-list__item').not('.menu-edit-list__create-folder, .folder-reset-button').each(function () {
                                        var $existingItem = $(this);
                                        var existingType = $existingItem.data('itemType');

                                        if (existingType === 'button') {
                                            var existingBtnId = $existingItem.data('buttonId');
                                            var existingIndex = updatedItemOrder.findIndex(function (item) {
                                                return item.type === 'button' && item.id === existingBtnId;
                                            });
                                            var newIndex = updatedItemOrder.findIndex(function (item) {
                                                return item.type === 'button' && item.id === btnId;
                                            });

                                            if (newIndex !== -1 && existingIndex !== -1 && newIndex < existingIndex) {
                                                btnItem.insertBefore($existingItem);
                                                inserted = true;
                                                return false;
                                            }
                                        }
                                    });

                                    if (!inserted) {
                                        var resetButton = list.find('.folder-reset-button');
                                        if (resetButton.length) {
                                            btnItem.insertBefore(resetButton);
                                        } else {
                                            list.append(btnItem);
                                        }
                                    }
                                }
                            });

                            setTimeout(function () {
                                try {
                                    Lampa.Controller.toggle('modal');
                                } catch (e) { }
                            }, 100);
                        }, 100);
                    }
                }, 50);
            });

            return item;
        }

        function createButtonItem(btn) {
            var displayName = getBtnDisplayText(btn, currentButtons);
            var icon = btn.find('svg').first().clone();
            var btnId = getBtnIdentifier(btn);
            var isHidden = hidden.indexOf(btnId) !== -1;
            var displayMode = getButtonDisplayMode(btnId);

            var item = $('<div class="menu-edit-list__item' + (isHidden ? ' item-hidden' : '') + '">' +
                '<div class="menu-edit-list__icon"></div>' +
                '<div class="menu-edit-list__title">' + displayName + '</div>' +
                '<div class="menu-edit-list__move move-up selector">' +
                '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M2 12L11 3L20 12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
                '</svg>' +
                '</div>' +
                '<div class="menu-edit-list__move move-down selector">' +
                '<svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M2 2L11 11L20 2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' +
                '</svg>' +
                '</div>' +
                '<div class="menu-edit-list__display-mode selector" data-mode="' + displayMode + '">' +
                '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="1.89111" y="1.78369" width="21.793" height="21.793" rx="3.5" stroke="currentColor" stroke-width="3"/>' +
                '<text x="13" y="17" text-anchor="middle" fill="currentColor" font-size="12" font-weight="bold" class="mode-number">' + displayMode + '</text>' +
                '</svg>' +
                '</div>' +
                '<div class="menu-edit-list__toggle toggle selector">' +
                '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<rect x="1.89111" y="1.78369" width="21.793" height="21.793" rx="3.5" stroke="currentColor" stroke-width="3"/>' +
                '<path d="M7.44873 12.9658L10.8179 16.3349L18.1269 9.02588" stroke="currentColor" stroke-width="3" class="dot" opacity="' + (isHidden ? '0' : '1') + '" stroke-linecap="round"/>' +
                '</svg>' +
                '</div>' +
                '</div>');

            item.find('.menu-edit-list__icon').append(icon);
            item.data('button', btn);
            item.data('buttonId', btnId);
            item.data('itemType', 'button');

            item.find('.move-up').on('hover:enter', function () {
                var prev = item.prev();
                while (prev.length && prev.hasClass('menu-edit-list__create-folder')) {
                    prev = prev.prev();
                }
                if (prev.length && !prev.hasClass('menu-edit-list__create-folder')) {
                    item.insertBefore(prev);
                    var btnIndex = currentButtons.indexOf(btn);
                    if (btnIndex > 0) {
                        currentButtons.splice(btnIndex, 1);
                        currentButtons.splice(btnIndex - 1, 0, btn);
                    }
                    saveItemOrder();
                }
            });

            item.find('.move-down').on('hover:enter', function () {
                var next = item.next();
                while (next.length && next.hasClass('folder-reset-button')) {
                    next = next.next();
                }
                if (next.length && !next.hasClass('folder-reset-button')) {
                    item.insertAfter(next);
                    var btnIndex = currentButtons.indexOf(btn);
                    if (btnIndex < currentButtons.length - 1) {
                        currentButtons.splice(btnIndex, 1);
                        currentButtons.splice(btnIndex + 1, 0, btn);
                    }
                    saveItemOrder();
                }
            });

            item.find('.menu-edit-list__display-mode').on('hover:enter', function () {
                var currentMode = parseInt($(this).attr('data-mode')) || 1;
                var newMode = currentMode >= 3 ? 1 : currentMode + 1;

                $(this).attr('data-mode', newMode);
                $(this).find('.mode-number').text(newMode);

                setButtonDisplayMode(btnId, newMode);

                // Применяем режим к кнопке
                btn.removeClass('button-mode-1 button-mode-2 button-mode-3');
                btn.addClass('button-mode-' + newMode);
            });

            item.find('.toggle').on('hover:enter', function () {
                var hidden = getHiddenButtons();
                var index = hidden.indexOf(btnId);

                if (index !== -1) {
                    hidden.splice(index, 1);
                    btn.removeClass('hidden');
                    item.find('.dot').attr('opacity', '1');
                    item.removeClass('item-hidden');
                } else {
                    hidden.push(btnId);
                    btn.addClass('hidden');
                    item.find('.dot').attr('opacity', '0');
                    item.addClass('item-hidden');
                }

                setHiddenButtons(hidden);
            });

            return item;
        }

        if (itemOrder.length > 0) {
            itemOrder.forEach(function (item) {
                if (item.type === 'folder') {
                    var folder = folders.find(function (f) { return f.id === item.id; });
                    if (folder) {
                        list.append(createFolderItem(folder));
                    }
                } else if (item.type === 'button') {
                    var btn = currentButtons.find(function (b) { return getBtnIdentifier(b) === item.id; });
                    if (btn) {
                        list.append(createButtonItem(btn));
                    }
                }
            });

            currentButtons.forEach(function (btn) {
                var btnId = getBtnIdentifier(btn);
                var found = itemOrder.some(function (item) {
                    return item.type === 'button' && item.id === btnId;
                });
                if (!found) {
                    list.append(createButtonItem(btn));
                }
            });

            folders.forEach(function (folder) {
                var found = itemOrder.some(function (item) {
                    return item.type === 'folder' && item.id === folder.id;
                });
                if (!found) {
                    list.append(createFolderItem(folder));
                }
            });
        } else {
            folders.forEach(function (folder) {
                list.append(createFolderItem(folder));
            });

            currentButtons.forEach(function (btn) {
                list.append(createButtonItem(btn));
            });
        }

        var resetBtn = $('<div class="selector folder-reset-button">' +
            '<div style="text-align: center; padding: 1em;">' + getTranslation('buttons_plugin_reset_default') + '</div>' +
            '</div>');

        resetBtn.on('hover:enter', function () {
            var folders = getFolders();

            Lampa.Storage.set('button_custom_order', []);
            Lampa.Storage.set('button_hidden', []);
            Lampa.Storage.set('button_folders', []);
            Lampa.Storage.set('button_item_order', []);
            Lampa.Storage.set('button_display_modes', {}); // Сброс режимов отображения
            bmSave();
            Lampa.Modal.close();
            Lampa.Noty.show(getTranslation('buttons_plugin_settings_reset'));

            setTimeout(function () {
                if (currentContainer) {
                    currentContainer.find('.button--edit-order, .button--folder').remove();
                    currentContainer.data('buttons-processed', false);

                    var targetContainer = currentContainer.find('.full-start-new__buttons');
                    var existingButtons = targetContainer.find('.full-start__button').toArray();

                    allButtonsOriginal.forEach(function (originalBtn) {
                        var btnId = getBtnIdentifier(originalBtn);
                        var exists = false;

                        for (var i = 0; i < existingButtons.length; i++) {
                            if (getBtnIdentifier($(existingButtons[i])) === btnId) {
                                exists = true;
                                break;
                            }
                        }

                        if (!exists) {
                            var clonedBtn = originalBtn.clone(true, true);
                            clonedBtn.css({
                                'opacity': '1',
                                'animation': 'none'
                            });
                            targetContainer.append(clonedBtn);
                        }
                    });

                    reorderButtons(currentContainer);
                    refreshController();
                }
            }, 100);
        });

        list.append(resetBtn);

        Lampa.Modal.open({
            title: getTranslation('buttons_plugin_button_order'),
            html: list,
            size: 'small',
            scroll_to_center: true,
            onBack: function () {
                Lampa.Modal.close();
                applyChanges();
                Lampa.Controller.toggle('full_start');
            }
        });
    }

    function reorderButtons(container, isFreshRender) {
        var targetContainer = container.find('.full-start-new__buttons');
        if (!targetContainer.length) return false;

        if(isFreshRender||!currentContainer||currentContainer[0]!==container[0]){allButtonsCache=[];allButtonsOriginal=[];}
        currentContainer = container;
        container.find('.button--edit-order, .button--folder').remove();

        var categories = groupBtnsByType(container);
        bmMigrateIds();

        var allButtons = []
            .concat(categories.online)
            .concat(categories.torrent)
            .concat(categories.trailer)
            .concat(categories.shots)
            .concat(categories.book)
            .concat(categories.reaction)
            .concat(categories.subscribe)
            .concat(categories.other);

        allButtons = arrangeBtnsByOrder(allButtons);
        allButtonsCache = allButtons;

        if (isFreshRender || allButtonsOriginal.length === 0) {
            allButtonsOriginal = [];
            allButtons.forEach(function (btn) {
                allButtonsOriginal.push(btn.clone(true, true));
            });
        }

        var folders = getFolders();
        var buttonsInFolders = [];
        folders.forEach(function (folder) {
            buttonsInFolders = buttonsInFolders.concat(folder.buttons);
        });

        var filteredButtons = allButtons.filter(function (btn) {
            return buttonsInFolders.indexOf(getBtnIdentifier(btn)) === -1;
        });

        currentButtons = filteredButtons;
        filteredButtons.forEach(function(btn){btn.attr('data-buttons-ng-managed','1')});
        applyBtnVisibility(filteredButtons);
        applyButtonDisplayModes(filteredButtons);

        // Preserve native Lampa Watch button; Start.onGroupButtons needs its DOM node.
        var bmNativePlay = targetContainer.children('.button--play').first().detach();
        targetContainer.children().detach();

        var visibleButtons = [];
        var itemOrder = getItemOrder();

        if (itemOrder.length > 0) {
            var addedFolders = [];
            var addedButtons = [];

            itemOrder.forEach(function (item) {
                if (item.type === 'folder') {
                    var folder = folders.find(function (f) { return f.id === item.id; });
                    if (folder) {
                        var folderBtn = createFolderButton(folder);
                        targetContainer.append(folderBtn);
                        visibleButtons.push(folderBtn);
                        addedFolders.push(folder.id);
                    }
                } else if (item.type === 'button') {
                    var btn = filteredButtons.find(function (b) { return getBtnIdentifier(b) === item.id; });
                    if (btn && !btn.hasClass('hidden')) {
                        targetContainer.append(btn);
                        visibleButtons.push(btn);
                        addedButtons.push(getBtnIdentifier(btn));
                    }
                }
            });

            filteredButtons.forEach(function (btn) {
                var btnId = getBtnIdentifier(btn);
                if (addedButtons.indexOf(btnId) === -1 && !btn.hasClass('hidden')) {
                    var insertBefore = null;
                    var btnType = detectBtnCategory(btn);
                    var typeOrder = ['online', 'torrent', 'trailer', 'shots', 'book', 'reaction', 'subscribe', 'other'];
                    var btnTypeIndex = typeOrder.indexOf(btnType);
                    if (btnTypeIndex === -1) btnTypeIndex = 999;

                    if (btnId === 'modss_online_button' || btnId === 'showy_online_button') {
                        var firstNonPriority = targetContainer.find('.full-start__button').not('.button--edit-order, .button--folder').filter(function () {
                            var id = getBtnIdentifier($(this));
                            return id !== 'modss_online_button' && id !== 'showy_online_button';
                        }).first();

                        if (firstNonPriority.length) {
                            insertBefore = firstNonPriority;
                        }

                        if (btnId === 'showy_online_button') {
                            var modsBtn = targetContainer.find('.full-start__button').filter(function () {
                                return getBtnIdentifier($(this)) === 'modss_online_button';
                            });
                            if (modsBtn.length) {
                                insertBefore = modsBtn.next();
                                if (!insertBefore.length || insertBefore.hasClass('button--edit-order')) {
                                    insertBefore = null;
                                }
                            }
                        }
                    } else {
                        targetContainer.find('.full-start__button').not('.button--edit-order, .button--folder').each(function () {
                            var existingBtn = $(this);
                            var existingId = getBtnIdentifier(existingBtn);

                            if (existingId === 'modss_online_button' || existingId === 'showy_online_button') {
                                return true;
                            }

                            var existingType = detectBtnCategory(existingBtn);
                            var existingTypeIndex = typeOrder.indexOf(existingType);
                            if (existingTypeIndex === -1) existingTypeIndex = 999;

                            if (btnTypeIndex < existingTypeIndex) {
                                insertBefore = existingBtn;
                                return false;
                            }
                        });
                    }

                    if (insertBefore && insertBefore.length) {
                        btn.insertBefore(insertBefore);
                    } else {
                        targetContainer.append(btn);
                    }
                    visibleButtons.push(btn);
                }
            });

            folders.forEach(function (folder) {
                if (addedFolders.indexOf(folder.id) === -1) {
                    var folderBtn = createFolderButton(folder);
                    targetContainer.append(folderBtn);
                    visibleButtons.push(folderBtn);
                }
            });
        } else {
            folders.forEach(function (folder) {
                var folderBtn = createFolderButton(folder);
                targetContainer.append(folderBtn);
                visibleButtons.push(folderBtn);
            });

            filteredButtons.forEach(function (btn) {
                if (!btn.hasClass('hidden')) {
                    targetContainer.append(btn);
                    visibleButtons.push(btn);
                }
            });
        }

        if (bmNativePlay.length) targetContainer.prepend(bmNativePlay);
        var editButton = buildEditorBtn();
        targetContainer.append(editButton);
        visibleButtons.push(editButton);

        if(isFreshRender)animateBtnFadeIn(visibleButtons);
        else visibleButtons.forEach(function(b){b.css({opacity:'',animation:'','animation-delay':''})});

        setTimeout(function () {
            setupButtonNavigation(container);
        }, 100);

        return true;
    }

    function setupButtonNavigation(container) {
        // Lampa builds Navigator's selector collection BEFORE this plugin's 400 ms
        // rebuild. Simply toggling the already-active full_start does nothing:
        // D-pad cannot reach Torrent/JacRed proxies without a new collection.
        if (!container || !container.length || !Lampa.Controller ||
            !Lampa.Controller.enabled || Lampa.Controller.enabled().name !== 'full_start') return;
        var c = Lampa.Controller;
        if (typeof c.collectionSet !== 'function' || typeof c.collectionFocus !== 'function') return;
        var strip = container.find('.full-start-new__buttons').first();
        if (!strip.length) return;
        // Guard the native source menu and never allow 'Watch' to steal D-pad focus.
        strip.children('.button--play').removeClass('selector focus').addClass('buttons-ng-native-play');
        var active = (window.Navigator && window.Navigator._focus) || null;
        var focused = strip.children('.full-start__button.focus').first();
        var candidate = focused.length ? focused[0] : active;
        if (candidate && !container[0].contains(candidate)) {
            var previousId = $(candidate).data('buttons-ng-id');
            candidate = null;
            if (previousId) strip.children('.full-start__button').each(function(){
                if (!candidate && $(this).data('buttons-ng-id') === previousId &&
                    !$(this).hasClass('hidden') && !$(this).hasClass('buttons-ng-native-play')) candidate=this;
            });
        }
        if (!candidate || !container[0].contains(candidate) ||
            $(candidate).hasClass('buttons-ng-native-play') ||
            $(candidate).hasClass('hide') || $(candidate).hasClass('hidden'))
            candidate = strip.children('.full-start__button.selector').not('.hide,.hidden').first()[0];
        try {
            c.collectionSet(container);
            if (candidate) c.collectionFocus(candidate,container);
            // The core Start component only binds hover:focus before dynamic buttons
            // exist. Update its last pointer for return navigation with the remote.
            var control=c.enabled().controller;
            if (control && control.link && candidate) control.link.last=candidate;
        } catch(e) { console.warn('Buttons NextGen: TV focus registration',e); }
    }

    function refreshController() {
        if(currentContainer)setupButtonNavigation(currentContainer);
    }

    function init() {
        if(typeof Lampa.Storage.sync==='function')try{Lampa.Storage.sync(bmCloudKey,'object_object')}catch(e){}
        bmActivate();
        if(Lampa.Storage.listener&&Lampa.Storage.listener.follow)Lampa.Storage.listener.follow('change',function(e){if(e.name==='account'&&bmActivate()&&currentContainer)reorderButtons(currentContainer,false)});
        Lampa.Listener.follow('profile_select',function(){if(bmActivate()&&currentContainer)reorderButtons(currentContainer,false)});
        Lampa.Listener.follow('worker_storage',function(e){if(e&&e.name===bmCloudKey){bmCloudPull();setTimeout(bmOfferLocalCloud,150)}});
        // Use real flex item width on TV/desktop. The label is INSIDE the button,
        // so wrapping automatically moves subsequent buttons instead of covering them.
        // No hover positioning, absolute labels, or width animation (which would
        // repeatedly alter D-pad navigation geometry while moving focus).
        // Mouse hover needs a stable selection despite flex-wrap reflow.
        // Only genuine pointer movement switches the expanded control.
        // Layout-triggered mouseenter/mouseleave won't cause focus oscillation.
        var bmMouseX=null,bmMouseY=null;
        if(typeof document!=='undefined')$(document).on('mousemove.buttonsNgPointer',function(e){
            if(!window.innerWidth||window.innerWidth<768)return;
            if(bmMouseX===e.clientX&&bmMouseY===e.clientY)return;
            bmMouseX=e.clientX;bmMouseY=e.clientY;
            var target=$(e.target).closest('.full-start-new__buttons > .full-start__button.button-mode-1');
            var expanded=$('.full-start-new__buttons .buttons-ng-hovered');
            if(target.length&&expanded.length&&expanded[0]===target[0])return;
            expanded.removeClass('buttons-ng-hovered');
            $('.full-start-new__buttons.buttons-ng-mouse-active').removeClass('buttons-ng-mouse-active');
            if(target.length&&!target.hasClass('hidden')){
                target.addClass('buttons-ng-hovered');
                target.parent().addClass('buttons-ng-mouse-active');
            }
        });
        var style = $('<style>' +
            '@keyframes button-fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }' +
            '.full-start-new__buttons .full-start__button { box-sizing:border-box; position:relative; flex-shrink:0; }' +
            '.full-start-new__buttons > .button--play.buttons-ng-native-play { display:none !important; }' +
            '.full-start__button.hidden { display: none !important; }' +
            '.button--folder { cursor: pointer; }' +
            '.full-start-new__buttons { ' +
            'display: flex !important; ' +
            'flex-direction: row !important; ' +
            'flex-wrap: wrap !important; ' +
            'gap: 0.5em !important; ' +
            '}' +
            '.full-start-new__buttons.buttons-loading .full-start__button { visibility: hidden !important; }' +
            '.menu-edit-list__create-folder { background: rgba(100,200,100,0.2); }' +
            '.menu-edit-list__create-folder.focus { background: rgba(100,200,100,0.3); border: 3px solid rgba(255,255,255,0.8); }' +
            '.menu-edit-list__delete { width: 2.4em; height: 2.4em; display: flex; align-items: center; justify-content: center; cursor: pointer; }' +
            '.menu-edit-list__delete svg { width: 1.2em !important; height: 1.2em !important; }' +
            '.menu-edit-list__delete.focus { border: 2px solid rgba(255,255,255,0.8); border-radius: 0.3em; }' +
            '.folder-item .menu-edit-list__move { margin-right: 0; }' +
            '.folder-create-confirm { background: rgba(100,200,100,0.3); margin-top: 1em; border-radius: 0.3em; }' +
            '.folder-create-confirm.focus { border: 3px solid rgba(255,255,255,0.8); }' +
            '.folder-reset-button { background: rgba(200,100,100,0.3); margin-top: 1em; border-radius: 0.3em; }' +
            '.folder-reset-button.focus { border: 3px solid rgba(255,255,255,0.8); }' +
            '.menu-edit-list__move { width: 2.4em; height: 2.4em; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-right: 0.5em; }' +
            '.menu-edit-list__move svg { width: 1.2em !important; height: 1.2em !important; }' +
            '.menu-edit-list__move.focus { border: 2px solid rgba(255,255,255,0.8); border-radius: 0.3em; }' +
            '.menu-edit-list__toggle { width: 2.4em; height: 2.4em; display: flex; align-items: center; justify-content: center; cursor: pointer; }' +
            '.menu-edit-list__toggle svg { width: 1.2em !important; height: 1.2em !important; }' +
            '.menu-edit-list__toggle.focus { border: 2px solid rgba(255,255,255,0.8); border-radius: 0.3em; }' +
            '.menu-edit-list__display-mode { width: 2.4em; height: 2.4em; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-right: 0.5em; }' +
            '.menu-edit-list__display-mode svg { width: 1.2em !important; height: 1.2em !important; }' +
            '.menu-edit-list__display-mode.focus { border: 2px solid rgba(255,255,255,0.8); border-radius: 0.3em; background: rgba(255,255,255,0.9); }' +
            '.menu-edit-list__display-mode.focus svg { color: #000 !important; }' +
            '.menu-edit-list__display-mode.focus rect { stroke: #000 !important; }' +
            '.menu-edit-list__display-mode.focus text { fill: #000 !important; }' +
            '.menu-edit-list__header { display: flex; align-items: center; padding: 0.5em 1em; margin-bottom: 0.5em; opacity: 0.6; font-size: 0.85em; }' +
            '.menu-edit-list__header-spacer { flex: 1; }' +
            '.menu-edit-list__header-move { width: 5.3em; text-align: center; margin-right: 0.5em; }' +
            '.menu-edit-list__header-mode { width: 2.9em; text-align: center; }' +
            '.menu-edit-list__header-toggle { width: 2.4em; text-align: center; margin-left: 0.5em; }' +
            '.menu-edit-list__create-folder { margin-bottom: 1em; }' +
            '.menu-edit-list__item { display: flex; align-items: center; position: relative; }' +
            '.menu-edit-list__item .menu-edit-list__icon { flex-shrink: 0; }' +
            '.menu-edit-list__item .menu-edit-list__title { flex: 1; min-width: 0; }' +
            '.menu-edit-list__item .menu-edit-list__move, .menu-edit-list__item .menu-edit-list__display-mode, .menu-edit-list__item .menu-edit-list__toggle { flex-shrink: 0; }' +
            '.menu-edit-list__item.item-hidden { opacity: 0.4; }' +
            '.menu-edit-list__item.item-hidden .menu-edit-list__title { opacity: 0.6; }' +
            '.menu-edit-list__item.item-hidden .menu-edit-list__icon { opacity: 0.5; }' +
            '' +
            '/* Mode 1: normal flex reflow on TV/desktop; no overlaid label. */' +
            '.full-start-new__buttons .full-start__button.button-mode-1 { max-width:100%; min-width:0; box-sizing:border-box; }' +
            '.full-start-new__buttons .full-start__button.button-mode-1 > span { display:none !important; }' +
            '@media screen and (min-width:768px) {' +
            '.full-start-new__buttons .full-start__button.button-mode-1.focus, .full-start-new__buttons .full-start__button.button-mode-1:hover { flex-shrink:0; max-width:100%; }' +
            '.full-start-new__buttons .full-start__button.button-mode-1.focus > span, .full-start-new__buttons .full-start__button.button-mode-1.buttons-ng-hovered > span { display:inline-block !important; position:static !important; top:auto !important; bottom:auto !important; left:auto !important; right:auto !important; flex:0 1 auto; min-width:0; width:auto !important; max-width:100%; height:auto !important; padding:0 !important; margin:0 0 0 .4em !important; background:transparent !important; border:0 !important; color:inherit !important; border-radius:0 !important; white-space:normal !important; overflow-wrap:anywhere; overflow:visible !important; text-overflow:clip !important; opacity:1 !important; visibility:visible !important; transform:none !important; transition:opacity .16s ease; pointer-events:none; }' +
            '.full-start-new__buttons .full-start__button.button-mode-1.focus .text-wrapper, .full-start-new__buttons .full-start__button.button-mode-1.buttons-ng-hovered .text-wrapper { display:inline-block !important; position:static !important; opacity:1 !important; visibility:visible !important; }' +
            '/* TV D-pad focus wins even if the browser previously reported a mouse movement. */' +
            '}' +
            '@media screen and (max-width:767px) {' +
            '.full-start-new__buttons .full-start__button.button-mode-1 > span, .full-start-new__buttons .full-start__button.button-mode-1 .text-wrapper { display:none !important; }' +
            '}' +
            '' +
            '/* Режим 2: Только иконка (текст всегда скрыт) */' +
            '.full-start__button.button-mode-2 > span { display: none !important; }' +
            '' +
            '/* Режим 3: Иконка + текст всегда */' +
            '.full-start__button.button-mode-3 > span { position:static !important; display:inline !important; visibility:visible !important; opacity:1 !important; }' +
            '</style>');
        $('body').append(style);

        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;
            bmActivate();

            var container = e.object.activity.render();
            bmObserveSources(container);
            var targetContainer = container.find('.full-start-new__buttons');
            if (targetContainer.length) {
                targetContainer.addClass('buttons-loading');
            }

            setTimeout(function () {
                try {
                    if (!container.data('buttons-processed')) {
                        container.data('buttons-processed', true);
                        if (reorderButtons(container, true)) {
                            if (targetContainer.length) {
                                targetContainer.removeClass('buttons-loading');
                            }
                            refreshController();
                        }
                    }
                } catch (err) {
                    if (targetContainer.length) {
                        targetContainer.removeClass('buttons-loading');
                    }
                }
            }, 400);
        });
    }

    // Добавляем настройку в раздел "Интерфейс"
    if (Lampa.SettingsApi) {
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: {
                name: 'buttons_editor_enabled',
                type: 'trigger',
                default: true
            },
            field: {
                name: getTranslation('buttons_plugin_button_editor')
            },
            onChange: function (value) {
                setTimeout(function () {
                    var currentValue = Lampa.Storage.get('buttons_editor_enabled', true);
                    if (currentValue) {
                        $('.button--edit-order').show();
                        Lampa.Noty.show(getTranslation('buttons_plugin_button_editor_enabled'));
                    } else {
                        $('.button--edit-order').hide();
                        Lampa.Noty.show(getTranslation('buttons_plugin_button_editor_disabled'));
                    }
                }, 100);
                setTimeout(bmSave, 120);
            },
            onRender: function (element) {
                setTimeout(function () {
                    // Вставляем после "Показать реакции" в разделе "Карточка"
                    var reactionsParam = $('div[data-name="card_interfice_reactions"]');
                    if (reactionsParam.length) {
                        reactionsParam.after(element);
                    } else {
                        // Fallback: вставляем после "Размер интерфейса" как в buttons2
                        $('div[data-name="interface_size"]').after(element);
                    }
                }, 0);
            }
        });
    }

    init();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {};
    }
})();
