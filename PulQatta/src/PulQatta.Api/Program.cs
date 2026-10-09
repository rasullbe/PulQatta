using Microsoft.EntityFrameworkCore;
using PulQatta.Api.Data;
using PulQatta.Api.Services;
using Telegram.Bot;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Secrets.json", optional: true, reloadOnChange: true);

// Add services to the container.
builder.Services.AddControllers();
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
        var frontendOrigin = builder.Configuration["FRONTEND_ORIGIN"] ?? "https://pulqatta.netlify.app";
        policy.WithOrigins(frontendOrigin)
              .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
              .WithHeaders("Content-Type", "X-Telegram-Init-Data");
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

app.UseHttpsRedirection();

app.UseCors();

app.UseAuthorization();

app.MapControllers();

app.Run();