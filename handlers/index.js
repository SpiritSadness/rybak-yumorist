const logger = require('../utils/logger');
const groupRegistry = require('../services/groupRegistry');
const { createVoteHandler } = require('./votes');

const { withTimeout } = require('../utils/withTimeout');

function setupHandlers(ctx, screens) {
  const handleVote = createVoteHandler(ctx, screens);
  const startInFlight = new Set();
  const screenQueues = new Map();

  const screenHandlers = {
    menu: (chatId, messageId) => screens.showMenu(chatId, messageId),
    joke: (chatId, messageId) => screens.showJoke(chatId, messageId),
    weather: (chatId, messageId) => screens.showWeatherMenu(chatId, messageId),
    schedule: (chatId, messageId, userId, queryChatId) => screens.showSchedule(chatId, messageId, userId, queryChatId),
    top: (chatId, messageId) => screens.showTop(chatId, messageId),
    help: (chatId, messageId) => screens.showHelpMenu(chatId, messageId),
    about: (chatId, messageId) => screens.showAbout(chatId, messageId)
  };

  async function enqueueScreen(chatId, messageId, task) {
    const key = `${chatId}:${messageId || 'new'}`;
    const previous = screenQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    screenQueues.set(key, current);

    try {
      return await current;
    } finally {
      if (screenQueues.get(key) === current) screenQueues.delete(key);
    }
  }

  async function runScreen(chatId, messageId, action, fn, errorKind = 'generic') {
    try {
      await enqueueScreen(chatId, messageId, fn);
    } catch (error) {
      logger.error(`Screen ${action} error:`, error);
      await ctx.showErrorScreen(chatId, messageId, errorKind);
    }
  }

  ctx.bot.on('my_chat_member', async (update) => {
    const chatId = update.chat?.id;
    const status = update.new_chat_member?.status;
    const fromId = update.from?.id;

    if (!chatId || !groupRegistry.isGroupChatId(chatId)) return;

    try {
      if (['member', 'administrator', 'creator'].includes(status)) {
        await groupRegistry.ensureRegistered(ctx.bot, chatId, fromId);
        logger.info('Group connected:', chatId, update.chat?.title);
      } else if (['left', 'kicked', 'banned'].includes(status)) {
        groupRegistry.deactivateGroup(chatId);
        logger.info('Group disconnected:', chatId);
      }
    } catch (error) {
      logger.error('my_chat_member handler error:', error);
    }
  });

  ctx.bot.onText(/\/start(@\w+)?/, async (msg) => {
    const chatId = msg.chat?.id;
    logger.info('/start from chat:', chatId, msg.from?.username);
    if (!chatId || startInFlight.has(chatId)) return;

    startInFlight.add(chatId);
    try {
      const messageId = await withTimeout(
        screens.showMenu(chatId, null, { forceNew: false }),
        20000,
        '/start showMenu'
      );
      logger.info('/start menu sent chat:', chatId, 'msg:', messageId);
    } catch (error) {
      logger.error('/start error:', error?.message || error);
    } finally {
      startInFlight.delete(chatId);
    }
  });

  ctx.bot.onText(/\/help(@\w+)?/, async (msg) => {
    try {
      await screens.showHelpSetup(msg.chat.id, null, msg.from?.id, msg.chat.id);
    } catch (error) {
      logger.error('/help error:', error);
      await ctx.showErrorScreen(msg.chat.id, null, 'generic');
    }
  });

  ctx.bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    const action = query.data;

    // One callback query must be answered exactly once. Screen rendering runs
    // concurrently, so the Telegram spinner is cleared as early as possible.
    const ackOptions = action?.startsWith('like:') || action?.startsWith('dislike:')
      ? { text: 'Сохраняю голос…' }
      : undefined;
    void ctx.bot.answerCallbackQuery(query.id, ackOptions).catch((error) => {
      logger.warn('answerCallbackQuery failed:', error.message);
    });

    logger.info('callback:', action, 'chat:', chatId);

    if (!chatId || !messageId || typeof action !== 'string') {
      return;
    }

    if (action.startsWith('like:') || action.startsWith('dislike:')) {
      const [kind, idRaw] = action.split(':');
      const jokeId = Number.parseInt(idRaw, 10);
      await enqueueScreen(chatId, messageId, () => handleVote(query, jokeId, kind));
      return;
    }

    if (action.startsWith('refresh:weather:')) {
      const cityId = action.slice('refresh:weather:'.length);
      await runScreen(chatId, messageId, action, () => screens.showWeatherCity(chatId, messageId, cityId, true), 'weather');
      return;
    }

    if (action === 'refresh:help:status') {
      await runScreen(
        chatId,
        messageId,
        action,
        () => screens.showHelpStatus(chatId, messageId, query.from?.id, chatId, true),
        'status'
      );
      return;
    }

    if (action.startsWith('help:')) {
      const section = action.slice('help:'.length);
      const userId = query.from?.id;

      if (section !== 'status' && section !== 'setup') {
        return;
      }

      const kind = section === 'status' ? 'status' : 'generic';
      await runScreen(
        chatId,
        messageId,
        action,
        () => (section === 'status'
          ? screens.showHelpStatus(chatId, messageId, userId, chatId, false)
          : screens.showHelpSetup(chatId, messageId, userId, chatId)),
        kind
      );
      return;
    }

    if (action.startsWith('weather:')) {
      const cityId = action.slice('weather:'.length);
      await runScreen(chatId, messageId, action, () => screens.showWeatherCity(chatId, messageId, cityId, false), 'weather');
      return;
    }

    if (action.startsWith('refresh:')) {
      const screen = action.slice('refresh:'.length);

      if (screen === 'top') {
        await runScreen(chatId, messageId, action, () => screens.showTop(chatId, messageId), 'top');
      } else {
        logger.warn('Unknown refresh screen:', screen);
      }
      return;
    }

    const handler = screenHandlers[action];
    if (!handler) {
      logger.warn('Unknown callback action:', action);
      return;
    }

    const userId = query.from?.id;
    const errorKind = action === 'schedule' ? 'schedule' : 'generic';
    await runScreen(chatId, messageId, action, () => handler(chatId, messageId, userId, chatId), errorKind);
  });
}

module.exports = { setupHandlers };
