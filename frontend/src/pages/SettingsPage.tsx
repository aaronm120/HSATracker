import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  Copy,
  Check,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { FamilyMember, Category } from '../types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MembersSection() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const { data: members = [] } = useQuery<FamilyMember[]>({
    queryKey: ['members'],
    queryFn: () => api.get('/members').then((r) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => api.post('/members', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setNewName('');
      setError('');
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/members/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members'] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addMutation.mutate(name);
  };

  return (
    <Section title="Family Members">
      <p className="mb-4 text-xs text-gray-500">
        Members expenses are tracked under. You cannot delete a member with existing expenses.
      </p>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline text-xs">Dismiss</button>
        </div>
      )}

      <ul className="mb-4 space-y-1">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-gray-300" />
              <span className="text-sm text-gray-800">{m.name}</span>
            </div>
            <button
              onClick={() => {
                if (confirm(`Remove "${m.name}"?`)) deleteMutation.mutate(m.id);
              }}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Member name (e.g. Spouse)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || addMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>
    </Section>
  );
}

function CategoriesSection() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => api.post('/categories', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setNewName('');
      setError('');
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (err) => setError(getErrorMessage(err)),
  });

  const defaultCategories = categories.filter((c) => !c.isCustom);
  const customCategories = categories.filter((c) => c.isCustom);

  return (
    <Section title="Expense Categories">
      <p className="mb-4 text-xs text-gray-500">
        Default HSA-eligible categories are pre-loaded. Add custom categories for your specific needs.
      </p>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline text-xs">Dismiss</button>
        </div>
      )}

      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Default ({defaultCategories.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {defaultCategories.map((c) => (
            <span
              key={c.id}
              className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700"
            >
              {c.name}
            </span>
          ))}
        </div>
      </div>

      {customCategories.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Custom ({customCategories.length})
          </h3>
          <ul className="space-y-1">
            {customCategories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2"
              >
                <span className="text-sm text-gray-800">{c.name}</span>
                <button
                  onClick={() => {
                    if (confirm(`Remove custom category "${c.name}"?`)) deleteMutation.mutate(c.id);
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMutation.mutate(newName.trim())}
          placeholder="Custom category name"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => { if (newName.trim()) addMutation.mutate(newName.trim()); }}
          disabled={!newName.trim() || addMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </div>
    </Section>
  );
}

function RecoveryCodesPanel({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — user can still copy manually */
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">Save your recovery codes</h3>
      </div>
      <p className="text-xs text-amber-800">
        Store these somewhere safe. Each code works once and lets you sign in if you lose your
        authenticator. This is the only time they’ll be shown.
      </p>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-white p-3 font-mono text-sm text-gray-800">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={copyAll}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button
          onClick={onDone}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700"
        >
          I’ve saved them
        </button>
      </div>
    </div>
  );
}

function SecuritySection() {
  const { user, refreshUser } = useAuth();
  const [error, setError] = useState('');

  // Recovery codes to display once (after enable or regenerate)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Enable flow state
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');

  // Disable flow state
  const [disabling, setDisabling] = useState(false);
  const [password, setPassword] = useState('');

  // Regenerate flow state
  const [regenerating, setRegenerating] = useState(false);
  const [regenPassword, setRegenPassword] = useState('');

  const setupMutation = useMutation({
    mutationFn: () => api.post('/auth/2fa/setup').then((r) => r.data),
    onSuccess: (data) => {
      setError('');
      setSetup(data);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const enableMutation = useMutation({
    mutationFn: () =>
      api.post<{ success: true; recoveryCodes: string[] }>('/auth/2fa/enable', { code }),
    onSuccess: async (res) => {
      setSetup(null);
      setCode('');
      setError('');
      setRecoveryCodes(res.data.recoveryCodes);
      await refreshUser();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      api.post<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', {
        password: regenPassword,
      }),
    onSuccess: async (res) => {
      setRegenerating(false);
      setRegenPassword('');
      setError('');
      setRecoveryCodes(res.data.recoveryCodes);
      await refreshUser();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const disableMutation = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { password }),
    onSuccess: async () => {
      setDisabling(false);
      setPassword('');
      setError('');
      setRecoveryCodes(null);
      await refreshUser();
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  const cancelEnable = () => {
    setSetup(null);
    setCode('');
    setError('');
  };

  const remaining = user?.twoFactorRecoveryCodesRemaining ?? 0;

  return (
    <Section title="Security">
      <p className="mb-4 text-xs text-gray-500">
        Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password, etc.).
      </p>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Current status */}
      <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-3">
        <div className="flex items-center gap-2">
          {user?.twoFactorEnabled ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldOff className="h-5 w-5 text-gray-400" />
          )}
          <div>
            <p className="text-sm font-medium text-gray-800">Two-factor authentication</p>
            <p className="text-xs text-gray-500">
              {user?.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
            </p>
          </div>
        </div>
      </div>

      {/* One-time recovery codes display (after enable or regenerate) */}
      {recoveryCodes && (
        <div className="mb-4">
          <RecoveryCodesPanel codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
        </div>
      )}

      {/* Enabled state */}
      {user?.twoFactorEnabled && (
        <div className="space-y-4">
          {/* Recovery code status + regenerate */}
          {!recoveryCodes && (
            <div className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-700">
                    {remaining} recovery code{remaining !== 1 ? 's' : ''} remaining
                  </span>
                </div>
                {!regenerating && (
                  <button
                    onClick={() => {
                      setRegenerating(true);
                      setError('');
                    }}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    Regenerate
                  </button>
                )}
              </div>
              {remaining <= 2 && (
                <p className="mt-2 text-xs text-amber-700">
                  You’re low on recovery codes. Regenerate to get a fresh set.
                </p>
              )}
              {regenerating && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-gray-500">
                    Regenerating invalidates your old codes. Confirm your password:
                  </p>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={regenPassword}
                    onChange={(e) => setRegenPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setRegenerating(false);
                        setRegenPassword('');
                        setError('');
                      }}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => regenerateMutation.mutate()}
                      disabled={!regenPassword || regenerateMutation.isPending}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {regenerateMutation.isPending ? 'Generating…' : 'Regenerate codes'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Disable */}
          {!disabling ? (
            <button
              onClick={() => {
                setDisabling(true);
                setError('');
              }}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Disable two-factor
            </button>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Confirm your password to disable
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setDisabling(false);
                    setPassword('');
                    setError('');
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => disableMutation.mutate()}
                  disabled={!password || disableMutation.isPending}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {disableMutation.isPending ? 'Disabling…' : 'Disable'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disabled: offer enable */}
      {!user?.twoFactorEnabled && !setup && (
        <button
          onClick={() => setupMutation.mutate()}
          disabled={setupMutation.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {setupMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Enable two-factor
        </button>
      )}

      {!user?.twoFactorEnabled && setup && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-gray-700">
              1. Scan this QR code with your authenticator app:
            </p>
            <img
              src={setup.qrDataUrl}
              alt="Two-factor QR code"
              className="rounded-lg border border-gray-200"
              width={180}
              height={180}
            />
            <p className="mt-2 text-xs text-gray-500">Can’t scan? Enter this key manually:</p>
            <code className="mt-1 block break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
              {setup.secret}
            </code>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              2. Enter the 6-digit code to confirm
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.3em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={cancelEnable}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => enableMutation.mutate()}
              disabled={code.length !== 6 || enableMutation.isPending}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {enableMutation.isPending ? 'Verifying…' : 'Confirm & enable'}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

export default function SettingsPage() {
  return (
    <div className="px-6 py-6">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Settings</h1>
      <div className="grid max-w-2xl gap-6">
        <SecuritySection />
        <MembersSection />
        <CategoriesSection />
      </div>
    </div>
  );
}
