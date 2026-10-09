using Microsoft.EntityFrameworkCore;
using PulQatta.Api.Data;
using PulQatta.Api.Entities;

namespace PulQatta.Api.Services;

public class UserService : IUserService
{
    private readonly AppDbContext _context;

    public UserService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<User> GetOrCreateUserAsync(long telegramId)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.TelegramId == telegramId);
        if (user == null)
        {
            user = new User
            {
                TelegramId = telegramId,
                CreatedAt = DateTime.UtcNow
            };
            _context.Users.Add(user);
            await _context.SaveChangesAsync();
        }
        return user;
    }
}
