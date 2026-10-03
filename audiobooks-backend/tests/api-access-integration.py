"""Проверка работающего тестового API. Ключ читается из локального файла, не выводится."""
import argparse
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--base', required=True)
parser.add_argument('--key-file', required=True)
args = parser.parse_args()
base = args.base.rstrip('/')
key = Path(args.key_file).read_text().strip()

def request(path, headers=None, method='GET'):
    try:
        response = urlopen(Request(base + path, headers=headers or {}, method=method), timeout=30)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()

for path in ('/audio/providers', '/audio/catalog', '/audio/crawler/status',
             '/audiobooks/img?url=https%3A%2F%2Fexample.invalid%2Fcover.jpg',
             '/audiobooks/audio?url=https%3A%2F%2Fexample.invalid%2Faudio.mp3',
             '/akniga/search?query=book'):
    assert request(path)[0] == 401, 'Открытый маршрут API'
    assert request(path, {'X-Api-Key': 'invalid'})[0] == 401, 'Неверный ключ принят'

assert request('/access/invalid/audio/providers')[0] == 401, 'Неверный префикс принят'
for path in ('/healthz', '/readyz', '/audiobook2.js'):
    assert request(path)[0] == 200, 'Публичная проверка недоступна'

for path, headers in (
    ('/audio/providers', {'X-Api-Key': key}),
    ('/audio/providers?api_key=' + key, {}),
    ('/access/' + key + '/audio/providers', {}),
):
    status, response_headers, body = request(path, headers)
    assert status == 200 and json.loads(body), 'Действующий ключ отклонён'
    assert response_headers.get('Cache-Control') == 'private, no-store', 'Ответ допускает общий кэш'
    assert response_headers.get('Referrer-Policy') == 'no-referrer', 'Ключ допускается в Referer'
    assert response_headers.get('X-Content-Type-Options') == 'nosniff', 'Тип содержимого допускает угадывание'
    assert "sandbox" in response_headers.get('Content-Security-Policy', ''), 'Внешнее содержимое может выполнить скрипт'

status, headers, body = request('/audio/catalog?limit=5', {'X-Api-Key': key})
assert status == 200 and json.loads(body), 'Каталог с ключом недоступен'
status, headers, body = request('/audio/providers', {
    'Origin': 'https://example.invalid', 'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'X-Api-Key',
}, 'OPTIONS')
assert status in (200, 204) and headers.get('Access-Control-Allow-Origin') == '*', 'CORS preflight не работает'
print('PASS: unauthorized routes, three authentication methods, catalog, cache/referrer policy, CORS')
