// Generate unique 4-digit room code
export const generateRoomCode = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Generate random 4-digit secret (no repeated digits)
export const generateSecret = (): string => {
  const digits = '0123456789';
  let result = '';
  const used = new Set<string>();
  
  while (result.length < 4) {
    const digit = digits[Math.floor(Math.random() * digits.length)];
    if (!used.has(digit)) {
      used.add(digit);
      result += digit;
    }
  }
  
  return result;
};

// Calculate Bulls and Cows (main game mechanic)
export const calculateBullsAndCows = (secret: string, guess: string): { bulls: number; cows: number } => {
  let bulls = 0;
  let cows = 0;
  
  // Convert to arrays for easier manipulation
  const secretDigits = secret.split('');
  const guessDigits = guess.split('');
  
  // Mark used positions to avoid double counting
  const secretUsed = new Array(secret.length).fill(false);
  const guessUsed = new Array(guess.length).fill(false);
  
  // First pass: count bulls (exact matches)
  for (let i = 0; i < secretDigits.length; i++) {
    if (secretDigits[i] === guessDigits[i]) {
      bulls++;
      secretUsed[i] = true;
      guessUsed[i] = true;
    }
  }
  
  // Second pass: count cows (correct digits in wrong positions)
  for (let i = 0; i < guessDigits.length; i++) {
    if (!guessUsed[i]) {
      for (let j = 0; j < secretDigits.length; j++) {
        if (!secretUsed[j] && guessDigits[i] === secretDigits[j]) {
          cows++;
          secretUsed[j] = true;
          break;
        }
      }
    }
  }
  
  return { bulls, cows };
};

// Calculate hit count (correct digits in correct positions) - alias for bulls
export const calculateHit = (secret: string, guess: string): number => {
  return calculateBullsAndCows(secret, guess).bulls;
};

// Alias for consistency with new API
export const calculateHits = calculateHit;

// Validate secret number (no repeated digits)
export const isValidSecret = (secret: string): boolean => {
  if (secret.length !== 4) return false;
  if (!/^\d{4}$/.test(secret)) return false;
  
  const digits = new Set(secret);
  return digits.size === 4; // no repeated digits
};

// Validate guess format
export const isValidGuess = (guess: string, digits: number = 4): boolean => {
  if (guess.length !== digits) return false;
  if (!/^\d+$/.test(guess)) return false;
  
  const digitSet = new Set(guess);
  return digitSet.size === digits; // no repeated digits
};