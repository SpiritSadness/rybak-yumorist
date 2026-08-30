const logger = require('../utils/logger');
const ui = require('../utils/telegramUi');
const jokeRepo = require('../services/jokeRepo');
const groupRegistry = require('../services/groupRegistry');
const schedulerService = require('../services/schedulerService');
const scheduleImageService = require('../services/scheduleImageService');
const scheduleConfig = require('../config/schedule');

const CAPTION_MAX = 1024;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createScheduler(ctx) {
  async function sendScheduledPost(chatId, hour, label, joke) {
    const header = `🎯 <b>${ui.escapeHtml(label)}</b>\n\n`;
    const body = ui.truncate(ui.stripHtmlTags(joke.text), CAPTION_MAX - header.length - 1);
    const caption = `${header}${ui.escapeHtml(body)}`;
    const keyboard = ui.scheduledJokeKeyboard(joke);
    const image = await scheduleImageService.ensureImageStream(hour);

    if (image) {
      await ctx.bot.sendPhoto(chatId, image, {
        caption,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      return 'photo';
    }

    await ctx.bot.sendMessage(chatId, caption, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return 'text';
  }

  async function sendScheduledJokes(slot) {
    const groups = groupRegistry.getActiveGroups();
    if (!groups.length) {
      logger.warn('Scheduled send: no active groups');
      return false;
    }

    const slotHour = Number(String(slot || '').split('-').pop());
    const hour = Number.isFinite(slotHour) ? slotHour : schedulerService.getMoscowNow().hour();
    const label = scheduleConfig.labels[hour] || 'Анекдот по расписанию';
    const joke = jokeRepo.getRandomJoke();
    if (!joke) {
      logger.warn('Scheduled send: no jokes in pool');
      return false;
    }

    let sentAny = false;
    const delayMs = scheduleConfig.groupSendDelayMs || 1500;

    for (let i = 0; i < groups.length; i += 1) {
      const group = groups[i];
      if (i > 0 && delayMs > 0) {
        await sleep(delayMs);
      }

      try {
        const kind = await sendScheduledPost(group.chatId, hour, label, joke);
        sentAny = true;
        logger.info('Scheduled joke sent:', group.title || group.chatId, label, kind);
      } catch (error) {
        logger.error('Scheduled joke failed:', group.chatId, error.message);
        if (/chat not found|bot was kicked|Forbidden/i.test(error.message || '')) {
          groupRegistry.deactivateGroup(group.chatId);
        }
      }
    }

    if (sentAny) await jokeRepo.markSent(joke.id);
    return sentAny;
  }

  function startScheduler() {
    schedulerService.startScheduler(sendScheduledJokes);
  }

  return { sendScheduledJokes, startScheduler };
}

module.exports = { createScheduler };
