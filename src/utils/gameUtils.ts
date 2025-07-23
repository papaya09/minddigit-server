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

// Calculate hit count (correct digits in correct positions)
export const calculateHit = (secret: string, guess: string): number => {
  let hits = 0;
  
  for (let i = 0; i < 4; i++) {
    if (secret[i] === guess[i]) {
      hits++;
    }
  }
  
  return hits;
};

// Validate 4-digit number (no repeated digits)
export const isValidSecret = (secret: string): boolean => {
  if (secret.length !== 4) return false;
  if (!/^\d{4}$/.test(secret)) return false;
  
  const digits = new Set(secret);
  return digits.size === 4; // no repeated digits
};