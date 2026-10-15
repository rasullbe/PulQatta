using PulQatta.Api.Entities;
using PulQatta.Api.DTOs;

namespace PulQatta.Api.Services;

public interface IExpenseService
{
    Task<ExpenseGetDto> AddExpenseAsync(long telegramId, decimal amount, Category category, string? note);
    Task<ExpenseGetDto> AddExpenseWithDateAsync(long telegramId, decimal amount, Category category, string? note, DateTime? createdAt);
    Task<decimal> GetTodayTotalAsync(long telegramId);
    Task<List<ExpenseGetDto>> GetTodayExpensesAsync(long telegramId);
    Task<decimal> GetDateTotalAsync(long telegramId, DateTime date);
    Task<List<ExpenseGetDto>> GetExpensesByDateAsync(long telegramId, DateTime date);
    Task<List<CategorySummaryGetDto>> GetMonthSummaryAsync(long telegramId);
    Task<bool> UndoLastExpenseAsync(long telegramId);
    Task<bool> DeleteExpenseAsync(long telegramId, int id);
    Task<ExpenseGetDto?> UpdateExpenseAsync(long telegramId, int id, decimal amount, Category category, string? note);
    Task<List<ExpenseGetDto>> GetExpenseMoreAsync(long telegramId, decimal minAmount);
}

