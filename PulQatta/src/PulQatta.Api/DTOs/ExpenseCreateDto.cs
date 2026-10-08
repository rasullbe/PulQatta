using PulQatta.Api.Entities;

namespace PulQatta.Api.DTOs;

public class ExpenseCreateDto
{
    public decimal Amount { get; set; }
    public Category Category { get; set; }
    public string? Note { get; set; }
}
