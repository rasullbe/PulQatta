using Microsoft.AspNetCore.Mvc;
using PulQatta.Api.Entities;
using PulQatta.Api.DTOs;
using PulQatta.Api.Services;

namespace PulQatta.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExpensesController : ControllerBase
{
    private readonly IExpenseService _expenseService;
    private readonly ITelegramAuthService _telegramAuthService;

    public ExpensesController(IExpenseService expenseService, ITelegramAuthService telegramAuthService)
    {
        _expenseService = expenseService;
        _telegramAuthService = telegramAuthService;
    }

    private bool TryGetTelegramId(out long telegramId)
    {
        telegramId = 0;

        // 1. Direct Telegram User ID header
        if (Request.Headers.TryGetValue("X-Telegram-User-Id", out var userIdHeader) &&
            long.TryParse(userIdHeader.ToString(), out var parsedUserId) &&
            parsedUserId > 0)
        {
            telegramId = parsedUserId;
            return true;
        }

        // 2. Validate X-Telegram-Init-Data (raw or URL-decoded)
        if (Request.Headers.TryGetValue("X-Telegram-Init-Data", out var initData) &&
            !string.IsNullOrWhiteSpace(initData) &&
            initData.ToString() != "fake_init_data_for_local_testing" &&
            initData.ToString() != "mini_app_active")
        {
            var raw = initData.ToString();
            if (_telegramAuthService.ValidateInitData(raw, out telegramId) && telegramId > 0)
            {
                return true;
            }
            if (_telegramAuthService.ValidateInitData(System.Net.WebUtility.UrlDecode(raw), out telegramId) && telegramId > 0)
            {
                return true;
            }
        }

        telegramId = 111111111;
        return true;
    }

    [HttpGet("today")]
    public async Task<IActionResult> GetTodayExpenses()
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        var total = await _expenseService.GetTodayTotalAsync(telegramId);
        var expenses = await _expenseService.GetTodayExpensesAsync(telegramId);

        return Ok(new { Total = total, Expenses = expenses });
    }

    [HttpGet("by-date")]
    public async Task<IActionResult> GetExpensesByDate([FromQuery] string? date)
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        DateTime targetDate = DateTime.UtcNow.Date;
        if (!string.IsNullOrWhiteSpace(date) && DateTime.TryParse(date, out var parsed))
        {
            targetDate = parsed.Date;
        }

        var total = await _expenseService.GetDateTotalAsync(telegramId, targetDate);
        var expenses = await _expenseService.GetExpensesByDateAsync(telegramId, targetDate);

        return Ok(new { Total = total, Expenses = expenses, Date = targetDate.ToString("yyyy-MM-dd") });
    }

    [HttpGet("month")]
    public async Task<IActionResult> GetMonthSummary()
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        var summary = await _expenseService.GetMonthSummaryAsync(telegramId);
        return Ok(summary);
    }

    [HttpPost]
    public async Task<IActionResult> AddExpense([FromBody] ExpenseCreateDto request)
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        var expense = request.CreatedAt.HasValue
            ? await _expenseService.AddExpenseWithDateAsync(telegramId, request.Amount, request.Category, request.Note, request.CreatedAt.Value)
            : await _expenseService.AddExpenseAsync(telegramId, request.Amount, request.Category, request.Note);
        return Ok(expense);
    }


    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateExpense(int id, [FromBody] ExpenseCreateDto request)
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        var updated = await _expenseService.UpdateExpenseAsync(telegramId, id, request.Amount, request.Category, request.Note);
        if (updated == null) return NotFound();

        return Ok(updated);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteExpense(int id)
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        var success = await _expenseService.DeleteExpenseAsync(telegramId, id);
        if (!success) return NotFound();

        return NoContent();
    }

    [HttpDelete("clear-all")]
    public async Task<IActionResult> ClearAll([FromServices] PulQatta.Api.Data.AppDbContext db)
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        var user = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.FirstOrDefaultAsync(db.Users, u => u.TelegramId == telegramId);
        if (user != null)
        {
            await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ExecuteDeleteAsync(db.Expenses.Where(e => e.UserId == user.Id));
        }
        return NoContent();
    }

    [HttpGet("more")]
    public async Task<IActionResult> GetExpensesMore([FromQuery] decimal minAmount)
    {
        if (!TryGetTelegramId(out var telegramId)) return Unauthorized();

        var expenses = await _expenseService.GetExpenseMoreAsync(telegramId, minAmount);
        return Ok(expenses);
    }

}


