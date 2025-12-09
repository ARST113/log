using Lampac.Modules.Audiobooks;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web;
using HtmlAgilityPack;

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
        public string Driver { get; init; } = "knigavuhe";
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

    /// <summary>
    /// Lampac-friendly port of the audiobook parsing logic used in AudioBookPlayer's KnigaVUhe driver.
    /// Keeps the same behaviour: grabbing book metadata, chapters, related series entries and search results.
    /// </summary>
    public sealed class KnigaVuheModule : IDisposable
    {
        private const string SiteUrl = "https://knigavuhe.org";
        private readonly HttpClient _httpClient;
        private bool _ownsClient;

        public KnigaVuheModule(HttpClient? httpClient = null)
        {
            if (httpClient == null)
            {
                _ownsClient = true;
                _httpClient = new HttpClient();
            }
            else
            {
                _httpClient = httpClient;
            }
        }

        public void Dispose()
        {
            if (_ownsClient)
            {
                _httpClient.Dispose();
            }
        }

        public async Task<Audiobook?> GetBookAsync(string url)
        {
            var html = await _httpClient.GetStringAsync(url);
            var doc = LoadDocument(html);

            var bookMatch = Regex.Match(html, @"cur\.book = (.+);");
            if (!bookMatch.Success)
                return null;

            JsonObject? bookData = JsonNode.Parse(bookMatch.Groups[1].Value)?.AsObject();
            if (bookData == null)
                return null;

            var playlistMatch = Regex.Match(html, @"var player = new BookPlayer\(\d+, (\[.+?]).+\);", RegexOptions.Singleline);
            JsonArray? playlist = playlistMatch.Success
                ? JsonNode.Parse(playlistMatch.Groups[1].Value)?.AsArray()
                : null;

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'book_title_elem')]//span/a"));
            if (string.IsNullOrWhiteSpace(author))
                author = "unknown_author";

            var seriesName = SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_title')]/a"));
            var numberInSeries = SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_item')]/span[contains(@class,'bookkitem_serie_index')]"));
            var description = SafeText(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_description')]"));
            var reader = SafeText(doc.DocumentNode.SelectSingleNode("//a[starts-with(@href, '/reader/')]"));
            var duration = SafeText(GetDurationNode(doc));
            var preview = SafeAttribute(doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_cover')]//img"), "src");

            var book = new Audiobook
            {
                Author = SafeName(author),
                Name = SafeName(bookData["name"]?.GetValue<string>() ?? string.Empty),
                SeriesName = SafeName(seriesName),
                NumberInSeries = SafeName(numberInSeries),
                Description = description,
                Reader = SafeName(reader),
                Duration = duration,
                Url = url,
                Preview = preview
            };

            if (playlist != null)
            {
                int index = 0;
                foreach (var item in playlist)
                {
                    var fileUrl = item?["url"]?.GetValue<string>();
                    if (string.IsNullOrWhiteSpace(fileUrl))
                        continue;

                    book.Items.Add(new AudiobookChapter
                    {
                        FileUrl = fileUrl,
                        FileIndex = index++,
                        Title = SafeName(item?["title"]?.GetValue<string>() ?? string.Empty),
                        StartTime = 0,
                        EndTime = item?["duration"]?.GetValue<double?>() ?? 0
                    });
                }
            }

            return book;
        }

        public async Task<List<Audiobook>> GetSeriesAsync(string url)
        {
            var html = await _httpClient.GetStringAsync(url);
            var doc = LoadDocument(html);

            var author = SafeText(doc.DocumentNode.SelectSingleNode("//span[contains(@class,'book_title_elem')]//span/a"));
            if (string.IsNullOrWhiteSpace(author))
                author = "unknown_author";

            var seriesLink = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'book_serie_block_title')]/a");
            if (seriesLink == null)
                return new List<Audiobook>();

            var seriesUrl = SiteUrl + seriesLink.GetAttributeValue("href", string.Empty);
            var seriesName = SafeText(seriesLink);

            var seriesPage = await _httpClient.GetStringAsync(seriesUrl);
            var seriesDoc = LoadDocument(seriesPage);

            var books = new List<Audiobook>();
            foreach (var card in SelectBookCards(seriesDoc))
            {
                var parsed = ParseBookCard(card, author, seriesName);
                if (parsed != null)
                {
                    books.Add(parsed);
                    AppendAlternateVersions(card, parsed, books);
                }
            }

            return books;
        }

        public async Task<List<Audiobook>> SearchAsync(string query, int limit = 10, int offset = 0)
        {
            var books = new List<Audiobook>();
            var pageNumber = 1;

            while (books.Count < limit)
            {
                var searchUrl = $"{SiteUrl}/search/?q={HttpUtility.UrlEncode(query)}&page={pageNumber}";
                var html = await _httpClient.GetStringAsync(searchUrl);
                var doc = LoadDocument(html);
                var cards = SelectBookCards(doc).ToList();
                if (!cards.Any())
                    break;

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
                    var parsed = ParseBookCard(card, "unknown_author", string.Empty);
                    if (parsed != null)
                        books.Add(parsed);

                    if (books.Count == limit)
                        break;
                }

                pageNumber++;
            }

            return books;
        }

        private static HtmlDocument LoadDocument(string html)
        {
            var doc = new HtmlDocument();
            doc.LoadHtml(html);
            return doc;
        }

        private static IEnumerable<HtmlNode> SelectBookCards(HtmlDocument doc)
        {
            return doc.DocumentNode.SelectNodes("//div[contains(@class,'bookkitem') and not(.//span[contains(@class,'bookkitem_litres_icon')])]")
                   ?? Enumerable.Empty<HtmlNode>();
        }

        private Audiobook? ParseBookCard(HtmlNode card, string authorFallback, string seriesNameFallback)
        {
            var url = SafeAttribute(card.SelectSingleNode(".//a[contains(@class,'bookkitem_cover')]"), "href");
            var preview = SafeAttribute(card.SelectSingleNode(".//img[contains(@class,'bookkitem_cover_img')]"), "src");
            if (string.IsNullOrWhiteSpace(url))
                return null;

            var numberInSeries = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_serie_index')]"));
            var name = SafeText(card.SelectSingleNode(".//a[contains(@class,'bookkitem_name')]"));
            if (!string.IsNullOrEmpty(numberInSeries) && !string.IsNullOrEmpty(name))
                name = name.Replace($"{numberInSeries}. ", string.Empty);

            var author = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_author')]/a"));
            if (string.IsNullOrWhiteSpace(author))
                author = authorFallback;

            var reader = SafeText(card.SelectSingleNode(".//a[starts-with(@href, '/reader/')]"));
            var duration = SafeText(card.SelectSingleNode(".//span[contains(@class,'bookkitem_meta_time')]"));
            var seriesName = SafeText(card.SelectSingleNode(".//a[starts-with(@href, '/serie/')]"));
            if (string.IsNullOrWhiteSpace(seriesName))
                seriesName = seriesNameFallback;

            return new Audiobook
            {
                Author = SafeName(author),
                Name = SafeName(name),
                SeriesName = SafeName(seriesName),
                NumberInSeries = SafeName(numberInSeries),
                Reader = SafeName(reader),
                Duration = duration,
                Url = SiteUrl + url,
                Preview = preview
            };
        }

        private void AppendAlternateVersions(HtmlNode card, Audiobook baseBook, List<Audiobook> target)
        {
            var alternates = card.SelectNodes(".//div[contains(@class,'bookkitem_other_versions_list')]//a");
            if (alternates == null || alternates.Count == 0)
                return;

            string? url = null;
            string? name = null;

            foreach (var alt in alternates)
            {
                if (url == null)
                {
                    url = SiteUrl + alt.GetAttributeValue("href", string.Empty);
                    name = SafeText(alt);
                }
                else
                {
                    var reader = SafeText(alt);
                    target.Add(new Audiobook
                    {
                        Author = baseBook.Author,
                        Name = SafeName(name ?? string.Empty),
                        SeriesName = baseBook.SeriesName,
                        NumberInSeries = baseBook.NumberInSeries,
                        Reader = SafeName(reader),
                        Url = url,
                        Preview = baseBook.Preview
                    });

                    url = null;
                    name = null;
                }
            }
        }

        private static string SafeName(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return string.Empty;

            return HttpUtility.HtmlDecode(value.Trim());
        }

        private static string SafeText(HtmlNode? node)
        {
            if (node == null)
                return string.Empty;

            return HttpUtility.HtmlDecode(node.InnerText.Trim());
        }

        private static string SafeAttribute(HtmlNode? node, string attribute)
        {
            if (node == null)
                return string.Empty;

            return node.GetAttributeValue(attribute, string.Empty);
        }

        private static HtmlNode? GetDurationNode(HtmlDocument doc)
        {
            var label = doc.DocumentNode.SelectSingleNode("//span[text()='Время звучания:']");
            return label?.ParentNode?.ChildNodes.LastOrDefault(n => n.NodeType == HtmlNodeType.Text);
        }
    }
}

namespace Lampac.Controllers
{
    [Route("knigavuhe/[action]")]
    public sealed class KnigaVuheController : Controller
    {
        private readonly KnigaVuheModule _module;

        public KnigaVuheController(IHttpClientFactory? httpClientFactory = null)
        {
            _module = httpClientFactory != null
                ? new KnigaVuheModule(httpClientFactory.CreateClient())
                : new KnigaVuheModule();
        }

        [HttpGet]
        public async Task<IActionResult> book(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return BadRequest("url is required");

            var book = await _module.GetBookAsync(url);
            if (book == null)
                return NotFound();

            return Json(book);
        }

        [HttpGet]
        public async Task<IActionResult> series(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
                return BadRequest("url is required");

            var series = await _module.GetSeriesAsync(url);
            return Json(series);
        }

        [HttpGet]
        public async Task<IActionResult> search(string query, int limit = 10, int offset = 0)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("query is required");

            var books = await _module.SearchAsync(query, limit, offset);
            return Json(books);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
                _module.Dispose();

            base.Dispose(disposing);
        }
    }
}
