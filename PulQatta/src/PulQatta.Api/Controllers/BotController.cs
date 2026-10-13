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
    public async Task<IActionResult> Webhook([FromBody] Update update, CancellationToken cancellationToken)
    {
        var expectedSecret = _configuration["TELEGRAM_WEBHOOK_SECRET"];
        if (!string.IsNullOrEmpty(expectedSecret))
        {
            if (!Request.Headers.TryGetValue("X-Telegram-Bot-Api-Secret-Token", out var receivedSecret) ||
                receivedSecret != expectedSecret)
            {
                _logger.LogWarning("Unauthorized webhook update received. Secret token mismatch or missing.");
                return Unauthorized("Invalid webhook secret token.");
            }
        }

        try
        {
            await _updateHandler.HandleUpdateAsync(_botClient, update, cancellationToken);
            return Ok();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing Telegram webhook update {UpdateId}", update?.Id);
            return Ok(); // Return 200 OK so Telegram does not retry failed updates indefinitely
        }
    }
}
