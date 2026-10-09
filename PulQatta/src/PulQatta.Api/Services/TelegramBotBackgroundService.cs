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
        var token = _configuration["TelegramBotToken"];
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogError("Telegram Bot Token is not configured.");
            return;
        }

        _botClient = new TelegramBotClient(token);

        var receiverOptions = new ReceiverOptions
        {
            AllowedUpdates = Array.Empty<UpdateType>()
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

        _logger.LogInformation("Telegram Bot started receiving updates.");

        await Task.Delay(Timeout.Infinite, stoppingToken);
    }
}
