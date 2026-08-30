const { listGames } = require('../config/games');

const GAME_BUTTON_EMOJI = {
  fd: '🔍',
  tob: '🪝',
  tm: '🎣',
  fof: '🐠'
};

function gamesHubKeyboard() {
  const games = listGames();
  const rows = games.map((g) => ([
    { text: `${GAME_BUTTON_EMOJI[g.id] || '🎮'} ${g.short}`, callback_data: `gm:${g.id}` }
  ]));
  rows.push([{ text: '← Главное меню', callback_data: 'menu' }]);
  return { inline_keyboard: rows };
}

function optionLabel(text, max = 34) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function answerOptionsKeyboard(session, question) {
  const rows = [];

  if (session.gameId === 'tob') {
    rows.push([
      { text: 'Правда', callback_data: 'ga:0' },
      { text: 'Миф', callback_data: 'ga:1' }
    ]);
  } else if (session.gameId === 'fof') {
    rows.push([
      { text: 'Есть такая', callback_data: 'ga:0' },
      { text: 'Вымысел', callback_data: 'ga:1' }
    ]);
  } else {
    const opts = question.options || [];
    opts.forEach((opt, i) => {
      rows.push([{ text: optionLabel(opt, 38), callback_data: `ga:${i}` }]);
    });
  }

  rows.push([{ text: 'Выйти', callback_data: 'gq' }]);
  return { inline_keyboard: rows };
}

function fishDetectiveKeyboard(session, question) {
  const rows = [];
  const maxClues = question.clues?.length || 1;

  if (session.cluesRevealed < maxClues) {
    rows.push([{ text: '🔎 Ещё улика', callback_data: 'gcl' }]);
  }

  const opts = question.options || [];
  opts.forEach((opt, i) => {
    rows.push([{ text: optionLabel(opt, 38), callback_data: `ga:${i}` }]);
  });

  rows.push([{ text: 'Выйти', callback_data: 'gq' }]);
  return { inline_keyboard: rows };
}

function questionKeyboard(session, question) {
  if (session.gameId === 'fd') return fishDetectiveKeyboard(session, question);
  return answerOptionsKeyboard(session, question);
}

function resultKeyboard({ hasNext, isLast }) {
  const rows = [];
  if (hasNext) {
    rows.push([{ text: 'Дальше', callback_data: 'gn' }]);
  } else if (isLast) {
    rows.push([{ text: 'Итоги', callback_data: 'gn' }]);
  }
  rows.push([
    { text: '← Игры', callback_data: 'games' },
    { text: 'Меню', callback_data: 'menu' }
  ]);
  return { inline_keyboard: rows };
}

function roundEndKeyboard(gameId) {
  return {
    inline_keyboard: [
      [{ text: 'Играть снова', callback_data: `gm:${gameId}` }],
      [
        { text: '← Игры', callback_data: 'games' },
        { text: 'Меню', callback_data: 'menu' }
      ]
    ]
  };
}

module.exports = {
  gamesHubKeyboard,
  questionKeyboard,
  resultKeyboard,
  roundEndKeyboard
};
