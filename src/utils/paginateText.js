export const WORDS_PER_PAGE = 280;

export function paginateWords(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { pageTexts: [], pageWordCounts: [] };

  const pageTexts = [];
  const pageWordCounts = [];
  for (let i = 0; i < words.length; i += WORDS_PER_PAGE) {
    const slice = words.slice(i, i + WORDS_PER_PAGE);
    pageTexts.push(slice.join(' '));
    pageWordCounts.push(slice.length);
  }
  return { pageTexts, pageWordCounts };
}
