require('dotenv').config();

const logger = require('./utils/logger');
const { formatConnectionError } = require('./utils/proxy');
const { startBot } = require('./bot/startup');

logger.info('Starting bot...');

startBot().catch((error) => {
  logger.error('Startup failed:', formatConnectionError(error));
  process.exit(1);
});
