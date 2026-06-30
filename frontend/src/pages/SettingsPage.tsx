import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
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

export default function SettingsPage() {
  return (
    <div className="px-6 py-6">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Settings</h1>
      <div className="grid max-w-2xl gap-6">
        <MembersSection />
        <CategoriesSection />
      </div>
    </div>
  );
}
