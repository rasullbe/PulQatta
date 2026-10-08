using System;
using PulQatta.UI.Entities;

namespace PulQatta.UI.DTOs;

public class ExpenseGetDto
{
    public int Id { get; set; }
    public Category Category { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class ExpenseTodaySummaryGetDto
{
    public decimal Total { get; set; }
    public ExpenseGetDto[] Expenses { get; set; } = Array.Empty<ExpenseGetDto>();
}

public class CategorySummaryGetDto
{
    public Category Category { get; set; }
    public decimal TotalAmount { get; set; }
}

public class ExpenseCreateDto
{
    public decimal Amount { get; set; }
    public Category Category { get; set; }
    public string? Note { get; set; }
}
