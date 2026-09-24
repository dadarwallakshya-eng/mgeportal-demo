'use client';

/**
 * @file src/app/dashboard/students/[id]/page.tsx
 * @description Student profile details, fee logs, and hostel boarding status.
 *
 * DESIGN DECISIONS:
 * - Tabbed profile sections (Overview, Fee Ledger, Hostels).
 * - Full detail lists with clean tables.
 * - Robust error handling (redirects if id is invalid).
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { triggerDataChange, useDataSubscription } from '@/lib/events';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Building2,
  Calendar,
  Phone,
  User,
  CreditCard,
  Home,
  CheckCircle2,
  AlertCircle,
  Clock,
  Bus,
  Car,
  MapPin,
  IndianRupee,
  Save,
  Pencil,
  GraduationCap,
  Percent,
  Wallet,
  Coins,
  X,
  ShieldAlert,
  Undo2,
  Hash,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toViewableImageUrl } from '@/lib/imageUrl';
import { FileUploader } from '@/components/ui/file-uploader';
import { getClassesForUnit } from '@/lib/classes';

/**
 * Profile avatar that falls back from photo → initial gracefully.
 *
 * Why a component: the previous inline DOM-manipulation hack (using
 * getElementById + style.display) broke on tab switches because React re-rendered
 * but the DOM mutation didn't reset. A normal piece of React state + a single
 * <img> with onError handles both cases cleanly.
 */
function Avatar({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  const initial = name?.trim()?.charAt(0).toUpperCase() || '?';
  const [failed, setFailed] = useState(false);
  const [cacheKey, setCacheKey] = useState('');

  // Reset failed state and update cache key if photoUrl changes
  useEffect(() => {
    setFailed(false);
    setCacheKey(Date.now().toString());
  }, [photoUrl]);

  const viewableUrl = toViewableImageUrl(photoUrl);
  const src = viewableUrl ? `${viewableUrl}?v=${cacheKey}` : '';
  const showImage = !!src && !failed;

  return showImage ? (
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      className="h-16 w-16 rounded-2xl object-cover border border-brand/30 bg-brand/10 shadow-inner shrink-0"
    />
  ) : (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand text-2xl font-bold shadow-inner shrink-0">
      {initial}
    </div>
  );
}

interface FeeAllocation {
  id: string;
  amountDue: number;
  amountPaid: number;
  dueDate: string;
  status: string;
  feeComponent: {
    name: string;
    amount: number;
  };
}

interface FeePayment {
  id: string;
  receiptNo: string;
  paymentDate: string;
  paymentMode: string;
  totalAmount: number;
  reversedAt?: string | null;
  reversalReason?: string | null;
}

interface StudentDetails {
  id: string;
  unitId: string;
  admissionNo: string;
  srNo: string | null;
  className: string;
  section: string;
  name: string;
  nameHindi: string | null;
  gender: string;
  dob: string;
  fatherName: string;
  motherName: string | null;
  phone: string | null;
  fatherPhone: string | null;
  address: string | null;
  aadharNo: string | null;
  photoUrl: string | null;
  aadharDocUrl: string | null;
  parentAadharDocUrl: string | null;
  category: string;
  admissionDate: string;
  status: string;
  /** Legacy overall % — superseded by per-component `concessions[]`. Kept for back-compat. */
  discountPercent: string | number;
  isFromSchool: boolean;
  /** Per-component discount rows. */
  concessions: {
    id: string;
    feeComponentName: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    value: string | number;
    reason?: string | null;
    setBy?: string | null;
    setByRole?: string | null;
    createdAt?: string | null;
  }[];
  transportMode: string;
  busStationId: string | null;
  unit: {
    name: string;
  };
  busStation: {
    id: string;
    stationNo: number;
    name: string;
    perMonth: string | number;
    perYear: string | number;
  } | null;
  feeAllocations: FeeAllocation[];
  feePayments: FeePayment[];
  hostelAllocations: {
    id: string;
    checkInDate: string;
    room: {
      roomNo: string;
      floor: string;
      type: string;
      monthlyRent: number;
    };
  }[];
  hostelResident?: {
    id: string;
    roomId: string | null;
    annualFee: string | number;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
    discountValue: string | number;
    checkInDate: string;
    checkOutDate: string | null;
    status: string;
    room?: {
      id: string;
      roomNo: string;
      floor: string;
      capacity: number;
      occupiedCount: number;
      monthlyRent: string | number;
      type: string;
      status: string;
    } | null;
  } | null;
}

export default function StudentDetailsPage() {
  const router = useRouter();
  const { id } = useParams();
  
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'fees' | 'hostel'>('overview');

  // Current operator's role drives what they can do on this page (discount cap, etc.).
  const [userRole, setUserRole] = useState<string>('');

  // Profile-edit mode swaps the read-only Overview cards for an editable form.
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Transport editing
  const [stations, setStations] = useState<{ id: string; stationNo: number; name: string; perMonth: string; perYear: string }[]>([]);
  const [editingTransport, setEditingTransport] = useState(false);
  const [tMode, setTMode] = useState<'OWN_VEHICLE' | 'BUS_SERVICE'>('OWN_VEHICLE');
  const [tStation, setTStation] = useState('');
  const [tSaving, setTSaving] = useState(false);
  const [tError, setTError] = useState<string | null>(null);

  // Document attachment previews state
  const [previewDocs, setPreviewDocs] = useState<Record<string, boolean>>({});

  // Fetch the operator's role once on mount so the discount control can show the right cap.
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUserRole(d?.user?.role || '')).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/students/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch student details');
      setStudent(data.student);
      setTMode((data.student.transportMode as 'OWN_VEHICLE' | 'BUS_SERVICE') || 'OWN_VEHICLE');
      setTStation(data.student.busStationId || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useDataSubscription(load);

  const loadStudentDetails = load;

  // Load stations once (for the transport editor dropdown)
  useEffect(() => {
    fetch('/api/transport/stations')
      .then((r) => r.json())
      .then((d) => setStations(d.stations || []))
      .catch(() => setStations([]));
  }, []);

  const handleSaveTransport = async () => {
    setTError(null);
    if (tMode === 'BUS_SERVICE' && !tStation) {
      setTError('Select a pickup station.');
      return;
    }
    setTSaving(true);
    try {
      const res = await fetch('/api/transport/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: id,
          transportMode: tMode,
          busStationId: tMode === 'BUS_SERVICE' ? tStation : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update transport');
      setEditingTransport(false);
      await loadStudentDetails();
    } catch (err: any) {
      setTError(err.message || 'Failed to update transport.');
    } finally {
      setTSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <span className="text-mute text-xs font-semibold">Loading student profile...</span>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="space-y-6 max-w-lg mx-auto py-20 text-center">
        <AlertCircle size={48} className="mx-auto text-red-600 mb-2" />
        <h2 className="text-lg font-bold text-ink">Error Loading Profile</h2>
        <p className="text-mute text-xs mt-1">{error || 'Student record could not be found.'}</p>
        <Link href="/dashboard/students">
          <Button className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 rounded-lg mt-4 cursor-pointer">
            Return to Directory
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back to Directory Link */}
      <Link
        href="/dashboard/students"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-label font-semibold transition-colors select-none"
      >
        <ArrowLeft size={14} />
        <span>Back to Directory</span>
      </Link>

      {/* ── Profile Header Card ────────────────────────────────────────── */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Avatar photoUrl={student.photoUrl} name={student.name} />

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold tracking-tight text-ink">
                  {student.name}
                </h1>
                <span className={`px-2 py-0.5 rounded text-3xs font-extrabold border ${
                  student.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  {student.status}
                </span>
              </div>
              <p className="text-xs text-mute mt-1">
                Admission ID: <span className="font-mono font-bold text-mute">{student.admissionNo}</span> ·{' '}
                {student.unit.name} · Class {student.className}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Edit Profile — visible only on the Overview tab (other tabs have their own actions). */}
            {activeTab === 'overview' && !isEditingProfile && (
              <Button
                onClick={() => { setIsEditingProfile(true); }}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5"
              >
                <Pencil size={12} /> Edit Profile
              </Button>
            )}

            {student.status === 'ACTIVE' && userRole !== 'DATA_ENTRY' && (
              <Button
                variant="outline"
                onClick={async () => {
                  const confirmWithdraw = window.confirm(
                    `Are you sure you want to withdraw '${student.name}'? This deactivates their portal access and checks them out of the hostel. All ledger and financial history will be fully preserved.`
                  );
                  if (!confirmWithdraw) return;

                  try {
                    const res = await fetch(`/api/students/${student.id}`, {
                      method: 'DELETE',
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      throw new Error(data.error || 'Withdrawal failed');
                    }
                    triggerDataChange();
                  } catch (err: any) {
                    alert('Error withdrawing student: ' + err.message);
                  }
                }}
                className="border-red-200 hover:bg-red-50 text-red-600 font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer"
              >
                Withdraw Student
              </Button>
            )}

            {student.status !== 'ACTIVE' && userRole !== 'DATA_ENTRY' && (
              <Button
                variant="outline"
                onClick={async () => {
                  const confirmReadmit = window.confirm(
                    `Are you sure you want to RE-ADMIT '${student.name}'? This restores their status to ACTIVE and re-enables their student profile.`
                  );
                  if (!confirmReadmit) return;

                  try {
                    const res = await fetch(`/api/students/${student.id}/readmit`, {
                      method: 'POST',
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      throw new Error(data.error || 'Re-admission failed');
                    }
                    alert(`'${student.name}' has been successfully re-admitted to ACTIVE status!`);
                    triggerDataChange();
                  } catch (err: any) {
                    alert('Error re-admitting student: ' + err.message);
                  }
                }}
                className="border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5"
              >
                <RotateCcw size={12} /> Re-admit Student
              </Button>
            )}

            {/* Stepper Tabs */}
            <div className="flex border border-beige rounded-lg p-0.5 bg-field">
              {(['overview', 'fees', 'hostel'] as const)
                .filter((tab) => tab === 'overview' || userRole !== 'DATA_ENTRY')
                .map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setIsEditingProfile(false); }}
                    className={`px-4 py-1.5 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${
                      activeTab === tab
                        ? 'bg-brand text-white font-bold'
                        : 'text-mute hover:text-ink'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Active Tab Details Content ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6">
        {/* TAB 1: Overview — read-only cards, OR the edit form */}
        {activeTab === 'overview' && isEditingProfile && (
          <ProfileEditForm
            student={student}
            onCancel={() => setIsEditingProfile(false)}
            onSaved={async () => { setIsEditingProfile(false); await loadStudentDetails(); }}
          />
        )}
        {activeTab === 'overview' && !isEditingProfile && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Demographics Card */}
            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
                  Demographic Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><User size={14} /> Gender</span>
                  <span className="font-semibold text-ink capitalize">{student.gender.toLowerCase()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><Calendar size={14} /> Date of Birth</span>
                  <span className="font-semibold text-ink">
                    {new Date(student.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><Building2 size={14} /> Category</span>
                  <span className="font-semibold text-ink">{student.category}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><Calendar size={14} /> Admission Date</span>
                  <span className="font-semibold text-ink">
                    {new Date(student.admissionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><CreditCard size={14} /> Aadhar Number</span>
                  <span className="font-semibold text-ink font-mono">{student.aadharNo || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><Hash size={14} /> Sr. Number</span>
                  <span className="font-semibold text-ink">{student.srNo || '—'}</span>
                </div>
                {student.unitId === 'college' && (
                  <div className="flex justify-between items-center py-2 border-b border-beige">
                    <span className="text-mute flex items-center gap-1.5"><GraduationCap size={14} /> Ex-School Student</span>
                    <span className={`font-semibold ${student.isFromSchool ? 'text-brand' : 'text-ink'}`}>
                      {student.isFromSchool ? 'Yes (50% Concession)' : 'No'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Parent & Contact Card */}
            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
                  Parental & Contact Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute">Father's Name</span>
                  <span className="font-semibold text-ink">{student.fatherName}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute">Mother's Name</span>
                  <span className="font-semibold text-ink">{student.motherName || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><Phone size={14} /> Contact Phone</span>
                  <span className="font-semibold text-ink font-mono">{student.phone || '—'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-beige">
                  <span className="text-mute flex items-center gap-1.5"><Phone size={14} /> Alternative Phone</span>
                  <span className="font-semibold text-ink font-mono">{student.fatherPhone || '—'}</span>
                </div>
                <div className="flex flex-col gap-1 py-2">
                  <span className="text-mute">Residential Address</span>
                  <span className="font-semibold text-label leading-relaxed mt-0.5">
                    {student.address || 'Not Provided'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Documents & Attachments Card */}
            <Card className="border-beige bg-paper text-ink shadow-md md:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
                  Uploaded Documents & Attachments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1 p-3 rounded-lg border border-beige bg-cream">
                    <span className="text-mute font-semibold">Student Photo Link</span>
                    {student.photoUrl ? (
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <a
                          href={toViewableImageUrl(student.photoUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:text-brand font-bold underline truncate inline-flex items-center gap-1"
                        >
                          View Photo Link ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => setPreviewDocs(prev => ({
                            ...prev,
                            photo: !prev.photo,
                            aadhar: false,
                          }))}
                          className="bg-brand/10 hover:bg-brand/20 text-brand text-3xs font-extrabold px-2 py-0.5 rounded cursor-pointer transition-all"
                        >
                          {previewDocs.photo ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-mute italic mt-1 font-semibold">Not Uploaded</span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 p-3 rounded-lg border border-beige bg-cream">
                    <span className="text-mute font-semibold">Student Aadhar Link</span>
                    {student.aadharDocUrl ? (
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <a
                          href={toViewableImageUrl(student.aadharDocUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand hover:text-brand font-bold underline truncate inline-flex items-center gap-1"
                        >
                          View Student Aadhar ↗
                        </a>
                        <button
                          type="button"
                          onClick={() => setPreviewDocs(prev => ({
                            ...prev,
                            photo: false,
                            aadhar: !prev.aadhar,
                          }))}
                          className="bg-brand/10 hover:bg-brand/20 text-brand text-3xs font-extrabold px-2 py-0.5 rounded cursor-pointer transition-all"
                        >
                          {previewDocs.aadhar ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    ) : (
                      <span className="text-mute italic mt-1 font-semibold">Not Uploaded</span>
                    )}
                  </div>
                </div>

                {/* Dynamic Inline Preview Area */}
                {(previewDocs.photo || previewDocs.aadhar) && (
                  <div className="mt-4 border-t border-beige pt-4">
                    {previewDocs.photo && student.photoUrl && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-xs text-mute">Student Photo Preview</span>
                          <button
                            type="button"
                            onClick={() => setPreviewDocs(prev => ({ ...prev, photo: false }))}
                            className="text-red-600 hover:underline text-2xs cursor-pointer font-bold"
                          >
                            Close Preview
                          </button>
                        </div>
                        <div className="border border-beige rounded-lg overflow-hidden max-w-xs bg-cream p-1 shadow-sm">
                          <img
                            src={toViewableImageUrl(student.photoUrl)}
                            alt="Student Photo Preview"
                            className="w-full h-auto object-contain max-h-64 rounded"
                          />
                        </div>
                      </div>
                    )}
                    {previewDocs.aadhar && student.aadharDocUrl && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-xs text-mute">Student Aadhar Preview</span>
                          <button
                            type="button"
                            onClick={() => setPreviewDocs(prev => ({ ...prev, aadhar: false }))}
                            className="text-red-600 hover:underline text-2xs cursor-pointer font-bold"
                          >
                            Close Preview
                          </button>
                        </div>
                        <div className="border border-beige rounded-lg overflow-hidden h-[500px] bg-cream shadow-sm">
                          <iframe
                            src={toViewableImageUrl(student.aadharDocUrl)}
                            className="w-full h-full border-0"
                            title="Student Aadhar Document Preview"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transport Card */}
            <Card className="border-beige bg-paper text-ink shadow-md md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute flex items-center gap-2">
                  <Bus size={15} className="text-brand" /> Transport &amp; Bus Fare
                </CardTitle>
                {!editingTransport && (
                  <button
                    onClick={() => setEditingTransport(true)}
                    className="flex items-center gap-1.5 text-xs text-brand hover:text-brand font-semibold cursor-pointer"
                  >
                    <Pencil size={12} /> Change
                  </button>
                )}
              </CardHeader>
              <CardContent>
                {!editingTransport ? (
                  // ── Display mode ──
                  <div className="flex flex-wrap items-center gap-x-10 gap-y-4 text-xs">
                    <div className="flex items-center gap-2.5">
                      {student.transportMode === 'BUS_SERVICE' ? (
                        <div className="p-2 rounded-lg bg-brand/10 text-brand"><Bus size={16} /></div>
                      ) : (
                        <div className="p-2 rounded-lg bg-beige text-mute"><Car size={16} /></div>
                      )}
                      <div>
                        <p className="text-mute">Mode</p>
                        <p className="font-bold text-ink">
                          {student.transportMode === 'BUS_SERVICE' ? 'School Bus' : 'Own Vehicle'}
                        </p>
                      </div>
                    </div>
                    {student.transportMode === 'BUS_SERVICE' && student.busStation && (
                      <>
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-beige/40 text-mute"><MapPin size={16} /></div>
                          <div>
                            <p className="text-mute">Pickup Station</p>
                            <p className="font-bold text-ink">
                              {student.busStation.stationNo}. {student.busStation.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><IndianRupee size={16} /></div>
                          <div>
                            <p className="text-mute">Annual Fare</p>
                            <p className="font-bold text-ink font-mono">
                              ₹{Number(student.busStation.perYear).toLocaleString('en-IN')}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  // ── Edit mode ──
                  <div className="space-y-4">
                    {tError && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                        <AlertCircle size={13} /> <span>{tError}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 max-w-md">
                      <button
                        type="button"
                        onClick={() => { setTMode('OWN_VEHICLE'); setTStation(''); }}
                        className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          tMode === 'OWN_VEHICLE'
                            ? 'bg-brand/10 border-brand text-brand'
                            : 'bg-cream border-beige text-mute hover:border-[#c9c2b3]'
                        }`}
                      >
                        <Car size={18} className="shrink-0" />
                        <div><p className="text-xs font-bold">Own Vehicle</p><p className="text-3xs opacity-70">No bus fare</p></div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTMode('BUS_SERVICE')}
                        className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          tMode === 'BUS_SERVICE'
                            ? 'bg-brand/10 border-brand text-brand'
                            : 'bg-cream border-beige text-mute hover:border-[#c9c2b3]'
                        }`}
                      >
                        <Bus size={18} className="shrink-0" />
                        <div><p className="text-xs font-bold">School Bus</p><p className="text-3xs opacity-70">Fare by station</p></div>
                      </button>
                    </div>

                    {tMode === 'BUS_SERVICE' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                        <div className="space-y-1.5">
                          <label className="text-mute text-xs font-semibold flex items-center gap-1.5"><MapPin size={12} /> Pickup Station</label>
                          <select
                            value={tStation}
                            onChange={(e) => setTStation(e.target.value)}
                            className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-brand focus:outline-none"
                          >
                            <option value="">Select a station...</option>
                            {stations.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.stationNo}. {s.name} — ₹{Number(s.perYear).toLocaleString('en-IN')}/yr
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-mute text-xs font-semibold flex items-center gap-1.5"><IndianRupee size={12} /> Annual Fare (auto)</label>
                          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-brand/20 bg-brand/5">
                            <span className="text-lg font-extrabold text-brand">
                              {(() => { const sel = stations.find((s) => s.id === tStation); return sel ? `₹${Number(sel.perYear).toLocaleString('en-IN')}` : '₹0'; })()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                      <Button onClick={handleSaveTransport} disabled={tSaving}
                        className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer gap-2">
                        {tSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {tSaving ? 'Saving...' : 'Save Transport'}
                      </Button>
                      <button
                        onClick={() => { setEditingTransport(false); setTError(null); setTMode((student.transportMode as 'OWN_VEHICLE' | 'BUS_SERVICE') || 'OWN_VEHICLE'); setTStation(student.busStationId || ''); }}
                        className="text-xs text-mute hover:text-ink font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-3xs text-mute">Changing transport updates the student&apos;s &quot;Transport Fee&quot; in the fee ledger automatically.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 2: Fees Ledger — discount + per-allocation net + collect-fee inline */}
        {activeTab === 'fees' && userRole !== 'DATA_ENTRY' && (
          <FeesTab
            student={student}
            userRole={userRole}
            onChanged={loadStudentDetails}
          />
        )}

        {/* TAB 3: Hostel Allocation */}
        {activeTab === 'hostel' && userRole !== 'DATA_ENTRY' && (
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
                Hostel Boarding Assignment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!student.hostelResident && student.hostelAllocations.length === 0 ? (
                <div className="text-center py-16">
                  <Home size={32} className="mx-auto text-mute mb-2" />
                  <p className="text-mute text-sm font-semibold">Not a Hostel Boarder</p>
                  <p className="text-mute text-xs mt-1">This student has no hostel record.</p>
                </div>
              ) : (
                <div className="space-y-6 text-xs max-w-xl">
                  {student.hostelResident && (
                    <div className="border border-beige p-4 rounded-xl space-y-4 bg-cream">
                      <div className="flex items-center gap-3 justify-between">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 size={18} className={student.hostelResident.status === 'ACTIVE' ? "text-emerald-600" : "text-amber-600"} />
                          <div>
                            <p className="text-sm font-extrabold text-ink">
                              {student.hostelResident.status === 'ACTIVE' ? 'Active Boarding' : 'Hostel Alumni (Checked Out)'}
                              {student.hostelResident.room ? ` · Room ${student.hostelResident.room.roomNo}` : ''}
                            </p>
                            <p className="text-mute text-2xs font-semibold mt-0.5">
                              Admitted on {new Date(student.hostelResident.checkInDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {student.hostelResident.checkOutDate && (
                                <> &middot; Checked out on {new Date(student.hostelResident.checkOutDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded text-2xs font-extrabold uppercase ${
                          student.hostelResident.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {student.hostelResident.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-beige pt-3">
                        {student.hostelResident.room && (
                          <>
                            <div>
                              <span className="text-mute">Floor Location</span>
                              <p className="font-semibold text-ink mt-0.5">{student.hostelResident.room.floor} Floor</p>
                            </div>
                            <div>
                              <span className="text-mute">Room Standard</span>
                              <p className="font-semibold text-ink mt-0.5">{student.hostelResident.room.type.replace('_', ' ')}</p>
                            </div>
                          </>
                        )}
                        <div>
                          <span className="text-mute">Annual Hostel Fee</span>
                          <p className="font-semibold text-ink mt-0.5 font-mono">
                            ₹{Number(student.hostelResident.annualFee).toLocaleString('en-IN')}
                            {student.hostelResident.discountValue && Number(student.hostelResident.discountValue) > 0 ? (
                              <span className="text-emerald-600 text-3xs font-bold ml-1.5">
                                ({student.hostelResident.discountType === 'PERCENTAGE' 
                                  ? `${student.hostelResident.discountValue}% Off` 
                                  : `₹${Number(student.hostelResident.discountValue).toLocaleString('en-IN')} Off`})
                              </span>
                            ) : null}
                          </p>
                        </div>
                        {Number(student.hostelResident.previousOutstanding || 0) > 0 && (
                          <div>
                            <span className="text-mute">Hostel Previous Dues</span>
                            <p className="font-semibold text-amber-600 mt-0.5 font-mono">
                              ₹{Number(student.hostelResident.previousOutstanding).toLocaleString('en-IN')}
                            </p>
                          </div>
                        )}
                      </div>

                      {(student as any).hostelAccount && (
                        <div className="border-t border-beige pt-3 space-y-1.5 font-mono text-2xs">
                          <div className="flex justify-between text-mute">
                            <span>Hostel Net Fee:</span>
                            <span className="text-ink font-semibold">₹{(student as any).hostelAccount.netFee.toLocaleString('en-IN')}</span>
                          </div>
                          {(student as any).hostelAccount.previousOutstanding > 0 && (
                            <div className="flex justify-between text-amber-700">
                              <span>+ Previous Outstanding:</span>
                              <span className="font-semibold">₹{(student as any).hostelAccount.previousOutstanding.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          {(student as any).hostelAccount.dailyUseGiven > 0 && (
                            <div className="flex justify-between text-amber-700">
                              <span>+ Daily-use Money Given:</span>
                              <span className="font-semibold">₹{(student as any).hostelAccount.dailyUseGiven.toLocaleString('en-IN')}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-emerald-700">
                            <span>− Total Paid So Far:</span>
                            <span className="font-semibold">₹{(student as any).hostelAccount.paid.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between border-t border-beige pt-1 text-xs font-bold">
                            <span className="text-ink">Current Hostel Balance Due:</span>
                            <span className={(student as any).hostelAccount.balanceDue > 0 ? "text-amber-600" : "text-emerald-700"}>
                              ₹{(student as any).hostelAccount.balanceDue.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {student.hostelAllocations.map((alloc) => (
                    <div key={alloc.id} className="border border-beige p-4 rounded-xl space-y-4 bg-cream">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 size={18} className="text-emerald-600" />
                        <div>
                          <p className="text-sm font-extrabold text-ink">
                            Active Booking: Room {alloc.room.roomNo}
                          </p>
                          <p className="text-mute text-2xs font-semibold mt-0.5">
                            Checked In on {new Date(alloc.checkInDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-beige pt-3">
                        <div>
                          <span className="text-mute">Floor Location</span>
                          <p className="font-semibold text-ink mt-0.5">{alloc.room.floor} Floor</p>
                        </div>
                        <div>
                          <span className="text-mute">Room Standard</span>
                          <p className="font-semibold text-ink mt-0.5">{alloc.room.type.replace('_', ' ')}</p>
                        </div>
                        <div>
                          <span className="text-mute">Standard Monthly Rent</span>
                          <p className="font-semibold text-ink mt-0.5 font-mono">₹{alloc.room.monthlyRent}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── Fees tab ────────────────────────────────────────────────────────────────
// Self-contained block that holds: per-component discount control, live totals,
// allocations table (per-row discount/net), inline Collect Fee, payment history.

const fmtRupee = (n: number | string) =>
  `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Does this component name count as "Tuition"? Matches the server check. */
function isTuitionName(name: string): boolean { return /tuition/i.test(name); }

/**
 * Per-role, per-component cap. Returns null when the role is not allowed to
 * set discounts at all. Mirrors the server enforcement in
 * /api/students/[id]/discount.
 */
function capForComponent(role: string, componentName: string): number | null {
  switch (role) {
    case 'DIRECTOR':
      return 100;
    case 'PRINCIPAL':
    case 'DEPARTMENT_HEAD':
      return 100;
    default:
      return null;
  }
}

interface FeesTabProps {
  student: StudentDetails;
  userRole: string;
  onChanged: () => void | Promise<void>;
}

function FeesTab({ student, userRole, onChanged }: FeesTabProps) {
  const [showPreviousDues, setShowPreviousDues] = React.useState(false);
  
  // Build a name → { type, value } map from the per-component concession rows.
  const concessionByComponent = new Map<string, { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number }>();
  for (const c of student.concessions || []) {
    concessionByComponent.set(c.feeComponentName, {
      type: (c.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT') || 'PERCENTAGE',
      value: Number(c.value),
    });
  }

  // Per-row computation: orig / discount / net / paid / balance.
  const rows = student.feeAllocations.map(a => {
    const orig = Number(a.amountDue);
    const paid = Number(a.amountPaid);
    const conc = concessionByComponent.get(a.feeComponent.name);
    
    let discount = 0;
    let pct = 0;
    if (conc) {
      if (conc.type === 'FIXED_AMOUNT') {
        discount = conc.value;
        pct = orig > 0 ? (discount / orig) * 100 : 0;
      } else {
        pct = conc.value;
        discount = orig * (pct / 100);
      }
    }
    const net = Math.max(0, orig - discount);
    const balance = Math.max(0, net - paid);
    
    const struct = (a.feeComponent as any).feeStructure;
    const structClass = struct?.className || '';
    const structYear = struct?.academicYear || '';
    const isPrevious = !!(structClass && structClass !== student.className);
    const displayName = isPrevious ? `${a.feeComponent.name} (${structClass})` : a.feeComponent.name;

    return { 
      id: a.id, 
      name: displayName, 
      rawName: a.feeComponent.name,
      dueDate: a.dueDate, 
      orig, 
      paid, 
      pct, 
      discount,
      net, 
      balance,
      isPrevious,
      className: structClass,
      academicYear: structYear
    };
  });

  const currentRows = rows.filter(r => !r.isPrevious);
  const previousRows = rows.filter(r => r.isPrevious);

  const previousTotals = previousRows.reduce(
    (acc, r) => ({
      orig: acc.orig + r.orig,
      paid: acc.paid + r.paid,
      net: acc.net + r.net,
      balance: acc.balance + r.balance,
    }),
    { orig: 0, paid: 0, net: 0, balance: 0 }
  );
  const previousStatus = previousTotals.balance < 0.005 ? 'PAID' : previousTotals.paid > 0 ? 'PARTIAL' : 'UNPAID';

  const totals = rows.reduce(
    (acc, r) => ({
      original: acc.original + r.orig,
      discount: acc.discount + r.discount,
      net: acc.net + r.net,
      paid: acc.paid + r.paid,
      balance: acc.balance + r.balance,
    }),
    { original: 0, discount: 0, net: 0, paid: 0, balance: 0 }
  );
  const fullyCleared = rows.length > 0 && totals.balance < 0.005;
  const hasAnyDiscount = totals.discount > 0.005;

  // Distinct component names this student has allocated — feeds both the
  // discount dropdown and the Collect Fee component picker.
  const componentNames = Array.from(new Set(rows.map(r => r.rawName)));
  const origByName = new Map<string, number>();
  rows.forEach(r => origByName.set(r.rawName, (origByName.get(r.rawName) || 0) + r.orig));

  return (
    <div className="space-y-6">
      <DiscountControl
        studentId={student.id}
        studentName={student.name}
        userRole={userRole}
        availableComponents={componentNames}
        allocations={componentNames.map(name => ({ name, orig: origByName.get(name) || 0 }))}
        currentConcessions={(student.concessions || []).map(c => ({
          name: c.feeComponentName,
          discountType: (c.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT') || 'PERCENTAGE',
          value: Number(c.value),
          origAmount: origByName.get(c.feeComponentName) || 0,
          reason: c.reason || null,
          setByRole: c.setByRole || null,
        }))}
        onChanged={onChanged}
      />

      {/* Live totals snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryStat label="Total Fees" value={fmtRupee(totals.original)} hint="before discount" tone="neutral" />
        <SummaryStat
          label="Discount Applied"
          value={hasAnyDiscount ? `-${fmtRupee(totals.discount)}` : '-'}
          hint={hasAnyDiscount ? `${concessionByComponent.size} of ${componentNames.length} components` : 'no discount set'}
          tone={hasAnyDiscount ? 'brand' : 'mute'}
        />
        <SummaryStat label="Paid So Far" value={fmtRupee(totals.paid)} hint="all receipts" tone="emerald" />
        <SummaryStat
          label={fullyCleared ? 'Status' : 'Balance Due'}
          value={fullyCleared ? 'CLEARED' : fmtRupee(totals.balance)}
          hint={fullyCleared ? 'fully paid' : 'remaining'}
          tone={fullyCleared ? 'emerald' : 'amber'}
        />
      </div>

      {/* Per-allocation ledger with per-component discount + computed status */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardHeader>
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
            Fee Allocations Ledger
          </CardTitle>
          <CardDescription className="text-mute text-xs">
            Each row shows its own discount. Status flips to PAID when the net (post-discount) is fully collected.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard size={28} className="mx-auto text-mute mb-1.5" />
              <p className="text-mute text-xs font-semibold">No fee allocations recorded.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-3">Fee Component</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3 text-right">Original</th>
                    <th className="p-3 text-right">Discount</th>
                    <th className="p-3 text-right">Net</th>
                    <th className="p-3 text-right">Paid</th>
                    <th className="p-3 text-right">Balance</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige text-label font-medium">
                  {currentRows.map((r) => {
                    const status = r.balance < 0.005 ? 'PAID' : r.paid > 0 ? 'PARTIAL' : 'UNPAID';
                    return (
                      <tr key={r.id} className="hover:bg-cream transition-colors">
                        <td className="p-3 font-semibold text-ink">{r.name}</td>
                        <td className="p-3 text-mute">
                          {new Date(r.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="p-3 text-right font-mono">{fmtRupee(r.orig)}</td>
                        <td className="p-3 text-right font-mono">
                          {r.pct > 0
                            ? <span className="text-brand">-{fmtRupee(r.orig - r.net)} <span className="text-2xs text-mute">({r.pct}%)</span></span>
                            : <span className="text-mute">—</span>}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-ink">{fmtRupee(r.net)}</td>
                        <td className="p-3 text-right font-mono text-emerald-700">{fmtRupee(r.paid)}</td>
                        <td className={`p-3 text-right font-mono font-bold ${r.balance > 0 ? 'text-amber-600' : 'text-mute'}`}>
                          {fmtRupee(r.balance)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${
                            status === 'PAID'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : status === 'PARTIAL' ? 'bg-amber-50 text-amber-600 border-amber-200'
                                                  : 'bg-red-50 text-red-600 border-red-200'
                          }`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {previousRows.length > 0 && (
                    <>
                      <tr
                        onClick={() => setShowPreviousDues(!showPreviousDues)}
                        className="bg-amber-50/40 hover:bg-amber-50/60 cursor-pointer font-bold border-t border-beige transition-colors select-none"
                      >
                        <td className="p-3 text-ink flex items-center gap-1.5">
                          <span className="text-amber-700">
                            {showPreviousDues ? '▼' : '▶'} Previous Outstanding Fee
                          </span>
                        </td>
                        <td className="p-3 text-mute">—</td>
                        <td className="p-3 text-right font-mono">{fmtRupee(previousTotals.orig)}</td>
                        <td className="p-3 text-right font-mono">
                          {previousTotals.orig - previousTotals.net > 0.005
                            ? <span className="text-brand">-{fmtRupee(previousTotals.orig - previousTotals.net)}</span>
                            : <span className="text-mute">—</span>}
                        </td>
                        <td className="p-3 text-right font-mono text-ink">{fmtRupee(previousTotals.net)}</td>
                        <td className="p-3 text-right font-mono text-emerald-700">{fmtRupee(previousTotals.paid)}</td>
                        <td className={`p-3 text-right font-mono ${previousTotals.balance > 0 ? 'text-amber-600' : 'text-mute'}`}>
                          {fmtRupee(previousTotals.balance)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${
                            previousStatus === 'PAID'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : previousStatus === 'PARTIAL' ? 'bg-amber-50 text-amber-600 border-amber-200'
                                                  : 'bg-red-50 text-red-600 border-red-200'
                          }`}>
                            {previousStatus}
                          </span>
                        </td>
                      </tr>
                      
                      {showPreviousDues && previousRows.map((r) => {
                        const status = r.balance < 0.005 ? 'PAID' : r.paid > 0 ? 'PARTIAL' : 'UNPAID';
                        return (
                          <tr key={r.id} className="bg-amber-50/10 hover:bg-amber-50/20 transition-colors border-t border-beige/40">
                            <td className="p-3 pl-8 text-mute flex flex-col">
                              <span className="font-semibold">{r.name}</span>
                              {r.academicYear && <span className="text-[10px] text-mute/60">{r.academicYear}</span>}
                            </td>
                            <td className="p-3 text-mute/80">
                              {new Date(r.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="p-3 text-right font-mono text-mute/80">{fmtRupee(r.orig)}</td>
                            <td className="p-3 text-right font-mono text-mute/80">
                              {r.pct > 0
                                ? <span className="text-brand/80">-{fmtRupee(r.orig - r.net)} <span className="text-2xs">({r.pct}%)</span></span>
                                : <span className="text-mute/80">—</span>}
                            </td>
                            <td className="p-3 text-right font-mono text-mute/80">{fmtRupee(r.net)}</td>
                            <td className="p-3 text-right font-mono text-emerald-700/80">{fmtRupee(r.paid)}</td>
                            <td className={`p-3 text-right font-mono font-semibold ${r.balance > 0 ? 'text-amber-600/80' : 'text-mute/80'}`}>
                              {fmtRupee(r.balance)}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-3xs font-semibold uppercase border ${
                                status === 'PAID'    ? 'bg-emerald-50/80 text-emerald-700/80 border-emerald-200/80'
                                : status === 'PARTIAL' ? 'bg-amber-50/80 text-amber-600/80 border-amber-200/80'
                                                      : 'bg-red-50/80 text-red-600/80 border-red-200/80'
                              }`}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inline collect-fee — only shown when there's something left to pay. */}
      {!fullyCleared && totals.balance > 0 && (
        <CollectFeeForm
          studentId={student.id}
          studentName={student.name}
          balanceDue={totals.balance}
          rows={rows.map(r => ({
            id: r.id,
            componentName: r.name,
            net: r.net,
            paid: r.paid,
            balance: r.balance,
          }))}
          onCollected={onChanged}
        />
      )}

      {/* Payment history with per-row Reverse button */}
      <PaymentHistory payments={student.feePayments} onChanged={onChanged} />
    </div>
  );
}

/** A compact stat tile for the summary row at the top of the Fees tab. */
function SummaryStat({
  label, value, hint, tone,
}: { label: string; value: string; hint: string; tone: 'neutral' | 'brand' | 'emerald' | 'amber' | 'mute'; }) {
  const toneCls = {
    neutral: 'text-ink',
    brand:   'text-brand',
    emerald: 'text-emerald-700',
    amber:   'text-amber-600',
    mute:    'text-mute',
  }[tone];
  return (
    <div className="rounded-xl border border-beige bg-paper px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-mute">{label}</p>
      <p className={`text-lg font-extrabold font-mono mt-0.5 ${toneCls}`}>{value}</p>
      <p className="text-2xs text-mute mt-0.5">{hint}</p>
    </div>
  );
}

/**
 * Per-component discount control. Shows every concession currently in force as
 * a chip, and lets eligible roles add / change / remove one via a dropdown of
 * components (plus an "All Components" bulk option). Server enforces the cap.
 */
function DiscountControl({
  studentId, studentName, userRole, availableComponents, allocations, currentConcessions, onChanged,
}: {
  studentId: string;
  studentName: string;
  userRole: string;
  availableComponents: string[];
  allocations: { name: string; orig: number }[];
  currentConcessions: {
    name: string;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    value: number;
    origAmount?: number;
    reason: string | null;
    setByRole: string | null;
  }[];
  onChanged: () => void | Promise<void>;
}) {
  const canEdit = ['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole);

  const [editing, setEditing] = useState(false);
  const [componentSel, setComponentSel] = useState<string>('ALL');
  const [discType, setDiscType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [valInput, setValInput] = useState('0');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Target original fee calculation
  const targetAllocations = componentSel === 'ALL'
    ? allocations
    : allocations.filter(a => a.name === componentSel);

  const targetOrigTotal = targetAllocations.reduce((sum, a) => sum + a.orig, 0);

  const inputNum = Number(valInput || 0);

  let calcPct = 0;
  let calcAmt = 0;

  if (discType === 'FIXED_AMOUNT') {
    calcAmt = inputNum;
    calcPct = targetOrigTotal > 0 ? (calcAmt / targetOrigTotal) * 100 : 0;
  } else {
    calcPct = inputNum;
    calcAmt = targetOrigTotal * (calcPct / 100);
  }

  const calcNet = Math.max(0, targetOrigTotal - calcAmt);

  const effectiveCap: number = (() => {
    if (!canEdit) return 0;
    const targets = componentSel === 'ALL' ? availableComponents : [componentSel];
    if (targets.length === 0) return 100;
    const caps = targets.map(t => capForComponent(userRole, t) ?? 0);
    return Math.min(...caps);
  })();

  const overCap = Number.isFinite(calcPct) && calcPct > effectiveCap + 0.0001;
  const invalid = !Number.isFinite(inputNum) || inputNum < 0 || (discType === 'PERCENTAGE' && inputNum > 100);

  const save = async () => {
    setErr(null);
    if (invalid) {
      setErr(discType === 'FIXED_AMOUNT' ? 'Enter a valid non-negative amount.' : 'Enter a percent between 0 and 100.');
      return;
    }
    if (overCap) {
      const maxRupees = Math.round(targetOrigTotal * (effectiveCap / 100));
      setErr(`Your role cap is ${effectiveCap}% (max ₹${maxRupees.toLocaleString('en-IN')}). Entered value is equivalent to ${calcPct.toFixed(2)}%.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/students/${studentId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentName: componentSel,
          discountType: discType,
          discountValue: inputNum,
          discountPercent: calcPct,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set discount');
      setEditing(false);
      setReason('');
      setValInput('0');
      await onChanged();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to set discount.');
    } finally {
      setBusy(false);
    }
  };

  const removeOne = async (name: string) => {
    if (!canEdit) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/students/${studentId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentName: name, discountType: 'PERCENTAGE', discountPercent: 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove discount');
      await onChanged();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to remove discount.');
    } finally {
      setBusy(false);
    }
  };

  /** Undo the last change to this component: restore the prior % from the log. */
  const reverseOne = async (name: string) => {
    if (!canEdit) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/students/${studentId}/discount/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reverse discount');
      await onChanged();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to reverse discount.');
    } finally {
      setBusy(false);
    }
  };

  const anyConcession = currentConcessions.length > 0;

  return (
    <Card className={`shadow-md text-ink ${anyConcession ? 'border-brand/30 bg-brand/5' : 'border-beige bg-paper'}`}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${anyConcession ? 'bg-brand/15 text-brand' : 'bg-cream text-mute'}`}>
              <Percent size={16} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-mute">Fee Discounts (per component)</p>
              <p className="text-sm font-bold text-ink">
                {anyConcession
                  ? `${currentConcessions.length} component${currentConcessions.length === 1 ? '' : 's'} discounted`
                  : 'No discount set'}
              </p>
            </div>
          </div>
          {canEdit && !editing && (
            <Button onClick={() => { setEditing(true); setComponentSel('ALL'); setDiscType('PERCENTAGE'); setValInput('0'); setErr(null); }}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5">
              <Pencil size={12} /> {anyConcession ? 'Change Discount' : 'Apply Discount'}
            </Button>
          )}
          {!canEdit && (
            <p className="text-2xs text-mute italic flex items-center gap-1.5">
              <ShieldAlert size={12} /> Only Principal or Director can set discounts.
            </p>
          )}
        </div>

        {/* Active concessions — chips with remove for eligible roles. */}
        {anyConcession && (
          <div className="flex flex-wrap gap-2 pt-1">
            {currentConcessions.map(c => {
              const isFixed = c.discountType === 'FIXED_AMOUNT';
              const orig = c.origAmount || 0;
              const calcEquivPct = isFixed && orig > 0 ? (c.value / orig) * 100 : c.value;
              const calcRupees = isFixed ? c.value : orig * (c.value / 100);

              return (
                <span key={c.name} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-brand/20 bg-paper text-2xs">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span className="font-mono font-bold text-brand">
                    {isFixed
                      ? `₹${c.value.toLocaleString('en-IN')} (${calcEquivPct.toFixed(2)}%)`
                      : `${c.value}%${orig > 0 ? ` (₹${Math.round(calcRupees).toLocaleString('en-IN')})` : ''}`}
                  </span>
                  {c.reason && <span className="text-mute italic">&middot; {c.reason}</span>}
                  {c.setByRole && <span className="text-mute">&middot; by {c.setByRole}</span>}
                  {canEdit && (
                    <span className="ml-1 inline-flex items-center gap-1">
                      <button
                        onClick={() => reverseOne(c.name)}
                        disabled={busy}
                        title={`Reverse — undo the last change to ${c.name}`}
                        className="text-mute hover:text-brand cursor-pointer disabled:opacity-40"
                      >
                        <Undo2 size={11} />
                      </button>
                      <button
                        onClick={() => removeOne(c.name)}
                        disabled={busy}
                        title={`Remove discount on ${c.name}`}
                        className="text-mute hover:text-red-600 cursor-pointer disabled:opacity-40"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {editing && (
          <div className="border-t border-beige pt-3 space-y-3">
            {err && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                <AlertCircle size={13} /> <span>{err}</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start">
              <div className="space-y-1">
                <Label className="text-2xs text-mute">Apply to</Label>
                <select
                  value={componentSel}
                  onChange={e => setComponentSel(e.target.value)}
                  className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="ALL">All Components</option>
                  {availableComponents.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label className="text-2xs text-mute">Discount Entry</Label>
                  <div className="flex items-center gap-1 bg-cream p-0.5 rounded-md border border-beige">
                    <button
                      type="button"
                      onClick={() => setDiscType('PERCENTAGE')}
                      className={`px-2 py-0.5 text-3xs font-bold rounded cursor-pointer transition-colors ${discType === 'PERCENTAGE' ? 'bg-brand text-white' : 'text-mute hover:text-ink'}`}
                    >
                      % Percentage
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscType('FIXED_AMOUNT')}
                      className={`px-2 py-0.5 text-3xs font-bold rounded cursor-pointer transition-colors ${discType === 'FIXED_AMOUNT' ? 'bg-brand text-white' : 'text-mute hover:text-ink'}`}
                    >
                      ₹ Fixed Amount
                    </button>
                  </div>
                </div>
                <div className="relative">
                  {discType === 'FIXED_AMOUNT' && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute text-xs font-mono">₹</span>}
                  <Input
                    type="number" min={0} step={discType === 'FIXED_AMOUNT' ? '1' : '0.01'}
                    value={valInput} onChange={e => setValInput(e.target.value)}
                    placeholder={discType === 'FIXED_AMOUNT' ? 'e.g. 3800' : 'e.g. 10'}
                    className={`${discType === 'FIXED_AMOUNT' ? 'pl-7 pr-3' : 'pr-7'} border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono ${overCap ? 'border-red-300' : ''}`}
                  />
                  {discType === 'PERCENTAGE' && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mute text-xs">%</span>}
                </div>
                <p className={`text-2xs ${overCap ? 'text-red-600 font-bold' : 'text-mute'}`}>
                  Your role cap: <span className="font-bold">{effectiveCap}%</span>
                  {targetOrigTotal > 0 && <span> (max ₹{Math.round(targetOrigTotal * (effectiveCap / 100)).toLocaleString('en-IN')})</span>}
                  {componentSel === 'ALL' && availableComponents.some(isTuitionName) && userRole !== 'DIRECTOR' && (
                    <> &middot; lowered by Tuition rule</>
                  )}
                </p>
              </div>

              <div className="space-y-1 sm:col-span-1">
                <Label className="text-2xs text-mute">Reason (optional)</Label>
                <Input
                  value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Hardship"
                  className="border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand"
                />
              </div>
            </div>

            {/* Live Calculation Side / Preview Box */}
            {inputNum > 0 && targetOrigTotal > 0 && (
              <div className="p-3 bg-paper border border-brand/20 rounded-lg text-xs space-y-1.5 animate-in fade-in duration-150">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand">Live Calculation Preview</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-2xs">
                  <div>
                    <span className="text-mute block font-semibold">Target Original Fee:</span>
                    <span className="font-mono font-bold text-ink">₹{targetOrigTotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-mute block font-semibold">Discount Amount:</span>
                    <span className="font-mono font-bold text-brand">₹{calcAmt.toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-mute block font-semibold">Calculated Percentage:</span>
                    <span className="font-mono font-bold text-brand">{calcPct.toFixed(2)}%</span>
                  </div>
                  <div>
                    <span className="text-mute block font-semibold">Net Post-Discount:</span>
                    <span className="font-mono font-bold text-emerald-700">₹{calcNet.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 justify-end pt-1">
              <button onClick={() => { setEditing(false); setErr(null); }} className="text-xs text-mute hover:text-ink font-semibold cursor-pointer px-2">
                Cancel
              </button>
              <Button onClick={save} disabled={busy || invalid || overCap}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {busy
                  ? 'Saving...'
                  : inputNum === 0
                    ? `Remove discount on ${componentSel === 'ALL' ? 'all components' : componentSel}`
                    : `Apply ${discType === 'FIXED_AMOUNT' ? `₹${inputNum.toLocaleString('en-IN')}` : `${inputNum}%`} on ${componentSel === 'ALL' ? 'all components' : componentSel}`}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Collect-fee inline form. Operator picks a target component (or "All Unpaid"
 * to auto-distribute oldest-first), enters an amount, picks mode, and submits.
 * A live preview shows exactly which allocation each rupee will land on.
 */
function CollectFeeForm({
  studentId, studentName, balanceDue, rows, onCollected,
}: {
  studentId: string;
  studentName: string;
  balanceDue: number;
  rows: { id: string; componentName: string; net: number; paid: number; balance: number }[];
  onCollected: () => void | Promise<void>;
}) {
  // Distinct unpaid components for the dropdown (skip ones with zero balance).
  const unpaidComponents = Array.from(new Set(rows.filter(r => r.balance > 0.005).map(r => r.componentName)));

  // 'ALL' = auto-distribute oldest-first across every unpaid component.
  // Otherwise a specific component name from the dropdown.
  const [target, setTarget] = useState<string>('ALL');
  const [amountInput, setAmountInput] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI'>('CASH');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Max amount the operator can collect given the target choice.
  const maxForTarget = target === 'ALL'
    ? balanceDue
    : rows.filter(r => r.componentName === target).reduce((s, r) => s + r.balance, 0);

  const amt = Number(amountInput);
  const isAmtValid = Number.isFinite(amt) && amt > 0 && amt <= maxForTarget + 0.005;

  // Live preview of where the money will land. ALL → oldest-first across all
  // unpaid rows; specific → only rows matching the chosen component.
  const eligible = target === 'ALL'
    ? rows.filter(r => r.balance > 0.005)
    : rows.filter(r => r.componentName === target && r.balance > 0.005);

  const preview: { name: string; applied: number }[] = [];
  if (isAmtValid) {
    let remaining = amt;
    for (const r of eligible) {
      if (remaining <= 0.005) break;
      const take = Math.min(r.balance, remaining);
      preview.push({ name: r.componentName, applied: take });
      remaining -= take;
    }
  }

  const collect = async () => {
    setErr(null); setMsg(null);
    if (eligible.length === 0) { setErr('Nothing left to pay against this target.'); return; }
    if (!isAmtValid) { setErr(`Enter an amount between 0 and ${fmtRupee(maxForTarget)}.`); return; }

    // Per-allocation breakdown for the API.
    const breakdown: { allocationId: string; amount: number }[] = [];
    let remaining = amt;
    for (const r of eligible) {
      if (remaining <= 0.005) break;
      const take = Math.min(r.balance, remaining);
      breakdown.push({ allocationId: r.id, amount: Number(take.toFixed(2)) });
      remaining -= take;
    }
    if (breakdown.length === 0) { setErr('Nothing left to pay against this target.'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/fees/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          paymentDate,
          paymentMode,
          referenceNo: reference.trim() || undefined,
          allocations: breakdown,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to collect fee.');
      setAmountInput('');
      setReference('');
      const targetLabel = target === 'ALL' ? 'unpaid components' : target;
      setMsg(`Receipt ${data.payment?.receiptNo || ''} recorded — ${fmtRupee(amt)} from ${studentName} (${targetLabel}).`);
      await onCollected();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to collect fee.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border border-emerald-200 bg-emerald-50/40 text-ink shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
          <Coins size={14} /> Collect Fee
        </CardTitle>
        <CardDescription className="text-mute text-xs">
          Total balance due (after discount): <span className="font-mono font-bold text-amber-600">{fmtRupee(balanceDue)}</span>.
          Pick a specific component to direct the payment, or leave on <span className="font-semibold">All Unpaid</span> to auto-distribute oldest-first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {err && <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs"><AlertCircle size={13} /> <span>{err}</span></div>}
        {msg && <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs"><CheckCircle2 size={13} /> <span>{msg}</span></div>}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Component picker — the new dropdown */}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-2xs text-mute">Apply to component</Label>
            <select
              value={target}
              onChange={e => { setTarget(e.target.value); setAmountInput(''); }}
              className="w-full h-9 bg-paper border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
            >
              <option value="ALL">All Unpaid (oldest first) &mdash; max {fmtRupee(balanceDue)}</option>
              {unpaidComponents.map(c => {
                const compBal = rows.filter(r => r.componentName === c).reduce((s, r) => s + r.balance, 0);
                return (
                  <option key={c} value={c}>
                    {c} &mdash; balance {fmtRupee(compBal)}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-2xs text-mute">Amount</Label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute text-xs">&#8377;</span>
              <Input type="number" min={0} max={maxForTarget} step="0.01"
                value={amountInput} onChange={e => setAmountInput(e.target.value)}
                placeholder={String(Math.round(maxForTarget))}
                className="pl-6 border-beige bg-paper text-ink text-xs font-mono focus-visible:ring-emerald-600" />
            </div>
            <button
              type="button"
              onClick={() => setAmountInput(String(maxForTarget.toFixed(2)))}
              className="text-2xs text-emerald-700 hover:underline font-semibold cursor-pointer"
            >
              Pay full {target === 'ALL' ? 'balance' : 'for this component'}
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-2xs text-mute">Date</Label>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
              className="border-beige bg-paper text-ink text-xs focus-visible:ring-emerald-600" />
          </div>
          <div className="space-y-1">
            <Label className="text-2xs text-mute">Mode</Label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value as typeof paymentMode)}
              className="w-full h-9 bg-paper border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-emerald-600 focus:outline-none">
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-2xs text-mute">Reference (optional)</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Txn / cheque no."
              className="border-beige bg-paper text-ink text-xs placeholder:text-mute focus-visible:ring-emerald-600" />
          </div>
          {/* Preview of where the amount will be applied */}
          {preview.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-paper p-3">
              <p className="text-2xs uppercase tracking-wider font-bold text-mute mb-2">Will be applied to</p>
              <ul className="text-xs space-y-1">
                {preview.map((p, i) => (
                  <li key={i} className="flex justify-between font-mono">
                    <span className="text-label">{p.name}</span>
                    <span className="text-emerald-700 font-bold">{fmtRupee(p.applied)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={collect} disabled={busy || !isAmtValid}
            className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2 disabled:opacity-50">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />}
            {busy ? 'Recording...' : `Collect ${amt > 0 ? fmtRupee(amt) : 'Fee'}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Profile edit form ───────────────────────────────────────────────────────
// Replaces the read-only Overview cards while in edit mode. Submits a partial
// PATCH to /api/students/{id}; the server merges with the existing record so
// blank fields stay blank rather than wiping the row. Admission ID, unit, and
// admission date are intentionally locked — those are permanent identifiers.

interface ProfileEditFormProps {
  student: StudentDetails;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}

function ProfileEditForm({ student, onCancel, onSaved }: ProfileEditFormProps) {
  // The stored name is "First Last"; split it back into two fields the way the
  // create form collects them so we send the same shape on PATCH.
  const [firstName, setFirstName] = useState<string>(student.name.split(' ')[0] || '');
  const [lastName, setLastName] = useState<string>(student.name.split(' ').slice(1).join(' ') || '');
  const [nameHindi, setNameHindi] = useState<string>(student.nameHindi || '');
  const [gender, setGender] = useState<string>(student.unitId === 'college' ? 'FEMALE' : student.gender);
  const [isFromSchool, setIsFromSchool] = useState<boolean>(student.isFromSchool || false);
  const [dob, setDob] = useState<string>(student.dob ? student.dob.slice(0, 10) : '');
  const [category, setCategory] = useState<string>(student.category);
  const [className, setClassName] = useState<string>(student.className);
  const [fatherName, setFatherName] = useState<string>(student.fatherName || '');
  const [motherName, setMotherName] = useState<string>(student.motherName || '');
  const [phone, setPhone] = useState<string>(student.phone || '');
  const [fatherPhone, setFatherPhone] = useState<string>(student.fatherPhone || '');
  const [address, setAddress] = useState<string>(student.address || '');
  const [photoUrl, setPhotoUrl] = useState<string>(student.photoUrl || '');
  const [aadharDocUrl, setAadharDocUrl] = useState<string>(student.aadharDocUrl || '');
  const [aadharNo, setAadharNo] = useState<string>(student.aadharNo || '');
  const [srNo, setSrNo] = useState<string>(student.srNo || '');
  const prevAlloc = student.feeAllocations?.find(a => a.feeComponent?.name === 'Previous Outstanding Fees');
  const [previousDues, setPreviousDues] = useState<string>(prevAlloc ? Number(prevAlloc.amountDue).toString() : '');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const looksLikeUrl = (s: string) => {
    const trimmed = s.trim();
    if (!trimmed) return true;
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/') || trimmed.startsWith('temp_');
  };

  const save = async () => {
    setErr(null);
    if (!firstName.trim()) { setErr('First name is required.'); return; }
    if (!dob) { setErr('Date of birth is required.'); return; }
    if (!className.trim()) { setErr('Class is required.'); return; }
    if (previousDues.trim() && (isNaN(Number(previousDues.trim())) || Number(previousDues.trim()) < 0)) {
      setErr('Previous outstanding fees must be a non-negative number.');
      return;
    }
    if (!looksLikeUrl(photoUrl) || !looksLikeUrl(aadharDocUrl)) {
      setErr('Document links must start with http:// or https://.');
      return;
    }
    if (aadharNo.trim() && !/^\d{12}$/.test(aadharNo.replace(/\s|-/g, ''))) {
      setErr('Aadhar number must be exactly 12 digits.');
      return;
    }
    if (phone.trim() && !/^\d{10}$/.test(phone.replace(/\s|-/g, ''))) {
      setErr('Student phone number must be exactly 10 digits.');
      return;
    }
    if (fatherPhone.trim() && !/^\d{10}$/.test(fatherPhone.replace(/\s|-/g, ''))) {
      setErr('Father / Guardian phone number must be exactly 10 digits.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/students/${student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          nameHindi: nameHindi.trim() || null,
          gender,
          dateOfBirth: dob,
          category,
          classId: className.trim(),
          sectionId: '-',
          fatherName: fatherName.trim() || undefined,
          motherName: motherName.trim() || undefined,
          phone: phone.trim() || undefined,
          guardianPhone: fatherPhone.trim() || undefined,
          address: address.trim() || undefined,
          photoUrl: photoUrl.trim() || '',
          aadharDocUrl: aadharDocUrl.trim() || '',
          aadharNo: aadharNo.trim() || null,
          srNo: srNo.trim() || null,
          isFromSchool,
          previousDues: previousDues.trim() ? Number(previousDues.trim()) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const details = (data?.details || []).map((d: { field: string; message: string }) => `${d.field}: ${d.message}`).join(' · ');
        throw new Error(data?.error ? `${data.error}${details ? ' (' + details + ')' : ''}` : 'Failed to save profile.');
      }
      await onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-brand/30 bg-paper text-ink shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-brand flex items-center gap-1.5">
              <Pencil size={13} /> Edit Profile
            </CardTitle>
            <CardDescription className="text-mute text-xs mt-0.5">
              Admission ID, unit, and admission date stay locked. Save updates the rest immediately.
            </CardDescription>
          </div>
          <span className="text-2xs text-mute font-mono">
            {student.admissionNo} &middot; {student.unit.name}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {err && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /> <span>{err}</span>
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-1">Identity</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="First Name" required>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Last Name (Optional)">
              <Input value={lastName} onChange={e => setLastName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Name in Hindi">
              <Input value={nameHindi} onChange={e => setNameHindi(e.target.value)} placeholder="optional" className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Date of Birth" required>
              <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Gender">
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                disabled={student.unitId === 'college'}
                className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none disabled:opacity-85"
              >
                {student.unitId === 'college' ? (
                  <option value="FEMALE">Female (Girls College Only)</option>
                ) : (
                  <>
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </>
                )}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="GENERAL">General</option>
                <option value="OBC">OBC</option>
                <option value="SC">SC</option>
                <option value="ST">ST</option>
              </select>
            </Field>
            <Field label="Class">
              <select
                value={className}
                onChange={e => setClassName(e.target.value)}
                className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none"
              >
                {getClassesForUnit(student.unitId).map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Aadhar Number (Manual)">
              <Input value={aadharNo} onChange={e => setAadharNo(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="e.g. 1234 5678 9012" className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Sr. Number">
              <Input value={srNo} onChange={e => setSrNo(e.target.value)} placeholder="e.g. SR-2026-100" className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Previous Outstanding Fees (INR)">
              <Input
                type="number"
                min="0"
                value={previousDues}
                onChange={e => setPreviousDues(e.target.value)}
                placeholder="e.g. 5000"
                className="border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono font-semibold"
              />
            </Field>
            {student.unitId === 'college' && (
              <div className="md:col-span-2 flex items-center gap-2.5 p-3 rounded-lg border border-brand/20 bg-brand/5">
                <input
                  id="editIsFromSchool"
                  type="checkbox"
                  checked={isFromSchool}
                  onChange={(e) => setIsFromSchool(e.target.checked)}
                  className="h-4 w-4 rounded border-beige text-brand focus:ring-brand cursor-pointer"
                />
                <Label htmlFor="editIsFromSchool" className="text-xs font-semibold text-brand cursor-pointer select-none flex flex-col">
                  <span>Studied at MGE School previously (50% Tuition Discount)</span>
                  <span className="text-[10px] text-mute font-normal mt-0.5">पूर्व में एम.जी.ई. स्कूल से अध्ययनरत रही हैं (50% शिक्षण शुल्क छूट)</span>
                </Label>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-1">Parents &amp; Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Father Name">
              <Input value={fatherName} onChange={e => setFatherName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Mother Name">
              <Input value={motherName} onChange={e => setMotherName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Student Phone">
              <Input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="optional" className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <Field label="Father / Guardian Phone">
              <Input value={fatherPhone} onChange={e => setFatherPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Residential Address">
                <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full bg-field border border-beige text-ink text-xs rounded-md px-3 py-2 focus:ring-1 focus:ring-brand focus:outline-none" />
              </Field>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-1">Documents</h3>
          <div className="grid grid-cols-1 gap-3">
            <FileUploader
              label="Student Photo"
              pathParts={[student.unitId, `Class_${student.className || 'Unassigned'}`, 'Student_Photos']}
              onUploadSuccess={(url) => setPhotoUrl(url)}
              value={photoUrl}
              acceptImagesOnly={true}
            />
            <FileUploader
              label="Student Aadhar (Optional)"
              pathParts={[student.unitId, `Class_${student.className || 'Unassigned'}`, 'Student_Aadhar']}
              onUploadSuccess={(url) => setAadharDocUrl(url)}
              value={aadharDocUrl}
            />
          </div>
        </section>

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

/** Compact label+control wrapper used inside the edit form. */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-2xs text-mute">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ─── Payment history with per-row Reverse ────────────────────────────────────
// Soft-reverses a receipt: the row stays for the audit trail but is marked
// REVERSED, the allocation balance is restored, and a counter-entry appears in
// Income & Expense. Optional reason — operator picked "reason optional" earlier.

function PaymentHistory({
  payments, onChanged,
}: { payments: FeePayment[]; onChanged: () => void | Promise<void> }) {
  const [reversingId, setReversingId] = useState<string | null>(null);

  const reverse = async (pay: FeePayment) => {
    const reason = window.prompt(
      `Reverse receipt ${pay.receiptNo} for ${fmtRupee(pay.totalAmount)}?\n\nOptional: type a reason (leave blank to skip).`,
      ''
    );
    if (reason === null) return; // user clicked Cancel

    setReversingId(pay.id);
    try {
      const res = await fetch(`/api/fees/payments/${pay.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reverse.');
      await onChanged();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to reverse receipt.');
    } finally {
      setReversingId(null);
    }
  };

  return (
    <Card className="border-beige bg-paper text-ink shadow-md">
      <CardHeader>
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
          Payment History &amp; Receipts
        </CardTitle>
        <CardDescription className="text-mute text-xs">
          Reverse a receipt if it was recorded incorrectly. The original row stays for audit; a counter-entry appears in Income &amp; Expense.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {payments.length === 0 ? (
          <div className="text-center py-12">
            <Clock size={28} className="mx-auto text-mute mb-1.5" />
            <p className="text-mute text-xs font-semibold">No payment receipts found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                  <th className="p-4">Receipt No</th>
                  <th className="p-4">Payment Date</th>
                  <th className="p-4">Mode</th>
                  <th className="p-4 text-right">Amount</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige text-label font-medium">
                {payments.map((pay) => {
                  const isReversed = !!pay.reversedAt;
                  return (
                    <tr key={pay.id} className={`transition-colors ${isReversed ? 'bg-red-50/40' : 'hover:bg-cream'}`}>
                      <td className={`p-4 font-mono font-bold ${isReversed ? 'text-mute line-through' : 'text-brand'}`}>
                        {pay.receiptNo}
                      </td>
                      <td className="p-4 text-mute">
                        {new Date(pay.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-4 text-mute uppercase">{pay.paymentMode.replace('_', ' ')}</td>
                      <td className={`p-4 text-right font-mono font-bold ${isReversed ? 'text-mute line-through' : 'text-emerald-700'}`}>
                        +{fmtRupee(pay.totalAmount)}
                      </td>
                      <td className="p-4 text-center">
                        {isReversed ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-red-50 text-red-600 border-red-200"
                            title={pay.reversalReason ? `Reason: ${pay.reversalReason}` : 'Reversed (no reason recorded)'}
                          >
                            Reversed
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-3xs font-extrabold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {isReversed ? (
                          <span className="text-2xs text-mute">—</span>
                        ) : (
                          <button
                            onClick={() => reverse(pay)}
                            disabled={reversingId === pay.id}
                            className="text-2xs font-bold uppercase text-red-600 hover:text-red-700 cursor-pointer disabled:opacity-50"
                            title="Soft-reverse this receipt"
                          >
                            {reversingId === pay.id ? <Loader2 size={12} className="inline animate-spin" /> : 'Reverse'}
                          </button>
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
  );
}

