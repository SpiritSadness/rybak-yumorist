function decodeBasicHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8211;/gi, '–')
    .replace(/&#8212;/gi, '—')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–');
}

function stripHtmlTags(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ');
}

// Хвост с рейтингом/автором с anekdot.ru и похожих сайтов.
function stripTrailingMetadata(text) {
  let t = String(text || '').trim();
  if (!t) return t;

  t = t.replace(/[★☆]{2,}.*$/u, '').replace(/[★☆]+$/u, '').trim();

  const authorTail = String.raw`\d{1,2}[🔥⭐★]*[A-Za-zА-Яа-яёЁ][A-Za-zА-Яа-яёЁ0-9_\-.]*(?:\s+[A-ZА-ЯЁ][a-zа-яё\-]+)*(?:[★☆]+)?`;

  // "...молча.5Юрий Татаркин", "...водки!10🔥Антиклептократ"
  t = t.replace(new RegExp(String.raw`([.!?…])(\s*${authorTail})$`, 'u'), '$1');

  // "...предstоит.Юрий Татаркин" — автор без рейтинга
  t = t.replace(/([.!?…])([A-ZА-ЯЁ][a-zа-яё]+(?:\s+[A-ZА-ЯЁ][a-zа-яё]+)+)$/u, '$1');

  // На всякий случай — рейтинг+ник без точки перед цифрой
  t = t.replace(new RegExp(String.raw`${authorTail}$`, 'u'), '');

  return t.trim();
}

function cleanJokeText(text) {
  return stripTrailingMetadata(
    decodeBasicHtmlEntities(stripHtmlTags(text))
      .replace(/([.!?…])([A-ZА-ЯЁ])/gu, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

module.exports = {
  decodeBasicHtmlEntities,
  stripHtmlTags,
  stripTrailingMetadata,
  cleanJokeText
};
