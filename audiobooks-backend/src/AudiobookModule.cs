using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using HtmlAgilityPack;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web;

namespace KnigaSlovo.Audiobooks
{
    public sealed class Audiobook
    {
        public string source { get; init; } = string.Empty;
        public string author { get; init; } = string.Empty;
        public string name { get; init; } = string.Empty;
        public string seriesName { get; init; } = string.Empty;
        public string numberInSeries { get; init; } = string.Empty;
        public string description { get; init; } = string.Empty;
        public string reader { get; init; } = string.Empty;
        public string duration { get; init; } = string.Empty;
        public string url { get; init; } = string.Empty;
        public string preview { get; set; } = string.Empty;
        public List<AudiobookChapter> items { get; } = new();
    }

    public sealed class AudiobookChapter
    {
        public string fileurl { get; init; } = string.Empty;
        public int fileIndex { get; init; }
        public string title { get; init; } = string.Empty;
        public double startTime { get; init; }
        public double endTime { get; init; }
    }

    public interface IAudiobookModule : IDisposable
    {
        string Driver { get; }
        Task<Audiobook?> GetBookAsync(string url);
        Task<List<Audiobook>> GetSeriesAsync(string url);
        Task<List<Audiobook>> SearchAsync(string query, int limit = 20, int offset = 0);
        string NormalizeImage(string? url);
    }

    public abstract class AudiobookModuleBase : IAudiobookModule
    {
        protected readonly HttpClient HttpClient;
        private readonly bool _ownsClient;

        public abstract string Driver { get; }

        protected AudiobookModuleBase(HttpClient? httpClient = null)
        {
            if (httpClient != null)
            {
                HttpClient = httpClient;
                _ownsClient = false;
                ConfigureClient(HttpClient);
                return;
            }

            HttpClient = CreateClient(useProxy: true);
            _ownsClient = true;
        }

        private static void ConfigureClient(HttpClient client)
        {
            client.Timeout = TimeSpan.FromSeconds(15);

            if (!client.DefaultRequestHeaders.UserAgent.Any())
                client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36");

            if (!client.DefaultRequestHeaders.Accept.Any())
                client.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");

            if (!client.DefaultRequestHeaders.AcceptLanguage.Any())
                client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ru-RU,ru;q=0.9,en;q=0.8");
        }

        internal static HttpClient CreateClient(bool useProxy)
        {
            var configuredProxy = Environment.GetEnvironmentVariable("AUDIOBOOK_PROXY");
            Uri? proxyUri = null;
            var hasConfiguredProxy = useProxy &&
                Uri.TryCreate(configuredProxy, UriKind.Absolute, out proxyUri);
            var handler = new SocketsHttpHandler
            {
                AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate,
                UseProxy = hasConfiguredProxy,
                AllowAutoRedirect = !hasConfiguredProxy,
                ConnectTimeout = TimeSpan.FromSeconds(8)
            };
            if (!hasConfiguredProxy) handler.ConnectCallback = PublicNetwork.ConnectAsync;

            if (hasConfiguredProxy)
            {
                try
                {
                    handler.Proxy = new WebProxy(proxyUri!);
                }
                catch
                {
                    handler.UseProxy = false;
                    handler.ConnectCallback = PublicNetwork.ConnectAsync;
                }
            }

            var client = new HttpClient(handler.UseProxy ? new PublicNetwork.ProxyRequestGuard(handler) : handler);
            ConfigureClient(client);
            return client;
        }

        protected async Task<string> GetStringWithFallbackAsync(string url)
        {
            try
            {
                return await HttpClient.GetStringAsync(url);
            }
            catch
            {
                using var fallback = CreateClient(useProxy: false);
                return await fallback.GetStringAsync(url);
            }
        }

        protected async Task<string> GetStringDirectFirstAsync(string url, int timeoutSeconds = 8, bool useProxyFallback = true)
        {
            using var direct = CreateClient(useProxy: false);
            direct.Timeout = TimeSpan.FromSeconds(Math.Max(1, timeoutSeconds));

            try
            {
                return await direct.GetStringAsync(url);
            }
            catch
            {
                if (!useProxyFallback)
                    throw;

                return await HttpClient.GetStringAsync(url);
            }
        }

        public virtual void Dispose()
        {
            if (_ownsClient)
                HttpClient.Dispose();
        }

        public abstract Task<Audiobook?> GetBookAsync(string url);
        public abstract Task<List<Audiobook>> GetSeriesAsync(string url);
        public abstract Task<List<Audiobook>> SearchAsync(string query, int limit = 20, int offset = 0);
        public abstract string NormalizeImage(string? url);

        protected static HtmlDocument LoadDocument(string html)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }

        protected static string SafeName(string? value) => string.IsNullOrWhiteSpace(value) ? string.Empty : HttpUtility.HtmlDecode(value.Trim());
        protected static string SafeText(HtmlNode? node) => node == null ? string.Empty : HttpUtility.HtmlDecode(node.InnerText.Trim());
        protected static string SafeAttribute(HtmlNode? node, string attribute) => node?.GetAttributeValue(attribute, string.Empty) ?? string.Empty;

        protected static string BuildAbsoluteUrl(string siteUrl, string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return string.Empty;
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return url;
            if (url.StartsWith("//")) return "https:" + url;
            return siteUrl.TrimEnd('/') + "/" + url.TrimStart('/');
        }

        protected static double ParseSeconds(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return 0;

            if (double.TryParse(value, out var seconds))
                return seconds;

            if (TimeSpan.TryParse(value, out var ts))
                return ts.TotalSeconds;

            return 0;
        }

        protected static string SecondsToClock(long? totalSeconds)
        {
            if (!totalSeconds.HasValue) return string.Empty;
            return TimeSpan.FromSeconds(totalSeconds.Value).ToString(@"hh\:mm\:ss");
        }
    }

    public sealed class KnigaVuheModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://knigavuhe.org";
        public override string Driver => "knigavuhe";

        public KnigaVuheModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override string NormalizeImage(string? url) => BuildAbsoluteUrl(SiteUrl, url ?? "");

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var html = await GetStringDirectFirstAsync(url);
            var doc = LoadDocument(html);

            var bookMatch = Regex.Match(html, @"cur\.book\s*=\s*(.+?);");
            if (!bookMatch.Success) return null;
            var bookData = JsonNode.Parse(bookMatch.Groups[1].Value)?.AsObject();
            if (bookData == null) return null;

            var playlistMatch = Regex.Match(html, @"new\s+BookPlayer\(\d+,\s*(\[[\s\S]*?\])\s*,\s*\[", RegexOptions.Singleline);
            var playlist = playlistMatch.Success ? JsonNode.Parse(playlistMatch.Groups[1].Value)?.AsArray() : null;

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'book_title_elem')]//span/a"));
            if (string.IsNullOrWhiteSpace(author))
                author = SafeText(doc.DocumentNode.SelectSingleNode("//*[contains(@class,'book_author')]//a"));
            if (string.IsNullOrWhiteSpace(author))
                author = "Неизвестен";

            var book = new Audiobook
            {
                source = Driver,
                author = SafeName(author),
                name = SafeName(bookData["name"]?.GetValue<string>() ?? SafeText(doc.DocumentNode.SelectSingleNode("//h1"))),
                seriesName = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_title')]/a"))),
                numberInSeries = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_item')]/span[contains(@class,'bookkitem_serie_index')]"))),
                description = SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_description')]")),
                reader = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//a[starts-with(@href, '/reader/')]"))),
                duration = SafeDuration(doc),
                url = url,
                preview = NormalizeImage(SafeAttribute(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_cover')]//img | //meta[@property='og:image']"), "src")),
            };

            if (string.IsNullOrWhiteSpace(book.preview))
                book.preview = NormalizeImage(doc.DocumentNode.SelectSingleNode("//meta[@property='og:image']")?.GetAttributeValue("content", ""));

            if (playlist != null)
            {
                int idx = 0;
                foreach (var item in playlist)
                {
                    var fileUrl = item?["url"]?.GetValue<string>();
                    if (string.IsNullOrWhiteSpace(fileUrl)) continue;

                    book.items.Add(new AudiobookChapter
                    {
                        fileurl = fileUrl,
                        fileIndex = idx++,
                        title = SafeName(item?["title"]?.GetValue<string>()),
                        startTime = 0,
                        endTime = item?["duration"]?.GetValue<double?>() ?? 0
                    });
                }
            }

            return book;
        }

        public override async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var html = await GetStringDirectFirstAsync(url);
            var doc = LoadDocument(html);

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'book_title_elem')]//span/a"));
            if (string.IsNullOrWhiteSpace(author)) author = "Неизвестен";

            var seriesLink = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_title')]/a");
            if (seriesLink == null) return new List<Audiobook>();

            var seriesName = SafeText(seriesLink);
            var seriesUrl = BuildAbsoluteUrl(SiteUrl, seriesLink.GetAttributeValue("href", string.Empty));

            var seriesHtml = await GetStringDirectFirstAsync(seriesUrl);
            var seriesDoc = LoadDocument(seriesHtml);

            var list = new List<Audiobook>();
            var cards = seriesDoc.DocumentNode.SelectNodes("//div[contains(@class,'bookkitem') and not(.//span[contains(@class,'bookkitem_litres_icon')])]") ?? new HtmlNodeCollection(null);

            foreach (var card in cards)
            {
                var baseBook = ParseCard(card, author, seriesName);
                if (baseBook == null) continue;
                list.Add(baseBook);
            }

            return list;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 20, int offset = 0)
        {
            var books = new List<Audiobook>();

            if (string.IsNullOrWhiteSpace(query))
            {
                var need = Math.Max(1, limit);
                var skip = Math.Max(0, offset);
                var catalogPage = Math.Max(1, (skip / need) + 1);
                var pageSkip = skip % need;
                var catalogUrl = catalogPage <= 1 ? $"{SiteUrl}/new/" : $"{SiteUrl}/new/?page={catalogPage}";

                var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                var html = await GetStringDirectFirstAsync(catalogUrl, timeoutSeconds: 8, useProxyFallback: false);
                var doc = LoadDocument(html);
                var cards = doc.DocumentNode.SelectNodes("//div[contains(@class,'bookkitem') and not(.//span[contains(@class,'bookkitem_litres_icon')])]") ?? new HtmlNodeCollection(null);

                foreach (var card in cards)
                {
                    var b = ParseCard(card, "Неизвестен", string.Empty);
                    if (b == null) continue;

                    var dedupeKey = !string.IsNullOrWhiteSpace(b.url) ? b.url : b.name;
                    if (!seen.Add(dedupeKey)) continue;

                    books.Add(b);
                    if (books.Count >= need) break;
                }

                return books
                    .Skip(pageSkip)
                    .Take(need)
                    .ToList();
            }

            var page = 1;
            while (books.Count < limit * 3)
            {
                var searchUrl = $"{SiteUrl}/search/?q={HttpUtility.UrlEncode(query)}&page={page}";
                var html = await GetStringDirectFirstAsync(searchUrl);
                var doc = LoadDocument(html);
                var cards = (doc.DocumentNode.SelectNodes("//div[contains(@class,'bookkitem') and not(.//span[contains(@class,'bookkitem_litres_icon')])]") ?? new HtmlNodeCollection(null)).ToList();
                if (!cards.Any()) break;

                if (offset > 0)
                {
                    if (offset >= cards.Count)
                    {
                        offset -= cards.Count;
                        cards.Clear();
                    }
                    else
                    {
                        cards = cards.Skip(offset).ToList();
                        offset = 0;
                    }
                }

                foreach (var card in cards)
                {
                    var b = ParseCard(card, "Неизвестен", string.Empty);
                    if (b != null) books.Add(b);
                }

                if (cards.Count < 15) break;
                page++;
            }

            return books
                .GroupBy(x => x.url, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.preview)) ?? g.First())
                .Take(limit)
                .ToList();
        }

        private static string SafeDuration(HtmlDocument doc)
        {
            var label = doc.DocumentNode.SelectSingleNode("//span[text()='Время звучания:']");
            var textNode = label?.ParentNode?.ChildNodes.LastOrDefault(x => x.NodeType == HtmlNodeType.Text);
            return textNode?.InnerText.Trim() ?? string.Empty;
        }

        private Audiobook? ParseCard(HtmlNode card, string authorFallback, string seriesFallback)
        {
            var relUrl = SafeAttribute(card.SelectSingleNode(".//a[contains(@class,'bookkitem_cover')]"), "href");
            if (string.IsNullOrWhiteSpace(relUrl))
                relUrl = SafeAttribute(card.SelectSingleNode(".//a[contains(@class,'bookkitem_name')]"), "href");
            if (string.IsNullOrWhiteSpace(relUrl)) return null;

            var number = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_serie_index')]"));
            var name = SafeText(card.SelectSingleNode(".//a[contains(@class,'bookkitem_name')]"));
            if (!string.IsNullOrWhiteSpace(number))
                name = name.Replace(number + ". ", string.Empty);

            var author = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_author')]//a[contains(@class,'with_icon')]"));
            if (string.IsNullOrWhiteSpace(author))
                author = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_author')]/a"));
            if (string.IsNullOrWhiteSpace(author)) author = authorFallback;

            var series = SafeText(card.SelectSingleNode(".//a[starts-with(@href, '/serie/')]"));
            if (string.IsNullOrWhiteSpace(series)) series = seriesFallback;

            return new Audiobook
            {
                source = Driver,
                author = SafeName(author),
                name = SafeName(name),
                seriesName = SafeName(series),
                numberInSeries = SafeName(number),
                reader = SafeName(SafeText(card.SelectSingleNode(".//a[starts-with(@href, '/reader/')]"))),
                duration = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_meta_time')]")),
                description = SafeText(card.SelectSingleNode(".//div[contains(@class,'bookkitem_about')]")),
                url = BuildAbsoluteUrl(SiteUrl, relUrl),
                preview = NormalizeImage(SafeAttribute(card.SelectSingleNode(".//img[contains(@class,'bookkitem_cover_img')]"), "src")),
            };
        }
    }

    public sealed class AknigaModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://akniga.org";
        public override string Driver => "akniga";

        public AknigaModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override string NormalizeImage(string? url) => BuildAbsoluteUrl(SiteUrl, url ?? "");

        private const string Passphrase = "EKxtcg46V";

        private static string AknigaGetSecurityKeyFromHtml(string html)
        {
            var match = Regex.Match(html, @"LIVESTREET_SECURITY_KEY\s*=\s*'([^']+)'");
            if (!match.Success)
                throw new Exception("akniga security key not found");
            return match.Groups[1].Value;
        }

        private async Task<string> AknigaGetHomeSecurityKeyAsync()
        {
            return AknigaGetSecurityKeyFromHtml(await GetStringDirectFirstAsync(SiteUrl));
        }

        private static int AknigaGetBookBidFromHtml(string html)
        {
            var match = Regex.Match(html, "<article[^>]*data-bid=\\\"(\\d+)\\\"", RegexOptions.IgnoreCase);
            if (!match.Success)
                throw new Exception("akniga bid not found");
            return int.Parse(match.Groups[1].Value);
        }

        private static Dictionary<string, string> AknigaBuildAjaxPayload(int bid, string securityKey)
        {
            var encrypted = AknigaCryptoJsEncrypt($"\"{securityKey}\"", Passphrase);
            var hashJson = System.Text.Json.JsonSerializer.Serialize(new Dictionary<string, string>
            {
                ["ct"] = encrypted.ct,
                ["iv"] = encrypted.iv,
                ["s"] = encrypted.s
            });

            return new Dictionary<string, string>
            {
                ["bid"] = bid.ToString(),
                ["hash"] = hashJson,
                ["security_ls_key"] = securityKey
            };
        }

        private static (string ct, string iv, string s) AknigaCryptoJsEncrypt(string plaintext, string passphrase)
        {
            byte[] salt = System.Security.Cryptography.RandomNumberGenerator.GetBytes(8);
            var evp = AknigaEvpBytesToKey(System.Text.Encoding.UTF8.GetBytes(passphrase), salt, 32, 16);
            byte[] key = evp.key;
            byte[] iv = evp.iv;

            using var aes = System.Security.Cryptography.Aes.Create();
            aes.Mode = System.Security.Cryptography.CipherMode.CBC;
            aes.Padding = System.Security.Cryptography.PaddingMode.PKCS7;
            aes.Key = key;
            aes.IV = iv;

            using var encryptor = aes.CreateEncryptor();
            byte[] plainBytes = System.Text.Encoding.UTF8.GetBytes(plaintext);
            byte[] cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

            return (
                Convert.ToBase64String(cipherBytes),
                Convert.ToHexString(iv).ToLowerInvariant(),
                Convert.ToHexString(salt).ToLowerInvariant()
            );
        }

        private static string AknigaCryptoJsDecrypt(string payload, string passphrase)
        {
            if (string.IsNullOrWhiteSpace(payload))
                return string.Empty;

            using var json = JsonDocument.Parse(payload);
            var root = json.RootElement;
            var ciphertext = Convert.FromBase64String(root.GetProperty("ct").GetString() ?? string.Empty);
            var salt = Convert.FromHexString(root.GetProperty("s").GetString() ?? string.Empty);
            var evp = AknigaEvpBytesToKey(Encoding.UTF8.GetBytes(passphrase), salt, 32, 16);

            using var aes = Aes.Create();
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.Key = evp.key;
            aes.IV = evp.iv;

            using var decryptor = aes.CreateDecryptor();
            var plainBytes = decryptor.TransformFinalBlock(ciphertext, 0, ciphertext.Length);
            var plain = Encoding.UTF8.GetString(plainBytes).Trim();
            try
            {
                return JsonSerializer.Deserialize<string>(plain) ?? plain.Trim('"');
            }
            catch
            {
                return plain.Trim('"').Replace("\\/", "/");
            }
        }

        private static (byte[] key, byte[] iv) AknigaEvpBytesToKey(byte[] password, byte[] salt, int keyLen, int ivLen)
        {
            using var md5 = System.Security.Cryptography.MD5.Create();

            var result = new List<byte>();
            byte[] prev = Array.Empty<byte>();

            while (result.Count < keyLen + ivLen)
            {
                byte[] input = AknigaCombine(prev, password, salt);
                prev = md5.ComputeHash(input);
                result.AddRange(prev);
            }

            byte[] all = result.ToArray();
            byte[] key = all.Take(keyLen).ToArray();
            byte[] iv = all.Skip(keyLen).Take(ivLen).ToArray();
            return (key, iv);
        }

        private static byte[] AknigaCombine(params byte[][] arrays)
        {
            int length = arrays.Sum(a => a.Length);
            byte[] result = new byte[length];
            int offset = 0;

            foreach (var arr in arrays)
            {
                Buffer.BlockCopy(arr, 0, result, offset, arr.Length);
                offset += arr.Length;
            }

            return result;
        }


        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var html = await GetStringDirectFirstAsync(url);
            var doc = LoadDocument(html);

            var descriptionNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'description__article-main')]");
            if (descriptionNode != null)
            {
                var caption = descriptionNode.SelectSingleNode(".//div[contains(@class,'content__main__book--item--caption')]");
                caption?.Remove();
            }

            var nameValue = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//h1")));
            if (string.IsNullOrWhiteSpace(nameValue))
                nameValue = SafeName(SafeAttribute(doc.DocumentNode.SelectSingleNode("//meta[@property='og:title']"), "content"));

            var authorValue = "Неизвестен";
            var readerValue = SafeName(
                SafeText(doc.DocumentNode.SelectSingleNode("//a[contains(@class,'link__reader')]//span")) ??
                SafeText(doc.DocumentNode.SelectSingleNode("//a[contains(@href,'/performer/')]"))
            );

            var previewValue = NormalizeImage(SafeAttribute(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book--cover')]//img"), "src"));
            if (string.IsNullOrWhiteSpace(previewValue))
                previewValue = NormalizeImage(doc.DocumentNode.SelectSingleNode("//meta[@property='og:image']")?.GetAttributeValue("content", ""));

            var items = new List<AudiobookChapter>();

            try
            {
                using var handler = new SocketsHttpHandler
                {
                    AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate | DecompressionMethods.Brotli,
                    CookieContainer = new CookieContainer(),
                    UseCookies = true,
                    UseProxy = false,
                    ConnectCallback = PublicNetwork.ConnectAsync
                };

                using var client = new HttpClient(handler);
                client.Timeout = TimeSpan.FromSeconds(60);

                async Task<string> SendAsync(HttpRequestMessage request)
                {
                    request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36");
                    request.Headers.AcceptLanguage.ParseAdd("ru-RU,ru;q=0.9,en;q=0.8");

                    using var response = await client.SendAsync(request);
                    response.EnsureSuccessStatusCode();
                    return await response.Content.ReadAsStringAsync();
                }

                using (var primeRequest = new HttpRequestMessage(HttpMethod.Get, url))
                {
                    primeRequest.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
                    html = await SendAsync(primeRequest);
                    doc = LoadDocument(html);
                }

                var securityKey = AknigaGetSecurityKeyFromHtml(html);
                var bid = AknigaGetBookBidFromHtml(html).ToString();

                async Task<string> PostFormAsync(string endpoint, Dictionary<string, string> form)
                {
                    using var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                    request.Headers.Accept.ParseAdd("application/json, text/javascript, */*; q=0.01");
                    request.Headers.Referrer = new Uri(url);
                    request.Headers.Add("Origin", SiteUrl);
                    request.Headers.Add("X-Requested-With", "XMLHttpRequest");
                    request.Content = new FormUrlEncodedContent(form);
                    return await SendAsync(request);
                }

                var tokenJson = await PostFormAsync($"{SiteUrl}/ajax/player/token", new Dictionary<string, string>
                {
                    ["bid"] = bid,
                    ["ts"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(),
                    ["security_ls_key"] = securityKey
                });

                using var tokenDoc = System.Text.Json.JsonDocument.Parse(tokenJson);
                var token = tokenDoc.RootElement.TryGetProperty("token", out var tokenEl) ? tokenEl.GetString() : null;
                if (string.IsNullOrWhiteSpace(token))
                    throw new Exception("akniga player token not found");

                var ajaxJson = await PostFormAsync($"{SiteUrl}/ajax/b/{bid}", new Dictionary<string, string>
                {
                    ["bid"] = bid,
                    ["token"] = token,
                    ["hls"] = "true",
                    ["security_ls_key"] = securityKey
                });

                using var ajaxDoc = System.Text.Json.JsonDocument.Parse(ajaxJson);
                var root = ajaxDoc.RootElement;
                var hlsUrl = string.Empty;
                if (root.TryGetProperty("hres", out var hresEl))
                {
                    var encryptedHls = hresEl.GetString();
                    if (!string.IsNullOrWhiteSpace(encryptedHls))
                    {
                        try { hlsUrl = AknigaCryptoJsDecrypt(encryptedHls, Passphrase); }
                        catch { hlsUrl = string.Empty; }
                    }
                }

                if (root.TryGetProperty("author", out var authorEl))
                {
                    var v = authorEl.GetString();
                    if (!string.IsNullOrWhiteSpace(v))
                        authorValue = SafeName(v);
                }

                if (root.TryGetProperty("titleonly", out var titleOnlyEl))
                {
                    var v = titleOnlyEl.GetString();
                    if (!string.IsNullOrWhiteSpace(v))
                        nameValue = SafeName(v);
                }

                if (root.TryGetProperty("performer", out var performerEl))
                {
                    var v = performerEl.GetString();
                    if (!string.IsNullOrWhiteSpace(v))
                        readerValue = SafeName(v);
                }

                if (root.TryGetProperty("preview", out var previewEl))
                {
                    var v = previewEl.GetString();
                    if (!string.IsNullOrWhiteSpace(v))
                        previewValue = NormalizeImage(v);
                }

                var ajaxTitle = root.TryGetProperty("title", out var titleEl) && !string.IsNullOrWhiteSpace(titleEl.GetString())
                    ? titleEl.GetString()
                    : nameValue;

                var ajaxSrv = root.TryGetProperty("srv", out var srvEl) ? srvEl.GetString() : null;
                if (string.IsNullOrWhiteSpace(ajaxSrv))
                    ajaxSrv = "https://r1.akniga.club/";

                ajaxSrv = ajaxSrv.TrimEnd('/') + "/";
                if (!ajaxSrv.EndsWith("/m/", StringComparison.OrdinalIgnoreCase))
                    ajaxSrv += "m/";

                if (root.TryGetProperty("items", out var itemsElement))
                {
                    System.Text.Json.JsonElement chaptersElement;
                    System.Text.Json.JsonDocument nestedDoc = null;

                    if (itemsElement.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        var raw = itemsElement.GetString() ?? "[]";
                        nestedDoc = System.Text.Json.JsonDocument.Parse(raw);
                        chaptersElement = nestedDoc.RootElement;
                    }
                    else
                    {
                        chaptersElement = itemsElement;
                    }

                    try
                    {
                        foreach (var ch in chaptersElement.EnumerateArray())
                        {
                            var fileNum = 1;
                            if (ch.TryGetProperty("file", out var fileEl))
                            {
                                if (fileEl.ValueKind == System.Text.Json.JsonValueKind.Number && fileEl.TryGetInt32(out var n))
                                    fileNum = Math.Max(1, n);
                                else if (fileEl.ValueKind == System.Text.Json.JsonValueKind.String && int.TryParse(fileEl.GetString(), out var ns))
                                    fileNum = Math.Max(1, ns);
                            }

                            var fileNumConv = fileNum < 10 ? "0" + fileNum : fileNum.ToString();
                            var fileSlug = $"{fileNumConv}. {ajaxTitle}";
                            var fileUrl = $"{ajaxSrv}b/{bid}/{Uri.EscapeDataString(fileSlug)}.mp3";

                            string title = null;
                            if (ch.TryGetProperty("title", out var chapterTitleEl))
                                title = chapterTitleEl.GetString();

                            double startTime = 0;
                            if (ch.TryGetProperty("time_from_start", out var startEl))
                            {
                                if (startEl.ValueKind == System.Text.Json.JsonValueKind.Number && startEl.TryGetDouble(out var sv))
                                    startTime = sv;
                                else if (startEl.ValueKind == System.Text.Json.JsonValueKind.String && double.TryParse(startEl.GetString(), out var ss))
                                    startTime = ss;
                            }

                            double endTime = 0;
                            if (ch.TryGetProperty("time_finish", out var endEl))
                            {
                                if (endEl.ValueKind == System.Text.Json.JsonValueKind.Number && endEl.TryGetDouble(out var ev))
                                    endTime = ev;
                                else if (endEl.ValueKind == System.Text.Json.JsonValueKind.String && double.TryParse(endEl.GetString(), out var es))
                                    endTime = es;
                            }

                            items.Add(new AudiobookChapter
                            {
                                fileurl = fileUrl,
                                fileIndex = fileNum - 1,
                                title = SafeName(string.IsNullOrWhiteSpace(title) ? $"Часть {fileNumConv}" : title),
                                startTime = startTime,
                                endTime = endTime
                            });
                        }
                    }
                    finally
                    {
                        nestedDoc?.Dispose();
                    }
                }

                if (
                    !string.IsNullOrWhiteSpace(hlsUrl) &&
                    Uri.TryCreate(hlsUrl, UriKind.Absolute, out _)
                )
                {
                    var totalDuration = items.Select(item => item.endTime).DefaultIfEmpty(0).Max();
                    items.Clear();
                    items.Add(new AudiobookChapter
                    {
                        fileurl = hlsUrl,
                        fileIndex = 0,
                        title = SafeName(string.IsNullOrWhiteSpace(nameValue) ? "Аудиокнига" : nameValue),
                        startTime = 0,
                        endTime = totalDuration
                    });
                }
            }
            catch (Exception ex)
            {
                System.Console.WriteLine("[Akniga AJAX ERROR] " + ex.ToString());
            }

            if (items.Count == 0)
            {
                var chapterNodes = doc.DocumentNode.SelectNodes("//div[contains(@class,'bookpage--chapters')]//div[contains(@class,'chapter__default') and @data-id]");
                if (chapterNodes != null)
                {
                    foreach (var node in chapterNodes)
                    {
                        var posRaw = node.GetAttributeValue("data-pos", "0");
                        double.TryParse(posRaw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var startTime);

                        var titleNode = node.SelectSingleNode(".//div[contains(@class,'chapter__default--title')]");
                        var timeNode = node.SelectSingleNode(".//div[contains(@class,'chapter__default--time')]");

                        items.Add(new AudiobookChapter
                        {
                            fileurl = url,
                            fileIndex = node.GetAttributeValue("data-id", 0),
                            title = SafeName(SafeText(titleNode)),
                            startTime = startTime,
                            endTime = ParseSeconds(SafeText(timeNode))
                        });
                    }
                }
            }

            var book = new Audiobook
            {
                source = Driver,
                author = authorValue,
                name = nameValue,
                seriesName = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'caption__article-main--book')]/a"))),
                numberInSeries = SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'content__main__book--item--series-list')]//a[contains(@class,'current')]/b")).Trim('.'),
                description = SafeText(descriptionNode),
                reader = readerValue,
                duration = SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'link__action--label--time')]")) ??
                           string.Join(" ", doc.DocumentNode.SelectNodes("//span[contains(@class,'book-duration-')]/span")?.Select(SafeText) ?? Enumerable.Empty<string>()).Trim(),
                url = url,
                preview = previewValue
            };

            foreach (var item in items)
                book.items.Add(item);

            return book;
        }

        public override async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var html = await GetStringDirectFirstAsync(url);
            var doc = LoadDocument(html);
            var firstSeries = doc.DocumentNode.SelectSingleNode("//span[contains(@class,'caption__article-main--book')]/a");
            if (firstSeries == null) return new List<Audiobook>();

            var seriesName = SafeName(SafeText(firstSeries));
            var seriesUrl = BuildAbsoluteUrl(SiteUrl, firstSeries.GetAttributeValue("href", string.Empty));
            var books = new List<Audiobook>();

            var firstPage = LoadDocument(await GetStringDirectFirstAsync(seriesUrl));
            var pageUrls = new HashSet<string> { seriesUrl };
            var pageLinks = firstPage.DocumentNode.SelectNodes("//a[contains(@class,'page__nav--standart')]") ?? new HtmlNodeCollection(null);
            foreach (var link in pageLinks)
                pageUrls.Add(BuildAbsoluteUrl(SiteUrl, link.GetAttributeValue("href", string.Empty)));

            foreach (var pageUrl in pageUrls)
            {
                var pageDoc = pageUrl == seriesUrl ? firstPage : LoadDocument(await GetStringDirectFirstAsync(pageUrl));
                var cards = pageDoc.DocumentNode.SelectNodes("//div[contains(@class,'content__main__articles--series-item') and not(.//div[contains(@class,'caption__article-preview')])]") ?? new HtmlNodeCollection(null);
                foreach (var card in cards)
                {
                    var book = ParseAknigaCard(card, seriesName);
                    if (book != null) books.Add(book);
                }
            }

            return books;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 20, int offset = 0)
        {
            var books = new List<Audiobook>();

            if (string.IsNullOrWhiteSpace(query))
            {
                var doc = LoadDocument(await GetStringDirectFirstAsync($"{SiteUrl}/"));
                var cards = (doc.DocumentNode.SelectNodes("//div[contains(@class,'content__main__articles--item') and not(.//div[contains(@class,'caption__article-preview')])]") ?? new HtmlNodeCollection(null)).ToList();

                foreach (var card in cards.Take(limit))
                {
                    var book = ParseAknigaCard(card);
                    if (book != null) books.Add(book);
                }

                return books;
            }

            var page = 1;
            while (books.Count < limit)
            {
                var searchUrl = $"{SiteUrl}/search/books/page{page}/?q={HttpUtility.UrlEncode(query)}";
                var doc = LoadDocument(await GetStringDirectFirstAsync(searchUrl));
                var cards = (doc.DocumentNode.SelectNodes("//div[contains(@class,'content__main__articles--item') and not(.//div[contains(@class,'caption__article-preview')])]") ?? new HtmlNodeCollection(null)).ToList();
                if (!cards.Any()) break;

                if (offset > 0)
                {
                    if (offset >= cards.Count)
                    {
                        offset -= cards.Count;
                        cards.Clear();
                    }
                    else
                    {
                        cards = cards.Skip(offset).ToList();
                        offset = 0;
                    }
                }

                foreach (var card in cards)
                {
                    var book = ParseAknigaCard(card);
                    if (book != null) books.Add(book);
                    if (books.Count >= limit) break;
                }
                page++;
            }

            return books;
        }

        private Audiobook? ParseAknigaCard(HtmlNode card, string seriesFallback = "")
        {
            var link = card.SelectSingleNode(".//div[contains(@class,'article--cover')]/a") ??
                       card.SelectSingleNode(".//a[contains(@class,'content-main__item-title')]") ??
                       card.SelectSingleNode(".//a[@href]");
            var relUrl = SafeAttribute(link, "href");
            if (string.IsNullOrWhiteSpace(relUrl)) return null;

            var img = card.SelectSingleNode(".//div[contains(@class,'article--cover')]/a/img") ?? card.SelectSingleNode(".//img");
            var author = SafeText(card.SelectSingleNode(".//span[contains(@class,'link__action--author')]//svg[.//use[contains(@*[name()='xlink:href'],'author')]]/following-sibling::a[1]"));
            if (string.IsNullOrWhiteSpace(author))
                author = SafeText(card.SelectSingleNode(".//a[contains(@class,'content-main__item-author')]"));
            if (string.IsNullOrWhiteSpace(author))
                author = SafeText(card.SelectSingleNode(".//a[contains(@href,'/author/')]"));
            if (string.IsNullOrWhiteSpace(author)) author = "Неизвестен";

            var name = SafeAttribute(img, "alt");
            if (string.IsNullOrWhiteSpace(name))
            {
                var raw = SafeText(card.SelectSingleNode(".//*[contains(@class,'caption__article-main')]")) ?? SafeText(link);
                name = raw.Replace(author + " - ", string.Empty).Trim();
            }
            name = CleanAknigaCardTitle(name, author);

            var seriesRaw = SafeText(card.SelectSingleNode(".//a[contains(@href,'/series/')]"));
            var series = string.Empty;
            var number = string.Empty;
            var m = Regex.Match(seriesRaw, @"^(?<name>.+?) \((?<number>\d+(?:\.\d+)?)\)$");
            if (m.Success)
            {
                series = m.Groups["name"].Value;
                number = m.Groups["number"].Value;
            }
            else
            {
                series = seriesRaw;
            }
            if (string.IsNullOrWhiteSpace(series))
                series = seriesFallback;
            if (string.IsNullOrWhiteSpace(number))
                number = SafeText(card.SelectSingleNode(".//div[contains(@class,'article--cover')]/span[contains(concat(' ',normalize-space(@class),' '),' number ')]"));

            return new Audiobook
            {
                source = Driver,
                author = SafeName(author),
                name = SafeName(name),
                seriesName = SafeName(series),
                numberInSeries = number,
                reader = SafeName(SafeText(card.SelectSingleNode(".//a[contains(@href,'/performer/')]"))),
                duration = SafeText(card.SelectSingleNode(".//span[contains(@class,'link__action--label--time')]")),
                url = BuildAbsoluteUrl(SiteUrl, relUrl),
                preview = NormalizeImage(SafeAttribute(img, "src")),
            };
        }

        private static string CleanAknigaCardTitle(string value, string author)
        {
            var title = SafeName(value);
            var cleanAuthor = SafeName(author);
            if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(cleanAuthor))
                return title;

            title = Regex.Replace(
                title,
                @"^\s*" + Regex.Escape(cleanAuthor) + @"\s*[-\u2013\u2014:]\s*",
                string.Empty,
                RegexOptions.IgnoreCase
            ).Trim();
            return string.IsNullOrWhiteSpace(title) ? SafeName(value) : SafeName(title);
        }
    }

    public sealed class IzibModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://izib.uk";
        public override string Driver => "izib";

        public IzibModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override string NormalizeImage(string? url) => BuildAbsoluteUrl(SiteUrl, url ?? "");

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var html = await GetStringWithFallbackAsync(url);
            var doc = LoadDocument(html);

            var playerMatch = Regex.Match(html, @"var player = new XSPlayer\(((\s*.*?)+?)\);");
            if (!playerMatch.Success) return null;
            var player = JsonNode.Parse(playerMatch.Groups[1].Value)?.AsObject();
            if (player == null) return null;

            var mp3Prefix = player["mp3_url_prefix"]?.GetValue<string>() ?? string.Empty;
            var host = string.IsNullOrWhiteSpace(mp3Prefix) ? string.Empty : $"https://{mp3Prefix.Trim('/')}";

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//span//a[starts-with(@href,'/author')]"));
            if (string.IsNullOrWhiteSpace(author)) author = "Неизвестен";

            var book = new Audiobook
            {
                source = Driver,
                name = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//span[@itemprop='name']"))),
                author = SafeName(author),
                seriesName = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//a[starts-with(@href,'/serie')]"))),
                numberInSeries = SafeText(doc.DocumentNode.SelectSingleNode("//div[.//a[starts-with(@href,'/serie')]]//div[.//strong]//span")).Trim().TrimEnd('.'),
                description = SafeText(doc.DocumentNode.SelectSingleNode("//div[@itemprop='description']")),
                reader = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//div[.//span[@itemprop='author']]//a[starts-with(@href,'/reader')]"))),
                duration = SafeText(doc.DocumentNode.SelectSingleNode("//div[.//span[@itemprop='author']]/div[last()]")).Replace("Время: ", string.Empty).Trim(),
                url = url,
                preview = NormalizeImage(SafeAttribute(doc.DocumentNode.SelectSingleNode("//img"), "src")),
            };

            var tracks = player["tracks"]?.AsArray();
            if (tracks != null)
            {
                int idx = 0;
                foreach (var t in tracks)
                {
                    var arr = t?.AsArray();
                    if (arr == null || arr.Count < 5) continue;
                    var path = arr[4]?.GetValue<string>() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(path)) continue;

                    book.items.Add(new AudiobookChapter
                    {
                        fileurl = string.IsNullOrEmpty(host) ? path : $"{host}/{path.TrimStart('/')}",
                        fileIndex = idx++,
                        title = SafeName(arr[1]?.GetValue<string>()),
                        startTime = 0,
                        endTime = arr[2]?.GetValue<double?>() ?? 0
                    });
                }
            }

            return book;
        }

        public override async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var html = await GetStringWithFallbackAsync(url);
            var doc = LoadDocument(html);

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//a[starts-with(@href,'/author')]"));
            if (string.IsNullOrWhiteSpace(author)) author = "Неизвестен";

            var seriesLink = doc.DocumentNode.SelectSingleNode("//a[starts-with(@href,'/serie')]");
            if (seriesLink == null) return new List<Audiobook>();

            var seriesName = SafeText(seriesLink);
            var seriesUrl = BuildAbsoluteUrl(SiteUrl, seriesLink.GetAttributeValue("href", string.Empty));
            var seriesDoc = LoadDocument(await GetStringWithFallbackAsync(seriesUrl));

            var books = new List<Audiobook>();
            var cards = seriesDoc.DocumentNode.SelectNodes("//*[@id='books_list']/div[not(.//a[starts-with(@href,'/book')]/following-sibling::span)]") ?? new HtmlNodeCollection(null);
            foreach (var card in cards)
            {
                var b = ParseIzibCard(card, author, seriesName);
                if (b != null) books.Add(b);
            }
            return books;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 20, int offset = 0)
        {
            var books = new List<Audiobook>();

            if (string.IsNullOrWhiteSpace(query))
            {
                var doc = LoadDocument(await GetStringWithFallbackAsync(SiteUrl));
                var cards = (doc.DocumentNode.SelectNodes("//*[@id='books_list']/div/div[not(.//a[starts-with(@href,'/art')]/following-sibling::span)]") ?? new HtmlNodeCollection(null)).ToList();

                foreach (var card in cards.Take(limit))
                {
                    var b = ParseIzibCard(card, "Неизвестен", string.Empty);
                    if (b != null) books.Add(b);
                }

                return books;
            }

            var page = 1;
            while (books.Count < limit)
            {
                var searchUrl = $"{SiteUrl}/search?q={HttpUtility.UrlEncode(query)}&p={page}";
                var doc = LoadDocument(await GetStringWithFallbackAsync(searchUrl));
                var hasResults = doc.DocumentNode.SelectSingleNode("//*[@id='books_list']/div//a[starts-with(@href,'/art')]") != null;
                if (!hasResults) break;

                var cards = (doc.DocumentNode.SelectNodes("//*[@id='books_list']/div/div[not(.//a[starts-with(@href,'/art')]/following-sibling::span)]") ?? new HtmlNodeCollection(null)).ToList();
                if (!cards.Any()) break;

                if (offset > 0)
                {
                    if (offset >= cards.Count)
                    {
                        offset -= cards.Count;
                        cards.Clear();
                    }
                    else
                    {
                        cards = cards.Skip(offset).ToList();
                        offset = 0;
                    }
                }

                foreach (var card in cards)
                {
                    var b = ParseIzibCard(card, "Неизвестен", string.Empty);
                    if (b != null) books.Add(b);
                    if (books.Count >= limit) break;
                }

                page++;
            }

            return books;
        }

        private Audiobook? ParseIzibCard(HtmlNode card, string authorFallback, string seriesFallback)
        {
            var link = card.SelectSingleNode(".//div/a[starts-with(@href,'/art') and not(img)]");
            var relUrl = SafeAttribute(link, "href");
            if (string.IsNullOrWhiteSpace(relUrl)) return null;

            var numberRaw = SafeText(card.SelectSingleNode(".//div"));
            var number = Regex.IsMatch(numberRaw.Trim(), "^#\\d+$") ? numberRaw.Trim().TrimStart('#') : string.Empty;

            var author = SafeText(card.SelectSingleNode(".//a[starts-with(@href,'/author')]"));
            if (string.IsNullOrWhiteSpace(author)) author = authorFallback;
            var series = SafeText(card.SelectSingleNode(".//a[starts-with(@href,'/serie')]"));
            if (string.IsNullOrWhiteSpace(series)) series = seriesFallback;

            return new Audiobook
            {
                source = Driver,
                author = SafeName(author),
                name = SafeName(SafeText(link)),
                seriesName = SafeName(series),
                numberInSeries = number,
                reader = SafeName(SafeText(card.SelectSingleNode(".//a[starts-with(@href,'/reader')]"))),
                url = BuildAbsoluteUrl(SiteUrl, relUrl),
                preview = NormalizeImage(SafeAttribute(card.SelectSingleNode(".//img"), "src")),
            };
        }
    }

    public sealed class YaKnigaModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://yakniga.org";
        private const string ApiUrl = "https://yakniga.org/graphql";
        public override string Driver => "yakniga";

        public YaKnigaModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override string NormalizeImage(string? url) => BuildAbsoluteUrl(SiteUrl, url ?? "");

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var data = await GetBookDataAsync(url);
            if (data == null) return null;

            var book = ParseYaknigaData(data, false);
            if (book == null) return null;

            var chapters = data["chapters"]?["collection"]?.AsArray();
            if (chapters != null)
            {
                int idx = 0;
                foreach (var chapter in chapters)
                {
                    var file = chapter?["fileUrl"]?.GetValue<string>() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(file)) continue;
                    book.items.Add(new AudiobookChapter
                    {
                        fileurl = BuildAbsoluteUrl(SiteUrl, file),
                        fileIndex = idx++,
                        title = SafeName(chapter?["name"]?.GetValue<string>()),
                        startTime = 0,
                        endTime = chapter?["duration"]?.GetValue<double?>() ?? 0
                    });
                }
            }

            return book;
        }

        public override async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var data = await GetBookDataAsync(url);
            var series = data?["seriesName"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(series)) return new List<Audiobook>();

            var payload = new JsonObject
            {
                ["operationName"] = "bookCollection",
                ["variables"] = new JsonObject
                {
                    ["query"] = new JsonObject { ["by_series"] = series },
                    ["page"] = 1,
                    ["perPage"] = 100
                },
                ["query"] = @"query bookCollection($query: JSON, $perPage: Int, $page: Int) {
                    books(query: $query, perPage: $perPage, page: $page) {
                        collection {
                            title authorName readers { name } seriesName seriesNum duration cover description authorAlias aliasName isBiblio
                        }
                    }
                }"
            };

            var res = await PostJsonAsync(payload);
            var collection = res?["data"]?["books"]?["collection"]?.AsArray();
            if (collection == null) return new List<Audiobook>();

            var books = new List<Audiobook>();
            foreach (var item in collection)
            {
                var book = ParseYaknigaData(item as JsonObject, true);
                if (book != null) books.Add(book);
            }
            return books;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 20, int offset = 0)
        {
            if (string.IsNullOrWhiteSpace(query))
                return new List<Audiobook>();

            var payload = new JsonObject
            {
                ["operationName"] = null,
                ["variables"] = new JsonObject { ["term"] = query },
                ["query"] = @"query ($term: String!) {
                    search(autocomplete: true, term: $term) {
                        ... on Book {
                            title authorName readers { name } seriesName seriesNum duration cover description authorAlias aliasName isBiblio
                        }
                    }
                }"
            };

            var res = await PostJsonAsync(payload);
            var data = res?["data"]?["search"]?.AsArray();
            if (data == null) return new List<Audiobook>();

            var clean = data.Where(x => x is JsonObject).Cast<JsonObject>().Skip(offset);
            var books = new List<Audiobook>();
            foreach (var card in clean)
            {
                var book = ParseYaknigaData(card, true);
                if (book != null) books.Add(book);
                if (books.Count >= limit) break;
            }
            return books;
        }

        private async Task<JsonObject?> GetBookDataAsync(string url)
        {
            var parts = url.TrimEnd('/').Split('/');
            if (parts.Length < 2) return null;
            var authorAlias = parts[^2];
            var bookAlias = parts[^1];

            var payload = new JsonObject
            {
                ["operationName"] = "getBook",
                ["variables"] = new JsonObject
                {
                    ["bookAlias"] = bookAlias,
                    ["authorAliasName"] = authorAlias
                },
                ["query"] = @"query getBook($bookAlias: String, $authorAliasName: String) {
                    book(aliasName: $bookAlias, authorAliasName: $authorAliasName) {
                        title authorName readers { name } seriesName seriesNum duration cover description authorAlias aliasName isBiblio
                        chapters { collection { name duration fileUrl } }
                    }
                }"
            };

            var res = await PostJsonAsync(payload);
            return res?["data"]?["book"] as JsonObject;
        }

        private async Task<JsonObject?> PostJsonAsync(JsonObject payload)
        {
            using var req = new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json");
            var response = await HttpClient.PostAsync(ApiUrl, req);
            if (!response.IsSuccessStatusCode) return null;
            var content = await response.Content.ReadAsStringAsync();
            return JsonNode.Parse(content)?.AsObject();
        }

        private Audiobook? ParseYaknigaData(JsonObject? data, bool suppressExceptions)
        {
            try
            {
                if (data == null) return null;
                if (data["isBiblio"]?.GetValue<bool?>() == true) return null;

                var authorAlias = data["authorAlias"]?.GetValue<string>() ?? string.Empty;
                var alias = data["aliasName"]?.GetValue<string>() ?? string.Empty;
                var url = string.IsNullOrEmpty(authorAlias) || string.IsNullOrEmpty(alias)
                    ? string.Empty
                    : BuildAbsoluteUrl(SiteUrl, $"/{authorAlias}/{alias}");

                var seriesNum = data["seriesNum"]?.GetValue<string>() ?? string.Empty;
                if (double.TryParse(seriesNum, out var parsed) && Math.Abs(parsed - Math.Truncate(parsed)) < 0.001)
                    seriesNum = Math.Truncate(parsed).ToString();

                var description = data["description"]?.GetValue<string>() ?? string.Empty;
                description = Regex.Replace(description, @"<p>(.+?)</p>", "$1");

                var cover = data["cover"]?.GetValue<string>() ?? string.Empty;

                return new Audiobook
                {
                    source = Driver,
                    author = SafeName(data["authorName"]?.GetValue<string>() ?? "Неизвестен"),
                    name = SafeName(data["title"]?.GetValue<string>()),
                    seriesName = SafeName(data["seriesName"]?.GetValue<string>()),
                    numberInSeries = seriesNum,
                    description = description,
                    reader = SafeName(data["readers"]?.AsArray().FirstOrDefault()?["name"]?.GetValue<string>()),
                    duration = SecondsToClock(data["duration"]?.GetValue<long?>()),
                    url = url,
                    preview = string.IsNullOrWhiteSpace(cover) ? string.Empty : BuildAbsoluteUrl(SiteUrl, cover),
                };
            }
            catch
            {
                if (!suppressExceptions) throw;
                return null;
            }
        }
    }

    public sealed class LibrivoxModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://archive.org";
        private const string Collection = "librivoxaudio";
        private const string SelectedFormat = "128Kbps MP3";
        public override string Driver => "librivoxaudio";

        public LibrivoxModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override string NormalizeImage(string? url) => url ?? "";

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var identifier = url.Trim('/').Split('/').LastOrDefault();
            if (string.IsNullOrWhiteSpace(identifier)) return null;

            var json = await GetStringWithFallbackAsync($"{SiteUrl}/metadata/{identifier}");
            var root = JsonNode.Parse(json)?.AsObject();
            var metadata = root?["metadata"]?.AsObject();
            var files = root?["files"]?.AsArray();
            if (metadata == null || files == null) return null;

            var authorNode = metadata["creator"];
            var author = authorNode is JsonArray arr ? arr.FirstOrDefault()?.GetValue<string>() : authorNode?.GetValue<string>() ?? "Неизвестен";
            var title = metadata["title"]?.GetValue<string>() ?? string.Empty;
            var runtime = metadata["runtime"]?.GetValue<string>() ?? string.Empty;
            var description = StripHtml(metadata["description"]?.GetValue<string>() ?? string.Empty);

            var coverFile = files.FirstOrDefault(f => f?["format"]?.GetValue<string>() == "JPEG")?["name"]?.GetValue<string>();
            var preview = string.IsNullOrWhiteSpace(coverFile) ? string.Empty : $"{SiteUrl}/download/{identifier}/{coverFile}";

            var book = new Audiobook
            {
                source = Driver,
                author = SafeName(author),
                name = SafeName(title),
                description = description,
                duration = runtime,
                url = url,
                preview = preview,
            };

            var tracks = files.Where(f => f?["format"]?.GetValue<string>() == SelectedFormat).ToList();
            int idx = 0;
            foreach (var track in tracks)
            {
                var fileName = track?["name"]?.GetValue<string>() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(fileName)) continue;

                book.items.Add(new AudiobookChapter
                {
                    fileurl = $"{SiteUrl}/download/{identifier}/{fileName}",
                    fileIndex = ++idx,
                    title = SafeName(track?["title"]?.GetValue<string>()),
                    startTime = 0,
                    endTime = Math.Floor(track?["length"]?.GetValue<double?>() ?? 0)
                });
            }

            return book;
        }

        public override Task<List<Audiobook>> GetSeriesAsync(string url) => Task.FromResult(new List<Audiobook>());

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 20, int offset = 0)
        {
            if (string.IsNullOrWhiteSpace(query))
                return new List<Audiobook>();

            var books = new List<Audiobook>();
            var page = 1;

            while (books.Count < limit)
            {
                var searchUrl =
                    $"{SiteUrl}/advancedsearch.php?q=title:({HttpUtility.UrlEncode(query.ToLower())})+AND+collection:%22{Collection}%22" +
                    $"&fl[]=creator&fl[]=identifier&fl[]=title&rows={limit}&page={page}&output=json";

                var json = await GetStringWithFallbackAsync(searchUrl);
                var hits = JsonNode.Parse(json)?["response"]?["docs"]?.AsArray();
                if (hits == null || hits.Count == 0) break;

                var docs = hits.ToList();
                if (offset > 0)
                {
                    if (offset >= docs.Count)
                    {
                        offset -= docs.Count;
                        docs.Clear();
                    }
                    else
                    {
                        docs = docs.Skip(offset).ToList();
                        offset = 0;
                    }
                }

                foreach (var hit in docs)
                {
                    var id = hit?["identifier"]?.GetValue<string>();
                    if (string.IsNullOrWhiteSpace(id)) continue;
                    books.Add(new Audiobook
                    {
                        source = Driver,
                        author = SafeName(hit?["creator"]?.GetValue<string>() ?? "Неизвестен"),
                        name = SafeName(hit?["title"]?.GetValue<string>()),
                        url = $"{SiteUrl}/details/{id}",
                        preview = $"{SiteUrl}/services/img/{id}",
                    });
                    if (books.Count >= limit) break;
                }

                page++;
            }

            return books;
        }

        private static string StripHtml(string html)
        {
            if (string.IsNullOrWhiteSpace(html)) return string.Empty;
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return HttpUtility.HtmlDecode(doc.DocumentNode.InnerText.Trim());
        }
    }

    public enum AudioBookHeadersProfile
    {
        DefaultBrowser,
        IziMp3,
        BazaMp3,
        SlushatMp3,
        PoleknigMp3,
        Slushkinvsem,
        Audioboo,
        AudioknigiPro,
        AudioknigaOne,
        PdaIzibuk,
        KnigiAudioMe
    }

    public sealed class AudioFdbPerson
    {
        public string id { get; set; } = string.Empty;
        public string display_name { get; set; } = string.Empty;
        public string kind { get; set; } = string.Empty;
        public string source_provider { get; set; } = string.Empty;
        public string source_external_id { get; set; } = string.Empty;
        public int works_count { get; set; }
    }

    public sealed class AudioFdbGenre
    {
        public string id { get; set; } = string.Empty;
        public string title { get; set; } = string.Empty;
        public string source_provider { get; set; } = string.Empty;
        public string source_external_id { get; set; } = string.Empty;
        public int works_count { get; set; }
    }

    public sealed class AudioFdbSeries
    {
        public string id { get; set; } = string.Empty;
        public string title { get; set; } = string.Empty;
        public string source_provider { get; set; } = string.Empty;
        public string source_external_id { get; set; } = string.Empty;
        public int works_count { get; set; }
    }

    public sealed class AudioFdbChapter
    {
        public string id { get; set; } = string.Empty;
        public int chapter_index { get; set; }
        public string title { get; set; } = string.Empty;
        public long duration_seconds { get; set; }
        public string audio_url { get; set; } = string.Empty;
        public string proxy_url { get; set; } = string.Empty;
    }

    public sealed class AudioFdbSource
    {
        public string id { get; set; } = string.Empty;
        public string edition_id { get; set; } = string.Empty;
        public string provider { get; set; } = string.Empty;
        public string external_id { get; set; } = string.Empty;
        public string page_url { get; set; } = string.Empty;
        public string status { get; set; } = "unknown";
        public List<AudioFdbChapter> chapters { get; } = new();
    }

    public sealed class AudioFdbEdition
    {
        public string id { get; set; } = string.Empty;
        public string work_id { get; set; } = string.Empty;
        public string edition_type { get; set; } = "audiobook";
        public long duration_seconds { get; set; }
        public int chapter_count { get; set; }
        public string chapter_fingerprint { get; set; } = string.Empty;
        public double quality_score { get; set; }
        public List<AudioFdbPerson> narrators { get; } = new();
        public List<AudioFdbSource> sources { get; } = new();
    }

    public sealed class AudioFdbWork
    {
        public string id { get; set; } = string.Empty;
        public string title { get; set; } = string.Empty;
        public string normalized_title { get; set; } = string.Empty;
        public string description { get; set; } = string.Empty;
        public string poster_url { get; set; } = string.Empty;
        public List<AudioFdbPerson> authors { get; } = new();
        public List<AudioFdbGenre> genres { get; } = new();
        public AudioFdbSeries? series { get; set; }
        public List<AudioFdbEdition> editions { get; } = new();
    }

    public sealed class AudioProviderContract
    {
        public string id { get; init; } = string.Empty;
        public string root { get; init; } = string.Empty;
        public string search { get; init; } = string.Empty;
        public string list_selectors { get; init; } = string.Empty;
        public string detail_selectors { get; init; } = string.Empty;
        public AudioBookHeadersProfile headers { get; init; }
        public bool enabled { get; init; }
        public string egress { get; init; } = "direct";
    }

    public sealed class AudioProviderCheckResult
    {
        public string provider { get; set; } = string.Empty;
        public string egress { get; set; } = "direct";
        public string url { get; set; } = string.Empty;
        public int http_status { get; set; }
        public bool cloudflare { get; set; }
        public bool blocked { get; set; }
        public long elapsed_ms { get; set; }
        public string? ip_seen_by_remote { get; set; }
        public string? error { get; set; }
    }

    public static class AudioBookProviderCatalog
    {
        public static readonly IReadOnlyDictionary<string, AudioProviderContract> Providers = new Dictionary<string, AudioProviderContract>(StringComparer.OrdinalIgnoreCase)
        {
            ["izibuk_graphql"] = new AudioProviderContract { id = "izibuk_graphql", root = "https://api.izib.uk/graphql/", search = "GET booksSearch(offset,count,q) + ru_audioknigi_app=1", list_selectors = "GraphQL JSON", detail_selectors = "book(id){authors,readers,genre,serie,files.full/files.mobile}", headers = AudioBookHeadersProfile.IziMp3, enabled = true },
            ["pda_izibuk_html"] = new AudioProviderContract { id = "pda_izibuk_html", root = "https://pda.izib.uk", search = "GET /search?q=<query>", list_selectors = "div[id~=^book[0-9]*$], div._ccb9b7, div._cb0a41, div._3dc935 > a", detail_selectors = "mp3_url_prefix, [itemprop=description], script var player", headers = AudioBookHeadersProfile.PdaIzibuk, enabled = true },
            ["archive_org"] = new AudioProviderContract { id = "archive_org", root = "https://archive.org", search = "GET advancedsearch.php output=json", list_selectors = "JSON description, identifier, mediatype, title", detail_selectors = "metadata files, div[itemprop=hasPart], meta[itemprop=name/duration]", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["akniga"] = new AudioProviderContract { id = "akniga", root = "https://akniga.org", search = "legacy parser search", list_selectors = "legacy AknigaModule", detail_selectors = "legacy AknigaModule playlist", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["knigavuhe"] = new AudioProviderContract { id = "knigavuhe", root = "https://knigavuhe.org", search = "legacy parser search", list_selectors = "legacy KnigaVuheModule", detail_selectors = "legacy KnigaVuheModule playlist", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["yakniga"] = new AudioProviderContract { id = "yakniga", root = "https://yakniga.org", search = "legacy parser search", list_selectors = "legacy YaKnigaModule", detail_selectors = "legacy YaKnigaModule playlist", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["audioboo_org"] = new AudioProviderContract { id = "audioboo_org", root = "https://audioboo.org", search = "DLE POST /index.php?do=search", list_selectors = "article.card, a.card__img, h2.card__title", detail_selectors = "header.page__header, div.page__text, script var player", headers = AudioBookHeadersProfile.Audioboo, enabled = true },
            ["poleknig_com"] = new AudioProviderContract { id = "poleknig_com", root = "https://poleknig.com", search = "GET /?q=<query>&p=<page>", list_selectors = "div.media containing a.book-title, img.cover", detail_selectors = "script var player, div.row.book-reader, div.description", headers = AudioBookHeadersProfile.PoleknigMp3, enabled = true },
            ["otrub_in"] = new AudioProviderContract { id = "otrub_in", root = "https://otrub.in", search = "GET /search.html?q=<query>&p=<page>", list_selectors = "div._8a09a3, div._dad4fa, a._3dc935", detail_selectors = "[itemprop=description/name], script var player", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["slushat_knigi_com"] = new AudioProviderContract { id = "slushat_knigi_com", root = "https://slushat-knigi.com", search = "DLE POST /index.php?do=search", list_selectors = "div.sect__content, a.poster-item", detail_selectors = "header.page__header, script var player file:.txt", headers = AudioBookHeadersProfile.SlushatMp3, enabled = true },
            ["slushkinvsem_ru"] = new AudioProviderContract { id = "slushkinvsem_ru", root = "https://slushkinvsem.ru", search = "DLE POST /index.php?do=search with Beget cookie", list_selectors = "span.navigation, div.thumb-in, a.thumb-caption", detail_selectors = "div.dleaudioplayer li[data-title,data-url], strDecode", headers = AudioBookHeadersProfile.Slushkinvsem, enabled = true },
            ["audioknigi_pro"] = new AudioProviderContract { id = "audioknigi_pro", root = "https://audioknigi.pro", search = "DLE POST /index.php?do=search", list_selectors = "div#pages-load, div.short.short-nm, a.name-kniga", detail_selectors = "div.dleaudioplayer li[data-title,data-url], script var player", headers = AudioBookHeadersProfile.AudioknigiPro, enabled = true },
            ["audioknigivse_ru"] = new AudioProviderContract { id = "audioknigivse_ru", root = "https://audioknigivse.ru", search = "DLE POST /index.php?do=search", list_selectors = "a.sres-wrap, div.short-item, a.short-link", detail_selectors = "div.dleaudioplayer > ul li, div.dleplyrplayer audio[src]", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["aume_ru"] = new AudioProviderContract { id = "aume_ru", root = "https://aume.ru", search = "Yandex site search searchid=2529512", list_selectors = "div.b-serp-item__content, a.b-serp-item__title-link", detail_selectors = "iframe /embed/ -> /details/, archive-like parts", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["knigoblud_club"] = new AudioProviderContract { id = "knigoblud_club", root = "https://www.knigoblud.club", search = "GET /search?q=<query>&page=<page>", list_selectors = "div.bookListItem, div#BL", detail_selectors = "script KB.playerInit, playlist/src/duration", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["baza_knig_rip"] = new AudioProviderContract { id = "baza_knig_rip", root = "https://baza-knig.top", search = "DLE POST /index.php?do=search", list_selectors = "div.short, div.short-img, div.short-title", detail_selectors = "script var player, strDecode, /engine/go.php?url=", headers = AudioBookHeadersProfile.BazaMp3, enabled = true },
            ["uknig_com"] = new AudioProviderContract { id = "uknig_com", root = "https://uknig.com", search = "GET /?q=<query>&p=<page>", list_selectors = "div.col-xs-12 containing a.book-title, img.cover", detail_selectors = "script var player, file:, div.row.book-duration", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["mp3knig_net"] = new AudioProviderContract { id = "mp3knig_net", root = "https://mp3knig.net", search = "all-server selector article.movie-box > a", list_selectors = "article.movie-box > a, div.img > img", detail_selectors = "script var player, div.info > div.film", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = false },
            ["audiokniga_one"] = new AudioProviderContract { id = "audiokniga_one", root = "https://audiokniga.one", search = "DLE POST /index.php?do=search", list_selectors = "div.short-item, a.short-title, img.xfieldimage", detail_selectors = "script playerInit, fields url,duration,title", headers = AudioBookHeadersProfile.AudioknigaOne, enabled = true },
            ["listenbook_ru"] = new AudioProviderContract { id = "listenbook_ru", root = "https://listenbook.ru", search = "DLE POST /index.php?do=search", list_selectors = "div.main-news, div.main-news-title", detail_selectors = "div.dleplyrplayer audio[src], source/title/url", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = false, egress = "ru" },
            ["lis10book_com"] = new AudioProviderContract { id = "lis10book_com", root = "https://lis10book.com", search = "GET /audio/?_post_type_search_box= ; POST /wp-json/", list_selectors = "div.col-6, /audio/ links", detail_selectors = "playlist txt, fields file,title", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["m_knigavuhe_org"] = new AudioProviderContract { id = "m_knigavuhe_org", root = "https://m.knigavuhe.org", search = "detail/parser only", list_selectors = "", detail_selectors = "script var player, [itemprop=description], div.book_title", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["audiopolka_club"] = new AudioProviderContract { id = "audiopolka_club", root = "https://audiopolka.club", search = "GET /search/?q=<query>", list_selectors = "div.book-list-item, a.book-list-item-cover", detail_selectors = "playlist, script KB.playerInit, div.book-page-title", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["author_today"] = new AudioProviderContract { id = "author_today", root = "https://author.today", search = "auxiliary metadata search", list_selectors = "work and series search results", detail_selectors = "metadata only; no audio playlist", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true },
            ["fantlab_ru"] = new AudioProviderContract { id = "fantlab_ru", root = "https://fantlab.ru", search = "auxiliary metadata searchmain", list_selectors = "search results and work cards", detail_selectors = "metadata only; no audio playlist", headers = AudioBookHeadersProfile.DefaultBrowser, enabled = true }
        };
    }

    public sealed class AudioFdbStore
    {
        private static readonly object Sync = new();
        private static readonly object WriteSync = new();
        private bool _initialized;
        private readonly string _dbPath;

        public AudioFdbStore(string? dbPath = null)
        {
            _dbPath = dbPath ?? Environment.GetEnvironmentVariable("AUDIOBOOK_DB") ??
                Path.Combine(AppContext.BaseDirectory, "data", "audiobooks-fdb.sqlite");
        }

        private SqliteConnection Open()
        {
            EnsureSchema();
            var connection = new SqliteConnection($"Data Source={_dbPath};Default Timeout=5");
            connection.Open();
            return connection;
        }

        public void EnsureSchema()
        {
            if (_initialized) return;

            lock (Sync)
            {
                if (_initialized) return;

                try { SQLitePCL.Batteries_V2.Init(); } catch { }

                var dir = Path.GetDirectoryName(_dbPath);
                if (!string.IsNullOrWhiteSpace(dir))
                    Directory.CreateDirectory(dir);

                using var connection = new SqliteConnection($"Data Source={_dbPath};Default Timeout=5");
                connection.Open();
                Exec(connection, null, "PRAGMA journal_mode=WAL");
                using var command = connection.CreateCommand();
                command.CommandText = @"
CREATE TABLE IF NOT EXISTS persons (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, normalized_name TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS person_aliases (id TEXT PRIMARY KEY, person_id TEXT NOT NULL, alias TEXT NOT NULL, normalized_alias TEXT NOT NULL, source_provider TEXT, confidence REAL NOT NULL DEFAULT 1.0);
CREATE TABLE IF NOT EXISTS genres (id TEXT PRIMARY KEY, title TEXT NOT NULL, normalized_title TEXT NOT NULL, parent_id TEXT NULL, source_provider TEXT, source_external_id TEXT);
CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY, title TEXT NOT NULL, normalized_title TEXT NOT NULL, source_provider TEXT, source_external_id TEXT);
CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY, title TEXT NOT NULL, normalized_title TEXT NOT NULL, description TEXT, poster_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS work_authors (work_id TEXT NOT NULL, person_id TEXT NOT NULL, PRIMARY KEY (work_id, person_id));
CREATE TABLE IF NOT EXISTS work_genres (work_id TEXT NOT NULL, genre_id TEXT NOT NULL, PRIMARY KEY (work_id, genre_id));
CREATE TABLE IF NOT EXISTS work_series (work_id TEXT NOT NULL, series_id TEXT NOT NULL, PRIMARY KEY (work_id, series_id));
CREATE TABLE IF NOT EXISTS editions (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, edition_type TEXT NOT NULL, duration_seconds INTEGER, chapter_count INTEGER, chapter_fingerprint TEXT, quality_score REAL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS edition_narrators (edition_id TEXT NOT NULL, person_id TEXT NOT NULL, PRIMARY KEY (edition_id, person_id));
CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, edition_id TEXT NOT NULL, provider TEXT NOT NULL, external_id TEXT, page_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unknown', last_checked_at TEXT, last_success_at TEXT, fail_count INTEGER DEFAULT 0, last_error TEXT);
CREATE TABLE IF NOT EXISTS chapters (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, chapter_index INTEGER NOT NULL, title TEXT, duration_seconds INTEGER, audio_url TEXT, audio_url_hash TEXT, audio_url_checked_at TEXT, UNIQUE(source_id, chapter_index));
CREATE TABLE IF NOT EXISTS duplicate_candidates (id TEXT PRIMARY KEY, left_edition_id TEXT NOT NULL, right_edition_id TEXT NOT NULL, confidence REAL NOT NULL, reason TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS crawler_runs (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, query TEXT NOT NULL, offset INTEGER NOT NULL, providers INTEGER NOT NULL, parallelism INTEGER NOT NULL, works INTEGER NOT NULL, error TEXT);
CREATE TABLE IF NOT EXISTS cover_lookup_cache (work_id TEXT PRIMARY KEY, lookup_key TEXT NOT NULL, provider TEXT, cover_url TEXT, status TEXT NOT NULL, attempted_at TEXT NOT NULL, next_retry_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audio_editions_work ON editions(work_id);
CREATE INDEX IF NOT EXISTS idx_audio_sources_edition ON sources(edition_id);
CREATE INDEX IF NOT EXISTS idx_audio_chapters_source ON chapters(source_id);
CREATE INDEX IF NOT EXISTS idx_audio_work_authors_work ON work_authors(work_id);
CREATE INDEX IF NOT EXISTS idx_audio_work_genres_work ON work_genres(work_id);
CREATE INDEX IF NOT EXISTS idx_audio_work_series_work ON work_series(work_id);
CREATE INDEX IF NOT EXISTS idx_audio_edition_narrators_edition ON edition_narrators(edition_id);
CREATE INDEX IF NOT EXISTS idx_audio_works_updated ON works(updated_at);
CREATE INDEX IF NOT EXISTS idx_audio_works_created ON works(created_at);
CREATE INDEX IF NOT EXISTS idx_audio_crawler_runs_finished ON crawler_runs(finished_at);
CREATE INDEX IF NOT EXISTS idx_audio_cover_lookup_retry ON cover_lookup_cache(status,next_retry_at);
";
                command.ExecuteNonQuery();

                try
                {
                    using var fts = connection.CreateCommand();
                    fts.CommandText = "CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(work_id, title, authors, narrators, genres, series, tokenize = 'unicode61 remove_diacritics 2')";
                    fts.ExecuteNonQuery();
                }
                catch
                {
                }

                _initialized = true;
            }
        }

        public void UpsertWork(AudioFdbWork work)
        {
            if (string.IsNullOrWhiteSpace(work.id)) return;
            lock (WriteSync)
            {
            using var connection = Open();
            using var tx = connection.BeginTransaction();
            var now = DateTimeOffset.UtcNow.ToString("O");

            Exec(connection, tx, "INSERT INTO works(id,title,normalized_title,description,poster_url,created_at,updated_at) VALUES($id,$title,$normalized,$description,$poster,$now,$now) ON CONFLICT(id) DO UPDATE SET title=CASE WHEN IFNULL($title,'')<>'' THEN $title ELSE title END,normalized_title=CASE WHEN IFNULL($title,'')<>'' THEN $normalized ELSE normalized_title END,description=CASE WHEN LENGTH(IFNULL($description,''))>LENGTH(IFNULL(description,'')) THEN $description ELSE description END,poster_url=CASE WHEN IFNULL($poster,'')<>'' THEN $poster ELSE poster_url END,updated_at=$now",
                ("$id", work.id), ("$title", work.title), ("$normalized", Normalize(work.title)), ("$description", work.description), ("$poster", work.poster_url), ("$now", now));

            foreach (var person in work.authors)
            {
                UpsertPerson(connection, tx, person, now);
                Exec(connection, tx, "INSERT OR IGNORE INTO work_authors(work_id,person_id) VALUES($work,$person)", ("$work", work.id), ("$person", person.id));
            }

            foreach (var genre in work.genres)
            {
                Exec(connection, tx, "INSERT INTO genres(id,title,normalized_title,source_provider,source_external_id) VALUES($id,$title,$normalized,$provider,$external) ON CONFLICT(id) DO UPDATE SET title=$title,normalized_title=$normalized,source_provider=$provider,source_external_id=$external",
                    ("$id", genre.id), ("$title", genre.title), ("$normalized", Normalize(genre.title)), ("$provider", genre.source_provider), ("$external", genre.source_external_id));
                Exec(connection, tx, "INSERT OR IGNORE INTO work_genres(work_id,genre_id) VALUES($work,$genre)", ("$work", work.id), ("$genre", genre.id));
            }

            if (work.series != null && !string.IsNullOrWhiteSpace(work.series.id))
            {
                Exec(connection, tx, "DELETE FROM work_series WHERE work_id=$work", ("$work", work.id));
                if (IsUsableSeriesTitle(work.series.title))
                {
                    Exec(connection, tx, "INSERT INTO series(id,title,normalized_title,source_provider,source_external_id) VALUES($id,$title,$normalized,$provider,$external) ON CONFLICT(id) DO UPDATE SET title=$title,normalized_title=$normalized,source_provider=$provider,source_external_id=$external",
                        ("$id", work.series.id), ("$title", work.series.title), ("$normalized", Normalize(work.series.title)), ("$provider", work.series.source_provider), ("$external", work.series.source_external_id));
                    Exec(connection, tx, "INSERT OR IGNORE INTO work_series(work_id,series_id) VALUES($work,$series)", ("$work", work.id), ("$series", work.series.id));
                }
            }

            foreach (var edition in work.editions)
            {
                SanitizeEditionNarrators(edition);
                Exec(connection, tx, "INSERT INTO editions(id,work_id,edition_type,duration_seconds,chapter_count,chapter_fingerprint,quality_score,created_at,updated_at) VALUES($id,$work,$type,$duration,$chapters,$fingerprint,$quality,$now,$now) ON CONFLICT(id) DO UPDATE SET work_id=$work,edition_type=$type,duration_seconds=$duration,chapter_count=$chapters,chapter_fingerprint=$fingerprint,quality_score=$quality,updated_at=$now",
                    ("$id", edition.id), ("$work", work.id), ("$type", edition.edition_type), ("$duration", edition.duration_seconds), ("$chapters", edition.chapter_count), ("$fingerprint", edition.chapter_fingerprint), ("$quality", edition.quality_score), ("$now", now));

                if (edition.narrators.Count > 0)
                    Exec(connection, tx, "DELETE FROM edition_narrators WHERE edition_id=$edition", ("$edition", edition.id));
                foreach (var narrator in edition.narrators)
                {
                    UpsertPerson(connection, tx, narrator, now);
                    Exec(connection, tx, "INSERT OR IGNORE INTO edition_narrators(edition_id,person_id) VALUES($edition,$person)", ("$edition", edition.id), ("$person", narrator.id));
                }

                foreach (var source in edition.sources)
                {
                    Exec(connection, tx, "INSERT INTO sources(id,edition_id,provider,external_id,page_url,status,last_checked_at,last_success_at,fail_count,last_error) VALUES($id,$edition,$provider,$external,$url,$status,$now,$now,0,NULL) ON CONFLICT(id) DO UPDATE SET edition_id=$edition,provider=$provider,external_id=$external,page_url=$url,status=$status,last_checked_at=$now,last_success_at=$now,last_error=NULL",
                        ("$id", source.id), ("$edition", edition.id), ("$provider", source.provider), ("$external", source.external_id), ("$url", source.page_url), ("$status", source.status), ("$now", now));

                    if (source.chapters.Count > 0)
                        Exec(connection, tx, "DELETE FROM chapters WHERE source_id=$source", ("$source", source.id));

                    foreach (var chapter in source.chapters)
                    {
                        Exec(connection, tx, "INSERT INTO chapters(id,source_id,chapter_index,title,duration_seconds,audio_url,audio_url_hash,audio_url_checked_at) VALUES($id,$source,$idx,$title,$duration,$url,$hash,$now) ON CONFLICT(source_id,chapter_index) DO UPDATE SET title=$title,duration_seconds=$duration,audio_url=$url,audio_url_hash=$hash,audio_url_checked_at=$now",
                            ("$id", chapter.id), ("$source", source.id), ("$idx", chapter.chapter_index), ("$title", chapter.title), ("$duration", chapter.duration_seconds), ("$url", chapter.audio_url), ("$hash", StableHash(chapter.audio_url)), ("$now", now));
                    }
                }
            }

            ReindexWork(connection, tx, work);
            tx.Commit();
            }
        }

        private enum StoredWorkOrder
        {
            Balanced,
            Latest,
            Popular
        }

        public List<AudioFdbWork> ListWorks(int limit, int offset, bool playableOnly = false, string genre = "")
            => SearchStoredWorks(string.Empty, genre, limit, offset, playableOnly);

        public List<AudioFdbWork> ListLatestWorks(int limit, int offset, bool playableOnly = false, string genre = "")
            => SearchStoredWorks(string.Empty, genre, limit, offset, playableOnly, order: StoredWorkOrder.Latest);

        public List<AudioFdbWork> ListPopularWorks(int limit, int offset, bool playableOnly = false, string genre = "")
            => SearchStoredWorks(string.Empty, genre, limit, offset, playableOnly, order: StoredWorkOrder.Popular);

        public List<AudioFdbWork> SearchWorks(string query, string genre, int limit, int offset, bool playableOnly = true)
            => SearchStoredWorks(query, genre, limit, offset, playableOnly);

        private List<AudioFdbWork> SearchStoredWorks(string query, string genre, int limit, int offset, bool playableOnly, bool includeChapters = false, StoredWorkOrder order = StoredWorkOrder.Balanced)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            offset = Math.Max(0, offset);

            var where = new List<string>();
            var args = new List<(string Name, object? Value)>();
            var normalizedGenre = Normalize(genre ?? string.Empty);
            var normalizedQuery = Normalize(query ?? string.Empty);
            var terms = normalizedQuery.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(t => t.Length > 1)
                .Take(6)
                .ToList();
            var hasQuery = !string.IsNullOrWhiteSpace(normalizedQuery);

            if (playableOnly)
            {
                where.Add(@"EXISTS (
                    SELECT 1
                    FROM editions pe
                    JOIN sources ps ON ps.edition_id = pe.id
                    JOIN chapters pc ON pc.source_id = ps.id
                    WHERE pe.work_id = w.id AND IFNULL(pc.audio_url, '') <> ''
                )");
            }

            if (!string.IsNullOrWhiteSpace(normalizedGenre))
            {
                args.Add(("$genre", "%" + normalizedGenre + "%"));
                where.Add(@"EXISTS (
                    SELECT 1
                    FROM work_genres wg
                    JOIN genres g ON g.id = wg.genre_id
                    WHERE wg.work_id = w.id AND g.normalized_title LIKE $genre
                )");
            }

            for (var i = 0; i < terms.Count; i++)
            {
                var name = "$q" + i;
                args.Add((name, "%" + terms[i] + "%"));
                where.Add(@"w.id IN (
                    SELECT tw.id FROM works tw
                    WHERE REPLACE(tw.normalized_title, char(1105), char(1077)) LIKE " + name + @"
                    UNION
                    SELECT wa.work_id FROM work_authors wa JOIN persons p ON p.id = wa.person_id
                    WHERE REPLACE(p.normalized_name, char(1105), char(1077)) LIKE " + name + @"
                    UNION
                    SELECT e.work_id FROM editions e
                    JOIN edition_narrators en ON en.edition_id = e.id JOIN persons p ON p.id = en.person_id
                    WHERE REPLACE(p.normalized_name, char(1105), char(1077)) LIKE " + name + @"
                    UNION
                    SELECT wg.work_id FROM work_genres wg JOIN genres g ON g.id = wg.genre_id
                    WHERE REPLACE(g.normalized_title, char(1105), char(1077)) LIKE " + name + @"
                    UNION
                    SELECT ws.work_id FROM work_series ws JOIN series s ON s.id = ws.series_id
                    WHERE REPLACE(s.normalized_title, char(1105), char(1077)) LIKE " + name + @"
                )");
            }

            var take = Math.Min(Math.Max((offset + limit) * 5, limit * 8), 5000);
            args.Add(("$take", take));
            if (hasQuery)
            {
                args.Add(("$exact", normalizedQuery));
                args.Add(("$wordPrefix", normalizedQuery + " %"));
                args.Add(("$wordContains", "% " + normalizedQuery + " %"));
                args.Add(("$prefix", normalizedQuery + "%"));
                args.Add(("$contains", "%" + normalizedQuery + "%"));
            }

            List<string> ids;
            using (var connection = Open())
            {
                var relevanceOrder = hasQuery
                    ? @"
    CASE
        WHEN REPLACE(w.normalized_title, char(1105), char(1077)) = $exact THEN 0
        WHEN REPLACE(w.normalized_title, char(1105), char(1077)) LIKE $wordPrefix THEN 1
        WHEN REPLACE(w.normalized_title, char(1105), char(1077)) LIKE $wordContains THEN 2
        WHEN REPLACE(w.normalized_title, char(1105), char(1077)) LIKE $prefix THEN 3
        WHEN REPLACE(w.normalized_title, char(1105), char(1077)) LIKE $contains THEN 4
        ELSE 5
    END,"
                    : string.Empty;
                var playableCountOrder = @"COALESCE((
        SELECT COUNT(*)
        FROM editions e
        JOIN sources s ON s.edition_id = e.id
        JOIN chapters c ON c.source_id = s.id
        WHERE e.work_id = w.id AND IFNULL(c.audio_url, '') <> ''
    ), 0) DESC";
                var qualityOrder = "COALESCE((SELECT MAX(e.quality_score) FROM editions e WHERE e.work_id = w.id), 0) DESC";
                var seriesOrder = "COALESCE((SELECT s.title FROM work_series ws JOIN series s ON s.id = ws.series_id WHERE ws.work_id = w.id LIMIT 1), w.title)";
                var catalogOrder = (!hasQuery && order == StoredWorkOrder.Latest)
                    ? "w.created_at DESC,\n    w.updated_at DESC,\n    " + playableCountOrder + ",\n    " + qualityOrder + ",\n    w.title"
                    : (!hasQuery && order == StoredWorkOrder.Popular)
                        ? playableCountOrder + ",\n    " + qualityOrder + ",\n    w.created_at DESC,\n    w.title"
                        : playableCountOrder + ",\n    " + qualityOrder + ",\n    " + seriesOrder + ",\n    w.updated_at DESC,\n    w.title";
                var sql = @"
SELECT w.id
FROM works w
" + (where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : string.Empty) + @"
ORDER BY
    " + relevanceOrder + @"
    " + catalogOrder + @"
LIMIT $take";
                ids = Query(connection, sql, args.ToArray()).Select(row => row["id"]).ToList();
            }

            var result = new List<AudioFdbWork>();
            foreach (var id in ids)
            {
                var work = GetWork(id, includeChapters: includeChapters);
                if (work != null)
                    result.Add(work);
            }

            return DeduplicateWorks(result).Skip(offset).Take(limit).ToList();
        }

        public List<AudioFdbWork> SimilarWorks(AudioFdbWork work, int limit = 80, bool includeChapters = true)
        {
            if (work == null || string.IsNullOrWhiteSpace(work.title))
                return new List<AudioFdbWork>();

            limit = Math.Max(1, Math.Min(limit <= 0 ? 80 : limit, 200));
            var key = DeduplicateKey(work);
            var terms = NormalizeTitleKey(work.title).Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(t => t.Length > 1)
                .Take(4)
                .ToList();

            if (terms.Count == 0)
                return new List<AudioFdbWork>();

            var where = new List<string>();
            var args = new List<(string Name, object? Value)>();
            for (var i = 0; i < terms.Count; i++)
            {
                var name = "$q" + i;
                args.Add((name, "%" + terms[i] + "%"));
                where.Add("w.normalized_title LIKE " + name);
            }
            args.Add(("$take", limit));

            List<string> ids;
            using (var connection = Open())
            {
                var sql = @"
SELECT w.id
FROM works w
WHERE " + string.Join(" AND ", where) + @"
ORDER BY
    COALESCE((SELECT MAX(e.quality_score) FROM editions e WHERE e.work_id = w.id), 0) DESC,
    w.updated_at DESC,
    w.title
LIMIT $take";
                ids = Query(connection, sql, args.ToArray()).Select(row => row["id"]).ToList();
            }

            var result = new List<AudioFdbWork>();
            foreach (var id in ids)
            {
                var candidate = GetWork(id, includeChapters: includeChapters);
                if (candidate != null && string.Equals(DeduplicateKey(candidate), key, StringComparison.OrdinalIgnoreCase))
                    result.Add(candidate);
            }

            return result;
        }

        public static List<AudioFdbWork> DeduplicateWorks(IEnumerable<AudioFdbWork> works)
        {
            var prepared = works
                .Where(w => w != null && !string.IsNullOrWhiteSpace(w.id))
                .Select(NormalizeWorkMetadata)
                .ToList();
            var knownAuthorsByTitle = prepared
                .GroupBy(WorkTitleKey, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group => group
                        .Select(WorkAuthorKey)
                        .Where(key => !string.IsNullOrWhiteSpace(key))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList(),
                    StringComparer.OrdinalIgnoreCase
                );
            var result = new List<AudioFdbWork>();
            var index = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            foreach (var work in prepared)
            {
                var titleKey = WorkTitleKey(work);
                var authorKey = WorkAuthorKey(work);
                if (
                    string.IsNullOrWhiteSpace(authorKey) &&
                    knownAuthorsByTitle.TryGetValue(titleKey, out var knownAuthors) &&
                    knownAuthors.Count == 1
                )
                    authorKey = knownAuthors[0];

                var key = string.IsNullOrWhiteSpace(authorKey)
                    ? titleKey
                    : titleKey + "|" + authorKey;
                if (!index.TryGetValue(key, out var existing))
                {
                    index[key] = result.Count;
                    result.Add(work);
                    continue;
                }

                if (BetterWork(work, result[existing]))
                {
                    MergeWork(work, result[existing]);
                    result[existing] = work;
                }
                else
                {
                    MergeWork(result[existing], work);
                }
            }

            return result;
        }

        public static bool HasPlayableChapters(AudioFdbWork work)
            => PlayableChapterCount(work) > 0;

        private static string DeduplicateKey(AudioFdbWork work)
        {
            var serialTitle = SerialTitleKey(work.title);
            if (!string.IsNullOrWhiteSpace(serialTitle))
                return serialTitle;

            work = NormalizeWorkMetadata(work);
            var title = WorkTitleKey(work);
            var author = WorkAuthorKey(work);
            if (string.IsNullOrWhiteSpace(title))
                return work.id;

            return string.IsNullOrWhiteSpace(author) ? title : title + "|" + author;
        }

        private static string WorkTitleKey(AudioFdbWork work)
            => NormalizeTitleKey(CanonicalBookTitle(work.title, out _));

        private static string WorkAuthorKey(AudioFdbWork work)
            => NormalizePersonKey(FirstNonEmpty(
                work.authors.FirstOrDefault()?.display_name ?? string.Empty,
                InferAuthor(work.title, work.description),
                InlineAuthorFromTitle(work.title)
            ));

        private static string SerialTitleKey(string value)
        {
            var normalized = Normalize(value);
            var match = Regex.Match(normalized, @"^\s*\u0433\u043b\u0443\u0431\u0438\u043d\u0430\s+\u043f\u043e\u0433\u0440\u0443\u0436\u0435\u043d\u0438\u0435\s+(?<number>\d+)\b", RegexOptions.IgnoreCase);
            return match.Success ? "\u0433\u043b\u0443\u0431\u0438\u043d\u0430 \u043f\u043e\u0433\u0440\u0443\u0436\u0435\u043d\u0438\u0435 " + match.Groups["number"].Value : string.Empty;
        }

        private static string InlineAuthorFromTitle(string value)
        {
            var match = Regex.Match(HttpUtility.HtmlDecode(value ?? string.Empty), @"(?i)\s+\u0430\u0432\u0442\u043e\u0440\s*[:\-]\s*(?<author>.+)$");
            if (match.Success)
                return CleanPersonDisplay(match.Groups["author"].Value);

            CanonicalBookTitle(value, out var leadingAuthor);
            return leadingAuthor;
        }

        private static string NormalizePersonKey(string value)
        {
            var words = Normalize(CleanPersonDisplay(value)).Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => w.Length > 1)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(w => w, StringComparer.OrdinalIgnoreCase)
                .Take(5)
                .ToList();
            return string.Join(" ", words);
        }

        private static string NormalizeTitleKey(string value)
        {
            var normalized = Normalize(CanonicalBookTitle(value, out _));
            normalized = Regex.Replace(normalized, @"\b(\u0430\u0432\u0442\u043e\u0440|\u0447\u0438\u0442\u0430\u0435\u0442|\u0438\u0441\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c|\u043e\u0437\u0432\u0443\u0447\u0438\u0432\u0430\u0435\u0442)\b.*$", " ").Trim();
            normalized = Regex.Replace(normalized, @"\b(\u0430\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433\u0430|\u0441\u043b\u0443\u0448\u0430\u0442\u044c|\u043e\u043d\u043b\u0430\u0439\u043d|mp3|\u043f\u043e\u043b\u043d\u0430\u044f|\u0432\u0435\u0440\u0441\u0438\u044f|\u043a\u043d\u0438\u0433\u0430)\b", " ");
            normalized = Regex.Replace(normalized, @"\b(автор|читает|исполнитель|озвучивает)\b.*$", " ").Trim();
            normalized = Regex.Replace(normalized, @"\b(аудиокнига|слушать|онлайн|mp3|полная|версия|книга)\b", " ");
            var stop = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "и", "или", "а", "но", "по", "из", "в", "во", "на", "у", "от", "до", "за", "с", "со"
            };
            var words = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries)
                .Where(w => !stop.Contains(w) && !IsRussianTitleStopWord(w))
                .Take(8)
                .ToList();
            return string.Join(" ", words);
        }

        private static AudioFdbWork NormalizeWorkMetadata(AudioFdbWork work)
        {
            if (work == null)
                return work;

            var originalTitle = work.title;
            work.title = CanonicalBookTitle(originalTitle, out var leadingAuthor);
            work.normalized_title = Normalize(work.title);

            var author = FirstNonEmpty(
                work.authors
                    .Select(person => CleanPersonDisplay(person.display_name))
                    .FirstOrDefault(name => !string.IsNullOrWhiteSpace(name)) ?? string.Empty,
                InferAuthor(originalTitle, work.description),
                leadingAuthor
            );
            work.authors.RemoveAll(person => string.IsNullOrWhiteSpace(CleanPersonDisplay(person.display_name)));
            foreach (var person in work.authors)
                person.display_name = CleanPersonDisplay(person.display_name);
            DeduplicatePeopleInPlace(work.authors);

            if (work.authors.Count == 0 && !string.IsNullOrWhiteSpace(author))
            {
                work.authors.Add(new AudioFdbPerson
                {
                    id = "person:normalized:author:" + StableHash(NormalizePersonKey(author)),
                    display_name = author,
                    kind = "author",
                    source_provider = "normalized"
                });
            }

            var inferredNarrator = InferNarrator(originalTitle, work.description);
            foreach (var edition in work.editions)
            {
                edition.narrators.RemoveAll(person => string.IsNullOrWhiteSpace(CleanPersonDisplay(person.display_name)));
                foreach (var person in edition.narrators)
                    person.display_name = CleanPersonDisplay(person.display_name);
                DeduplicatePeopleInPlace(edition.narrators);
                SanitizeEditionNarrators(edition);

                if (
                    edition.narrators.Count == 0 &&
                    !string.IsNullOrWhiteSpace(inferredNarrator) &&
                    work.editions.Count == 1
                )
                {
                    edition.narrators.Add(new AudioFdbPerson
                    {
                        id = "person:normalized:narrator:" + StableHash(NormalizePersonKey(inferredNarrator)),
                        display_name = inferredNarrator,
                        kind = "narrator",
                        source_provider = "normalized"
                    });
                }
            }

            return work;
        }

        public static void SanitizeEditionNarrators(AudioFdbEdition edition)
        {
            if (edition == null || edition.narrators.Count <= 1)
                return;

            var evidenceKeys = edition.sources
                .SelectMany(source => source.chapters)
                .Take(16)
                .SelectMany(chapter => new[]
                {
                    chapter.title ?? string.Empty,
                    HttpUtility.UrlDecode(chapter.audio_url ?? string.Empty)
                })
                .SelectMany(value => Regex.Matches(
                        value,
                        @"(?i)\b(?:читает|чтец|исполняет|исполнитель|озвучивает|озвучка)\s*[:—–-]?\s*(?<name>[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,3})"
                    )
                    .Cast<Match>()
                    .Select(match => NormalizePersonKey(match.Groups["name"].Value)))
                .Where(key => !string.IsNullOrWhiteSpace(key))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            if (evidenceKeys.Count == 0)
                return;

            var matched = edition.narrators.Where(narrator =>
            {
                var narratorWords = NormalizePersonKey(narrator.display_name)
                    .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                return evidenceKeys.Any(evidence =>
                {
                    var evidenceWords = evidence
                        .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                        .ToHashSet(StringComparer.OrdinalIgnoreCase);
                    return evidenceWords.Count > 0 && evidenceWords.All(narratorWords.Contains);
                });
            }).ToList();
            if (matched.Count == 0 || matched.Count == edition.narrators.Count)
                return;

            edition.narrators.Clear();
            edition.narrators.AddRange(matched);
        }

        private static void DeduplicatePeopleInPlace(List<AudioFdbPerson> people)
        {
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            people.RemoveAll(person =>
            {
                var key = NormalizePersonKey(person.display_name);
                return string.IsNullOrWhiteSpace(key) || !seen.Add(key);
            });
        }

        private static string CanonicalBookTitle(string value, out string leadingAuthor)
        {
            var title = HttpUtility.HtmlDecode(value ?? string.Empty).Trim();
            leadingAuthor = string.Empty;
            title = Regex.Replace(
                title,
                @"^\s*Rated\s+\d+(?:[.,]\d+)?\s+out\s+of\s+5\s+",
                string.Empty,
                RegexOptions.IgnoreCase
            ).Trim();

            var match = Regex.Match(
                title,
                @"^\s*(?<author>(?:[\p{Lu}Ё][\p{L}'’.-]*)(?:\s+[\p{Lu}Ё][\p{L}'’.-]*){1,4})\s*[-–—]\s*(?<title>.+)$"
            );
            if (match.Success && LooksLikePersonName(match.Groups["author"].Value))
            {
                leadingAuthor = CleanPersonDisplay(match.Groups["author"].Value);
                title = match.Groups["title"].Value.Trim();
            }

            var trailingAuthor = Regex.Match(
                title,
                @"^(?<title>.+?)\s*/\s*(?<author>(?:[\p{Lu}Ё][\p{L}'’.-]*)(?:\s+[\p{Lu}Ё][\p{L}'’.-]*){1,4})\s*$"
            );
            if (trailingAuthor.Success && LooksLikePersonName(trailingAuthor.Groups["author"].Value))
            {
                if (string.IsNullOrWhiteSpace(leadingAuthor))
                    leadingAuthor = CleanPersonDisplay(trailingAuthor.Groups["author"].Value);
                title = trailingAuthor.Groups["title"].Value.Trim();
            }

            title = Regex.Replace(
                title,
                @"\s+\b(?:автор|author)\s*[:—–-].*$",
                string.Empty,
                RegexOptions.IgnoreCase
            ).Trim(' ', '-', '–', '—', ':', '.', ',');
            return string.IsNullOrWhiteSpace(title) ? value?.Trim() ?? string.Empty : title;
        }

        private static string InferAuthor(string title, string description)
        {
            var text = HttpUtility.HtmlDecode((title ?? string.Empty) + "\n" + (description ?? string.Empty));
            var surname = Regex.Match(text, @"(?i)\bфамилия\s+автора\s*[:—–-]\s*(?<v>[\p{L}'’.-]{2,40})").Groups["v"].Value;
            var firstName = Regex.Match(text, @"(?i)\bимя\s+автора\s*[:—–-]\s*(?<v>[\p{L}'’.-]{2,40})").Groups["v"].Value;
            var paired = CleanPersonDisplay((firstName + " " + surname).Trim());
            if (LooksLikePersonName(paired))
                return paired;

            var explicitAuthor = Regex.Match(
                text,
                @"(?i)\b(?:автор(?:ы)?|писатель|author)\s*[:—–-]\s*(?<v>.{2,100}?)(?=\s+(?:читает|чтец|исполнитель|жанр|цикл|серия|год|издательство|описание)\s*[:—–-]|\r|\n|\||;|$)"
            ).Groups["v"].Value;
            explicitAuthor = CleanPersonDisplay(explicitAuthor);
            if (LooksLikePersonName(explicitAuthor))
                return explicitAuthor;

            CanonicalBookTitle(title, out var leadingAuthor);
            return LooksLikePersonName(leadingAuthor) ? leadingAuthor : string.Empty;
        }

        private static string InferNarrator(string title, string description)
        {
            var text = HttpUtility.HtmlDecode((title ?? string.Empty) + "\n" + (description ?? string.Empty));
            var match = Regex.Match(
                text,
                @"(?i)\b(?:исполнитель|читает|чтец|диктор|озвучивает)\s*[:—–-]\s*(?<v>.{2,100}?)(?=\s+(?:автор|жанр|цикл|серия|год|издательство|описание|время|длительность)\s*[:—–-]|\r|\n|\||;|$)"
            );
            var narrator = CleanPersonDisplay(match.Groups["v"].Value);
            return LooksLikePersonName(narrator) ? narrator : string.Empty;
        }

        private static bool LooksLikePersonName(string value)
        {
            value = CleanPersonDisplay(value);
            if (string.IsNullOrWhiteSpace(value) || value.Any(char.IsDigit))
                return false;
            var words = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (words.Length < 2 || words.Length > 6 || value.Length > 80)
                return false;
            return words.All(word => Regex.IsMatch(word, @"^[\p{L}][\p{L}'’.-]*$"));
        }

        private static string CleanPersonDisplay(string value)
        {
            value = HttpUtility.HtmlDecode(value ?? string.Empty);
            value = Regex.Replace(value, @"\s+", " ").Trim();
            value = Regex.Replace(
                value,
                @"(?i)\s+(?:читает|чтец|исполнитель|озвучивает|диктор|жанр|романы|аудиокниг\w*|описание|издательство|длительность|время)\b.*$",
                string.Empty
            );
            value = Regex.Replace(
                value,
                @"\s+\d+\s*(?:час(?:а|ов)?|минут(?:а|ы)?|секунд(?:а|ы)?)\b.*$",
                string.Empty,
                RegexOptions.IgnoreCase
            );
            value = value.Trim(' ', '\t', '\r', '\n', ':', '-', '–', '—', ',', '.', '"', '«', '»');
            return value.Length > 80 ? string.Empty : value;
        }

        private static bool IsRussianTitleStopWord(string value)
            => value is "\u0438" or "\u0438\u043b\u0438" or "\u0430" or "\u043d\u043e" or "\u043f\u043e" or "\u0438\u0437" or "\u0432" or "\u0432\u043e" or "\u043d\u0430" or "\u0443" or "\u043e\u0442" or "\u0434\u043e" or "\u0437\u0430" or "\u0441" or "\u0441\u043e";

        private static bool IsLikelyBadPersonName(string value)
        {
            var original = HttpUtility.HtmlDecode(value ?? string.Empty).Trim();
            value = CleanPersonDisplay(original);
            if (string.IsNullOrWhiteSpace(value))
                return true;
            if (value.Length > 80)
                return true;
            if (original.Contains('/') || original.Any(char.IsDigit))
                return true;

            var normalized = Normalize(original);
            return normalized.Contains("\u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043a\u043d\u0438\u0433\u0438", StringComparison.OrdinalIgnoreCase) ||
                   normalized.Contains("\u043a\u043b\u0430\u0441\u0441\u0438\u043a\u0430 \u0440\u043e\u043c\u0430\u043d\u044b", StringComparison.OrdinalIgnoreCase) ||
                   normalized.Contains("\u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c", StringComparison.OrdinalIgnoreCase) ||
                   normalized.Contains("\u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435", StringComparison.OrdinalIgnoreCase);
        }

        private static bool BetterWork(AudioFdbWork candidate, AudioFdbWork current)
        {
            var candidateChapters = PlayableChapterCount(candidate);
            var currentChapters = PlayableChapterCount(current);
            if (candidateChapters != currentChapters)
                return candidateChapters > currentChapters;

            var candidateHasAuthor = candidate.authors.Any(a => !IsLikelyBadPersonName(a.display_name));
            var currentHasAuthor = current.authors.Any(a => !IsLikelyBadPersonName(a.display_name));
            if (candidateHasAuthor != currentHasAuthor)
                return candidateHasAuthor;

            var candidateQuality = candidate.editions.Select(e => e.quality_score).DefaultIfEmpty(0).Max();
            var currentQuality = current.editions.Select(e => e.quality_score).DefaultIfEmpty(0).Max();
            if (Math.Abs(candidateQuality - currentQuality) > 0.001)
                return candidateQuality > currentQuality;

            if (!string.IsNullOrWhiteSpace(candidate.poster_url) != !string.IsNullOrWhiteSpace(current.poster_url))
                return !string.IsNullOrWhiteSpace(candidate.poster_url);

            return (candidate.description ?? string.Empty).Length > (current.description ?? string.Empty).Length;
        }

        private static void MergeWork(AudioFdbWork target, AudioFdbWork source)
        {
            if (target == null || source == null || ReferenceEquals(target, source))
                return;

            if (string.IsNullOrWhiteSpace(target.description) || (source.description ?? string.Empty).Length > (target.description ?? string.Empty).Length)
                target.description = source.description;

            if (string.IsNullOrWhiteSpace(target.poster_url) && !string.IsNullOrWhiteSpace(source.poster_url))
                target.poster_url = source.poster_url;

            MergePersons(target.authors, source.authors);
            MergeGenres(target.genres, source.genres);

            if (target.series == null && source.series != null)
                target.series = source.series;

            foreach (var edition in source.editions)
                MergeEdition(target, edition);
        }

        private static void MergePersons(List<AudioFdbPerson> target, IEnumerable<AudioFdbPerson> source)
        {
            foreach (var person in source.Where(p => p != null && !string.IsNullOrWhiteSpace(p.display_name)))
            {
                if (IsLikelyBadPersonName(person.display_name))
                    continue;

                var id = person.id ?? string.Empty;
                person.display_name = CleanPersonDisplay(person.display_name);
                var normalized = NormalizePersonKey(person.display_name);
                if (target.Any(p => (!string.IsNullOrWhiteSpace(id) && string.Equals(p.id, id, StringComparison.OrdinalIgnoreCase)) || NormalizePersonKey(p.display_name) == normalized))
                    continue;

                target.Add(person);
            }
        }

        private static void MergeGenres(List<AudioFdbGenre> target, IEnumerable<AudioFdbGenre> source)
        {
            foreach (var genre in source.Where(g => g != null && !string.IsNullOrWhiteSpace(g.title)))
            {
                var id = genre.id ?? string.Empty;
                var normalized = Normalize(genre.title);
                if (target.Any(g => (!string.IsNullOrWhiteSpace(id) && string.Equals(g.id, id, StringComparison.OrdinalIgnoreCase)) || Normalize(g.title) == normalized))
                    continue;

                target.Add(genre);
            }
        }

        private static void MergeEdition(AudioFdbWork target, AudioFdbEdition edition)
        {
            if (edition == null || string.IsNullOrWhiteSpace(edition.id))
                return;

            var key = EditionMergeKey(edition);
            var existing = target.editions.FirstOrDefault(e =>
                string.Equals(e.id, edition.id, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(key) && EditionMergeKey(e) == key));

            if (existing == null)
            {
                target.editions.Add(edition);
                return;
            }

            MergePersons(existing.narrators, edition.narrators);

            if (edition.duration_seconds > existing.duration_seconds)
                existing.duration_seconds = edition.duration_seconds;
            if (edition.chapter_count > existing.chapter_count)
                existing.chapter_count = edition.chapter_count;
            if (string.IsNullOrWhiteSpace(existing.chapter_fingerprint) && !string.IsNullOrWhiteSpace(edition.chapter_fingerprint))
                existing.chapter_fingerprint = edition.chapter_fingerprint;
            if (edition.quality_score > existing.quality_score)
                existing.quality_score = edition.quality_score;

            foreach (var source in edition.sources)
                MergeSource(existing, source);
        }

        private static void MergeSource(AudioFdbEdition target, AudioFdbSource source)
        {
            if (source == null || string.IsNullOrWhiteSpace(source.id))
                return;

            var key = SourceMergeKey(source);
            var existing = target.sources.FirstOrDefault(s =>
                string.Equals(s.id, source.id, StringComparison.OrdinalIgnoreCase) ||
                (!string.IsNullOrWhiteSpace(key) && SourceMergeKey(s) == key));

            if (existing == null)
            {
                target.sources.Add(source);
                return;
            }

            if (string.IsNullOrWhiteSpace(existing.external_id)) existing.external_id = source.external_id;
            if (string.IsNullOrWhiteSpace(existing.page_url)) existing.page_url = source.page_url;
            if (string.IsNullOrWhiteSpace(existing.status) || existing.status == "unknown") existing.status = source.status;

            foreach (var chapter in source.chapters)
            {
                if (existing.chapters.Any(c => c.chapter_index == chapter.chapter_index || (!string.IsNullOrWhiteSpace(c.audio_url) && c.audio_url == chapter.audio_url)))
                    continue;

                existing.chapters.Add(chapter);
            }
        }

        private static string EditionMergeKey(AudioFdbEdition edition)
        {
            var narrators = string.Join(
                "|",
                edition.narrators
                    .Select(n => NormalizePersonKey(n.display_name))
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
            );
            if (!string.IsNullOrWhiteSpace(narrators))
                return "reader|" + narrators;

            var fingerprint = FirstNonEmpty(edition.chapter_fingerprint, edition.chapter_count + ":" + edition.duration_seconds);
            return "unknown|" + fingerprint;
        }

        private static string SourceMergeKey(AudioFdbSource source)
            => Normalize(source.provider + "|" + FirstNonEmpty(source.external_id, source.page_url));

        private static string FirstNonEmpty(params string[] values)
            => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;

        private static int PlayableChapterCount(AudioFdbWork work)
        {
            var concrete = work.editions.SelectMany(e => e.sources).SelectMany(s => s.chapters).Count(c => !string.IsNullOrWhiteSpace(c.audio_url));
            return concrete > 0 ? concrete : work.editions.Sum(e => Math.Max(0, e.chapter_count));
        }

        public AudioFdbWork? GetWork(string id, bool includeChapters = true)
        {
            using var connection = Open();
            var row = QueryOne(connection, "SELECT id,title,description,poster_url FROM works WHERE id=$id", ("$id", id));
            if (row == null) return null;

            var work = new AudioFdbWork
            {
                id = row["id"],
                title = row["title"],
                normalized_title = Normalize(row["title"]),
                description = row["description"],
                poster_url = row["poster_url"]
            };

            foreach (var p in Query(connection, "SELECT p.id,p.display_name,p.kind FROM persons p JOIN work_authors wa ON wa.person_id=p.id WHERE wa.work_id=$id ORDER BY p.display_name", ("$id", id)))
            {
                if (!IsLikelyBadPersonName(p["display_name"]))
                    work.authors.Add(new AudioFdbPerson { id = p["id"], display_name = p["display_name"], kind = p["kind"] });
            }

            foreach (var g in Query(connection, "SELECT g.id,g.title,g.source_provider,g.source_external_id FROM genres g JOIN work_genres wg ON wg.genre_id=g.id WHERE wg.work_id=$id ORDER BY g.title", ("$id", id)))
                work.genres.Add(new AudioFdbGenre { id = g["id"], title = g["title"], source_provider = g["source_provider"], source_external_id = g["source_external_id"] });

            var series = QueryOne(connection, "SELECT s.id,s.title,s.source_provider,s.source_external_id FROM series s JOIN work_series ws ON ws.series_id=s.id WHERE ws.work_id=$id LIMIT 1", ("$id", id));
            if (series != null)
                work.series = new AudioFdbSeries { id = series["id"], title = series["title"], source_provider = series["source_provider"], source_external_id = series["source_external_id"] };

            foreach (var e in Query(connection, "SELECT id,edition_type,duration_seconds,chapter_count,chapter_fingerprint,quality_score FROM editions WHERE work_id=$id ORDER BY quality_score DESC,id", ("$id", id)))
            {
                var edition = new AudioFdbEdition
                {
                    id = e["id"],
                    work_id = id,
                    edition_type = e["edition_type"],
                    duration_seconds = ToLong(e["duration_seconds"]),
                    chapter_count = (int)ToLong(e["chapter_count"]),
                    chapter_fingerprint = e["chapter_fingerprint"],
                    quality_score = ToDouble(e["quality_score"])
                };

                foreach (var n in Query(connection, "SELECT p.id,p.display_name,p.kind FROM persons p JOIN edition_narrators en ON en.person_id=p.id WHERE en.edition_id=$id ORDER BY p.display_name", ("$id", edition.id)))
                {
                    if (!IsLikelyBadPersonName(n["display_name"]))
                        edition.narrators.Add(new AudioFdbPerson { id = n["id"], display_name = n["display_name"], kind = n["kind"] });
                }

                foreach (var s in Query(connection, "SELECT id,provider,external_id,page_url,status FROM sources WHERE edition_id=$id ORDER BY provider", ("$id", edition.id)))
                {
                    var source = new AudioFdbSource
                    {
                        id = s["id"],
                        edition_id = edition.id,
                        provider = s["provider"],
                        external_id = s["external_id"],
                        page_url = s["page_url"],
                        status = s["status"]
                    };

                    if (includeChapters)
                    {
                        foreach (var c in Query(connection, "SELECT id,chapter_index,title,duration_seconds,audio_url FROM chapters WHERE source_id=$id ORDER BY chapter_index", ("$id", source.id)))
                        {
                            var url = c["audio_url"];
                            source.chapters.Add(new AudioFdbChapter
                            {
                                id = c["id"],
                                chapter_index = (int)ToLong(c["chapter_index"]),
                                title = c["title"],
                                duration_seconds = ToLong(c["duration_seconds"]),
                                audio_url = url,
                                proxy_url = "/audiobooks/audio?url=" + HttpUtility.UrlEncode(url)
                            });
                        }
                    }

                    edition.sources.Add(source);
                }

                work.editions.Add(edition);
            }

            return work;
        }

        public List<AudioFdbGenre> ListGenres(int limit, int offset, string query = "")
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 50 : limit, 200));
            offset = Math.Max(0, offset);
            var normalized = Normalize(query ?? string.Empty);
            var where = string.IsNullOrWhiteSpace(normalized) ? string.Empty : "AND g.normalized_title LIKE $query";
            using var connection = Open();
            return Query(connection, @"
SELECT g.id,g.title,g.source_provider,g.source_external_id,COUNT(DISTINCT wg.work_id) works_count
FROM genres g
JOIN work_genres wg ON wg.genre_id=g.id
WHERE EXISTS (
    SELECT 1 FROM editions e
    JOIN sources s ON s.edition_id=e.id
    JOIN chapters c ON c.source_id=s.id
    WHERE e.work_id=wg.work_id AND IFNULL(c.audio_url,'')<>''
) " + where + @"
GROUP BY g.id,g.title,g.source_provider,g.source_external_id
ORDER BY works_count DESC,g.title
LIMIT $limit OFFSET $offset", ("$query", "%" + normalized + "%"), ("$limit", limit), ("$offset", offset))
                .Select(row => new AudioFdbGenre
                {
                    id = row["id"],
                    title = row["title"],
                    source_provider = row["source_provider"],
                    source_external_id = row["source_external_id"],
                    works_count = (int)ToLong(row["works_count"])
                })
                .ToList();
        }

        public List<AudioFdbPerson> ListPersons(string kind, int limit, int offset, string query = "")
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 50 : limit, 200));
            offset = Math.Max(0, offset);
            kind = string.IsNullOrWhiteSpace(kind) ? "author" : kind.Trim();
            var normalized = Normalize(query ?? string.Empty);
            var relation = kind.Equals("narrator", StringComparison.OrdinalIgnoreCase)
                ? "JOIN edition_narrators r ON r.person_id=p.id JOIN editions e0 ON e0.id=r.edition_id"
                : "JOIN work_authors r ON r.person_id=p.id";
            var workExpr = kind.Equals("narrator", StringComparison.OrdinalIgnoreCase) ? "e0.work_id" : "r.work_id";
            var where = string.IsNullOrWhiteSpace(normalized) ? string.Empty : "AND p.normalized_name LIKE $query";
            using var connection = Open();
            return Query(connection, @"
SELECT p.id,p.display_name,p.kind,COUNT(DISTINCT " + workExpr + @") works_count
FROM persons p
" + relation + @"
WHERE EXISTS (
    SELECT 1 FROM editions e
    JOIN sources s ON s.edition_id=e.id
    JOIN chapters c ON c.source_id=s.id
    WHERE e.work_id=" + workExpr + @" AND IFNULL(c.audio_url,'')<>''
) " + where + @"
GROUP BY p.id,p.display_name,p.kind
ORDER BY works_count DESC,p.display_name
LIMIT $limit OFFSET $offset", ("$query", "%" + normalized + "%"), ("$limit", limit), ("$offset", offset))
                .Where(row => !IsLikelyBadPersonName(row["display_name"]))
                .Select(row => new AudioFdbPerson
                {
                    id = row["id"],
                    display_name = row["display_name"],
                    kind = row["kind"],
                    works_count = (int)ToLong(row["works_count"])
                })
                .ToList();
        }

        public List<AudioFdbSeries> ListSeries(int limit, int offset, string query = "")
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 50 : limit, 200));
            offset = Math.Max(0, offset);
            var normalized = Normalize(query ?? string.Empty);
            var where = string.IsNullOrWhiteSpace(normalized) ? string.Empty : "AND s.normalized_title LIKE $query";
            using var connection = Open();
            return Query(connection, @"
SELECT MIN(s.id) id,MIN(s.title) title,'' source_provider,'' source_external_id,
       COUNT(DISTINCT ws.work_id) works_count,MAX(w.updated_at) newest
FROM series s
JOIN work_series ws ON ws.series_id=s.id
JOIN works w ON w.id=ws.work_id
WHERE EXISTS (
    SELECT 1 FROM editions e
    JOIN sources so ON so.edition_id=e.id
    WHERE e.work_id=ws.work_id AND IFNULL(so.page_url,'')<>''
) " + where + @"
GROUP BY s.normalized_title
HAVING COUNT(DISTINCT ws.work_id)>1
ORDER BY newest DESC,works_count DESC,title
LIMIT $limit OFFSET $offset", ("$query", "%" + normalized + "%"), ("$limit", limit), ("$offset", offset))
                .Select(row => new AudioFdbSeries
                {
                    id = row["id"],
                    title = row["title"],
                    source_provider = row["source_provider"],
                    source_external_id = row["source_external_id"],
                    works_count = (int)ToLong(row["works_count"])
                })
                .Where(series => IsUsableSeriesTitle(series.title))
                .ToList();
        }

        public List<AudioFdbWork> ListWorksByGenre(string genreId, int limit, int offset)
        {
            var normalized = Normalize(genreId ?? string.Empty);
            return ListWorksByRelation(@"
EXISTS (
    SELECT 1 FROM work_genres wg
    JOIN genres g ON g.id=wg.genre_id
    WHERE wg.work_id=w.id AND (g.id=$id OR g.normalized_title LIKE $query)
)", genreId, normalized, limit, offset, newestFirst: true);
        }

        public List<AudioFdbWork> ListWorksByPerson(string personId, string kind, int limit, int offset)
        {
            var normalized = Normalize(personId ?? string.Empty);
            var relation = kind.Equals("narrator", StringComparison.OrdinalIgnoreCase)
                ? @"
EXISTS (
    SELECT 1 FROM editions e0
    JOIN edition_narrators en ON en.edition_id=e0.id
    JOIN persons p ON p.id=en.person_id
    WHERE e0.work_id=w.id AND (p.id=$id OR p.normalized_name LIKE $query)
)"
                : @"
EXISTS (
    SELECT 1 FROM work_authors wa
    JOIN persons p ON p.id=wa.person_id
    WHERE wa.work_id=w.id AND (p.id=$id OR p.normalized_name LIKE $query)
)";
            return ListWorksByRelation(relation, personId, normalized, limit, offset, newestFirst: true);
        }

        public List<AudioFdbWork> ListWorksBySeries(string seriesId, int limit, int offset)
        {
            var normalized = string.Empty;
            using (var connection = Open())
            {
                var stored = QueryOne(
                    connection,
                    "SELECT normalized_title FROM series WHERE id=$id LIMIT 1",
                    ("$id", seriesId ?? string.Empty)
                );
                normalized = stored?["normalized_title"] ?? string.Empty;
            }
            if (string.IsNullOrWhiteSpace(normalized))
                normalized = Normalize(seriesId ?? string.Empty);
            return ListWorksByRelation(@"
EXISTS (
    SELECT 1 FROM work_series ws
    JOIN series s ON s.id=ws.series_id
    WHERE ws.work_id=w.id AND (s.id=$id OR s.normalized_title LIKE $query)
)", seriesId, normalized, limit, offset, requirePlayable: false);
        }

        public (string Title, string Provider, string PageUrl)? FindSeriesExpansionSeed(string seriesId)
        {
            using var connection = Open();
            var normalized = QueryOne(
                connection,
                "SELECT normalized_title FROM series WHERE id=$id LIMIT 1",
                ("$id", seriesId ?? string.Empty)
            )?["normalized_title"] ?? string.Empty;
            if (string.IsNullOrWhiteSpace(normalized))
                normalized = Normalize(seriesId ?? string.Empty);

            var row = QueryOne(connection, @"
SELECT s.title,
       CASE WHEN IFNULL(s.source_provider,'')<>'' THEN s.source_provider ELSE so.provider END provider,
       so.page_url
FROM series s
JOIN work_series ws ON ws.series_id=s.id
JOIN editions e ON e.work_id=ws.work_id
JOIN sources so ON so.edition_id=e.id
WHERE (s.id=$id OR s.normalized_title=$normalized)
  AND IFNULL(so.page_url,'')<>''
ORDER BY
  CASE WHEN so.provider='akniga' THEN 0 ELSE 1 END,
  CASE WHEN so.provider=s.source_provider THEN 0 ELSE 1 END,
  ws.rowid
LIMIT 1", ("$id", seriesId ?? string.Empty), ("$normalized", normalized));
            if (row == null)
                return null;
            return (row["title"], row["provider"], row["page_url"]);
        }

        private List<AudioFdbWork> ListWorksByRelation(string relationWhere, string id, string normalized, int limit, int offset, bool newestFirst = false, bool requirePlayable = true)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            offset = Math.Max(0, offset);
            var take = Math.Min(Math.Max((offset + limit) * 5, limit * 8), 5000);
            var query = string.IsNullOrWhiteSpace(normalized) ? "%" + (id ?? string.Empty) + "%" : "%" + normalized + "%";

            List<string> ids;
            using (var connection = Open())
            {
                var order = newestFirst
                    ? "w.created_at DESC,w.updated_at DESC,"
                    : string.Empty;
                var availability = requirePlayable
                    ? @"EXISTS (
    SELECT 1 FROM editions e
    JOIN sources s ON s.edition_id=e.id
    JOIN chapters c ON c.source_id=s.id
    WHERE e.work_id=w.id AND IFNULL(c.audio_url,'')<>''
)"
                    : @"EXISTS (
    SELECT 1 FROM editions e
    JOIN sources s ON s.edition_id=e.id
    WHERE e.work_id=w.id AND IFNULL(s.page_url,'')<>''
)";
                ids = Query(connection, @"
SELECT w.id
FROM works w
WHERE " + availability + @"
AND " + relationWhere + @"
ORDER BY
    " + order + @"
    COALESCE((SELECT MAX(e.quality_score) FROM editions e WHERE e.work_id = w.id), 0) DESC,
    COALESCE((SELECT s.title FROM work_series ws JOIN series s ON s.id = ws.series_id WHERE ws.work_id = w.id LIMIT 1), w.title),
    w.title
LIMIT $take", ("$id", id), ("$query", query), ("$take", take))
                    .Select(row => row["id"])
                    .ToList();
            }

            var result = new List<AudioFdbWork>();
            foreach (var workId in ids)
            {
                var work = GetWork(workId);
                if (work != null)
                    result.Add(work);
            }

            return DeduplicateWorks(result).Skip(offset).Take(limit).ToList();
        }

        public List<AudioFdbWork> ListWorksMissingPosters(int limit)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 12 : limit, 50));
            var now = DateTimeOffset.UtcNow.ToString("O");
            List<string> ids;
            using (var connection = Open())
            {
                ids = Query(connection, @"
SELECT w.id
FROM works w
LEFT JOIN cover_lookup_cache cc ON cc.work_id=w.id
WHERE (
    TRIM(IFNULL(w.poster_url,''))='' OR
    w.poster_url LIKE 'data:image%' OR
    w.poster_url LIKE '%/images/poster.png%'
)
AND (cc.work_id IS NULL OR cc.next_retry_at<=$now)
AND EXISTS (
    SELECT 1 FROM editions e
    JOIN sources s ON s.edition_id=e.id
    JOIN chapters c ON c.source_id=s.id
    WHERE e.work_id=w.id AND IFNULL(c.audio_url,'')<>''
)
ORDER BY w.updated_at DESC,w.created_at DESC
LIMIT $limit", ("$now", now), ("$limit", limit))
                    .Select(row => row["id"])
                    .ToList();
            }

            return ids
                .Select(id => GetWork(id))
                .Where(work => work != null)
                .Cast<AudioFdbWork>()
                .ToList();
        }

        public void RecordCoverLookup(AudioFdbWork work, string provider, string coverUrl)
        {
            if (work == null || string.IsNullOrWhiteSpace(work.id))
                return;
            lock (WriteSync)
            {
            var now = DateTimeOffset.UtcNow;
            var found = !string.IsNullOrWhiteSpace(coverUrl);
            var retrySoon = !found && provider.Equals("retry", StringComparison.OrdinalIgnoreCase);
            var author = work.authors.FirstOrDefault(person => !IsLikelyBadPersonName(person.display_name))?.display_name ?? string.Empty;
            var lookupKey = StableHash(Normalize(work.title) + "|" + Normalize(author));
            using var connection = Open();
            using var tx = connection.BeginTransaction();
            Exec(connection, tx, @"
INSERT INTO cover_lookup_cache(work_id,lookup_key,provider,cover_url,status,attempted_at,next_retry_at)
VALUES($work,$key,$provider,$url,$status,$attempted,$retry)
ON CONFLICT(work_id) DO UPDATE SET
lookup_key=$key,provider=$provider,cover_url=$url,status=$status,attempted_at=$attempted,next_retry_at=$retry",
                ("$work", work.id),
                ("$key", lookupKey),
                ("$provider", provider ?? string.Empty),
                ("$url", coverUrl ?? string.Empty),
                ("$status", found ? "found" : retrySoon ? "retry" : "not_found"),
                ("$attempted", now.ToString("O")),
                ("$retry", (found ? now.AddYears(5) : retrySoon ? now.AddHours(48) : now.AddDays(7)).ToString("O")));
            if (found)
            {
                Exec(connection, tx, @"
UPDATE works SET poster_url=$url,updated_at=$now
WHERE id=$work AND (
    TRIM(IFNULL(poster_url,''))='' OR
    poster_url LIKE 'data:image%' OR
    poster_url LIKE '%/images/poster.png%'
)", ("$url", coverUrl), ("$now", now.ToString("O")), ("$work", work.id));
            }
            tx.Commit();
            }
        }

        public Dictionary<string, long> CoverLookupStats()
        {
            using var connection = Open();
            var rows = Query(connection, @"
SELECT status,COUNT(*) count
FROM cover_lookup_cache
GROUP BY status");
            return rows.ToDictionary(
                row => row["status"],
                row => ToLong(row["count"]),
                StringComparer.OrdinalIgnoreCase
            );
        }

        public AudioFdbEdition? GetEdition(string id)
        {
            using var connection = Open();
            var row = QueryOne(connection, "SELECT work_id FROM editions WHERE id=$id", ("$id", id));
            if (row == null) return null;
            return GetWork(row["work_id"])?.editions.FirstOrDefault(e => string.Equals(e.id, id, StringComparison.OrdinalIgnoreCase));
        }

        public AudioFdbChapter? GetChapter(string editionId, int chapterIndex)
        {
            var edition = GetEdition(editionId);
            return edition?.sources.SelectMany(s => s.chapters).FirstOrDefault(c => c.chapter_index == chapterIndex);
        }

        public void InsertCrawlerRun(DateTimeOffset startedAt, DateTimeOffset finishedAt, string query, int offset, int providers, int parallelism, int works, string error)
        {
            lock (WriteSync)
            {
            using var connection = Open();
            Exec(connection, null, "INSERT INTO crawler_runs(id,started_at,finished_at,query,offset,providers,parallelism,works,error) VALUES($id,$started,$finished,$query,$offset,$providers,$parallelism,$works,$error)",
                ("$id", StableHash(startedAt.ToString("O") + "|" + query + "|" + offset)),
                ("$started", startedAt.ToString("O")),
                ("$finished", finishedAt.ToString("O")),
                ("$query", query),
                ("$offset", offset),
                ("$providers", providers),
                ("$parallelism", parallelism),
                ("$works", works),
                ("$error", error));
            PurgeCrawlerRuns(TimeSpan.FromDays(1));
            }
        }

        public void PurgeCrawlerRuns(TimeSpan retention)
        {
            lock (WriteSync)
            {
            using var connection = Open();
            var cutoff = DateTimeOffset.UtcNow.Subtract(retention).ToString("O");
            Exec(connection, null, "DELETE FROM crawler_runs WHERE finished_at < $cutoff", ("$cutoff", cutoff));
            }
        }

        public List<Dictionary<string, string>> ListCrawlerRuns(int limit)
        {
            using var connection = Open();
            return Query(connection, "SELECT started_at,finished_at,query,offset,providers,parallelism,works,error FROM crawler_runs ORDER BY finished_at DESC LIMIT $limit", ("$limit", Math.Max(1, Math.Min(limit, 50))));
        }

        private static void UpsertPerson(SqliteConnection connection, SqliteTransaction tx, AudioFdbPerson person, string now)
        {
            if (string.IsNullOrWhiteSpace(person.id)) return;
            Exec(connection, tx, "INSERT INTO persons(id,display_name,normalized_name,kind,created_at,updated_at) VALUES($id,$name,$normalized,$kind,$now,$now) ON CONFLICT(id) DO UPDATE SET display_name=$name,normalized_name=$normalized,kind=$kind,updated_at=$now",
                ("$id", person.id), ("$name", person.display_name), ("$normalized", Normalize(person.display_name)), ("$kind", person.kind), ("$now", now));
            Exec(connection, tx, "INSERT OR IGNORE INTO person_aliases(id,person_id,alias,normalized_alias,source_provider,confidence) VALUES($id,$person,$alias,$normalized,$provider,1.0)",
                ("$id", person.id + ":alias:" + StableHash(person.display_name)), ("$person", person.id), ("$alias", person.display_name), ("$normalized", Normalize(person.display_name)), ("$provider", person.source_provider));
        }

        private static void ReindexWork(SqliteConnection connection, SqliteTransaction tx, AudioFdbWork work)
        {
            try
            {
                Exec(connection, tx, "DELETE FROM search_fts WHERE work_id=$id", ("$id", work.id));
                Exec(connection, tx, "INSERT INTO search_fts(work_id,title,authors,narrators,genres,series) VALUES($id,$title,$authors,$narrators,$genres,$series)",
                    ("$id", work.id),
                    ("$title", work.title),
                    ("$authors", string.Join(" ", work.authors.Select(a => a.display_name))),
                    ("$narrators", string.Join(" ", work.editions.SelectMany(e => e.narrators).Select(n => n.display_name).Distinct())),
                    ("$genres", string.Join(" ", work.genres.Select(g => g.title))),
                    ("$series", work.series?.title ?? ""));
            }
            catch
            {
            }
        }

        private static void Exec(SqliteConnection connection, SqliteTransaction? tx, string sql, params (string Name, object? Value)[] args)
        {
            using var command = connection.CreateCommand();
            command.CommandText = sql;
            if (tx != null) command.Transaction = tx;
            foreach (var arg in args)
                command.Parameters.AddWithValue(arg.Name, arg.Value ?? DBNull.Value);
            command.ExecuteNonQuery();
        }

        private static Dictionary<string, string>? QueryOne(SqliteConnection connection, string sql, params (string Name, object? Value)[] args)
            => Query(connection, sql, args).FirstOrDefault();

        private static List<Dictionary<string, string>> Query(SqliteConnection connection, string sql, params (string Name, object? Value)[] args)
        {
            using var command = connection.CreateCommand();
            command.CommandText = sql;
            foreach (var arg in args)
                command.Parameters.AddWithValue(arg.Name, arg.Value ?? DBNull.Value);

            using var reader = command.ExecuteReader();
            var rows = new List<Dictionary<string, string>>();
            while (reader.Read())
            {
                var row = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < reader.FieldCount; i++)
                    row[reader.GetName(i)] = reader.IsDBNull(i) ? string.Empty : Convert.ToString(reader.GetValue(i)) ?? string.Empty;
                rows.Add(row);
            }
            return rows;
        }

        public static string Normalize(string value)
        {
            value = HttpUtility.HtmlDecode(value ?? string.Empty).ToLowerInvariant().Replace('ё', 'е');
            value = Regex.Replace(value, @"[^\p{L}\p{Nd}]+", " ").Trim();
            return Regex.Replace(value, @"\s+", " ");
        }

        public static bool IsUsableSeriesTitle(string value)
        {
            value = HttpUtility.HtmlDecode(value ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(value) || value.Length > 100)
                return false;

            var normalized = Normalize(value);
            if (string.IsNullOrWhiteSpace(normalized) || normalized == "\u0436\u0430\u043d\u0440\u044b")
                return false;
            if (Regex.IsMatch(normalized, "^(?:\u0430\\s+)?\u0436\u0430\u043d\u0440\\b", RegexOptions.IgnoreCase))
                return false;
            if (Regex.IsMatch(normalized, "\\b(litrpg|\u043b\u0438\u0442\u0440\u043f\u0433|\u0436\u0430\u043d\u0440\\w*)\\b", RegexOptions.IgnoreCase))
                return false;
            if (value.Length > 24 && Regex.IsMatch(normalized, "\\b\\d+\\s+(?:\u0434\u0435\u043d\u044c|\u0434\u043d\u044f|\u0434\u043d\u0435\u0439|\u0447\u0430\u0441|\u0447\u0430\u0441\u0430|\u0447\u0430\u0441\u043e\u0432|\u043c\u0438\u043d\u0443\u0442\u0430|\u043c\u0438\u043d\u0443\u0442\u044b|\u043c\u0438\u043d\u0443\u0442)\\s*$", RegexOptions.IgnoreCase))
                return false;
            if (Regex.IsMatch(normalized, "\\b(\u0441\u043b\u0443\u0448\u0430\u0442\u044c|\u0430\u0443\u0434\u0438\u043e\u043a\u043d\u0438\u0433|\u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435|\u043f\u0440\u0430\u0432\u0438\u043b\u0430|\u043f\u0440\u0430\u0432\u043e\u043e\u0431\u043b\u0430\u0434|\u043f\u0440\u043e\u0441\u043b\u0443\u0448\u0438\u0432|\u0434\u043b\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0441\u0442\u044c)\\b", RegexOptions.IgnoreCase))
                return false;
            if (normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length > 12)
                return false;
            if (Regex.IsMatch(normalized, "\\b(\u0432\u043f\u0435\u0447\u0430\u0442\u043b\u0435\u043d\u0438|\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u0435 \u0442\u0438\u043f\u0430|\u043e\u0437\u0432\u0443\u0447\u043a\u0430|\u043e\u0437\u0432\u0443\u0447\u0438\u043b)\\b", RegexOptions.IgnoreCase))
                return false;

            return true;
        }

        public static bool HasUsablePoster(string value)
        {
            value = (value ?? string.Empty).Trim();
            return !string.IsNullOrWhiteSpace(value) &&
                   !value.StartsWith("data:image", StringComparison.OrdinalIgnoreCase) &&
                   !value.Contains("/images/poster.png", StringComparison.OrdinalIgnoreCase) &&
                   !value.Contains("empty-poster", StringComparison.OrdinalIgnoreCase) &&
                   !value.Contains("no-cover", StringComparison.OrdinalIgnoreCase) &&
                   !value.Contains("nophoto", StringComparison.OrdinalIgnoreCase);
        }

        public static string StableHash(string value)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(value ?? string.Empty));
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }

        private static long ToLong(string value) => long.TryParse(value, out var result) ? result : 0;
        private static double ToDouble(string value) => double.TryParse(value, out var result) ? result : 0;
    }

    public sealed class AudioCoverEnricher
    {
        private static readonly SemaphoreSlim Gate = new(1, 1);
        private readonly AudioFdbStore _store;

        public AudioCoverEnricher(AudioFdbStore store)
        {
            _store = store;
        }

        public async Task<int> EnrichMissingAsync(int limit = 12)
        {
            if (!await Gate.WaitAsync(0))
                return 0;

            try
            {
                var works = _store.ListWorksMissingPosters(limit);
                if (works.Count == 0)
                    return 0;

                using var http = AudiobookModuleBase.CreateClient(useProxy: false);
                http.Timeout = TimeSpan.FromSeconds(12);
                http.DefaultRequestHeaders.UserAgent.Clear();
                http.DefaultRequestHeaders.UserAgent.ParseAdd("KnigaSlovo/2.0 (+https://github.com/ARST113/log/tree/main/audiobooks-backend)");
                http.DefaultRequestHeaders.Accept.Clear();
                http.DefaultRequestHeaders.Accept.ParseAdd("application/json,image/*;q=0.9,*/*;q=0.5");

                var found = 0;
                foreach (var work in works)
                {
                    if (AudioFdbStore.HasUsablePoster(work.poster_url))
                        continue;

                    var resolved = await ResolveAsync(http, work);
                    _store.RecordCoverLookup(work, resolved.Provider, resolved.Url);
                    if (!string.IsNullOrWhiteSpace(resolved.Url))
                        found++;

                    // Keep background enrichment polite and well below public API limits.
                    await Task.Delay(TimeSpan.FromMilliseconds(900));
                }

                return found;
            }
            finally
            {
                Gate.Release();
            }
        }

        public async Task<AudioFdbWork?> EnrichOneAsync(AudioFdbWork? work)
        {
            if (work == null || AudioFdbStore.HasUsablePoster(work.poster_url))
                return work;
            if (!await Gate.WaitAsync(0))
                return work;

            try
            {
                using var http = AudiobookModuleBase.CreateClient(useProxy: false);
                http.Timeout = TimeSpan.FromSeconds(10);
                http.DefaultRequestHeaders.UserAgent.Clear();
                http.DefaultRequestHeaders.UserAgent.ParseAdd("KnigaSlovo/2.0 (+https://github.com/ARST113/log/tree/main/audiobooks-backend)");
                var resolved = await ResolveAsync(http, work);
                _store.RecordCoverLookup(work, resolved.Provider, resolved.Url);
                return _store.GetWork(work.id) ?? work;
            }
            finally
            {
                Gate.Release();
            }
        }

        private static async Task<(string Provider, string Url)> ResolveAsync(HttpClient http, AudioFdbWork work)
        {
            var transientFailure = false;
            try
            {
                var openLibrary = await ResolveOpenLibraryAsync(http, work);
                if (!string.IsNullOrWhiteSpace(openLibrary))
                    return ("openlibrary", openLibrary);
            }
            catch
            {
                transientFailure = true;
            }

            try
            {
                var googleBooks = await ResolveGoogleBooksAsync(http, work);
                if (!string.IsNullOrWhiteSpace(googleBooks))
                    return ("google_books", googleBooks);
            }
            catch
            {
                transientFailure = true;
            }

            return (transientFailure ? "retry" : "none", string.Empty);
        }

        private static async Task<string> ResolveOpenLibraryAsync(HttpClient http, AudioFdbWork work)
        {
            var isbn = FindIsbn(work.description);
            if (!string.IsNullOrWhiteSpace(isbn))
            {
                var isbnCover = $"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false";
                using var coverResponse = await http.GetAsync(isbnCover, HttpCompletionOption.ResponseHeadersRead);
                if (coverResponse.IsSuccessStatusCode &&
                    (coverResponse.Content.Headers.ContentType?.MediaType ?? string.Empty)
                        .StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                    return isbnCover;
            }

            var author = PreferredAuthor(work);
            var url = "https://openlibrary.org/search.json?title=" + HttpUtility.UrlEncode(work.title) +
                      (string.IsNullOrWhiteSpace(author) ? string.Empty : "&author=" + HttpUtility.UrlEncode(author)) +
                      "&fields=cover_i,title,author_name&limit=5&lang=ru";
            using var response = await http.GetAsync(url);
            if ((int)response.StatusCode == 429 || (int)response.StatusCode >= 500)
                throw new HttpRequestException("Open Library temporarily unavailable: " + (int)response.StatusCode);
            if (!response.IsSuccessStatusCode)
                return string.Empty;

            var root = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
            foreach (var item in (root?["docs"] as JsonArray)?.OfType<JsonObject>() ?? Enumerable.Empty<JsonObject>())
            {
                var title = NodeText(item["title"]);
                var authors = (item["author_name"] as JsonArray)?.Select(NodeText).Where(value => !string.IsNullOrWhiteSpace(value)).ToList()
                              ?? new List<string>();
                if (!ReliableMatch(work.title, author, title, authors))
                    continue;
                if (!long.TryParse(NodeText(item["cover_i"]), out var coverId) || coverId <= 0)
                    continue;
                return $"https://covers.openlibrary.org/b/id/{coverId}-L.jpg?default=false";
            }

            return string.Empty;
        }

        private static async Task<string> ResolveGoogleBooksAsync(HttpClient http, AudioFdbWork work)
        {
            var author = PreferredAuthor(work);
            var query = "intitle:\"" + work.title + "\"" +
                        (string.IsNullOrWhiteSpace(author) ? string.Empty : " inauthor:\"" + author + "\"");
            var url = "https://www.googleapis.com/books/v1/volumes?q=" + HttpUtility.UrlEncode(query) +
                      "&maxResults=5&projection=lite";
            using var response = await http.GetAsync(url);
            if ((int)response.StatusCode == 429 || (int)response.StatusCode >= 500)
                throw new HttpRequestException("Google Books temporarily unavailable: " + (int)response.StatusCode);
            if (!response.IsSuccessStatusCode)
                return string.Empty;

            var root = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
            foreach (var item in (root?["items"] as JsonArray)?.OfType<JsonObject>() ?? Enumerable.Empty<JsonObject>())
            {
                var info = item["volumeInfo"] as JsonObject;
                if (info == null)
                    continue;
                var title = NodeText(info["title"]);
                var authors = (info["authors"] as JsonArray)?.Select(NodeText).Where(value => !string.IsNullOrWhiteSpace(value)).ToList()
                              ?? new List<string>();
                if (!ReliableMatch(work.title, author, title, authors))
                    continue;

                var images = info["imageLinks"] as JsonObject;
                if (images == null)
                    continue;
                foreach (var size in new[] { "extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail" })
                {
                    var image = NodeText(images[size]);
                    if (string.IsNullOrWhiteSpace(image))
                        continue;
                    if (image.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                        image = "https://" + image["http://".Length..];
                    return image;
                }
            }

            return string.Empty;
        }

        private static string PreferredAuthor(AudioFdbWork work)
            => work.authors
                .Select(person => person.display_name)
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;

        private static string FindIsbn(string text)
        {
            var match = Regex.Match(
                text ?? string.Empty,
                @"(?i)\b(?:ISBN(?:-1[03])?\s*:?\s*)?(?<isbn>(?:97[89][\s-]?)?(?:\d[\s-]?){9}[\dX])\b"
            );
            if (!match.Success)
                return string.Empty;
            var value = Regex.Replace(match.Groups["isbn"].Value, @"[\s-]", string.Empty).ToUpperInvariant();
            return value.Length is 10 or 13 ? value : string.Empty;
        }

        private static bool ReliableMatch(string wantedTitle, string wantedAuthor, string resultTitle, List<string> resultAuthors)
        {
            if (!TextMatches(wantedTitle, resultTitle, 0.68))
                return false;
            if (string.IsNullOrWhiteSpace(wantedAuthor))
                return true;
            return resultAuthors.Any(author => TextMatches(wantedAuthor, author, 0.6));
        }

        private static bool TextMatches(string left, string right, double minimumOverlap)
        {
            var a = AudioFdbStore.Normalize(left);
            var b = AudioFdbStore.Normalize(right);
            if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b))
                return false;
            if (a.Equals(b, StringComparison.OrdinalIgnoreCase))
                return true;
            if (Math.Min(a.Length, b.Length) >= 5 &&
                (a.Contains(b, StringComparison.OrdinalIgnoreCase) || b.Contains(a, StringComparison.OrdinalIgnoreCase)))
                return true;

            var leftTokens = a.Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(token => token.Length > 1).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var rightTokens = b.Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(token => token.Length > 1).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (leftTokens.Count == 0 || rightTokens.Count == 0)
                return false;
            var overlap = leftTokens.Intersect(rightTokens, StringComparer.OrdinalIgnoreCase).Count();
            return overlap / (double)Math.Max(leftTokens.Count, rightTokens.Count) >= minimumOverlap;
        }

        private static string NodeText(JsonNode? node)
        {
            if (node == null)
                return string.Empty;
            try { return node.GetValue<string>(); }
            catch { return node.ToString(); }
        }
    }

    public sealed class IzibukFdbProvider
    {
        private const string ProviderId = "izibuk_graphql";
        private const string Endpoint = "https://api.izib.uk/graphql/";
        private readonly AudioFdbStore _store;

        public IzibukFdbProvider(AudioFdbStore store)
        {
            _store = store;
        }

        public async Task<List<AudioFdbWork>> SearchAsync(string query, int limit, int offset)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            offset = Math.Max(0, offset);
            var gql = "{booksSearch(offset:" + offset + ",count:" + limit + ",q:\"" + EscapeGraphql(query ?? string.Empty) + "\"){count,items{id,name,urlName,defaultPoster,totalDuration,authors{id,name,surname},readers{id,name,surname},genre{id,name},serie{id,name,booksCount}}}}";
            var root = await QueryAsync(gql);
            var items = root?["data"]?["booksSearch"]?["items"]?.AsArray();
            var result = new List<AudioFdbWork>();
            if (items == null) return result;

            foreach (var item in items.OfType<JsonObject>())
            {
                var work = MapBookSummary(item);
                _store.UpsertWork(work);
                result.Add(work);
            }

            return result;
        }

        public async Task<AudioFdbWork?> GetBookAsync(string id)
        {
            id = CleanId(id);
            if (string.IsNullOrWhiteSpace(id)) return null;

            var gql = "{book(id:" + id + "){id,name,urlName,genre{id,name},serie{id,name,booksCount},serieIndex,authors{id,name,surname},readers{id,name,surname},files{full{id,index,title,fileName,duration,url,size},mobile{id,index,title,fileName,duration,url,size}},defaultPoster,defaultPosterMain,totalDuration,aboutBb,likes,dislikes}}";
            var root = await QueryAsync(gql);
            var book = root?["data"]?["book"] as JsonObject;
            if (book == null) return null;

            var work = MapBookDetail(book);
            _store.UpsertWork(work);
            return work;
        }

        public async Task<List<AudioFdbGenre>> GenresAsync()
        {
            var root = await QueryAsync("{genres{id,name,booksCount}}");
            return (root?["data"]?["genres"]?.AsArray() ?? new JsonArray())
                .OfType<JsonObject>()
                .Select(g => new AudioFdbGenre
                {
                    id = "genre:izibuk:" + Str(g, "id"),
                    title = Str(g, "name"),
                    source_provider = ProviderId,
                    source_external_id = Str(g, "id")
                })
                .Where(g => !string.IsNullOrWhiteSpace(g.title))
                .ToList();
        }

        public async Task<List<AudioFdbPerson>> AuthorsAsync(string query, int limit, int offset)
            => await PeopleAsync(string.IsNullOrWhiteSpace(query)
                ? "authors(offset:" + offset + ",count:" + limit + "){items{id,name,surname,booksCount}}"
                : "authorsSearch(offset:" + offset + ",count:" + limit + ",q:\"" + EscapeGraphql(query) + "\"){items{id,name,surname,booksCount}}", "author");

        public async Task<List<AudioFdbPerson>> ReadersAsync(string query, int limit, int offset)
            => await PeopleAsync(string.IsNullOrWhiteSpace(query)
                ? "readers(offset:" + offset + ",count:" + limit + "){items{id,name,surname,booksCount}}"
                : "readersSearch(offset:" + offset + ",count:" + limit + ",q:\"" + EscapeGraphql(query) + "\"){items{id,name,surname,booksCount}}", "narrator");

        public async Task<List<AudioFdbSeries>> SeriesAsync(string query, int limit, int offset)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 50 : limit, 100));
            offset = Math.Max(0, offset);
            var body = string.IsNullOrWhiteSpace(query)
                ? "series(offset:" + offset + ",count:" + limit + "){items{id,name,booksCount}}"
                : "seriesSearch(offset:" + offset + ",count:" + limit + ",q:\"" + EscapeGraphql(query) + "\"){items{id,name,booksCount}}";
            var root = await QueryAsync("{" + body + "}");
            var data = root?["data"] as JsonObject;
            var wrapper = data?.FirstOrDefault().Value as JsonObject;
            var node = wrapper?["items"]?.AsArray();
            return (node ?? new JsonArray()).OfType<JsonObject>().Select(s => new AudioFdbSeries
            {
                id = "series:izibuk:" + Str(s, "id"),
                title = Str(s, "name"),
                source_provider = ProviderId,
                source_external_id = Str(s, "id")
            }).Where(s => AudioFdbStore.IsUsableSeriesTitle(s.title)).ToList();
        }

        private async Task<List<AudioFdbPerson>> PeopleAsync(string body, string kind)
        {
            var root = await QueryAsync("{" + body + "}");
            var data = root?["data"] as JsonObject;
            var wrapper = data?.FirstOrDefault().Value as JsonObject;
            var node = wrapper?["items"]?.AsArray();
            return (node ?? new JsonArray()).OfType<JsonObject>().Select(p => MapPerson(p, kind)).Where(p => !string.IsNullOrWhiteSpace(p.display_name)).ToList();
        }

        private async Task<JsonObject?> QueryAsync(string query)
        {
            using var http = AudiobookModuleBase.CreateClient(useProxy: false);
            http.Timeout = TimeSpan.FromSeconds(15);
            http.DefaultRequestHeaders.UserAgent.ParseAdd("izimobile/1.11.17");
            http.DefaultRequestHeaders.Accept.ParseAdd("application/json, text/plain, */*");
            var url = Endpoint + "?query=" + HttpUtility.UrlEncode(query) + "&ru_audioknigi_app=1";
            var json = await http.GetStringAsync(url);
            return JsonNode.Parse(json)?.AsObject();
        }

        private static AudioFdbWork MapBookSummary(JsonObject item)
        {
            var id = Str(item, "id");
            var work = new AudioFdbWork
            {
                id = "work:izibuk:" + id,
                title = Str(item, "name"),
                normalized_title = AudioFdbStore.Normalize(Str(item, "name")),
                poster_url = Str(item, "defaultPoster"),
                description = string.Empty
            };

            AddPeople(work.authors, item["authors"]?.AsArray(), "author");
            AddGenre(work, item["genre"] as JsonObject);
            AddSeries(work, item["serie"] as JsonObject);

            var edition = BuildEdition(work.id, id, item);
            work.editions.Add(edition);
            return work;
        }

        private static AudioFdbWork MapBookDetail(JsonObject item)
        {
            var work = MapBookSummary(item);
            work.description = StripHtml(Str(item, "aboutBb"));
            work.poster_url = FirstNonEmpty(Str(item, "defaultPosterMain"), work.poster_url);

            var edition = work.editions.First();
            var source = edition.sources.First();
            var files = item["files"]?["full"]?.AsArray();
            if (files == null || files.Count == 0)
                files = item["files"]?["mobile"]?.AsArray();

            if (files != null)
            {
                foreach (var file in files.OfType<JsonObject>())
                {
                    var idx = Int(file, "index");
                    var url = Str(file, "url");
                    source.chapters.Add(new AudioFdbChapter
                    {
                        id = source.id + ":chapter:" + idx,
                        chapter_index = idx,
                        title = FirstNonEmpty(Str(file, "title"), Str(file, "fileName"), "Глава " + (idx + 1)),
                        duration_seconds = Long(file, "duration"),
                        audio_url = url,
                        proxy_url = "/audiobooks/audio?url=" + HttpUtility.UrlEncode(url)
                    });
                }
            }

            edition.chapter_count = source.chapters.Count;
            edition.chapter_fingerprint = string.Join(",", source.chapters.Select(c => c.duration_seconds));
            edition.quality_score = source.chapters.Count > 0 ? 1.0 : 0.45;
            return work;
        }

        private static AudioFdbEdition BuildEdition(string workId, string externalId, JsonObject item)
        {
            var editionId = "edition:izibuk:" + externalId;
            var edition = new AudioFdbEdition
            {
                id = editionId,
                work_id = workId,
                edition_type = "audiobook",
                duration_seconds = Long(item, "totalDuration"),
                quality_score = 0.55
            };
            AddPeople(edition.narrators, item["readers"]?.AsArray(), "narrator");
            edition.sources.Add(new AudioFdbSource
            {
                id = "source:izibuk:" + externalId,
                edition_id = editionId,
                provider = ProviderId,
                external_id = externalId,
                page_url = "https://izib.uk/book/" + FirstNonEmpty(Str(item, "urlName"), externalId),
                status = "ok"
            });
            return edition;
        }

        private static void AddPeople(List<AudioFdbPerson> target, JsonArray? arr, string kind)
        {
            if (arr == null) return;
            foreach (var item in arr.OfType<JsonObject>())
            {
                var person = MapPerson(item, kind);
                if (!string.IsNullOrWhiteSpace(person.display_name) && target.All(p => p.id != person.id))
                    target.Add(person);
            }
        }

        private static AudioFdbPerson MapPerson(JsonObject item, string kind)
        {
            var id = Str(item, "id");
            var name = (Str(item, "name") + " " + Str(item, "surname")).Trim();
            return new AudioFdbPerson
            {
                id = "person:izibuk:" + kind + ":" + id,
                display_name = name,
                kind = kind,
                source_provider = ProviderId,
                source_external_id = id
            };
        }

        private static void AddGenre(AudioFdbWork work, JsonObject? item)
        {
            if (item == null) return;
            var id = Str(item, "id");
            var title = Str(item, "name");
            if (string.IsNullOrWhiteSpace(title)) return;
            work.genres.Add(new AudioFdbGenre { id = "genre:izibuk:" + id, title = title, source_provider = ProviderId, source_external_id = id });
        }

        private static void AddSeries(AudioFdbWork work, JsonObject? item)
        {
            if (item == null) return;
            var id = Str(item, "id");
            var title = Str(item, "name");
            if (!AudioFdbStore.IsUsableSeriesTitle(title)) return;
            work.series = new AudioFdbSeries { id = "series:izibuk:" + id, title = title, source_provider = ProviderId, source_external_id = id };
        }

        private static string CleanId(string id)
            => (id ?? string.Empty).Replace("work:izibuk:", "", StringComparison.OrdinalIgnoreCase).Replace("edition:izibuk:", "", StringComparison.OrdinalIgnoreCase).Trim();

        private static string EscapeGraphql(string value)
            => (value ?? string.Empty).Replace("\\", "\\\\").Replace("\"", "\\\"");

        private static string Str(JsonObject item, string key)
            => item[key]?.GetValue<string>() ?? string.Empty;

        private static int Int(JsonObject item, string key)
        {
            try
            {
                var node = item[key];
                if (node == null) return 0;
                return int.TryParse(node.ToString(), out var s) ? s : 0;
            }
            catch { return 0; }
        }

        private static long Long(JsonObject item, string key)
        {
            try
            {
                var node = item[key];
                if (node == null) return 0;
                return long.TryParse(node.ToString(), out var s) ? s : 0;
            }
            catch { return 0; }
        }

        private static string FirstNonEmpty(params string[] values)
            => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;

        private static string StripHtml(string html)
        {
            if (string.IsNullOrWhiteSpace(html)) return string.Empty;
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return HttpUtility.HtmlDecode(doc.DocumentNode.InnerText.Trim());
        }
    }

    public sealed class RuBookFdbProviderSpec
    {
        public string id { get; init; } = string.Empty;
        public string root { get; init; } = string.Empty;
        public string mode { get; init; } = "get";
        public string search_url { get; init; } = string.Empty;
        public AudioBookHeadersProfile headers { get; init; } = AudioBookHeadersProfile.DefaultBrowser;
        public bool use_proxy { get; init; }
        public bool detail_only { get; init; }
        public bool metadata_only { get; init; }
        public string[] item_xpaths { get; init; } = Array.Empty<string>();
        public string[] link_xpaths { get; init; } = Array.Empty<string>();
        public string[] title_xpaths { get; init; } = Array.Empty<string>();
        public string[] image_xpaths { get; init; } = Array.Empty<string>();
        public string[] detail_title_xpaths { get; init; } = Array.Empty<string>();
        public string[] detail_description_xpaths { get; init; } = Array.Empty<string>();
        public string[] detail_image_xpaths { get; init; } = Array.Empty<string>();
    }

    public sealed class RuBookFdbProvider
    {
        private readonly AudioFdbStore _store;

        public RuBookFdbProvider(AudioFdbStore store)
        {
            _store = store;
        }

        public static readonly IReadOnlyDictionary<string, RuBookFdbProviderSpec> Specs = new Dictionary<string, RuBookFdbProviderSpec>(StringComparer.OrdinalIgnoreCase)
        {
            ["pda_izibuk_html"] = new RuBookFdbProviderSpec
            {
                id = "pda_izibuk_html",
                root = "https://pda.izib.uk",
                search_url = "https://pda.izib.uk/search?q={query}",
                headers = AudioBookHeadersProfile.PdaIzibuk,
                item_xpaths = new[] { "//*[starts-with(@id,'book')]", "//div[contains(@class,'_ccb9b7')]", "//div[contains(@class,'_cb0a41')]" },
                link_xpaths = new[] { ".//a[contains(@href,'/book') or contains(@href,'/art')][1]", ".//div[contains(@class,'_3dc935')]/a[1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'_3dc935')]/a[1]", ".//a[contains(@href,'/book') or contains(@href,'/art')][1]" },
                image_xpaths = new[] { ".//img[@src][1]", ".//img[@data-src][1]" },
                detail_title_xpaths = new[] { "//*[@itemprop='name'][1]", "//h1[1]", "//div[contains(@class,'_40d1c3')][1]" },
                detail_description_xpaths = new[] { "//*[@itemprop='description'][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'_306524')]//img[1]", "//img[@src][1]" }
            },
            ["archive_org"] = new RuBookFdbProviderSpec
            {
                id = "archive_org",
                root = "https://archive.org",
                search_url = "https://archive.org/advancedsearch.php",
                headers = AudioBookHeadersProfile.DefaultBrowser,
                detail_title_xpaths = new[] { "//h1[contains(@class,'item-title')][1]", "//*[@itemprop='name'][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[@id='descript'][1]", "//*[@itemprop='description'][1]" },
                detail_image_xpaths = new[] { "//img[contains(@class,'img-responsive')][@src][1]", "//img[@src][1]" }
            },
            ["audioboo_org"] = new RuBookFdbProviderSpec
            {
                id = "audioboo_org",
                root = "https://audioboo.org",
                mode = "dle",
                headers = AudioBookHeadersProfile.Audioboo,
                use_proxy = true,
                item_xpaths = new[] { "//article[contains(@class,'card')]" },
                link_xpaths = new[] { ".//a[contains(@class,'card__img')][1]", ".//h2[contains(@class,'card__title')]//a[1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//h2[contains(@class,'card__title')][1]", ".//a[@href][1]" },
                image_xpaths = new[] { ".//img[@data-src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//header[contains(@class,'page__header')]//h1[1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'page__text')][1]" },
                detail_image_xpaths = new[] { "//img[@data-src][1]", "//img[@src][1]" }
            },
            ["poleknig_com"] = new RuBookFdbProviderSpec
            {
                id = "poleknig_com",
                root = "https://poleknig.com",
                search_url = "https://poleknig.com/?q={query}&p={page}",
                headers = AudioBookHeadersProfile.PoleknigMp3,
                item_xpaths = new[] { "//div[contains(@class,'media')][.//a[contains(@class,'book-title')]]" },
                link_xpaths = new[] { ".//a[contains(@class,'book-title')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'book-title')][1]" },
                image_xpaths = new[] { ".//img[contains(@class,'cover') and @data-original][1]", ".//img[contains(@class,'cover') and @src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//div[contains(@class,'book-title')]//h1[1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'description')][1]" },
                detail_image_xpaths = new[] { "//img[contains(@class,'cover') and @data-original][1]", "//img[contains(@class,'cover') and @src][1]" }
            },
            ["otrub_in"] = new RuBookFdbProviderSpec
            {
                id = "otrub_in",
                root = "https://otrub.in",
                search_url = "https://otrub.in/search.html?q={query}&p={page}",
                use_proxy = true,
                item_xpaths = new[] { "//div[contains(@class,'_8a09a3')]", "//div[contains(@class,'_dad4fa')]" },
                link_xpaths = new[] { ".//a[contains(@class,'_3dc935')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'_3dc935')][1]", ".//div[contains(@class,'_b1f6b9')][1]" },
                image_xpaths = new[] { ".//img[@data-src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//*[@itemprop='name'][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//*[@itemprop='description'][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'_5e0b77')]//img[1]", "//img[@src][1]" }
            },
            ["slushat_knigi_com"] = new RuBookFdbProviderSpec
            {
                id = "slushat_knigi_com",
                root = "https://slushat-knigi.com",
                mode = "dle",
                headers = AudioBookHeadersProfile.SlushatMp3,
                use_proxy = true,
                item_xpaths = new[] { "//div[contains(@class,'sect__content')]//a[contains(@class,'poster-item')]", "//a[contains(@class,'poster-item')]" },
                link_xpaths = new[] { ".//self::a[@href]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'poster-item__title')][1]", ".//self::a[1]" },
                image_xpaths = new[] { ".//img[@data-src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//header[contains(@class,'page__header')]//h1[1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'page__text')][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'page__poster')]//img[1]", "//img[@data-src][1]", "//img[@src][1]" }
            },
            ["slushkinvsem_ru"] = new RuBookFdbProviderSpec
            {
                id = "slushkinvsem_ru",
                root = "https://slushkinvsem.ru",
                mode = "dle",
                headers = AudioBookHeadersProfile.Slushkinvsem,
                use_proxy = true,
                item_xpaths = new[] { "//div[contains(@class,'thumb-in')]", "//a[contains(@class,'poster')]" },
                link_xpaths = new[] { ".//a[contains(@class,'thumb-caption')][1]", ".//a[contains(@class,'poster')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'thumb-caption')][1]", ".//h3[contains(@class,'poster__title')][1]" },
                image_xpaths = new[] { ".//img[@src][1]", ".//img[@data-src][1]" },
                detail_title_xpaths = new[] { "//h1[1]", "//h3[contains(@class,'poster__title')][1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'notaval')][1]", "//div[contains(@class,'full-text')][1]" },
                detail_image_xpaths = new[] { "//img[@src][1]" }
            },
            ["audioknigi_pro"] = new RuBookFdbProviderSpec
            {
                id = "audioknigi_pro",
                root = "https://audioknigi.pro",
                mode = "dle",
                headers = AudioBookHeadersProfile.AudioknigiPro,
                use_proxy = true,
                item_xpaths = new[] { "//div[@id='pages-load']//div[contains(@class,'short')]", "//div[contains(@class,'short') and contains(@class,'short-nm')]" },
                link_xpaths = new[] { ".//a[contains(@class,'btn-short-listen')][1]", ".//a[contains(@class,'name-kniga')][1]", ".//div[contains(@class,'short-img')]//a[1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'name-kniga')][1]", ".//img[@alt][1]" },
                image_xpaths = new[] { ".//div[contains(@class,'short-img')]//img[@data-src][1]", ".//div[contains(@class,'short-img')]//img[@src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//h1[1]", "//a[contains(@class,'name-kniga')][1]", "//img[@alt][1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'short-text')][1]", "//div[contains(@class,'full-text')][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'short-img')]//img[1]", "//img[@src][1]" }
            },
            ["audioknigivse_ru"] = new RuBookFdbProviderSpec
            {
                id = "audioknigivse_ru",
                root = "https://audioknigivse.ru",
                mode = "dle",
                use_proxy = true,
                item_xpaths = new[] { "//a[contains(@class,'sres-wrap')]", "//div[contains(@class,'short-item')]" },
                link_xpaths = new[] { ".//self::a[@href]", ".//a[contains(@class,'short-link')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'sres-text')][1]", ".//a[contains(@class,'short-link')][1]" },
                image_xpaths = new[] { ".//div[contains(@class,'sres-img')]//img[@src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//header[contains(@class,'short-head')]//h1[1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'mov-desc')][1]", "//div[contains(@class,'full-text')][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'f-mov-img')]//img[1]", "//img[@src][1]" }
            },
            ["aume_ru"] = new RuBookFdbProviderSpec
            {
                id = "aume_ru",
                root = "https://aume.ru",
                mode = "yandex",
                search_url = "https://yandex.ru/search/site/?searchid=2529512&text={query}&web=0&l10n=ru",
                use_proxy = true,
                item_xpaths = new[] { "//div[contains(@class,'b-serp-item__content')]", "//div[contains(@class,'blog_item_block')]" },
                link_xpaths = new[] { ".//a[contains(@class,'b-serp-item__title-link')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'b-serp-item__title-link')][1]", ".//img[@alt][1]" },
                image_xpaths = new[] { ".//div[contains(@class,'simg')]//img[@data-src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//h1[contains(@class,'ftitle')][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'text-justify')][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'fposter')]//img[1]", "//img[@src][1]" }
            },
            ["knigoblud_club"] = new RuBookFdbProviderSpec
            {
                id = "knigoblud_club",
                root = "https://www.knigoblud.club",
                search_url = "https://knigoblud.club/search?q={query}&page={page}",
                item_xpaths = new[] { "//div[contains(@class,'bookListItem')]", "//div[@id='BL']//div[starts-with(@id,'book')]" },
                link_xpaths = new[] { ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'bookListItemCoverNameText')][1]", ".//span[contains(@class,'item__author')]/preceding::a[1]", ".//a[@href][1]" },
                image_xpaths = new[] { ".//div[contains(@class,'bookListItemCoverImg') and @data-img][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//div[contains(@class,'PageTitle')]/h1[1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'BookDescriptionContent')][1]" },
                detail_image_xpaths = new[] { "//div[@id='BookCover']//img[1]", "//img[@src][1]" }
            },
            ["baza_knig_rip"] = new RuBookFdbProviderSpec
            {
                id = "baza_knig_rip",
                root = "https://baza-knig.top",
                mode = "dle",
                headers = AudioBookHeadersProfile.BazaMp3,
                use_proxy = true,
                item_xpaths = new[] { "//div[contains(@class,'short')]" },
                link_xpaths = new[] { ".//div[contains(@class,'short-title')]//a[1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'short-title')][1]", ".//a[@href][1]" },
                image_xpaths = new[] { ".//div[contains(@class,'short-img')]//img[@data-src][1]", ".//div[contains(@class,'short-img')]//img[@src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//meta[@property='og:title']", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'short-text')][1]", "//meta[@name='description']" },
                detail_image_xpaths = new[] { "//div[contains(@class,'full-img')]//img[1]", "//img[@data-src][1]", "//img[@src][1]" }
            },
            ["uknig_com"] = new RuBookFdbProviderSpec
            {
                id = "uknig_com",
                root = "https://uknig.com",
                search_url = "https://uknig.com/?q={query}&p={page}",
                item_xpaths = new[] { "//div[contains(@class,'col-xs-12')][.//a[contains(@class,'book-title')]]" },
                link_xpaths = new[] { ".//a[contains(@class,'book-title')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'book-title')][1]" },
                image_xpaths = new[] { ".//img[contains(@class,'cover') and @data-original][1]", ".//img[contains(@class,'cover') and @src][1]" },
                detail_title_xpaths = new[] { "//div[contains(@class,'book-title')]//h1[1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'description')][1]" },
                detail_image_xpaths = new[] { "//img[contains(@class,'cover') and @data-original][1]", "//img[contains(@class,'cover') and @src][1]" }
            },
            ["mp3knig_net"] = new RuBookFdbProviderSpec
            {
                id = "mp3knig_net",
                root = "https://mp3knig.net",
                mode = "dle",
                item_xpaths = new[] { "//article[contains(@class,'movie-box')]" },
                link_xpaths = new[] { ".//a[@href][1]" },
                title_xpaths = new[] { ".//img[@alt][1]", ".//a[@href][1]" },
                image_xpaths = new[] { ".//div[contains(@class,'img')]//img[@src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//h1[1]", "//div[contains(@class,'film')][1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'description')][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'img')]//img[1]", "//img[@src][1]" }
            },
            ["audiokniga_one"] = new RuBookFdbProviderSpec
            {
                id = "audiokniga_one",
                root = "https://audiokniga.one",
                mode = "dle",
                headers = AudioBookHeadersProfile.AudioknigaOne,
                use_proxy = true,
                item_xpaths = new[] { "//div[contains(@class,'short-item')]", "//div[@id='dle-content']//a[contains(@class,'short-title')]" },
                link_xpaths = new[] { ".//a[contains(@class,'short-title')][1]", ".//self::a[@href]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'short-title')][1]", ".//div[contains(@class,'hide-on-mobile')][1]" },
                image_xpaths = new[] { ".//img[contains(@class,'xfieldimage') and @data-img][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//h1[contains(@class,'b_short-title')][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'fullstory')][1]" },
                detail_image_xpaths = new[] { "//img[contains(@class,'xfieldimage')][1]", "//img[@data-src][1]", "//img[@src][1]" }
            },
            ["listenbook_ru"] = new RuBookFdbProviderSpec
            {
                id = "listenbook_ru",
                root = "https://listenbook.ru",
                mode = "dle",
                use_proxy = true,
                item_xpaths = new[] { "//div[contains(@class,'main-news')]" },
                link_xpaths = new[] { ".//div[contains(@class,'main-news-title')]//a[1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'main-news-title')][1]" },
                image_xpaths = new[] { ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//div[contains(@class,'full-news-title')][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'full-news-cat')][1]", "//div[contains(@class,'full-news-text')][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'full-news-image')]//img[1]", "//img[@src][1]" }
            },
            ["lis10book_com"] = new RuBookFdbProviderSpec
            {
                id = "lis10book_com",
                root = "https://lis10book.com",
                mode = "lis10",
                search_url = "https://lis10book.com/audio/?_post_type_search_box={query}",
                item_xpaths = new[] { "//div[contains(@class,'col-6')]" },
                link_xpaths = new[] { ".//a[contains(@href,'/audio/')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'p-2')][1]", ".//a[@href][1]" },
                image_xpaths = new[] { ".//img[@data-lazy-src][1]", ".//img[@data-src][1]", ".//img[@src][1]" },
                detail_title_xpaths = new[] { "//h1[contains(@class,'d-inline-block')][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'description')][1]" },
                detail_image_xpaths = new[] { "//meta[@property='og:image'][1]", "//img[@data-lazy-src][1]", "//img[@data-src][1]", "//img[@src][1]" }
            },
            ["m_knigavuhe_org"] = new RuBookFdbProviderSpec
            {
                id = "m_knigavuhe_org",
                root = "https://m.knigavuhe.org",
                detail_only = true,
                detail_title_xpaths = new[] { "//div[contains(@class,'book_title')][1]", "//*[@itemprop='name'][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//*[@itemprop='description'][1]" },
                detail_image_xpaths = new[] { "//div[contains(@class,'book_about_cover')]//img[1]", "//img[@src][1]" }
            },
            ["audiopolka_club"] = new RuBookFdbProviderSpec
            {
                id = "audiopolka_club",
                root = "https://audiopolka.club",
                search_url = "https://audiopolka.club/search/?q={query}",
                item_xpaths = new[] { "//div[contains(@class,'book-list-item')][.//a[contains(@class,'book-list-item-name-link')]]" },
                link_xpaths = new[] { ".//a[contains(@class,'book-list-item-name-link')][1]", ".//a[contains(@class,'book-list-item-cover')][1]" },
                title_xpaths = new[] { ".//a[contains(@class,'book-list-item-name-link')][1]", ".//a[contains(@class,'book-list-item-cover')]//img[@alt][1]" },
                image_xpaths = new[] { ".//a[contains(@class,'book-list-item-cover')]//img[@data-src][1]", ".//a[contains(@class,'book-list-item-cover')]//img[@src][1]" },
                detail_title_xpaths = new[] { "//div[contains(@class,'book-page-title')][1]", "//h1[1]" },
                detail_description_xpaths = new[] { "//div[contains(@class,'book-page-annotation')][1]" },
                detail_image_xpaths = new[] { "//div[@id='book-page-cover']//img[1]", "//img[@src][1]" }
            },
            ["author_today"] = new RuBookFdbProviderSpec
            {
                id = "author_today",
                root = "https://author.today",
                mode = "metadata",
                metadata_only = true,
                search_url = "https://author.today/search?category=works&q={query}",
                item_xpaths = new[] { "//div[contains(@class,'book-row')]", "//div[contains(@class,'search-results')]//div[contains(@class,'one')]" },
                link_xpaths = new[] { ".//a[contains(@href,'/work')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//div[contains(@class,'book-title')][1]", ".//div[contains(@class,'title')][1]", ".//a[@href][1]" }
            },
            ["fantlab_ru"] = new RuBookFdbProviderSpec
            {
                id = "fantlab_ru",
                root = "https://fantlab.ru",
                mode = "metadata",
                metadata_only = true,
                search_url = "https://fantlab.ru/searchmain?searchstr={query}",
                item_xpaths = new[] { "//div[contains(@class,'search-result')]", "//table[contains(@class,'search')]//tr[.//a]" },
                link_xpaths = new[] { ".//a[contains(@href,'/work')][1]", ".//a[@href][1]" },
                title_xpaths = new[] { ".//a[contains(@href,'/work')][1]", ".//a[@href][1]" }
            }
        };

        public bool CanSearch(string provider)
            => Specs.TryGetValue(provider ?? string.Empty, out var spec) && !spec.detail_only && !spec.metadata_only;

        public bool CanResolve(string provider)
            => Specs.ContainsKey(provider ?? string.Empty);

        public async Task<List<AudioFdbWork>> SearchAsync(string provider, string query, int limit, int offset)
        {
            if (!Specs.TryGetValue(provider ?? string.Empty, out var spec) || spec.detail_only || spec.metadata_only)
                return new List<AudioFdbWork>();

            if (spec.id == "archive_org")
                return await SearchArchiveAsync(query, limit, offset);

            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            offset = Math.Max(0, offset);
            var page = Math.Max(1, (offset / limit) + 1);
            var html = spec.mode == "dle"
                ? await PostDleSearchAsync(spec, query, offset + 1)
                : await GetStringAsync(BuildSearchUrl(spec, query, page), spec);

            var works = ParseSearchHtml(spec, html, limit, offset);
            foreach (var work in works)
                _store.UpsertWork(work);
            return works;
        }

        public async Task<AudioFdbWork?> ResolveAsync(string provider, string url)
        {
            if (!Specs.TryGetValue(provider ?? string.Empty, out var spec) || string.IsNullOrWhiteSpace(url))
                return null;

            if (spec.id == "archive_org")
                return await ResolveArchiveAsync(url);

            var html = await GetStringAsync(url, spec);
            var work = await ParseDetailHtmlAsync(spec, url, html);
            if (work != null) _store.UpsertWork(work);
            return work;
        }

        public async Task<AudioFdbWork?> EnrichMetadataAsync(AudioFdbWork? work)
        {
            if (work == null || string.IsNullOrWhiteSpace(work.title) || work.authors.Count > 0)
                return work;

            foreach (var provider in new[] { "author_today", "fantlab_ru" })
            {
                if (!Specs.TryGetValue(provider, out var spec))
                    continue;
                try
                {
                    var html = await GetStringAsync(BuildSearchUrl(spec, work.title, 1), spec);
                    var doc = LoadDocument(html);
                    var nodes = provider == "fantlab_ru"
                        ? SelectNodes(doc.DocumentNode, new[]
                        {
                            "//div[contains(@class,'search-block') and contains(@class,'works')]//div[contains(concat(' ',normalize-space(@class),' '),' one ')]"
                        })
                        : SelectNodes(doc.DocumentNode, new[]
                        {
                            "//div[contains(@class,'book-row')]",
                            "//div[contains(@class,'book-item')][.//a[contains(@href,'/work')]]"
                        });

                    foreach (var node in nodes.Take(12))
                    {
                        var titleNode = provider == "fantlab_ru"
                            ? FirstNode(node, new[] { ".//div[contains(@class,'title')]//a[contains(@href,'/work')][1]" })
                            : FirstNode(node, new[] { ".//a[contains(@href,'/work/') or starts-with(@href,'/work')][1]" });
                        var candidateTitle = SafeText(titleNode);
                        if (!MetadataTitleMatches(work.title, candidateTitle))
                            continue;

                        var author = provider == "fantlab_ru"
                            ? TextsFromFirstXPath(node, new[] { ".//div[contains(@class,'autor')]//a" })
                            : TextsFromFirstXPath(node, new[] { ".//a[contains(@href,'/u/') or contains(@href,'/author/')]" });
                        foreach (var authorName in SplitPeople(author))
                        {
                            work.authors.Add(new AudioFdbPerson
                            {
                                id = "person:" + provider + ":author:" + AudioFdbStore.StableHash(authorName),
                                display_name = authorName,
                                kind = "author",
                                source_provider = provider
                            });
                        }
                        if (work.authors.Count > 0)
                        {
                            _store.UpsertWork(work);
                            return work;
                        }
                    }
                }
                catch
                {
                }
            }
            return work;
        }

        private static bool MetadataTitleMatches(string expected, string candidate)
        {
            string Primary(string value)
            {
                value = Clean(value);
                value = Regex.Split(value, @"\s+[/|]\s+").FirstOrDefault() ?? value;
                value = Regex.Replace(value, @"\s*\([^)]{1,80}\)\s*$", string.Empty).Trim();
                return AudioFdbStore.Normalize(value);
            }

            var left = Primary(expected);
            var right = Primary(candidate);
            return !string.IsNullOrWhiteSpace(left) &&
                !string.IsNullOrWhiteSpace(right) &&
                (left.Equals(right, StringComparison.OrdinalIgnoreCase) ||
                 (Math.Min(left.Length, right.Length) >= 8 &&
                  (left.StartsWith(right + " ", StringComparison.OrdinalIgnoreCase) ||
                   right.StartsWith(left + " ", StringComparison.OrdinalIgnoreCase))));
        }

        private List<AudioFdbWork> ParseSearchHtml(RuBookFdbProviderSpec spec, string html, int limit, int offset)
        {
            var doc = LoadDocument(html);
            var nodes = SelectNodes(doc.DocumentNode, spec.item_xpaths);
            if (!nodes.Any())
                nodes = SelectNodes(doc.DocumentNode, new[] { "//a[@href]" });

            var result = new List<AudioFdbWork>();
            var skipped = 0;
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var node in nodes)
            {
                var link = FirstNode(node, spec.link_xpaths) ?? (node.Name.Equals("a", StringComparison.OrdinalIgnoreCase) ? node : null);
                var url = AbsoluteUrl(spec.root, Attr(link, "href"));
                if (string.IsNullOrWhiteSpace(url) || !seen.Add(url)) continue;
                if (spec.id == "aume_ru" && !url.Contains("aume.ru", StringComparison.OrdinalIgnoreCase)) continue;
                if (spec.id == "otrub_in" && url.Contains("/search", StringComparison.OrdinalIgnoreCase)) continue;

                if (skipped++ < offset % Math.Max(1, limit)) continue;

                var titleNode = FirstNode(node, spec.title_xpaths) ?? link;
                var title = FirstNonEmpty(Attr(titleNode, "alt"), SafeText(titleNode), SafeText(link));
                if (string.IsNullOrWhiteSpace(title)) continue;

                var imageNode = FirstNode(node, spec.image_xpaths);
                var image = AbsoluteUrl(spec.root, FirstNonEmpty(Attr(imageNode, "data-original"), Attr(imageNode, "data-lazy-src"), Attr(imageNode, "data-src"), Attr(imageNode, "data-img"), Attr(imageNode, "src")));
                var text = SafeText(node);
                var author = FirstNonEmpty(
                    TextsFromFirstXPath(node, new[]
                    {
                        ".//*[@itemprop='author']//a",
                        ".//a[contains(@class,'author-link')]",
                        ".//a[contains(@class,'author-name')]",
                        ".//a[contains(@href,'/authors/') or contains(@href,'/author/')]"
                    }),
                    LabelValue(text, "Автор", "Писатель", "Автор:")
                );
                var reader = FirstNonEmpty(
                    TextsFromFirstXPath(node, new[]
                    {
                        ".//a[contains(@class,'reader-link')]",
                        ".//a[contains(@href,'/readers') or contains(@href,'/reader') or contains(@href,'/voice')]"
                    }),
                    LabelValue(text, "Исполнитель", "Читает", "Озвучивает", "Диктор")
                );
                var series = FirstNonEmpty(
                    TextsFromFirstXPath(node, new[] { ".//a[contains(@href,'/series/') or contains(@href,'/serie/')]" }),
                    LabelValue(text, "Цикл", "Серия", "Из цикла")
                );

                result.Add(BuildWork(spec.id, url, title, image, string.Empty, author, reader, series, new List<AudioFdbChapter>()));
                if (result.Count >= limit) break;
            }

            return result;
        }

        private async Task<AudioFdbWork?> ParseDetailHtmlAsync(RuBookFdbProviderSpec spec, string url, string html)
        {
            var doc = LoadDocument(html);
            var titleNode = FirstNode(doc.DocumentNode, spec.detail_title_xpaths);
            var descriptionNode = FirstNode(doc.DocumentNode, spec.detail_description_xpaths);
            var imageNode = FirstNode(doc.DocumentNode, spec.detail_image_xpaths);
            var text = SafeText(doc.DocumentNode);
            var title = FirstNonEmpty(Attr(titleNode, "content"), Attr(titleNode, "alt"), SafeText(titleNode), TitleFromUrl(url));
            var description = FirstNonEmpty(Attr(descriptionNode, "content"), SafeText(descriptionNode));
            var image = AbsoluteUrl(spec.root, FirstNonEmpty(Attr(imageNode, "data-original"), Attr(imageNode, "data-lazy-src"), Attr(imageNode, "data-src"), Attr(imageNode, "data-img"), Attr(imageNode, "src"), Attr(imageNode, "content")));
            var author = FirstNonEmpty(
                TextsFromFirstXPath(doc.DocumentNode, new[]
                {
                    "//*[@itemprop='author']//a",
                    "//*[@itemprop='author']",
                    "//*[@data-schema-author]//a",
                    "//*[contains(@class,'short-info-item')][contains(normalize-space(.),'Писатель')]//a",
                    "//li[.//span[contains(normalize-space(.),'Автор')]]//a",
                    "//div[contains(@class,'book-page-meta-line')]//a[contains(@href,'/author/')]",
                    "//a[contains(@class,'author-name')]"
                }),
                LabelValue(text, "Автор", "Писатель")
            );
            var reader = FirstNonEmpty(
                TextsFromFirstXPath(doc.DocumentNode, new[]
                {
                    "//div[contains(@class,'book-page-meta-line')][.//*[contains(normalize-space(.),'Диктор')]]//a",
                    "//div[contains(@class,'_8f5765')][contains(normalize-space(.),'Читает')]//a",
                    "//*[@data-schema-readby]//a",
                    "//*[contains(@class,'short-info-item')][contains(normalize-space(.),'Озвучивает')]//a",
                    "//li[.//span[contains(normalize-space(.),'Озвучка') or contains(normalize-space(.),'Читает')]]//a",
                    "//a[contains(@href,'/reader') or contains(@href,'/readers') or contains(@href,'/voice')]",
                    "//a[contains(@class,'reader-name')]"
                }),
                LabelValue(text, "Исполнитель", "Читает", "Озвучивает", "Диктор")
            );
            var series = FirstNonEmpty(
                TextsFromFirstXPath(doc.DocumentNode, new[]
                {
                    "//*[@itemprop='isPartOf']//a",
                    "//*[@data-schema-series]//a",
                    "//a[contains(@href,'/series/') or contains(@href,'/serie/')]"
                }),
                LabelValue(text, "Цикл", "Серия", "Входит в серию", "Из цикла")
            );
            var chapters = await ExtractChaptersAsync(spec, url, html, doc);
            return BuildWork(spec.id, url, title, image, description, author, reader, series, chapters);
        }

        private async Task<List<AudioFdbChapter>> ExtractChaptersAsync(RuBookFdbProviderSpec spec, string pageUrl, string html, HtmlDocument doc)
        {
            var chapters = new List<AudioFdbChapter>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var embeddedPlaylists = new List<string>();

            void Add(string rawUrl, string title, string duration)
            {
                var audioUrl = NormalizeAudioUrl(spec.root, rawUrl);
                if (string.IsNullOrWhiteSpace(audioUrl) || !seen.Add(audioUrl)) return;
                var idx = chapters.Count;
                chapters.Add(new AudioFdbChapter
                {
                    id = "chapter:" + AudioFdbStore.StableHash(pageUrl) + ":" + idx,
                    chapter_index = idx,
                    title = FirstNonEmpty(title, "Глава " + (idx + 1)),
                    duration_seconds = ParseDuration(duration),
                    audio_url = audioUrl,
                    proxy_url = "/audiobooks/audio?url=" + HttpUtility.UrlEncode(audioUrl)
                });
            }

            string JsonValueText(JsonNode? node)
            {
                if (node == null) return string.Empty;
                try { return node.GetValue<string>() ?? string.Empty; }
                catch { return node.ToJsonString().Trim('"'); }
            }

            foreach (var node in SelectNodes(doc.DocumentNode, new[] { "//*[@data-url or @data-file or @data-src or @src]" }))
            {
                var raw = FirstNonEmpty(Attr(node, "data-url"), Attr(node, "data-file"), Attr(node, "data-src"), Attr(node, "src"));
                if (!LooksLikeAudio(raw)) continue;
                Add(raw, FirstNonEmpty(Attr(node, "data-title"), Attr(node, "title"), SafeText(node)), Attr(node, "data-duration"));
            }

            foreach (var node in SelectNodes(doc.DocumentNode, new[] { "//*[@data-ap-encoded and @data-ap-id]" }))
            {
                var decoded = DecodeAudioknigiProPlaylist(Attr(node, "data-ap-encoded"), Attr(node, "data-ap-id"));
                if (!string.IsNullOrWhiteSpace(decoded))
                    embeddedPlaylists.Add(decoded);
            }

            foreach (Match m in Regex.Matches(html, @"(?is)KB\.playerInit\((?<json>\{.*?\})\)\s*;"))
            {
                try
                {
                    var player = JsonNode.Parse(m.Groups["json"].Value)?.AsObject();
                    foreach (var item in (player?["playlist"] as JsonArray ?? new JsonArray()).OfType<JsonObject>())
                    {
                        Add(
                            FirstNonEmpty(JsonValueText(item["src"]), JsonValueText(item["file"]), JsonValueText(item["url"])),
                            FirstNonEmpty(JsonValueText(item["title"]), JsonValueText(item["name"])),
                            FirstNonEmpty(JsonValueText(item["duration"]), JsonValueText(item["time"]))
                        );
                    }
                }
                catch
                {
                }
            }

            foreach (Match m in Regex.Matches(html, @"(?is)new\s+XSPlayer\((?<json>\{.*?\})\)\s*;"))
            {
                try
                {
                    var player = JsonNode.Parse(m.Groups["json"].Value)?.AsObject();
                    var prefix = JsonValueText(player?["mp3_url_prefix"]).Trim().TrimEnd('/');
                    if (!prefix.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                        !prefix.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                        prefix = "https://" + prefix.TrimStart('/');
                    var sign = JsonValueText(player?["sign"]);
                    foreach (var track in (player?["tracks"] as JsonArray ?? new JsonArray()).OfType<JsonArray>())
                    {
                        var title = track.Count > 1 ? JsonValueText(track[1]) : string.Empty;
                        var duration = track.Count > 2 ? JsonValueText(track[2]) : string.Empty;
                        var fileName = track.Count > 4 ? JsonValueText(track[4]) : string.Empty;
                        if (!string.IsNullOrWhiteSpace(fileName))
                            Add(prefix + "/" + fileName.TrimStart('/') + sign, title, duration);
                    }
                }
                catch
                {
                }
            }

            foreach (Match m in Regex.Matches(html, @"(?is)[""']?(?:file|url|src)[""']?\s*[:=]\s*[""'](?<url>[^""']+)[""'][^{}]{0,240}?(?:[""']?title[""']?\s*[:=]\s*[""'](?<title>[^""']+)[""'])?[^{}]{0,120}?(?:[""']?duration[""']?\s*[:=]\s*[""']?(?<duration>[0-9:.]+))?"))
            {
                var raw = m.Groups["url"].Value;
                if (!LooksLikeAudio(raw)) continue;
                Add(raw, JsDecode(m.Groups["title"].Value), m.Groups["duration"].Value);
            }

            foreach (Match m in Regex.Matches(html, @"(?is)(?:[""']?title[""']?\s*[:=]\s*[""'](?<title>[^""']+)[""'])[^{}]{0,240}?[""']?(?:file|url|src)[""']?\s*[:=]\s*[""'](?<url>[^""']+)[""'][^{}]{0,120}?(?:[""']?duration[""']?\s*[:=]\s*[""']?(?<duration>[0-9:.]+))?"))
            {
                var raw = m.Groups["url"].Value;
                if (!LooksLikeAudio(raw)) continue;
                Add(raw, JsDecode(m.Groups["title"].Value), m.Groups["duration"].Value);
            }

            foreach (Match m in Regex.Matches(html, @"(?is)strDecode\([""'](?<data>[^""']+)[""']\)"))
            {
                var decoded = JsDecode(m.Groups["data"].Value);
                foreach (Match u in Regex.Matches(decoded, @"(?is)(?:file|url|src)\s*[:=]\s*[""'](?<url>[^""']+)[""']"))
                    Add(u.Groups["url"].Value, string.Empty, string.Empty);
            }

            void AddPlaylistChapters(string playlistText)
            {
                if (string.IsNullOrWhiteSpace(playlistText))
                    return;

                try
                {
                    if (JsonNode.Parse(playlistText) is JsonArray array)
                    {
                        foreach (var item in array.OfType<JsonObject>())
                        {
                            var raw = FirstNonEmpty(JsonValueText(item["file"]), JsonValueText(item["url"]), JsonValueText(item["src"]));
                            if (string.IsNullOrWhiteSpace(raw)) continue;
                            Add(raw, FirstNonEmpty(JsonValueText(item["title"]), JsonValueText(item["name"])), FirstNonEmpty(JsonValueText(item["duration"]), JsonValueText(item["time"])));
                        }
                    }
                }
                catch { }

                if (chapters.Count > 0)
                    return;

                foreach (Match u in Regex.Matches(playlistText, @"(?is)(?:file|url|src)\s*[""']?\s*[:=]\s*[""'](?<url>[^""']+)[""'][^{}]{0,240}?(?:title\s*[""']?\s*[:=]\s*[""'](?<title>[^""']+)[""'])?[^{}]{0,120}?(?:duration\s*[""']?\s*[:=]\s*[""']?(?<duration>[0-9:.]+))?"))
                    Add(u.Groups["url"].Value, JsDecode(u.Groups["title"].Value), u.Groups["duration"].Value);
            }

            foreach (var playlist in embeddedPlaylists)
                AddPlaylistChapters(playlist);

            if (chapters.Count == 0)
            {
                var archiveIds = Regex.Matches(
                        html,
                        @"(?is)archive\.org/(?:embed|download)/(?<id>[^/?&""'<>\s]+)"
                    )
                    .Select(match => HttpUtility.HtmlDecode(match.Groups["id"].Value))
                    .Where(id => !string.IsNullOrWhiteSpace(id))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Take(4)
                    .ToList();

                foreach (var archiveId in archiveIds)
                {
                    try
                    {
                        var metadataText = await GetStringAsync(
                            "https://archive.org/metadata/" + HttpUtility.UrlEncode(archiveId),
                            Specs["archive_org"]
                        );
                        var files = JsonNode.Parse(metadataText)?["files"]?.AsArray();
                        foreach (var file in (files ?? new JsonArray()).OfType<JsonObject>())
                        {
                            var name = JsonValueText(file["name"]);
                            var format = JsonValueText(file["format"]);
                            if (string.IsNullOrWhiteSpace(name) ||
                                (!name.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase) &&
                                 !format.Contains("MP3", StringComparison.OrdinalIgnoreCase)))
                                continue;
                            var encodedName = string.Join("/", name.Split('/').Select(Uri.EscapeDataString));
                            Add(
                                "https://archive.org/download/" + archiveId + "/" + encodedName,
                                FirstNonEmpty(JsonValueText(file["title"]), name),
                                FirstNonEmpty(JsonValueText(file["length"]), JsonValueText(file["duration"]))
                            );
                        }
                    }
                    catch
                    {
                    }
                    if (chapters.Count > 0)
                        break;
                }
            }

            if (chapters.Count == 0)
            {
                foreach (var node in SelectNodes(doc.DocumentNode, new[] { "//meta[@property='og:audio' and @content]" }))
                    Add(Attr(node, "content"), string.Empty, string.Empty);
            }

            foreach (Match m in Regex.Matches(html, @"https?://[^""'\s<>]+\.txt(?:\?[^""'\s<>]+)?"))
            {
                if (chapters.Count > 0) break;
                try
                {
                    var playlistText = await GetStringAsync(m.Value, spec);
                    AddPlaylistChapters(playlistText);
                }
                catch { }
            }

            if (chapters.Count == 0 && spec.id == "lis10book_com")
            {
                var cover = FirstNonEmpty(
                    Attr(doc.DocumentNode.SelectSingleNode("//meta[@property='og:image'][1]"), "content"),
                    Attr(doc.DocumentNode.SelectSingleNode("//img[contains(@src,'_cover')][1]"), "src")
                );
                var playlistId = Regex.Match(
                    cover ?? string.Empty,
                    @"/(?<id>[^/_?]+)_cover",
                    RegexOptions.IgnoreCase
                ).Groups["id"].Value;
                if (!string.IsNullOrWhiteSpace(playlistId))
                {
                    try
                    {
                        var playlistUrl = spec.root.TrimEnd('/') +
                            "/wp-content/uploads/playlist/" + playlistId + ".txt";
                        AddPlaylistChapters(await GetStringAsync(playlistUrl, spec));
                    }
                    catch { }
                }
            }

            return chapters;
        }

        private async Task<string> GetStringAsync(string url, RuBookFdbProviderSpec spec)
        {
            async Task<string> Fetch(string target, bool useProxy)
            {
                using var http = AudiobookModuleBase.CreateClient(useProxy);
                http.Timeout = TimeSpan.FromSeconds(18);
                ConfigureHeaders(http, spec, target);
                using var response = await http.GetAsync(target);
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadAsStringAsync();
            }

            Exception? lastError = null;
            try
            {
                return await Fetch(url, spec.use_proxy);
            }
            catch (Exception ex)
            {
                lastError = ex;
            }

            if (spec.use_proxy && !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AUDIOBOOK_PROXY")))
            {
                try
                {
                    return await Fetch(url, false);
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }

            if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    return await Fetch("http://" + url.Substring("https://".Length), false);
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }

            throw lastError ?? new HttpRequestException("Источник не ответил: " + url);
        }

        private async Task<string> PostDleSearchAsync(RuBookFdbProviderSpec spec, string query, int resultFrom)
        {
            async Task<string> Post(string root, bool useProxy)
            {
                using var http = AudiobookModuleBase.CreateClient(useProxy);
                http.Timeout = TimeSpan.FromSeconds(18);
                ConfigureHeaders(http, spec, root);
                using var form = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["do"] = "search",
                    ["subaction"] = "search",
                    ["story"] = query ?? string.Empty,
                    ["search_start"] = "0",
                    ["result_from"] = Math.Max(1, resultFrom).ToString(),
                    ["full_search"] = "0",
                    ["search_star"] = "0",
                    ["titleonly"] = "3"
                });
                using var response = await http.PostAsync(root.TrimEnd('/') + "/index.php?do=search", form);
                response.EnsureSuccessStatusCode();
                return await response.Content.ReadAsStringAsync();
            }

            Exception? lastError = null;
            try
            {
                return await Post(spec.root, spec.use_proxy);
            }
            catch (Exception ex)
            {
                lastError = ex;
            }

            if (spec.use_proxy && !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AUDIOBOOK_PROXY")))
            {
                try
                {
                    return await Post(spec.root, false);
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }

            if (spec.root.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    return await Post("http://" + spec.root.Substring("https://".Length), false);
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }

            throw lastError ?? new HttpRequestException("Поиск источника не ответил: " + spec.id);
        }

        private async Task<List<AudioFdbWork>> SearchArchiveAsync(string query, int limit, int offset)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            var page = Math.Max(1, (offset / limit) + 1);
            var url = "https://archive.org/advancedsearch.php?q=" + HttpUtility.UrlEncode("title:(" + (query ?? string.Empty) + ") AND mediatype:(audio) AND NOT access-restricted-item:true") +
                      "&fl[]=description&fl[]=identifier&fl[]=mediatype&fl[]=title&fl[]=creator&rows=" + limit + "&page=" + page + "&output=json";
            var json = await GetStringAsync(url, Specs["archive_org"]);
            var docs = JsonNode.Parse(json)?["response"]?["docs"]?.AsArray();
            var result = new List<AudioFdbWork>();
            foreach (var item in (docs ?? new JsonArray()).OfType<JsonObject>())
            {
                var id = item["identifier"]?.GetValue<string>() ?? string.Empty;
                var title = item["title"]?.GetValue<string>() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(title)) continue;
                var authorNode = item["creator"];
                var author = authorNode is JsonArray arr ? arr.FirstOrDefault()?.GetValue<string>() ?? string.Empty : authorNode?.GetValue<string>() ?? string.Empty;
                var work = BuildWork("archive_org", "https://archive.org/details/" + id, title, "https://archive.org/services/img/" + id, StripHtml(item["description"]?.ToString() ?? string.Empty), author, string.Empty, string.Empty, new List<AudioFdbChapter>());
                result.Add(work);
                _store.UpsertWork(work);
            }
            return result;
        }

        private async Task<AudioFdbWork?> ResolveArchiveAsync(string url)
        {
            var id = url.TrimEnd('/').Split('/').LastOrDefault();
            if (string.IsNullOrWhiteSpace(id)) return null;
            var json = await GetStringAsync("https://archive.org/metadata/" + id, Specs["archive_org"]);
            var root = JsonNode.Parse(json)?.AsObject();
            var metadata = root?["metadata"]?.AsObject();
            var files = root?["files"]?.AsArray();
            if (metadata == null) return null;
            var authorNode = metadata["creator"];
            var author = authorNode is JsonArray arr ? arr.FirstOrDefault()?.GetValue<string>() ?? string.Empty : authorNode?.GetValue<string>() ?? string.Empty;
            var chapters = new List<AudioFdbChapter>();
            foreach (var f in (files ?? new JsonArray()).OfType<JsonObject>().Where(f => (f["format"]?.GetValue<string>() ?? "").Contains("MP3", StringComparison.OrdinalIgnoreCase)))
            {
                var name = f["name"]?.GetValue<string>() ?? string.Empty;
                var idx = chapters.Count;
                var audioUrl = "https://archive.org/download/" + id + "/" + name;
                chapters.Add(new AudioFdbChapter
                {
                    id = "chapter:archive:" + id + ":" + idx,
                    chapter_index = idx,
                    title = FirstNonEmpty(f["title"]?.GetValue<string>() ?? string.Empty, name, "Глава " + (idx + 1)),
                    duration_seconds = ParseDuration(f["length"]?.ToString() ?? string.Empty),
                    audio_url = audioUrl,
                    proxy_url = "/audiobooks/audio?url=" + HttpUtility.UrlEncode(audioUrl)
                });
            }
            var work = BuildWork("archive_org", "https://archive.org/details/" + id, metadata["title"]?.GetValue<string>() ?? id, "https://archive.org/services/img/" + id, StripHtml(metadata["description"]?.ToString() ?? string.Empty), author, string.Empty, string.Empty, chapters);
            _store.UpsertWork(work);
            return work;
        }

        private static AudioFdbWork BuildWork(string provider, string pageUrl, string title, string poster, string description, string author, string reader, string series, List<AudioFdbChapter> chapters)
        {
            var cleanTitle = Clean(title);
            var cleanDescription = Clean(description);
            var cleanAuthor = Clean(author);
            var cleanReader = Clean(reader);
            var cleanSeries = FirstNonEmpty(SeriesFromTitle(cleanTitle), CleanSeriesName(series));
            var workId = "work:" + provider + ":" + AudioFdbStore.StableHash(pageUrl);
            var editionId = "edition:" + provider + ":" + AudioFdbStore.StableHash(pageUrl + "|" + cleanReader);
            var sourceId = "source:" + provider + ":" + AudioFdbStore.StableHash(pageUrl);
            var work = new AudioFdbWork
            {
                id = workId,
                title = cleanTitle,
                normalized_title = AudioFdbStore.Normalize(cleanTitle),
                description = cleanDescription,
                poster_url = IsPlaceholderPoster(poster) ? string.Empty : poster
            };
            foreach (var authorName in SplitPeople(cleanAuthor))
                work.authors.Add(new AudioFdbPerson { id = "person:" + provider + ":author:" + AudioFdbStore.StableHash(authorName), display_name = authorName, kind = "author", source_provider = provider });
            if (!string.IsNullOrWhiteSpace(cleanSeries))
                work.series = new AudioFdbSeries { id = "series:" + provider + ":" + AudioFdbStore.StableHash(cleanSeries), title = cleanSeries, source_provider = provider };

            var edition = new AudioFdbEdition
            {
                id = editionId,
                work_id = workId,
                edition_type = "audiobook",
                chapter_count = chapters.Count,
                duration_seconds = chapters.Sum(c => c.duration_seconds),
                chapter_fingerprint = string.Join(",", chapters.Select(c => c.duration_seconds)),
                quality_score = chapters.Count > 0 ? 0.8 : 0.35
            };
            foreach (var readerName in SplitPeople(cleanReader))
                edition.narrators.Add(new AudioFdbPerson { id = "person:" + provider + ":narrator:" + AudioFdbStore.StableHash(readerName), display_name = readerName, kind = "narrator", source_provider = provider });

            var source = new AudioFdbSource { id = sourceId, edition_id = editionId, provider = provider, external_id = pageUrl, page_url = pageUrl, status = chapters.Count > 0 ? "ok" : "listed" };
            for (var i = 0; i < chapters.Count; i++)
            {
                chapters[i].id = sourceId + ":chapter:" + i;
                chapters[i].chapter_index = i;
                source.chapters.Add(chapters[i]);
            }
            edition.sources.Add(source);
            AudioFdbStore.SanitizeEditionNarrators(edition);
            work.editions.Add(edition);
            return work;
        }

        private static List<string> SplitPeople(string value)
        {
            var cleaned = Clean(value);
            if (string.IsNullOrWhiteSpace(cleaned))
                return new List<string>();

            var parts = Regex.Split(cleaned, @"\s*(?:,|;|\||/|\s+и\s+)\s*", RegexOptions.IgnoreCase)
                .Select(Clean)
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var plausible = parts.Where(part =>
            {
                var words = part.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                return words.Length >= 2 && words.Length <= 6 && !part.Any(char.IsDigit);
            }).ToList();
            return plausible.Count == parts.Count && plausible.Count > 0
                ? plausible
                : new List<string> { cleaned };
        }

        private static bool IsPlaceholderPoster(string value)
            => string.IsNullOrWhiteSpace(value) ||
               Regex.IsMatch(value, @"(?:empty[-_]?poster|no[-_]?cover|nophoto|/images/poster\.png)(?:[/?]|$)", RegexOptions.IgnoreCase);

        private static string BuildSearchUrl(RuBookFdbProviderSpec spec, string query, int page)
            => spec.search_url.Replace("{query}", HttpUtility.UrlEncode(query ?? string.Empty)).Replace("{page}", page.ToString());

        private static void ConfigureHeaders(HttpClient http, RuBookFdbProviderSpec spec, string url)
        {
            if (!http.DefaultRequestHeaders.UserAgent.Any())
                http.DefaultRequestHeaders.UserAgent.ParseAdd(spec.headers == AudioBookHeadersProfile.IziMp3 ? "izimobile/1.11.17" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36");
            if (!http.DefaultRequestHeaders.Accept.Any())
                http.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8");
            if (!http.DefaultRequestHeaders.AcceptLanguage.Any())
                http.DefaultRequestHeaders.AcceptLanguage.ParseAdd("ru-RU,ru;q=0.9,en;q=0.8");
            http.DefaultRequestHeaders.TryAddWithoutValidation("Dnt", "1");
            if (spec.id == "slushkinvsem_ru")
                http.DefaultRequestHeaders.TryAddWithoutValidation("Cookie", "beget=begetok");
            if (Uri.TryCreate(Root(url), UriKind.Absolute, out var referrer))
                http.DefaultRequestHeaders.Referrer = referrer;
        }

        private static HtmlDocument LoadDocument(string html)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html ?? string.Empty);
            return doc;
        }

        private static List<HtmlNode> SelectNodes(HtmlNode root, IEnumerable<string> xpaths)
        {
            var result = new List<HtmlNode>();
            foreach (var xpath in xpaths.Where(x => !string.IsNullOrWhiteSpace(x)))
            {
                try
                {
                    var nodes = root.SelectNodes(xpath);
                    if (nodes != null) result.AddRange(nodes);
                }
                catch { }
            }
            return result.Distinct().ToList();
        }

        private static string TextsFromFirstXPath(HtmlNode root, IEnumerable<string> xpaths)
        {
            foreach (var xpath in xpaths.Where(x => !string.IsNullOrWhiteSpace(x)))
            {
                try
                {
                    var nodes = root.SelectNodes(xpath);
                    if (nodes == null)
                        continue;
                    var values = nodes
                        .Select(SafeText)
                        .Where(value => !string.IsNullOrWhiteSpace(value))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .Take(12)
                        .ToList();
                    if (values.Count > 0)
                        return string.Join(", ", values);
                }
                catch
                {
                }
            }
            return string.Empty;
        }

        private static HtmlNode? FirstNode(HtmlNode root, IEnumerable<string> xpaths)
            => SelectNodes(root, xpaths).FirstOrDefault();

        private static string Attr(HtmlNode? node, string name)
        {
            if (node == null) return string.Empty;
            return HttpUtility.HtmlDecode(node.GetAttributeValue(name, string.Empty));
        }

        private static string SafeText(HtmlNode? node)
            => node == null ? string.Empty : Clean(node.InnerText);

        private static string Clean(string value)
            => Regex.Replace(HttpUtility.HtmlDecode(value ?? string.Empty), @"\s+", " ").Trim();

        private static string CleanSeriesName(string value)
        {
            var series = Clean(value);
            if (string.IsNullOrWhiteSpace(series))
                return string.Empty;
            if (Regex.IsMatch(series, @"^(?:\u0430\s*,?\s*)?\u0436\u0430\u043d\u0440\b", RegexOptions.IgnoreCase))
                return string.Empty;

            foreach (var pattern in new[]
            {
                @"^«(?<v>[^»]{2,90})»\s+\d+(?:[.,]\d+)?\.",
                @"^(?:а\s+)?«(?<v>[^»]{2,90})»,?\s+жанр\b",
                @"^(?:\u0430\s+)?[\u00ab""](?<v>[^\u00bb""]{2,90})[\u00bb""],?.{0,180}?\b\u0436\u0430\u043d\u0440\w*\b",
                @"^(?<v>[^:]{4,90}):\s+\d+(?:[.,]\d+)?\."
            })
            {
                var match = Regex.Match(series, pattern, RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    var candidate = CleanSeriesCandidate(match.Groups["v"].Value);
                    if (!string.IsNullOrWhiteSpace(candidate))
                        return candidate;
                }
            }

            series = Regex.Replace(series, @"^(?:Цикл|Серия|Входит в серию|Из цикла)\s*:?\s*", string.Empty, RegexOptions.IgnoreCase);
            foreach (var marker in new[]
            {
                "Слушать аудиокнигу", "Описание аудиокниги", "Правила сайта", "Аудиокниги слушать онлайн",
                "Прослушиваний", "Отзывы", "Оценить", "Длительность"
            })
            {
                var index = series.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
                if (index > 0)
                    series = series[..index];
            }

            series = Regex.Replace(series, @"\s+\d+\s*(?:час(?:а|ов)?|минут(?:а|ы|у)?|секунд(?:а|ы)?)(?:\s+\d+\s*минут\w*)?.*$", " ", RegexOptions.IgnoreCase);
            series = Regex.Replace(series, @"\s*\(#?\s*\d+(?:[.,]\d+)?\s*\).*$", " ", RegexOptions.IgnoreCase);
            series = Regex.Replace(series, @"\s+#\s*\d+(?:[.,]\d+)?.*$", " ", RegexOptions.IgnoreCase);
            series = Clean(series).Trim(' ', '-', ':', ';', ',', '.');
            series = CleanSeriesCandidate(series);

            return series.Length > 120 ? string.Empty : series;
        }

        private static string CleanSeriesCandidate(string value)
        {
            value = Clean(value).Trim(' ', '-', ':', ';', ',', '.', '«', '»', '"', '\'');
            if (value.Length < 2 || value.Length > 120)
                return string.Empty;
            if (value.StartsWith("(#", StringComparison.OrdinalIgnoreCase))
                return string.Empty;
            if (Regex.IsMatch(value, @"^(?:а|ов|из|вида|опедия)$", RegexOptions.IgnoreCase))
                return string.Empty;
            if (!Regex.IsMatch(value, @"[A-Za-zА-Яа-яЁё]"))
                return string.Empty;
            if (Regex.IsMatch(value, @"(слушать|аудиокниг|описание|правила сайта|правооблад|прослушив|длительность|исполнитель|читает|жанр\s)", RegexOptions.IgnoreCase))
                return string.Empty;
            if (Regex.IsMatch(value, @"\b\u0436\u0430\u043d\u0440\w*\b|litrpg|\u043b\u0438\u0442\u0440\u043f\u0433", RegexOptions.IgnoreCase))
                return string.Empty;
            if (!AudioFdbStore.IsUsableSeriesTitle(value))
                return string.Empty;
            return value;
        }

        private static string SeriesFromTitle(string title)
        {
            title = Clean(title);
            if (Regex.IsMatch(title, @"^\s*ГЛУБИНА\s*[\.:]\s*Погружение\b", RegexOptions.IgnoreCase))
                return "Глубина";
            return string.Empty;
        }

        private static string StripHtml(string html)
        {
            var doc = LoadDocument(html);
            return SafeText(doc.DocumentNode);
        }

        private static string LabelValue(string text, params string[] labels)
        {
            text = Clean(text);
            foreach (var label in labels)
            {
                var m = Regex.Match(text, Regex.Escape(label).TrimEnd(':') + @":?\s*(?<v>[^|•\n\r]{2,120})", RegexOptions.IgnoreCase);
                if (m.Success) return Clean(m.Groups["v"].Value);
            }
            return string.Empty;
        }

        private static string AbsoluteUrl(string root, string url)
        {
            url = HttpUtility.HtmlDecode(url ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(url)) return string.Empty;
            if (
                url.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("blob:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase)
            ) return string.Empty;
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) return url;
            if (url.StartsWith("//")) return "https:" + url;
            return root.TrimEnd('/') + "/" + url.TrimStart('/');
        }

        private static string NormalizeAudioUrl(string root, string url)
        {
            url = JsDecode(HttpUtility.HtmlDecode(url ?? string.Empty)).Trim();
            url = url.Replace("\\/", "/");
            if (url.Contains("/engine/go.php", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    var q = HttpUtility.ParseQueryString(new Uri(AbsoluteUrl(root, url)).Query);
                    var embedded = q["url"];
                    if (!string.IsNullOrWhiteSpace(embedded))
                    {
                        embedded = HttpUtility.UrlDecode(embedded);
                        try
                        {
                            if (!embedded.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                                embedded = Encoding.UTF8.GetString(Convert.FromBase64String(embedded));
                        }
                        catch { }
                        url = embedded;
                    }
                }
                catch { }
            }
            return AbsoluteUrl(root, url);
        }

        private static bool LooksLikeAudio(string url)
        {
            url = url ?? string.Empty;
            if (
                url.Contains("lis10book.com/audio/", StringComparison.OrdinalIgnoreCase) &&
                !url.Contains(".mp3", StringComparison.OrdinalIgnoreCase) &&
                !url.Contains(".m4a", StringComparison.OrdinalIgnoreCase)
            )
                return false;

            return url.Contains(".mp3", StringComparison.OrdinalIgnoreCase) ||
                   url.Contains(".m4a", StringComparison.OrdinalIgnoreCase) ||
                   url.Contains("/audio/", StringComparison.OrdinalIgnoreCase) ||
                   url.Contains("/files/", StringComparison.OrdinalIgnoreCase) ||
                   url.Contains("/engine/go.php", StringComparison.OrdinalIgnoreCase);
        }

        private static string DecodeAudioknigiProPlaylist(string encoded, string newsId)
        {
            if (string.IsNullOrWhiteSpace(encoded))
                return string.Empty;
            try
            {
                const string alphabet = "f3RqmzK8TvNpLn0Xd7WhjYeA9QobsSl1HCgu5cyEDi4GBwrk2aFxJtMOPZUIV6+/=";
                var encrypted = new List<byte>();
                for (var i = 0; i < encoded.Length;)
                {
                    var e1 = alphabet.IndexOf(encoded[i++]);
                    var e2 = i < encoded.Length ? alphabet.IndexOf(encoded[i++]) : -1;
                    var e3 = i < encoded.Length ? alphabet.IndexOf(encoded[i++]) : -1;
                    var e4 = i < encoded.Length ? alphabet.IndexOf(encoded[i++]) : -1;
                    if (e1 < 0 || e2 < 0)
                        break;
                    encrypted.Add((byte)((e1 << 2) | (e2 >> 4)));
                    if (e3 >= 0 && e3 != 64)
                        encrypted.Add((byte)(((e2 & 15) << 4) | (e3 >> 2)));
                    if (e4 >= 0 && e4 != 64)
                        encrypted.Add((byte)(((e3 & 3) << 6) | e4));
                }

                var key = new List<byte>(encrypted.Count);
                for (var block = 0; key.Count < encrypted.Count; block++)
                {
                    var input = Encoding.UTF8.GetBytes((newsId ?? "0") + ":KxOdv42AVmaq:" + block);
                    key.AddRange(MD5.HashData(input));
                }

                var decoded = new byte[encrypted.Count];
                for (var i = 0; i < encrypted.Count; i++)
                    decoded[i] = (byte)(encrypted[i] ^ key[i]);
                return Encoding.UTF8.GetString(decoded);
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string JsDecode(string value)
        {
            value ??= string.Empty;
            value = value.Replace("\\/", "/").Replace("\\\"", "\"").Replace("\\'", "'");
            value = Regex.Replace(value, @"\\u(?<hex>[0-9a-fA-F]{4})", m =>
            {
                try { return ((char)Convert.ToInt32(m.Groups["hex"].Value, 16)).ToString(); }
                catch { return m.Value; }
            });
            value = Regex.Replace(value, @"\\x(?<hex>[0-9a-fA-F]{2})", m =>
            {
                try { return ((char)Convert.ToInt32(m.Groups["hex"].Value, 16)).ToString(); }
                catch { return m.Value; }
            });
            return value.Replace("\\\\", "\\");
        }

        private static long ParseDuration(string value)
        {
            value = (value ?? string.Empty).Trim().Trim('"', '\'');
            if (long.TryParse(value, out var seconds)) return seconds;
            if (TimeSpan.TryParse(value, out var ts)) return (long)ts.TotalSeconds;
            var m = Regex.Match(value, @"PT(?:(?<h>\d+)H)?(?:(?<m>\d+)M)?(?:(?<s>\d+)S)?", RegexOptions.IgnoreCase);
            if (m.Success)
                return (long)new TimeSpan(ToInt(m.Groups["h"].Value), ToInt(m.Groups["m"].Value), ToInt(m.Groups["s"].Value)).TotalSeconds;
            return 0;
        }

        private static int ToInt(string value) => int.TryParse(value, out var n) ? n : 0;

        private static string TitleFromUrl(string url)
        {
            try { return Clean(HttpUtility.UrlDecode(new Uri(url).Segments.LastOrDefault()?.Trim('/') ?? url).Replace("-", " ")); }
            catch { return url; }
        }

        private static string FirstNonEmpty(params string[] values)
            => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;

        private static string Root(string url)
        {
            try
            {
                var uri = new Uri(url);
                return uri.Scheme + "://" + uri.Host + "/";
            }
            catch { return url; }
        }
    }
}

namespace KnigaSlovo.Controllers
{
    using KnigaSlovo.Audiobooks;

    [AllowAnonymous]
    public abstract class AudiobookControllerBase<TModule> : Controller where TModule : IAudiobookModule
    {
        private readonly TModule _module;

        protected AudiobookControllerBase(IHttpClientFactory? httpClientFactory)
        {
            _module = CreateModule(httpClientFactory?.CreateClient());
        }

        protected abstract TModule CreateModule(HttpClient? httpClient);

        [HttpGet]
        public async Task<IActionResult> book(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return BadRequest("url is required");
            var book = await _module.GetBookAsync(url);
            if (book == null) return NotFound();
            return Json(book);
        }

        [HttpGet]
        public async Task<IActionResult> series(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return BadRequest("url is required");
            return Json(await _module.GetSeriesAsync(url));
        }

        [HttpGet]
        public async Task<IActionResult> search(string query = "", int limit = 20, int offset = 0)
        {
            return Json(await _module.SearchAsync(query, limit, offset));
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) _module.Dispose();
            base.Dispose(disposing);
        }
    }

    [Route("knigavuhe/[action]")]
    public sealed class KnigaVuheController : AudiobookControllerBase<KnigaVuheModule>
    {
        public KnigaVuheController(IHttpClientFactory? httpClientFactory = null) : base(httpClientFactory) { }
        protected override KnigaVuheModule CreateModule(HttpClient? httpClient) => new KnigaVuheModule(httpClient);
    }

    [Route("akniga/[action]")]
    public sealed class AknigaController : AudiobookControllerBase<AknigaModule>
    {
        public AknigaController(IHttpClientFactory? httpClientFactory = null) : base(httpClientFactory) { }
        protected override AknigaModule CreateModule(HttpClient? httpClient) => new AknigaModule(httpClient);
    }

    [Route("izib/[action]")]
    public sealed class IzibController : AudiobookControllerBase<IzibModule>
    {
        public IzibController(IHttpClientFactory? httpClientFactory = null) : base(httpClientFactory) { }
        protected override IzibModule CreateModule(HttpClient? httpClient) => new IzibModule(httpClient);
    }

    [Route("yakniga/[action]")]
    public sealed class YaKnigaController : AudiobookControllerBase<YaKnigaModule>
    {
        public YaKnigaController(IHttpClientFactory? httpClientFactory = null) : base(httpClientFactory) { }
        protected override YaKnigaModule CreateModule(HttpClient? httpClient) => new YaKnigaModule(httpClient);
    }

    [Route("librivoxaudio/[action]")]
    public sealed class LibrivoxController : AudiobookControllerBase<LibrivoxModule>
    {
        public LibrivoxController(IHttpClientFactory? httpClientFactory = null) : base(httpClientFactory) { }
        protected override LibrivoxModule CreateModule(HttpClient? httpClient) => new LibrivoxModule(httpClient);
    }

    [Route("audiobooks/[action]")]
    [AllowAnonymous]
    public sealed class AudiobooksController : Controller
    {
        private static IAudiobookModule CreateModule(string source)
        {
            return (source ?? "").ToLowerInvariant() switch
            {
                "knigavuhe" => new KnigaVuheModule(),
                "akniga" => new AknigaModule(),
                "izib" => new IzibModule(),
                "yakniga" => new YaKnigaModule(),
                "librivoxaudio" => new LibrivoxModule(),
                _ => new KnigaVuheModule()
            };
        }

        private static string ProxyImg(string absoluteUrl)
        {
            if (string.IsNullOrWhiteSpace(absoluteUrl)) return "";
            return "/audiobooks/img?url=" + HttpUtility.UrlEncode(absoluteUrl);
        }

        [HttpGet]
        public async Task<IActionResult> search(string query = "", string source = "all", int limit = 20, int offset = 0)
        {
            try
            {
                var drivers = new[] { "knigavuhe", "akniga", "izib", "librivoxaudio" };

                if (!string.Equals(source, "all", StringComparison.OrdinalIgnoreCase))
                {
                    using var module = CreateModule(source);
                    var items = await module.SearchAsync(query, limit, offset);

                    foreach (var item in items)
                    {
                        if (!string.IsNullOrWhiteSpace(item.preview))
                            item.preview = ProxyImg(item.preview);
                    }

                    return Json(items);
                }

                var result = new List<Audiobook>();

                foreach (var driver in drivers)
                {
                    try
                    {
                        using var module = CreateModule(driver);
                        var items = await module.SearchAsync(query, limit, offset);

                        foreach (var item in items)
                        {
                            if (!string.IsNullOrWhiteSpace(item.preview))
                                item.preview = ProxyImg(item.preview);

                            result.Add(item);
                        }
                    }
                    catch
                    {
                    }
                }

                return Json(result.Take(Math.Max(limit * drivers.Length, 100)).ToList());
            }
            catch
            {
                return Json(new List<Audiobook>());
            }
        }

        [HttpGet]
        public async Task<IActionResult> book(string url, string source)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(url))
                    return BadRequest("url is required");

                if (string.IsNullOrWhiteSpace(source))
                {
                    if (url.Contains("knigavuhe.org")) source = "knigavuhe";
                    else if (url.Contains("akniga.org")) source = "akniga";
                    else if (url.Contains("izib.uk")) source = "izib";
                    else if (url.Contains("yakniga.org")) source = "yakniga";
                    else if (url.Contains("archive.org")) source = "librivoxaudio";
                }

                using var module = CreateModule(source);
                var book = await module.GetBookAsync(url);
                if (book == null)
                    return NotFound();

                if (!string.IsNullOrWhiteSpace(book.preview))
                    book.preview = ProxyImg(book.preview);

                return Json(book);
            }
            catch
            {
                return NotFound();
            }
        }

        [HttpGet]
        public async Task<IActionResult> audio(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return BadRequest();

            HttpClient http = null;
            HttpResponseMessage response = null;

            try
            {
                http = AudiobookModuleBase.CreateClient(useProxy: false);
                foreach (var candidate in AudioUrlCandidates(url))
                {
                    try
                    {
                        using var request = CreateAudioRequest(candidate);
                        response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted);
                        var mediaType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
                        var textResponse =
                            mediaType.Contains("text/html", StringComparison.OrdinalIgnoreCase) ||
                            mediaType.Contains("application/json", StringComparison.OrdinalIgnoreCase) ||
                            mediaType.Contains("application/xml", StringComparison.OrdinalIgnoreCase) ||
                            mediaType.Contains("text/xml", StringComparison.OrdinalIgnoreCase);
                        if (response.IsSuccessStatusCode && !textResponse)
                            break;

                        response.Dispose();
                        response = null;
                    }
                    catch (OperationCanceledException) when (!HttpContext.RequestAborted.IsCancellationRequested)
                    {
                        response?.Dispose();
                        response = null;
                    }
                    catch (HttpRequestException)
                    {
                        response?.Dispose();
                        response = null;
                    }
                }

                if (response == null)
                    return NotFound();

                var contentType = response.Content.Headers.ContentType?.MediaType ?? "audio/mpeg";
                var responseUrl = response.RequestMessage?.RequestUri?.ToString() ?? url;
                var isHls =
                    contentType.Contains("mpegurl", StringComparison.OrdinalIgnoreCase) ||
                    responseUrl.Contains(".m3u8", StringComparison.OrdinalIgnoreCase);

                if (isHls)
                {
                    var playlist = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);
                    var rewritten = RewriteHlsPlaylist(playlist, responseUrl);
                    Response.StatusCode = (int)response.StatusCode;
                    Response.ContentType = "application/vnd.apple.mpegurl";
                    Response.Headers["Access-Control-Allow-Origin"] = "*";
                    Response.Headers["Cache-Control"] = "no-cache";
                    await Response.Body.WriteAsync(Encoding.UTF8.GetBytes(rewritten), HttpContext.RequestAborted);
                    return new EmptyResult();
                }

                Response.StatusCode = (int)response.StatusCode;
                Response.ContentType = contentType;
                Response.Headers["Access-Control-Allow-Origin"] = "*";
                Response.Headers["Access-Control-Allow-Headers"] = "Range";
                Response.Headers["Accept-Ranges"] = "bytes";
                Response.Headers["Cache-Control"] = "public, max-age=86400";

                if (response.Content.Headers.ContentLength.HasValue)
                    Response.ContentLength = response.Content.Headers.ContentLength.Value;

                if (response.Content.Headers.ContentRange != null)
                    Response.Headers["Content-Range"] = response.Content.Headers.ContentRange.ToString();

                await using var stream = await response.Content.ReadAsStreamAsync(HttpContext.RequestAborted);
                await stream.CopyToAsync(Response.Body, HttpContext.RequestAborted);

                return new EmptyResult();
            }
            catch (OperationCanceledException)
            {
                return new EmptyResult();
            }
            catch
            {
                return NotFound();
            }
            finally
            {
                response?.Dispose();
                http?.Dispose();
            }
        }

        private static string RewriteHlsPlaylist(string playlist, string playlistUrl)
        {
            if (!Uri.TryCreate(playlistUrl, UriKind.Absolute, out var baseUri))
                return playlist;

            string ProxyResource(string value)
            {
                if (!Uri.TryCreate(baseUri, value, out var absolute))
                    return value;
                return "/audiobooks/audio?url=" + HttpUtility.UrlEncode(absolute.ToString());
            }

            var lines = (playlist ?? string.Empty).Replace("\r\n", "\n").Split('\n');
            for (var i = 0; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (string.IsNullOrWhiteSpace(line))
                    continue;

                if (!line.StartsWith("#", StringComparison.Ordinal))
                {
                    lines[i] = ProxyResource(line);
                    continue;
                }

                lines[i] = Regex.Replace(
                    lines[i],
                    "URI=\"(?<url>[^\"]+)\"",
                    match => "URI=\"" + ProxyResource(match.Groups["url"].Value) + "\"",
                    RegexOptions.IgnoreCase
                );
            }

            return string.Join("\n", lines);
        }

        private HttpRequestMessage CreateAudioRequest(string url)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, url);
            var izi = url.Contains("audioknigi.xyz", StringComparison.OrdinalIgnoreCase) ||
                      url.Contains("izib.uk", StringComparison.OrdinalIgnoreCase);
            request.Headers.UserAgent.ParseAdd(izi
                ? "izimobile/1.11.17"
                : "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36");
            request.Headers.Accept.ParseAdd("audio/mpeg,audio/*;q=0.9,*/*;q=0.8");
            request.Headers.Referrer = new Uri(GetAudioRefererForUrl(url));
            request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "audio");

            if (Request.Headers.TryGetValue("Range", out var range))
                request.Headers.TryAddWithoutValidation("Range", range.ToString());

            return request;
        }

        private static IEnumerable<string> AudioUrlCandidates(string url)
        {
            yield return url;
            if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                yield return "http://" + url["https://".Length..];
            else if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                yield return "https://" + url["http://".Length..];
        }

        private static string GetAudioRefererForUrl(string url)
        {
            if (url.Contains("audioknigi.xyz", StringComparison.OrdinalIgnoreCase) || url.Contains("izib.uk", StringComparison.OrdinalIgnoreCase))
                return "https://izib.uk/";

            if (url.Contains("fantbox", StringComparison.OrdinalIgnoreCase) || url.Contains("lis10book", StringComparison.OrdinalIgnoreCase))
                return "https://lis10book.com/";

            if (url.Contains("akniga", StringComparison.OrdinalIgnoreCase) || url.Contains("akniga.club", StringComparison.OrdinalIgnoreCase))
                return "https://akniga.org/";

            if (url.Contains("knigavuhe", StringComparison.OrdinalIgnoreCase))
                return "https://knigavuhe.org/";

            return url;
        }

        [HttpGet]
        public async Task<IActionResult> img(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return BadRequest();

            try
            {
                using var http = AudiobookModuleBase.CreateClient(useProxy: false);
                using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);

                if (!response.IsSuccessStatusCode)
                    return NotFound();

                var bytes = await response.Content.ReadAsByteArrayAsync();
                var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
                Response.Headers.CacheControl = "public,max-age=604800,stale-while-revalidate=86400";
                return File(bytes, contentType);
            }
            catch
            {
                return NotFound();
            }
        }
    }

    [Route("audio")]
    [AllowAnonymous]
    public sealed class AudioController : Controller
    {
        private static readonly AudioFdbStore Store = new();
        private static readonly AudioCoverEnricher Covers = new(Store);

        private static IzibukFdbProvider Izibuk => new(Store);
        private static RuBookFdbProvider RuBook => new(Store);
        private static readonly string[] LegacyFdbSearchProviders = { "akniga", "knigavuhe", "yakniga" };
        private static readonly object CrawlerSync = new();
        private static readonly TimeSpan CrawlerInterval = TimeSpan.FromMinutes(BackendOptions.Int("AUDIOBOOK_CRAWLER_INTERVAL_MINUTES", 30, 5, 1440));
        private static readonly int CrawlerParallelism = BackendOptions.Int("AUDIOBOOK_CRAWLER_PARALLELISM", 1, 1, 4);
        private static readonly string[] CrawlerQueries =
        {
            "а", "пушкин", "фантастика", "детектив", "фэнтези", "сказки", "роман",
            "приключения", "попаданцы", "любовь", "история", "ужасы", "триллер",
            "космос", "магия", "война", "классика", "литрпг", "постапокалипсис",
            "бизнес", "психология", "биография", "нон-фикшн", "детям",
            "русская литература", "зарубежная литература"
        };
        private static bool CrawlerStarted;
        private static int CrawlerCursor;
        private static DateTimeOffset? CrawlerLastStartedAt;
        private static DateTimeOffset? CrawlerLastFinishedAt;
        private static string CrawlerLastQuery = string.Empty;
        private static int CrawlerLastOffset;
        private static int CrawlerLastWorks;
        private static string CrawlerLastError = string.Empty;
        private const string CatalogDefaultQuery = "а";
        private static readonly string[] CatalogSeedQueries = { "пушкин", "фантастика", "детектив", "фэнтези", "сказки", "роман" };
        private static readonly object DiscoverySync = new();
        private static readonly SemaphoreSlim DiscoverySlots = new(2);
        private static readonly Dictionary<string, (DateTimeOffset StartedAt, Task Task)> DiscoveryTasks = new(StringComparer.OrdinalIgnoreCase);

        static AudioController()
        {
            if (BackendOptions.CrawlerEnabled) StartCrawler();
        }

        [HttpGet("providers")]
        public IActionResult providers(bool all = true)
        {
            var providers = AudioBookProviderCatalog.Providers.Values
                .Where(p => all || p.enabled)
                .OrderBy(p => p.id)
                .ToList();
            return Json(providers);
        }

        [HttpGet("crawler/status")]
        public IActionResult crawler_status()
        {
            return Json(new
            {
                enabled = true,
                started = CrawlerStarted,
                interval_minutes = (int)CrawlerInterval.TotalMinutes,
                parallelism = CrawlerParallelism,
                providers = AudioBookProviderCatalog.Providers.Count,
                log_retention_hours = 24,
                last_started_at = CrawlerLastStartedAt,
                last_finished_at = CrawlerLastFinishedAt,
                last_query = CrawlerLastQuery,
                last_offset = CrawlerLastOffset,
                last_works = CrawlerLastWorks,
                last_error = CrawlerLastError,
                cover_lookup_cache = Store.CoverLookupStats(),
                recent_runs = Store.ListCrawlerRuns(10)
            });
        }

        [HttpGet("catalog")]
        [HttpGet("catalog/latest")]
        [HttpGet("catalog/popular")]
        public async Task<IActionResult> catalog(int limit = 20, int offset = 0, string genre = "")
        {
            return Json(await CatalogAsync(limit, offset, genre));
        }

        [HttpGet("search")]
        public async Task<IActionResult> search(string query = "", string author = "", string narrator = "", string genre = "", string series = "", string provider = "all", int limit = 20, int offset = 0, bool deep = false)
        {
            var q = FirstNonEmpty(query, author, narrator, genre, series);
            provider = string.IsNullOrWhiteSpace(provider) ? "all" : provider.Trim();

            if (provider.Equals("all", StringComparison.OrdinalIgnoreCase))
                return Json(deep ? await SearchAllDeepAsync(q, limit, offset) : await SearchFastAsync(q, genre, limit, offset));

            if (provider.Equals("izibuk", StringComparison.OrdinalIgnoreCase) || provider.Equals("izibuk_graphql", StringComparison.OrdinalIgnoreCase))
                provider = "izibuk_graphql";
            var providerSearch = SearchProviderCachedAsync(provider, q, limit, offset);
            await AwaitDiscoveryAsync(providerSearch, TimeSpan.FromSeconds(8));
            return Json(providerSearch.IsCompletedSuccessfully ? providerSearch.Result : new List<AudioFdbWork>());
        }

        [HttpGet("work/{workId}")]
        public async Task<IActionResult> work(string workId)
        {
            if (string.IsNullOrWhiteSpace(workId)) return BadRequest();

            AudioFdbWork? work = null;
            if (workId.StartsWith("work:izibuk:", StringComparison.OrdinalIgnoreCase))
                work = await Izibuk.GetBookAsync(workId);

            work ??= Store.GetWork(workId);
            work = MergeKnownVariants(work);
            work = await EnsureWorkDetailsAsync(work);
            work = await RuBook.EnrichMetadataAsync(work);
            work = MergeKnownVariants(work);
            work = await Covers.EnrichOneAsync(work);
            return work == null ? NotFound() : Json(work);
        }

        [HttpGet("edition/{editionId}")]
        public async Task<IActionResult> edition(string editionId)
        {
            if (string.IsNullOrWhiteSpace(editionId)) return BadRequest();

            if (editionId.StartsWith("edition:izibuk:", StringComparison.OrdinalIgnoreCase))
                await Izibuk.GetBookAsync(editionId);

            var edition = await EnsureEditionDetailsAsync(Store.GetEdition(editionId));
            return edition == null ? NotFound() : Json(edition);
        }

        [HttpGet("edition/{editionId}/sources")]
        public async Task<IActionResult> sources(string editionId)
        {
            if (editionId.StartsWith("edition:izibuk:", StringComparison.OrdinalIgnoreCase))
                await Izibuk.GetBookAsync(editionId);

            var edition = await EnsureEditionDetailsAsync(Store.GetEdition(editionId));
            return edition == null ? NotFound() : Json(edition.sources);
        }

        [HttpGet("play/{editionId}/{chapterIndex:int}")]
        public async Task<IActionResult> play(string editionId, int chapterIndex)
        {
            if (editionId.StartsWith("edition:izibuk:", StringComparison.OrdinalIgnoreCase))
                await Izibuk.GetBookAsync(editionId);

            var selectedEdition = await EnsureEditionDetailsAsync(Store.GetEdition(editionId));
            if (selectedEdition == null)
                return NotFound();

            if (selectedEdition.sources.Any(source =>
                    source.provider.Equals("akniga", StringComparison.OrdinalIgnoreCase) &&
                    !source.chapters.Any(chapter => chapter.audio_url.Contains(".m3u8", StringComparison.OrdinalIgnoreCase))))
            {
                foreach (var source in selectedEdition.sources.Where(source =>
                             source.provider.Equals("akniga", StringComparison.OrdinalIgnoreCase) &&
                             CanHydrateSource(selectedEdition, source)))
                    await HydrateSourceAsync(selectedEdition, source);
            }

            var candidates = PlaybackCandidates(editionId, chapterIndex);
            var audioUrl = await FirstAvailableAudioUrlAsync(candidates);

            if (string.IsNullOrWhiteSpace(audioUrl))
            {
                var work = Store.GetWork(selectedEdition.work_id);
                var merged = MergeKnownVariants(work);
                if (merged != null)
                {
                    foreach (var pair in merged.editions
                                 .SelectMany(edition => edition.sources.Select(source => new { Edition = edition, Source = source }))
                                 .Where(pair => CanHydrateSource(pair.Edition, pair.Source))
                                 .GroupBy(pair => pair.Source.id)
                                 .Select(group => group.First())
                                 .Take(16))
                        await HydrateSourceAsync(pair.Edition, pair.Source);
                }

                candidates = PlaybackCandidates(editionId, chapterIndex);
                audioUrl = await FirstAvailableAudioUrlAsync(candidates);
            }

            if (string.IsNullOrWhiteSpace(audioUrl))
                return NotFound();

            return Redirect("/audiobooks/audio?url=" + HttpUtility.UrlEncode(audioUrl));
        }

        private static List<string> PlaybackCandidates(string editionId, int chapterIndex)
        {
            var storedEdition = Store.GetEdition(editionId);
            if (storedEdition == null)
                return new List<string>();

            var storedWork = Store.GetWork(storedEdition.work_id);
            var work = MergeKnownVariants(storedWork) ?? storedWork;
            if (work == null)
                return new List<string>();

            var selected = work.editions.FirstOrDefault(edition =>
                               edition.id.Equals(editionId, StringComparison.OrdinalIgnoreCase))
                           ?? storedEdition;
            var readerKey = CanonicalReaderKey(selected);
            var chapterIndices = selected.sources
                .SelectMany(source => source.chapters)
                .Select(chapter => chapter.chapter_index)
                .Distinct()
                .OrderBy(index => index)
                .ToList();
            var requestedOrdinal = chapterIndices.IndexOf(chapterIndex);

            var orderedEditions = work.editions
                .Append(storedEdition)
                .DistinctBy(edition => edition.id, StringComparer.OrdinalIgnoreCase)
                .OrderBy(edition =>
                {
                    if (edition.id.Equals(editionId, StringComparison.OrdinalIgnoreCase))
                        return 0;
                    if (!string.IsNullOrWhiteSpace(readerKey) &&
                        CanonicalReaderKey(edition).Equals(readerKey, StringComparison.OrdinalIgnoreCase))
                        return 1;
                    if (edition.chapter_count == selected.chapter_count)
                        return 2;
                    return 3;
                })
                .ThenByDescending(edition => edition.quality_score)
                .ToList();

            var urls = new List<string>();
            foreach (var edition in orderedEditions)
            {
                foreach (var source in edition.sources.OrderByDescending(source =>
                             source.status.Equals("ok", StringComparison.OrdinalIgnoreCase)))
                {
                    var chapter = source.chapters.FirstOrDefault(item => item.chapter_index == chapterIndex);
                    if (chapter == null && requestedOrdinal >= 0)
                    {
                        var alternate = source.chapters.OrderBy(item => item.chapter_index).ToList();
                        if (requestedOrdinal < alternate.Count)
                            chapter = alternate[requestedOrdinal];
                    }

                    if (chapter != null && IsPlausibleAudioUrl(chapter.audio_url))
                        urls.Add(chapter.audio_url);
                }
            }

            return urls.Distinct(StringComparer.OrdinalIgnoreCase).Take(24).ToList();
        }

        private static string CanonicalReaderKey(AudioFdbEdition edition)
        {
            return string.Join(
                "|",
                edition.narrators
                    .Select(person => AudioFdbStore.Normalize(person.display_name)
                        .Split(' ', StringSplitOptions.RemoveEmptyEntries)
                        .Where(word => word.Length > 1)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .OrderBy(word => word, StringComparer.OrdinalIgnoreCase))
                    .Select(words => string.Join(" ", words))
                    .Where(value => !string.IsNullOrWhiteSpace(value))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
            );
        }

        private async Task<string> FirstAvailableAudioUrlAsync(IEnumerable<string> candidates)
        {
            using var http = AudiobookModuleBase.CreateClient(useProxy: false);
            http.Timeout = TimeSpan.FromSeconds(7);

            foreach (var candidate in candidates.Take(16))
            {
                foreach (var url in AudioCandidateSchemes(candidate))
                {
                    try
                    {
                        using var request = new HttpRequestMessage(HttpMethod.Get, url);
                        request.Headers.UserAgent.ParseAdd(
                            url.Contains("audioknigi.xyz", StringComparison.OrdinalIgnoreCase) ||
                            url.Contains("izib.uk", StringComparison.OrdinalIgnoreCase)
                                ? "izimobile/1.11.17"
                                : "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"
                        );
                        request.Headers.Accept.ParseAdd("audio/mpeg,audio/*,application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.8");
                        request.Headers.TryAddWithoutValidation("Range", "bytes=0-1023");
                        request.Headers.Referrer = new Uri(AudioReferer(url));

                        using var response = await http.SendAsync(
                            request,
                            HttpCompletionOption.ResponseHeadersRead,
                            HttpContext.RequestAborted
                        );
                        var mediaType = response.Content.Headers.ContentType?.MediaType ?? string.Empty;
                        var rejectedText =
                            mediaType.Contains("text/html", StringComparison.OrdinalIgnoreCase) ||
                            mediaType.Contains("application/json", StringComparison.OrdinalIgnoreCase) ||
                            mediaType.Contains("application/xml", StringComparison.OrdinalIgnoreCase);
                        if (response.IsSuccessStatusCode && !rejectedText)
                            return url;
                    }
                    catch (OperationCanceledException) when (!HttpContext.RequestAborted.IsCancellationRequested)
                    {
                    }
                    catch (HttpRequestException)
                    {
                    }
                }
            }

            return string.Empty;
        }

        private static IEnumerable<string> AudioCandidateSchemes(string url)
        {
            yield return url;
            if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                yield return "http://" + url["https://".Length..];
            else if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                yield return "https://" + url["http://".Length..];
        }

        private static string AudioReferer(string url)
        {
            if (url.Contains("audioknigi.xyz", StringComparison.OrdinalIgnoreCase) ||
                url.Contains("izib.uk", StringComparison.OrdinalIgnoreCase))
                return "https://izib.uk/";
            if (url.Contains("fantbox", StringComparison.OrdinalIgnoreCase) ||
                url.Contains("lis10book", StringComparison.OrdinalIgnoreCase))
                return "https://lis10book.com/";
            if (url.Contains("akniga", StringComparison.OrdinalIgnoreCase))
                return "https://akniga.org/";
            if (url.Contains("knigavuhe", StringComparison.OrdinalIgnoreCase))
                return "https://knigavuhe.org/";
            try
            {
                var uri = new Uri(url);
                return uri.Scheme + "://" + uri.Host + "/";
            }
            catch
            {
                return "https://akniga.org/";
            }
        }

        [HttpGet("proxy/{token}")]
        public IActionResult proxy(string token)
        {
            var url = DecodeToken(token);
            if (string.IsNullOrWhiteSpace(url)) return BadRequest();
            return Redirect("/audiobooks/audio?url=" + HttpUtility.UrlEncode(url));
        }

        [HttpGet("genres")]
        public IActionResult genres(int limit = 50, int offset = 0, string query = "") => Json(Store.ListGenres(limit, offset, query));

        [HttpGet("genres/{genreId}/books")]
        public IActionResult genreBooks(string genreId, int limit = 20, int offset = 0)
            => Json(Store.ListWorksByGenre(genreId, limit, offset));

        [HttpGet("authors")]
        public IActionResult authors(int limit = 50, int offset = 0) => Json(Store.ListPersons("author", limit, offset));

        [HttpGet("authors/search")]
        public IActionResult authorsSearch(string query = "", int limit = 50, int offset = 0) => Json(Store.ListPersons("author", limit, offset, query));

        [HttpGet("authors/{authorId}/books")]
        public IActionResult authorBooks(string authorId, int limit = 20, int offset = 0) => Json(Store.ListWorksByPerson(authorId, "author", limit, offset));

        [HttpGet("narrators")]
        public IActionResult narrators(int limit = 50, int offset = 0) => Json(Store.ListPersons("narrator", limit, offset));

        [HttpGet("narrators/search")]
        public IActionResult narratorsSearch(string query = "", int limit = 50, int offset = 0) => Json(Store.ListPersons("narrator", limit, offset, query));

        [HttpGet("narrators/{narratorId}/books")]
        public IActionResult narratorBooks(string narratorId, int limit = 20, int offset = 0) => Json(Store.ListWorksByPerson(narratorId, "narrator", limit, offset));

        [HttpGet("series")]
        public IActionResult series(int limit = 50, int offset = 0) => Json(Store.ListSeries(limit, offset));

        [HttpGet("series/search")]
        public IActionResult seriesSearch(string query = "", int limit = 50, int offset = 0) => Json(Store.ListSeries(limit, offset, query));

        [HttpGet("series/{seriesId}/books")]
        public async Task<IActionResult> seriesBooks(string seriesId, int limit = 20, int offset = 0)
        {
            var expansion = CachedDiscoveryTask(
                "series:" + seriesId,
                () => ExpandSeriesAsync(seriesId),
                TimeSpan.FromMinutes(30)
            );
            await AwaitDiscoveryAsync(expansion, TimeSpan.FromSeconds(12));
            return Json(Store.ListWorksBySeries(seriesId, limit, offset));
        }

        private static Task CachedDiscoveryTask(string key, Func<Task> factory, TimeSpan maxAge)
        {
            lock (DiscoverySync)
            {
                var now = DateTimeOffset.UtcNow;
                if (DiscoveryTasks.TryGetValue(key, out var existing) && !existing.Task.IsFaulted &&
                    !existing.Task.IsCanceled && (!existing.Task.IsCompleted || now - existing.StartedAt < maxAge))
                    return existing.Task;

                TrimDiscoveryCache(now);
                if (DiscoveryTasks.Count >= 256) return Task.CompletedTask;
                var task = Task.Run(async () =>
                {
                    await DiscoverySlots.WaitAsync();
                    try { await factory(); }
                    finally { DiscoverySlots.Release(); }
                });
                DiscoveryTasks[key] = (now, task);
                return task;
            }
        }

        private static void TrimDiscoveryCache(DateTimeOffset now)
        {
            foreach (var key in DiscoveryTasks.Where(item => item.Value.Task.IsCompleted &&
                (now - item.Value.StartedAt > TimeSpan.FromMinutes(30) || DiscoveryTasks.Count >= 128))
                .Select(item => item.Key).ToList())
                DiscoveryTasks.Remove(key);
        }

        private static async Task AwaitDiscoveryAsync(Task task, TimeSpan timeout)
        {
            var completed = await Task.WhenAny(task, Task.Delay(timeout));
            if (completed != task)
                return;
            try { await task; } catch { }
        }

        private static Task<List<AudioFdbWork>> SearchProviderCachedAsync(string provider, string query, int limit, int offset)
        {
            var key = "provider-search:" + provider.ToLowerInvariant() + ":" + AudioFdbStore.Normalize(query) + ":" + limit + ":" + offset;
            lock (DiscoverySync)
            {
                var now = DateTimeOffset.UtcNow;
                if (DiscoveryTasks.TryGetValue(key, out var existing) && !existing.Task.IsFaulted &&
                    !existing.Task.IsCanceled && (!existing.Task.IsCompleted || now - existing.StartedAt < TimeSpan.FromMinutes(5)) &&
                    existing.Task is Task<List<AudioFdbWork>> cached)
                    return cached;

                TrimDiscoveryCache(now);
                if (DiscoveryTasks.Count >= 256) return Task.FromResult(new List<AudioFdbWork>());
                var task = Task.Run(async () =>
                {
                    await DiscoverySlots.WaitAsync();
                    try { return await SearchProviderSafe(() =>
                    provider.Equals("izibuk_graphql", StringComparison.OrdinalIgnoreCase)
                        ? Izibuk.SearchAsync(query, limit, offset)
                        : RuBook.CanSearch(provider)
                            ? RuBook.SearchAsync(provider, query, limit, offset)
                            : SearchLegacyProviderAsync(provider, query, limit, offset, hydrateDetails: false)); }
                    finally { DiscoverySlots.Release(); }
                });
                DiscoveryTasks[key] = (now, task);
                return task;
            }
        }

        private static async Task ExpandSeriesAsync(string seriesId)
        {
            var seed = Store.FindSeriesExpansionSeed(seriesId);
            if (seed == null)
                return;

            using var legacy = CreateLegacyModule(seed.Value.Provider);
            if (legacy == null)
                return;

            var books = await legacy.GetSeriesAsync(seed.Value.PageUrl);
            foreach (var book in books.Take(200))
                Store.UpsertWork(MapLegacyBook(book));
        }

        private static async Task DiscoverExactAknigaEditionsAsync(string query)
        {
            using var akniga = new AknigaModule();
            var books = await LegacySearchSafe(akniga, query, 30, 0);
            var matches = books.Where(book => IsSameBookTitle(book.name, query) ||
                IsSameBookTitle(book.seriesName, query) || IsSameBookTitle(book.author, query) ||
                IsSameBookTitle(book.reader, query)).Take(30).ToList();
            foreach (var book in matches)
                Store.UpsertWork(MapLegacyBook(book));
            foreach (var seed in matches.Where(book => IsSameBookTitle(book.seriesName, query))
                .GroupBy(book => AudioFdbStore.Normalize(book.seriesName)).Select(group => group.First()).Take(3))
            {
                foreach (var book in (await akniga.GetSeriesAsync(seed.url)).Take(200))
                    Store.UpsertWork(MapLegacyBook(book));
            }
        }

        private static bool IsSameBookTitle(string title, string query)
        {
            static string Comparable(string value)
            {
                value = AudioFdbStore.Normalize(value);
                return value.Replace(" в одной лодке ", " в лодке ", StringComparison.OrdinalIgnoreCase);
            }

            var needle = Comparable(query);
            return !string.IsNullOrWhiteSpace(needle) &&
                (" " + Comparable(title) + " ").Contains(" " + needle + " ", StringComparison.OrdinalIgnoreCase);
        }

        [HttpGet("dev/provider-check")]
        public async Task<IActionResult> providerCheck(bool all = false)
        {
            if (!DevAllowed()) return Unauthorized();
            var providers = AudioBookProviderCatalog.Providers.Values.Where(p => all || p.enabled).ToList();
            var result = new List<AudioProviderCheckResult>();
            foreach (var provider in providers)
                result.Add(await CheckProvider(provider));
            return Json(result);
        }

        [HttpGet("dev/provider-check/{provider}")]
        public async Task<IActionResult> providerCheckOne(string provider)
        {
            if (!DevAllowed()) return Unauthorized();
            if (!AudioBookProviderCatalog.Providers.TryGetValue(provider, out var contract))
                return NotFound();
            return Json(await CheckProvider(contract));
        }

        [HttpGet("dev/egress-check/{profile}")]
        public async Task<IActionResult> egressCheck(string profile)
        {
            if (!DevAllowed()) return Unauthorized();
            var contract = new AudioProviderContract { id = "egress:" + profile, root = "https://api.ipify.org?format=json", egress = profile, enabled = true };
            return Json(await CheckProvider(contract));
        }

        private async Task<List<AudioFdbWork>> CatalogAsync(int limit, int offset, string genre = "")
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            offset = Math.Max(0, offset);

            var isPopular = (Request?.Path.Value ?? string.Empty).Contains("/popular", StringComparison.OrdinalIgnoreCase);
            var local = isPopular
                ? Store.ListPopularWorks(limit, offset, playableOnly: true, genre: genre)
                : Store.ListLatestWorks(limit, offset, playableOnly: true, genre: genre);

            _ = Task.Run(() => Covers.EnrichMissingAsync(12));

            return AudioFdbStore.DeduplicateWorks(local)
                .Where(AudioFdbStore.HasPlayableChapters)
                .Take(limit)
                .ToList();
        }

        private static void StartCrawler()
        {
            lock (CrawlerSync)
            {
                if (CrawlerStarted)
                    return;

                CrawlerStarted = true;
                _ = Task.Run(CrawlerLoopAsync);
            }
        }

        private static async Task CrawlerLoopAsync()
        {
            await Task.Delay(TimeSpan.FromSeconds(5));
            try { await Covers.EnrichMissingAsync(12); } catch { }
            await Task.Delay(TimeSpan.FromSeconds(25));

            while (true)
            {
                await RunCrawlerCycleAsync();
                try { await Covers.EnrichMissingAsync(12); } catch { }
                await Task.Delay(CrawlerInterval);
            }
        }

        private static async Task RunCrawlerCycleAsync()
        {
            var cursor = Interlocked.Increment(ref CrawlerCursor) - 1;
            var query = CrawlerQueries[Math.Abs(cursor) % CrawlerQueries.Length];
            var offset = (Math.Abs(cursor) / CrawlerQueries.Length % 20) * 10;
            var total = 0;
            var errors = new List<string>();
            var providersCount = 0;
            var startedAt = DateTimeOffset.UtcNow;

            CrawlerLastStartedAt = startedAt;
            CrawlerLastFinishedAt = null;
            CrawlerLastQuery = query;
            CrawlerLastOffset = offset;
            CrawlerLastWorks = 0;
            CrawlerLastError = string.Empty;

            try
            {
                var providers = AudioBookProviderCatalog.Providers.Values
                    .Where(provider => provider.enabled)
                    .Select(provider => provider.id)
                    .Where(provider =>
                        provider.Equals("izibuk_graphql", StringComparison.OrdinalIgnoreCase) ||
                        RuBook.CanSearch(provider) ||
                        LegacyFdbSearchProviders.Contains(provider, StringComparer.OrdinalIgnoreCase))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(p => p)
                    .ToList();
                providersCount = providers.Count;

                using var semaphore = new SemaphoreSlim(CrawlerParallelism);
                var tasks = providers.Select(async provider =>
                {
                    await semaphore.WaitAsync();
                    try
                    {
                        var works = await CrawlProviderAsync(provider, query, 10, offset);
                        Interlocked.Add(ref total, works.Count);

                        foreach (var work in works.Take(3))
                            await CrawlerHydrateWorkAsync(work);
                    }
                    catch (Exception ex)
                    {
                        lock (errors)
                            errors.Add(provider + ": " + ex.Message);
                    }
                    finally
                    {
                        semaphore.Release();
                    }
                }).ToArray();

                await Task.WhenAll(tasks);
            }
            catch (Exception ex)
            {
                CrawlerLastError = ex.Message;
            }
            finally
            {
                CrawlerLastWorks = total;
                if (errors.Count > 0)
                    CrawlerLastError = string.Join("; ", errors.Take(5));
                var finishedAt = DateTimeOffset.UtcNow;
                CrawlerLastFinishedAt = finishedAt;
                Store.InsertCrawlerRun(startedAt, finishedAt, query, offset, providersCount, CrawlerParallelism, total, CrawlerLastError);
            }
        }

        private static async Task<List<AudioFdbWork>> CrawlProviderAsync(string provider, string query, int limit, int offset)
        {
            if (provider.Equals("izibuk_graphql", StringComparison.OrdinalIgnoreCase))
                return await SearchProviderSafe(() => Izibuk.SearchAsync(query, limit, offset));

            if (RuBook.CanSearch(provider))
                return await SearchProviderSafe(() => RuBook.SearchAsync(provider, query, limit, offset));

            return await SearchLegacyProviderAsync(provider, query, limit, offset, hydrateDetails: true);
        }

        private static async Task CrawlerHydrateWorkAsync(AudioFdbWork work)
        {
            foreach (var pair in work.editions
                .SelectMany(edition => edition.sources.Select(source => new { Edition = edition, Source = source }))
                .Where(x => x.Source.chapters.Count == 0)
                .Take(2))
            {
                try
                {
                    if (pair.Source.provider.Equals("izibuk_graphql", StringComparison.OrdinalIgnoreCase) ||
                        pair.Edition.id.StartsWith("edition:izibuk:", StringComparison.OrdinalIgnoreCase))
                    {
                        await Izibuk.GetBookAsync(FirstNonEmpty(pair.Source.external_id, pair.Edition.id));
                    }
                    else if (!string.IsNullOrWhiteSpace(pair.Source.page_url) && RuBook.CanResolve(pair.Source.provider))
                    {
                        await RuBook.ResolveAsync(pair.Source.provider, pair.Source.page_url);
                    }
                }
                catch
                {
                }
            }
        }

        private async Task<List<AudioFdbWork>> SearchFastAsync(string query, string genre, int limit, int offset)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            offset = Math.Max(0, offset);

            var q = FirstNonEmpty(query, genre);
            var normalizedQuery = AudioFdbStore.Normalize(q);
            var local = string.IsNullOrWhiteSpace(q)
                ? Store.ListWorks(limit, offset, playableOnly: true)
                : Store.SearchWorks(q, string.Empty, Math.Max(limit * 4, 80), offset, playableOnly: false);

            if (string.IsNullOrWhiteSpace(genre) && normalizedQuery.Length >= 3)
            {
                var discovery = CachedDiscoveryTask(
                    "akniga-title:" + normalizedQuery,
                    () => DiscoverExactAknigaEditionsAsync(q),
                    TimeSpan.FromMinutes(30)
                );
                if (local.Count == 0)
                {
                    await AwaitDiscoveryAsync(discovery, TimeSpan.FromSeconds(3));
                    local = Store.SearchWorks(q, string.Empty, Math.Max(limit * 4, 80), offset, playableOnly: false);
                }
            }

            return AudioFdbStore.DeduplicateWorks(local)
                .Where(work => AudioFdbStore.HasPlayableChapters(work) ||
                    work.editions.Any(edition => edition.sources.Any(source => !string.IsNullOrWhiteSpace(source.page_url))))
                .Take(limit)
                .ToList();
        }

        private async Task<List<AudioFdbWork>> SearchAllDeepAsync(string query, int limit, int offset)
        {
            limit = Math.Max(1, Math.Min(limit <= 0 ? 20 : limit, 50));
            var perProvider = Math.Max(1, Math.Min(limit, 5));
            var tasks = new List<Task<List<AudioFdbWork>>>
            {
                SearchProviderCachedAsync("izibuk_graphql", query, perProvider, offset)
            };

            foreach (var provider in RuBookFdbProvider.Specs.Keys
                .Where(p => RuBook.CanSearch(p))
                .Where(p => AudioBookProviderCatalog.Providers.TryGetValue(p, out var contract) && contract.enabled)
                .OrderBy(p => p))
                tasks.Add(SearchProviderCachedAsync(provider, query, perProvider, offset));

            foreach (var provider in LegacyFdbSearchProviders.OrderBy(p => p))
                tasks.Add(SearchProviderCachedAsync(provider, query, perProvider, offset));

            var result = new List<AudioFdbWork>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var pending = Task.WhenAll(tasks);
            await AwaitDiscoveryAsync(pending, TimeSpan.FromSeconds(8));
            foreach (var batch in tasks.Where(task => task.IsCompletedSuccessfully).Select(task => task.Result))
            {
                foreach (var work in batch)
                {
                    if (!string.IsNullOrWhiteSpace(work.id) && seen.Add(work.id))
                        result.Add(work);
                }
            }

            if (!string.IsNullOrWhiteSpace(query))
                result.AddRange(Store.SearchWorks(query, string.Empty, limit, offset, playableOnly: false));

            return AudioFdbStore.DeduplicateWorks(result)
                .OrderBy(work => DeepSearchRank(work, query))
                .ThenBy(work => AudioFdbStore.HasPlayableChapters(work) ? 0 : 1)
                .Take(limit)
                .ToList();
        }

        private static int DeepSearchRank(AudioFdbWork work, string query)
        {
            var q = AudioFdbStore.Normalize(query);
            if (string.IsNullOrWhiteSpace(q))
                return 0;

            var title = AudioFdbStore.Normalize(work.title);
            if (title == q)
                return 0;

            if (Regex.IsMatch(title, $@"(^|\s){Regex.Escape(q)}($|\s)"))
                return 1;

            if (title.Contains(q, StringComparison.OrdinalIgnoreCase))
                return 2;

            if (work.authors.Any(author => AudioFdbStore.Normalize(author.display_name).Contains(q, StringComparison.OrdinalIgnoreCase)))
                return 3;

            if (work.editions.Any(edition => edition.narrators.Any(narrator => AudioFdbStore.Normalize(narrator.display_name).Contains(q, StringComparison.OrdinalIgnoreCase))))
                return 4;

            if (work.series != null && AudioFdbStore.Normalize(work.series.title).Contains(q, StringComparison.OrdinalIgnoreCase))
                return 5;

            return 9;
        }

        private async Task<List<AudioFdbWork>> HydratePlayableAsync(IEnumerable<AudioFdbWork> works, int limit)
        {
            var selected = AudioFdbStore.DeduplicateWorks(works)
                .Where(w => !string.IsNullOrWhiteSpace(w.id))
                .OrderBy(w => AudioFdbStore.HasPlayableChapters(w) ? 1 : 0)
                .Take(Math.Min(Math.Max(limit, 1), 48))
                .ToList();

            var tasks = selected.Select(async work =>
            {
                try
                {
                    if (AudioFdbStore.HasPlayableChapters(work))
                        return work;

                    if (work.id.StartsWith("work:izibuk:", StringComparison.OrdinalIgnoreCase))
                        return await Izibuk.GetBookAsync(work.id) ?? Store.GetWork(work.id) ?? work;

                    return await EnsureWorkDetailsAsync(Store.GetWork(work.id) ?? work) ?? work;
                }
                catch
                {
                    return Store.GetWork(work.id) ?? work;
                }
            }).ToArray();

            var hydrated = await Task.WhenAll(tasks);
            return AudioFdbStore.DeduplicateWorks(hydrated)
                .Where(AudioFdbStore.HasPlayableChapters)
                .Take(limit)
                .ToList();
        }

        private static async Task<List<AudioFdbWork>> SearchProviderSafe(Func<Task<List<AudioFdbWork>>> search)
        {
            try { return await search(); }
            catch { return new List<AudioFdbWork>(); }
        }

        private static async Task<List<Audiobook>> LegacySearchSafe(IAudiobookModule legacy, string query, int limit, int offset)
        {
            try { return await legacy.SearchAsync(query, limit, offset); }
            catch { return new List<Audiobook>(); }
        }

        private static async Task<List<AudioFdbWork>> SearchLegacyProviderAsync(string provider, string query, int limit, int offset, bool hydrateDetails)
        {
            var legacy = CreateLegacyModule(provider);
            if (legacy == null)
                return new List<AudioFdbWork>();

            using (legacy)
            {
                var books = await LegacySearchSafe(legacy, query, limit, offset);
                var result = new List<AudioFdbWork>();
                var detailLimit = hydrateDetails ? Math.Min(Math.Max(limit, 1), 8) : 0;

                for (var i = 0; i < books.Count; i++)
                {
                    var book = books[i];
                    if (i < detailLimit && book.items.Count == 0 && !string.IsNullOrWhiteSpace(book.url))
                    {
                        try { book = await legacy.GetBookAsync(book.url) ?? book; }
                        catch { }
                    }

                    var work = MapLegacyBook(book);
                    Store.UpsertWork(work);
                    result.Add(work);
                }

                return result;
            }
        }

        private async Task<AudioFdbWork?> EnsureWorkDetailsAsync(AudioFdbWork? work)
        {
            if (work == null) return null;
            var invalidPoster =
                string.IsNullOrWhiteSpace(work.poster_url) ||
                work.poster_url.Contains("data:image", StringComparison.OrdinalIgnoreCase) ||
                work.poster_url.EndsWith("/images/poster.png", StringComparison.OrdinalIgnoreCase);
            var missing = work.editions
                .SelectMany(e => e.sources.Select(s => new { Edition = e, Source = s }))
                .Where(x =>
                    (
                        invalidPoster ||
                        !x.Source.chapters.Any(c => IsPlausibleAudioUrl(c.audio_url)) ||
                        NeedsSourceRefresh(x.Source)
                    ) &&
                    CanHydrateSource(x.Edition, x.Source)
                )
                .GroupBy(x => x.Source.id)
                .Select(g => g.First())
                .Take(24)
                .ToList();

            if (missing.Count == 0)
                return work;

            foreach (var batch in missing.Chunk(6))
                await Task.WhenAll(batch.Select(x => HydrateSourceAsync(x.Edition, x.Source)));

            return Store.GetWork(work.id) ?? work;
        }

        private static AudioFdbWork? MergeKnownVariants(AudioFdbWork? work)
        {
            if (work == null)
                return null;

            var related = Store.SimilarWorks(work, 80, includeChapters: true);
            if (!related.Any(w => string.Equals(w.id, work.id, StringComparison.OrdinalIgnoreCase)))
                related.Insert(0, work);

            return AudioFdbStore.DeduplicateWorks(related).FirstOrDefault() ?? work;
        }

        private async Task<AudioFdbEdition?> EnsureEditionDetailsAsync(AudioFdbEdition? edition)
        {
            if (edition == null) return null;
            var missing = edition.sources
                .Where(s =>
                    (
                        !s.chapters.Any(c => IsPlausibleAudioUrl(c.audio_url)) ||
                        NeedsSourceRefresh(s)
                    ) &&
                    CanHydrateSource(edition, s)
                )
                .GroupBy(s => s.id)
                .Select(g => g.First())
                .Take(12)
                .ToList();

            if (missing.Count == 0)
                return edition;

            foreach (var batch in missing.Chunk(6))
                await Task.WhenAll(batch.Select(source => HydrateSourceAsync(edition, source)));

            return Store.GetEdition(edition.id) ?? edition;
        }

        private static bool CanHydrateSource(AudioFdbEdition edition, AudioFdbSource source)
        {
            if (source == null)
                return false;

            if (string.Equals(source.provider, "izibuk_graphql", StringComparison.OrdinalIgnoreCase) ||
                edition.id.StartsWith("edition:izibuk:", StringComparison.OrdinalIgnoreCase))
                return true;

            return !string.IsNullOrWhiteSpace(source.page_url) &&
                   (RuBook.CanResolve(source.provider) || CreateLegacyModule(source.provider) != null);
        }

        private static bool IsPlausibleAudioUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return false;

            if (
                url.Contains("lis10book.com/audio/", StringComparison.OrdinalIgnoreCase) &&
                !url.Contains(".mp3", StringComparison.OrdinalIgnoreCase) &&
                !url.Contains(".m4a", StringComparison.OrdinalIgnoreCase)
            )
                return false;

            return url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                   url.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
        }

        private static bool NeedsSourceRefresh(AudioFdbSource source)
        {
            if (source == null)
                return false;

            return source.provider.Equals("akniga", StringComparison.OrdinalIgnoreCase) &&
                   !source.chapters.Any(chapter =>
                       chapter.audio_url.Contains(".m3u8", StringComparison.OrdinalIgnoreCase));
        }

        private async Task HydrateSourceAsync(AudioFdbEdition edition, AudioFdbSource source)
        {
            try
            {
                if (string.Equals(source.provider, "izibuk_graphql", StringComparison.OrdinalIgnoreCase) ||
                    edition.id.StartsWith("edition:izibuk:", StringComparison.OrdinalIgnoreCase))
                {
                    await Izibuk.GetBookAsync(FirstNonEmpty(source.external_id, edition.id));
                    return;
                }

                if (!string.IsNullOrWhiteSpace(source.page_url) && RuBook.CanResolve(source.provider))
                {
                    await RuBook.ResolveAsync(source.provider, source.page_url);
                    return;
                }

                if (!string.IsNullOrWhiteSpace(source.page_url))
                {
                    using var legacy = CreateLegacyModule(source.provider);
                    if (legacy == null)
                        return;

                    var book = await legacy.GetBookAsync(source.page_url);
                    if (book != null)
                        Store.UpsertWork(MapLegacyBook(book));
                }
            }
            catch
            {
            }
        }

        private static IAudiobookModule? CreateLegacyModule(string provider)
        {
            return (provider ?? string.Empty).ToLowerInvariant() switch
            {
                "knigavuhe" or "m_knigavuhe_org" => new KnigaVuheModule(),
                "akniga" => new AknigaModule(),
                "izib" or "pda_izibuk_html" => new IzibModule(),
                "yakniga" => new YaKnigaModule(),
                "archive_org" or "librivoxaudio" => new LibrivoxModule(),
                _ => null
            };
        }

        private static AudioFdbWork MapLegacyBook(Audiobook book)
        {
            var provider = string.IsNullOrWhiteSpace(book.source) ? "legacy" : book.source;
            var workKey = AudioFdbStore.StableHash(provider + "|" + book.author + "|" + book.name);
            var readerKey = AudioFdbStore.StableHash(book.reader);
            var work = new AudioFdbWork
            {
                id = "work:" + provider + ":" + workKey,
                title = book.name,
                normalized_title = AudioFdbStore.Normalize(book.name),
                description = book.description,
                poster_url = book.preview
            };

            if (!string.IsNullOrWhiteSpace(book.author))
                work.authors.Add(new AudioFdbPerson { id = "person:" + provider + ":author:" + AudioFdbStore.StableHash(book.author), display_name = book.author, kind = "author", source_provider = provider });

            if (AudioFdbStore.IsUsableSeriesTitle(book.seriesName))
                work.series = new AudioFdbSeries { id = "series:" + provider + ":" + AudioFdbStore.StableHash(book.seriesName), title = book.seriesName, source_provider = provider };

            var edition = new AudioFdbEdition
            {
                id = "edition:" + provider + ":" + workKey + ":" + readerKey,
                work_id = work.id,
                edition_type = "audiobook",
                chapter_count = book.items.Count,
                chapter_fingerprint = string.Join(",", book.items.Select(i => Math.Max(0, i.endTime - i.startTime))),
                quality_score = book.items.Count > 0 ? 0.8 : 0.35
            };

            if (!string.IsNullOrWhiteSpace(book.reader))
                edition.narrators.Add(new AudioFdbPerson { id = "person:" + provider + ":narrator:" + readerKey, display_name = book.reader, kind = "narrator", source_provider = provider });

            var source = new AudioFdbSource
            {
                id = "source:" + provider + ":" + AudioFdbStore.StableHash(FirstNonEmpty(book.url, workKey + "|" + book.reader)),
                edition_id = edition.id,
                provider = provider,
                external_id = book.url,
                page_url = book.url,
                status = "ok"
            };

            foreach (var chapter in book.items)
            {
                var duration = Math.Max(0, chapter.endTime - chapter.startTime);
                source.chapters.Add(new AudioFdbChapter
                {
                    id = source.id + ":chapter:" + chapter.fileIndex,
                    chapter_index = chapter.fileIndex,
                    title = chapter.title,
                    duration_seconds = (long)duration,
                    audio_url = chapter.fileurl,
                    proxy_url = "/audiobooks/audio?url=" + HttpUtility.UrlEncode(chapter.fileurl)
                });
            }

            edition.sources.Add(source);
            work.editions.Add(edition);
            return work;
        }

        private async Task<AudioProviderCheckResult> CheckProvider(AudioProviderContract provider)
        {
            var started = DateTimeOffset.UtcNow;
            var checkUrl = ProviderCheckUrl(provider);
            var result = new AudioProviderCheckResult
            {
                provider = provider.id,
                egress = string.IsNullOrWhiteSpace(provider.egress) ? "direct" : provider.egress,
                url = checkUrl
            };

            try
            {
                using var http = AudiobookModuleBase.CreateClient(useProxy: result.egress.Contains("ru", StringComparison.OrdinalIgnoreCase) || result.egress.Contains("socks", StringComparison.OrdinalIgnoreCase));
                http.Timeout = TimeSpan.FromSeconds(10);
                using var request = new HttpRequestMessage(HttpMethod.Get, checkUrl);
                ApplyHeaders(request, provider.headers, checkUrl);
                using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted);
                result.http_status = (int)response.StatusCode;

                var text = string.Empty;
                if (response.Content.Headers.ContentLength.GetValueOrDefault(0) < 1024 * 1024)
                    text = await response.Content.ReadAsStringAsync();

                result.cloudflare = text.Contains("challenge-error-title", StringComparison.OrdinalIgnoreCase) ||
                                    text.Contains("cf_clearance", StringComparison.OrdinalIgnoreCase);
                result.blocked = text.Contains("blocked_why_headline", StringComparison.OrdinalIgnoreCase) ||
                                 text.Contains("challenge-error-text", StringComparison.OrdinalIgnoreCase);

                if (provider.root.Contains("api.ipify.org", StringComparison.OrdinalIgnoreCase))
                    result.ip_seen_by_remote = text;
            }
            catch (Exception ex)
            {
                result.error = ex.Message;
            }
            finally
            {
                result.elapsed_ms = (long)(DateTimeOffset.UtcNow - started).TotalMilliseconds;
            }

            return result;
        }

        private static void ApplyHeaders(HttpRequestMessage request, AudioBookHeadersProfile profile, string url)
        {
            request.Headers.UserAgent.ParseAdd(profile == AudioBookHeadersProfile.IziMp3 ? "izimobile/1.11.17" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36");
            request.Headers.AcceptLanguage.ParseAdd("ru-RU,ru;q=0.9,en;q=0.8");
            request.Headers.Accept.ParseAdd("text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8");
            request.Headers.TryAddWithoutValidation("Dnt", "1");

            var root = Root(url);
            if (!string.IsNullOrWhiteSpace(root))
                request.Headers.Referrer = new Uri(root);

            if (profile is AudioBookHeadersProfile.IziMp3 or AudioBookHeadersProfile.BazaMp3 or AudioBookHeadersProfile.SlushatMp3 or AudioBookHeadersProfile.PoleknigMp3)
            {
                request.Headers.TryAddWithoutValidation("Range", "bytes=0-");
                request.Headers.TryAddWithoutValidation("Sec-Fetch-Dest", "audio");
            }
        }

        private static string ProviderCheckUrl(AudioProviderContract provider)
        {
            if (provider.id.Equals("izibuk_graphql", StringComparison.OrdinalIgnoreCase))
                return provider.root.TrimEnd('/') + "/?query=%7Bgenres%7Bid%7D%7D&ru_audioknigi_app=1";

            return provider.root;
        }

        private bool DevAllowed()
        {
            var expected = Environment.GetEnvironmentVariable("AUDIOBOOK_DEVKEY");
            if (!string.IsNullOrWhiteSpace(expected) && Request.Query.TryGetValue("devkey", out var actual))
                return string.Equals(expected, actual.ToString(), StringComparison.Ordinal);

            return false;
        }

        private static string FirstNonEmpty(params string[] values)
            => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? string.Empty;

        private static string Root(string url)
        {
            try
            {
                var uri = new Uri(url);
                return uri.Scheme + "://" + uri.Host + "/";
            }
            catch { return string.Empty; }
        }

        private static string DecodeToken(string token)
        {
            try
            {
                var s = token.Replace('-', '+').Replace('_', '/');
                s = s.PadRight(s.Length + (4 - s.Length % 4) % 4, '=');
                return Encoding.UTF8.GetString(Convert.FromBase64String(s));
            }
            catch { return string.Empty; }
        }
    }
}
