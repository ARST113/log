using System.Text.Json.Serialization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Data.Sqlite;
using KnigaSlovo.Audiobooks;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHttpClient(string.Empty).ConfigurePrimaryHttpMessageHandler(() =>
    new SocketsHttpHandler { UseProxy = false, ConnectCallback = PublicNetwork.ConnectAsync,
        AutomaticDecompression = System.Net.DecompressionMethods.All });
builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader().WithExposedHeaders("Content-Range", "Accept-Ranges", "Content-Length")));
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    options.ForwardLimit = 1;
});
var store = new AudioFdbStore();
store.EnsureSchema();
var app = builder.Build();
app.UseForwardedHeaders();
app.UseCors();
app.UseStaticFiles();
app.MapGet("/healthz", () => Results.Ok(new { status = "ok", service = "knigaslovo", version = "2.0.0" }));
app.MapGet("/readyz", () =>
{
    try
    {
        using var connection = new SqliteConnection("Data Source=" + (Environment.GetEnvironmentVariable("AUDIOBOOK_DB") ?? Path.Combine(AppContext.BaseDirectory, "data", "audiobooks-fdb.sqlite")) + ";Mode=ReadOnly;Default Timeout=2");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT id FROM works LIMIT 1";
        command.ExecuteScalar();
        return Results.Ok(new { status = "ready" });
    }
    catch { return Results.StatusCode(503); }
});
app.MapGet("/", () => Results.Redirect("/healthz"));
app.MapControllers();
app.Lifetime.ApplicationStarted.Register(() => System.Runtime.CompilerServices.RuntimeHelpers.RunClassConstructor(typeof(KnigaSlovo.Controllers.AudioController).TypeHandle));
app.Run();
