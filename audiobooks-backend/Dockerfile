FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source
COPY src/Audiobooks.Backend.csproj src/
RUN dotnet restore src/Audiobooks.Backend.csproj
COPY src/ src/
COPY wwwroot/ wwwroot/
RUN dotnet publish src/Audiobooks.Backend.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out/ ./
ENV ASPNETCORE_URLS=http://+:8080 AUDIOBOOK_DB=/data/audiobooks-fdb.sqlite
USER 1654:1654
EXPOSE 8080
ENTRYPOINT ["dotnet", "Audiobooks.Backend.dll"]
