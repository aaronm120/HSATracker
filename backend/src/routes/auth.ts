import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../lib/db';
import { generateToken, generateChallengeToken, verifyToken } from '../lib/jwt';
import { authenticate } from '../middleware/auth';
import { generateSecret, buildOtpAuthUrl, buildQrDataUrl, verifyCode } from '../lib/totp';
import {
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '../lib/crypto';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be 72 characters or fewer'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

type PublicUserInput = {
  id: string;
  email: string;
  twoFactorEnabled: boolean;
  twoFactorRecoveryCodes: string[];
};

function publicUser(u: PublicUserInput) {
  return {
    id: u.id,
    email: u.email,
    twoFactorEnabled: u.twoFactorEnabled,
    twoFactorRecoveryCodesRemaining: u.twoFactorRecoveryCodes.length,
  };
}

router.post('/register', async (req, res) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'Email already registered' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await db.user.create({
      data: { email, password: hashedPassword },
    });

    await db.familyMember.create({
      data: { userId: user.id, name: 'Self', sortOrder: 0 },
    });

    const token = generateToken(user.id);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Password is correct. If 2FA is on, don't hand out a real token yet —
    // return a short-lived challenge token that only the /login/2fa step accepts.
    if (user.twoFactorEnabled) {
      const challengeToken = generateChallengeToken(user.id);
      res.json({ twoFactorRequired: true, challengeToken });
      return;
    }

    const token = generateToken(user.id);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Step 2 of login: exchange a challenge token + a TOTP code OR a recovery code
// for a full token.
router.post('/login/2fa', async (req, res) => {
  try {
    const { challengeToken, code } = z
      .object({
        challengeToken: z.string(),
        code: z.string().min(6).max(32),
      })
      .parse(req.body);

    const payload = verifyToken(challengeToken);
    if (!payload || !payload.twoFactorPending) {
      res.status(401).json({ error: 'Invalid or expired session, please sign in again' });
      return;
    }

    const user = await db.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(401).json({ error: 'Invalid or expired session, please sign in again' });
      return;
    }

    let ok = false;
    let recoveryCodesRemaining = user.twoFactorRecoveryCodes;

    // Try TOTP first for 6-digit numeric input.
    if (/^\d{6}$/.test(code)) {
      ok = verifyCode(code, decryptSecret(user.twoFactorSecret));
    }

    // Otherwise (or if TOTP failed), try a one-time recovery code and consume it.
    if (!ok) {
      const hashed = hashRecoveryCode(code);
      const idx = user.twoFactorRecoveryCodes.indexOf(hashed);
      if (idx !== -1) {
        ok = true;
        recoveryCodesRemaining = user.twoFactorRecoveryCodes.filter((_, i) => i !== idx);
        await db.user.update({
          where: { id: user.id },
          data: { twoFactorRecoveryCodes: recoveryCodesRemaining },
        });
      }
    }

    if (!ok) {
      res.status(401).json({ error: 'Incorrect code' });
      return;
    }

    const token = generateToken(user.id);
    res.json({
      token,
      user: publicUser({ ...user, twoFactorRecoveryCodes: recoveryCodesRemaining }),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Begin 2FA setup: generate a secret + QR code. Stored encrypted; not enabled
// until confirmed with a valid code.
router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (user.twoFactorEnabled) {
      res.status(400).json({ error: 'Two-factor authentication is already enabled' });
      return;
    }

    const secret = generateSecret();
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: encryptSecret(secret) },
    });

    const otpauthUrl = buildOtpAuthUrl(user.email, secret);
    const qrDataUrl = await buildQrDataUrl(otpauthUrl);
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Confirm setup with a code, enable 2FA, and return one-time recovery codes.
router.post('/2fa/enable', authenticate, async (req, res) => {
  try {
    const { code } = totpCodeSchema.parse(req.body);

    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (user.twoFactorEnabled) {
      res.status(400).json({ error: 'Two-factor authentication is already enabled' });
      return;
    }
    if (!user.twoFactorSecret) {
      res.status(400).json({ error: 'Start setup before enabling two-factor authentication' });
      return;
    }

    if (!verifyCode(code, decryptSecret(user.twoFactorSecret))) {
      res.status(400).json({ error: 'Incorrect code, please try again' });
      return;
    }

    const { plain, hashed } = generateRecoveryCodes();
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true, twoFactorRecoveryCodes: hashed },
    });
    res.json({ success: true, recoveryCodes: plain });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Regenerate recovery codes (invalidates old ones). Requires password.
router.post('/2fa/recovery-codes', authenticate, async (req, res) => {
  try {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body);

    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (!user.twoFactorEnabled) {
      res.status(400).json({ error: 'Two-factor authentication is not enabled' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(400).json({ error: 'Incorrect password' });
      return;
    }

    const { plain, hashed } = generateRecoveryCodes();
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: hashed },
    });
    res.json({ recoveryCodes: plain });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Disable 2FA — requires re-entering the password.
router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    const { password } = z.object({ password: z.string().min(1) }).parse(req.body);

    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(400).json({ error: 'Incorrect password' });
      return;
    }

    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] },
    });
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
