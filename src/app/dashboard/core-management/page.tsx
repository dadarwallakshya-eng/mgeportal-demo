'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Phone,
  Mail,
  Building2,
  Wallet,
  Calendar,
  X,
  ArrowUpRight,
  ChevronRight,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Transaction {
  id: string;
  amount: number;
  date: string;
  description: string;
  unitId: string;
  userName?: string;
}

interface UserSummary {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  accessUnits: string[];
  totalWithdrawn: number;
  breakdown: Record<string, number>;
  transactions: Transaction[];
}

const UNIT_LABELS: Record<string, string> = {
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
  hostel: 'Modern Hostel',
  transport: 'MGE Transport Fleet',
};

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export default function CoreManagementDashboard() {
  const [summaries, setSummaries] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/core-management/summary');
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied: Director role required');
        }
        throw new Error('Failed to fetch core management summary');
      }
      const data = await res.json();
      setSummaries(data.summaries || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  // Compute stats
  const grandTotalWithdrawn = summaries.reduce((sum, s) => sum + s.totalWithdrawn, 0);

  // Combine and sort all transactions across users for the live activity feed
  const allTransactions: Transaction[] = summaries.flatMap(user =>
    user.transactions.map(t => ({
      ...t,
      userName: user.name
    }))
  ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <p className="text-xs font-semibold text-mute animate-pulse">Loading Core Management Dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[70vh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600 mb-3 animate-bounce" />
          <h2 className="text-sm font-bold uppercase tracking-wider mb-1">Error Loading Page</h2>
          <p className="text-xs text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchSummary}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-1">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-wider text-brand">
            Core Management System
          </h1>
          <p className="text-xs text-mute font-medium">
            Monitor accounts, profiles, and salary withdrawals for key organizational directors.
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 px-5 flex items-center gap-4 shrink-0 shadow-sm animate-in fade-in zoom-in duration-300">
          <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-700">
            <Wallet size={20} />
          </div>
          <div>
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider block">Total Core Withdrawals</span>
            <span className="text-lg font-black text-emerald-800 font-mono leading-none">
              {fmt(grandTotalWithdrawn)}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Core Users */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {summaries.map(user => (
          <Card key={user.id} className="border-beige bg-paper shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
            <CardHeader className="pb-4 border-b border-beige/60 bg-cream/35">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {/* Photo / Initials Avatar */}
                  <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-brand/20 bg-brand/5 flex items-center justify-center shrink-0">
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt={user.name} className="object-cover w-full h-full" />
                    ) : (
                      <span className="text-2xl font-black text-brand select-none">
                        {user.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-ink group-hover:text-brand transition-colors">
                      {user.name}
                    </CardTitle>
                    <CardDescription className="text-2xs font-medium text-mute mt-0.5 flex flex-col gap-0.5">
                      <span className="flex items-center gap-1">
                        <Mail size={10} className="text-mute/85 flex-shrink-0" /> {user.username}
                      </span>
                      {user.phone && (
                        <span className="flex items-center gap-1 font-bold text-ink">
                          <Phone size={10} className="text-brand flex-shrink-0" /> {user.phone}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <div className="bg-brand/10 text-brand text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full select-none">
                  Core Board
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Financial Aggregate */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-brand/5 border border-brand/10">
                <span className="text-2xs font-bold text-mute uppercase tracking-wider">Salary Taken</span>
                <span className="text-base font-black text-brand font-mono">{fmt(user.totalWithdrawn)}</span>
              </div>

              {/* Division Breakdown */}
              <div className="space-y-2.5">
                <span className="text-[10px] text-mute font-bold uppercase tracking-wider block">Division-wise Withdrawals</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {user.accessUnits.map(unit => {
                    const amount = user.breakdown[unit] || 0;
                    return (
                      <div key={unit} className="p-2.5 rounded-lg border border-beige bg-cream/45 text-left flex justify-between items-center">
                        <div className="min-w-0 pr-2">
                          <span className="text-[10px] text-ink font-semibold block truncate" title={UNIT_LABELS[unit] || unit}>
                            {UNIT_LABELS[unit] || unit}
                          </span>
                          <span className="text-3xs text-mute font-medium uppercase tracking-wider block">Division Scope</span>
                        </div>
                        <span className="text-xs font-bold text-ink font-mono shrink-0">{fmt(amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-beige/60 flex justify-end">
                <button
                  onClick={() => setSelectedUser(user)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-beige hover:border-brand hover:bg-brand/5 rounded-lg text-xs font-bold text-mute hover:text-brand transition-all cursor-pointer"
                >
                  <span>View Transaction Ledger</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live Transaction Feed across all Core users */}
      <Card className="border-beige bg-paper shadow-md">
        <CardHeader className="pb-3 border-b border-beige/65 bg-cream/35">
          <div className="flex items-center gap-2">
            <Clock className="text-brand h-4 w-4" />
            <CardTitle className="text-xs font-black uppercase tracking-wider text-mute">
              Live Core Withdrawal Activity
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {allTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-mute font-medium">
              No withdrawals have been processed by any core management member yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-cream/50 border-b border-beige text-mute text-[10px] font-bold uppercase tracking-wider select-none">
                    <th className="p-3 pl-6">Date</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Division</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 pr-6 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige font-medium">
                  {allTransactions.slice(0, 15).map(t => (
                    <tr key={t.id} className="hover:bg-cream/30 transition-colors">
                      <td className="p-3 pl-6 text-mute font-mono">
                        {new Date(t.date).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="p-3 text-ink font-bold">{t.userName}</td>
                      <td className="p-3 text-mute">
                        <span className="bg-beige/50 text-ink px-2 py-0.5 rounded text-[10px] font-semibold">
                          {UNIT_LABELS[t.unitId] || t.unitId}
                        </span>
                      </td>
                      <td className="p-3 text-ink max-w-xs truncate" title={t.description}>
                        {t.description}
                      </td>
                      <td className="p-3 pr-6 text-right text-red-600 font-mono font-bold">
                        -{fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ledger Modal for Selected User */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-2xl rounded-xl border border-beige bg-paper text-ink shadow-2xl p-6 relative flex flex-col gap-4 max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-beige pb-3">
              <div>
                <h2 className="text-base font-extrabold uppercase tracking-wider text-brand">
                  Core Withdrawal Ledger
                </h2>
                <p className="text-3xs text-mute mt-0.5">
                  Showing historical payout records for <span className="font-bold text-ink">{selectedUser.name}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* User Meta Card */}
            <div className="flex items-center justify-between p-3.5 bg-cream rounded-xl border border-beige">
              <div>
                <span className="text-2xs text-mute font-bold uppercase tracking-wider block">Selected User</span>
                <span className="text-sm font-bold text-ink">{selectedUser.name}</span>
              </div>
              <div className="text-right">
                <span className="text-2xs text-mute font-bold uppercase tracking-wider block">Cumulative Payout</span>
                <span className="text-sm font-black text-red-600 font-mono">{fmt(selectedUser.totalWithdrawn)}</span>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="flex-1 overflow-y-auto border border-beige rounded-xl">
              {selectedUser.transactions.length === 0 ? (
                <div className="p-12 text-center text-xs text-mute font-medium">
                  No payout history recorded for this user.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-cream border-b border-beige text-mute text-[10px] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Date</th>
                      <th className="p-3">Division</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 pr-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige font-medium">
                    {selectedUser.transactions.map(t => (
                      <tr key={t.id} className="hover:bg-cream/40 transition-colors">
                        <td className="p-3 pl-4 text-mute font-mono">
                          {new Date(t.date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="p-3 text-mute truncate max-w-[130px]" title={UNIT_LABELS[t.unitId] || t.unitId}>
                          {UNIT_LABELS[t.unitId] || t.unitId}
                        </td>
                        <td className="p-3 text-ink max-w-[180px] truncate" title={t.description}>
                          {t.description}
                        </td>
                        <td className="p-3 pr-4 text-right text-red-600 font-mono font-bold">
                          -{fmt(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-beige">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 bg-brand hover:bg-[#4a2090] text-white font-bold text-xs rounded-lg cursor-pointer transition-colors"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
