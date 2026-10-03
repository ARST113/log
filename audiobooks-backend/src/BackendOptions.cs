internal static class BackendOptions
{
    public static bool CrawlerEnabled => !string.Equals(
        Environment.GetEnvironmentVariable("AUDIOBOOK_CRAWLER_ENABLED"), "false", StringComparison.OrdinalIgnoreCase);

    public static int Int(string key, int fallback, int min, int max) =>
        int.TryParse(Environment.GetEnvironmentVariable(key), out var value)
            ? Math.Clamp(value, min, max) : fallback;
}
