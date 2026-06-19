const logger = require('../utils/logger');
const ui = require('../utils/telegramUi');
const jokeRepo = require('../services/jokeRepo');
const jokeProgressService = require('../services/jokeProgressService');

function createVoteHandler(ctx, screens) {
  return async function handleVote(query, jokeId, voteType) {
    const userId = query.from?.id;
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;

    if (!userId || !chatId || !messageId || !jokeId) {
      await ctx.bot.answerCallbackQuery(query.id);
      return;
    }

    const joke = jokeRepo.getJokeById(jokeId);
    if (!joke) {
      await ctx.bot.answerCallbackQuery(query.id, { text: 'Анекдот не найден' });
      return;
    }

    try {
      const existing = jokeRepo.getUserVote(userId, jokeId);
      if (existing === voteType) {
        if (voteType === 'like') jokeRepo.removeLike(jokeId);
        else jokeRepo.removeDislike(jokeId);
        jokeRepo.removeUserVote(userId, jokeId);

        const updated = jokeRepo.getJokeById(jokeId);
        await ctx.bot.answerCallbackQuery(query.id, { text: 'Голос снят' });
        await screens.showJokeScreen(chatId, messageId, updated, jokeProgressService.peekProgress(chatId, messageId));
        return;
      }

      if (existing) {
        jokeRepo.changeVote(jokeId, existing, voteType);
        jokeRepo.markUserVoted(userId, jokeId, voteType);
      } else if (voteType === 'like') {
        jokeRepo.likeJoke(jokeId);
        jokeRepo.markUserVoted(userId, jokeId, 'like');
      } else {
        jokeRepo.dislikeJoke(jokeId);
        jokeRepo.markUserVoted(userId, jokeId, 'dislike');
      }

      const updated = jokeRepo.getJokeById(jokeId);
      await ctx.bot.answerCallbackQuery(query.id, {
        text: voteType === 'like' ? '👍 Спасибо!' : '👎 Учтено'
      });
      await screens.showJokeScreen(chatId, messageId, updated, jokeProgressService.peekProgress(chatId, messageId));
    } catch (error) {
      logger.error('Vote error:', error);
      await ctx.bot.answerCallbackQuery(query.id, { text: 'Ошибка голосования' });
      await ctx.showErrorScreen(chatId, messageId, 'vote', ui.jokeKeyboard(joke));
    }
  };
}

module.exports = { createVoteHandler };
