using Microsoft.JSInterop;

namespace PulQatta.UI.Services;

public interface ITelegramService
{
    ValueTask<string> GetInitDataAsync();
}

public class TelegramService : ITelegramService
{
    private readonly IJSRuntime _jsRuntime;

    public TelegramService(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    public async ValueTask<string> GetInitDataAsync()
    {
        try
        {
            return await _jsRuntime.InvokeAsync<string>("eval", "window.Telegram?.WebApp?.initData || ''");
        }
        catch
        {
            return string.Empty;
        }
    }
}
