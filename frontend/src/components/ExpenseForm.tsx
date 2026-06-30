import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Upload, Trash2, FileText, Image, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import type { Expense, FamilyMember, Category, Receipt } from '../types';

const schema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Required'),
    familyMemberId: z.string().min(1, 'Select a family member'),
    categoryId: z.string().min(1, 'Select a category'),
    provider: z.string().min(1, 'Provider is required').max(255),
    amount: z
      .string()
      .min(1, 'Amount is required')
      .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Must be a positive number'),
    paymentMethod: z.enum(['OUT_OF_POCKET', 'DIRECT_HSA']),
    reimbursementStatus: z.enum(['PENDING', 'REIMBURSED', 'NA']),
    reimbursementDate: z.string().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (d) => {
      if (d.reimbursementStatus === 'REIMBURSED' && !d.reimbursementDate) return false;
      return true;
    },
    { message: 'Reimbursement date is required when status is Reimbursed', path: ['reimbursementDate'] },
  );

type FormData = z.infer<typeof schema>;

interface Props {
  expense?: Expense | null;
  onClose: () => void;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  return mimeType.startsWith('image/') ? (
    <Image className="h-4 w-4 text-blue-500" />
  ) : (
    <FileText className="h-4 w-4 text-red-500" />
  );
}

export default function ExpenseForm({ expense, onClose }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const [receiptError, setReceiptError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bug fix #2: track receipts in local state so uploads/deletes show immediately
  // without waiting for the parent query to refetch and re-pass the prop.
  const [localReceipts, setLocalReceipts] = useState<Receipt[]>(expense?.receipts ?? []);

  const { data: members = [] } = useQuery<FamilyMember[]>({
    queryKey: ['members'],
    queryFn: () => api.get('/members').then((r) => r.data),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: expense
      ? {
          date: expense.date.split('T')[0],
          familyMemberId: expense.familyMemberId,
          categoryId: expense.categoryId,
          provider: expense.provider,
          amount: String(Number(expense.amount).toFixed(2)),
          paymentMethod: expense.paymentMethod,
          reimbursementStatus: expense.reimbursementStatus,
          reimbursementDate: expense.reimbursementDate?.split('T')[0] ?? '',
          notes: expense.notes ?? '',
        }
      : {
          date: new Date().toISOString().split('T')[0],
          paymentMethod: 'OUT_OF_POCKET',
          reimbursementStatus: 'PENDING',
        },
  });

  const paymentMethod = watch('paymentMethod');
  const reimbursementStatus = watch('reimbursementStatus');

  useEffect(() => {
    if (paymentMethod === 'DIRECT_HSA') {
      setValue('reimbursementStatus', 'NA');
    } else if (paymentMethod === 'OUT_OF_POCKET' && reimbursementStatus === 'NA') {
      setValue('reimbursementStatus', 'PENDING');
    }
  }, [paymentMethod, setValue, reimbursementStatus]);

  // Bug fix #1: use mutateAsync so react-hook-form's isSubmitting stays true
  // for the full duration of the request, keeping the button disabled.
  const saveMutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        ...data,
        amount: parseFloat(data.amount),
        reimbursementDate: data.reimbursementDate || null,
        notes: data.notes || null,
      };
      return expense
        ? api.put(`/expenses/${expense.id}`, payload)
        : api.post('/expenses', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
      onClose();
    },
  });

  const uploadMutation = useMutation({
    onMutate: () => setUploadError(''),
    mutationFn: async (files: FileList) => {
      if (!expense) return [];
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));
      const res = await api.post<Receipt[]>(`/receipts/expenses/${expense.id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (newReceipts) => {
      if (newReceipts?.length) {
        // Bug fix #2: update local receipt list so the UI reflects the upload immediately
        setLocalReceipts((prev) => [...prev, ...newReceipts]);
      }
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err) => setUploadError(getErrorMessage(err)),
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/receipts/${id}`),
    onSuccess: (_, deletedId) => {
      // Bug fix #2: remove from local list immediately
      setLocalReceipts((prev) => prev.filter((r) => r.id !== deletedId));
      qc.invalidateQueries({ queryKey: ['expenses'] });
    },
  });

  // Bug fix #4: handle openReceipt errors so they surface to the user
  const openReceipt = async (id: string) => {
    setReceiptError('');
    try {
      const { data } = await api.get<{ url: string; fileName: string }>(`/receipts/${id}/url`);
      window.open(data.url, '_blank');
    } catch (err) {
      setReceiptError('Could not open receipt: ' + getErrorMessage(err));
    }
  };

  // Bug fix #1: await the mutation so isSubmitting covers the full async operation
  const onSubmit = async (data: FormData) => {
    await saveMutation.mutateAsync(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {expense ? 'Edit Expense' : 'Add Expense'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Date + Member */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Date of service <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  {...register('date')}
                />
                {errors.date && (
                  <p className="mt-1 text-xs text-red-600">{errors.date.message}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Family member <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  {...register('familyMemberId')}
                >
                  <option value="">Select…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {errors.familyMemberId && (
                  <p className="mt-1 text-xs text-red-600">{errors.familyMemberId.message}</p>
                )}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                {...register('categoryId')}
              >
                <option value="">Select…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && (
                <p className="mt-1 text-xs text-red-600">{errors.categoryId.message}</p>
              )}
            </div>

            {/* Provider */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Provider / Vendor <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. CVS Pharmacy, Dr. Smith"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                {...register('provider')}
              />
              {errors.provider && (
                <p className="mt-1 text-xs text-red-600">{errors.provider.message}</p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  {...register('amount')}
                />
              </div>
              {errors.amount && (
                <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>
              )}
            </div>

            {/* Payment method */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Payment method <span className="text-red-500">*</span>
              </label>
              <Controller
                name="paymentMethod"
                control={control}
                render={({ field }) => (
                  <div className="flex gap-3">
                    {[
                      { value: 'OUT_OF_POCKET', label: 'Out-of-Pocket' },
                      { value: 'DIRECT_HSA', label: 'Direct HSA' },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                          field.value === opt.value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          value={opt.value}
                          checked={field.value === opt.value}
                          onChange={() => field.onChange(opt.value)}
                          className="sr-only"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                )}
              />
            </div>

            {/* Reimbursement status (only for out-of-pocket) */}
            {paymentMethod === 'OUT_OF_POCKET' && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Reimbursement status
                </label>
                <Controller
                  name="reimbursementStatus"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-3">
                      {[
                        { value: 'PENDING', label: 'Pending' },
                        { value: 'REIMBURSED', label: 'Reimbursed' },
                      ].map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                            field.value === opt.value
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            value={opt.value}
                            checked={field.value === opt.value}
                            onChange={() => field.onChange(opt.value)}
                            className="sr-only"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  )}
                />
              </div>
            )}

            {/* Reimbursement date */}
            {reimbursementStatus === 'REIMBURSED' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reimbursement date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  {...register('reimbursementDate')}
                />
                {errors.reimbursementDate && (
                  <p className="mt-1 text-xs text-red-600">{errors.reimbursementDate.message}</p>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notes <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                rows={3}
                placeholder="Any additional notes…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                {...register('notes')}
              />
            </div>

            {/* Receipts (only on edit) */}
            {expense && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Receipts</label>

                {receiptError && (
                  <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    {receiptError}
                  </p>
                )}

                {localReceipts.length > 0 && (
                  <ul className="mb-3 space-y-1">
                    {localReceipts.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => openReceipt(r.id)}
                          className="flex min-w-0 items-center gap-2 text-sm text-blue-600 hover:underline"
                        >
                          <FileIcon mimeType={r.mimeType} />
                          <span className="truncate">{r.fileName}</span>
                          <span className="shrink-0 text-xs text-gray-400">
                            {formatFileSize(r.fileSize)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setDeletingId(r.id);
                            // Bug fix #3: use finally so spinner always clears, even on error
                            try {
                              await deleteReceiptMutation.mutateAsync(r.id);
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                          className="ml-2 shrink-0 rounded p-1 hover:bg-gray-200"
                        >
                          {deletingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files?.length) uploadMutation.mutate(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-60"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploadMutation.isPending ? 'Uploading…' : 'Attach receipt (PDF, JPG, PNG)'}
                </button>
                {uploadError && (
                  <p className="mt-1 text-xs text-red-600">{uploadError}</p>
                )}
              </div>
            )}

            {!expense && (
              <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                You can attach receipts after saving the expense.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-6 py-4">
            {saveMutation.error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {getErrorMessage(saveMutation.error)}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
