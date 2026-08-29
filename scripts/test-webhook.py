#!/usr/bin/env python3
import os
import urllib.request
from pathlib import Path

for line in Path('/opt/fishing-bot/.env').read_text().splitlines():
    if line.startswith('WEBHOOK_SECRET='):
        secret = line.split('=', 1)[1]
        break
else:
    secret = ''

def post(url):
    req = urllib.request.Request(url, data=b'{"update_id":1}', method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('X-Telegram-Bot-Api-Secret-Token', secret)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            print(url, resp.status)
    except Exception as e:
        print(url, e)

post('http://127.0.0.1:3001/fishing-bot/webhook')
post('https://kadr-archive.ru/fishing-bot/webhook')
