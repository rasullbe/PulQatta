# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ["src/PulQatta.Api/PulQatta.Api.csproj", "PulQatta.Api/"]
RUN dotnet restore "PulQatta.Api/PulQatta.Api.csproj"

# Copy source and publish release build
COPY ["src/PulQatta.Api/", "PulQatta.Api/"]
WORKDIR "/src/PulQatta.Api"
RUN dotnet publish "PulQatta.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

ENV PORT=10000
EXPOSE 10000

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "PulQatta.Api.dll"]
