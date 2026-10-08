using PulQatta.Api.Entities;
using Telegram.Bot;
using Telegram.Bot.Exceptions;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace PulQatta.Api.Services;

public class TelegramBotBackgroundService : BackgroundService
{
    private readonly ITelegramBotClient _botClient;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<TelegramBotBackgroundService> _logger;

    public TelegramBotBackgroundService(
        ITelegramBotClient botClient,
        IServiceProvider serviceProvider,
        ILogger<TelegramBotBackgroundService> logger)
    {
        _botClient = botClient;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var receiverOptions = new ReceiverOptions
        {
            AllowedUpdates = Array.Empty<UpdateType>() // receive all update types
        };

        _botClient.StartReceiving(
            updateHandler: HandleUpdateAsync,
            pollingErrorHandler: HandlePollingErrorAsync,
            receiverOptions: receiverOptions,
            cancellationToken: stoppingToken
        );

        _logger.LogInformation("Telegram Bot started receiving updates.");

        // Keep the background service running
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(1000, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected during shutdown
        }
    }

    private async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken)
    {
        if (update.Type == UpdateType.Message && update.Message!.Type == MessageType.Text)
        {
            await HandleMessageAsync(botClient, update.Message, cancellationToken);
            return;
        }

        if (update.Type == UpdateType.CallbackQuery)
        {
            await HandleCallbackQueryAsync(botClient, update.CallbackQuery!, cancellationToken);
            return;
        }
    }

    private async Task HandleMessageAsync(ITelegramBotClient botClient, Message message, CancellationToken cancellationToken)
    {
        var text = message.Text!;
        var chatId = message.Chat.Id;
        var telegramId = message.From!.Id;

        using var scope = _serviceProvider.CreateScope();
        var expenseService = scope.ServiceProvider.GetRequiredService<IExpenseService>();

        if (text.StartsWith("/"))
        {
            await HandleCommandAsync(botClient, message, chatId, telegramId, text, expenseService, cancellationToken);
            return;
        }

        // Parse expense format "amount [note]"
        var parts = text.Split(' ', 2);
        if (decimal.TryParse(parts[0], out var amount))
        {
            var note = parts.Length > 1 ? parts[1] : null;
            await SendCategoryKeyboardAsync(botClient, chatId, amount, note, cancellationToken);
        }
        else
        {
            await botClient.SendTextMessageAsync(chatId, "Please send in format: <amount> <note>", cancellationToken: cancellationToken);
        }
    }

    private async Task HandleCommandAsync(ITelegramBotClient botClient, Message message, long chatId, long telegramId, string text, IExpenseService expenseService, CancellationToken cancellationToken)
    {
        switch (text.ToLower())
        {
            case "/start":
                var firstName = message.From?.FirstName ?? "друг";
                var welcomeText = $@"Привет, {firstName}! 👋
Я — твой личный трекер расходов PulQatta.

💡 *Как записать трату?*
Просто отправь мне сумму (в сумах) и (по желанию) комментарий.
Например: 
`15000 кофе`

📊 *Доступные команды:*
/today — твои траты за сегодня
/month — итоги за текущий месяц
/undo — удалить твою последнюю добавленную трату";

                var webAppKeyboard = new InlineKeyboardMarkup(new[]
                {
                    // ВНИМАНИЕ: Telegram блокирует 'localhost'. Чтобы Mini App открывался у вас на компьютере, 
                    // вам понадобится использовать Ngrok (или аналоги) и вставить сюда публичный HTTPS URL.
                    // Для теста валидации мы временно ставим заглушку (например, google.com).
                    InlineKeyboardButton.WithWebApp("📱 Открыть Mini App", new WebAppInfo { Url = "https://google.com" }) 
                });

                await botClient.SendTextMessageAsync(chatId, welcomeText, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                break;

            case "/today":
                var total = await expenseService.GetTodayTotalAsync(telegramId);
                var expenses = await expenseService.GetTodayExpensesAsync(telegramId);
                
                var totalUsd = total / 12800m;
                var response = $"📅 *Траты за сегодня*\nИтого: {total:N0} UZS (${totalUsd:N2})\n\n";
                foreach (var exp in expenses)
                {
                    var expUsd = exp.Amount / 12800m;
                    response += $"- {exp.Amount:N0} UZS (${expUsd:N2}) ({exp.Category}) {exp.Note}\n";
                }
                
                await botClient.SendTextMessageAsync(chatId, response, parseMode: ParseMode.Markdown, cancellationToken: cancellationToken);
                break;
                
            case "/month":
                var summary = await expenseService.GetMonthSummaryAsync(telegramId);
                var monthTotal = summary.Sum(s => s.TotalAmount);
                var monthTotalUsd = monthTotal / 12800m;
                
                var monthResponse = $"📊 *Итоги за месяц*\nВсего: {monthTotal:N0} UZS (${monthTotalUsd:N2})\n\n";
                foreach (var cat in summary)
                {
                    var catUsd = cat.TotalAmount / 12800m;
                    monthResponse += $"- {cat.Category}: {cat.TotalAmount:N0} UZS (${catUsd:N2})\n";
                }
                
                await botClient.SendTextMessageAsync(chatId, monthResponse, parseMode: ParseMode.Markdown, cancellationToken: cancellationToken);
                break;
                
            case "/undo":
                var success = await expenseService.UndoLastExpenseAsync(telegramId);
                var msg = success ? "Last expense deleted." : "No expenses found to delete.";
                await botClient.SendTextMessageAsync(chatId, msg, cancellationToken: cancellationToken);
                break;
                
            default:
                await botClient.SendTextMessageAsync(chatId, "Неизвестная команда. Попробуй /start, /today или /month.", cancellationToken: cancellationToken);
                break;
        }
    }

    private async Task SendCategoryKeyboardAsync(ITelegramBotClient botClient, long chatId, decimal amount, string? note, CancellationToken cancellationToken)
    {
        var categories = Enum.GetValues<Category>();
        var keyboardButtons = new List<InlineKeyboardButton[]>();
        
        for (int i = 0; i < categories.Length; i += 2)
        {
            var row = new List<InlineKeyboardButton>();
            
            var cat1 = categories[i];
            row.Add(InlineKeyboardButton.WithCallbackData(cat1.ToString(), $"add_{amount}_{cat1}_{note}"));
            
            if (i + 1 < categories.Length)
            {
                var cat2 = categories[i + 1];
                row.Add(InlineKeyboardButton.WithCallbackData(cat2.ToString(), $"add_{amount}_{cat2}_{note}"));
            }
            
            keyboardButtons.Add(row.ToArray());
        }

        var inlineKeyboard = new InlineKeyboardMarkup(keyboardButtons);
        
        var usdAmount = amount / 12800m;
        await botClient.SendTextMessageAsync(
            chatId: chatId,
            text: $"Выберите категорию для {amount:N0} UZS (${usdAmount:N2}){(note != null ? $" ({note})" : "")}:",
            replyMarkup: inlineKeyboard,
            cancellationToken: cancellationToken
        );
    }

    private async Task HandleCallbackQueryAsync(ITelegramBotClient botClient, CallbackQuery callbackQuery, CancellationToken cancellationToken)
    {
        var data = callbackQuery.Data;
        if (data == null || !data.StartsWith("add_")) return;

        var parts = data.Split('_');
        if (parts.Length < 3) return;

        var amountStr = parts[1];
        var categoryStr = parts[2];
        var note = parts.Length > 3 ? string.Join("_", parts.Skip(3)) : null;

        if (decimal.TryParse(amountStr, out var amount) && Enum.TryParse<Category>(categoryStr, out var category))
        {
            var telegramId = callbackQuery.From.Id;
            
            using var scope = _serviceProvider.CreateScope();
            var expenseService = scope.ServiceProvider.GetRequiredService<IExpenseService>();
            
            await expenseService.AddExpenseAsync(telegramId, amount, category, string.IsNullOrEmpty(note) ? null : note);

            await botClient.AnswerCallbackQueryAsync(
                callbackQueryId: callbackQuery.Id,
                text: "Трата сохранена!",
                cancellationToken: cancellationToken);

            var usdAmount = amount / 12800m;
            await botClient.EditMessageTextAsync(
                chatId: callbackQuery.Message!.Chat.Id,
                messageId: callbackQuery.Message.MessageId,
                text: $"✅ Сохранено: {amount:N0} UZS (${usdAmount:N2}) в категорию {category}{(string.IsNullOrEmpty(note) ? "" : $" ({note})")}",
                cancellationToken: cancellationToken);
        }
    }

    private Task HandlePollingErrorAsync(ITelegramBotClient botClient, Exception exception, CancellationToken cancellationToken)
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
