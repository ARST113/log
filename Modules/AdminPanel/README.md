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

## API-контракты (ожидаемые endpoint'ы)

- `GET /admin/api/config`
- `POST /admin/api/config/validate`
- `POST /admin/api/config/save`
- `POST /admin/api/sources/test`
- `POST /admin/api/components/:component/:action`
- `POST /admin/api/system/:action`

Если backend недоступен, панель падает обратно в `localStorage` для демонстрационного режима.
