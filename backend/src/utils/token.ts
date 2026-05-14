import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateToken(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}
