using System.Net;
using System.Net.Sockets;

public static class PublicNetwork
{
    private static readonly HashSet<string> ProxyHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "akniga.org", "knigavuhe.org", "m.knigavuhe.org", "izib.uk", "pda.izib.uk", "api.izib.uk",
        "yakniga.org", "archive.org", "audioboo.org", "audiokniga.one", "audioknigi.pro",
        "audioknigivse.ru", "audiopolka.club", "aume.ru", "author.today", "baza-knig.top",
        "knigoblud.club", "www.knigoblud.club", "lis10book.com", "listenbook.ru", "mp3knig.net",
        "otrub.in", "poleknig.com", "slushat-knigi.com", "slushkinvsem.ru", "uknig.com",
        "fantlab.ru", "openlibrary.org", "covers.openlibrary.org", "www.googleapis.com", "api.ipify.org"
    };

    public static bool IsTrustedProxyTarget(Uri? uri) => uri != null &&
        (uri.Scheme == "https" || uri.Scheme == "http") && (uri.Port == 80 || uri.Port == 443) &&
        string.IsNullOrEmpty(uri.UserInfo) && ProxyHosts.Contains(uri.IdnHost);

    public sealed class ProxyRequestGuard : DelegatingHandler
    {
        public ProxyRequestGuard(HttpMessageHandler innerHandler) : base(innerHandler) { }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            // A remote proxy resolves destinations itself. Only fixed provider origins may use it;
            // automatic redirects are disabled on the inner transport. Other URLs use the pinned direct client.
            if (!IsTrustedProxyTarget(request.RequestUri))
                throw new HttpRequestException("Адрес не разрешён для внешнего прокси");
            var addresses = await Dns.GetHostAddressesAsync(request.RequestUri!.IdnHost, cancellationToken);
            if (addresses.Length == 0 || addresses.Any(address => !IsPublic(address)))
                throw new HttpRequestException("У источника нет безопасного публичного адреса");
            return await base.SendAsync(request, cancellationToken);
        }
    }

    public static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (IPAddress.IsLoopback(address)) return false;
        var b = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
            return (b[0] & 0xe0) == 0x20 && !(b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8);
        return b[0] != 0 && b[0] != 10 && b[0] != 127 && b[0] < 224 &&
            !(b[0] == 100 && b[1] >= 64 && b[1] <= 127) &&
            !(b[0] == 169 && b[1] == 254) &&
            !(b[0] == 172 && b[1] >= 16 && b[1] <= 31) &&
            !(b[0] == 192 && (b[1] == 168 || (b[1] == 0 && b[2] == 0))) &&
            !(b[0] == 198 && (b[1] == 18 || b[1] == 19));
    }

    public static async ValueTask<Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken)
    {
        var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, cancellationToken);
        Exception? lastError = null;
        foreach (var address in addresses.Where(IsPublic).OrderBy(ip => ip.AddressFamily == AddressFamily.InterNetwork ? 0 : 1))
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, context.DnsEndPoint.Port), cancellationToken);
                return new NetworkStream(socket, ownsSocket:true);
            }
            catch (Exception error) { socket.Dispose(); lastError = error; }
        }
        throw new HttpRequestException("Нет доступного публичного адреса источника", lastError);
    }
}
