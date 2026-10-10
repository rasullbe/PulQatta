using Microsoft.EntityFrameworkCore;
using PulQatta.Api.Data;
using PulQatta.Api.Services;
using Telegram.Bot;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Secrets.json", optional: true, reloadOnChange: true);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// Configure Services
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IExpenseService, ExpenseService>();
builder.Services.AddScoped<ITelegramUpdateHandler, TelegramUpdateHandler>();
builder.Services.AddScoped<ITelegramCommandHandler, TelegramCommandHandler>();
builder.Services.AddScoped<ITelegramCallbackHandler, TelegramCallbackHandler>();
builder.Services.AddSingleton<ITelegramAuthService, TelegramAuthService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        var configuredOrigin = builder.Configuration["FRONTEND_ORIGIN"];
        var origins = new List<string>
        {
            "https://sparkly-flan-a1ad41.netlify.app",
            "http://localhost:3000"
        };
        if (!string.IsNullOrWhiteSpace(configuredOrigin) && !origins.Contains(configuredOrigin.TrimEnd('/')))
        {
            origins.Add(configuredOrigin.TrimEnd('/'));
        }

        policy.WithOrigins(origins.ToArray())
              .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
              .WithHeaders("Content-Type", "X-Telegram-Init-Data", "X-Telegram-User-Id");
    });
});

// Configure Telegram Bot Client
builder.Services.AddHttpClient("telegram_bot_client")
    .AddTypedClient<ITelegramBotClient>((httpClient, sp) =>
    {
        var botToken = builder.Configuration["BOT_TOKEN"] ?? builder.Configuration["TelegramBotToken"] ?? throw new InvalidOperationException("BOT_TOKEN is not configured");
        var options = new TelegramBotClientOptions(botToken);
        return new TelegramBotClient(options, httpClient);
    });

builder.Services.AddHostedService<TelegramBotBackgroundService>();

var port = builder.Configuration["PORT"];
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://*:{port}");
}

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

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
