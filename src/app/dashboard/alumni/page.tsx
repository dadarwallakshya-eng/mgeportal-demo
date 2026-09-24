'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  GraduationCap,
  Users,
  CheckCircle2,
  AlertCircle,
  Search,
  Eye,
  Loader2,
  Building2,
  TrendingUp,
  Download,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';

interface AlumStudent {
  id: string;
  name: string;
  nameHindi: string | null;
  admissionNo: string;
  className: string;
  unitId: string;
  unitName: string;
  phone: string | null;
  fatherPhone: string | null;
  totalOrig: number;
  totalPaid: number;
  balanceDue: number;
}

interface AlumniMetrics {
  totalAlumni: number;
  duesClearedCount: number;
  withDuesCount: number;
  totalOutstanding: number;
  totalPaid: number;
  divisionBreakdown: Record<string, number>;
}

const UNIT_LABELS: Record<string, string> = {
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
};

const COLORS = ['#10b981', '#f59e0b']; // Paid (emerald), Dues (amber)

const fmtRupee = (n: number) =>
  `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function AlumniPortalPage() {
  const router = useRouter();
  const [alumni, setAlumni] = useState<AlumStudent[]>([]);
  const [earlyLeavers, setEarlyLeavers] = useState<AlumStudent[]>([]);
  const [metrics, setMetrics] = useState<AlumniMetrics | null>(null);
  const [earlyLeaversMetrics, setEarlyLeaversMetrics] = useState<AlumniMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [userRole, setUserRole] = useState<string>('');

  // Alumni category tab selector
  const [alumniTypeTab, setAlumniTypeTab] = useState<'graduated' | 'early_leavers'>('graduated');

  // UI Filters
  const [search, setSearch] = useState('');
  const [activeDivision, setActiveDivision] = useState<string>('all');
  const [duesFilter, setDuesFilter] = useState<'with_dues' | 'cleared'>('with_dues');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        type: alumniTypeTab === 'graduated' ? 'alumni' : 'early_leavers',
        unit: activeDivision,
        duesFilter: duesFilter,
      });
      if (search.trim()) params.append('search', search.trim());
      window.open(`/api/export?${params.toString()}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch session
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
          throw new Error('Unauthorized');
        }
        const meData = await meRes.json();
        setAllowedUnits(meData.user.accessUnits || []);
        setUserRole(meData.user.role || '');

        // Fetch alumni data
        const res = await fetch('/api/alumni');
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to fetch alumni');
        }
        const data = await res.json();
        setAlumni(data.alumni || []);
        setEarlyLeavers(data.earlyLeavers || []);
        setMetrics(data.metrics || null);
        setEarlyLeaversMetrics(data.earlyLeaversMetrics || null);
      } catch (err: any) {
        setError(err.message || 'An error occurred.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleReadmit = async (studentId: string, name: string) => {
    const confirmReadmit = window.confirm(
      `Are you sure you want to RE-ADMIT '${name}'? This restores their status to ACTIVE and re-enables their student profile.`
    );
    if (!confirmReadmit) return;

    try {
      const res = await fetch(`/api/students/${studentId}/readmit`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Re-admission failed');

      alert(`'${name}' has been successfully re-admitted to ACTIVE status!`);
      window.location.reload();
    } catch (err: any) {
      alert('Error re-admitting student: ' + err.message);
    }
  };

  const handleDelete = async (studentId: string, name: string) => {
    const confirmDelete = window.confirm(
      `WARNING: Are you sure you want to PERMANENTLY DELETE '${name}'? This will erase their student profile, fees history, hostel details, and transaction history. This action cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/students/${studentId}?permanent=true`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error((await res.json()).error || 'Deletion failed');

      alert(`'${name}' has been permanently deleted from the database!`);
      window.location.reload();
    } catch (err: any) {
      alert('Error deleting student: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <span className="text-mute text-xs font-semibold">Loading Alumni Portal...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-xl mx-auto text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-red-600 mx-auto" />
        <h2 className="text-lg font-bold text-ink">Failed to Access Alumni Portal</h2>
        <p className="text-sm text-mute leading-relaxed">{error}</p>
        <Button onClick={() => router.push('/dashboard')} className="bg-brand text-white">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // Filtered list based on active tab selection
  const activeList = alumniTypeTab === 'graduated' ? alumni : earlyLeavers;
  const filteredAlumni = activeList.filter((a) => {
    // Division filter
    if (activeDivision !== 'all' && a.unitId !== activeDivision) return false;

    // Dues filter
    if (duesFilter === 'with_dues' && a.balanceDue <= 0.005) return false;
    if (duesFilter === 'cleared' && a.balanceDue > 0.005) return false;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const nameMatch = a.name.toLowerCase().includes(q);
      const admMatch = a.admissionNo.toLowerCase().includes(q);
      const parentPhoneMatch = a.fatherPhone?.includes(q) || false;
      return nameMatch || admMatch || parentPhoneMatch;
    }

    return true;
  });

  const activeMetrics = alumniTypeTab === 'graduated' ? metrics : earlyLeaversMetrics;
  const activeTotalCount = activeMetrics
    ? (alumniTypeTab === 'graduated' ? activeMetrics.totalAlumni : (activeMetrics as any).totalEarlyLeavers)
    : 0;

  // Chart data 1: Paid vs Dues Pie
  const pieData = activeMetrics
    ? [
        { name: 'Paid Fees', value: activeMetrics.totalPaid, color: '#10b981' },
        { name: 'Outstanding Dues', value: activeMetrics.totalOutstanding, color: '#f59e0b' },
      ]
    : [];

  // Chart data 2: Division dues bar
  const barData = activeMetrics
    ? Object.keys(activeMetrics.divisionBreakdown).map((key) => ({
        name: UNIT_LABELS[key] || key.toUpperCase(),
        Outstanding: activeMetrics.divisionBreakdown[key],
      }))
    : [];

  const percentageCleared = activeMetrics && activeTotalCount > 0
    ? Math.round((activeMetrics.duesClearedCount / activeTotalCount) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Page Header ────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <GraduationCap size={26} className="text-brand" />
          <span>Alumni Portal Dashboard</span>
        </h1>
        <p className="text-xs text-mute mt-1">
          Monitor collections, review outstanding dues, and manage graduated or withdrawn student accounts.
        </p>
      </div>

      {/* ── Metrics Cards ────────────────────────────────────────── */}
      {activeMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-beige bg-paper text-ink shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-mute uppercase tracking-wider">
                  {alumniTypeTab === 'graduated' ? 'Total Alumni' : 'Total Early Leavers'}
                </span>
                <h3 className="text-2xl font-extrabold tracking-tight text-ink mt-1">
                  {activeTotalCount}
                </h3>
                <p className="text-[10px] text-mute mt-0.5">
                  {alumniTypeTab === 'graduated' ? 'graduated from school' : 'left school early'}
                </p>
              </div>
              <div className="p-2.5 bg-brand/10 text-brand rounded-lg">
                <Users size={20} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-beige bg-paper text-ink shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-mute uppercase tracking-wider">Dues Cleared</span>
                <h3 className="text-2xl font-extrabold tracking-tight text-emerald-600 mt-1">
                  {activeMetrics.duesClearedCount}
                </h3>
                <p className="text-[10px] text-emerald-600/80 font-semibold mt-0.5">
                  {percentageCleared}% of total
                </p>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                <CheckCircle2 size={20} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-beige bg-paper text-ink shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-mute uppercase tracking-wider">With Pending Dues</span>
                <h3 className="text-2xl font-extrabold tracking-tight text-amber-600 mt-1">
                  {activeMetrics.withDuesCount}
                </h3>
                <p className="text-[10px] text-amber-600/80 font-semibold mt-0.5">
                  {activeTotalCount > 0 ? Math.round((activeMetrics.withDuesCount / activeTotalCount) * 100) : 0}% require collection
                </p>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-500 rounded-lg border border-amber-100">
                <AlertCircle size={20} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-beige bg-paper text-ink shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-mute uppercase tracking-wider">Total Outstanding</span>
                <h3 className="text-2xl font-extrabold tracking-tight text-brand mt-1">
                  {fmtRupee(activeMetrics.totalOutstanding)}
                </h3>
                <p className="text-[10px] text-mute mt-0.5">collected {fmtRupee(activeMetrics.totalPaid)} so far</p>
              </div>
              <div className="p-2.5 bg-[#f5efe6] text-brand rounded-lg">
                <TrendingUp size={20} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Charts Panel ────────────────────────────────────────── */}
      {activeMetrics && activeTotalCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Paid vs Dues Allocation Chart */}
          <Card className="border-beige bg-paper text-ink shadow-md lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">
                Paid vs Dues Ratio
              </CardTitle>
              <CardDescription className="text-mute text-2xs">
                Collection ratio out of all fees invoiced.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64 flex flex-col justify-between items-center pb-4">
              <div className="w-full h-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => fmtRupee(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                  <span className="text-[8px] text-mute uppercase tracking-widest font-extrabold">Dues Ratio</span>
                  <span className="text-sm font-extrabold text-ink mt-1">
                    {activeMetrics.totalOutstanding + activeMetrics.totalPaid > 0
                      ? Math.round((activeMetrics.totalOutstanding / (activeMetrics.totalOutstanding + activeMetrics.totalPaid)) * 100)
                      : 0}%
                  </span>
                </div>
              </div>
              <div className="flex gap-4 justify-center text-2xs font-bold text-mute w-full">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500"></span>Paid: {fmtRupee(activeMetrics.totalPaid)}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500"></span>Dues: {fmtRupee(activeMetrics.totalOutstanding)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Division Breakdown Chart */}
          <Card className="border-beige bg-paper text-ink shadow-md lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">
                Outstanding Dues by Division
              </CardTitle>
              <CardDescription className="text-mute text-2xs">
                Distribution of unpaid receivables across media / sections.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ece6db" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8f8373', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#8f8373', fontWeight: 600 }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip formatter={(value: any) => fmtRupee(Number(value))} />
                  <Bar dataKey="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={45} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Alumni Directory Section ────────────────────────────────────────── */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardHeader className="pb-3 border-b border-beige flex flex-col md:flex-row md:items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
              {alumniTypeTab === 'graduated' ? 'Alumni Dues Directory' : 'Early Leavers Directory'}
            </CardTitle>
            <CardDescription className="text-mute text-xs">
              {alumniTypeTab === 'graduated'
                ? 'Filtered listing of graduated students. Open profile to collect fees.'
                : 'Filtered listing of students who left school early before graduating.'}
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2.5 items-center">
            {/* Category selection tabs */}
            <div className="flex items-center gap-1 shrink-0 bg-field border border-beige rounded-lg p-0.5">
              <button
                onClick={() => { setAlumniTypeTab('graduated'); setSearch(''); }}
                className={`px-3 py-1 text-3xs font-extrabold uppercase rounded transition-all cursor-pointer ${
                  alumniTypeTab === 'graduated'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-mute hover:text-ink'
                }`}
              >
                Graduated
              </button>
              <button
                onClick={() => { setAlumniTypeTab('early_leavers'); setSearch(''); }}
                className={`px-3 py-1 text-3xs font-extrabold uppercase rounded transition-all cursor-pointer ${
                  alumniTypeTab === 'early_leavers'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-mute hover:text-ink'
                }`}
              >
                Early Leavers
              </button>
            </div>
            {/* Search Bar */}
            <div className="relative shrink-0 w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" size={14} />
              <Input
                type="text"
                placeholder="Search by student, Admission ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand text-xs"
              />
            </div>

            {/* Division filter selector */}
            <div className="flex items-center gap-1 shrink-0 bg-field border border-beige rounded-lg p-0.5">
              <button
                onClick={() => setActiveDivision('all')}
                className={`px-2.5 py-1 text-3xs font-extrabold uppercase rounded transition-all cursor-pointer ${
                  activeDivision === 'all'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-mute hover:text-ink'
                }`}
              >
                All
              </button>
              {allowedUnits.map((u) => (
                <button
                  key={u}
                  onClick={() => setActiveDivision(u)}
                  className={`px-2.5 py-1 text-3xs font-extrabold uppercase rounded transition-all cursor-pointer ${
                    activeDivision === u
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-mute hover:text-ink'
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Dues filter sub-tabs */}
            <div className="flex items-center gap-1 shrink-0 bg-field border border-beige rounded-lg p-0.5">
              <button
                onClick={() => setDuesFilter('with_dues')}
                className={`px-2.5 py-1 text-3xs font-extrabold uppercase rounded transition-all cursor-pointer ${
                  duesFilter === 'with_dues'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-mute hover:text-ink'
                }`}
              >
                With Dues
              </button>
              <button
                onClick={() => setDuesFilter('cleared')}
                className={`px-2.5 py-1 text-3xs font-extrabold uppercase rounded transition-all cursor-pointer ${
                  duesFilter === 'cleared'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-mute hover:text-ink'
                }`}
              >
                Cleared
              </button>
            </div>

            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="border border-beige bg-cream hover:bg-beige text-mute hover:text-ink font-semibold text-xs h-8 px-3 gap-1.5 rounded-lg cursor-pointer shrink-0 flex items-center shadow-sm"
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
              ) : (
                <Download size={13} />
              )}
              <span>Export</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredAlumni.length === 0 ? (
            <div className="text-center py-16">
              <Users size={28} className="mx-auto text-mute mb-2" />
              <p className="text-mute text-xs font-semibold">No alumni matches found</p>
              <p className="text-mute text-2xs mt-1">Try resetting the search box or changing tab filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-3">Admission ID</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Division</th>
                    <th className="p-3">Last Class</th>
                    <th className="p-3">Contact Phone</th>
                    <th className="p-3 text-right">Total Paid</th>
                    <th className="p-3 text-right">Outstanding Dues</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige text-label font-medium">
                  {filteredAlumni.map((alum) => (
                    <tr
                      key={alum.id}
                      onClick={() => router.push(`/dashboard/students/${alum.id}`)}
                      className="hover:bg-cream transition-colors cursor-pointer"
                    >
                      <td className="p-3 font-mono font-bold text-brand">{alum.admissionNo}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-ink">{alum.name}</span>
                          {alum.nameHindi && <span className="text-2xs text-mute">{alum.nameHindi}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-mute">{alum.unitName}</td>
                      <td className="p-3 font-semibold">{alum.className}</td>
                      <td className="p-3 font-mono text-mute">{alum.phone || alum.fatherPhone || '—'}</td>
                      <td className="p-3 text-right font-mono text-emerald-700">{fmtRupee(alum.totalPaid)}</td>
                      <td className={`p-3 text-right font-mono font-bold ${alum.balanceDue > 0.005 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmtRupee(alum.balanceDue)}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleReadmit(alum.id, alum.name)}
                            title="Re-admit Student"
                            className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center gap-1 cursor-pointer border border-emerald-200"
                          >
                            <RotateCcw size={12} />
                            <span>Re-admit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(alum.id, alum.name)}
                            title="Delete Student Permanently"
                            className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[10px] flex items-center gap-1 cursor-pointer border border-red-200"
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
