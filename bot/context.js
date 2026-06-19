const moment = require('moment-timezone');
const ui = require('../utils/telegramUi');
const messages = require('../utils/botMessages');
const logger = require('../utils/logger');

function createContext() {
  const ctx = {
    bot: null,
    botUsername: 'fishingHumorousBot',
    lastJokeByChat: new Map(),
    screenMessageByChat: new Map(),
    lastWeatherCityByChat: new Map(),

    getMoscowNow() {
      return moment.tz('Europe/Moscow');
    },

    formatUpdatedAt() {
      return this.getMoscowNow().format('HH:mm');
    },

    async renderAndRemember(chatId, messageId, text, keyboard) {
      const id = await ui.renderScreen(this.bot, { chatId, messageId, text, keyboard });
      if (id) this.screenMessageByChat.set(chatId, id);
      return id;
    },

    async showErrorScreen(chatId, messageId, kind = 'generic', keyboard = null) {
      const title = messages.getErrorTitle(kind);
      const hint = messages.getErrorHint(kind);
      logger.warn('Error screen shown:', kind, `chat=${chatId}`);
      return this.renderAndRemember(
        chatId,
        messageId,
        messages.formatError(title, hint),
        keyboard || ui.subMenuKeyboard()
      );
    }
  };

  return ctx;
}

module.exports = { createContext };
