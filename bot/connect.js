const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const { getTelegramRequestStrategies, formatConnectionError } = require('../utils/proxy');
const { createResilientPoller } = require('./resilientPolling');
const { startWebhook } = require('./webhook');
const { withTimeout } = require('../utils/withTimeout');

const REQUEST_TIMEOUT_MS = 8000;
const POLL_TIMEOUT_SEC = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildBotOptions(requestOptions) {
  return { polling: false, request: requestOptions };
}

function attachPoller(bot, poller) {
  bot._resilientPoller = poller;
  bot.stopPolling = async () => poller.stop();
  bot.isPolling = () => poller.isRunning();
}

async function connectBot(token) {
  for (const strategy of getTelegramRequestStrategies()) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const testBot = new TelegramBot(token, { polling: false, request: strategy.request });
        await withTimeout(testBot.getMe(), 12000, `${strategy.name} getMe`);
        logger.info(`Connected: ${strategy.name}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
        const bot = new TelegramBot(token, buildBotOptions(strategy.request));
        if (!bot?.on) throw new Error(`${strategy.name}: TelegramBot instance invalid`);
        return bot;
      } catch (error) {
        const msg = error?.message || '';
        if (/401|Unauthorized/i.test(msg)) {
          logger.error('BOT_TOKEN недействителен. Обнови токен у @BotFather');
          throw error;
        }
        const suffix = attempt < 3 ? `, retry ${attempt}/3` : '';
        logger.warn(`${strategy.name}: ${formatConnectionError(error)}${suffix}`);
        if (attempt < 3) await sleep(1000);
      }
    }
  }

  throw new Error('Не удалось подключиться к Telegram');
}

async function startPolling(bot) {
  bot._webhookServer?.close?.();
  await bot._resilientPoller?.stop();

  try {
    await withTimeout(bot.deleteWebHook({ drop_pending_updates: false }), REQUEST_TIMEOUT_MS, 'deleteWebHook');
  } catch (error) {
    logger.warn('deleteWebHook skipped:', error.message);
  }

  // The poller itself consumes pending updates. A separate drain getUpdates
  // would be a second consumer and can conflict with an in-flight request.
  const poller = createResilientPoller(bot, { pollTimeoutSec: POLL_TIMEOUT_SEC });
  attachPoller(bot, poller);
  await poller.start();
  logger.info(`Polling started (long-poll ${POLL_TIMEOUT_SEC}s)`);
}

async function startUpdates(bot) {
  if (process.env.WEBHOOK_URL) {
    await startWebhook(bot);
    return;
  }
  await startPolling(bot);
}

module.exports = { connectBot, startPolling, startUpdates };
