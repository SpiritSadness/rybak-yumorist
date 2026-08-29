# Рыбак Юморист

Telegram-бот с рыбацкими анекдотами, погодой и авторассылкой в группы.

Бот в Telegram: [@fishingHumorousBot](https://t.me/fishingHumorousBot)

## Возможности

- Анекдоты про рыбалку (пул + обновление с anekdot.ru)
- Лайки / дизлайки и топ шуток
- Погода (Кострома, Макарьев) через Open-Meteo
- Подключение к группам и расписание рассылки (МСК): 04 · 07 · 09 · 14 · 18 · 23
- SQLite-хранилище, бэкапы и watchdog для продакшена

## Стек

- Node.js 18+
- `node-telegram-bot-api`
- `better-sqlite3`
- Cheerio (скрапинг), Axios, dotenv

## Быстрый старт

```bash
cp .env.example .env
# Заполни BOT_TOKEN (от @BotFather)
npm install
npm start
```

Полезные скрипты:

| Команда | Назначение |
|---------|------------|
| `npm start` | Запуск бота |
| `npm run check:connection` | Проверка токена / сети |
| `npm run set:commands` | Обновить команды в Telegram |
| `npm run check:syntax` | Проверка синтаксиса JS |
| `./botctl.sh` | Меню управления (Linux + systemd) |

## Переменные окружения

См. `.env.example`.

| Переменная | Описание |
|------------|----------|
| `BOT_TOKEN` | Токен бота (обязательно) |
| `CHAT_ID` | Legacy-чат (опционально) |
| `SOCKS_PROXY` | Прокси для Telegram / сети |
| `BACKUP_NOTIFY_USERNAME` | Кому слать отчёты бэкапа/watchdog |
| `BACKUP_NOTIFY_CHAT_ID` | Или chat id вместо username |
| `BACKUP_ROOT` | Корень бэкапов (по умолчанию `~/backups/rybak-yumorist`) |

Секреты только в `.env`. Каталог `data/` в git не попадает.

## Структура

```
bot/         запуск, экраны, планировщик
handlers/    команды и callback
services/    БД, шутки, погода, группы
config/      расписание, города, источники
scripts/     бэкап, watchdog, утилиты
utils/       UI, логи, прокси
```

## Продакшен

Краткий ops-чеклист: [PRODUCTION.md](./PRODUCTION.md)  
(systemd user units, бэкапы, watchdog).

## Замечания

- Подписчики анекдотов и голоса хранятся локально; при переносе сервера нужен бэкап `data/`.
- Источник шуток — внешний сайт; доступность зависит от сети.
- Не коммить `.env`, логи и базу.

## CI

GitHub Actions проверяет синтаксис всех `.js` при push/PR.

## Лицензия

[MIT](./LICENSE) — можно использовать и копировать с указанием автора **Andrey Zabrodin**.
