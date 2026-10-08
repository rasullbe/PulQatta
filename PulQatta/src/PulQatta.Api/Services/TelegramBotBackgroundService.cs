using Telegram.Bot;
using Telegram.Bot.Exceptions;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using PulQatta.Api.Entities;

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
        var token = _configuration["Telegram:BotToken"];
        if (string.IsNullOrEmpty(token))
        {
            _logger.LogError("Telegram Bot Token is not configured.");
            return;
        }

        _botClient = new TelegramBotClient(token);

        var receiverOptions = new ReceiverOptions
        {
            AllowedUpdates = Array.Empty<UpdateType>() // Receive all update types
        };

        _botClient.StartReceiving(
            updateHandler: HandleUpdateAsync,
            pollingErrorHandler: HandlePollingErrorAsync,
            receiverOptions: receiverOptions,
            cancellationToken: stoppingToken
        );

        _logger.LogInformation("Telegram Bot started receiving updates.");

        // Keep the service running
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    private async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken)
    {
        if (update.Type == UpdateType.CallbackQuery)
        {
            await HandleCallbackQueryAsync(botClient, update.CallbackQuery!, cancellationToken);
            return;
        }

        if (update.Type != UpdateType.Message || update.Message!.Type != MessageType.Text)
            return;

        var message = update.Message;
        var text = message.Text!;
        var chatId = message.Chat.Id;
        var telegramId = message.From!.Id;

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var expenseService = scope.ServiceProvider.GetRequiredService<IExpenseService>();

            if (text.StartsWith("/"))
            {
                await HandleCommandAsync(botClient, message, chatId, telegramId, text, expenseService, cancellationToken);
            }
            else
            {
                // Попытка разобрать трату
                var parts = text.Split(' ', 2);
                if (decimal.TryParse(parts[0], out var amount))
                {
                    var note = parts.Length > 1 ? parts[1] : null;
                    await SendCategoryKeyboardAsync(botClient, chatId, amount, note, cancellationToken);
                }
                else
                {
                    await botClient.SendTextMessageAsync(chatId, "Не понял сумму. Введите число (например, 15000).", cancellationToken: cancellationToken);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling message");
            await botClient.SendTextMessageAsync(chatId, "Произошла ошибка при обработке команды.", cancellationToken: cancellationToken);
        }
    }

    private async Task HandleCommandAsync(ITelegramBotClient botClient, Message message, long chatId, long telegramId, string text, IExpenseService expenseService, CancellationToken cancellationToken)
    {
        var webAppUrl = "https://localhost:7136";
        var webAppKeyboard = new InlineKeyboardMarkup(new[]
        {
            InlineKeyboardButton.WithWebApp("📱 Открыть Mini App", new WebAppInfo { Url = webAppUrl }) 
        });

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
/undo — отменить последнюю трату";

                await botClient.SendTextMessageAsync(chatId, welcomeText, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                break;

            case "/today":
                var total = await expenseService.GetTodayTotalAsync(telegramId);
                var expenses = await expenseService.GetTodayExpensesAsync(telegramId);
                
                var totalUsd = total / 12800m;
                var totalFmt = total.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                var totalUsdFmt = totalUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                
                var response = $"📅 *Траты за сегодня*\nИтого: {totalFmt} UZS (${totalUsdFmt})\n\n";
                foreach (var exp in expenses)
                {
                    var expUsd = exp.Amount / 12800m;
                    var expFmt = exp.Amount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                    var expUsdFmt = expUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                    response += $"- {expFmt} UZS (${expUsdFmt}) ({GetCategoryName(exp.Category)}) {exp.Note}\n";
                }
                
                await botClient.SendTextMessageAsync(chatId, response, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                break;
                
            case "/month":
                var summary = await expenseService.GetMonthSummaryAsync(telegramId);
                var monthTotal = summary.Sum(s => s.TotalAmount);
                var monthTotalUsd = monthTotal / 12800m;
                
                var monthTotalFmt = monthTotal.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                var monthTotalUsdFmt = monthTotalUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));

                var monthResponse = $"📊 *Итоги за месяц*\nВсего: {monthTotalFmt} UZS (${monthTotalUsdFmt})\n\n";
                foreach (var cat in summary)
                {
                    var catUsd = cat.TotalAmount / 12800m;
                    var catFmt = cat.TotalAmount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                    var catUsdFmt = catUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                    monthResponse += $"- {GetCategoryName(cat.Category)}: {catFmt} UZS (${catUsdFmt})\n";
                }
                
                await botClient.SendTextMessageAsync(chatId, monthResponse, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                break;
                
            case "/undo":
                var success = await expenseService.UndoLastExpenseAsync(telegramId);
                var msg = success ? "✅ Последняя трата отменена." : "❌ Нет трат для отмены.";
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
            row.Add(InlineKeyboardButton.WithCallbackData(GetCategoryName(cat1), $"add_{amount}_{cat1}_{note}"));
            
            if (i + 1 < categories.Length)
            {
                var cat2 = categories[i + 1];
                row.Add(InlineKeyboardButton.WithCallbackData(GetCategoryName(cat2), $"add_{amount}_{cat2}_{note}"));
            }
            
            keyboardButtons.Add(row.ToArray());
        }

        var inlineKeyboard = new InlineKeyboardMarkup(keyboardButtons);
        
        var usdAmount = amount / 12800m;
        var amountFmt = amount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
        var usdFmt = usdAmount.ToString("N2", new System.Globalization.CultureInfo("en-US"));

        await botClient.SendTextMessageAsync(
            chatId: chatId,
            text: $"Выберите категорию для {amountFmt} UZS (${usdFmt}){(note != null ? $" ({note})" : "")}:",
            replyMarkup: inlineKeyboard,
            cancellationToken: cancellationToken
        );
    }

    private async Task HandleCallbackQueryAsync(ITelegramBotClient botClient, CallbackQuery callbackQuery, CancellationToken cancellationToken)
    {
        var data = callbackQuery.Data;
        if (data == null) return;

        if (data == "undo_last")
        {
            var telegramId = callbackQuery.From.Id;
            using var scope = _serviceProvider.CreateScope();
            var expenseService = scope.ServiceProvider.GetRequiredService<IExpenseService>();
            
            var success = await expenseService.UndoLastExpenseAsync(telegramId);
            
            await botClient.AnswerCallbackQueryAsync(
                callbackQueryId: callbackQuery.Id,
                text: success ? "Трата отменена!" : "Нечего отменять.",
                cancellationToken: cancellationToken);

            if (success)
            {
                await botClient.EditMessageTextAsync(
                    chatId: callbackQuery.Message!.Chat.Id,
                    messageId: callbackQuery.Message.MessageId,
                    text: $"🗑 Трата была успешно отменена.",
                    cancellationToken: cancellationToken);
            }
            return;
        }

        if (data.StartsWith("add_"))
        {
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
                var amountFmt = amount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                var usdFmt = usdAmount.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                
                var undoKeyboard = new InlineKeyboardMarkup(new[]
                {
                    InlineKeyboardButton.WithCallbackData("❌ Отменить", "undo_last")
                });

                await botClient.EditMessageTextAsync(
                    chatId: callbackQuery.Message!.Chat.Id,
                    messageId: callbackQuery.Message.MessageId,
                    text: $"✅ Сохранено: {amountFmt} UZS (${usdFmt}) в категорию {GetCategoryName(category)}{(string.IsNullOrEmpty(note) ? "" : $" ({note})")}",
                    replyMarkup: undoKeyboard,
                    cancellationToken: cancellationToken);
            }
        }
    }

    private string GetCategoryName(Category category)
    {
        return category switch
        {
            Category.Food => "🍔 Еда",
            Category.Transport => "🚕 Транспорт",
            Category.Utilities => "💡 Коммуналка",
            Category.Health => "💊 Здоровье",
            Category.Subscriptions => "🔄 Подписки",
            Category.Games => "🎮 Игры",
            Category.Clothes => "👕 Одежда",
            Category.Electronics => "💻 Техника",
            Category.Cafe => "☕ Кафе",
            _ => "📦 Другое"
        };
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
