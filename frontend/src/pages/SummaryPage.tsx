import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingDown, TrendingUp, Wallet, CreditCard } from 'lucide-react';
import { api } from '../lib/api';
import type { Summary } from '../types';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
            ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function SummaryPage() {
  const [year, setYear] = useState<string>(String(CURRENT_YEAR));

  const { data, isLoading } = useQuery<Summary>({
    queryKey: ['summary', year],
    queryFn: () =>
      api.get('/expenses/summary', { params: year ? { year } : {} }).then((r) => r.data),
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const memberTotal = data.totalByMember.reduce((sum, m) => sum + Number(m.total), 0);
  const categoryTotal = data.totalByCategory.reduce((sum, c) => sum + Number(c.total), 0);
  const maxMember = Math.max(...data.totalByMember.map((m) => Number(m.total)), 1);
  const maxCategory = Math.max(...data.totalByCategory.map((c) => Number(c.total)), 1);

  const sortedMembers = [...data.totalByMember].sort((a, b) => Number(b.total) - Number(a.total));
  const sortedCategories = [...data.totalByCategory].sort(
    (a, b) => Number(b.total) - Number(a.total),
  );

  // Bug fix #8: the "reimbursed" label should reflect the year the backend actually queried.
  // When no year is selected (all-time view), the backend uses the current calendar year for YTD.
  const effectiveYear = year || String(CURRENT_YEAR);
  const reimbursedLabel =
    effectiveYear === String(CURRENT_YEAR) ? 'Reimbursed YTD' : `Reimbursed ${effectiveYear}`;
  const reimbursedSub =
    effectiveYear === String(CURRENT_YEAR)
      ? `All-time: $${Number(data.totalReimbursedAllTime).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : `All-time: $${Number(data.totalReimbursedAllTime).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Summary</h1>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All time</option>
          {YEARS.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending reimbursement"
          value={data.totalPendingReimbursement}
          icon={TrendingDown}
          color="bg-yellow-50 text-yellow-600"
        />
        {/* Bug fix #8: label now accurately reflects which year's reimbursed data is shown */}
        <StatCard
          label={reimbursedLabel}
          value={data.totalReimbursedYTD}
          icon={TrendingUp}
          color="bg-green-50 text-green-600"
          sub={reimbursedSub}
        />
        <StatCard
          label="Paid directly from HSA"
          value={data.totalDirectHSA}
          icon={CreditCard}
          color="bg-purple-50 text-purple-600"
        />
        <StatCard
          label="Total expenses"
          value={String(memberTotal)}
          icon={Wallet}
          color="bg-blue-50 text-blue-600"
          sub={year ? `Tax year ${year}` : 'All time'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By member */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">By Family Member</h2>
          {sortedMembers.length === 0 ? (
            <p className="text-sm text-gray-400">No data</p>
          ) : (
            <div className="space-y-4">
              {sortedMembers.map((m) => (
                <div key={m.memberId}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{m.memberName}</span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold tabular-nums text-gray-900">
                        ${Number(m.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-gray-400">
                        {memberTotal > 0
                          ? `${((Number(m.total) / memberTotal) * 100).toFixed(0)}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>
                  <Bar pct={(Number(m.total) / maxMember) * 100} color="bg-blue-500" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By category */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">By Category</h2>
          {sortedCategories.length === 0 ? (
            <p className="text-sm text-gray-400">No data</p>
          ) : (
            <div className="space-y-3 overflow-y-auto" style={{ maxHeight: 400 }}>
              {sortedCategories.map((c) => (
                <div key={c.categoryId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-gray-700" style={{ maxWidth: '60%' }}>
                      {c.categoryName}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold tabular-nums text-gray-900">
                        ${Number(c.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-gray-400">
                        {categoryTotal > 0
                          ? `${((Number(c.total) / categoryTotal) * 100).toFixed(0)}%`
                          : '0%'}
                      </span>
                    </div>
                  </div>
                  <Bar pct={(Number(c.total) / maxCategory) * 100} color="bg-teal-500" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
