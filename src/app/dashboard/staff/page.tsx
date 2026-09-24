'use client';

/**
 * @file src/app/dashboard/staff/page.tsx
 * @description Staff Management — Directory, Add Staff form, and individual profile view.
 *
 * Three-tab layout:
 *  Tab 1 — Directory: searchable, filterable table of all staff with quick actions.
 *  Tab 2 — Add Staff: multi-section form (role type → personal → employment → documents).
 *  Tab 3 — Profile: detailed view of a selected staff member with salary slip history.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDataSubscription } from '@/lib/events';
import {
  Users,
  Plus,
  Search,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  UserMinus,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  Bus,
  Briefcase,
  ArrowLeft,
  X,
  IndianRupee,
  Phone,
  Mail,
  Calendar,
  FileText,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FileUploader } from '@/components/ui/file-uploader';
import { toViewableImageUrl } from '@/lib/imageUrl';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  staffNo: string | null;
  unitId: string;
  staffType: string;
  name: string;
  fatherName: string | null;
  roleOrDesignation: string | null;
  department: string | null;
  subject: string | null;
  phone: string | null;
  email: string | null;
  dob: string | null;
  joiningDate: string;
  employmentType: string;
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
  status: string;
  unit: { name: string };
  salarySlips?: SalarySlip[];
}

interface SalarySlip {
  id: string;
  month: string;
  year: number;
  baseSalary: string | number;
  allowances: string | number;
  pfDeduction: string | number;
  tdsDeduction: string | number;
  otherDeductions: string | number;
  netSalary: string | number;
  paymentStatus: string;
  paidDate: string | null;
  paymentMode: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_LABELS: Record<string, string> = {
  all: 'All Divisions',
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
  transport: 'Transport Department',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  TEACHER: UserCheck, DRIVER: Bus, OTHER_STAFF: Briefcase,
};

const TYPE_COLORS: Record<string, string> = {
  TEACHER: 'bg-brand/10 text-brand border-brand/20',
  DRIVER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OTHER_STAFF: 'bg-amber-50 text-amber-600 border-amber-200',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RESIGNED: 'bg-slate-100 text-mute border-[#dcd5c8]',
  SUSPENDED: 'bg-red-50 text-red-600 border-red-200',
};

const fmt = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;
const fmtDate = (d: string | null) => d
  ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—';

// ─── Staff Directory Tab ──────────────────────────────────────────────────────

function DirectoryTab({
  allowedUnits,
  currentUser,
  onViewProfile,
}: {
  allowedUnits: string[];
  currentUser: any;
  onViewProfile: (id: string) => void;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const isTransportHOD = currentUser?.role === 'DEPARTMENT_HEAD' && currentUser?.accessUnits?.includes('transport');

  const [unit, setUnit] = useState(isTransportHOD ? 'transport' : 'all');
  const [type, setType] = useState(isTransportHOD ? 'DRIVER' : 'all');
  const [status, setStatus] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        type: 'staff',
        unit,
        typeFilter: type,
        status,
      });
      if (search.trim()) params.append('search', search.trim());
      window.open(`/api/export?${params.toString()}`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ unit, type, status, page: '1', limit: '10000' });
      if (search.trim()) params.append('search', search.trim());
      const res = await fetch(`/api/staff?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStaff(data.staff || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.pages || 1);
    } catch { setStaff([]); }
    finally { setIsLoading(false); }
  }, [unit, type, status, search]);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  const handleResign = async (id: string, name: string) => {
    if (!confirm(`Mark '${name}' as Resigned? Their salary history will be preserved.`)) return;
    try {
      await fetch(`/api/staff/${id}`, { method: 'DELETE' });
      load();
    } catch { alert('Failed to update status.'); }
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, role, department..."
              className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand" />
          </div>
          {!isTransportHOD && (
            <div className="flex items-center gap-1.5">
              <Building2 size={13} className="text-mute" />
              <select value={unit} onChange={e => { setUnit(e.target.value); setPage(1); }}
                className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
                <option value="all">All Divisions</option>
                {allowedUnits.map(u => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
              </select>
            </div>
          )}
          {!isTransportHOD && (
            <select value={type} onChange={e => { setType(e.target.value); setPage(1); }}
              className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
              <option value="all">All Types</option>
              <option value="TEACHER">Teachers</option>
              <option value="OTHER_STAFF">Other Staff</option>
              <option value="DRIVER">Drivers</option>
            </select>
          )}
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="bg-field border border-[#e3dcd2] text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
            <option value="ACTIVE">Active</option>
            <option value="RESIGNED">Resigned</option>
            <option value="SUSPENDED">Suspended</option>
          </select>

          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download size={14} />}
            <span>Export</span>
          </Button>

          <span className="text-xs text-mute ml-auto">{total} member{total !== 1 ? 's' : ''}</span>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
            </div>
          ) : staff.length === 0 ? (
            <div className="text-center py-16">
              <Users size={36} className="mx-auto text-mute mb-3" />
              <p className="text-mute text-sm font-semibold">No staff members found</p>
              <p className="text-mute text-xs mt-1">Try adjusting filters or add a new staff member.</p>
            </div>
          ) : (
            <div className="max-h-[650px] overflow-y-auto overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs relative">
                <thead className="sticky top-0 z-10 border-b border-beige bg-cream">
                  <tr className="text-mute font-bold uppercase tracking-wider">
                    <th className="p-4 bg-cream">Name</th>
                    <th className="p-4 bg-cream">Type</th>
                    <th className="p-4 bg-cream">Division</th>
                    <th className="p-4 bg-cream">Role / Dept</th>
                    <th className="p-4 bg-cream">Phone</th>
                    <th className="p-4 bg-cream text-right">Base Salary</th>
                    <th className="p-4 bg-cream text-center">Status</th>
                    <th className="p-4 bg-cream text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {staff.map(s => {
                    const TypeIcon = TYPE_ICONS[s.staffType] || Briefcase;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => router.push(`/dashboard/staff/${s.id}`)}
                        className="hover:bg-cream transition-colors cursor-pointer"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2.5">
                            {s.photoUrl ? (
                              <img src={toViewableImageUrl(s.photoUrl)} alt={s.name}
                                className="h-7 w-7 rounded-lg object-cover border border-beige shrink-0"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="h-7 w-7 rounded-lg bg-brand/10 border border-brand/30 flex items-center justify-center text-brand text-xs font-bold shrink-0">
                                {s.name.charAt(0)}
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-semibold text-ink">
                                {s.name}
                              </span>
                              {s.staffNo && <span className="text-[10px] font-mono text-mute">{s.staffNo}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${TYPE_COLORS[s.staffType]}`}>
                            <TypeIcon size={10} />
                            {s.staffType.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-4 text-mute">{s.unit.name}</td>
                        <td className="p-4">
                          <div>
                            <p className="text-label font-medium">{s.roleOrDesignation || '—'}</p>
                            {s.department && <p className="text-mute text-2xs">{s.department}</p>}
                          </div>
                        </td>
                        <td className="p-4 font-mono text-mute">{s.phone || '—'}</td>
                        <td className="p-4 text-right font-mono font-semibold text-ink">{fmt(s.monthlyBaseSalary)}</td>
                        <td className="p-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${STATUS_COLORS[s.status] || ''}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="p-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            {s.status === 'ACTIVE' && (
                              <button onClick={() => handleResign(s.id, s.name)} title="Mark Resigned"
                                className="p-1.5 rounded bg-cream hover:bg-red-50 text-mute hover:text-red-600 cursor-pointer">
                                <UserMinus size={13} />
                              </button>
                            )}
                          </div>
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

      {/* Total Count summary */}
      {!isLoading && staff.length > 0 && (
        <div className="flex items-center justify-between border-t border-beige pt-4 text-xs font-semibold text-mute">
          <span>Showing all <span className="text-label">{total}</span> members</span>
        </div>
      )}
    </div>
  );
}

// ─── Add Staff Tab ────────────────────────────────────────────────────────────

function AddStaffTab({ allowedUnits, currentUser, onSuccess }: { allowedUnits: string[]; currentUser: any; onSuccess: () => void }) {
  const isTransportHOD = currentUser?.role === 'DEPARTMENT_HEAD' && currentUser?.accessUnits?.includes('transport');

  const [staffType, setStaffType] = useState<'TEACHER' | 'OTHER_STAFF' | 'DRIVER'>(isTransportHOD ? 'DRIVER' : 'TEACHER');
  const [unitId, setUnitId] = useState(isTransportHOD ? 'transport' : (allowedUnits[0] || ''));
  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [role, setRole] = useState('');
  const [dept, setDept] = useState('');
  const [subject, setSubject] = useState('');
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
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setName(''); setFatherName(''); setRole(''); setDept(''); setSubject('');
    setPhone(''); setEmail(''); setDob(''); setSalary(''); setBankAccount('');
    setAadhar(''); setPan(''); setPhotoUrl(''); setAadharUrl(''); setPanUrl('');
    setOtherDocUrl(''); setQualifications(''); setExperience('');
    setLicenseNo(''); setTransportMode('');
    setError(null); setFieldErrors({}); setSuccess(false);
    if (isTransportHOD) {
      setStaffType('DRIVER');
      setUnitId('transport');
    }
  };

  const handleSubmit = async () => {
    setError(null); setFieldErrors({});
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!salary || Number(salary) <= 0) { setError('Monthly salary is required.'); return; }
    const fe: Record<string, string> = {};
    if (phone.trim() && !/^\d{10}$/.test(phone.replace(/\s|-/g, ''))) {
      fe.phone = 'Phone number must be exactly 10 digits';
    }
    if (aadhar.trim() && !/^\d{12}$/.test(aadhar.replace(/\s|-/g, ''))) {
      fe.aadharNo = 'Aadhar number must be exactly 12 digits';
    }
    if (!photoUrl.trim() || !aadharUrl.trim() || ((staffType === 'TEACHER' || staffType === 'DRIVER') && !panUrl.trim()) || Object.keys(fe).length > 0) {
      if (!photoUrl.trim()) fe.photoUrl = 'Staff photo link is required';
      if (!aadharUrl.trim()) fe.aadharDocUrl = 'Aadhar document link is required';
      if ((staffType === 'TEACHER' || staffType === 'DRIVER') && !panUrl.trim()) {
        fe.panDocUrl = 'PAN document link is required for teachers and drivers';
      }
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
          unitId, staffType, name, fatherName, roleOrDesignation: role,
          department: dept, subject, phone, email, dob, joiningDate,
          employmentType: empType, monthlyBaseSalary: Number(salary),
          bankAccountNo: bankAccount, aadharNo: aadhar, panNo: pan,
          photoUrl, aadharDocUrl: aadharUrl, panDocUrl: panUrl,
          otherDocUrl: otherDocUrl.trim() || undefined,
          qualifications: qualifications.trim() || undefined,
          experienceYears: experience.trim() ? Number(experience.trim()) : undefined,
          licenseNo, transportMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.details) {
          const errs: Record<string, string> = {};
          data.details.forEach((d: { field: string; message: string }) => { errs[d.field] = d.message; });
          setFieldErrors(errs);
          setError('Please fix the validation errors below.');
        } else {
          setError(data.error || 'Failed to create staff member.');
        }
        return;
      }
      setSuccess(true);
      reset();
      onSuccess();
    } catch { setError('Network error. Please try again.'); }
    finally { setIsSubmitting(false); }
  };

  const fe = (f: string) => fieldErrors[f];
  const inputCls = (f: string) =>
    `border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand ${fe(f) ? 'border-red-300/50' : ''}`;

  return (
    <div className="max-w-3xl space-y-5">
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
          <CheckCircle2 size={14} /> <span>Staff member added successfully.</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
          <AlertCircle size={14} /> <span>{error}</span>
        </div>
      )}

      {/* Type selector */}
      <Card className="border-beige bg-paper text-ink">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Staff Type & Division</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs text-mute">Staff Category</Label>
            {isTransportHOD ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand text-white border border-brand w-max select-none">
                <Bus size={13} /> DRIVER
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {(['TEACHER', 'OTHER_STAFF', 'DRIVER'] as const).map(t => {
                  const Icon = TYPE_ICONS[t];
                  return (
                    <button key={t} onClick={() => setStaffType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${staffType === t ? 'bg-brand border-brand text-white' : 'bg-field border-beige text-mute hover:border-[#c9c2b3]'}`}>
                      <Icon size={13} /> {t.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Division</Label>
            {isTransportHOD ? (
              <div className="flex items-center h-8 bg-field border border-beige text-ink text-xs rounded-lg px-3 font-semibold select-none">
                Transport Department
              </div>
            ) : (
              <select value={unitId} onChange={e => setUnitId(e.target.value)}
                className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
                {allowedUnits.map(u => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Personal details */}
      <Card className="border-beige bg-paper text-ink">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Full Name <span className="text-red-600">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rajesh Kumar Sharma" className={inputCls('name')} />
            {fe('name') && <p className="text-2xs text-red-600">{fe('name')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Father&apos;s Name</Label>
            <Input value={fatherName} onChange={e => setFatherName(e.target.value)} placeholder="Father's name" className={inputCls('fatherName')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute flex items-center gap-1"><Phone size={11} /> Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit phone number" className={inputCls('phone')} />
            {fe('phone') && <p className="text-2xs text-red-600">{fe('phone')}</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute flex items-center gap-1"><Mail size={11} /> Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@school.edu" className={inputCls('email')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute flex items-center gap-1"><Calendar size={11} /> Date of Birth</Label>
            <Input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputCls('dob')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Aadhar No.</Label>
            <Input value={aadhar} onChange={e => setAadhar(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="12-digit Aadhar number" className={inputCls('aadharNo')} />
            {fe('aadharNo') && <p className="text-2xs text-red-600">{fe('aadharNo')}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Employment details */}
      <Card className="border-beige bg-paper text-ink">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Employment Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Role / Designation</Label>
            <Input value={role} onChange={e => setRole(e.target.value)}
              placeholder={staffType === 'TEACHER' ? 'e.g. Senior Teacher' : staffType === 'DRIVER' ? 'e.g. Bus Driver' : 'e.g. Office Assistant'}
              className={inputCls('roleOrDesignation')} />
          </div>
          {staffType === 'TEACHER' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Department</Label>
                <Input value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. Science" className={inputCls('department')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Subject Specialization</Label>
                <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Physics, Mathematics" className={inputCls('subject')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Qualifications</Label>
                <Input value={qualifications} onChange={e => setQualifications(e.target.value)} placeholder="e.g. B.Ed, M.Sc Physics" className={inputCls('qualifications')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Experience (Years)</Label>
                <Input type="number" min="0" value={experience} onChange={e => setExperience(e.target.value)} placeholder="e.g. 5" className={inputCls('experienceYears')} />
              </div>
            </>
          )}
          {staffType === 'DRIVER' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">License No.</Label>
                <Input value={licenseNo} onChange={e => setLicenseNo(e.target.value)} placeholder="DL-XXXXXXXX" className={inputCls('licenseNo')} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Transport Mode</Label>
                <Input value={transportMode} onChange={e => setTransportMode(e.target.value)} placeholder="e.g. Bus, Mini-Bus" className={inputCls('transportMode')} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Employment Type</Label>
            <select value={empType} onChange={e => setEmpType(e.target.value as typeof empType)}
              className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none">
              <option value="FULL_TIME">Full-Time</option>
              <option value="PART_TIME">Part-Time</option>
              <option value="CONTRACT">Contract</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute flex items-center gap-1"><Calendar size={11} /> Joining Date <span className="text-red-600">*</span></Label>
            <Input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} className={inputCls('joiningDate')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute flex items-center gap-1"><IndianRupee size={11} /> Monthly Base Salary <span className="text-red-600">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
              <Input type="number" value={salary} onChange={e => setSalary(e.target.value)}
                placeholder="0" className={`pl-7 ${inputCls('monthlyBaseSalary')}`} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">Bank Account No.</Label>
            <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="Account number" className={inputCls('bankAccountNo')} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-mute">PAN No.</Label>
            <Input value={pan} onChange={e => setPan(e.target.value)} placeholder="ABCDE1234F" className={inputCls('panNo')} />
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card className="border-beige bg-paper text-ink">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">Staff Documents</CardTitle>
          <CardDescription className="text-xs text-mute">Upload secure staff documents and attachments</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <FileUploader
              label="Staff Photo *"
              pathParts={[unitId || 'unassigned', 'staff', 'Staff_Photos']}
              onUploadSuccess={(url) => setPhotoUrl(url)}
              value={photoUrl}
              acceptImagesOnly={true}
            />
            {fe('photoUrl') && <p className="text-2xs text-red-600">{fe('photoUrl')}</p>}
          </div>

          <div className="space-y-1.5">
            <FileUploader
              label="Aadhar Document *"
              pathParts={[unitId || 'unassigned', 'staff', 'Staff_Aadhar']}
              onUploadSuccess={(url) => setAadharUrl(url)}
              value={aadharUrl}
            />
            {fe('aadharDocUrl') && <p className="text-2xs text-red-600">{fe('aadharDocUrl')}</p>}
          </div>

          <div className="space-y-1.5">
            <FileUploader
              label="PAN Document"
              pathParts={[unitId || 'unassigned', 'staff', 'Staff_PAN']}
              onUploadSuccess={(url) => setPanUrl(url)}
              value={panUrl}
            />
            {fe('panDocUrl') && <p className="text-2xs text-red-600">{fe('panDocUrl')}</p>}
          </div>

          <div className="space-y-1.5">
            <FileUploader
              label={staffType === 'TEACHER' ? 'Degree / Certificates' : 'Other Document'}
              pathParts={[unitId || 'unassigned', 'staff', 'Staff_Other']}
              onUploadSuccess={(url) => setOtherDocUrl(url)}
              value={otherDocUrl}
            />
            {fe('otherDocUrl') && <p className="text-2xs text-red-600">{fe('otherDocUrl')}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button onClick={reset}
          className="border border-beige bg-transparent text-mute hover:text-ink hover:bg-cream font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer">
          <X size={13} className="mr-1.5" /> Clear Form
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}
          className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2">
          {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {isSubmitting ? 'Saving...' : 'Add Staff Member'}
        </Button>
      </div>
    </div>
  );
}

// ─── Staff Profile Tab ────────────────────────────────────────────────────────

interface SalaryMonth { month: string; year: number; expected: number; paid: number; remaining: number; }

function ProfileTab({ staffId, onBack }: { staffId: string; onBack: () => void }) {
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [months, setMonths] = useState<SalaryMonth[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payKey, setPayKey] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'overview' | 'qualifications'>('overview');

  const load = React.useCallback(() => {
    setIsLoading(true);
    fetch(`/api/staff/${staffId}`)
      .then(r => r.json())
      .then(d => { if (d.staff) { setStaff(d.staff); setMonths(d.months || []); } else setError(d.error || 'Not found'); })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setIsLoading(false));
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>
  );
  if (error || !staff) return (
    <div className="text-center py-16">
      <AlertCircle size={32} className="mx-auto text-red-600 mb-2" />
      <p className="text-mute text-sm font-semibold">{error || 'Staff not found'}</p>
      <button onClick={onBack} className="text-brand text-xs mt-3 hover:text-brand cursor-pointer">← Back to Directory</button>
    </div>
  );

  const TypeIcon = TYPE_ICONS[staff.staffType] || Briefcase;

  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-mute hover:text-label font-semibold cursor-pointer">
        <ArrowLeft size={13} /> Back to Directory
      </button>

      {/* Header card */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-5 flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex items-center gap-4">
            {staff.photoUrl ? (
              <img src={staff.photoUrl} alt={staff.name}
                className="h-16 w-16 rounded-2xl object-cover border border-brand/30 bg-brand/10 shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="h-16 w-16 flex items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand text-2xl font-bold shrink-0">
                {staff.name.charAt(0)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-extrabold text-ink">{staff.name}</h2>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${TYPE_COLORS[staff.staffType]}`}>
                  <TypeIcon size={10} /> {staff.staffType.replace('_', ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${STATUS_COLORS[staff.status]}`}>
                  {staff.status}
                </span>
              </div>
              <p className="text-xs text-mute mt-1">
                {staff.roleOrDesignation || 'Staff'} · {staff.unit.name}
                {staff.department && ` · ${staff.department}`}
              </p>
            </div>
          </div>
          <div className="md:ml-auto flex items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <p className="text-2xs text-mute uppercase font-bold tracking-wider">Monthly Salary</p>
              <p className="text-xl font-extrabold text-brand">{fmt(staff.monthlyBaseSalary)}</p>
            </div>
            {staff.staffType === 'TEACHER' && (
              <div className="flex border border-beige rounded-lg p-0.5 bg-field">
                {(['overview', 'qualifications'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveProfileTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${
                      activeProfileTab === tab
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

      {/* Details grid */}
      {(activeProfileTab === 'overview' || staff.staffType !== 'TEACHER') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Personal */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Personal Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {[
                { label: "Father's Name", val: staff.fatherName },
                { label: 'Phone', val: staff.phone },
                { label: 'Email', val: staff.email },
                { label: 'Date of Birth', val: fmtDate(staff.dob) },
                { label: 'Aadhar No.', val: staff.aadharNo },
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between border-b border-beige pb-2">
                  <span className="text-mute">{label}</span>
                  <span className="font-semibold text-label">{val || '—'}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Employment */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Employment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {[
                { label: 'Employment Type', val: staff.employmentType.replace('_', '-') },
                { label: 'Joining Date', val: fmtDate(staff.joiningDate) },
                { label: 'Subject', val: staff.subject },
                { label: 'PAN No.', val: staff.panNo },
                { label: 'Bank Account', val: staff.bankAccountNo },
                ...(staff.staffType === 'DRIVER'
                  ? [{ label: 'License No.', val: staff.licenseNo }, { label: 'Transport Mode', val: staff.transportMode }]
                  : []),
              ].map(({ label, val }) => (
                <div key={label} className="flex justify-between border-b border-beige pb-2">
                  <span className="text-mute">{label}</span>
                  <span className="font-semibold text-label">{val || '—'}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card className="border-beige bg-paper text-ink shadow-md md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Documents</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              {[
                { label: 'Photo', url: staff.photoUrl },
                { label: 'Aadhar', url: staff.aadharDocUrl },
                { label: 'PAN', url: staff.panDocUrl },
                { label: staff.staffType === 'TEACHER' ? 'Degree / Certificates' : 'Other', url: staff.otherDocUrl },
              ].map(({ label, url }) => (
                <div key={label} className="p-3 rounded-lg border border-beige bg-cream">
                  <p className="text-mute font-semibold mb-1">{label}</p>
                  {url
                    ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand underline">View {label} ↗</a>
                    : <span className="text-mute italic">Not uploaded</span>
                  }
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeProfileTab === 'qualifications' && staff.staffType === 'TEACHER' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Qualifications & Experience */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Qualifications &amp; Experience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex justify-between border-b border-beige pb-2">
                <span className="text-mute">Qualifications</span>
                <span className="font-semibold text-label">{staff.qualifications || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-beige pb-2">
                <span className="text-mute">Experience</span>
                <span className="font-semibold text-label">{staff.experienceYears !== null ? `${staff.experienceYears} Years` : '—'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Degree & Certificates */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Degree &amp; Certificates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="p-3 rounded-lg border border-beige bg-cream">
                <p className="text-mute font-semibold mb-1">Degree / Certificates</p>
                {staff.otherDocUrl
                  ? <a href={toViewableImageUrl(staff.otherDocUrl)} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand underline">View Degree / Certificates ↗</a>
                  : <span className="text-mute italic">Not uploaded</span>
                }
              </div>
            </CardContent>
          </Card>
        </div>
      )}

        {/* Section 2 — Month-wise Salary */}
        <Card className="border-beige bg-paper text-ink shadow-md md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Salary — Month by Month</CardTitle>
            <CardDescription className="text-xs text-mute">Pay full or part of each month. A fully-paid month shows <span className="text-emerald-700 font-bold">CLEARED</span>.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-4">Month</th><th className="p-4 text-right">Salary</th><th className="p-4 text-right">Paid</th>
                    <th className="p-4 text-right">Remaining</th><th className="p-4 text-center">Status</th><th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {months.map(m => {
                    const key = `${m.month}-${m.year}`;
                    const cleared = m.expected > 0 && m.paid >= m.expected;
                    const partial = m.paid > 0 && m.paid < m.expected;
                    const isPaying = payKey === key;
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
                            : <button onClick={() => setPayKey(isPaying ? null : key)} className="px-2.5 py-1 rounded bg-emerald-700/80 hover:bg-emerald-600 text-white text-2xs font-bold cursor-pointer">{isPaying ? 'Close' : 'Pay'}</button>}
                          </td>
                        </tr>
                        {isPaying && (
                          <tr><td colSpan={6} className="p-0">
                            <SalaryPayForm staffId={staffId} month={m.month} year={m.year} remaining={m.remaining} onPaid={() => { setPayKey(null); load(); }} />
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

// ─── Per-month salary pay form ────────────────────────────────────────────────

function SalaryPayForm({ staffId, month, year, remaining, onPaid }: { staffId: string; month: string; year: number; remaining: number; onPaid: () => void }) {
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : ''));
  const [mode, setMode] = useState('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    if (!(Number(amount) > 0)) { setError('Enter a positive amount.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/${staffId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay_salary', month, year, amount: Number(amount), date: paymentDate, paymentMode: mode }) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      onPaid();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-cream px-6 py-4 flex flex-wrap items-end gap-3">
      {error && <div className="w-full text-xs text-red-600 flex items-center gap-1.5"><AlertCircle size={12} /> {error}</div>}
      <div className="text-xs text-mute mb-1.5">Paying <span className="font-bold text-ink">{month} {year}</span> · remaining <span className="font-mono text-amber-600">{fmt(remaining)}</span></div>
      <div className="w-full" />
      <div className="space-y-1">
        <Label className="text-2xs text-mute">Payment Date</Label>
        <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-8 w-36 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" />
      </div>
      <div className="space-y-1">
        <Label className="text-2xs text-mute">Amount</Label>
        <div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
          <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="h-8 w-32 pl-5 border-beige bg-field text-ink text-xs font-mono focus-visible:ring-brand" /></div>
      </div>
      <div className="space-y-1">
        <Label className="text-2xs text-mute">Mode</Label>
        <select value={mode} onChange={e => setMode(e.target.value)} className="block h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand">
          {['BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI'].map(x => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
        </select>
      </div>
      <Button onClick={pay} disabled={busy} className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer gap-1.5">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Pay</Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = 'directory' | 'add' | 'profile';

export default function StaffManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('directory');
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) {
        setCurrentUser(d.user);
        setAllowedUnits(d.user.accessUnits.filter((u: string) => !['hostel'].includes(u)));
      }
    }).finally(() => setIsLoadingUser(false));
  }, []);

  const openProfile = (id: string) => { setProfileId(id); setActiveTab('profile'); };
  const closeProfile = () => { setProfileId(null); setActiveTab('directory'); };

  const TABS = [
    { id: 'directory' as TabId, label: 'Staff Directory', icon: Users },
    { id: 'add' as TabId, label: 'Add Staff', icon: Plus },
    ...(profileId ? [{ id: 'profile' as TabId, label: 'Profile', icon: Eye }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <UserCheck size={22} className="text-brand" /> Staff Management
        </h1>
        <p className="text-xs text-mute mt-1">
          Manage teachers, support staff, and drivers across all divisions.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-beige">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer -mb-px ${
              activeTab === id
                ? 'border-brand text-brand'
                : 'border-transparent text-mute hover:text-label hover:border-[#dcd5c8]'
            }`}>
            <Icon size={14} /> <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoadingUser ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          {activeTab === 'directory' && <DirectoryTab allowedUnits={allowedUnits} currentUser={currentUser} onViewProfile={openProfile} />}
          {activeTab === 'add' && <AddStaffTab allowedUnits={allowedUnits} currentUser={currentUser} onSuccess={() => setActiveTab('directory')} />}
          {activeTab === 'profile' && profileId && <ProfileTab staffId={profileId} onBack={closeProfile} />}
        </>
      )}
    </div>
  );
}
