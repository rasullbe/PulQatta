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
        _botToken = configuration["TelegramBotToken"] ?? throw new InvalidOperationException("TelegramBotToken not configured");
    }

    /*
     * Telegram WebApp Data Validation Process:
     * 1. The initData string contains several key-value pairs separated by '&'.
     * 2. We extract the 'hash' value which is the signature provided by Telegram.
     * 3. We sort the remaining key-value pairs alphabetically by key.
     * 4. We join the sorted pairs with a newline character ('\n') to create a data check string.
     * 5. We create a secret key by hashing the bot token with HMAC-SHA256 using the literal string "WebAppData" as the key.
     * 6. We hash our data check string with HMAC-SHA256 using the secret key from step 5.
     * 7. Finally, we convert our calculated hash to a hex string and compare it with the 'hash' from step 2.
     *    If they match, the data is valid and was definitely sent by Telegram.
     */
    public bool ValidateInitData(string initData, out long telegramId)
    {
        telegramId = 0;
        
        if (string.IsNullOrEmpty(initData)) return false;

        var parsedData = HttpUtility.ParseQueryString(initData);
        var hash = parsedData["hash"];
        if (string.IsNullOrEmpty(hash)) return false;

        // Remove hash from the parameters to calculate our own signature
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
        var calculatedHash = Convert.ToHexString(calculatedHashBytes).ToLower();

        if (calculatedHash != hash)
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
