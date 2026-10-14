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
    public async Task<IActionResult> Webhook([FromBody] JsonElement body, CancellationToken cancellationToken)
    {
        var expectedSecret = _configuration["TELEGRAM_WEBHOOK_SECRET"];
        if (!string.IsNullOrEmpty(expectedSecret))
        {
            if (!Request.Headers.TryGetValue("X-Telegram-Bot-Api-Secret-Token", out var receivedSecret) ||
                receivedSecret != expectedSecret)
            {
                _logger.LogWarning("Unauthorized webhook update received. Secret token mismatch or missing. Received: '{ReceivedSecret}'", (string?)receivedSecret);
                return Unauthorized("Invalid webhook secret token.");
            }
        }

        Update? update = null;
        try
        {
            var rawJson = body.GetRawText();
            // Telegram.Bot 19.x uses Newtonsoft.Json mapping
            update = Newtonsoft.Json.JsonConvert.DeserializeObject<Update>(rawJson);

            // Fallback for System.Text.Json if needed
            if (update == null || update.Id == 0)
            {
                var stjUpdate = JsonSerializer.Deserialize<Update>(rawJson);
                if (stjUpdate != null && stjUpdate.Id != 0)
                {
                    update = stjUpdate;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deserialize Telegram webhook update body. Exception: {Message}", ex.Message);
            return Ok(); // Return 200 OK so Telegram does not retry malformed updates indefinitely
        }

        if (update == null)
        {
            _logger.LogWarning("Telegram webhook update was deserialized as null.");
            return Ok();
        }

        _logger.LogInformation("Successfully received Telegram webhook update: UpdateId={UpdateId}, Type={UpdateType}", update.Id, update.Type);

        try
        {
            await _updateHandler.HandleUpdateAsync(_botClient, update, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Telegram webhook update {UpdateId}: {Message}", update.Id, ex.Message);
        }

        return Ok();
    }
}
