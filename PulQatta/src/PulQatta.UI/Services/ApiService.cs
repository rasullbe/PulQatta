using System.Net.Http.Json;
using PulQatta.UI.DTOs;
using PulQatta.UI.Entities;

namespace PulQatta.UI.Services;

public interface IApiService
{
    Task<ExpenseTodaySummaryGetDto?> GetTodaySummaryAsync();
    Task<CategorySummaryGetDto[]> GetMonthSummaryAsync();
    Task<bool> AddExpenseAsync(decimal amount, Category category, string? note);
}

public class ApiService : IApiService
{
    private readonly HttpClient _httpClient;
    private readonly ITelegramService _telegramService;

    public ApiService(HttpClient httpClient, ITelegramService telegramService)
    {
        _httpClient = httpClient;
        _telegramService = telegramService;
    }

    private async Task<HttpRequestMessage> CreateRequestAsync(HttpMethod method, string uri)
    {
        var request = new HttpRequestMessage(method, uri);
        var initData = await _telegramService.GetInitDataAsync();
        if (!string.IsNullOrEmpty(initData))
        {
            request.Headers.Add("X-Telegram-Init-Data", initData);
        }
        return request;
    }

    public async Task<ExpenseTodaySummaryGetDto?> GetTodaySummaryAsync()
    {
        var request = await CreateRequestAsync(HttpMethod.Get, "api/expenses/today");
        var response = await _httpClient.SendAsync(request);
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadFromJsonAsync<ExpenseTodaySummaryGetDto>();
        }
        return null;
    }

    public async Task<CategorySummaryGetDto[]> GetMonthSummaryAsync()
    {
        var request = await CreateRequestAsync(HttpMethod.Get, "api/expenses/month");
        var response = await _httpClient.SendAsync(request);
        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadFromJsonAsync<CategorySummaryGetDto[]>() ?? Array.Empty<CategorySummaryGetDto>();
        }
        return Array.Empty<CategorySummaryGetDto>();
    }

    public async Task<bool> AddExpenseAsync(decimal amount, Category category, string? note)
    {
        var request = await CreateRequestAsync(HttpMethod.Post, "api/expenses");
        request.Content = JsonContent.Create(new ExpenseCreateDto
        {
            Amount = amount,
            Category = category,
            Note = note
        });
        
        var response = await _httpClient.SendAsync(request);
        return response.IsSuccessStatusCode;
    }
}
