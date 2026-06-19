const { cleanJokeText } = require('../utils/jokeText');

const MIN_LEN = 25;
const MAX_LEN = 480;

const FISHING_KEYWORDS = [
  'рыбак', 'рыба', 'рыбалк', 'рыбач', 'рыболов', 'рыбный', 'рыбёш', 'рыбеш',
  'удочк', 'удил', 'снасть', 'клёв', 'клев', 'улов', 'берег', 'садок', 'нажив',
  'черв', 'мотыл', 'опарыш', 'мормыш', 'спиннинг', 'катуш', 'щук', 'лещ', 'карась',
  'окун', 'судак', 'налим', 'форел', 'карп', 'сазан', 'воблер', 'блесн', 'твистер',
  'поплавок', 'крючок', 'леск', 'прикорм', 'фидер', 'жерех', 'сом', 'заброс',
  'подсеч', 'выважив', 'трофей', 'водоём', 'водоем', 'озер', 'речк', 'река', 'пруд',
  'затон', 'запруд', 'лёд', 'лед', 'лунк', 'подлед', 'наст', 'сеть', 'сачок', 'эхолот',
  'прикормк', 'флюор', 'донк', 'закидуш', 'нахлыст', 'мушк', 'жерлиц', 'клещ',
  'рыбхоз', 'рыбинспек', 'рыбнадзор', 'сиг', 'хариус', 'таймен', 'осётр', 'осетр',
  'плотва', 'голавл', 'язь', 'линь', 'ёрш', 'ерш', 'бычок', 'миног', 'унаж', 'уха',
  'рыбацк', 'клевать', 'клюёт', 'клюет', 'клюнул', 'поймал', 'поймать', 'ловит', 'ловить'
];

const ADJACENT_KEYWORDS = [
  'водк', 'пиво', 'берег', 'тих', 'тишин', 'поплав', 'чебак', 'молч', 'озеро',
  'река', 'лодк', 'моторк', 'костёр', 'костер', 'кемп', 'палатк', 'комар', 'мошк',
  'рассвет', 'закат', 'туман', 'дожд', 'мороз', 'зима', 'лето', 'весн', 'осен'
];

const BANNED_SUBSTRINGS = [
  '18+', 'цензур', 'реклама', 'adfox', 'cookie', 'cookies', 'window.', 'document.',
  'javascript', 'create(', 'push(', 'yacontext', 'subscribe', 'регистрация', 'настройки',
  'политика конфиденциальности', 'инстаграм', 'телеграм', 'vk.com', 'youtube.com',
  'yandex.ru/maps', 'maps.yandex', 'http://', 'https://', 'www.', '.ru/', '.com/',
  'знаете другие анекдоты', 'присылайте!', 'жанры:', 'анекдоты про рыбалку и рыбаков',
  'смешные анекдоты и истории', 'скопировано', 'читать дальше', 'полезный совет',
  'полезные мелочи', 'рецепт приготовлен', 'инструкция', 'руководство', 'магазин',
  'купить', 'скидка', 'доставка', 'навигатор пронзительно', 'вы прибыли к месту'
];

const ARTICLE_PATTERNS = [
  /^(полезн|совет|инструк|рекоменд|статья|описание|метод|способ|рецепт)/i,
  /^[A-ZА-ЯЁ\s]{10,}[a-zа-яё]/u,
  /^(ловля|сезонность|пресноводн|законность|отлов|травм)/i
];

const OBFSCENE_WORDS = [
  'хуй', 'пизд', 'ебан', 'ёбан', 'ебать', 'ёбать', 'бля', 'блять', 'блядь',
  'сука', 'гондон', 'мудак', 'пидор', 'педик'
];

function normalizeForMatch(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ');
}

function countKeywordHits(text, keywords) {
  const t = normalizeForMatch(text);
  return keywords.filter((k) => t.includes(k)).length;
}

function hasFishingTheme(text) {
  return countKeywordHits(text, FISHING_KEYWORDS) > 0;
}

function hasAdjacentTheme(text) {
  return countKeywordHits(text, FISHING_KEYWORDS) >= 1
    || (countKeywordHits(text, ADJACENT_KEYWORDS) >= 2 && /[.!?…—–-]/.test(text));
}

function hasDialogue(text) {
  return /(^|[\s])[-—–]/.test(text) || /[-—–]\s*[А-ЯA-ZЁ]/.test(text);
}

function hasHumorShape(text) {
  const t = String(text || '').trim();
  if (hasDialogue(t)) return true;
  if (/[.!?…]["»)]?\s*$/.test(t) && t.length >= 40) return true;
  if (/\?\s*[-—–]/.test(t)) return true;
  return false;
}

function isBadJokeText(text) {
  const t = normalizeForMatch(text);
  if (!t) return true;
  if (BANNED_SUBSTRINGS.some((s) => t.includes(s))) return true;
  if (/window\.ya|adfox|create\(|push\(|\/\*|\bfunction\b|=>/.test(t)) return true;
  if (OBFSCENE_WORDS.some((w) => t.includes(w))) return true;
  if (ARTICLE_PATTERNS.some((re) => re.test(String(text || '').trim()))) return true;
  if (/^[«"']?[A-ZА-ЯЁ\s\d:,.!-]{20,}[a-zа-яё]/u.test(String(text || '').trim())) return true;
  return false;
}

function validateJoke(rawText) {
  const text = cleanJokeText(rawText);
  const reasons = [];

  if (!text) reasons.push('empty');
  if (text.length < MIN_LEN) reasons.push('too_short');
  if (text.length > MAX_LEN) reasons.push('too_long');
  if (!/[А-Яа-яёЁ]/.test(text)) reasons.push('no_cyrillic');

  const qCount = (text.match(/\?/g) || []).length;
  if (qCount >= 5 || qCount / Math.max(text.length, 1) > 0.15) reasons.push('corrupt');

  if (isBadJokeText(text)) reasons.push('banned');
  if (!hasHumorShape(text)) reasons.push('not_joke_shape');

  const fishing = hasFishingTheme(text);
  const adjacent = hasAdjacentTheme(text);
  if (!fishing && !adjacent) reasons.push('not_fishing');

  if (!fishing && adjacent && !hasDialogue(text)) reasons.push('weak_theme');

  return {
    ok: reasons.length === 0,
    text,
    reasons
  };
}

function isFishingText(text) {
  return validateJoke(text).ok || (hasFishingTheme(cleanJokeText(text)) && !isBadJokeText(cleanJokeText(text)));
}

function isValidStoredJoke(joke) {
  return Boolean(joke?.text) && validateJoke(joke.text).ok;
}

module.exports = {
  MIN_LEN,
  MAX_LEN,
  validateJoke,
  isBadJokeText,
  isFishingText,
  isValidStoredJoke,
  hasFishingTheme,
  cleanJokeText
};
