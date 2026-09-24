'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  HelpCircle, 
  Check, 
  AlertCircle, 
  Play, 
  Grid,
  RefreshCw,
  Info,
  Download
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getClassesForUnit } from '@/lib/classes';

const UNIT_LABELS: Record<string, string> = {
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
};

interface PreviewRow {
  firstName: string;
  lastName: string;
  nameHindi: string;
  dob: string;
  dobOriginal: string;
  gender: string;
  genderOriginal: string;
  category: string;
  categoryOriginal: string;
  fatherName: string;
  motherName: string;
  phone: string;
  fatherPhone: string;
  srNo: string;
  aadharNo: string;
  address: string;
  previousDues: string;
  admissionDate: string;
  admissionDateOriginal: string;
  isValid: boolean;
  error?: string;
}

export default function StudentBulkImportPage() {
  const router = useRouter();

  const downloadTemplate = () => {
    const csvContent = [
      'S.No.,SR No.,First Name *,Last Name,Name in Hindi,Gender * (Male/Female/Other),Date of Birth * (YYYY-MM-DD),Father Name *,Mother Name,Father Phone * (10 Digits),Student Phone (10 Digits),Category (GENERAL/OBC/SC/ST),Aadhar Number (12 Digits),Address,Admission Date (YYYY-MM-DD),Previous Outstanding Fees (INR)',
      '1,2446,AAIDA RANGREZ,,Female,2011-11-03,KASIM ALI,AABIDA RANGREZ,9782452486,9588844588,OBC,,HOD KA DARWAJA GULAB BADI KE PASS K.CITY,01.04.2026,',
      '2,4106,AARYA PAREEK,,Female,2012-11-03,PRADEEP PAREEK,PRAMILA,7023798427,7851085587,GENERAL,,KHARIYA,,'
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'mge_student_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Navigation & Access
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [unitId, setUnitId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('-');
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().split('T')[0]);

  // Parsing & File Roster
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // Column Mappings
  const [mapFirstName, setMapFirstName] = useState('');
  const [mapLastName, setMapLastName] = useState('');
  const [mapNameHindi, setMapNameHindi] = useState('');
  const [mapDob, setMapDob] = useState('');
  const [mapGender, setMapGender] = useState('');
  const [mapCategory, setMapCategory] = useState('');
  const [mapFatherName, setMapFatherName] = useState('');
  const [mapMotherName, setMapMotherName] = useState('');
  const [mapPhone, setMapPhone] = useState('');
  const [mapFatherPhone, setMapFatherPhone] = useState('');
  const [mapSrNo, setMapSrNo] = useState('');
  const [mapAadharNo, setMapAadharNo] = useState('');
  const [mapAddress, setMapAddress] = useState('');
  const [mapAdmissionDate, setMapAdmissionDate] = useState('');
  const [mapPreviousDues, setMapPreviousDues] = useState('');

  // Roster Normalization
  const [normalizedRoster, setNormalizedRoster] = useState<PreviewRow[]>([]);
  
  // Execution states
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInvalidOnly, setShowInvalidOnly] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successReport, setSuccessReport] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load allowed divisions
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
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
        console.error('Failed to retrieve user payload:', err);
      }
    }
    fetchUser();
  }, []);

  const availableClasses = getClassesForUnit(unitId);

  // Simple, robust CSV parse logic
  const parseCSV = (text: string): string[][] => {
    const lines = [];
    let row = [''];
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          row[row.length - 1] += '"';
          i++; // skip escape quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        row.push('');
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
        lines.push(row.map(cell => cell.trim()));
        row = [''];
      } else {
        row[row.length - 1] += char;
      }
    }
    if (row.length > 1 || row[0] !== '') {
      lines.push(row.map(cell => cell.trim()));
    }
    return lines.filter(r => r.some(cell => cell !== '')); // Remove fully empty rows
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setSuccessReport(null);
    setGlobalError(null);
    setCsvRows([]);
    setHeaders([]);

    if (file.name.endsWith('.xlsx')) {
      setIsProcessing(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/students/parse-excel', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to parse Excel file.');
        }
        setHeaders(data.headers || []);
        setCsvRows(data.rows || []);
        autoMapColumns(data.headers || []);
      } catch (err: any) {
        console.error('Failed to parse Excel file:', err);
        setGlobalError(err.message || 'Error parsing Excel sheet.');
      } finally {
        setIsProcessing(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setFileContent(text);
        processCsvText(text);
      };
      reader.readAsText(file);
    }
  };

  const processCsvText = (text: string) => {
    const rows = parseCSV(text);
    if (rows.length < 2) {
      setGlobalError('Uploaded CSV must contain at least a header row and one student data row.');
      return;
    }

    const fileHeaders = rows[0];
    setHeaders(fileHeaders);
    setCsvRows(rows.slice(1));

    // Auto-map headers
    autoMapColumns(fileHeaders);
  };

  const autoMapColumns = (fileHeaders: string[]) => {
    const findHeader = (patterns: string[]): string => {
      const match = fileHeaders.find(h => {
        const lower = h.toLowerCase().trim();
        return patterns.some(p => lower.includes(p));
      });
      return match || '';
    };

    setMapFirstName(findHeader(['first name', 'student name', 'name', 'first_name', 'fullname']));
    setMapLastName(findHeader(['last name', 'surname', 'last_name']));
    setMapNameHindi(findHeader(['hindi name', 'name in hindi', 'namehindi']));
    setMapDob(findHeader(['dob', 'birth', 'date of birth', 'd.o.b', 'birthdate']));
    setMapGender(findHeader(['gender', 'sex', 'gender', 'm/f']));
    setMapCategory(findHeader(['category', 'caste', 'reservation', 'category']));
    setMapFatherName(findHeader(['father', 'father name', 'father\'s name', 'guardian']));
    setMapMotherName(findHeader(['mother', 'mother name', 'mother\'s name']));
    setMapFatherPhone(findHeader(['father phone', 'guardian phone', 'phone *', 'father\'s mobile']));
    setMapPhone(findHeader(['student phone', 'phone', 'mobile', 'contact', 'mobile no', 'phone no']));
    setMapSrNo(findHeader(['sr no', 'sr_no', 's.r. no', 'srnumber', 'admission no']));
    setMapAadharNo(findHeader(['aadhar', 'aadhar number', 'aadhar no', 'uid']));
    setMapAddress(findHeader(['address', 'residence', 'location']));
    setMapAdmissionDate(findHeader(['admission date', 'date of admission', 'admission_date', 'date_of_admission']));
    setMapPreviousDues(findHeader(['dues', 'outstanding', 'previous dues', 'previous outstanding']));
  };

  // Normalization Helpers
  const parseDob = (str: string): string => {
    if (!str) return '';
    const val = str.trim();

    // Check for Excel Date Serial Number (e.g. 40850.0)
    if (/^\d+(\.\d+)?$/.test(val)) {
      const serial = parseFloat(val);
      const date = new Date((serial - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }

    // 1. Check DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const dmyRegex = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/;
    const dmyMatch = val.match(dmyRegex);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    // 2. Check YYYY-MM-DD
    const ymdRegex = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/;
    const ymdMatch = val.match(ymdRegex);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Fallback: parse standard JS date
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch {}

    return '';
  };

  const normalizeGender = (str: string): string => {
    if (!str) return 'MALE';
    const s = str.trim().toUpperCase();
    if (s.startsWith('M')) return 'MALE';
    if (s.startsWith('F')) return 'FEMALE';
    return 'OTHER';
  };

  const normalizeCategory = (str: string): string => {
    if (!str) return 'GENERAL';
    const s = str.trim().toUpperCase();
    if (s === 'GEN' || s === 'GENERAL') return 'GENERAL';
    if (s === 'OBC') return 'OBC';
    if (s === 'SC') return 'SC';
    if (s === 'ST') return 'ST';
    return 'GENERAL';
  };

  // Run normalization whenever CSV rows or mappings change
  useEffect(() => {
    if (csvRows.length === 0) {
      setNormalizedRoster([]);
      return;
    }

    const firstIndex = headers.indexOf(mapFirstName);
    const lastIndex = headers.indexOf(mapLastName);
    const hindiIndex = headers.indexOf(mapNameHindi);
    const dobIndex = headers.indexOf(mapDob);
    const genderIndex = headers.indexOf(mapGender);
    const categoryIndex = headers.indexOf(mapCategory);
    const fatherIndex = headers.indexOf(mapFatherName);
    const motherIndex = headers.indexOf(mapMotherName);
    const phoneIndex = headers.indexOf(mapPhone);
    const fatherPhoneIndex = headers.indexOf(mapFatherPhone);
    const srIndex = headers.indexOf(mapSrNo);
    const aadharIndex = headers.indexOf(mapAadharNo);
    const addressIndex = headers.indexOf(mapAddress);
    const admissionDateIndex = headers.indexOf(mapAdmissionDate);
    const duesIndex = headers.indexOf(mapPreviousDues);

    const roster: PreviewRow[] = csvRows.map(row => {
      const dobOrig = dobIndex !== -1 ? row[dobIndex] : '';
      const genderOrig = genderIndex !== -1 ? row[genderIndex] : '';
      const catOrig = categoryIndex !== -1 ? row[categoryIndex] : '';
      const admissionDateOrig = admissionDateIndex !== -1 ? row[admissionDateIndex] : '';

      const normalizedDob = parseDob(dobOrig);
      const normalizedGender = normalizeGender(genderOrig);
      const normalizedCategory = normalizeCategory(catOrig);
      
      // Parse spreadsheet-specific admission date. Fallback to portal selected date if missing.
      const parsedAdmissionDate = parseDob(admissionDateOrig);
      const resolvedAdmissionDate = parsedAdmissionDate || admissionDate;

      const fName = firstIndex !== -1 ? row[firstIndex] : '';
      const lName = lastIndex !== -1 ? row[lastIndex] : '';
      const hName = hindiIndex !== -1 ? row[hindiIndex] : '';
      const faName = fatherIndex !== -1 ? row[fatherIndex] : '';
      const moName = motherIndex !== -1 ? row[motherIndex] : '';
      const ph = phoneIndex !== -1 ? row[phoneIndex] : '';
      const fPh = fatherPhoneIndex !== -1 ? row[fatherPhoneIndex] : '';
      const sr = srIndex !== -1 ? row[srIndex] : '';
      const aadhar = aadharIndex !== -1 ? row[aadharIndex] : '';
      const addr = addressIndex !== -1 ? row[addressIndex] : '';
      const dues = duesIndex !== -1 ? row[duesIndex] : '';

      let isValid = true;
      let error = '';

      if (!fName || !fName.trim()) {
        isValid = false;
        error = 'Student first name is missing.';
      } else if (!normalizedDob) {
        isValid = false;
        error = `Unparseable date of birth: "${dobOrig}". Format must be DD-MM-YYYY or YYYY-MM-DD.`;
      } else if (!moName || !moName.trim()) {
        isValid = false;
        error = "Mother's Name is strictly required.";
      } else if (!resolvedAdmissionDate) {
        isValid = false;
        error = "Admission date is missing and no fallback date is selected.";
      }

      return {
        firstName: fName,
        lastName: lName,
        nameHindi: hName,
        dob: normalizedDob,
        dobOriginal: dobOrig,
        gender: normalizedGender,
        genderOriginal: genderOrig,
        category: normalizedCategory,
        categoryOriginal: catOrig,
        fatherName: faName,
        motherName: moName,
        phone: ph,
        fatherPhone: fPh,
        srNo: sr,
        aadharNo: aadhar,
        address: addr,
        admissionDate: resolvedAdmissionDate,
        admissionDateOriginal: admissionDateOrig,
        previousDues: dues,
        isValid,
        error
      };
    });

    setNormalizedRoster(roster);
  }, [
    csvRows, 
    headers, 
    mapFirstName, 
    mapLastName, 
    mapNameHindi,
    mapDob, 
    mapGender, 
    mapCategory, 
    mapFatherName, 
    mapMotherName, 
    mapPhone, 
    mapFatherPhone,
    mapSrNo,
    mapAadharNo,
    mapAddress,
    mapAdmissionDate,
    mapPreviousDues,
    admissionDate
  ]);

  const handleConfirmImport = async () => {
    setGlobalError(null);
    setSuccessReport(null);

    if (!unitId || !classId) {
      setGlobalError('Please select both a division and a target class.');
      return;
    }

    const invalidRows = normalizedRoster.filter(r => !r.isValid);
    if (invalidRows.length > 0) {
      setGlobalError(`Please fix validation errors before importing. There are ${invalidRows.length} invalid rows.`);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/students/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId,
          classId,
          sectionId,
          students: normalizedRoster.map(r => ({
            firstName: r.firstName,
            lastName: r.lastName,
            nameHindi: r.nameHindi,
            dateOfBirth: r.dob,
            gender: r.gender,
            category: r.category,
            fatherName: r.fatherName,
            motherName: r.motherName,
            phone: r.phone,
            fatherPhone: r.fatherPhone,
            srNo: r.srNo,
            aadharNo: r.aadharNo,
            address: r.address,
            previousDues: r.previousDues,
            admissionDate: r.admissionDate
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete bulk import.');
      }

      setSuccessReport(data.results);
      setCsvRows([]);
      setFileName('');
      setFileContent('');
    } catch (err: any) {
      console.error('Bulk import execution failed:', err);
      setGlobalError(err.message || 'An unexpected error occurred during database import.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      {/* ── Breadcrumbs & Back ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/students"
            className="flex items-center gap-1.5 text-xs text-brand font-semibold bg-brand/5 hover:bg-brand/10 px-3 py-1.5 rounded-lg border border-brand/10 transition select-none"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Students
          </Link>
          <span className="text-mute text-xs">/</span>
          <span className="text-ink/80 text-xs font-medium">Bulk Import</span>
        </div>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-brand flex items-center gap-2">
          <Grid className="w-6 h-6 text-brand" /> Excel / CSV Student Import
        </h1>
        <p className="text-xs text-mute leading-relaxed max-w-3xl">
          Register an entire class roster instantly from an Excel sheet or CSV file. The system will automatically parse and convert formatting issues, auto-generate sequential permanent Admission IDs, and apply standard fees and previous dues for the target class.
        </p>
      </div>

      {/* ── Success Report Alert ────────────────────────────────────────────── */}
      {successReport && (
        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>Roster Import Completed Successfully / आयात सफलतापूर्वक संपन्न हुआ!</span>
          </div>
          <div className="text-xs text-emerald-700/90 leading-relaxed">
            Successfully registered <strong className="font-bold">{successReport.successCount}</strong> students into <strong>{UNIT_LABELS[unitId] || unitId} — {classId} ({sectionId})</strong>.
          </div>
          {successReport.errors.length > 0 && (
            <div className="mt-2.5 space-y-1.5 border-t border-emerald-200/50 pt-2.5">
              <span className="text-xs font-semibold text-amber-800">Errors/Warnings in batch ({successReport.failedCount} rows failed):</span>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-red-600 font-medium">
                {successReport.errors.map((e: any, idx: number) => (
                  <li key={idx}>Row {e.index} ({e.name}): {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Global Error Alert ──────────────────────────────────────────────── */}
      {globalError && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl border border-red-200 bg-red-50 text-xs text-red-700">
          <AlertCircle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1 leading-relaxed">
            <span className="font-bold text-red-800">Roster Validation Issue:</span>
            <p>{globalError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column: Config & File Roster Upload ───────────────────────── */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="border border-beige/60 bg-cream/35 shadow-xs">
            <CardHeader className="pb-3 border-b border-beige/40">
              <CardTitle className="text-xs uppercase font-bold text-brand tracking-wider">1. Select Target Class</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="text-[11px] font-bold text-ink mb-1.5 block">Target School Division</Label>
                <select
                  value={unitId}
                  onChange={(e) => {
                    setUnitId(e.target.value);
                    setClassId('');
                  }}
                  className="w-full h-9 rounded-lg border border-beige/80 bg-white px-3 font-sans text-xs text-ink focus:ring-1 focus:ring-brand outline-none"
                >
                  {allowedUnits.map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-[11px] font-bold text-ink mb-1.5 block">Class</Label>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-beige/80 bg-white px-3 font-sans text-xs text-ink focus:ring-1 focus:ring-brand outline-none"
                  >
                    <option value="">Select...</option>
                    {availableClasses.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-ink mb-1.5 block">Section</Label>
                  <select
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-beige/80 bg-white px-3 font-sans text-xs text-ink focus:ring-1 focus:ring-brand outline-none"
                  >
                    <option value="-">General (-)</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                    <option value="D">D</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-[11px] font-bold text-ink mb-1.5 block">Fallback Admission Date</Label>
                <Input
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                  className="h-9 font-sans text-xs"
                />
                <span className="text-[9px] text-mute leading-none mt-1.5 block">Used only when student row has no specific admission date.</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-beige/60 bg-cream/35 shadow-xs">
            <CardHeader className="pb-3 border-b border-beige/40">
              <CardTitle className="text-xs uppercase font-bold text-brand tracking-wider">2. Upload Roster Spreadsheet</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <Button
                onClick={downloadTemplate}
                type="button"
                className="w-full border border-brand/20 bg-brand/5 hover:bg-brand/10 text-brand font-bold text-xs h-9 gap-2 rounded-lg cursor-pointer transition-all duration-200"
              >
                <Download className="w-3.5 h-3.5" /> Download Excel Template
              </Button>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-beige hover:border-brand/40 bg-white/70 hover:bg-white rounded-xl p-6 text-center cursor-pointer transition select-none flex flex-col items-center justify-center gap-2.5"
              >
                <Upload className="w-7 h-7 text-mute hover:text-brand" />
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-brand">Choose Excel / CSV file</span>
                  <p className="text-[10px] text-mute">Supports .csv or .xlsx exports</p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {fileName && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg border border-beige bg-white text-xs text-ink">
                  <FileText className="w-4 h-4 text-brand shrink-0" />
                  <span className="font-semibold truncate flex-1">{fileName}</span>
                  <span className="text-[10px] text-mute shrink-0">({csvRows.length} records found)</span>
                </div>
              )}

              {/* Paste Textbox Alternate */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-mute uppercase block">Or Paste CSV Data Directly</span>
                <textarea
                  placeholder="Student Name, DOB, Gender, Father Name, Mother Name, Address, Admission Date&#10;Jagriti Maheshwari, 25-12-2010, Female, Kamlesh, Pramila, KHARIYA, 01.04.2026"
                  onChange={(e) => {
                    setSuccessReport(null);
                    setGlobalError(null);
                    setFileName('Pasted Data');
                    setFileContent(e.target.value);
                    processCsvText(e.target.value);
                  }}
                  value={fileContent}
                  className="w-full h-24 p-2 rounded-lg border border-beige bg-white font-mono text-[10px] focus:ring-1 focus:ring-brand outline-none resize-none"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column: Column Mappings & Normalization Preview ──────────── */}
        <div className="lg:col-span-2 space-y-6">
          {csvRows.length > 0 ? (
            <>
              {/* Column Mapping Selectors */}
              <Card className="border border-beige/60 bg-cream/35 shadow-xs">
                <CardHeader className="pb-3 border-b border-beige/40">
                  <CardTitle className="text-xs uppercase font-bold text-brand tracking-wider">3. Map Sheet Columns to Database Fields</CardTitle>
                </CardHeader>
                <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">First Name (Req)</Label>
                    <select
                      value={mapFirstName}
                      onChange={(e) => setMapFirstName(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Last Name</Label>
                    <select
                      value={mapLastName}
                      onChange={(e) => setMapLastName(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Name in Hindi</Label>
                    <select
                      value={mapNameHindi}
                      onChange={(e) => setMapNameHindi(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Date of Birth (Req)</Label>
                    <select
                      value={mapDob}
                      onChange={(e) => setMapDob(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Gender (Req)</Label>
                    <select
                      value={mapGender}
                      onChange={(e) => setMapGender(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Category</Label>
                    <select
                      value={mapCategory}
                      onChange={(e) => setMapCategory(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Father's Name</Label>
                    <select
                      value={mapFatherName}
                      onChange={(e) => setMapFatherName(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Mother's Name (Req)</Label>
                    <select
                      value={mapMotherName}
                      onChange={(e) => setMapMotherName(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Father Mobile</Label>
                    <select
                      value={mapFatherPhone}
                      onChange={(e) => setMapFatherPhone(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Student Mobile</Label>
                    <select
                      value={mapPhone}
                      onChange={(e) => setMapPhone(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">S.R. No</Label>
                    <select
                      value={mapSrNo}
                      onChange={(e) => setMapSrNo(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Aadhar No</Label>
                    <select
                      value={mapAadharNo}
                      onChange={(e) => setMapAadharNo(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Address</Label>
                    <select
                      value={mapAddress}
                      onChange={(e) => setMapAddress(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Admission Date</Label>
                    <select
                      value={mapAdmissionDate}
                      onChange={(e) => setMapAdmissionDate(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore (Use Fallback) --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold text-ink mb-1 block">Previous Dues</Label>
                    <select
                      value={mapPreviousDues}
                      onChange={(e) => setMapPreviousDues(e.target.value)}
                      className="w-full h-8 rounded-lg border border-beige/80 bg-white px-2 font-sans text-xs text-ink outline-none"
                    >
                      <option value="">-- Ignore --</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Data Validation Preview Grid */}
              <Card className="border border-beige/60 bg-cream/35 shadow-xs">
                <CardHeader className="pb-3 border-b border-beige/40 flex flex-row items-center justify-between gap-3">
                  <CardTitle className="text-xs uppercase font-bold text-brand tracking-wider">4. Data Validation Preview</CardTitle>
                  <div className="flex items-center gap-2">
                    {/* Invalid-only filter toggle */}
                    {normalizedRoster.filter(r => !r.isValid).length > 0 && (
                      <button
                        onClick={() => setShowInvalidOnly(prev => !prev)}
                        className={`text-[10px] font-semibold px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                          showInvalidOnly
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                        }`}
                      >
                        {showInvalidOnly ? '✕ Show All' : `⚠ Show ${normalizedRoster.filter(r => !r.isValid).length} Invalid Only`}
                      </button>
                    )}
                    <span className="text-[10px] text-brand bg-brand/5 px-2 py-0.5 rounded border border-brand/10 font-semibold">
                      {normalizedRoster.filter(r => r.isValid).length} / {normalizedRoster.length} Rows Valid
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 p-0">
                  <div className="overflow-x-auto">
                    <div className="max-h-[480px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-cream/90 border-b border-beige/30 text-ink font-bold">
                          <th className="p-2.5 pl-4">Status</th>
                          <th className="p-2.5">Row #</th>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">DOB (Parsed)</th>
                          <th className="p-2.5">Gender</th>
                          <th className="p-2.5">Admission Date</th>
                          <th className="p-2.5">Father Name</th>
                          <th className="p-2.5">Mother Name</th>
                          <th className="p-2.5">Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-beige/20 bg-white">
                        {(showInvalidOnly ? normalizedRoster.map((r, i) => ({ r, i })).filter(({ r }) => !r.isValid) : normalizedRoster.map((r, i) => ({ r, i }))).map(({ r, idx: _idx, i }) => (
                          <React.Fragment key={i}>
                            <tr className={r.isValid ? 'hover:bg-cream/10' : 'bg-red-50/60 hover:bg-red-50/80'}>
                              <td className="p-2.5 pl-4">
                                {r.isValid ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700">✓</span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white font-bold">!</span>
                                )}
                              </td>
                              <td className="p-2.5 font-mono text-mute text-[10px]">{i + 1}</td>
                              <td className="p-2.5 font-medium text-ink">
                                {r.firstName} {r.lastName}
                                {r.nameHindi && <span className="text-[10px] text-mute block font-sans">{r.nameHindi}</span>}
                              </td>
                              <td className="p-2.5">
                                {r.dob ? (
                                  <span className="font-mono text-brand">{r.dob}</span>
                                ) : (
                                  <span className="text-red-500 font-medium italic">Unparseable ({r.dobOriginal || 'empty'})</span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <span className="font-semibold text-ink/80">{r.gender}</span>
                              </td>
                              <td className="p-2.5">
                                <span className="font-mono font-semibold text-brand bg-brand/5 px-1.5 py-0.5 rounded border border-brand/10">
                                  {r.admissionDate}
                                </span>
                                {r.admissionDateOriginal && (
                                  <span className="text-[9px] text-mute block mt-0.5">from sheet ({r.admissionDateOriginal})</span>
                                )}
                              </td>
                              <td className="p-2.5 text-mute truncate max-w-[120px]">{r.fatherName || 'Not Set'}</td>
                              <td className="p-2.5 text-mute truncate max-w-[120px]">{r.motherName || 'Not Set'}</td>
                              <td className="p-2.5 text-mute truncate max-w-[120px]">{r.address || 'Not Set'}</td>
                            </tr>
                            {/* Inline error row */}
                            {!r.isValid && r.error && (
                              <tr className="bg-red-50/80">
                                <td colSpan={9} className="px-4 pb-2.5 pt-0">
                                  <div className="flex items-start gap-2 bg-red-100 border border-red-200 rounded-md px-3 py-2 text-[11px] text-red-700">
                                    <span className="font-bold shrink-0 mt-0.5">⚠ Error:</span>
                                    <span>{r.error}</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  <div className="px-4 py-2.5 border-t border-beige/30 text-[10px] text-mute bg-cream/10 flex justify-between items-center">
                    <span>Showing {showInvalidOnly ? normalizedRoster.filter(r => !r.isValid).length : normalizedRoster.length} of {normalizedRoster.length} entries{showInvalidOnly ? ' (invalid only)' : ''}</span>
                    {normalizedRoster.filter(r => !r.isValid).length === 0 && (
                      <span className="text-emerald-600 font-semibold">✓ All rows are valid</span>
                    )}
                  </div>

                  <div className="p-4 border-t border-beige/40 flex justify-end bg-cream/10 rounded-b-xl">
                    <Button
                      onClick={handleConfirmImport}
                      disabled={isProcessing || !classId || normalizedRoster.length === 0}
                      className="bg-brand hover:bg-[#4a2090] text-white font-bold text-xs h-10 px-5 gap-2 rounded-lg"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Importing {normalizedRoster.length} students...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" /> Confirm & Start Bulk Import
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="h-64 border-2 border-dashed border-beige/60 bg-cream/15 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-mute gap-3">
              <Grid className="w-10 h-10 text-beige shrink-0" />
              <div className="space-y-1">
                <span className="text-xs font-semibold text-ink/80">No Spreadsheet Loaded</span>
                <p className="text-[10px] leading-relaxed max-w-sm">
                  Please upload a CSV / XLSX file or paste spreadsheet data on the left panel to configure column mapping and preview normalization.
                </p>
              </div>
              <div className="p-3.5 bg-white border border-beige/40 rounded-xl max-w-md text-left text-[10px] space-y-1.5 mt-2.5">
                <span className="font-bold text-brand flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Formatting Guide / डेटा गाइड:</span>
                <ul className="list-disc pl-4 text-mute space-y-0.5">
                  <li><strong>Date of Birth (DOB):</strong> Can be <code className="bg-cream px-1 rounded font-mono">DD-MM-YYYY</code> (e.g. 25-12-2010), dot-separated, or Excel Date Serial number.</li>
                  <li><strong>Admission Date:</strong> Can be customized per student row. If blank, it will automatically fall back to the date selected on the left panel.</li>
                  <li><strong>Gender:</strong> Supports <code className="bg-cream px-1 rounded font-mono">Male</code>, <code className="bg-cream px-1 rounded font-mono">Female</code>, <code className="bg-cream px-1 rounded font-mono">M</code>, or <code className="bg-cream px-1 rounded font-mono">F</code>.</li>
                  <li><strong>Category:</strong> Maps OBC, SC, ST, GENERAL automatically.</li>
                  <li><strong>Required Fields:</strong> First Name, Date of Birth, and Mother Name are strictly required to protect records.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
