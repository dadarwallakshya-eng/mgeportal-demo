'use client';

/**
 * @file src/app/dashboard/page.tsx
 * @description Director-level dashboard with charts, stats cards, and recent transactions.
 *
 * DESIGN DECISIONS:
 * - High-end analytical cards with glowing border animations.
 * - Recharts visualizations: AreaChart for revenue trends, BarChart for students, PieChart for fees.
 * - Robust fallback mode: If the backend database isn't connected, it gracefully falls back to
 *   simulation data, displaying a friendly banner without throwing runtime errors.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDataSubscription } from '@/lib/events';
import {
  Users,
  GraduationCap,
  Bus,
  Coins,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Database,
  Building2,
  Search,
  Loader2,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  PlusCircle,
  DollarSign
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FileUploader } from '@/components/ui/file-uploader';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Cell,
  Pie,
  Legend,
} from 'recharts';

// ─── Data Types ──────────────────────────────────────────────────────────────

interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalDrivers: number;
  totalRevenue: number;
  activeBuses: number;
  hostelRooms: number;
  totalIncome?: number;
  totalExpense?: number;
  netBalance?: number;
}

interface Transaction {
  id: string;
  voucherNo: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  unit: string;
}

// ─── Rich Mock / Simulation Data ─────────────────────────────────────────────

const MOCK_STATS: DashboardStats = {
  totalStudents: 1420,
  totalTeachers: 78,
  totalDrivers: 14,
  totalRevenue: 2845000,
  activeBuses: 12,
  hostelRooms: 54,
};

const MOCK_REVENUE_DATA = [
  { name: 'Jan', revenue: 180000, expenses: 110000 },
  { name: 'Feb', revenue: 220000, expenses: 115000 },
  { name: 'Mar', revenue: 310000, expenses: 130000 },
  { name: 'Apr', revenue: 640000, expenses: 190000 }, // Admission season peak
  { name: 'May', revenue: 420000, expenses: 160000 },
  { name: 'Jun', revenue: 280000, expenses: 140000 },
];

const MOCK_STUDENT_DISTRIBUTION = [
  { name: 'Hindi Medium', students: 580, fill: '#6366f1' },
  { name: 'English Medium', students: 490, fill: '#3b82f6' },
  { name: 'College', students: 350, fill: '#10b981' },
];

const MOCK_FEE_COLLECTION = [
  { name: 'Collected', value: 2150000, color: '#10b981' },
  { name: 'Outstanding', value: 695000, color: '#f59e0b' },
];

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: '1', voucherNo: 'V-2026-0045', date: '2026-06-05', description: 'Student Fee Collection - Kavya Mishra', amount: 2600, type: 'credit', unit: 'Hindi Medium' },
  { id: '2', voucherNo: 'V-2026-0044', date: '2026-06-05', description: 'Diesel Purchase for Bus UP-53-T-1234', amount: 4500, type: 'debit', unit: 'Transport' },
  { id: '3', voucherNo: 'V-2026-0043', date: '2026-06-04', description: 'Salary Disbursed - Rajesh Kumar Sharma', amount: 35000, type: 'debit', unit: 'Hindi Medium' },
  { id: '4', voucherNo: 'V-2026-0042', date: '2026-06-04', description: 'Student Fee Collection - Rohan Verma', amount: 3200, type: 'credit', unit: 'English Medium' },
  { id: '5', voucherNo: 'V-2026-0041', date: '2026-06-03', description: 'Hostel Room Repair Material - First Floor', amount: 8400, type: 'debit', unit: 'Hostel' },
];

const QUICK_EXPENSE_CATEGORIES: Record<string, { value: string; label: string }[]> = {
  hostel: [
    { value: 'MESS', label: 'MESS' },
    { value: 'LAUNDRY', label: 'LAUNDRY' },
    { value: 'DAILY_USE', label: 'DAILY USE (POCKET MONEY)' },
    { value: 'OTHER_EXPENSE', label: 'OTHER EXPENSE' },
    { value: 'ELECTRICITY', label: 'ELECTRICITY BILL' },
    { value: 'WATER', label: 'WATER BILL' },
    { value: 'STATIONARY', label: 'STATIONARY' },
    { value: 'MAINTENANCE', label: 'BUILDING MAINTENANCE' },
    { value: 'TELEPHONE_WIFI', label: 'TELEPHONE & WIFI BILL' },
    { value: 'MARKETING', label: 'MARKETING EXPENSE' },
    { value: 'FURNITURE', label: 'FURNITURE' },
    { value: 'CLEANING', label: 'CLEANING EXPENSE' },
    { value: 'OFFICE_EXPENSE', label: 'OFFICE EXPENSE' },
  ],
  transport: [
    { value: 'TRANSPORT', label: 'TRANSPORT / FUEL' },
    { value: 'OTHER_EXPENSE', label: 'OTHER EXPENSE' },
    { value: 'ELECTRICITY', label: 'ELECTRICITY BILL' },
    { value: 'WATER', label: 'WATER BILL' },
    { value: 'STATIONARY', label: 'STATIONARY' },
    { value: 'MAINTENANCE', label: 'BUILDING MAINTENANCE' },
    { value: 'TELEPHONE_WIFI', label: 'TELEPHONE & WIFI BILL' },
    { value: 'MARKETING', label: 'MARKETING EXPENSE' },
    { value: 'FURNITURE', label: 'FURNITURE' },
    { value: 'CLEANING', label: 'CLEANING EXPENSE' },
    { value: 'OFFICE_EXPENSE', label: 'OFFICE EXPENSE' },
  ],
  hindi: [
    { value: 'TRANSPORT', label: 'TRANSPORT / FUEL' },
    { value: 'OTHER_EXPENSE', label: 'OTHER EXPENSE' },
    { value: 'ELECTRICITY', label: 'ELECTRICITY BILL' },
    { value: 'WATER', label: 'WATER BILL' },
    { value: 'STATIONARY', label: 'STATIONARY' },
    { value: 'MAINTENANCE', label: 'BUILDING MAINTENANCE' },
    { value: 'TELEPHONE_WIFI', label: 'TELEPHONE & WIFI BILL' },
    { value: 'MARKETING', label: 'MARKETING EXPENSE' },
    { value: 'FURNITURE', label: 'FURNITURE' },
    { value: 'CLEANING', label: 'CLEANING EXPENSE' },
    { value: 'OFFICE_EXPENSE', label: 'OFFICE EXPENSE' },
  ],
  english: [
    { value: 'TRANSPORT', label: 'TRANSPORT / FUEL' },
    { value: 'OTHER_EXPENSE', label: 'OTHER EXPENSE' },
    { value: 'ELECTRICITY', label: 'ELECTRICITY BILL' },
    { value: 'WATER', label: 'WATER BILL' },
    { value: 'STATIONARY', label: 'STATIONARY' },
    { value: 'MAINTENANCE', label: 'BUILDING MAINTENANCE' },
    { value: 'TELEPHONE_WIFI', label: 'TELEPHONE & WIFI BILL' },
    { value: 'MARKETING', label: 'MARKETING EXPENSE' },
    { value: 'FURNITURE', label: 'FURNITURE' },
    { value: 'CLEANING', label: 'CLEANING EXPENSE' },
    { value: 'OFFICE_EXPENSE', label: 'OFFICE EXPENSE' },
  ],
  college: [
    { value: 'TRANSPORT', label: 'TRANSPORT / FUEL' },
    { value: 'OTHER_EXPENSE', label: 'OTHER EXPENSE' },
    { value: 'ELECTRICITY', label: 'ELECTRICITY BILL' },
    { value: 'WATER', label: 'WATER BILL' },
    { value: 'STATIONARY', label: 'STATIONARY' },
    { value: 'MAINTENANCE', label: 'BUILDING MAINTENANCE' },
    { value: 'TELEPHONE_WIFI', label: 'TELEPHONE & WIFI BILL' },
    { value: 'MARKETING', label: 'MARKETING EXPENSE' },
    { value: 'FURNITURE', label: 'FURNITURE' },
    { value: 'CLEANING', label: 'CLEANING EXPENSE' },
    { value: 'OFFICE_EXPENSE', label: 'OFFICE EXPENSE' },
  ],
};

function getQuickExpenseCategories(unitId: string): { value: string; label: string }[] {
  return QUICK_EXPENSE_CATEGORIES[unitId] || [{ value: 'OTHER_EXPENSE', label: 'OTHER EXPENSE' }];
}

export default function DashboardHome() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [stats, setStats] = useState<DashboardStats>(MOCK_STATS);
  const [revenueData, setRevenueData] = useState<any[]>(MOCK_REVENUE_DATA);
  const [feeCollection, setFeeCollection] = useState<any[]>(MOCK_FEE_COLLECTION);
  const [studentDistribution, setStudentDistribution] = useState<any[]>(MOCK_STUDENT_DISTRIBUTION);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [activeUnit, setActiveUnit] = useState<string>('all');
  const router = useRouter();

  // Quick Fee Collection States
  const [collectSearchQuery, setCollectSearchQuery] = useState('');
  const [collectSearchResults, setCollectSearchResults] = useState<any[]>([]);
  const [collectStudent, setCollectStudent] = useState<any>(null);
  const [collectAllocations, setCollectAllocations] = useState<any[]>([]);
  const [collectAmounts, setCollectAmounts] = useState<Record<string, string>>({});
  const [collectSelectedIds, setCollectSelectedIds] = useState<Set<string>>(new Set());
  const [collectLumpSum, setCollectLumpSum] = useState('');
  const [collectPayMode, setCollectPayMode] = useState('CASH');
  const [collectRefNo, setCollectRefNo] = useState('');
  const [collectLoading, setCollectLoading] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collectSuccess, setCollectSuccess] = useState<string | null>(null);
  const [isSearchingStudent, setIsSearchingStudent] = useState(false);

  // Quick Expense States
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('OTHER_EXPENSE');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expensePayMode, setExpensePayMode] = useState('CASH');
  const [expenseUnitId, setExpenseUnitId] = useState('');
  const [expenseReceiptUrl, setExpenseReceiptUrl] = useState('');
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseSuccess, setExpenseSuccess] = useState<string | null>(null);



  useEffect(() => {
    const validCats = getQuickExpenseCategories(expenseUnitId).map(c => c.value);
    if (!validCats.includes(expenseCategory)) {
      setExpenseCategory(validCats[0] || 'OTHER_EXPENSE');
    }
  }, [expenseUnitId, expenseCategory]);

  useEffect(() => {
    async function checkRoleAndRedirect() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const { user } = await res.json();
          setCurrentUser(user);
          if (user.accessUnits && user.accessUnits.length > 0) {
            setExpenseUnitId(user.accessUnits[0]);
          }
          if (user.role === 'DATA_ENTRY') {
            router.push('/dashboard/students');
            return;
          }
          if (user.role === 'DEPARTMENT_HEAD') {
            if (user.accessUnits.includes('transport')) {
              router.push('/dashboard/transport');
            } else if (user.accessUnits.includes('hostel')) {
              router.push('/dashboard/hostel');
            }
          }
        }
      } catch (err) {
        console.error('Error in checkRoleAndRedirect:', err);
      }
    }
    checkRoleAndRedirect();
  }, [router]);

  const handleSelectStudent = async (student: any) => {
    setIsSearchingStudent(true);
    setCollectError(null);
    setCollectSuccess(null);
    setCollectStudent(null);
    setCollectAllocations([]);
    setCollectAmounts({});
    setCollectSelectedIds(new Set());
    setCollectLumpSum('');
    setCollectSearchResults([]);

    try {
      const detailRes = await fetch(`/api/students/${student.id}`);
      if (!detailRes.ok) throw new Error('Failed to load student details.');
      const detailData = await detailRes.json();

      const sData = detailData.student;
      setCollectStudent(sData);
      
      // Calculate net balances with concessions
      const pctByComponent = new Map<string, number>();
      (sData.concessions || []).forEach((c: any) => {
        if (c.discountType === 'PERCENTAGE') {
          pctByComponent.set(c.feeComponentName, Number(c.value));
        }
      });

      const outstanding = (sData.feeAllocations || [])
        .map((a: any) => {
          const orig = Number(a.amountDue);
          const paid = Number(a.amountPaid);
          const pct = pctByComponent.get(a.feeComponent.name) ?? 0;
          const net = orig * (1 - pct / 100);
          const balance = Math.max(0, net - paid);
          return { ...a, balance, netDue: net };
        })
        .filter((a: any) => a.balance > 0.005 && a.status !== 'PAID');

      setCollectAllocations(outstanding);
      
      // Pre-populate values
      const initAmounts: Record<string, string> = {};
      const initSelected = new Set<string>();
      outstanding.forEach((a: any) => {
        initAmounts[a.id] = String(parseFloat(a.balance.toFixed(2)));
        initSelected.add(a.id);
      });
      setCollectAmounts(initAmounts);
      setCollectSelectedIds(initSelected);

      if (outstanding.length === 0) {
        setCollectSuccess('All fees cleared! This student has no outstanding dues.');
      }
    } catch (err: any) {
      setCollectError(err.message || 'Error loading student details.');
    } finally {
      setIsSearchingStudent(false);
    }
  };

  const handleLoadStudent = async () => {
    if (!collectSearchQuery.trim()) return;
    setIsSearchingStudent(true);
    setCollectError(null);
    setCollectSuccess(null);
    setCollectStudent(null);
    setCollectAllocations([]);
    setCollectSearchResults([]);
    setCollectAmounts({});
    setCollectSelectedIds(new Set());
    setCollectLumpSum('');

    try {
      const searchRes = await fetch(`/api/students?search=${encodeURIComponent(collectSearchQuery.trim())}&limit=10`);
      if (!searchRes.ok) throw new Error('Failed to search student.');
      const searchData = await searchRes.json();
      const results = searchData.students || [];

      if (results.length === 0) {
        throw new Error('No student found matching your search query.');
      }

      // Check if there is an exact Admission ID match first
      const exactMatch = results.find(
        (s: any) => s.admissionNo.toLowerCase() === collectSearchQuery.trim().toLowerCase()
      );

      if (exactMatch) {
        await handleSelectStudent(exactMatch);
      } else if (results.length === 1) {
        // Only one match found, auto-select
        await handleSelectStudent(results[0]);
      } else {
        // Multiple matches found, show the selection list
        setCollectSearchResults(results);
      }
    } catch (err: any) {
      setCollectError(err.message || 'Error searching student.');
    } finally {
      setIsSearchingStudent(false);
    }
  };

  const toggleCollectAlloc = (id: string) => {
    const next = new Set(collectSelectedIds);
    if (next.has(id)) {
      next.delete(id);
      setCollectAmounts({ ...collectAmounts, [id]: '0' });
    } else {
      next.add(id);
      const alloc = collectAllocations.find((a) => a.id === id);
      if (alloc) {
        setCollectAmounts({ ...collectAmounts, [id]: String(parseFloat(alloc.balance.toFixed(2))) });
      }
    }
    setCollectSelectedIds(next);
    setCollectLumpSum(''); // reset lump sum on manual tweak
  };

  const handleAmountChange = (id: string, val: string) => {
    const nextAmounts = { ...collectAmounts, [id]: val };
    setCollectAmounts(nextAmounts);

    const next = new Set(collectSelectedIds);
    const num = Number(val);
    if (!isNaN(num) && num > 0) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setCollectSelectedIds(next);
    setCollectLumpSum(''); // Reset lump sum on manual tweak
  };

  const handleLumpSumChange = (amountStr: string) => {
    setCollectLumpSum(amountStr);
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) {
      const resetAmounts: Record<string, string> = {};
      collectAllocations.forEach((a) => {
        resetAmounts[a.id] = '0';
      });
      setCollectAmounts(resetAmounts);
      setCollectSelectedIds(new Set());
      return;
    }

    // Sort by due date (oldest first)
    const sorted = [...collectAllocations].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );

    let remaining = amount;
    const newAmounts: Record<string, string> = {};
    const newSelected = new Set<string>();

    for (const alloc of sorted) {
      if (remaining <= 0) {
        newAmounts[alloc.id] = '0';
      } else {
        const applied = Math.min(alloc.balance, remaining);
        newAmounts[alloc.id] = String(parseFloat(applied.toFixed(2)));
        newSelected.add(alloc.id);
        remaining -= applied;
      }
    }
    setCollectAmounts(newAmounts);
    setCollectSelectedIds(newSelected);
  };

  const handleQuickCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollectError(null);
    setCollectSuccess(null);

    if (!collectStudent || collectAllocations.length === 0) return;
    
    const totalSelected = Array.from(collectSelectedIds).reduce(
      (sum, id) => sum + (Number(collectAmounts[id]) || 0),
      0
    );

    if (collectSelectedIds.size === 0 || totalSelected <= 0) {
      setCollectError('Select at least one fee allocation and specify a payment amount.');
      return;
    }

    // Validate that no amount exceeds the allocation outstanding balance
    for (const id of Array.from(collectSelectedIds)) {
      const amt = Number(collectAmounts[id]) || 0;
      const alloc = collectAllocations.find((a) => a.id === id);
      if (alloc && amt > alloc.balance + 0.01) {
        setCollectError(`Amount for ${alloc.feeComponent.name} exceeds outstanding balance of ₹${alloc.balance.toFixed(2)}.`);
        return;
      }
    }

    setCollectLoading(true);

    try {
      const payloadAllocs = Array.from(collectSelectedIds)
        .filter((id) => Number(collectAmounts[id]) > 0)
        .map((id) => ({
          allocationId: id,
          amount: Number(collectAmounts[id]),
        }));

      const res = await fetch('/api/fees/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: collectStudent.id,
          paymentMode: collectPayMode,
          paymentDate: new Date().toISOString().split('T')[0],
          referenceNo: collectRefNo || undefined,
          allocations: payloadAllocs,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed.');

      setCollectSuccess(`Successfully collected ₹${totalSelected.toLocaleString('en-IN')}! Receipt: ${data.payment.receiptNo}`);
      
      // Reset fee form
      setCollectLumpSum('');
      setCollectRefNo('');
      setCollectStudent(null);
      setCollectAllocations([]);
      setCollectAmounts({});
      setCollectSelectedIds(new Set());
      setCollectSearchQuery('');
      setCollectSearchResults([]);
      
      // Refresh dashboard data
      fetchDashboardData();
    } catch (err: any) {
      setCollectError(err.message || 'Error processing collection.');
    } finally {
      setCollectLoading(false);
    }
  };

  const handleQuickExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseError(null);
    setExpenseSuccess(null);

    const amountNum = Number(expenseAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setExpenseError('Please enter a valid positive amount.');
      return;
    }



    // Description validation
    if (expenseCategory === 'OTHER_EXPENSE') {
      if (!expenseDescription.trim()) {
        setExpenseError('Description is mandatory for other expenses.');
        return;
      }
    }

    setExpenseLoading(true);

    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: 'EXPENSE',
          category: expenseCategory,
          amount: amountNum,
          date: new Date().toISOString().split('T')[0],
          description: expenseDescription.trim() || undefined,
          unitId: expenseUnitId || null,
          paymentMode: expensePayMode,
          receiptUrl: expenseReceiptUrl || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record expense.');

      setExpenseSuccess(`Successfully logged expense of ₹${amountNum.toLocaleString('en-IN')}!`);
      setExpenseAmount('');
      setExpenseDescription('');
      setExpenseReceiptUrl('');
      
      // Refresh dashboard numbers
      fetchDashboardData();
    } catch (err: any) {
      setExpenseError(err.message || 'Error logging expense.');
    } finally {
      setExpenseLoading(false);
    }
  };

  useEffect(() => {
    // Listen for unit changes from the header selector
    const handleUnitChange = () => {
      const unit = localStorage.getItem('mge-active-unit') || 'all';
      setActiveUnit(unit);
    };

    window.addEventListener('mge-unit-changed', handleUnitChange);
    handleUnitChange(); // Initial check

    return () => {
      window.removeEventListener('mge-unit-changed', handleUnitChange);
    };
  }, []);

  const fetchDashboardData = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/summary?unit=${activeUnit}`);
      if (!res.ok) throw new Error('Database disconnected');
      const data = await res.json();
      setStats(data.stats);
      if (data.revenueData) setRevenueData(data.revenueData);
      if (data.feeCollection) setFeeCollection(data.feeCollection);
      if (data.studentDistribution) setStudentDistribution(data.studentDistribution);
      if (data.transactions) setTransactions(data.transactions);
      setIsSimulationMode(false);
    } catch {
      // Fallback to simulation mode data
      setIsSimulationMode(true);
      // Tweak numbers slightly based on unit to make UI look interactive
      if (activeUnit === 'hindi') {
        setStats({ ...MOCK_STATS, totalStudents: 580, totalRevenue: 1120000 });
        setStudentDistribution([{ name: 'Hindi Medium', students: 580, fill: '#6366f1' }]);
        setFeeCollection([
          { name: 'Collected', value: 900000, color: '#10b981' },
          { name: 'Outstanding', value: 220000, color: '#f59e0b' }
        ]);
      } else if (activeUnit === 'english') {
        setStats({ ...MOCK_STATS, totalStudents: 490, totalRevenue: 980000 });
        setStudentDistribution([{ name: 'English Medium', students: 490, fill: '#3b82f6' }]);
        setFeeCollection([
          { name: 'Collected', value: 800000, color: '#10b981' },
          { name: 'Outstanding', value: 180000, color: '#f59e0b' }
        ]);
      } else if (activeUnit === 'college') {
        setStats({ ...MOCK_STATS, totalStudents: 350, totalRevenue: 745000 });
        setStudentDistribution([{ name: 'College', students: 350, fill: '#10b981' }]);
        setFeeCollection([
          { name: 'Collected', value: 600000, color: '#10b981' },
          { name: 'Outstanding', value: 145000, color: '#f59e0b' }
        ]);
      } else {
        setStats(MOCK_STATS);
        setStudentDistribution(MOCK_STUDENT_DISTRIBUTION);
        setFeeCollection(MOCK_FEE_COLLECTION);
      }
    }
  }, [activeUnit]);

  // Fetch real statistics if DB is connected, otherwise fallback
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Subscribe to real-time events
  useDataSubscription(fetchDashboardData);

  const totalReceivables = feeCollection.reduce((sum, item) => sum + item.value, 0);
  const formattedReceivables = totalReceivables >= 1000000
    ? `₹${(totalReceivables / 1000000).toFixed(2)}M`
    : `₹${totalReceivables.toLocaleString('en-IN')}`;

  if (!currentUser || currentUser.role === 'DATA_ENTRY') {
    return (
      <div className="flex flex-col items-center justify-center py-48 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <span className="text-mute text-xs font-semibold">Verifying credentials...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Simulation / Fallback Mode Notice ─────────────────────────────── */}
      {isSimulationMode && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-brand/20 bg-brand/5 backdrop-blur text-xs text-brand">
          <div className="flex items-center gap-2.5">
            <Database size={16} className="text-brand animate-pulse" />
            <p>
              <span className="font-bold">Database Standby:</span> You are viewing simulated system data. Complete connection details in the <code>.env</code> file to sync with Supabase.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded bg-brand/15 font-bold border border-brand/30 uppercase tracking-wide text-3xs shrink-0 select-none">
            Simulation Active
          </span>
        </div>
      )}



      {/* ── Quick Actions Grid (Fee Collect & Expense) ────────────────────── */}
      {currentUser && (currentUser.role === 'PRINCIPAL' || currentUser.role === 'DIRECTOR' || currentUser.role === 'DATA_ENTRY') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Quick Fee Collection */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute flex items-center gap-2">
                <Coins size={16} className="text-brand" />
                <span>Quick Fee Collection</span>
              </CardTitle>
              <CardDescription className="text-mute text-xs">
                Search by Name, Father's Name, Phone, or Admission ID.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!collectStudent ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={collectSearchQuery}
                      onChange={(e) => setCollectSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLoadStudent()}
                      placeholder="Name, ID, Father's name, or Phone..."
                      className="border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand text-xs h-9"
                    />
                    <Button
                      onClick={handleLoadStudent}
                      disabled={isSearchingStudent || !collectSearchQuery.trim()}
                      className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer shrink-0 gap-1.5"
                    >
                      {isSearchingStudent ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Search size={13} />
                      )}
                      <span>Search</span>
                    </Button>
                  </div>

                  {collectSearchResults.length > 0 && (
                    <div className="border border-beige rounded-lg divide-y divide-beige bg-field max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                      <p className="text-[10px] text-mute uppercase font-bold tracking-wider px-3 py-1.5 bg-cream">Matching Students</p>
                      {collectSearchResults.map((s: any) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => handleSelectStudent(s)}
                          className="w-full text-left p-2.5 hover:bg-brand/5 group flex items-center justify-between text-xs transition-colors cursor-pointer"
                        >
                          <div className="truncate">
                            <p className="font-bold text-ink group-hover:text-brand truncate">{s.name}</p>
                            <p className="text-[10px] text-mute font-mono truncate">
                              {s.admissionNo} &bull; Class {s.className}-{s.section} &bull; Father: {s.fatherName}
                            </p>
                          </div>
                          <ChevronRight size={14} className="text-mute group-hover:text-brand shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleQuickCollectSubmit} className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-lg border border-brand/20 bg-brand/5">
                    <div className="truncate">
                      <p className="text-xs font-bold text-ink truncate">{collectStudent.name}</p>
                      <p className="text-[10px] text-mute font-mono mt-0.5 truncate">
                        {collectStudent.admissionNo} &bull; Class {collectStudent.className}-{collectStudent.section}
                      </p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => {
                        setCollectStudent(null);
                        setCollectAllocations([]);
                      }}
                      className="h-7 w-7 p-0 bg-transparent hover:bg-cream border border-beige text-mute hover:text-ink cursor-pointer shrink-0"
                    >
                      <RotateCcw size={12} />
                    </Button>
                  </div>

                  {collectAllocations.length > 0 && (
                    <div className="space-y-3.5">
                      {/* Lump Sum Helper */}
                      <div className="space-y-1 bg-cream/30 p-2.5 rounded-lg border border-beige/60">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">
                            Lump Sum Auto-Distribute (₹)
                          </Label>
                          {collectLumpSum && (
                            <span className="text-[9px] text-brand font-medium">
                              Auto-distributed (Oldest first)
                            </span>
                          )}
                        </div>
                        <Input
                          type="number"
                          value={collectLumpSum}
                          onChange={(e) => handleLumpSumChange(e.target.value)}
                          placeholder="Enter total amount (e.g. 5000)"
                          className="border-beige bg-field text-ink focus-visible:ring-brand text-xs h-8.5"
                        />
                      </div>

                      {/* Outstanding Dues List */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">
                          Outstanding Fee Components
                        </Label>
                        <div className="border border-beige rounded-lg divide-y divide-beige/50 bg-field max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                          {collectAllocations.map((a) => {
                            const isChecked = collectSelectedIds.has(a.id);
                            const amountVal = collectAmounts[a.id] || '';
                            const formattedDueDate = new Date(a.dueDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            });
                            
                            return (
                              <div
                                key={a.id}
                                className={`flex items-center justify-between p-2.5 text-xs transition-colors ${
                                  isChecked ? 'bg-brand/5' : 'hover:bg-cream/20'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleCollectAlloc(a.id)}
                                    className="h-4 w-4 rounded border-beige text-brand focus:ring-brand accent-brand cursor-pointer shrink-0"
                                  />
                                  <div className="truncate">
                                    <p className="font-semibold text-ink truncate">
                                      {a.feeComponent.name}
                                    </p>
                                    <p className="text-[10px] text-mute mt-0.5">
                                      Due: {formattedDueDate}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-3 shrink-0 ml-3">
                                  <div className="text-right">
                                    <span className="text-[10px] text-mute block">Outstanding</span>
                                    <span className="font-bold text-ink">
                                      ₹{a.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  
                                  <div className="relative flex items-center w-24">
                                    <span className="absolute left-2 text-xs text-mute font-mono font-medium">₹</span>
                                    <input
                                      type="number"
                                      value={amountVal}
                                      onChange={(e) => handleAmountChange(a.id, e.target.value)}
                                      placeholder="0.00"
                                      className="pl-5 pr-2 py-1 text-xs border border-beige rounded-md bg-field text-right w-full font-mono font-semibold focus:ring-1 focus:ring-brand focus:outline-none"
                                      max={parseFloat(a.balance.toFixed(2))}
                                      min={0}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Payment Settings */}
                      <div className="grid grid-cols-2 gap-3 bg-cream/20 p-2.5 rounded-lg border border-beige/40">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">
                            Payment Mode
                          </Label>
                          <select
                            value={collectPayMode}
                            onChange={(e) => setCollectPayMode(e.target.value)}
                            className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none h-8.5 font-medium cursor-pointer"
                          >
                            <option value="CASH">CASH</option>
                            <option value="UPI">UPI</option>
                            <option value="BANK_TRANSFER">BANK TRANSFER</option>
                            <option value="CHEQUE">CHEQUE</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">
                            Reference / Receipt Notes
                          </Label>
                          <Input
                            value={collectRefNo}
                            onChange={(e) => setCollectRefNo(e.target.value)}
                            placeholder="TXN or Cheque No."
                            className="border-beige bg-field text-ink focus-visible:ring-brand text-xs h-8.5"
                          />
                        </div>
                      </div>

                      {/* Summary & Submit */}
                      <div className="pt-1.5 space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-xs font-semibold text-mute">
                            Total Selected Components:
                          </span>
                          <span className="text-sm font-black text-brand">
                            ₹
                            {Array.from(collectSelectedIds)
                              .reduce((sum, id) => sum + (Number(collectAmounts[id]) || 0), 0)
                              .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <Button
                          type="submit"
                          disabled={
                            collectLoading ||
                            Array.from(collectSelectedIds).reduce((sum, id) => sum + (Number(collectAmounts[id]) || 0), 0) <= 0
                          }
                          className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs h-9 rounded-lg cursor-pointer gap-1.5 transition-colors shadow-sm"
                        >
                          {collectLoading ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}
                          <span>Collect Dues</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {collectError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                  <AlertCircle size={13} className="shrink-0" />
                  <span className="truncate">{collectError}</span>
                </div>
              )}

              {collectSuccess && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                  <CheckCircle2 size={13} className="shrink-0" />
                  <span className="font-semibold">{collectSuccess}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Quick Expense Logging */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute flex items-center gap-2">
                <PlusCircle size={16} className="text-red-600" />
                <span>Quick Expense Log</span>
              </CardTitle>
              <CardDescription className="text-mute text-xs">
                Log a division-scoped operational expense instantly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleQuickExpenseSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">Amount (₹)</Label>
                    <Input
                      type="number"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="Amount in Rupees"
                      className="border-beige bg-field text-ink focus-visible:ring-brand text-xs h-9"
                      min={1}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">Category</Label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value)}
                      className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      {getQuickExpenseCategories(expenseUnitId).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">Payment Mode</Label>
                    <select
                      value={expensePayMode}
                      onChange={(e) => setExpensePayMode(e.target.value)}
                      className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">BANK TRANSFER</option>
                      <option value="CHEQUE">CHEQUE</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">Division / Unit</Label>
                    <select
                      value={expenseUnitId}
                      onChange={(e) => setExpenseUnitId(e.target.value)}
                      className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      {currentUser && currentUser.accessUnits && currentUser.accessUnits.map((u: string) => (
                        <option key={u} value={u}>
                          {u === 'hindi' ? 'Hindi Medium' : u === 'english' ? 'English Medium' : u === 'college' ? 'College' : u}
                        </option>
                      ))}
                      {(!currentUser || !currentUser.accessUnits || currentUser.accessUnits.length === 0) && (
                        <option value="">No permitted units</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-mute uppercase font-bold tracking-wider">
                    Description {expenseCategory === 'OTHER_EXPENSE' && '*'}
                  </Label>
                  <Input
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder={expenseCategory === 'OTHER_EXPENSE' ? 'Mandatory description details...' : 'e.g. Purchased office registers'}
                    className="border-beige bg-field text-ink focus-visible:ring-brand text-xs h-9"
                  />
                </div>

                {['ELECTRICITY', 'WATER', 'TELEPHONE_WIFI'].includes(expenseCategory) && (
                  <div className="space-y-1">
                    <FileUploader
                      label="Upload Bill Receipt (Optional)"
                      pathParts={['Receipts', expenseCategory]}
                      value={expenseReceiptUrl}
                      onUploadSuccess={(url) => setExpenseReceiptUrl(url)}
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={
                    expenseLoading || 
                    !expenseAmount || 
                    (expenseCategory === 'OTHER_EXPENSE' && !expenseDescription.trim())
                  }
                  className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold text-xs h-9 rounded-lg cursor-pointer gap-1.5"
                >
                  {expenseLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={13} />
                  )}
                  <span>Log Expense</span>
                </Button>
              </form>

              {expenseError && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs mt-2">
                  <AlertCircle size={13} className="shrink-0" />
                  <span className="truncate">{expenseError}</span>
                </div>
              )}

              {expenseSuccess && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs mt-2">
                  <CheckCircle2 size={13} className="shrink-0" />
                  <span className="font-semibold">{expenseSuccess}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Stats Metric Cards Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Students Card */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-mute uppercase tracking-wider">
              Total Students
            </span>
            <div className="p-2 rounded-lg bg-brand/10 text-brand">
              <Users size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight">{stats.totalStudents}</div>
            <p className="text-2xs text-emerald-700 font-medium flex items-center gap-1 mt-1.5">
              <TrendingUp size={12} />
              <span>Active Enrollment</span>
            </p>
          </CardContent>
        </Card>

        {/* Staff Members Card */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-mute uppercase tracking-wider">
              Staff Directory
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <GraduationCap size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight">
              {stats.totalTeachers + stats.totalDrivers}
            </div>
            <p className="text-2xs text-mute font-medium mt-1.5">
              {stats.totalTeachers} teachers • {stats.totalDrivers} drivers
            </p>
          </CardContent>
        </Card>

        {/* Transport Fleet Card */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-mute uppercase tracking-wider">
              Active Fleet
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
              <Bus size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight">{stats.activeBuses}</div>
            <p className="text-2xs text-emerald-700 font-medium flex items-center gap-1 mt-1.5">
              <span>All routes active</span>
            </p>
          </CardContent>
        </Card>

        {/* Net Balance Card (live: income − expense) */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-semibold text-mute uppercase tracking-wider">
              Net Balance
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Coins size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight">
              ₹{(stats.netBalance ?? stats.totalRevenue).toLocaleString('en-IN')}
            </div>
            <p className="text-2xs text-emerald-700 font-medium flex items-center gap-1 mt-1.5">
              <Clock size={12} />
              <span>
                {stats.totalIncome !== undefined
                  ? `₹${stats.totalIncome.toLocaleString('en-IN')} in · ₹${(stats.totalExpense ?? 0).toLocaleString('en-IN')} out`
                  : 'Live income minus expense'}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Revenue and Expense Area Chart (2/3 width) */}
        <Card className="border-beige bg-paper text-ink shadow-md lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
              Financial Summary (Last 6 Months)
            </CardTitle>
            <CardDescription className="text-mute text-xs">
              Fee Collections vs Operating Expenditures
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ece6db" />
                <XAxis dataKey="name" stroke="#8a8898" fontSize={11} />
                <YAxis stroke="#8a8898" fontSize={11} tickFormatter={(val) => `₹${val/1000}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ece6db', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Fee Collection Status Pie Chart (1/3 width) */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
              Outstanding Dues
            </CardTitle>
            <CardDescription className="text-mute text-xs">
              Fee Collections vs Outstanding receivables
            </CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex flex-col justify-between items-center pb-6">
            <div className="w-full h-56 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={feeCollection}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {feeCollection.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || (index === 0 ? '#10b981' : '#f59e0b')} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => `₹${Number(value).toLocaleString('en-IN')}`}
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ece6db', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                <span className="text-mute text-[9px] uppercase tracking-widest font-extrabold leading-none">Total</span>
                <span className="text-mute text-[9px] uppercase tracking-widest font-extrabold leading-none mt-1">Receivables</span>
                <span className="text-base font-extrabold mt-2 text-ink">{formattedReceivables}</span>
              </div>
            </div>
            {/* Legend breakdown */}
            <div className="flex gap-6 text-xs w-full justify-center">
              {feeCollection.map((item, index) => {
                const color = item.color || (index === 0 ? '#10b981' : '#f59e0b');
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-mute">
                      {item.name} ({totalReceivables > 0 ? Math.round(item.value / totalReceivables * 100) : 0}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Student Distribution Bar Chart & Recent Transactions ────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Student Enrollment distribution (1/3 width) */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
              Students Distribution
            </CardTitle>
            <CardDescription className="text-mute text-xs">
              Students count breakdown across academic divisions
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={studentDistribution} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ece6db" />
                <XAxis dataKey="name" stroke="#8a8898" fontSize={10} />
                <YAxis stroke="#8a8898" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #ece6db', borderRadius: '8px' }}
                />
                <Bar dataKey="students" radius={[4, 4, 0, 0]}>
                  {studentDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill || '#8884d8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Financial Journal Transactions (2/3 width) */}
        <Card className="border-beige bg-paper text-ink shadow-md lg:col-span-2">
          <CardHeader className="pb-3">
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
                Recent Transactions
              </CardTitle>
              <CardDescription className="text-mute text-xs">
                Latest general ledger postings and double-entry items
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto overflow-y-auto max-h-[320px] pr-1 scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-beige text-mute font-bold uppercase tracking-wider sticky top-0 bg-paper z-10">
                    <th className="py-2.5">Voucher</th>
                    <th className="py-2.5">Date</th>
                    <th className="py-2.5">Description</th>
                    <th className="py-2.5">Division</th>
                    <th className="py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige text-label font-medium">
                  {transactions.slice(0, 10).map((tx) => (
                    <tr key={tx.id} className="hover:bg-cream transition-colors">
                      <td className="py-3 font-mono font-bold text-mute">{tx.voucherNo}</td>
                      <td className="py-3 text-mute">{tx.date}</td>
                      <td className="py-3 truncate max-w-[180px] sm:max-w-xs">{tx.description}</td>
                      <td className="py-3">
                        <span className="flex items-center gap-1.5">
                           <Building2 size={12} className="text-mute" />
                          {tx.unit}
                        </span>
                      </td>
                      <td className={`py-3 text-right font-bold ${
                        tx.type === 'credit' ? 'text-emerald-700' : 'text-red-600'
                      }`}>
                        {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
