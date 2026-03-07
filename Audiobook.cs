using Microsoft.AspNetCore.Mvc;
using HtmlAgilityPack;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;

namespace Lampac.Modules.Audiobooks
{
    public sealed class Audiobook
    {
        public string Author { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string SeriesName { get; init; } = string.Empty;
        public string NumberInSeries { get; init; } = string.Empty;
        public string Description { get; init; } = string.Empty;
        public string Reader { get; init; } = string.Empty;
        public string Duration { get; init; } = string.Empty;
        public string Url { get; init; } = string.Empty;
        public string Preview { get; init; } = string.Empty;
        public string Driver { get; init; } = string.Empty;
        public List<AudiobookChapter> Items { get; } = new List<AudiobookChapter>();
    }

    public sealed class AudiobookChapter
    {
        public string FileUrl { get; init; } = string.Empty;
        public int FileIndex { get; init; }
        public string Title { get; init; } = string.Empty;
        public double StartTime { get; init; }
        public double EndTime { get; init; }
    }

    public interface IAudiobookModule : IDisposable
    {
        Task<Audiobook?> GetBookAsync(string url);
        Task<List<Audiobook>> GetSeriesAsync(string url);
        Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0);
    }

    internal abstract class AudiobookModuleBase : IAudiobookModule
    {
        protected readonly HttpClient HttpClient;
        private readonly bool _ownsClient;

        protected AudiobookModuleBase(HttpClient? httpClient = null)
        {
            if (httpClient == null)
            {
                _ownsClient = true;
                HttpClient = new HttpClient();
            }
            else
            {
                HttpClient = httpClient;
            }
        }

        public virtual void Dispose()
        {
            if (_ownsClient)
                HttpClient.Dispose();
        }

        public abstract Task<Audiobook?> GetBookAsync(string url);
        public abstract Task<List<Audiobook>> GetSeriesAsync(string url);
        public abstract Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0);

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

        public KnigaVuheModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var html = await HttpClient.GetStringAsync(url);
            var doc = LoadDocument(html);

            var bookMatch = Regex.Match(html, @"cur\.book = (.+);");
            if (!bookMatch.Success) return null;
            var bookData = JsonNode.Parse(bookMatch.Groups[1].Value)?.AsObject();
            if (bookData == null) return null;

            var playlistMatch = Regex.Match(html, @"var player = new BookPlayer\(\d+, (\[.+?\]).+\);", RegexOptions.Singleline);
            var playlist = playlistMatch.Success ? JsonNode.Parse(playlistMatch.Groups[1].Value)?.AsArray() : null;

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'book_title_elem')]//span/a"));
            if (string.IsNullOrWhiteSpace(author)) author = "unknown_author";

            var book = new Audiobook
            {
                Author = SafeName(author),
                Name = SafeName(bookData["name"]?.GetValue<string>()),
                SeriesName = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_title')]/a"))),
                NumberInSeries = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_item')]/span[contains(@class,'bookkitem_serie_index')]"))),
                Description = SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_description')]")),
                Reader = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//a[starts-with(@href, '/reader/')]"))),
                Duration = SafeDuration(doc),
                Url = url,
                Preview = SafeAttribute(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_cover')]//img"), "src"),
                Driver = "knigavuhe"
            };

            if (playlist != null)
            {
                int idx = 0;
                foreach (var item in playlist)
                {
                    var fileUrl = item?["url"]?.GetValue<string>();
                    if (string.IsNullOrWhiteSpace(fileUrl)) continue;
                    book.Items.Add(new AudiobookChapter
                    {
                        FileUrl = fileUrl,
                        FileIndex = idx++,
                        Title = SafeName(item?["title"]?.GetValue<string>()),
                        StartTime = 0,
                        EndTime = item?["duration"]?.GetValue<double?>() ?? 0,
                    });
                }
            }

            return book;
        }

        public override async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var html = await HttpClient.GetStringAsync(url);
            var doc = LoadDocument(html);

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'book_title_elem')]//span/a"));
            if (string.IsNullOrWhiteSpace(author)) author = "unknown_author";

            var seriesLink = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_title')]/a");
            if (seriesLink == null) return new List<Audiobook>();

            var seriesName = SafeText(seriesLink);
            var seriesUrl = BuildAbsoluteUrl(SiteUrl, seriesLink.GetAttributeValue("href", string.Empty));

            var seriesHtml = await HttpClient.GetStringAsync(seriesUrl);
            var seriesDoc = LoadDocument(seriesHtml);

            var list = new List<Audiobook>();
            var cards = seriesDoc.DocumentNode.SelectNodes("//div[contains(@class,'bookkitem') and not(.//span[contains(@class,'bookkitem_litres_icon')])]") ?? new HtmlNodeCollection(null);

            foreach (var card in cards)
            {
                var baseBook = ParseCard(card, author, seriesName);
                if (baseBook == null) continue;
                list.Add(baseBook);

                var alt = card.SelectNodes(".//div[contains(@class,'bookkitem_other_versions_list')]//a");
                if (alt == null) continue;

                string u = string.Empty;
                string name = string.Empty;
                foreach (var item in alt)
                {
                    if (string.IsNullOrEmpty(u))
                    {
                        u = BuildAbsoluteUrl(SiteUrl, item.GetAttributeValue("href", string.Empty));
                        name = SafeText(item);
                    }
                    else
                    {
                        list.Add(new Audiobook
                        {
                            Author = baseBook.Author,
                            Name = SafeName(name),
                            SeriesName = baseBook.SeriesName,
                            NumberInSeries = baseBook.NumberInSeries,
                            Reader = SafeName(SafeText(item)),
                            Url = u,
                            Preview = baseBook.Preview,
                            Driver = "knigavuhe"
                        });
                        u = string.Empty;
                        name = string.Empty;
                    }
                }
            }

            return list;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0)
        {
            var books = new List<Audiobook>();
            var page = 1;
            while (books.Count < limit)
            {
                var searchUrl = $"{SiteUrl}/search/?q={HttpUtility.UrlEncode(query)}&page={page}";
                var html = await HttpClient.GetStringAsync(searchUrl);
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
                    var b = ParseCard(card, "unknown_author", string.Empty);
                    if (b != null) books.Add(b);
                    if (books.Count >= limit) break;
                }
                page++;
            }
            return books;
        }

        private static string SafeDuration(HtmlDocument doc)
        {
            var label = doc.DocumentNode.SelectSingleNode("//span[text()='Время звучания:']");
            var textNode = label?.ParentNode?.ChildNodes.LastOrDefault(x => x.NodeType == HtmlNodeType.Text);
            return textNode?.InnerText.Trim() ?? string.Empty;
        }

        private static Audiobook? ParseCard(HtmlNode card, string authorFallback, string seriesFallback)
        {
            var relUrl = SafeAttribute(card.SelectSingleNode(".//a[contains(@class,'bookkitem_cover')]"), "href");
            if (string.IsNullOrWhiteSpace(relUrl)) return null;

            var number = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_serie_index')]"));
            var name = SafeText(card.SelectSingleNode(".//a[contains(@class,'bookkitem_name')]"));
            if (!string.IsNullOrWhiteSpace(number))
                name = name.Replace(number + ". ", string.Empty);

            var author = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_author')]/a"));
            if (string.IsNullOrWhiteSpace(author)) author = authorFallback;

            var series = SafeText(card.SelectSingleNode(".//a[starts-with(@href, '/serie/') ]"));
            if (string.IsNullOrWhiteSpace(series)) series = seriesFallback;

            return new Audiobook
            {
                Author = SafeName(author),
                Name = SafeName(name),
                SeriesName = SafeName(series),
                NumberInSeries = SafeName(number),
                Reader = SafeName(SafeText(card.SelectSingleNode(".//a[starts-with(@href, '/reader/')]"))),
                Duration = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_meta_time')]")),
                Url = BuildAbsoluteUrl(SiteUrl, relUrl),
                Preview = SafeAttribute(card.SelectSingleNode(".//img[contains(@class,'bookkitem_cover_img')]"), "src"),
                Driver = "knigavuhe"
            };
        }
    }

    public sealed class AknigaModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://akniga.org";

        public AknigaModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var html = await HttpClient.GetStringAsync(url);
            var doc = LoadDocument(html);

            var bidMatch = Regex.Match(html, @"page_bid\s*=\s*(\d+)");
            var bookDataMatch = Regex.Match(html, @"bookData\s*=\s*(\{.+?\});", RegexOptions.Singleline);
            var hlsMatch = Regex.Match(html, @"hls\s*=\s*(\{.+?\});", RegexOptions.Singleline);
            if (!bidMatch.Success || !bookDataMatch.Success) return null;

            var bid = bidMatch.Groups[1].Value;
            var bookDataRoot = JsonNode.Parse(bookDataMatch.Groups[1].Value)?.AsObject();
            if (bookDataRoot == null || bookDataRoot[bid] == null) return null;
            var data = bookDataRoot[bid]!.AsObject();

            var hlsUrl = string.Empty;
            if (hlsMatch.Success)
            {
                var hlsRoot = JsonNode.Parse(hlsMatch.Groups[1].Value)?.AsObject();
                hlsUrl = hlsRoot?[bid]?["url"]?.GetValue<string>() ?? string.Empty;
            }

            var descriptionNode = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'description__article-main')]");
            if (descriptionNode != null)
            {
                var caption = descriptionNode.SelectSingleNode(".//div[contains(@class,'content__main__book--item--caption')]");
                caption?.Remove();
            }

            var book = new Audiobook
            {
                Author = SafeName(data["author"]?.GetValue<string>() ?? "unknown_author"),
                Name = SafeName(data["titleonly"]?.GetValue<string>()),
                SeriesName = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'caption__article-main--book')]/a"))),
                NumberInSeries = SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'content__main__book--item--series-list')]//a[contains(@class,'current')]/b")).Trim('.'),
                Description = SafeText(descriptionNode),
                Reader = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//a[contains(@class,'link__reader')]//span"))),
                Duration = string.Join(" ", doc.DocumentNode.SelectNodes("//span[contains(@class,'book-duration-')]/span")?.Select(SafeText) ?? Enumerable.Empty<string>()).Trim(),
                Url = url,
                Preview = SafeAttribute(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book--cover')]//img"), "src"),
                Driver = "akniga"
            };

            var items = data["items"]?.AsArray();
            if (items != null)
            {
                foreach (var item in items)
                {
                    book.Items.Add(new AudiobookChapter
                    {
                        FileUrl = hlsUrl,
                        FileIndex = (item?["file"]?.GetValue<int?>() ?? 1) - 1,
                        Title = SafeName(item?["title"]?.GetValue<string>()),
                        StartTime = ParseSeconds(item?["time_from_start"]?.GetValue<string>()),
                        EndTime = ParseSeconds(item?["time_finish"]?.GetValue<string>())
                    });
                }
            }

            return book;
        }

        public override async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var html = await HttpClient.GetStringAsync(url);
            var doc = LoadDocument(html);
            var firstSeries = doc.DocumentNode.SelectSingleNode("//span[contains(@class,'caption__article-main--book')]/a");
            if (firstSeries == null) return new List<Audiobook>();

            var seriesUrl = BuildAbsoluteUrl(SiteUrl, firstSeries.GetAttributeValue("href", string.Empty));
            var books = new List<Audiobook>();

            var firstPage = LoadDocument(await HttpClient.GetStringAsync(seriesUrl));
            var pageUrls = new HashSet<string> { seriesUrl };
            var pageLinks = firstPage.DocumentNode.SelectNodes("//a[contains(@class,'page__nav--standart')]") ?? new HtmlNodeCollection(null);
            foreach (var link in pageLinks)
                pageUrls.Add(BuildAbsoluteUrl(SiteUrl, link.GetAttributeValue("href", string.Empty)));

            foreach (var pageUrl in pageUrls)
            {
                var pageDoc = pageUrl == seriesUrl ? firstPage : LoadDocument(await HttpClient.GetStringAsync(pageUrl));
                var cards = pageDoc.DocumentNode.SelectNodes("//div[contains(@class,'content__main__articles--series-item') and not(.//div[contains(@class,'caption__article-preview')])]") ?? new HtmlNodeCollection(null);
                foreach (var card in cards)
                {
                    var book = ParseAknigaCard(card);
                    if (book != null) books.Add(book);
                }
            }

            return books;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0)
        {
            var books = new List<Audiobook>();
            var page = 1;
            while (books.Count < limit)
            {
                var searchUrl = $"{SiteUrl}/search/books/page{page}/?q={HttpUtility.UrlEncode(query)}";
                var doc = LoadDocument(await HttpClient.GetStringAsync(searchUrl));
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

        private static Audiobook? ParseAknigaCard(HtmlNode card)
        {
            var link = card.SelectSingleNode(".//div[contains(@class,'article--cover')]/a");
            var relUrl = SafeAttribute(link, "href");
            if (string.IsNullOrWhiteSpace(relUrl)) return null;

            var img = card.SelectSingleNode(".//div[contains(@class,'article--cover')]/a/img");
            var author = SafeText(card.SelectSingleNode(".//span[contains(@class,'link__action--author')]//svg[.//use[contains(@xlink:href,'author')]]/following-sibling::a[1]"));
            if (string.IsNullOrWhiteSpace(author)) author = "unknown_author";

            var name = SafeAttribute(img, "alt");
            if (string.IsNullOrWhiteSpace(name))
            {
                var raw = SafeText(card.SelectSingleNode(".//*[contains(@class,'caption__article-main')]"));
                name = raw.Replace(author + " - ", string.Empty).Trim();
            }

            var seriesRaw = SafeText(card.SelectSingleNode(".//span[contains(@class,'link__action--author')]//svg[.//use[contains(@xlink:href,'series')]]/following-sibling::a[1]"));
            var series = string.Empty;
            var number = string.Empty;
            var m = Regex.Match(seriesRaw, @"^(?<name>.+?) \((?<number>\d+)\)$");
            if (m.Success)
            {
                series = m.Groups["name"].Value;
                number = m.Groups["number"].Value;
            }
            else
            {
                series = seriesRaw;
            }

            return new Audiobook
            {
                Author = SafeName(author),
                Name = SafeName(name),
                SeriesName = SafeName(series),
                NumberInSeries = number,
                Reader = SafeName(SafeText(card.SelectSingleNode(".//span[contains(@class,'link__action--author')]//svg[.//use[contains(@xlink:href,'performer')]]/following-sibling::a[1]"))),
                Duration = SafeText(card.SelectSingleNode(".//span[contains(@class,'link__action--label--time')]")),
                Url = BuildAbsoluteUrl(SiteUrl, relUrl),
                Preview = SafeAttribute(img, "src"),
                Driver = "akniga"
            };
        }
    }

    public sealed class IzibModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://izib.uk";

        public IzibModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var html = await HttpClient.GetStringAsync(url);
            var doc = LoadDocument(html);

            var playerMatch = Regex.Match(html, @"var player = new XSPlayer\(((\s*.*?)+?)\);");
            if (!playerMatch.Success) return null;
            var player = JsonNode.Parse(playerMatch.Groups[1].Value)?.AsObject();
            if (player == null) return null;

            var mp3Prefix = player["mp3_url_prefix"]?.GetValue<string>() ?? string.Empty;
            var host = string.IsNullOrWhiteSpace(mp3Prefix) ? string.Empty : $"https://{mp3Prefix.Trim('/')}";

            var book = new Audiobook
            {
                Name = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//span[@itemprop='name']"))),
                Author = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//span//a[starts-with(@href,'/author')]")) is var a && string.IsNullOrWhiteSpace(a) ? "unknown_author" : a),
                SeriesName = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//a[starts-with(@href,'/serie')]"))),
                NumberInSeries = SafeText(doc.DocumentNode.SelectSingleNode("//div[.//a[starts-with(@href,'/serie')]]//div[.//strong]//span")).Trim().TrimEnd('.'),
                Description = SafeText(doc.DocumentNode.SelectSingleNode("//div[@itemprop='description']")),
                Reader = SafeName(SafeText(doc.DocumentNode.SelectSingleNode("//div[.//span[@itemprop='author']]//a[starts-with(@href,'/reader')]"))),
                Duration = SafeText(doc.DocumentNode.SelectSingleNode("//div[.//span[@itemprop='author']]/div[last()] ")).Replace("Время: ", string.Empty).Trim(),
                Url = url,
                Preview = SafeAttribute(doc.DocumentNode.SelectSingleNode("//img"), "src"),
                Driver = "izib"
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

                    book.Items.Add(new AudiobookChapter
                    {
                        FileUrl = string.IsNullOrEmpty(host) ? path : $"{host}/{path.TrimStart('/')}",
                        FileIndex = idx++,
                        Title = SafeName(arr[1]?.GetValue<string>()),
                        StartTime = 0,
                        EndTime = arr[2]?.GetValue<double?>() ?? 0
                    });
                }
            }

            return book;
        }

        public override async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var html = await HttpClient.GetStringAsync(url);
            var doc = LoadDocument(html);

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//a[starts-with(@href,'/author')]"));
            if (string.IsNullOrWhiteSpace(author)) author = "unknown_author";

            var seriesLink = doc.DocumentNode.SelectSingleNode("//a[starts-with(@href,'/serie')]");
            if (seriesLink == null) return new List<Audiobook>();

            var seriesName = SafeText(seriesLink);
            var seriesUrl = BuildAbsoluteUrl(SiteUrl, seriesLink.GetAttributeValue("href", string.Empty));
            var seriesDoc = LoadDocument(await HttpClient.GetStringAsync(seriesUrl));

            var books = new List<Audiobook>();
            var cards = seriesDoc.DocumentNode.SelectNodes("//*[@id='books_list']/div[not(.//a[starts-with(@href,'/book')]/following-sibling::span)]") ?? new HtmlNodeCollection(null);
            foreach (var card in cards)
            {
                var b = ParseIzibCard(card, author, seriesName);
                if (b != null) books.Add(b);
            }
            return books;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0)
        {
            var books = new List<Audiobook>();
            var page = 1;
            while (books.Count < limit)
            {
                var searchUrl = $"{SiteUrl}/search?q={HttpUtility.UrlEncode(query)}&p={page}";
                var doc = LoadDocument(await HttpClient.GetStringAsync(searchUrl));
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
                    var b = ParseIzibCard(card, "unknown_author", string.Empty);
                    if (b != null) books.Add(b);
                    if (books.Count >= limit) break;
                }

                page++;
            }
            return books;
        }

        private static Audiobook? ParseIzibCard(HtmlNode card, string authorFallback, string seriesFallback)
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
                Author = SafeName(author),
                Name = SafeName(SafeText(link)),
                SeriesName = SafeName(series),
                NumberInSeries = number,
                Reader = SafeName(SafeText(card.SelectSingleNode(".//a[starts-with(@href,'/reader')]"))),
                Url = BuildAbsoluteUrl(SiteUrl, relUrl),
                Preview = SafeAttribute(card.SelectSingleNode(".//img"), "src"),
                Driver = "izib"
            };
        }
    }

    public sealed class YaKnigaModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://yakniga.org";
        private const string ApiUrl = "https://yakniga.org/graphql";

        public YaKnigaModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var data = await GetBookDataAsync(url);
            if (data == null) return null;

            var book = ParseYaknigaData(data, "yakniga", false);
            if (book == null) return null;

            var chapters = data["chapters"]?["collection"]?.AsArray();
            if (chapters != null)
            {
                int idx = 0;
                foreach (var chapter in chapters)
                {
                    var file = chapter?["fileUrl"]?.GetValue<string>() ?? string.Empty;
                    if (string.IsNullOrWhiteSpace(file)) continue;
                    book.Items.Add(new AudiobookChapter
                    {
                        FileUrl = BuildAbsoluteUrl(SiteUrl, file),
                        FileIndex = idx++,
                        Title = SafeName(chapter?["name"]?.GetValue<string>()),
                        StartTime = 0,
                        EndTime = chapter?["duration"]?.GetValue<double?>() ?? 0
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
                var book = ParseYaknigaData(item as JsonObject, "yakniga", true);
                if (book != null) books.Add(book);
            }
            return books;
        }

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0)
        {
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
                var book = ParseYaknigaData(card, "yakniga", true);
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

        private static Audiobook? ParseYaknigaData(JsonObject? data, string driver, bool suppressExceptions)
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
                    Author = SafeName(data["authorName"]?.GetValue<string>() ?? "unknown_author"),
                    Name = SafeName(data["title"]?.GetValue<string>()),
                    SeriesName = SafeName(data["seriesName"]?.GetValue<string>()),
                    NumberInSeries = seriesNum,
                    Description = description,
                    Reader = SafeName(data["readers"]?.AsArray().FirstOrDefault()?["name"]?.GetValue<string>()),
                    Duration = SecondsToClock(data["duration"]?.GetValue<long?>()),
                    Url = url,
                    Preview = string.IsNullOrWhiteSpace(cover) ? string.Empty : BuildAbsoluteUrl(SiteUrl, cover),
                    Driver = driver
                };
            }
            catch
            {
                if (!suppressExceptions)
                    throw;
                return null;
            }
        }
    }

    public sealed class LibrivoxModule : AudiobookModuleBase
    {
        private const string SiteUrl = "https://archive.org";
        private const string Collection = "librivoxaudio";
        private const string SelectedFormat = "128Kbps MP3";

        public LibrivoxModule(HttpClient? httpClient = null) : base(httpClient) { }

        public override async Task<Audiobook?> GetBookAsync(string url)
        {
            var identifier = url.Trim('/').Split('/').LastOrDefault();
            if (string.IsNullOrWhiteSpace(identifier)) return null;

            var json = await HttpClient.GetStringAsync($"{SiteUrl}/metadata/{identifier}");
            var root = JsonNode.Parse(json)?.AsObject();
            var metadata = root?["metadata"]?.AsObject();
            var files = root?["files"]?.AsArray();
            if (metadata == null || files == null) return null;

            var authorNode = metadata["creator"];
            var author = authorNode is JsonArray arr ? arr.FirstOrDefault()?.GetValue<string>() : authorNode?.GetValue<string>() ?? "unknown_author";
            var title = metadata["title"]?.GetValue<string>() ?? string.Empty;
            var runtime = metadata["runtime"]?.GetValue<string>() ?? string.Empty;
            var description = StripHtml(metadata["description"]?.GetValue<string>() ?? string.Empty);

            var coverFile = files.FirstOrDefault(f => f?["format"]?.GetValue<string>() == "JPEG")?["name"]?.GetValue<string>();
            var preview = string.IsNullOrWhiteSpace(coverFile) ? string.Empty : $"{SiteUrl}/download/{identifier}/{coverFile}";

            var book = new Audiobook
            {
                Author = SafeName(author),
                Name = SafeName(title),
                Description = description,
                Duration = runtime,
                Url = url,
                Preview = preview,
                Driver = Collection
            };

            var tracks = files.Where(f => f?["format"]?.GetValue<string>() == SelectedFormat).ToList();
            int idx = 0;
            foreach (var track in tracks)
            {
                var fileName = track?["name"]?.GetValue<string>() ?? string.Empty;
                if (string.IsNullOrWhiteSpace(fileName)) continue;

                book.Items.Add(new AudiobookChapter
                {
                    FileUrl = $"{SiteUrl}/download/{identifier}/{fileName}",
                    FileIndex = ++idx,
                    Title = SafeName(track?["title"]?.GetValue<string>()),
                    StartTime = 0,
                    EndTime = Math.Floor(track?["length"]?.GetValue<double?>() ?? 0)
                });
            }

            return book;
        }

        public override Task<List<Audiobook>> GetSeriesAsync(string url) => Task.FromResult(new List<Audiobook>());

        public override async Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0)
        {
            var books = new List<Audiobook>();
            var page = 1;

            while (books.Count < limit)
            {
                var searchUrl =
                    $"{SiteUrl}/advancedsearch.php?q=title:({HttpUtility.UrlEncode(query.ToLower())})+AND+collection:%22{Collection}%22" +
                    $"&fl[]=creator&fl[]=identifier&fl[]=title&rows={limit}&page={page}&output=json";

                var json = await HttpClient.GetStringAsync(searchUrl);
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
                        Author = SafeName(hit?["creator"]?.GetValue<string>() ?? "unknown_author"),
                        Name = SafeName(hit?["title"]?.GetValue<string>()),
                        Url = $"{SiteUrl}/details/{id}",
                        Preview = $"{SiteUrl}/services/img/{id}",
                        Driver = Collection
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
}

namespace Lampac.Controllers
{
    using Lampac.Modules.Audiobooks;

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
        public async Task<IActionResult> search(string query, int limit = 10, int offset = 0)
        {
            if (string.IsNullOrWhiteSpace(query)) return BadRequest("query is required");
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
}
