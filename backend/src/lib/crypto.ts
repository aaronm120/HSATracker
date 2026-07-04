import crypto from 'crypto';

// 32-byte key for AES-256. Prefer a dedicated ENCRYPTION_KEY; fall back to
// JWT_SECRET (already required) so the app never fails to start for lack of a
// second secret. Note: if the derived key changes, existing 2FA secrets can no
// longer be decrypted and affected users must re-enroll — an acceptable tradeoff
// since 2FA secrets are recoverable by re-enrollment.
function deriveKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET environment variable is required');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

const KEY = deriveKey();
const VERSION = 'v1';

// AES-256-GCM encrypt → "v1:<iv>:<tag>:<ciphertext>" (all base64).
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(':');
  // Not our versioned format → treat as legacy plaintext (defensive).
  if (parts.length !== 4 || parts[0] !== VERSION) {
    return stored;
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

// --- Recovery codes ---

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

// Recovery codes are high-entropy random values, so a fast one-way hash (SHA-256)
// is sufficient — brute-forcing a random 40-bit code is infeasible.
export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars = 40 bits
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    plain.push(formatted);
    hashed.push(hashRecoveryCode(formatted));
  }
  return { plain, hashed };
}
