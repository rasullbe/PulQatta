using Telegram.Bot;
using Telegram.Bot.Exceptions;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace PulQatta.Api.Services;

public class TelegramUpdateHandler : ITelegramUpdateHandler
{
    private readonly ILogger<TelegramUpdateHandler> _logger;
    private readonly ITelegramCommandHandler _commandHandler;
    private readonly ITelegramCallbackHandler _callbackHandler;

    public TelegramUpdateHandler(
        ILogger<TelegramUpdateHandler> logger,
        ITelegramCommandHandler commandHandler,
        ITelegramCallbackHandler callbackHandler)
    {
        _logger = logger;
        _commandHandler = commandHandler;
        _callbackHandler = callbackHandler;
    }

    public async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken)
    {
        try
        {
            if (update.Type == UpdateType.CallbackQuery)
            {
                await _callbackHandler.HandleCallbackQueryAsync(botClient, update.CallbackQuery!, cancellationToken);
                return;
            }

            if (update.Type == UpdateType.Message && update.Message != null && update.Message.Type == MessageType.Text)
            {
                await _commandHandler.HandleCommandAsync(botClient, update.Message, cancellationToken);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling update {UpdateId}: {Message}", update.Id, ex.Message);
            if (update.Message != null)
            {
                try
                {
                    await botClient.SendTextMessageAsync(update.Message.Chat.Id, "Произошла ошибка при обработке команды.", cancellationToken: cancellationToken);
                }
                catch { }
            }
        }
    }

    public Task HandlePollingErrorAsync(ITelegramBotClient botClient, Exception exception, CancellationToken cancellationToken)
    {
        var errorMessage = exception switch
        {
            ApiRequestException apiRequestException => $"Telegram API Error:\n[{apiRequestException.ErrorCode}]\n{apiRequestException.Message}",
            _ => exception.ToString()
        };

        _logger.LogError(errorMessage);
        return Task.CompletedTask;
    }
}
