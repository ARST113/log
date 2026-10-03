using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using HtmlAgilityPack;
using Microsoft.Data.Sqlite;
using KnigaSlovo.Audiobooks;
using KnigaSlovo.Controllers;

Environment.SetEnvironmentVariable("AUDIOBOOK_DB", Path.GetFullPath("controller-checks.sqlite"));
Environment.SetEnvironmentVariable("AUDIOBOOK_CRAWLER_ENABLED", "false");
if (args.Length == 2 && args[0] == "--benchmark")
{
    var catalog = new AudioFdbStore(args[1]);
    catalog.EnsureSchema();
    var timer = System.Diagnostics.Stopwatch.StartNew();
    var books = catalog.SearchWorks("реинкарнация безработного", "", 50, 0, playableOnly:false);
    Console.WriteLine("Поиск реального каталога: " + timer.Elapsed.TotalMilliseconds + " мс; книг: " + books.Count);
    return books.Count >= 40 && timer.Elapsed.TotalSeconds < 1 ? 0 : 1;
}
int failures = 0;
void Check(string name, Action test) {
    try { test(); Console.WriteLine("ПРОЙДЕНО: " + name); }
    catch (Exception e) { failures++; Console.WriteLine("ОШИБКА: " + name + ": " + e.GetBaseException().Message); }
}
void Equal<T>(T expected, T actual) { if (!Equals(expected, actual)) throw new Exception($"Ожидалось {expected}, получено {actual}"); }
AccessChecks.Run(Check);
var titleMatch = typeof(AudioController).GetMethod("IsSameBookTitle", BindingFlags.Static | BindingFlags.NonPublic)!;
Check("Поиск по неполному названию книги", () => Equal(true, (bool)titleMatch.Invoke(null, new object[]{"Трое в лодке, не считая собаки", "Трое в лодке"})!));
Check("Поиск тома по названию цикла", () => Equal(true, (bool)titleMatch.Invoke(null, new object[]{"Реинкарнация безработного. Том 26", "Реинкарнация безработного"})!));
Check("Похожее слово не совпадает с названием", () => Equal(false, (bool)titleMatch.Invoke(null, new object[]{"Безработногостория", "Безработного"})!));
using var akniga = new AknigaModule();
var parse = typeof(AknigaModule).GetMethod("ParseAknigaCard", BindingFlags.Instance | BindingFlags.NonPublic)!;
var search = new HtmlDocument(); search.Load("akniga-search.html");
var first = search.DocumentNode.SelectSingleNode("//div[contains(@class,'content__main__articles--item')]");
Check("Реальная карточка АКНИГА сохраняет серию и номер тома", () => {
    var book = (Audiobook)parse.Invoke(akniga, new object[]{first, ""})!;
    Equal("Реинкарнация безработного", book.seriesName); Equal("26", book.numberInSeries); Equal("username t", book.reader);
});
var series = new HtmlDocument(); series.Load("akniga-series.html");
var cards = series.DocumentNode.SelectNodes("//div[contains(@class,'content__main__articles--series-item')]");
Check("Страница цикла сохраняет порядковые и дробные номера", () => {
    var one = (Audiobook)parse.Invoke(akniga, new object[]{cards[0], "реинкарнация безработного"})!;
    var extra = (Audiobook)parse.Invoke(akniga, new object[]{cards[1], "реинкарнация безработного"})!;
    Equal("1", one.numberInSeries); Equal("1.5", extra.numberInSeries); Equal("Zodik", one.reader);
});
string db = Path.GetFullPath("checks.sqlite");
foreach (var suffix in new[]{"", "-wal", "-shm"}) if (File.Exists(db+suffix)) File.Delete(db+suffix);
var store = new AudioFdbStore(db); store.EnsureSchema();
Check("Читатель каталога не блокирует сохранение новой книги", () => {
    using var reader = new SqliteConnection("Data Source=" + db); reader.Open();
    using var tx = reader.BeginTransaction(deferred:true);
    using var cmd = reader.CreateCommand(); cmd.Transaction=tx; cmd.CommandText="SELECT COUNT(*) FROM works"; cmd.ExecuteScalar();
    var write = Task.Run(() => store.UpsertWork(new AudioFdbWork {id="check:writer",title="Проверка"}));
    bool completed = write.Wait(TimeSpan.FromSeconds(2));
    tx.Rollback(); write.GetAwaiter().GetResult(); Equal(true, completed);
    Equal("Проверка", store.GetWork("check:writer")!.title);
});
Check("Параллельное сохранение книг не теряет записи", () => {
    Parallel.For(0, 24, i => store.UpsertWork(new AudioFdbWork{id="check:"+i,title="Проверочная книга "+i}));
    for (int i=0;i<24;i++) Equal("Проверочная книга "+i, store.GetWork("check:"+i)!.title);
});
Check("Путь базы задаётся без каталога Lampac", () => {
    var dbField = typeof(AudioFdbStore).GetField("_dbPath", BindingFlags.NonPublic | BindingFlags.Instance)!;
    Equal(Path.GetFullPath("controller-checks.sqlite"), dbField.GetValue(new AudioFdbStore())!);
});
Check("Известная книга возвращается без ожидания фоновых задач", () => {
    var controller = new AudioController();
    var controllerStore = (AudioFdbStore)typeof(AudioController).GetField("Store", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
    controllerStore.UpsertWork(new AudioFdbWork { id="test:known",title="Быстрый тестовый поиск",editions={new AudioFdbEdition {id="test:edition",work_id="test:known",sources={new AudioFdbSource {id="test:source",edition_id="test:edition",provider="akniga",page_url="https://akniga.org/test"}}}}});
    var pending = new TaskCompletionSource();
    var cache = typeof(AudioController).GetMethod("CachedDiscoveryTask", BindingFlags.NonPublic | BindingFlags.Static)!;
    foreach(var key in new[]{"akniga-title:быстрый тестовый поиск", "search-details:быстрый тестовый поиск:0"})
        cache.Invoke(null,new object[]{key, (Func<Task>)(() => pending.Task), TimeSpan.FromMinutes(30)});
    var sw=System.Diagnostics.Stopwatch.StartNew();
    var searchMethod=typeof(AudioController).GetMethod("SearchFastAsync",BindingFlags.NonPublic|BindingFlags.Instance)!;
    var result=((Task<System.Collections.Generic.List<AudioFdbWork>>)searchMethod.Invoke(controller,new object[]{"Быстрый тестовый поиск","",20,0})!).GetAwaiter().GetResult();
    Equal(true,result.Any(w=>w.id=="test:known"));
    if(sw.Elapsed > TimeSpan.FromMilliseconds(750)) throw new Exception("Ожидание фоновых задач: "+sw.Elapsed.TotalSeconds+" с");
});
Check("Аудиопрокси блокирует локальные и служебные адреса", () => {
    foreach(var ip in new[]{"127.0.0.1","10.1.2.3","172.17.0.1","192.168.1.1","169.254.169.254","100.64.0.1","::1","::ffff:127.0.0.1","fd00::1","fe80::1"})
        Equal(false, PublicNetwork.IsPublic(System.Net.IPAddress.Parse(ip)));
    foreach(var ip in new[]{"8.8.8.8","1.1.1.1","2606:4700:4700::1111"})
        Equal(true,PublicNetwork.IsPublic(System.Net.IPAddress.Parse(ip)));
});
Check("Внешний прокси принимает только адреса источников", () => {
    foreach(var url in new[]{"http://127.0.0.1/", "https://akniga.org.evil.example/", "https://evil.example/", "http://akniga.org:8097/", "https://user@akniga.org/"})
        Equal(false, PublicNetwork.IsTrustedProxyTarget(new Uri(url)));
    Equal(true, PublicNetwork.IsTrustedProxyTarget(new Uri("https://akniga.org/book")));
    Environment.SetEnvironmentVariable("AUDIOBOOK_PROXY", "http://127.0.0.1:1");
    try {
        var create = typeof(AudiobookModuleBase).GetMethod("CreateClient", BindingFlags.Static | BindingFlags.NonPublic)!;
        using var client = (System.Net.Http.HttpClient)create.Invoke(null,new object[]{true})!;
        try { client.GetAsync("http://127.0.0.1/healthz").GetAwaiter().GetResult(); throw new Exception("Локальный URL принят прокси"); }
        catch(System.Net.Http.HttpRequestException error) { Equal(true,error.Message.Contains("не разрешён")); }
    } finally { Environment.SetEnvironmentVariable("AUDIOBOOK_PROXY", null); }
});
Console.WriteLine($"Ошибок: {failures}");
return failures == 0 ? 0 : 1;
