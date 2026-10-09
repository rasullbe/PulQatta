using Telegram.Bot;
using Telegram.Bot.Types;

namespace PulQatta.Api.Services;

public interface ITelegramUpdateHandler
{
    Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken);
    Task HandlePollingErrorAsync(ITelegramBotClient botClient, Exception exception, CancellationToken cancellationToken);
}

public interface ITelegramCommandHandler
{
    Task HandleCommandAsync(ITelegramBotClient botClient, Message message, CancellationToken cancellationToken);
}

public interface ITelegramCallbackHandler
{
    Task HandleCallbackQueryAsync(ITelegramBotClient botClient, CallbackQuery callbackQuery, CancellationToken cancellationToken);
}
