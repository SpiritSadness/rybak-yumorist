const { version: BOT_VERSION } = require('../package.json');
const { escapeHtml, stripHtmlTags, truncate } = require('./telegramUi');

function formatWelcome({ inGroup = false } = {}) {
  const groupHint = inGroup
    ? ''
    : '\n\n👥 Добавьте бота в <b>свою группу</b> и нажмите /start там — рассылка включится автоматически.';

  return `🐟 <b>Рыбак Юморист</b> 🐟

🎣 Эх, здравствуйте, народ!

Я — ваш личный рыбацкий юморист! Забрасываю лучшие анекдоты про рыбалку прямо в чат!

🐟 Здесь только уловистые шутки
🎯 Проверено на реальных рыбаках
📖 Лучшие анекдоты в коллекции
🎮 Рыболовные викторины в разделе «Игры»
${groupHint}

<b>Что будем делать?</b>`;
}

function formatHelpMenu() {
  return `❓ <b>Помощь</b>

Выберите раздел:

📊 <b>Статус</b> — состояние ваших групп и рассылки
🔧 <b>Инструкция</b> — как подключить бота

<b>Команды:</b> /start · /help
Навигация — кнопками под сообщением.`;
}

function formatGroupStatusBlock(title, health) {
  const name = escapeHtml(title || 'Группа');
  let block = `━━ <b>${name}</b> ━━`;

  if (health?.lines?.length) {
    block += `\n\n${health.lines.join('\n')}`;
  } else {
    block += '\n\n⚠️ Не удалось получить статус';
  }

  return block;
}

function formatHelpStatus({
  access = false,
  health = null,
  groupReports = [],
  inGroup = false,
  updatedAt = null
} = {}) {
  let message = '📊 <b>Статус</b>\n';

  let body;

  if (inGroup && !access) {
    body = `\nℹ️ Статус этой группы доступен только её <b>участникам</b>.

Проверьте ❓ Помощь → 📊 Статус — там видны все ваши группы с ботом.`;
  } else if (inGroup && access && health) {
    const title = health.group?.title || 'Эта группа';
    body = `\n${formatGroupStatusBlock(title, health)}`;
  } else if (groupReports.length) {
    body = `\n\nВаши группы, где подключён бот:\n\n`;
    body += groupReports.map((item) => formatGroupStatusBlock(item.title, item.health)).join('\n\n');
  } else {
    body = `\n\nℹ️ Пока нет подключённых групп, где вы участник.

Добавьте бота в свою группу — инструкция в разделе <b>🔧 Инструкция</b>.`;
  }

  message += body;
  return appendUpdatedAt(message, updatedAt);
}

function formatHelpSetup({
  botUsername = 'fishingHumorousBot',
  inGroup = false
} = {}) {
  const connectedHint = inGroup
    ? '\n\n✅ <b>Эта группа уже подключена</b> — проверьте детали в разделе 📊 Статус.'
    : '';

  return `🔧 <b>Инструкция</b>

<b>Как подключить бота к своей группе</b>

1️⃣ Найдите @${escapeHtml(botUsername)} в Telegram
2️⃣ Добавьте бота в <b>свою</b> группу
3️⃣ Сделайте бота <b>администратором</b>
   (или разрешите отправку сообщений)
4️⃣ В группе нажмите /start
5️⃣ Откройте ❓ Помощь → 📊 Статус и убедитесь, что всё 🟢

<b>Расписание анекдотов</b> (МСК):
04:00 · 07:00 · 09:00 · 14:00 · 18:00 · 23:00

ℹ️ Статус виден только участникам группы — чужие группы не показываются.${connectedHint}`;
}

function formatAbout() {
  return `ℹ️ <b>О боте</b>

<b>Рыбак Юморист</b> · v${BOT_VERSION}

Рыбацкие анекдоты, погода и рассылка в группы.

<b>Технически</b>
• Платформа: Node.js ${process.versions.node}
• Анекдоты: anekdot.ru (тег «рыбалка»), обновление базы раз в 7 дней
• Рассылка в группы (МСК): 04:00 · 07:00 · 09:00 · 14:00 · 18:00 · 23:00
• Команды: /start — меню, /help — инструкция
• Голоса и прогресс анекдотов хранятся локально на сервере бота`;
}

function formatSchedule(groupStatus, { access = false, inGroup = false } = {}) {
  let groupLine;
  if (!inGroup) {
    groupLine = 'ℹ️ Статус ваших групп — ❓ Помощь → 📊 Статус';
  } else if (!access) {
    groupLine = 'ℹ️ Статус — только для участников этой группы (❓ Помощь)';
  } else {
    groupLine = groupStatus?.line || '⚠️ Бот не может отправлять сообщения в эту группу';
  }

  return `📅 <b>Расписание анекдотов</b>

Бот отправляет анекдоты в <b>эту</b> группу (МСК):

🐟 04:00 — Ранний улов
🌅 07:00 — Утренний клёв
☀️ 09:00 — Доброе утро
🍽 14:00 — Обеденный улов
🌆 18:00 — Вечерний клёв
🌙 23:00 — Ночная рыбалка

${groupLine}`;
}

function formatWeatherMenu() {
  return `☀️ <b>Погода</b>

Выберите город:

🏙️ <b>Кострома</b> · р. Волга
🏘️ <b>Макарьев</b> · р. Унжа

Данные обновляются при открытии и по кнопке 🔄`;
}

function formatCityWeather(weather, updatedAt = null) {
  if (!weather) {
    return appendUpdatedAt(
      '☀️ <b>Погода</b>\n\n😕 Не удалось загрузить данные.\n\nПроверь интернет и нажми 🔄 Обновить.',
      updatedAt
    );
  }

  const precip = weather.precipitationProbability > 0
    ? `🌧️ Вероятность осадков: ${weather.precipitationProbability}%`
    : '☀️ Осадков не ожидается';

  let body = `${weather.cityEmoji} <b>Погода: ${escapeHtml(weather.cityName)}</b>

${weather.weatherDescription}
📅 ${escapeHtml(weather.fetchedAt)} (МСК)

🌡️ <b>${weather.temperature}°C</b> (ощущается ${weather.feelsLike}°C)
${weather.comfort}

💧 Влажность: ${weather.humidity}%
🌬️ Ветер: ${weather.windDirection}, ${weather.windSpeed} м/с (${escapeHtml(weather.windStrengthDesc)})
📊 Давление: ${weather.pressure} мм рт.ст. (${escapeHtml(weather.pressureDesc)})
☁️ Облачность: ${escapeHtml(weather.cloudDesc)}
👁 Видимость: ${weather.visibility} км
🔆 UV-индекс: ${weather.uvIndex ?? '—'} (${escapeHtml(weather.uvDesc)})
${precip}`;

  if (weather.hourly?.length) {
    body += '\n\n<b>Ближайшие часы:</b>\n';
    weather.hourly.forEach((hour) => {
      const prob = hour.precipitationProb ?? 0;
      body += `${hour.time} — ${hour.temperature}°C, ${hour.weatherDesc}, ${hour.windDirection} ${hour.windSpeed} м/с, 🌧 ${prob}%\n`;
    });
  }

  return appendUpdatedAt(body.trim(), updatedAt);
}

function formatJoke(joke, { remaining = null, total = null } = {}) {
  if (!joke?.text) {
    return '🎣 <b>Анекдот</b>\n\n😕 Шутки закончились.\n\nПопробуй позже или нажми 🏠 Меню.';
  }

  const likes = joke.likes || 0;
  const dislikes = joke.dislikes || 0;
  let votesLine = `\n\n👍 ${likes}  ·  👎 ${dislikes}`;

  if (remaining != null && total != null) {
    votesLine += `  ·  🆕 ${remaining}`;
  }

  return `🎣 <b>Анекдот</b>\n\n${escapeHtml(truncate(stripHtmlTags(joke.text), 3100))}${votesLine}`;
}

function formatVoteLine(joke) {
  return `👍 ${joke?.likes || 0}  ·  👎 ${joke?.dislikes || 0}`;
}

function formatRemainingTime(remainingMs) {
  if (!remainingMs || remainingMs <= 0) return 'скоро сменится';

  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function resolveJokeOfDay(input) {
  if (!input) return { joke: null, remainingMs: null };
  if (input.joke?.text) {
    return { joke: input.joke, remainingMs: input.remainingMs ?? null };
  }
  if (input.text) {
    return { joke: input, remainingMs: input.remainingMs ?? null };
  }
  return { joke: null, remainingMs: null };
}

function formatTopJokes(jokeOfDayInput, topJokes, updatedAt = null) {
  let message = '🔥 <b>Топ шуток</b>\n\n';

  const { joke: jokeOfDay, remainingMs } = resolveJokeOfDay(jokeOfDayInput);
  if (jokeOfDay?.text) {
    message += `⭐ <b>Анекдот дня</b>\n`;
    if (remainingMs != null) {
      message += `⏳ Осталось: <b>${formatRemainingTime(remainingMs)}</b>\n\n`;
    } else {
      message += '\n';
    }
    message += `${escapeHtml(truncate(stripHtmlTags(jokeOfDay.text), 520))}\n\n`;
  }

  const list = (topJokes || []).filter(j => j?.text);

  if (!list.length) {
    const jodVotes = (jokeOfDay?.likes || 0) + (jokeOfDay?.dislikes || 0);
    if (jodVotes > 0) {
      message += '📊 Других шуток в рейтинге пока нет.\n\nЖми 🎣 Анекдот и голосуй — топ заполнится!';
    } else {
      message += '📊 Пока никто не голосовал.\n\nЖми 🎣 Анекдот и ставь 👍 или 👎 — топ заполнится сам!';
    }
    return appendUpdatedAt(message, updatedAt);
  }

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  message += '<b>Рейтинг по голосам:</b>\n\n';

  list.forEach((j, i) => {
    const score = (j.likes || 0) - (j.dislikes || 0);
    const scoreLabel = score > 0 ? `+${score}` : String(score);
    message += `${medals[i] || '•'} ${formatVoteLine(j)} (${scoreLabel})\n`;
    message += `${escapeHtml(truncate(stripHtmlTags(j.text), 280))}\n\n`;
  });

  return appendUpdatedAt(message.trim(), updatedAt);
}

function appendUpdatedAt(message, updatedAt) {
  if (!updatedAt) return message;
  return `${message}\n\n<i>🕐 Данные на ${escapeHtml(updatedAt)} (МСК)</i>`;
}

function formatLoading(title) {
  return `⏳ <b>${escapeHtml(title)}</b>\n\nСекунду…`;
}

function formatError(title, hint = null) {
  const text = hint || getErrorHint('generic');
  return `😕 <b>${escapeHtml(title)}</b>\n\n${text}`;
}

const ERROR_HINTS = {
  generic: 'Попробуй ещё раз или нажми 🏠 Меню.',
  weather: 'Сервис погоды временно недоступен.\nПроверь интернет и нажми 🔄 Обновить.',
  status: 'Не удалось загрузить статус групп.\nНажми 🔄 Обновить или вернись в 🏠 Меню.',
  schedule: 'Не удалось проверить расписание.\nПопробуй позже или нажми 🏠 Меню.',
  top: 'Не удалось загрузить топ анекдотов.\nПопробуй 🔄 Обновить.',
  vote: 'Голос не сохранился. Попробуй ещё раз.',
  network: 'Проблема с сетью или Telegram.\nПодожди минуту и попробуй снова.'
};

function getErrorHint(kind) {
  return ERROR_HINTS[kind] || ERROR_HINTS.generic;
}

function getErrorTitle(kind) {
  const titles = {
    weather: 'Погода недоступна',
    status: 'Статус недоступен',
    schedule: 'Расписание недоступно',
    top: 'Топ недоступен',
    vote: 'Ошибка голосования',
    network: 'Сбой соединения',
    generic: 'Что-то пошло не так'
  };
  return titles[kind] || titles.generic;
}

module.exports = {
  formatWelcome,
  formatHelpMenu,
  formatHelpStatus,
  formatHelpSetup,
  formatAbout,
  formatSchedule,
  formatWeatherMenu,
  formatCityWeather,
  formatJoke,
  formatTopJokes,
  formatError,
  formatLoading,
  getErrorHint,
  getErrorTitle
};
