namespace PulQatta.Api.Services;

public interface ITelegramAuthService
{
    bool ValidateInitData(string initData, out long telegramId);
}
