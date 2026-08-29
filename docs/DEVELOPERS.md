# Для разработчиков и админов

Обычным пользователям бота достаточно [README.md](../README.md) и ссылки [@fishingHumorousBot](https://t.me/fishingHumorousBot).

## Запуск на своём сервере

```bash
git clone https://github.com/SpiritSadness/rybak-yumorist.git
cd rybak-yumorist
cp .env.example .env
# В .env укажи BOT_TOKEN от @BotFather
npm install
npm start
```

## Полезные команды

| Команда | Зачем |
|---------|--------|
| `npm start` | Запустить бота |
| `npm run check:connection` | Проверить токен и сеть |
| `npm run set:commands` | Обновить команды в Telegram |
| `./botctl.sh` | Меню управления (Linux) |
| `npm run ops:disable` | Выключить бэкапы и алерты в TG |

## Настройки (.env)

Смотри `.env.example`. Главное — `BOT_TOKEN`. Остальное опционально (прокси, бэкапы, уведомления).

## Структура проекта

```
bot/         запуск и экраны
handlers/    команды
services/    анекдоты, погода, группы, база
scripts/     бэкап, watchdog
```

## Продакшен (Linux + systemd)

- [PRODUCTION.md](../PRODUCTION.md)
- [systemd примеры](./systemd/README.md)
- [После обновления кода](./MIGRATION.md)
- [Если сыпятся ошибки бэкапа](./TROUBLESHOOTING.md)

## Стек

Node.js 18+, SQLite, node-telegram-bot-api, Cheerio, Axios.

## CI

GitHub Actions проверяет синтаксис JS при каждом push.
