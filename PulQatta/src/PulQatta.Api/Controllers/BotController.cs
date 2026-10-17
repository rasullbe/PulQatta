using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using PulQatta.Api.Services;
using Telegram.Bot;
using Telegram.Bot.Types;

namespace PulQatta.Api.Controllers;

[ApiController]
[Route("api/bot")]
public class BotController : ControllerBase
{
    private readonly ITelegramBotClient _botClient;
    private readonly ITelegramUpdateHandler _updateHandler;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BotController> _logger;

    public BotController(
        ITelegramBotClient botClient,
        ITelegramUpdateHandler updateHandler,
        IConfiguration configuration,
        ILogger<BotController> logger)
    {
        _botClient = botClient;
        _updateHandler = updateHandler;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook(CancellationToken cancellationToken)
    {
        // 1. Validate secret token if configured (log warning on mismatch, never drop Telegram traffic)
        var expectedSecret = _configuration["TELEGRAM_WEBHOOK_SECRET"];
        if (!string.IsNullOrEmpty(expectedSecret))
        {
            if (!Request.Headers.TryGetValue("X-Telegram-Bot-Api-Secret-Token", out var receivedSecret) ||
                receivedSecret != expectedSecret)
            {
                _logger.LogWarning("Webhook secret token mismatch. Expected: '{ExpectedSecret}', Received: '{ReceivedSecret}'", expectedSecret, (string?)receivedSecret);
            }
        }

        // 2. Read raw request body
        string rawJson;
        try
        {
            using var reader = new StreamReader(Request.Body);
            rawJson = await reader.ReadToEndAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read webhook request body");
            return Ok();
        }

        if (string.IsNullOrWhiteSpace(rawJson))
        {
            _logger.LogWarning("Webhook received empty body");
            return Ok();
        }

        // 3. Deserialize Update using Newtonsoft.Json (native to Telegram.Bot 19.x)
        Update? update = null;
        try
        {
            update = Newtonsoft.Json.JsonConvert.DeserializeObject<Update>(rawJson);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deserialize Telegram update with Newtonsoft.Json. Body: {Body}", rawJson.Length > 300 ? rawJson[..300] : rawJson);
        }

        // 4. Fallback to System.Text.Json if needed
        if (update == null || update.Id == 0)
        {
            try
            {
                update = JsonSerializer.Deserialize<Update>(rawJson, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            catch (Exception ex2)
            {
                _logger.LogError(ex2, "Failed to deserialize Telegram update with System.Text.Json fallback");
            }
        }

        if (update == null || update.Id == 0)
        {
            _logger.LogWarning("Telegram webhook update deserialized as null or Id=0. RawBody length: {Len}", rawJson.Length);
            return Ok();
        }

        _logger.LogInformation("Received webhook update: UpdateId={UpdateId}, Type={UpdateType}", update.Id, update.Type);

        // 5. Process update safely — always return 200 OK so Telegram does not retry or mark webhook broken
        try
        {
            await _updateHandler.HandleUpdateAsync(_botClient, update, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing webhook update {UpdateId}: {Message}", update.Id, ex.Message);
        }

        return Ok();
    }
}
