using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.ReplyMarkups;
using PulQatta.Api.Entities;

namespace PulQatta.Api.Services;

public class TelegramCallbackHandler : ITelegramCallbackHandler
{
    private readonly IExpenseService _expenseService;

    public TelegramCallbackHandler(IExpenseService expenseService)
    {
        _expenseService = expenseService;
    }

    public async Task HandleCallbackQueryAsync(ITelegramBotClient botClient, CallbackQuery callbackQuery, CancellationToken cancellationToken)
    {
        var data = callbackQuery.Data;
        if (data == null) return;

        if (data == "undo_last")
        {
            var telegramId = callbackQuery.From.Id;
            var success = await _expenseService.UndoLastExpenseAsync(telegramId);
            
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
                
                await _expenseService.AddExpenseAsync(telegramId, amount, category, string.IsNullOrEmpty(note) ? null : note);

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
                    text: $"✅ Сохранено: {amountFmt} UZS (${usdFmt}) в категорию {TelegramCommandHandler.GetCategoryName(category)}{(string.IsNullOrEmpty(note) ? "" : $" ({note})")}",
                    replyMarkup: undoKeyboard,
                    cancellationToken: cancellationToken);
            }
        }
    }
}
