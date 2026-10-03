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
            t(this, e), this.hash = Lampa.Utils.hash(n.movie.original_title), this.field = "online_selected_voice"
        }
        return i(e, [{
            key: "get",
            value: function() {
                return Lampa.Storage.get(this.field, "{}")[this.hash] || ""
            }
        }, {
            key: "set",
            value: function(e) {
                var t = Lampa.Storage.get(this.field, "{}");
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
    // FastOnline 1.1.0: one Lampac server, merged online streams.
    var d = "fastonline_lampac_sources",
        lampacBase = "https://lampac.fun",
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

    function C(e) {
        return e.replace(/^https?:\/\//, "")
    }

    function cleanSources(items) {
        var result = [];
        if (!Lampa.Arrays.isArray(items)) return result;
        items.forEach(function(item) {
            var id = String(Lampa.Arrays.isArray(item) ? item[0] : item).toLowerCase();
            y.forEach(function(source) {
                var aliases = Lampa.Arrays.isArray(source.id) ? source.id : [source.id];
                if (aliases.indexOf(id) >= 0 && result.indexOf(aliases[0]) < 0) result.push(aliases[0])
            })
        });
        return result
    }

    function A() {
        var items = Lampa.Storage.get(d, Lampa.Storage.get("online_sources", []));
        if ("string" == typeof items) try { items = JSON.parse(items) } catch (e) { items = [] }
        var result = cleanSources(items);
        return result.length ? result : b()
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
            })), "ru" == q() && (t = t.filter((function(e) {
                return 0 == E.filter_uk.filter((function(t) {
                    return I(e).toLowerCase().indexOf(t.toLowerCase()) >= 0
                })).length
            }))), B(t), t
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

    function ownUrl(value) {
        try {
            var url = new URL(String(value || ""), lampacBase + "/");
            if (!/^https?:$/.test(url.protocol) || url.hostname !== "lampac.fun" || url.port ||
                url.username || url.password || /(?:^|\/)pidtor(?:\/|$)/i.test(url.pathname)) return "";
            return lampacBase + url.pathname + url.search
        } catch (error) { return "" }
    }

    function ownToken() {
        var scripts = document.scripts || [];
        for (var index = 0; index < scripts.length; index++) {
            try {
                var url = new URL(scripts[index].src, lampacBase);
                if (url.hostname !== "lampac.fun") continue;
                var match = url.pathname.match(/^\/(?:sync|online)\/js\/([^/]+)$/);
                if (match) return decodeURIComponent(match[1]);
                if (/^\/(?:sync|online)\.js$/.test(url.pathname) && url.searchParams.get("token"))
                    return url.searchParams.get("token")
            } catch (error) {}
        }
        return ""
    }

    function copyStreamMetadata(target, stream) {
        ["headers", "segments", "hls_manifest_timeout", "subtitles", "subtitles_call", "translate_name"].forEach(function(key) {
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
                ["headers", "segments", "hls_manifest_timeout", "subtitles", "subtitles_call", "translate_name"].forEach(function(key) {
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
                if (/^https?:\/\//i.test(url) && !result.some(function(record) { return record.url === url }))
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
    var U = "lampac.fun", rchPending = [];

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
            key: "query",
            value: function(e) {
                var t = this;
                return new Promise((function(n, i) {
                    var a, o = [].concat(E.sources),
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
                        n(M.renameTranslate(o))
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
                    })), 0 == a.length && n(M.renameTranslate(o))
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
                                e.maxquality = e.maxquality || "1080p";
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
            value: function(e) {
                var t = this;
                return new Promise((function(n, i) {
                    var a = t.voiceSave.get(),
                        o = [],
                        l = E.filter_tv,
                        s = [],
                        c = function e(n, i) {
                            return new Promise((function(a, o) {
                                var safe = N(n.url);
                                if (!safe) return void o(400);
                                t.network.timeout(1e4), t.network.silent(safe, (function(t) {
                                    var r, l = t;
                                    if ("string" == typeof t)
                                        if (-1 !== t.indexOf("<div") || -1 !== t.indexOf("data-json")) r = {
                                            data: []
                                        }, $(t).find("[data-json]").each((function() {
                                            try {
                                                var e = $(this).attr("data-json"),
                                                    t = JSON.parse(e);
                                                "play" === t.method && t.url && r.data.push(t)
                                            } catch (e) {}
                                        })), l = r;
                                        else try {
                                            l = JSON.parse(t)
                                        } catch (e) {
                                            l = {}
                                        }
                                    if (l.rch && !i) W(l, (function() {
                                        e(n, !0).then(a).catch(o)
                                    }), function() { o(500) });
                                    else {
                                        if (!l.data || 0 === l.data.length) return void o("no data");
                                        ! function(e, t) {
                                            e.data.forEach((function(e) {
                                                e.translate_name = t, e.source_name = n.source_name || e.source_name || ""
                                            }))
                                        }(l, M.voice(n)), a(l.data)
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
                    })), a || (a = M.voice(s[0])), s.sort((function(e, t) {
                        return M.voice(e).toLowerCase().localeCompare(M.voice(t).toLowerCase())
                    }));
                    var u = s.filter((function(e) {
                        return M.compareVoice(e.name, a)
                    })),
                        d = new r(u.length);
                    d.onComplite = function() {
                        if (0 == o.length) {
                            if (!s[0]) return void i(700);
                            c(s[0], !1).then((function(e) {
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

    function K(e, t) {
        var n = 0,
            i = 0;
        e.forEach((function(e, t) {
            !e.quality && e.url && -1 !== e.url.indexOf(".m3u8") && n++
        })), 0 !== n ? e.forEach((function(a, o) {
            if (!a.quality && a.url && -1 !== a.url.indexOf(".m3u8")) {
                var r = new Lampa.Reguest;
                r.timeout(5e3), r.native(a.url, (function(o) {
                    if ("string" == typeof o && -1 !== o.indexOf("#EXT-X-STREAM-INF")) {
                        var r = function(e, t) {
                            for (var n = {}, i = e.split("\n"), a = null, o = 0; o < i.length; o++) {
                                var r = i[o].trim();
                                if (0 === r.indexOf("#EXT-X-STREAM-INF")) {
                                    var l = r.match(/RESOLUTION=(\d+)x(\d+)/i);
                                    if (l) a = parseInt(l[2]);
                                    else {
                                        var s = r.match(/BANDWIDTH=(\d+)/i);
                                        if (s) {
                                            var c = parseInt(s[1]);
                                            a = c > 4e6 ? 1080 : c > 2e6 ? 720 : c > 1e6 ? 480 : c > 5e5 ? 360 : 240
                                        }
                                    }
                                } else if (a && r && 0 !== r.indexOf("#")) {
                                    var u = r;
                                    if (0 !== u.indexOf("http")) {
                                        var d = t.split("/");
                                        d.pop(), u = d.join("/") + "/" + u
                                    }
                                    var m = a + "p";
                                    n[m] || (n[m] = u), a = null
                                }
                            }
                            return n
                        }(o, a.url);
                        Object.keys(r).length > 0 && (a.quality = r)
                    }
                    ++i >= n && t(e)
                }), (function() {
                    ++i >= n && t(e)
                }), !1, {
                    dataType: "text", headers: a.headers || {}
                })
            }
        })) : t(e)
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
                    Lampa.Player.listener.remove("destroy", destroyed)
                }
            };
            var destroyed = function() { clearTimeout(i.on_error_timer) };
            Lampa.Player.listener.follow("start", started);
            Lampa.Player.listener.follow("destroy", destroyed)
        }
        return i(e, [{
            key: "getQuality",
            value: function(items) {
                var player = this, merged = {};
                (items || []).forEach(function(item) {
                    var quality = item.quality;
                    if (!quality || typeof quality !== "object") quality = {auto: item.url};
                    Object.keys(quality).forEach(function(name) {
                        var number = parseInt(String(name).replace(/[^0-9]/g, ""), 10) || 0;
                        var key = number ? number + "p" : name;
                        var metadata = copyStreamMetadata({}, item);
                        metadata.translate_name = item.translate_name || M.voice(item);
                        var records = collectStreamLinks(quality[name], metadata);
                        if (!records.length) return;
                        if (!merged[key]) merged[key] = {
                            label: number > 1440 ? "4K" : number >= 1440 ? "2K" : number >= 1080 ? "FHD" : number >= 720 ? "HD" : "",
                            url: records[0].url, reserve: [], used: [], error: [], stream_meta: {},
                            call: function(instance, ready) {
                                var data = Lampa.Player.playdata();
                                data.url = instance.url;
                                data.quality_switched = key;
                                player.applyStreamData(data);
                                ready(instance.url)
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
                        parseInt(e) < parseInt(t) && !n && parseInt(e) > 360 && (n = e)
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
                var next = quality.reserve.find(function(url) {
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
                    url: Lampa.Player.getUrlQuality(n),
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
                    return {title: "Поток " + (index + 1), subtitle: Lampa.Utils.shortText(url, 35),
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
            key: "movie",
            value: function(e) {
                var t = this,
                    n = M.player();
                e.translates.sort((function(e, t) {
                    var n = parseInt(e.maxquality) || 0,
                        i = parseInt(t.maxquality) || 0;
                    if (i !== n) return i - n;
                    var a = E.filter_db.filter((function(t) {
                        return e.translate.toLowerCase().indexOf(t.toLowerCase()) >= 0
                    })).length,
                        o = E.filter_db.filter((function(e) {
                            return t.translate.toLowerCase().indexOf(e.toLowerCase()) >= 0
                        })).length;
                    return a && !o ? -1 : !a && o ? 1 : 0
                }));
                var i = this.voice.get();
                i || (i = M.voice(e.translates[0]));
                var a = e.translates.filter((function(e) {
                    return M.compareVoice(M.voice(e), i)
                })),
                    o = Lampa.Utils.hash(this.object.movie.original_title);
                "inner" == n ? this.extract.links([a]).then((function(n) {
                    K(n, (function(n) {
                        Lampa.Player.opened() && Lampa.Player.close();
                        var a = [],
                            r = t.getQuality(n),
                            l = n.find((function(e) {
                                return e.subtitles
                            })),
                            s = {};
                        for (var c in e.translates.forEach((function(e) {
                                var t = e.translate;
                                s[t] || (s[t] = {
                                    item: e,
                                    sources: [],
                                    maxquality: 0
                                });
                                var n = e.source_name || "";
                                n && -1 === s[t].sources.indexOf(n) && s[t].sources.push(n);
                                var i = parseInt(e.maxquality) || 0;
                                i > s[t].maxquality && (s[t].maxquality = i)
                            })), s) {
                            var u = s[c],
                                d = (u.item, []);
                            u.sources.length > 0 && d.push(u.sources.join(", ")), u.maxquality > 0 && d.push(u.maxquality + "p"), a.push({
                                selected: M.compareVoice(i, c),
                                name: c,
                                title: c,
                                subtitle: d.join(" • "),
                                onSelect: function() {
                                    t.voice.set(this.name), Lampa.Player.loading(!0), t.movie(e)
                                }
                            })
                        }
                        a.find((function(e) {
                            return e.selected
                        })) || (a[0].selected = !0);
                        var m = {
                            title: t.object.movie.title || t.object.movie.name,
                            url: n.length ? Lampa.Player.getUrlQuality(r) : "nofound",
                            quality: r,
                            timeline: Lampa.Timeline.view(o),
                            subtitles: !!l && l.subtitles,
                            card: t.object.movie,
                            voiceovers: a,
                            error: function(e, n) {
                                t.on_error_timer = setTimeout((function() {
                                    t.getNextVoice(e, a, n)
                                }), 2e3)
                            }
                        };
                        Lampa.Player.runas("inner"), Lampa.Player.play(t.applyStreamData(m)), Lampa.Player.playlist([]), t.setFlowsForQuality(m)
                    }))
                })) : M.selectChoiceTranstale(e.translates, i, (function(n) {
                    t.voice.set(M.voice(n)), t.extract.links([e.translates.filter((function(e) {
                        return M.compareVoice(M.voice(e), M.voice(n))
                    }))]).then((function(e) {
                        if (0 == e.length) return Lampa.Bell.push({
                            text: "Не удалось найти ссылок, выберите другой перевод",
                            time: 5e3
                        });
                        var n = t.getQuality(e),
                            i = e.find((function(e) {
                                return e.subtitles
                            })),
                            a = t.extract.flows(n);
                        M.selectChoiceFlow(a, (function(e) {
                            var n = {
                                title: t.object.movie.title || t.object.movie.name,
                                url: e.url,
                                timeline: Lampa.Timeline.view(o),
                                subtitles: !!i && i.subtitles
                            };
                            Lampa.Player.play(copyStreamMetadata(n, e.stream_meta || {}))
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
                    r = this.voice.get();
                Lampa.Controller.toggle("content"), M.sortDUBTranstale(e.translates);
                var l = {};
                for (var s in e.translates.forEach((function(e) {
                        var t = e.name;
                        l[t] || (l[t] = {
                            item: e,
                            sources: [],
                            maxquality: 0
                        });
                        var n = e.source_name || "";
                        n && -1 === l[t].sources.indexOf(n) && l[t].sources.push(n);
                        var i = parseInt(e.maxquality) || 0;
                        i > l[t].maxquality && (l[t].maxquality = i)
                    })), l) {
                    var c = l[s];
                    c.item;
                    ! function(a, l, s) {
                        var c = [];
                        l.sources.length > 0 && c.push(l.sources.join(", ")), l.maxquality > 0 && c.push(l.maxquality + "p"), o.push({
                            name: a,
                            title: a,
                            subtitle: c.join(" • "),
                            selected: M.compareVoice(a, r),
                            onSelect: function() {
                                i.voice.set(a), Lampa.Player.loading(!0), i.extract.voice(e.sources).then((function(a) {
                                    a.sources = e.sources, i.tv(a, t, n)
                                })).catch((function(e) {})).finally((function() {
                                    Lampa.Player.loading(!1)
                                }))
                            }
                        })
                    }(s, c)
                }
                o.find((function(e) {
                    return e.selected
                })) || (o[0].selected = !0), t.forEach((function(t) {
                    if (e.plays.find((function(e) {
                            return e.e == t.number
                        }))) {
                        var r = {
                            number: t.number,
                            title: t.title,
                            timeline: t.timeline,
                            launch_player: "inner",
                            url: function(n) {
                                "inner" == M.player() ? (Lampa.Player.loading(!0), i.extract.links([e.plays.filter((function(e) {
                                    return e.e == t.number
                                }))]).then((function(e) {
                                    0 == e.length ? (r.url = "nofound", n()) : (r.quality = i.getQuality(e), r.url = Lampa.Player.getUrlQuality(r.quality), i.applyStreamData(r), n(), setTimeout((function() {
                                        if (Lampa.Player.playdata() === r) i.setFlowsForQuality(r)
                                    }), 100))
                                })).catch((function() {
                                    r.url = "nofound", n()
                                })).finally((function() {
                                    Lampa.Player.loading(!1)
                                }))) : M.selectChoiceTranstale(e.translates, M.voice(o.find((function(e) {
                                    return e.selected
                                }))), (function(n) {
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
                                i.on_error_timer = setTimeout((function() {
                                    i.getNextVoice(e, o, t)
                                }), 2e3)
                            }
                        };
                        a.push(r)
                    }
                }));
                var u = a.find((function(e) {
                    return e.number == n.number
                }));
                if (!u) return M.modalChoiceTranstale({
                    from: o.find((function(e) {
                        return e.selected
                    })).name,
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
                this.object = n;
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

    function Y(e) {
        var t = lampacBase;
        if (t) {
            var n = t + "/lite/events?life=true&id=76600&imdb_id=tt1630029&kinopoisk_id=505898&serial=0&title=Avatar&original_title=Avatar&original_language=en&year=2022&source=tmdb&clarification=0&similar=false";
            n = N(n);
            var i, a = 0,
                o = "",
                r = [],
                l = !1,
                s = !1;
            u(), i = setInterval(u, 2e3);
            var c = e;
            e = function(e, t) {
                s = !0, clearInterval(i), c(e, t)
            }, ! function i() {
                var s = new Lampa.Reguest;
                s.timeout(5e3);
                var c = o ? t + "/lifeevents?memkey=" + o + "&id=76600&imdb_id=tt1630029&kinopoisk_id=505898&serial=0&title=Avatar&original_title=Avatar&original_language=en&year=2022&source=tmdb&clarification=0&similar=false" : n;
                c = N(c), s.silent(c, (function(t) {
                    var n;
                    try {
                        n = "string" == typeof t ? JSON.parse(t) : t
                    } catch (e) {
                        n = t
                    }
                    if (n && n.rch && !l) return l = !0, void W(n, (function() {
                        a = 0, o = "", setTimeout(i, 500)
                    }), function() { e(null, "Ошибка подключения Lampac") });
                    var s = n && n.online ? n.online : Lampa.Arrays.isArray(n) ? n : [];
                    if (n && n.accsdb) e(null, "Доступ запрещён");
                    else {
                        n && n.memkey && (o = n.memkey);
                        var c = function(e) {
                            var t = [];
                            return e && Lampa.Arrays.isArray(e) ? (e.forEach((function(e) {
                                if (!1 !== e.show) {
                                    var n = (e.balanser || "").toLowerCase();
                                    if (n) {
                                        for (var i = !1, a = 0; a < y.length; a++) {
                                            for (var o = y[a], r = Lampa.Arrays.isArray(o.id) ? o.id : [o.id], l = 0; l < r.length; l++)
                                                if (r[l].toLowerCase() === n) {
                                                    -1 === t.indexOf(r[0]) && t.push(r[0]), i = !0;
                                                    break
                                                }
                                            if (i) break
                                        }
                                        // Unknown sources are not accepted as resolver paths.
                                    }
                                }
                            })), t) : t
                        }(s);
                        c.forEach((function(e) {
                            -1 === r.indexOf(e) && r.push(e)
                        })), n && n.ready ? e(r.length > 0 ? r : null, 0 === r.length ? "Источники не найдены" : null) : Lampa.Arrays.isArray(n) && r.length > 0 ? e(r, null) : ++a >= 20 ? e(r.length > 0 ? r : null, 0 === r.length ? "Источники не найдены" : null) : setTimeout(i, 1e3)
                    }
                }), (function(t) {
                    e(null, "Ошибка соединения")
                }), !1, {
                    dataType: "text", headers: requestHeaders()
                })
            }()
        } else e(null, "Сервер не указан");

        function u() {
            s || Lampa.Noty.show("Поиск источников...")
        }
    }

    function ee(e) {
        var t = Lampa.Controller.enabled().name,
            n = A(),
            i = [];
        i.push({
            title: "Подобрать автоматически",
            auto: !0
        }), i.push({
            title: "Выбрать все источники",
            selectAll: !0,
            subtitle: "Может вызвать баги и увеличит задержку при открытии плеера"
        }), i.push({
            title: "Сбросить по умолчанию",
            reset: !0
        }), y.forEach((function(e) {
            var t = Lampa.Arrays.isArray(e.id) ? e.id[0] : e.id;
            i.push({
                title: e.name,
                source: t,
                checkbox: !0,
                checked: -1 !== n.indexOf(t)
            })
        })), Lampa.Select.show({
            title: "Выбор источников",
            items: i,
            onBack: function() {
                var n = i.filter((function(e) {
                    return e.checkbox && e.checked
                })).map((function(e) {
                    return e.source
                }));
                0 === n.length && (n = b()), T(n), Lampa.Controller.toggle(t), e && e()
            },
            onSelect: function(t) {
                if (t.auto) Y((function(t, n) {
                    n ? Lampa.Noty.show(n) : t && t.length > 0 && (i.forEach((function(e) {
                        e.checkbox && (e.checked = -1 !== t.indexOf(e.source))
                    })), T(t), Lampa.Noty.show("Найдено источников: " + t.length), Lampa.Select.close(), ee(e))
                }));
                else {
                    if (t.selectAll) {
                        var n = [];
                        return i.forEach((function(e) {
                            e.checkbox && (e.checked = !0, n.push(e.source))
                        })), T(n), Lampa.Noty.show("Выбраны все источники (" + n.length + ")"), Lampa.Select.close(), void ee(e)
                    }
                    if (t.reset) {
                        var a = b();
                        return i.forEach((function(e) {
                            e.checkbox && (e.checked = -1 !== a.indexOf(e.source))
                        })), T(a), Lampa.Noty.show("Источники сброшены"), Lampa.Select.close(), void ee(e)
                    }
                    t.checked = !t.checked
                }
            }
        })
    }

    function ae() {
        Lampa.Settings.listener.follow("open", function(event) {
            if (event.name === "main") {
                if (!Lampa.Settings.main().render().find('[data-component="lampac_fastonline_settings"]').length)
                    Lampa.SettingsApi.addComponent({component: "lampac_fastonline_settings",
                        name: "Склеивание Lampac", icon: g, before: "interface"});
                Lampa.Settings.main().update()
            }
        });
        Lampa.SettingsApi.addParam({component: "lampac_fastonline_settings",
            param: {name: "fastonline_lampac_server", type: "static"},
            field: {name: "Сервер Lampac", description: lampacBase}});
        Lampa.SettingsApi.addParam({component: "lampac_fastonline_settings",
            param: {name: "fastonline_lampac_sources_button", type: "static"},
            field: {name: "Выбор источников", description: "Источники для склеивания"},
            onRender: function(element) {
                element.on("hover:enter", function() { ee() })
            }});
    }! function() {
        if (!window.lampac_fastonline_plugin) {
            window.lampac_fastonline_plugin = {version: "1.1.0", server: lampacBase}, ae(), Lampa.Component.add("lampac_fastonline_episodes", X), Lampa.VPN.region((function() {})), Lampa.Listener.follow("full", (function(e) {
                if ("complite" == e.type) {
                    var root = e.object.activity.render();
                    if (root.find(".view--lampac-merged").length) return;
                    var t = '<div class="full-start__button selector view--online view--lampac-merged" data-subtitle="Lampac">' + g + "<span>Склеивание</span></div>",
                        n = $(Lampa.Lang.translate(t));
                    root.find(".view--torrent").length ? root.find(".view--torrent").last().after(n) : root.find(".full-start-new__buttons, .full-start__buttons").first().append(n), n.on("hover:enter", (function() {
                        Lampa.Controller.toggle("content"), new Q(e.data)
                    }))
                }
            }));
            $("body").append('\n\t\t\t<style>\n\t\t\t\t.connect-broken {\n\t\t\t\t\ttext-align: center;\n\t\t\t\t\tpadding-bottom: 1em;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__title {\n\t\t\t\t\tfont-size: 2em;\n\t\t\t\t\tline-height: 1.4;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__text {\n\t\t\t\t\tfont-size: 1.2em;\n\t\t\t\t\tpadding-top: 1em;\n\t\t\t\t\tline-height: 1.4;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__footer {\n\t\t\t\t\tdisplay: flex;\n\t\t\t\t\tjustify-content: center;\n\t\t\t\t\tmargin-top: 2em;\n\t\t\t\t}\n\n\t\t\t\t.connect-broken__footer .simple-button {\n\t\t\t\t\tmargin: 0;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr {\n\t\t\t\t\tdisplay: flex;\n\t\t\t\t\talign-items: center;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__left {\n\t\t\t\t\twidth: 33%;\n\t\t\t\t\tflex-shrink: 0;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__right {\n\t\t\t\t\tpadding-left: 2em;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__scan {\n\t\t\t\t\ttext-align: center;\n\t\t\t\t\tpadding: 1em;\n\t\t\t\t\tbackground: #fff;\n\t\t\t\t\tborder-radius: 1em;\n\t\t\t\t\tcolor: #000;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__img {\n\t\t\t\t\tposition: relative;\n\t\t\t\t\twidth: 100%;\n\t\t\t\t\tpadding-bottom: 100%;\n\t\t\t\t\toverflow: hidden;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__img img {\n\t\t\t\t\tposition: absolute;\n\t\t\t\t\ttop: 0;\n\t\t\t\t\tleft: 0;\n\t\t\t\t\twidth: 100%;\n\t\t\t\t\theight: 100%;\n\t\t\t\t\topacity: 0;\n\t\t\t\t\ttransition: opacity .2s;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__img img.loaded {\n\t\t\t\t\topacity: 1;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__bot {\n\t\t\t\t\tfont-size: 1.2em;\n\t\t\t\t\tfont-weight: 600;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__text {\n\t\t\t\t\tfont-size: 1.2em;\n\t\t\t\t\tline-height: 1.6;\n\t\t\t\t}\n\n\t\t\t\t.modal-qr__text + .modal-qr__text {\n\t\t\t\t\tmargin-top: 3em;\n\t\t\t\t}\n\t\t\t\t.selectbox-item__subtitle {\n\t\t\t\t\topacity: 0.5;\n\t\t\t\t}\n\t\t\t</style>\n\t\t')
        }
    }()
}();