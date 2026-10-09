using PulQatta.Api.Entities;

namespace PulQatta.Api.Services;

public interface IUserService
{
    Task<User> GetOrCreateUserAsync(long telegramId);
}
