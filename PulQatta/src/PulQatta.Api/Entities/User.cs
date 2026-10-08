namespace PulQatta.Api.Entities;

public class User
{
    public int Id { get; set; }
    public long TelegramId { get; set; }
    public string? Username { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public ICollection<Expense> Expenses { get; set; } = new List<Expense>();
}
