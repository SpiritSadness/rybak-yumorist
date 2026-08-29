const http = require('http');
const logger = require('../utils/logger');
const { withTimeout } = require('../utils/withTimeout');

function startWebhookServer(bot, { port, path, secret }) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== path) {
      res.writeHead(404);
      res.end();
      return;
    }

    if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
      res.writeHead(403);
      res.end();
      return;
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const update = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        bot.processUpdate(update);
      } catch (error) {
        logger.warn('webhook parse error:', error.message);
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
  });

  server.listen(port, '127.0.0.1');
  return server;
}

async function startWebhook(bot) {
  const url = process.env.WEBHOOK_URL;
  const secret = process.env.WEBHOOK_SECRET || '';
  const port = Number(process.env.WEBHOOK_PORT) || 3001;

  if (!url) throw new Error('WEBHOOK_URL не задан');

  const path = new URL(url).pathname;

  bot._resilientPoller?.stop();

  await withTimeout(
    bot.setWebHook(url, {
      drop_pending_updates: false,
      secret_token: secret || undefined
    }),
    10000,
    'setWebHook'
  );

  const server = startWebhookServer(bot, { port, path, secret });
  bot._webhookServer = server;
  bot.stopPolling = async () => {
    await new Promise((resolve) => server.close(resolve));
    await bot.deleteWebHook();
  };
  bot.isPolling = () => Boolean(bot._webhookServer?.listening);

  logger.info('Webhook started:', url);
}

module.exports = { startWebhook };
