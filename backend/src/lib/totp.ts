import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const ISSUER = 'HSA Tracker';

// Allow one step (±30s) of clock drift between server and authenticator app.
authenticator.options = { window: 1 };

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export async function buildQrDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

export function verifyCode(code: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}
