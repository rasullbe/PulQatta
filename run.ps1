Start-Process powershell -ArgumentList "-NoExit -Command `"cd src/PulQatta.Api; dotnet run`""
Start-Process powershell -ArgumentList "-NoExit -Command `"cd src/PulQatta.UI; dotnet run`""
Write-Host "Projects started in separate windows."
