'use client';

/**
 * @file src/app/dashboard/students/page.tsx
 * @description Students Directory and Search interface + Bulk Class Promotion portal.
 *
 * DESIGN DECISIONS:
 * - Premium card-based container with filter widgets.
 * - Interactive data table for student profiles.
 * - Division (unit) select box filtering to user's accessUnits.
 * - Tab switcher for Class Promotion (restricted to DIRECTOR and PRINCIPAL roles).
 * - Class-wise checklist selection and password confirmation for promotions.
 * - Form to manually add previous outstanding dues to a student by Admission ID.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useDataSubscription } from '@/lib/events';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Building2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Trash2,
  Download,
  GraduationCap,
  Lock,
  ShieldAlert,
  ArrowRight,
  UserCheck,
  Upload,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getClassesForUnit, getNextClass, getClass11Streams } from '@/lib/classes';

const ALL_CLASS_OPTIONS_RAW = [
  ...getClassesForUnit('english'),
  ...getClassesForUnit('hindi'),
  ...getClassesForUnit('college'),
];

const ALL_CLASS_OPTIONS = Array.from(
  new Map(ALL_CLASS_OPTIONS_RAW.map((c) => [c.key, c])).values()
);

interface Student {
  id: string;
  unitId: string;
  admissionNo: string;
  srNo?: string | null;
  className: string;
  section: string;
  name: string;
  nameHindi: string | null;
  gender: string;
  fatherName: string;
  fatherPhone: string | null;
  status: string;
  unit: {
    name: string;
  };
}

const UNIT_LABELS: Record<string, string> = {
  all: 'All Divisions',
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
};

export default function StudentsDirectoryPage() {
  const router = useRouter();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'directory' | 'promote'>('directory');
  const [userRole, setUserRole] = useState<string>('');
  
  // Directory Tab states
  const [students, setStudents] = useState<Student[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const filteredClassOptions = unit === 'all' ? ALL_CLASS_OPTIONS : getClassesForUnit(unit);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Promotion Tab states
  const [promoteUnit, setPromoteUnit] = useState<string>('');
  const [promoteYear, setPromoteYear] = useState<string>('2026-27');
  const [promoteClassesSummary, setPromoteClassesSummary] = useState<any[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [promotePassword, setPromotePassword] = useState('');
  const [promoteErrorMessage, setPromoteErrorMessage] = useState<string | null>(null);
  const [isBulkPromoting, setIsBulkPromoting] = useState(false);

  const [class10Students, setClass10Students] = useState<any[]>([]);
  const [class10Loading, setClass10Loading] = useState(false);
  const [class10Streams, setClass10Streams] = useState<Record<string, string>>({});
  const [class10Selected, setClass10Selected] = useState<Record<string, boolean>>({});
  const [promotionType, setPromotionType] = useState<'bulk' | 'class10'>('bulk');

  const [isStateRestored, setIsStateRestored] = useState(false);

  // Load directory state from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('mge-students-directory-state');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.unit) setUnit(state.unit);
        if (state.classFilter) setClassFilter(state.classFilter);
        if (state.statusFilter) setStatusFilter(state.statusFilter);
        if (state.search) setSearch(state.search);
        if (state.page) setPage(state.page);
        if (state.activeTab) setActiveTab(state.activeTab);
      }
    } catch (e) {
      console.error('Failed to load saved directory state:', e);
    } finally {
      setIsStateRestored(true);
    }
  }, []);

  // Save directory state to sessionStorage when it changes
  useEffect(() => {
    if (!isStateRestored) return;
    try {
      const state = { unit, classFilter, statusFilter, search, page, activeTab };
      sessionStorage.setItem('mge-students-directory-state', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save directory state:', e);
    }
  }, [unit, classFilter, statusFilter, search, page, activeTab, isStateRestored]);

  // Fetch user session to determine allowed units for filtering and roles
  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user?.accessUnits?.includes('hostel') && !data.user?.accessUnits?.some((u: string) => u === 'mes' || u === 'nms' || u === 'college' || u === 'all')) {
            router.replace('/dashboard/hostel?tab=students');
            return;
          }
          setAllowedUnits(data.user.accessUnits);
          setUserRole(data.user.role || '');
          if (data.user.accessUnits && data.user.accessUnits.length > 0) {
            setPromoteUnit(data.user.accessUnits[0]);
          }
        }
      } catch (err) {
        console.error('Failed to get user payload:', err);
      }
    }
    fetchUser();
  }, []);

  // Fetch students list when filter values change (Directory tab)
  const loadStudents = useCallback(async () => {
    if (activeTab !== 'directory') return;
    if (!isStateRestored) return; // Wait until filters are loaded from sessionStorage
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: '1',
        limit: '5000',
        unit: unit,
        status: statusFilter,
      });

      if (classFilter !== 'all') queryParams.append('class', classFilter);
      if (search.trim()) queryParams.append('search', search.trim());

      const res = await fetch(`/api/students?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to load students');

      const data = await res.json();
      setStudents(data.students);
      setTotalCount(data.pagination.total);
      setTotalPages(data.pagination.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [page, unit, classFilter, statusFilter, search, activeTab, isStateRestored]);

  useEffect(() => {
    if (allowedUnits.length > 0) {
      loadStudents();
    }
  }, [loadStudents, allowedUnits]);

  useDataSubscription(loadStudents);

  // Load Promotion summary of classes
  const loadPromotionSummary = async () => {
    if (!promoteUnit) return;
    setIsSummaryLoading(true);
    try {
      const res = await fetch(`/api/students/class-promotion-summary?unit=${promoteUnit}`);
      if (!res.ok) throw new Error('Failed to load classes summary');

      const data = await res.json();
      setPromoteClassesSummary(data.summary || []);
      setSelectedClasses([]); // Clear selection on unit change
    } catch (err) {
      console.error(err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const loadClass10Students = async () => {
    if (!promoteUnit) return;
    setClass10Loading(true);
    try {
      const res = await fetch(`/api/students?unit=${promoteUnit}&class=10&status=ACTIVE&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const students = data.students || [];
        setClass10Students(students);

        const initialStreams: Record<string, string> = {};
        const initialSelected: Record<string, boolean> = {};
        const streams = getClass11Streams(promoteUnit);
        const defaultStream = streams.length > 0 ? streams[0].key : '11 (Science)';

        students.forEach((s: any) => {
          initialStreams[s.id] = defaultStream;
          initialSelected[s.id] = true;
        });

        setClass10Streams(initialStreams);
        setClass10Selected(initialSelected);
      }
    } catch (err) {
      console.error('Failed to load class 10 students:', err);
    } finally {
      setClass10Loading(false);
    }
  };

  // Fetch summary when promote unit changes
  useEffect(() => {
    if (activeTab === 'promote') {
      loadPromotionSummary();
      loadClass10Students();
    }
  }, [promoteUnit, activeTab]);

  // Handle Export (Directory tab)
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const queryParams = new URLSearchParams({
        type: 'students',
        unit: unit,
        status: statusFilter,
      });

      if (classFilter !== 'all') queryParams.append('class', classFilter);
      if (search.trim()) queryParams.append('search', search.trim());

      window.open(`/api/export?${queryParams.toString()}`);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  // Soft-Delete (Deactivate) Student handler
  const handleDeactivate = async (studentId: string, name: string) => {
    const confirmWithdraw = window.confirm(
      `Are you sure you want to toggle status to WITHDRAWN for '${name}'? This deactivates their portal access but preserves their financial ledger history.`
    );
    if (!confirmWithdraw) return;

    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Deactivation failed');
      
      setPage(1);
      router.refresh();
    } catch (err) {
      alert('Error deactivating student: ' + err);
    }
  };

  // Re-admit Student handler
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

      alert(`'${name}' has been successfully re-admitted!`);
      setPage(1);
      fetchStudents();
    } catch (err: any) {
      alert('Error re-admitting student: ' + err.message);
    }
  };

  // Perform Bulk Promotion
  const handleBulkPromote = async (e: React.FormEvent) => {
    e.preventDefault();
    setPromoteErrorMessage(null);
    setIsBulkPromoting(true);

    try {
      const payload: any = {
        division: promoteUnit,
        academicYear: promoteYear,
        password: promotePassword,
      };

      if (promotionType === 'bulk') {
        payload.sourceClasses = selectedClasses;
      } else {
        payload.sourceClasses = [];
        payload.class10Promotions = class10Students
          .filter(s => class10Selected[s.id])
          .map(s => ({
            studentId: s.id,
            targetClass: class10Streams[s.id],
          }));

        if (payload.class10Promotions.length === 0) {
          throw new Error('Please select at least one student to promote.');
        }
      }

      const res = await fetch('/api/students/bulk-promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to promote.');
      }

      setIsPromoteModalOpen(false);
      setPromotePassword('');
      setSelectedClasses([]);
      
      // Reload classes summary and Class 10 students
      await loadPromotionSummary();
      await loadClass10Students();

      alert(data.message || 'Successfully promoted.');
    } catch (err: any) {
      setPromoteErrorMessage(err.message || 'An error occurred.');
    } finally {
      setIsBulkPromoting(false);
    }
  };

  // Checkbox toggle helpers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Check only classes that have a valid promote destination
      const selectable = promoteClassesSummary
        .filter((c) => getNextClass(c.className) !== null)
        .map((c) => c.className);
      setSelectedClasses(selectable);
    } else {
      setSelectedClasses([]);
    }
  };

  const handleSelectClass = (className: string, checked: boolean) => {
    if (checked) {
      setSelectedClasses((prev) => [...prev, className]);
    } else {
      setSelectedClasses((prev) => prev.filter((item) => item !== className));
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header Controls ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <span>Student Directory</span>
            {activeTab === 'promote' && (
              <span className="text-xs bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded font-extrabold flex items-center gap-1">
                <GraduationCap size={13} /> Promotion Portal
              </span>
            )}
          </h1>
          <p className="text-xs text-mute mt-1">
            Search, filter, register, and promote students class-wise.
          </p>
        </div>

        {activeTab === 'directory' && (
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer transition-all duration-200"
            >
              {isExporting ? <Loader2 size={16} className="animate-spin text-brand" /> : <Download size={16} />}
              <span>Export to Excel</span>
            </Button>

            <Link href="/dashboard/students/import">
              <Button className="border border-brand/20 bg-brand/5 hover:bg-brand/10 text-brand font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer transition-all duration-200">
                <Upload size={16} />
                <span>Import (Excel)</span>
              </Button>
            </Link>

            <Link href="/dashboard/students/new">
              <Button className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer">
                <Plus size={16} />
                <span>Register Student</span>
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* ── Role Restricted Tab Switcher ──────────────────────────────── */}
      {['DIRECTOR', 'PRINCIPAL'].includes(userRole) && (
        <div className="flex border-b border-beige">
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'directory'
                ? 'border-brand text-brand font-extrabold'
                : 'border-transparent text-mute hover:text-ink'
            }`}
          >
            Directory View
          </button>
          <button
            onClick={() => setActiveTab('promote')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'promote'
                ? 'border-emerald-600 text-emerald-700 font-extrabold'
                : 'border-transparent text-mute hover:text-ink'
            }`}
          >
            <GraduationCap size={14} />
            <span>Class Promotion</span>
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: DIRECTORY VIEW                                           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'directory' && (
        <>
          {/* Filter Controls Panel */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
              {/* Search bar */}
              <div className="relative w-full md:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={16} />
                <Input
                  type="text"
                  placeholder="Search by student name, Admission ID, or father's name..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10 border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand"
                />
              </div>

              {/* Filters toggle/group */}
              <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
                {/* Division dropdown */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Building2 size={14} className="text-mute" />
                  <select
                    value={unit}
                    onChange={(e) => {
                      setUnit(e.target.value);
                      setClassFilter('all');
                      setPage(1);
                    }}
                    className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                  >
                    <option value="all">All Divisions</option>
                    {allowedUnits.map((uCode) => (
                      <option key={uCode} value={uCode}>
                        {UNIT_LABELS[uCode] || uCode.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Class dropdown */}
                <select
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="all">All Classes</option>
                  {filteredClassOptions.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>

                {/* Status dropdown */}
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="GRADUATED">Graduated</option>
                  <option value="WITHDRAWN">Withdrawn</option>
                </select>

                <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand/10 text-brand border border-brand/20">
                  Total: {students.length} Entries
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Students Data Table - Single Page Scrollable Container */}
          <Card className="border-beige bg-paper text-ink shadow-md overflow-hidden">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-brand" />
                  <span className="text-mute text-xs font-medium">Fetching directory...</span>
                </div>
              ) : students.length === 0 ? (
                <div className="text-center py-16">
                  <SlidersHorizontal size={32} className="mx-auto text-mute mb-2" />
                  <p className="text-mute text-sm font-semibold">No students found</p>
                  <p className="text-mute text-xs mt-1">Try tweaking your search term or filters.</p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-270px)] overflow-y-auto overflow-x-auto relative rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-cream z-10 border-b border-beige text-mute font-bold uppercase tracking-wider shadow-xs">
                      <tr>
                        <th className="p-4">Admission ID</th>
                        <th className="p-4">Name</th>
                        <th className="p-4">Division</th>
                        <th className="p-4">Class</th>
                        <th className="p-4">Parent Phone</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-beige text-label font-medium">
                      {students.map((student) => (
                        <tr
                          key={student.id}
                          onClick={() => router.push(`/dashboard/students/${student.id}`)}
                          className="hover:bg-cream transition-colors cursor-pointer"
                        >
                          <td className="p-4 font-mono font-bold text-brand">
                            <div>{student.admissionNo}</div>
                            {student.srNo && (
                              <div className="text-[10px] text-mute font-sans font-medium mt-0.5">Sr. No: {student.srNo}</div>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-ink">{student.name}</span>
                              {student.nameHindi && (
                                <span className="text-2xs text-mute">{student.nameHindi}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-mute">{student.unit.name}</td>
                          <td className="p-4 font-semibold">{student.className}</td>
                          <td className="p-4 font-mono text-mute">
                            {student.fatherPhone || '—'}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${
                              student.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : student.status === 'GRADUATED'
                                ? 'bg-blue-50 text-blue-600 border-blue-200'
                                : 'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {student.status}
                            </span>
                          </td>
                          <td className="p-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              {student.status === 'ACTIVE' ? (
                                <button
                                  onClick={() => handleDeactivate(student.id, student.name)}
                                  title="Withdraw Student"
                                  className="p-1 rounded bg-cream hover:bg-red-50 text-mute hover:text-red-600 cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleReadmit(student.id, student.name)}
                                  title="Re-admit Student"
                                  className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center gap-1 cursor-pointer border border-emerald-200"
                                >
                                  <RotateCcw size={12} />
                                  <span>Re-admit</span>
                                </button>
                              )}
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: CLASS PROMOTION PORTAL                                   */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'promote' && (
        <div className="space-y-6">
          {/* Source Class filters & Target selector */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-3 border-b border-beige">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute flex items-center gap-1.5">
                <GraduationCap size={15} className="text-emerald-600" />
                <span>Class-Wise Promotion Panel</span>
              </CardTitle>
              <CardDescription className="text-mute text-xs">
                Select a division and academic session. Check the classes you want to promote to the next logical class.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
              <div className="flex flex-col gap-1 max-w-xs w-full">
                <label className="text-[10px] font-bold text-mute uppercase">Division / Unit</label>
                <select
                  value={promoteUnit}
                  onChange={(e) => setPromoteUnit(e.target.value)}
                  className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2.5 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  {allowedUnits.map((uCode) => (
                    <option key={uCode} value={uCode}>
                      {UNIT_LABELS[uCode] || uCode.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1 max-w-xs w-full md:ml-auto">
                <label className="text-[10px] font-bold text-mute uppercase">Target Promotion Session</label>
                <select
                  value={promoteYear}
                  onChange={(e) => setPromoteYear(e.target.value)}
                  className="bg-field border border-emerald-300 text-label text-xs font-semibold rounded-lg p-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="2026-27">Session 2026-27 (New)</option>
                  <option value="2025-26">Session 2025-26 (Current)</option>
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Classes Checklist Table */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2 border-b border-beige flex flex-row items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">
                  School Classes Checklist
                </CardTitle>
                <CardDescription className="text-mute text-2xs">
                  Check classes to promote. Students will advance to their next logical class and fetch target class fees automatically.
                </CardDescription>
              </div>
              <div>
                <Button
                  disabled={
                    promotionType === 'bulk'
                      ? selectedClasses.length === 0
                      : class10Students.filter((s) => class10Selected[s.id]).length === 0
                  }
                  onClick={() => {
                    setPromoteErrorMessage(null);
                    setPromotePassword('');
                    setIsPromoteModalOpen(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer flex items-center shrink-0 transition-all duration-200"
                >
                  <GraduationCap size={16} />
                  <span>
                    {promotionType === 'bulk'
                      ? `Promote Selected Classes (${selectedClasses.length})`
                      : `Promote Class 10 Students (${class10Students.filter((s) => class10Selected[s.id]).length})`}
                  </span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isSummaryLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  <span className="text-mute text-xs font-medium">Loading classes list...</span>
                </div>
              ) : promoteClassesSummary.length === 0 ? (
                <div className="text-center py-12">
                  <SlidersHorizontal size={28} className="mx-auto text-mute mb-2" />
                  <p className="text-mute text-xs font-semibold">No classes defined in selected division.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                        <th className="p-3 text-center w-12">
                          <input
                            type="checkbox"
                            className="cursor-pointer h-3.5 w-3.5 accent-emerald-600"
                            checked={
                              promotionType === 'bulk' &&
                              selectedClasses.length > 0 &&
                              selectedClasses.length ===
                                promoteClassesSummary.filter((c) => getNextClass(c.className) !== null).length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPromotionType('bulk');
                                const selectable = promoteClassesSummary
                                  .filter((c) => getNextClass(c.className) !== null)
                                  .map((c) => c.className);
                                setSelectedClasses(selectable);
                              } else {
                                setSelectedClasses([]);
                              }
                            }}
                          />
                        </th>
                        <th className="p-3">Source Class</th>
                        <th className="p-3">Promotion Target</th>
                        <th className="p-3 text-center">Active Students</th>
                        <th className="p-3 text-center">Auto Promotable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-beige text-label font-medium">
                      {promoteClassesSummary.map((cSummary) => {
                        const isClass10 = cSummary.className === '10';
                        const nextClass = getNextClass(cSummary.className);
                        const isSelectable = nextClass !== null || isClass10;
                        const isChecked = isClass10
                          ? promotionType === 'class10'
                          : promotionType === 'bulk' && selectedClasses.includes(cSummary.className);
                        
                        return (
                          <tr
                            key={cSummary.className}
                            className={`transition-colors select-none ${
                              !isSelectable
                                ? 'bg-cream/40 opacity-60 cursor-not-allowed'
                                : isChecked
                                ? 'bg-emerald-50/40 hover:bg-emerald-50/60 cursor-pointer'
                                : 'hover:bg-cream cursor-pointer'
                            }`}
                            onClick={() => {
                              if (isClass10) {
                                if (promotionType === 'class10') {
                                  setPromotionType('bulk');
                                } else {
                                    setPromotionType('class10');
                                    setSelectedClasses([]);
                                }
                              } else if (isSelectable) {
                                if (promotionType === 'class10') {
                                  setPromotionType('bulk');
                                  setSelectedClasses([cSummary.className]);
                                } else {
                                  handleSelectClass(cSummary.className, !isChecked);
                                }
                              }
                            }}
                          >
                            <td className="p-3 text-center w-12" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="cursor-pointer h-3.5 w-3.5 accent-emerald-600"
                                disabled={!isSelectable}
                                checked={isChecked}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (isClass10) {
                                    if (e.target.checked) {
                                      setPromotionType('class10');
                                      setSelectedClasses([]);
                                    } else {
                                      setPromotionType('bulk');
                                    }
                                  } else {
                                    if (promotionType === 'class10') {
                                      setPromotionType('bulk');
                                      setSelectedClasses([cSummary.className]);
                                    } else {
                                      handleSelectClass(cSummary.className, e.target.checked);
                                    }
                                  }
                                }}
                              />
                            </td>
                            <td className="p-3 font-semibold text-ink">{cSummary.classLabel}</td>
                            <td className="p-3">
                              {nextClass === 'GRADUATED' ? (
                                <span className="text-blue-700 font-extrabold uppercase text-[10px]">Graduation</span>
                              ) : nextClass ? (
                                <span className="text-emerald-700 font-bold flex items-center gap-1">
                                  <span>{cSummary.className}</span>
                                  <ArrowRight size={11} className="text-mute" />
                                  <span>{nextClass}</span>
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-semibold italic text-2xs flex items-center gap-1">
                                  <span>Stream Selection Required</span>
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-ink">{cSummary.activeCount}</td>
                            <td className="p-3 text-center">
                              {isSelectable ? (
                                <span className="px-1.5 py-0.5 rounded text-3xs font-extrabold uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                                  YES
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-3xs font-extrabold uppercase border bg-red-50 text-red-600 border-red-200">
                                  NO
                                </span>
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

          {/* Class 10 Stream Selection Panel */}
          {promotionType === 'class10' && (
            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardHeader className="pb-3 border-b border-beige flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute flex items-center gap-1.5">
                    <GraduationCap size={15} className="text-emerald-600" />
                    <span>Class 10 Stream Selection Panel</span>
                  </CardTitle>
                  <CardDescription className="text-mute text-xs">
                    Choose target streams for individual Class 10 students. Students not checked or not having streams set will not be promoted.
                  </CardDescription>
                </div>
                {class10Students.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-bold text-mute uppercase">Set All Streams:</span>
                    <select
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const updated = { ...class10Streams };
                          class10Students.forEach((s) => {
                            updated[s.id] = val;
                          });
                          setClass10Streams(updated);
                        }
                      }}
                      className="bg-field border border-beige text-label text-xs font-semibold rounded p-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">-- Choose Stream --</option>
                      {getClass11Streams(promoteUnit).map((stream) => (
                        <option key={stream.key} value={stream.key}>
                          {stream.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-4">
                {class10Loading ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                    <span className="text-mute text-xs font-medium">Fetching Class 10 students...</span>
                  </div>
                ) : class10Students.length === 0 ? (
                  <div className="text-center py-8">
                    <SlidersHorizontal size={24} className="mx-auto text-mute mb-2" />
                    <p className="text-mute text-xs font-semibold">No active Class 10 students found in this division.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                          <th className="p-3 text-center w-12">
                            <input
                              type="checkbox"
                              className="cursor-pointer h-3.5 w-3.5 accent-emerald-600"
                              checked={class10Students.every((s) => class10Selected[s.id])}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const updated = { ...class10Selected };
                                class10Students.forEach((s) => {
                                  updated[s.id] = checked;
                                });
                                setClass10Selected(updated);
                              }}
                            />
                          </th>
                          <th className="p-3">Admission No</th>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Father's Name</th>
                          <th className="p-3">Target Stream</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-beige text-label font-medium">
                        {class10Students.map((student) => (
                          <tr
                            key={student.id}
                            className={`hover:bg-cream transition-colors cursor-pointer ${
                              class10Selected[student.id] ? 'bg-emerald-50/20' : ''
                            }`}
                            onClick={() => {
                              setClass10Selected((prev) => ({
                                ...prev,
                                [student.id]: !prev[student.id],
                              }));
                            }}
                          >
                            <td className="p-3 text-center w-12" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="cursor-pointer h-3.5 w-3.5 accent-emerald-600"
                                checked={!!class10Selected[student.id]}
                                onChange={(e) => {
                                  setClass10Selected((prev) => ({
                                    ...prev,
                                    [student.id]: e.target.checked,
                                  }));
                                }}
                              />
                            </td>
                            <td className="p-3 font-mono font-bold text-brand">{student.admissionNo}</td>
                            <td className="p-3 text-ink font-semibold">{student.name}</td>
                            <td className="p-3 text-mute">{student.fatherName}</td>
                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                              <select
                                value={class10Streams[student.id] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setClass10Streams((prev) => ({
                                    ...prev,
                                    [student.id]: val,
                                  }));
                                }}
                                className="bg-field border border-beige text-label text-xs font-semibold rounded p-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                              >
                                {getClass11Streams(promoteUnit).map((stream) => (
                                  <option key={stream.key} value={stream.key}>
                                    {stream.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Confirm Promotion Password Modal ────────────────────────────── */}
      {isPromoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-paper border border-beige rounded-xl shadow-xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-emerald-50 border-b border-emerald-100 p-4 flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <GraduationCap size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-900">Authorize Class Promotion</h3>
                <p className="text-3xs text-emerald-700 font-semibold">
                  {promotionType === 'bulk'
                    ? `You have checked ${selectedClasses.length} classes for bulk promotion`
                    : `You have selected ${class10Students.filter((s) => class10Selected[s.id]).length} Class 10 students for promotion`}
                </p>
              </div>
            </div>

            <form onSubmit={handleBulkPromote} className="p-6 space-y-4">
              {promoteErrorMessage && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                  <span>{promoteErrorMessage}</span>
                </div>
              )}

              <div className="text-xs text-mute leading-relaxed space-y-2">
                <p>
                  You are about to promote the selected active students:
                </p>
                {promotionType === 'bulk' ? (
                  <div className="p-3 bg-cream rounded border border-beige max-h-32 overflow-y-auto space-y-1 font-semibold text-ink text-center">
                    {selectedClasses.map((sourceClass) => {
                      const target = getNextClass(sourceClass);
                      return (
                        <div key={sourceClass} className="flex items-center gap-1.5 justify-center text-xs">
                          <span>Class {sourceClass}</span>
                          <ArrowRight size={11} className="text-mute" />
                          <span className={target === 'GRADUATED' ? 'text-blue-700 font-bold' : 'text-emerald-700 font-bold'}>
                            {target === 'GRADUATED' ? 'Graduation' : `Class ${target}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-cream rounded border border-beige max-h-32 overflow-y-auto space-y-1 font-semibold text-ink text-left text-xs">
                    <p className="font-bold text-center mb-1 text-ink">Class 10 Stream Promotions:</p>
                    {class10Students
                      .filter((s) => class10Selected[s.id])
                      .map((student) => (
                        <div key={student.id} className="flex justify-between border-b border-beige/40 pb-1 last:border-0">
                          <span>{student.name} ({student.admissionNo})</span>
                          <span className="text-emerald-700 font-bold">{class10Streams[student.id]}</span>
                        </div>
                      ))}
                  </div>
                )}
                <p className="text-[10px] text-amber-700 font-bold bg-amber-50 border border-amber-100 p-2.5 rounded-lg flex gap-1.5 items-start">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                  <span>
                    This advances student classes and sections, fetches new class tuition and transport fees, and sets them as outstanding unpaid dues. This is a bulk action.
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="text-label text-2xs font-bold uppercase flex items-center gap-1.5">
                  <Lock size={11} /> Enter Account Password
                </label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  placeholder="Enter your login password to confirm..."
                  value={promotePassword}
                  onChange={(e) => setPromotePassword(e.target.value)}
                  className="border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-emerald-500 text-xs"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  onClick={() => setIsPromoteModalOpen(false)}
                  disabled={isBulkPromoting}
                  className="border border-beige bg-cream text-mute hover:text-ink h-9 px-4 rounded-lg text-xs cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isBulkPromoting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer flex items-center"
                >
                  {isBulkPromoting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Promoting...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck size={14} />
                      <span>Confirm Promotion</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
