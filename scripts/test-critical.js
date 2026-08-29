#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function testSerializedPolling() {
  const { createResilientPoller } = require('../bot/resilientPolling');
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  let seenTimeout = null;

  const bot = {
    async getUpdates(options) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      calls += 1;
      seenTimeout = options.timeout;
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return calls === 1 ? [{ update_id: 10 }] : [];
    },
    processUpdate(update) {
      assert.strictEqual(update.update_id, 10);
    }
  };

  const poller = createResilientPoller(bot, { pollTimeoutSec: 5 });
  await poller.start();
  await new Promise((resolve) => setTimeout(resolve, 55));
  await poller.stop();

  assert.strictEqual(maxActive, 1, 'getUpdates requests must never overlap');
  assert.strictEqual(seenTimeout, 5, 'poller must use long-polling');
  assert.strictEqual(poller.isRunning(), false);
}

async function testAtomicVotesAndCallbacks() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rybak-critical-'));
  process.env.BOT_DATA_DIR = tempDir;
  process.env.BOT_DB_PATH = path.join(tempDir, 'test.db');

  const database = require('../services/database');
  database.upsertJokes([{
    id: 1,
    text: 'Тестовый анекдот',
    source: 'test',
    contentType: 'joke',
    textHash: 'critical-test-joke',
    sentCount: 0,
    lastSentAt: null,
    likes: 0,
    dislikes: 0
  }]);

  let joke = database.applyUserVote(100, 1, null, 'like');
  assert.deepStrictEqual([joke.likes, joke.dislikes], [1, 0]);

  joke = database.applyUserVote(100, 1, 'like', 'dislike');
  assert.deepStrictEqual([joke.likes, joke.dislikes], [0, 1]);

  joke = database.applyUserVote(100, 1, 'dislike', null);
  assert.deepStrictEqual([joke.likes, joke.dislikes], [0, 0]);
  assert.strictEqual(database.loadUserVotesMap().size, 0);

  const listeners = new Map();
  let callbackAnswers = 0;
  let activeScreens = 0;
  let maxActiveScreens = 0;
  const bot = {
    on(event, listener) {
      listeners.set(event, listener);
    },
    onText() {},
    async answerCallbackQuery() {
      callbackAnswers += 1;
    }
  };
  const ctx = {
    bot,
    async showErrorScreen() {
      throw new Error('Unexpected error screen');
    }
  };
  const screens = {
    async showJokeScreen() {},
    async showMenu() {
      activeScreens += 1;
      maxActiveScreens = Math.max(maxActiveScreens, activeScreens);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeScreens -= 1;
    },
    async showJoke() {},
    async showWeatherMenu() {},
    async showSchedule() {},
    async showTop() {},
    async showHelpMenu() {},
    async showAbout() {},
    async showWeatherCity() {},
    async showHelpStatus() {},
    async showHelpSetup() {}
  };

  const { setupHandlers } = require('../handlers');
  setupHandlers(ctx, screens);
  const callback = listeners.get('callback_query');
  assert(callback, 'callback_query handler must be registered');

  await callback({
    id: 'vote-1',
    data: 'like:1',
    from: { id: 100 },
    message: { message_id: 5, chat: { id: -100 } }
  });
  assert.strictEqual(callbackAnswers, 1, 'a callback query must be answered exactly once');
  assert.strictEqual(database.getJokeById(1).likes, 1);

  await Promise.all([
    callback({ id: 'menu-1', data: 'menu', message: { message_id: 5, chat: { id: -100 } } }),
    callback({ id: 'menu-2', data: 'menu', message: { message_id: 5, chat: { id: -100 } } })
  ]);
  assert.strictEqual(maxActiveScreens, 1, 'screen edits for one message must be serialized');

  database.checkpoint();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function testRuntimeModulesLoad() {
  assert.doesNotThrow(() => require('../bot/startup'));
  assert.doesNotThrow(() => require('../services/scheduleImageService'));
  assert.doesNotThrow(() => require('../services/scheduleImageServiceLegacy'));
}

(async () => {
  await testSerializedPolling();
  await testAtomicVotesAndCallbacks();
  testRuntimeModulesLoad();
  console.log('test-critical: OK');
})().catch((error) => {
  console.error('test-critical: FAIL', error);
  process.exit(1);
});
