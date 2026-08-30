/**
 * Каталог мини-игр
 */

const fishDetective = require('./fishDetective');
const truthOrBait = require('./truthOrBait');
const tackleMaster = require('./tackleMaster');
const fishOrFiction = require('./fishOrFiction');

const GAMES = {
  fd: {
    id: 'fd',
    title: '🔍 Детектив улова',
    short: 'Детектив улова',
    hint: 'Угадай рыбу по уликам. Меньше подсказок — больше очков.',
    questionsPerRound: 5,
    questions: fishDetective
  },
  tob: {
    id: 'tob',
    title: '🪝 Правда или наживка',
    short: 'Правда / наживка',
    hint: 'Факт о рыбалке или распространённый миф.',
    questionsPerRound: 5,
    questions: truthOrBait
  },
  tm: {
    id: 'tm',
    title: '🎣 Мастер снастей',
    short: 'Мастер снастей',
    hint: 'Ситуация на водоёме — выбери верное решение.',
    questionsPerRound: 5,
    questions: tackleMaster
  },
  fof: {
    id: 'fof',
    title: '🐠 Рыба или вымысел',
    short: 'Рыба / вымысел',
    hint: 'Настоящее название рыбы или выдумка.',
    questionsPerRound: 5,
    questions: fishOrFiction
  }
};

function getGame(gameId) {
  return GAMES[gameId] || null;
}

function listGames() {
  return Object.values(GAMES);
}

module.exports = { GAMES, getGame, listGames };
