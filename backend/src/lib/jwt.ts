import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const SECRET: string = process.env.JWT_SECRET;
const EXPIRY = '30d';
const CHALLENGE_EXPIRY = '5m';

export interface TokenPayload {
  userId: string;
  twoFactorPending?: boolean;
}

// Full access token — grants API access.
export function generateToken(userId: string): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: EXPIRY });
}

// Short-lived token issued after a correct password when 2FA is still pending.
// It is NOT accepted by the auth middleware; it can only be exchanged at the
// 2FA verification endpoint for a full access token.
export function generateChallengeToken(userId: string): string {
  return jwt.sign({ userId, twoFactorPending: true }, SECRET, {
    expiresIn: CHALLENGE_EXPIRY,
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as TokenPayload;
  } catch {
    return null;
  }
}
