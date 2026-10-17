using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using PulQatta.Api.Entities;

namespace PulQatta.Api.Services;

public class TelegramCommandHandler : ITelegramCommandHandler
{
    private readonly IExpenseService _expenseService;
    private readonly IConfiguration _configuration;

    public TelegramCommandHandler(IExpenseService expenseService, IConfiguration configuration)
    {
        _expenseService = expenseService;
        _configuration = configuration;
    }

    public async Task HandleCommandAsync(ITelegramBotClient botClient, Message message, CancellationToken cancellationToken)
    {
        var text = message.Text?.Trim();
        if (string.IsNullOrEmpty(text)) return;

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
        var webAppUrl = _configuration["FRONTEND_ORIGIN"] ?? _configuration["WEBAPP_URL"] ?? "https://sparkly-flan-a1ad41.netlify.app";
        InlineKeyboardMarkup? webAppKeyboard = null;
        if (!string.IsNullOrWhiteSpace(webAppUrl) && Uri.TryCreate(webAppUrl, UriKind.Absolute, out var uriResult) && uriResult.Scheme == Uri.UriSchemeHttps)
        {
            webAppKeyboard = new InlineKeyboardMarkup(new[]
            {
                InlineKeyboardButton.WithWebApp("📱 Открыть Mini App", new WebAppInfo { Url = webAppUrl }) 
            });
        }

        var parts = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var command = parts[0].Split('@')[0].ToLower();

        switch (command)
        {
            case "/start":
                var firstName = message.From?.FirstName ?? "друг";
                var cleanName = System.Text.RegularExpressions.Regex.Replace(firstName, @"[_*\[\]()~>#+=|{}.!\\-]", "");
                if (string.IsNullOrWhiteSpace(cleanName)) cleanName = "друг";

                var welcomeText = $@"Привет, {cleanName}! 👋
Я — твой личный трекер расходов PulQatta.

💡 *Как записать трату?*
Просто отправь мне сумму (в сумах) и (по желанию) комментарий.
Например: 
`15000 кофе`

📊 *Доступные команды:*
/today — твои траты за сегодня
/month — итоги за текущий месяц
/more — крупные траты (например, `/more 50000`)
/undo — отменить последнюю трату";

                try
                {
                    await botClient.SendTextMessageAsync(chatId, welcomeText, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                }
                catch
                {
                    await botClient.SendTextMessageAsync(chatId, welcomeText.Replace("*", "").Replace("`", ""), replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                }
                break;

            case "/more":
                decimal minAmount = 50000;
                if (parts.Length > 1 && decimal.TryParse(parts[1].Replace(" ", "").Replace(".", "").Replace(",", ""), out var parsedMin))
                {
                    minAmount = parsedMin;
                }
                var largeExpenses = await _expenseService.GetExpenseMoreAsync(telegramId, minAmount);
                var minFmt = minAmount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                if (largeExpenses.Count == 0)
                {
                    await botClient.SendTextMessageAsync(chatId, $"🔍 Нет трат от {minFmt} UZS.", replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                }
                else
                {
                    var sbMore = new System.Text.StringBuilder();
                    sbMore.Append($"🔍 *Крупные траты (от {minFmt} UZS)*\nНайдено: {largeExpenses.Count}\n\n");
                    foreach (var exp in largeExpenses.Take(25))
                    {
                        var expUsd = exp.Amount / 12800m;
                        var expFmt = exp.Amount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                        var expUsdFmt = expUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                        var dateStr = exp.CreatedAt.ToString("dd.MM");
                        sbMore.Append($"• {dateStr} — {expFmt} UZS (${expUsdFmt}) {GetCategoryName(exp.Category)}{(string.IsNullOrEmpty(exp.Note) ? "" : $" ({exp.Note})")}\n");
                    }
                    var moreResponse = sbMore.ToString();
                    try
                    {
                        await botClient.SendTextMessageAsync(chatId, moreResponse, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                    }
                    catch
                    {
                        await botClient.SendTextMessageAsync(chatId, moreResponse.Replace("*", ""), replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                    }
                }
                break;

            case "/today":
                var expenses = await _expenseService.GetTodayExpensesAsync(telegramId);
                var total = expenses.Count < 50
                    ? expenses.Sum(e => e.Amount)
                    : await _expenseService.GetTodayTotalAsync(telegramId);
                
                var totalUsd = total / 12800m;
                var totalFmt = total.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                var totalUsdFmt = totalUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                
                var sbToday = new System.Text.StringBuilder();
                sbToday.Append($"📅 *Траты за сегодня*\nИтого: {totalFmt} UZS (${totalUsdFmt})\n\n");
                foreach (var exp in expenses)
                {
                    var expUsd = exp.Amount / 12800m;
                    var expFmt = exp.Amount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                    var expUsdFmt = expUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                    sbToday.Append($"- {expFmt} UZS (${expUsdFmt}) ({GetCategoryName(exp.Category)}) {exp.Note}\n");
                }
                var response = sbToday.ToString();
                
                try
                {
                    await botClient.SendTextMessageAsync(chatId, response, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                }
                catch
                {
                    await botClient.SendTextMessageAsync(chatId, response.Replace("*", ""), replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                }
                break;
                
            case "/month":
                var summary = await _expenseService.GetMonthSummaryAsync(telegramId);
                var monthTotal = summary.Sum(s => s.TotalAmount);
                var monthTotalUsd = monthTotal / 12800m;
                
                var monthTotalFmt = monthTotal.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                var monthTotalUsdFmt = monthTotalUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));

                var sbMonth = new System.Text.StringBuilder();
                sbMonth.Append($"📊 *Итоги за месяц*\nВсего: {monthTotalFmt} UZS (${monthTotalUsdFmt})\n\n");
                foreach (var cat in summary)
                {
                    var catUsd = cat.TotalAmount / 12800m;
                    var catFmt = cat.TotalAmount.ToString("N0", new System.Globalization.CultureInfo("de-DE"));
                    var catUsdFmt = catUsd.ToString("N2", new System.Globalization.CultureInfo("en-US"));
                    sbMonth.Append($"- {GetCategoryName(cat.Category)}: {catFmt} UZS (${catUsdFmt})\n");
                }
                var monthResponse = sbMonth.ToString();
                
                try
                {
                    await botClient.SendTextMessageAsync(chatId, monthResponse, parseMode: ParseMode.Markdown, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                }
                catch
                {
                    await botClient.SendTextMessageAsync(chatId, monthResponse.Replace("*", ""), replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                }
                break;
                
            case "/undo":
                var success = await _expenseService.UndoLastExpenseAsync(telegramId);
                var msg = success ? "✅ Последняя трата отменена." : "❌ Нет трат для отмены.";
                await botClient.SendTextMessageAsync(chatId, msg, replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                break;
                
            default:
                await botClient.SendTextMessageAsync(chatId, "Неизвестная команда. Попробуй /start, /today, /month или /more.", replyMarkup: webAppKeyboard, cancellationToken: cancellationToken);
                break;
        }
    }

    private async Task ProcessTextInputAsync(ITelegramBotClient botClient, long chatId, string text, CancellationToken cancellationToken)
    {
        var parts = text.Split(' ', 2);
        if (decimal.TryParse(parts[0].Replace(" ", "").Replace(".", "").Replace(",", ""), out var amount))
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
        var categories = new[]
        {
            Category.Food,
            Category.Transport,
            Category.Utilities,
            Category.Clothes,
            Category.Electronics,
            Category.Health,
            Category.Games,
            Category.Subscriptions,
            Category.Credit,
            Category.Investment,
            Category.Other
        };
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
            Category.Cafe => "🍔 Еда",
            Category.Transport => "🚕 Транспорт",
            Category.Utilities => "💡 Коммуналка",
            Category.Health => "💊 Здоровье",
            Category.Subscriptions => "🔄 Подписки",
            Category.Games => "🎮 Игры",
            Category.Clothes => "👕 Одежда",
            Category.Electronics => "💻 Техника",
            Category.Credit => "💳 Кредит",
            Category.Investment => "📈 Инвестиции",
            _ => "📦 Другое"
        };
    }
}
