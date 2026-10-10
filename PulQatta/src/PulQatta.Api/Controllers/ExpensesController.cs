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

        if (Request.Headers.TryGetValue("X-Telegram-Init-Data", out var initData) &&
            !string.IsNullOrWhiteSpace(initData) &&
            initData.ToString() != "fake_init_data_for_local_testing")
        {
            if (_telegramAuthService.ValidateInitData(initData.ToString(), out telegramId) && telegramId > 0)
            {
                return true;
            }
        }

        if (Request.Headers.TryGetValue("X-Telegram-User-Id", out var userIdHeader) &&
            long.TryParse(userIdHeader.ToString(), out var parsedUserId) &&
            parsedUserId > 0)
        {
            telegramId = parsedUserId;
            return true;
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

        var expense = await _expenseService.AddExpenseAsync(telegramId, request.Amount, request.Category, request.Note);
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
        await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ExecuteDeleteAsync(db.Expenses);
        return NoContent();
    }
}


