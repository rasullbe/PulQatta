using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Web;

namespace PulQatta.Api.Services;

public class TelegramAuthService : ITelegramAuthService
{
    private readonly string _botToken;

    public TelegramAuthService(IConfiguration configuration)
    {
        _botToken = configuration["BOT_TOKEN"] ?? configuration["TelegramBotToken"] ?? throw new InvalidOperationException("BOT_TOKEN not configured");
    }

    public bool ValidateInitData(string initData, out long telegramId)
    {
        telegramId = 0;
        
        if (string.IsNullOrEmpty(initData)) return false;

        var parsedData = HttpUtility.ParseQueryString(initData);
        var hash = parsedData["hash"];
        var authDateStr = parsedData["auth_date"];
        
        if (string.IsNullOrEmpty(hash) || string.IsNullOrEmpty(authDateStr)) return false;

        if (long.TryParse(authDateStr, out var authDateUnix))
        {
            var authDate = DateTimeOffset.FromUnixTimeSeconds(authDateUnix);
            if ((DateTimeOffset.UtcNow - authDate).TotalHours > 24)
            {
                return false;
            }
        }
        else
        {
            return false;
        }

        var dataDict = new SortedDictionary<string, string>();
        foreach (string key in parsedData.Keys)
        {
            if (key != "hash")
            {
                dataDict.Add(key, parsedData[key]!);
            }
        }

        var dataCheckString = string.Join("\n", dataDict.Select(kvp => $"{kvp.Key}={kvp.Value}"));

        using var hmacSha256 = new HMACSHA256(Encoding.UTF8.GetBytes("WebAppData"));
        var secretKey = hmacSha256.ComputeHash(Encoding.UTF8.GetBytes(_botToken));

        using var hmacData = new HMACSHA256(secretKey);
        var calculatedHashBytes = hmacData.ComputeHash(Encoding.UTF8.GetBytes(dataCheckString));
        
        var providedHashBytes = Convert.FromHexString(hash);

        if (!CryptographicOperations.FixedTimeEquals(calculatedHashBytes, providedHashBytes))
        {
            return false;
        }

        var userJson = parsedData["user"];
        if (!string.IsNullOrEmpty(userJson))
        {
            try
            {
                using var jsonDoc = JsonDocument.Parse(userJson);
                if (jsonDoc.RootElement.TryGetProperty("id", out var idElement))
                {
                    telegramId = idElement.GetInt64();
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        return false;
    }
}
