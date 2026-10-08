using Microsoft.EntityFrameworkCore;
using PulQatta.Api.Data;
using PulQatta.Api.Entities;
using PulQatta.Api.DTOs;

namespace PulQatta.Api.Services;

public class ExpenseService : IExpenseService
{
    private readonly AppDbContext _context;

    public ExpenseService(AppDbContext context)
    {
        _context = context;
    }

    private async Task<User> GetOrCreateUserAsync(long telegramId)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.TelegramId == telegramId);
        if (user == null)
        {
            user = new User
            {
                TelegramId = telegramId,
                CreatedAt = DateTime.UtcNow
            };
            _context.Users.Add(user);
            await _context.SaveChangesAsync();
        }
        return user;
    }

    public async Task<ExpenseGetDto> AddExpenseAsync(long telegramId, decimal amount, Category category, string? note)
    {
        var user = await GetOrCreateUserAsync(telegramId);

        var expense = new Expense
        {
            UserId = user.Id,
            Amount = amount,
            Category = category,
            Note = note,
            CreatedAt = DateTime.UtcNow
        };

        _context.Expenses.Add(expense);
        await _context.SaveChangesAsync();

        return new ExpenseGetDto
        {
            Id = expense.Id,
            Category = expense.Category,
            Amount = expense.Amount,
            Note = expense.Note,
            CreatedAt = expense.CreatedAt
        };
    }

    public async Task<decimal> GetTodayTotalAsync(long telegramId)
    {
        var today = DateTime.UtcNow.Date;
        return await _context.Expenses
            .Include(e => e.User)
            .Where(e => e.User!.TelegramId == telegramId && e.CreatedAt >= today)
            .SumAsync(e => e.Amount);
    }

    public async Task<List<ExpenseGetDto>> GetTodayExpensesAsync(long telegramId)
    {
        var today = DateTime.UtcNow.Date;
        return await _context.Expenses
            .Include(e => e.User)
            .Where(e => e.User!.TelegramId == telegramId && e.CreatedAt >= today)
            .OrderByDescending(e => e.CreatedAt)
            .Take(5)
            .Select(e => new ExpenseGetDto
            {
                Id = e.Id,
                Category = e.Category,
                Amount = e.Amount,
                Note = e.Note,
                CreatedAt = e.CreatedAt
            })
            .ToListAsync();
    }

    public async Task<List<CategorySummaryGetDto>> GetMonthSummaryAsync(long telegramId)
    {
        var startOfMonth = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        
        var summary = await _context.Expenses
            .Include(e => e.User)
            .Where(e => e.User!.TelegramId == telegramId && e.CreatedAt >= startOfMonth)
            .GroupBy(e => e.Category)
            .Select(g => new CategorySummaryGetDto
            {
                Category = g.Key,
                TotalAmount = g.Sum(e => e.Amount)
            })
            .OrderByDescending(s => s.TotalAmount)
            .ToListAsync();

        return summary;
    }

    public async Task<bool> UndoLastExpenseAsync(long telegramId)
    {
        var lastExpense = await _context.Expenses
            .Include(e => e.User)
            .Where(e => e.User!.TelegramId == telegramId)
            .OrderByDescending(e => e.CreatedAt)
            .FirstOrDefaultAsync();

        if (lastExpense == null) return false;

        _context.Expenses.Remove(lastExpense);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> DeleteExpenseAsync(long telegramId, int id)
    {
        var expense = await _context.Expenses
            .Include(e => e.User)
            .FirstOrDefaultAsync(e => e.Id == id && e.User!.TelegramId == telegramId);

        if (expense == null) return false;

        _context.Expenses.Remove(expense);
        await _context.SaveChangesAsync();
        return true;
    }
}
