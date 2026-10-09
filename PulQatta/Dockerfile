FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj and restore
COPY ["src/PulQatta.Api/PulQatta.Api.csproj", "PulQatta.Api/"]
RUN dotnet restore "PulQatta.Api/PulQatta.Api.csproj"

# Copy everything else and build
COPY ["src/PulQatta.Api/", "PulQatta.Api/"]
WORKDIR "/src/PulQatta.Api"
RUN dotnet publish "PulQatta.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Build runtime image
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "PulQatta.Api.dll"]
