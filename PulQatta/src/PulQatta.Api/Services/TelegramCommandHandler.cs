using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using PulQatta.Api.Entities;

namespace PulQatta.Api.Services;

public class TelegramCommandHandler : ITelegramCommandHandler
{
    private readonly IExpenseService _expenseService;

    public TelegramCommandHandler(IExpenseService expenseService)
    {
        _expenseService = expenseService;
    }

    public async Task HandleCommandAsync(ITelegramBotClient botClient, Message message, CancellationToken cancellationToken)
    {
        var text = message.Text!;
        var chatId = message.Chat.Id;
        var telegramId = message.From!.Id;

        if (text.StartsWith("/"))
        {
            await ProcessSlashCommandAsync(botClient, message, chatId, telegramId, text, cancellationToken);
        }
        else
        {
            await ProcessTextInputAsync(botClient, chatId, text, cancellationToken);
        }
    }

    private async Task ProcessSlashCommandAsync(ITelegramBotClient botClient, Message message, long chatId, long telegramId, string text, CancellationToken cancellationToken)
    {
        var webAppUrl = "https://sparkly-flan-a1ad41.netlify.app/";
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
                var total = await _expenseService.GetTodayTotalAsync(telegramId);
                var expenses = await _expenseService.GetTodayExpensesAsync(telegramId);
                
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
                var summary = await _expenseService.GetMonthSummaryAsync(telegramId);
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
                var success = await _expenseService.UndoLastExpenseAsync(telegramId);
                var msg = success ? "✅ Последняя трата отменена." : "❌ Нет трат для отмены.";
                await botClient.SendTextMessageAsync(chatId, msg, cancellationToken: cancellationToken);
                break;
                
            default:
                await botClient.SendTextMessageAsync(chatId, "Неизвестная команда. Попробуй /start, /today или /month.", cancellationToken: cancellationToken);
                break;
        }
    }

    private async Task ProcessTextInputAsync(ITelegramBotClient botClient, long chatId, string text, CancellationToken cancellationToken)
    {
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

    public static string GetCategoryName(Category category)
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
}



