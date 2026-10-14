using Microsoft.EntityFrameworkCore;
using PulQatta.Api.Data;
using PulQatta.Api.Services;
using Telegram.Bot;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Secrets.json", optional: true, reloadOnChange: true);

// Configure dynamic port (Render sets PORT, default is 10000)
var port = Environment.GetEnvironmentVariable("PORT") ?? builder.Configuration["PORT"] ?? "10000";
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure Database Connection (Neon postgres:// parser & Npgsql SSL Mode)
var connectionString = ResolveConnectionString(builder.Configuration);
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// Configure Services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IExpenseService, ExpenseService>();
builder.Services.AddScoped<ITelegramUpdateHandler, TelegramUpdateHandler>();
builder.Services.AddScoped<ITelegramCommandHandler, TelegramCommandHandler>();
builder.Services.AddScoped<ITelegramCallbackHandler, TelegramCallbackHandler>();
builder.Services.AddSingleton<ITelegramAuthService, TelegramAuthService>();

// Configure CORS (Allow all Netlify origins, custom domains, and Telegram WebView)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// Configure Telegram Bot Client
builder.Services.AddHttpClient("telegram_bot_client")
    .AddTypedClient<ITelegramBotClient>((httpClient, sp) =>
    {
        var botToken = builder.Configuration["BOT_TOKEN"] ?? builder.Configuration["TelegramBotToken"]
            ?? throw new InvalidOperationException("BOT_TOKEN is not configured.");
        var options = new TelegramBotClientOptions(botToken);
        return new TelegramBotClient(options, httpClient);
    });

builder.Services.AddHostedService<TelegramBotBackgroundService>();

var app = builder.Build();

// Automatic EF Core Migrations at startup
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        logger.LogInformation("Applying EF Core database migrations...");
        await db.Database.MigrateAsync();
        logger.LogInformation("EF Core database migrations applied successfully.");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to apply EF Core database migrations.");
    }
}

// Configure HTTP pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Health check endpoint (200 OK without database query)
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }));

app.Use(async (context, next) =>
{
    if (context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
    {
        context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
    }
    await next();
});

app.UseCors();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Helper to resolve & parse connection strings from various sources (Neon postgres:// URI or key-value)
static string ResolveConnectionString(IConfiguration configuration)
{
    var raw = configuration.GetConnectionString("Default")
              ?? configuration.GetConnectionString("DefaultConnection")
              ?? configuration["DATABASE_URL"]
              ?? configuration["POSTGRES_URL"]
              ?? configuration["ConnectionStrings:Default"]
              ?? configuration["ConnectionStrings:DefaultConnection"];

    if (string.IsNullOrWhiteSpace(raw))
    {
        throw new InvalidOperationException("Database connection string is not configured. Provide 'ConnectionStrings__Default' or 'DATABASE_URL'.");
    }

    raw = raw.Trim();

    // Check if URI format from Neon (postgres:// or postgresql://)
    if (raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':');
        var username = Uri.UnescapeDataString(userInfo[0]);
        var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
        var host = uri.Host;
        var dbPort = uri.Port > 0 ? uri.Port : 5432;
        var database = uri.AbsolutePath.TrimStart('/');

        return $"Host={host};Port={dbPort};Database={database};Username={username};Password={password};SSL Mode=Require;Trust Server Certificate=true;";
    }

    // Key-value format: enforce SSL Mode=Require for remote databases
    var cs = raw;
    var isLocal = cs.Contains("localhost", StringComparison.OrdinalIgnoreCase) ||
                  cs.Contains("127.0.0.1", StringComparison.OrdinalIgnoreCase);

    if (!isLocal && !cs.Contains("SSL Mode", StringComparison.OrdinalIgnoreCase) && !cs.Contains("sslmode", StringComparison.OrdinalIgnoreCase))
    {
        cs = cs.TrimEnd(';') + ";SSL Mode=Require;Trust Server Certificate=true;";
    }

    return cs;
}
