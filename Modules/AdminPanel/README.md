
## Роутинг и включение модуля

- Основная страница модуля: `/adminpanel`
- API-префикс: `/adminpanel/api/*`
- В штатном Lampac модуль `AdminPanel` по умолчанию выключен через `manifest.json` (`\"enable\": false`), перед использованием его нужно включить.

## API-контракты (фактические в текущем Lampac)

- `GET /adminpanel/api/init`
- `POST /adminpanel/api/init`
- `GET /adminpanel/api/current`
- `GET /adminpanel/api/groups`
- `GET /adminpanel/api/groups/catalog`
- `POST /adminpanel/api/init/section/{key}`

## Дополнительные действия

Экранные операции для компонентов/источников/системы используют неймспейс:

- `POST /adminpanel/api/ops/sources/test`
- `POST /adminpanel/api/ops/components/:component/:action`
- `POST /adminpanel/api/ops/system/:action`

Это расширение для native-first сценария; если этих endpoint'ов нет, UI показывает fallback через `localStorage`/локальные статусы.
## API-контракты (ожидаемые endpoint'ы)

- `GET /admin/api/config`
- `POST /admin/api/config/validate`
- `POST /admin/api/config/save`
- `POST /admin/api/sources/test`
- `POST /admin/api/components/:component/:action`
- `POST /admin/api/system/:action`

Если backend недоступен, панель падает обратно в `localStorage` для демонстрационного режима.
