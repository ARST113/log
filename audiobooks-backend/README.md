# КнигаСЛОво — самостоятельный бэкенд аудиокниг

ASP.NET Core 10, SQLite и парсеры источников. Для работы не нужен Lampac, Shared.dll, Playwright или Chromium. Формат API, таблицы и идентификаторы существующего каталога сохранены. Клиенты: Android «СЛОво» и плагин Lampa «Аудиокниги 2».

## Установка одной командой

На Ubuntu/Debian с доменом, направленным на сервер:

```bash
curl -fsSL https://raw.githubusercontent.com/ARST113/log/main/audiobooks-backend/install.sh | sudo bash -s -- --domain knigaslovo.duckdns.org
```

Используйте свой домен на другом сервере. Скрипт собирает контейнер, подключает Caddy/HTTPS и запускает сервис. При отсутствии Docker устанавливает пакет Docker из репозитория ОС. Порты 80/443 должны быть доступны для HTTPS. Существующий Caddyfile сохраняется; сайт добавляется отдельным импортом.

Повторный запуск той же команды обновляет приложение, сохраняет `.env` и делает согласованную резервную копию существующей базы. Установщик не переносит рабочую базу с чужого сервера автоматически и не содержит паролей.

## Клиенты

- В «СЛОво»: адрес API `https://knigaslovo.duckdns.org`.
- В Lampa: плагин `https://knigaslovo.duckdns.org/audiobook2.js`.
- Для другого домена можно задать `window.lampacAudiobooks2ApiBase` до загрузки плагина. При прямой загрузке с домена сервиса адрес берётся из URL скрипта.

## Данные и настройки

Исходники: `/opt/audiobooks-backend`. База: `/var/lib/audiobooks-backend/data/audiobooks-fdb.sqlite`. Резервные копии обновлений: `/var/lib/audiobooks-backend/backups`. Конфигурация: `/opt/audiobooks-backend/.env` (не публикуется).

| Переменная | Значение по умолчанию |
|---|---|
| `AUDIOBOOK_DB` | `/data/audiobooks-fdb.sqlite` в контейнере |
| `AUDIOBOOK_CRAWLER_ENABLED` | `true` |
| `AUDIOBOOK_CRAWLER_PARALLELISM` | `1`, диапазон 1–4 |
| `AUDIOBOOK_CRAWLER_INTERVAL_MINUTES` | `30`, диапазон 5–1440 |
| `AUDIOBOOK_PROXY` | Пусто; при необходимости HTTP/SOCKS proxy |
| `AUDIOBOOK_DEVKEY` | Пусто; диагностические методы закрыты извне |

Контейнер имеет лимит 512 МБ RAM, 1 ядро CPU и 128 процессов. Браузеры не запускаются. Поиск известной книги возвращает каталог без ожидания загрузки глав; полные сведения запрашиваются при открытии карточки. Удалённый источник может временно быть недоступен.

## API

Сохранены `/audio/search`, `/audio/catalog`, `/audio/work/{id}`, `/audio/edition/{id}`, `/audio/play/{editionId}/{chapterIndex}`, `/audio/genres`, `/audio/authors`, `/audio/narrators`, `/audio/series`, их поисковые маршруты и списки книг. Сохранены `/audiobooks/search`, `/audiobooks/book`, `/audiobooks/audio`, `/audiobooks/img` и старые маршруты источников. Аудиопрокси поддерживает Range.

`/healthz` проверяет процесс, `/readyz` — доступность базы. HTTP API доступен с CORS для клиентов Lampa. Контейнер слушает только loopback хоста; доверие к Forwarded-заголовкам предназначено для локального reverse proxy. Не публикуйте порт контейнера напрямую: перед ним должен стоять Caddy/nginx.

## Проверки

```bash
docker run --rm -v "$PWD:/project" -w /project/tests mcr.microsoft.com/dotnet/sdk:10.0 sh -c 'cp fixtures/*.html .; dotnet run --project Checks.csproj'
```

Проверяются неполные названия, поиск по циклу, структура АКНИГА, дробные номера, одновременная запись SQLite, произвольный путь базы, выдача известной книги при незавершённых фоновых задачах и защита прямых и проксируемых запросов от локальных адресов. Тесты используют отдельные SQLite-файлы, рабочий каталог не затрагивается.

Логи: `cd /opt/audiobooks-backend && sudo docker compose -p audiobooks-backend logs --tail 100`.
