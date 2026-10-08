using PulQatta.Api.Entities;

namespace PulQatta.Api.DTOs;

public class CategorySummaryGetDto
{
    public Category Category { get; set; }
    public decimal TotalAmount { get; set; }
}
