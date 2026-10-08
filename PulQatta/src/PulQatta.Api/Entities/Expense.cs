namespace PulQatta.Api.Entities;

public class Expense
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public Category Category { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
    public User? User { get; set; }
}
