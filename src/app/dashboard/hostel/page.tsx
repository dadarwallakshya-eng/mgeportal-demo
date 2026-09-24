'use client';

/**
 * @file src/app/dashboard/hostel/page.tsx
 * @description Hostel Boarding — 4 tabs: Students, Staff, Dashboard, Income & Expense.
 *
 * All money flows through the simple Transaction ledger (unitId='hostel'):
 *  - Hostel fee paid   INCOME / HOSTEL_FEE
 *  - Daily-use money   EXPENSE / DAILY_USE (also added to what the student owes)
 *  - Staff salary      EXPENSE / HOSTEL_SALARY
 *  - Mess / Laundry    EXPENSE / MESS | LAUNDRY
 * Every balance is computed live, so totals never go stale.
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Home, Users, UserCog, LayoutDashboard, Wallet, Plus, Search, Loader2, AlertCircle,
  CheckCircle2, X, IndianRupee, Coins, ArrowLeft, Pencil, BedDouble, TrendingUp, TrendingDown,
  Utensils, Shirt, HandCoins, ChevronRight, FileCheck2, ImageIcon, UserCheck, Hash, Save,
  Download, Building, Landmark, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FileUploader } from '@/components/ui/file-uploader';
import { toViewableImageUrl } from '@/lib/imageUrl';
import { triggerDataChange, useDataSubscription } from '@/lib/events';
import ReceiptModal from '@/components/layout/receipt-modal';

const fmt = (n: any) => {
  if (n === null || n === undefined) return '₹0';
  const val = Number(n);
  return `₹${isNaN(val) ? '0' : val.toLocaleString('en-IN')}`;
};
const fmtDate = (d: any) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(d || '—');
  }
};
const today = () => new Date().toISOString().split('T')[0];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function StudentAvatar({ photoUrl, name, sizeClass = "w-9 h-9 rounded-xl" }: { photoUrl?: string | null; name: string; sizeClass?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || 'S').trim().charAt(0).toUpperCase();
  if (photoUrl && !failed) {
    return (
      <img
        src={toViewableImageUrl(photoUrl)}
        alt={name}
        className={`${sizeClass} object-cover border border-brand/30 bg-brand/10 shrink-0`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`${sizeClass} bg-brand/10 border border-brand/20 text-brand flex items-center justify-center font-extrabold shrink-0 text-xs`}>
      {initial}
    </div>
  );
}

interface Account { netFee: number; dailyUseGiven: number; totalCharged: number; paid: number; balanceDue: number; }
interface Resident {
  id: string; annualFee: string|number; discountType: string|null; discountValue: string|number; checkInDate: string;
  checkOutDate?: string | null;
  status: string;
  student: { id: string; name: string; admissionNo: string; className: string; section: string; unit: { name: string }; photoUrl: string | null };
  room: { roomNo: string; floor: string } | null;
  account: Account;
}

// ════════════════════════════ TAB 1: STUDENTS ════════════════════════════

function StudentsTab() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'TERMINATED'>('ACTIVE');
  const [showAdmit, setShowAdmit] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    const params = new URLSearchParams({ type: 'hostel_residents', status: statusFilter });
    if (search.trim()) params.append('search', search.trim());
    window.open(`/api/export?${params.toString()}`);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (search.trim()) params.append('search', search.trim());
      const res = await fetch(`/api/hostel/residents?${params}`);
      const data = await res.json();
      setResidents(data.residents || []);
    } catch { setResidents([]); }
    finally { setIsLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  if (profileId) return <ResidentProfile residentId={profileId} onBack={() => { setProfileId(null); load(); }} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search resident by name or Admission ID..."
            className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand" />
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
          <Button onClick={() => setShowAdmit(v => !v)}
            className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer">
            {showAdmit ? <X size={14} /> : <Plus size={14} />} {showAdmit ? 'Close' : 'Admit Student'}
          </Button>
        </div>
      </div>

      {showAdmit && <AdmitForm onAdmitted={() => { setShowAdmit(false); load(); }} />}

      {/* Active vs Terminated Status Selector Tabs */}
      <div className="flex border-b border-beige">
        <button
          onClick={() => setStatusFilter('ACTIVE')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            statusFilter === 'ACTIVE'
              ? 'border-brand text-brand font-extrabold'
              : 'border-transparent text-mute hover:text-ink'
          }`}
        >
          Active Residents
        </button>
        <button
          onClick={() => setStatusFilter('TERMINATED')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            statusFilter === 'TERMINATED'
              ? 'border-brand text-brand font-extrabold'
              : 'border-transparent text-mute hover:text-ink'
          }`}
        >
          Hostel Alumni / Checked Out
        </button>
      </div>

      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
          ) : residents.length === 0 ? (
            <div className="text-center py-16">
              <BedDouble size={36} className="mx-auto text-mute mb-3" />
              <p className="text-mute text-sm font-semibold">No residents yet</p>
              <p className="text-mute text-xs mt-1">
                {statusFilter === 'ACTIVE'
                  ? 'Admit a male student to get started.'
                  : 'No checked-out or terminated residents found.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-4">Resident</th>
                    <th className="p-4">{statusFilter === 'ACTIVE' ? 'Room' : 'Check-out Date'}</th>
                    <th className="p-4 text-right">Hostel Fee</th>
                    <th className="p-4 text-right">Paid</th>
                    <th className="p-4 text-right">Balance Due</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                    {residents.map(r => (
                      <tr key={r.id} className="hover:bg-cream transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <StudentAvatar photoUrl={r.student.photoUrl} name={r.student.name} />
                            <div>
                              <p className="font-semibold text-ink">{r.student.name}</p>
                              <p className="text-2xs text-mute font-mono mt-0.5">{r.student.admissionNo} · Cl.{r.student.className} · {r.student.unit.name}</p>
                            </div>
                          </div>
                        </td>
                      <td className="p-4 text-mute">
                        {statusFilter === 'ACTIVE'
                          ? (r.room ? `${r.room.roomNo} (${r.room.floor})` : '—')
                          : (r.checkOutDate ? new Date(r.checkOutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
                        }
                      </td>
                      <td className="p-4 text-right font-mono text-label">{fmt(r.account.netFee)}</td>
                      <td className="p-4 text-right font-mono text-emerald-700">{fmt(r.account.paid)}</td>
                      <td className={`p-4 text-right font-mono font-bold ${r.account.balanceDue > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>{fmt(r.account.balanceDue)}</td>
                      <td className="p-4 text-center">
                        <button onClick={() => setProfileId(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cream hover:bg-beige text-label text-2xs font-bold cursor-pointer">
                          Profile <ChevronRight size={12} />
                        </button>
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

/**
 * Full student shape returned by /api/students. Includes documents on file so the
 * hostel admission flow can prove "no need to re-upload" with badge chips.
 */
interface RichStudent {
  id: string; name: string; nameHindi: string | null; admissionNo: string;
  className: string; section: string; gender: string;
  fatherName: string | null; phone: string | null; fatherPhone: string | null;
  photoUrl: string | null; aadharDocUrl: string | null; parentAadharDocUrl: string | null;
  unit: { name: string };
}

/** Strict format check for an auto-generated Admission ID (MES2026-00001 etc.). */
const ADMISSION_ID_REGEX = /^(MES|NMS|MGC)\d{4}-\d{5}$/i;

function AdmitForm({ onAdmitted }: { onAdmitted: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RichStudent[]>([]);
  const [selected, setSelected] = useState<RichStudent | null>(null);
  const [rooms, setRooms] = useState<{ id: string; roomNo: string; floor: string; capacity: number; occupiedCount: number }[]>([]);
  const [roomId, setRoomId] = useState('');
  const [checkInDate, setCheckInDate] = useState(today());
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/hostel/rooms').then(r => r.json()).then(d => setRooms(d.rooms || [])).catch(() => {});
  }, []);

  const runSearch = useCallback(async (q: string, exactById: boolean) => {
    if (!q.trim()) return;
    setIsSearching(true); setError(null);
    try {
      const res = await fetch(`/api/students?search=${encodeURIComponent(q)}&unit=all&status=ACTIVE&limit=10`);
      const data = await res.json();
      const males = (data.students || []).filter((s: { gender: string }) => s.gender === 'MALE');
      if (exactById) {
        // Exact admission-ID match wins: auto-select the lone hit.
        const exact = males.find((s: { admissionNo: string }) => s.admissionNo.toUpperCase() === q.toUpperCase());
        if (exact) { setSelected(exact); setResults([]); return; }
        setResults(males);
        setError(`No male student found with Admission ID '${q}'.`);
        return;
      }
      setResults(males);
      if (males.length === 0) setError('No male students found (hostel is boys-only).');
    } catch { setError('Lookup failed.'); }
    finally { setIsSearching(false); }
  }, []);

  // Auto-lookup as soon as the input is typed:
  // - If it is a complete, valid admission ID, triggers immediate search (200ms debounce)
  // - If it is a name (length >= 3), triggers automatic search (500ms debounce)
  useEffect(() => {
    if (selected) return;
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      return;
    }
    const isId = ADMISSION_ID_REGEX.test(trimmed);
    const debounceTime = isId ? 200 : 500;

    const timer = setTimeout(() => {
      runSearch(trimmed, isId);
    }, debounceTime);

    return () => clearTimeout(timer);
  }, [query, selected, runSearch]);

  const submit = async () => {
    setError(null);
    if (!selected) { setError('Select a student first.'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/hostel/residents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selected.id, roomId: roomId || null, checkInDate,
          discountType: discountType || null, discountValue: discountValue ? Number(discountValue) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      triggerDataChange();
      onAdmitted();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to admit.'); }
    finally { setIsSubmitting(false); }
  };

  // Looks like the user is in the middle of typing a full admission ID — show a friendlier hint.
  const looksLikeAdmissionId = /^(MES|NMS|MGC)/i.test(query.trim());

  return (
    <Card className="border border-brand/20 bg-brand/5 text-ink shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-brand uppercase tracking-wider">Admit Student to Hostel</CardTitle>
        <CardDescription className="text-mute text-xs">
          Type the student&apos;s <span className="font-mono font-bold text-brand">Admission ID</span> &mdash; their profile loads automatically. No need to re-upload photo or Aadhar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs"><AlertCircle size={13} /> <span>{error}</span></div>}

        {!selected ? (
          <>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runSearch(query, ADMISSION_ID_REGEX.test(query.trim()))}
                  placeholder="MES2026-00001 / NMS2026-00001 / MGC2026-00001 (or search by name)"
                  className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand font-mono"
                />
                {isSearching && (
                  <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand animate-spin" />
                )}
              </div>
              <Button
                onClick={() => runSearch(query, ADMISSION_ID_REGEX.test(query.trim()))}
                disabled={isSearching || !query.trim()}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer gap-1.5"
              >
                <Search size={13} /> Find
              </Button>
            </div>
            {looksLikeAdmissionId && !ADMISSION_ID_REGEX.test(query.trim()) && (
              <p className="text-2xs text-mute pl-1">Keep typing &mdash; full format is e.g. <span className="font-mono">MES2026-00001</span>.</p>
            )}
            {results.length > 0 && (
              <div className="space-y-1">
                <p className="text-2xs text-mute uppercase tracking-wider font-bold">Matches</p>
                {results.map(s => (
                  <button key={s.id} onClick={() => setSelected(s)}
                    className="w-full text-left flex items-center justify-between gap-3 p-2.5 rounded-lg border border-beige hover:border-brand hover:bg-brand/5 cursor-pointer transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {s.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={toViewableImageUrl(s.photoUrl)} alt="" className="h-8 w-8 rounded-full object-cover bg-beige flex-shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xs font-bold flex-shrink-0">{s.name.charAt(0)}</div>
                      )}
                      <span className="text-xs font-semibold text-ink truncate">{s.name}</span>
                    </div>
                    <span className="text-2xs text-mute font-mono whitespace-nowrap">{s.admissionNo} &middot; Cl.{s.className}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Rich student profile preview — proves the documents are already on file. */}
            <div className="rounded-lg border border-brand/30 bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  {selected.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={toViewableImageUrl(selected.photoUrl)} alt={selected.name} className="h-14 w-14 rounded-xl object-cover border border-beige bg-cream flex-shrink-0" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-brand/10 border border-brand/20 text-brand flex items-center justify-center text-lg font-extrabold flex-shrink-0">{selected.name.charAt(0)}</div>
                  )}
                  <div className="min-w-0">
                    <p className="font-extrabold text-ink leading-tight truncate">{selected.name}</p>
                    {selected.nameHindi && <p className="text-xs text-mute truncate">{selected.nameHindi}</p>}
                    <p className="text-2xs text-brand font-mono font-bold mt-1">{selected.admissionNo}</p>
                    <p className="text-2xs text-mute mt-0.5">
                      {selected.unit.name} &middot; Class {selected.className}-{selected.section}
                      {selected.fatherName && <> &middot; S/O {selected.fatherName}</>}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setSelected(null); setResults([]); setQuery(''); setError(null); }} className="text-mute hover:text-ink cursor-pointer flex-shrink-0" aria-label="Clear selection"><X size={16} /></button>
              </div>
              {/* Documents-on-file badges */}
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-beige">
                <DocBadge label="Photo" present={!!selected.photoUrl} url={selected.photoUrl} icon={ImageIcon} />
                <DocBadge label="Student Aadhar" present={!!selected.aadharDocUrl} url={selected.aadharDocUrl} icon={FileCheck2} />
                <DocBadge label="Parent Aadhar" present={!!selected.parentAadharDocUrl} url={selected.parentAadharDocUrl} icon={FileCheck2} />
                {selected.fatherPhone && (
                  <span className="inline-flex items-center gap-1 text-2xs text-mute px-2 py-1 bg-cream rounded-md border border-beige">
                    <UserCheck size={11} /> Father&apos;s phone on file
                  </span>
                )}
              </div>
            </div>

            {/* Hostel-specific fields only — the rest is already on the student record. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1"><Label className="text-2xs text-mute">Room (optional)</Label>
                <select value={roomId} onChange={e => setRoomId(e.target.value)}
                  className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                  <option value="">&mdash; No room &mdash;</option>
                  {rooms.map(r => <option key={r.id} value={r.id} disabled={r.occupiedCount >= r.capacity}>{r.roomNo} ({r.occupiedCount}/{r.capacity})</option>)}
                </select>
              </div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Check-in Date</Label>
                <Input type="date" value={checkInDate} onChange={e => setCheckInDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Discount Type</Label>
                <select value={discountType} onChange={e => setDiscountType(e.target.value)}
                  className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                  <option value="">No discount</option>
                  <option value="PERCENTAGE">Percentage %</option>
                  <option value="FIXED_AMOUNT">Fixed &#8377;</option>
                </select>
              </div>
              <div className="space-y-1"><Label className="text-2xs text-mute">Discount Value</Label>
                <Input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} disabled={!discountType} placeholder={discountType === 'PERCENTAGE' ? '0-100' : '₹'}
                  className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand disabled:opacity-40" /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={submit} disabled={isSubmitting}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2">
                {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Admit
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Small chip showing whether a document URL is on file (clickable to open). */
function DocBadge({ label, present, url, icon: Icon }: { label: string; present: boolean; url: string | null; icon: React.ElementType }) {
  if (present && url) {
    return (
      <a href={toViewableImageUrl(url)} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
        <Icon size={11} /> {label} on file
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-2xs font-semibold px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700">
      <AlertCircle size={11} /> {label} missing
    </span>
  );
}

function ResidentProfile({ residentId, onBack }: { residentId: string; onBack: () => void }) {
  const [data, setData] = useState<{ resident: Resident; account: Account; payments: any[]; dailyUse: any[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [payDate, setPayDate] = useState(today());
  const [payAmount, setPayAmount] = useState('');
  const [payComponent, setPayComponent] = useState<'ALL' | 'CURRENT_YEAR' | 'PREVIOUS_DUES'>('ALL');
  const [duAmount, setDuAmount] = useState('');
  const [duNote, setDuNote] = useState('');
  const [discType, setDiscType] = useState('');
  const [discVal, setDiscVal] = useState('');
  const [prevOutVal, setPrevOutVal] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [editingTxn, setEditingTxn] = useState<any>(null);

  const deleteTxn = async (txnId: string, isIncome: boolean) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this history entry? This will update live balance totals immediately.');
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const endpoint = isIncome ? `/api/hostel/income?id=${txnId}` : `/api/hostel/expense?id=${txnId}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete entry');
      await load();
      triggerDataChange();
      setMsg('Entry deleted successfully.');
    } catch (err: any) {
      alert(err.message || 'Error deleting transaction');
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/hostel/residents/${residentId}`);
      const d = await res.json();
      setData(d);
      setDiscType(d.resident.discountType || '');
      setDiscVal(d.resident.discountValue ? String(Number(d.resident.discountValue)) : '');
      setPrevOutVal(d.resident.previousOutstanding ? String(Number(d.resident.previousOutstanding)) : '0');
    } catch { setData(null); }
    finally { setIsLoading(false); }
  }, [residentId]);

  useEffect(() => { load(); }, [load]);

  const act = async (action: 'pay' | 'daily_use', payload: object) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/hostel/residents/${residentId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setPayAmount(''); setDuAmount(''); setDuNote('');
      await load();
      triggerDataChange();
      setMsg(action === 'pay' ? 'Payment recorded.' : 'Daily-use money recorded.');
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const saveDiscount = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/hostel/residents`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: resident.id,
          discountType: discType || null,
          discountValue: discVal ? Number(discVal) : 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update discount');
      await load();
      triggerDataChange();
      setMsg('Hostel discount updated successfully.');
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const savePreviousOutstanding = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/hostel/residents`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: resident.id,
          previousOutstanding: prevOutVal ? Number(prevOutVal) : 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update previous dues');
      await load();
      triggerDataChange();
      setMsg('Previous outstanding dues updated successfully.');
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  const updateStudentPhoto = async (newPhotoUrl: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/students/${resident.studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: newPhotoUrl }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update photo');
      await load();
      triggerDataChange();
      setMsg('Student photo updated successfully!');
    } catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Failed to update photo'); }
    finally { setBusy(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  if (!data) return <div className="text-center py-16"><AlertCircle size={32} className="mx-auto text-red-600 mb-2" /><button onClick={onBack} className="text-brand text-xs cursor-pointer">←  Back</button></div>;

  const { resident, account, payments, dailyUse } = data;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-mute hover:text-label font-semibold cursor-pointer">
        <ArrowLeft size={13} /> Back to Residents
      </button>

      {msg && <div className="flex items-center gap-2 p-2.5 rounded-lg border border-brand/20 bg-brand/5 text-brand text-xs"><CheckCircle2 size={13} /> {msg}</div>}

      {/* Account statement */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-3">
              <StudentAvatar photoUrl={resident.student.photoUrl} name={resident.student.name} sizeClass="h-12 w-12 rounded-xl text-lg" />
              <div>
                <p className="font-extrabold text-ink">{resident.student.name}</p>
                <p className="text-2xs text-mute font-mono mt-0.5">{resident.student.admissionNo} · Cl.{resident.student.className} · {resident.room ? `Room ${resident.room.roomNo}` : 'No room'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/students/${resident.studentId}`}
                className="px-3 py-1.5 bg-cream hover:bg-beige border border-beige rounded-lg text-brand text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer h-8"
              >
                Full Profile &amp; Tuition Fees ↗
              </Link>

              {resident.status === 'ACTIVE' ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    const confirmCheckout = window.confirm(
                      `Are you sure you want to check out '${resident.student.name}'? This will terminate their hostel allocation and free up Room ${resident.room ? resident.room.roomNo : 'N/A'}. All ledger transactions will be preserved.`
                    );
                    if (!confirmCheckout) return;

                    setBusy(true);
                    try {
                      const res = await fetch(`/api/hostel/residents/${resident.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: 'TERMINATED' }),
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.error || 'Failed to checkout');
                      }
                      await load();
                      triggerDataChange();
                      setMsg('Resident successfully checked out.');
                    } catch (err: any) {
                      setMsg(err.message || 'Checkout failed.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs h-8 px-3 rounded-lg cursor-pointer"
                >
                  Checkout Resident
                </Button>
              ) : (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    const confirmReadmit = window.confirm(
                      `Re-admit '${resident.student.name}' back to Hostel Boarding?`
                    );
                    if (!confirmReadmit) return;

                    setBusy(true);
                    try {
                      const res = await fetch(`/api/hostel/residents`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ residentId: resident.id, action: 'readmit' }),
                      });
                      if (!res.ok) throw new Error((await res.json()).error || 'Failed to re-admit');
                      await load();
                      triggerDataChange();
                      setMsg('Resident re-admitted to Hostel successfully!');
                    } catch (err: any) {
                      setMsg(err.message || 'Error re-admitting resident');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="bg-brand hover:bg-brand/90 text-white text-xs h-8 font-bold px-3 rounded-lg cursor-pointer"
                >
                  Re-admit to Hostel
                </Button>
              )}
            </div>
          </div>
          {/* Statement rows */}
          <div className="max-w-md space-y-2 text-xs font-mono">
            <div className="flex justify-between"><span className="text-mute">Hostel Fee (after discount)</span><span className="text-ink">{fmt(account.remainingNetFee)}{account.netFee !== account.remainingNetFee && <span className="text-3xs text-mute font-normal"> (of {fmt(account.netFee)})</span>}</span></div>
            {account.previousOutstanding > 0 && (
              <div className="flex justify-between text-amber-700"><span className="text-mute">+ Previous Outstanding Dues</span><span className="font-bold">{fmt(account.remainingPreviousOutstanding)}{account.previousOutstanding !== account.remainingPreviousOutstanding && <span className="text-3xs text-amber-600/70 font-normal"> (of {fmt(account.previousOutstanding)})</span>}</span></div>
            )}
            <div className="flex justify-between"><span className="text-mute">Daily-use money given</span><span className="text-ink">+{fmt(account.dailyUseGiven)}</span></div>
            <div className="flex justify-between border-t border-beige pt-2"><span className="text-mute font-bold">Total the institute wants</span><span className="text-ink font-bold">{fmt(account.totalCharged)}</span></div>
            <div className="flex justify-between"><span className="text-emerald-700">Paid so far</span><span className="text-emerald-700">−{fmt(account.paid)}</span></div>
            <div className="flex justify-between border-t border-beige pt-2"><span className="text-label font-extrabold uppercase tracking-wide">Balance Due</span><span className={`font-extrabold text-base ${account.balanceDue > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>{fmt(account.balanceDue)}</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Collect fee with mandatory date picker */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5"><Coins size={13} /> Collect Hostel Fee</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label className="text-2xs text-mute">Fee Component *</Label>
              <select
                value={payComponent}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setPayComponent(val);
                  if (val === 'PREVIOUS_DUES') {
                    setPayAmount(account.remainingPreviousOutstanding ? String(account.remainingPreviousOutstanding) : '');
                  } else if (val === 'CURRENT_YEAR') {
                    setPayAmount(account.remainingNetFee ? String(account.remainingNetFee) : '');
                  } else {
                    setPayAmount(account.balanceDue > 0 ? String(account.balanceDue) : '');
                  }
                }}
                className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none"
              >
                <option value="ALL">All Dues Combined (Current + Previous)</option>
                <option value="CURRENT_YEAR">Current Year Hostel Fee ({fmt(account.remainingNetFee)})</option>
                <option value="PREVIOUS_DUES">Previous Outstanding Dues ({fmt(account.remainingPreviousOutstanding)})</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-2xs text-mute">Collection Date *</Label>
              <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </div>
            <div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
              <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" className="pl-6 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono font-bold" /></div>
            <Button onClick={() => act('pay', { amount: Number(payAmount), date: payDate, feeComponent: payComponent, paymentMode: 'CASH' })} disabled={busy || !payDate || !(Number(payAmount) > 0)}
              className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-8 rounded-lg cursor-pointer">Record Payment</Button>
          </CardContent>
        </Card>

        {/* Daily-use money */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1.5"><HandCoins size={13} /> Daily-use Money</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
              <Input type="number" value={duAmount} onChange={e => setDuAmount(e.target.value)} placeholder="Amount given" className="pl-6 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono font-bold" /></div>
            <Input value={duNote} onChange={e => setDuNote(e.target.value)} placeholder="Note (optional)" className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            <Button onClick={() => act('daily_use', { amount: Number(duAmount), date: today(), description: duNote })} disabled={busy || !(Number(duAmount) > 0)}
              className="w-full bg-amber-700 hover:bg-amber-600 text-white font-semibold text-xs h-8 rounded-lg cursor-pointer">Give Money</Button>
          </CardContent>
        </Card>

        {/* Discount form */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-brand flex items-center gap-1.5"><Pencil size={13} /> Hostel Discount</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label className="text-2xs text-mute">Discount Type</Label>
              <select value={discType} onChange={e => setDiscType(e.target.value)}
                className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="">No discount</option><option value="PERCENTAGE">Percentage %</option><option value="FIXED_AMOUNT">Fixed ₹</option>
              </select>
            </div>
            {discType && (
              <Input type="number" value={discVal} onChange={e => setDiscVal(e.target.value)} placeholder={discType === 'PERCENTAGE' ? '0-100' : '₹'}
                className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono font-bold" />
            )}
            <Button onClick={saveDiscount} disabled={busy} className="w-full bg-brand hover:bg-brand/90 text-white font-semibold text-xs h-8 rounded-lg cursor-pointer mt-2">
              Save Discount
            </Button>
          </CardContent>
        </Card>

        {/* Previous Dues form */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5"><Pencil size={13} /> Previous Dues</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label className="text-2xs text-mute">Previous Outstanding Dues ₹</Label>
              <Input type="number" value={prevOutVal} onChange={e => setPrevOutVal(e.target.value)} placeholder="0.00" className="h-8 border-beige bg-field text-ink text-xs font-mono font-bold focus-visible:ring-brand" />
            </div>
            <Button onClick={savePreviousOutstanding} disabled={busy} className="w-full bg-amber-700 hover:bg-amber-600 text-white font-semibold text-xs h-8 rounded-lg cursor-pointer mt-2">
              Save Outstanding Dues
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Histories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Payment History</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-[300px] overflow-y-auto">
            {payments.length === 0 ? <p className="text-xs text-mute italic p-4">No payments yet.</p> : (
              <table className="w-full text-xs"><tbody className="divide-y divide-beige">
                {payments.map((p: any) => (
                  <tr key={p.id} className={p.isDeleted ? "opacity-50 bg-red-50/10 line-through text-mute" : ""}>
                    <td className="px-4 py-3 text-mute">
                      <div>{fmtDate(p.date)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-2xs text-mute">{p.referenceNo}</div>
                      <div className="text-3xs text-label max-w-[200px] truncate mt-0.5" title={p.description}>
                        {p.isDeleted && <span className="text-red-600 font-bold mr-1.5">[DELETED]</span>}
                        {p.description ? p.description.split(' — ')[0].replace('Hostel fee', 'Hostel Fee') : '—'}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${p.isDeleted ? 'text-mute' : 'text-emerald-700'}`}>+{fmt(p.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedReceipt(p)}
                          title="Print Receipt"
                          className="p-1 rounded bg-cream hover:bg-beige text-brand font-bold cursor-pointer"
                        >
                          <FileCheck2 size={11} />
                        </button>
                        {!p.isDeleted && (
                          <>
                            <button
                              onClick={() => setEditingTxn(p)}
                              title="Edit Entry"
                              className="p-1 rounded bg-cream hover:bg-beige text-label font-bold cursor-pointer"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={() => deleteTxn(p.id, true)}
                              title="Delete Entry"
                              className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold cursor-pointer"
                            >
                              <X size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </CardContent>
        </Card>
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Daily-use History</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-[300px] overflow-y-auto">
            {dailyUse.length === 0 ? <p className="text-xs text-mute italic p-4">No daily-use money given yet.</p> : (
              <table className="w-full text-xs"><tbody className="divide-y divide-beige">
                {dailyUse.map((p: any) => (
                  <tr key={p.id} className={p.isDeleted ? "opacity-50 bg-red-50/10 line-through text-mute" : ""}>
                    <td className="px-4 py-2 text-mute">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2 text-mute truncate max-w-[160px]">
                      {p.isDeleted && <span className="text-red-600 font-bold mr-1.5">[DELETED]</span>}
                      {p.description?.replace(/^Daily-use — [^:]+: ?/, '') || '—'}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${p.isDeleted ? 'text-mute' : 'text-amber-600'}`}>{fmt(p.amount)}</td>
                    <td className="px-4 py-2 text-center">
                      {!p.isDeleted && (
                        <button
                          onClick={() => deleteTxn(p.id, false)}
                          title="Delete Entry"
                          className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold cursor-pointer"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedReceipt && (
        <ReceiptModal
          isOpen={!!selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          transaction={selectedReceipt}
        />
      )}

      {editingTxn && (
        <EditHostelTxnModal
          txn={editingTxn}
          onClose={() => setEditingTxn(null)}
          onSaved={() => { setEditingTxn(null); load(); triggerDataChange(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════ TAB 2: STAFF ════════════════════════════

function StaffTab() {
  const [staff, setStaff] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    window.open('/api/export?type=hostel_staff');
  };

  // Basic
  const [name, setName] = useState(''); const [role, setRole] = useState('');
  const [fatherName, setFatherName] = useState(''); const [dob, setDob] = useState('');
  const [phone, setPhone] = useState(''); const [address, setAddress] = useState('');
  const [salary, setSalary] = useState(''); const [joinDate, setJoinDate] = useState(today());
  // Documents & IDs
  const [aadharNo, setAadharNo] = useState(''); const [panNo, setPanNo] = useState(''); const [bankAccountNo, setBankAccountNo] = useState('');
  const [photoUrl, setPhotoUrl] = useState(''); const [aadharDocUrl, setAadharDocUrl] = useState(''); const [otherDocUrl, setOtherDocUrl] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try { const d = await fetch('/api/hostel/staff?status=ACTIVE').then(r => r.json()); setStaff(d.staff || []); }
    catch { setStaff([]); } finally { setIsLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  const addStaff = async () => {
    setError(null);
    if (!name.trim() || !role.trim() || !(Number(salary) > 0)) { setError('Name, role, and salary are required.'); return; }
    if (phone.trim() && !/^\d{10}$/.test(phone.replace(/\s|-/g, ''))) { setError('Phone number must be exactly 10 digits.'); return; }
    if (aadharNo.trim() && !/^\d{12}$/.test(aadharNo.replace(/\s|-/g, ''))) { setError('Aadhar number must be exactly 12 digits.'); return; }
    if (!photoUrl.trim() || !aadharDocUrl.trim()) { setError('Photo and Aadhar document are mandatory.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/hostel/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, fatherName, dob, phone, address, monthlySalary: Number(salary), joinDate, aadharNo, panNo, bankAccountNo, photoUrl, aadharDocUrl, otherDocUrl }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setName(''); setRole(''); setFatherName(''); setDob(''); setPhone(''); setAddress(''); setSalary('');
      setAadharNo(''); setPanNo(''); setBankAccountNo(''); setPhotoUrl(''); setAadharDocUrl(''); setOtherDocUrl('');
      setShowAdd(false); triggerDataChange(); load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  if (profileId) return <HostelStaffProfile staffId={profileId} onBack={() => { setProfileId(null); load(); }} />;

  const inp = "h-8 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mute"><span className="text-label font-bold">{staff.length}</span> hostel staff</span>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download size={14} />}
            <span>Export</span>
          </Button>
          <Button onClick={() => setShowAdd(v => !v)} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer">
            {showAdd ? <X size={14} /> : <Plus size={14} />} {showAdd ? 'Close' : 'Add Staff'}
          </Button>
        </div>
      </div>

      {showAdd && (
        <Card className="border border-brand/20 bg-brand/5 text-ink">
          <CardContent className="p-4 space-y-4">
            {error && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle size={13} /> {error}</div>}
            {/* Basic */}
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-mute mb-2">Basic Details</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1"><Label className="text-2xs text-mute">Name *</Label><Input value={name} onChange={e => setName(e.target.value)} className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Role *</Label><Input value={role} onChange={e => setRole(e.target.value)} placeholder="Warden / Cook..." className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Father&apos;s Name</Label><Input value={fatherName} onChange={e => setFatherName(e.target.value)} className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Date of Birth</Label><Input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit phone" className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Monthly Salary ₹ *</Label><Input type="number" value={salary} onChange={e => setSalary(e.target.value)} className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Join Date</Label><Input type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} className={inp} /></div>
              </div>
            </div>
            {/* Documents & IDs */}
            <div>
              <p className="text-2xs font-bold uppercase tracking-wider text-mute mb-2">Documents &amp; IDs</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-2xs text-mute">Aadhar No.</Label><Input value={aadharNo} onChange={e => setAadharNo(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit Aadhar" className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">PAN No.</Label><Input value={panNo} onChange={e => setPanNo(e.target.value)} className={inp} /></div>
                <div className="space-y-1"><Label className="text-2xs text-mute">Bank Account No.</Label><Input value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} className={inp} /></div>
                <div className="col-span-2 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  <FileUploader
                    label="Hostel Staff Photo *"
                    pathParts={['hostel', 'staff', 'Staff_Photos']}
                    onUploadSuccess={(url) => setPhotoUrl(url)}
                    value={photoUrl}
                    acceptImagesOnly={true}
                  />
                  <FileUploader
                    label="Aadhar Document *"
                    pathParts={['hostel', 'staff', 'Staff_Aadhars']}
                    onUploadSuccess={(url) => setAadharDocUrl(url)}
                    value={aadharDocUrl}
                  />
                  <FileUploader
                    label="Other / ID Document"
                    pathParts={['hostel', 'staff', 'Staff_Other_Docs']}
                    onUploadSuccess={(url) => setOtherDocUrl(url)}
                    value={otherDocUrl}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end"><Button onClick={addStaff} disabled={busy} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">{busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add Staff</Button></div>
          </CardContent>
        </Card>
      )}

      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
          : staff.length === 0 ? <div className="text-center py-16"><UserCog size={36} className="mx-auto text-mute mb-3" /><p className="text-mute text-sm font-semibold">No hostel staff yet</p></div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                  <th className="p-4">Name</th><th className="p-4">Role</th><th className="p-4 text-right">Monthly Salary</th>
                  <th className="p-4 text-right">Paid ({staff[0]?.currentMonth})</th><th className="p-4 text-right">Remaining</th><th className="p-4 text-center">Action</th>
                </tr></thead>
                <tbody className="divide-y divide-beige">
                  {staff.map(s => (
                    <React.Fragment key={s.id}>
                      <tr className="hover:bg-cream">
                        <td className="p-4 font-semibold text-ink">{s.name}</td>
                        <td className="p-4 text-mute">{s.role}</td>
                        <td className="p-4 text-right font-mono text-label">{fmt(s.monthlySalary)}</td>
                        <td className="p-4 text-right font-mono text-emerald-700">{fmt(s.paidThisMonth)}</td>
                        <td className={`p-4 text-right font-mono font-bold ${s.remainingThisMonth > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>{fmt(s.remainingThisMonth)}</td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => setProfileId(s.id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cream hover:bg-beige text-label text-2xs font-bold cursor-pointer">Profile <ChevronRight size={12} /></button>
                            <button onClick={() => setPayFor(payFor === s.id ? null : s.id)} className="px-2.5 py-1 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white text-2xs font-bold cursor-pointer">Pay Salary</button>
                          </div>
                        </td>
                      </tr>
                      {payFor === s.id && <tr><td colSpan={6} className="p-0"><PaySalaryForm staff={s} onPaid={() => { setPayFor(null); load(); }} /></td></tr>}
                    </React.Fragment>
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

function PaySalaryForm({ staff, onPaid }: { staff: any; onPaid: () => void }) {
  const [month, setMonth] = useState(staff.currentMonth);
  const [year, setYear] = useState(staff.currentYear);
  const [amount, setAmount] = useState(String(Math.max(0, Number(staff.remainingThisMonth) || Number(staff.monthlySalary))));
  const [paymentDate, setPaymentDate] = useState(today());
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    if (!(Number(amount) > 0)) { setError('Enter a positive amount.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/hostel/staff/${staff.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay_salary', month, year: Number(year), amount: Number(amount), date: paymentDate, paymentMode: 'CASH' }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      triggerDataChange();
      onPaid();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-cream px-6 py-4 flex flex-wrap items-end gap-3">
      {error && <div className="w-full text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</div>}
      <div className="space-y-1"><Label className="text-2xs text-mute">Payment Date</Label>
        <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 w-36 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
      </div>
      <div className="space-y-1"><Label className="text-2xs text-mute">Month</Label>
        <select value={month} onChange={e => setMonth(e.target.value)} className="block h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand">
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="space-y-1"><Label className="text-2xs text-mute">Year</Label>
        <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="h-8 w-24 border-beige bg-field text-ink text-xs focus-visible:ring-brand" /></div>
      <div className="space-y-1"><Label className="text-2xs text-mute">Amount</Label>
        <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-8 w-32 pl-5 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" /></div></div>
      <Button onClick={pay} disabled={busy} className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Pay</Button>
    </div>
  );
}

// ─── Hostel Staff Profile (2 sections: details+docs, month-wise salary) ───

function HostelStaffProfile({ staffId, onBack }: { staffId: string; onBack: () => void }) {
  const [data, setData] = useState<{ staff: any; months: any[]; totalPaid: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [payMonth, setPayMonth] = useState<string | null>(null); // "Month-Year" key being paid
  const [isEditing, setIsEditing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try { setData(await fetch(`/api/hostel/staff/${staffId}`).then(r => r.json())); }
    catch { setData(null); } finally { setIsLoading(false); }
  }, [staffId]);
  useEffect(() => { load(); }, [load]);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  if (!data?.staff) return <div className="text-center py-16"><AlertCircle size={32} className="mx-auto text-red-600 mb-2" /><button onClick={onBack} className="text-brand text-xs cursor-pointer">←  Back</button></div>;

  const s = data.staff;
  const docs = [
    { label: 'Photo', url: s.photoUrl },
    { label: 'Aadhar Document', url: s.aadharDocUrl },
    { label: 'Other / ID Document', url: s.otherDocUrl },
  ];
  const details = [
    { label: "Father's Name", val: s.fatherName },
    { label: 'Date of Birth', val: s.dob ? fmtDate(s.dob) : null },
    { label: 'Phone', val: s.phone },
    { label: 'Address', val: s.address },
    { label: 'Join Date', val: fmtDate(s.joinDate) },
    { label: 'Aadhar No.', val: s.aadharNo },
    { label: 'PAN No.', val: s.panNo },
    { label: 'Bank Account', val: s.bankAccountNo },
  ];

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-mute hover:text-label font-semibold cursor-pointer">
        <ArrowLeft size={13} /> Back to Staff
      </button>

      {/* Header */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {s.photoUrl ? (
              <img src={toViewableImageUrl(s.photoUrl)} alt={s.name} className="h-14 w-14 rounded-2xl object-cover border border-brand/30 bg-brand/10" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand font-bold text-xl">{s.name.charAt(0)}</div>
            )}
            <div>
              <p className="text-lg font-extrabold text-ink">{s.name}</p>
              <p className="text-xs text-mute mt-0.5">{s.role} &middot; Monthly salary <span className="text-brand font-bold">{fmt(s.monthlySalary)}</span></p>
            </div>
          </div>
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5 shrink-0">
              <Pencil size={12} /> Edit Profile
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── SECTION 1: Staff Details & Documents (or inline edit form) ── */}
      {isEditing ? (
        <HostelStaffEditForm
          staff={s}
          onCancel={() => setIsEditing(false)}
          onSaved={async () => { setIsEditing(false); await load(); }}
        />
      ) : (
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">1 &middot; Staff Details &amp; Documents</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
              {details.map(d => (
                <div key={d.label} className="border-b border-beige pb-2">
                  <p className="text-mute">{d.label}</p>
                  <p className="font-semibold text-ink mt-0.5">{d.val || '—'}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs pt-1">
              {docs.map(d => (
                <div key={d.label} className="p-3 rounded-lg border border-beige bg-cream">
                  <p className="text-mute font-semibold mb-1">{d.label}</p>
                  {d.url
                    ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand underline">View {d.label} ↗</a>
                    : <span className="text-mute italic">Not uploaded</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── SECTION 2: Month-wise Salary ── */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">2 · Salary — Month by Month</CardTitle>
          <CardDescription className="text-xs text-mute">Pay full or part of each month. A fully-paid month shows <span className="text-emerald-700 font-bold">CLEARED</span>.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                <th className="p-4">Month</th><th className="p-4 text-right">Salary</th><th className="p-4 text-right">Paid</th><th className="p-4 text-right">Remaining</th><th className="p-4 text-center">Status</th><th className="p-4 text-center">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-beige">
                {data.months.map((m: any) => {
                  const key = `${m.month}-${m.year}`;
                  const cleared = m.expected > 0 && m.paid >= m.expected;
                  const partial = m.paid > 0 && m.paid < m.expected;
                  const isPaying = payMonth === key;
                  return (
                    <React.Fragment key={key}>
                      <tr className={`transition-colors ${cleared ? 'bg-emerald-50' : 'hover:bg-cream'}`}>
                        <td className="p-4 font-semibold text-ink">{m.month} {m.year}</td>
                        <td className="p-4 text-right font-mono text-label">{fmt(m.expected)}</td>
                        <td className="p-4 text-right font-mono text-emerald-700">{fmt(m.paid)}</td>
                        <td className={`p-4 text-right font-mono font-bold ${m.remaining > 0 ? 'text-amber-600' : 'text-mute'}`}>{fmt(m.remaining)}</td>
                        <td className="p-4 text-center">
                          {cleared ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 size={10} /> Cleared</span>
                          : partial ? <span className="px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-amber-50 text-amber-600 border-amber-200">Partial</span>
                          : <span className="px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-slate-100 text-mute border-[#dcd5c8]">Unpaid</span>}
                        </td>
                        <td className="p-4 text-center">
                          {cleared ? <span className="text-mute text-2xs">—</span>
                          : <button onClick={() => setPayMonth(isPaying ? null : key)} className="px-2.5 py-1 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white text-2xs font-bold cursor-pointer">{isPaying ? 'Close' : 'Pay'}</button>}
                        </td>
                      </tr>
                      {isPaying && (
                        <tr><td colSpan={6} className="p-0">
                          <PaySalaryForm
                            staff={{ id: staffId, currentMonth: m.month, currentYear: m.year, remainingThisMonth: m.remaining, monthlySalary: m.expected }}
                            onPaid={() => { setPayMonth(null); load(); }}
                          />
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════ TAB 3: DASHBOARD ════════════════════════════

function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/hostel/summary').then(r => r.json()).then(setData).catch(() => setData(null)).finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  if (!data) return <div className="text-center py-16 text-mute text-sm">Failed to load dashboard.</div>;

  const s = data.students, du = data.dailyUse, m = data.money;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Residents', value: s.totalResidents, color: 'text-brand', icon: Users },
          { label: 'Fully Paid', value: s.fullyPaid, color: 'text-emerald-700', icon: CheckCircle2 },
          { label: 'Pending', value: s.pending, color: 'text-amber-600', icon: AlertCircle },
          { label: 'Outstanding', value: fmt(s.outstanding), color: 'text-red-300', icon: Coins },
        ].map(c => (
          <Card key={c.label} className="border-beige bg-paper text-ink shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-2xs text-mute uppercase font-bold tracking-wider">{c.label}</p><p className={`text-xl font-extrabold mt-1 ${c.color}`}>{c.value}</p></div>
              <c.icon size={18} className="text-mute" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section A: students fee status */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Students — Fee Status</CardTitle>
            <CardDescription className="text-xs text-mute">Collected {fmt(s.totalPaid)} of {fmt(s.totalCharged)}</CardDescription></CardHeader>
          <CardContent className="p-0">
            {s.rows.length === 0 ? <p className="text-xs text-mute italic p-4">No residents.</p> : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-field">
                    <tr className="text-mute font-bold uppercase tracking-wider text-2xs">
                      <th className="p-3 text-left">Student</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {s.rows.map((r: any) => (
                      <tr key={r.id}>
                        <td className="p-3">
                          <span className="text-label font-medium">{r.name}</span>
                          <span className="text-mute ml-1.5 text-2xs font-mono">Cl.{r.className}</span>
                        </td>
                        <td className="p-3 text-right font-mono text-mute">{fmt(r.totalCharged)}</td>
                        <td className="p-3 text-right font-mono text-emerald-700">{fmt(r.paid)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${r.balanceDue > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                          {fmt(r.balanceDue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section B: daily-use money */}
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-bold uppercase tracking-wider text-mute flex items-center gap-1.5"><HandCoins size={14} className="text-amber-600" /> Daily-use Money Given</CardTitle>
            <CardDescription className="text-xs text-mute">Total handed out: <span className="text-amber-600 font-bold">{fmt(du.total)}</span></CardDescription></CardHeader>
          <CardContent className="p-0">
            {du.rows.length === 0 ? <p className="text-xs text-mute italic p-4">No daily-use money given yet.</p> : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-xs"><tbody className="divide-y divide-beige">
                  {du.rows.map((r: any) => (
                    <tr key={r.id}><td className="p-3 text-label font-medium">{r.name} <span className="text-mute text-2xs font-mono">{r.admissionNo}</span></td><td className="p-3 text-right font-mono text-amber-600">{fmt(r.given)}</td></tr>
                  ))}
                </tbody></table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Money summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-emerald-900/30 bg-emerald-50 text-ink shadow-md"><CardContent className="p-4 flex items-center justify-between"><div><p className="text-2xs text-emerald-700/80 uppercase font-bold tracking-wider">Hostel Income</p><p className="text-xl font-extrabold mt-1 text-emerald-700">{fmt(m.totalIncome)}</p></div><TrendingUp size={18} className="text-emerald-700" /></CardContent></Card>
        <Card className="border-red-900/30 bg-red-950/10 text-ink shadow-md"><CardContent className="p-4 flex items-center justify-between"><div><p className="text-2xs text-red-600/80 uppercase font-bold tracking-wider">Hostel Expense</p><p className="text-xl font-extrabold mt-1 text-red-300">{fmt(m.totalExpense)}</p></div><TrendingDown size={18} className="text-red-600" /></CardContent></Card>
        <Card className={`shadow-md text-ink ${m.net >= 0 ? 'border-brand/20 bg-brand/5' : 'border-amber-200 bg-amber-50'}`}><CardContent className="p-4 flex items-center justify-between"><div><p className="text-2xs text-brand/80 uppercase font-bold tracking-wider">Net Balance</p><p className={`text-xl font-extrabold mt-1 ${m.net >= 0 ? 'text-brand' : 'text-amber-600'}`}>{fmt(m.net)}</p></div><Wallet size={18} className="text-brand" /></CardContent></Card>
      </div>
    </div>
  );
}

// ════════════════════════════ TAB 4: INCOME & EXPENSE ════════════════════════════

function FinanceTab({ role }: { role?: string }) {
  const isDirector = role === 'DIRECTOR';
  const [sub, setSub] = useState<'all' | 'MESS' | 'LAUNDRY' | 'RELIGIOUS_SOCIAL' | 'GHAR' | 'SCHOOL' | 'INCOME'>('all');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, net: 0 });
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [editingTxn, setEditingTxn] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');

  // Synced Notes states
  const [notes, setNotes] = useState('');
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);

  const deleteTxn = async (id: string, isIncome: boolean) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this transaction entry? This will update live balance totals immediately.');
    if (!confirmDelete) return;
    try {
      const endpoint = isIncome ? `/api/hostel/income?id=${id}` : `/api/hostel/expense?id=${id}`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete entry');
      triggerDataChange();
      load();
    } catch (err: any) {
      alert(err.message || 'Error deleting transaction');
    }
  };

  const handleExport = () => {
    window.open(`/api/export?type=hostel_finance&category=${sub}`);
  };

  // add expense form states
  const [cat, setCat] = useState('MESS');
  const [targetSchool, setTargetSchool] = useState('New Modern Sr. Sec. School');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // add income form states
  const [incAmount, setIncAmount] = useState('');
  const [incDate, setIncDate] = useState(today());
  const [incDesc, setIncDesc] = useState('');
  const [incMode, setIncMode] = useState('CASH');
  const [incBusy, setIncBusy] = useState(false);
  const [incError, setIncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      if (sub === 'INCOME') {
        const [incRes, sum] = await Promise.all([
          fetch('/api/hostel/income?limit=unlimited').then(r => r.json()),
          fetch('/api/hostel/summary').then(r => r.json()),
        ]);
        setIncomes(incRes.incomes || []);
        setSummary(sum.money || { totalIncome: 0, totalExpense: 0, net: 0 });
      } else {
        const params = new URLSearchParams({ category: sub === 'all' ? 'all' : sub, limit: 'unlimited' });
        const [exp, sum] = await Promise.all([
          fetch(`/api/hostel/expense?${params}`).then(r => r.json()),
          fetch('/api/hostel/summary').then(r => r.json()),
        ]);
        setExpenses(exp.expenses || []);
        setSummary(sum.money || { totalIncome: 0, totalExpense: 0, net: 0 });
      }
    } catch {
      setExpenses([]); setIncomes([]);
    } finally {
      setIsLoading(false);
    }
  }, [sub]);

  const fetchNotes = async () => {
    setIsLoadingNotes(true);
    setNotesMessage(null);
    try {
      const res = await fetch('/api/hostel/notes');
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || '');
      }
    } catch (e) {
      console.error('Failed to load hostel notes', e);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const saveNotes = async () => {
    setIsSavingNotes(true);
    setNotesMessage(null);
    try {
      const res = await fetch('/api/hostel/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      });
      if (res.ok) {
        setNotesMessage('✓ Saved and synced successfully!');
        setTimeout(() => setNotesMessage(null), 3000);
      } else {
        throw new Error();
      }
    } catch (e) {
      console.error('Failed to save hostel notes', e);
      setNotesMessage('❌ Failed to save notes.');
    } finally {
      setIsSavingNotes(false);
    }
  };

  const getUniqueMonths = () => {
    const dates = new Set<string>();
    expenses.forEach(e => { if (e.date) dates.add(e.date.slice(0, 7)); });
    incomes.forEach(inc => { if (inc.date) dates.add(inc.date.slice(0, 7)); });
    return Array.from(dates).sort().reverse();
  };

  const formatMonthLabel = (ym: string) => {
    const [year, month] = ym.split('-');
    const monthName = MONTHS[parseInt(month) - 1];
    return `${monthName} ${year}`;
  };

  // Client-side filtering
  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = !searchQuery.trim() || 
      (e.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      String(e.amount).includes(searchQuery) ||
      (e.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesMonth = selectedMonth === 'all' || 
      (e.date && e.date.startsWith(selectedMonth));
    
    return matchesSearch && matchesMonth;
  });

  const filteredIncomes = incomes.filter(inc => {
    const matchesSearch = !searchQuery.trim() || 
      (inc.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      String(inc.amount).includes(searchQuery) ||
      (inc.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesMonth = selectedMonth === 'all' || 
      (inc.date && inc.date.startsWith(selectedMonth));
    
    return matchesSearch && matchesMonth;
  });

  useEffect(() => { load(); }, [load]);
  useDataSubscription(load);

  const addExpense = async () => {
    setError(null);
    if (!(Number(amount) > 0)) { setError('Enter a positive amount.'); return; }
    setBusy(true);
    try {
      let finalDesc = desc.trim();
      if (cat === 'SCHOOL') {
        finalDesc = `[${targetSchool}] ${finalDesc}`.trim();
      }
      const res = await fetch('/api/hostel/expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, amount: Number(amount), date, description: finalDesc })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save entry');
      setAmount(''); setDesc(''); setDate(today());
      setShowAdd(false);
      triggerDataChange();
      load();
    } catch (err: any) {
      setError(err.message || 'Server error saving transaction');
    } finally {
      setBusy(false);
    }
  };

  const addIncome = async () => {
    setIncError(null);
    if (!(Number(incAmount) > 0)) { setIncError('Enter a positive amount.'); return; }
    setIncBusy(true);
    try {
      const res = await fetch('/api/hostel/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(incAmount), date: incDate, description: incDesc.trim(), paymentMode: incMode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save entry');
      setIncAmount(''); setIncDesc(''); setIncDate(today());
      setShowAddIncome(false);
      triggerDataChange();
      load();
    } catch (err: any) {
      setIncError(err.message || 'Server error saving transaction');
    } finally {
      setIncBusy(false);
    }
  };

  const CAT_ICON: Record<string, React.ElementType> = {
    MESS: Utensils,
    LAUNDRY: Shirt,
    RELIGIOUS_SOCIAL: Sparkles,
    GHAR: Home,
    SCHOOL: Building,
    OTHER_EXPENSE: Coins,
    OTHER_INCOME: TrendingUp,
  };

  const CAT_LABEL: Record<string, string> = {
    MESS: 'Mess',
    LAUNDRY: 'Laundry',
    RELIGIOUS_SOCIAL: 'Religious & Social',
    GHAR: 'Ghar (Home)',
    SCHOOL: 'School',
    OTHER_EXPENSE: 'Other Expense',
    OTHER_INCOME: 'Other Income',
  };

  const subTabs = [
    { id: 'all', label: 'All Expenses' },
    { id: 'MESS', label: 'Mess' },
    { id: 'LAUNDRY', label: 'Laundry' },
    { id: 'RELIGIOUS_SOCIAL', label: 'Religious & Social' },
    ...(isDirector ? [
      { id: 'GHAR', label: '🏠 Ghar' },
      { id: 'SCHOOL', label: '🏫 School' },
    ] : []),
    { id: 'INCOME', label: '💰 Income Entries' },
  ];

  return (
    <div className="space-y-5">
      {/* Money summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-emerald-900/30 bg-emerald-50 text-ink shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-2xs text-emerald-700/80 uppercase font-bold tracking-wider">Total Income</p>
              <p className="text-xl font-extrabold mt-1 text-emerald-700">{fmt(summary.totalIncome)}</p>
            </div>
            <TrendingUp size={18} className="text-emerald-700" />
          </CardContent>
        </Card>
        <Card className="border-red-900/30 bg-red-950/10 text-ink shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-2xs text-red-600/80 uppercase font-bold tracking-wider">Total Expense</p>
              <p className="text-xl font-extrabold mt-1 text-red-600">{fmt(summary.totalExpense)}</p>
            </div>
            <TrendingDown size={18} className="text-red-600" />
          </CardContent>
        </Card>
        <Card className={`shadow-md text-ink ${summary.net >= 0 ? 'border-brand/20 bg-brand/5' : 'border-amber-200 bg-amber-50'}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-2xs text-brand/80 uppercase font-bold tracking-wider">Net Balance</p>
              <p className={`text-xl font-extrabold mt-1 ${summary.net >= 0 ? 'text-brand' : 'text-amber-600'}`}>{fmt(summary.net)}</p>
            </div>
            <Wallet size={18} className="text-brand" />
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs + add actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-field border border-beige rounded-lg p-0.5 overflow-x-auto">
          {subTabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setSub(id as any); setSearchQuery(''); setSelectedMonth('all'); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all whitespace-nowrap ${
                sub === id ? 'bg-brand text-white' : 'text-mute hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
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
          <Button
            onClick={() => { setShowAddIncome(v => !v); setShowAdd(false); }}
            className="border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold text-xs h-9 px-3.5 gap-1.5 rounded-lg cursor-pointer"
          >
            {showAddIncome ? <X size={14} /> : <Plus size={14} />} {showAddIncome ? 'Close' : '+ Add Income'}
          </Button>
          <Button
            onClick={() => { setShowAdd(v => !v); setShowAddIncome(false); if (['all', 'INCOME'].includes(sub)) setCat('MESS'); else setCat(sub); }}
            className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer"
          >
            {showAdd ? <X size={14} /> : <Plus size={14} />} {showAdd ? 'Close' : 'Add Expense'}
          </Button>
        </div>
      </div>

      {/* Add Expense Form */}
      {showAdd && (
        <Card className="border border-brand/20 bg-brand/5 text-ink">
          <CardContent className="p-4 space-y-3">
            {error && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle size={13} /> {error}</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-2xs text-mute">Category</Label>
                <select
                  value={cat}
                  onChange={e => setCat(e.target.value)}
                  className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand font-semibold"
                >
                  <option value="MESS">Mess</option>
                  <option value="LAUNDRY">Laundry</option>
                  <option value="RELIGIOUS_SOCIAL">Religious & Social</option>
                  <option value="GHAR">Ghar (Home)</option>
                  <option value="SCHOOL">School Transfer</option>
                  <option value="OTHER_EXPENSE">Other Expense</option>
                </select>
              </div>

              {cat === 'SCHOOL' && (
                <div className="space-y-1">
                  <Label className="text-2xs text-mute">Target School Branch</Label>
                  <select
                    value={targetSchool}
                    onChange={e => setTargetSchool(e.target.value)}
                    className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand font-semibold"
                  >
                    <option value="New Modern Sr. Sec. School">New Modern Sr. Sec. School (Hindi)</option>
                    <option value="Modern English School">Modern English School</option>
                    <option value="Modern Mahila Mahavidhyalaya">Modern Mahila Mahavidhyalaya</option>
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-2xs text-mute">Amount ₹</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono font-bold" />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs text-mute">Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
              </div>
              <div className="space-y-1 col-span-2 md:col-span-1">
                <Label className="text-2xs text-mute">Description</Label>
                <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder={cat === 'GHAR' ? 'Reason for cash home...' : cat === 'RELIGIOUS_SOCIAL' ? 'Event / Puja details...' : 'What for?'} className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={addExpense} disabled={busy} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add Expense
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Income Form */}
      {showAddIncome && (
        <Card className="border border-emerald-300 bg-emerald-50/70 text-ink">
          <CardContent className="p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase text-emerald-800 tracking-wider flex items-center gap-1.5">
              <TrendingUp size={14} /> Log Other Income (Donations, Rent, Misc. Receipts)
            </h4>
            {incError && <div className="flex items-center gap-2 text-xs text-red-600"><AlertCircle size={13} /> {incError}</div>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-2xs text-mute">Amount ₹</Label>
                <Input type="number" value={incAmount} onChange={e => setIncAmount(e.target.value)} placeholder="0.00" className="h-8 border-beige bg-white text-ink text-xs focus-visible:ring-emerald-600 font-mono font-bold" />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs text-mute">Date</Label>
                <Input type="date" value={incDate} onChange={e => setIncDate(e.target.value)} className="h-8 border-beige bg-white text-ink text-xs focus-visible:ring-emerald-600" />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs text-mute">Payment Mode</Label>
                <select value={incMode} onChange={e => setIncMode(e.target.value)} className="w-full h-8 bg-white border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-emerald-600">
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-2xs text-mute">Source / Description</Label>
                <Input value={incDesc} onChange={e => setIncDesc(e.target.value)} placeholder="e.g. Room rent, Old newspaper sale, Donation..." className="h-8 border-beige bg-white text-ink text-xs focus-visible:ring-emerald-600" />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={addIncome} disabled={incBusy} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
                {incBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Save Income Entry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaction Table */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-4 space-y-4">
          
          {/* SEARCH, FILTER & NOTES BAR */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-cream/10 p-3 rounded-xl border border-beige/40">
            <div className="flex-1 w-full relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute w-4 h-4" />
              <Input
                type="text"
                placeholder="Search ledger entries..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 border-beige bg-white text-ink text-xs focus-visible:ring-brand rounded-lg h-9 w-full"
              />
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="h-9 px-3 bg-white border border-beige text-ink text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-brand font-semibold min-w-[130px]"
              >
                <option value="all">All Months</option>
                {getUniqueMonths().map(ym => (
                  <option key={ym} value={ym}>
                    {formatMonthLabel(ym)}
                  </option>
                ))}
              </select>

              {(role === 'DIRECTOR' || role === 'HOSTEL_HEAD') && (
                <Button
                  onClick={() => {
                    fetchNotes();
                    setIsNotesModalOpen(true);
                  }}
                  className="h-9 px-3.5 gap-1.5 border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs rounded-lg cursor-pointer shrink-0"
                  title="Hostel Boarding Sync Notes"
                >
                  <FileCheck2 size={14} className="text-brand" />
                  <span>Notes</span>
                </Button>
              )}
            </div>
          </div>

          {/* TABLE AREA */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
          ) : sub === 'INCOME' ? (
            filteredIncomes.length === 0 ? (
              <div className="text-center py-16"><TrendingUp size={36} className="mx-auto text-mute mb-3" /><p className="text-mute text-sm font-semibold">No matching income entries found</p></div>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-beige rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-beige bg-emerald-50/50 text-emerald-900 font-bold uppercase tracking-wider sticky top-0 z-10">
                      <th className="p-4 bg-emerald-50/95">Date</th>
                      <th className="p-4 bg-emerald-50/95">Type</th>
                      <th className="p-4 bg-emerald-50/95">Mode</th>
                      <th className="p-4 bg-emerald-50/95">Description / Source</th>
                      <th className="p-4 text-right bg-emerald-50/95">Amount</th>
                      <th className="p-4 text-center bg-emerald-50/95">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {filteredIncomes.map(inc => (
                      <tr key={inc.id} className={inc.isDeleted ? "opacity-50 bg-red-50/10 line-through text-mute hover:bg-red-50/20" : "hover:bg-emerald-50/20"}>
                        <td className="p-4 text-mute whitespace-nowrap">{fmtDate(inc.date)}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded border ${
                            inc.isDeleted 
                              ? 'bg-red-100/60 border-red-200 text-red-800' 
                              : 'bg-emerald-100/60 border-emerald-200 text-emerald-700'
                          }`}>
                            <TrendingUp size={11} /> {inc.category === 'HOSTEL_FEE' ? 'Hostel Fee' : 'Other Income'}
                          </span>
                        </td>
                        <td className="p-4 text-mute font-mono uppercase">{inc.paymentMode || 'CASH'}</td>
                        <td className="p-4 text-mute max-w-xs truncate">
                          {inc.isDeleted && <span className="text-red-600 font-bold mr-1.5">[DELETED]</span>}
                          {inc.description || '—'}
                        </td>
                        <td className={`p-4 text-right font-mono font-bold ${inc.isDeleted ? 'text-mute' : 'text-emerald-700'}`}>+{fmt(inc.amount)}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedReceipt(inc)}
                              title="Print Receipt"
                              className="p-1 rounded bg-cream hover:bg-beige text-brand font-bold cursor-pointer"
                            >
                              <FileCheck2 size={13} />
                            </button>
                            {!inc.isDeleted && (
                              <>
                                <button
                                  onClick={() => setEditingTxn(inc)}
                                  title="Edit Entry"
                                  className="p-1 rounded bg-cream hover:bg-beige text-label font-bold cursor-pointer"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => deleteTxn(inc.id, true)}
                                  title="Delete Entry"
                                  className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold cursor-pointer"
                                >
                                  <X size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredExpenses.length === 0 ? (
              <div className="text-center py-16"><Wallet size={36} className="mx-auto text-mute mb-3" /><p className="text-mute text-sm font-semibold">No matching expenses found</p></div>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto border border-beige rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider sticky top-0 z-10">
                      <th className="p-4 bg-cream/95">Date</th>
                      <th className="p-4 bg-cream/95">Category</th>
                      <th className="p-4 bg-cream/95">Description</th>
                      <th className="p-4 text-right bg-cream/95">Amount</th>
                      <th className="p-4 text-center bg-cream/95">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige">
                    {filteredExpenses.map(e => {
                      const Icon = CAT_ICON[e.category] || Coins;
                      const label = CAT_LABEL[e.category] || e.category;
                      const isSpecial = ['GHAR', 'SCHOOL'].includes(e.category);
                      return (
                        <tr key={e.id} className={e.isDeleted ? "opacity-50 bg-red-50/10 line-through text-mute hover:bg-red-50/20" : isSpecial ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-cream'}>
                          <td className="p-4 text-mute whitespace-nowrap">{fmtDate(e.date)}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1.5 font-semibold px-2 py-0.5 rounded border ${
                              e.isDeleted ? 'bg-red-100/60 border-red-200 text-red-800' :
                              e.category === 'GHAR' ? 'bg-amber-100/80 border-amber-300 text-amber-900' :
                              e.category === 'SCHOOL' ? 'bg-blue-100/80 border-blue-300 text-blue-900' :
                              e.category === 'RELIGIOUS_SOCIAL' ? 'bg-purple-100/80 border-purple-300 text-purple-900' :
                              'bg-cream border-beige text-ink'
                            }`}>
                              <Icon size={11} /> {label}
                            </span>
                          </td>
                          <td className="p-4 text-mute max-w-xs truncate">
                            {e.isDeleted && <span className="text-red-600 font-bold mr-1.5">[DELETED]</span>}
                            {e.description || '—'}
                          </td>
                          <td className={`p-4 text-right font-mono font-bold ${e.isDeleted ? 'text-mute' : 'text-red-600'}`}>−{fmt(e.amount)}</td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setSelectedReceipt(e)}
                                title="Print Receipt"
                                className="p-1 rounded bg-cream hover:bg-beige text-brand font-bold cursor-pointer"
                              >
                                <FileCheck2 size={13} />
                              </button>
                              {!e.isDeleted && (
                                <>
                                  <button
                                    onClick={() => setEditingTxn(e)}
                                    title="Edit Entry"
                                    className="p-1 rounded bg-cream hover:bg-beige text-label font-bold cursor-pointer"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    onClick={() => deleteTxn(e.id, false)}
                                    title="Delete Entry"
                                    className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-600 font-bold cursor-pointer"
                                  >
                                    <X size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Printable Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal
          isOpen={!!selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          transaction={selectedReceipt}
        />
      )}

      {/* Edit Transaction Modal */}
      {editingTxn && (
        <EditHostelTxnModal
          txn={editingTxn}
          onClose={() => setEditingTxn(null)}
          onSaved={() => { setEditingTxn(null); load(); triggerDataChange(); }}
        />
      )}

      {/* Synced Notes Modal */}
      {isNotesModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-paper border border-beige w-full max-w-2xl rounded-xl p-5 shadow-lg relative flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 text-ink">
            <button
              onClick={() => setIsNotesModalOpen(false)}
              className="absolute top-4 right-4 text-mute hover:text-ink cursor-pointer bg-transparent border-none p-1 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 pb-3 border-b border-beige shrink-0">
              <FileCheck2 className="w-5 h-5 text-brand" />
              <span className="text-sm font-bold uppercase tracking-wider text-brand">
                Hostel Boarding Sync Notes
              </span>
            </div>

            <div className="flex-1 py-4 flex flex-col gap-2 min-h-[300px]">
              <p className="text-[11px] text-mute">
                Write down operational reminders, grocery lists, or notes. These notes are synchronized across all authorized devices in real-time.
              </p>
              
              {isLoadingNotes ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-mute">
                  <Loader2 className="w-6 h-6 animate-spin text-brand" />
                  <span className="text-xs">Loading notes...</span>
                </div>
              ) : (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Type your notes here... They will save and sync automatically."
                  className="flex-1 w-full p-3 rounded-lg border border-beige bg-white text-xs leading-relaxed outline-none focus:ring-1 focus:ring-brand focus:border-brand resize-none font-sans"
                />
              )}
            </div>

            <div className="border-t border-beige pt-3 shrink-0 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-brand">
                {notesMessage && <span>{notesMessage}</span>}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsNotesModalOpen(false)}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-cream hover:bg-beige/40 text-ink cursor-pointer border-none"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNotes}
                  disabled={isSavingNotes}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-dark cursor-pointer border-none flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingNotes ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Save &amp; Sync
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════ MAIN PAGE ════════════════════════════

type TabId = 'students' | 'staff' | 'dashboard' | 'finance';

function HostelPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId;
  const tab = (['students', 'staff', 'dashboard', 'finance'].includes(tabParam) ? tabParam : 'dashboard') as TabId;

  const [role, setRole] = useState('');
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) {
        setRole(d.user.role || '');
        setHasAccess(d.user.accessUnits?.includes('hostel') ?? false);
      }
    }).catch(() => setHasAccess(false));
  }, []);

  const headerInfo = {
    dashboard: {
      title: 'Hostel Dashboard',
      desc: 'Overview of occupancy rates, staff counts, and operational hostel balance.',
      icon: LayoutDashboard,
    },
    students: {
      title: 'Hostel Residents',
      desc: 'Manage room allocations, resident check-ins, check-outs, and student monthly dues.',
      icon: Users,
    },
    staff: {
      title: 'Hostel Staff Directory',
      desc: 'Manage warden profiles, cook staff, security personnel, and monthly salary slip payouts.',
      icon: UserCog,
    },
    finance: {
      title: 'Hostel Income & Expenses',
      desc: 'Log and review hostel expenses for mess, laundry, and other operational outlays.',
      icon: Wallet,
    },
  }[tab] || {
    title: 'Hostel Boarding',
    desc: 'Boys\' hostel — residents & fees, staff salaries, and a live income/expense view.',
    icon: Home,
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
          {hasAccess
            ? headerInfo.desc
            : 'Your account needs the "hostel" division to manage the hostel.'}
        </p>
      </div>

      {/* Tab selection switcher (Only for non-HODs, or Director/Principal) */}
      {hasAccess && role && role !== 'DEPARTMENT_HEAD' && (
        <div className="flex border-b border-beige gap-2 overflow-x-auto shrink-0 select-none scrollbar-none pb-0.5">
          {[
            { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
            { id: 'students', name: 'Residents Roster', icon: Users },
            { id: 'staff', name: 'Staff Directory', icon: UserCog },
            { id: 'finance', name: 'Expenses Ledger', icon: Wallet },
          ].map((item) => {
            const isSelected = tab === item.id;
            const Icon = item.icon;
            return (
              <Link
                key={item.id}
                href={`/dashboard/hostel?tab=${item.id}`}
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

      {hasAccess === false ? (
        <div className="text-center py-20">
          <AlertCircle size={36} className="mx-auto text-amber-500 mb-3" />
          <p className="text-mute text-sm font-semibold">No hostel access</p>
          <p className="text-mute text-xs mt-1">Your account needs the &quot;hostel&quot; division to manage the hostel.</p>
        </div>
      ) : hasAccess === null ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
      ) : (
        <HostelErrorBoundary>
          {tab === 'students' && <StudentsTab />}
          {tab === 'staff' && <StaffTab />}
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'finance' && <FinanceTab role={role} />}
        </HostelErrorBoundary>
      )}
    </div>
  );
}

class HostelErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[HostelErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-paper border border-beige rounded-2xl shadow-md space-y-3">
          <AlertCircle size={36} className="mx-auto text-amber-600 mb-2" />
          <h3 className="text-sm font-bold text-ink">Unable to render hostel section</h3>
          <p className="text-xs text-mute font-mono">{this.state.error?.message || 'An unexpected rendering error occurred.'}</p>
          <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }} className="bg-brand text-white text-xs h-8 px-4 rounded-lg cursor-pointer">
            Reload Section
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function HostelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>}>
      <HostelPageContent />
    </Suspense>
  );
}

// ─── Hostel staff inline edit form ───────────────────────────────────────────
// Replaces Section 1 of the staff profile while editing. PATCHes the existing
// record; join date is kept locked since payroll history is tied to it.

function HostelStaffEditForm({ staff, onCancel, onSaved }: { staff: any; onCancel: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(staff.name || '');
  const [role, setRole] = useState(staff.role || '');
  const [fatherName, setFatherName] = useState(staff.fatherName || '');
  const [phone, setPhone] = useState(staff.phone || '');
  const [address, setAddress] = useState(staff.address || '');
  const [monthlySalary, setMonthlySalary] = useState(String(staff.monthlySalary || ''));
  const [aadharNo, setAadharNo] = useState(staff.aadharNo || '');
  const [panNo, setPanNo] = useState(staff.panNo || '');
  const [bankAccountNo, setBankAccountNo] = useState(staff.bankAccountNo || '');
  const [status, setStatus] = useState(staff.status || 'ACTIVE');
  const [photoUrl, setPhotoUrl] = useState(staff.photoUrl || '');
  const [aadharDocUrl, setAadharDocUrl] = useState(staff.aadharDocUrl || '');
  const [otherDocUrl, setOtherDocUrl] = useState(staff.otherDocUrl || '');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const looksLikeUrl = (s: string) => true;

  const save = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (!role.trim()) { setErr('Role is required (e.g. Warden, Cook).'); return; }
    const sal = Number(monthlySalary);
    if (!Number.isFinite(sal) || sal < 0) { setErr('Monthly salary must be a non-negative number.'); return; }
    if (phone.trim() && phone.length !== 10) { setErr('Phone number must be exactly 10 digits.'); return; }
    if (aadharNo.trim() && aadharNo.length !== 12) { setErr('Aadhar number must be exactly 12 digits.'); return; }
    if (!looksLikeUrl(photoUrl) || !looksLikeUrl(aadharDocUrl) || !looksLikeUrl(otherDocUrl)) {
      setErr('Document links must start with http:// or https://.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/hostel/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          fatherName: fatherName.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          monthlySalary: sal,
          aadharNo: aadharNo.trim() || null,
          panNo: panNo.trim() || null,
          bankAccountNo: bankAccountNo.trim() || null,
          status,
          photoUrl: photoUrl.trim() || null,
          aadharDocUrl: aadharDocUrl.trim() || null,
          otherDocUrl: otherDocUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save staff profile.');
      await onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-brand/30 bg-paper text-ink shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-brand flex items-center gap-1.5">
          <Pencil size={13} /> Edit Hostel Staff Profile
        </CardTitle>
        <CardDescription className="text-mute text-xs mt-0.5">
          Join date stays locked (payroll history is tied to it). Everything else can be updated below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {err && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{err}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HField label="Full Name" required>
            <Input value={name} onChange={e => setName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
          </HField>
          <HField label="Role" required>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Warden, Cook, Mess Worker..." className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
          </HField>
          <HField label="Father Name">
            <Input value={fatherName} onChange={e => setFatherName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
          </HField>
          <HField label="Status">
            <select value={status} onChange={e => setStatus(e.target.value)} className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none">
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="RESIGNED">Resigned</option>
            </select>
          </HField>
          <HField label="Phone">
            <Input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit phone" className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
          </HField>
          <HField label="Monthly Salary (&#8377;)" required>
            <Input type="number" min={0} step="0.01" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value)} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
          </HField>
          <div className="md:col-span-2">
            <HField label="Address">
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full bg-field border border-beige text-ink text-xs rounded-md px-3 py-2 focus:ring-1 focus:ring-brand focus:outline-none" />
            </HField>
          </div>
          <HField label="Aadhar No">
            <Input value={aadharNo} onChange={e => setAadharNo(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit Aadhar" className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
          </HField>
          <HField label="PAN No">
            <Input value={panNo} onChange={e => setPanNo(e.target.value)} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
          </HField>
          <HField label="Bank Account No">
            <Input value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
          </HField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-beige pt-4 mt-2">
          <FileUploader
            label="Hostel Staff Photo"
            pathParts={['hostel', 'staff', 'Staff_Photos']}
            onUploadSuccess={(url) => setPhotoUrl(url)}
            value={photoUrl}
            acceptImagesOnly={true}
          />
          <FileUploader
            label="Aadhar Document"
            pathParts={['hostel', 'staff', 'Staff_Aadhars']}
            onUploadSuccess={(url) => setAadharDocUrl(url)}
            value={aadharDocUrl}
          />
          <FileUploader
            label="Other / ID Document"
            pathParts={['hostel', 'staff', 'Staff_Other_Docs']}
            onUploadSuccess={(url) => setOtherDocUrl(url)}
            value={otherDocUrl}
          />
        </div>

        <div className="flex items-center gap-2 justify-end pt-2 border-t border-beige">
          <button onClick={onCancel} disabled={busy} className="text-xs text-mute hover:text-ink font-semibold cursor-pointer px-3 py-2 disabled:opacity-50">
            Cancel
          </button>
          <Button onClick={save} disabled={busy} className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {busy ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-2xs text-mute">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function EditHostelTxnModal({ txn, onClose, onSaved }: { txn: any; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(txn.amount || ''));
  const [category, setCategory] = useState(txn.category || 'MESS');
  const [date, setDate] = useState(() => {
    if (!txn.date) return today();
    if (typeof txn.date === 'string') {
      if (txn.date.includes('T')) return txn.date.split('T')[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(txn.date)) return txn.date;
    }
    try {
      const dt = new Date(txn.date);
      return isNaN(dt.getTime()) ? today() : dt.toISOString().split('T')[0];
    } catch {
      return today();
    }
  });
  const [description, setDescription] = useState(txn.description || '');
  const [paymentMode, setPaymentMode] = useState(txn.paymentMode || 'CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isIncome = txn.direction === 'INCOME';

  const save = async () => {
    setError(null);
    if (!(Number(amount) > 0)) { setError('Enter a positive amount'); return; }
    setBusy(true);
    try {
      const endpoint = isIncome ? '/api/hostel/income' : '/api/hostel/expense';
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txn.id, amount: Number(amount), category, date, description, paymentMode }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update entry');
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Error updating transaction');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-paper border border-beige rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-ink">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-sm uppercase text-brand flex items-center gap-2">
            <Pencil size={15} /> Edit Hostel Transaction
          </h3>
          <button onClick={onClose} className="text-mute hover:text-ink cursor-pointer"><X size={16} /></button>
        </div>

        {error && <div className="text-xs text-red-600 font-semibold">{error}</div>}

        <div className="space-y-3 text-xs">
          {!isIncome && (
            <div className="space-y-1">
              <Label className="text-2xs text-mute">Category</Label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-8 bg-field border border-beige rounded-lg px-2 text-ink text-xs font-semibold">
                <option value="MESS">Mess</option>
                <option value="LAUNDRY">Laundry</option>
                <option value="RELIGIOUS_SOCIAL">Religious & Social</option>
                <option value="GHAR">Ghar (Home)</option>
                <option value="SCHOOL">School Transfer</option>
                <option value="OTHER_EXPENSE">Other Expense</option>
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-2xs text-mute">Amount ₹</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-8 border-beige bg-field text-ink font-mono font-bold text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-2xs text-mute">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs" />
          </div>

          <div className="space-y-1">
            <Label className="text-2xs text-mute">Payment Mode</Label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="w-full h-8 bg-field border border-beige rounded-lg px-2 text-ink text-xs font-semibold">
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-2xs text-mute">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="h-8 border-beige bg-field text-ink text-xs" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs border-beige">Cancel</Button>
          <Button onClick={save} disabled={busy} className="h-8 text-xs bg-brand hover:bg-[#4a2090] text-white font-bold">
            {busy ? <Loader2 size={13} className="animate-spin" /> : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
