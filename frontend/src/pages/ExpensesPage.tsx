import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Plus,
  Filter,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  CheckSquare,
  Download,
  FileText,
  Loader2,
  ReceiptText,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import type { Expense, ExpensesResponse, FamilyMember, Category, ExpenseFilters } from '../types';
import ExpenseForm from '../components/ExpenseForm';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    REIMBURSED: 'bg-green-100 text-green-800',
    NA: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = { PENDING: 'Pending', REIMBURSED: 'Reimbursed', NA: 'N/A' };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        method === 'DIRECT_HSA' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
      }`}
    >
      {method === 'DIRECT_HSA' ? 'Direct HSA' : 'Out-of-Pocket'}
    </span>
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

export default function ExpensesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [filters, setFilters] = useState<ExpenseFilters>({ page: 1 });
  const [deleteError, setDeleteError] = useState('');

  // Bug fix #7: indeterminate state for the select-all checkbox
  const selectAllRef = useRef<HTMLInputElement>(null);

  const params = {
    ...filters,
    page: String(filters.page ?? 1),
    limit: '50',
  };

  const { data, isLoading } = useQuery<ExpensesResponse>({
    queryKey: ['expenses', filters],
    queryFn: () => api.get('/expenses', { params }).then((r) => r.data),
  });

  const { data: members = [] } = useQuery<FamilyMember[]>({
    queryKey: ['members'],
    queryFn: () => api.get('/members').then((r) => r.data),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
    onError: (err) => setDeleteError(getErrorMessage(err)),
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      api.post('/expenses/bulk-reimburse', {
        ids: Array.from(selected),
        reimbursementDate: bulkDate,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      setSelected(new Set());
      setShowBulkModal(false);
    },
  });

  const expenses = data?.expenses ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const page = filters.page ?? 1;

  const allPending = expenses.filter(
    (e) => e.paymentMethod === 'OUT_OF_POCKET' && e.reimbursementStatus === 'PENDING',
  );
  const allSelected = allPending.length > 0 && allPending.every((e) => selected.has(e.id));
  const someSelected = selected.size > 0 && !allSelected;

  // Bug fix #7: sync indeterminate property (can't be set via JSX)
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allPending.map((e) => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const [exportLoading, setExportLoading] = useState<'csv' | 'pdf' | null>(null);

  const handleExport = async (fmt: 'csv' | 'pdf') => {
    setExportLoading(fmt);
    try {
      const params = Object.fromEntries(
        Object.entries(filters)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      );
      const { data } = await api.get(`/expenses/export/${fmt}`, {
        params,
        responseType: 'blob',
      });
      const mimeType = fmt === 'csv' ? 'text/csv' : 'application/pdf';
      const blobUrl = URL.createObjectURL(new Blob([data], { type: mimeType }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `hsa-expenses-${filters.year ?? 'all'}.${fmt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // 401s are handled by the axios response interceptor (redirects to /login)
    } finally {
      setExportLoading(null);
    }
  };

  // Bug fix #5: clear selection whenever filters change to prevent accidentally
  // bulk-updating expenses that are no longer visible in the current filtered view.
  const setFilter = (key: keyof ExpenseFilters, value: string) => {
    setSelected(new Set());
    setFilters((f) => ({ ...f, [key]: value || undefined, page: 1 }));
  };

  const clearFilters = () => {
    setSelected(new Set());
    setFilters({ page: 1 });
  };

  const hasFilters =
    filters.memberId || filters.categoryId || filters.paymentMethod || filters.status ||
    filters.dateFrom || filters.dateTo || filters.year;

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {total} expense{total !== 1 ? 's' : ''}
              {hasFilters ? ' (filtered)' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                showFilters || hasFilters
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filters
              {hasFilters && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-xs text-white">
                  !
                </span>
              )}
            </button>

            <button
              onClick={() => handleExport('csv')}
              disabled={exportLoading === 'csv'}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {exportLoading === 'csv' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              CSV
            </button>
            <button
              onClick={() => handleExport('pdf')}
              disabled={exportLoading === 'pdf'}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {exportLoading === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              PDF
            </button>

            {selected.size > 0 && (
              <button
                onClick={() => setShowBulkModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                <CheckSquare className="h-4 w-4" />
                Mark {selected.size} reimbursed
              </button>
            )}

            <button
              onClick={() => { setEditingExpense(null); setShowForm(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add expense
            </button>
          </div>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tax Year</label>
              <select
                value={filters.year ?? ''}
                onChange={(e) => setFilter('year', e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All years</option>
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Member</label>
              <select
                value={filters.memberId ?? ''}
                onChange={(e) => setFilter('memberId', e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All members</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
              <select
                value={filters.categoryId ?? ''}
                onChange={(e) => setFilter('categoryId', e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Payment</label>
              <select
                value={filters.paymentMethod ?? ''}
                onChange={(e) => setFilter('paymentMethod', e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All</option>
                <option value="OUT_OF_POCKET">Out-of-Pocket</option>
                <option value="DIRECT_HSA">Direct HSA</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select
                value={filters.status ?? ''}
                onChange={(e) => setFilter('status', e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="REIMBURSED">Reimbursed</option>
                <option value="NA">N/A</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">From</label>
              <input
                type="date"
                value={filters.dateFrom ?? ''}
                onChange={(e) => setFilter('dateFrom', e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">To</label>
              <input
                type="date"
                value={filters.dateTo ?? ''}
                onChange={(e) => setFilter('dateTo', e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {deleteError && (
        <div className="mx-6 mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {deleteError}
          <button onClick={() => setDeleteError('')} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ReceiptText className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No expenses found</p>
            <p className="mt-1 text-xs text-gray-400">
              {hasFilters ? 'Try adjusting your filters.' : 'Add your first expense to get started.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="w-10 px-3 py-3">
                    {/* Bug fix #7: ref drives the indeterminate property imperatively */}
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Member
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Category
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Provider
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Amount
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Method
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Receipts
                  </th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map((expense) => {
                  const isPending =
                    expense.paymentMethod === 'OUT_OF_POCKET' &&
                    expense.reimbursementStatus === 'PENDING';
                  const isChecked = selected.has(expense.id);

                  return (
                    <tr
                      key={expense.id}
                      className={`transition-colors hover:bg-gray-50 ${isChecked ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-3 py-3">
                        {isPending && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(expense.id)}
                            className="rounded border-gray-300"
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">
                        {format(parseISO(expense.date.split('T')[0]), 'MMM d, yyyy')}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{expense.familyMember.name}</td>
                      <td className="px-3 py-3 text-gray-500">{expense.category.name}</td>
                      <td className="max-w-[180px] truncate px-3 py-3 text-gray-700">
                        {expense.provider}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-gray-900">
                        ${Number(expense.amount).toFixed(2)}
                      </td>
                      <td className="px-3 py-3">
                        <MethodBadge method={expense.paymentMethod} />
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={expense.reimbursementStatus} />
                        {expense.reimbursementDate && (
                          <span className="ml-1 text-xs text-gray-400">
                            {format(parseISO(expense.reimbursementDate.split('T')[0]), 'M/d/yy')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-400">
                        {expense.receipts.length > 0 && (
                          <span className="flex items-center gap-1 text-xs">
                            <FileText className="h-3.5 w-3.5" />
                            {expense.receipts.length}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setEditingExpense(expense); setShowForm(true); }}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this expense?')) deleteMutation.mutate(expense.id);
                            }}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>
              Page {page} of {pages} ({total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: page - 1 }))}
                className="rounded-lg border border-gray-300 p-1.5 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setFilters((f) => ({ ...f, page: page + 1 }))}
                className="rounded-lg border border-gray-300 p-1.5 disabled:opacity-40 hover:bg-gray-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Expense form drawer */}
      {showForm && (
        <ExpenseForm
          expense={editingExpense}
          onClose={() => { setShowForm(false); setEditingExpense(null); }}
        />
      )}

      {/* Bulk reimburse modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowBulkModal(false)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold text-gray-900">Mark as Reimbursed</h3>
            <p className="mb-4 text-sm text-gray-500">
              Mark {selected.size} selected expense{selected.size !== 1 ? 's' : ''} as reimbursed.
            </p>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reimbursement date
            </label>
            <input
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            {bulkMutation.error && (
              <p className="mb-3 text-sm text-red-600">{getErrorMessage(bulkMutation.error)}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkModal(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                {bulkMutation.isPending ? 'Updating…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
