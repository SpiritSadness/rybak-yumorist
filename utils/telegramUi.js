const logger = require('./logger');
const { withTimeout } = require('./withTimeout');

const TELEGRAM_SEND_MS = 6000;

const MAX_MESSAGE_LENGTH = 3900;

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtmlTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '');
}

function truncate(text, limit = 3500) {
  const safe = String(text || '');
  if (safe.length <= limit) return safe;
  return `${safe.slice(0, limit)}…`;
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🎣 Анекдот', callback_data: 'joke' },
        { text: '☀️ Погода', callback_data: 'weather' }
      ],
      [
        { text: '📅 Расписание', callback_data: 'schedule' },
        { text: '🔥 Топ шуток', callback_data: 'top' }
      ],
      [{ text: '🎮 Игры', callback_data: 'games' }],
      [
        { text: '❓ Помощь', callback_data: 'help' },
        { text: 'ℹ️ О боте', callback_data: 'about' }
      ]
    ]
  };
}

function subMenuKeyboard(extraRow = null) {
  const rows = [];
  if (extraRow) rows.push(extraRow);
  rows.push([{ text: '🏠 Меню', callback_data: 'menu' }]);
  return { inline_keyboard: rows };
}

function jokeKeyboard(joke) {
  if (!joke?.id) {
    return subMenuKeyboard([{ text: '🔄 Ещё анекдот', callback_data: 'joke' }]);
  }

  const id = joke.id;
  const likes = joke.likes || 0;
  const dislikes = joke.dislikes || 0;

  return {
    inline_keyboard: [
      [
        { text: `👍 ${likes}`, callback_data: `like:${id}` },
        { text: `👎 ${dislikes}`, callback_data: `dislike:${id}` }
      ],
      [{ text: '🔄 Ещё анекдот', callback_data: 'joke' }],
      [{ text: '🏠 Меню', callback_data: 'menu' }]
    ]
  };
}

function scheduledJokeKeyboard(joke) {
  if (!joke?.id) return null;
  return {
    inline_keyboard: [
      [
        { text: `👍 ${joke.likes || 0}`, callback_data: `like:${joke.id}` },
        { text: `👎 ${joke.dislikes || 0}`, callback_data: `dislike:${joke.id}` }
      ],
      [
        { text: '🎣 Ещё анекдот', callback_data: 'joke' },
        { text: '🎮 Игры', callback_data: 'games' }
      ]
    ]
  };
}

function weatherMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🏙️ Кострома', callback_data: 'weather:kostroma' },
        { text: '🏘️ Макарьев', callback_data: 'weather:makaryev' }
      ],
      [{ text: '🏠 Меню', callback_data: 'menu' }]
    ]
  };
}

function weatherCityKeyboard(activeCityId) {
  const cities = [
    { id: 'kostroma', label: '🏙️ Кострома' },
    { id: 'makaryev', label: '🏘️ Макарьев' }
  ];

  return {
    inline_keyboard: [
      cities.map((city) => ({
        text: city.id === activeCityId ? `✓ ${city.label}` : city.label,
        callback_data: `weather:${city.id}`
      })),
      [{ text: '🔄 Обновить', callback_data: `refresh:weather:${activeCityId}` }],
      [{ text: '🏠 Меню', callback_data: 'menu' }]
    ]
  };
}

function refreshKeyboard(action) {
  return subMenuKeyboard([{ text: '🔄 Обновить', callback_data: `refresh:${action}` }]);
}

function helpMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Статус', callback_data: 'help:status' },
        { text: '🔧 Инструкция', callback_data: 'help:setup' }
      ],
      [{ text: '🏠 Меню', callback_data: 'menu' }]
    ]
  };
}

function helpSectionKeyboard(activeSection) {
  const tabs = [
    { id: 'status', label: '📊 Статус' },
    { id: 'setup', label: '🔧 Инструкция' }
  ];

  const rows = [
    tabs.map((tab) => ({
      text: tab.id === activeSection ? `✓ ${tab.label}` : tab.label,
      callback_data: `help:${tab.id}`
    }))
  ];

  if (activeSection === 'status') {
    rows.push([{ text: '🔄 Обновить', callback_data: 'refresh:help:status' }]);
  }

  rows.push([{ text: '🏠 Меню', callback_data: 'menu' }]);
  return { inline_keyboard: rows };
}

function isNotModifiedError(error) {
  const msg = String(error?.message || error || '');
  return msg.includes('message is not modified');
}

function isEditUnavailableError(error) {
  const msg = String(error?.message || error || '');
  return /message to edit not found|message can't be edited|MESSAGE_ID_INVALID/i.test(msg);
}

function isCaptionMessageError(error) {
  const msg = String(error?.message || error || '');
  return /there is no text in the message to edit/i.test(msg);
}

async function renderScreen(bot, { chatId, messageId, text, keyboard }) {
  const body = truncate(text);

  if (messageId) {
    try {
      await withTimeout(
        bot.editMessageText(body, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: keyboard
        }),
        TELEGRAM_SEND_MS,
        'editMessageText'
      );
      return messageId;
    } catch (error) {
      if (isNotModifiedError(error)) return messageId;
      if (isCaptionMessageError(error) && typeof bot.editMessageCaption === 'function') {
        try {
          await withTimeout(
            bot.editMessageCaption(truncate(body, 1000), {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'HTML',
              reply_markup: keyboard
            }),
            TELEGRAM_SEND_MS,
            'editMessageCaption'
          );
          return messageId;
        } catch (captionError) {
          if (isNotModifiedError(captionError)) return messageId;
          loggerFallback(captionError);
        }
      }
      if (!isEditUnavailableError(error)) loggerFallback(error);
    }
  }

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const sent = await withTimeout(
        bot.sendMessage(chatId, body, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }),
        TELEGRAM_SEND_MS,
        'sendMessage'
      );
      return sent.message_id;
    } catch (error) {
      logger.warn(`sendMessage attempt ${attempt}/4:`, error?.message || error);
      if (attempt === 4) throw error;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return null;
}

function loggerFallback(error) {
  logger.warn('editMessageText fallback:', error?.message || error);
}

module.exports = {
  escapeHtml,
  stripHtmlTags,
  truncate,
  MAX_MESSAGE_LENGTH,
  mainMenuKeyboard,
  subMenuKeyboard,
  jokeKeyboard,
  scheduledJokeKeyboard,
  weatherMenuKeyboard,
  weatherCityKeyboard,
  refreshKeyboard,
  helpMenuKeyboard,
  helpSectionKeyboard,
  renderScreen,
  isNotModifiedError
};
