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
        if (!Request.Headers.TryGetValue("X-Telegram-Init-Data", out var initData))
        {
            return false;
        }

        return _telegramAuthService.ValidateInitData(initData.ToString(), out telegramId);
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
}
