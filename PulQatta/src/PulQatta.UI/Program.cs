using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using PulQatta.UI;
using PulQatta.UI.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

var apiUrl = builder.Configuration["ApiUrl"] ?? "https://localhost:7123";

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(apiUrl) });
builder.Services.AddScoped<ITelegramService, TelegramService>();
builder.Services.AddScoped<IApiService, ApiService>();

await builder.Build().RunAsync();
