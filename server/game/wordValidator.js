import ANSWERS from '../data/answers.js';
import VALID_GUESSES from '../data/validGuesses.js';

// Create a Set combining both lists for fast lookup
const ALL_VALID_WORDS = new Set([
  ...ANSWERS.map(w => w.toLowerCase()),
  ...VALID_GUESSES.map(w => w.toLowerCase())
]);

const ANSWER_SET = new Set(ANSWERS.map(w => w.toLowerCase()));

/**
 * Check if a word is a valid 5-letter guess
 */
export function isValidGuess(word) {
  if (!word || typeof word !== 'string') return false;
  const normalized = word.toLowerCase().trim();
  if (normalized.length !== 5) return false;
  if (!/^[a-z]{5}$/.test(normalized)) return false;
  return ALL_VALID_WORDS.has(normalized);
}

/**
 * Check if a word is in the answer pool (for word selection validation)
 */
export function isValidAnswer(word) {
  if (!word || typeof word !== 'string') return false;
  const normalized = word.toLowerCase().trim();
  return ANSWER_SET.has(normalized);
}

/**
 * Evaluate a guess against the answer using proper Wordle algorithm.
 * Handles duplicate letters correctly.
 * 
 * Returns an array of 5 objects: { letter, status }
 * status: 'correct' (🟩), 'present' (🟨), or 'absent' (⬛)
 * 
 * Algorithm:
 * 1. First pass: mark all exact matches as 'correct'
 * 2. Second pass: for remaining letters, check if they exist in
 *    unmatched positions of the answer (handles duplicates properly)
 */
export function evaluateGuess(guess, answer) {
  const g = guess.toLowerCase().split('');
  const a = answer.toLowerCase().split('');
  
  const result = new Array(5).fill(null).map((_, i) => ({
    letter: g[i],
    status: 'absent'
  }));

  // Track which answer positions have been "used"
  const answerUsed = [false, false, false, false, false];
  const guessUsed = [false, false, false, false, false];

  // First pass: find exact matches (correct / green)
  for (let i = 0; i < 5; i++) {
    if (g[i] === a[i]) {
      result[i].status = 'correct';
      answerUsed[i] = true;
      guessUsed[i] = true;
    }
  }

  // Second pass: find present letters (yellow)
  for (let i = 0; i < 5; i++) {
    if (guessUsed[i]) continue; // already matched as correct

    for (let j = 0; j < 5; j++) {
      if (answerUsed[j]) continue; // this answer position already used

      if (g[i] === a[j]) {
        result[i].status = 'present';
        answerUsed[j] = true;
        break;
      }
    }
  }

  return result;
}

/**
 * Check if a guess result indicates a win (all correct)
 */
export function isWinningGuess(result) {
  return result.every(tile => tile.status === 'correct');
}
