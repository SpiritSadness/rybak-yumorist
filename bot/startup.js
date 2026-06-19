const logger = require('../utils/logger');
const { syncBotCommands } = require('../utils/botCommands');
const jokePoolService = require('../services/jokePoolService');
const weatherService = require('../services/weatherService');
const groupRegistry = require('../services/groupRegistry');
const { connectBot } = require('./connect');
const { createContext } = require('./context');
const { createScreens } = require('./screens');
const { createScheduler } = require('./scheduler');
const { registerRuntimeHandlers } = require('./runtime');
const { setupHandlers } = require('../handlers');

const LEGACY_CHAT_ID = process.env.CHAT_ID || null;

async function initJokePool() {
  await jokePoolService.initPoolOnStartup();
  jokePoolService.startPeriodicRefresh();
}

async function registerBotCommands(ctx) {
  await syncBotCommands(ctx.bot, (level, ...args) => {
    if (level === 'warn') logger.warn(...args);
    else logger.info(...args);
  });
  logger.info('Bot commands synced: /start, /help');
}

async function startBot() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    throw new Error('BOT_TOKEN не задан в .env');
  }

  const ctx = createContext();
  ctx.bot = await connectBot(token);
  registerRuntimeHandlers(ctx.bot);

  try {
    const me = await ctx.bot.getMe();
    ctx.botUsername = me.username || ctx.botUsername;
  } catch (error) {
    logger.warn('Could not load bot username:', error.message);
  }

  const screens = createScreens(ctx);
  const scheduler = createScheduler(ctx);

  setupHandlers(ctx, screens);
  scheduler.startScheduler();

  if (LEGACY_CHAT_ID) {
    await groupRegistry.migrateLegacyGroup(ctx.bot, LEGACY_CHAT_ID);
  }

  registerBotCommands(ctx).catch((error) => {
    logger.warn('Bot commands sync deferred failed:', error.message);
  });

  await initJokePool();

  try {
    await weatherService.getWeather('kostroma');
    logger.info('Weather preload OK');
  } catch (error) {
    logger.warn('Weather preload failed:', error.message);
  }

  const activeGroups = groupRegistry.getActiveGroups().length;
  logger.info('Bot is running. Active groups:', activeGroups);

  return ctx;
}

module.exports = { startBot };
