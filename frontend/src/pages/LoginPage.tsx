import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ReceiptText, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../lib/api';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Two-factor step
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      const result = await login(data.email, data.password);
      if (result.status === 'twoFactorRequired') {
        setChallengeToken(result.challengeToken);
      } else {
        navigate('/expenses');
      }
    } catch (err) {
      setServerError(getErrorMessage(err));
    }
  };

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setServerError('');
    setVerifying(true);
    try {
      await verifyTwoFactor(challengeToken, code);
      navigate('/expenses');
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            {challengeToken ? (
              <ShieldCheck className="h-6 w-6 text-white" />
            ) : (
              <ReceiptText className="h-6 w-6 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">HSA Expense Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">
            {challengeToken ? 'Enter your authentication code' : 'Sign in to your account'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          {challengeToken ? (
            <form onSubmit={onVerify} className="space-y-4">
              {useRecovery ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Recovery code
                  </label>
                  <input
                    type="text"
                    autoComplete="one-time-code"
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                    placeholder="xxxxx-xxxxx"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Enter one of the recovery codes you saved when enabling two-factor.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    6-digit code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.3em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Open your authenticator app to get the current code.
                  </p>
                </div>
              )}

              {serverError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
              )}

              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {verifying ? 'Verifying…' : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setUseRecovery((v) => !v);
                  setCode('');
                  setServerError('');
                }}
                className="w-full text-center text-sm text-blue-600 hover:underline"
              >
                {useRecovery ? 'Use authenticator code instead' : 'Use a recovery code'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setCode('');
                  setServerError('');
                  setUseRecovery(false);
                }}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  {...register('email')}
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              {serverError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        {!challengeToken && (
          <p className="mt-4 text-center text-sm text-gray-500">
            No account?{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:underline">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
