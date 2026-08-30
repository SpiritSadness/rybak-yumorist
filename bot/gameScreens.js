const gameMessages = require('../utils/gameMessages');
const gameUi = require('../utils/gameUi');
const gameService = require('../services/gameService');
const gameScoreService = require('../services/gameScoreService');
const { getGame } = require('../config/games');
const { getRankInfo } = require('../config/gameRanks');
const logger = require('../utils/logger');

function createGameScreens(ctx) {
  function flushSessionScore(chatId, userId, displayName) {
    const session = gameService.getSession(chatId, userId);
    if (!session || session.score <= 0) {
      if (session) gameService.clearSession(chatId, userId);
      return null;
    }

    const result = gameScoreService.recordPartialRound(
      userId,
      session.gameId,
      session.score,
      displayName
    );
    gameService.clearSession(chatId, userId);
    return result;
  }

  async function showGamesHub(chatId, messageId, userId, { displayName, flushSession = false } = {}) {
    let partialNotice = null;

    if (flushSession && userId) {
      const flushed = flushSessionScore(chatId, userId, displayName);
      if (flushed) {
        partialNotice = gameMessages.formatPartialSave({
          earned: flushed.after - flushed.before,
          before: flushed.before,
          after: flushed.after,
          rank: flushed.rank
        });
      }
    }

    const stats = userId ? gameScoreService.getUserStats(userId) : defaultStats();
    const rank = getRankInfo(stats.totalScore);
    const rankPosition = userId ? gameScoreService.getUserRankPosition(userId) : null;
    const leaderboard = gameScoreService.getLeaderboard(5);
    const activeSession = userId ? gameService.getSession(chatId, userId) : null;

    let text = gameMessages.formatGamesHub({
      stats,
      leaderboard,
      rank,
      rankPosition,
      activeSession
    });

    if (partialNotice) {
      text = `${partialNotice}\n\n${gameMessages.SEP || '────────────────'}\n\n${text}`;
    }

    return ctx.renderAndRemember(
      chatId,
      messageId,
      text,
      gameUi.gamesHubKeyboard()
    );
  }

  function defaultStats() {
    return { totalScore: 0, roundsPlayed: 0, bestStreak: 0, lastRoundScore: 0 };
  }

  async function showActiveQuestion(chatId, messageId, userId) {
    const session = gameService.getSession(chatId, userId);
    if (!session) {
      return showGamesHub(chatId, messageId, userId);
    }

    const q = gameService.currentQuestion(session);
    if (!q) {
      return showGamesHub(chatId, messageId, userId);
    }

    return ctx.renderAndRemember(
      chatId,
      messageId,
      gameMessages.formatQuestion(session),
      gameUi.questionKeyboard(session, q)
    );
  }

  async function startGame(chatId, messageId, userId, gameId, displayName) {
    flushSessionScore(chatId, userId, displayName);

    const session = gameService.startSession(chatId, userId, gameId);
    if (!session) {
      return ctx.showErrorScreen(chatId, messageId, 'generic', gameUi.gamesHubKeyboard());
    }
    return showActiveQuestion(chatId, messageId, userId);
  }

  async function showResult(chatId, messageId, userId) {
    const session = gameService.getSession(chatId, userId);
    if (!session?.lastResult) {
      return showGamesHub(chatId, messageId, userId);
    }

    const isLast = session.index >= session.questions.length - 1;
    const hasNext = !isLast;

    return ctx.renderAndRemember(
      chatId,
      messageId,
      gameMessages.formatResult(session, session.lastResult),
      gameUi.resultKeyboard({ hasNext, isLast })
    );
  }

  async function showRoundEnd(chatId, messageId, userId, summary, displayName) {
    const game = getGame(summary.gameId);
    const beforeStats = userId ? gameScoreService.getUserStats(userId) : defaultStats();
    const rankBefore = getRankInfo(beforeStats.totalScore);

    let recorded = null;
    if (userId && summary.score > 0) {
      recorded = gameScoreService.recordRound(userId, summary.gameId, {
        roundScore: summary.score,
        streak: summary.bestStreak,
        displayName
      });
    }

    const rank = recorded?.rank || getRankInfo(recorded?.after ?? beforeStats.totalScore);

    return ctx.renderAndRemember(
      chatId,
      messageId,
      gameMessages.formatRoundSummary(summary, game?.title || 'Игра', {
        before: recorded?.before ?? beforeStats.totalScore,
        after: recorded?.after ?? beforeStats.totalScore,
        rank,
        rankBefore
      }),
      gameUi.roundEndKeyboard(summary.gameId)
    );
  }

  async function revealClue(chatId, messageId, userId) {
    const session = gameService.getSession(chatId, userId);
    if (!session) return showGamesHub(chatId, messageId, userId);
    gameService.revealClue(session);
    return showActiveQuestion(chatId, messageId, userId);
  }

  async function readyAnswer(chatId, messageId, userId) {
    const session = gameService.getSession(chatId, userId);
    if (!session) return showGamesHub(chatId, messageId, userId);
    gameService.readyToAnswer(session);
    return showActiveQuestion(chatId, messageId, userId);
  }

  async function handleAnswer(chatId, messageId, userId, answerIndex) {
    const outcome = gameService.submitAnswer(chatId, userId, answerIndex);
    if (outcome.error) {
      const session = gameService.getSession(chatId, userId);
      if (session?.lastResult) return showResult(chatId, messageId, userId);
      return showGamesHub(chatId, messageId, userId);
    }

    return showResult(chatId, messageId, userId);
  }

  async function nextQuestion(chatId, messageId, userId, displayName) {
    const outcome = gameService.nextQuestion(chatId, userId);
    if (!outcome) return showGamesHub(chatId, messageId, userId);

    if (outcome.done) {
      return showRoundEnd(chatId, messageId, userId, outcome.summary, displayName);
    }

    return showActiveQuestion(chatId, messageId, userId);
  }

  async function quitGame(chatId, messageId, userId, displayName) {
    return showGamesHub(chatId, messageId, userId, { displayName, flushSession: true });
  }

  return {
    showGamesHub,
    showActiveQuestion,
    startGame,
    showResult,
    showRoundEnd,
    revealClue,
    readyAnswer,
    handleAnswer,
    nextQuestion,
    quitGame
  };
}

module.exports = { createGameScreens };
