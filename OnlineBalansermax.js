"use strict";

function _typeof(e) {
    return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(e) {
        return typeof e;
    } : function(e) {
        return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
    }, _typeof(e);
}! function() {
    function e(e, t) {
        var n = Object.keys(e);
        if (Object.getOwnPropertySymbols) {
            var i = Object.getOwnPropertySymbols(e);
            t && (i = i.filter(function(t) {
                return Object.getOwnPropertyDescriptor(e, t).enumerable;
            })), n.push.apply(n, i);
        }
        return n;
    }

    function t(e, t) {
        if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function");
    }

    function n(e, t) {
        for (var n = 0; n < t.length; n++) {
            var i = t[n];
            i.enumerable = i.enumerable || false, i.configurable = true, "value" in i && (i.writable = true), Object.defineProperty(e, i.key, i);
        }
    }
    var o = function() {
        function e(n) {
            t(this, e), this.hash = Lampa.Utils.hash(n.movie.original_title), this.field = "online_selected_voice";
        }
        return [{
            key: "get",
            value: function() {
                return Lampa.Storage.get(this.field, "{}")[this.hash] || "";
            }
        }, {
            key: "set",
            value: function(e) {
                var t = Lampa.Storage.get(this.field, "{}");
                t[this.hash] = e, Lampa.Storage.set(this.field, t);
            }
        }] && n(e.prototype, [{
            key: "get",
            value: function() {
                return Lampa.Storage.get(this.field, "{}")[this.hash] || "";
            }
        }, {
            key: "set",
            value: function(e) {
                var t = Lampa.Storage.get(this.field, "{}");
                t[this.hash] = e, Lampa.Storage.set(this.field, t);
            }
        }]), i && n(e, i), Object.defineProperty(e, "prototype", {
            writable: false
        }), e, e;
    }();

    function r(e) {
        this.data = {}, this.work = 0, this.need = e, this.complited = false, this.check = function() {
            this.stopped || this.work >= this.need && !this.complited && (this.complited = true, this.onComplite(this.data));
        }, this.next = function() {
            this.work++, this.check();
        }, this.append = function(e, t) {
            this.work++, this.data[e] = t, this.check();
        }, this.error = function() {
            this.work++, this.check();
        }, this.stop = function() {
            this.stopped = true;
        };
    }
    var l = {
            cache: {},
            pending: {},
            getCache: function() {
                return window.SEASON_FIX && window.SEASON_FIX.tvmaze_cache ? window.SEASON_FIX.tvmaze_cache : this.cache;
            },
            getSeasonsCount: function(e) {
                var t = this.getCache()[e];
                return t && "object" === _typeof(t) && Object.keys(t).length > 0 ? Object.keys(t).length : null;
            },
            fetch: function(e, t, n, i) {
                var a = this,
                    o = this.getCache();
                if (o[e] && "object" === _typeof(o[e])) i && (t && n(Object.keys(o[e]).length.prototype, t), i && n(Object.keys(o[e]).length, i), Object.defineProperty(Object.keys(o[e]).length, "prototype", {
                    writable: false
                }), Object.keys(o[e]).length);
                else if ("loading" === o[e] || this.pending[e]) i && (this.pending[e] || (this.pending[e] = []), this.pending[e].push(i));
                else {
                    o[e] = "loading", i && (this.pending[e] = [i]);
                    t || n ? this.fetchFromTvmaze(e, t, n) : this.fetchExternalIds(e, function(t) {
                        t && (t.imdb_id || t.tvdb_id) ? a.fetchFromTvmaze(e, t.imdb_id, t.tvdb_id) : a.finishPending(e, null);
                    });
                }
            },
            fetchExternalIds: function(e, t) {
                var n = Lampa.TMDB && Lampa.TMDB.key ? Lampa.TMDB.key() : null;
                if (n) {
                    var i = Lampa.TMDB && Lampa.TMDB.api ? Lampa.TMDB.api("tv/" + e + "/external_ids?api_key=" + n) : "https://api.themoviedb.org/3/tv/" + e + "/external_ids?api_key=" + n;
                    this.request(i, t);
                } else t(null);
            },
            fetchFromTvmaze: function(e, t, n) {
                var i = this,
                    a = t || n;
                if (a) {
                    var o = "https://api.tvmaze.com/lookup/shows?" + (t ? "imdb" : "thetvdb") + "=" + a;
                    this.request(o, function(t) {
                        if (t && t.id) {
                            var n = "https://api.tvmaze.com/shows/" + t.id + "/episodes";
                            i.request(n, function(t) {
                                if (t && t.length) {
                                    for (var n = {}, a = 0; a < t.length; a++) {
                                        var o = t[a].season;
                                        n[o] || (n[o] = 0), n[o]++;
                                    }
                                    var r = i.getCache();
                                    Object.keys(n).length > 0 ? (r[e] = n, i.finishPending(e, Object.keys(n).length)) : (delete r[e], i.finishPending(e, null));
                                } else i.finishPending(e, null);
                            });
                        } else i.finishPending(e, null);
                    });
                } else this.finishPending(e, null);
            },
            finishPending: function(e, t) {
                var n = this.getCache();
                "loading" === n[e] && delete n[e];
                var i = this.pending[e];
                delete this.pending[e], i && i.length && i.forEach(function(e) {
                    e(t);
                });
            },
            request: function(e, t) {
                var n = new Lampa.Reguest;
                n.timeout(1e4);
                var i = function(e) {
                        t(e);
                    },
                    a = function() {
                        t(null);
                    }; -
                1 !== e.indexOf("themoviedb.org") || -1 !== e.indexOf("apitmdb.") ? n.silent(e, i, a) : n.native(e, i, a);
            }
        },
        s = ["Анастасия Гайдаржи + Андрей Юрченко", "Студии Суверенного Лепрозория", "IgVin &amp; Solncekleshka", "Студия Пиратского Дубляжа", "Gremlin Creative Studio", "Alternative Production", "Bubble Dubbing Company", "HelloMickey Production", "Н.Севастьянов seva1988", "XDUB Dorama + Колобок", "Мобильное телевидение", "СПД - Сладкая парочка", "BBC Saint-Petersburg", "Black Street Records", "Intra Communications", "Melodic Voice Studio", "Selena International", "Voice Project Studio", "Несмертельное оружие", "Петербургский дубляж", "Asian Miracle Group", "Lizard Cinema Trade", "National Geographic", "Studio Victory Аsia", "True Dubbing Studio", "Позитив-Мультимедиа", "Премьер Мультимедиа", "Уолт Дисней Компани", "Family Fan Edition", "Paramount Pictures", "Parovoz Production", "Shadow Dub Project", "The Kitchen Russia", "Zone Vision Studio", "Анастасия Гайдаржи", "Иванова и П. Пашут", "Малиновский Сергей", "Так Треба Продакшн", "Back Board Cinema", "Paramount Channel", "Project Web Mania", "RedDiamond Studio", "Universal Channel", "Zoomvision Studio", "НеЗупиняйПродакшн", "Селена Интернешнл", "Студия «Стартрек»", "Хихикающий доктор", "Четыре в квадрате", "Brain Production", "Cowabunga Studio", "Lucky Production", "MC Entertainment", "Paramount Comedy", "Universal Russia", "Анатолий Ашмарин", "Андрей Питерский", "Васька Куролесов", "Екатеринбург Арт", "Квадрат Малевича", "Первый канал ОРТ", "Реальный перевод", "Русский Репортаж", "Сolumbia Service", "Amazing Dubbing", "AnimeSpace Team", "Cartoon Network", "Cinema Prestige", "CinemaSET GROUP", "DeadLine Studio", "DeeAFilm Studio", "GreenРай Studio", "New Dream Media", "Sunshine Studio", "Volume-6 Studio", "XvidClub Studio", "Антонов Николай", "Воробьев Сергей", "Денис Шадинский", "З Ранку До Ночі", "Максим Логинофф", "Николай Дроздов", "Студия Горького", "Студийная банда", "Ульпаней Эльром", "Agatha Studdio", "Anything-group", "CrazyCatStudio", "Creative Sound", "DIVA Universal", "Garsu Pasaulis", "GoodTime Media", "Goodtime Media", "Hamster Studio", "Horizon Studio", "Jakob Bellmann", "Julia Prosenuk", "KosharaSerials", "Kulzvuk Studio", "Mallorn Studio", "Red Head Sound", "RedRussian1337", "SovetRomantica", "SunshineStudio", "Syfy Universal", "TUMBLER Studio", "Viasat History", "visanti-vasaer", "Анатолий Гусев", "Вартан Дохалов", "Витя «говорун»", "Кирдин | Stalk", "Л. Володарский", "Леша Прапорщик", "Максим Жолобов", "Медиа-Комплекс", "Прайд Продакшн", "Русский дубляж", "Союзмультфильм", "Студия Колобок", "5-й канал СПб", "ARRU Workshop", "Arasi project", "Banyan Studio", "Bars MacAdams", "Bonsai Studio", "Byako Records", "Dream Records", "FiliZa Studio", "Filiza Studio", "Film Prestige", "Flarrow Films", "Gezell Studio", "Greb&Creative", "HamsterStudio", "Jetvis Studio", "LE-Production", "Lizard Cinema", "Nazel & Freya", "PCB Translate", "Rainbow World", "Renegade Team", "SHIZA Project", "Sci-Fi Russia", "Amanogawa", "The Mike Rec.", "VIP Serial HD", "VO-Production", "VO-production", "Victory-Films", "ViruseProject", "Voice Project", "Vulpes Vulpes", "АРК-ТВ Studio", "Видеопродакшн", "Мадлен Дюваль", "Мика Бондарик", "Наталья Гурзо", "Премьер Видео", "Семыкина Юлия", "Старый Бильбо", "Трамвай-фильм", "Фортуна-Фильм", "Хоррор Мэйкер", "Храм Дорам ТВ", "Штамп Дмитрий", "A. Lazarchuk", "AlphaProject", "AniLibria.TV", "AnimeReactor", "Animereactor", "BadCatStudio", "DreamRecords", "General Film", "HaseRiLLoPaW", "Horror Maker", "Ivnet Cinema", "Korean Craze", "Light Breeze", "Mystery Film", "Oneinchnales", "Profix Media", "Psychotronic", "RG Paravozik", "RG.Paravozik", "RussianGuy27", "Sony Channel", "Train Studio", "Trdlo.studio", "ViP Premiere", "VictoryFilms", "VulpesVulpes", "Wayland team", "sweet couple", "Альтера Парс", "Видеоимпульс", "Гей Кино Гид", "Говинда Рага", "Деваль Видео", "Е. Хрусталёв", "К. Поздняков", "Кармен Видео", "Кинопремьера", "Кирилл Сагач", "КонтентикOFF", "Кубик в Кубе", "Кураж-Бамбей", "Мьюзик-трейд", "Н. Золотухин", "Не требуется", "Новый Дубляж", "Нурмухаметов", "Оригинальный", "Первый канал", "Р. Янкелевич", "С. Кузьмичёв", "С. Щегольков", "Сергей Дидок", "Синема Трейд", "Синта Рурони", "Студия Райдо", "Тоникс Медиа", "Точка Zрения", "Фильмэкспорт", "Элегия фильм", "1001 cinema", "BTI Studios", "Cactus Team", "CrezaStudio", "Crunchyroll", "DVD Classic", "Description", "Eurochannel", "FocusStudio", "Franek Monk", "Gala Voices", "Gears Media", "GladiolusTV", "Gold Cinema", "Good People", "HiWay Grope", "Inter Video", "JWA Project", "Lazer Video", "Max Nabokov", "NEON Studio", "Neoclassica", "New Records", "Nickelodeon", "Nika Lenina", "Oghra-Brown", "Paul Bunyan", "Rebel Voice", "RecentFilms", "RiZZ_fisher", "Saint Sound", "SakuraNight", "SnowRecords", "Sony Sci-Fi", "Sound-Group", "StudioFilms", "TF-AniGroup", "TrainStudio", "XDUB Dorama", "Zone Studio", "Zone Vision", "hungry_inri", "Варус Видео", "Варус-Видео", "Видеосервис", "Володарский", "Г. Либергал", "Г. Румянцев", "Другое кино", "Е. Гаевский", "Завгородний", "И. Сафронов", "И. Степанов", "Кенс Матвей", "КураСгречей", "Лазер Видео", "Малиновский", "Мастер Тэйп", "Неоклассика", "Новый Канал", "Огородников", "Петербуржец", "Прямостанов", "С. Визгунов", "С. Кузнецов", "Севастьянов", "Студия Трёх", "Цікава Ідея", "Эй Би Видео", "Я. Беллманн", "1001cinema", "1WinStudio", "AXN Sci-Fi", "AimaksaLTV", "Animegroup", "ApofysTeam", "AvePremier", "BraveSound", "CP Digital", "CactusTeam", "CinemaTone", "Contentica", "CoralMedia", "DniproFilm", "ELEKTRI4KA", "East Dream", "Fox Russia", "HiWayGrope", "LevshaFilm", "MaxMeister", "Mega-Anime", "MifSnaiper", "NewStation", "Nice-Media", "Pazl Voice", "PiratVoice", "Postmodern", "Rain Death", "Reanimedia", "Shachiburi", "SilverSnow", "Sky Voices", "SkyeFilmTV", "Sony Turbo", "Sound Film", "StudioBand", "TatamiFilm", "VGM Studio", "VSI Moscow", "VoicePower", "West Video", "W³: voices", "eraserhead", "Б. Федоров", "Бусов Глеб", "Ващенко С.", "Глуховский", "Держиморда", "Е. Гранкин", "И. Еремеев", "Интерфильм", "Инфо-фильм", "К. Филонов", "Карповский", "Комедия ТВ", "Костюкевич", "Мост Видео", "Мост-Видео", "Н. Антонов", "Н. Дроздов", "Новый диск", "Ох! Студия", "Первый ТВЧ", "Переводман", "С. Казаков", "С. Лебедев", "С. Макашов", "Саня Белый", "Союз Видео", "Студия NLS", "Т.О Друзей", "ТВ XXI век", "Толстобров", "Хуан Рохас", "Электричка", "Ю. Немахов", "диктор CDV", "3df voice", "AAA-Sound", "Andre1288", "AniLibria", "AniPLague", "Astana TV", "AveBrasil", "AveDorama", "BeniAffet", "CBS Drama", "CLS Media", "CasStudio", "Discovery", "DoubleRec", "Epic Team", "FanStudio", "FilmsClub", "Flux-Team", "Fox Crime", "GREEN TEA", "Ghostface", "GoodVideo", "Gramalant", "HighHopes", "INTERFILM", "JoyStudio", "KinoGolos", "Kinomania", "Kobayashi", "LakeFilms", "Neo-Sound", "NewComers", "NewStudio", "No-Future", "Novamedia", "OnisFilms", "Persona99", "RATTLEBOX", "RainDeath", "Red Media", "SDI Media", "SOLDLUCK2", "Sawyer888", "Sedorelli", "Seoul Bay", "Sephiroth", "ShinkaDan", "SmallFilm", "SpaceDust", "Timecraft", "Total DVD", "VIZ Media", "Video-BIZ", "Videogram", "fiendover", "turok1990", "ААА-sound", "Амальгама", "АрхиТеатр", "Васильцев", "Весельчак", "Видеобаза", "Воротилин", "Григорьев", "Деньщиков", "ЕА Синема", "Зереницын", "Золотухин", "И. Клушин", "Имидж-Арт", "Карапетян", "Киномания", "Кириллица", "Машинский", "Мительман", "Муравский", "Невафильм", "Останкино", "Причудики", "Рыжий пес", "С. Дьяков", "СВ Студия", "СВ-Студия", "Самарский", "Синема УС", "Советский", "Солодухин", "ТО Друзей", "Формат AB", "Хрусталев", "Шадинский", "Ю. Сербин", "Ю. Товбин", "Янкелевич", "AB-Video", "ALEKS KV", "ANIvoice", "AdiSound", "AlexFilm", "Amalgama", "AniMaunt", "AniMedia", "Animedub", "AuraFilm", "AzOnFilm", "Barin101", "ClubFATE", "ColdFilm", "DeadLine", "DexterTV", "Extrabit", "FilmGate", "Fox Life", "Foxlight", "GetSmart", "GoldTeam", "GostFilm", "Gravi-TV", "Hallmark", "IdeaFilm", "ImageArt", "JeFerSon", "Jimmy J.", "Kerems13", "KinoView", "Loginoff", "LostFilm", "MOYGOLOS", "Marclail", "Milirina", "MiraiDub", "Murzilka", "NovaFilm", "OMSKBIRD", "Omskbird", "Radamant", "RealFake", "RoxMarty", "STEPonee", "SorzTeam", "Superbit", "TurkStar", "Ultradox", "VashMax2", "VendettA", "VideoBIZ", "WestFilm", "XL Media", "kubik&ko", "metalrus", "st.Elrom", "Алексеев", "Артемьев", "АрхиАзия", "Бахурани", "Бессонов", "Васильев", "Визгунов", "Войсовер", "Воронцов", "Гаврилов", "Гаевский", "Горчаков", "Дольский", "Домашний", "Дубровин", "Дьяконов", "Е. Лурье", "Е. Рудой", "Журавлев", "Заугаров", "Индия ТВ", "Ист-Вест", "Карусель", "Кинолюкс", "Кузнецов", "ЛанселаП", "Лексикон", "Ленфильм", "Либергал", "Логинофф", "Марченко", "Махонько", "Медведев", "Мельница", "Мосфильм", "Нарышкин", "Оверлорд", "Оригинал", "Пирамида", "С. Рябов", "СВ-Дубль", "Савченко", "Субтитры", "Супербит", "Тимофеев", "Толмачев", "Хлопушка", "Ю. Живов", "5 канал", "Amalgam", "AniFilm", "AniStar", "AniWayt", "Anifilm", "Anistar", "AnyFilm", "AveTurk", "BadBajo", "BaibaKo", "BukeDub", "DeadSno", "ELYSIUM", "Eladiel", "Elysium", "F-TRAIN", "FireDub", "FoxLife", "HDrezka", "Hamster", "Janetta", "Jaskier", "Kолобок", "LeDoyen", "Levelin", "Liga HQ", "Lord32x", "MUZOBOZ", "Macross", "McElroy", "MixFilm", "NemFilm", "Netflix", "Octopus", "Onibaku", "OpenDub", "Paradox", "PashaUp", "RUSCICO", "RusFilm", "SOFTBOX", "Sam2007", "SesDizi", "ShowJet", "SoftBox", "SomeWax", "TV 1000", "TVShows", "To4kaTV", "Trina_D", "Twister", "Urasiko", "VicTeam", "Wakanim", "ZM-SHOW", "ZM-Show", "datynet", "lord666", "sf@irat", "Абдулов", "Багичев", "Бибиков", "Ващенко", "Герусов", "Данилов", "Дасевич", "Дохалов", "Кипарис", "Клюквин", "Колобок", "Королев", "Королёв", "Латышев", "Люсьена", "Матвеев", "Михалев", "Морозов", "Назаров", "Немахов", "Никитин", "Омикрон", "Ошурков", "Парадиз", "Пепелац", "Пифагор", "Позитив", "Пятница", "РуФилмс", "Рутилов", "СВ-Кадр", "Синхрон", "Смирнов", "Сокуров", "Сонотек", "Сонькин", "Сыендук", "Филонов", "Хихидок", "Яковлев", "Яроцкий", "заКАДРЫ", "100 ТВ", "4u2ges", "Alezan", "Amedia", "Ancord", "AniDUB", "Anubis", "Azazel", "BD CEE", "Berial", "Boльгa", "Cuba77", "D.I.M.", "DubLik", "Dubляж", "Elegia", "Emslie", "FocusX", "GalVid", "Gemini", "Jetvis", "JimmyJ", "KANSAI", "KOleso", "Kansai", "Kiitos", "L0cDoG", "LeXiKC", "Lisitz", "Mikail", "Milvus", "MrRose", "Nastia", "NewDub", "OSLIKt", "Ozz TV", "Ozz.tv", "Prolix", "RedDog", "Rumble", "SNK-TV", "Satkur", "Selena", "Shaman", "Stevie", "Suzaku", "TV1000", "Tycoon", "UAFlix", "WVoice", "WiaDUB", "ZEE TV", "Zendos", "Zerzia", "binjak", "den904", "kiitos", "madrid", "neko64", "АБыГДе", "Агапов", "Акалит", "Акопян", "Акцент", "Альянс", "Анубис", "Арк-ТВ", "Бойков", "Векшин", "Вихров", "Вольга", "Гоблин", "Готлиб", "Гризли", "Гундос", "Гуртом", "ДиоНиК", "Дьяков", "Есарев", "Живаго", "Жучков", "Зебуро", "Иванов", "Карцев", "Кашкин", "Килька", "Киреев", "Козлов", "Кондор", "Котова", "Кошкин", "Кравец", "Курдов", "Лагута", "Лапшин", "Лизард", "Миняев", "Мудров", "Н-Кино", "НЕВА 1", "НЛО-TV", "Набиев", "Нева-1", "Пронин", "Пучков", "Ракурс", "Россия", "С.Р.И.", "Санаев", "Светла", "Сербин", "Стасюк", "Строев", "ТВ СПб", "Товбин", "Шварко", "Швецов", "Шуваев", "Amber", "AniUA", "Anika", "Arisu", "Cmert", "D2Lab", "D2lab", "DeMon", "Elrom", "IНТЕР", "JetiX", "Jetix", "Kerob", "Lupin", "Ozeon", "PaDet", "RinGo", "Ryc99", "SHIZA", "Solod", "To4ka", "erogg", "ko136", "seqw0", "ssvss", "zamez", "Акира", "АнВад", "Белов", "Бигыч", "ВГТРК", "Велес", "Ворон", "Гланц", "Живов", "Игмар", "Интер", "Котов", "Лайко", "Мишин", "Новий", "Перец", "Попов", "Райдо", "РенТВ", "Рудой", "Рукин", "Рыбин", "Рябов", "С.Р.И", "ТВЧ 1", "Хабар", "Чадов", "Штамп", "Штейн", "Andy", "CPIG", "Dice", "ETV+", "Gits", "ICTV", "Jade", "KIHO", "Laci", "RAIM", "SGEV", "Tori", "Troy", "Twix", "Vano", "Voiz", "jept", "ИДДК", "Инис", "Ирэн", "Нота", "ТВ-3", "ТВИН", "Твин", "Чуев", "1+1", "2+2", "2x2", "2х2", "AMC", "AMS", "AOS", "CDV", "DDV", "FDV", "FOX", "ICG", "IVI", "JAM", "LDV", "MCA", "MGM", "MTV", "Oni", "QTV", "TB5", "V1R", "VHS", "АМС", "ГКГ", "ДТВ", "ИГМ", "КТК", "МИР", "НСТ", "НТВ", "НТН", "РТР", "СТС", "ТВ3", "ТВ6", "ТВЦ", "ТНТ", "ТРК", "Че!", "D1", "R5", "К9", "Закадровый", "Многоголосый"];
    s.sort(function(e, t) {
        return t.length - e.length;
    });
    var c = "online_servers",
        u = "online_active_server",
        d = "online_sources",
        m = "online_public_servers_cache",
        f = "online_bwa_code",
        p = "online_use_bwa",
        h = "rc.bwa.to",
        v = '<svg viewBox="0 0 172 169" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="160" height="157" rx="21" ry="21" fill="none" stroke="currentColor" stroke-width="12"/><path d="M97.1,33.4c.9-.8,1.7-1.7,2.6-2.5,1.9,3.3,3.8,6.6,5.6,9.9,0,0,.1.2,0,.2-.9.9-1.9,1.6-2.8,2.3-1.9,1.4-3.9,2.8-6,3.8-3.3,1.6-7,2.5-10.7,2.5-.9,0-1.8,0-2.7,0-2.7-.1-5.4-.6-8-1.6-3.9-1.4-7.4-3.9-10.5-6.7,1.9-3.3,3.7-6.6,5.6-9.8,1,1.1,2.1,2.1,3.2,3,1.7,1.4,3.5,2.6,5.5,3.4,2.3.9,4.8,1.3,7.3,1,2.7-.3,5.2-1.3,7.5-2.7,1.2-.8,2.3-1.7,3.3-2.6Z" fill="currentColor"/><path d="M52.8,58.6c5.6,0,11.3,0,16.9,0,1.4,2.4,2.9,4.7,4.4,7.1,1.6,2.5,3.2,5,4.8,7.4,1.5,2.3,3.1,4.7,4.7,6.9.4.6.8,1.1,1.3,1.6.1.1.3.3.5.1.5-.4.7-1,1.1-1.5,1.3-2.3,2.5-4.8,3.7-7.2,2-4.1,3.9-8.2,5.8-12.4.3-.7.7-1.4,1.1-2.1,5.6,0,11.2,0,16.8,0,0,.9-.4,1.6-.8,2.4-4.8,9.1-9.4,18.3-14.2,27.4-.8,1.5-1.6,3.1-2.5,4.6-.6,1.2-1,2.5-1,3.8,0,1.4.6,2.6,1.3,3.8.6.9,1.2,1.8,1.8,2.7,3.1,4.8,6.2,9.6,9.3,14.4,4.3,6.7,8.5,13.5,12.7,20.3-5.5,0-10.9,0-16.4,0-3.3-4.9-6.5-9.8-9.8-14.8-1.9-2.9-3.8-5.7-5.6-8.6-.4-.6-.7-1.3-1.3-1.7-.3-.2-.8-.3-1.1,0-.6.4-.9.9-1.2,1.5-2.6,4.7-5.1,9.4-8.3,13.6-1.6,2.1-3.3,4-5.4,5.6-2.1,1.7-4.5,3-7.1,3.7-3.1.9-6.4.9-9.5.3-1.1-.2-2.3-.4-3.2-1.2,0-3.8,0-7.6,0-11.4.4-.3.9-.4,1.4-.4,1,0,2,.3,3,.3.9,0,1.7,0,2.6-.3,2.2-.5,4.2-1.7,5.7-3.3,1-1,1.8-2,2.6-3.2,3.8-5.6,6.3-11.9,9.4-17.9.3-.5.6-1,.6-1.6.1-.8-.2-1.6-.6-2.3-7.4-11.7-14.7-23.4-22-35.1-.4-.6-1-1.2-1.3-1.9-.1-.2-.1-.5-.1-.8Z" fill="currentColor"/></svg>',
        g = [{
            id: "rhsprem",
            name: "rhsprem",
            enabled: true
        }, {
            id: "kinopub",
            name: "kinopub",
            enabled: true
        }, {
            id: "vokino",
            name: "vokino",
            enabled: true
        }, {
            id: "rc/filmix",
            name: "rc/filmix",
            enabled: true
        }, {
            id: "rc/fxapi",
            name: "rc/fxapi",
            enabled: true
        }, {
            id: "rc/rhs",
            name: "rc/rhs",
            enabled: true
        }, {
            id: "fxapi",
            name: "fxapi",
            enabled: true
        }, {
            id: "filmix",
            name: "filmix",
            enabled: false
        }, {
            id: "filmixtv",
            name: "filmixtv",
            enabled: false
        }, {
            id: "mirage",
            name: "mirage",
            enabled: false
        }, {
            id: "alloha",
            name: "alloha",
            enabled: false
        }, {
            id: "rezka",
            name: "rezka",
            enabled: false
        }, {
            id: "videocdn",
            name: "lumex",
            enabled: false
        }, {
            id: "videodb",
            name: "videodb",
            enabled: false
        }, {
            id: "collaps",
            name: "collaps",
            enabled: false
        }, {
            id: "collaps-dash",
            name: "collaps-dash",
            enabled: false
        }, {
            id: "hdvb",
            name: "hdvb",
            enabled: false
        }, {
            id: "zetflix",
            name: "zetflix",
            enabled: false
        }, {
            id: "kodik",
            name: "kodik",
            enabled: false
        }, {
            id: "ashdi",
            name: "ashdi",
            enabled: false
        }, {
            id: "kinoukr",
            name: "kinoukr",
            enabled: false
        }, {
            id: "kinotochka",
            name: "kinotochka",
            enabled: false
        }, {
            id: "remux",
            name: "remux",
            enabled: false
        }, {
            id: "iframevideo",
            name: "iframevideo",
            enabled: false
        }, {
            id: "cdnmovies",
            name: "cdnmovies",
            enabled: false
        }, {
            id: "anilibria",
            name: "anilibria",
            enabled: false
        }, {
            id: "animedia",
            name: "animedia",
            enabled: false
        }, {
            id: "animego",
            name: "animego",
            enabled: false
        }, {
            id: "animevost",
            name: "animevost",
            enabled: false
        }, {
            id: "animebesst",
            name: "animebesst",
            enabled: false
        }, {
            id: "redheadsound",
            name: "redheadsound",
            enabled: false
        }, {
            id: "animelib",
            name: "animelib",
            enabled: false
        }, {
            id: "moonanime",
            name: "moonanime",
            enabled: false
        }, {
            id: "vibix",
            name: "vibix",
            enabled: false
        }, {
            id: "vdbmovies",
            name: "vdbmovies",
            enabled: false
        }, {
            id: "fancdn",
            name: "fancdn",
            enabled: false
        }, {
            id: "cdnvideohub",
            name: "cdnvideohub",
            enabled: false
        }, {
            id: "vcdn",
            name: "vcdn",
            enabled: false
        }, {
            id: "hydraflix",
            name: "hydraflix",
            enabled: false
        }, {
            id: "videasy",
            name: "videasy",
            enabled: false
        }, {
            id: "vidsrc",
            name: "vidsrc",
            enabled: false
        }, {
            id: "movpi",
            name: "movpi",
            enabled: false
        }, {
            id: "vidlink",
            name: "vidlink",
            enabled: false
        }, {
            id: "twoembed",
            name: "twoembed",
            enabled: false
        }, {
            id: "autoembed",
            name: "autoembed",
            enabled: false
        }, {
            id: "smashystream",
            name: "smashystream",
            enabled: false
        }, {
            id: "rgshows",
            name: "rgshows",
            enabled: false
        }, {
            id: "pidtor",
            name: "pidtor",
            enabled: false
        }, {
            id: "videoseed",
            name: "videoseed",
            enabled: false
        }, {
            id: "iptvonline",
            name: "iptvonline",
            enabled: false
        }, {
            id: "veoveo",
            name: "veoveo",
            enabled: false
        }];

    function y() {
        return g.filter(function(e) {
            return e.enabled;
        }).map(function(e) {
            return e.id;
        });
    }

    function b() {
        var e = Lampa.Storage.get(c, []);
        if ("string" == typeof e) try {
            e = JSON.parse(e);
        } catch (t) {
            e = [];
        }
        return Lampa.Arrays.isArray(e) || (e = []), e;
    }

    function L() {
        var e = b(),
            t = parseInt(Lampa.Storage.get(u, 0)) || 0;
        return t >= e.length && (t = 0), t;
    }

    function _(e) {
        Lampa.Storage.set(u, e);
    }

    function w(e) {
        if (!e) return false;
        var t = b();
        return -1 === t.indexOf(e) && (t.push(e), Lampa.Storage.set(c, t), true);
    }

    function S(e) {
        var t = b();
        return e >= 0 && e < t.length && (t.splice(e, 1), Lampa.Storage.set(c, t), L() >= t.length && _(Math.max(0, t.length - 1)), true);
    }

    function k() {
        var e = b();
        if (0 === e.length) return "";
        var t = e[L()] || "";
        return t && 0 !== (t = t.replace(/\/+$/, "")).indexOf("http://") && 0 !== t.indexOf("https://") && (t = "http://" + t), t;
    }

    function x() {
        var e = Lampa.Storage.get(d, []);
        if ("string" == typeof e) try {
            e = JSON.parse(e);
        } catch (t) {
            e = [];
        }
        return Lampa.Arrays.isArray(e) && 0 !== e.length || (e = y()), e;
    }

    function T(e) {
        Lampa.Storage.set(p, e);
    }
    var O = {
        lampa: "Lampa.",
        get stream() {
            if (Lampa.Storage.get(p, false)) return h;
            var e = k();
            return e ? e.replace(/^https?:\/\//, "") : "";
        },
        get sources() {
            return x();
        },
        nolite: [],
        filter_ts: ["ts", "тс", "tс", "тc", "чистый звук"],
        filter_hr: ["HDR10", "HEVC"],
        filter_db: ["Дубляж", "Дублированный", "Red Head Sound", "Мосфильм", "Dubляж"],
        filter_tv: [],
        filter_uk: ["uk", "ukr", "укр"],
        filter_du: ["Дубляж", "Дублированный", "Полное дублирование"],
        rename_translate: {
            HDRezka: ["HDrezka Studio", "RezkaStudio", "Rezka Studio", "Rezka"],
            StudioBand: ["Студийная Банда", "StudioBand", "Studio Band"],
            Дубляж: ["Дубляж", "Дублированный", "Полное дублирование"],
            Оригинал: ["Не требуется", "Оригинальный"],
            Закадровый: ["Многоголосый", "Закадровый"]
        },
        filter_translate: s
    };

    function F(e, t) {
        var n = e.toLowerCase().replace(/ /g, "").split(/\.|\[/)[0],
            i = t.toLowerCase().replace(/ /g, "").split(/\.|\[/)[0];
        return !(!n || !i) && (n.indexOf(i) > -1 || i.indexOf(n) > -1);
    }

    function R() {
        var e = Lampa.Storage.get("region", "{}");
        return e.code ? e.code : "ru";
    }

    function V(e) {
        return e.forEach(function(e) {
            ["translate", "title", "details", "name"].forEach(function(t) {
                if (e[t]) {
                    if (/^\d{3,4}p$/i.test(e[t])) return void(e[t] = "По умолчанию");
                    if (e[t] = (a = /\(([^()]+)\)$/, o = 1, r = e[t], (l = r.match(a)) && l[o] ? l[o] : r), /^\d{3,4}p$/i.test(e[t])) return void(e[t] = "По умолчанию");
                    O.filter_translate.forEach(function(n) {
                        e[t].toLowerCase().indexOf(n.toLowerCase()) >= 0 && (e[t] = n);
                    });
                    var n = function(n) {
                        O.rename_translate[n].forEach(function(i) {
                            e[t].toLowerCase() == i.toLowerCase() && (e[t] = n);
                        });
                    };
                    for (var i in O.rename_translate) n(i);
                    O.filter_du.forEach(function(n) {
                        e[t].toLowerCase().indexOf(n.toLowerCase()) >= 0 && (e[t] = n);
                    });
                }
                var a, o, r, l;
            });
        }), e;
    }

    function B(e) {
        var t = [];
        return e.forEach(function(e) {
            t.find(function(t) {
                return F(t.translate || t.name || t.details || t.title || "", e.translate || e.name || e.details || e.title || "");
            }) || t.push(e);
        }), t;
    }
    var M = {
        compareVoice: F,
        region: R,
        voice: D,
        player: function() {
            return Lampa.Platform.is("tizen") || Lampa.Platform.is("webos") ? "inner" : Lampa.Storage.field("player");
        },
        filterTranslate: function(e) {
            var t = e.filter(function(e) {
                return 0 == O.filter_hr.filter(function(t) {
                    return (e.translate || e.name || e.details || e.title || "").toLowerCase().indexOf(t.toLowerCase()) >= 0;
                }).length;
            });
            return t = t.filter(function(e) {
                return 0 == O.filter_ts.filter(function(t) {
                    return (e.translate || e.name || e.details || e.title || "").toLowerCase().indexOf(" " + t.toLowerCase()) >= 0;
                }).length;
            }), "ru" == R() && (t = t.filter(function(e) {
                return 0 == O.filter_uk.filter(function(t) {
                    return (e.translate || e.name || e.details || e.title || "").toLowerCase().indexOf(t.toLowerCase()) >= 0;
                }).length;
            })), V(t = t.filter(function(e) {
                var t = (e.translate || e.name || e.details || e.title || "").toLowerCase();
                return !!/^\d{3,4}p$/.test(t) || (O.filter_translate.filter(function(e) {
                    return t.indexOf(e.toLowerCase()) >= 0;
                }).length > 0 || O.filter_du.filter(function(e) {
                    return t.indexOf(e.toLowerCase()) >= 0;
                }).length > 0);
            })), t;
        },
        renameTranslate: V,
        sortDUBTranstale: function(e) {
            e.sort(function(e, t) {
                var n = O.filter_db.filter(function(t) {
                        return (e.translate || e.name || e.details || e.title || "").toLowerCase().indexOf(t.toLowerCase()) >= 0;
                    }).length,
                    i = O.filter_db.filter(function(e) {
                        return (t.translate || t.name || t.details || t.title || "").toLowerCase().indexOf(e.toLowerCase()) >= 0;
                    }).length;
                return n && !i ? -1 : !n && i ? 1 : 0;
            });
        },
        modalChoiceTranstale: function(e, t) {
            var n = Lampa.Controller.enabled().name,
                i = $('<div class="connect-broken">\n        <div class="connect-broken__icon icon--nofound"></div>\n        <div class="connect-broken__title">Вот досада...</div>\n        <div class="connect-broken__text">Нет доступных файлов для воспроизведения с выбранным переводом (<b>'.concat(e.from, '</b>). Хотите выбрать другой?</div>\n        <div class="connect-broken__footer">\n            <div class="selector simple-button next">Выбрать другой</div>\n        </div>\n    </div>'));
            i.find(".selector").on("hover:enter", function() {
                Lampa.Modal.close(), Lampa.Controller.toggle(n);
            }), i.find(".next").on("hover:enter", function() {
                Lampa.Select.show({
                    title: "Выберите перевод",
                    items: e.voicelist,
                    onBack: function() {
                        Lampa.Controller.toggle(n), t && t();
                    }
                });
            }), Lampa.Modal.open({
                title: "",
                html: i,
                onBack: function() {
                    Lampa.Modal.close(), Lampa.Controller.toggle(n), t && t();
                }
            });
        },
        unicleTranslations: B,
        selectChoiceTranstale: function(e, t, n) {
            Lampa.Select.show({
                title: "Выберите перевод",
                items: B(e).map(function(e) {
                    return {
                        title: e.translate || e.name || e.details || e.title || "",
                        selected: F(e.translate || e.name || e.details || e.title || "", t),
                        onSelect: function() {
                            Lampa.Controller.toggle("content"), n(e);
                        }
                    };
                }),
                onBack: function() {
                    Lampa.Controller.toggle("content");
                }
            });
        },
        selectChoiceFlow: function(e, t) {
            Lampa.Select.show({
                title: "Выберите поток",
                items: e.map(function(e) {
                    return {
                        title: e.quality + (e.label ? "<sub>" + e.label + "</sub>" : ""),
                        selected: e.selected,
                        subtitle: Lampa.Utils.shortText(e.url, 35),
                        onSelect: function() {
                            Lampa.Controller.toggle("content"), t(e);
                        }
                    };
                }),
                onBack: function() {
                    Lampa.Controller.toggle("content");
                }
            });
        }
    };

    function j(e) {
        if (e += "", -1 == (e = Lampa.Utils.addUrlComponent(e, "rjson=true")).indexOf("uid=")) {
            var t = Lampa.Storage.get("lampac_unic_id", "") || "guest";
            e = Lampa.Utils.addUrlComponent(e, "uid=" + encodeURIComponent(t));
        }
        if (Lampa.Storage.get(p, false)) {
            if (-1 == e.indexOf("account_email=")) {
                var n = Lampa.Storage.get("account_email", "");
                n && (e = Lampa.Utils.addUrlComponent(e, "account_email=" + encodeURIComponent(n)));
            }
            if (-1 == e.indexOf("token=")) {
                var i = Lampa.Storage.get(f, "");
                i && (e = Lampa.Utils.addUrlComponent(e, "token=" + encodeURIComponent(i)));
            }
            if (-1 == e.indexOf("nws_id=") && window.rch_nws && window.rch_nws[E]) {
                var a = window.rch_nws[E].connectionId || "";
                a && (e = Lampa.Utils.addUrlComponent(e, "nws_id=" + encodeURIComponent(a)));
            }
            if (-1 == e.indexOf("rchtype=")) {
                var o = window.rch_nws && window.rch_nws[E] && window.rch_nws[E].type || "web";
                e = Lampa.Utils.addUrlComponent(e, "rchtype=" + o);
            }
        }
        return e;
    }
    var E = h.replace("http://", "").replace("https://", ""),
        I = false;

    function U(e, t) {
        function n() {
            window.nwsClient && window.nwsClient[E] && window.nwsClient[E]._shouldReconnect ? t && t() : (window.nwsClient || (window.nwsClient = {}), window.nwsClient[E] && window.nwsClient[E].socket && window.nwsClient[E].socket.close(), window.nwsClient[E] = new NativeWsClient(e.nws, {
                autoReconnect: true
            }), window.nwsClient[E].on("Connected", function() {
                window.rch_nws[E].Registry(window.nwsClient[E], function() {
                    t && t();
                });
            }), window.nwsClient[E].on("Error", function(e) {
                console.log("BWA NWS Error:", e);
            }), window.nwsClient[E].connect());
        }
        window.rch_nws || (window.rch_nws = {}), window.rch_nws[E] || (window.rch_nws[E] = {
            type: Lampa.Platform.is("android") ? "apk" : Lampa.Platform.is("tizen") ? "cors" : "web",
            startTypeInvoke: false,
            rchRegistry: false,
            apkVersion: 0
        }), window.rch_nws[E].Registry = function(e, t) {
            e.invoke("RchRegistry", JSON.stringify({
                version: 151,
                host: location.host,
                rchtype: window.rch_nws[E].type || "web",
                apkVersion: 0,
                player: Lampa.Storage.field("player"),
                account_email: Lampa.Storage.get("account_email", ""),
                unic_id: Lampa.Storage.get("lampac_unic_id", ""),
                profile_id: Lampa.Storage.get("lampac_profile_id", ""),
                token: ""
            })), e._shouldReconnect && window.rch_nws[E].rchRegistry ? t && t() : (window.rch_nws[E].rchRegistry = true, e.on("RchRegistry", function(e) {
                true,
                t && t();
            }), e.on("RchClient", function(t, n, i, a, o) {
                var r = new Lampa.Reguest;

                function l(n) {
                    (Lampa.Arrays.isObject(n) || Lampa.Arrays.isArray(n)) && (n = JSON.stringify(n)),
                    function(n, i) {
                        $.ajax({
                            url: "http://" + h + "/rch/" + n + "?id=" + t,
                            type: "POST",
                            data: i,
                            async: true,
                            cache: false,
                            contentType: false,
                            processData: false,
                            success: function() {},
                            error: function() {
                                e.invoke("RchResult", t, "");
                            }
                        });
                    }("result", n);
                }
                "ping" == n ? l("pong") : r.native(n, l, function() {
                    l("");
                }, i, {
                    dataType: "text",
                    timeout: 8e3,
                    headers: a,
                    returnHeaders: o
                });
            }), e.on("Connected", function(e) {
                window.rch_nws[E].connectionId = e, true;
            }));
        }, "undefined" == typeof NativeWsClient ? Lampa.Utils.putScript(["http://" + h + "/js/nws-client-es5.js?v18112025"], function() {}, false, function() {
            n();
        }, true) : n();
    }

    function N(e, t) {
        return !(!e || !e.rch) && (U(e, function() {
            setTimeout(function() {
                t && t();
            }, 500);
        }), true);
    }
    var z = function() {
            function n(e) {
                t(this, n), this.object = e, this.network = new Lampa.Reguest, this.voiceSave = new o(e);
            }
            return [{
                key: "externalids",
                value: function() {
                    var e = this;
                    return new Promise(function(t, n) {
                        if (e.object.movie.imdb_id && e.object.movie.kinopoisk_id) t();
                        else {
                            var i = [];
                            i.push("id=" + e.object.movie.id), i.push("serial=" + (e.object.movie.name ? 1 : 0)), e.object.movie.imdb_id && i.push("imdb_id=" + (e.object.movie.imdb_id || "")), e.object.movie.kinopoisk_id && i.push("kinopoisk_id=" + (e.object.movie.kinopoisk_id || ""));
                            var a = Lampa.Utils.protocol() + O.stream + "/externalids?" + i.join("&");
                            e.network.timeout(1e4), e.network.silent(j(a), function(n) {
                                for (var i in n) e.object.movie[i] = n[i];
                                t();
                            }, function() {
                                t();
                            });
                        }
                    });
                }
            }, {
                key: "requestParams",
                value: function(e) {
                    var t = [],
                        n = this.object,
                        i = n.movie.source || "tmdb";
                    return t.push("id=" + n.movie.id), n.movie.imdb_id && t.push("imdb_id=" + (n.movie.imdb_id || "")), n.movie.kinopoisk_id && t.push("kinopoisk_id=" + (n.movie.kinopoisk_id || "")), t.push("title=" + encodeURIComponent(n.clarification ? n.search : n.movie.title || n.movie.name)), t.push("original_title=" + encodeURIComponent(n.movie.original_title || n.movie.original_name)), t.push("serial=" + (n.movie.name ? 1 : 0)), t.push("original_language=" + (n.movie.original_language || "")), t.push("year=" + ((n.movie.release_date || n.movie.first_air_date || "0000") + "").slice(0, 4)), t.push("source=" + i), t.push("clarification=" + (n.clarification ? 1 : 0)), t.push("rjson=true"), Lampa.Storage.get("account_email", "") && t.push("cub_id=" + Lampa.Utils.hash(Lampa.Storage.get("account_email", ""))), e + (e.indexOf("?") >= 0 ? "&" : "?") + t.join("&");
                }
            }, {
                key: "query",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = [].concat(O.sources),
                            o = new r(a.length);
                        o.onComplite = function(t) {
                            var o = [],
                                r = 700;
                            a.forEach(function(n) {
                                if (t[n] && t[n].type == e.type) {
                                    var i = t[n];
                                    i.error ? r = i.error : i && i.accsdb ? r = 600 : "similar" != i.type && i.data ? o.push(i.voice ? i : i.data) : r = 700;
                                }
                            }), o.length ? n(o) : (t && n(r.prototype, t), i && n(r, i), Object.defineProperty(r, "prototype", {
                                writable: false
                            }), r);
                        }, a.forEach(function(n) {
                            t.source(n, e.season).then(function(e) {
                                o.append(n, e);
                            }).catch(function(e) {
                                o.append(n, {
                                    error: e
                                });
                            });
                        });
                    });
                }
            }, {
                key: "source",
                value: function(e, t) {
                    var n = this;
                    return new Promise(function(i, a) {
                        var o = function(r, l) {
                                var s = r ? "/lite/" : "/",
                                    c = n.requestParams(j(Lampa.Utils.protocol() + O.stream + s + e));
                                t && (c += "&s=" + t), n.network.timeout(1e4), n.network.silent(c, function(e) {
                                    var t;
                                    try {
                                        t = JSON.parse(e);
                                    } catch (e) {}
                                    t ? t.rch && Lampa.Storage.get(p, false) && !l ? N(t, function() {
                                        o(r, true);
                                    }) : (t && n(t.prototype, t), i && n(t, i), Object.defineProperty(t, "prototype", {
                                        writable: false
                                    }), t) : (t in 500 ? Object.defineProperty(500, t, {
                                        value: n,
                                        enumerable: true,
                                        configurable: true,
                                        writable: true
                                    }) : 500[t] = n, 500);
                                }, function() {
                                    r ? o(false, l) : (t in 400 ? Object.defineProperty(400, t, {
                                        value: n,
                                        enumerable: true,
                                        configurable: true,
                                        writable: true
                                    }) : 400[t] = n, 400);
                                }, false, {
                                    dataType: "text"
                                });
                            },
                            r = -1 == O.nolite.indexOf(e);
                        o(r, false);
                    });
                }
            }, {
                key: "links",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = [],
                            o = [];
                        e.forEach(function(e) {
                            a = a.concat(e.filter(function(e) {
                                return "call" == e.method;
                            })), o = o.concat(e.filter(function(e) {
                                return "play" == e.method;
                            }));
                        });
                        var l = new r(a.length);
                        l.onComplite = function() {
                            n(M.renameTranslate(o));
                        };
                        var s = function(e, n) {
                            t.network.timeout(1e4), t.network.silent(j(e.url), function(t) {
                                t.rch && Lampa.Storage.get(p, false) && !n ? N(t, function() {
                                    s(e, true);
                                }) : (t.details = e.details || t.details || "no details", t.translate = e.translate || t.translate || "no translate", o.push(t), l.next());
                            }, l.error.bind(l));
                        };
                        a.forEach(function(e) {
                            s(e, false);
                        }), 0 == a.length && n(M.renameTranslate(o));
                    });
                }
            }, {
                key: "m3u",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = [],
                            o = Lampa.Storage.field("video_quality_default"),
                            r = function(t) {
                                parseInt(t) <= o && [e.quality[t].url].concat(e.quality[t].reserve).forEach(function(n) {
                                    a.push({
                                        quality: t,
                                        name: e.name,
                                        url: n
                                    });
                                });
                            };
                        for (var l in e.quality) r(l);
                        t.network.silent(Lampa.Utils.protocol() + O.stream + "/m3u/add", function(e) {
                            n(Lampa.Utils.protocol() + O.stream + e.url);
                        }, function(e, t) {
                            t && n(400..prototype, t), i && n(400, i), Object.defineProperty(400, "prototype", {
                                writable: false
                            }), 400;
                        }, {
                            playlist: a
                        });
                    });
                }
            }, {
                key: "flows",
                value: function(e) {
                    var t = [],
                        n = Lampa.Storage.field("video_quality_default"),
                        i = function(n) {
                            var i = [e[n].url].concat(e[n].reserve),
                                a = parseInt(n);
                            i.forEach(function(e) {
                                t.push({
                                    int: a,
                                    label: a > 1440 ? "4K" : a >= 1440 ? "2K" : a >= 1080 ? "FHD" : a >= 720 ? "HD" : "",
                                    quality: n,
                                    url: e
                                });
                            });
                        };
                    for (var a in e) t && n(a.prototype, t), i && n(a, i), Object.defineProperty(a, "prototype", {
                        writable: false
                    }), a;
                    var o = t.find(function(e) {
                        return e.int == n;
                    });
                    return o && (o.selected = true), t;
                }
            }, {
                key: "movie",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        t.externalids().then(function() {
                            return t.query(e);
                        }).then(function(e) {
                            var t = [];
                            if (e.forEach(function(e) {
                                    var n = M.filterTranslate(e);
                                    n.length && (t = t.concat(n));
                                }), t.forEach(function(e) {
                                    e.maxquality = e.maxquality || "1080p";
                                    var t = e.translate.match(/\[(.*?)\]/);
                                    t && (t = t[1].split(",").map(function(e) {
                                        return e.trim();
                                    }), e.lang = (t.map(function(e) {
                                        return e.toLowerCase();
                                    }).find(function(e) {
                                        return "ru" == e || "uk" == e || "rus" == e || "ukr" == e || "укр" == e;
                                    }) || "").toUpperCase(), e.lang = "RUS" == e.lang ? "RU" : "UKR" == e.lang ? "UA" : e.lang, "RU" == e.lang && "ru" == M.region() && (e.lang = ""), e.translate = t.find(function(e) {
                                        return e.length > 5;
                                    }) || e.translate);
                                }), 0 == t.length) throw new Error("No data");
                            M.renameTranslate(t), n({
                                sources: e,
                                translates: t
                            });
                        }).catch(i);
                    });
                }
            }, {
                key: "tv",
                value: function(t) {
                    var n = this;
                    return new Promise(function(i, o) {
                        n.externalids().then(function() {
                            n.query(t).then(function(t) {
                                n.voice(t).then(function(n) {
                                    t && n(function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n).prototype, t), i && n(function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n), i), Object.defineProperty(function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n), "prototype", {
                                            writable: false
                                        }),
                                        function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n);
                                }).catch(o);
                            }).catch(o);
                        });
                    });
                }
            }, {
                key: "voice",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = t.voiceSave.get(),
                            o = [],
                            l = O.filter_tv,
                            s = [],
                            c = function e(n, i) {
                                return new Promise(function(a, o) {
                                    t.network.timeout(1e4), t.network.silent(j(n.url), function(t) {
                                        t.rch && Lampa.Storage.get(p, false) && !i ? N(t, function() {
                                            e(n, true).then(a).catch(o);
                                        }) : (! function(e, t) {
                                            e.data.forEach(function(e) {
                                                e.translate_name = t;
                                            });
                                        }(t, M.voice(n)), (t in t.data ? Object.defineProperty(t.data, t, {
                                            value: n,
                                            enumerable: true,
                                            configurable: true,
                                            writable: true
                                        }) : t.data[t] = n, t.data));
                                    }, o);
                                });
                            };
                        e.forEach(function(e) {
                            e.voice = M.filterTranslate(e.voice), s = s.concat(e.voice.filter(function(e) {
                                return 0 == l.filter(function(t) {
                                    return M.voice(e).toLowerCase().indexOf(t) >= 0;
                                }).length;
                            }));
                        }), a || (a = M.voice("Анастасия Гайдаржи + Андрей Юрченко")), s.sort(function(e, t) {
                            return M.voice(e).toLowerCase().localeCompare(M.voice(t).toLowerCase());
                        });
                        var u = s.filter(function(e) {
                                return M.compareVoice(e.name, a);
                            }),
                            d = new r(u.length);
                        d.onComplite = function() {
                            0 == o.length ? c("Анастасия Гайдаржи + Андрей Юрченко", false).then(function(e) {
                                o = o.concat(e), n({
                                    translates: s,
                                    plays: o
                                });
                            }).catch(i) : n({
                                translates: s,
                                plays: o
                            });
                        }, u.forEach(function(e) {
                            c(e, false).then(function(e) {
                                o = o.concat(e), d.next();
                            }).catch(d.error.bind(d));
                        }), 0 == u.length && d.onComplite();
                    });
                }
            }, {
                key: "error",
                value: function(e) {
                    var t = Lampa.Controller.enabled().name,
                        n = $('<div class="connect-broken">\n            <div class="connect-broken__title">Вот досада...</div>\n            <div class="connect-broken__text">'.concat("К сожалению, не удалось найти видеоконтент для этого фильма. Попробуйте выбрать другой фильм или повторите попытку позже.", '</div>\n            <div class="connect-broken__footer">\n                <div class="selector simple-button">Закрыть</div>\n            </div>\n        </div>'));
                    n.find(".selector").on("hover:enter", function() {
                        Lampa.Controller.back();
                    }), Lampa.Modal.open({
                        title: "",
                        html: n,
                        onBack: function() {
                            Lampa.Modal.close(), Lampa.Controller.toggle(t);
                        }
                    });
                }
            }] && n(n.prototype, [{
                key: "externalids",
                value: function() {
                    var e = this;
                    return new Promise(function(t, n) {
                        if (e.object.movie.imdb_id && e.object.movie.kinopoisk_id) t();
                        else {
                            var i = [];
                            i.push("id=" + e.object.movie.id), i.push("serial=" + (e.object.movie.name ? 1 : 0)), e.object.movie.imdb_id && i.push("imdb_id=" + (e.object.movie.imdb_id || "")), e.object.movie.kinopoisk_id && i.push("kinopoisk_id=" + (e.object.movie.kinopoisk_id || ""));
                            var a = Lampa.Utils.protocol() + O.stream + "/externalids?" + i.join("&");
                            e.network.timeout(1e4), e.network.silent(j(a), function(n) {
                                for (var i in n) e.object.movie[i] = n[i];
                                t();
                            }, function() {
                                t();
                            });
                        }
                    });
                }
            }, {
                key: "requestParams",
                value: function(e) {
                    var t = [],
                        n = this.object,
                        i = n.movie.source || "tmdb";
                    return t.push("id=" + n.movie.id), n.movie.imdb_id && t.push("imdb_id=" + (n.movie.imdb_id || "")), n.movie.kinopoisk_id && t.push("kinopoisk_id=" + (n.movie.kinopoisk_id || "")), t.push("title=" + encodeURIComponent(n.clarification ? n.search : n.movie.title || n.movie.name)), t.push("original_title=" + encodeURIComponent(n.movie.original_title || n.movie.original_name)), t.push("serial=" + (n.movie.name ? 1 : 0)), t.push("original_language=" + (n.movie.original_language || "")), t.push("year=" + ((n.movie.release_date || n.movie.first_air_date || "0000") + "").slice(0, 4)), t.push("source=" + i), t.push("clarification=" + (n.clarification ? 1 : 0)), t.push("rjson=true"), Lampa.Storage.get("account_email", "") && t.push("cub_id=" + Lampa.Utils.hash(Lampa.Storage.get("account_email", ""))), e + (e.indexOf("?") >= 0 ? "&" : "?") + t.join("&");
                }
            }, {
                key: "query",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = [].concat(O.sources),
                            o = new r(a.length);
                        o.onComplite = function(t) {
                            var o = [],
                                r = 700;
                            a.forEach(function(n) {
                                if (t[n] && t[n].type == e.type) {
                                    var i = t[n];
                                    i.error ? r = i.error : i && i.accsdb ? r = 600 : "similar" != i.type && i.data ? o.push(i.voice ? i : i.data) : r = 700;
                                }
                            }), o.length ? n(o) : (t && n(r.prototype, t), i && n(r, i), Object.defineProperty(r, "prototype", {
                                writable: false
                            }), r);
                        }, a.forEach(function(n) {
                            t.source(n, e.season).then(function(e) {
                                o.append(n, e);
                            }).catch(function(e) {
                                o.append(n, {
                                    error: e
                                });
                            });
                        });
                    });
                }
            }, {
                key: "source",
                value: function(e, t) {
                    var n = this;
                    return new Promise(function(i, a) {
                        var o = function(r, l) {
                                var s = r ? "/lite/" : "/",
                                    c = n.requestParams(j(Lampa.Utils.protocol() + O.stream + s + e));
                                t && (c += "&s=" + t), n.network.timeout(1e4), n.network.silent(c, function(e) {
                                    var t;
                                    try {
                                        t = JSON.parse(e);
                                    } catch (e) {}
                                    t ? t.rch && Lampa.Storage.get(p, false) && !l ? N(t, function() {
                                        o(r, true);
                                    }) : (t && n(t.prototype, t), i && n(t, i), Object.defineProperty(t, "prototype", {
                                        writable: false
                                    }), t) : (t in 500 ? Object.defineProperty(500, t, {
                                        value: n,
                                        enumerable: true,
                                        configurable: true,
                                        writable: true
                                    }) : 500[t] = n, 500);
                                }, function() {
                                    r ? o(false, l) : (t in 400 ? Object.defineProperty(400, t, {
                                        value: n,
                                        enumerable: true,
                                        configurable: true,
                                        writable: true
                                    }) : 400[t] = n, 400);
                                }, false, {
                                    dataType: "text"
                                });
                            },
                            r = -1 == O.nolite.indexOf(e);
                        o(r, false);
                    });
                }
            }, {
                key: "links",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = [],
                            o = [];
                        e.forEach(function(e) {
                            a = a.concat(e.filter(function(e) {
                                return "call" == e.method;
                            })), o = o.concat(e.filter(function(e) {
                                return "play" == e.method;
                            }));
                        });
                        var l = new r(a.length);
                        l.onComplite = function() {
                            n(M.renameTranslate(o));
                        };
                        var s = function(e, n) {
                            t.network.timeout(1e4), t.network.silent(j(e.url), function(t) {
                                t.rch && Lampa.Storage.get(p, false) && !n ? N(t, function() {
                                    s(e, true);
                                }) : (t.details = e.details || t.details || "no details", t.translate = e.translate || t.translate || "no translate", o.push(t), l.next());
                            }, l.error.bind(l));
                        };
                        a.forEach(function(e) {
                            s(e, false);
                        }), 0 == a.length && n(M.renameTranslate(o));
                    });
                }
            }, {
                key: "m3u",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = [],
                            o = Lampa.Storage.field("video_quality_default"),
                            r = function(t) {
                                parseInt(t) <= o && [e.quality[t].url].concat(e.quality[t].reserve).forEach(function(n) {
                                    a.push({
                                        quality: t,
                                        name: e.name,
                                        url: n
                                    });
                                });
                            };
                        for (var l in e.quality) r(l);
                        t.network.silent(Lampa.Utils.protocol() + O.stream + "/m3u/add", function(e) {
                            n(Lampa.Utils.protocol() + O.stream + e.url);
                        }, function(e, t) {
                            t && n(400..prototype, t), i && n(400, i), Object.defineProperty(400, "prototype", {
                                writable: false
                            }), 400;
                        }, {
                            playlist: a
                        });
                    });
                }
            }, {
                key: "flows",
                value: function(e) {
                    var t = [],
                        n = Lampa.Storage.field("video_quality_default"),
                        i = function(n) {
                            var i = [e[n].url].concat(e[n].reserve),
                                a = parseInt(n);
                            i.forEach(function(e) {
                                t.push({
                                    int: a,
                                    label: a > 1440 ? "4K" : a >= 1440 ? "2K" : a >= 1080 ? "FHD" : a >= 720 ? "HD" : "",
                                    quality: n,
                                    url: e
                                });
                            });
                        };
                    for (var a in e) t && n(a.prototype, t), i && n(a, i), Object.defineProperty(a, "prototype", {
                        writable: false
                    }), a;
                    var o = t.find(function(e) {
                        return e.int == n;
                    });
                    return o && (o.selected = true), t;
                }
            }, {
                key: "movie",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        t.externalids().then(function() {
                            return t.query(e);
                        }).then(function(e) {
                            var t = [];
                            if (e.forEach(function(e) {
                                    var n = M.filterTranslate(e);
                                    n.length && (t = t.concat(n));
                                }), t.forEach(function(e) {
                                    e.maxquality = e.maxquality || "1080p";
                                    var t = e.translate.match(/\[(.*?)\]/);
                                    t && (t = t[1].split(",").map(function(e) {
                                        return e.trim();
                                    }), e.lang = (t.map(function(e) {
                                        return e.toLowerCase();
                                    }).find(function(e) {
                                        return "ru" == e || "uk" == e || "rus" == e || "ukr" == e || "укр" == e;
                                    }) || "").toUpperCase(), e.lang = "RUS" == e.lang ? "RU" : "UKR" == e.lang ? "UA" : e.lang, "RU" == e.lang && "ru" == M.region() && (e.lang = ""), e.translate = t.find(function(e) {
                                        return e.length > 5;
                                    }) || e.translate);
                                }), 0 == t.length) throw new Error("No data");
                            M.renameTranslate(t), n({
                                sources: e,
                                translates: t
                            });
                        }).catch(i);
                    });
                }
            }, {
                key: "tv",
                value: function(t) {
                    var n = this;
                    return new Promise(function(i, o) {
                        n.externalids().then(function() {
                            n.query(t).then(function(t) {
                                n.voice(t).then(function(n) {
                                    t && n(function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n).prototype, t), i && n(function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n), i), Object.defineProperty(function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n), "prototype", {
                                            writable: false
                                        }),
                                        function(t) {
                                            for (var n = 1; n < arguments.length; n++) {
                                                var i, o = null !== (i = arguments[n]) && undefined !== i ? i : {};
                                                n % 2 ? e(Object(o), true).forEach(function(e) {
                                                    e in t ? Object.defineProperty(t, e, {
                                                        value: o[e],
                                                        enumerable: true,
                                                        configurable: true,
                                                        writable: true
                                                    }) : t[e] = o[e], t;
                                                }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach(function(e) {
                                                    Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e));
                                                });
                                            }
                                            return t;
                                        }({
                                            sources: t
                                        }, n);
                                }).catch(o);
                            }).catch(o);
                        });
                    });
                }
            }, {
                key: "voice",
                value: function(e) {
                    var t = this;
                    return new Promise(function(n, i) {
                        var a = t.voiceSave.get(),
                            o = [],
                            l = O.filter_tv,
                            s = [],
                            c = function e(n, i) {
                                return new Promise(function(a, o) {
                                    t.network.timeout(1e4), t.network.silent(j(n.url), function(t) {
                                        t.rch && Lampa.Storage.get(p, false) && !i ? N(t, function() {
                                            e(n, true).then(a).catch(o);
                                        }) : (! function(e, t) {
                                            e.data.forEach(function(e) {
                                                e.translate_name = t;
                                            });
                                        }(t, M.voice(n)), (t in t.data ? Object.defineProperty(t.data, t, {
                                            value: n,
                                            enumerable: true,
                                            configurable: true,
                                            writable: true
                                        }) : t.data[t] = n, t.data));
                                    }, o);
                                });
                            };
                        e.forEach(function(e) {
                            e.voice = M.filterTranslate(e.voice), s = s.concat(e.voice.filter(function(e) {
                                return 0 == l.filter(function(t) {
                                    return M.voice(e).toLowerCase().indexOf(t) >= 0;
                                }).length;
                            }));
                        }), a || (a = M.voice("Анастасия Гайдаржи + Андрей Юрченко")), s.sort(function(e, t) {
                            return M.voice(e).toLowerCase().localeCompare(M.voice(t).toLowerCase());
                        });
                        var u = s.filter(function(e) {
                                return M.compareVoice(e.name, a);
                            }),
                            d = new r(u.length);
                        d.onComplite = function() {
                            0 == o.length ? c("Анастасия Гайдаржи + Андрей Юрченко", false).then(function(e) {
                                o = o.concat(e), n({
                                    translates: s,
                                    plays: o
                                });
                            }).catch(i) : n({
                                translates: s,
                                plays: o
                            });
                        }, u.forEach(function(e) {
                            c(e, false).then(function(e) {
                                o = o.concat(e), d.next();
                            }).catch(d.error.bind(d));
                        }), 0 == u.length && d.onComplite();
                    });
                }
            }, {
                key: "error",
                value: function(e) {
                    var t = Lampa.Controller.enabled().name,
                        n = $('<div class="connect-broken">\n            <div class="connect-broken__title">Вот досада...</div>\n            <div class="connect-broken__text">'.concat("К сожалению, не удалось найти видеоконтент для этого фильма. Попробуйте выбрать другой фильм или повторите попытку позже.", '</div>\n            <div class="connect-broken__footer">\n                <div class="selector simple-button">Закрыть</div>\n            </div>\n        </div>'));
                    n.find(".selector").on("hover:enter", function() {
                        Lampa.Controller.back();
                    }), Lampa.Modal.open({
                        title: "",
                        html: n,
                        onBack: function() {
                            Lampa.Modal.close(), Lampa.Controller.toggle(t);
                        }
                    });
                }
            }]), i && n(n, i), Object.defineProperty(n, "prototype", {
                writable: false
            }), n, n;
        }(),
        q = function() {
            function e(n) {
                var i = this;
                t(this, e), this.object = n, this.extract = new z(n), this.voice = new o(n), this.on_error_timer = null;
                Lampa.Player.listener.follow("destroy", function e() {
                    Lampa.Player.listener.remove("close", e), clearTimeout(i.on_error_timer);
                });
            }
            return [{
                key: "getQuality",
                value: function(e) {
                    var t = this,
                        n = {};
                    e.forEach(function(e) {
                        var i = e.quality,
                            a = function(e) {
                                var a = parseInt(e),
                                    o = t.getSplitLinks(i[e]);
                                n[e] ? n[e].reserve = n[e].reserve.concat(o) : n[e] = {
                                    label: a > 1440 ? "4K" : a >= 1440 ? "2K" : a >= 1080 ? "FHD" : a >= 720 ? "HD" : "",
                                    url: o[0],
                                    reserve: o.length > 1 ? o.slice(1) : [],
                                    used: [],
                                    error: [],
                                    trigger: function() {
                                        t.setFlowsForQuality(Lampa.Player.playdata());
                                    }
                                };
                            };
                        for (var o in i) t in o ? Object.defineProperty(o, t, {
                            value: n,
                            enumerable: true,
                            configurable: true,
                            writable: true
                        }) : o[t] = n, o;
                    });
                    var i = Lampa.Arrays.getKeys(n),
                        a = {};
                    return i.sort(function(e, t) {
                        return parseInt(t) - parseInt(e);
                    }), i.forEach(function(e) {
                        a[e] = n[e];
                    }), a;
                }
            }, {
                key: "getSplitLinks",
                value: function(e) {
                    return e.split(" or ");
                }
            }, {
                key: "getSelectedQuality",
                value: function(e) {
                    var t = null,
                        n = e.url,
                        i = e.quality;
                    if (e.quality_switched) {
                        for (var a in i)
                            if (a == e.quality_switched) {
                                t = i[a];
                                break;
                            }
                    } else
                        for (var a in i) {
                            var o = i[a];
                            if (o.url == n || o.reserve.indexOf(n) >= 0) {
                                t = o;
                                break;
                            }
                        }
                    if (!t)
                        for (var a in i) {
                            t = i[a];
                            break;
                        }
                    return t;
                }
            }, {
                key: "getQualityLevelDown",
                value: function(e) {
                    var t, n, i = this.getSelectedQuality(e);
                    for (var a in e.quality)
                        if (i == e.quality[a]) {
                            t = a;
                            break;
                        }
                    if (t) {
                        var o = Lampa.Arrays.getKeys(e.quality);
                        o.sort(function(e, t) {
                            return parseInt(t) - parseInt(e);
                        }), o.forEach(function(e) {
                            parseInt(e) < parseInt(t) && !n && parseInt(e) > 360 && (n = e);
                        });
                    }
                    return n;
                }
            }, {
                key: "getReserveQuality",
                value: function(e) {
                    var t = this.getSelectedQuality(e),
                        n = "";
                    return t && (t.error.push(Lampa.Manifest.app_digital >= 236 ? e.url : t.url), t.reserve.forEach(function(e) {
                        -1 != t.used.indexOf(e) || n || (n = e, t.used.push(e));
                    })), n;
                }
            }, {
                key: "getPlayData",
                value: function(e) {
                    var t = Lampa.Utils.hash(e.season ? [e.season, e.season > 10 ? ":" : "", e.episode, this.object.movie.original_title].join("") : this.object.movie.original_title),
                        n = this.getQuality(e.quality);
                    return {
                        title: this.object.movie.title || this.object.movie.name,
                        url: Lampa.Player.getUrlQuality(n),
                        quality: n,
                        timeline: Lampa.Timeline.view(t),
                        translate_name: e.translate,
                        card: this.object.movie
                    };
                }
            }, {
                key: "getNextVoice",
                value: function(e, t, n) {
                    var i = this.getSelectedQuality(e);
                    if (i && (0 == i.reserve.length || i.used.length == i.reserve.length)) {
                        var a = this.getQualityLevelDown(e);
                        a ? (e.quality_switched = a, i = this.getSelectedQuality(e), Lampa.Arrays.remove(i.reserve, i.url), Lampa.Arrays.insert(i.reserve, 0, i.url)) : i = null;
                    }
                    i ? (e.url = this.getReserveQuality(e), n(e.url || "nofound"), this.setFlowsForQuality(e)) : M.modalChoiceTranstale({
                        from: t.find(function(e) {
                            return e.selected;
                        }).name,
                        voicelist: t
                    });
                }
            }, {
                key: "setFlowsForQuality",
                value: function(e) {
                    var t = this.getSelectedQuality(e);
                    if (t) {
                        var n = [],
                            i = [t.url].concat(t.reserve.filter(function(e) {
                                return e !== t.url;
                            })).filter(function(e) {
                                return -1 == t.error.indexOf(e);
                            });
                        i.length > 1 && i.forEach(function(e, i) {
                            n.push({
                                title: "Поток " + (i + 1),
                                subtitle: Lampa.Utils.shortText(e, 35),
                                url: e,
                                selected: e == t.url
                            });
                        }), Lampa.PlayerPanel.setFlows(!!n.length && n);
                    }
                }
            }, {
                key: "movie",
                value: function(e) {
                    var t = this,
                        n = M.player();
                    e.translates.sort(function(e, t) {
                        var n = parseInt(e.maxquality) || 0,
                            i = parseInt(t.maxquality) || 0;
                        if (i !== n) return i - n;
                        var a = O.filter_db.filter(function(t) {
                                return e.translate.toLowerCase().indexOf(t.toLowerCase()) >= 0;
                            }).length,
                            o = O.filter_db.filter(function(e) {
                                return t.translate.toLowerCase().indexOf(e.toLowerCase()) >= 0;
                            }).length;
                        return a && !o ? -1 : !a && o ? 1 : 0;
                    });
                    var i = M.voice(e.translates[0]),
                        a = e.translates.filter(function(e) {
                            return M.compareVoice(M.voice(e), i);
                        }),
                        o = Lampa.Utils.hash(this.object.movie.original_title);
                    "inner" == n ? this.extract.links([a]).then(function(n) {
                        Lampa.Player.opened() && Lampa.Player.close();
                        var a = [],
                            r = t.getQuality(n),
                            l = n.find(function(e) {
                                return e.subtitles;
                            });
                        e.translates.forEach(function(n) {
                            a.find(function(e) {
                                return M.compareVoice(e.name, n.translate);
                            }) || a.push({
                                selected: M.compareVoice(i, n.translate),
                                name: n.translate,
                                title: n.translate,
                                label: n.lang,
                                onSelect: function() {
                                    t.voice.set(n.translate), Lampa.Player.loading(true), t.movie(e);
                                }
                            });
                        }), a.find(function(e) {
                            return e.selected;
                        }) || (a[0].selected = true);
                        var s = {
                            title: t.object.movie.title || t.object.movie.name,
                            url: n.length ? Lampa.Player.getUrlQuality(r) : "nofound",
                            quality: r,
                            timeline: Lampa.Timeline.view(o),
                            subtitles: !!l && l.subtitles,
                            card: t.object.movie,
                            voiceovers: a,
                            error: function(e, n) {
                                t.on_error_timer = setTimeout(function() {
                                    t.getNextVoice(e, a, n);
                                }, 2e3);
                            }
                        };
                        Lampa.Player.runas("inner"), Lampa.Player.play(s), t.setFlowsForQuality(s);
                    }) : M.selectChoiceTranstale(e.translates, i, function(n) {
                        t.voice.set(M.voice(n)), t.extract.links([e.translates.filter(function(e) {
                            return M.compareVoice(M.voice(e), M.voice(n));
                        })]).then(function(e) {
                            if (0 == e.length) return Lampa.Bell.push({
                                text: "Не удалось найти ссылок, выберите другой перевод",
                                time: 5e3
                            });
                            var n = t.getQuality(e),
                                i = e.find(function(e) {
                                    return e.subtitles;
                                }),
                                a = t.extract.flows(n);
                            M.selectChoiceFlow(a, function(e) {
                                var n = {
                                    title: t.object.movie.title || t.object.movie.name,
                                    url: e.url,
                                    timeline: Lampa.Timeline.view(o),
                                    subtitles: !!i && i.subtitles
                                };
                                Lampa.Player.play(n);
                            });
                        }).catch(function(e) {
                            t.extract.error(e);
                        });
                    });
                }
            }, {
                key: "tv",
                value: function(e, t, n) {
                    var i = this,
                        a = [],
                        o = [],
                        r = this.voice.get();
                    Lampa.Controller.toggle("content"), M.sortDUBTranstale(e.translates), e.translates.forEach(function(a) {
                        o.find(function(e) {
                            return M.compareVoice(e.name, a.name);
                        }) || o.push({
                            name: a.name,
                            title: a.name,
                            selected: M.compareVoice(a.name, r),
                            onSelect: function() {
                                i.voice.set(a.name), Lampa.Player.loading(true), i.extract.voice(e.sources).then(function(a) {
                                    a.sources = e.sources, i.tv(a, t, n);
                                }).catch(function(e) {}).finally(function() {
                                    Lampa.Player.loading(false);
                                });
                            }
                        });
                    }), o.find(function(e) {
                        return e.selected;
                    }) || (o[0].selected = true), t.forEach(function(t) {
                        if (e.plays.find(function(e) {
                                return e.e == t.number;
                            })) {
                            var r = {
                                number: t.number,
                                title: t.title,
                                timeline: t.timeline,
                                launch_player: "inner",
                                url: function(n) {
                                    "inner" == M.player() ? (Lampa.Player.loading(true), i.extract.links([e.plays.filter(function(e) {
                                        return e.e == t.number;
                                    })]).then(function(e) {
                                        0 == e.length ? (r.url = "nofound", n()) : (r.quality = i.getQuality(e), r.url = Lampa.Player.getUrlQuality(r.quality), n(), setTimeout(function() {
                                            i.setFlowsForQuality(Lampa.Player.playdata());
                                        }, 100));
                                    }).catch(function() {
                                        r.url = "nofound", n();
                                    }).finally(function() {
                                        Lampa.Player.loading(false);
                                    })) : M.selectChoiceTranstale(e.translates, M.voice(o.find(function(e) {
                                        return e.selected;
                                    })), function(n) {
                                        i.voice.set(M.voice(n)), i.extract.voice(e.sources).then(function(e) {
                                            return i.extract.links([e.plays.filter(function(e) {
                                                return e.e == t.number;
                                            })]);
                                        }).then(function(e) {
                                            if (0 == e.length) throw new Error(700);
                                            var n = i.getQuality(e),
                                                a = e.find(function(e) {
                                                    return e.subtitles;
                                                }),
                                                o = i.extract.flows(n);
                                            M.selectChoiceFlow(o, function(e) {
                                                var n = {
                                                    title: t.title,
                                                    url: e.url,
                                                    timeline: t.timeline,
                                                    subtitles: !!a && a.subtitles
                                                };
                                                t.mark(), Lampa.Player.play(n);
                                            });
                                        }).catch(function(e) {
                                            i.extract.error(e);
                                        });
                                    });
                                },
                                card: i.object.movie,
                                voiceovers: o,
                                callback: function() {
                                    t.mark(), n = t;
                                },
                                error: function(e, t) {
                                    i.on_error_timer = setTimeout(function() {
                                        i.getNextVoice(e, o, t);
                                    }, 2e3);
                                }
                            };
                            a.push(r);
                        }
                    });
                    var l = a.find(function(e) {
                        return e.number == n.number;
                    });
                    if (!l) return M.modalChoiceTranstale({
                        from: o.find(function(e) {
                            return e.selected;
                        }).name,
                        voicelist: o
                    });
                    l.url(function() {
                        Lampa.Player.opened() && Lampa.Player.close(), Lampa.Player.runas("inner"), Lampa.Player.play(l), Lampa.Player.playlist(a), setTimeout(function() {
                            i.setFlowsForQuality(Lampa.Player.playdata());
                        }, 100);
                    });
                }
            }] && n(e.prototype, [{
                key: "getQuality",
                value: function(e) {
                    var t = this,
                        n = {};
                    e.forEach(function(e) {
                        var i = e.quality,
                            a = function(e) {
                                var a = parseInt(e),
                                    o = t.getSplitLinks(i[e]);
                                n[e] ? n[e].reserve = n[e].reserve.concat(o) : n[e] = {
                                    label: a > 1440 ? "4K" : a >= 1440 ? "2K" : a >= 1080 ? "FHD" : a >= 720 ? "HD" : "",
                                    url: o[0],
                                    reserve: o.length > 1 ? o.slice(1) : [],
                                    used: [],
                                    error: [],
                                    trigger: function() {
                                        t.setFlowsForQuality(Lampa.Player.playdata());
                                    }
                                };
                            };
                        for (var o in i) t in o ? Object.defineProperty(o, t, {
                            value: n,
                            enumerable: true,
                            configurable: true,
                            writable: true
                        }) : o[t] = n, o;
                    });
                    var i = Lampa.Arrays.getKeys(n),
                        a = {};
                    return i.sort(function(e, t) {
                        return parseInt(t) - parseInt(e);
                    }), i.forEach(function(e) {
                        a[e] = n[e];
                    }), a;
                }
            }, {
                key: "getSplitLinks",
                value: function(e) {
                    return e.split(" or ");
                }
            }, {
                key: "getSelectedQuality",
                value: function(e) {
                    var t = null,
                        n = e.url,
                        i = e.quality;
                    if (e.quality_switched) {
                        for (var a in i)
                            if (a == e.quality_switched) {
                                t = i[a];
                                break;
                            }
                    } else
                        for (var a in i) {
                            var o = i[a];
                            if (o.url == n || o.reserve.indexOf(n) >= 0) {
                                t = o;
                                break;
                            }
                        }
                    if (!t)
                        for (var a in i) {
                            t = i[a];
                            break;
                        }
                    return t;
                }
            }, {
                key: "getQualityLevelDown",
                value: function(e) {
                    var t, n, i = this.getSelectedQuality(e);
                    for (var a in e.quality)
                        if (i == e.quality[a]) {
                            t = a;
                            break;
                        }
                    if (t) {
                        var o = Lampa.Arrays.getKeys(e.quality);
                        o.sort(function(e, t) {
                            return parseInt(t) - parseInt(e);
                        }), o.forEach(function(e) {
                            parseInt(e) < parseInt(t) && !n && parseInt(e) > 360 && (n = e);
                        });
                    }
                    return n;
                }
            }, {
                key: "getReserveQuality",
                value: function(e) {
                    var t = this.getSelectedQuality(e),
                        n = "";
                    return t && (t.error.push(Lampa.Manifest.app_digital >= 236 ? e.url : t.url), t.reserve.forEach(function(e) {
                        -1 != t.used.indexOf(e) || n || (n = e, t.used.push(e));
                    })), n;
                }
            }, {
                key: "getPlayData",
                value: function(e) {
                    var t = Lampa.Utils.hash(e.season ? [e.season, e.season > 10 ? ":" : "", e.episode, this.object.movie.original_title].join("") : this.object.movie.original_title),
                        n = this.getQuality(e.quality);
                    return {
                        title: this.object.movie.title || this.object.movie.name,
                        url: Lampa.Player.getUrlQuality(n),
                        quality: n,
                        timeline: Lampa.Timeline.view(t),
                        translate_name: e.translate,
                        card: this.object.movie
                    };
                }
            }, {
                key: "getNextVoice",
                value: function(e, t, n) {
                    var i = this.getSelectedQuality(e);
                    if (i && (0 == i.reserve.length || i.used.length == i.reserve.length)) {
                        var a = this.getQualityLevelDown(e);
                        a ? (e.quality_switched = a, i = this.getSelectedQuality(e), Lampa.Arrays.remove(i.reserve, i.url), Lampa.Arrays.insert(i.reserve, 0, i.url)) : i = null;
                    }
                    i ? (e.url = this.getReserveQuality(e), n(e.url || "nofound"), this.setFlowsForQuality(e)) : M.modalChoiceTranstale({
                        from: t.find(function(e) {
                            return e.selected;
                        }).name,
                        voicelist: t
                    });
                }
            }, {
                key: "setFlowsForQuality",
                value: function(e) {
                    var t = this.getSelectedQuality(e);
                    if (t) {
                        var n = [],
                            i = [t.url].concat(t.reserve.filter(function(e) {
                                return e !== t.url;
                            })).filter(function(e) {
                                return -1 == t.error.indexOf(e);
                            });
                        i.length > 1 && i.forEach(function(e, i) {
                            n.push({
                                title: "Поток " + (i + 1),
                                subtitle: Lampa.Utils.shortText(e, 35),
                                url: e,
                                selected: e == t.url
                            });
                        }), Lampa.PlayerPanel.setFlows(!!n.length && n);
                    }
                }
            }, {
                key: "movie",
                value: function(e) {
                    var t = this,
                        n = M.player();
                    e.translates.sort(function(e, t) {
                        var n = parseInt(e.maxquality) || 0,
                            i = parseInt(t.maxquality) || 0;
                        if (i !== n) return i - n;
                        var a = O.filter_db.filter(function(t) {
                                return e.translate.toLowerCase().indexOf(t.toLowerCase()) >= 0;
                            }).length,
                            o = O.filter_db.filter(function(e) {
                                return t.translate.toLowerCase().indexOf(e.toLowerCase()) >= 0;
                            }).length;
                        return a && !o ? -1 : !a && o ? 1 : 0;
                    });
                    var i = M.voice(e.translates[0]),
                        a = e.translates.filter(function(e) {
                            return M.compareVoice(M.voice(e), i);
                        }),
                        o = Lampa.Utils.hash(this.object.movie.original_title);
                    "inner" == n ? this.extract.links([a]).then(function(n) {
                        Lampa.Player.opened() && Lampa.Player.close();
                        var a = [],
                            r = t.getQuality(n),
                            l = n.find(function(e) {
                                return e.subtitles;
                            });
                        e.translates.forEach(function(n) {
                            a.find(function(e) {
                                return M.compareVoice(e.name, n.translate);
                            }) || a.push({
                                selected: M.compareVoice(i, n.translate),
                                name: n.translate,
                                title: n.translate,
                                label: n.lang,
                                onSelect: function() {
                                    t.voice.set(n.translate), Lampa.Player.loading(true), t.movie(e);
                                }
                            });
                        }), a.find(function(e) {
                            return e.selected;
                        }) || (a[0].selected = true);
                        var s = {
                            title: t.object.movie.title || t.object.movie.name,
                            url: n.length ? Lampa.Player.getUrlQuality(r) : "nofound",
                            quality: r,
                            timeline: Lampa.Timeline.view(o),
                            subtitles: !!l && l.subtitles,
                            card: t.object.movie,
                            voiceovers: a,
                            error: function(e, n) {
                                t.on_error_timer = setTimeout(function() {
                                    t.getNextVoice(e, a, n);
                                }, 2e3);
                            }
                        };
                        Lampa.Player.runas("inner"), Lampa.Player.play(s), t.setFlowsForQuality(s);
                    }) : M.selectChoiceTranstale(e.translates, i, function(n) {
                        t.voice.set(M.voice(n)), t.extract.links([e.translates.filter(function(e) {
                            return M.compareVoice(M.voice(e), M.voice(n));
                        })]).then(function(e) {
                            if (0 == e.length) return Lampa.Bell.push({
                                text: "Не удалось найти ссылок, выберите другой перевод",
                                time: 5e3
                            });
                            var n = t.getQuality(e),
                                i = e.find(function(e) {
                                    return e.subtitles;
                                }),
                                a = t.extract.flows(n);
                            M.selectChoiceFlow(a, function(e) {
                                var n = {
                                    title: t.object.movie.title || t.object.movie.name,
                                    url: e.url,
                                    timeline: Lampa.Timeline.view(o),
                                    subtitles: !!i && i.subtitles
                                };
                                Lampa.Player.play(n);
                            });
                        }).catch(function(e) {
                            t.extract.error(e);
                        });
                    });
                }
            }, {
                key: "tv",
                value: function(e, t, n) {
                    var i = this,
                        a = [],
                        o = [],
                        r = this.voice.get();
                    Lampa.Controller.toggle("content"), M.sortDUBTranstale(e.translates), e.translates.forEach(function(a) {
                        o.find(function(e) {
                            return M.compareVoice(e.name, a.name);
                        }) || o.push({
                            name: a.name,
                            title: a.name,
                            selected: M.compareVoice(a.name, r),
                            onSelect: function() {
                                i.voice.set(a.name), Lampa.Player.loading(true), i.extract.voice(e.sources).then(function(a) {
                                    a.sources = e.sources, i.tv(a, t, n);
                                }).catch(function(e) {}).finally(function() {
                                    Lampa.Player.loading(false);
                                });
                            }
                        });
                    }), o.find(function(e) {
                        return e.selected;
                    }) || (o[0].selected = true), t.forEach(function(t) {
                        if (e.plays.find(function(e) {
                                return e.e == t.number;
                            })) {
                            var r = {
                                number: t.number,
                                title: t.title,
                                timeline: t.timeline,
                                launch_player: "inner",
                                url: function(n) {
                                    "inner" == M.player() ? (Lampa.Player.loading(true), i.extract.links([e.plays.filter(function(e) {
                                        return e.e == t.number;
                                    })]).then(function(e) {
                                        0 == e.length ? (r.url = "nofound", n()) : (r.quality = i.getQuality(e), r.url = Lampa.Player.getUrlQuality(r.quality), n(), setTimeout(function() {
                                            i.setFlowsForQuality(Lampa.Player.playdata());
                                        }, 100));
                                    }).catch(function() {
                                        r.url = "nofound", n();
                                    }).finally(function() {
                                        Lampa.Player.loading(false);
                                    })) : M.selectChoiceTranstale(e.translates, M.voice(o.find(function(e) {
                                        return e.selected;
                                    })), function(n) {
                                        i.voice.set(M.voice(n)), i.extract.voice(e.sources).then(function(e) {
                                            return i.extract.links([e.plays.filter(function(e) {
                                                return e.e == t.number;
                                            })]);
                                        }).then(function(e) {
                                            if (0 == e.length) throw new Error(700);
                                            var n = i.getQuality(e),
                                                a = e.find(function(e) {
                                                    return e.subtitles;
                                                }),
                                                o = i.extract.flows(n);
                                            M.selectChoiceFlow(o, function(e) {
                                                var n = {
                                                    title: t.title,
                                                    url: e.url,
                                                    timeline: t.timeline,
                                                    subtitles: !!a && a.subtitles
                                                };
                                                t.mark(), Lampa.Player.play(n);
                                            });
                                        }).catch(function(e) {
                                            i.extract.error(e);
                                        });
                                    });
                                },
                                card: i.object.movie,
                                voiceovers: o,
                                callback: function() {
                                    t.mark(), n = t;
                                },
                                error: function(e, t) {
                                    i.on_error_timer = setTimeout(function() {
                                        i.getNextVoice(e, o, t);
                                    }, 2e3);
                                }
                            };
                            a.push(r);
                        }
                    });
                    var l = a.find(function(e) {
                        return e.number == n.number;
                    });
                    if (!l) return M.modalChoiceTranstale({
                        from: o.find(function(e) {
                            return e.selected;
                        }).name,
                        voicelist: o
                    });
                    l.url(function() {
                        Lampa.Player.opened() && Lampa.Player.close(), Lampa.Player.runas("inner"), Lampa.Player.play(l), Lampa.Player.playlist(a), setTimeout(function() {
                            i.setFlowsForQuality(Lampa.Player.playdata());
                        }, 100);
                    });
                }
            }]), i && n(e, i), Object.defineProperty(e, "prototype", {
                writable: false
            }), e, e;
        }(),
        G = function() {
            function e(n) {
                t(this, e);
                var i = this;
                if (this.object = n, Lampa.Storage.get(p, false)) {
                    if (!Lampa.Storage.get(f, "")) return void Lampa.Noty.show("BWA код не указан. Укажите его в настройках.");
                    ! function(e) {
                        var t = Lampa.Storage.get(f, "");
                        if (t)
                            if (I) e && e(true);
                            else {
                                var n = "http://" + h + "/online/js/" + t;
                                Lampa.Utils.putScriptAsync([n], function() {
                                    I = true, e && e(true);
                                });
                            }
                        else e && e(false);
                    }(function(e) {
                        i.startPlay();
                    });
                } else {
                    if (!k()) return void Lampa.Noty.show("Сервер не указан. Добавьте сервер в настройках.");
                    this.startPlay();
                }
            }
            return [{
                key: "startPlay",
                value: function() {
                    this.object.movie.name ? this.tv() : this.movie();
                }
            }, {
                key: "movie",
                value: function() {
                    var e = this,
                        t = new z(this.object),
                        n = new q(this.object);
                    Lampa.Loading.start(), t.movie({
                        movie: this.object.movie,
                        type: "movie"
                    }).then(function(t) {
                        Lampa.Loading.stop(), Lampa.Favorite.add("history", e.object.movie, 100), n.movie(t);
                    }).catch(function(e) {
                        Lampa.Loading.stop(), t.error(e);
                    });
                }
            }, {
                key: "tv",
                value: function() {
                    Lampa.Activity.push({
                        url: "",
                        title: "",
                        component: "episodes",
                        movie: this.object.movie,
                        page: 1
                    });
                }
            }] && n(e.prototype, [{
                key: "startPlay",
                value: function() {
                    this.object.movie.name ? this.tv() : this.movie();
                }
            }, {
                key: "movie",
                value: function() {
                    var e = this,
                        t = new z(this.object),
                        n = new q(this.object);
                    Lampa.Loading.start(), t.movie({
                        movie: this.object.movie,
                        type: "movie"
                    }).then(function(t) {
                        Lampa.Loading.stop(), Lampa.Favorite.add("history", e.object.movie, 100), n.movie(t);
                    }).catch(function(e) {
                        Lampa.Loading.stop(), t.error(e);
                    });
                }
            }, {
                key: "tv",
                value: function() {
                    Lampa.Activity.push({
                        url: "",
                        title: "",
                        component: "episodes",
                        movie: this.object.movie,
                        page: 1
                    });
                }
            }]), i && n(e, i), Object.defineProperty(e, "prototype", {
                writable: false
            }), e, e;
        }();

    function W(e) {
        var t, n = new Lampa.Explorer(e),
            i = new Lampa.Filter(e),
            a = new Lampa.Scroll({
                mask: true,
                over: true
            }),
            o = {
                season: 1
            },
            r = e.movie.number_of_seasons || 1,
            s = false,
            c = false;
        this.create = function() {
            var t = this;
            this.getChoice(), n.appendFiles(a.render()), n.appendHead(i.render()), a.body().addClass("torrent-list mapping--list"), n.render().find(".filter--search, .filter--sort").remove(), a.minus(n.render().find(".explorer__files-head")), this.activity.loader(true);
            var u = e.movie.id,
                d = e.movie.imdb_id,
                m = e.movie.tvdb_id,
                f = l.getSeasonsCount(u);

            function p() {
                s || Lampa.Api.seasons(e.movie, [1], function(e) {
                    if (!s) {
                        if (e[1] && e[1].seasons_count && e[1].seasons_count > r && (r = e[1].seasons_count), !c) {
                            var n = l.getSeasonsCount(u);
                            n && n > r && (r = n);
                        }
                        s = true, t.filter(), t.selected(), t.activity.loader(false), e[1] && e[1].episodes && e[1].episodes.length && 1 === o.season ? t.draw(e[1].episodes) : t.load();
                    }
                });
            }
            return f ? (r = f, c = true, p()) : (l.fetch(u, d, m, function(e) {
                c = true, e && e > r && (r = e), p();
            }), setTimeout(function() {
                s || p();
            }, 3e3)), this.activity.toggle(), this.render();
        }, this.setChoice = function(t) {
            o.season = t;
            var n = Lampa.Storage.cache("season_choice", "{}", 1e3);
            n[e.movie.id] = t, Lampa.Storage.set("season_choice", n);
        }, this.getChoice = function() {
            var t = Lampa.Storage.get("season_choice", "{}");
            t[e.movie.id] && (o.season = Math.max(1, t[e.movie.id]), s && o.season > r && (o.season = r));
        }, this.filter = function() {
            var e = this;
            i.addButtonBack(), i.onSelect = function(t, n) {
                e.setChoice(n.season), e.selected(), Lampa.Controller.toggle("content"), e.load();
            }, i.onBack = function() {
                e.start();
            };
        }, this.selected = function() {
            var e = [],
                t = [];
            for (var n in o) "season" == n && e.push(Lampa.Lang.translate("torrent_serial_season") + ": " + o[n]);
            for (var a = 0; a < r; a++) t.push({
                title: Lampa.Lang.translate("torrent_serial_season") + " " + (a + 1),
                season: a + 1,
                selected: o.season == a + 1
            });
            i.set("filter", t), i.chosen("filter", e);
        }, this.load = function() {
            var n = this;
            this.activity.loader(true);
            var i = o.season;
            Lampa.Api.clear(), Lampa.Api.seasons(e.movie, [i], function(e) {
                t = false, a.clear(), a.reset(), e[i] && e[i].episodes && e[i].episodes.length ? n.draw(e[i].episodes) : n.empty(), n.activity.loader(false);
            });
        }, this.empty = function() {
            var e = Lampa.Template.get("empty_filter"),
                t = $('<div class="simple-button selector"><span>' + Lampa.Lang.translate("filter_clarify") + "</span></div>");
            t.on("hover:enter", function() {
                i.render().find(".filter--filter").trigger("hover:enter");
            }), e.find(".empty-filter__title").remove(), e.find(".empty-filter__buttons").removeClass("hide").append(t), a.append(e), Lampa.Controller.enable("content");
        }, this.draw = function(n) {
            n.forEach(function(i, r) {
                var l = i.episode_number || r + 1,
                    s = Lampa.Utils.hash([o.season, o.season > 10 ? ":" : "", l, e.movie.original_title].join("")),
                    c = [],
                    u = new Date((i.air_date + "").replace(/-/g, "/")),
                    d = Date.now(),
                    m = i.air_date ? Math.round((u.getTime() - d) / 864e5) : 1,
                    f = Lampa.Lang.translate("full_episode_days_left") + ": " + (i.air_date ? m : "- -");
                i.timeline = Lampa.Timeline.view(s), i.time = Lampa.Utils.secondsToTime(60 * i.runtime, true), i.title = i.name || Lampa.Lang.translate("torrent_serial_episode") + " " + l, i.quality = m > 0 ? f : "", i.number = l, i.vote_average && c.push(Lampa.Template.get("season_episode_rate", {
                    rate: parseFloat(i.vote_average + "").toFixed(1)
                }, true)), i.air_date && c.push(Lampa.Utils.parseTime(i.air_date).full), i.info = c.length ? c.map(function(e) {
                    return "<span>" + e + "</span>";
                }).join('<span class="season-episode-split">●</span>') : "";
                var p = Lampa.Template.get("season_episode", i),
                    h = p.find(".season-episode__loader"),
                    v = p.find(".season-episode__img"),
                    g = function(e) {
                        p.find(".season-episode__viewed").remove(), (Boolean(i.timeline.percent) || e) && p.find(".season-episode__img").append('<div class="season-episode__viewed">' + Lampa.Template.get("icon_viewed", {}, true) + "</div>");
                    };
                i.mark = function() {
                    t = p[0], g(true);
                }, p.find(".season-episode__timeline").append(Lampa.Timeline.render(i.timeline)), m > 0 ? p.css("opacity", "0.5") : (g(), Boolean(i.timeline.percent) && (t = p[0]), p.on("hover:enter", function() {
                    Lampa.Loading.start();
                    var r = new z(e),
                        s = new q(e);
                    r.tv({
                        movie: e.movie,
                        season: o.season,
                        episode: l,
                        type: "episode"
                    }).then(function(o) {
                        Lampa.Loading.stop(), Lampa.Favorite.add("history", e.movie, 100), s.tv(o, n, i), i.mark(), Lampa.Player.callback(function() {
                            a.update($(t), true), Lampa.Controller.toggle("content");
                        });
                    }).catch(function(e) {
                        Lampa.Loading.stop(), r.error(e);
                    });
                })), p.on("hover:focus", function(e) {
                    t = e.target, a.update($(e.target), true);
                }).on("visible", function() {
                    var e = p.find("img")[0];
                    e.onerror = function() {
                        e.src = "./img/img_broken.svg";
                    }, e.onload = function() {
                        v.addClass("season-episode__img--loaded"), h.remove(), v.append('<div class="season-episode__episode-number">' + ("0" + l).slice(-2) + "</div>");
                    }, i.still_path ? e.src = Lampa.TMDB.image("t/p/w300" + i.still_path) : i.img ? e.src = i.img : (h.remove(), v.append('<div class="season-episode__episode-number">' + ("0" + l).slice(-2) + "</div>"));
                }).on("hover:hover hover:touch", function(e) {
                    t = e.target, Navigator.focused(t);
                }), a.append(p);
            }), t && a.update($(t), true), Lampa.Layer.visible(a.render(true)), Lampa.Controller.enable("content");
        }, this.start = function() {
            Lampa.Activity.active().activity === this.activity && (Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(e.movie)), Lampa.Controller.add("content", {
                toggle: function() {
                    Lampa.Controller.collectionSet(a.render(), n.render()), Lampa.Controller.collectionFocus(t || false, a.render());
                },
                left: function() {
                    n.toggle();
                },
                right: function() {
                    i.show(Lampa.Lang.translate("title_filter"), "filter");
                },
                up: function() {
                    Navigator.canmove("up") ? Navigator.move("up") : Lampa.Controller.toggle("head");
                },
                down: function() {
                    Navigator.canmove("down") && Navigator.move("down");
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            }), Lampa.Controller.toggle("content"));
        }, this.pause = function() {}, this.stop = function() {}, this.render = function() {
            return n.render();
        }, this.destroy = function() {
            a.destroy(), i.destroy(), n.destroy();
            try {
                Lampa.Api.clear();
            } catch (e) {}
        };
    }

    function H(e) {
        Lampa.Input.edit({
            title: "Адрес сервера",
            value: "",
            placeholder: "192.168.1.1:9118",
            nosave: true,
            free: true,
            nomic: true
        }, function(t) {
            t && w(t) && _(b().length - 1);
            e && e(t);
        });
    }

    function K(e) {
        var t = Lampa.Controller.enabled().name,
            n = x(),
            i = g.map(function(e) {
                return {
                    title: e.name,
                    source: e.id,
                    checkbox: true,
                    checked: -1 !== n.indexOf(e.id)
                };
            });
        Lampa.Select.show({
            title: "Выбор источников",
            items: i,
            onBack: function() {
                var n, a = i.filter(function(e) {
                    return e.checked;
                }).map(function(e) {
                    return e.source;
                });
                0 === a.length && (a = y()), n = a, Lampa.Storage.set(d, n), Lampa.Controller.toggle(t), e && e();
            },
            onSelect: function(e) {
                e.checked = !e.checked;
            }
        });
    }

    function Q() {
        var e = Lampa.Controller.enabled().name,
            t = function() {
                var e = Lampa.Storage.get(m, []);
                if ("string" == typeof e) try {
                    e = JSON.parse(e);
                } catch (t) {
                    e = [];
                }
                return Lampa.Arrays.isArray(e) ? e : [];
            }();
        t.length > 0 ? J(t, e) : Z(e);
    }

    function J(e, t) {
        var n = [];
        var a = b().map(i);
        n.push({
            title: "Обновить список",
            refresh: true
        }), n.push({
            title: "Публичные серверы",
            separator: true
        }), e.forEach(function(e) {
            var t = e.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase(),
                o = -1 !== a.indexOf(t);
            n.push({
                title: e.replace(/^https?:\/\//, ""),
                url: e,
                subtitle: o ? "Уже добавлен" : ""
            });
        }), Lampa.Select.show({
            title: "Публичные серверы (" + e.length + ")",
            items: n,
            onBack: function() {
                Lampa.Controller.toggle(t);
            },
            onSelect: function(e) {
                if (!e.separator) {
                    if (e.refresh) return Lampa.Select.close(), void Z(t, true);
                    if (w(e.url)) {
                        _(b().length - 1), Lampa.Settings.update();
                    } else {
                        var n = b().indexOf(e.url); -
                        1 !== n && (_(n), Lampa.Settings.update());
                    }
                    Lampa.Controller.toggle(t);
                }
            }
        });
    }

    function Z(e, t) {
        Lampa.Noty.show("Загрузка...");
        var n = new Lampa.Reguest;
        n.timeout(1e4), n.silent("https://ipavlin98.github.io/lampac-links/working_online_lampa.json", function(t) {
            if (Lampa.Arrays.isArray(t) && 0 !== t.length) {
                var n = [];
                if (t.forEach(function(e) {
                        e.base_url && n.push(e.base_url);
                    }), 0 !== n.length) {
                    var i, a = [],
                        o = 0,
                        r = n.length;
                    l(), i = setInterval(l, 2e3), n.forEach(function(t) {
                        ! function(e, t) {
                            var n = e.replace(/\/+$/, "");
                            0 !== n.indexOf("http://") && 0 !== n.indexOf("https://") && (n = "http://" + n);
                            var i = n + "/lite/events?life=true&id=76600&imdb_id=tt1630029&kinopoisk_id=505898&serial=0&title=Avatar: The Way of Water&original_title=Avatar: The Way of Water&original_language=en&year=2022&source=tmdb&clarification=0&similar=false&rchtype=&uid=guest&device_id=",
                                a = 0,
                                o = "";

                            function r(e) {
                                for (var t = 0; t < e.length; t++) {
                                    var n = e[t],
                                        i = (n.balanser || n.name || "").toLowerCase();
                                    if (-1 !== i.indexOf("mirage") || -1 !== i.indexOf("alloha")) return true;
                                }
                                return false;
                            }! function e() {
                                var l = new Lampa.Reguest;
                                l.timeout(5e3);
                                var s = o ? n + "/lifeevents?memkey=" + o + "&id=76600&imdb_id=tt1630029&kinopoisk_id=505898&serial=0&title=Avatar: The Way of Water&original_title=Avatar: The Way of Water&original_language=en&year=2022&source=tmdb&clarification=0&similar=false&rchtype=&uid=guest&device_id=" : i;
                                l.silent(s, function(n) {
                                    var i = n && n.online ? n.online : Lampa.Arrays.isArray(n) ? n : [];
                                    n && n.accsdb ? t(false) : (n && n.memkey && (o = n.memkey), n && n.ready || ++a >= 15 ? t(r(i)) : setTimeout(e, 1e3));
                                }, function() {
                                    t(false);
                                });
                            }();
                        }(t, function(n) {
                            if (o++, n && a.push(t), l(), o === r) {
                                if (clearInterval(i), 0 === a.length) return void Lampa.Noty.show("Рабочие серверы не найдены");
                                s = a, Lampa.Storage.set(m, s), J(a, e);
                            }
                            var s;
                        });
                    });
                } else Lampa.Noty.show("Серверы не найдены");
            } else Lampa.Noty.show("Серверы не найдены");

            function l() {
                Lampa.Noty.show("Проверка серверов " + o + "/" + r);
            }
        }, function() {
            Lampa.Noty.show("Ошибка загрузки");
        });
    }

    function X() {
        Lampa.Settings.listener.follow("open", function(e) {
            "main" == e.name && (0 == Lampa.Settings.main().render().find('[data-component="online_settings"]').length && Lampa.SettingsApi.addComponent({
                component: "online_settings",
                name: "HFix",
                icon: v,
                before: "interface"
            }), Lampa.Settings.main().update());
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_mode_title",
                type: "title"
            },
            field: {
                name: "Режим работы"
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_use_bwa_toggle",
                type: "trigger",
                default: false
            },
            field: {
                name: "Использовать BWA",
                description: "Переключить между сервером и BWA"
            },
            onChange: function(e) {
                T(e);
            },
            onRender: function(e) {
                e.find(".settings-param__value").text(Lampa.Storage.get(p, false) ? "Да" : "Нет"), e.on("hover:enter", function() {
                    T(!Lampa.Storage.get(p, false)), e.find(".settings-param__value").text(Lampa.Storage.get(p, false) ? "Да" : "Нет");
                });
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_bwa_code_btn",
                type: "static"
            },
            field: {
                name: "BWA код",
                description: "Введите код от bwa.to (например: abc1xyz)"
            },
            onRender: function(e) {
                var t = Lampa.Storage.get(f, "");
                e.find(".settings-param__value").text(t || "Не указан"), e.on("hover:enter", function() {
                    var t, n;
                    t = function() {
                        var t = Lampa.Storage.get(f, "");
                        e.find(".settings-param__value").text(t || "Не указан");
                    }, n = Lampa.Storage.get(f, ""), Lampa.Input.edit({
                        title: "BWA код",
                        value: n,
                        placeholder: "abc1xyz",
                        nosave: true,
                        free: true,
                        nomic: true
                    }, function(e) {
                        null !== e ? (function(e) {
                            Lampa.Storage.set(f, e);
                        }(e = e.trim()), e && (T(true), Lampa.Noty.show("BWA код сохранён")), t && t()) : t && t();
                    });
                });
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_server_title",
                type: "title"
            },
            field: {
                name: "Свой сервер"
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_add_server_btn",
                type: "static"
            },
            field: {
                name: "Добавить сервер",
                description: "Например: 192.168.1.1:9118"
            },
            onRender: function(e) {
                e.on("hover:enter", function() {
                    H(function() {
                        Lampa.Settings.update();
                    });
                });
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_load_public_btn",
                type: "static"
            },
            field: {
                name: "Загрузить публичные серверы",
                description: "Загрузить список бесплатных серверов"
            },
            onRender: function(e) {
                e.on("hover:enter", function() {
                    Q();
                });
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_sources_title",
                type: "title"
            },
            field: {
                name: "Источники"
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_sources_btn",
                type: "static"
            },
            field: {
                name: "Выбор источников",
                description: "Выбрать балансеры для поиска"
            },
            onRender: function(e) {
                e.on("hover:enter", function() {
                    K();
                });
            }
        }), Lampa.SettingsApi.addParam({
            component: "online_settings",
            param: {
                name: "online_servers_title",
                type: "title"
            },
            field: {
                name: "Список серверов"
            }
        }), Lampa.Settings.listener.follow("open", function(e) {
            "online_settings" == e.name && Y(e.body);
        });
    }

    function Y(e) {
        e.find(".online-server-item").remove();
        var t = b(),
            n = L(),
            i = e.find(".settings-param-title").last();
        if (i.length || (i = e.find(".settings-param").last()), t.forEach(function(t, a) {
                var o = a === n,
                    r = $('<div class="settings-param selector online-server-item" data-server-index="' + a + '"><div class="settings-param__name">' + t.replace(/^https?:\/\//, "") + '</div><div class="settings-param__value"></div>' + (o ? '<div class="settings-param__descr">Текущий сервер</div>' : "") + "</div>");
                r.on("hover:enter", function() {
                    ! function(e, t) {
                        var n = b(),
                            i = L(),
                            a = e === i,
                            o = [];
                        a || o.push({
                            title: "Выбрать",
                            select: true
                        });
                        o.push({
                            title: "Редактировать",
                            edit: true
                        }), o.push({
                            title: "Удалить",
                            remove: true
                        });
                        var r = Lampa.Controller.enabled().name;
                        Lampa.Select.show({
                            title: n[e].replace(/^https?:\/\//, ""),
                            items: o,
                            onBack: function() {
                                Lampa.Controller.toggle(r);
                            },
                            onSelect: function(i) {
                                i.select ? (_(e), Lampa.Controller.toggle(r), t && t()) : i.edit ? Lampa.Input.edit({
                                    title: "Адрес сервера",
                                    value: n[e],
                                    placeholder: "192.168.1.1:9118",
                                    nosave: true,
                                    free: true,
                                    nomic: true
                                }, function(i) {
                                    i && i !== n[e] && (n[e] = i, Lampa.Storage.set(c, n)), Lampa.Controller.toggle(r), t && t();
                                }) : i.remove && (S(e), Lampa.Controller.toggle(r), t && t());
                            }
                        });
                    }(a, function() {
                        Y(e);
                    });
                }), i.after(r), i = r;
            }), 0 === t.length) {
            var a = $('<div class="settings-param online-server-item"><div class="settings-param__name" style="opacity: 0.5">Не указан</div></div>');
            i.after(a);
        }
        e.find(".online-server-item").on("hover:focus", function() {
            Lampa.Params.listener.send("update_scroll_position");
        }), Lampa.Params.listener.send("update_scroll");
    }! function() {
        if (!window.plugin_init) {
            window.plugin_init = true, X(), Lampa.Component.add("episodes", W), Lampa.VPN.region(function() {}), Lampa.Listener.follow("full", function(e) {
                if ("complite" == e.type) {
                    var t = '<div class="full-start__button selector view--online" data-subtitle="' + (Lampa.Storage.get(p, false) ? "BWA: " + (Lampa.Storage.get(f, "") ? Lampa.Storage.get(f, "").substring(0, 2) + "****" : "не указан") : "Сервер: " + (k().replace(/^https?:\/\//, "") || "не указан")) + '">' + v + "<span>Онлайн</span></div>",
                        n = $(Lampa.Lang.translate(t));
                    e.object.activity.render().find(".view--torrent").after(n), n.on("hover:enter", function() {
                        Lampa.Controller.toggle("content"), new G(e.data);
                    });
                }
            });
            $("body").append("\n			<style>\n				.connect-broken {\n					text-align: center;\n					padding-bottom: 1em;\n				}\n\n				.connect-broken__title {\n					font-size: 2em;\n					line-height: 1.4;\n				}\n\n				.connect-broken__text {\n					font-size: 1.2em;\n					padding-top: 1em;\n					line-height: 1.4;\n				}\n\n				.connect-broken__footer {\n					display: flex;\n					justify-content: center;\n					margin-top: 2em;\n				}\n\n				.connect-broken__footer .simple-button {\n					margin: 0;\n				}\n\n				.modal-qr {\n					display: flex;\n					align-items: center;\n				}\n\n				.modal-qr__left {\n					width: 33%;\n					flex-shrink: 0;\n				}\n\n				.modal-qr__right {\n					padding-left: 2em;\n				}\n\n				.modal-qr__scan {\n					text-align: center;\n					padding: 1em;\n					background: #fff;\n					border-radius: 1em;\n					color: #000;\n				}\n\n				.modal-qr__img {\n					position: relative;\n					width: 100%;\n					padding-bottom: 100%;\n					overflow: hidden;\n				}\n\n				.modal-qr__img img {\n					position: absolute;\n					top: 0;\n					left: 0;\n					width: 100%;\n					height: 100%;\n					opacity: 0;\n					transition: opacity .2s;\n				}\n\n				.modal-qr__img img.loaded {\n					opacity: 1;\n				}\n\n				.modal-qr__bot {\n					font-size: 1.2em;\n					font-weight: 600;\n				}\n\n				.modal-qr__text {\n					font-size: 1.2em;\n					line-height: 1.6;\n				}\n\n				.modal-qr__text + .modal-qr__text {\n					margin-top: 3em;\n				}\n			</style>\n		");
        }
    }();
}();
