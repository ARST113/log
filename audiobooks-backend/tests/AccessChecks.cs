using System.Text.Json;
using Microsoft.AspNetCore.Http;
using KnigaSlovo.Audiobooks;

internal static class AccessChecks
{
    public static void Run(Action<string, Action> check)
    {
        const string key = "test-key-for-access-checks-0123456789abcdef";
        Environment.SetEnvironmentVariable("AUDIOBOOK_API_KEY", key);
        check("Middleware закрывает API и допускает три способа авторизации", () =>
        {
            foreach (var mode in new[] { "none", "wrong", "header", "query", "prefix", "invalid-prefix", "health", "preflight" })
            {
                var called = false;
                var context = new DefaultHttpContext();
                context.Request.Path = "/audio/providers";
                context.Request.Method = "GET";
                context.Response.Body = new MemoryStream();
                if (mode == "header") context.Request.Headers["X-Api-Key"] = key;
                if (mode == "wrong") context.Request.Headers["X-Api-Key"] = "wrong";
                if (mode == "query") context.Request.QueryString = new QueryString("?api_key=" + key);
                if (mode == "prefix") context.Request.Path = "/access/" + key + "/audio/providers";
                if (mode == "invalid-prefix") context.Request.Path = "/access/wrong/audio/providers";
                if (mode == "health") context.Request.Path = "/healthz";
                if (mode == "preflight") context.Request.Method = "OPTIONS";
                var middleware = new BackendAccess(_ => { called = true; return Task.CompletedTask; });
                middleware.InvokeAsync(context).GetAwaiter().GetResult();
                var expected = mode is "header" or "query" or "prefix" or "health" or "preflight";
                if (called != expected || (!expected && context.Response.StatusCode != 401))
                    throw new Exception("Режим авторизации не проверен: " + mode);
                if (mode == "prefix" && (context.Request.Path != "/audio/providers" || context.Request.PathBase != "/access/" + key))
                    throw new Exception("Маршрутизация префикса неверна");
            }
        });
        check("API отклоняет отсутствующий и неверный ключ", () =>
        {
            if (BackendAccess.IsValidKey("", key) || BackendAccess.IsValidKey(key + "x", key) ||
                !BackendAccess.IsValidKey(key, key)) throw new Exception("Проверка ключа не работает");
        });
        check("Защита URL не передаёт ключ внешнему источнику", () =>
        {
            var context = new DefaultHttpContext();
            context.Items[BackendAccess.KeyItem] = key;
            var url = "https://akniga.org/cover.jpg";
            if (BackendAccess.ProtectUrl(context, url) != url) throw new Exception("Ключ ушёл источнику");
            if (!BackendAccess.ProtectUrl(context, "/audiobooks/img?url=cover").Contains("api_key=" + key))
                throw new Exception("Обложка осталась без авторизации");
        });
        check("Префикс доступа сохраняется в аудио и перенаправлении", () =>
        {
            var context = new DefaultHttpContext();
            context.Items[BackendAccess.KeyItem] = key;
            context.Request.PathBase = "/access/" + key;
            var expected = "/access/" + key + "/audiobooks/audio?url=audio";
            if (BackendAccess.ProtectUrl(context, "/audiobooks/audio?url=audio") != expected ||
                BackendAccess.ProtectUrl(context, expected) != expected)
                throw new Exception("Префикс потерян или добавлен дважды");
        });
        check("Ссылки JSON и HLS авторизуются без изменения внешних URL", () =>
        {
            var context = new DefaultHttpContext();
            context.Items[BackendAccess.KeyItem] = key;
            var input = JsonSerializer.SerializeToElement(new { proxy_url = "/audiobooks/audio?url=x", title = "Книга", url = "https://akniga.org/book" });
            var output = BackendAccess.ProtectJson(context, input);
            if (output.GetProperty("title").GetString() != "Книга" ||
                output.GetProperty("url").GetString() != "https://akniga.org/book" ||
                !output.GetProperty("proxy_url").GetString()!.Contains("api_key=" + key))
                throw new Exception("JSON изменён неправильно");
            var hls = "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"/audiobooks/audio?url=key\"\n/audiobooks/audio?url=segment\n";
            var protectedHls = BackendAccess.ProtectPlaylist(context, hls);
            if (protectedHls.Split("api_key=" + key).Length != 3) throw new Exception("Сегмент или AES-ключ без авторизации");
        });
    }
}
