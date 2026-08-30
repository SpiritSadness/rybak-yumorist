const messages = require('../utils/botMessages');
const ui = require('../utils/telegramUi');
const logger = require('../utils/logger');
const jokeRepo = require('../services/jokeRepo');
const jokeProgressService = require('../services/jokeProgressService');
const weatherService = require('../services/weatherService');
const groupService = require('../services/groupService');
const groupRegistry = require('../services/groupRegistry');
const welcomeImageService = require('../services/welcomeImageService');
const scheduleConfig = require('../config/schedule');
const { withTimeout } = require('../utils/withTimeout');

function createScreens(ctx) {
  async function prepareGroupContext(queryChatId, userId) {
    const targetGroupId = groupRegistry.resolveTargetGroupId(queryChatId);
    const inGroup = Boolean(targetGroupId);

    if (targetGroupId) {
      await groupRegistry.ensureRegistered(ctx.bot, targetGroupId, userId);
    }

    const access = targetGroupId && userId
      ? await groupService.canAccessPrivateInfo(ctx.bot, userId, queryChatId, targetGroupId)
      : false;

    return { targetGroupId, inGroup, access };
  }

  async function showMenu(chatId, messageId = null, { forceNew = false } = {}) {
    const inGroup = groupRegistry.isGroupChatId(chatId);
    if (inGroup) {
      groupRegistry.ensureRegistered(ctx.bot, chatId).catch(() => {});
    }

    const editId = forceNew ? null : (messageId ?? ctx.screenMessageByChat.get(chatId));
    const text = messages.formatWelcome({ inGroup });
    const keyboard = ui.mainMenuKeyboard();

    if (!editId) {
      const image = welcomeImageService.createWelcomeImageStream();
      if (image) {
        try {
          const sent = await withTimeout(
            ctx.bot.sendPhoto(chatId, image, {
              caption: text,
              parse_mode: 'HTML',
              reply_markup: keyboard
            }),
            8000,
            'sendPhoto welcome'
          );
          if (sent?.message_id) ctx.screenMessageByChat.set(chatId, sent.message_id);
          return sent?.message_id || null;
        } catch (error) {
          logger.warn('Welcome image fallback:', error.message);
        }
      }
    }

    return ctx.renderAndRemember(
      chatId,
      editId,
      text,
      keyboard
    );
  }

  async function showJokeScreen(chatId, messageId, joke, progress = null) {
    if (joke?.id) ctx.lastJokeByChat.set(chatId, joke.id);
    const view = progress?.remaining != null
      ? { remaining: progress.remaining, total: progress.total }
      : jokeProgressService.peekProgress(chatId, messageId);

    return ctx.renderAndRemember(
      chatId,
      messageId,
      messages.formatJoke(joke, view),
      ui.jokeKeyboard(joke)
    );
  }

  async function showJoke(chatId, messageId) {
    const result = jokeProgressService.getNextJokeForScreen(chatId, messageId);
    return showJokeScreen(chatId, messageId, result.joke, result);
  }

  async function showWeatherMenu(chatId, messageId) {
    return ctx.renderAndRemember(
      chatId,
      messageId,
      messages.formatWeatherMenu(),
      ui.weatherMenuKeyboard()
    );
  }

  async function showWeatherCity(chatId, messageId, cityId = 'kostroma', forceRefresh = false) {
    const city = weatherService.getCity(cityId);
    ctx.lastWeatherCityByChat.set(chatId, city.id);

    if (forceRefresh) weatherService.clearWeatherCache(city.id);
    const cachedWeather = forceRefresh ? null : weatherService.getCachedWeather(city.id);

    if (!cachedWeather) {
      await ctx.renderAndRemember(
        chatId,
        messageId,
        messages.formatLoading(`Погода: ${city.name}`),
        ui.weatherCityKeyboard(city.id)
      );
    }

    try {
      const weather = cachedWeather || await weatherService.getWeather(city.id, { forceRefresh });
      return ctx.renderAndRemember(
        chatId,
        messageId || ctx.screenMessageByChat.get(chatId),
        messages.formatCityWeather(weather, ctx.formatUpdatedAt()),
        ui.weatherCityKeyboard(city.id)
      );
    } catch (error) {
      logger.error(`Weather error (${city.id}):`, error);
      return ctx.showErrorScreen(
        chatId,
        messageId || ctx.screenMessageByChat.get(chatId),
        'weather',
        ui.weatherCityKeyboard(city.id)
      );
    }
  }

  async function showTop(chatId, messageId) {
    try {
      const jokeOfDayMeta = jokeRepo.getJokeOfDayMeta()
        || { joke: jokeRepo.getJokeOfTheDay(), remainingMs: null };
      const topJokes = jokeRepo.getTopJokesByLikes(5, jokeOfDayMeta?.joke?.id || null);
      return ctx.renderAndRemember(
        chatId,
        messageId,
        messages.formatTopJokes(jokeOfDayMeta, topJokes, ctx.formatUpdatedAt()),
        ui.refreshKeyboard('top')
      );
    } catch (error) {
      logger.error('Top jokes error:', error);
      return ctx.showErrorScreen(chatId, messageId, 'top', ui.refreshKeyboard('top'));
    }
  }

  async function showSchedule(chatId, messageId, userId, queryChatId) {
    try {
      const groupCtx = await prepareGroupContext(queryChatId, userId);
      const groupStatus = groupCtx.access && groupCtx.targetGroupId
        ? await groupService.verifyGroup(ctx.bot, groupCtx.targetGroupId)
        : null;

      return ctx.renderAndRemember(
        chatId,
        messageId,
        messages.formatSchedule(groupStatus, { access: groupCtx.access, inGroup: groupCtx.inGroup }),
        ui.subMenuKeyboard()
      );
    } catch (error) {
      logger.error('Schedule error:', error);
      return ctx.showErrorScreen(chatId, messageId, 'schedule');
    }
  }

  async function showHelpMenu(chatId, messageId) {
    return ctx.renderAndRemember(
      chatId,
      messageId,
      messages.formatHelpMenu(),
      ui.helpMenuKeyboard()
    );
  }

  async function showHelpStatus(chatId, messageId, userId, queryChatId, forceRefresh = false) {
    if (forceRefresh) groupService.clearGroupCache();

    try {
      const groupCtx = await prepareGroupContext(queryChatId, userId);
      const healthOpts = {
        jokeCount: jokeRepo.getCount(),
        scheduleHours: scheduleConfig.hours
      };

      let health = null;
      let groupReports = [];

      if (groupCtx.inGroup && groupCtx.access && groupCtx.targetGroupId) {
        health = await groupService.getHealthReport(ctx.bot, groupCtx.targetGroupId, healthOpts);
      } else if (!groupCtx.inGroup && userId) {
        groupReports = await groupService.getUserGroupHealthReports(ctx.bot, userId, healthOpts);
      }

      return ctx.renderAndRemember(
        chatId,
        messageId,
        messages.formatHelpStatus({
          access: groupCtx.access,
          health,
          groupReports,
          inGroup: groupCtx.inGroup,
          updatedAt: ctx.formatUpdatedAt()
        }),
        ui.helpSectionKeyboard('status')
      );
    } catch (error) {
      logger.error('Help status error:', error);
      return ctx.showErrorScreen(chatId, messageId, 'status', ui.helpSectionKeyboard('status'));
    }
  }

  async function showHelpSetup(chatId, messageId, userId, queryChatId) {
    const groupCtx = await prepareGroupContext(queryChatId, userId);

    return ctx.renderAndRemember(
      chatId,
      messageId,
      messages.formatHelpSetup({
        botUsername: ctx.botUsername,
        inGroup: groupCtx.inGroup
      }),
      ui.helpSectionKeyboard('setup')
    );
  }

  async function showAbout(chatId, messageId) {
    return ctx.renderAndRemember(
      chatId,
      messageId,
      messages.formatAbout(),
      ui.subMenuKeyboard()
    );
  }

  return {
    showMenu,
    showJoke,
    showJokeScreen,
    showWeatherMenu,
    showWeatherCity,
    showTop,
    showSchedule,
    showHelpMenu,
    showHelpStatus,
    showHelpSetup,
    showAbout
  };
}

module.exports = { createScreens };
