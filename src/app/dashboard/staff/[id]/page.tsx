'use client';

/**
 * @file src/app/dashboard/staff/[id]/page.tsx
 * @description Staff member profile. Read-only overview by default; an Edit
 *              Profile toggle swaps the cards for an editable form that PATCHes
 *              the existing staff record.
 *
 * Reuses the same look-and-feel as the student profile page so operators see a
 * consistent UI across both kinds of "person" in the system.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, Pencil, Save, Building2, Calendar, Phone, Mail,
  User, Briefcase, IndianRupee, CreditCard, FileCheck2, ImageIcon, UserCheck, Bus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toViewableImageUrl } from '@/lib/imageUrl';
import { FileUploader } from '@/components/ui/file-uploader';

interface StaffDetails {
  id: string;
  staffNo: string | null;
  unitId: string;
  staffType: 'TEACHER' | 'OTHER_STAFF' | 'DRIVER';
  name: string;
  fatherName: string | null;
  roleOrDesignation: string | null;
  department: string | null;
  subject: string | null;
  phone: string | null;
  email: string | null;
  dob: string | null;
  joiningDate: string;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  monthlyBaseSalary: string | number;
  bankAccountNo: string | null;
  aadharNo: string | null;
  panNo: string | null;
  photoUrl: string | null;
  aadharDocUrl: string | null;
  panDocUrl: string | null;
  otherDocUrl: string | null;
  experienceYears: number | null;
  qualifications: string | null;
  licenseNo: string | null;
  transportMode: string | null;
  status: 'ACTIVE' | 'RESIGNED' | 'SUSPENDED';
  unit: { name: string };
}

const TYPE_LABELS: Record<string, string> = {
  TEACHER: 'Teacher', OTHER_STAFF: 'Other Staff', DRIVER: 'Driver',
};
const TYPE_ICONS: Record<string, React.ElementType> = {
  TEACHER: UserCheck, OTHER_STAFF: Briefcase, DRIVER: Bus,
};
const fmtRupee = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Reusable avatar: prefers the photo URL, falls back to the initial letter. */
function StaffAvatar({ photoUrl, name }: { photoUrl: string | null; name: string }) {
  const initial = (name?.trim()?.charAt(0) || '?').toUpperCase();
  const [failed, setFailed] = useState(false);
  const [cacheKey, setCacheKey] = useState('');

  useEffect(() => {
    setFailed(false);
    setCacheKey(Date.now().toString());
  }, [photoUrl]);

  const viewableUrl = toViewableImageUrl(photoUrl);
  const src = viewableUrl ? `${viewableUrl}?v=${cacheKey}` : '';

  return src && !failed ? (
    <img
      src={src} alt={name} onError={() => setFailed(true)}
      className="h-16 w-16 rounded-2xl object-cover border border-brand/30 bg-brand/10 shadow-inner shrink-0"
    />
  ) : (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand text-2xl font-bold shadow-inner shrink-0">
      {initial}
    </div>
  );
}

export default function StaffDetailsPage() {
  const { id } = useParams();

  const [staff, setStaff] = useState<StaffDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'qualifications'>('overview');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/staff/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load staff');
      setStaff(data.staff);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <span className="text-mute text-xs font-semibold">Loading staff profile...</span>
      </div>
    );
  }
  if (error || !staff) {
    return (
      <div className="space-y-6 max-w-lg mx-auto py-20 text-center">
        <AlertCircle size={48} className="mx-auto text-red-600 mb-2" />
        <h2 className="text-lg font-bold text-ink">Error Loading Profile</h2>
        <p className="text-mute text-xs mt-1">{error || 'Staff record not found.'}</p>
        <Link href="/dashboard/staff">
          <Button className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 rounded-lg mt-4 cursor-pointer">
            Return to Staff
          </Button>
        </Link>
      </div>
    );
  }

  const TypeIcon = TYPE_ICONS[staff.staffType] || Briefcase;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/staff"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-label font-semibold transition-colors select-none"
      >
        <ArrowLeft size={14} /> <span>Back to Staff</span>
      </Link>

      {/* Header */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <StaffAvatar photoUrl={staff.photoUrl} name={staff.name} />
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-extrabold tracking-tight text-ink">{staff.name}</h1>
                {staff.staffNo && (
                  <span className="text-[10px] font-mono bg-cream px-2 py-0.5 rounded border border-beige text-mute">
                    {staff.staffNo}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-3xs font-extrabold border ${
                  staff.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : staff.status === 'SUSPENDED' ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-red-50 text-red-600 border-red-200'
                }`}>
                  {staff.status}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-bold border bg-brand/10 text-brand border-brand/20">
                  <TypeIcon size={11} /> {TYPE_LABELS[staff.staffType] || staff.staffType}
                </span>
              </div>
              <p className="text-xs text-mute mt-1">
                {staff.roleOrDesignation && <><span className="font-semibold text-label">{staff.roleOrDesignation}</span> &middot; </>}
                {staff.unit.name}
                {staff.department && <> &middot; {staff.department}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!isEditing && (
              <Button onClick={() => setIsEditing(true)}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer gap-1.5 shrink-0">
                <Pencil size={12} /> Edit Profile
              </Button>
            )}

            {!isEditing && staff.status === 'ACTIVE' && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (window.confirm(`Are you sure you want to mark '${staff.name}' as Resigned? This deactivates their active status but preserves their salary/financial ledger history.`)) {
                    try {
                      const res = await fetch(`/api/staff/${staff.id}`, {
                        method: 'DELETE'
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.error || 'Failed to update status');
                      }
                      window.location.reload();
                    } catch (err: any) {
                      alert('Error: ' + err.message);
                    }
                  }
                }}
                className="border-red-200 hover:bg-red-50 text-red-600 font-semibold text-xs h-8 px-3 rounded-lg cursor-pointer"
              >
                Mark Resigned
              </Button>
            )}
            
            {!isEditing && staff.staffType === 'TEACHER' && (
              <div className="flex border border-beige rounded-lg p-0.5 bg-field">
                {(['overview', 'qualifications'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${
                      activeTab === tab
                        ? 'bg-brand text-white font-bold'
                        : 'text-mute hover:text-ink'
                    }`}
                  >
                    {tab === 'qualifications' ? 'Qualifications & Experience' : 'Overview'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isEditing ? (
        <StaffEditForm
          staff={staff}
          onCancel={() => setIsEditing(false)}
          onSaved={async () => { setIsEditing(false); await load(); }}
        />
      ) : (
        <>
          {!isEditing && (activeTab === 'overview' || staff.staffType !== 'TEACHER') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Employment */}
              <Card className="border-beige bg-paper text-ink shadow-md">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Employment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <ReadRow icon={<Briefcase size={14} />} label="Designation" value={staff.roleOrDesignation || '—'} />
                  <ReadRow icon={<Building2 size={14} />} label="Department" value={staff.department || '—'} />
                  {staff.staffType === 'TEACHER' && (
                    <ReadRow icon={<User size={14} />} label="Subject" value={staff.subject || '—'} />
                  )}
                  <ReadRow icon={<Calendar size={14} />} label="Joining Date" value={fmtDate(staff.joiningDate)} />
                  <ReadRow icon={<UserCheck size={14} />} label="Employment Type" value={staff.employmentType.replace('_', ' ')} />
                  <ReadRow icon={<IndianRupee size={14} />} label="Monthly Base Salary" value={fmtRupee(staff.monthlyBaseSalary)} mono />
                </CardContent>
              </Card>

              {/* Personal & Contact */}
              <Card className="border-beige bg-paper text-ink shadow-md">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Personal &amp; Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <ReadRow icon={<User size={14} />} label="Father" value={staff.fatherName || '—'} />
                  <ReadRow icon={<Calendar size={14} />} label="Date of Birth" value={staff.dob ? fmtDate(staff.dob) : '—'} />
                  <ReadRow icon={<Phone size={14} />} label="Phone" value={staff.phone || '—'} mono />
                  <ReadRow icon={<Mail size={14} />} label="Email" value={staff.email || '—'} />
                </CardContent>
              </Card>

              {/* Identity & Banking */}
              <Card className="border-beige bg-paper text-ink shadow-md">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Identity &amp; Banking</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <ReadRow icon={<CreditCard size={14} />} label="Aadhar No" value={staff.aadharNo || '—'} mono />
                  <ReadRow icon={<CreditCard size={14} />} label="PAN No" value={staff.panNo || '—'} mono />
                  <ReadRow icon={<CreditCard size={14} />} label="Bank Account" value={staff.bankAccountNo || '—'} mono />
                  {staff.staffType === 'DRIVER' && (
                    <ReadRow icon={<CreditCard size={14} />} label="License No" value={staff.licenseNo || '—'} mono />
                  )}
                </CardContent>
              </Card>

              {/* Documents */}
              <Card className="border-beige bg-paper text-ink shadow-md">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Documents</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <DocLink icon={ImageIcon} label="Photo" url={staff.photoUrl} />
                  <DocLink icon={FileCheck2} label="Aadhar" url={staff.aadharDocUrl} />
                  <DocLink icon={FileCheck2} label="PAN" url={staff.panDocUrl} />
                  <DocLink icon={FileCheck2} label={staff.staffType === 'TEACHER' ? 'Degree / Certificates' : 'Other'} url={staff.otherDocUrl} />
                </CardContent>
              </Card>
            </div>
          )}

          {!isEditing && activeTab === 'qualifications' && staff.staffType === 'TEACHER' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Qualifications & Experience */}
              <Card className="border-beige bg-paper text-ink shadow-md">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Qualifications &amp; Experience</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <ReadRow icon={<Briefcase size={14} />} label="Qualifications" value={staff.qualifications || '—'} />
                  <ReadRow icon={<Calendar size={14} />} label="Experience" value={staff.experienceYears !== null ? `${staff.experienceYears} Years` : '—'} />
                </CardContent>
              </Card>

              {/* Degree / Certificates */}
              <Card className="border-beige bg-paper text-ink shadow-md">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Degree &amp; Certificates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <DocLink icon={FileCheck2} label="Degree / Certificates" url={staff.otherDocUrl} />
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A single label/value row inside the read-only view cards. */
function ReadRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-beige last:border-b-0">
      <span className="text-mute flex items-center gap-1.5">{icon} {label}</span>
      <span className={`font-semibold text-ink ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

/** Chip for a document link; opens in a new tab when present, muted when missing. */
function DocLink({ icon: Icon, label, url }: { icon: React.ElementType; label: string; url: string | null }) {
  if (url) {
    return (
      <a href={toViewableImageUrl(url)} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors font-semibold">
        <span className="flex items-center gap-1.5"><Icon size={12} /> {label}</span>
        <span className="text-2xs">on file ↗</span>
      </a>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-beige bg-cream text-mute font-semibold">
      <Icon size={12} /> {label} <span className="text-2xs ml-auto italic">missing</span>
    </span>
  );
}

// ─── Edit form ───────────────────────────────────────────────────────────────

function StaffEditForm({ staff, onCancel, onSaved }: { staff: StaffDetails; onCancel: () => void; onSaved: () => void | Promise<void> }) {
  const [name, setName] = useState(staff.name);
  const [fatherName, setFatherName] = useState(staff.fatherName || '');
  const [designation, setDesignation] = useState(staff.roleOrDesignation || '');
  const [department, setDepartment] = useState(staff.department || '');
  const [subject, setSubject] = useState(staff.subject || '');
  const [phone, setPhone] = useState(staff.phone || '');
  const [email, setEmail] = useState(staff.email || '');
  const [employmentType, setEmploymentType] = useState(staff.employmentType);
  const [monthlySalary, setMonthlySalary] = useState(String(staff.monthlyBaseSalary));
  const [bankAccountNo, setBankAccountNo] = useState(staff.bankAccountNo || '');
  const [aadharNo, setAadharNo] = useState(staff.aadharNo || '');
  const [panNo, setPanNo] = useState(staff.panNo || '');
  const [licenseNo, setLicenseNo] = useState(staff.licenseNo || '');
  const [status, setStatus] = useState(staff.status);
  const [photoUrl, setPhotoUrl] = useState(staff.photoUrl || '');
  const [aadharDocUrl, setAadharDocUrl] = useState(staff.aadharDocUrl || '');
  const [panDocUrl, setPanDocUrl] = useState(staff.panDocUrl || '');
  const [otherDocUrl, setOtherDocUrl] = useState(staff.otherDocUrl || '');
  const [qualifications, setQualifications] = useState(staff.qualifications || '');
  const [experienceYears, setExperienceYears] = useState(staff.experienceYears !== null ? String(staff.experienceYears) : '');
  const [joiningDate, setJoiningDate] = useState(
    staff.joiningDate ? new Date(staff.joiningDate).toISOString().split('T')[0] : ''
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const looksLikeUrl = (s: string) => {
    const trimmed = s.trim();
    if (!trimmed) return true;
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/') || trimmed.startsWith('temp_');
  };

  const save = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Name is required.'); return; }
    const sal = Number(monthlySalary);
    if (!Number.isFinite(sal) || sal < 0) { setErr('Monthly salary must be a non-negative number.'); return; }
    if (!looksLikeUrl(photoUrl) || !looksLikeUrl(aadharDocUrl) || !looksLikeUrl(panDocUrl) || !looksLikeUrl(otherDocUrl)) {
      setErr('Document links must start with http:// or https://.');
      return;
    }
    const exp = experienceYears.trim() ? Number(experienceYears) : null;
    if (experienceYears.trim() && (!Number.isInteger(exp) || exp! < 0)) {
      setErr('Experience must be a non-negative integer.');
      return;
    }
    if (phone.trim() && !/^\d{10}$/.test(phone.replace(/\s|-/g, ''))) {
      setErr('Phone number must be exactly 10 digits.');
      return;
    }
    if (aadharNo.trim() && !/^\d{12}$/.test(aadharNo.replace(/\s|-/g, ''))) {
      setErr('Aadhar number must be exactly 12 digits.');
      return;
    }
    if (staff.staffType === 'TEACHER' || staff.staffType === 'DRIVER') {
      if (!photoUrl.trim()) { setErr('Staff photo is required for teachers and drivers.'); return; }
      if (!aadharDocUrl.trim()) { setErr('Aadhar document is required for teachers and drivers.'); return; }
      if (!panDocUrl.trim()) { setErr('PAN document is required for teachers and drivers.'); return; }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          fatherName: fatherName.trim() || null,
          roleOrDesignation: designation.trim() || null,
          department: department.trim() || null,
          subject: subject.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          employmentType,
          monthlyBaseSalary: sal,
          bankAccountNo: bankAccountNo.trim() || null,
          aadharNo: aadharNo.trim() || null,
          panNo: panNo.trim() || null,
          licenseNo: licenseNo.trim() || null,
          status,
          joiningDate,
          photoUrl: photoUrl.trim() || null,
          aadharDocUrl: aadharDocUrl.trim() || null,
          panDocUrl: panDocUrl.trim() || null,
          otherDocUrl: otherDocUrl.trim() || null,
          qualifications: qualifications.trim() || null,
          experienceYears: experienceYears.trim() ? Number(experienceYears) : null,
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
          <Pencil size={13} /> Edit Staff Profile
        </CardTitle>
        <CardDescription className="text-mute text-xs mt-0.5">
          Unit and staff type stay locked. Everything else can be updated below.
        </CardDescription>
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
            <SField label="Full Name" required>
              <Input value={name} onChange={e => setName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </SField>
            <SField label="Father Name">
              <Input value={fatherName} onChange={e => setFatherName(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </SField>
            <SField label="Status">
              <select value={status} onChange={e => setStatus(e.target.value as typeof status)} className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="RESIGNED">Resigned</option>
              </select>
            </SField>
            <SField label="Employment Type">
              <select value={employmentType} onChange={e => setEmploymentType(e.target.value as typeof employmentType)} className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
              </select>
            </SField>
            <SField label="Joining Date" required>
              <Input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </SField>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-1">Role &amp; Salary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SField label="Designation / Role">
              <Input value={designation} onChange={e => setDesignation(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </SField>
            <SField label="Department">
              <Input value={department} onChange={e => setDepartment(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </SField>
            {staff.staffType === 'TEACHER' && (
              <>
                <SField label="Subject">
                  <Input value={subject} onChange={e => setSubject(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
                </SField>
                <SField label="Qualifications">
                  <Input value={qualifications} onChange={e => setQualifications(e.target.value)} placeholder="e.g. B.Ed, M.Sc" className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
                </SField>
                <SField label="Experience (Years)">
                  <Input type="number" min={0} value={experienceYears} onChange={e => setExperienceYears(e.target.value)} placeholder="e.g. 5" className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
                </SField>
              </>
            )}
            <SField label="Monthly Base Salary (₹)" required>
              <Input type="number" min={0} step="0.01" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value)} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
            </SField>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-1">Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SField label="Phone">
              <Input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
            </SField>
            <SField label="Email">
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="border-beige bg-field text-ink text-xs focus-visible:ring-brand" />
            </SField>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-1">Identity &amp; Banking</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SField label="Aadhar No">
              <Input value={aadharNo} onChange={e => setAadharNo(e.target.value.replace(/\D/g, '').slice(0, 12))} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
            </SField>
            <SField label="PAN No">
              <Input value={panNo} onChange={e => setPanNo(e.target.value)} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
            </SField>
            <SField label="Bank Account No">
              <Input value={bankAccountNo} onChange={e => setBankAccountNo(e.target.value)} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
            </SField>
            {staff.staffType === 'DRIVER' && (
              <SField label="Driving License No">
                <Input value={licenseNo} onChange={e => setLicenseNo(e.target.value)} className="border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
              </SField>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-1">Documents</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FileUploader
              label="Staff Photo"
              pathParts={[staff.unitId, 'staff', 'Staff_Photos']}
              onUploadSuccess={(url) => setPhotoUrl(url)}
              value={photoUrl}
              acceptImagesOnly={true}
            />
            <FileUploader
              label="Aadhar Document"
              pathParts={[staff.unitId, 'staff', 'Staff_Aadhar']}
              onUploadSuccess={(url) => setAadharDocUrl(url)}
              value={aadharDocUrl}
            />
            <FileUploader
              label="PAN Document"
              pathParts={[staff.unitId, 'staff', 'Staff_PAN']}
              onUploadSuccess={(url) => setPanDocUrl(url)}
              value={panDocUrl}
            />
            <FileUploader
              label={staff.staffType === 'TEACHER' ? 'Degree / Certificates' : 'Other Document'}
              pathParts={[staff.unitId, 'staff', 'Staff_Other']}
              onUploadSuccess={(url) => setOtherDocUrl(url)}
              value={otherDocUrl}
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

function SField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-2xs text-mute">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
