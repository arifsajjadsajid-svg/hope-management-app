import crypto from 'node:crypto';

/**
 * Token helpers shared by the web application and the command-line seed.
 * Kept free of `server-only` so scripts run outside Next.js can use them.
 */

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Short, human-readable verification code printed on report cards, roll number
 * slips and certificates, e.g. "RC-K7M3P-Q9XTB". Ambiguous characters
 * (0/O, 1/I) are excluded so codes can be typed from a printed page.
 */
export function verificationCode(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let body = '';
  for (let i = 0; i < 10; i++) body += alphabet[bytes[i]! % alphabet.length];
  return `${prefix}-${body.slice(0, 5)}-${body.slice(5)}`;
}

/** Normalises a code typed by a member of the public before lookup. */
export function normaliseCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}
