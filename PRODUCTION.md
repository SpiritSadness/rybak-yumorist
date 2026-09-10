# Production — Рыбак Юморист

**Прод крутится только на VPS.** Ноутбук не запускает бота (локальный systemd unit должен быть masked/выключен).

| | |
|---|---|
| Хост | `andreyzabrodin1440p.fvds.ru` (`188.120.235.19`) |
| Каталог | `/opt/fishing-bot` |
| Unit | `fishing-bot.service` (system, не user) |
| Бот | [@fishingHumorousBot](https://t.me/fishingHumorousBot) |
| Расписание (MSK) | 04 · 07 · 09 · 14 · 18 · 23 |

Секреты и SSH: Bitwarden → `Rybak - prod VPS .env`, `VPS SSH - kadr-deploy`.

## Проверка

```bash
ssh root@188.120.235.19 'systemctl is-active fishing-bot; journalctl -u fishing-bot -n 40 --no-pager'
```

## Прокси

Telegram с VPS идёт через прокси в `/opt/fishing-bot/.env`:

- Предпочтительно: `SOCKS_PROXY=socks5://USER:PASS@HOST:PORT`
- На Proxy6 HTTP на том же порту часто стабильнее long-poll — код сам пробует HTTP, затем SOCKS
- Не оставляй мёртвый `HTTP_PROXY` без рабочих кредов (будет 407 / таймауты)

## Обновление кода на VPS

```bash
ssh root@188.120.235.19 '
  cd /opt/fishing-bot
  git pull --ff-only origin main
  npm install --omit=dev
  npm run check:syntax
  npm run test:critical
  systemctl restart fishing-bot
  sleep 3
  systemctl is-active fishing-bot
  journalctl -u fishing-bot -n 30 --no-pager
'
```

`.env` на сервере **не в git** — после pull не затирай.

## Данные на VPS

- SQLite: `/opt/fishing-bot/data/bot.db`
- Планировщик: `/opt/fishing-bot/data/scheduler-state.json`
- Логи: `journalctl -u fishing-bot` и `/opt/fishing-bot/logs/`

## Бэкапы / watchdog (опционально)

По умолчанию на проде можно держать выключенными (`BACKUP_ENABLED=false`, `WATCHDOG_ENABLED=false`), чтобы не спамить.

Включить: правь `.env`, затем `bash scripts/ops-enable.sh` и timer’ы из `docs/systemd/` (адаптируй пути под `/opt/fishing-bot`, system unit от root).

## Локальная машина (только разработка)

```bash
cp .env.example .env   # BOT_TOKEN + SOCKS_PROXY
npm install
npm run check:syntax
npm run test:critical
# НЕ держи локальный polling параллельно с VPS — конфликт 409
```

Примеры unit-файлов (legacy / home lab): [docs/systemd/README.md](./docs/systemd/README.md)  
Миграции: [docs/MIGRATION.md](./docs/MIGRATION.md)

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `BOT_TOKEN` | Токен Telegram-бота |
| `CHAT_ID` | Основная группа (опционально) |
| `SOCKS_PROXY` | SOCKS5-прокси (основной для прода) |
| `HTTP_PROXY` | HTTP-прокси (если нужен вместо/вместе) |
| `SCHEDULE_BACKFILL` | Догонять пропущенные слоты при старте |
| `BACKUP_ENABLED` / `WATCHDOG_ENABLED` / `TELEGRAM_NOTIFY_ENABLED` | Ops-алерты |
| `BACKUP_NOTIFY_USERNAME` / `BACKUP_NOTIFY_CHAT_ID` | Кому слать отчёты |
| `TELEGRAM_RECONNECT_MS` | Интервал reconnect health-check |
| `SCHEDULE_CATCHUP_MINUTES` | Окно догоняющей рассылки |
