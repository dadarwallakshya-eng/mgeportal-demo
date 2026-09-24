'use client';

/**
 * @file src/app/dashboard/accounts/page.tsx
 * @description Income & Expense — the simple money view that replaced the double-entry ledger.
 *
 * - A big LIVE Net Balance at the top (Total Income − Total Expense), recomputed every load.
 * - Tabs: All / Income / Expense, each a filterable, paginated list of entries.
 * - "Add Entry" records a manual income or expense.
 * - Category breakdown chips.
 *
 * Every fee collected and every salary paid shows up here automatically (source: FEES / PAYROLL),
 * alongside manual and hostel entries — so the institute's cash position is always current.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Plus, Search, Building2, Calendar, Loader2,
  AlertCircle, CheckCircle2, X, ChevronLeft, ChevronRight, ArrowDownCircle, ArrowUpCircle,
  FileSpreadsheet, FileText, Printer, Download, Mail, Send,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { triggerDataChange, useDataSubscription } from '@/lib/events';
import ReceiptModal from '@/components/layout/receipt-modal';
import { FileUploader } from '@/components/ui/file-uploader';

interface Txn {
  id: string;
  direction: 'INCOME' | 'EXPENSE';
  category: string;
  amount: string | number;
  date: string;
  description: string | null;
  referenceNo: string | null;
  unitId: string | null;
  unit: { name: string } | null;
  student: {
    name: string;
    admissionNo: string;
    fatherName: string;
    className: string;
    section: string;
  } | null;
  staff: {
    name: string;
    staffNo: string;
    department: string;
    roleOrDesignation: string;
  } | null;
  isDeleted?: boolean;
}

interface Summary {
  totalIncome: number;
  totalExpense: number;
  net: number;
  byCategory: Record<string, number>;
}

const UNIT_LABELS: Record<string, string> = {
  all: 'All Divisions',
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
  hostel: 'Modern Hostel',
  transport: 'Transport',
};

const CATEGORY_LABELS: Record<string, string> = {
  FEE: 'Student Fee', HOSTEL_FEE: 'Hostel Fee', OTHER_INCOME: 'Other Income',
  SALARY: 'Salary', HOSTEL_SALARY: 'Hostel Salary', MESS: 'Mess', LAUNDRY: 'Laundry',
  DAILY_USE: 'Daily-use Money', TRANSPORT: 'Transport', OTHER_EXPENSE: 'Other Expense',
  ELECTRICITY: 'Electricity Bill', WATER: 'Water Bill', STATIONARY: 'Stationary',
  MAINTENANCE: 'Building Maintenance', TELEPHONE_WIFI: 'Telephone & Wifi Bill',
  MARKETING: 'Marketing Expense', FURNITURE: 'Furniture',
  CLEANING: 'Cleaning Expense', OFFICE_EXPENSE: 'Office Expense',
};

const INCOME_CATEGORIES = ['FEE', 'HOSTEL_FEE', 'OTHER_INCOME'];
const EXPENSE_CATEGORIES = [
  'SALARY', 'HOSTEL_SALARY', 'MESS', 'LAUNDRY', 'DAILY_USE', 'TRANSPORT', 'OTHER_EXPENSE',
  'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE',
  'CLEANING', 'OFFICE_EXPENSE'
];

const fmt = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const ALLOWED_CATEGORIES: Record<string, { INCOME: string[]; EXPENSE: string[] }> = {
  hostel: {
    INCOME: ['HOSTEL_FEE', 'OTHER_INCOME'],
    EXPENSE: ['MESS', 'LAUNDRY', 'DAILY_USE', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  transport: {
    INCOME: ['OTHER_INCOME'],
    EXPENSE: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  hindi: {
    INCOME: ['FEE', 'OTHER_INCOME'],
    EXPENSE: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  english: {
    INCOME: ['FEE', 'OTHER_INCOME'],
    EXPENSE: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
  college: {
    INCOME: ['FEE', 'OTHER_INCOME'],
    EXPENSE: ['TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'],
  },
};

function getFilteredCategories(unitId: string | null | undefined, direction: 'INCOME' | 'EXPENSE', role: string): string[] {
  let list: string[] = [];
  if (!unitId || unitId === 'all') {
    list = direction === 'INCOME'
      ? ['FEE', 'HOSTEL_FEE', 'OTHER_INCOME']
      : ['MESS', 'LAUNDRY', 'DAILY_USE', 'TRANSPORT', 'OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE'];
  } else {
    const allowed = ALLOWED_CATEGORIES[unitId];
    list = allowed
      ? allowed[direction]
      : (direction === 'INCOME' ? ['OTHER_INCOME'] : ['OTHER_EXPENSE', 'ELECTRICITY', 'WATER', 'STATIONARY', 'MAINTENANCE', 'TELEPHONE_WIFI', 'MARKETING', 'FURNITURE', 'CLEANING', 'OFFICE_EXPENSE']);
  }

  if (role === 'PRINCIPAL') {
    list = list.filter((cat) => !['MESS', 'LAUNDRY', 'DAILY_USE', 'HOSTEL_FEE'].includes(cat));
  }
  return list;
}

export default function IncomeExpensePage() {
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [userRole, setUserRole] = useState('');
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const [txns, setTxns] = useState<Txn[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalIncome: 0, totalExpense: 0, net: 0, byCategory: {} });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const [tab, setTab] = useState<'all' | 'INCOME' | 'EXPENSE'>('all');
  const [unit, setUnit] = useState('all');
  const [category, setCategory] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  const [showAdd, setShowAdd] = useState(false);

  // Top-level view toggle. Default 'list' = the existing transactions table.
  // 'monthly' = a card per month with Excel/PDF download buttons.
  const [view, setView] = useState<'list' | 'monthly'>('list');

  // Receipt Modal State
  const [receiptTxn, setReceiptTxn] = useState<Txn | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Edit Modal State
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editReasonCategory, setEditReasonCategory] = useState('');
  const [editDetailExplanation, setEditDetailExplanation] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Deletion States
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletingTxn, setDeletingTxn] = useState<Txn | null>(null);
  const [deleteReasonCategory, setDeleteReasonCategory] = useState('');
  const [deleteDetailExplanation, setDeleteDetailExplanation] = useState('');
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Restore States
  const [restoringTxn, setRestoringTxn] = useState<Txn | null>(null);
  const [restoreReasonCategory, setRestoreReasonCategory] = useState('');
  const [restoreDetailExplanation, setRestoreDetailExplanation] = useState('');
  const [restoreConfirmPassword, setRestoreConfirmPassword] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const startDelete = (t: Txn) => {
    setDeletingTxn(t);
    setDeleteReasonCategory('');
    setDeleteDetailExplanation('');
    setDeleteConfirmPassword('');
    setDeleteError(null);
  };

  const saveDelete = async () => {
    if (!deletingTxn) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/transactions/${deletingTxn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          reasonCategory: deleteReasonCategory,
          detailExplanation: deleteDetailExplanation,
          confirmPassword: deleteConfirmPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setDeletingTxn(null);
        triggerDataChange();
        load();
      } else {
        setDeleteError(data.error || 'Failed to delete transaction.');
      }
    } catch (err) {
      setDeleteError('An error occurred. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const startRestore = (t: Txn) => {
    setRestoringTxn(t);
    setRestoreReasonCategory('');
    setRestoreDetailExplanation('');
    setRestoreConfirmPassword('');
    setRestoreError(null);
  };

  const saveRestore = async () => {
    if (!restoringTxn) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const res = await fetch(`/api/transactions/${restoringTxn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'restore',
          reasonCategory: restoreReasonCategory,
          detailExplanation: restoreDetailExplanation,
          confirmPassword: restoreConfirmPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setRestoringTxn(null);
        triggerDataChange();
        load();
      } else {
        setRestoreError(data.error || 'Failed to restore transaction.');
      }
    } catch (err) {
      setRestoreError('An error occurred. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const startEdit = (t: Txn) => {
    setEditingTxn(t);
    setEditAmount(t.amount.toString());
    setEditCategory(t.category);
    setEditDate(t.date.split('T')[0]); // extract YYYY-MM-DD
    setEditDescription(t.description || '');
    setEditReasonCategory('');
    setEditDetailExplanation('');
    setEditConfirmPassword('');
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingTxn) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/transactions/${editingTxn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(editAmount),
          category: editCategory,
          date: editDate,
          description: editDescription,
          reasonCategory: editReasonCategory,
          detailExplanation: editDetailExplanation,
          confirmPassword: editConfirmPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setEditingTxn(null);
        triggerDataChange();
        load(); // Refresh table data
      } else {
        setEditError(data.error || 'Failed to update transaction.');
      }
    } catch (err) {
      setEditError('An error occurred. Please try again.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) {
        setAllowedUnits(d.user.accessUnits);
        setUserRole(d.user.role);
      }
    }).finally(() => setIsLoadingUser(false));
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ unit, direction: tab, category, page: String(page), limit: '5000' });
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      if (search.trim()) params.append('search', search.trim());
      if (showDeleted) params.append('showDeleted', 'true');
      const res = await fetch(`/api/finance?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTxns(data.transactions || []);
      setSummary(data.summary || { totalIncome: 0, totalExpense: 0, net: 0, byCategory: {} });
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.pages || 1);
    } catch { setTxns([]); }
    finally { setIsLoading(false); }
  }, [unit, tab, category, page, from, to, search, showDeleted]);

  useEffect(() => { if (!isLoadingUser) load(); }, [load, isLoadingUser]);

  useEffect(() => {
    const handleUnitChange = () => {
      const activeUnit = localStorage.getItem('mge-active-unit') || 'all';
      setUnit(activeUnit);
      setPage(1);
    };
    window.addEventListener('mge-unit-changed', handleUnitChange);
    handleUnitChange();
    return () => window.removeEventListener('mge-unit-changed', handleUnitChange);
  }, []);

  useDataSubscription(load);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <Wallet size={22} className="text-brand" /> Income &amp; Expense
          </h1>
          <p className="text-xs text-mute mt-1">Every payment in and out of the institute — with a live running balance.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle: existing list vs new monthly view */}
          <div className="inline-flex border border-beige rounded-lg p-0.5 bg-field text-xs font-semibold">
            <button
              onClick={() => setView('list')}
              className={`px-3 h-8 rounded-md transition-all cursor-pointer ${view === 'list' ? 'bg-brand text-white' : 'text-mute hover:text-ink'}`}
            >
              List
            </button>
            <button
              onClick={() => setView('monthly')}
              className={`px-3 h-8 rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${view === 'monthly' ? 'bg-brand text-white' : 'text-mute hover:text-ink'}`}
            >
              <Calendar size={12} /> Monthly
            </button>
          </div>
          <Button onClick={() => setShowAdd(v => !v)}
            className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer">
            {showAdd ? <X size={14} /> : <Plus size={14} />} {showAdd ? 'Close' : 'Add Entry'}
          </Button>
        </div>
      </div>

      {showAdd && (
        <AddEntryForm allowedUnits={allowedUnits} onAdded={() => { setShowAdd(false); setPage(1); load(); }} userRole={userRole} />
      )}

      {/* Live balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-emerald-900/30 bg-emerald-50 text-ink shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-2xs text-emerald-700/80 uppercase font-bold tracking-wider">Total Income</p>
              <p className="text-2xl font-extrabold mt-1 text-emerald-700">{fmt(summary.totalIncome)}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700"><TrendingUp size={20} /></div>
          </CardContent>
        </Card>
        <Card className="border-red-900/30 bg-red-950/10 text-ink shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-2xs text-red-600/80 uppercase font-bold tracking-wider">Total Expense</p>
              <p className="text-2xl font-extrabold mt-1 text-red-300">{fmt(summary.totalExpense)}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-red-50 text-red-600"><TrendingDown size={20} /></div>
          </CardContent>
        </Card>
        <Card className={`shadow-md text-ink ${summary.net >= 0 ? 'border-brand/20 bg-brand/5' : 'border-amber-200 bg-amber-50'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-2xs text-brand/80 uppercase font-bold tracking-wider">Net Balance (Live)</p>
              <p className={`text-2xl font-extrabold mt-1 ${summary.net >= 0 ? 'text-brand' : 'text-amber-600'}`}>{fmt(summary.net)}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-brand/10 text-brand"><Wallet size={20} /></div>
          </CardContent>
        </Card>
      </div>

      {view === 'monthly' && <MonthlyView userRole={userRole} />}

      {view === 'list' && (<>
      {/* Tabs */}
      <div className="flex border-b border-beige">
        {([['all', 'All'], ['INCOME', 'Income'], ['EXPENSE', 'Expense']] as const).map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setCategory('all'); setPage(1); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer -mb-px ${
              tab === id ? 'border-brand text-brand' : 'border-transparent text-mute hover:text-label hover:border-[#dcd5c8]'
            }`}>
            {id === 'INCOME' && <ArrowDownCircle size={14} />}
            {id === 'EXPENSE' && <ArrowUpCircle size={14} />}
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <Building2 size={13} className="text-mute" />
            <select value={unit} onChange={e => { setUnit(e.target.value); setPage(1); }}
              className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
              <option value="all">All Divisions</option>
              {allowedUnits.map(u => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
            </select>
          </div>
          <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}
            className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
            <option value="all">All Categories</option>
            {(tab === 'INCOME' ? INCOME_CATEGORIES : tab === 'EXPENSE' ? EXPENSE_CATEGORIES : [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]).map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-mute" />
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
              className="bg-field border border-beige text-label text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none" />
            <span className="text-mute text-xs">to</span>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
              className="bg-field border border-beige text-label text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none" />
          </div>
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={13} />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search description / reference..."
              className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand" />
          </div>
          {(userRole === 'DIRECTOR' || userRole === 'ACCOUNTANT' || userRole === 'PRINCIPAL') && (
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-mute border border-beige rounded-lg px-2 py-1.5 bg-field hover:bg-beige/20 transition-all">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-beige text-brand focus:ring-brand accent-brand cursor-pointer h-3.5 w-3.5"
              />
              <span>Show Deleted</span>
            </label>
          )}
          <span className="text-xs text-mute ml-auto">{total} entries</span>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
          ) : txns.length === 0 ? (
            <div className="text-center py-16">
              <Wallet size={36} className="mx-auto text-mute mb-3" />
              <p className="text-mute text-sm font-semibold">No entries found</p>
              <p className="text-mute text-xs mt-1">Collect a fee, pay a salary, or add a manual entry to see it here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[650px] overflow-y-auto border border-beige rounded-lg">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider sticky top-0 z-10">
                    <th className="p-4 bg-cream/95">Date</th>
                    <th className="p-4 bg-cream/95">Type</th>
                    <th className="p-4 bg-cream/95">Category</th>
                    <th className="p-4 bg-cream/95">Description</th>
                    <th className="p-4 bg-cream/95">Division</th>
                    <th className="p-4 text-right bg-cream/95">Amount</th>
                    <th className="p-4 text-center font-bold uppercase tracking-wider bg-cream/95">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {txns.map(t => {
                    const isIncome = t.direction === 'INCOME';
                    const who = t.student ? `${t.student.name} (${t.student.admissionNo})` : t.staff ? t.staff.name : '';
                    const showEdit = userRole === 'DIRECTOR' || userRole === 'ACCOUNTANT' || userRole === 'PRINCIPAL';
                    return (
                      <tr key={t.id} className="hover:bg-cream transition-colors">
                        <td className="p-4 text-mute whitespace-nowrap">{fmtDate(t.date)}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${
                            isIncome ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'
                          }`}>
                            {isIncome ? <ArrowDownCircle size={10} /> : <ArrowUpCircle size={10} />}
                            {isIncome ? 'IN' : 'OUT'}
                          </span>
                        </td>
                        <td className="p-4 text-label font-medium">{CATEGORY_LABELS[t.category] || t.category}</td>
                        <td className="p-4 text-mute max-w-xs truncate">
                          {t.description || who || '—'}
                          {t.referenceNo && <span className="text-mute font-mono ml-1.5">· {t.referenceNo}</span>}
                        </td>
                        <td className="p-4 text-mute">{t.unit?.name || '—'}</td>
                        <td className={`p-4 text-right font-mono font-bold ${isIncome ? 'text-emerald-700' : 'text-red-600'}`}>
                          {isIncome ? '+' : '−'}{fmt(t.amount)}
                        </td>
                        <td className="p-4 text-center space-x-3">
                          <button
                            onClick={() => { setReceiptTxn(t); setIsReceiptOpen(true); }}
                            className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                          >
                            Receipt
                          </button>
                          {showEdit && (
                            <>
                              {t.isDeleted ? (
                                <button
                                  onClick={() => startRestore(t)}
                                  className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                                >
                                  Restore
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => startEdit(t)}
                                    className="text-brand hover:underline font-semibold cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => startDelete(t)}
                                    className="text-red-600 hover:underline font-semibold cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Total Entries Count */}
      {!isLoading && txns.length > 0 && (
        <div className="flex items-center justify-between border-t border-beige pt-4 text-xs font-semibold text-mute">
          <span>Showing all <span className="text-label">{txns.length}</span> entries ({total} total)</span>
        </div>
      )}
      </>)}

      {editingTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-xl border border-beige bg-paper text-ink shadow-2xl p-6 relative flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-beige pb-3">
              <h2 className="text-base font-extrabold uppercase tracking-wider text-brand">
                Edit Financial Ledger Entry
              </h2>
              <button
                onClick={() => setEditingTxn(null)}
                className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {editError && (
              <div className="p-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <Label className="text-mute">Amount (₹)</Label>
                <Input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-mute">Date</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="border-beige bg-field text-ink text-xs focus-visible:ring-brand"
                />
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <Label className="text-mute">Category</Label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
              >
                {getFilteredCategories(editingTxn.unitId, editingTxn.direction, userRole).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 text-xs">
              <Label className="text-mute">Description</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="border-beige bg-field text-ink text-xs focus-visible:ring-brand"
              />
            </div>

            <div className="border-t border-beige pt-3 space-y-3 text-xs bg-brand/5 p-4 rounded-xl border border-brand/10">
              <div className="text-left">
                <h3 className="text-xs font-bold text-brand uppercase tracking-wider">
                  Compliance & Re-Authentication Gate
                </h3>
              </div>

              <div className="space-y-1">
                <Label className="text-mute font-bold">Reason Category for Editing</Label>
                <select
                  value={editReasonCategory}
                  onChange={(e) => setEditReasonCategory(e.target.value)}
                  className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="">— Select Predefined Reason —</option>
                  <option value="Typographical entry error (Incorrect Amount)">Typographical entry error (Incorrect Amount)</option>
                  <option value="Incorrect Category classification">Incorrect Category classification</option>
                  <option value="Invoice / Billing adjustment">Invoice / Billing adjustment</option>
                  <option value="Duplicate entry correction">Duplicate entry correction</option>
                  <option value="Other (Requires manual explanation)">Other (Requires manual explanation)</option>
                </select>
              </div>

              {editReasonCategory.startsWith('Other') && (
                <div className="space-y-1">
                  <Label className="text-mute font-bold">Detailed Explanation (Min 10 characters)</Label>
                  <textarea
                    value={editDetailExplanation}
                    onChange={(e) => setEditDetailExplanation(e.target.value)}
                    rows={2}
                    placeholder="Enter detailed reason here..."
                    className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none resize-none"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-mute font-bold">Confirm Password to Complete Edit</Label>
                <Input
                  type="password"
                  value={editConfirmPassword}
                  onChange={(e) => setEditConfirmPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="border-beige bg-field text-ink text-xs focus-visible:ring-brand"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-beige pt-3">
              <Button
                variant="outline"
                onClick={() => setEditingTxn(null)}
                className="text-xs h-9 border-beige text-mute hover:text-ink cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={
                  isSavingEdit ||
                  !editAmount ||
                  !editDate ||
                  !editReasonCategory ||
                  (editReasonCategory.startsWith('Other') && editDetailExplanation.trim().length < 10) ||
                  !editConfirmPassword
                }
                className="bg-brand hover:bg-[#4a2090] text-white font-bold text-xs h-9 px-5 rounded-lg cursor-pointer"
              >
                {isSavingEdit ? 'Saving...' : 'Apply Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {deletingTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-beige bg-paper text-ink shadow-2xl p-6 relative flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-beige pb-3">
              <h2 className="text-base font-extrabold uppercase tracking-wider text-red-600">
                Delete Financial Ledger Entry
              </h2>
              <button
                onClick={() => setDeletingTxn(null)}
                className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-mute leading-relaxed">
              Are you sure you want to delete this transaction of <span className="font-extrabold text-ink">{fmt(deletingTxn.amount)}</span>? 
              This will subtract the amount from the active Net Balance.
            </p>

            {deleteError && (
              <div className="p-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {deleteError}
              </div>
            )}

            <div className="border-t border-beige pt-3 space-y-3 text-xs bg-red-50/50 p-4 rounded-xl border border-red-200/20">
              <div className="space-y-1">
                <Label className="text-mute font-bold">Reason Category for Deleting</Label>
                <select
                  value={deleteReasonCategory}
                  onChange={(e) => setDeleteReasonCategory(e.target.value)}
                  className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="">— Select Predefined Reason —</option>
                  <option value="Duplicate entry cleanup">Duplicate entry cleanup</option>
                  <option value="Erroneous entry correction">Erroneous entry correction</option>
                  <option value="Billing transaction voided">Billing transaction voided</option>
                  <option value="Other (Requires manual explanation)">Other (Requires manual explanation)</option>
                </select>
              </div>

              {deleteReasonCategory.startsWith('Other') && (
                <div className="space-y-1">
                  <Label className="text-mute font-bold">Detailed Explanation (Min 10 characters)</Label>
                  <textarea
                    value={deleteDetailExplanation}
                    onChange={(e) => setDeleteDetailExplanation(e.target.value)}
                    rows={2}
                    placeholder="Enter detailed reason here..."
                    className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none resize-none"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-mute font-bold">Confirm Password to Complete Delete</Label>
                <Input
                  type="password"
                  value={deleteConfirmPassword}
                  onChange={(e) => setDeleteConfirmPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="border-beige bg-field text-ink text-xs focus-visible:ring-brand"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-beige pt-3">
              <Button
                variant="outline"
                onClick={() => setDeletingTxn(null)}
                className="text-xs h-9 border-beige text-mute hover:text-ink cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={saveDelete}
                disabled={
                  isDeleting ||
                  !deleteReasonCategory ||
                  (deleteReasonCategory.startsWith('Other') && deleteDetailExplanation.trim().length < 10) ||
                  !deleteConfirmPassword
                }
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-9 px-5 rounded-lg cursor-pointer"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {restoringTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-beige bg-paper text-ink shadow-2xl p-6 relative flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-beige pb-3">
              <h2 className="text-base font-extrabold uppercase tracking-wider text-emerald-700">
                Restore Deleted Entry (Revoke)
              </h2>
              <button
                onClick={() => setRestoringTxn(null)}
                className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-mute leading-relaxed">
              Are you sure you want to restore this deleted transaction of <span className="font-extrabold text-ink">{fmt(restoringTxn.amount)}</span>? 
              This will add the amount back to the active Net Balance.
            </p>

            {restoreError && (
              <div className="p-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg">
                {restoreError}
              </div>
            )}

            <div className="border-t border-beige pt-3 space-y-3 text-xs bg-emerald-50/50 p-4 rounded-xl border border-emerald-200/20">
              <div className="space-y-1">
                <Label className="text-mute font-bold">Reason Category for Restoring</Label>
                <select
                  value={restoreReasonCategory}
                  onChange={(e) => setRestoreReasonCategory(e.target.value)}
                  className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="">— Select Predefined Reason —</option>
                  <option value="Accidental deletion recovery">Accidental deletion recovery</option>
                  <option value="Audit verification override">Audit verification override</option>
                  <option value="Other (Requires manual explanation)">Other (Requires manual explanation)</option>
                </select>
              </div>

              {restoreReasonCategory.startsWith('Other') && (
                <div className="space-y-1">
                  <Label className="text-mute font-bold">Detailed Explanation (Min 10 characters)</Label>
                  <textarea
                    value={restoreDetailExplanation}
                    onChange={(e) => setRestoreDetailExplanation(e.target.value)}
                    rows={2}
                    placeholder="Enter detailed reason here..."
                    className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none resize-none"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-mute font-bold">Confirm Password to Complete Restore</Label>
                <Input
                  type="password"
                  value={restoreConfirmPassword}
                  onChange={(e) => setRestoreConfirmPassword(e.target.value)}
                  placeholder="Enter your account password"
                  className="border-beige bg-field text-ink text-xs focus-visible:ring-brand"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-beige pt-3">
              <Button
                variant="outline"
                onClick={() => setRestoringTxn(null)}
                className="text-xs h-9 border-beige text-mute hover:text-ink cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={saveRestore}
                disabled={
                  isRestoring ||
                  !restoreReasonCategory ||
                  (restoreReasonCategory.startsWith('Other') && restoreDetailExplanation.trim().length < 10) ||
                  !restoreConfirmPassword
                }
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs h-9 px-5 rounded-lg cursor-pointer"
              >
                {isRestoring ? 'Restoring...' : 'Confirm Restore'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal Overlay */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => { setIsReceiptOpen(false); setReceiptTxn(null); }}
        transaction={receiptTxn}
      />
    </div>
  );
}

// ─── Add Manual Entry ─────────────────────────────────────────────────────────

function AddEntryForm({ allowedUnits, onAdded, userRole }: { allowedUnits: string[]; onAdded: () => void; userRole: string }) {
  const [direction, setDirection] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [category, setCategory] = useState('OTHER_EXPENSE');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [unitId, setUnitId] = useState('');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cats = getFilteredCategories(unitId, direction, userRole);

  useEffect(() => {
    const validCats = getFilteredCategories(unitId, direction, userRole);
    if (!validCats.includes(category)) {
      setCategory(validCats[0] || (direction === 'INCOME' ? 'OTHER_INCOME' : 'OTHER_EXPENSE'));
    }
  }, [unitId, direction, category]);

  const submit = async () => {
    setError(null);
    if (!amount || Number(amount) <= 0) { setError('Enter a valid amount.'); return; }
    
    // Description validation
    if (direction === 'EXPENSE' && category === 'OTHER_EXPENSE') {
      if (!description.trim()) {
        setError('Description is mandatory for other expenses.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction, category, amount: Number(amount), date,
          description: description || undefined,
          unitId: unitId || undefined,
          paymentMode,
          receiptUrl: receiptUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setAmount('');
      setDescription('');
      setReceiptUrl('');
      triggerDataChange();
      onAdded();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to add entry.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Card className="border border-brand/20 bg-brand/5 text-ink shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-brand uppercase tracking-wider">Add Manual Entry</CardTitle>
        <CardDescription className="text-mute text-xs">Record any income or expense by hand.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
            <AlertCircle size={13} /> <span>{error}</span>
          </div>
        )}
        {/* Direction toggle */}
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button type="button" onClick={() => { setDirection('INCOME'); setCategory('OTHER_INCOME'); }}
            className={`flex items-center gap-2 p-3 rounded-lg border text-left cursor-pointer transition-all ${
              direction === 'INCOME' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-cream border-beige text-mute hover:border-[#c9c2b3]'
            }`}>
            <ArrowDownCircle size={18} /><div><p className="text-xs font-bold">Income</p><p className="text-3xs opacity-70">Money received</p></div>
          </button>
          <button type="button" onClick={() => { setDirection('EXPENSE'); setCategory('OTHER_EXPENSE'); }}
            className={`flex items-center gap-2 p-3 rounded-lg border text-left cursor-pointer transition-all ${
              direction === 'EXPENSE' ? 'bg-red-100 border-red-300 text-red-700' : 'bg-cream border-beige text-mute hover:border-[#c9c2b3]'
            }`}>
            <ArrowUpCircle size={18} /><div><p className="text-xs font-bold">Expense</p><p className="text-3xs opacity-70">Money paid out</p></div>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Category</Label>
            <select value={category} onChange={e => { setCategory(e.target.value); setReceiptUrl(''); }}
              className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
              {cats.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Amount</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                className="pl-6 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Division</Label>
            <select value={unitId} onChange={e => setUnitId(e.target.value)}
              className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
              <option value="">— None —</option>
              {allowedUnits.map(u => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Description {category === 'OTHER_EXPENSE' && '*'}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={category === 'OTHER_EXPENSE' ? 'Mandatory description details...' : 'What was this for?'}
              className="border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Payment Mode</Label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
              className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
              {['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI'].map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>

        {direction === 'EXPENSE' && ['ELECTRICITY', 'WATER', 'TELEPHONE_WIFI'].includes(category) && (
          <div className="max-w-md">
            <FileUploader
              label="Upload Bill Receipt (Optional)"
              pathParts={['Receipts', category]}
              value={receiptUrl}
              onUploadSuccess={(url) => setReceiptUrl(url)}
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={isSubmitting}
            className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2">
            {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {isSubmitting ? 'Saving...' : 'Save Entry'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Monthly View ─────────────────────────────────────────────────────────────
// Loads the last 12 months of income/expense totals and renders a card per month.
// Each card has Excel / PDF download buttons that hit /api/finance/export.

interface MonthlySummary {
  monthKey: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

function MonthlyView({ userRole }: { userRole: string }) {
  const [months, setMonths] = useState<MonthlySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Per-month "downloading" or "sending" flag so the spinner only spins on the clicked button.
  const [pending, setPending] = useState<Record<string, 'xlsx' | 'pdf' | 'send' | null>>({});
  const [sendMsg, setSendMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/finance/monthly-summary?months=12')
      .then(r => r.json())
      .then(d => { if (!cancelled) setMonths(d.summary || []); })
      .catch(() => { if (!cancelled) setError('Failed to load monthly summary.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sendNow = async (month: string, label: string) => {
    if (!confirm(`Send the ${label} report to the configured recipient(s) right now?\n\nThis will run Gemini for insights, generate the PDF, and email it via Gmail.`)) {
      return;
    }
    setSendMsg(null);
    setPending(p => ({ ...p, [month]: 'send' }));
    try {
      const res = await fetch(`/api/finance/send-report?month=${month}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send report.');
      setSendMsg({
        kind: 'ok',
        text: `Report for ${data.monthLabel} sent to ${data.to.join(', ')}${data.usedAi ? ' (with AI insights)' : ' (without AI — Gemini not configured)'}.`,
      });
    } catch (e: unknown) {
      setSendMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Send failed.' });
    } finally {
      setPending(p => ({ ...p, [month]: null }));
    }
  };

  const download = async (month: string, format: 'xlsx' | 'pdf') => {
    setPending(p => ({ ...p, [month]: format }));
    try {
      const res = await fetch(`/api/finance/export?month=${month}&format=${format}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to generate report.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MGE_Monthly_Report_${month.replace('-', '_')}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setPending(p => ({ ...p, [month]: null }));
    }
  };

  if (isLoading) {
    return (
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
        <AlertCircle size={14} /> <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {userRole === 'DIRECTOR' && (
        <p className="text-mute text-xs">
          Each month is its own report. Click <span className="font-semibold text-emerald-700">Excel</span> for a multi-sheet workbook,
          <span className="font-semibold text-brand"> PDF</span> for a printable report, or
          <span className="font-semibold text-amber-700"> Send</span> to email the PDF (with AI insights) to the configured recipient.
        </p>
      )}

      {sendMsg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
          sendMsg.kind === 'ok'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-600'
        }`}>
          {sendMsg.kind === 'ok' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
          <span>{sendMsg.text}</span>
          <button onClick={() => setSendMsg(null)} className="ml-auto text-mute hover:text-ink cursor-pointer"><X size={12} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {months.map(m => {
          const hasData = m.count > 0;
          const isCurrent = m.monthKey === new Date().toISOString().slice(0, 7);
          return (
            <Card key={m.monthKey} className={`shadow-md text-ink ${hasData ? 'border-beige bg-paper' : 'border-beige bg-cream'}`}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-2.5 rounded-lg bg-brand/10 text-brand shrink-0">
                    <Calendar size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-extrabold text-ink">{m.label}</p>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded text-3xs font-extrabold uppercase border bg-brand/10 text-brand border-brand/20">
                          Current
                        </span>
                      )}
                      {!hasData && (
                        <span className="text-2xs text-mute italic">no transactions</span>
                      )}
                    </div>
                    {hasData && (
                      <p className="text-xs text-mute mt-1 font-mono">
                        <span className="text-emerald-700">+{fmt(m.income)}</span>
                        {' · '}
                        <span className="text-red-600">-{fmt(m.expense)}</span>
                        {' · '}
                        <span className={`font-bold ${m.net >= 0 ? 'text-brand' : 'text-amber-600'}`}>
                          Net {m.net >= 0 ? '+' : ''}{fmt(m.net)}
                        </span>
                        <span className="text-mute font-sans"> &middot; {m.count} entries</span>
                      </p>
                    )}
                  </div>
                </div>

                {userRole === 'DIRECTOR' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={() => download(m.monthKey, 'xlsx')}
                      disabled={!hasData || pending[m.monthKey] === 'xlsx'}
                      className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5 disabled:opacity-50"
                      title="Download Excel workbook"
                    >
                      {pending[m.monthKey] === 'xlsx'
                        ? <Loader2 size={12} className="animate-spin" />
                        : <FileSpreadsheet size={12} />}
                      Excel
                    </Button>
                    <Button
                      onClick={() => download(m.monthKey, 'pdf')}
                      disabled={!hasData || pending[m.monthKey] === 'pdf'}
                      className="border border-brand/20 bg-brand/5 text-brand hover:bg-brand/10 font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5 disabled:opacity-50"
                      title="Download PDF report"
                    >
                      {pending[m.monthKey] === 'pdf'
                        ? <Loader2 size={12} className="animate-spin" />
                        : <FileText size={12} />}
                      PDF
                    </Button>
                    <Button
                      onClick={() => sendNow(m.monthKey, m.label)}
                      disabled={!hasData || !!pending[m.monthKey]}
                      className="border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5 disabled:opacity-50"
                      title="Email this report to the configured recipient(s) now"
                    >
                      {pending[m.monthKey] === 'send'
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Send size={12} />}
                      Send
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
