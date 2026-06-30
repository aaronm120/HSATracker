import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const SECRET: string = process.env.JWT_SECRET;
const EXPIRY = '30d';

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, SECRET, { expiresIn: EXPIRY });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { userId: string };
    return payload;
  } catch {
    return null;
  }
}
