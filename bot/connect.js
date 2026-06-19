const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const { getTelegramRequestStrategies, formatConnectionError } = require('../utils/proxy');

function buildBotOptions(requestOptions) {
  return {
    polling: { interval: 300, autoStart: true, params: { timeout: 10 } },
    request: requestOptions
  };
}

async function connectBot(token) {
  for (const strategy of getTelegramRequestStrategies()) {
    try {
      const testBot = new TelegramBot(token, { polling: false, request: strategy.request });
      await testBot.getMe();
      logger.info(`Connected: ${strategy.name}`);
      return new TelegramBot(token, buildBotOptions(strategy.request));
    } catch (error) {
      const msg = error?.message || '';
      if (/401|Unauthorized/i.test(msg)) {
        logger.error('BOT_TOKEN недействителен. Обнови токен у @BotFather');
        throw error;
      }
      logger.warn(`${strategy.name}: ${formatConnectionError(error)}`);
    }
  }

  throw new Error('Не удалось подключиться к Telegram');
}

module.exports = { connectBot };
