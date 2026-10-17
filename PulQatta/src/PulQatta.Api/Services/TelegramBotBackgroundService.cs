using Telegram.Bot;
using Telegram.Bot.Polling;
using Telegram.Bot.Types.Enums;

namespace PulQatta.Api.Services;

public class TelegramBotBackgroundService : BackgroundService
{
    private readonly ILogger<TelegramBotBackgroundService> _logger;
    private readonly IConfiguration _configuration;
    private readonly IServiceProvider _serviceProvider;
    private TelegramBotClient? _botClient;

    public TelegramBotBackgroundService(
        ILogger<TelegramBotBackgroundService> logger,
        IConfiguration configuration,
        IServiceProvider serviceProvider)
    {
        _logger = logger;
        _configuration = configuration;
        _serviceProvider = serviceProvider;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var token = _configuration["BOT_TOKEN"] ?? _configuration["TelegramBotToken"];
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogError("Telegram Bot Token is not configured. Please set 'BOT_TOKEN' environment variable.");
            return;
        }

        _botClient = new TelegramBotClient(token);

        // Configure Mini App menu button if FRONTEND_ORIGIN is provided
        var webAppUrl = _configuration["FRONTEND_ORIGIN"] ?? _configuration["WEBAPP_URL"] ?? "https://sparkly-flan-a1ad41.netlify.app";
        if (!string.IsNullOrWhiteSpace(webAppUrl))
        {
            try
            {
                await _botClient.SetChatMenuButtonAsync(
                    menuButton: new Telegram.Bot.Types.MenuButtonWebApp
                    {
                        Text = "PulQatta",
                        WebApp = new Telegram.Bot.Types.WebAppInfo { Url = webAppUrl }
                    },
                    cancellationToken: stoppingToken
                );
                _logger.LogInformation("Telegram Chat Menu Button set to: {Url}", webAppUrl);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update Telegram Chat Menu Button.");
            }
        }

        var publicUrl = _configuration["PUBLIC_URL"] ?? _configuration["BACKEND_URL"];
        if (!string.IsNullOrWhiteSpace(publicUrl))
        {
            // Webhook mode for cloud deployment (Render)
            var webhookUrl = $"{publicUrl.TrimEnd('/')}/api/bot/webhook";
            var secretToken = _configuration["TELEGRAM_WEBHOOK_SECRET"];

            _logger.LogInformation("PUBLIC_URL is configured. Registering Telegram webhook at: {WebhookUrl}", webhookUrl);
            try
            {
                await _botClient.SetWebhookAsync(
                    url: webhookUrl,
                    secretToken: !string.IsNullOrWhiteSpace(secretToken) ? secretToken : null,
                    allowedUpdates: [UpdateType.Message, UpdateType.CallbackQuery],
                    dropPendingUpdates: false,
                    cancellationToken: stoppingToken
                );
                _logger.LogInformation("Telegram webhook registered successfully.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to register Telegram webhook at {WebhookUrl}", webhookUrl);
            }

            // In webhook mode, incoming updates will be handled by BotController
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        else
        {
            // Polling mode for local development
            _logger.LogInformation("PUBLIC_URL is not set. Starting Telegram Bot in POLLING mode for local development.");

            try
            {
                await _botClient.DeleteWebhookAsync(dropPendingUpdates: false, cancellationToken: stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to delete webhook before starting polling.");
            }

            var receiverOptions = new ReceiverOptions
            {
                AllowedUpdates = [UpdateType.Message, UpdateType.CallbackQuery]
            };

            _botClient.StartReceiving(
                updateHandler: async (bot, update, ct) =>
                {
                    using var scope = _serviceProvider.CreateScope();
                    var handler = scope.ServiceProvider.GetRequiredService<ITelegramUpdateHandler>();
                    await handler.HandleUpdateAsync(bot, update, ct);
                },
                pollingErrorHandler: async (bot, ex, ct) =>
                {
                    using var scope = _serviceProvider.CreateScope();
                    var handler = scope.ServiceProvider.GetRequiredService<ITelegramUpdateHandler>();
                    await handler.HandlePollingErrorAsync(bot, ex, ct);
                },
                receiverOptions: receiverOptions,
                cancellationToken: stoppingToken
            );

            _logger.LogInformation("Telegram Bot started receiving updates via polling.");
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
    }
}
