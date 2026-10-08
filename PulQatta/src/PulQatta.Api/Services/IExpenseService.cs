using PulQatta.Api.Entities;
using PulQatta.Api.DTOs;

namespace PulQatta.Api.Services;

public interface IExpenseService
{
    Task<ExpenseGetDto> AddExpenseAsync(long telegramId, decimal amount, Category category, string? note);
    Task<decimal> GetTodayTotalAsync(long telegramId);
    Task<List<ExpenseGetDto>> GetTodayExpensesAsync(long telegramId);
    Task<List<CategorySummaryGetDto>> GetMonthSummaryAsync(long telegramId);
    Task<bool> UndoLastExpenseAsync(long telegramId);
}
