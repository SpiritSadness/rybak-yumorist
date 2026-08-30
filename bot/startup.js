const logger = require('../utils/logger');
const { syncBotCommands } = require('../utils/botCommands');
const jokePoolService = require('../services/jokePoolService');
const weatherService = require('../services/weatherService');
const groupRegistry = require('../services/groupRegistry');
const scheduleImageService = require('../services/scheduleImageService');
const { connectBot, startUpdates } = require('./connect');
const { createContext } = require('./context');
const { createScreens } = require('./screens');
const { createGameScreens } = require('./gameScreens');
const { createScheduler } = require('./scheduler');
const { registerRuntimeHandlers } = require('./runtime');
const { setupHandlers } = require('../handlers');

const LEGACY_CHAT_ID = process.env.CHAT_ID || null;

function initJokePoolBackground() {
  jokePoolService.initPoolOnStartup()
    .then(() => {
      jokePoolService.startPeriodicRefresh();
    })
    .catch((error) => {
      logger.warn('Joke pool init failed:', error.message);
      jokePoolService.startPeriodicRefresh();
    });
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
  const screens = {
    ...createScreens(ctx),
    ...createGameScreens(ctx)
  };
  const scheduler = createScheduler(ctx);

  ctx.replaceBot = async () => {
    const oldBot = ctx.bot;
    const newBot = await connectBot(token);

    try {
      await oldBot?._resilientPoller?.stop();
      if (oldBot?._webhookServer) {
        await new Promise((resolve) => oldBot._webhookServer.close(resolve));
      }
    } catch (error) {
      logger.warn('stopPolling before replace:', error.message);
    }

    ctx.bot = newBot;
    setupHandlers(ctx, screens);
    try {
      await startUpdates(newBot);
    } catch (error) {
      ctx.bot = oldBot;
      if (oldBot && !oldBot.isPolling?.()) {
        await startUpdates(oldBot);
      }
      throw error;
    }

    try {
      const me = await ctx.bot.getMe();
      ctx.botUsername = me.username || ctx.botUsername;
    } catch (error) {
      logger.warn('getMe after replace failed:', error.message);
    }
  };

  ctx.bot = await connectBot(token);
  setupHandlers(ctx, screens);
  registerRuntimeHandlers(ctx);
  await startUpdates(ctx.bot);
  scheduler.startScheduler();

  ctx.bot.getMe()
    .then((me) => {
      ctx.botUsername = me.username || ctx.botUsername;
    })
    .catch((error) => {
      logger.warn('Could not load bot username:', error.message);
    });

  if (LEGACY_CHAT_ID) {
    groupRegistry.migrateLegacyGroup(ctx.bot, LEGACY_CHAT_ID).catch((error) => {
      logger.warn('Legacy group migrate failed:', error.message);
    });
  }

  setTimeout(() => {
    registerBotCommands(ctx).catch((error) => {
      logger.warn('Bot commands sync failed:', error.message);
    });
  }, 30 * 1000);

  initJokePoolBackground();

  scheduleImageService.preloadImages().catch((error) => {
    logger.warn('Schedule image preload failed:', error.message);
  });

  weatherService.getWeather('kostroma')
    .then(() => logger.info('Weather preload OK'))
    .catch((error) => logger.warn('Weather preload failed:', error.message));

  const activeGroups = groupRegistry.getActiveGroups().length;
  logger.info('Bot is running. Active groups:', activeGroups);

  return ctx;
}

module.exports = { startBot };
