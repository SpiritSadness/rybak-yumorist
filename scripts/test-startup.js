require('dotenv').config();
const { connectBot, startPolling } = require('../bot/connect');
const { createContext } = require('../bot/context');
const { createScreens } = require('../bot/screens');
const { registerRuntimeHandlers } = require('../bot/runtime');
const { setupHandlers } = require('../handlers');

(async () => {
  const token = process.env.BOT_TOKEN;
  const ctx = createContext();
  const screens = createScreens(ctx);

  console.log('step1 connect');
  ctx.bot = await connectBot(token);
  console.log('step2 bot', Boolean(ctx.bot), typeof ctx.bot?.on);

  console.log('step3 handlers');
  setupHandlers(ctx, screens);

  console.log('step4 runtime');
  registerRuntimeHandlers(ctx);

  console.log('step5 polling');
  await startPolling(ctx.bot);

  console.log('done');
  setTimeout(() => process.exit(0), 2000);
})().catch((error) => {
  console.error('FAIL at', error.message);
  console.error(error.stack);
  process.exit(1);
});
