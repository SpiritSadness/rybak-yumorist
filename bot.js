require('dotenv').config();

const logger = require('./utils/logger');
const { formatConnectionError } = require('./utils/proxy');
const { startBot } = require('./bot/startup');

const RETRY_MS = Number(process.env.TELEGRAM_STARTUP_RETRY_MS) || 15000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  logger.info('Starting bot...');

  for (;;) {
    try {
      await startBot();
      await new Promise(() => {});
    } catch (error) {
      logger.error('Startup failed, retry in', Math.round(RETRY_MS / 1000), 's:', formatConnectionError(error));
      await sleep(RETRY_MS);
    }
  }
}

main().catch((error) => {
  logger.error('Fatal startup error:', formatConnectionError(error));
  process.exit(1);
});
