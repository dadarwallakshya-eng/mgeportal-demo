'use client';

/**
 * @file src/app/dashboard/transport/page.tsx
 * @description Transport Department — Dashboard, Bus Stations, Fleet, Drivers, and Finance.
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Bus, MapPin, Search, Plus, Loader2, AlertCircle, CheckCircle2, X, Pencil, Trash,
  Users, IndianRupee, Route, UserCheck, Phone, Wallet, Clock, ArrowRightLeft,
  FileText, ShieldCheck, Download, PlusCircle, LayoutDashboard
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FileUploader } from '@/components/ui/file-uploader';
import { toViewableImageUrl } from '@/lib/imageUrl';
import { PaymentMode } from '@prisma/client';
import { triggerDataChange, useDataSubscription } from '@/lib/events';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Station {
  id: string;
  stationNo: number;
  name: string;
  perMonth: string | number;
  perYear: string | number;
  isActive: boolean;
  _count?: { students: number };
}

interface BusRecord {
  id: string;
  busNo: string;
  route: string;
  seatingCapacity: number;
  status: string;
  driver: { id: string; name: string; phone: string | null; licenseNo: string | null };
  registrationDate?: string | null;
  fitnessExpiry?: string | null;
  taxExpiry?: string | null;
  insuranceExpiry?: string | null;
  puccExpiry?: string | null;
  permitExpiry?: string | null;
}

interface DriverOption {
  id: string;
  name: string;
}

interface DriverRecord {
  id: string;
  staffNo: string | null;
  name: string;
  phone: string | null;
  licenseNo: string | null;
  employmentType: string;
  status: string;
  photoUrl: string | null;
  monthlyBaseSalary: string | number;
  paidThisMonth: number;
  remainingThisMonth: number;
  buses?: { busNo: string }[];
}

interface TransactionRecord {
  id: string;
  direction: 'INCOME' | 'EXPENSE';
  category: string;
  amount: string | number;
  date: string;
  description: string | null;
  paymentMode: string | null;
  referenceNo: string | null;
  receiptUrl: string | null;
  source: string | null;
  staff?: { name: string; staffNo: string | null } | null;
}

const fmt = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const getSourceDivision = (desc: string | null | undefined): string => {
  if (!desc) return 'General';
  if (desc.includes('[Intrasystem Budget Transfer from ')) {
    const match = desc.match(/from (.*?)\]/);
    return match ? match[1] : 'General';
  }
  return 'General';
};

const formatDescription = (desc: string | null | undefined): React.ReactNode => {
  if (!desc) return '—';
  
  if (desc.includes('[Intrasystem Budget Transfer from ')) {
    const parts = desc.split(']');
    const sourceMatch = parts[0].match(/from (.*)/);
    const source = sourceMatch ? sourceMatch[1] : 'Division';
    const detail = parts.slice(1).join(']').trim();
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-100">
            Budget Received
          </span>
          <span className="text-3xs text-mute font-bold">
            from {source}
          </span>
        </div>
        <span className="font-semibold text-ink text-xs mt-0.5">{detail || 'General Allocation'}</span>
      </div>
    );
  }

  if (desc.includes('[Intrasystem Budget Transfer to Transport]')) {
    const detail = desc.replace('[Intrasystem Budget Transfer to Transport]', '').trim();
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-3xs font-extrabold uppercase bg-red-50 text-red-700 border border-red-100">
            Budget Transferred
          </span>
          <span className="text-3xs text-mute font-bold">
            to Transport
          </span>
        </div>
        <span className="font-semibold text-ink text-xs mt-0.5">{detail || 'General Allocation'}</span>
      </div>
    );
  }

  return <span className="font-semibold text-ink text-xs">{desc}</span>;
};

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/transport/dashboard')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={36} className="mx-auto text-mute mb-3" />
        <p className="text-mute text-sm font-semibold">Failed to load dashboard metrics.</p>
      </div>
    );
  }

  const { metrics, trend } = data;

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="border-beige bg-paper text-ink shadow-sm"><CardContent className="p-4 flex flex-col justify-between h-24">
          <p className="text-3xs uppercase tracking-wider font-extrabold text-mute">Total Stations</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-extrabold">{metrics.totalStations}</span>
            <MapPin size={16} className="text-brand" />
          </div>
        </CardContent></Card>

        <Card className="border-beige bg-paper text-ink shadow-sm"><CardContent className="p-4 flex flex-col justify-between h-24">
          <p className="text-3xs uppercase tracking-wider font-extrabold text-mute">Active Buses</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-extrabold">{metrics.activeBuses}</span>
            <Bus size={16} className="text-brand" />
          </div>
        </CardContent></Card>

        <Card className="border-beige bg-paper text-ink shadow-sm"><CardContent className="p-4 flex flex-col justify-between h-24">
          <p className="text-3xs uppercase tracking-wider font-extrabold text-mute">Total Riders</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-extrabold">{metrics.totalRiders}</span>
            <Users size={16} className="text-brand" />
          </div>
        </CardContent></Card>

        <Card className="border-beige bg-paper text-ink shadow-sm"><CardContent className="p-4 flex flex-col justify-between h-24">
          <p className="text-3xs uppercase tracking-wider font-extrabold text-mute">Active Drivers</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-extrabold">{metrics.activeDrivers}</span>
            <UserCheck size={16} className="text-brand" />
          </div>
        </CardContent></Card>

        <Card className="border-beige bg-paper text-ink shadow-sm border-l-4 border-l-emerald-600"><CardContent className="p-4 flex flex-col justify-between h-24">
          <p className="text-3xs uppercase tracking-wider font-extrabold text-mute">Monthly Budget</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-extrabold text-emerald-700">{fmt(metrics.monthlyIncome)}</span>
            <Wallet size={16} className="text-emerald-700" />
          </div>
        </CardContent></Card>

        <Card className="border-beige bg-paper text-ink shadow-sm border-l-4 border-l-red-600"><CardContent className="p-4 flex flex-col justify-between h-24">
          <p className="text-3xs uppercase tracking-wider font-extrabold text-mute">Monthly Spend</p>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-xl font-extrabold text-red-700">{fmt(metrics.monthlyExpense)}</span>
            <Clock size={16} className="text-red-700" />
          </div>
        </CardContent></Card>
      </div>

      {/* Responsive Visual Trend Chart */}
      <Card className="border-beige bg-paper text-ink shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Budget vs Spend (6-Month Trend)</CardTitle>
          <CardDescription className="text-2xs text-mute">Intrasystem allocations vs fuel, maintenance & driver payroll payouts.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <div className="h-64 flex flex-col justify-between">
            {/* Visual Bars Container */}
            <div className="flex-1 flex items-end justify-around gap-4 pt-10 pb-2 border-b border-beige">
              {trend.map((t: any, idx: number) => {
                const maxVal = Math.max(...trend.map((x: any) => Math.max(x.income, x.expense, 1000)));
                const incHeight = (t.income / maxVal) * 100;
                const expHeight = (t.expense / maxVal) * 100;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative">
                    <div className="w-full flex items-end justify-center gap-1.5 h-44">
                      {/* Budget Allocation Bar */}
                      <div
                        style={{ height: `${incHeight}%` }}
                        className="w-4 sm:w-6 bg-brand/35 group-hover:bg-brand/60 rounded-t transition-all"
                      />
                      {/* Spent Expense Bar */}
                      <div
                        style={{ height: `${expHeight}%` }}
                        className="w-4 sm:w-6 bg-red-600/35 group-hover:bg-red-600/60 rounded-t transition-all"
                      />
                    </div>
                    <span className="text-3xs font-semibold text-mute mt-2">{t.label}</span>

                    {/* Premium Hover Card */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col bg-cream text-ink text-3xs p-2.5 rounded-lg border border-beige shadow-xl z-10 w-36 pointer-events-none gap-0.5">
                      <p className="font-bold text-center border-b border-beige pb-1 mb-1">{t.label}</p>
                      <p className="flex justify-between"><span>Budget:</span> <span className="font-bold text-emerald-700">{fmt(t.income)}</span></p>
                      <p className="flex justify-between"><span>Spent:</span> <span className="font-bold text-red-700">{fmt(t.expense)}</span></p>
                      <p className="flex justify-between border-t border-beige pt-1 mt-1 font-bold"><span>Net:</span> <span className={t.net >= 0 ? 'text-emerald-700' : 'text-red-700'}>{fmt(t.net)}</span></p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chart Legend */}
            <div className="flex justify-center gap-6 mt-4 text-3xs font-semibold text-mute">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-brand/40 border border-brand/20 rounded" /> Budget Allocations (Income)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-red-600/40 border border-red-600/20 rounded" /> Fleet Expenses (Spent)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Stations Tab ─────────────────────────────────────────────────────────────

function StationsTab({ isDirector }: { isDirector: boolean }) {
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<{ perMonth: string; perYear: string }>({ perMonth: '', perYear: '' });
  const [showAdd, setShowAdd] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    const params = new URLSearchParams({ type: 'transport_stations' });
    if (search.trim()) params.append('search', search.trim());
    window.open(`/api/export?${params.toString()}`);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/transport/stations?includeInactive=true');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStations(data.stations || []);
    } catch { setStations([]); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  const filtered = stations.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) || String(s.stationNo).includes(search)
  );

  const totalRiders = stations.reduce((sum, s) => sum + (s._count?.students || 0), 0);

  const startEdit = (s: Station) => {
    setEditingId(s.id);
    setEditVals({ perMonth: String(s.perMonth), perYear: String(s.perYear) });
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/transport/stations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perMonth: 0, perYear: Number(editVals.perYear) }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      load();
    } catch { alert('Failed to update fare.'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search station name or number..."
              className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand" />
          </div>
          <span className="text-xs text-mute">
            <span className="text-label font-bold">{stations.length}</span> stations ·{' '}
            <span className="text-label font-bold">{totalRiders}</span> riders
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download size={14} />}
            <span>Export</span>
          </Button>
          {isDirector && (
            <Button onClick={() => setShowAdd(v => !v)}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer">
              {showAdd ? <X size={14} /> : <Plus size={14} />} {showAdd ? 'Close' : 'Add Station'}
            </Button>
          )}
        </div>
      </div>

      {showAdd && isDirector && <AddStationForm onAdded={() => { setShowAdd(false); load(); }} nextNo={Math.max(0, ...stations.map(s => s.stationNo)) + 1} />}

      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <MapPin size={36} className="mx-auto text-mute mb-3" />
              <p className="text-mute text-sm font-semibold">No stations found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-4 w-16">No.</th>
                    <th className="p-4">Station Name</th>
                    <th className="p-4 text-right">Annual Fare</th>
                    <th className="p-4 text-center">Riders</th>
                    {isDirector && <th className="p-4 text-center w-20">Edit</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {filtered.map(s => {
                    const isEditing = editingId === s.id;
                    return (
                      <tr key={s.id} className={`transition-colors ${isEditing ? 'bg-brand/5' : 'hover:bg-cream'} ${!s.isActive ? 'opacity-40' : ''}`}>
                        <td className="p-4 font-mono font-bold text-mute">{s.stationNo}</td>
                        <td className="p-4 font-semibold text-ink">{s.name}</td>
                        <td className="p-4 text-right font-mono font-semibold text-brand">
                          {isEditing ? (
                            <div className="relative w-24 ml-auto">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
                              <input type="number" value={editVals.perYear}
                                onChange={e => setEditVals(v => ({ ...v, perYear: e.target.value }))}
                                className="w-full pl-5 pr-1 py-1 bg-field border border-[#dcd5c8] rounded text-right text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand" />
                            </div>
                          ) : fmt(s.perYear)}
                        </td>
                        <td className="p-4 text-center">
                          <span className="inline-flex items-center gap-1 text-mute">
                            <Users size={11} /> {s._count?.students || 0}
                          </span>
                        </td>
                        {isDirector && (
                          <td className="p-4 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => saveEdit(s.id)} className="p-1.5 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white cursor-pointer">
                                  <CheckCircle2 size={12} />
                                </button>
                                <button onClick={() => setEditingId(null)} className="p-1.5 rounded bg-beige hover:bg-beige text-label cursor-pointer">
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => startEdit(s)} className="p-1.5 rounded bg-cream hover:bg-beige text-mute hover:text-ink cursor-pointer">
                                <Pencil size={12} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddStationForm({ onAdded, nextNo }: { onAdded: () => void; nextNo: number }) {
  const [stationNo, setStationNo] = useState(String(nextNo));
  const [name, setName] = useState('');
  const [perYear, setPerYear] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !perYear) { setError('All fields are required.'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transport/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationNo: Number(stationNo), name, perMonth: 0, perYear: Number(perYear) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onAdded();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to add station.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Card className="border border-brand/20 bg-brand/5 text-ink">
      <CardContent className="p-4 space-y-3">
        {error && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle size={13} /> {error}</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1"><Label className="text-2xs text-mute">Station No.</Label>
            <Input type="number" value={stationNo} onChange={e => setStationNo(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
          <div className="space-y-1 col-span-1 md:col-span-1"><Label className="text-2xs text-mute">Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Station name" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
          <div className="space-y-1"><Label className="text-2xs text-mute">Annual Fare ₹</Label>
            <Input type="number" value={perYear} onChange={e => setPerYear(e.target.value)} placeholder="6000" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
        </div>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={isSubmitting}
            className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
            {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Fleet Tab ────────────────────────────────────────────────────────────────

function FleetTab({ canManage }: { canManage: boolean }) {
  const [buses, setBuses] = useState<BusRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    window.open('/api/export?type=transport_fleet');
  };

  const [busNo, setBusNo] = useState('');
  const [route, setRoute] = useState('');
  const [driverId, setDriverId] = useState('');
  const [capacity, setCapacity] = useState('');
  
  const [registrationDate, setRegistrationDate] = useState('');
  const [fitnessExpiry, setFitnessExpiry] = useState('');
  const [taxExpiry, setTaxExpiry] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [puccExpiry, setPUCCExpiry] = useState('');
  const [permitExpiry, setPermitExpiry] = useState('');

  const [editingBus, setEditingBus] = useState<BusRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/transport/buses');
      const data = await res.json();
      setBuses(data.buses || []);
    } catch { setBuses([]); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  useEffect(() => {
    if (!showAdd && !editingBus) return;
    fetch('/api/staff?unit=all&type=DRIVER&status=ACTIVE&limit=100')
      .then(r => r.json()).then(d => setDrivers((d.staff || []).map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => setDrivers([]));
  }, [showAdd, editingBus]);

  const submit = async () => {
    setError(null);
    if (!busNo.trim() || !route.trim() || !driverId || !capacity) { setError('All fields are required.'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transport/buses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busNo, route, driverId, seatingCapacity: Number(capacity),
          registrationDate: registrationDate || undefined,
          fitnessExpiry: fitnessExpiry || undefined,
          taxExpiry: taxExpiry || undefined,
          insuranceExpiry: insuranceExpiry || undefined,
          puccExpiry: puccExpiry || undefined,
          permitExpiry: permitExpiry || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setShowAdd(false);
      setBusNo(''); setRoute(''); setDriverId(''); setCapacity('');
      setRegistrationDate(''); setFitnessExpiry(''); setTaxExpiry(''); setInsuranceExpiry(''); setPUCCExpiry(''); setPermitExpiry('');
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to add bus.'); }
    finally { setIsSubmitting(false); }
  };

  const getExpiryStatus = (dateStr?: string | null) => {
    if (!dateStr) return { color: 'text-mute', text: '—' };
    const expiry = new Date(dateStr);
    const today = new Date();
    const dExp = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
    const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((dExp.getTime() - dToday.getTime()) / (1000 * 60 * 60 * 24));
    const formatted = dExp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    if (diff < 0) {
      return { color: 'text-red-600 font-bold bg-red-50 border border-red-100 rounded px-1 text-[10px]', text: `${formatted} (Expired)` };
    }
    if (diff <= 10) {
      return { color: 'text-amber-600 font-bold bg-amber-50 border border-amber-100 rounded px-1 text-[10px]', text: `${formatted} (Expiring soon)` };
    }
    return { color: 'text-ink font-medium', text: formatted };
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mute"><span className="text-label font-bold">{buses.length}</span> buses in fleet</span>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download size={14} />}
            <span>Export</span>
          </Button>
          {canManage && (
            <Button onClick={() => setShowAdd(v => !v)}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer">
              {showAdd ? <X size={14} /> : <Plus size={14} />} {showAdd ? 'Close' : 'Add Bus'}
            </Button>
          )}
        </div>
      </div>

      {showAdd && canManage && (
        <Card className="border border-brand/20 bg-brand/5 text-ink">
          <CardContent className="p-4 space-y-3">
            {error && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle size={13} /> {error}</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1"><Label className="text-2xs text-mute">Bus No.</Label>
                <Input value={busNo} onChange={e => setBusNo(e.target.value)} placeholder="RJ-21-PA-1234" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Route</Label>
                <Input value={route} onChange={e => setRoute(e.target.value)} placeholder="Route description" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Driver</Label>
                <select value={driverId} onChange={e => setDriverId(e.target.value)}
                  className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                  <option value="">Select driver...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Seats</Label>
                <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="40" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              
              <div className="space-y-1"><Label className="text-2xs text-mute">Reg Date</Label>
                <Input type="date" value={registrationDate} onChange={e => setRegistrationDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Fitness Expiry</Label>
                <Input type="date" value={fitnessExpiry} onChange={e => setFitnessExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Tax Expiry</Label>
                <Input type="date" value={taxExpiry} onChange={e => setTaxExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Insurance Expiry</Label>
                <Input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">PUCC Expiry</Label>
                <Input type="date" value={puccExpiry} onChange={e => setPUCCExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Permit Expiry</Label>
                <Input type="date" value={permitExpiry} onChange={e => setPermitExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            </div>
            {drivers.length === 0 && <p className="text-2xs text-amber-600/80">No active drivers found. Add a staff member with type &quot;Driver&quot; first.</p>}
            <div className="flex justify-end">
              <Button onClick={submit} disabled={isSubmitting}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
                {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add Bus
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
      ) : buses.length === 0 ? (
        <div className="text-center py-16">
          <Bus size={36} className="mx-auto text-mute mb-3" />
          <p className="text-mute text-sm font-semibold">No buses in the fleet yet</p>
          <p className="text-mute text-xs mt-1">Add a bus and assign one of your registered drivers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {buses.map(b => (
            <Card key={b.id} className="border-beige bg-paper text-ink shadow-md">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700"><Bus size={16} /></div>
                    <div>
                      <p className="font-bold text-ink font-mono">{b.busNo}</p>
                      <span className={`text-3xs font-bold uppercase ${b.status === 'ACTIVE' ? 'text-emerald-700' : 'text-amber-600'}`}>{b.status}</span>
                    </div>
                  </div>
                  <span className="text-2xs text-mute flex items-center gap-1"><Users size={11} /> {b.seatingCapacity} seats</span>
                </div>
                <div className="space-y-1.5 text-xs border-t border-beige pt-3">
                  <p className="flex items-center gap-1.5 text-mute"><Route size={12} className="text-mute shrink-0" /> <span className="truncate">{b.route}</span></p>
                  <p className="flex items-center gap-1.5 text-mute"><UserCheck size={12} className="text-mute shrink-0" /> {b.driver?.name || '—'}</p>
                  {b.driver?.phone && <p className="flex items-center gap-1.5 text-mute"><Phone size={12} className="text-mute shrink-0" /> {b.driver.phone}</p>}
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-3xs border-t border-beige pt-3">
                  <div>
                    <span className="text-[9px] text-mute uppercase block">Reg Date</span>
                    <span className="text-ink font-semibold">{b.registrationDate ? new Date(b.registrationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-mute uppercase block">Fitness Expiry</span>
                    <span className={getExpiryStatus(b.fitnessExpiry).color}>{getExpiryStatus(b.fitnessExpiry).text}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-mute uppercase block">Tax Expiry</span>
                    <span className={getExpiryStatus(b.taxExpiry).color}>{getExpiryStatus(b.taxExpiry).text}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-mute uppercase block">Insurance Expiry</span>
                    <span className={getExpiryStatus(b.insuranceExpiry).color}>{getExpiryStatus(b.insuranceExpiry).text}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-mute uppercase block">PUCC Expiry</span>
                    <span className={getExpiryStatus(b.puccExpiry).color}>{getExpiryStatus(b.puccExpiry).text}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-mute uppercase block">Permit Expiry</span>
                    <span className={getExpiryStatus(b.permitExpiry).color}>{getExpiryStatus(b.permitExpiry).text}</span>
                  </div>
                </div>

                {canManage && (
                  <div className="flex justify-end gap-2 border-t border-beige pt-2 mt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setEditingBus(b)}
                      className="h-7 text-xs text-brand hover:bg-brand/5 border border-brand/20 rounded px-2.5 font-bold gap-1 cursor-pointer"
                    >
                      <Pencil size={11} /> Edit details
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete bus ${b.busNo}?`)) {
                          fetch(`/api/transport/buses/${b.id}`, { method: 'DELETE' })
                            .then(res => { if (res.ok) load(); });
                        }
                      }}
                      className="h-7 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded px-2.5 font-bold gap-1 cursor-pointer"
                    >
                      <Trash size={11} /> Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editingBus && (
        <EditBusModal
          bus={editingBus}
          drivers={drivers}
          onClose={() => setEditingBus(null)}
          onSaved={() => {
            setEditingBus(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EditBusModal({ bus, drivers, onClose, onSaved }: { bus: BusRecord; drivers: DriverOption[]; onClose: () => void; onSaved: () => void }) {
  const [busNo, setBusNo] = useState(bus.busNo);
  const [route, setRoute] = useState(bus.route);
  const [driverId, setDriverId] = useState(bus.driver?.id || '');
  const [capacity, setCapacity] = useState(String(bus.seatingCapacity));
  const [status, setStatus] = useState(bus.status);
  
  const formatDateForInput = (d?: string | null) => d ? d.split('T')[0] : '';
  
  const [registrationDate, setRegistrationDate] = useState(formatDateForInput(bus.registrationDate));
  const [fitnessExpiry, setFitnessExpiry] = useState(formatDateForInput(bus.fitnessExpiry));
  const [taxExpiry, setTaxExpiry] = useState(formatDateForInput(bus.taxExpiry));
  const [insuranceExpiry, setInsuranceExpiry] = useState(formatDateForInput(bus.insuranceExpiry));
  const [puccExpiry, setPUCCExpiry] = useState(formatDateForInput(bus.puccExpiry));
  const [permitExpiry, setPermitExpiry] = useState(formatDateForInput(bus.permitExpiry));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!busNo.trim() || !route.trim() || !driverId || !capacity) { setError('All fields are required.'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/transport/buses/${bus.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busNo, route, driverId, seatingCapacity: Number(capacity), status,
          registrationDate: registrationDate || null,
          fitnessExpiry: fitnessExpiry || null,
          taxExpiry: taxExpiry || null,
          insuranceExpiry: insuranceExpiry || null,
          puccExpiry: puccExpiry || null,
          permitExpiry: permitExpiry || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSaved();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to save bus.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="w-full max-w-lg border border-beige bg-paper text-ink shadow-xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-beige pb-3">
            <h3 className="font-bold text-sm text-brand uppercase tracking-wider flex items-center gap-1.5"><Pencil size={14} /> Edit Bus Details</h3>
            <Button onClick={onClose} variant="ghost" className="h-6 w-6 p-0 hover:bg-cream rounded-full"><X size={14} /></Button>
          </div>
          {error && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle size={13} /> {error}</div>}
          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
            <div className="space-y-1"><Label className="text-2xs text-mute">Bus No.</Label>
              <Input value={busNo} onChange={e => setBusNo(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Route</Label>
              <Input value={route} onChange={e => setRoute(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Driver</Label>
              <select value={driverId} onChange={e => setDriverId(e.target.value)}
                className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="">Select driver...</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Seats</Label>
              <Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Status</Label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="ACTIVE">ACTIVE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Reg Date</Label>
              <Input type="date" value={registrationDate} onChange={e => setRegistrationDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Fitness Expiry</Label>
              <Input type="date" value={fitnessExpiry} onChange={e => setFitnessExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Tax Expiry</Label>
              <Input type="date" value={taxExpiry} onChange={e => setTaxExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Insurance Expiry</Label>
              <Input type="date" value={insuranceExpiry} onChange={e => setInsuranceExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">PUCC Expiry</Label>
              <Input type="date" value={puccExpiry} onChange={e => setPUCCExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
            <div className="space-y-1"><Label className="text-2xs text-mute">Permit Expiry</Label>
              <Input type="date" value={permitExpiry} onChange={e => setPermitExpiry(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-beige pt-3">
            <Button onClick={onClose} variant="ghost" className="h-8 text-xs text-mute hover:text-ink font-semibold">Cancel</Button>
            <Button onClick={save} disabled={isSubmitting} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer">
              {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Drivers Tab ──────────────────────────────────────────────────────────────

function DriversTab({ canManage, role }: { canManage: boolean; role: string }) {
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const handleExport = () => {
    window.open('/api/export?type=transport_drivers');
  };
  const [payForId, setPayForId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/staff?unit=all&type=DRIVER&status=ACTIVE&limit=100');
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      const busesRes = await fetch('/api/transport/buses');
      const busesData = await busesRes.json();
      const allBuses: BusRecord[] = busesData.buses || [];

      const hydrated = (data.staff || []).map((s: any) => {
        const assigned = allBuses.filter(b => b.driver?.id === s.id).map(b => ({ busNo: b.busNo }));
        return { ...s, buses: assigned };
      });

      setDrivers(hydrated);
    } catch { setDrivers([]); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mute"><span className="text-label font-bold">{drivers.length}</span> active drivers</span>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download size={14} />}
            <span>Export</span>
          </Button>
          {canManage && (
            <Button
              onClick={() => setShowAddModal(true)}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
            >
              <Plus size={14} />
              <span>Add Driver</span>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-16">
          <UserCheck size={36} className="mx-auto text-mute mb-3" />
          <p className="text-mute text-sm font-semibold">No active drivers found</p>
          <p className="text-mute text-xs mt-1">Register a driver in the Staff Management section under 'Transport Department'.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {drivers.map(d => {
            const cleared = Number(d.monthlyBaseSalary) > 0 && d.paidThisMonth >= Number(d.monthlyBaseSalary);
            const partial = d.paidThisMonth > 0 && d.paidThisMonth < Number(d.monthlyBaseSalary);
            const isPaying = payForId === d.id;

            return (
              <Card key={d.id} className="border-beige bg-paper text-ink shadow-md relative overflow-hidden flex flex-col justify-between">
                <CardContent className="p-5 space-y-4 flex-1">
                  {/* Driver Header */}
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 rounded-full overflow-hidden border border-beige bg-[#f4ebd0] flex items-center justify-center text-brand font-bold text-lg select-none">
                      {d.photoUrl ? (
                        <img src={toViewableImageUrl(d.photoUrl)} alt={d.name} className="object-cover w-full h-full" />
                      ) : (
                        d.name.charAt(0)
                      )}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-ink text-sm truncate">{d.name}</h4>
                      <p className="font-mono text-3xs text-mute font-bold tracking-wider">{d.staffNo}</p>
                    </div>
                  </div>

                  {/* Driver details grid */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-2 text-xs border-t border-beige pt-3">
                    <div>
                      <span className="text-3xs text-mute block font-semibold uppercase">Phone:</span>
                      <span className="font-semibold text-ink text-[11px]">{d.phone || '—'}</span>
                    </div>
                    <div>
                      <span className="text-3xs text-mute block font-semibold uppercase">License No:</span>
                      <span className="font-semibold text-ink text-[11px] truncate block max-w-full">{d.licenseNo || '—'}</span>
                    </div>
                    <div>
                      <span className="text-3xs text-mute block font-semibold uppercase">Assigned Bus:</span>
                      <span className="font-bold text-brand font-mono text-[11px]">
                        {d.buses && d.buses.length > 0 ? d.buses.map(b => b.busNo).join(', ') : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-3xs text-mute block font-semibold uppercase">Salary:</span>
                      <span className="font-bold text-emerald-700 text-[11px]">{fmt(d.monthlyBaseSalary)} / month</span>
                    </div>
                  </div>

                  {/* Salary Status Card */}
                  <div className="bg-[#fcfaf5] p-3 rounded-lg border border-[#e8dfcf] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs font-extrabold uppercase text-mute tracking-wider">Salary Status</span>
                      <span className={`text-4xs font-black px-1.5 py-0.5 rounded border ${
                        cleared
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : partial
                          ? 'bg-amber-50 text-amber-600 border-amber-200'
                          : 'bg-cream text-mute border-[#ece6db]'
                      }`}>
                        {cleared ? 'PAID' : partial ? 'PARTIAL' : 'UNPAID'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[11px]">
                      <div>
                        <span className="text-3xs text-mute font-semibold">Paid:</span>
                        <p className="font-bold text-emerald-700">{fmt(d.paidThisMonth)}</p>
                      </div>
                      <div>
                        <span className="text-3xs text-mute font-semibold">Remaining:</span>
                        <p className="font-bold text-amber-600">{fmt(d.remainingThisMonth)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>

                {/* Card Action bar */}
                <div className="bg-[#fcfaf5] px-5 py-3 border-t border-beige">
                  {isPaying ? (
                    <div className="bg-paper p-3 rounded-lg border border-beige animate-in slide-in-from-bottom-2 duration-200">
                      <MonthPayInline
                        staffId={d.id}
                        remaining={d.remainingThisMonth}
                        onPaid={() => { setPayForId(null); load(); }}
                        onClose={() => setPayForId(null)}
                      />
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Link href={`/dashboard/staff/${d.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-cream hover:bg-beige text-label text-2xs font-semibold select-none border border-beige cursor-pointer">
                        View Profile
                      </Link>
                      {role === 'DEPARTMENT_HEAD' ? (
                        <span className="text-[10px] text-mute font-semibold italic bg-cream px-2 py-1 rounded border border-beige">
                          Salary Managed via Madan ji (Hindi Payroll)
                        </span>
                      ) : canManage && !cleared ? (
                        <Button
                          onClick={() => setPayForId(d.id)}
                          className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-2xs h-8 px-4 rounded-lg cursor-pointer"
                        >
                          Pay Salary
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <AddDriverModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddDriverModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().split('T')[0]);
  const [empType, setEmpType] = useState<'FULL_TIME' | 'PART_TIME' | 'CONTRACT'>('FULL_TIME');
  const [salary, setSalary] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [aadhar, setAadhar] = useState('');
  const [pan, setPan] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [aadharUrl, setAadharUrl] = useState('');
  const [panUrl, setPanUrl] = useState('');
  const [otherDocUrl, setOtherDocUrl] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [experience, setExperience] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [transportMode, setTransportMode] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    setError(null);
    setFieldErrors({});
    
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!salary || Number(salary) <= 0) { setError('Monthly salary is required.'); return; }
    
    const fe: Record<string, string> = {};
    if (phone.trim() && !/^\d{10}$/.test(phone.replace(/\s|-/g, ''))) {
      fe.phone = 'Phone number must be exactly 10 digits';
    }
    if (aadhar.trim() && !/^\d{12}$/.test(aadhar.replace(/\s|-/g, ''))) {
      fe.aadharNo = 'Aadhar number must be exactly 12 digits';
    }
    
    if (!photoUrl.trim() || !aadharUrl.trim() || !panUrl.trim() || Object.keys(fe).length > 0) {
      if (!photoUrl.trim()) fe.photoUrl = 'Staff photo is required';
      if (!aadharUrl.trim()) fe.aadharDocUrl = 'Aadhar document is required';
      if (!panUrl.trim()) fe.panDocUrl = 'PAN document is required for drivers';
      setFieldErrors(fe);
      setError('Please resolve all validation errors.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: 'transport',
          staffType: 'DRIVER',
          name,
          fatherName,
          roleOrDesignation: 'Driver',
          department: 'Transport Fleet',
          phone,
          email,
          dob: dob || undefined,
          joiningDate,
          employmentType: empType,
          monthlyBaseSalary: Number(salary),
          bankAccountNo: bankAccount,
          aadharNo: aadhar,
          panNo: pan,
          photoUrl,
          aadharDocUrl: aadharUrl,
          panDocUrl: panUrl,
          otherDocUrl,
          experienceYears: experience ? Number(experience) : undefined,
          qualifications,
          licenseNo,
          transportMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          const errs: Record<string, string> = {};
          data.details.forEach((d: any) => { errs[d.field] = d.message; });
          setFieldErrors(errs);
          setError('Please fix the validation errors below.');
        } else {
          setError(data.error || 'Failed to register driver.');
        }
        return;
      }
      onSaved();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFe = (f: string) => fieldErrors[f];
  const inputCls = (f: string) =>
    `border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand ${getFe(f) ? 'border-red-300/50' : ''}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="w-full max-w-2xl border border-beige bg-paper text-ink shadow-xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-beige pb-3">
            <h3 className="font-bold text-sm text-brand uppercase tracking-wider flex items-center gap-1.5"><UserCheck size={16} /> Register New Driver</h3>
            <Button onClick={onClose} variant="ghost" className="h-6 w-6 p-0 hover:bg-cream rounded-full"><X size={14} /></Button>
          </div>
          
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
              <AlertCircle size={14} /> <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1">
            <div className="col-span-2 text-[10px] font-bold text-mute uppercase tracking-wider border-b border-beige pb-1">1. Personal Information</div>
            
            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Full Name <span className="text-red-600">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rajesh Kumar" className={inputCls('name')} />
              {getFe('name') && <p className="text-3xs text-red-600">{getFe('name')}</p>}
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Father&apos;s Name</Label>
              <Input value={fatherName} onChange={e => setFatherName(e.target.value)} placeholder="Father's name" className={inputCls('fatherName')} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute flex items-center gap-1"><Phone size={11} /> Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number" className={inputCls('phone')} />
              {getFe('phone') && <p className="text-3xs text-red-600">{getFe('phone')}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@mge.org" className={inputCls('email')} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Date of Birth</Label>
              <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputCls('dob')} />
            </div>

            <div className="col-span-2 text-[10px] font-bold text-mute uppercase tracking-wider border-b border-beige pb-1 mt-2">2. Employment & License Details</div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">License Number</Label>
              <Input value={licenseNo} onChange={e => setLicenseNo(e.target.value)} placeholder="e.g. DL-1420110012345" className={inputCls('licenseNo')} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Monthly Salary (₹) <span className="text-red-600">*</span></Label>
              <Input type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="18000" className={inputCls('monthlyBaseSalary')} />
              {getFe('monthlyBaseSalary') && <p className="text-3xs text-red-600">{getFe('monthlyBaseSalary')}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Joining Date <span className="text-red-600">*</span></Label>
              <Input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} className={inputCls('joiningDate')} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Employment Type</Label>
              <select value={empType} onChange={e => setEmpType(e.target.value as any)}
                className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">Aadhar Card Number</Label>
              <Input value={aadhar} onChange={e => setAadhar(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit number" className={inputCls('aadharNo')} />
              {getFe('aadharNo') && <p className="text-3xs text-red-600">{getFe('aadharNo')}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-2xs text-mute">PAN Card Number</Label>
              <Input value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" className={inputCls('panNo')} />
            </div>

            <div className="col-span-2 text-[10px] font-bold text-mute uppercase tracking-wider border-b border-beige pb-1 mt-2">3. Required Documents</div>

            <div className="space-y-1.5">
              <FileUploader
                label="Driver Photo *"
                pathParts={['transport', 'staff', 'Staff_Photos']}
                onUploadSuccess={(url) => setPhotoUrl(url)}
                value={photoUrl}
                acceptImagesOnly={true}
              />
              {getFe('photoUrl') && <p className="text-3xs text-red-600">{getFe('photoUrl')}</p>}
            </div>

            <div className="space-y-1.5">
              <FileUploader
                label="Aadhar Card Document *"
                pathParts={['transport', 'staff', 'Staff_Aadhar']}
                onUploadSuccess={(url) => setAadharUrl(url)}
                value={aadharUrl}
              />
              {getFe('aadharDocUrl') && <p className="text-3xs text-red-600">{getFe('aadharDocUrl')}</p>}
            </div>

            <div className="space-y-1.5">
              <FileUploader
                label="PAN Card Document *"
                pathParts={['transport', 'staff', 'Staff_PAN']}
                onUploadSuccess={(url) => setPanUrl(url)}
                value={panUrl}
              />
              {getFe('panDocUrl') && <p className="text-3xs text-red-600">{getFe('panDocUrl')}</p>}
            </div>

            <div className="space-y-1.5">
              <FileUploader
                label="Other Certificate (Optional)"
                pathParts={['transport', 'staff', 'Staff_Other']}
                onUploadSuccess={(url) => setOtherDocUrl(url)}
                value={otherDocUrl}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-beige pt-3">
            <Button onClick={onClose} variant="ghost" className="h-8 text-xs text-mute hover:text-ink font-semibold">Cancel</Button>
            <Button onClick={submit} disabled={isSubmitting} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer">
              {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : 'Register Driver'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MonthPayInline({ staffId, remaining, onPaid, onClose }: { staffId: string; remaining: number; onPaid: () => void; onClose: () => void }) {
  const [deduction, setDeduction] = useState('0');
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : ''));
  const [mode, setMode] = useState('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  const currentMonth = MONTHS[now.getMonth()];
  const currentYear = now.getFullYear();

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
          month: currentMonth,
          year: currentYear,
          amount: Number(amount),
          pfDeduction: Number(deduction),
          tdsDeduction: 0,
          date: paymentDate,
          paymentMode: mode
        })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      onPaid();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 pt-2">
      {error && <div className="text-3xs text-red-600 flex items-center gap-1"><AlertCircle size={10} /> {error}</div>}
      
      <div className="space-y-1">
        <Label className="text-3xs text-mute">Payment Date</Label>
        <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 border-beige bg-field text-2xs font-mono focus-visible:ring-brand" />
      </div>

      <div className="space-y-1">
        <Label className="text-3xs text-mute">EPF / TDS / Deduction</Label>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-2xs">₹</span>
          <Input type="number" value={deduction} onChange={e => setDeduction(e.target.value)} className="h-8 pl-5 border-beige bg-field text-2xs font-mono focus-visible:ring-brand" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-3xs text-mute">Net Paid</Label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-2xs">₹</span>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-8 pl-5 border-beige bg-field text-2xs font-mono focus-visible:ring-brand" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-3xs text-mute">Payment Mode</Label>
          <select value={mode} onChange={e => setMode(e.target.value)} className="w-full h-8 bg-field border border-beige text-ink text-2xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand">
            {['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI'].map(x => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-1.5 pt-1">
        <Button onClick={onClose} variant="ghost" className="h-7 text-3xs font-semibold hover:bg-cream text-mute rounded-md">Cancel</Button>
        <Button onClick={pay} disabled={busy} className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-3xs h-7 px-3 rounded-md cursor-pointer flex gap-1">
          {busy ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} Confirm
        </Button>
      </div>
    </div>
  );
}

// ─── Finance Tab ──────────────────────────────────────────────────────────────

function FinanceTab({ isDirector, role, accessUnits }: { isDirector: boolean; role: string; accessUnits: string[] }) {
  const [subTab, setSubTab] = useState<'expenses' | 'transfers'>('expenses');
  const [txns, setTxns] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    const direction = subTab === 'expenses' ? 'EXPENSE' : 'INCOME';
    window.open(`/api/export?type=transport_finance&direction=${direction}`);
  };

  // Forms
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAllocateBudget, setShowAllocateBudget] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const direction = subTab === 'expenses' ? 'EXPENSE' : 'INCOME';
      const res = await fetch(`/api/transport/finance?direction=${direction}&page=${page}&limit=15`);
      const data = await res.json();
      setTxns(data.transactions || []);
      setTotalPages(data.pagination?.pages || 1);
    } catch { setTxns([]); }
    finally { setIsLoading(false); }
  }, [subTab, page]);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-beige pb-2">
        {/* Sub tabs */}
        <div className="flex gap-2">
          <button onClick={() => { setSubTab('expenses'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${subTab === 'expenses' ? 'bg-brand text-white' : 'bg-field text-mute hover:bg-cream'}`}>
            Expense Ledger
          </button>
          <button onClick={() => { setSubTab('transfers'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${subTab === 'transfers' ? 'bg-brand text-white' : 'bg-field text-mute hover:bg-cream'}`}>
            Budget Allocations
          </button>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download size={14} />}
            <span>Export</span>
          </Button>
          {subTab === 'expenses' && (
            <Button onClick={() => setShowAddExpense(true)} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-1.5 rounded-lg cursor-pointer">
              <PlusCircle size={14} /> Record Expense
            </Button>
          )}
          {subTab === 'transfers' && isDirector && (
            <Button onClick={() => setShowAllocateBudget(true)} className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-9 px-4 gap-1.5 rounded-lg cursor-pointer">
              <ArrowRightLeft size={14} /> Allocate Budget
            </Button>
          )}
        </div>
      </div>

      {showAddExpense && <AddExpenseModal onClose={() => { setShowAddExpense(false); load(); }} />}
      {showAllocateBudget && <AllocateBudgetModal onClose={() => { setShowAllocateBudget(false); load(); }} role={role} accessUnits={accessUnits} />}

      {/* Ledger Table */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
          ) : txns.length === 0 ? (
            <div className="text-center py-16">
              <FileText size={36} className="mx-auto text-mute mb-3" />
              <p className="text-mute text-sm font-semibold">No transactions recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-4">Date</th>
                    <th className="p-4">Description</th>
                    {subTab === 'expenses' && <th className="p-4">Payment Mode</th>}
                    <th className="p-4 text-right">Amount</th>
                    {subTab === 'expenses' && <th className="p-4 text-center">Receipt</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {txns.map(t => (
                    <tr key={t.id} className="hover:bg-cream transition-colors">
                      <td className="p-4 font-mono text-mute">{fmtDate(t.date)}</td>
                      <td className="p-4">
                        <div>
                          <div>{formatDescription(t.description)}</div>
                          {t.staff && <p className="text-[10px] text-mute">Paid to: {t.staff.name} ({t.staff.staffNo})</p>}
                        </div>
                      </td>
                      {subTab === 'expenses' && <td className="p-4 text-mute font-semibold uppercase">{t.paymentMode?.replace('_', ' ') || '—'}</td>}
                      <td className={`p-4 text-right font-mono font-bold ${t.direction === 'INCOME' ? 'text-emerald-700' : 'text-red-600'}`}>
                        {t.direction === 'INCOME' ? '+' : '-'}{fmt(t.amount)}
                      </td>
                      {subTab === 'expenses' && (
                        <td className="p-4 text-center">
                          {t.receiptUrl ? (
                            <a href={toViewableImageUrl(t.receiptUrl)} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-3xs font-bold border border-brand/20 text-brand rounded bg-paper hover:bg-brand/5 select-none transition-colors">
                              <Download size={10} /> View receipt
                            </a>
                          ) : (
                            <span className="text-mute italic text-3xs">None required</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && totalPages > 1 && (
        <div className="flex justify-end gap-2 pt-2 text-xs font-semibold">
          <Button disabled={page === 1} onClick={() => setPage(p => p - 1)} variant="ghost" className="h-8 text-xs text-mute hover:text-ink">Prev</Button>
          <Button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} variant="ghost" className="h-8 text-xs text-mute hover:text-ink">Next</Button>
        </div>
      )}
    </div>
  );
}

function AddExpenseModal({ onClose }: { onClose: () => void }) {
  const [subCategory, setSubCategory] = useState<'Diesel / Fuel' | 'Maintenance' | 'Driver Salary' | 'Other'>('Diesel / Fuel');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [receiptUrl, setReceiptUrl] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receiptMandatory = ['Diesel / Fuel', 'Maintenance', 'Other'].includes(subCategory);

  const save = async () => {
    setError(null);
    if (!amount || Number(amount) <= 0) { setError('Enter a positive amount.'); return; }
    if (receiptMandatory && !receiptUrl) { setError(`Receipt upload is required for ${subCategory} expenses.`); return; }
    if (subCategory === 'Maintenance' && !description.trim()) { setError('Description is required for Maintenance expenses.'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transport/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subCategory,
          amount: Number(amount),
          date,
          description: description.trim(),
          paymentMode,
          receiptUrl: receiptUrl.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to record expense.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="border border-beige bg-paper text-ink shadow-2xl w-full max-w-md">
        <CardHeader className="pb-3 border-b border-beige">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-brand">Record Department Expense</CardTitle>
            <button onClick={onClose} className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer"><X size={15} /></button>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          {error && <div className="text-2xs text-red-600 bg-red-50 border border-red-200 rounded p-2.5 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</div>}
          
          <div className="space-y-1">
            <Label className="text-2xs text-mute font-semibold">Expense Type</Label>
            <select value={subCategory} onChange={e => { setSubCategory(e.target.value as any); setReceiptUrl(''); }}
              className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand">
              {['Diesel / Fuel', 'Maintenance', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-2xs text-mute font-semibold">Amount ₹</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </div>
            <div className="space-y-1">
              <Label className="text-2xs text-mute font-semibold">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-2xs text-mute font-semibold">Payment Mode</Label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value as any)}
              className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand">
              {['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI'].map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-2xs text-mute font-semibold">Description {subCategory === 'Maintenance' && <span className="text-red-600">*</span>}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={subCategory === 'Maintenance' ? "e.g. Engine oil change bus RJ-21" : "Optional details"} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
          </div>

          {/* Conditional receipt uploader */}
          <div className="space-y-1 pt-1">
            <FileUploader
              label={receiptMandatory ? "Upload Receipt Document *" : "Upload Receipt Document (Optional)"}
              pathParts={['transport', 'receipts']}
              onUploadSuccess={setReceiptUrl}
              value={receiptUrl}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-beige mt-4">
            <Button onClick={onClose} variant="ghost" className="h-8 text-2xs hover:bg-cream text-mute font-semibold rounded-md">Cancel</Button>
            <Button onClick={save} disabled={isSubmitting} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-2xs h-8 px-4 rounded-lg cursor-pointer flex gap-1.5">
              {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Save Expense
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AllocateBudgetModal({ onClose, role, accessUnits }: { onClose: () => void; role: string; accessUnits: string[] }) {
  const allowedSources = ['english', 'hindi', 'college'].filter(
    (u) => role === 'DIRECTOR' || accessUnits.includes(u)
  );

  const [sourceUnitId, setSourceUnitId] = useState<string>(allowedSources[0] || 'english');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (!amount || Number(amount) <= 0) { setError('Enter a positive amount.'); return; }
    if (!description.trim()) { setError('Enter a description for this budget allocation.'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transport/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'transfer',
          sourceUnitId,
          amount: Number(amount),
          date,
          description: description.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onClose();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to allocate budget.'); }
    finally { setIsSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="border border-beige bg-paper text-ink shadow-2xl w-full max-w-md">
        <CardHeader className="pb-3 border-b border-beige">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-emerald-700">Allocate Department Budget</CardTitle>
            <button onClick={onClose} className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer"><X size={15} /></button>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          {error && <div className="text-2xs text-red-600 bg-red-50 border border-red-200 rounded p-2.5 flex items-center gap-1.5"><AlertCircle size={14} /> {error}</div>}
          
          <div className="space-y-1">
            <Label className="text-2xs text-mute font-semibold">Source Division</Label>
            <select value={sourceUnitId} onChange={e => setSourceUnitId(e.target.value)}
              className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand">
              {allowedSources.includes('english') && <option value="english">English Medium School</option>}
              {allowedSources.includes('hindi') && <option value="hindi">Hindi Medium School</option>}
              {allowedSources.includes('college') && <option value="college">College</option>}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-2xs text-mute font-semibold">Amount ₹</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </div>
            <div className="space-y-1">
              <Label className="text-2xs text-mute font-semibold">Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-2xs text-mute font-semibold">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Q1 Operational Subsidy Allocation" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-beige mt-4">
            <Button onClick={onClose} variant="ghost" className="h-8 text-2xs hover:bg-cream text-mute font-semibold rounded-md">Cancel</Button>
            <Button onClick={save} disabled={isSubmitting} className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-2xs h-8 px-4 rounded-lg cursor-pointer flex gap-1.5">
              {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Save Allocation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function RestrictedTransportView({ role, accessUnits }: { role: string; accessUnits: string[] }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllocateBudget, setShowAllocateBudget] = useState(false);

  const loadTransfers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/finance?category=TRANSPORT&direction=EXPENSE&limit=100');
      if (res.ok) {
        const data = await res.json();
        const filtered = data.transactions || [];
        setTxns(filtered);
      }
    } catch (err) {
      console.error('Failed to load transfers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const fmtValue = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;
  const fmtDateValue = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-4">
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-beige flex-wrap gap-4">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
              Budget Allocations Transferred to Transport
            </CardTitle>
            <CardDescription className="text-2xs text-mute">
              Historical log of all intrasystem budget allocations transferred from your divisions to the Transport Department.
            </CardDescription>
          </div>
          {(role === 'DIRECTOR' || role === 'PRINCIPAL') && (
            <Button
              onClick={() => setShowAllocateBudget(true)}
              className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-9 px-4 gap-1.5 rounded-lg cursor-pointer shrink-0"
            >
              <ArrowRightLeft size={14} /> Transfer Budget
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
          ) : txns.length === 0 ? (
            <div className="text-center py-16">
              <AlertCircle size={36} className="mx-auto text-mute mb-3" />
              <p className="text-mute text-sm font-semibold">No budget transfers recorded</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-4">Date</th>
                    <th className="p-4">Source Division</th>
                    <th className="p-4">Description</th>
                    <th className="p-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {txns.map(t => (
                    <tr key={t.id} className="hover:bg-cream transition-colors">
                      <td className="p-4 font-mono text-mute">{fmtDateValue(t.date)}</td>
                      <td className="p-4 font-semibold text-ink">{getSourceDivision(t.description)}</td>
                      <td className="p-4">{formatDescription(t.description)}</td>
                      <td className={`p-4 text-right font-mono font-bold ${t.direction === 'INCOME' ? 'text-emerald-700' : 'text-red-600'}`}>
                        {t.direction === 'INCOME' ? '+' : '-'}{fmtValue(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {showAllocateBudget && (
        <AllocateBudgetModal
          onClose={() => {
            setShowAllocateBudget(false);
            loadTransfers();
          }}
          role={role}
          accessUnits={accessUnits}
        />
      )}
    </div>
  );
}

type TabId = 'dashboard' | 'stations' | 'fleet' | 'drivers' | 'finance';

function TransportPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId;
  const activeTab = (['dashboard', 'stations', 'fleet', 'drivers', 'finance'].includes(tabParam) ? tabParam : 'dashboard') as TabId;

  const [role, setRole] = useState('');
  const [accessUnits, setAccessUnits] = useState<string[]>([]);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) {
        setRole(d.user.role);
        setAccessUnits(d.user.accessUnits || []);
      }
    }).finally(() => setIsLoadingUser(false));
  }, []);

  const isDirector = role === 'DIRECTOR';
  const canManageFleet = role === 'DIRECTOR' || role === 'PRINCIPAL' || role === 'DEPARTMENT_HEAD';
  const hasTransportAccess = accessUnits.includes('transport');

  const headerInfo = {
    dashboard: {
      title: 'Transport Dashboard',
      desc: 'Overview of pickup stations, riders, active fleet metrics, and budget trends.',
      icon: LayoutDashboard,
    },
    stations: {
      title: 'Pickup Stations & Fares',
      desc: 'Manage pickup stations, route definitions, and monthly or annual fare configurations.',
      icon: MapPin,
    },
    fleet: {
      title: 'Fleet Inventory & Status',
      desc: 'Manage transport vehicles, seating capacities, vehicle statuses, and driver route assignments.',
      icon: Bus,
    },
    drivers: {
      title: 'Drivers Directory',
      desc: 'Manage bus driver profiles, license details, contact numbers, and payroll configurations.',
      icon: UserCheck,
    },
    finance: {
      title: 'Transport Expenses & Budget',
      desc: 'Log transit diesel/maintenance expenses, request other expenses, and manage department budget allocations.',
      icon: ArrowRightLeft,
    },
  }[activeTab] || {
    title: 'Transport Department',
    desc: 'Manage pickup stations & fares, fleet inventory, driver assignments, payroll payouts, and intrasystem budget balances.',
    icon: Bus,
  };

  const HeaderIcon = headerInfo.icon;

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <HeaderIcon size={22} className="text-brand" /> {headerInfo.title}
        </h1>
        <p className="text-xs text-mute mt-1">
          {hasTransportAccess
            ? headerInfo.desc
            : 'View intrasystem budget allocations transferred to the Transport Department.'}
        </p>
      </div>

      {/* Tab selection switcher (Only for non-HODs, or Director/Principal) */}
      {!isLoadingUser && hasTransportAccess && role && role !== 'DEPARTMENT_HEAD' && (
        <div className="flex border-b border-beige gap-2 overflow-x-auto shrink-0 select-none scrollbar-none pb-0.5">
          {[
            { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
            { id: 'stations', name: 'Pickup Stations', icon: MapPin },
            { id: 'fleet', name: 'Fleet Inventory', icon: Bus },
            { id: 'drivers', name: 'Drivers Directory', icon: UserCheck },
            { id: 'finance', name: 'Expenses & Budget', icon: ArrowRightLeft },
          ].map((item) => {
            const isSelected = activeTab === item.id;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={`/dashboard/transport?tab=${item.id}`}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'border-brand text-brand font-extrabold'
                    : 'border-transparent text-mute hover:text-ink'
                }`}
              >
                <Icon size={14} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      )}

      {isLoadingUser ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
      ) : !hasTransportAccess ? (
        <RestrictedTransportView role={role} accessUnits={accessUnits} />
      ) : (
        <>
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'stations' && <StationsTab isDirector={isDirector} />}
          {activeTab === 'fleet' && <FleetTab canManage={canManageFleet} />}
          {activeTab === 'drivers' && <DriversTab canManage={canManageFleet} role={role} />}
          {activeTab === 'finance' && <FinanceTab isDirector={isDirector} role={role} accessUnits={accessUnits} />}
        </>
      )}
    </div>
  );
}

export default function TransportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>}>
      <TransportPageContent />
    </Suspense>
  );
}
