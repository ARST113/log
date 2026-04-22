# Lampac Admin Panel (native-first rewrite)

Новый Admin Panel реализован как визуальный редактор `init.conf` с разделением на слои:

- **A: Конфигурация** — формы для правок JSON + raw/diff/rollback.
- **B: Компоненты** — управление FFmpeg/браузерами/TorrServer.
- **C: Операции** — тесты источников, системные действия, выдача плагинов.
- **D: Advanced** — raw редактор и детальные ошибки валидации.

## Структура

- `index.html` — shell + меню из 10 разделов по ТЗ.
- `styles.css` — адаптивная native-first тема.
- `panel.js` — состояние, формы, валидация, diff, backup/rollback, API-actions.

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
