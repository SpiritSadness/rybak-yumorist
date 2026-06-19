const logger = require('../utils/logger');
const { formatConnectionError } = require('../utils/proxy');

function registerRuntimeHandlers(bot) {
  bot.on('polling_error', (error) => {
    logger.error('polling_error:', formatConnectionError(error));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection:', reason instanceof Error ? reason : String(reason));
  });

  process.on('uncaughtException', (error) => {
    logger.error('uncaughtException:', error);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down');
    process.exit(0);
  });
}

module.exports = { registerRuntimeHandlers };
