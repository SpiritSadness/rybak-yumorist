const { Readable } = require('stream');
const sharp = require('sharp');
const scheduleConfig = require('../config/schedule');
const logger = require('../utils/logger');

const DEFAULT_HOUR = 9;
const WIDTH = 800;
const HEIGHT = 450;
const USE_PHOTOS = process.env.SCHEDULE_USE_PHOTOS !== 'false';
const USE_GENERATED = process.env.SCHEDULE_USE_GENERATED !== 'false';

const imageCache = new Map();

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Убрать emoji из подписи — в картинке только текст */
function stripEmoji(text) {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTheme(hour) {
  return scheduleConfig.slotThemes[hour] || scheduleConfig.slotThemes[DEFAULT_HOUR];
}

function blendHex(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

function buildGradientStops(from, to) {
  return `
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="35%" stop-color="${blendHex(from, 0.12)}"/>
      <stop offset="65%" stop-color="${blendHex(to, 0.08)}"/>
      <stop offset="100%" stop-color="${to}"/>
  `;
}

/** Векторные иконки вместо emoji — без артефактов шрифта */
function buildSlotIcon(hour) {
  const cx = 400;
  const cy = 155;
  const fill = 'rgba(255,255,255,0.92)';
  const stroke = 'rgba(255,255,255,0.55)';
  const sw = 2;

  switch (hour) {
    case 4:
      return `
        <circle cx="${cx}" cy="${cy}" r="38" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
        <path d="M ${cx + 28} ${cy - 8} A 38 38 0 0 0 ${cx - 20} ${cy - 28}" fill="${fill}"/>
      `;
    case 7:
      return `
        <path d="M ${cx - 50} ${cy + 20} Q ${cx} ${cy - 45} ${cx + 50} ${cy + 20} Z" fill="${fill}" opacity="0.9"/>
        <line x1="${cx}" y1="${cy - 55}" x2="${cx}" y2="${cy - 75}" stroke="${fill}" stroke-width="3" stroke-linecap="round"/>
        <line x1="${cx - 18}" y1="${cy - 48}" x2="${cx - 28}" y2="${cy - 62}" stroke="${fill}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="${cx + 18}" y1="${cy - 48}" x2="${cx + 28}" y2="${cy - 62}" stroke="${fill}" stroke-width="2.5" stroke-linecap="round"/>
      `;
    case 9:
      return `
        <circle cx="${cx}" cy="${cy}" r="32" fill="${fill}"/>
        <g stroke="${fill}" stroke-width="2.5" stroke-linecap="round">
          <line x1="${cx}" y1="${cy - 48}" x2="${cx}" y2="${cy - 62}"/>
          <line x1="${cx}" y1="${cy + 48}" x2="${cx}" y2="${cy + 62}"/>
          <line x1="${cx - 48}" y1="${cy}" x2="${cx - 62}" y2="${cy}"/>
          <line x1="${cx + 48}" y1="${cy}" x2="${cx + 62}" y2="${cy}"/>
          <line x1="${cx - 34}" y1="${cy - 34}" x2="${cx - 44}" y2="${cy - 44}"/>
          <line x1="${cx + 34}" y1="${cy - 34}" x2="${cx + 44}" y2="${cy - 44}"/>
          <line x1="${cx - 34}" y1="${cy + 34}" x2="${cx - 44}" y2="${cy + 44}"/>
          <line x1="${cx + 34}" y1="${cy + 34}" x2="${cx + 44}" y2="${cy + 44}"/>
        </g>
      `;
    case 14:
      return `
        <ellipse cx="${cx}" cy="${cy + 8}" rx="42" ry="14" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
        <circle cx="${cx}" cy="${cy - 4}" r="28" fill="none" stroke="${fill}" stroke-width="3"/>
        <circle cx="${cx}" cy="${cy - 4}" r="18" fill="${fill}" opacity="0.25"/>
      `;
    case 18:
      return `
        <rect x="${cx - 70}" y="${cy + 18}" width="140" height="4" rx="2" fill="${fill}" opacity="0.5"/>
        <path d="M ${cx - 45} ${cy + 18} L ${cx - 30} ${cy - 25} L ${cx + 30} ${cy - 25} L ${cx + 45} ${cy + 18} Z" fill="${fill}" opacity="0.35"/>
        <circle cx="${cx}" cy="${cy - 8}" r="26" fill="${fill}"/>
      `;
    case 23:
      return `
        <circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
        <path d="M ${cx + 22} ${cy - 6} A 30 30 0 0 0 ${cx - 16} ${cy - 22}" fill="${fill}"/>
        <circle cx="${cx - 38}" cy="${cy - 35}" r="2.5" fill="${fill}" opacity="0.8"/>
        <circle cx="${cx + 42}" cy="${cy - 28}" r="2" fill="${fill}" opacity="0.7"/>
        <circle cx="${cx + 28}" cy="${cy - 48}" r="1.5" fill="${fill}" opacity="0.6"/>
      `;
    default:
      return `<circle cx="${cx}" cy="${cy}" r="28" fill="${fill}" opacity="0.5"/>`;
  }
}

function buildSlotSvg(hour) {
  const theme = getTheme(hour);
  const label = stripEmoji(scheduleConfig.labels[hour] || 'Анекdот по расписанию');
  const timeLabel = `${String(hour).padStart(2, '0')}:00 MSK`;

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      ${buildGradientStops(theme.from, theme.to)}
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <circle cx="680" cy="90" r="120" fill="rgba(255,255,255,0.06)"/>
  <circle cx="120" cy="380" r="80" fill="rgba(255,255,255,0.04)"/>
  <g>${buildSlotIcon(hour)}</g>
  <text x="400" y="248" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"
        font-size="36" font-weight="bold" text-anchor="middle" fill="#ffffff">${escapeXml(label)}</text>
  <text x="400" y="298" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"
        font-size="22" text-anchor="middle" fill="rgba(255,255,255,0.88)">${escapeXml(timeLabel)}</text>
  <text x="400" y="378" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"
        font-size="17" text-anchor="middle" fill="rgba(255,255,255,0.5)">Рыбак Юморист</text>
</svg>`;
}

async function renderSlotImage(hour) {
  const svg = buildSlotSvg(hour);
  const buffer = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  imageCache.set(hour, buffer);
  return buffer;
}

function bufferToStream(buffer) {
  return Readable.from(buffer);
}

function createScheduleImageStream(hour) {
  if (!USE_PHOTOS) return null;

  if (!USE_GENERATED) {
    return require('./scheduleImageServiceLegacy').createScheduleImageStream(hour);
  }

  const cached = imageCache.get(hour);
  if (cached) return bufferToStream(Buffer.from(cached));

  return null;
}

async function preloadImages() {
  if (!USE_PHOTOS || !USE_GENERATED) return;

  imageCache.clear();
  for (const hour of scheduleConfig.hours) {
    try {
      await renderSlotImage(hour);
    } catch (error) {
      logger.warn('Schedule image preload failed:', hour, error.message);
    }
  }
  logger.info('Schedule slot images preloaded:', scheduleConfig.hours.join(', '));
}

async function ensureImageStream(hour) {
  if (!USE_PHOTOS) return null;

  if (USE_GENERATED) {
    try {
      const buffer = await renderSlotImage(hour);
      return bufferToStream(buffer);
    } catch (error) {
      logger.warn('Generated schedule image failed:', hour, error.message);
      return require('./scheduleImageServiceLegacy').createScheduleImageStream(hour);
    }
  }

  return require('./scheduleImageServiceLegacy').createScheduleImageStream(hour);
}

module.exports = {
  USE_PHOTOS,
  USE_GENERATED,
  createScheduleImageStream,
  ensureImageStream,
  preloadImages,
  renderSlotImage
};
