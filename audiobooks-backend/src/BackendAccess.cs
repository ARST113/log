using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;

namespace KnigaSlovo.Audiobooks;

public sealed class BackendAccess
{
    public const string KeyItem = "Audiobooks.AuthenticatedKey";
    private readonly RequestDelegate next;
    private readonly string key;

    public BackendAccess(RequestDelegate next)
    {
        this.next = next;
        key = Environment.GetEnvironmentVariable("AUDIOBOOK_API_KEY") ?? "";
        if (key.Length < 32 || key.Any(char.IsWhiteSpace))
            throw new InvalidOperationException("Задайте AUDIOBOOK_API_KEY: случайный ключ не короче 32 символов без пробелов.");
    }

    public async Task InvokeAsync(HttpContext context)
    {
        string supplied = context.Request.Headers["X-Api-Key"].ToString();
        if (string.IsNullOrEmpty(supplied)) supplied = context.Request.Query["api_key"].ToString();
        var path = context.Request.Path.Value ?? "/";
        if (path.StartsWith("/access/", StringComparison.Ordinal))
        {
            var end = path.IndexOf('/', 8);
            if (end < 0) end = path.Length;
            supplied = path[8..end];
            if (!IsValidKey(supplied, key)) { await Deny(context); return; }
            context.Request.PathBase = context.Request.PathBase.Add(new PathString(path[..end]));
            context.Request.Path = end == path.Length ? "/" : path[end..];
            path = context.Request.Path.Value!;
        }
        var publicPath = path is "/" or "/healthz" or "/readyz" or "/audiobook2.js";
        if (context.Request.Method == "OPTIONS" || (publicPath && string.IsNullOrEmpty(supplied)))
        {
            await next(context);
            return;
        }
        if (!IsValidKey(supplied, key)) { await Deny(context); return; }
        context.Items[KeyItem] = supplied;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers.CacheControl = "private, no-store";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Content-Security-Policy"] = "sandbox; default-src 'none'; base-uri 'none'; frame-ancestors 'none'";
            if (context.Response.Headers.Location.Count > 0)
                context.Response.Headers.Location = ProtectUrl(context, context.Response.Headers.Location.ToString());
            return Task.CompletedTask;
        });
        await next(context);
    }

    private static async Task Deny(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["Access-Control-Allow-Origin"] = "*";
        await context.Response.WriteAsJsonAsync(new { error = "Требуется действующий ключ доступа" });
    }

    public static bool IsValidKey(string supplied, string expected) =>
        !string.IsNullOrEmpty(supplied) && !string.IsNullOrEmpty(expected) &&
        CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(supplied)),
            SHA256.HashData(Encoding.UTF8.GetBytes(expected)));

    public static string ProtectUrl(HttpContext context, string url)
    {
        if (!url.StartsWith("/audio/", StringComparison.Ordinal) &&
            !url.StartsWith("/audiobooks/", StringComparison.Ordinal)) return url;
        if (context.Items[KeyItem] is not string authenticatedKey) return url;
        if (context.Request.PathBase.HasValue) return context.Request.PathBase + url;
        if (Regex.IsMatch(url, "[?&]api_key=", RegexOptions.CultureInvariant)) return url;
        return url + (url.Contains('?') ? "&" : "?") + "api_key=" + Uri.EscapeDataString(authenticatedKey);
    }

    public static string ProtectPlaylist(HttpContext context, string playlist) =>
        Regex.Replace(playlist, @"/audiobooks/audio\?[^\s""<>]+", match => ProtectUrl(context, match.Value));

    public static JsonElement ProtectJson(HttpContext context, JsonElement value)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) Write(value, writer);
        using var result = JsonDocument.Parse(stream.ToArray());
        return result.RootElement.Clone();

        void Write(JsonElement item, Utf8JsonWriter writer)
        {
            switch (item.ValueKind)
            {
                case JsonValueKind.Object:
                    writer.WriteStartObject();
                    foreach (var property in item.EnumerateObject()) { writer.WritePropertyName(property.Name); Write(property.Value, writer); }
                    writer.WriteEndObject(); break;
                case JsonValueKind.Array:
                    writer.WriteStartArray();
                    foreach (var element in item.EnumerateArray()) Write(element, writer);
                    writer.WriteEndArray(); break;
                case JsonValueKind.String:
                    writer.WriteStringValue(ProtectUrl(context, item.GetString()!)); break;
                default: item.WriteTo(writer); break;
            }
        }
    }
}

public sealed class AuthenticatedMediaFilter(IOptions<JsonOptions> options) : IAsyncResultFilter
{
    public async Task OnResultExecutionAsync(ResultExecutingContext context, ResultExecutionDelegate next)
    {
        if (context.HttpContext.Items.ContainsKey(BackendAccess.KeyItem))
        {
            if (context.Result is JsonResult json && json.Value != null)
                json.Value = BackendAccess.ProtectJson(context.HttpContext, JsonSerializer.SerializeToElement(json.Value, options.Value.JsonSerializerOptions));
            else if (context.Result is ObjectResult value && value.Value != null)
                value.Value = BackendAccess.ProtectJson(context.HttpContext, JsonSerializer.SerializeToElement(value.Value, options.Value.JsonSerializerOptions));
        }
        await next();
    }
}
