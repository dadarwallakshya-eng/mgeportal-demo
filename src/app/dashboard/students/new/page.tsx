'use client';

/**
 * @file src/app/dashboard/students/new/page.tsx
 * @description Student registration form wizard.
 *
 * DESIGN DECISIONS:
 * - Multi-section structured layout (Personal Details, Contact Info, Enrollment & Guardians).
 * - Full client-side validation using the same schema constraint rules as the backend.
 * - Restricts division targets to only user's permitted units (accessUnits).
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Save, Check, Bus, Car, MapPin, IndianRupee, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { getClassesForUnit, FEE_ACADEMIC_YEAR } from '@/lib/classes';
import { FileUploader } from '@/components/ui/file-uploader';

interface FeeComponentPreview {
  name: string;
  amount: string | number;
}

const UNIT_LABELS: Record<string, string> = {
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
};

export default function RegisterStudentPage() {
  const router = useRouter();
  
  // State
  const [isLoading, setIsLoading] = useState(false);
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  // Form values
  const [unitId, setUnitId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nameHindi, setNameHindi] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('MALE');
  const [category, setCategory] = useState('GENERAL');
  
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('-');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);
  // Set once the API returns the auto-generated permanent ID (e.g. "MES2026-00001").
  const [successAdmissionNo, setSuccessAdmissionNo] = useState<string | null>(null);

  // Class fee preview (auto-loaded from the fee chart when a class is picked)
  const [feePreview, setFeePreview] = useState<FeeComponentPreview[] | null>(null);
  const [feePreviewLoading, setFeePreviewLoading] = useState(false);
  
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [phone, setPhone] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [address, setAddress] = useState('');

  // Documents and previous dues
  const [photoUrl, setPhotoUrl] = useState('');
  const [aadharDocUrl, setAadharDocUrl] = useState('');
  const [aadharNo, setAadharNo] = useState('');
  const [parentAadharDocUrl, setParentAadharDocUrl] = useState('');
  const [previousDues, setPreviousDues] = useState('');
  const [srNo, setSrNo] = useState('');

  // Transport
  const [transportMode, setTransportMode] = useState<'OWN_VEHICLE' | 'BUS_SERVICE'>('OWN_VEHICLE');
  const [busStationId, setBusStationId] = useState('');
  const [stations, setStations] = useState<{ id: string; stationNo: number; name: string; perMonth: string; perYear: string }[]>([]);

  // Role and Discount states
  const [userRole, setUserRole] = useState('');
  const [tuitionDiscountPercent, setTuitionDiscountPercent] = useState('');
  const [transportDiscountPercent, setTransportDiscountPercent] = useState('');
  const [isFromSchool, setIsFromSchool] = useState(false);

  // Fetch access units
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.user.role || '');
          const allowed = data.user.accessUnits.filter((u: string) => u !== 'transport' && u !== 'hostel');
          setAllowedUnits(allowed);
          if (allowed.length > 0) {
            const savedUnit = localStorage.getItem('mge-active-unit');
            if (savedUnit && allowed.includes(savedUnit)) {
              setUnitId(savedUnit);
            } else {
              setUnitId(allowed[0]);
            }
          }
        }
      } catch (err) {
        console.error('Failed to get user payload:', err);
      }
    }
    fetchUser();
  }, []);

  // Force gender to FEMALE if college is selected
  useEffect(() => {
    if (unitId === 'college') {
      setGender('FEMALE');
    } else {
      setIsFromSchool(false);
    }
  }, [unitId]);

  // Fetch bus stations for the transport dropdown
  useEffect(() => {
    async function fetchStations() {
      try {
        const res = await fetch('/api/transport/stations');
        if (res.ok) {
          const data = await res.json();
          setStations(data.stations || []);
        }
      } catch (err) {
        console.error('Failed to load stations:', err);
      }
    }
    fetchStations();
  }, []);

  // Classes available for the selected division (medium-aware)
  const availableClasses = getClassesForUnit(unitId);

  // When the division changes, default the class to the first one offered there
  useEffect(() => {
    const classes = getClassesForUnit(unitId);
    if (classes.length > 0 && !classes.some((c) => c.key === classId)) {
      setClassId(classes[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  // Auto-load the class fee from the seeded fee chart whenever unit+class change
  useEffect(() => {
    if (!unitId || !classId) {
      setFeePreview(null);
      return;
    }
    let cancelled = false;
    setFeePreviewLoading(true);
    const params = new URLSearchParams({ unit: unitId, class: classId, year: FEE_ACADEMIC_YEAR });
    fetch(`/api/fees/structures?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const structure = (data.structures || [])[0];
        if (structure && structure.components) {
          setFeePreview(
            structure.components
              .filter((c: FeeComponentPreview) => c.name !== 'Transport Fee' && c.name !== 'Previous Outstanding Fees')
              .map((c: FeeComponentPreview) => ({ name: c.name, amount: c.amount }))
          );
        } else {
          setFeePreview([]); // structure not set up (e.g. college)
        }
      })
      .catch(() => { if (!cancelled) setFeePreview([]); })
      .finally(() => { if (!cancelled) setFeePreviewLoading(false); });
    return () => { cancelled = true; };
  }, [unitId, classId]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Client-side validations
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = 'First name is required';
    if (!dateOfBirth) errors.dateOfBirth = 'Date of birth is required';
    if (!admissionDate) errors.admissionDate = 'Admission date is required';

    // Concession / Discount validations
    const tPct = tuitionDiscountPercent.trim() ? Number(tuitionDiscountPercent.trim()) : 0;
    if (tuitionDiscountPercent.trim()) {
      if (isNaN(tPct) || tPct < 0 || tPct > 100) {
        errors.tuitionDiscountPercent = 'Must be a number between 0 and 100';
      } else {
        const cap = ['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole) ? 100 : 0;
        if (tPct > cap) {
          errors.tuitionDiscountPercent = `Your role can grant at most ${cap}% Tuition discount`;
        }
      }
    }

    const trPct = transportDiscountPercent.trim() ? Number(transportDiscountPercent.trim()) : 0;
    if (transportDiscountPercent.trim()) {
      if (isNaN(trPct) || trPct < 0 || trPct > 100) {
        errors.transportDiscountPercent = 'Must be a number between 0 and 100';
      } else {
        const cap = ['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole) ? 100 : 0;
        if (trPct > cap) {
          errors.transportDiscountPercent = `Your role is not allowed to set a Transport discount`;
        }
      }
    }
    
    // Photo + Aadhar document are MANDATORY for registration.
    // URL check is intentionally permissive — any http(s) link is fine, including
    // Google Drive / Dropbox share URLs with query strings (?usp=sharing etc.).
    const looksLikeUrl = (s: string) => {
      const trimmed = s.trim();
      if (!trimmed) return true;
      return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/') || trimmed.startsWith('temp_');
    };
    if (photoUrl.trim() && !looksLikeUrl(photoUrl)) {
      errors.photoUrl = 'Must start with http:// or https://';
    }
    if (aadharDocUrl.trim() && !looksLikeUrl(aadharDocUrl)) {
      errors.aadharDocUrl = 'Must start with http:// or https://';
    }
    if (aadharNo.trim() && !/^\d{12}$/.test(aadharNo.replace(/\s|-/g, ''))) {
      errors.aadharNo = 'Aadhar number must be exactly 12 digits';
    }
    if (phone.trim() && !/^\d{10}$/.test(phone.replace(/\s|-/g, ''))) {
      errors.phone = 'Phone number must be exactly 10 digits';
    }
    if (guardianPhone.trim() && !/^\d{10}$/.test(guardianPhone.replace(/\s|-/g, ''))) {
      errors.guardianPhone = 'Parent phone number must be exactly 10 digits';
    }
    if (previousDues.trim() && isNaN(Number(previousDues.trim()))) {
      errors.previousDues = 'Must be a valid number';
    } else if (previousDues.trim() && Number(previousDues.trim()) < 0) {
      errors.previousDues = 'Outstanding fees cannot be negative';
    }
    if (transportMode === 'BUS_SERVICE' && !busStationId) {
      errors.busStationId = 'Select a pickup station for bus service';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      // Build a specific banner listing what's actually wrong so the operator
      // doesn't have to hunt for the red field outline.
      const summary = Object.values(errors).join(' · ');
      setError(`Can't save yet — ${summary}`);
      // Scroll to top so the banner is immediately visible regardless of where they were on the form.
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unitId,
          firstName,
          lastName,
          nameHindi: nameHindi.trim() || undefined,
          dateOfBirth,
          gender,
          category,
          // admissionNumber is auto-generated server-side — never sent from the client.
          classId,
          sectionId,
          admissionDate,
          srNo: srNo.trim() || undefined,
          fatherName: fatherName.trim() || undefined,
          motherName: motherName.trim() || undefined,
          phone: phone.trim() || undefined,
          guardianPhone: guardianPhone.trim() || undefined,
          address: address.trim() || undefined,
          photoUrl: photoUrl.trim() || undefined,
          aadharDocUrl: aadharDocUrl.trim() || undefined,
          aadharNo: aadharNo.trim() || undefined,
          parentAadharDocUrl: parentAadharDocUrl.trim() || undefined,
          previousDues: previousDues.trim() ? Number(previousDues.trim()) : 0,
          transportMode,
          busStationId: transportMode === 'BUS_SERVICE' ? busStationId : null,
          tuitionDiscountPercent: tuitionDiscountPercent.trim() ? Number(tuitionDiscountPercent.trim()) : 0,
          transportDiscountPercent: transportDiscountPercent.trim() ? Number(transportDiscountPercent.trim()) : 0,
          isFromSchool,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'VALIDATION_ERROR' && data.details) {
          const validationErrors: Record<string, string> = {};
          data.details.forEach((d: any) => {
            validationErrors[d.field] = d.message;
          });
          setFieldErrors(validationErrors);
          throw new Error('Input validation failed on server.');
        }
        throw new Error(data.error || 'Failed to create student profile.');
      }

      // Success — surface the auto-generated Admission ID before navigating.
      const newAdmissionNo: string | undefined = data?.student?.admissionNo;
      if (newAdmissionNo) {
        setSuccessAdmissionNo(newAdmissionNo);
        setIsLoading(false);
      } else {
        // Defensive: if for any reason the ID isn't in the response, just go to the directory.
        router.push('/dashboard/students');
      }
    } catch (err: any) {
      setError(err.message || 'Connection error.');
      setIsLoading(false);
    }
  };

  // ── Post-save success view ─────────────────────────────────────────────
  // Show the freshly-allocated Admission ID prominently so the operator can
  // jot it down / copy it for the ID card before navigating away.
  if (successAdmissionNo) {
    const studentFullName = `${firstName} ${lastName}`.trim();
    return (
      <div className="max-w-2xl mx-auto py-8">
        <Card className="border-emerald-200 bg-emerald-50 text-ink shadow-md">
          <CardHeader className="text-center pt-8 pb-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Check size={28} className="text-emerald-700" />
            </div>
            <CardTitle className="text-xl font-bold text-ink">Student registered successfully</CardTitle>
            <CardDescription className="text-mute text-xs mt-1">
              {studentFullName ? <><span className="font-semibold text-label">{studentFullName}</span> &middot; </> : null}
              Admission complete &mdash; this is the student&apos;s permanent ID.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="rounded-xl border border-brand/30 bg-paper p-5 text-center">
              <p className="text-[10px] uppercase tracking-wider font-bold text-brand/80">
                Admission ID
              </p>
              <p className="text-3xl font-mono font-extrabold text-brand mt-1 tracking-tight">
                {successAdmissionNo}
              </p>
              <p className="text-mute text-[11px] mt-2">
                Use this on the ID card and for every lookup (hostel, fees, transport).
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-center pb-8 pt-4">
            <Button
              onClick={() => router.push('/dashboard/students')}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer"
            >
              View Directory
            </Button>
            <Button
              onClick={() => {
                // Reset for the next admission. Keep unit/class for convenience.
                setSuccessAdmissionNo(null);
                setFirstName(''); setLastName(''); setNameHindi('');
                setDateOfBirth(''); setFatherName(''); setMotherName('');
                setPhone(''); setGuardianPhone(''); setAddress('');
                setPhotoUrl(''); setAadharDocUrl(''); setAadharNo('');
                setParentAadharDocUrl('');
                setPreviousDues(''); setBusStationId('');
                setTuitionDiscountPercent(''); setTransportDiscountPercent('');
                setError(null); setFieldErrors({});
              }}
              variant="outline"
              className="border-brand/30 text-brand hover:bg-brand/5 font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer"
            >
              Add Another Student
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button link */}
      <Link
        href="/dashboard/students"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-label font-semibold transition-colors select-none"
      >
        <ArrowLeft size={14} />
        <span>Back to Directory</span>
      </Link>

      <div className="max-w-3xl">
        <form onSubmit={handleRegister}>
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader>
              <CardTitle className="text-xl font-bold tracking-tight text-ink">
                Register New Student
              </CardTitle>
              <CardDescription className="text-mute text-xs mt-1">
                Enter demographic and enrollment details to initialize a student account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Error Callout */}
              {error && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                  <AlertCircle size={16} className="shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {/* SECTION 1: School & Division */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-2">
                  1. Target Division
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="unitId" className="text-label text-xs font-semibold">Division</Label>
                    <select
                      id="unitId"
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                      disabled={isLoading}
                      className="w-full bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2.5 focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      {allowedUnits.map((uCode) => (
                        <option key={uCode} value={uCode}>
                          {UNIT_LABELS[uCode] || uCode.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Personal Details */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-2">
                  2. Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-label text-xs font-semibold">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      disabled={isLoading}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={`border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand ${
                        fieldErrors.firstName ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.firstName && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.firstName}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-label text-xs font-semibold">Last Name (Optional)</Label>
                    <Input
                      id="lastName"
                      type="text"
                      disabled={isLoading}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={`border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand ${
                        fieldErrors.lastName ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.lastName && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.lastName}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nameHindi" className="text-label text-xs font-semibold">Hindi Name (Optional)</Label>
                    <Input
                      id="nameHindi"
                      type="text"
                      placeholder="आरव गुप्ता"
                      disabled={isLoading}
                      value={nameHindi}
                      onChange={(e) => setNameHindi(e.target.value)}
                      className="border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="dateOfBirth" className="text-label text-xs font-semibold">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      disabled={isLoading}
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className={`border-beige bg-field text-ink focus-visible:ring-brand ${
                        fieldErrors.dateOfBirth ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.dateOfBirth && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.dateOfBirth}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="gender" className="text-label text-xs font-semibold">Gender</Label>
                    <select
                      id="gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      disabled={isLoading || unitId === 'college'}
                      className="w-full bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2.5 focus:ring-1 focus:ring-brand focus:outline-none disabled:opacity-85"
                    >
                      {unitId === 'college' ? (
                        <option value="FEMALE">Female (Girls College Only)</option>
                      ) : (
                        <>
                          <option value="MALE">Male</option>
                          <option value="FEMALE">Female</option>
                          <option value="OTHER">Other</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="category" className="text-label text-xs font-semibold">Category</Label>
                    <select
                      id="category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      disabled={isLoading}
                      className="w-full bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2.5 focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      <option value="GENERAL">General</option>
                      <option value="OBC">OBC</option>
                      <option value="SC">SC</option>
                      <option value="ST">ST</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="aadharNo" className="text-label text-xs font-semibold">Aadhar Number (Manual)</Label>
                    <Input
                      id="aadharNo"
                      type="text"
                      placeholder="e.g. 1234 5678 9012"
                      disabled={isLoading}
                      value={aadharNo}
                      onChange={(e) => setAadharNo(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      className={`border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand ${
                        fieldErrors.aadharNo ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.aadharNo && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.aadharNo}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="srNo" className="text-label text-xs font-semibold">Sr. Number</Label>
                    <Input
                      id="srNo"
                      type="text"
                      placeholder="e.g. SR-2026-100"
                      disabled={isLoading}
                      value={srNo}
                      onChange={(e) => setSrNo(e.target.value)}
                      className={`border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand ${
                        fieldErrors.srNo ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.srNo && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.srNo}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 3: Academic / Enrollment */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-2">
                  3. Academic & Enrollment Details
                </h3>
                {/* Auto-generated Admission ID preview — the system picks the next available number.
                    Format: <PREFIX><SESSION_YEAR>-<NNNNN>  (e.g. MES2026-00001). */}
                {(() => {
                  const prefix = unitId === 'english' ? 'MES'
                    : unitId === 'hindi' ? 'NMS'
                    : unitId === 'college' ? 'MGC'
                    : '???';
                  // Mirror server-side getSessionYear() (April-1 boundary).
                  const d = admissionDate ? new Date(admissionDate + 'T00:00:00Z') : null;
                  const sessionYear = d
                    ? (d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1)
                    : new Date().getUTCFullYear();
                  return (
                    <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 flex items-center gap-3">
                      <GraduationCap size={18} className="text-brand shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-brand/80">
                          Admission ID (auto-generated on save)
                        </p>
                        <p className="text-sm font-mono font-bold text-brand mt-0.5">
                          {prefix}{sessionYear}-<span className="opacity-50">XXXXX</span>
                        </p>
                        <p className="text-mute text-[10px] font-normal leading-normal mt-1">
                          Permanent. Same ID stays with the student through every class promotion — use it on ID cards and for any lookup.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="admissionDate" className="text-label text-xs font-semibold">Admission Date</Label>
                    <Input
                      id="admissionDate"
                      type="date"
                      disabled={isLoading}
                      value={admissionDate}
                      onChange={(e) => setAdmissionDate(e.target.value)}
                      className={`border-beige bg-field text-ink focus-visible:ring-brand ${
                        fieldErrors.admissionDate ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.admissionDate && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.admissionDate}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="classId" className="text-label text-xs font-semibold">Class</Label>
                    <select
                      id="classId"
                      value={classId}
                      onChange={(e) => setClassId(e.target.value)}
                      disabled={isLoading || availableClasses.length === 0}
                      className="w-full bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2.5 focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      {availableClasses.length === 0 ? (
                        <option value="">Select a division first</option>
                      ) : (
                        availableClasses.map((c) => (
                          <option key={c.key} value={c.key}>{c.label}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Auto fee preview from the fee chart */}
                <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <GraduationCap size={14} className="text-brand" />
                    <span className="text-xs font-bold uppercase tracking-wider text-brand">
                      Class Fees ({FEE_ACADEMIC_YEAR})
                    </span>
                  </div>
                  {feePreviewLoading ? (
                    <div className="flex items-center gap-2 text-xs text-mute py-2">
                      <Loader2 size={13} className="animate-spin" /> Loading fee chart…
                    </div>
                  ) : feePreview && feePreview.length > 0 ? (
                    <div className="space-y-1.5">
                      {feePreview.map((c) => (
                        <div key={c.name} className="flex justify-between text-xs">
                          <span className="text-mute">{c.name}</span>
                          <span className="font-mono font-semibold text-ink">
                            ₹{Number(c.amount).toLocaleString('en-IN')}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs border-t border-brand/20 pt-2 mt-1">
                        <span className="text-label font-bold uppercase tracking-wider">Total Tuition Due</span>
                        <span className="font-mono font-extrabold text-brand">
                          ₹{feePreview.reduce((s, c) => s + Number(c.amount), 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <p className="text-3xs text-mute pt-1">
                        Auto-added to the student&apos;s fee ledger on registration (separate from bus fare).
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-mute py-1">
                      No fee structure set for this class yet.{' '}
                      {unitId === 'college'
                        ? 'Set college fees in the Fees Engine — registration still works.'
                        : 'You can add one in the Fees Engine.'}
                    </p>
                  )}
                </div>
              </div>

              {/* SECTION 4: Contact & Guardians */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-2">
                  4. Contact & Parent Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fatherName" className="text-label text-xs font-semibold">Father's Name</Label>
                    <Input
                      id="fatherName"
                      type="text"
                      disabled={isLoading}
                      value={fatherName}
                      onChange={(e) => setFatherName(e.target.value)}
                      className="border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="motherName" className="text-label text-xs font-semibold">Mother's Name</Label>
                    <Input
                      id="motherName"
                      type="text"
                      disabled={isLoading}
                      value={motherName}
                      onChange={(e) => setMotherName(e.target.value)}
                      className="border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="phone" className="text-label text-xs font-semibold">Contact Phone (Self)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      disabled={isLoading}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand ${
                        fieldErrors.phone ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.phone && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.phone}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="guardianPhone" className="text-label text-xs font-semibold">Parent Phone (Alternative)</Label>
                    <Input
                      id="guardianPhone"
                      type="tel"
                      disabled={isLoading}
                      value={guardianPhone}
                      onChange={(e) => setGuardianPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className={`border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand ${
                        fieldErrors.guardianPhone ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.guardianPhone && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.guardianPhone}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="address" className="text-label text-xs font-semibold">Residential Address</Label>
                    <Input
                      id="address"
                      type="text"
                      disabled={isLoading}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 5: Documents & Outstanding Fees */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-2">
                  5. Documents & Outstanding Fees
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <FileUploader
                      label="Student Photo"
                      pathParts={[unitId || 'General', `Class_${classId || 'Unassigned'}`, 'Student_Photos']}
                      onUploadSuccess={(url) => setPhotoUrl(url)}
                      value={photoUrl}
                      acceptImagesOnly={true}
                    />
                    {fieldErrors.photoUrl && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.photoUrl}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="previousDues" className="text-label text-xs font-semibold">Previous Outstanding Fees (INR)</Label>
                    <Input
                      id="previousDues"
                      type="number"
                      placeholder="e.g. 2500"
                      disabled={isLoading}
                      value={previousDues}
                      onChange={(e) => setPreviousDues(e.target.value)}
                      className={`border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand ${
                        fieldErrors.previousDues ? 'border-red-950 focus-visible:ring-red-500' : ''
                      }`}
                    />
                    {fieldErrors.previousDues && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.previousDues}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <FileUploader
                      label="Student Aadhar (Optional)"
                      pathParts={[unitId || 'General', `Class_${classId || 'Unassigned'}`, 'Student_Aadhar']}
                      onUploadSuccess={(url) => setAadharDocUrl(url)}
                      value={aadharDocUrl}
                    />
                    {fieldErrors.aadharDocUrl && (
                      <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.aadharDocUrl}</p>
                    )}
                  </div>

                </div>
              </div>

              {/* SECTION 5.5: Discounts & Concessions */}
              {['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'].includes(userRole) && (
                <div className="space-y-4 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-2">
                    5.5. Fee Discounts &amp; Concessions (Optional)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {unitId === 'college' && (
                      <div className="md:col-span-2 flex items-center gap-2.5 p-3 rounded-lg border border-brand/20 bg-brand/5 mb-1.5">
                        <input
                          id="isFromSchool"
                          type="checkbox"
                          checked={isFromSchool}
                          onChange={(e) => {
                            setIsFromSchool(e.target.checked);
                            if (e.target.checked) {
                              setTuitionDiscountPercent('50');
                            } else {
                              setTuitionDiscountPercent('0');
                            }
                          }}
                          disabled={isLoading}
                          className="h-4 w-4 rounded border-beige text-brand focus:ring-brand cursor-pointer"
                        />
                        <Label htmlFor="isFromSchool" className="text-xs font-semibold text-brand cursor-pointer select-none flex flex-col">
                          <span>Studied at MGE School previously (50% Tuition Discount)</span>
                          <span className="text-[10px] text-mute font-normal mt-0.5">पूर्व में एम.जी.ई. स्कूल से अध्ययनरत रही हैं (50% शिक्षण शुल्क छूट)</span>
                        </Label>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="tuitionDiscountPercent" className="text-label text-xs font-semibold">
                        Tuition Fee Discount (%)
                      </Label>
                      <div className="relative">
                        <Input
                          id="tuitionDiscountPercent"
                          type="number"
                          min="0"
                          max={userRole === 'DIRECTOR' ? 100 : 20}
                          placeholder="e.g. 10"
                          disabled={isLoading}
                          value={tuitionDiscountPercent}
                          onChange={(e) => setTuitionDiscountPercent(e.target.value)}
                          className={`pr-7 border-beige bg-field text-ink focus-visible:ring-brand font-mono ${
                            fieldErrors.tuitionDiscountPercent ? 'border-red-950 focus-visible:ring-red-500' : ''
                          }`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mute text-xs">%</span>
                      </div>
                      <p className="text-3xs text-mute">
                        Cap: {userRole === 'DIRECTOR' ? '100%' : '20% for Tuition'}. Applied to Tuition Fee component.
                      </p>
                      {fieldErrors.tuitionDiscountPercent && (
                        <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.tuitionDiscountPercent}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="transportDiscountPercent" className="text-label text-xs font-semibold">
                        Transport Fee Discount (%)
                      </Label>
                      <div className="relative">
                        <Input
                          id="transportDiscountPercent"
                          type="number"
                          min="0"
                          max="100"
                          placeholder="e.g. 50"
                          disabled={isLoading}
                          value={transportDiscountPercent}
                          onChange={(e) => setTransportDiscountPercent(e.target.value)}
                          className={`pr-7 border-beige bg-field text-ink focus-visible:ring-brand font-mono ${
                            fieldErrors.transportDiscountPercent ? 'border-red-950 focus-visible:ring-red-500' : ''
                          }`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mute text-xs">%</span>
                      </div>
                      <p className="text-3xs text-mute">
                        Cap: 100%. Applied to Transport Fee component (if bus service is active).
                      </p>
                      {fieldErrors.transportDiscountPercent && (
                        <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.transportDiscountPercent}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 6: Transport & Bus Fare */}
              <div className="space-y-4 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-mute border-b border-beige pb-2">
                  6. Transport &amp; Bus Fare
                </h3>

                {/* Mode toggle: Own Vehicle vs Bus Service */}
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <button
                    type="button"
                    onClick={() => { setTransportMode('OWN_VEHICLE'); setBusStationId(''); }}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      transportMode === 'OWN_VEHICLE'
                        ? 'bg-brand/10 border-brand text-brand'
                        : 'bg-cream border-beige text-mute hover:border-[#c9c2b3]'
                    }`}
                  >
                    <Car size={18} className="shrink-0" />
                    <div>
                      <p className="text-xs font-bold">Own Vehicle</p>
                      <p className="text-3xs opacity-70">No bus fare</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportMode('BUS_SERVICE')}
                    className={`flex items-center gap-2.5 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      transportMode === 'BUS_SERVICE'
                        ? 'bg-brand/10 border-brand text-brand'
                        : 'bg-cream border-beige text-mute hover:border-[#c9c2b3]'
                    }`}
                  >
                    <Bus size={18} className="shrink-0" />
                    <div>
                      <p className="text-xs font-bold">School Bus</p>
                      <p className="text-3xs opacity-70">Fare by station</p>
                    </div>
                  </button>
                </div>

                {/* Station picker (only for bus service) */}
                {transportMode === 'BUS_SERVICE' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="busStationId" className="text-label text-xs font-semibold flex items-center gap-1.5">
                        <MapPin size={12} /> Pickup Station
                      </Label>
                      <select
                        id="busStationId"
                        value={busStationId}
                        onChange={(e) => setBusStationId(e.target.value)}
                        disabled={isLoading}
                        className={`w-full bg-field border text-ink text-xs rounded-lg p-2.5 focus:ring-1 focus:ring-brand focus:outline-none ${
                          fieldErrors.busStationId ? 'border-red-950' : 'border-beige'
                        }`}
                      >
                        <option value="">Select a station...</option>
                        {stations.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.stationNo}. {s.name} — ₹{Number(s.perYear).toLocaleString('en-IN')}/yr
                          </option>
                        ))}
                      </select>
                      {fieldErrors.busStationId && (
                        <p className="text-red-600 text-3xs font-medium mt-1">{fieldErrors.busStationId}</p>
                      )}
                    </div>

                    {/* Auto-calculated fare preview */}
                    <div className="space-y-1.5">
                      <Label className="text-label text-xs font-semibold flex items-center gap-1.5">
                        <IndianRupee size={12} /> Annual Bus Fare (auto)
                      </Label>
                      {(() => {
                        const sel = stations.find((s) => s.id === busStationId);
                        return (
                          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-brand/20 bg-brand/5">
                            <span className="text-lg font-extrabold text-brand">
                              {sel ? `₹${Number(sel.perYear).toLocaleString('en-IN')}` : '₹0'}
                            </span>
                            {sel && (
                              <span className="text-2xs text-mute">
                                (₹{Number(sel.perYear).toLocaleString('en-IN')})
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-3xs text-mute">Added as a separate &quot;Transport Fee&quot; in the student&apos;s ledger.</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-3 border-t border-beige pt-6 pb-6">
              <Link href="/dashboard/students">
                <Button
                  type="button"
                  disabled={isLoading}
                  className="border border-beige bg-field text-mute hover:text-ink h-10 px-4 rounded-lg text-xs cursor-pointer"
                >
                  Cancel
                </Button>
              </Link>
              
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-10 px-4 gap-2 rounded-lg cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving profile...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Student</span>
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
