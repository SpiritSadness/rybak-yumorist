const { getGame, listGames } = require('../config/games');

const sessions = new Map();

const CLUE_POINTS = [10, 8, 6, 4];
const BASE_POINTS = 10;
const STREAK_BONUS = 2;

function sessionKey(chatId, userId) {
  return `${chatId}:${userId}`;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickQuestions(gameId) {
  const game = getGame(gameId);
  if (!game) return [];
  const count = Math.min(game.questionsPerRound, game.questions.length);
  return shuffle(game.questions).slice(0, count);
}

function startSession(chatId, userId, gameId) {
  const game = getGame(gameId);
  if (!game) return null;

  const questions = pickQuestions(gameId);
  const session = {
    gameId,
    questions,
    index: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    cluesRevealed: gameId === 'fd' ? 1 : 0,
    phase: 'question',
    awaitingAnswer: true,
    lastResult: null,
    startedAt: Date.now()
  };

  sessions.set(sessionKey(chatId, userId), session);
  return session;
}

function getSession(chatId, userId) {
  return sessions.get(sessionKey(chatId, userId)) || null;
}

function clearSession(chatId, userId) {
  sessions.delete(sessionKey(chatId, userId));
}

function currentQuestion(session) {
  return session?.questions?.[session.index] || null;
}

function isRoundComplete(session) {
  return session && session.index >= session.questions.length;
}

function revealClue(session) {
  if (!session || session.gameId !== 'fd') return session;
  const q = currentQuestion(session);
  if (!q) return session;
  const max = q.clues?.length || 1;
  session.cluesRevealed = Math.min(max, session.cluesRevealed + 1);
  if (session.cluesRevealed >= max) {
    session.awaitingAnswer = true;
  }
  return session;
}

function readyToAnswer(session) {
  if (!session) return session;
  session.awaitingAnswer = true;
  return session;
}

function computePoints(session, correct) {
  if (!correct) return 0;
  if (session.gameId === 'fd') {
    const idx = Math.max(0, Math.min(CLUE_POINTS.length - 1, session.cluesRevealed - 1));
    return CLUE_POINTS[idx];
  }
  return BASE_POINTS;
}

function submitAnswer(chatId, userId, answerIndex) {
  const session = getSession(chatId, userId);
  if (!session || session.phase === 'result' || !session.awaitingAnswer) {
    return { error: 'no_session' };
  }

  const q = currentQuestion(session);
  if (!q) return { error: 'no_question' };

  let correct = false;

  if (session.gameId === 'fd') {
    correct = q.options[answerIndex] === q.answer;
  } else if (session.gameId === 'tob') {
    correct = (answerIndex === 0) === q.answer;
  } else if (session.gameId === 'tm') {
    correct = answerIndex === q.correct;
  } else if (session.gameId === 'fof') {
    const pickedReal = answerIndex === 0;
    correct = pickedReal === q.real;
  }

  const points = computePoints(session, correct);
  let earned = 0;

  if (correct) {
    session.streak += 1;
    session.bestStreak = Math.max(session.bestStreak, session.streak);
    const bonus = Math.max(0, session.streak - 1) * STREAK_BONUS;
    earned = points + bonus;
    session.score += earned;
  } else {
    session.streak = 0;
  }

  session.phase = 'result';
  session.lastResult = {
    correct,
    points: earned,
    streak: session.streak,
    question: q,
    answerIndex
  };

  return { session, result: session.lastResult };
}

function nextQuestion(chatId, userId) {
  const session = getSession(chatId, userId);
  if (!session) return null;

  session.index += 1;
  session.phase = 'question';
  session.cluesRevealed = session.gameId === 'fd' ? 1 : 0;
  session.awaitingAnswer = true;
  session.lastResult = null;

  if (isRoundComplete(session)) {
    const summary = {
      gameId: session.gameId,
      score: session.score,
      bestStreak: session.bestStreak,
      total: session.questions.length
    };
    clearSession(chatId, userId);
    return { done: true, summary };
  }

  return { done: false, session };
}

function getGamesCatalog() {
  return listGames();
}

module.exports = {
  startSession,
  getSession,
  clearSession,
  currentQuestion,
  isRoundComplete,
  revealClue,
  readyToAnswer,
  submitAnswer,
  nextQuestion,
  getGamesCatalog,
  CLUE_POINTS,
  BASE_POINTS
};
