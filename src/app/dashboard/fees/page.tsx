'use client';

/**
 * @file src/app/dashboard/fees/page.tsx
 * @description Fees Engine — three-tab module: Fee Structures, Collect Payment, Receipt Log.
 *
 * DESIGN DECISIONS:
 * - Tab 1 (Fee Structures): Grid of structure cards with component breakdowns + creation form.
 * - Tab 2 (Collect Payment): Multi-step flow: search student  review allocations  record payment.
 *   On success shows a printable receipt confirmation with receipt number and voucher number.
 * - Tab 3 (Receipt Log): Filterable, paginated receipt history table.
 * - Fallback mode: All API errors degrade gracefully — no crash, empty-state illustrations shown.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Search,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Receipt,
  Layers,
  X,
  IndianRupee,
  Calendar,
  RotateCcw,
  GraduationCap,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { triggerDataChange, useDataSubscription } from '@/lib/events';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeeComponent {
  id: string;
  name: string;
  amount: string | number;
}

interface FeeStructure {
  id: string;
  name: string;
  unitId: string;
  className: string;
  academicYear: string;
  unit: { name: string };
  components: FeeComponent[];
}

interface FeeAllocation {
  id: string;
  amountDue: string | number;
  amountPaid: string | number;
  dueDate: string;
  status: string;
  feeComponent: { name: string; amount: string | number };
}

interface Receipt {
  id: string;
  receiptNo: string;
  paymentDate: string;
  paymentMode: string;
  totalAmount: string | number;
  student: {
    name: string;
    admissionNo: string;
    className: string;
    section: string;
    unit: { name: string };
  };
  details: {
    id: string;
    amountApplied: string | number;
    feeAllocation: { feeComponent: { name: string } };
  }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UNIT_LABELS: Record<string, string> = {
  all: 'All Divisions',
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
};

const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI'] as const;

const CLASSES = [
  'Nursery', 'KG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  'B.A. 1st Year', 'B.A. 2nd Year', 'B.A. 3rd Year',
  'B.Sc. 1st Year', 'B.Sc. 2nd Year', 'B.Sc. 3rd Year',
  'B.Com. 1st Year', 'B.Com. 2nd Year', 'B.Com. 3rd Year',
];

const fmt = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().split('T')[0];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    UNPAID: 'bg-red-50 text-red-600 border-red-200',
    PARTIALLY_PAID: 'bg-amber-50 text-amber-600 border-amber-200',
    PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-3xs font-extrabold uppercase border ${map[status] || 'bg-beige text-mute border-[#dcd5c8]'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── Tab 1: Fee Structures ────────────────────────────────────────────────────

function FeeStructuresTab({ allowedUnits }: { allowedUnits: string[] }) {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit structure state
  const [editStructure, setEditStructure] = useState<FeeStructure | null>(null);

  // New structure form state
  const [formUnit, setFormUnit] = useState(allowedUnits[0] || '');
  const [formClass, setFormClass] = useState('5');
  const [formYear, setFormYear] = useState('2025-26');
  const [formName, setFormName] = useState('');
  const [components, setComponents] = useState([{ name: '', amount: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/fees/structures?unit=${unitFilter}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStructures(data.structures || []);
    } catch {
      setStructures([]);
    } finally {
      setIsLoading(false);
    }
  }, [unitFilter]);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  const addComponent = () => setComponents([...components, { name: '', amount: '' }]);
  const removeComponent = (i: number) => setComponents(components.filter((_, idx) => idx !== i));
  const updateComponent = (i: number, field: 'name' | 'amount', val: string) => {
    const updated = [...components];
    updated[i] = { ...updated[i], [field]: val };
    setComponents(updated);
  };

  const totalFee = components.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const handleEditClick = (s: FeeStructure) => {
    setEditStructure(s);
    setFormUnit(s.unitId);
    setFormClass(s.className);
    setFormYear(s.academicYear);
    setFormName(s.name);
    
    // Filter out dynamic components from editing
    const editableComponents = s.components
      .filter(c => c.name !== 'Previous Outstanding Fees' && c.name !== 'Transport Fee')
      .map(c => ({ id: c.id, name: c.name, amount: String(c.amount) }));
      
    setComponents(editableComponents.length > 0 ? editableComponents : [{ name: '', amount: '' }]);
    setFormError(null);
    setFormSuccess(false);
    setShowForm(true);
    
    // Scroll to the top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!formName.trim()) { setFormError('Structure name is required.'); return; }
    if (components.some(c => !c.name.trim() || !Number(c.amount))) {
      setFormError('All components need a name and a positive amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isEdit = !!editStructure;
      const url = '/api/fees/structures';
      const method = isEdit ? 'PUT' : 'POST';
      
      const payload = isEdit ? {
        id: editStructure.id,
        name: formName,
        components: components.map(c => ({ 
          id: (c as any).id || undefined, 
          name: c.name, 
          amount: Number(c.amount) 
        })),
      } : {
        unitId: formUnit,
        className: formClass,
        academicYear: formYear,
        name: formName,
        components: components.map(c => ({ name: c.name, amount: Number(c.amount) })),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setFormSuccess(true);
      setShowForm(false);
      setEditStructure(null);
      setFormName('');
      setComponents([{ name: '', amount: '' }]);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to save fee structure.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Building2 size={14} className="text-mute" />
            <select
              value={unitFilter}
              onChange={(e) => { setUnitFilter(e.target.value); }}
              className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
            >
              <option value="all">All Divisions</option>
              {allowedUnits.map((u) => (
                <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>
              ))}
            </select>
          </div>
          <span className="text-mute text-xs">{structures.length} structure{structures.length !== 1 ? 's' : ''}</span>
        </div>
        <Button
          onClick={() => { 
            if (showForm) {
              setShowForm(false);
              setEditStructure(null);
              setFormName('');
              setComponents([{ name: '', amount: '' }]);
            } else {
              setShowForm(true);
            }
            setFormSuccess(false);
            setFormError(null); 
          }}
          className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer"
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          <span>{showForm ? 'Cancel' : 'New Fee Structure'}</span>
        </Button>
      </div>

      {/* Creation form */}
      {showForm && (
        <Card className="border border-brand/20 bg-brand/5 text-ink shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-brand uppercase tracking-wider">
              {editStructure ? 'Edit Fee Structure' : 'Create Fee Structure'}
            </CardTitle>
            <CardDescription className="text-mute text-xs">
              {editStructure 
                ? 'Update name and component fees. Note: Division, Class, and Year cannot be changed.' 
                : 'Define all fee components for a class/division/year combination.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {formError && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                <AlertCircle size={14} className="shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Structure meta */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Division</Label>
                <select
                  value={formUnit}
                  onChange={(e) => setFormUnit(e.target.value)}
                  disabled={!!editStructure}
                  className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none disabled:opacity-50"
                >
                  {allowedUnits.map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Class</Label>
                <select
                  value={formClass}
                  onChange={(e) => setFormClass(e.target.value)}
                  disabled={!!editStructure}
                  className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none disabled:opacity-50"
                >
                  {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-mute">Academic Year</Label>
                <Input
                  value={formYear}
                  onChange={(e) => setFormYear(e.target.value)}
                  placeholder="2025-26"
                  disabled={!!editStructure}
                  className="border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand disabled:opacity-50"
                />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <Label className="text-xs text-mute">Structure Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Annual Fee 2025-26"
                  className="border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand"
                />
              </div>
            </div>

            {/* Fee components */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-mute uppercase tracking-wider">Fee Components</Label>
                <button
                  onClick={addComponent}
                  className="flex items-center gap-1 text-brand hover:text-brand text-xs font-semibold cursor-pointer"
                >
                  <Plus size={12} /> Add Component
                </button>
              </div>

              <div className="space-y-2">
                {components.map((comp, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      value={comp.name}
                      onChange={(e) => updateComponent(i, 'name', e.target.value)}
                      placeholder={`Component name (e.g. Tuition Fee)`}
                      className="flex-1 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand"
                    />
                    <div className="relative w-36 shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
                      <Input
                        type="number"
                        value={comp.amount}
                        onChange={(e) => updateComponent(i, 'amount', e.target.value)}
                        placeholder="0"
                        className="pl-7 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand"
                      />
                    </div>
                    {components.length > 1 && (
                      <button
                        onClick={() => removeComponent(i)}
                        className="p-1.5 rounded text-mute hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end border-t border-beige pt-3">
                <span className="text-xs text-mute">Total: <span className="text-brand font-bold text-sm">{fmt(totalFee)}</span> per student</span>
              </div>
            </div>

            {/* Submit & Cancel */}
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => {
                  setShowForm(false);
                  setEditStructure(null);
                  setFormName('');
                  setComponents([{ name: '', amount: '' }]);
                  setFormError(null);
                }}
                disabled={isSubmitting}
                className="border border-beige bg-transparent text-mute hover:text-ink hover:bg-cream font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2"
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>{isSubmitting ? 'Saving...' : editStructure ? 'Save Changes' : 'Create Fee Structure'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Success banner */}
      {formSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
          <CheckCircle2 size={14} />
          <span>Fee structure saved successfully.</span>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
        </div>
      ) : structures.length === 0 ? (
        <div className="text-center py-16">
          <Layers size={36} className="mx-auto text-mute mb-3" />
          <p className="text-mute text-sm font-semibold">No fee structures found</p>
          <p className="text-mute text-xs mt-1">Click &quot;New Fee Structure&quot; to define one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {structures.map((s) => {
            const displayComponents = s.components.filter(
              (c) => c.name !== 'Previous Outstanding Fees' && c.name !== 'Transport Fee'
            );
            const total = displayComponents.reduce((sum, c) => sum + Number(c.amount), 0);
            const isExpanded = expandedId === s.id;
            return (
              <Card key={s.id} className="border-beige bg-paper text-ink shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    className="w-full text-left p-4 hover:bg-cream transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-ink truncate">{s.name}</p>
                        <p className="text-2xs text-mute mt-1">
                          {s.unit.name} &bull; Class {s.className} &bull; {s.academicYear}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-extrabold text-brand">{fmt(total)}</p>
                        <p className="text-3xs text-mute mt-0.5">{displayComponents.length} components</p>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-beige px-4 pb-4 pt-3 space-y-2">
                      {displayComponents.map((c) => (
                        <div key={c.id} className="flex justify-between items-center text-xs">
                          <span className="text-mute">{c.name}</span>
                          <span className="font-mono font-semibold text-ink">{fmt(c.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center text-xs border-t border-beige pt-2 mt-2">
                        <span className="text-mute font-bold uppercase tracking-wider">Total</span>
                        <span className="font-mono font-extrabold text-brand">{fmt(total)}</span>
                      </div>
                      <div className="flex justify-end gap-2 border-t border-beige pt-3 mt-2">
                        <Button
                          onClick={() => handleEditClick(s)}
                          className="bg-brand/10 hover:bg-brand/20 text-brand font-semibold text-2xs h-7 px-3 rounded cursor-pointer"
                        >
                          Edit Structure
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Collect Payment ───────────────────────────────────────────────────

function CollectPaymentTab({ allowedUnits }: { allowedUnits: string[] }) {
  type Step = 'search' | 'allocations' | 'success';
  const [step, setStep] = useState<Step>('search');

  // Search state
  const [searchUnit, setSearchUnit] = useState(allowedUnits[0] || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; admissionNo: string; className: string; section: string }[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selected student + allocations
  const [selectedStudent, setSelectedStudent] = useState<{
    id: string; name: string; admissionNo: string; className: string; section: string; unit: { name: string };
  } | null>(null);
  const [allocations, setAllocations] = useState<FeeAllocation[]>([]);
  const [isLoadingAllocs, setIsLoadingAllocs] = useState(false);

  // Payment form
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [selectedAllocs, setSelectedAllocs] = useState<Set<string>>(new Set());
  const [payMode, setPayMode] = useState<typeof PAYMENT_MODES[number]>('CASH');
  const [payDate, setPayDate] = useState(today());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Success
  const [receiptData, setReceiptData] = useState<{ receiptNo: string; totalAmount: number } | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const params = new URLSearchParams({ search: searchQuery, unit: searchUnit, limit: '10', page: '1', status: 'ACTIVE' });
      const res = await fetch(`/api/students?${params}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data.students || []);
      if ((data.students || []).length === 0) setSearchError('No students found matching your search.');
    } catch {
      setSearchError('Failed to search students. Check your connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStudent = async (student: typeof searchResults[0]) => {
    setIsLoadingAllocs(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/fees/collect?studentId=${student.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load fee data');
      setSelectedStudent(data.student);
      setAllocations(data.allocations || []);
      const initAmounts: Record<string, string> = {};
      const initSelected = new Set<string>();
      (data.allocations || []).forEach((a: FeeAllocation) => {
        const balance = Number(a.amountDue) - Number(a.amountPaid);
        initAmounts[a.id] = String(balance > 0 ? balance : 0);
        if (balance > 0) initSelected.add(a.id);
      });
      setPayAmounts(initAmounts);
      setSelectedAllocs(initSelected);
      setStep('allocations');
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : 'Failed to load fee data');
    } finally {
      setIsLoadingAllocs(false);
    }
  };

  const toggleAlloc = (id: string) => {
    const next = new Set(selectedAllocs);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedAllocs(next);
  };

  const totalSelected = Array.from(selectedAllocs).reduce((sum, id) => sum + (Number(payAmounts[id]) || 0), 0);

  const handleProcessPayment = async () => {
    setPayError(null);
    if (selectedAllocs.size === 0) { setPayError('Select at least one allocation to pay.'); return; }
    if (Array.from(selectedAllocs).some(id => !(Number(payAmounts[id]) > 0))) {
      setPayError('All selected allocations must have a positive payment amount.'); return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/fees/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent!.id,
          paymentMode: payMode,
          paymentDate: payDate,
          allocations: Array.from(selectedAllocs).map(id => ({
            allocationId: id,
            amount: Number(payAmounts[id]),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');
      setReceiptData(data.payment);
      triggerDataChange();
      setStep('success');
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : 'Payment processing failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep('search');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedStudent(null);
    setAllocations([]);
    setReceiptData(null);
    setPayError(null);
    setSearchError(null);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs font-semibold select-none">
        {(['search', 'allocations', 'success'] as const).map((s, i) => (
          <React.Fragment key={s}>
            <span className={`px-3 py-1 rounded-full border text-3xs font-extrabold uppercase tracking-wider ${
              step === s
                ? 'bg-brand text-white border-brand'
                : (step === 'allocations' && s === 'search') || (step === 'success')
                ? 'bg-emerald-900/30 text-emerald-700 border-emerald-800/50'
                : 'bg-cream text-mute border-beige'
            }`}>
              {i + 1}. {s === 'search' ? 'Find Student' : s === 'allocations' ? 'Fee Allocations' : 'Receipt'}
            </span>
            {i < 2 && <ChevronRight size={12} className="text-mute" />}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step 1: Search ──────────────────────────────────────────────────── */}
      {step === 'search' && (
        <Card className="border-beige bg-paper text-ink shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
              Find Student
            </CardTitle>
            <CardDescription className="text-mute text-xs">
              Search by name or Admission ID to load their outstanding fee allocations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5 shrink-0">
                <Building2 size={14} className="text-mute" />
                <select
                  value={searchUnit}
                  onChange={(e) => setSearchUnit(e.target.value)}
                  className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                >
                  {allowedUnits.map((u) => (
                    <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Student name or Admission ID..."
                  className="pl-9 border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer gap-2 shrink-0"
              >
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                <span>Search</span>
              </Button>
            </div>

            {searchError && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-600 text-xs">
                <AlertCircle size={13} className="shrink-0" />
                <span>{searchError}</span>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-1">
                {searchResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectStudent(s)}
                    disabled={isLoadingAllocs}
                    className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-beige hover:border-brand/30 hover:bg-brand/5 transition-all cursor-pointer group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink group-hover:text-brand">{s.name}</p>
                      <p className="text-2xs text-mute mt-0.5 font-mono">
                        {s.admissionNo} &bull; Class {s.className}-{s.section}
                      </p>
                    </div>
                    {isLoadingAllocs
                      ? <Loader2 size={14} className="animate-spin text-brand" />
                      : <ChevronRight size={16} className="text-mute group-hover:text-brand" />
                    }
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Allocations & Payment ───────────────────────────────────── */}
      {step === 'allocations' && selectedStudent && (
        <div className="space-y-4">
          {/* Student header */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-brand/10 border border-brand/30 text-brand font-bold text-base shrink-0">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-ink">{selectedStudent.name}</p>
                  <p className="text-2xs text-mute font-mono mt-0.5">
                    {selectedStudent.admissionNo} &bull; {selectedStudent.unit.name} &bull; Class {selectedStudent.className}-{selectedStudent.section}
                  </p>
                </div>
              </div>
              <button onClick={resetAll} className="text-mute hover:text-label cursor-pointer p-1">
                <RotateCcw size={14} />
              </button>
            </CardContent>
          </Card>

          {/* Allocations table */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute">
                Outstanding Allocations
              </CardTitle>
              <CardDescription className="text-xs text-mute">
                Check the rows you want to collect payment for. Edit amounts for partial payments.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {allocations.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 size={28} className="mx-auto text-emerald-600 mb-2" />
                  <p className="text-mute text-sm font-semibold">All fees cleared!</p>
                  <p className="text-mute text-xs mt-1">No outstanding dues for this student.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                        <th className="p-4 w-10"></th>
                        <th className="p-4">Fee Head</th>
                        <th className="p-4">Due Date</th>
                        <th className="p-4 text-right">Total Due</th>
                        <th className="p-4 text-right">Balance</th>
                        <th className="p-4 text-right w-32">Pay Now</th>
                        <th className="p-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-beige">
                      {allocations.map((a) => {
                        const balance = Number(a.amountDue) - Number(a.amountPaid);
                        const checked = selectedAllocs.has(a.id);
                        return (
                          <tr key={a.id} className={`transition-colors ${checked ? 'bg-brand/5' : 'hover:bg-cream'}`}>
                            <td className="p-4">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAlloc(a.id)}
                                className="accent-brand h-4 w-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-4 font-semibold text-ink">{a.feeComponent.name}</td>
                            <td className="p-4 text-mute">
                              {new Date(a.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="p-4 text-right font-mono">{fmt(a.amountDue)}</td>
                            <td className={`p-4 text-right font-mono font-bold ${balance > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                              {fmt(balance)}
                            </td>
                            <td className="p-4 text-right">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-mute text-xs">₹</span>
                                <input
                                  type="number"
                                  value={payAmounts[a.id] || ''}
                                  onChange={(e) => setPayAmounts({ ...payAmounts, [a.id]: e.target.value })}
                                  disabled={!checked}
                                  max={balance}
                                  min={0}
                                  className="w-24 pl-5 pr-2 py-1 bg-field border border-beige rounded text-right text-ink text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-30"
                                />
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <StatusBadge status={a.status} />
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

          {/* Payment details + submit */}
          {allocations.length > 0 && (
            <Card className="border-beige bg-paper text-ink shadow-md">
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-mute">Payment Mode</Label>
                    <select
                      value={payMode}
                      onChange={(e) => setPayMode(e.target.value as typeof PAYMENT_MODES[number])}
                      className="w-full bg-field border border-beige text-ink text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
                    >
                      {PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>{m.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-mute">Payment Date</Label>
                    <Input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="border-beige bg-field text-ink text-xs focus-visible:ring-brand"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="p-3 rounded-lg border border-brand/20 bg-brand/5 text-center">
                      <p className="text-3xs text-brand uppercase font-bold tracking-wider">Total Collecting</p>
                      <p className="text-xl font-extrabold text-brand mt-1">{fmt(totalSelected)}</p>
                    </div>
                  </div>
                </div>

                {payError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{payError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button
                    onClick={resetAll}
                    className="border border-beige bg-transparent text-mute hover:text-ink hover:bg-cream font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleProcessPayment}
                    disabled={isSubmitting || selectedAllocs.size === 0 || totalSelected <= 0}
                    className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2"
                  >
                    {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <IndianRupee size={14} />}
                    <span>{isSubmitting ? 'Processing...' : `Collect ${fmt(totalSelected)}`}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Step 3: Success / Receipt ────────────────────────────────────────── */}
      {step === 'success' && receiptData && selectedStudent && (
        <Card className="border-emerald-200 bg-emerald-50 text-ink shadow-lg">
          <CardContent className="p-6 space-y-5">
            <div className="flex flex-col items-center text-center gap-2">
              <div className="h-14 w-14 rounded-full flex items-center justify-center bg-emerald-50 border border-emerald-200">
                <CheckCircle2 size={28} className="text-emerald-700" />
              </div>
              <h3 className="text-lg font-extrabold text-emerald-700">Payment Recorded!</h3>
              <p className="text-mute text-xs">
                The ledger has been updated and a double-entry journal entry has been posted.
              </p>
            </div>

            {/* Receipt card */}
            <div className="border border-beige rounded-xl bg-field p-5 space-y-3 font-mono text-xs">
              <div className="flex justify-between text-mute">
                <span>Student</span>
                <span className="text-ink font-semibold">{selectedStudent.name}</span>
              </div>
              <div className="flex justify-between text-mute">
                <span>Receipt No</span>
                <span className="text-brand font-bold">{receiptData.receiptNo}</span>
              </div>
              <div className="flex justify-between text-mute">
                <span>Payment Mode</span>
                <span className="text-ink">{payMode.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between text-mute">
                <span>Payment Date</span>
                <span className="text-ink">{new Date(payDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between border-t border-beige pt-3 mt-2">
                <span className="text-label font-extrabold uppercase tracking-wide">Amount Collected</span>
                <span className="text-emerald-700 text-base font-extrabold">{fmt(receiptData.totalAmount)}</span>
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <Button
                onClick={resetAll}
                className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2"
              >
                <Plus size={14} /> Collect Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Tab 3: Receipt Log ───────────────────────────────────────────────────────

function ReceiptLogTab({ allowedUnits }: { allowedUnits: string[] }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        type: 'fees',
        unit: unitFilter,
      });
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
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
      const params = new URLSearchParams({ unit: unitFilter, page: page.toString(), limit: '20' });
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (search.trim()) params.append('search', search.trim());

      const res = await fetch(`/api/fees/receipts?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setReceipts(data.payments || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.pages || 1);
    } catch {
      setReceipts([]);
    } finally {
      setIsLoading(false);
    }
  }, [unitFilter, page, fromDate, toDate, search]);

  useEffect(() => { load(); }, [load]);

  useDataSubscription(load);

  const dailyTotal = receipts.reduce((s, r) => s + Number(r.totalAmount), 0);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5">
            <Building2 size={14} className="text-mute" />
            <select
              value={unitFilter}
              onChange={(e) => { setUnitFilter(e.target.value); setPage(1); }}
              className="bg-field border border-beige text-label text-xs font-semibold rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
            >
              <option value="all">All Divisions</option>
              {allowedUnits.map((u) => (
                <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-mute" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="bg-field border border-beige text-label text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
            />
            <span className="text-mute text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="bg-field border border-beige text-label text-xs rounded-lg p-2 focus:ring-1 focus:ring-brand focus:outline-none"
            />
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={13} />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name or Admission ID..."
              className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand"
            />
          </div>

          <Button
            onClick={handleExport}
            disabled={isExporting}
            className="border border-beige bg-cream text-mute hover:text-ink font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer shrink-0"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-brand" /> : <Download size={14} />}
            <span>Export</span>
          </Button>

          <div className="ml-auto text-xs text-mute font-semibold">
            {total} receipt{total !== 1 ? 's' : ''} &bull; Shown total:{' '}
            <span className="text-emerald-700 font-bold">{fmt(dailyTotal)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-16">
              <Receipt size={36} className="mx-auto text-mute mb-3" />
              <p className="text-mute text-sm font-semibold">No receipts found</p>
              <p className="text-mute text-xs mt-1">Adjust your filters or collect a payment first.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-4">Receipt No</th>
                    <th className="p-4">Student</th>
                    <th className="p-4">Division</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Mode</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {receipts.map((r) => {
                    const isExpanded = expandedId === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="hover:bg-cream transition-colors">
                          <td className="p-4 font-mono font-bold text-brand">{r.receiptNo}</td>
                          <td className="p-4">
                            <div>
                              <p className="font-semibold text-ink">{r.student.name}</p>
                              <p className="text-2xs text-mute font-mono mt-0.5">
                                {r.student.admissionNo} &bull; Cl.{r.student.className}-{r.student.section}
                              </p>
                            </div>
                          </td>
                          <td className="p-4 text-mute">{r.student.unit.name}</td>
                          <td className="p-4 text-mute">
                            {new Date(r.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-full text-3xs font-bold uppercase border bg-cream border-[#dcd5c8] text-mute">
                              {r.paymentMode.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-emerald-700">
                            +{fmt(r.totalAmount)}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                              className="text-mute hover:text-ink cursor-pointer p-1"
                            >
                              {isExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="bg-cream px-6 py-3">
                              <div className="text-2xs text-mute space-y-1">
                                <p className="font-bold text-mute uppercase tracking-wider mb-2">Payment breakdown</p>
                                {r.details.map((d) => (
                                  <div key={d.id} className="flex justify-between">
                                    <span>{d.feeAllocation.feeComponent.name}</span>
                                    <span className="font-mono font-semibold text-label">{fmt(d.amountApplied)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!isLoading && receipts.length > 0 && (
        <div className="flex items-center justify-between border-t border-beige pt-4 text-xs font-semibold text-mute">
          <span>
            Page <span className="text-label">{page}</span> of{' '}
            <span className="text-label">{totalPages}</span>{' '}
            (<span className="text-label">{total}</span> total)
          </span>
          <div className="flex gap-2">
            <Button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="border border-beige bg-cream text-mute hover:text-ink h-8 px-3 rounded-lg text-xs flex gap-1 cursor-pointer"
            >
              <ChevronLeft size={13} /> Prev
            </Button>
            <Button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className="border border-beige bg-cream text-mute hover:text-ink h-8 px-3 rounded-lg text-xs flex gap-1 cursor-pointer"
            >
              Next <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Scholarships (Director Only) ──────────────────────────────────────────

function ScholarshipsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; admissionNo: string; className: string; section: string }[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [isLoadingStudent, setIsLoadingStudent] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);

  // Award form state
  const [targetComponent, setTargetComponent] = useState('ALL');
  const [pctInput, setPctInput] = useState('0');
  const [reason, setReason] = useState('Director Scholarship');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // All concessions list (for Discounts tab)
  const [activeSubTab, setActiveSubTab] = useState<'discounts' | 'award'>('discounts');
  const [allConcessions, setAllConcessions] = useState<any[]>([]);
  const [isLoadingConcessions, setIsLoadingConcessions] = useState(false);
  const [concessionsError, setConcessionsError] = useState<string | null>(null);
  const [concessionsSearch, setConcessionsSearch] = useState('');

  const loadAllConcessions = async () => {
    setIsLoadingConcessions(true);
    setConcessionsError(null);
    try {
      const res = await fetch('/api/fees/scholarships');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load concessions');
      setAllConcessions(data.concessions || []);
    } catch (e: any) {
      console.error(e);
      setConcessionsError(e.message || 'Failed to load concessions list.');
    } finally {
      setIsLoadingConcessions(false);
    }
  };

  useEffect(() => {
    loadAllConcessions();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setSelectedStudent(null);
    setStudentError(null);
    try {
      const params = new URLSearchParams({ search: searchQuery.trim(), unit: 'all', limit: '10', page: '1', status: 'ACTIVE' });
      const res = await fetch(`/api/students?${params}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      setSearchResults(data.students || []);
      if ((data.students || []).length === 0) setSearchError('No students found matching your search.');
    } catch {
      setSearchError('Failed to search students. Check your connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStudent = async (studentId: string) => {
    setIsLoadingStudent(true);
    setStudentError(null);
    setSelectedStudent(null);
    setFormSuccess(null);
    setFormError(null);
    try {
      const res = await fetch(`/api/students/${studentId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load student');
      setSelectedStudent(data.student);
      setSearchResults([]);
    } catch (e: any) {
      setStudentError(e.message || 'Failed to load student profile.');
    } finally {
      setIsLoadingStudent(false);
    }
  };

  const handleAwardDiscount = async () => {
    if (!selectedStudent) return;
    setFormError(null);
    setFormSuccess(null);

    const pct = Number(pctInput);
    if (typeof pct !== 'number' || isNaN(pct) || pct < 0 || pct > 100) {
      setFormError('Please enter a valid percentage between 0 and 100.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/students/${selectedStudent.id}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentName: targetComponent,
          discountPercent: pct,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply scholarship');

      setFormSuccess(pct === 0 
        ? `Successfully removed discount/scholarship on ${targetComponent === 'ALL' ? 'all components' : targetComponent}.`
        : `Successfully awarded ${pct}% scholarship on ${targetComponent === 'ALL' ? 'all components' : targetComponent}.`
      );
      setPctInput('0');
      // Reload student details to refresh concessions
      const refreshRes = await fetch(`/api/students/${selectedStudent.id}`);
      const refreshData = await refreshRes.json();
      if (refreshRes.ok) {
        setSelectedStudent(refreshData.student);
      }
      loadAllConcessions();
      triggerDataChange();
    } catch (e: any) {
      setFormError(e.message || 'Failed to save scholarship.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveConcession = async (componentName: string) => {
    if (!selectedStudent) return;
    setFormError(null);
    setFormSuccess(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/students/${selectedStudent.id}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentName,
          discountPercent: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove scholarship');

      setFormSuccess(`Successfully removed scholarship/concession on ${componentName}.`);
      
      // Reload student details
      const refreshRes = await fetch(`/api/students/${selectedStudent.id}`);
      const refreshData = await refreshRes.json();
      if (refreshRes.ok) {
        setSelectedStudent(refreshData.student);
      }
      loadAllConcessions();
      triggerDataChange();
    } catch (e: any) {
      setFormError(e.message || 'Failed to remove scholarship.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTableRemoveConcession = async (studentId: string, componentName: string) => {
    if (!confirm(`Are you sure you want to remove the concession for "${componentName}" from this student?`)) return;
    try {
      const res = await fetch(`/api/students/${studentId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentName,
          discountPercent: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove discount');
      loadAllConcessions();
      triggerDataChange();
    } catch (e: any) {
      alert(e.message || 'Failed to remove discount.');
    }
  };

  const allocatedComponents = selectedStudent
    ? Array.from(new Set(selectedStudent.feeAllocations.map((a: any) => a.feeComponent.name)))
    : [];

  const filteredConcessions = allConcessions.filter((c) => {
    const term = concessionsSearch.toLowerCase().trim();
    if (!term) return true;
    return (
      c.studentName.toLowerCase().includes(term) ||
      c.admissionNo.toLowerCase().includes(term) ||
      c.awardedByName.toLowerCase().includes(term) ||
      c.feeComponentName.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-5">
      <Card className="border-beige bg-paper text-ink shadow-md animate-fadeIn">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-mute flex items-center gap-1.5">
                <GraduationCap size={16} className="text-brand" /> Director&apos;s Scholarship Management
              </CardTitle>
              <CardDescription className="text-mute text-xs mt-1">
                Monitor and manage all fee concessions, discounts, and director-level scholarships.
              </CardDescription>
            </div>
            {/* Sub-tab selection */}
            <div className="flex border border-beige rounded-lg p-0.5 bg-paper shrink-0 shadow-sm max-w-xs font-semibold">
              <button
                onClick={() => setActiveSubTab('discounts')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                  activeSubTab === 'discounts'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-mute hover:text-ink'
                }`}
              >
                Discounts
              </button>
              <button
                onClick={() => setActiveSubTab('award')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                  activeSubTab === 'award'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-mute hover:text-ink'
                }`}
              >
                Scholarship by Director
              </button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {activeSubTab === 'discounts' && (
        <Card className="border-beige bg-paper text-ink shadow-md animate-fadeIn">
          <CardContent className="p-4 space-y-4">
            {/* Concessions search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
              <Input
                value={concessionsSearch}
                onChange={(e) => setConcessionsSearch(e.target.value)}
                placeholder="Filter by student name, admission ID, component, or awarded by..."
                className="pl-9 border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand text-xs"
              />
            </div>

            {isLoadingConcessions ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-brand" />
                <span className="text-mute text-2xs font-semibold">Loading concession records...</span>
              </div>
            ) : concessionsError ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                <AlertCircle size={13} className="shrink-0" />
                <span>{concessionsError}</span>
              </div>
            ) : filteredConcessions.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-beige rounded-xl">
                <GraduationCap className="h-10 w-10 text-mute/40 mx-auto mb-2" />
                <p className="text-xs text-mute font-medium">No concession or discount entries found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-beige rounded-lg shadow-inner bg-field">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-paper border-b border-beige text-mute text-3xs font-bold uppercase tracking-wider">
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Division &amp; Class</th>
                      <th className="p-3">Component</th>
                      <th className="p-3">Original Fee</th>
                      <th className="p-3">Discount</th>
                      <th className="p-3">Awarded By</th>
                      <th className="p-3">Reason / Date</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige/60">
                    {filteredConcessions.map((c) => {
                      const isHighDiscount = c.discountPercent > 20 && c.awardedByRole !== 'DIRECTOR';
                      return (
                        <tr key={c.id} className="hover:bg-paper/50 transition-colors">
                          <td className="p-3">
                            <div>
                              <p className="font-semibold text-ink">{c.studentName}</p>
                              <p className="text-3xs text-mute font-mono">{c.admissionNo}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <p className="font-medium text-ink capitalize">{c.division}</p>
                            <p className="text-3xs text-mute mt-0.5">Class {c.className}-{c.section}</p>
                          </td>
                          <td className="p-3 font-semibold text-ink">{c.feeComponentName}</td>
                          <td className="p-3 font-mono font-semibold text-ink">₹{c.originalFee.toLocaleString('en-IN')}</td>
                          <td className="p-3">
                            <div className="flex flex-col gap-0.5">
                              <span className={`inline-flex items-center w-fit px-1.5 py-0.5 rounded text-3xs font-bold font-mono ${
                                isHighDiscount 
                                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                  : 'bg-brand/10 text-brand'
                              }`}>
                                {c.discountPercent}% Off
                              </span>
                              <span className="text-3xs text-mute font-mono">₹{c.discountValue.toLocaleString('en-IN')}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium text-ink">{c.awardedByName}</p>
                              <span className={`inline-flex items-center px-1 rounded text-3xs font-mono font-bold mt-0.5 ${
                                c.awardedByRole === 'DIRECTOR'
                                  ? 'bg-purple-100 text-purple-700'
                                  : c.awardedByRole === 'PRINCIPAL'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {c.awardedByRole}
                              </span>
                            </div>
                          </td>
                          <td className="p-3">
                            <p className="text-ink italic max-w-[150px] truncate" title={c.reason}>{c.reason || 'No reason specified'}</p>
                            <p className="text-3xs text-mute mt-0.5">{new Date(c.createdAt).toLocaleDateString('en-IN')}</p>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleTableRemoveConcession(c.studentId, c.feeComponentName)}
                              className="text-mute hover:text-red-600 transition-colors p-1.5 rounded hover:bg-red-50 cursor-pointer"
                              title="Reverse/Delete concession"
                            >
                              <RotateCcw size={14} />
                            </button>
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
      )}

      {activeSubTab === 'award' && (
        <div className="space-y-5 animate-fadeIn">
          {/* Find Student Card */}
          <Card className="border-beige bg-paper text-ink shadow-md">
            <CardContent className="p-4 space-y-4">
              {/* Search inputs */}
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search student by Name or Admission ID..."
                    className="pl-9 border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 rounded-lg cursor-pointer gap-2 shrink-0 animate-pulse-subtle"
                >
                  {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  <span>Find Student</span>
                </Button>
              </div>

              {searchError && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-600 text-xs animate-fadeIn">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-1 border-t border-beige pt-3 animate-fadeIn">
                  <p className="text-3xs font-bold uppercase tracking-wider text-mute mb-2">Search Results</p>
                  {searchResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStudent(s.id)}
                      className="w-full text-left flex items-center justify-between p-3 rounded-lg border border-beige hover:border-brand/30 hover:bg-brand/5 transition-all cursor-pointer group animate-slideIn"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink group-hover:text-brand">{s.name}</p>
                        <p className="text-2xs text-mute mt-0.5 font-mono">
                          {s.admissionNo} &bull; Class {s.className}-{s.section}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-mute group-hover:text-brand" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {isLoadingStudent && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
              <span className="text-mute text-2xs font-semibold">Loading student concessions...</span>
            </div>
          )}

          {studentError && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs max-w-2xl mx-auto animate-fadeIn">
              <AlertCircle size={16} className="shrink-0" />
              <p>{studentError}</p>
            </div>
          )}

          {selectedStudent && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              {/* Column 1: Student Profile info */}
              <div className="space-y-4 lg:col-span-1">
                <Card className="border-beige bg-paper text-ink shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Student Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="flex items-center gap-3 border-b border-beige pb-3 mb-1">
                      <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-brand/10 border border-brand/30 text-brand font-bold text-base shrink-0">
                        {selectedStudent.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-ink text-sm">{selectedStudent.name}</p>
                        <p className="text-3xs text-mute font-mono">{selectedStudent.admissionNo}</p>
                      </div>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-beige/60">
                      <span className="text-mute">Class &amp; Section</span>
                      <span className="font-semibold text-ink">Class {selectedStudent.className}-{selectedStudent.section}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-beige/60">
                      <span className="text-mute">Division</span>
                      <span className="font-semibold text-ink capitalize">{selectedStudent.unit.name}</span>
                    </div>
                    <div className="flex justify-between py-1.5 border-b border-beige/60">
                      <span className="text-mute">Father&apos;s Name</span>
                      <span className="font-semibold text-ink">{selectedStudent.fatherName}</span>
                    </div>
                    <div className="flex justify-between py-1.5">
                      <span className="text-mute">Transport Mode</span>
                      <span className="font-semibold text-ink">
                        {selectedStudent.transportMode === 'BUS_SERVICE' ? 'School Bus' : 'Own Vehicle'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Column 2: Scholarships Form & List */}
              <div className="space-y-4 lg:col-span-2">
                {/* Active concessions list */}
                <Card className="border-brand/30 bg-brand/5 text-ink shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-brand">Active Scholarships</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {selectedStudent.concessions.length === 0 ? (
                      <p className="text-xs text-mute italic py-2">No scholarships or active concessions applied to this student.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedStudent.concessions.map((c: any) => (
                          <span key={c.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand/20 bg-paper text-2xs shadow-sm">
                            <span className="font-semibold text-ink">{c.feeComponentName}</span>
                            <span className="font-mono font-extrabold text-brand bg-brand/10 px-1.5 py-0.5 rounded">{Number(c.value)}% Off</span>
                            {c.reason && <span className="text-mute italic">&middot; {c.reason}</span>}
                            <button
                              onClick={() => handleRemoveConcession(c.feeComponentName)}
                              disabled={isSubmitting}
                              title="Remove scholarship"
                              className="ml-1 text-mute hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Award Form */}
                <Card className="border-beige bg-paper text-ink shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-mute">Award Scholarship</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {formError && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs">
                        <AlertCircle size={13} /> <span>{formError}</span>
                      </div>
                    )}
                    {formSuccess && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                        <CheckCircle2 size={13} /> <span>{formSuccess}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-2xs text-mute font-bold">Apply To Component</Label>
                        <select
                          value={targetComponent}
                          onChange={(e) => setTargetComponent(e.target.value)}
                          className="w-full h-9 bg-field border border-beige text-ink text-xs rounded-md px-2 focus:ring-1 focus:ring-brand focus:outline-none"
                        >
                          <option value="ALL">All Allocated Components</option>
                          {allocatedComponents.map((c: any) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-2xs text-mute font-bold">Scholarship Percent</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={pctInput}
                            onChange={(e) => setPctInput(e.target.value)}
                            className="pr-7 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono font-bold"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mute text-xs">%</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-2xs text-mute font-bold">Reason / Notes</Label>
                        <Input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="e.g. Merit Scholarship"
                          className="border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-beige pt-3">
                      <Button
                        onClick={handleAwardDiscount}
                        disabled={isSubmitting || isNaN(Number(pctInput)) || Number(pctInput) < 0 || Number(pctInput) > 100}
                        className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-5 rounded-lg cursor-pointer gap-2"
                      >
                        {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : <GraduationCap size={13} />}
                        <span>{isSubmitting ? 'Saving...' : Number(pctInput) === 0 ? 'Remove Scholarship' : `Grant ${Number(pctInput)}% Scholarship`}</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabId = 'structures' | 'collect' | 'receipts' | 'scholarships';

export default function FeesEnginePage() {
  const [activeTab, setActiveTab] = useState<TabId>('structures');
  const [allowedUnits, setAllowedUnits] = useState<string[]>([]);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.user.role || '');
          setAllowedUnits(data.user.accessUnits.filter((u: string) => !['transport', 'hostel'].includes(u)));
        }
      } catch {
        // Silent fallback
      } finally {
        setIsLoadingUser(false);
      }
    }
    fetchUser();
  }, []);

  const tabs = [
    { id: 'structures' as TabId, label: 'Fee Structures', icon: Layers },
    { id: 'collect' as TabId, label: 'Collect Payment', icon: IndianRupee },
    { id: 'receipts' as TabId, label: 'Receipt Log', icon: Receipt },
  ];
  if (userRole === 'DIRECTOR') {
    tabs.push({ id: 'scholarships' as TabId, label: 'Scholarships', icon: GraduationCap });
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <CreditCard size={22} className="text-brand" />
            Fees Engine
          </h1>
          <p className="text-xs text-mute mt-1">
            Manage fee structures, collect payments, and view double-entry receipt history.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-beige">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all cursor-pointer -mb-px ${
              activeTab === id
                ? 'border-brand text-brand'
                : 'border-transparent text-mute hover:text-label hover:border-[#dcd5c8]'
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {isLoadingUser ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
        </div>
      ) : (
        <>
          {activeTab === 'structures' && <FeeStructuresTab allowedUnits={allowedUnits} />}
          {activeTab === 'collect' && <CollectPaymentTab allowedUnits={allowedUnits} />}
          {activeTab === 'receipts' && <ReceiptLogTab allowedUnits={allowedUnits} />}
          {activeTab === 'scholarships' && userRole === 'DIRECTOR' && <ScholarshipsTab />}
        </>
      )}
    </div>
  );
}
