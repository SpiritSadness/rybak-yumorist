const logger = require('../utils/logger');
const groupRegistry = require('../services/groupRegistry');
const { createVoteHandler } = require('./votes');

const SLOW_ACTIONS = new Set([
  'weather:kostroma',
  'weather:makaryev',
  'refresh:weather:kostroma',
  'refresh:weather:makaryev',
  'help:status',
  'refresh:help:status'
]);

function setupHandlers(ctx, screens) {
  const handleVote = createVoteHandler(ctx, screens);

  const screenHandlers = {
    menu: (chatId, messageId) => screens.showMenu(chatId, messageId),
    joke: (chatId, messageId) => screens.showJoke(chatId, messageId),
    weather: (chatId, messageId) => screens.showWeatherMenu(chatId, messageId),
    schedule: (chatId, messageId, userId, queryChatId) => screens.showSchedule(chatId, messageId, userId, queryChatId),
    top: (chatId, messageId) => screens.showTop(chatId, messageId),
    help: (chatId, messageId) => screens.showHelpMenu(chatId, messageId),
    about: (chatId, messageId) => screens.showAbout(chatId, messageId)
  };

  async function runScreen(chatId, messageId, action, fn, errorKind = 'generic') {
    try {
      await fn();
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
    try {
      await screens.showMenu(msg.chat.id, null, { forceNew: true });
    } catch (error) {
      logger.error('/start error:', error);
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

    if (!chatId || !messageId) {
      await ctx.bot.answerCallbackQuery(query.id);
      return;
    }

    if (action.startsWith('like:') || action.startsWith('dislike:')) {
      const [kind, idRaw] = action.split(':');
      const jokeId = Number.parseInt(idRaw, 10);
      await handleVote(query, jokeId, kind);
      return;
    }

    if (action.startsWith('refresh:weather:')) {
      const cityId = action.slice('refresh:weather:'.length);
      await ctx.bot.answerCallbackQuery(query.id, { text: '🔄 Обновляю…' });
      await runScreen(chatId, messageId, action, () => screens.showWeatherCity(chatId, messageId, cityId, true), 'weather');
      return;
    }

    if (action === 'refresh:help:status') {
      await ctx.bot.answerCallbackQuery(query.id, { text: '🔄 Обновляю…' });
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
        await ctx.bot.answerCallbackQuery(query.id, { text: 'Неизвестный раздел' });
        return;
      }

      await ctx.bot.answerCallbackQuery(query.id, SLOW_ACTIONS.has(action)
        ? { text: '⏳ Загружаю…' }
        : undefined);

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
      await ctx.bot.answerCallbackQuery(query.id, SLOW_ACTIONS.has(action)
        ? { text: '⏳ Загружаю…' }
        : undefined);
      await runScreen(chatId, messageId, action, () => screens.showWeatherCity(chatId, messageId, cityId, false), 'weather');
      return;
    }

    if (action.startsWith('refresh:')) {
      const screen = action.slice('refresh:'.length);
      await ctx.bot.answerCallbackQuery(query.id, { text: '🔄 Обновляю…' });

      if (screen === 'top') {
        await runScreen(chatId, messageId, action, () => screens.showTop(chatId, messageId), 'top');
      } else {
        logger.warn('Unknown refresh screen:', screen);
      }
      return;
    }

    const handler = screenHandlers[action];
    if (!handler) {
      await ctx.bot.answerCallbackQuery(query.id, { text: 'Неизвестная кнопка' });
      return;
    }

    const userId = query.from?.id;

    await ctx.bot.answerCallbackQuery(query.id, SLOW_ACTIONS.has(action)
      ? { text: '⏳ Загружаю…' }
      : undefined);

    const errorKind = action === 'schedule' ? 'schedule' : 'generic';
    await runScreen(chatId, messageId, action, () => handler(chatId, messageId, userId, chatId), errorKind);
  });
}

module.exports = { setupHandlers };
