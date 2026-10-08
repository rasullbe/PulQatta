using System;
using PulQatta.Api.Entities;

namespace PulQatta.Api.DTOs;

public class ExpenseGetDto
{
    public int Id { get; set; }
    public Category Category { get; set; }
    public decimal Amount { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; }
}
