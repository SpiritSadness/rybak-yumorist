#!/bin/bash
set -a
source /opt/fishing-bot/.env
set +a
curl -s -o /dev/null -w "local=%{http_code}\n" \
  -X POST "http://127.0.0.1:3001/fishing-bot/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: ${WEBHOOK_SECRET}" \
  -d '{"update_id":1}'
curl -s -o /dev/null -w "https=%{http_code}\n" \
  -X POST "https://kadr-archive.ru/fishing-bot/webhook" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: ${WEBHOOK_SECRET}" \
  -d '{"update_id":2}'
