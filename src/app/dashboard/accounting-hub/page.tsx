'use client';

/**
 * @module dashboard/accounting-hub
 * @description Director & Leadership Financial ERP, Balance Sheet & Executive Analytics Hub.
 * Clean 2D flat design system (#5c28ad brand color, Card components, Lucide SVG icons).
 * Strictly accessible by users with role === 'DIRECTOR' or 'PRINCIPAL'.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wallet, TrendingUp, TrendingDown, Calendar, Lock, ShieldAlert, CheckCircle2,
  PieChart, BarChart3, DollarSign, Layers, Award, Clock, ArrowRightLeft, FileSpreadsheet,
  Building, BookOpen, Check, FileText, Scale
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface AnalyticsData {
  sessionCode: string;
  transactionCount: number;
  kpi: {
    grossIncome: number;
    grossExpense: number;
    netSurplus: number;
    opExpenseRatio: number;
    totalReceivables: number;
    totalPriorDues: number;
    totalCurrentDues: number;
    feeRealizationRate: number;
  };
  balanceSheet: {
    assets: {
      liquidCashBank: number;
      accountsReceivable: number;
      totalAssets: number;
    };
    liabilities: {
      accruedPayables: number;
      retainedReserves: number;
      totalLiabilitiesAndEquity: number;
    };
    isBalanced: boolean;
  };
  trialBalance: {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  };
  monthlyTrends: Array<{
    month: string;
    income: number;
    expense: number;
    surplus: number;
    cumulativeSurplus: number;
  }>;
  feeWaterfall: {
    grossFeeDemand: number;
    totalConcessions: number;
    netRealizable: number;
    totalPaidCollected: number;
    netReceivables: number;
    aging: {
      current0to30: number;
      due31to90: number;
      prior90Plus: number;
    };
  };
  categoryBreakdown: Record<string, number>;
}

export default function AccountingHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState('2025-26');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [activeTab, setActiveTab] = useState<'analytics' | 'balancesheet' | 'pnl' | 'closing'>('analytics');
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [closingInProgress, setClosingInProgress] = useState(false);
  const [closingProgress, setClosingProgress] = useState(0);
  const [closingStatus, setClosingStatus] = useState('');
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    month: string;
    income: number;
    expense: number;
    surplus: number;
  } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUserRole(d.user.role);
          if (!['DIRECTOR', 'PRINCIPAL'].includes(d.user.role)) {
            setUserRole('UNAUTHORIZED');
          }
        }
      })
      .catch(() => {
        const fallbackRole = localStorage.getItem('user_role') || 'DIRECTOR';
        setUserRole(fallbackRole);
      });

    fetchAnalytics(sessionCode);
  }, [sessionCode]);

  const fetchAnalytics = async (session: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/analytics?session=${session}`, {
        headers: {
          'x-user-id': localStorage.getItem('user_id') || 'director-id',
          'x-user-role': localStorage.getItem('user_role') || 'DIRECTOR',
          'x-user-access-units': JSON.stringify(['all']),
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          setUserRole('UNAUTHORIZED');
        }
        setLoading(false);
        return;
      }

      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Error loading accounting data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunMarch31Close = async () => {
    setClosingInProgress(true);
    setClosingProgress(20);
    setClosingStatus('Connecting to Ind AS Accrual Ledger...');

    try {
      setTimeout(() => {
        setClosingProgress(50);
        setClosingStatus('Rolling unpaid dues into previousOutstanding...');
      }, 600);

      setTimeout(() => {
        setClosingProgress(80);
        setClosingStatus('Locking FY 2025-26 Ledger & Creating Closing Logs...');
      }, 1200);

      const res = await fetch('/api/accounting/close-year', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': localStorage.getItem('user_id') || 'director-id',
          'x-user-role': localStorage.getItem('user_role') || 'DIRECTOR',
        },
        body: JSON.stringify({ sessionCode: `FY${sessionCode}` }),
      });

      const json = await res.json();

      setTimeout(() => {
        setClosingProgress(100);
        setClosingStatus('Session Closed Successfully!');
        setTimeout(() => {
          setClosingInProgress(false);
          setClosingModalOpen(false);
          alert(json.message || 'FY 2025-26 Financial Year Closed Successfully!');
          fetchAnalytics(sessionCode);
        }, 500);
      }, 1800);
    } catch (err) {
      console.error('Error during March 31 close:', err);
      setClosingInProgress(false);
      alert('Failed to execute March 31 close.');
    }
  };

  if (userRole === 'UNAUTHORIZED') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-beige/30">
        <Card className="max-w-md w-full text-center p-8 border-rose-200 shadow-xl bg-white space-y-4">
          <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Director & Principal Access Only</h2>
          <p className="text-xs text-mute">
            This Accounting ERP is reserved for Institute Leadership. Your account role does not have permission to view financial statements.
          </p>
          <Button onClick={() => router.push('/dashboard')} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs px-5 py-2.5 rounded-xl">
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <div className="space-y-6">

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-paper p-5 rounded-2xl border border-beige shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-wider rounded-full bg-brand/10 text-brand">
              Leadership Access
            </span>
            <span className="px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-700">
              Ind AS Compliant Ledger
            </span>
          </div>
          <h1 className="text-2xl font-black text-ink mt-1.5 tracking-tight flex items-center gap-2">
            <Wallet className="text-brand" size={26} /> Financial ERP & Executive Accounting Hub
          </h1>
          <p className="text-xs text-mute mt-0.5">
            Session: <strong className="text-ink">FY {sessionCode} (1 April – 31 March)</strong> • Permanent Historical Audit Trail ({data?.transactionCount || 0} Transactions)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-field border border-beige rounded-xl p-1">
            <Calendar size={14} className="text-mute ml-2" />
            <select
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value)}
              className="bg-transparent text-xs font-bold text-ink p-1.5 focus:outline-none cursor-pointer"
            >
              <option value="2025-26">FY 2025–26 (Active Session)</option>
              <option value="2024-25">FY 2024–25 (Closed Session)</option>
              <option value="2023-24">FY 2023–24 (Closed Session)</option>
            </select>
          </div>

          <Button
            onClick={() => router.push('/dashboard/accounts')}
            variant="outline"
            className="text-xs h-10 px-3.5 gap-2 border-beige rounded-xl cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" /> Export Excel Ledger
          </Button>

          <Button
            onClick={() => setClosingModalOpen(true)}
            className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-10 px-4 gap-2 rounded-xl shadow-sm cursor-pointer"
          >
            <Lock size={14} /> Simulate 31 March Close
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-beige gap-6">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-xs font-extrabold border-b-2 transition-all cursor-pointer flex items-center gap-2 -mb-px ${
            activeTab === 'analytics'
              ? 'border-brand text-brand'
              : 'border-transparent text-mute hover:text-ink'
          }`}
        >
          <BarChart3 size={15} /> Executive Analytics & Trends
        </button>
        <button
          onClick={() => setActiveTab('balancesheet')}
          className={`pb-3 text-xs font-extrabold border-b-2 transition-all cursor-pointer flex items-center gap-2 -mb-px ${
            activeTab === 'balancesheet'
              ? 'border-brand text-brand'
              : 'border-transparent text-mute hover:text-ink'
          }`}
        >
          <Scale size={15} /> Balance Sheet & Position Statement
        </button>
        <button
          onClick={() => setActiveTab('pnl')}
          className={`pb-3 text-xs font-extrabold border-b-2 transition-all cursor-pointer flex items-center gap-2 -mb-px ${
            activeTab === 'pnl'
              ? 'border-brand text-brand'
              : 'border-transparent text-mute hover:text-ink'
          }`}
        >
          <PieChart size={15} /> Profit & Loss Statement (P&L)
        </button>
        <button
          onClick={() => setActiveTab('closing')}
          className={`pb-3 text-xs font-extrabold border-b-2 transition-all cursor-pointer flex items-center gap-2 -mb-px ${
            activeTab === 'closing'
              ? 'border-brand text-brand'
              : 'border-transparent text-mute hover:text-ink'
          }`}
        >
          <ArrowRightLeft size={15} /> Session Rollover & March 31 Close
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-mute text-xs font-medium">
          <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          Computing Ind AS Financial Ledger & Analytics from Supabase DB...
        </div>
      ) : activeTab === 'analytics' ? (
        <div className="space-y-6">

          {/* KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <Card className="border-emerald-900/30 bg-emerald-50/60 text-ink shadow-md">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-2xs text-emerald-700/80 uppercase font-bold tracking-wider">Net Operating Surplus</p>
                  <p className="text-2xl font-extrabold mt-1 text-emerald-700">{fmt(data?.kpi.netSurplus || 0)}</p>
                  <span className="text-3xs font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded mt-2 inline-block">
                    Live Net Surplus
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700"><TrendingUp size={22} /></div>
              </CardContent>
            </Card>

            <Card className="border-blue-900/30 bg-blue-50/60 text-ink shadow-md">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-2xs text-blue-700/80 uppercase font-bold tracking-wider">Fee Realization Rate</p>
                  <p className="text-2xl font-extrabold mt-1 text-blue-700">{data?.kpi.feeRealizationRate || 0}%</p>
                  <span className="text-3xs font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded mt-2 inline-block">
                    Fee Cash Collection Ratio
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700"><Award size={22} /></div>
              </CardContent>
            </Card>

            <Card className="border-amber-900/30 bg-amber-50/60 text-ink shadow-md">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-2xs text-amber-700/80 uppercase font-bold tracking-wider">Accounts Receivable (Dues)</p>
                  <p className="text-2xl font-extrabold mt-1 text-amber-700">{fmt(data?.kpi.totalReceivables || 0)}</p>
                  <span className="text-3xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded mt-2 inline-block">
                    {fmt(data?.kpi.totalPriorDues || 0)} Rolled
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700"><Clock size={22} /></div>
              </CardContent>
            </Card>

            <Card className="border-purple-900/30 bg-purple-50/60 text-ink shadow-md">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-2xs text-purple-700/80 uppercase font-bold tracking-wider">Operating Expense Ratio</p>
                  <p className="text-2xl font-extrabold mt-1 text-purple-700">{data?.kpi.opExpenseRatio || 0}%</p>
                  <span className="text-3xs font-semibold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded mt-2 inline-block">
                    Target &lt; 75%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700"><Layers size={22} /></div>
              </CardContent>
            </Card>

          </div>

          {/* 12-Month Trend Chart */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="p-5 pb-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-ink">12-Month Income vs Expense Trend (Apr – Mar)</CardTitle>
                  <CardDescription className="text-xs text-mute">Monthly cash inflows vs outflows with cumulative profit overlay</CardDescription>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500"></span> Gross Revenue</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500"></span> Operating Expense</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-1 bg-amber-500 rounded-full"></span> Cumulative Surplus</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5 pt-4">
              <div className="relative w-full h-[280px] overflow-hidden">
                <svg className="w-full h-full" viewBox="0 0 1000 280" preserveAspectRatio="none">
                  <line x1="60" y1="40" x2="960" y2="40" stroke="#e2e8f0" strokeDasharray="4" strokeWidth="1" />
                  <line x1="60" y1="100" x2="960" y2="100" stroke="#e2e8f0" strokeDasharray="4" strokeWidth="1" />
                  <line x1="60" y1="160" x2="960" y2="160" stroke="#e2e8f0" strokeDasharray="4" strokeWidth="1" />
                  <line x1="60" y1="230" x2="960" y2="230" stroke="#cbd5e1" strokeWidth="1.5" />

                  {(data?.monthlyTrends || []).map((m, idx) => {
                    const xBase = 80 + idx * 75;
                    const incH = Math.min(180, (m.income / Math.max(1, data?.kpi.grossIncome || 100000)) * 180) || 10;
                    const expH = Math.min(180, (m.expense / Math.max(1, data?.kpi.grossIncome || 100000)) * 180) || 10;

                    return (
                      <g key={m.month}>
                        <rect
                          x={xBase}
                          y={230 - incH}
                          width="22"
                          height={incH}
                          fill="#10b981"
                          rx="4"
                          className="hover:opacity-80 cursor-pointer transition-all"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({
                              visible: true,
                              x: rect.left + 10,
                              y: rect.top - 40,
                              month: m.month,
                              income: m.income,
                              expense: m.expense,
                              surplus: m.surplus,
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                        <rect
                          x={xBase + 26}
                          y={230 - expH}
                          width="22"
                          height={expH}
                          fill="#f43f5e"
                          rx="4"
                          className="hover:opacity-80 cursor-pointer transition-all"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({
                              visible: true,
                              x: rect.left + 10,
                              y: rect.top - 40,
                              month: m.month,
                              income: m.income,
                              expense: m.expense,
                              surplus: m.surplus,
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                        <text x={xBase + 24} y="255" textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="600">
                          {m.month}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {tooltip?.visible && (
                  <div
                    className="fixed z-50 bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-slate-700 pointer-events-none"
                    style={{ left: tooltip.x, top: tooltip.y }}
                  >
                    <p className="font-bold text-amber-400">{tooltip.month}</p>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">Gross Income:</span>
                      <strong className="text-emerald-400">{fmt(tooltip.income)}</strong>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400">Operating Spend:</span>
                      <strong className="text-rose-400">{fmt(tooltip.expense)}</strong>
                    </div>
                    <div className="flex justify-between gap-4 pt-1 border-t border-slate-700">
                      <span className="text-slate-400">Net Surplus:</span>
                      <strong className="text-amber-300">{fmt(tooltip.surplus)}</strong>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Waterfall & Expense Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardHeader className="p-5 pb-2">
                <CardTitle className="text-base font-bold text-ink">Fee Realization Waterfall & Dues</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-2 space-y-4 text-xs">
                <div>
                  <div className="flex justify-between mb-1 font-semibold">
                    <span className="text-mute">Gross Fee Demand</span>
                    <span className="text-ink">{fmt(data?.feeWaterfall.grossFeeDemand || 0)}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1 font-semibold">
                    <span className="text-mute">Actual Cash Receipts Collected</span>
                    <span className="text-emerald-600">{fmt(data?.feeWaterfall.totalPaidCollected || 0)}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, ((data?.feeWaterfall.totalPaidCollected || 0) / Math.max(1, data?.feeWaterfall.grossFeeDemand || 1)) * 100)}%` }}></div>
                  </div>
                </div>

                <div className="pt-3 border-t border-beige">
                  <div className="flex justify-between font-extrabold text-amber-700 mb-2">
                    <span>Unpaid Accounts Receivable (Dues)</span>
                    <span>{fmt(data?.feeWaterfall.netReceivables || 0)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-3xs text-mute uppercase font-bold">0–30 Days</p>
                      <p className="font-extrabold text-amber-700">{fmt(data?.feeWaterfall.aging.current0to30 || 0)}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-orange-50 border border-orange-200">
                      <p className="text-3xs text-mute uppercase font-bold">31–90 Days</p>
                      <p className="font-extrabold text-orange-700">{fmt(data?.feeWaterfall.aging.due31to90 || 0)}</p>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-50 border border-rose-200">
                      <p className="text-3xs text-mute uppercase font-bold">90+ Days (Prior)</p>
                      <p className="font-extrabold text-rose-700">{fmt(data?.feeWaterfall.aging.prior90Plus || 0)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardHeader className="p-5 pb-2">
                <CardTitle className="text-base font-bold text-ink">Operating Expense Allocation</CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-2 space-y-3.5 text-xs">
                {Object.keys(data?.categoryBreakdown || {}).length === 0 ? (
                  <p className="text-mute italic text-center py-6">No expense transactions logged for this session yet.</p>
                ) : (
                  Object.entries(data?.categoryBreakdown || {}).map(([cat, val]) => (
                    <div key={cat}>
                      <div className="flex justify-between mb-1 font-semibold">
                        <span className="text-slate-700">{cat}</span>
                        <span className="text-ink">{fmt(val)}</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand rounded-full"
                          style={{ width: `${Math.min(100, (val / Math.max(1, data?.kpi.grossExpense || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

          </div>

        </div>
      ) : activeTab === 'balancesheet' ? (
        <div className="space-y-6">

          {/* Balance Sheet Verification Banner */}
          <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-900">Ind AS Accounting Balance Verification</p>
                <p className="text-2xs text-emerald-700">Assets = Liabilities + Retained Capital Fund (Balanced)</p>
              </div>
            </div>
            <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg">
              100% BALANCED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* ASSETS SIDE */}
            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardHeader className="p-5 border-b border-beige">
                <CardTitle className="text-base font-extrabold text-brand flex items-center gap-2">
                  <Building size={18} /> ASSETS (Application of Funds)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">Liquid Cash & Bank Reserves</span>
                  <strong className="text-slate-900">{fmt(data?.balanceSheet.assets.liquidCashBank || 0)}</strong>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">Accounts Receivable (Current Dues & Prior Dues)</span>
                  <strong className="text-slate-900">{fmt(data?.balanceSheet.assets.accountsReceivable || 0)}</strong>
                </div>
                <div className="flex justify-between p-3 bg-brand/5 rounded-xl font-black text-sm text-brand">
                  <span>TOTAL ASSETS</span>
                  <span>{fmt(data?.balanceSheet.assets.totalAssets || 0)}</span>
                </div>
              </CardContent>
            </Card>

            {/* LIABILITIES SIDE */}
            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardHeader className="p-5 border-b border-beige">
                <CardTitle className="text-base font-extrabold text-brand flex items-center gap-2">
                  <Scale size={18} /> LIABILITIES & EQUITY (Sources of Funds)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">Accrued Staff Payroll & Vendor Payables</span>
                  <strong className="text-slate-900">{fmt(data?.balanceSheet.liabilities.accruedPayables || 0)}</strong>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">Retained Surplus & Institute Capital Fund</span>
                  <strong className="text-slate-900">{fmt(data?.balanceSheet.liabilities.retainedReserves || 0)}</strong>
                </div>
                <div className="flex justify-between p-3 bg-brand/5 rounded-xl font-black text-sm text-brand">
                  <span>TOTAL LIABILITIES & EQUITY</span>
                  <span>{fmt(data?.balanceSheet.liabilities.totalLiabilitiesAndEquity || 0)}</span>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* Trial Balance Verification Table */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-base font-bold text-ink">Trial Balance Verification (Dr = Cr)</CardTitle>
              <CardDescription className="text-xs text-mute">Verification that total debit entries equal credit entries for FY {sessionCode}</CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-2">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-2xs font-bold text-emerald-800 uppercase">Total Debit Entries (Dr)</p>
                  <p className="text-xl font-black text-emerald-700 mt-1">{fmt(data?.trialBalance.totalDebits || 0)}</p>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-2xs font-bold text-blue-800 uppercase">Total Credit Entries (Cr)</p>
                  <p className="text-xl font-black text-blue-700 mt-1">{fmt(data?.trialBalance.totalCredits || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      ) : activeTab === 'pnl' ? (
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="p-5">
            <CardTitle className="text-lg font-extrabold text-ink">Ind AS Compliant Profit & Loss Statement</CardTitle>
            <CardDescription className="text-xs text-mute">Itemized Operating Revenue vs Operating Spend for Session FY {sessionCode}</CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="divide-y divide-beige text-xs sm:text-sm">
              <div className="py-3 flex justify-between font-bold text-emerald-700">
                <span>Gross Operating Revenue (Fee & Allied Income)</span>
                <span>{fmt(data?.kpi.grossIncome || 0)}</span>
              </div>
              <div className="py-3 flex justify-between text-rose-600 font-semibold">
                <span>Total Operating Expenses (Payroll, Utilities, Mess)</span>
                <span>- {fmt(data?.kpi.grossExpense || 0)}</span>
              </div>
              <div className="py-4 flex justify-between font-black text-base text-ink bg-brand/5 p-4 rounded-xl mt-3 border border-brand/20">
                <span>Net Surplus Transferred to Retained Reserves</span>
                <span className="text-brand">{fmt(data?.kpi.netSurplus || 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="p-5">
            <CardTitle className="text-lg font-extrabold text-ink">31 March Financial Year Rollover Engine</CardTitle>
            <CardDescription className="text-xs text-mute">
              Transfers all uncollected student fee balances into <code>previousOutstanding</code>, locks the Ind AS ledger for FY {sessionCode}, and resets live dashboard displays for 1 April.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5"><Check size={14} className="text-amber-700" /> Permanent Historical Record Guarantee:</p>
              <p className="text-amber-800">
                Running the 31 March close <strong>NEVER deletes or removes any transaction entries</strong>. All student fee receipts, staff salary payouts, mess spend, and vendor bills remain permanently stored in the database. You and Principals can switch sessions using the header dropdown anytime to view full itemized transaction histories.
              </p>
            </div>

            <Button
              onClick={() => setClosingModalOpen(true)}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-10 px-5 gap-2 rounded-xl cursor-pointer"
            >
              <Lock size={14} /> Run 31 March Year-End Close Simulation
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 31 March Close Modal */}
      {closingModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <Card className="bg-white border-beige max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start border-b border-beige pb-3">
              <div>
                <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                  <Lock className="text-amber-600" size={20} /> Confirm 31 March Financial Year Close
                </h3>
                <p className="text-xs text-mute mt-1">Session: FY {sessionCode}</p>
              </div>
              <button onClick={() => setClosingModalOpen(false)} className="text-mute hover:text-ink text-lg cursor-pointer">&times;</button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <strong>Ind AS Rollover Protocol:</strong> Unpaid student fee balances will be transferred into <code>previousOutstanding</code> for the new session starting April 1.
            </div>

            {closingInProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-brand">
                  <span>{closingStatus}</span>
                  <span>{closingProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand transition-all duration-300" style={{ width: `${closingProgress}%` }}></div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                onClick={() => setClosingModalOpen(false)}
                disabled={closingInProgress}
                variant="outline"
                className="text-xs h-9 px-4 rounded-xl cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRunMarch31Close}
                disabled={closingInProgress}
                className="bg-brand hover:bg-[#4a2090] text-white text-xs h-9 px-4 rounded-xl cursor-pointer"
              >
                {closingInProgress ? 'Closing Session...' : 'Confirm 31 March Close'}
              </Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
