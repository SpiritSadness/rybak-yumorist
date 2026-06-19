const logger = require('../utils/logger');
const ui = require('../utils/telegramUi');
const jokeRepo = require('../services/jokeRepo');
const groupRegistry = require('../services/groupRegistry');
const schedulerService = require('../services/schedulerService');
const scheduleConfig = require('../config/schedule');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createScheduler(ctx) {
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
        await ctx.bot.sendMessage(group.chatId, `🎯 <b>${label}</b>\n\n${ui.escapeHtml(joke.text)}`, {
          parse_mode: 'HTML'
        });
        sentAny = true;
        logger.info('Scheduled joke sent:', group.title || group.chatId, label);
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
