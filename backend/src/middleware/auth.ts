import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { db } from '../lib/db';

declare global {
  namespace Express {
    interface Request {
      user: { id: string; email: string };
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // A 2FA challenge token is not a valid access credential — it may only be
  // exchanged at the 2FA verification endpoint.
  if (payload.twoFactorPending) {
    res.status(401).json({ error: 'Two-factor authentication not completed' });
    return;
  }

  const user = await db.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true },
  });

  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  req.user = user;
  next();
}
