'use client';

/**
 * @file src/app/dashboard/payroll/page.tsx
 * @description Payroll & Salary — the same simple month-wise salary system used for the hostel,
 *              now for the WHOLE group (teachers, drivers, other staff).
 *
 * Each staff member has a fixed monthly salary (no TDS/PF). You pay full or part of any month;
 * a fully-paid month is auto-marked CLEARED. Every payout records a simple EXPENSE transaction,
 * so it flows straight into the Income & Expense ledger.
 *
 * Row → "Pay" handles the current month inline; "Months" expands the full 12-month history.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CircleDollarSign, Search, Building2, Loader2, AlertCircle, CheckCircle2, Wallet, Clock,
  IndianRupee, ChevronDown, ChevronUp, UserCheck, Bus, Briefcase, Trash2, Pencil, Check, X,
  ArrowUpRight, ArrowDownLeft, Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { triggerDataChange, useDataSubscription } from '@/lib/events';

interface SalaryMonth { 
  month: string; 
  year: number; 
  expected: number; 
  paid: number; 
  remaining: number; 
  refunded?: number;
  excess?: number;
  remainingRefund?: number;
}
interface StaffRow {
  id: string; name: string; staffType: string; roleOrDesignation: string | null;
  monthlyBaseSalary: string | number; paidThisMonth: number; remainingThisMonth: number;
  refundedThisMonth?: number;
  lastPaymentDateThisMonth?: string | null;
  unit: { name: string };
  staffNo: string | null;
}

const UNIT_LABELS: Record<string, string> = {
  all: 'All Divisions',
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
  transport: 'Transport Department'
};
const TYPE_ICONS: Record<string, React.ElementType> = { TEACHER: UserCheck, DRIVER: Bus, OTHER_STAFF: Briefcase };
const PAYMENT_MODES = ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI'];
const fmt = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;

export default function PayrollPage() {
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState('');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const [unit, setUnit] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');

  const [payFor, setPayFor] = useState<string | null>(null);   // current-month inline pay
  const [expandFor, setExpandFor] = useState<string | null>(null); // 12-month detail

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) setAllowedUnits(d.user.accessUnits.filter((u: string) => !['hostel'].includes(u)));
    }).finally(() => setIsLoadingUser(false));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ unit, type, status: 'ACTIVE', limit: '100' });
      if (search.trim()) params.append('search', search.trim());
      const res = await fetch(`/api/staff?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStaff(data.staff || []);
      setCurrentMonth(data.currentMonth || '');
      setCurrentYear(data.currentYear || new Date().getFullYear());
    } catch { setStaff([]); }
    finally { setIsLoading(false); }
  }, [unit, type, search]);

  useEffect(() => { if (!isLoadingUser) load(); }, [load, isLoadingUser]);

  useDataSubscription(load);

  const totalMonthly = staff.reduce((s, x) => s + Number(x.monthlyBaseSalary), 0);
  const paidThisMonth = staff.reduce((s, x) => s + x.paidThisMonth, 0);
  const pendingThisMonth = staff.reduce((s, x) => s + x.remainingThisMonth, 0);
  const totalExcessThisMonth = staff.reduce((s, x) => {
    const monthly = Number(x.monthlyBaseSalary);
    const paid = Number(x.paidThisMonth);
    const excess = Math.max(0, paid - monthly);
    return s + excess;
  }, 0);
  const totalRefundedThisMonth = staff.reduce((s, x) => s + Number(x.refundedThisMonth || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <CircleDollarSign size={22} className="text-brand" /> Payroll &amp; Salary
        </h1>
        <p className="text-xs text-mute mt-1">Month-wise salary for every staff member — pay full or part, fully-paid months show CLEARED.</p>
      </div>

      {isLoadingUser ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
      ) : (
        <>
          {/* Summary cards (this month) */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <Card className="border-beige bg-paper text-ink shadow-md"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-2xs text-mute uppercase font-bold tracking-wider">Monthly Payroll</p><p className="text-xl font-extrabold mt-1">{fmt(totalMonthly)}</p></div>
              <div className="p-2 rounded-lg bg-brand/10 text-brand"><IndianRupee size={18} /></div>
            </CardContent></Card>
            <Card className="border-beige bg-paper text-ink shadow-md"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-2xs text-mute uppercase font-bold tracking-wider">Paid ({currentMonth})</p><p className="text-xl font-extrabold mt-1 text-emerald-700">{fmt(paidThisMonth)}</p></div>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700"><Wallet size={18} /></div>
            </CardContent></Card>
            <Card className="border-beige bg-paper text-ink shadow-md"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-2xs text-mute uppercase font-bold tracking-wider">Pending ({currentMonth})</p><p className="text-xl font-extrabold mt-1 text-amber-600">{fmt(pendingThisMonth)}</p></div>
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><Clock size={18} /></div>
            </CardContent></Card>
            <Card className="border-beige bg-paper text-ink shadow-md"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-2xs text-mute uppercase font-bold tracking-wider">Refund Given (Excess)</p><p className="text-xl font-extrabold mt-1 text-red-600">{fmt(totalExcessThisMonth)}</p></div>
              <div className="p-2 rounded-lg bg-red-50 text-red-600"><ArrowUpRight size={18} /></div>
            </CardContent></Card>
            <Card className="border-beige bg-paper text-ink shadow-md"><CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-2xs text-mute uppercase font-bold tracking-wider">Refund Received</p><p className="text-xl font-extrabold mt-1 text-emerald-600">{fmt(totalRefundedThisMonth)}</p></div>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><ArrowDownLeft size={18} /></div>
            </CardContent></Card>
          </div>

          {/* Filters */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardContent className="p-4 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff name..."
                  className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand" />
              </div>
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-mute" />
                <select value={unit} onChange={e => setUnit(e.target.value)}
                  className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
                  <option value="all">All Divisions</option>
                  {allowedUnits.map(u => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
                </select>
              </div>
              <select value={type} onChange={e => setType(e.target.value)}
                className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="all">All Types</option>
                <option value="TEACHER">Teachers</option>
                <option value="OTHER_STAFF">Other Staff</option>
                <option value="DRIVER">Drivers</option>
              </select>
              <span className="text-xs text-mute ml-auto">{staff.length} staff</span>
            </CardContent>
          </Card>

          {/* Staff list */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardContent className="p-0">
              {isLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
              : staff.length === 0 ? <div className="text-center py-16"><CircleDollarSign size={36} className="mx-auto text-mute mb-3" /><p className="text-mute text-sm font-semibold">No staff found</p></div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead><tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                      <th className="p-4">Staff</th><th className="p-4">Division</th><th className="p-4 text-right">Monthly Salary</th>
                      <th className="p-4 text-right">Paid ({currentMonth})</th><th className="p-4 text-right">Remaining</th><th className="p-4 text-center">Status</th><th className="p-4 text-center">Action</th>
                    </tr></thead>
                    <tbody className="divide-y divide-beige">
                      {staff.map(s => {
                        const TypeIcon = TYPE_ICONS[s.staffType] || Briefcase;
                        const cleared = Number(s.monthlyBaseSalary) > 0 && s.paidThisMonth >= Number(s.monthlyBaseSalary);
                        const partial = s.paidThisMonth > 0 && s.paidThisMonth < Number(s.monthlyBaseSalary);
                        const isPaying = payFor === s.id;
                        const isExpanded = expandFor === s.id;
                        return (
                          <React.Fragment key={s.id}>
                            <tr className={`transition-colors ${cleared ? 'bg-emerald-50' : 'hover:bg-cream'}`}>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <TypeIcon size={13} className="text-mute shrink-0" />
                                  <div><p className="font-semibold text-ink">{s.name}</p><p className="text-2xs text-mute">{s.roleOrDesignation || s.staffType.replace('_', ' ')}{s.staffNo ? ` · ${s.staffNo}` : ''}</p></div>
                                </div>
                              </td>
                              <td className="p-4 text-mute">{s.unit.name}</td>
                              <td className="p-4 text-right font-mono text-label">{fmt(s.monthlyBaseSalary)}</td>
                              <td className="p-4 text-right font-mono text-emerald-700">
                                <div>{fmt(s.paidThisMonth)}</div>
                                {s.paidThisMonth > 0 && s.lastPaymentDateThisMonth && (
                                  <div className="text-[10px] text-mute font-sans font-normal mt-0.5">
                                    {new Date(s.lastPaymentDateThisMonth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                )}
                              </td>
                              <td className={`p-4 text-right font-mono font-bold ${s.remainingThisMonth > 0 ? 'text-amber-600' : 'text-mute'}`}>{fmt(s.remainingThisMonth)}</td>
                              <td className="p-4 text-center">
                                <div className="flex flex-col items-center justify-center gap-1">
                                  {cleared ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 size={10} /> Cleared</span>
                                  : partial ? <span className="px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-amber-50 text-amber-600 border-amber-200">Partial</span>
                                  : <span className="px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-slate-100 text-mute border-[#dcd5c8]">Unpaid</span>}
                                  
                                  {(() => {
                                    const baseVal = Number(s.monthlyBaseSalary);
                                    const paidVal = Number(s.paidThisMonth || 0);
                                    const refundedVal = Number(s.refundedThisMonth || 0);
                                    const excessPaidThisMonth = Math.max(0, paidVal - baseVal);
                                    const remainingRefundThisMonth = Math.max(0, excessPaidThisMonth - refundedVal);
                                    
                                    if (excessPaidThisMonth > 0) {
                                      if (remainingRefundThisMonth > 0) {
                                        return (
                                          <span className="text-[10px] font-bold text-amber-600 tracking-tight whitespace-nowrap bg-amber-50/50 px-1.5 py-0.5 rounded border border-amber-200/50 mt-1">
                                            Refund Pending: {fmt(remainingRefundThisMonth)}
                                          </span>
                                        );
                                      } else {
                                        return (
                                          <span className="text-[10px] font-bold text-emerald-600 tracking-tight whitespace-nowrap bg-emerald-50/50 px-1.5 py-0.5 rounded border border-emerald-200/50 mt-1">
                                            Refund Cleared
                                          </span>
                                        );
                                      }
                                    }
                                    return null;
                                  })()}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => { setExpandFor(isExpanded ? null : s.id); setPayFor(null); }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cream hover:bg-beige text-label text-2xs font-bold cursor-pointer">
                                    Months {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>
                                  {!cleared && (
                                    <button onClick={() => { setPayFor(isPaying ? null : s.id); setExpandFor(null); }}
                                      className="px-2.5 py-1 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white text-2xs font-bold cursor-pointer">{isPaying ? 'Close' : 'Pay'}</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isPaying && (
                              <tr><td colSpan={7} className="p-0">
                                <MonthPay staffId={s.id} month={currentMonth} year={currentYear} remaining={s.remainingThisMonth} onPaid={() => { setPayFor(null); load(); }} />
                              </td></tr>
                            )}
                            {isExpanded && (
                              <tr><td colSpan={7} className="p-0"><MonthHistory staffId={s.id} onChanged={load} /></td></tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Inline pay form (one month) ──────────────────────────────────────────────

function MonthPay({ staffId, month, year, remaining, onPaid }: { staffId: string; month: string; year: number; remaining: number; onPaid: () => void }) {
  const [deduction, setDeduction] = useState('0');
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : ''));
  const [mode, setMode] = useState('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-calculate Net Cash Paid when deductions change
  useEffect(() => {
    const rem = Number(remaining || 0);
    const ded = Number(deduction || 0);
    const net = Math.max(0, rem - ded);
    setAmount(String(net > 0 ? net : ''));
  }, [remaining, deduction]);

  const pay = async () => {
    setError(null);
    if (!(Number(amount) >= 0)) { setError('Enter a valid amount.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pay_salary',
          month,
          year,
          amount: Number(amount),
          pfDeduction: Number(deduction),
          tdsDeduction: 0,
          date: paymentDate,
          paymentMode: mode
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      triggerDataChange();
      onPaid();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-cream px-6 py-4 flex flex-wrap items-end gap-3">
      {error && <div className="w-full text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</div>}
      <div className="w-full text-xs text-mute">Paying <span className="font-bold text-ink">{month} {year}</span> · remaining <span className="font-mono text-amber-600">{fmt(remaining)}</span></div>
      
      <div className="space-y-1">
        <Label className="text-2xs text-mute">Payment Date</Label>
        <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 w-36 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-mute">EPF / TDS / Deduction</Label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
          <Input type="number" value={deduction} onChange={e => setDeduction(e.target.value)} className="h-8 w-36 pl-5 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-mute">Net Paid</Label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-8 w-28 pl-5 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-2xs text-mute">Mode</Label>
        <select value={mode} onChange={e => setMode(e.target.value)} className="block h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand">
          {PAYMENT_MODES.map(x => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
        </select>
      </div>

      <Button onClick={pay} disabled={busy} className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Pay
      </Button>
    </div>
  );
}

function MonthRefund({ staffId, month, year, maxAmount, onRefunded }: { staffId: string; month: string; year: number; maxAmount: number; onRefunded: () => void }) {
  const [amount, setAmount] = useState(String(maxAmount));
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitRefund = async () => {
    setError(null);
    const amt = Number(amount);
    if (!(amt > 0)) { setError('Enter a valid positive amount.'); return; }
    if (amt > maxAmount + 0.01) { setError(`Refund cannot exceed the pending balance of ${fmt(maxAmount)}.`); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'receive_refund',
          month,
          year,
          amount: amt,
          date: refundDate,
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      triggerDataChange();
      onRefunded();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-3 flex flex-wrap items-end gap-3 w-full">
      {error && <div className="w-full text-2xs text-red-600 flex items-center gap-1.5"><AlertCircle size={10} /> {error}</div>}
      <div className="w-full text-2xs text-emerald-800 font-semibold">
        Record Cash Refund · Pending: <span className="font-mono text-emerald-700 font-bold">{fmt(maxAmount)}</span>
      </div>
      
      <div className="space-y-1">
        <Label className="text-[10px] text-emerald-800">Refund Date</Label>
        <Input type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)} className="h-8 w-32 border-emerald-200 bg-white text-emerald-950 text-xs font-mono focus-visible:ring-emerald-500" />
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-emerald-800">Refund Amount</Label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-emerald-700 text-xs">₹</span>
          <Input type="number" max={maxAmount} value={amount} onChange={e => setAmount(e.target.value)} className="h-8 w-32 pl-5 border-emerald-200 bg-white text-emerald-950 text-xs font-mono focus-visible:ring-emerald-500" />
        </div>
      </div>

      <Button onClick={submitRefund} disabled={busy} className="h-8 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs cursor-pointer">
        {busy ? 'Processing...' : 'Receive Cash Refund'}
      </Button>
    </div>
  );
}

// ─── Expandable 12-month history with per-month pay ───────────────────────────

function MonthHistory({ staffId, onChanged }: { staffId: string; onChanged: () => void }) {
  const [months, setMonths] = useState<SalaryMonth[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [payKey, setPayKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inline edit states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDeduction, setEditDeduction] = useState('');
  const [editMode, setEditMode] = useState('');
  const [editDate, setEditDate] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    fetch(`/api/staff/${staffId}`)
      .then(r => r.json())
      .then(d => {
        setMonths(d.months || []);
        setTxns(d.transactions || []);
      })
      .catch(() => {
        setMonths([]);
        setTxns([]);
      })
      .finally(() => setIsLoading(false));
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  const deletePayment = async (txnId: string) => {
    if (!window.confirm('Are you sure you want to delete this salary payment entry? This will reverse the payment amount and deductions.')) return;
    setDeletingId(txnId);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_salary_payment', transactionId: txnId })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      load();
      onChanged();
    } catch (e: any) {
      alert('Error deleting entry: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const saveEdit = async (txnId: string) => {
    const amt = Number(editAmount);
    const ded = Number(editDeduction);
    if (!(amt >= 0) || ded < 0) {
      alert('Please enter valid non-negative amounts.');
      return;
    }
    setSavingId(txnId);
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_salary_payment',
          transactionId: txnId,
          amount: amt,
          pfDeduction: ded,
          paymentMode: editMode,
          date: editDate,
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setEditingId(null);
      load();
      onChanged();
    } catch (e: any) {
      alert('Error updating payment: ' + e.message);
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) return <div className="bg-cream py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>;

  return (
    <div className="bg-cream px-6 py-4">
      <p className="text-2xs font-bold uppercase tracking-wider text-mute mb-3">Month-by-month salary &amp; refunds</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-mute border-b border-beige/60 text-[10px] uppercase font-bold tracking-wider">
            <th className="py-2 text-left">Month</th>
            <th className="py-2 text-right pr-2">Base Salary</th>
            <th className="py-2 text-right pr-2">Disbursed Gross</th>
            <th className="py-2 text-right pr-2">Pending Base</th>
            <th className="py-2 text-right pr-2">Compliance Excess</th>
            <th className="py-2 text-center">Refund Status</th>
            <th className="py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-beige">
          {months.map(m => {
            const key = `${m.month}-${m.year}`;
            const cleared = m.expected > 0 && m.paid >= m.expected;
            const partial = m.paid > 0 && m.paid < m.expected;
            const isPaying = payKey === key;
            const monthTxns = txns.filter(t => t.periodMonth === m.month && t.periodYear === m.year);
            const hasHistory = monthTxns.length > 0;
            const excess = m.excess || 0;
            const remainingRefund = m.remainingRefund || 0;

            const salaryTxns = monthTxns.filter(t => t.category !== 'SALARY_REFUND');
            const paidDates = Array.from(
              new Set(
                salaryTxns.map(t =>
                  new Date(t.date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                )
              )
            );

            return (
              <React.Fragment key={key}>
                <tr className="hover:bg-cream/40">
                  <td className="py-2.5 font-semibold text-label">
                    <div>{m.month} {m.year}</div>
                    {paidDates.length > 0 && (
                      <div className="text-[10px] text-emerald-700 font-mono font-medium flex items-center gap-1 mt-0.5">
                        <Calendar size={10} className="shrink-0 text-emerald-600" />
                        <span>Paid: {paidDates.join(', ')}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-mono text-mute pr-2">{fmt(m.expected)}</td>
                  <td className="py-2.5 text-right font-mono text-emerald-700 pr-2">
                    <div>{fmt(m.paid)}</div>
                    {paidDates.length > 0 && (
                      <div className="text-[10px] text-mute font-mono font-normal mt-0.5">
                        {paidDates.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className={`py-2 text-right font-mono font-bold pr-2 ${m.remaining > 0 ? 'text-amber-600' : 'text-mute'}`}>{fmt(m.remaining)}</td>
                  <td className={`py-2 text-right font-mono pr-2 ${excess > 0 ? 'text-red-600 font-bold' : 'text-mute'}`}>{excess > 0 ? fmt(excess) : '—'}</td>
                  <td className="py-2 text-center">
                    {excess > 0 ? (
                      remainingRefund > 0 ? (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase border bg-amber-50 text-amber-700 border-amber-200">Pending: {fmt(remainingRefund)}</span>
                      ) : (
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">CLEARED</span>
                      )
                    ) : (
                      <span className="text-mute text-3xs font-semibold">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setPayKey(isPaying ? null : key)}
                        className={`px-2.5 py-0.5 rounded text-3xs font-bold cursor-pointer border ${
                          isPaying ? 'bg-cream hover:bg-beige text-mute border-beige' : 'bg-emerald-700/80 hover:bg-emerald-600 text-white border-transparent'
                        }`}
                      >
                        {isPaying ? 'Close' : 'Pay / Refund'}
                      </button>
                      {hasHistory && !isPaying && (
                        <button
                          onClick={() => setPayKey(key)}
                          className="px-2 py-0.5 rounded bg-cream hover:bg-beige text-mute text-3xs font-bold cursor-pointer border border-beige"
                        >
                          History
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isPaying && (
                  <tr>
                    <td colSpan={7} className="p-0 bg-cream/40 border-t border-beige">
                      <div className="space-y-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6">
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Disburse Salary Payment</p>
                            <MonthPay staffId={staffId} month={m.month} year={m.year} remaining={m.remaining} onPaid={() => { setPayKey(null); load(); onChanged(); }} />
                          </div>
                          {excess > 0 && remainingRefund > 0 ? (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Receive Cash Refund</p>
                              <MonthRefund staffId={staffId} month={m.month} year={m.year} maxAmount={remainingRefund} onRefunded={() => { setPayKey(null); load(); onChanged(); }} />
                            </div>
                          ) : excess > 0 && remainingRefund <= 0 ? (
                            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center gap-2 self-end">
                              <CheckCircle2 className="text-emerald-700 w-4 h-4 shrink-0" />
                              <span className="text-2xs text-emerald-800 font-semibold">Compliance Refund is fully CLEARED for this month.</span>
                            </div>
                          ) : null}
                        </div>
                        
                        {monthTxns.length > 0 && (
                          <div className="px-6 py-2">
                            <p className="text-3xs font-bold uppercase tracking-wider text-mute mb-2">Recorded Payments &amp; Refunds for {m.month} {m.year}</p>
                            <div className="border border-beige rounded-lg overflow-hidden bg-white">
                              <table className="w-full text-2xs">
                                <thead>
                                  <tr className="bg-cream/60 border-b border-beige text-mute">
                                    <th className="p-2 text-left font-semibold">Date</th>
                                    <th className="p-2 text-right font-semibold pr-2">Net Amount</th>
                                    <th className="p-2 text-right font-semibold pr-2">Deduction (PF/TDS)</th>
                                    <th className="p-2 text-left font-semibold">Payment Mode / Type</th>
                                    <th className="p-2 text-right font-semibold">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-beige">
                                  {monthTxns.map(t => {
                                    const pf = Number(t.pfDeduction || 0);
                                    const tds = Number(t.tdsDeduction || 0);
                                    const totalDed = pf + tds;
                                    const isDeleting = deletingId === t.id;
                                    const isEditing = editingId === t.id;
                                    const isRefund = t.category === 'SALARY_REFUND';

                                    return (
                                      <tr key={t.id} className="hover:bg-cream/20">
                                        <td className="p-2 font-mono text-mute">
                                          {isEditing ? (
                                            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-6 w-28 border-beige bg-field text-3xs font-mono focus-visible:ring-brand" />
                                          ) : (
                                            new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                          )}
                                        </td>
                                        
                                        {isRefund ? (
                                          <>
                                            <td className="p-2 text-right font-mono font-bold text-emerald-600 pr-2">+{fmt(Number(t.amount))} (Refund)</td>
                                            <td className="p-2 text-right font-mono text-mute pr-2">—</td>
                                            <td className="p-2 font-mono text-mute">CASH (Refund Recd)</td>
                                            <td className="p-2 text-right">
                                              <div className="flex justify-end gap-1.5 pr-2">
                                                <button
                                                  onClick={() => deletePayment(t.id)}
                                                  disabled={isDeleting}
                                                  title="Delete refund entry"
                                                  className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50 cursor-pointer inline-flex items-center"
                                                >
                                                  {isDeleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                                </button>
                                              </div>
                                            </td>
                                          </>
                                        ) : isEditing ? (
                                          <>
                                            <td className="p-2 text-right">
                                              <div className="relative inline-block">
                                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-mute text-[10px]">₹</span>
                                                <Input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} className="h-6 w-20 pl-4 pr-1 border-beige bg-field text-2xs font-mono text-right focus-visible:ring-brand" />
                                              </div>
                                            </td>
                                            <td className="p-2 text-right">
                                              <div className="relative inline-block">
                                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-mute text-[10px]">₹</span>
                                                <Input type="number" value={editDeduction} onChange={e => setEditDeduction(e.target.value)} className="h-6 w-20 pl-4 pr-1 border-beige bg-field text-2xs font-mono text-right focus-visible:ring-brand" />
                                              </div>
                                            </td>
                                            <td className="p-2">
                                              <select value={editMode} onChange={e => setEditMode(e.target.value)} className="h-6 bg-field border border-beige text-3xs rounded px-1 focus:outline-none focus:ring-1 focus:ring-brand">
                                                {['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI'].map(x => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
                                              </select>
                                            </td>
                                            <td className="p-2 text-right">
                                              <div className="flex justify-end gap-1.5 pr-2">
                                                <button
                                                  onClick={() => saveEdit(t.id)}
                                                  disabled={savingId === t.id}
                                                  title="Save changes"
                                                  className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 disabled:opacity-50 cursor-pointer inline-flex items-center"
                                                >
                                                  {savingId === t.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                                </button>
                                                <button
                                                  onClick={() => setEditingId(null)}
                                                  title="Cancel"
                                                  className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer inline-flex items-center"
                                                >
                                                  <X size={10} />
                                                </button>
                                              </div>
                                            </td>
                                          </>
                                        ) : (
                                          <>
                                            <td className="p-2 text-right font-mono font-semibold text-emerald-700 pr-2">{fmt(Number(t.amount))}</td>
                                            <td className="p-2 text-right font-mono text-mute pr-2">{totalDed > 0 ? fmt(totalDed) : '—'}</td>
                                            <td className="p-2 font-mono text-mute">{t.paymentMode ? t.paymentMode.replace('_', ' ') : '—'}</td>
                                            <td className="p-2 text-right">
                                              <div className="flex justify-end gap-1.5 pr-2">
                                                <button
                                                  onClick={() => {
                                                    setEditingId(t.id);
                                                    setEditAmount(String(t.amount));
                                                    setEditDeduction(String(totalDed));
                                                    setEditMode(t.paymentMode || 'BANK_TRANSFER');
                                                    setEditDate(t.date ? new Date(t.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
                                                  }}
                                                  title="Edit salary entry"
                                                  className="p-1 rounded bg-beige/50 hover:bg-beige text-mute cursor-pointer inline-flex items-center"
                                                >
                                                  <Pencil size={10} />
                                                </button>
                                                <button
                                                  onClick={() => deletePayment(t.id)}
                                                  disabled={isDeleting}
                                                  title="Delete salary entry"
                                                  className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600 disabled:opacity-50 cursor-pointer inline-flex items-center"
                                                >
                                                  {isDeleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                                                </button>
                                              </div>
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
