export function tokenizeText(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0);
}

// Returns a delay multiplier based on trailing punctuation
export function getDelayMultiplier(word) {
  const stripped = word.replace(/["""''']/g, '');
  if (/[.!?]$/.test(stripped)) return 1.8;
  if (/[,;:]$/.test(stripped)) return 1.2;
  return 1;
}

// ORP: ~30% into the word, minimum index 0
export function getORPIndex(word) {
  if (word.length <= 1) return 0;
  return Math.max(0, Math.floor(word.length * 0.3) - 1);
}

export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const SAMPLE_TEXT = `Welcome to FlashRead, your RSVP speed reading app. Upload a PDF to get started, or use this sample text to try it out. Speed reading works by presenting one word at a time, which eliminates subvocalization and reduces eye movement, allowing you to read much faster than traditional reading. The optimal recognition point, highlighted in red, helps your brain anchor each word quickly. Research shows that with practice, readers can comfortably reach four hundred to six hundred words per minute without losing comprehension. Try adjusting the speed slider to find your comfortable pace. You can pause at any time by pressing the space bar, or skip forward and backward using the arrow keys. Words followed by punctuation like periods, exclamation marks, and question marks get a longer pause to help your brain process sentence endings. The previous and next words shown above and below give you context so you never feel lost. Happy reading and enjoy the experience of watching your reading speed improve over time.`;
