require('dotenv').config();
const { connectBot } = require('../bot/connect');
const { createContext } = require('../bot/context');
const { createScreens } = require('../bot/screens');
const { setupHandlers } = require('../handlers');

(async () => {
  const ctx = createContext();
  const screens = createScreens(ctx);
  ctx.bot = await connectBot(process.env.BOT_TOKEN);
  console.log('bot assigned', Boolean(ctx.bot), typeof ctx.bot?.on);
  setupHandlers(ctx, screens);
  console.log('handlers ok');
})().catch((error) => {
  console.error('FAIL', error.message, error.stack);
  process.exit(1);
});
