const BOT_COMMANDS = [
  { command: 'start', description: 'Главное меню' },
  { command: 'help', description: 'Инструкция по подключению' }
];

const COMMAND_SCOPES = [
  { type: 'default' },
  { type: 'all_private_chats' },
  { type: 'all_group_chats' },
  { type: 'all_chat_administrators' }
];

// BotFather часто задаёт команды с language_code=ru — без этого старый список остаётся в подсказках.
const LANGUAGE_CODES = [null, 'ru', 'en'];

function buildOptions(scope, languageCode) {
  const options = { scope };
  if (languageCode) options.language_code = languageCode;
  return options;
}

async function syncBotCommands(bot, log = () => {}) {
  for (const languageCode of LANGUAGE_CODES) {
    const options = buildOptions({ type: 'default' }, languageCode);
    const label = `default${languageCode ? ` (${languageCode})` : ''}`;

    try {
      await bot.setMyCommands(BOT_COMMANDS, options);
      log('info', `Commands set [${label}]`);
    } catch (error) {
      log('warn', `setMyCommands [${label}]:`, error.message);
    }
  }
}

async function listBotCommands(bot) {
  const result = [];

  for (const scope of COMMAND_SCOPES) {
    for (const languageCode of LANGUAGE_CODES) {
      const options = buildOptions(scope, languageCode);
      try {
        const commands = await bot.getMyCommands(options);
        if (commands?.length) {
          result.push({
            scope: scope.type,
            language: languageCode || '(default)',
            commands: commands.map((c) => `/${c.command} — ${c.description}`)
          });
        }
      } catch {
        // scope/language may be empty
      }
    }
  }

  return result;
}

module.exports = {
  BOT_COMMANDS,
  syncBotCommands,
  listBotCommands
};
