const fs = require('fs');
const path = require('path');

const WELCOME_IMAGE = path.join(__dirname, '..', 'assets', 'welcome-banner.png');

function getWelcomeImagePath() {
  return fs.existsSync(WELCOME_IMAGE) ? WELCOME_IMAGE : null;
}

function createWelcomeImageStream() {
  const fullPath = getWelcomeImagePath();
  if (!fullPath) return null;
  return fs.createReadStream(fullPath);
}

module.exports = {
  WELCOME_IMAGE,
  getWelcomeImagePath,
  createWelcomeImageStream
};
