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

export function getORPIndex(word) {
  const len = word.length;
  if (len <= 1) return 0;
  if (len <= 3) return 1;
  if (len <= 5) return 2;
  if (len <= 9) return 3;
  return 4;
}

export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function detectChapters(words) {
  const chapters = [];
  const STANDALONE = /^(prologue|epilogue|preface|afterword|introduction|conclusion)$/i;
  const NUMBERED = /^(chapter|part|section|book|act|volume)$/i;
  const ROMAN = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/i;
  const WORD_NUMS = new Set([
    'one','two','three','four','five','six','seven','eight','nine','ten',
    'eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen',
    'eighteen','nineteen','twenty','thirty','forty','fifty','sixty',
    'seventy','eighty','ninety','hundred',
  ]);

  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const clean = raw.replace(/[^a-zA-Z]/g, '');
    if (!clean || !/^[A-Z]/.test(raw)) continue;

    if (STANDALONE.test(clean)) {
      chapters.push({ wordIndex: i, label: clean });
      continue;
    }

    if (NUMBERED.test(clean)) {
      const nextRaw = words[i + 1] || '';
      const nextClean = nextRaw.replace(/[^a-zA-Z0-9]/g, '');
      const isNum = /^\d+$/.test(nextClean);
      const isRoman = nextClean.length > 0 && ROMAN.test(nextClean);
      const isWordNum = WORD_NUMS.has(nextClean.toLowerCase());
      if (isNum || isRoman || isWordNum) {
        chapters.push({ wordIndex: i, label: `${clean} ${nextClean}` });
        i++;
      }
    }
  }

  return chapters;
}

export const SAMPLE_TEXT = `Welcome to FlashRead, your RSVP speed reading app. Upload a PDF to get started, or use this sample text to try it out. Speed reading works by presenting one word at a time, which eliminates subvocalization and reduces eye movement, allowing you to read much faster than traditional reading. The optimal recognition point, highlighted in red, helps your brain anchor each word quickly. Research shows that with practice, readers can comfortably reach four hundred to six hundred words per minute without losing comprehension. Try adjusting the speed slider to find your comfortable pace. You can pause at any time by pressing the space bar, or skip forward and backward using the arrow keys. Words followed by punctuation like periods, exclamation marks, and question marks get a longer pause to help your brain process sentence endings. The previous and next words shown above and below give you context so you never feel lost. Happy reading and enjoy the experience of watching your reading speed improve over time.`;
