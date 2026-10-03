# Подготовка отдельного примера «СЛОво»

Пример сохраняет интерфейс исходной сборки 1.8.10, но имеет отдельный package `app.lampac.slovo.example` и собственную подпись. Это самостоятельная установка, которая не обновляет оригинальное приложение.

Изменения применяются скриптом [patch_slovo.py](patch_slovo.py) к результату декодирования Apktool:

- прежний адрес по умолчанию удаляется из LocalStore, ApiClient и предварительного просмотра интерфейса;
- статическая карта DNS fallback заменяется пустой;
- сетевой конфиг не содержит персональных доменов;
- launcher [ServerSetupActivity](ServerSetupActivity.smali) требует собственный HTTPS-адрес до открытия основного интерфейса;
- поле ключа пустое и скрывает символы; непустой ключ добавляется к адресу как `/access/<URI-encoded-key>`;
- автоматические HTTP-варианты аудио и обложек отключены для HTTPS URL, у которых путь содержит `/access/`;
- общий OkHttp redirect follow-up вызывает [TransportPolicy](TransportPolicy.smali), запрещающий HTTPS-переход на HTTP `Location` с `/access/` для API, загрузок и плеера;
- appId, provider authority и собственное permission имеют отдельные имена, резервное копирование настроек отключено.

Патчер сам определяет прежний адрес из исходного APK и проверяет его отсутствие после изменения. Персональные адреса в скрипте не записаны.

## Сборка

Понадобятся Apktool 3.0.3, Java 17+, Python 3 и Android Build Tools. Исходный APK предоставляется владельцем сборки отдельно; старая сборка с сервером по умолчанию не распространяется в актуальной папке проекта.

```bash
java -jar apktool_3.0.3.jar d original-slovo-1.8.10.apk -o decoded -p framework --no-debug-info
python patch_slovo.py decoded
java -jar apktool_3.0.3.jar b decoded -p framework -o example-unsigned.apk
zipalign -f 4 example-unsigned.apk example-aligned.apk
apksigner sign --ks YOUR-EXAMPLE-KEYSTORE --out slovo-own-server-example-1.8.10.apk example-aligned.apk
apksigner verify --verbose --print-certs slovo-own-server-example-1.8.10.apk
zipalign -c 4 slovo-own-server-example-1.8.10.apk
```

Используйте собственный ключ отдельного примера. Подпись опубликованного APK не является подписью оригинального «СЛОво». На Windows сборочным инструментам могут потребоваться пути без кириллицы, например короткие пути 8.3.

## Проверка транспорта

С установленным Androguard выполните `python test_transport.py slovo-own-server-example-1.8.10.apk`. Тест исполняет инструкции `alternateScheme`, `schemeCandidates` и `allowRedirect` из собранного DEX с минимальными заглушками Uri/String: 24 случая проверяют запрет HTTP-повтора и защищённого HTTP redirect, обычные внешние ссылки, вложенный адрес в query и trim. Также проверяется подключение политики к общему OkHttp follow-up. Это статическая проверка; первый запуск, поиск и воспроизведение дополнительно проверяются на Android.
