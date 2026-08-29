const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.join(__dirname, '..', 'assets', 'schedule');

/** Legacy AI-generated slot images (fallback) */
const SLOT_IMAGES = {
  4: 'slot-4-early.png',
  7: 'slot-7-morning.png',
  9: 'slot-9-day.png',
  14: 'slot-14-lunch.png',
  18: 'slot-18-evening.png',
  23: 'slot-23-night.png'
};

const DEFAULT_HOUR = 9;

function getScheduleImagePath(hour) {
  const file = SLOT_IMAGES[hour] || SLOT_IMAGES[DEFAULT_HOUR];
  if (!file) return null;

  const fullPath = path.join(IMAGE_DIR, file);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

function createScheduleImageStream(hour) {
  const fullPath = getScheduleImagePath(hour);
  if (!fullPath) return null;
  return fs.createReadStream(fullPath);
}

module.exports = {
  IMAGE_DIR,
  SLOT_IMAGES,
  getScheduleImagePath,
  createScheduleImageStream
};
