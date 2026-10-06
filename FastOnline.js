"use strict";

function _typeof(e) {
    return (_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ?
        function(e) {
            return typeof e
        } :
        function(e) {
            return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ?
                "symbol" :
                typeof e
        })(e)
}

! function() {
    function e(e, t) {
        var n = Object.keys(e);
        if (Object.getOwnPropertySymbols) {
            var i = Object.getOwnPropertySymbols(e);
            t && (i = i.filter((function(t) {
                return Object.getOwnPropertyDescriptor(e, t).enumerable
            }))), n.push.apply(n, i)
        }
        return n
    }

    function t(e, t) {
        if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function")
    }

    function n(e, t) {
        for (var n = 0; n < t.length; n++) {
            var i = t[n];
            i.enumerable = i.enumerable || !1, i.configurable = !0,
                "value" in i && (i.writable = !0), Object.defineProperty(e, i.key, i)
        }
    }

    function i(e, t, i) {
        return t && n(e.prototype, t), i && n(e, i), Object.defineProperty(e, "prototype", {
            writable: !1
        }), e
    }

    function a(e, t, n) {
        return t in e ? Object.defineProperty(e, t, {
            value: n,
            enumerable: !0,
            configurable: !0,
            writable: !0
        }) : e[t] = n, e
    }
    var o = function() {
        function e(n) {
            n = n || {};
            var m = n.movie || {},
                stable = [m.source || "tmdb", m.tmdb_id || m.id || "", m.imdb_id || "", m.original_title || m.original_name || "", (m.release_date || m.first_air_date || "").slice(0, 4)].join("|");
            t(this, e), this.hash = Lampa.Utils.hash(stable), this.legacy_hash = Lampa.Utils.hash(m.original_title || m.original_name || ""), this.field = "fastonline_selected_voice_v2", this.legacy_field = "online_selected_voice"
        }
        return i(e, [{
            key: "get",
            value: function() {
                var current = Lampa.Storage.get(this.field, "{}") || {},
                    value = current[this.hash] || "";
                if (value) return value;
                var legacy = Lampa.Storage.get(this.legacy_field, "{}") || {};
                return legacy[this.legacy_hash] || ""
            }
        }, {
            key: "set",
            value: function(e) {
                var t = Lampa.Storage.get(this.field, "{}") || {};
                t[this.hash] = e, Lampa.Storage.set(this.field, t)
            }
        }]), e
    }();

    function r(e) {
        this.data = {}, this.work = 0, this.need = e, this.complited = !1, this.check = function() {
            this.stopped || this.work >= this.need && !this.complited && (this.complited = !0, this.onComplite(this.data))
        }, this.next = function() {
            this.work++, this.check()
        }, this.append = function(e, t) {
            this.work++, this.data[e] = t, this.check()
        }, this.error = function() {
            this.work++, this.check()
        }, this.stop = function() {
            this.stopped = !0
        }
    }
    var l = {
        cache: {},
        pending: {},
        getCache: function() {
            return window.SEASON_FIX && window.SEASON_FIX.tvmaze_cache ? window.SEASON_FIX.tvmaze_cache : this.cache
        },
        getSeasonsCount: function(e) {
            var t = this.getCache()[e];
            return t && "object" === _typeof(t) && Object.keys(t).length > 0 ? Object.keys(t).length : null
        },
        fetch: function(e, t, n, i) {
            var a = this,
                o = this.getCache();
            if (o[e] && "object" === _typeof(o[e])) i && i(Object.keys(o[e]).length);
            else if ("loading" === o[e] || this.pending[e]) i && (this.pending[e] || (this.pending[e] = []), this.pending[e].push(i));
            else {
                o[e] = "loading", i && (this.pending[e] = [i]);
                t || n ? this.fetchFromTvmaze(e, t, n) : this.fetchExternalIds(e, (function(t) {
                    t && (t.imdb_id || t.tvdb_id) ? a.fetchFromTvmaze(e, t.imdb_id, t.tvdb_id) : a.finishPending(e, null)
                }))
            }
        },
        fetchExternalIds: function(e, t) {
            var n = Lampa.TMDB && Lampa.TMDB.key ? Lampa.TMDB.key() : null;
            if (n) {
                var i = Lampa.TMDB && Lampa.TMDB.api ? Lampa.TMDB.api("tv/" + e + "/external_ids?api_key=" + n) : "https://api.themoviedb.org/3/tv/" + e + "/external_ids?api_key=" + n;
                this.request(i, t)
            } else t(null)
        },
        fetchFromTvmaze: function(e, t, n) {
            var i = this,
                a = t || n;
            if (a) {
                var o = "https://api.tvmaze.com/lookup/shows?" + (t ? "imdb" : "thetvdb") + "=" + a;
                this.request(o, (function(t) {
                    if (t && t.id) {
                        var n = "https://api.tvmaze.com/shows/" + t.id + "/episodes";
                        i.request(n, (function(t) {
                            if (t && t.length) {
                                for (var n = {}, a = 0; a < t.length; a++) {
                                    var o = t[a].season;
                                    n[o] || (n[o] = 0), n[o]++
                                }
                                var r = i.getCache();
                                Object.keys(n).length > 0 ? (r[e] = n, i.finishPending(e, Object.keys(n).length)) : (delete r[e], i.finishPending(e, null))
                            } else i.finishPending(e, null)
                        }))
                    } else i.finishPending(e, null)
                }))
            } else this.finishPending(e, null)
        },
        finishPending: function(e, t) {
            var n = this.getCache();
            "loading" === n[e] && delete n[e];
            var i = this.pending[e];
            delete this.pending[e], i && i.length && i.forEach((function(e) {
                e(t)
            }))
        },
        request: function(e, t) {
            var n = new Lampa.Reguest;
            n.timeout(1e4);
            var i = function(e) {
                    t(e)
                },
                a = function() {
                    t(null)
                };
            -1 !== e.indexOf("themoviedb.org") || -1 !== e.indexOf("apitmdb.") ? n.silent(e, i, a) : n.native(e, i, a)
        }
    },
        s = ["Анастасия Гайдаржи + Андрей Юрченко", "Студии Суверенного Лепрозория", "IgVin &amp; Solncekleshka", "Студия Пиратского Дубляжа", "Gremlin Creative Studio", "Alternative Production", "Bubble Dubbing Company", "HelloMickey Production", "Н.Севастьянов seva1988", "XDUB Dorama + Колобок", "Мобильное телевидение", "СПД - Сладкая парочка", "BBC Saint-Petersburg", "Black Street Records", "Intra Communications", "Melodic Voice Studio", "Selena International", "Voice Project Studio", "Несмертельное оружие", "Петербургский дубляж", "Asian Miracle Group", "Lizard Cinema Trade", "National Geographic", "Studio Victory Аsia", "True Dubbing Studio", "Позитив-Мультимедиа", "Премьер Мультимедиа", "Уолт Дисней Компани", "Family Fan Edition", "Paramount Pictures", "Parovoz Production", "Shadow Dub Project", "The Kitchen Russia", "Zone Vision Studio", "Анастасия Гайдаржи", "Иванова и П. Пашут", "Малиновский Сергей", "Так Треба Продакшн", "Back Board Cinema", "Paramount Channel", "Project Web Mania", "RedDiamond Studio", "Universal Channel", "Zoomvision Studio", "НеЗупиняйПродакшн", "Селена Интернешнл", "Студия «Стартрек»", "Хихикающий доктор", "Четыре в квадрате", "Brain Production", "Cowabunga Studio", "Lucky Production", "MC Entertainment", "Paramount Comedy", "Universal Russia", "Анатолий Ашмарин", "Андрей Питерский", "Васька Куролесов", "Екатеринбург Арт", "Квадрат Малевича", "Первый канал ОРТ", "Реальный перевод", "Русский Репортаж", "Сolumbia Service", "Amazing Dubbing", "AnimeSpace Team", "Cartoon Network", "Cinema Prestige", "CinemaSET GROUP", "DeadLine Studio", "DeeAFilm Studio", "GreenРай Studio", "New Dream Media", "Sunshine Studio", "Volume-6 Studio", "XvidClub Studio", "Антонов Николай", "Воробьев Сергей", "Денис Шадинский", "З Ранку До Ночі", "Максим Логинофф", "Николай Дроздов", "Студия Горького", "Студийная банда", "Ульпаней Эльром", "Agatha Studdio", "Anything-group", "CrazyCatStudio", "Creative Sound", "DIVA Universal", "Garsu Pasaulis", "GoodTime Media", "Goodtime Media", "Hamster Studio", "Horizon Studio", "Jakob Bellmann", "Julia Prosenuk", "KosharaSerials", "Kulzvuk Studio", "Mallorn Studio", "Red Head Sound", "RedRussian1337", "SovetRomantica", "SunshineStudio", "Syfy Universal", "TUMBLER Studio", "Viasat History", "visanti-vasaer", "Анатолий Гусев", "Вартан Дохалов", "Витя «говорун»", "Кирдин | Stalk", "Л. Володарский", "Леша Прапорщик", "Максим Жолобов", "Медиа-Комплекс", "Прайд Продакшн", "Русский дубляж", "Союзмультфильм", "Студия Колобок", "5-й канал СПб", "ARRU Workshop", "Arasi project", "Banyan Studio", "Bars MacAdams", "Bonsai Studio", "Byako Records", "Dream Records", "FiliZa Studio", "Filiza Studio", "Film Prestige", "Flarrow Films", "Gezell Studio", "Greb&Creative", "HamsterStudio", "Jetvis Studio", "LE-Production", "Lizard Cinema", "Nazel & Freya", "PCB Translate", "Rainbow World", "Renegade Team", "SHIZA Project", "Sci-Fi Russia", "Amanogawa", "The Mike Rec.", "VIP Serial HD", "VO-Production", "VO-production", "Victory-Films", "ViruseProject", "Voice Project", "Vulpes Vulpes", "АРК-ТВ Studio", "Видеопродакшн", "Мадлен Дюваль", "Мика Бондарик", "Наталья Гурзо", "Премьер Видео", "Семыкина Юлия", "Старый Бильбо", "Трамвай-фильм", "Фортуна-Фильм", "Хоррор Мэйкер", "Храм Дорам ТВ", "Штамп Дмитрий", "A. Lazarchuk", "AlphaProject", "AniLibria.TV", "AnimeReactor", "Animereactor", "BadCatStudio", "DreamRecords", "General Film", "HaseRiLLoPaW", "Horror Maker", "Ivnet Cinema", "Korean Craze", "Light Breeze", "Mystery Film", "Oneinchnales", "Profix Media", "Psychotronic", "RG Paravozik", "RG.Paravozik", "RussianGuy27", "Sony Channel", "Train Studio", "Trdlo.studio", "ViP Premiere", "VictoryFilms", "VulpesVulpes", "Wayland team", "sweet couple", "Альтера Парс", "Видеоимпульс", "Гей Кино Гид", "Говинда Рага", "Деваль Видео", "Е. Хрусталёв", "К. Поздняков", "Кармен Видео", "Кинопремьера", "Кирилл Сагач", "КонтентикOFF", "Кубик в Кубе", "Кураж-Бамбей", "Мьюзик-трейд", "Н. Золотухин", "Не требуется", "Новый Дубляж", "Нурмухаметов", "Оригинальный", "Первый канал", "Р. Янкелевич", "С. Кузьмичёв", "С. Щегольков", "Сергей Дидок", "Синема Трейд", "Синта Рурони", "Студия Райдо", "Тоникс Медиа", "Точка Zрения", "Фильмэкспорт", "Элегия фильм", "1001 cinema", "BTI Studios", "Cactus Team", "CrezaStudio", "Crunchyroll", "DVD Classic", "Description", "Eurochannel", "FocusStudio", "Franek Monk", "Gala Voices", "Gears Media", "GladiolusTV", "Gold Cinema", "Good People", "HiWay Grope", "Inter Video", "JWA Project", "Lazer Video", "Max Nabokov", "NEON Studio", "Neoclassica", "New Records", "Nickelodeon", "Nika Lenina", "Oghra-Brown", "Paul Bunyan", "Rebel Voice", "RecentFilms", "RiZZ_fisher", "Saint Sound", "SakuraNight", "SnowRecords", "Sony Sci-Fi", "Sound-Group", "StudioFilms", "TF-AniGroup", "TrainStudio", "XDUB Dorama", "Zone Studio", "Zone Vision", "hungry_inri", "Варус Видео", "Варус-Видео", "Видеосервис", "Володарский", "Г. Либергал", "Г. Румянцев", "Другое кино", "Е. Гаевский", "Завгородний", "И. Сафронов", "И. Степанов", "Кенс Матвей", "КураСгречей", "Лазер Видео", "Малиновский", "Мастер Тэйп", "Неоклассика", "Новый Канал", "Огородников", "Петербуржец", "Прямостанов", "С. Визгунов", "С. Кузнецов", "Севастьянов", "Студия Трёх", "Цікава Ідея", "Эй Би Видео", "Я. Беллманн", "1001cinema", "1WinStudio", "AXN Sci-Fi", "AimaksaLTV", "Animegroup", "ApofysTeam", "AvePremier", "BraveSound", "CP Digital", "CactusTeam", "CinemaTone", "Contentica", "CoralMedia", "DniproFilm", "ELEKTRI4KA", "East Dream", "Fox Russia", "HiWayGrope", "LevshaFilm", "MaxMeister", "Mega-Anime", "MifSnaiper", "NewStation", "Nice-Media", "Pazl Voice", "PiratVoice", "Postmodern", "Rain Death", "Reanimedia", "Shachiburi", "SilverSnow", "Sky Voices", "SkyeFilmTV", "Sony Turbo", "Sound Film", "StudioBand", "TatamiFilm", "VGM Studio", "VSI Moscow", "VoicePower", "West Video", "W³: voices", "eraserhead", "Б. Федоров", "Бусов Глеб", "Ващенко С.", "Глуховский", "Держиморда", "Е. Гранкин", "И. Еремеев", "Интерфильм", "Инфо-фильм", "К. Филонов", "Карповский", "Комедия ТВ", "Костюкевич", "Мост Видео", "Мост-Видео", "Н. Антонов", "Н. Дроздов", "Новый диск", "Ох! Студия", "Первый ТВЧ", "Переводман", "С. Казаков", "С. Лебедев", "С. Макашов", "Саня Белый", "Союз Видео", "Студия NLS", "Т.О Друзей", "ТВ XXI век", "Толстобров", "Хуан Рохас", "Электричка", "Ю. Немахов", "диктор CDV", "3df voice", "AAA-Sound", "Andre1288", "AniLibria", "AniPLague", "Astana TV", "AveBrasil", "AveDorama", "BeniAffet", "CBS Drama", "CLS Media", "CasStudio", "Discovery", "DoubleRec", "Epic Team", "FanStudio", "FilmsClub", "Flux-Team", "Fox Crime", "GREEN TEA", "Ghostface", "GoodVideo", "Gramalant", "HighHopes", "INTERFILM", "JoyStudio", "KinoGolos", "Kinomania", "Kobayashi", "LakeFilms", "Neo-Sound", "NewComers", "NewStudio", "No-Future", "Novamedia", "OnisFilms", "Persona99", "RATTLEBOX", "RainDeath", "Red Media", "SDI Media", "SOLDLUCK2", "Sawyer888", "Sedorelli", "Seoul Bay", "Sephiroth", "ShinkaDan", "SmallFilm", "SpaceDust", "Timecraft", "Total DVD", "VIZ Media", "Video-BIZ", "Videogram", "fiendover", "turok1990", "ААА-sound", "Амальгама", "АрхиТеатр", "Васильцев", "Весельчак", "Видеобаза", "Воротилин", "Григорьев", "Деньщиков", "ЕА Синема", "Зереницын", "Золотухин", "И. Клушин", "Имидж-Арт", "Карапетян", "Киномания", "Кириллица", "Машинский", "Мительман", "Муравский", "Невафильм", "Останкино", "Причудики", "Рыжий пес", "С. Дьяков", "СВ Студия", "СВ-Студия", "Самарский", "Синема УС", "Советский", "Солодухин", "ТО Друзей", "Формат AB", "Хрусталев", "Шадинский", "Ю. Сербин", "Ю. Товбин", "Янкелевич", "AB-Video", "ALEKS KV", "ANIvoice", "AdiSound", "AlexFilm", "Amalgama", "AniMaunt", "AniMedia", "Animedub", "AuraFilm", "AzOnFilm", "Barin101", "ClubFATE", "ColdFilm", "DeadLine", "DexterTV", "Extrabit", "FilmGate", "Fox Life", "Foxlight", "GetSmart", "GoldTeam", "GostFilm", "Gravi-TV", "Hallmark", "IdeaFilm", "ImageArt", "JeFerSon", "Jimmy J.", "Kerems13", "KinoView", "Loginoff", "LostFilm", "MOYGOLOS", "Marclail", "Milirina", "MiraiDub", "Murzilka", "NovaFilm", "OMSKBIRD", "Omskbird", "Radamant", "RealFake", "RoxMarty", "STEPonee", "SorzTeam", "Superbit", "TurkStar", "Ultradox", "VashMax2", "VendettA", "VideoBIZ", "WestFilm", "XL Media", "kubik&ko", "metalrus", "st.Elrom", "Алексеев", "Артемьев", "АрхиАзия", "Бахурани", "Бессонов", "Васильев", "Визгунов", "Войсовер", "Воронцов", "Гаврилов", "Гаевский", "Горчаков", "Дольский", "Домашний", "Дубровин", "Дьяконов", "Е. Лурье", "Е. Рудой", "Журавлев", "Заугаров", "Индия ТВ", "Ист-Вест", "Карусель", "Кинолюкс", "Кузнецов", "ЛанселаП", "Лексикон", "Ленфильм", "Либергал", "Логинофф", "Марченко", "Махонько", "Медведев", "Мельница", "Мосфильм", "Нарышкин", "Оверлорд", "Оригинал", "Пирамида", "С. Рябов", "СВ-Дубль", "Савченко", "Субтитры", "Супербит", "Тимофеев", "Толмачев", "Хлопушка", "Ю. Живов", "5 канал", "Amalgam", "AniFilm", "AniStar", "AniWayt", "Anifilm", "Anistar", "AnyFilm", "AveTurk", "BadBajo", "BaibaKo", "BukeDub", "ELYSIUM", "Eladiel", "Elysium", "F-TRAIN", "FireDub", "FoxLife", "HDrezka", "Hamster", "Janetta", "Jaskier", "Kолобок", "LeDoyen", "Levelin", "Liga HQ", "Lord32x", "MUZOBOZ", "Macross", "McElroy", "MixFilm", "NemFilm", "Netflix", "Octopus", "Onibaku", "OpenDub", "Paradox", "PashaUp", "RUSCICO", "RusFilm", "SOFTBOX", "Sam2007", "SesDizi", "ShowJet", "SoftBox", "SomeWax", "TV 1000", "TVShows", "To4kaTV", "Trina_D", "Twister", "Urasiko", "VicTeam", "Wakanim", "ZM-SHOW", "ZM-Show", "datynet", "lord666", "sf@irat", "Абдулов", "Багичев", "Бибиков", "Ващенко", "Герусов", "Данилов", "Дасевич", "Дохалов", "Кипарис", "Клюквин", "Колобок", "Королев", "Королёв", "Латышев", "Люсьена", "Матвеев", "Михалев", "Морозов", "Назаров", "Немахов", "Никитин", "Омикрон", "Ошурков", "Парадиз", "Пепелац", "Пифагор", "Позитив", "Пятница", "РуФилмс", "Рутилов", "СВ-Кадр", "Синхрон", "Смирнов", "Сокуров", "Сонотек", "Сонькин", "Сыендук", "Филонов", "Хихидок", "Яковлев", "Яроцкий", "заКАДРЫ", "100 ТВ", "4u2ges", "Alezan", "Amedia", "Ancord", "AniDUB", "Anubis", "Azazel", "BD CEE", "Berial", "Boльгa", "Cuba77", "D.I.M.", "DubLik", "Dubляж", "Elegia", "Emslie", "FocusX", "GalVid", "Gemini", "Jetvis", "JimmyJ", "KANSAI", "KOleso", "Kansai", "Kiitos", "L0cDoG", "LeXiKC", "Lisitz", "Mikail", "Milvus", "MrRose", "Nastia", "NewDub", "OSLIKt", "Ozz TV", "Ozz.tv", "Prolix", "RedDog", "Rumble", "SNK-TV", "Satkur", "Selena", "Shaman", "Stevie", "Suzaku", "TV1000", "Tycoon", "UAFlix", "WVoice", "WiaDUB", "ZEE TV", "Zendos", "Zerzia", "binjak", "den904", "kiitos", "madrid", "neko64", "АБыГДе", "Агапов", "Акалит", "Акопян", "Акцент", "Альянс", "Анубис", "Арк-ТВ", "Бойков", "Векшин", "Вихров", "Вольга", "Гоблин", "Готлиб", "Гризли", "Гундос", "Гуртом", "ДиоНиК", "Дьяков", "Есарев", "Живаго", "Жучков", "Зебуро", "Иванов", "Карцев", "Кашкин", "Килька", "Киреев", "Козлов", "Кондор", "Котова", "Кошкин", "Кравец", "Курдов", "Лагута", "Лапшин", "Лизард", "Миняев", "Мудров", "Н-Кино", "НЛО-TV", "Набиев", "Нева-1", "Пронин", "Пучков", "Ракурс", "Россия", "С.Р.И.", "Санаев", "Светла", "Сербин", "Стасюк", "Строев", "ТВ СПб", "Товбин", "Шварко", "Швецов", "Шуваев", "Amber", "AniUA", "Anika", "Arisu", "Cmert", "D2Lab", "D2lab", "DeMon", "Elrom", "IНТЕР", "JetiX", "Jetix", "Kerob", "Lupin", "Ozeon", "PaDet", "RinGo", "Ryc99", "SHIZA", "Solod", "To4ka", "erogg", "ko136", "seqw0", "ssvss", "zamez", "Акира", "АнВад", "Белов", "Бигыч", "ВГТРК", "Велес", "Ворон", "Гланц", "Живов", "Игмар", "Интер", "Котов", "Лайко", "Мишин", "Новий", "Перец", "Попов", "Райдо", "РенТВ", "Рудой", "Рукин", "Рыбин", "Рябов", "С.Р.И", "ТВЧ 1", "Хабар", "Чадов", "Штамп", "Штейн", "Andy", "CPIG", "Dice", "ETV+", "Gits", "ICTV", "Jade", "KIHO", "Laci", "RAIM", "SGEV", "Tori", "Troy", "Twix", "Vano", "Voiz", "jept", "ИДДК", "Инис", "Ирэн", "Нота", "ТВ-3", "ТВИН", "Твин", "Чуев", "1+1", "2+2", "2x2", "2х2", "AMC", "AMS", "AOS", "CDV", "DDV", "FDV", "FOX", "ICG", "IVI", "JAM", "LDV", "MCA", "MGM", "MTV", "Oni", "QTV", "TB5", "V1R", "VHS", "АМС", "ГКГ", "ДТВ", "ИГМ", "КТК", "МИР", "НСТ", "НТВ", "НТН", "РТР", "СТС", "ТВ3", "ТВ6", "ТВЦ", "ТНТ", "ТРК", "Че!", "D1", "R5", "К9", "Закадровый", "Многоголосый"];
    s.sort((function(e, t) {
        return t.length - e.length
    }));
    // SmartOnline 1.3.0: one Lampac server, merged online streams + Autopilot VoiceKit.
    var d = "fastonline_lampac_sources",
        AVAILABLE_KEY = "fastonline_lampac_available",
        SERVER_CACHE_KEY = "fastonline_lampac_server_auto",
        lampacBase = "",
        g = '<svg viewBox="3 6 42 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="8" width="38" height="32" rx="2" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 8v32M5 16h8m-8 8h8m-8 8h8" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="28" cy="24" r="9" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="28" cy="24" r="3" fill="currentColor"/></svg>',
        y = [{
            id: "rezka",
            name: "rezka",
            enabled: !0
        }, {
            id: "rc/rhs",
            name: "rc/rhs",
            enabled: !1
        }, {
            id: "rhsprem",
            name: "rhsprem",
            enabled: !0
        }, {
            id: "kinopub",
            name: "kinopub",
            enabled: !0
        }, {
            id: "vokino",
            name: "vokino",
            enabled: !0
        }, {
            id: "mirage",
            name: "mirage",
            enabled: !1
        }, {
            id: "alloha",
            name: "alloha",
            enabled: !0
        }, {
            id: "rc/filmix",
            name: "rc/filmix",
            enabled: !1
        }, {
            id: "rc/fxapi",
            name: "rc/fxapi",
            enabled: !1
        }, {
            id: "fxapi",
            name: "fxapi",
            enabled: !1
        }, {
            id: "filmix",
            name: "filmix",
            enabled: !1
        }, {
            id: "filmixtv",
            name: "filmixtv",
            enabled: !1
        }, {
            id: ["videocdn", "lumex"],
            name: "lumex",
            enabled: !0
        }, {
            id: "kinogo",
            name: "kinogo",
            enabled: !0
        }, {
            id: "vkmovie",
            name: "VK",
            enabled: !1
        }, {
            id: "rutubemovie",
            name: "rutube",
            enabled: !1
        }, {
            id: "videodb",
            name: "videodb",
            enabled: !1
        }, {
            id: "collaps",
            name: "collaps",
            enabled: !1
        }, {
            id: "collaps-dash",
            name: "collaps-dash",
            enabled: !1
        }, {
            id: "hdvb",
            name: "hdvb",
            enabled: !0
        }, {
            id: "zetflix",
            name: "zetflix",
            enabled: !1
        }, {
            id: "veoveo",
            name: "veoveo",
            enabled: !1
        }, {
            id: "kodik",
            name: "kodik",
            enabled: !0
        }, {
            id: "ashdi",
            name: "ashdi",
            enabled: !1
        }, {
            id: "kinoukr",
            name: "kinoukr",
            enabled: !1
        }, {
            id: "kinotochka",
            name: "kinotochka",
            enabled: !1
        }, {
            id: "remux",
            name: "remux",
            enabled: !1
        }, {
            id: "iframevideo",
            name: "iframevideo",
            enabled: !1
        }, {
            id: "cdnmovies",
            name: "cdnmovies",
            enabled: !1
        }, {
            id: "anilibria",
            name: "anilibria",
            enabled: !1
        }, {
            id: "animedia",
            name: "animedia",
            enabled: !1
        }, {
            id: "animego",
            name: "animego",
            enabled: !1
        }, {
            id: "animevost",
            name: "animevost",
            enabled: !1
        }, {
            id: "animebesst",
            name: "animebesst",
            enabled: !1
        }, {
            id: "redheadsound",
            name: "redheadsound",
            enabled: !1
        }, {
            id: "animelib",
            name: "animelib",
            enabled: !1
        }, {
            id: "moonanime",
            name: "moonanime",
            enabled: !1
        }, {
            id: "vibix",
            name: "vibix",
            enabled: !1
        }, {
            id: "vdbmovies",
            name: "vdbmovies",
            enabled: !1
        }, {
            id: "fancdn",
            name: "fancdn",
            enabled: !1
        }, {
            id: "cdnvideohub",
            name: "cdnvideohub",
            enabled: !1
        }, {
            id: "vcdn",
            name: "vcdn",
            enabled: !1
        }, {
            id: "hydraflix",
            name: "hydraflix",
            enabled: !1
        }, {
            id: "videasy",
            name: "videasy",
            enabled: !1
        }, {
            id: "vidsrc",
            name: "vidsrc",
            enabled: !1
        }, {
            id: "movpi",
            name: "movpi",
            enabled: !1
        }, {
            id: "vidlink",
            name: "vidlink",
            enabled: !1
        }, {
            id: "twoembed",
            name: "twoembed",
            enabled: !1
        }, {
            id: "autoembed",
            name: "autoembed",
            enabled: !1
        }, {
            id: "smashystream",
            name: "smashystream",
            enabled: !1
        }, {
            id: "rgshows",
            name: "rgshows",
            enabled: !1
        }, {
            id: "videoseed",
            name: "videoseed",
            enabled: !1
        }, {
            id: "iptvonline",
            name: "iptvonline",
            enabled: !1
        }, {
            id: "eneyida",
            name: "eneyida",
            enabled: !1
        }, {
            id: "kinobase",
            name: "kinobase",
            enabled: !1
        }];

    function b() {
        return y.filter((function(e) {
            return e.enabled
        })).map((function(e) {
            return Lampa.Arrays.isArray(e.id) ? e.id[0] : e.id
        }))
    }

    function x() {
        return lampacBase
    }

    // SmartOnline 1.4: Lampac is no longer hard-wired to one host.  The plugin first looks at
    // the Online/Sync scripts already installed in Lampa, then at the page host, and remembers only
    // a server that actually answers /lite/events.  This lets the same file work with Lampac NextGen,
    // Lampac/Al(co)pac and reverse-proxy prefixes without a per-user build.
    var serverState = {state: "", waiters: [], tried: 0};

    function originOf(value) {
        try { return new URL(String(value || ""), location.href).origin } catch (error) { return "" }
    }

    function normalizeBase(value) {
        value = String(value || "").trim();
        if (!value) return "";
        if (!/^https?:\/\//i.test(value)) value = "http://" + value;
        try {
            var url = new URL(value);
            url.hash = ""; url.search = "";
            return (url.origin + url.pathname).replace(/\/+$/, "")
        } catch (error) { return "" }
    }

    function serverHost() {
        try { return lampacBase ? new URL(lampacBase).hostname.toLowerCase() : "" } catch (error) { return "" }
    }

    function setLampacBase(value) {
        lampacBase = normalizeBase(value);
        U = serverHost();
        try {
            if (window.lampac_fastonline_plugin) window.lampac_fastonline_plugin.server = lampacBase
        } catch (error) {}
        if (lampacBase) try { Lampa.Storage.set(SERVER_CACHE_KEY, lampacBase) } catch (error) {}
        return lampacBase
    }

    function scriptCandidates() {
        var result = [], seen = {};
        function add(value) {
            value = normalizeBase(value);
            if (value && !seen[value]) { seen[value] = true; result.push(value) }
        }
        function fromScript(value) {
            if (typeof value !== "string" || !value) return;
            try {
                var url = new URL(value, location.href), path = url.pathname;
                // /online.js, /sync.js, /online/js/<token>, /sync/js/<token> and the other Lampac boot scripts.
                if (!/(?:online|sync)(?:\.js|\/js\/[^/?#]+)$/i.test(path) &&
                    !/(?:lampainit|on|privateinit|sisi|timecode|bookmark|tracks)\.js$/i.test(path)) return;
                if (/\/(?:online|sync)\/js\/[^/?#]+$/i.test(path)) path = path.replace(/\/(?:online|sync)\/js\/[^/?#]+$/i, "");
                else path = path.replace(/\/[^/]+$/, "");
                add(url.origin + path);
                add(url.origin)
            } catch (error) {}
        }
        try {
            var plugins = Lampa.Storage.get("plugins", []);
            if (typeof plugins === "string") plugins = JSON.parse(plugins);
            (plugins || []).forEach(function(item) { fromScript(item && typeof item === "object" ? item.url : item) })
        } catch (error) {}
        try {
            var scripts = document.scripts || [];
            for (var i = 0; i < scripts.length; i++) fromScript(scripts[i].src)
        } catch (error) {}
        // Common globals used by Lampac/Lampa forks.  They are only candidates and still have to pass the probe.
        try { add(window.lampac_server || window.LAMPAC_SERVER || "") } catch (error) {}
        try { if (window.lampac_online_plugin && window.lampac_online_plugin.server) add(window.lampac_online_plugin.server) } catch (error) {}
        try { if (/^https?:$/.test(location.protocol)) add(location.origin) } catch (error) {}
        return result
    }

    function probeServer(base, callback) {
        var done = false, xhr;
        function finish(ok) { if (!done) { done = true; callback(!!ok) } }
        try {
            // Keep discovery itself credential-free.  A token/account protected Lampac can answer 401/403
            // here; that still proves the endpoint exists.  Real SmartOnline requests later carry the
            // Online-script token, uid and account data through N().
            xhr = new XMLHttpRequest();
            xhr.open("GET", base + "/lite/events?rjson=true", true);
            xhr.timeout = 2500;
            xhr.onload = function() {
                var body = null;
                try { body = JSON.parse(xhr.responseText) } catch (error) {}
                finish((!!body && (Array.isArray(body) || typeof body === "object")) || xhr.status === 401 || xhr.status === 403)
            };
            xhr.onerror = function() { finish(false) };
            xhr.ontimeout = function() { finish(false) };
            xhr.send()
        } catch (error) { finish(false) }
    }

    function discoverLampac(force, callback) {
        if (!force && lampacBase) return callback(lampacBase);
        if (serverState.state === "busy") { serverState.waiters.push(callback); return }
        serverState.state = "busy";
        serverState.waiters.push(callback);
        var candidates = scriptCandidates(), cached = "";
        try { cached = normalizeBase(Lampa.Storage.get(SERVER_CACHE_KEY, "")) } catch (error) {}
        if (cached) candidates.unshift(cached);
        // De-duplicate after putting the last known good server first.
        var uniq = [], seen = {};
        candidates.forEach(function(item) { if (item && !seen[item]) { seen[item] = true; uniq.push(item) } });
        function complete(base) {
            setLampacBase(base || "");
            serverState.state = base ? "ok" : "none";
            serverState.tried = Date.now();
            var waiters = serverState.waiters.splice(0);
            waiters.forEach(function(fn) { try { fn(lampacBase) } catch (error) {} })
        }
        if (!uniq.length) { complete(""); return }
        var left = uniq.length, finished = false;
        uniq.forEach(function(item, index) {
            setTimeout(function() {
                if (finished) return;
                probeServer(item, function(ok) {
                    if (finished) return;
                    if (ok) {
                        finished = true;
                        complete(item);
                        return
                    }
                    left--;
                    if (left <= 0) {
                        finished = true;
                        complete("")
                    }
                })
            }, Math.min(index, 5) * 100)
        })
    }

    function withLampacServer(callback) {
        if (lampacBase) { callback(lampacBase); return }
        if (serverState.state === "none" && Date.now() - serverState.tried < 30000) { callback(""); return }
        discoverLampac(false, callback)
    }

    function C(e) {
        return e.replace(/^https?:\/\//, "")
    }

    function cleanSources(items) {
        var result = [];
        if (!Lampa.Arrays.isArray(items)) return result;
        items.forEach(function(item) {
            var id = String(Lampa.Arrays.isArray(item) ? item[0] : item).toLowerCase(), canonical = "";
            y.some(function(source) {
                var aliases = Lampa.Arrays.isArray(source.id) ? source.id : [source.id];
                if (aliases.indexOf(id) >= 0) { canonical = aliases[0]; return true }
                return false
            });
            if (!canonical && /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/.test(id) && !/pidtor/i.test(id)) canonical = id;
            if (canonical && result.indexOf(canonical) < 0) result.push(canonical)
        });
        return result
    }

    function rememberAvailable(items) {
        items = cleanSources(items);
        if (items.length) try { Lampa.Storage.set(AVAILABLE_KEY, items) } catch (error) {}
        return items
    }

    function availableStored() {
        var items = [];
        try { items = Lampa.Storage.get(AVAILABLE_KEY, []) } catch (error) {}
        if (typeof items === "string") try { items = JSON.parse(items) } catch (error) { items = [] }
        return cleanSources(items)
    }

    function serverSources(items) {
        var result=[];
        (Array.isArray(items) ? items : []).forEach(function(item) {
            var id=String(item.balanser || String(item.name || '').split(' ')[0]).toLowerCase();
            if (!/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)?$/.test(id) || /pidtor/i.test(id) || /^(?:alc_auto|alcauto|auto|alcstats|ossubs|kpid|animeid|uabadge)$/.test(id)) return;
            if (!cleanSources([id]).length) y.push({id:id,name:item.name || id,enabled:true});
            else if (!y.some(function(source) { var ids=Lampa.Arrays.isArray(source.id)?source.id:[source.id]; return ids.indexOf(id)>=0 })) y.push({id:id,name:item.name || id,enabled:true});
            var canonical=cleanSources([id])[0];
            if (canonical && result.indexOf(canonical)<0) result.push(canonical)
        });
        return rememberAvailable(result)
    }

    function A() {
        var items = Lampa.Storage.get(d, []);
        if ("string" == typeof items) try { items = JSON.parse(items) } catch (e) { items = [] }
        var result = cleanSources(items);
        if (result.length) return result;
        var available = availableStored();
        if (available.length) return available;
        // Before the first successful server discovery keep the historical defaults only as a last-resort fallback.
        return b()
    }

    function hasManualSources() {
        var items = [];
        try { items = Lampa.Storage.get(d, []) } catch (error) {}
        if (typeof items === "string") try { items = JSON.parse(items) } catch (error) { items = [] }
        return cleanSources(items).length > 0
    }

    function T(items) {
        Lampa.Storage.set(d, cleanSources(items))
    }

    var E = {
        lampa: "Lampa.",
        get stream() {
            var e = x();
            return e ? e.replace(/^https?:\/\//, "") : ""
        },
        get sources() {
            return A()
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
            "Дубляж": ["Дубляж", "Дублированный", "Полное дублирование"],
            "Оригинал": ["Не требуется", "Оригинальный"],
            "Закадровый": ["Многоголосый", "Закадровый"]
        },
        filter_translate: s
    };

    function V(e, t) {
        function normalize(value) {
            return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/\s*\[.*?\]\s*$/, "")
        }
        var left = normalize(e), right = normalize(t);
        return !!left && left === right
    }

    function q() {
        var e = Lampa.Storage.get("region", "{}");
        return e.code ? e.code : "ru"
    }

    function I(e) {
        return e.translate || e.name || e.details || e.title || ""
    }

    function B(e) {
        return e.forEach((function(e) {
            ["translate", "title", "details", "name"].forEach((function(t) {
                if (e[t]) {
                    if (0 === e[t].indexOf("По умолчанию")) return;
                    if (/^\d{3,4}p$/i.test(e[t])) return void(e[t] = "По умолчанию");
                    if (e[t] = (l = /\(([^()]+)\)$/, s = 1, c = e[t], (u = c.match(l)) && u[s] ? u[s] : c), /^\d{3,4}p$/i.test(e[t])) return void(e[t] = "По умолчанию");
                    var n = !1;
                    E.filter_translate.forEach((function(i) {
                        e[t].trim().toLowerCase() === i.toLowerCase() && (e[t] = i, n = !0)
                    }));
                    var i = function(i) {
                        E.rename_translate[i].forEach((function(a) {
                            e[t].toLowerCase() == a.toLowerCase() && (e[t] = i, n = !0)
                        }))
                    };
                    for (var a in E.rename_translate) i(a);
                    E.filter_du.forEach((function(i) {
                        e[t].trim().toLowerCase() === i.toLowerCase() && (e[t] = i)
                    }))
                }
                var l, s, c, u
            }))
        })), e
    }
    var M = {
        compareVoice: V,
        region: q,
        voice: I,
        player: function() {
            return Lampa.Platform.is("tizen") || Lampa.Platform.is("webos") ? "inner" : Lampa.Storage.field("player")
        },
        filterTranslate: function(e) {
            if (!e || !Lampa.Arrays.isArray(e) || 0 === e.length) return [];
            var t = e.filter((function(e) {
                return 0 == E.filter_hr.filter((function(t) {
                    return I(e).toLowerCase().indexOf(t.toLowerCase()) >= 0
                })).length
            }));
            return t = t.filter((function(e) {
                return 0 == E.filter_ts.filter((function(t) {
                    return I(e).toLowerCase().indexOf(" " + t.toLowerCase()) >= 0
                })).length
            })), B(t), t
        },
        renameTranslate: B,
        sortDUBTranstale: function(e) {
            e.sort((function(e, t) {
                var n = E.filter_db.filter((function(t) {
                        return I(e).toLowerCase().indexOf(t.toLowerCase()) >= 0
                    })).length,
                    i = E.filter_db.filter((function(e) {
                        return I(t).toLowerCase().indexOf(e.toLowerCase()) >= 0
                    })).length;
                return n && !i ? -1 : !n && i ? 1 : 0
            }))
        },
        modalChoiceTranstale: function(e, t) {
            var n = Lampa.Controller.enabled().name,
                i = $('<div class="connect-broken">\n\t\t\t\t\t\t<div class="connect-broken__icon icon--nofound"></div>\n\t\t\t\t\t\t<div class="connect-broken__title">Вот досада...</div>\n\t\t\t\t\t\t<div class="connect-broken__text">Нет доступных файлов для воспроизведения с выбранным переводом (<b>' + e.from + '</b>). Хотите выбрать другой?</div>\n\t\t\t\t\t\t<div class="connect-broken__footer">\n\t\t\t\t\t\t\t<div class="selector simple-button next">Выбрать другой</div>\n\t\t\t\t\t\t</div>\n\t\t\t\t\t</div>');
            i.find(".selector").on("hover:enter", (function() {
                Lampa.Modal.close(), Lampa.Controller.toggle(n)
            })), i.find(".next").on("hover:enter", (function() {
                Lampa.Select.show({
                    title: "Выберите перевод",
                    items: e.voicelist,
                    onBack: function() {
                        Lampa.Controller.toggle(n), t && t()
                    }
                })
            })), Lampa.Modal.open({
                title: "",
                html: i,
                onBack: function() {
                    Lampa.Modal.close(), Lampa.Controller.toggle(n), t && t()
                }
            })
        },
        unicleTranslations: function(e) {
            var t = [];
            return e.forEach((function(e) {
                t.find((function(t) {
                    return V(I(t), I(e))
                })) || t.push(e)
            })), t
        },
        selectChoiceTranstale: function(e, t, n) {
            var i = {};
            e.forEach((function(e) {
                var t = I(e);
                i[t] || (i[t] = {
                    items: [],
                    sources: [],
                    maxquality: 0
                }), i[t].items.push(e);
                var n = e.source_name || "";
                n && -1 === i[t].sources.indexOf(n) && i[t].sources.push(n);
                var a = parseInt(e.maxquality) || 0;
                a > i[t].maxquality && (i[t].maxquality = a)
            }));
            var a = [];
            for (var o in i) {
                var r = i[o],
                    l = [];
                r.sources.length > 0 && l.push(r.sources.join(", ")), r.maxquality > 0 && l.push(r.maxquality + "p"), a.push({
                    title: o,
                    subtitle: l.join(" • "),
                    selected: V(o, t),
                    voiceItems: r.items,
                    onSelect: function() {
                        Lampa.Controller.toggle("content"), n(this.voiceItems[0])
                    }
                })
            }
            Lampa.Select.show({
                title: "Выберите перевод",
                items: a,
                onBack: function() {
                    Lampa.Controller.toggle("content")
                }
            })
        },
        selectChoiceFlow: function(e, t) {
            Lampa.Select.show({
                title: "Выберите поток",
                items: e.map((function(e) {
                    return {
                        title: e.quality + (e.label ? "<sub>" + e.label + "</sub>" : ""),
                        selected: e.selected,
                        subtitle: Lampa.Utils.shortText(e.url, 35),
                        onSelect: function() {
                            Lampa.Controller.toggle("content"), t(e)
                        }
                    }
                })),
                onBack: function() {
                    Lampa.Controller.toggle("content")
                }
            })
        }

    };

    // SmartOnline VoiceKit 1.0: canonical voice-over layer borrowed from the Autopilot model.
    // Discovery and grouping change here; playback stays the single SmartOnline player.
    var VoiceKit = (function() {
        var STUDIOS = [{"name":"AMC","match":["amc","амс"]},{"name":"Інтер","match":["інтер","интер","inter","iнтер"]},{"name":"ICTV","lang":"uk","match":["ictv"]},{"name":"1+1","lang":"uk","match":["1+1","1 + 1"]},{"name":"СТБ","lang":"uk","match":["стб","stb"]},{"name":"Новий канал","lang":"uk","match":["новий канал","novy kanal","новый канал"]},{"name":"НЛО TV","lang":"uk","match":["нло","nlo"]},{"name":"Так Треба Продакшн","lang":"uk","match":["так треба","tak treba"]},{"name":"Цікава Ідея","lang":"uk","match":["цікава ідея","cikava","cikava ideya","tsikava ideya"]},{"name":"QTV","lang":"uk","match":["qtv"]},{"name":"ТЕТ","lang":"uk","match":["тет","tet"]},{"name":"Netflix","match":["netflix","нетфлікс"]},{"name":"Le Doyen","lang":"uk","match":["le doyen","ле доєн","ледоєн","ле дуаєн"]},{"name":"Дніпрофільм","lang":"uk","match":["дніпрофільм","dniprofilm","днепрофильм"]},{"name":"Постмодерн","lang":"uk","match":["postmodern","постмодерн"]},{"name":"Megogo","match":["megogo","мегого"]},{"name":"Sweet.tv","lang":"uk","match":["sweet.tv","sweettv"]},{"name":"Гуртом","lang":"uk","match":["гуртом","hurtom","gurtom"]},{"name":"Струм","lang":"uk","match":["струм","strum"]},{"name":"Омікрон","lang":"uk","match":["омікрон","omikron","омикрон"]},{"name":"Плюс-Плюс","lang":"uk","match":["плюсплюс","плюс-плюс","плюс плюс","plusplus"]},{"name":"Amanogawa","lang":"uk","match":["amanogawa","аманогава","аманоґава"]},{"name":"FanVoxUA","lang":"uk","match":["fanvoxua","fanvox","fanwoxua","фанвоксюа"]},{"name":"LostFilm","match":["lostfilm","лостфильм"]},{"name":"Гоблин","match":["goblin","гоблин","пучков"]},{"name":"Сербин","match":["сербин","serbin"]},{"name":"Гаврилов","match":["гаврилов"]},{"name":"Amedia","match":["amedia","амедиа"]},{"name":"TVShows","match":["tvshows","твшоус"]},{"name":"NewStudio","match":["newstudio","нью студио"]},{"name":"ColdFilm","match":["coldfilm","колдфильм"]},{"name":"Jaskier","match":["jaskier","яскьер"]},{"name":"FoxCrime","match":["foxcrime","fox crime"]},{"name":"Paramount","match":["paramount"]},{"name":"Babak","match":["бабак","babak"]},{"name":"Unimay","lang":"uk","match":["unimay","юнімей","унімей"]},{"name":"InariOkami","lang":"uk","match":["inari okami"]},{"name":"InariDuB","lang":"uk","match":["inari","інарі"]},{"name":"Київстар ТБ","lang":"uk","match":["київстар","киевстар","kyivstar"]},{"name":"Novamedia","match":["новамедиа","novamedia"]},{"name":"Octopus","match":["октопус","octopus"]},{"name":"HDRezka","match":["hdrezka","rezkastudio","rezka","хдрезка","резка"]},{"name":"Red Head Sound","match":["red head sound","ред хед саунд"]},{"name":"Кубик в Кубе","match":["кубик в кубе","kubik v kube","kubik3"]},{"name":"BaibaKo","match":["baibako","байбако"]},{"name":"AlexFilm","match":["alexfilm","алексфильм"]},{"name":"IdeaFilm","match":["ideafilm","идеафильм","идеяфильм"]},{"name":"AniLibria","match":["anilibria","анилибрия","aniliberty","анилиберти"]},{"name":"AniDUB","match":["anidub","анидаб"]},{"name":"AnimeVost","match":["animevost","анимевост"]},{"name":"Пифагор","match":["пифагор","pifagor"]},{"name":"Tretyakoff Production","match":["tretyakoff","третьякофф"]},{"name":"VHS Record","match":["vhs record"]},{"name":"Sweet Sound Studio","match":["sweet sound studio","sound sweet studio"]},{"name":"StudioBand","match":["studioband","студийная банда"]},{"name":"AniMedia","match":["animedia","анимедиа"]},{"name":"AniStar","match":["anistar","анистар"]},{"name":"AniFilm","match":["anifilm","анифильм"]},{"name":"AniMaunt","match":["animaunt","анимаунт"]},{"name":"Reanimedia","match":["reanimedia","реанимедиа"]},{"name":"Crunchyroll","match":["crunchyroll","кранчиролл"]},{"name":"Wakanim","match":["wakanim","ваканим"]},{"name":"KANSAI","match":["kansai"]},{"name":"Onibaku","match":["onibaku","онибаку"]},{"name":"DubLik","match":["dublik"]},{"name":"ТО Дубляжная","match":["то дубляжная"]},{"name":"AniLeague.TV","match":["anileague"]},{"name":"Первый канал","match":["первый канал"]},{"name":"Е. Лурье","match":["е. лурье","евгения лурье"]},{"name":"UAFlix","lang":"uk","match":["uaflix","юафлікс","уафлікс"]},{"name":"Струґачка","lang":"uk","match":["струґачка","стругачка","strugachka"]},{"name":"Колодій Трейлерів","lang":"uk","match":["колодій трейлерів","kolodii trailers","kolodiytrailers"]},{"name":"UkrDub","lang":"uk","match":["ukrdub","укрдаб","укрдуб"]},{"name":"UATeam","lang":"uk","match":["uateam","юатім"]},{"name":"Робота Голосом","lang":"uk","match":["робота голосом","robota holosom"]},{"name":"UFDUB","lang":"uk","match":["ufdub","ukrainefastdub","юфдаб"]},{"name":"AniUA","lang":"uk","match":["aniua","аніюа"]},{"name":"Суспільне","lang":"uk","match":["суспільне","suspilne"]},{"name":"Enter-Film","lang":"uk","match":["enter-film","ентерфільм"]},{"name":"Anime Classic","lang":"uk","match":["anime classic"]},{"name":"AniUnion","lang":"uk","match":["aniunion"]},{"name":"BULBUL MEDIA","lang":"uk","match":["bulbul media"]},{"name":"CreativUa","lang":"uk","match":["creativua"]},{"name":"EspadaStudio","lang":"uk","match":["espada studio","еспада"]},{"name":"FukuroNachi","lang":"uk","match":["fukuronachi"]},{"name":"Gwean & Maslinka","lang":"uk","match":["gwean"]},{"name":"Kagawy","lang":"uk","match":["kagawy"]},{"name":"QUAM Project","lang":"uk","match":["quam project"]},{"name":"SaloVpalo","lang":"uk","match":["salovpalo","сало впало"]},{"name":"Shirifugen","lang":"uk","match":["shirifugen"]},{"name":"Studio LOLICORN","lang":"uk","match":["lolicorn"]},{"name":"UAMAX","lang":"uk","match":["uamax"]},{"name":"UASPF Studio","lang":"uk","match":["uaspf"]},{"name":"The VOP","lang":"uk","match":["the vop"]},{"name":"Voices Band","lang":"uk","match":["voices band"]},{"name":"ГарячіВареники","lang":"uk","match":["гарячі вареники"]},{"name":"Кізукі","lang":"uk","match":["кізукі"]},{"name":"Студія «Сокира»","lang":"uk","match":["сокира"]},{"name":"Cinema Sound Production","lang":"uk","match":["cinema sound","сінема саунд","синема саунд"]},{"name":"Didko Studio","lang":"uk","match":["didko"]},{"name":"Glass Moon","lang":"uk","match":["glass moon","глас мун"]},{"name":"Clan Kaizoku","lang":"uk","match":["clan kaizoku","клан кайзоку"]},{"name":"Togarashi","lang":"uk","match":["togarashi","тогараші"]},{"name":"HATOSHI","lang":"uk","match":["hatoshi","хатоші"]},{"name":"Рідний Голос","lang":"uk","match":["рідний голос"]},{"name":"Студія Качур","lang":"uk","match":["студія качур","kachur studio"]},{"name":"DZUSKI","lang":"uk","match":["dzuski","дзуські"]},{"name":"VRdub","lang":"uk","match":["vrdub"]},{"name":"BambooUA","lang":"uk","match":["bambooua","bamboo"]},{"name":"Lem0nka Voice Project","lang":"uk","match":["lem0nka"]},{"name":"Melodic Voice Studio","lang":"uk","match":["melodic voice","melvoice"]},{"name":"В одне рило","lang":"uk","match":["в одне рило"]},{"name":"SVOЇ Production","lang":"uk","match":["svoї production"]},{"name":"UASpeedFilms","lang":"uk","match":["uaspeedfilms"]},{"name":"Твій Продакшн","lang":"uk","match":["твій продакшн"]},{"name":"Три Крапки","lang":"uk","match":["три крапки"]},{"name":"FutaShine","lang":"uk","match":["futashine"]},{"name":"Blueberry Studio","lang":"uk","match":["blueberry","блюберрі"]},{"name":"Майстерня Слів","lang":"uk","match":["майстерня слів","maysternya sliv"]},{"name":"Yaniam","lang":"uk","match":["yaniam"]},{"name":"Animesh","lang":"uk","match":["animesh"]},{"name":"CloverDUB","lang":"uk","match":["cloverdub"]},{"name":"MoonAnime","lang":"uk","match":["moonanime"]},{"name":"TATAKAE","lang":"uk","match":["tatakae"]},{"name":"10GU","lang":"uk","match":["10gu"]},{"name":"AleksAlo","lang":"uk","match":["aleksalo"]},{"name":"AND5 Studio","lang":"uk","match":["and5"]},{"name":"AniFanUA","lang":"uk","match":["anifanua"]},{"name":"AniKoe","lang":"uk","match":["anikoe"]},{"name":"AnimeOriginal","lang":"uk","match":["anime original"]},{"name":"BorshDUB","lang":"uk","match":["borshdub","борщдаб"]},{"name":"Боку но підвал","lang":"uk","match":["боку но підвал","boku no pidval"]},{"name":"Crystal Shade","lang":"uk","match":["crystal shade"]},{"name":"Flayzer","lang":"uk","match":["flayzer"]},{"name":"HajimeDUB","lang":"uk","match":["hajime dub"]},{"name":"k0wbassa","lang":"uk","match":["k0wbassa"]},{"name":"Kafori","lang":"uk","match":["kafori"]},{"name":"Kawaii Dub","lang":"uk","match":["kawaii dub"]},{"name":"Life Cycle","lang":"uk","match":["life cycle"]},{"name":"Milki-Dub","lang":"uk","match":["milki-dub"]},{"name":"MrCrashFox","lang":"uk","match":["mrcrashfox"]},{"name":"p1rsti","lang":"uk","match":["p1rsti"]},{"name":"RaccoonHouse","lang":"uk","match":["raccoon house"]},{"name":"Ryuka Studio","lang":"uk","match":["ryuka"]},{"name":"Shield Team","lang":"uk","match":["shield team"]},{"name":"Чорний Верес","lang":"uk","match":["чорний верес"]},{"name":"Project U&A Lines","lang":"uk","match":["u&a lines"]},{"name":"AniTube","lang":"uk","match":["anitube","анітюб"]},{"name":"СвійDUB","lang":"uk","match":["свійdub","sviydub","svijdub"]},{"name":"Kioto anime","lang":"uk","match":["kioto anime","кіото аніме"]}];
        var KINDS = {"dub":["дубляж","дублир","дубльов","dub","dubbing","dubbed"],"avo":["одноголос","авторськ","авторск","avo","single voice"],"mvo":["багатогол","многогол","двогол","двохгол","двухгол","закадров","зак","mvo","dvo","voice-over","voiceover"]};
        var SUBS = ["субтит","subtit","sub","subs"];
        var PLACEHOLDERS = ["не визначено","по умолчанию","за замовчуванням","оригінал","оригинал","default","original"];
        var DEAD = ["заблокирован","правообладател","недоступн","blocked","unavailable","delete","deleted","удален","видалено","видалений"];
        var SOURCE_LANG = {
            uaserials:"uk", eneyida:"uk", uaflix:"uk", kinoukr:"uk", franko:"uk", uakino:"uk", starlight:"uk",
            unimay:"uk", mikai:"uk", bamboo:"uk", animeon:"uk"
        };
        var LANG3 = {ukr:"uk",rus:"ru",eng:"en",jpn:"ja",deu:"de",ger:"de",fra:"fr",fre:"fr",spa:"es",ita:"it",pol:"pl",kor:"ko",zho:"zh",chi:"zh",por:"pt",tur:"tr",ces:"cs",cze:"cs",bel:"be",kaz:"kk"};
        var LANG_WORDS = [
            ["uk",/(?:^|[^a-zа-яіїєґ])(uk|ukr|ua|україн|украин|укр)(?:$|[^a-zа-яіїєґ])/i],
            ["ru",/(?:^|[^a-zа-яіїєґ])(ru|rus|русск|росій|росси)(?:$|[^a-zа-яіїєґ])/i],
            ["en",/(?:^|[^a-z])(en|eng|english)(?:$|[^a-z])/i],
            ["ja",/(?:^|[^a-z])(ja|jpn|japanese)(?:$|[^a-z])/i]
        ];
        function arr(v) { return Array.isArray(v) ? v : []; }
        function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
        function norm(s) {
            return String(s || "").toLowerCase().replace(/&amp;/g, "&")
                .replace(/[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\u00a0-\u00bf\u2000-\u206f\u3000-\u303f]+/g, "");
        }
        function compact(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
        function lang2(v) {
            v = String(v || "").toLowerCase().replace(/[-_].*$/, "");
            if (LANG3[v]) return LANG3[v];
            return /^[a-z]{2}$/.test(v) ? v : "";
        }
        function langName(code) {
            if (!code || code === "und") return "";
            try {
                if (window.Intl && Intl.DisplayNames) {
                    var ui = String(Lampa.Storage.get("language", "ru") || "ru");
                    var d = new Intl.DisplayNames([ui], {type:"language"}), n = d.of(code);
                    if (n && n !== code) return n.charAt(0).toUpperCase() + n.slice(1);
                }
            } catch (e) {}
            return code.toUpperCase()
        }
        function containsWord(text, word) {
            text = compact(text).toLowerCase(); word = compact(word).toLowerCase();
            if (!word) return false;
            if (text === word) return true;
            var escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
            try { return new RegExp("(?:^|[\\s\\[\\](){},/+|:_-])" + escaped + "(?=$|[\\s\\[\\](){},/+|:_-])", "i").test(text); }
            catch (e) { return text.indexOf(word) >= 0; }
        }
        function hasStem(text, list) {
            text = String(text || "").toLowerCase();
            return arr(list).some(function(w) {
                w = String(w || "").toLowerCase();
                return !!w && (w.length < 4 ? containsWord(text,w) : text.indexOf(w) >= 0)
            })
        }
        function studioOf(raw) {
            for (var i=0;i<STUDIOS.length;i++) {
                var s=STUDIOS[i], matches=arr(s.match);
                for (var j=0;j<matches.length;j++) if (containsWord(raw,matches[j])) return s
            }
            return null
        }
        function kindOf(raw) {
            if (hasStem(raw,KINDS.dub)) return "dub";
            if (hasStem(raw,KINDS.avo)) return "avo";
            if (hasStem(raw,KINDS.mvo)) return "mvo";
            return ""
        }
        function detectLang(raw,item,studio) {
            var direct=lang2(item && (item.voice_lang || item.lang || item.language));
            if (direct) return direct;
            for (var i=0;i<LANG_WORDS.length;i++) if (LANG_WORDS[i][1].test(String(raw||""))) return LANG_WORDS[i][0];
            if (studio && studio.lang) return studio.lang;
            var source=String(item && item.source_name || "").toLowerCase().replace(/_snack$/,"");
            if (SOURCE_LANG[source]) return SOURCE_LANG[source];
            var region="";
            try { region=String(q()||"").toLowerCase(); } catch(e) {}
            return /^[a-z]{2}$/.test(region) ? region : "und"
        }
        function isPlaceholder(raw,movie) {
            var low=compact(raw).toLowerCase();
            if (!low) return true;
            for (var i=0;i<PLACEHOLDERS.length;i++) if (low===String(PLACEHOLDERS[i]).toLowerCase()) return true;
            var title=compact(movie && (movie.title||movie.name)).toLowerCase();
            var original=compact(movie && (movie.original_title||movie.original_name)).toLowerCase();
            return !!(low===title || low===original)
        }
        function cleanLabel(raw) {
            var name=compact(raw).replace(/\s*\[(?:\d{3,4}p?|4k|uhd|fhd|hd|hdr[^\]]*|hevc|avc|x26[45]|h26[45]|aac|e?ac-?3|dts[^\]]*|blu-?ray|web-?dl|web-?rip|remux)(?:[^\]]*)\]\s*/ig," ");
            return compact(name)
        }
        function describe(item,movie) {
            var raw=compact(M.voice(item));
            if (hasStem(raw,DEAD)) return null;
            var studio=studioOf(raw), lang=detectLang(raw,item||{},studio), kind=kindOf(raw);
            if (hasStem(raw,SUBS)) return {key:"sub:"+norm(raw),label:raw||"Оригинал + субтитры",lang:"und",kind:"subs"};
            if (isPlaceholder(raw,movie)) return {key:"unnamed:"+lang,label:(lang!=="und" ? "Озвучка · "+langName(lang) : "Озвучка без названия"),lang:lang,kind:""};
            if (studio) return {key:"v:"+lang+":"+norm(studio.name),label:studio.name,lang:lang,kind:kind};
            if (kind) {
                var label=kind==="dub" ? "Дубляж" : kind==="avo" ? "Одноголосая" : "Многоголосая закадровая";
                return {key:"v:"+lang+":"+kind,label:label+(lang!=="und" ? " · "+langName(lang) : ""),lang:lang,kind:kind}
            }
            var clean=cleanLabel(raw)||raw||"Озвучка";
            return {key:"v:"+lang+":"+norm(clean),label:clean,lang:lang,kind:""}
        }
        function prefLangs() {
            var value="";
            try { value=String(Lampa.Storage.get("fastonline_voice_langs","")||""); } catch(e) {}
            if (!value) {
                var region="";
                try { region=String(q()||"ru").toLowerCase(); } catch(e) { region="ru"; }
                value=(region==="uk"||region==="ua") ? "uk,ru,en" : region==="ru" ? "ru,uk,en" : region+",en,ru,uk"
            }
            var out=[], seen={};
            value.toLowerCase().split(/[\s,;]+/).forEach(function(v) {
                v=lang2(v)||v;
                if (/^[a-z]{2}$/.test(v) && !seen[v]) { seen[v]=true; out.push(v) }
            });
            return out
        }
        function favorites() {
            var x=[];
            try { x=Lampa.Storage.get("fastonline_voice_favorites",[])||[]; } catch(e) {}
            if (typeof x==="string") try { x=JSON.parse(x); } catch(e) { x=[]; }
            return arr(x).map(String)
        }
        function recent() {
            var x=[];
            try { x=Lampa.Storage.get("fastonline_voice_recent",[])||[]; } catch(e) {}
            if (typeof x==="string") try { x=JSON.parse(x); } catch(e) { x=[]; }
            return arr(x).map(String)
        }
        function touch(group) {
            var key=typeof group==="string" ? group : group && group.key;
            if (!key) return;
            var r=recent().filter(function(x) { return x!==key; });
            r.unshift(key); if (r.length>30) r.length=30;
            try { Lampa.Storage.set("fastonline_voice_recent",r); } catch(e) {}
            if (typeof group==="object") {
                var seen={}; try { seen=obj(Lampa.Storage.get("fastonline_voice_seen",{})); } catch(e) {}
                var old=seen[key]||{};
                seen[key]={label:group.label,lang:group.lang,count:(old.count||0)+1,time:Date.now()};
                var keys=Object.keys(seen);
                if (keys.length>300) {
                    keys.sort(function(a,b) { return (seen[b].count||0)-(seen[a].count||0) || (seen[b].time||0)-(seen[a].time||0); });
                    keys.slice(300).forEach(function(k) { delete seen[k]; })
                }
                try { Lampa.Storage.set("fastonline_voice_seen",seen); } catch(e) {}
            }
        }
        function group(items,movie) {
            var map={};
            arr(items).forEach(function(item) {
                var d=describe(item,movie); if (!d) return;
                var g=map[d.key];
                if (!g) g=map[d.key]={key:d.key,label:d.label,lang:d.lang,kind:d.kind,items:[],sources:[],rawNames:[],maxquality:0};
                g.items.push(item);
                var src=item.source_name||"";
                if (src && g.sources.indexOf(src)<0) g.sources.push(src);
                var raw=compact(M.voice(item));
                if (raw && g.rawNames.indexOf(raw)<0) g.rawNames.push(raw);
                var mq=parseInt(item.maxquality,10)||0; if (mq>g.maxquality) g.maxquality=mq
            });
            var list=Object.keys(map).map(function(k) { return map[k]; }), fav=favorites(), rec=recent(), pref=prefLangs();
            list.forEach(function(g) { g.favorite=fav.indexOf(g.key)>=0; });
            list.sort(function(a,b) {
                function bucket(g) {
                    var pi=pref.indexOf(g.lang);
                    if (g.kind==="subs") return 6;
                    if (pi>=0 && g.favorite) return 0;
                    if (pi>=0) return 1;
                    if (g.favorite) return 2;
                    return 3
                }
                var ba=bucket(a),bb=bucket(b); if (ba!==bb) return ba-bb;
                var pa=pref.indexOf(a.lang),pb=pref.indexOf(b.lang);
                if (pa>=0 && pb>=0 && pa!==pb) return pa-pb;
                var ra=rec.indexOf(a.key),rb=rec.indexOf(b.key); ra=ra<0?999:ra; rb=rb<0?999:rb;
                if (ra!==rb) return ra-rb;
                if (b.sources.length!==a.sources.length) return b.sources.length-a.sources.length;
                if (b.maxquality!==a.maxquality) return b.maxquality-a.maxquality;
                if (a.kind==="dub" && b.kind!=="dub") return -1;
                if (b.kind==="dub" && a.kind!=="dub") return 1;
                return a.label.localeCompare(b.label)
            });
            try {
                var seen=obj(Lampa.Storage.get("fastonline_voice_seen",{})),changed=false;
                list.forEach(function(g) { if(!seen[g.key]) { seen[g.key]={label:g.label,lang:g.lang,count:0,time:Date.now()}; changed=true; } });
                if(changed) Lampa.Storage.set("fastonline_voice_seen",seen)
            } catch(e) {}
            return list
        }
        function find(groups,selection) {
            if(!groups||!groups.length) return null;
            var key=typeof selection==="object"&&selection ? selection.key : String(selection||"");
            var exact=groups.find(function(g) { return g.key===key; }); if(exact) return exact;
            if(key) {
                var old=groups.find(function(g) { return g.rawNames.some(function(n) { return M.compareVoice(n,key); }) || M.compareVoice(g.label,key); });
                if(old) return old
            }
            return groups[0]
        }
        function subtitle(g) {
            var parts=[];
            if(g.favorite) parts.push("Избранная");
            if(g.lang&&g.lang!=="und") parts.push(langName(g.lang));
            if(g.sources.length) parts.push(g.sources.length<=3 ? g.sources.join(", ") : g.sources.length+" ист.");
            if(g.maxquality) parts.push(g.maxquality+"p");
            return parts.join(" • ")
        }
        function tracks(groups,current,onSelect) {
            var selected=find(groups,current);
            return groups.map(function(g) {
                return {name:g.label,title:g.label,voice_key:g.key,voice_group:g,subtitle:subtitle(g),selected:!!selected&&selected.key===g.key,
                    onSelect:function() { onSelect(this.voice_group); }}
            })
        }
        function matches(item,selection,movie) {
            var d=describe(item,movie); if(!d) return false;
            var key=typeof selection==="object"&&selection ? selection.key : String(selection||"");
            if(/^(v|unnamed|sub):/.test(key)) return d.key===key;
            return M.compareVoice(M.voice(item),key)||M.compareVoice(d.label,key)
        }
        function mergedSubtitles(items) {
            var out=[],seen={};
            arr(items).forEach(function(item) {
                arr(item&&item.subtitles).forEach(function(s) {
                    if(!s) return;
                    var u=typeof s==="string" ? s : s.url, k=String(u||"")+"|"+String(s.label||s.name||s.language||"");
                    if(!u||seen[k]) return; seen[k]=true; out.push(s)
                })
            });
            return out
        }
        function favoriteMenu(done) {
            var controller=Lampa.Controller.enabled().name,seen={};
            try { seen=obj(Lampa.Storage.get("fastonline_voice_seen",{})); } catch(e) {}
            var fav=favorites(),keys=Object.keys(seen);
            keys.sort(function(a,b) { var af=fav.indexOf(a)>=0,bf=fav.indexOf(b)>=0; return af===bf ? ((seen[b].count||0)-(seen[a].count||0)||String(seen[a].label||a).localeCompare(String(seen[b].label||b))) : (af?-1:1); });
            if(!keys.length) { Lampa.Noty.show("Озвучки появятся после первого поиска"); if(done) done(); return; }
            var items=keys.map(function(k) { return {title:seen[k].label||k,subtitle:seen[k].lang?langName(seen[k].lang):"",checkbox:true,checked:fav.indexOf(k)>=0,voice_key:k}; });
            Lampa.Select.show({title:"Любимые озвучки",items:items,onSelect:function(item) { item.checked=!item.checked; },onBack:function() {
                var next=items.filter(function(x) { return x.checked; }).map(function(x) { return x.voice_key; });
                Lampa.Storage.set("fastonline_voice_favorites",next); Lampa.Controller.toggle(controller); if(done) done();
            }})
        }
        return {describe:describe,group:group,find:find,tracks:tracks,matches:matches,touch:touch,mergedSubtitles:mergedSubtitles,favoriteMenu:favoriteMenu,prefLangs:prefLangs};
    })();

    function ownUrl(value) {
        if (!lampacBase) return "";
        try {
            var base = new URL(lampacBase + "/"), url = new URL(String(value || ""), base);
            if (!/^https?:$/.test(url.protocol) || url.username || url.password || /(?:^|\/)pidtor(?:\/|$)/i.test(url.pathname)) return "";
            if (url.hostname === base.hostname && url.port === base.port) {
                // A reverse proxy may expose Lampac below /prefix while the backend returns /lite/... links.
                if (base.pathname !== "/" && /^\/lite\//i.test(url.pathname))
                    return lampacBase + url.pathname + url.search;
                return url.toString()
            }
            // Lampac behind a proxy can publish its internal host in call links.  Only rewrite its own
            // /lite/... API path; arbitrary external URLs are never given Lampac credentials.
            var at = url.pathname.toLowerCase().indexOf("/lite/");
            if (at >= 0) return lampacBase + url.pathname.slice(at) + url.search;
            return ""
        } catch (error) { return "" }
    }

    function ownToken() {
        if (!lampacBase) return "";
        var scripts = document.scripts || [], host = serverHost();
        for (var index = 0; index < scripts.length; index++) {
            try {
                var url = new URL(scripts[index].src, location.href);
                if (url.hostname.toLowerCase() !== host) continue;
                var match = url.pathname.match(/^.*\/(?:sync|online)\/js\/([^/]+)$/);
                if (match) return decodeURIComponent(match[1]);
                if (/(?:^|\/)(?:sync|online)\.js$/.test(url.pathname) && url.searchParams.get("token"))
                    return url.searchParams.get("token")
            } catch (error) {}
        }
        return ""
    }

    function copyStreamMetadata(target, stream) {
        ["headers", "segments", "hls_manifest_timeout", "subtitles", "subtitles_call", "translate_name", "source_name", "original_url", "hls_type"].forEach(function(key) {
            if (stream && stream[key] !== undefined) target[key] = stream[key];
            else delete target[key]
        });
        return target
    }

    function collectStreamLinks(value, inherited) {
        var result = [];
        function append(item, metadata) {
            if (Array.isArray(item)) return item.forEach(function(child) { append(child, metadata) });
            if (item && typeof item === "object") {
                var own = copyStreamMetadata({}, metadata);
                ["headers", "segments", "hls_manifest_timeout", "subtitles", "subtitles_call", "translate_name", "source_name", "original_url", "hls_type"].forEach(function(key) {
                    if (item[key] !== undefined) own[key] = item[key]
                });
                append(item.url, own);
                append(item.reserve, own);
                return
            }
            if (typeof item !== "string") return;
            item.split(/\s+or\s+/).forEach(function(url) {
                url = url.trim();
                if (url.charAt(0) === "/" && url.charAt(1) !== "/") url = lampacBase + url;
                if ((/^https?:\/\//i.test(url) || Object.keys(managedManifests || {}).some(function(key) { return managedManifests[key] + "#.m3u8" === url })) && !result.some(function(record) { return record.url === url }))
                    result.push({url: url, metadata: copyStreamMetadata({}, metadata)})
            })
        }
        append(value, inherited || {});
        return result
    }

    function requestHeaders() {
        var key = Lampa.Storage.get("kit_aesgcmkey", "");
        return key ? {"X-Kit-AesGcm": key} : {}
    }

    function N(value) {
        var safe = ownUrl(value);
        if (!safe) return "";
        var url = new URL(safe), owner = window.rch_nws && window.rch_nws[U];
        var identity = {
            rjson: "true",
            uid: Lampa.Storage.get("lampac_unic_id", "") || "guest",
            account_email: Lampa.Storage.get("account_email", ""),
            profile_id: Lampa.Storage.get("lampac_profile_id", ""),
            token: ownToken(),
            nws_id: owner && owner.connectionId || Lampa.Storage.get("lampac_nws_id", ""),
            rchtype: owner && owner.type || (Lampa.Platform.is("android") ? "apk" : "web")
        };
        Object.keys(identity).forEach(function(key) {
            if (identity[key] && !url.searchParams.has(key)) url.searchParams.set(key, identity[key])
        });
        return url.toString()
    }
    var U = "", rchPending = [];

    function W(response, ready, failed) {
        if (!response || !response.rch) return false;
        if (response.nws) {
            try {
                var endpoint = new URL(response.nws);
                if (endpoint.hostname !== U || !/^wss?:$/.test(endpoint.protocol)) {
                    if (failed) failed();
                    return false
                }
            } catch (error) { if (failed) failed(); return false }
        }
        var done = false;
        var timer = setTimeout(function() { finish(false) }, 10000);
        function finish(ok) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            var index = rchPending.indexOf(finish);
            if (index >= 0) rchPending.splice(index, 1);
            if (!rchPending.length) rchPending = [];
            if (ok) { if (ready) ready() } else if (failed) failed()
        }
        if (typeof window.Online2RchHandshake === "function") {
            if (!window.Online2RchHandshake(response, function() { finish(true) }, function() { return !done }))
                finish(false);
            return true
        }
        rchPending.push(finish);
        if (rchPending.length > 1) return true;
        var batch = rchPending;
        function complete(ok) {
            if (rchPending !== batch) return;
            var callbacks = rchPending;
            rchPending = [];
            callbacks.forEach(function(callback) { callback(ok) })
        }
        function connect() {
            if (rchPending !== batch) return;
            var owner = window.rch_nws && window.rch_nws[U];
            if (!owner || typeof owner.Registry !== "function" || typeof NativeWsClient === "undefined") {
                complete(false); return
            }
            window.nwsClient = window.nwsClient || {};
            var client = window.nwsClient[U];
            if (client && client.connectionId != null) { complete(true); return }
            if (client) {
                if (typeof client.reconnect === "function") client.reconnect(function() { complete(true) });
                else client.on("Connected", function() { complete(true) });
                return
            }
            if (!response.nws) { complete(false); return }
            client = window.nwsClient[U] = new NativeWsClient(response.nws, {autoReconnect: true});
            client.on("Connected", function() {
                // Registry and RCH requests stay owned by Lampac's own online module.
                owner.Registry(client, function() { complete(true) })
            });
            client.on("Closed", function() { owner.connectionId = "" });
            client.on("Error", function() { complete(false) });
            client.connect()
        }
        if (typeof NativeWsClient === "undefined") {
            Lampa.Utils.putScript([lampacBase + "/js/nws-client-es5.js?v21042026"],
                function() {}, false, connect, true)
        } else connect();
        return true
    }
    var H = function() {
        function n(e) {
            t(this, n), this.object = e, this.network = new Lampa.Reguest, this.voiceSave = new o(e)
        }
        return i(n, [{
            key: "externalids",
            value: function() {
                var e = this;
                return new Promise((function(t, n) {
                    if (e.object.movie.imdb_id && e.object.movie.kinopoisk_id) t();
                    else {
                        var i = [];
                        i.push("id=" + e.object.movie.id), i.push("serial=" + (e.object.movie.name ? 1 : 0)), e.object.movie.imdb_id && i.push("imdb_id=" + (e.object.movie.imdb_id || "")), e.object.movie.kinopoisk_id && i.push("kinopoisk_id=" + (e.object.movie.kinopoisk_id || ""));
                        var a = lampacBase + "/externalids?" + i.join("&");
                        e.network.timeout(1e4), e.network.silent(N(a), (function(n) {
                            for (var i in n) e.object.movie[i] = n[i];
                            t()
                        }), (function() {
                            t()
                        }), false, {headers: requestHeaders()})
                    }
                }))
            }
        }, {
            key: "requestParams",
            value: function(e) {
                var t = [],
                    n = this.object,
                    i = n.movie.source || "tmdb";
                return t.push("id=" + n.movie.id), n.movie.imdb_id && t.push("imdb_id=" + (n.movie.imdb_id || "")), n.movie.kinopoisk_id && t.push("kinopoisk_id=" + (n.movie.kinopoisk_id || "")), t.push("title=" + encodeURIComponent(n.clarification ? n.search : n.movie.title || n.movie.name)), t.push("original_title=" + encodeURIComponent(n.movie.original_title || n.movie.original_name)), t.push("serial=" + (n.movie.name ? 1 : 0)), t.push("original_language=" + (n.movie.original_language || "")), t.push("year=" + ((n.movie.release_date || n.movie.first_air_date || "0000") + "").slice(0, 4)), t.push("source=" + i), t.push("clarification=" + (n.clarification ? 1 : 0)), t.push("rjson=true"), Lampa.Storage.get("account_email", "") && t.push("cub_id=" + Lampa.Utils.hash(Lampa.Storage.get("account_email", ""))), e + (e.indexOf("?") >= 0 ? "&" : "?") + t.join("&")
            }
        }, {
            key: "availableSources",
            value: function() {
                var reader=this;
                return new Promise(function(resolve) {
                    withLampacServer(function(base) {
                        if (!base) { resolve([]); return }
                        var count=0, found=[], memkey='', retriedRch=false;
                        function finish() {
                            var discovered = rememberAvailable(found), chosen = A();
                            if (hasManualSources()) {
                                var allowed = discovered.filter(function(id) { return chosen.indexOf(id) >= 0 });
                                resolve(allowed.length ? allowed : chosen)
                            } else resolve(discovered.length ? discovered : chosen)
                        }
                        function request() {
                            var url=memkey ? base+'/lifeevents?memkey='+encodeURIComponent(memkey) : base+'/lite/events?life=true';
                            reader.network.timeout(10000);
                            reader.network.silent(reader.requestParams(N(url)),function(response) {
                                if (response && response.rch && !retriedRch) {
                                    retriedRch=true;
                                    return W(response,function(){ count=0; memkey=''; request() },finish)
                                }
                                if (typeof response==='string') try { response=JSON.parse(response) } catch(error) { response=null }
                                var items=serverSources(Array.isArray(response) ? response : response && response.online);
                                items.forEach(function(id) { if(found.indexOf(id)<0) found.push(id) });
                                if (response && response.memkey) memkey=response.memkey;
                                if (Array.isArray(response) || response && response.ready || !memkey || ++count>=15) finish();
                                else setTimeout(request,500)
                            },finish,false,{headers:requestHeaders()})
                        }
                        request()
                    })
                })
            }        }, {
            key: "query",
            value: function(options) {
                var reader=this;
                return this.availableSources().then(function(sources) { return reader.querySources(options,sources) })
            }
        }, {
            key: "querySources",
            value: function(e, sources) {
                var t = this;
                return new Promise((function(n, i) {
                    var a, o = [].concat(sources),
                        l = new r(o.length),
                        s = !1;

                    function c() {
                        s || Lampa.Noty.show("Секундочку...")
                    }
                    c(), a = setInterval(c, 2e3), l.onComplite = function(e) {
                        s = !0, clearInterval(a);
                        var t = [],
                            r = 700;
                        o.forEach((function(n) {
                            var i = e[n];
                            if (i)
                                if (i.error) r = i.error;
                            else if (i.accsdb) r = 600;
                            else if ("similar" != i.type && i.data) {
                                var a = i.balanser || i._source_id || n;
                                i.voice && Lampa.Arrays.isArray(i.voice) && i.voice.forEach((function(e) {
                                    e.source_name = a
                                })), i.data && Lampa.Arrays.isArray(i.data) && i.data.forEach((function(e) {
                                    e.source_name = a
                                })), i.source_name = a, t.push(i.voice ? i : i.data)
                            }
                        })), t.length ? n(t) : i(r)
                    }, o.forEach((function(n) {
                        t.source(n, e.season).then((function(e) {
                            if (e.voice && e.data && e.data[0] && e.data[0].quality) {
                                var t = 0;
                                for (var i in e.data[0].quality) {
                                    var a = parseInt(i);
                                    a > t && (t = a)
                                }
                                t > 0 && e.voice.forEach((function(e) {
                                    (!e.maxquality || parseInt(e.maxquality) < t) && (e.maxquality = t + "p")
                                }))
                            }
                            e._source_id = n, l.append(n, e)
                        })).catch((function(e) {
                            l.append(n, {
                                error: e
                            })
                        }))
                    }))
                }))
            }
        }, {
            key: "source",
            value: function(e, t) {
                if (!cleanSources([e]).length) return Promise.reject(400);
                var n = this;
                return new Promise((function(i, a) {
                    var o = function(e) {
                            for (var t = 0; t < y.length; t++) {
                                var n = y[t],
                                    i = Lampa.Arrays.isArray(n.id) ? n.id : [n.id];
                                if (-1 !== i.indexOf(e)) return i
                            }
                            return [e]
                        }(e),
                        r = 0,
                        l = function() {
                            if (r >= o.length) a(400);
                            else {
                                var e = o[r],
                                    s = function(o, c) {
                                        var u = o ? "/lite/" : "/",
                                            d = lampacBase + u + e,
                                            m = n.requestParams(N(d));
                                        t && (m += "&s=" + t), n.network.timeout(1e4), n.network.silent(m, (function(e) {
                                            var t;
                                            try {
                                                t = JSON.parse(e)
                                            } catch (e) {}
                                            t ? t.rch && !c ? W(t, (function() {
                                                s(o, !0)
                                            }), function() { a(500) }) : "disable" === t || t.disable || t.error && !t.data ? (r++, l()) : i(t) : "disable" === e ? (r++, l()) : a(500)
                                        }), (function() {
                                            o ? s(!1, c) : (r++, l())
                                        }), !1, {
                                            dataType: "text", headers: requestHeaders()
                                        })
                                    },
                                    c = -1 == E.nolite.indexOf(e);
                                s(c, !1)
                            }
                        };
                    l()
                }))
            }
        }, {
            key: "links",
            value: function(e) {
                var t = this;
                return new Promise((function(n, i) {
                    var a = [],
                        o = [];
                    e.forEach((function(e) {
                        a = a.concat(e.filter((function(e) {
                            return "call" == e.method
                        }))), o = o.concat(e.filter((function(e) {
                            return "play" == e.method
                        })))
                    }));
                    var l = new r(a.length);
                    l.onComplite = function() {
                        K(o, function(items) { n(M.renameTranslate(items)) })
                    };
                    var s = function(e, n) {
                        var safe = N(e.url);
                        if (!safe) return void l.error();
                        t.network.timeout(1e4), t.network.silent(safe, (function(t) {
                            if (t.rch && !n) W(t, (function() {
                                s(e, !0)
                            }), l.error.bind(l));
                            else {
                                var i = t;
                                if (!i || i.error || i.accsdb || (!i.url && (!i.quality || !Object.keys(i.quality).length)))
                                    return void l.error();
                                i.source_name = e.source_name || i.source_name || "";
                                if (!i.quality && i.url) {
                                    i.quality = {};
                                    var a = i.url;
                                    -1 !== a.indexOf(" or ") && (a = a.split(" or ")[0]), i.quality.auto = i.url
                                }
                                i.details = e.details || i.details || "no details", i.translate = e.translate || i.translate || "no translate", o.push(i), l.next()
                            }
                        }), l.error.bind(l), false, {headers: requestHeaders()})
                    };
                    a.forEach((function(e) {
                        s(e, !1)
                    })), 0 == a.length && K(o, function(items) { n(M.renameTranslate(items)) })
                }))
            }
        }, {
            key: "m3u",
            value: function(e) {
                var t = this;
                return new Promise((function(n, i) {
                    var a = [],
                        o = Lampa.Storage.field("video_quality_default"),
                        r = function(t) {
                            parseInt(t) <= o && [e.quality[t].url].concat(e.quality[t].reserve).forEach((function(n) {
                                a.push({
                                    quality: t,
                                    name: e.name,
                                    url: n
                                })
                            }))
                        };
                    for (var l in e.quality) r(l);
                    t.network.silent(lampacBase + "/m3u/add", (function(e) {
                        n(lampacBase + e.url)
                    }), (function(e, t) {
                        i(400)
                    }), {
                        playlist: a
                    }, {headers: requestHeaders()})
                }))
            }
        }, {
            key: "flows",
            value: function(e) {
                var t = [],
                    n = Lampa.Storage.field("video_quality_default"),
                    i = function(n) {
                        var i = [e[n].url].concat(e[n].reserve),
                            metadata = e[n].stream_meta || {}, a = parseInt(n);
                        i.forEach((function(e) {
                            t.push({
                                int: a,
                                label: a > 1440 ? "4K" : a >= 1440 ? "2K" : a >= 1080 ? "FHD" : a >= 720 ? "HD" : "",
                                quality: n,
                                stream_meta: metadata[e],
                                url: e
                            })
                        }))
                    };
                for (var a in e) i(a);
                var o = t.find((function(e) {
                    return e.int == n
                }));
                return o && (o.selected = !0), t
            }
        }, {
            key: "movie",
            value: function(e) {
                var t = this;
                return new Promise((function(n, i) {
                    t.externalids().then((function() {
                        return t.query(e)
                    })).then((function(e) {
                        var t = [];
                        if (e.forEach((function(e) {
                                var n = M.filterTranslate(e);
                                n.length && (t = t.concat(n))
                            })), t.forEach((function(e) {
                                e.maxquality = e.maxquality || 0;
                                var t = M.voice(e).match(/\[(.*?)\]/);
                                t && (t = t[1].split(",").map((function(e) {
                                    return e.trim()
                                })), e.lang = (t.map((function(e) {
                                    return e.toLowerCase()
                                })).find((function(e) {
                                    return "ru" == e || "uk" == e || "rus" == e || "ukr" == e || "укр" == e
                                })) || "").toUpperCase(), e.lang = "RUS" == e.lang ? "RU" : "UKR" == e.lang ? "UA" : e.lang, "RU" == e.lang && "ru" == M.region() && (e.lang = ""), e.translate = t.find((function(e) {
                                    return e.length > 5
                                })) || e.translate)
                            })), 0 == t.length) throw new Error("No data");
                        M.renameTranslate(t), n({
                            sources: e,
                            translates: t
                        })
                    })).catch(i)
                }))
            }
        }, {
            key: "tv",
            value: function(t) {
                var n = this;
                return new Promise((function(i, o) {
                    n.externalids().then((function() {
                        n.query(t).then((function(t) {
                            n.voice(t).then((function(n) {
                                i(function(t) {
                                    for (var n = 1; n < arguments.length; n++) {
                                        var i, o = null !== (i = arguments[n]) && void 0 !== i ? i : {};
                                        n % 2 ? e(Object(o), !0).forEach((function(e) {
                                            a(t, e, o[e])
                                        })) : Object.getOwnPropertyDescriptors ? Object.defineProperties(t, Object.getOwnPropertyDescriptors(o)) : e(Object(o)).forEach((function(e) {
                                            Object.defineProperty(t, e, Object.getOwnPropertyDescriptor(o, e))
                                        }))
                                    }
                                    return t
                                }({
                                    sources: t
                                }, n))
                            })).catch(o)
                        })).catch(o)
                    }))
                }))
            }
        }, {
            key: "voice",
            value: function(e, strictVoice) {
                var t = this;
                return new Promise((function(n, i) {
                    var a = strictVoice || t.voiceSave.get(),
                        o = [],
                        l = E.filter_tv,
                        s = [],
                        c = function e(n, i) {
                            return new Promise((function(a, o) {
                                var safe = N(n.url);
                                if (!safe) return void o(400);
                                t.network.timeout(1e4), t.network.silent(safe, (function(response) {
                                    var r, l = response;
                                    if ("string" == typeof response)
                                        if (-1 !== response.indexOf("<div") || -1 !== response.indexOf("data-json")) r = {
                                            data: []
                                        }, $(response).find("[data-json]").each((function() {
                                            try {
                                                var e = $(this).attr("data-json"),
                                                    t = JSON.parse(e);
                                                "play" === t.method && t.url && r.data.push(t)
                                            } catch (e) {}
                                        })), l = r;
                                        else try {
                                            l = JSON.parse(response)
                                        } catch (e) {
                                            l = {}
                                        }
                                    if (l.rch && !i) W(l, (function() {
                                        e(n, !0).then(a).catch(o)
                                    }), function() { o(500) });
                                    else {
                                        if (!l.data || 0 === l.data.length) return void o("no data");
                                        ! function(e, item) {
                                            var desc = VoiceKit.describe(item, t.object && t.object.movie ? t.object.movie : {}) || {key:"",label:M.voice(item)};
                                            e.data.forEach((function(e) {
                                                e.translate_name = desc.label, e.translate_key = desc.key, e.source_name = item.source_name || e.source_name || ""
                                            }))
                                        }(l, n), a(l.data)
                                    }
                                }), (function(e) {
                                    o(e)
                                }), !1, {
                                    dataType: "text", headers: requestHeaders()
                                })
                            }))
                        };
                    e.forEach((function(e) {
                        if (e.voice && Lampa.Arrays.isArray(e.voice)) {
                            e.voice = M.filterTranslate(e.voice);
                            var t = e.source_name || e.balanser || "";
                            e.voice.forEach((function(e) {
                                e.source_name = e.source_name || t
                            })), s = s.concat(e.voice.filter((function(e) {
                                return 0 == l.filter((function(t) {
                                    return M.voice(e).toLowerCase().indexOf(t) >= 0
                                })).length
                            })))
                        }
                    }));
                    var grouped = VoiceKit.group(s, t.object.movie),
                        chosen = VoiceKit.find(grouped, a);
                    a = chosen || a;
                    s.sort((function(e, t) {
                        return M.voice(e).toLowerCase().localeCompare(M.voice(t).toLowerCase())
                    }));
                    var u = s.filter((function(e) {
                        return VoiceKit.matches(e, a, t.object.movie)
                    })),
                        d = new r(u.length);
                    d.onComplite = function() {
                        if (0 == o.length) {
                            if (strictVoice) return void i(new Error("Выбранная озвучка недоступна"));
                            if (!s[0]) return void i(700);
                            var fallbackGroup = VoiceKit.find(grouped, ""),
                                fallbackItem = fallbackGroup && fallbackGroup.items && fallbackGroup.items[0] || s[0];
                            c(fallbackItem, !1).then((function(e) {
                                o = o.concat(e), n({
                                    translates: s,
                                    plays: o
                                })
                            })).catch(i)
                        } else n({
                            translates: s,
                            plays: o
                        })
                    }, u.forEach((function(e) {
                        c(e, !1).then((function(e) {
                            o = o.concat(e), d.next()
                        })).catch(d.error.bind(d))
                    })), 0 == u.length && d.onComplite()
                }))
            }
        }, {
            key: "error",
            value: function(e) {
                var t = Lampa.Controller.enabled().name,
                    n = $('<div class="connect-broken">\n\t\t\t\t\t\t\t\t\t<div class="connect-broken__title">Вот досада...</div>\n\t\t\t\t\t\t\t\t\t<div class="connect-broken__text">' + "К сожалению, не удалось найти видеоконтент для этого фильма. Попробуйте выбрать другой фильм или повторите попытку позже." + '</div>\n\t\t\t\t\t\t\t\t\t<div class="connect-broken__footer">\n\t\t\t\t\t\t\t\t\t\t<div class="selector simple-button">Закрыть</div>\n\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t</div>');
                n.find(".selector").on("hover:enter", (function() {
                    Lampa.Controller.back()
                })), Lampa.Modal.open({
                    title: "",
                    html: n,
                    onBack: function() {
                        Lampa.Modal.close(), Lampa.Controller.toggle(t)
                    }
                })
            }
        }]), n
    }();

    function qualityNumber(name) {
        var text = String(name || '').toLowerCase();
        if (/(?:^|\W)(?:4k|uhd)(?:$|\W)/.test(text)) return 2160;
        if (/full\s*hd|fhd/.test(text)) return 1080;
        var size = text.match(/(\d+)\s*x\s*(\d+)/);
        if (size) return resolutionQuality(+size[1], +size[2]);
        var number = text.match(/(?:^|\D)(2160|1440|1080|720|576|480|360|240)(?:p|\D|$)/);
        return number ? +number[1] : 0
    }

    function resolutionQuality(width, height) {
        var sizes = [2160, 1440, 1080, 720, 576, 480, 360, 240];
        for (var index = 0; index < sizes.length; index++) {
            var size = sizes[index];
            // Cinema frames can be cropped vertically. Their encoded width identifies the tier.
            if (width >= Math.round(size * 16 / 9) - 24 || height >= size - 12) return size
        }
        return 0
    }

    function preferredUrl(quality) {
        var keys = Object.keys(quality || {}), wanted = +Lampa.Storage.field('video_quality_default');
        var selected = keys.find(function(key) { return qualityNumber(key) === wanted && wanted >= 720 });
        if (!selected) selected = keys.sort(function(a, b) { return qualityNumber(b) - qualityNumber(a) })[0];
        return selected ? quality[selected].url : ''
    }

    var managedManifests = {};
    function absoluteManifestLine(line, base) {
        if (line.charAt(0) !== '#') return new URL(line, base).toString();
        return line.replace(/URI="([^"]+)"/g, function(match, uri) {
            return 'URI="' + new URL(uri, base).toString() + '"'
        })
    }

    function parseMaster(text, base, metadata) {
        var lines = String(text).split(/\r?\n/), shared = [], variants = [], pending = null;
        lines.forEach(function(raw) {
            var line = raw.trim();
            if (!line) return;
            if (line.indexOf('#EXT-X-STREAM-INF:') === 0) { pending = line; return }
            if (pending && line.charAt(0) !== '#') {
                var match = pending.match(/RESOLUTION=(\d+)x(\d+)/i);
                var number = match ? resolutionQuality(+match[1], +match[2]) : 0;
                if (number >= 720) variants.push({number: number, info: pending,
                    url: new URL(line, base).toString()});
                pending = null;
            } else if (line.indexOf('#EXT-X-I-FRAME-STREAM-INF:') !== 0)
                shared.push(absoluteManifestLine(line, base))
        });
        var alternate = shared.some(function(line) { return /^#EXT-X-MEDIA:.*URI=/.test(line) });
        var quality = {};
        variants.forEach(function(variant) {
            var key = variant.number + 'p', record = copyStreamMetadata({}, metadata);
            record.original_url = variant.url;
            record.url = variant.url;
            if (alternate && M.player() === 'inner' && typeof Blob !== 'undefined' && URL.createObjectURL) {
                // Keep all audio/subtitle groups, but only this video resolution. ABR cannot fall below it.
                var master = shared.concat([variant.info, variant.url]).join('\n') + '\n';
                var cacheKey = base + '\n' + master;
                if (!managedManifests[cacheKey])
                    managedManifests[cacheKey] = URL.createObjectURL(new Blob([master], {type:'application/vnd.apple.mpegurl'}));
                record.url = managedManifests[cacheKey] + '#.m3u8';
                record.hls_type = 'hlsjs'
            }
            if (!quality[key]) quality[key] = record;
            else { quality[key].reserve = quality[key].reserve || []; quality[key].reserve.push(record) }
        });
        return quality
    }

    function K(items, callback) {
        var jobs = [];
        (items || []).forEach(function(item) {
            var source = item.quality && typeof item.quality === 'object' ? item.quality : {auto:item.url};
            var confirmed = {}, seen = {};
            item.quality = confirmed;
            function store(name, record) {
                var number = qualityNumber(name);
                if (number < 720) return;
                var key = number + 'p';
                if (!confirmed[key]) confirmed[key] = record;
                else { confirmed[key].reserve = confirmed[key].reserve || []; confirmed[key].reserve.push(record) }
            }
            Object.keys(source).forEach(function(name) {
                collectStreamLinks(source[name], copyStreamMetadata({}, item)).forEach(function(record) {
                    if (seen[record.url]) return;
                    seen[record.url] = true;
                    if (!/\.m3u8(?:[?#]|$)/i.test(record.url) || /^blob:/.test(record.url)) {
                        store(name, Object.assign({url:record.url},record.metadata)); return
                    }
                    jobs.push(function(done) {
                        var request = new Lampa.Reguest;
                        request.timeout(6000);
                        request.native(record.url, function(text) {
                            if (typeof text === 'string' && text.indexOf('#EXT-X-STREAM-INF:') >= 0) {
                                var parsed;
                                try { parsed = parseMaster(text, record.url, record.metadata) } catch (error) { parsed = {} }
                                Object.keys(parsed).forEach(function(key) { store(key, parsed[key]) })
                            } else if (typeof text === 'string' && text.indexOf('#EXTM3U') >= 0)
                                store(name, Object.assign({url:record.url},record.metadata));
                            done()
                        }, done, false, {dataType:'text', headers:record.metadata.headers || {}})
                    })
                })
            })
        });
        var remaining = jobs.length;
        function finish() {
            (items || []).forEach(function(item) {
                item.maxquality = Object.keys(item.quality).reduce(function(max, key) {
                    return Math.max(max,qualityNumber(key))
                },0)
            });
            callback(items)
        }
        if (!remaining) return finish();
        jobs.forEach(function(job) {
            var complete = false;
            job(function() { if (!complete) { complete=true; if (!--remaining) finish() } })
        })
    }

    var playbackSequence = 0;
    var J = function() {
        function e(n) {
            var i = this;
            t(this, e), this.object = n, this.extract = new H(n), this.voice = new o(n), this.on_error_timer = null, this.instanceId = ++playbackSequence;
            var started = function(data) {
                if (data && data.lampac_fastonline_owner === i.instanceId && data.lampac_merged_quality) {
                    i.applyStreamData(data);
                    i.setFlowsForQuality(data)
                } else if (data && data.lampac_fastonline_owner) {
                    Lampa.Player.listener.remove("start", started);
                    Lampa.Player.listener.remove("destroy", destroyed);
                    if(Lampa.PlayerVideo && Lampa.PlayerVideo.listener) {
                        Lampa.PlayerVideo.listener.remove('tracks',nativeTracks);
                        Lampa.PlayerVideo.listener.remove('videosize',videoSize)
                    }
                }
            };
            var destroyed = function() {
                clearTimeout(i.on_error_timer);
                try {
                    Object.keys(managedManifests).forEach(function(key) {
                        var url = managedManifests[key];
                        if (url && /^blob:/.test(url)) URL.revokeObjectURL(url);
                        delete managedManifests[key]
                    })
                } catch (e) {}
            };
            var nativeTracks=function(event) {
                var data=Lampa.Player.playdata();
                if(data && data.lampac_fastonline_owner===i.instanceId && event.tracks && data.voiceovers) {
                    var extra=event.tracks.map(function(track) {
                        return {name:track.name || track.language || 'Аудиодорожка',title:track.name || track.language || 'Аудиодорожка',
                            subtitle:'Аудио в текущем источнике',selected:!!track.selected,onSelect:function() {
                                event.tracks.forEach(function(item) { item.enabled=false; item.selected=false });
                                track.enabled=true; track.selected=true;
                                extra.forEach(function(item) { item.selected=false });
                                this.selected=true;
                                Lampa.Controller.toggle('player')
                            }}
                    });
                    Lampa.PlayerPanel.setTracks(data.voiceovers.concat(extra))
                }
            };
            var videoSize=function(size) { i.checkVideoResolution(size) };
            if(Lampa.PlayerVideo && Lampa.PlayerVideo.listener) {
                Lampa.PlayerVideo.listener.follow('tracks',nativeTracks);
                Lampa.PlayerVideo.listener.follow('videosize',videoSize)
            }
            Lampa.Player.listener.follow("start", started);
            Lampa.Player.listener.follow("destroy", destroyed)
        }
        return i(e, [{
            key: "getQuality",
            value: function(items) {
                var player = this, merged = {}, mergedSubs = VoiceKit.mergedSubtitles(items || []);
                (items || []).forEach(function(item) {
                    var quality = item.quality;
                    if (!quality || typeof quality !== "object") quality = {auto: item.url};
                    Object.keys(quality).forEach(function(name) {
                        var number = qualityNumber(name);
                        if (number < 720) return;
                        var key = number ? number + "p" : name;
                        var metadata = copyStreamMetadata({}, item);
                        metadata.translate_name = item.translate_name || M.voice(item);
                        if (mergedSubs.length) metadata.subtitles = mergedSubs;
                        var records = collectStreamLinks(quality[name], metadata);
                        if (!records.length) return;
                        if (!merged[key]) merged[key] = {
                            label: number > 1440 ? "4K" : number >= 1440 ? "2K" : number >= 1080 ? "FHD" : number >= 720 ? "HD" : "",
                            url: records[0].url, reserve: [], used: [], error: [], stream_meta: {},
                            call: function(instance, ready) {
                                var data = Lampa.Player.playdata();
                                var selected=[instance.url].concat(instance.reserve).find(function(url) { return instance.error.indexOf(url)<0 });
                                if(!selected) return void Lampa.Noty.show('Источники этого качества недоступны');
                                data.url = selected;
                                data.quality_switched = key;
                                player.applyStreamData(data);
                                ready(selected)
                            },
                            trigger: function() {
                                var data = Lampa.Player.playdata();
                                player.applyStreamData(data);
                                player.setFlowsForQuality(data)
                            }
                        };
                        var group = merged[key];
                        records.forEach(function(record) {
                            if (record.url !== group.url && group.reserve.indexOf(record.url) < 0) group.reserve.push(record.url);
                            if (!group.stream_meta[record.url]) group.stream_meta[record.url] = record.metadata
                        })
                    })
                });
                var result = {};
                Object.keys(merged).sort(function(left, right) {
                    return (parseInt(right, 10) || 0) - (parseInt(left, 10) || 0)
                }).forEach(function(key) { result[key] = merged[key] });
                return result
            }
        }, {
            key: "getSplitLinks",
            value: function(value) {
                return collectStreamLinks(value).map(function(record) { return record.url })
            }
        }, {
            key: "getSelectedQuality",
            value: function(e) {
                var t = null,
                    n = e.url,
                    i = e.quality || e.lampac_merged_quality || {};
                if (e.quality_switched) {
                    for (var a in i)
                        if (a == e.quality_switched) {
                            t = i[a];
                            break
                        }
                } else
                    for (var a in i) {
                        var o = i[a];
                        if (o.url == n || o.reserve.indexOf(n) >= 0) {
                            t = o;
                            break
                        }
                    }
                if (!t)
                    for (var a in i) {
                        t = i[a];
                        break
                    }
                return t
            }
        }, {
            key: "getQualityLevelDown",
            value: function(e) {
                var t, n, quality = e.quality || e.lampac_merged_quality || {}, i = this.getSelectedQuality(e);
                for (var a in quality)
                    if (i == quality[a]) {
                        t = a;
                        break
                    }
                if (t) {
                    var o = Lampa.Arrays.getKeys(quality);
                    o.sort((function(e, t) {
                        return parseInt(t) - parseInt(e)
                    })), o.forEach((function(e) {
                        parseInt(e) < parseInt(t) && !n && parseInt(e) >= 720 && (n = e)
                    }))
                }
                return n
            }
        }, {
            key: "getReserveQuality",
            value: function(data) {
                var quality = this.getSelectedQuality(data);
                if (!quality) return "";
                if (quality.error.indexOf(data.url) < 0) quality.error.push(data.url);
                var next = [quality.url].concat(quality.reserve).find(function(url) {
                    return url !== data.url && quality.used.indexOf(url) < 0 && quality.error.indexOf(url) < 0
                });
                if (next) quality.used.push(next);
                return next || ""
            }
        }, {
            key: "getPlayData",
            value: function(e) {
                var t = Lampa.Utils.hash(e.season ? [e.season, e.season > 10 ? ":" : "", e.episode, this.object.movie.original_title].join("") : this.object.movie.original_title),
                    n = this.getQuality(e.quality);
                return {
                    title: this.object.movie.title || this.object.movie.name,
                    url: preferredUrl(n),
                    quality: n,
                    timeline: Lampa.Timeline.view(t),
                    translate_name: e.translate,
                    card: this.object.movie
                }
            }
        }, {
            key: "getNextVoice",
            value: function(data, voices, callback) {
                var next = this.getReserveQuality(data);
                while (!next) {
                    var lower = this.getQualityLevelDown(data);
                    if (!lower) break;
                    data.quality_switched = lower;
                    var quality = (data.quality || data.lampac_merged_quality)[lower];
                    next = [quality.url].concat(quality.reserve).find(function(url) {
                        return quality.error.indexOf(url) < 0 && quality.used.indexOf(url) < 0
                    });
                    if (next) quality.used.push(next)
                }
                if (next) {
                    data.url = next;
                    this.applyStreamData(data);
                    callback(next);
                    this.setFlowsForQuality(data)
                } else M.modalChoiceTranstale({
                    from: M.voice(voices.find(function(voice) { return voice.selected }) || voices[0] || {}),
                    voicelist: voices
                })
            }
        }, {
            key: "setFlowsForQuality",
            value: function(data) {
                var player = this;
                if (!data || !(data.quality || data.lampac_merged_quality)) return;
                var quality = this.getSelectedQuality(data);
                if (!quality) return;
                var urls = [quality.url].concat(quality.reserve).filter(function(url) {
                    return quality.error.indexOf(url) < 0
                });
                Lampa.PlayerPanel.setFlows(urls.length ? urls.map(function(url, index) {
                    return {title: (quality.stream_meta[url] && quality.stream_meta[url].source_name || "Источник " + (index + 1)), subtitle: (data.quality_switched || Object.keys(data.quality || data.lampac_merged_quality).find(function(key) { return (data.quality || data.lampac_merged_quality)[key] === quality }) || "") + " • " + Lampa.Utils.shortText(quality.stream_meta[url] && quality.stream_meta[url].original_url || url, 35),
                        url: url, selected: url === data.url,
                        onSelect: function() {
                            var active = Lampa.Player.playdata();
                            active.url = url;
                            active.flow_switched = url;
                            player.applyStreamData(active);
                            Lampa.Controller.toggle("player");
                            Lampa.PlayerPanel.listener.send("flow", {url: url});
                            player.setFlowsForQuality(active)
                        }}
                }) : false)
            }
        }, {
            key: "applyStreamData",
            value: function(data) {
                if (data.quality) {
                    data.lampac_merged_quality = data.quality;
                    data.lampac_fastonline_owner = this.instanceId
                }
                var quality = this.getSelectedQuality(data);
                if (quality && quality.stream_meta && quality.stream_meta[data.url])
                    copyStreamMetadata(data, quality.stream_meta[data.url]);
                return data
            }
        }, {
            key: "checkVideoResolution",
            value: function(size) {
                var player=this, data=Lampa.Player.playdata();
                if(!data || data.lampac_fastonline_owner!==this.instanceId || !size.width || !size.height) return;
                var number=resolutionQuality(size.width,size.height), quality=this.getSelectedQuality(data);
                if(!quality) return;
                if(number<720) {
                    if(quality.error.indexOf(data.url)>=0) return;
                    var rejected=data.url;
                    Lampa.PlayerVideo.pause();
                    Lampa.Noty.show('Источник ниже 720p исключён');
                    this.getNextVoice(data,data.voiceovers || [],function(url) {
                        Lampa.PlayerPanel.listener.send('flow',{url:url})
                    });
                    if(data.url===rejected) Lampa.PlayerPanel.quality(false,'');
                    return
                }
                var groups=data.quality || data.lampac_merged_quality, oldKey=Object.keys(groups).find(function(key) { return groups[key]===quality });
                if(qualityNumber(oldKey)===number) return;
                var actualKey=number+'p', record=copyStreamMetadata({},quality.stream_meta[data.url]);
                record.url=data.url;
                var incoming={}; incoming[actualKey]=record;
                var confirmed=this.getQuality([{quality:incoming}])[actualKey];
                if(quality.url===data.url) {
                    if(quality.reserve.length) quality.url=quality.reserve.shift();
                    else delete groups[oldKey]
                } else quality.reserve=quality.reserve.filter(function(url) { return url!==data.url });
                if(!groups[actualKey]) groups[actualKey]=confirmed;
                else {
                    var target=groups[actualKey];
                    if(target.url!==data.url && target.reserve.indexOf(data.url)<0) target.reserve.push(data.url);
                    target.stream_meta[data.url]=record
                }
                var sorted={}; Object.keys(groups).sort(function(a,b) { return qualityNumber(b)-qualityNumber(a) }).forEach(function(key) { sorted[key]=groups[key] });
                data.quality=sorted; data.quality_switched=actualKey;
                player.applyStreamData(data);
                Lampa.PlayerPanel.quality(sorted,data.url);
                player.setFlowsForQuality(data)
            }
        }, {
            key: "switchTranslation",
            value: function(links, voice, voices, commit) {
                var player=this, data=Lampa.Player.playdata(), sequence=(this.voiceSequence || 0)+1,
                    key = voice && typeof voice === "object" ? voice.key : String(voice || ""),
                    name = voice && typeof voice === "object" ? voice.label : String(voice || "");
                var initialVideo=Lampa.PlayerVideo.video(), pending=player.voicePending;
                var wasPaused=pending && pending.data===data ? pending.wasPaused : initialVideo && initialVideo.paused;
                player.voicePending={data:data,wasPaused:wasPaused,sequence:sequence};
                var previousVoice=voices.find(function(voice) { return voice.selected });
                this.voiceSequence=sequence;
                Lampa.Player.loading(true);
                return links.then(function(items) {
                    if (sequence!==player.voiceSequence || data!==Lampa.Player.playdata()) return;
                    var quality=player.getQuality(items);
                    if (!Object.keys(quality).length) throw new Error('Нет доступного качества от 720p');
                    var video=Lampa.PlayerVideo.video(), time=video && video.currentTime || 0;
                    var current=data.quality_switched, url=current && quality[current] ? quality[current].url : preferredUrl(quality);
                    clearTimeout(player.on_error_timer);
                    if(commit) commit(items);
                    voices.forEach(function(track) { track.selected = track.voice_key ? track.voice_key === key : M.compareVoice(track.name,name) });
                    player.voice.set(key || name);
                    if (voice && typeof voice === "object") VoiceKit.touch(voice);
                    data.quality=quality;
                    delete data.lampac_merged_quality;
                    delete data.flow_switched;
                    delete data.quality_switched;
                    data.url=url;
                    player.applyStreamData(data);
                    Lampa.PlayerVideo.destroy(true);
                    Lampa.PlayerVideo.setParams({});
                    Lampa.PlayerPanel.quality(quality,url);
                    Lampa.PlayerPanel.setTracks(voices);
                    var restored=function() {
                        Lampa.PlayerVideo.listener.remove('loadeddata',restored);
                        if(data!==Lampa.Player.playdata() || sequence!==player.voiceSequence) return;
                        Lampa.PlayerVideo.to(time);
                        if(wasPaused) Lampa.PlayerVideo.pause()
                    };
                    Lampa.PlayerVideo.listener.follow('loadeddata',restored);
                    Lampa.PlayerVideo.url(url,true);
                    player.setFlowsForQuality(data);
                    Lampa.Controller.toggle('player')
                }).catch(function(error) {
                    if(sequence===player.voiceSequence) { if(previousVoice) player.voice.set(previousVoice.voice_key || previousVoice.name); Lampa.Noty.show(error.message || 'Не удалось сменить озвучку') }
                }).finally(function() {
                    if(sequence===player.voiceSequence) player.voicePending=null;
                    if(sequence===player.voiceSequence && data===Lampa.Player.playdata()) {
                        Lampa.Player.loading(false);
                        if(wasPaused) Lampa.PlayerVideo.pause()
                    }
                })
            }
        }, {
            key: "movie",
            value: function(e) {
                var t = this,
                    n = M.player(),
                    groups = VoiceKit.group(e.translates, this.object.movie),
                    selected = VoiceKit.find(groups, this.voice.get()),
                    timelineHash = Lampa.Utils.hash([this.object.movie.source || "tmdb", this.object.movie.id || this.object.movie.tmdb_id || "", this.object.movie.original_title || ""].join("|"));
                if (!selected) return t.extract.error(700);
                "inner" == n ? this.extract.links([selected.items]).then((function(items) {
                    if(!Object.keys(t.getQuality(items)).length) return void Lampa.Noty.show('Нет доступного качества от 720p');
                    Lampa.Player.opened() && Lampa.Player.close();
                    var tracks,
                        quality = t.getQuality(items),
                        subs = VoiceKit.mergedSubtitles(items);
                    tracks = VoiceKit.tracks(groups, selected.key, function(group) {
                        t.switchTranslation(t.extract.links([group.items]), group, tracks)
                    });
                    var play = {
                        title: t.object.movie.title || t.object.movie.name,
                        url: items.length ? preferredUrl(quality) : "nofound",
                        quality: quality,
                        timeline: Lampa.Timeline.view(timelineHash),
                        subtitles: subs.length ? subs : undefined,
                        card: t.object.movie,
                        voiceovers: tracks,
                        voice_key: selected.key,
                        translate_name: selected.label,
                        error: function(data, reserve) {
                            var failedUrl=data.url;
                            clearTimeout(t.on_error_timer);
                            t.on_error_timer = setTimeout((function() {
                                if(Lampa.Player.playdata()===data && data.url===failedUrl) t.getNextVoice(data, tracks, reserve)
                            }), 2e3)
                        }
                    };
                    t.voice.set(selected.key);
                    VoiceKit.touch(selected);
                    Lampa.Player.runas("inner"), Lampa.Player.play(t.applyStreamData(play)), Lampa.Player.playlist([]), t.setFlowsForQuality(play)
                })).catch((function(err) {
                    t.extract.error(err)
                })) : M.selectChoiceTranstale(e.translates, selected.label, (function(item) {
                    t.voice.set(M.voice(item)), t.extract.links([e.translates.filter((function(e) {
                        return M.compareVoice(M.voice(e), M.voice(item))
                    }))]).then((function(items) {
                        if (0 == items.length) return Lampa.Bell.push({
                            text: "Не удалось найти ссылок, выберите другой перевод",
                            time: 5e3
                        });
                        var quality = t.getQuality(items),
                            subs = VoiceKit.mergedSubtitles(items),
                            flows = t.extract.flows(quality);
                        M.selectChoiceFlow(flows, (function(flow) {
                            var data = {
                                title: t.object.movie.title || t.object.movie.name,
                                url: flow.url,
                                timeline: Lampa.Timeline.view(timelineHash),
                                subtitles: subs.length ? subs : undefined
                            };
                            Lampa.Player.play(copyStreamMetadata(data, flow.stream_meta || {}))
                        }))
                    })).catch((function(e) {
                        t.extract.error(e)
                    }))
                }))
            }
        }, {
            key: "tv",
            value: function(e, t, n) {
                var i = this,
                    a = [],
                    o = [],
                    r = (e.plays[0] && e.plays[0].translate_key) || this.voice.get(), seriesPlaylist = a;
                Lampa.Controller.toggle("content");
                var voiceGroups = VoiceKit.group(e.translates, this.object.movie),
                    selectedGroup = VoiceKit.find(voiceGroups, r);
                if (!selectedGroup) return i.extract.error(700);
                o = VoiceKit.tracks(voiceGroups, selectedGroup.key, function(group) {
                    var updated;
                    var links=i.extract.voice(e.sources,group).then(function(result) {
                        updated=result.plays;
                        var active=Lampa.Player.playdata();
                        return i.extract.links([updated.filter(function(item) { return item.e==active.number })])
                    });
                    return i.switchTranslation(links,group,o,function() {
                        e.plays=updated;
                        var active=Lampa.Player.playdata();
                        for(var index=seriesPlaylist.length-1;index>=0;index--) {
                            var entry=seriesPlaylist[index];
                            if(!updated.some(function(item) { return item.e==entry.number })) seriesPlaylist.splice(index,1);
                            else if(entry!==active) {
                                entry.url=entry.lampac_resolve_url;
                                delete entry.quality; delete entry.lampac_merged_quality;
                                delete entry.quality_switched; delete entry.flow_switched
                            }
                        }
                        t.forEach(function(episode) {
                            if(!seriesPlaylist.some(function(entry) { return entry.number==episode.number })) appendEpisode(episode)
                        });
                        seriesPlaylist.sort(function(left,right) { return left.number-right.number });
                        Lampa.Player.playlist(seriesPlaylist)
                    })
                });
                i.voice.set(selectedGroup.key);
                VoiceKit.touch(selectedGroup);
                function appendEpisode(t) {
                    if (e.plays.find((function(e) {
                            return e.e == t.number
                        }))) {
                        var r = {
                            number: t.number,
                            title: t.title,
                            timeline: t.timeline,
                            launch_player: "inner",
                            url: function(n) {
                                var requestedData=Lampa.Player.playdata();
                                return "inner" == M.player() ? (Lampa.Player.loading(!0), i.extract.links([e.plays.filter((function(e) {
                                    return e.e == t.number
                                }))]).then((function(e) {
                                    if(requestedData!==Lampa.Player.playdata()) return;
                                    r.quality = i.getQuality(e);
                                    var url = preferredUrl(r.quality);
                                    if(!url) throw new Error('Нет доступного качества от 720p');
                                    r.url = url;
                                    i.applyStreamData(r);
                                    n();
                                    setTimeout((function() {
                                        if (Lampa.Player.playdata() === r) i.setFlowsForQuality(r)
                                    }), 100)
                                })).catch((function(error) {
                                    r.url = r.lampac_resolve_url;
                                    if(requestedData===Lampa.Player.playdata()) {
                                        if(requestedData && requestedData.lampac_fastonline_owner===i.instanceId && Lampa.Player.opened()) Lampa.Player.close();
                                        Lampa.Noty.show(error.message || 'Нет доступного качества от 720p')
                                    }
                                })).finally((function() {
                                    if(Lampa.Player.playdata()===r || Lampa.Player.playdata()===requestedData) Lampa.Player.loading(!1)
                                }))) : M.selectChoiceTranstale(e.translates, (o.find((function(e) {
                                    return e.selected
                                })) || {}).name || "", (function(n) {
                                    i.voice.set(M.voice(n)), i.extract.voice(e.sources).then((function(e) {
                                        return i.extract.links([e.plays.filter((function(e) {
                                            return e.e == t.number
                                        }))])
                                    })).then((function(e) {
                                        if (0 == e.length) throw new Error(700);
                                        var n = i.getQuality(e),
                                            a = e.find((function(e) {
                                                return e.subtitles
                                            })),
                                            o = i.extract.flows(n);
                                        M.selectChoiceFlow(o, (function(e) {
                                            var n = {
                                                title: t.title,
                                                url: e.url,
                                                timeline: t.timeline,
                                                subtitles: !!a && a.subtitles
                                            };
                                            t.mark(), Lampa.Player.play(copyStreamMetadata(n, e.stream_meta || {}))
                                        }))
                                    })).catch((function(e) {
                                        i.extract.error(e)
                                    }))
                                }))
                            },
                            card: i.object.movie,
                            voiceovers: o,
                            callback: function() {
                                t.mark(), n = t
                            },
                            error: function(e, t) {
                                var failedUrl=e.url;
                                clearTimeout(i.on_error_timer);
                                i.on_error_timer = setTimeout((function() {
                                    if(Lampa.Player.playdata()===e && e.url===failedUrl) i.getNextVoice(e, o, t)
                                }), 2e3)
                            }
                        };
                        r.lampac_resolve_url=r.url;
                        a.push(r)
                    }
                }
                t.forEach(appendEpisode);
                var u = a.find((function(e) {
                    return e.number == n.number
                }));
                if (!u) return M.modalChoiceTranstale({
                    from: (o.find((function(e) {
                        return e.selected
                    })) || o[0] || {}).name,
                    voicelist: o
                });
                u.url((function() {
                    Lampa.Player.opened() && Lampa.Player.close(), Lampa.Player.runas("inner"), Lampa.Player.play(u), Lampa.Player.playlist(a), i.setFlowsForQuality(u)
                }))
            }
        }]), e
    }(),
        Q = function() {
            function e(n) {
                t(this, e);
                var i = this;
                this.object = n && n.movie ? n : null;
                if (!this.object) {
                    Lampa.Noty.show("SmartOnline: не удалось определить карточку фильма/сериала");
                    return
                }
                this.startPlay()
            }
            return i(e, [{
                key: "startPlay",
                value: function() {
                    this.object.movie.name ? this.tv() : this.movie()
                }
            }, {
                key: "movie",
                value: function() {
                    var e = this,
                        t = new H(this.object),
                        n = new J(this.object);
                    t.movie({
                        movie: this.object.movie,
                        type: "movie"
                    }).then((function(t) {
                        Lampa.Favorite.add("history", e.object.movie, 100), n.movie(t)
                    })).catch((function(e) {
                        t.error(e)
                    }))
                }
            }, {
                key: "tv",
                value: function() {
                    Lampa.Activity.push({
                        url: "",
                        title: "",
                        component: "lampac_fastonline_episodes",
                        movie: this.object.movie,
                        page: 1
                    })
                }
            }]), e
        }();

    function X(e) {
        var t, n = new Lampa.Explorer(e),
            i = new Lampa.Filter(e),
            a = new Lampa.Scroll({
                mask: !0,
                over: !0
            }),
            o = {
                season: 1
            },
            r = e.movie.number_of_seasons || 1,
            s = !1,
            c = !1;
        this.create = function() {
            var t = this;
            this.getChoice(), n.appendFiles(a.render()), n.appendHead(i.render()), a.body().addClass("torrent-list mapping--list"), n.render().find(".filter--search, .filter--sort").remove(), a.minus(n.render().find(".explorer__files-head")), this.activity.loader(!0);
            var u = e.movie.id,
                d = e.movie.imdb_id,
                m = e.movie.tvdb_id,
                f = l.getSeasonsCount(u);

            function p() {
                s || Lampa.Api.seasons(e.movie, [1], (function(e) {
                    if (!s) {
                        if (e[1] && e[1].seasons_count && e[1].seasons_count > r && (r = e[1].seasons_count), !c) {
                            var n = l.getSeasonsCount(u);
                            n && n > r && (r = n)
                        }
                        s = !0, t.filter(), t.selected(), t.activity.loader(!1), e[1] && e[1].episodes && e[1].episodes.length && 1 === o.season ? t.draw(e[1].episodes) : t.load()
                    }
                }))
            }
            return f ? (r = f, c = !0, p()) : (l.fetch(u, d, m, (function(e) {
                c = !0, e && e > r && (r = e), p()
            })), setTimeout((function() {
                s || p()
            }), 3e3)), this.activity.toggle(), this.render()
        }, this.setChoice = function(t) {
            o.season = t;
            var n = Lampa.Storage.cache("season_choice", "{}", 1e3);
            n[e.movie.id] = t, Lampa.Storage.set("season_choice", n)
        }, this.getChoice = function() {
            var t = Lampa.Storage.get("season_choice", "{}");
            t[e.movie.id] && (o.season = Math.max(1, t[e.movie.id]), s && o.season > r && (o.season = r))
        }, this.filter = function() {
            var e = this;
            i.addButtonBack(), i.onSelect = function(t, n) {
                e.setChoice(n.season), e.selected(), Lampa.Controller.toggle("content"), e.load()
            }, i.onBack = function() {
                e.start()
            }
        }, this.selected = function() {
            var e = [],
                t = [];
            for (var n in o) "season" == n && e.push(Lampa.Lang.translate("torrent_serial_season") + ": " + o[n]);
            for (var a = 0; a < r; a++) t.push({
                title: Lampa.Lang.translate("torrent_serial_season") + " " + (a + 1),
                season: a + 1,
                selected: o.season == a + 1
            });
            i.set("filter", t), i.chosen("filter", e)
        }, this.load = function() {
            var n = this;
            this.activity.loader(!0);
            var i = o.season;
            Lampa.Api.clear(), Lampa.Api.seasons(e.movie, [i], (function(e) {
                t = !1, a.clear(), a.reset(), e[i] && e[i].episodes && e[i].episodes.length ? n.draw(e[i].episodes) : n.empty(), n.activity.loader(!1)
            }))
        }, this.empty = function() {
            var e = Lampa.Template.get("empty_filter"),
                t = $('<div class="simple-button selector"><span>' + Lampa.Lang.translate("filter_clarify") + "</span></div>");
            t.on("hover:enter", (function() {
                i.render().find(".filter--filter").trigger("hover:enter")
            })), e.find(".empty-filter__title").remove(), e.find(".empty-filter__buttons").removeClass("hide").append(t), a.append(e), Lampa.Controller.enable("content")
        }, this.draw = function(n) {
            n.forEach((function(i, r) {
                var l = i.episode_number || r + 1,
                    s = Lampa.Utils.hash([o.season, o.season > 10 ? ":" : "", l, e.movie.original_title].join("")),
                    c = [],
                    u = new Date((i.air_date + "").replace(/-/g, "/")),
                    d = Date.now(),
                    m = i.air_date ? Math.round((u.getTime() - d) / 864e5) : 1,
                    f = Lampa.Lang.translate("full_episode_days_left") + ": " + (i.air_date ? m : "- -");
                i.timeline = Lampa.Timeline.view(s), i.time = Lampa.Utils.secondsToTime(60 * i.runtime, !0), i.title = i.name || Lampa.Lang.translate("torrent_serial_episode") + " " + l, i.quality = m > 0 ? f : "", i.number = l, i.vote_average && c.push(Lampa.Template.get("season_episode_rate", {
                    rate: parseFloat(i.vote_average + "").toFixed(1)
                }, !0)), i.air_date && c.push(Lampa.Utils.parseTime(i.air_date).full), i.info = c.length ? c.map((function(e) {
                    return "<span>" + e + "</span>"
                })).join('<span class="season-episode-split">●</span>') : "";
                var p = Lampa.Template.get("season_episode", i),
                    v = p.find(".season-episode__loader"),
                    h = p.find(".season-episode__img"),
                    g = function(e) {
                        p.find(".season-episode__viewed").remove(), (Boolean(i.timeline.percent) || e) && p.find(".season-episode__img").append('<div class="season-episode__viewed">' + Lampa.Template.get("icon_viewed", {}, !0) + "</div>")
                    };
                i.mark = function() {
                    t = p[0], g(!0)
                }, p.find(".season-episode__timeline").append(Lampa.Timeline.render(i.timeline)), m > 0 ? p.css("opacity", "0.5") : (g(), Boolean(i.timeline.percent) && (t = p[0]), p.on("hover:enter", (function() {
                    var r = new H(e),
                        s = new J(e);
                    r.tv({
                        movie: e.movie,
                        season: o.season,
                        episode: l,
                        type: "episode"
                    }).then((function(o) {
                        Lampa.Favorite.add("history", e.movie, 100), s.tv(o, n, i), i.mark(), Lampa.Player.callback((function() {
                            a.update($(t), !0), Lampa.Controller.toggle("content")
                        }))
                    })).catch((function(e) {
                        r.error(e)
                    }))
                }))), p.on("hover:focus", (function(e) {
                    t = e.target, a.update($(e.target), !0)
                })).on("visible", (function() {
                    var e = p.find("img")[0];
                    e.onerror = function() {
                        e.src = "./img/img_broken.svg"
                    }, e.onload = function() {
                        h.addClass("season-episode__img--loaded"), v.remove(), h.append('<div class="season-episode__episode-number">' + ("0" + l).slice(-2) + "</div>")
                    }, i.still_path ? e.src = Lampa.TMDB.image("t/p/w300" + i.still_path) : i.img ? e.src = i.img : (v.remove(), h.append('<div class="season-episode__episode-number">' + ("0" + l).slice(-2) + "</div>"))
                })).on("hover:hover hover:touch", (function(e) {
                    t = e.target, Navigator.focused(t)
                })), a.append(p)
            })), t && a.update($(t), !0), Lampa.Layer.visible(a.render(!0)), Lampa.Controller.enable("content")
        }, this.start = function() {
            Lampa.Activity.active().activity === this.activity && (Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(e.movie)), Lampa.Controller.add("content", {
                toggle: function() {
                    Lampa.Controller.collectionSet(a.render(), n.render()), Lampa.Controller.collectionFocus(t || !1, a.render())
                },
                left: function() {
                    n.toggle()
                },
                right: function() {
                    i.show(Lampa.Lang.translate("title_filter"), "filter")
                },
                up: function() {
                    Navigator.canmove("up") ? Navigator.move("up") : Lampa.Controller.toggle("head")
                },
                down: function() {
                    Navigator.canmove("down") && Navigator.move("down")
                },
                back: function() {
                    Lampa.Activity.backward()
                }
            }), Lampa.Controller.toggle("content"))
        }, this.pause = function() {}, this.stop = function() {}, this.render = function() {
            return n.render()
        }, this.destroy = function() {
            a.destroy(), i.destroy(), n.destroy();
            try {
                Lampa.Api.clear()
            } catch (e) {}
        }
    }

    function Y(callback) {
        withLampacServer(function(base) {
            if (!base) { callback(null, "Сервер Lampac/Online не найден"); return }
            var request = new Lampa.Reguest, retried = false;
            request.timeout(7000);
            function ask() {
                var url = N(base + "/lite/events?rjson=true");
                request.silent(url, function(response) {
                    if (typeof response === "string") try { response = JSON.parse(response) } catch (error) { response = null }
                    if (response && response.rch && !retried) {
                        retried = true;
                        return W(response, ask, function() { callback(null, "Ошибка подключения RCH") })
                    }
                    if (response && response.accsdb) { callback(null, "Доступ к Lampac запрещён"); return }
                    var items = serverSources(Array.isArray(response) ? response : response && response.online);
                    if (items.length) { callback(items, null); return }
                    // Some NextGen configurations expose the useful list only through lifeevents/checkOnlineSearch.
                    var life = new Lampa.Reguest, memkey = "", count = 0, found = [];
                    life.timeout(7000);
                    function poll() {
                        var target = memkey ? base + "/lifeevents?memkey=" + encodeURIComponent(memkey) + "&id=76600&imdb_id=tt1630029&kinopoisk_id=505898&serial=0&title=Avatar&original_title=Avatar&original_language=en&year=2022&source=tmdb&clarification=0&similar=false"
                            : base + "/lite/events?life=true&id=76600&imdb_id=tt1630029&kinopoisk_id=505898&serial=0&title=Avatar&original_title=Avatar&original_language=en&year=2022&source=tmdb&clarification=0&similar=false";
                        life.silent(N(target), function(data) {
                            if (typeof data === "string") try { data = JSON.parse(data) } catch (error) { data = null }
                            var list = serverSources(Array.isArray(data) ? data : data && data.online);
                            list.forEach(function(id) { if (found.indexOf(id)<0) found.push(id) });
                            if (data && data.memkey) memkey=data.memkey;
                            if (Array.isArray(data) || data && data.ready || !memkey || ++count>=12) callback(rememberAvailable(found), found.length ? null : "Источники не найдены");
                            else setTimeout(poll,500)
                        }, function() { callback(rememberAvailable(found), found.length ? null : "Ошибка соединения") }, false, {dataType:"text",headers:requestHeaders()})
                    }
                    poll()
                }, function() { callback(null, "Ошибка соединения") }, false, {dataType:"text",headers:requestHeaders()})
            }
            ask()
        })
    }

    function sourceName(id) {
        var found = null;
        y.some(function(item) {
            var ids=Lampa.Arrays.isArray(item.id)?item.id:[item.id];
            if (ids.indexOf(id)>=0) { found=item; return true }
            return false
        });
        return found && found.name || id
    }

    function ee(done, skipRefresh) {
        var previous = Lampa.Controller.enabled().name;
        if (!skipRefresh) {
            Lampa.Noty.show("Определяю Lampac и список Online-источников...");
            Y(function(list, error) {
                if (error && !availableStored().length) { Lampa.Noty.show(error); return }
                ee(done, true)
            });
            return
        }
        var available = availableStored(), selected = A(), items = [];
        if (!available.length) available = selected;
        items.push({title:"Использовать все найденные автоматически", autoAll:true, subtitle:"Список обновляется с вашего Lampac"});
        items.push({title:"Обновить список источников", refresh:true});
        available.forEach(function(id) {
            items.push({title:sourceName(id),source:id,checkbox:true,checked:selected.indexOf(id)>=0})
        });
        Lampa.Select.show({
            title:"Online-источники · " + (lampacBase ? C(lampacBase) : "авто"),
            items:items,
            onBack:function() {
                var chosen=items.filter(function(item){return item.checkbox && item.checked}).map(function(item){return item.source});
                if (chosen.length) T(chosen); else try { Lampa.Storage.set(d, []) } catch(error) {}
                Lampa.Controller.toggle(previous); if(done) done()
            },
            onSelect:function(item) {
                if (item.refresh) { Lampa.Select.close(); ee(done, false); return }
                if (item.autoAll) {
                    try { Lampa.Storage.set(d, []) } catch(error) {}
                    items.forEach(function(entry){if(entry.checkbox) entry.checked=true});
                    Lampa.Noty.show("Автовыбор: используются все найденные источники");
                    Lampa.Select.close(); ee(done, true); return
                }
                item.checked=!item.checked
            }
        })
    }

    function ae() {
        Lampa.Settings.listener.follow("open", function(event) {
            if (event.name === "main") {
                if (!Lampa.Settings.main().render().find('[data-component="lampac_fastonline_settings"]').length)
                    Lampa.SettingsApi.addComponent({component: "lampac_fastonline_settings",
                        name: "SmartOnline", icon: g, before: "interface"});
                Lampa.Settings.main().update()
            }
        });
        Lampa.SettingsApi.addParam({component: "lampac_fastonline_settings",
            param: {name: "fastonline_lampac_server", type: "static"},
            field: {name: "Сервер Lampac", description: "Автоматически из установленного Online/Sync"}});
        Lampa.SettingsApi.addParam({component: "lampac_fastonline_settings",
            param: {name: "fastonline_lampac_sources_button", type: "static"},
            field: {name: "Выбор источников", description: "Автоматически с обнаруженного Lampac · потоки от 720p"},
            onRender: function(element) {
                element.on("hover:enter", function() { ee() })
            }});
        Lampa.SettingsApi.addParam({component: "lampac_fastonline_settings",
            param: {name: "fastonline_voice_langs", type: "input", values: "", placeholder: VoiceKit.prefLangs().join(","), "default": ""},
            field: {name: "Приоритет языков озвучки", description: "Например: ru,uk,en. Языки сортируются, но не скрываются"}});
        Lampa.SettingsApi.addParam({component: "lampac_fastonline_settings",
            param: {name: "fastonline_voice_favorites_button", type: "static"},
            field: {name: "Любимые озвучки", description: "Поднимать выбранные студии и озвучки выше"},
            onRender: function(element) {
                element.on("hover:enter", function() { VoiceKit.favoriteMenu() })
            }});
    }! function() {
        if (!window.lampac_fastonline_plugin) {
            window.lampac_fastonline_plugin = {version: "1.4.2", server: lampacBase}, ae(), Lampa.Component.add("lampac_fastonline_episodes", X), Lampa.VPN.region((function() {})), Lampa.Listener.follow("full", (function(e) {
                if (!e || "complite" != e.type || !e.object || !e.object.activity || typeof e.object.activity.render !== "function") return;
                var raw = e.data && typeof e.data === "object" ? e.data : {},
                    activity = e.object.activity,
                    movie = raw.movie || raw.card ||
                        e.object.movie || e.object.card ||
                        e.object.data && (e.object.data.movie || e.object.data.card) ||
                        activity.movie || activity.card ||
                        activity.params && (activity.params.movie || activity.params.card);
                if (!movie) return;
                var data = {};
                for (var key in raw) data[key] = raw[key];
                data.movie = movie;
                var root = activity.render();
                if (root.find(".view--lampac-merged").length) return;
                var t = '<div class="full-start__button selector view--online view--lampac-merged" data-subtitle="Lampac">' + g + "<span>SmartOnline</span></div>",
                    n = $(Lampa.Lang.translate(t));
                root.find(".view--torrent").length ? root.find(".view--torrent").last().after(n) : root.find(".full-start-new__buttons, .full-start__buttons").first().append(n), n.on("hover:enter", (function() {
                    Lampa.Controller.toggle("content");
                    withLampacServer(function(base) {
                        if (!base) { Lampa.Noty.show("SmartOnline: Lampac/Online не найден"); return }
                        new Q(data)
                    })
                }))
            }));
            // Warm the auto-detection cache so the first SmartOnline click is normally immediate.
            setTimeout(function() { discoverLampac(false, function() {}) }, 300);
            $("body").append('\n\t\t\t<style>\n\t\t\t\t.connect-broken {\n\t\t\t\t\ttext-align: center;\n\t\t\t\t\tpadding-bottom: 1em;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__title {\n\t\t\t\t\tfont-size: 2em;\n\t\t\t\t\tline-height: 1.4;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__text {\n\t\t\t\t\tfont-size: 1.2em;\n\t\t\t\t\tpadding-top: 1em;\n\t\t\t\t\tline-height: 1.4;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__footer {\n\t\t\t\t\tdisplay: flex;\n\t\t\t\t\tjustify-content: center;\n\t\t\t\t\tmargin-top: 2em;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__footer .simple-button {\n\t\t\t\t\tmargin: 0;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr {\n\t\t\t\t\tdisplay: flex;\n\t\t\t\t\talign-items: center;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__left {\n\t\t\t\t\twidth: 33%;\n\t\t\t\t\tflex-shrink: 0;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__right {\n\t\t\t\t\tpadding-left: 2em;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__scan {\n\t\t\t\t\ttext-align: center;\n\t\t\t\t\tpadding: 1em;\n\t\t\t\t\tbackground: #fff;\n\t\t\t\t\tborder-radius: 1em;\n\t\t\t\t\tcolor: #000;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__img {\n\t\t\t\t\tposition: relative;\n\t\t\t\t\twidth: 100%;\n\t\t\t\t\tpadding-bottom: 100%;\n\t\t\t\t\toverflow: hidden;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__img img {\n\t\t\t\t\tposition: absolute;\n\t\t\t\t\ttop: 0;\n\t\t\t\t\tleft: 0;\n\t\t\t\t\twidth: 100%;\n\t\t\t\t\theight: 100%;\n\t\t\t\t\topacity: 0;\n\t\t\t\t\ttransition: opacity .2s;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__img img.loaded {\n\t\t\t\t\topacity: 1;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__bot {\n\t\t\t\t\tfont-size: 1.2em;\n\t\t\t\t\tfont-weight: 600;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__text {\n\t\t\t\t\tfont-size: 1.2em;\n\t\t\t\t\tline-height: 1.6;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__text + .modal-qr__text {\n\t\t\t\t\tmargin-top: 3em;\n\t\t\t\t}\n\t\t\t\t.selectbox-item__subtitle {\n\t\t\t\t\topacity: 0.5;\n\t\t\t\t}\n\t\t\t</style>\n\t\t')
        }
    }()
}();