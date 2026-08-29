# Fishing Humor Bot (Ryback Yumorist)

Telegram bot with fishing jokes, weather, and scheduled group broadcasts.

Bot: [@fishingHumorousBot](https://t.me/fishingHumorousBot)

**Russian docs:** [README.md](./README.md)

## Features

- Fishing jokes (pool + refresh from anekdot.ru)
- Likes / dislikes and top jokes
- Weather (Kostroma, Makaryev) via Open-Meteo
- Group integration and MSK schedule: 04 · 07 · 09 · 14 · 18 · 23
- SQLite storage, backups, watchdog for production

## Stack

Node.js 18+, `node-telegram-bot-api`, `better-sqlite3`, Cheerio, Axios, dotenv

## Quick start

```bash
cp .env.example .env
# Set BOT_TOKEN from @BotFather
npm install
npm start
```

## Environment

See `.env.example`. Secrets stay in `.env` only; `data/` is gitignored.

## Production

- [PRODUCTION.md](./PRODUCTION.md)
- [docs/systemd/](./docs/systemd/) — example user units
- [docs/MIGRATION.md](./docs/MIGRATION.md) — after pulling cleanup changes

## License

[MIT](./LICENSE) — reuse with attribution to **Andrey Zabrodin**.
