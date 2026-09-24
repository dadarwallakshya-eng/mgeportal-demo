'use client';

import React from 'react';
import { X, Printer, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: {
    id: string;
    direction: 'INCOME' | 'EXPENSE';
    category: string;
    amount: number | string;
    date: string;
    description?: string | null;
    referenceNo?: string | null;
    paymentMode?: string | null;
    unit?: { name: string } | null;
    student?: {
      name: string;
      admissionNo: string;
      fatherName: string;
      className: string;
      section: string;
    } | null;
    staff?: {
      name: string;
      staffNo: string;
      department: string;
      roleOrDesignation: string;
    } | null;
  } | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  FEE: 'Academic Fee',
  HOSTEL_FEE: 'Hostel Boarding Fee',
  OTHER_INCOME: 'Other Revenue Income',
  SALARY: 'Staff Salary Payout',
  HOSTEL_SALARY: 'Hostel Staff Salary',
  MESS: 'Hostel Mess Spend',
  LAUNDRY: 'Laundry Services Spend',
  DAILY_USE: 'Pocket Money Payout',
  TRANSPORT: 'Transport Fleet / Fuel Spend',
  OTHER_EXPENSE: 'General Expenses',
};

// Indian Numbering System Amount to Words Translator
function amountToWords(num: number): string {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (!num || isNaN(num) || num <= 0) return 'Zero';

  function convertLessThanThousand(n: number): string {
    if (n < 20) return a[n];
    const digit = n % 10;
    if (n < 100) return b[Math.floor(n / 10)] + (digit ? ' ' + a[digit] : '');
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return a[hundred] + ' Hundred' + (rest ? ' and ' + convertLessThanThousand(rest) : '');
  }

  let words = '';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;

  if (crore) words += convertLessThanThousand(crore) + ' Crore ';
  if (lakh) words += convertLessThanThousand(lakh) + ' Lakh ';
  if (thousand) words += convertLessThanThousand(thousand) + ' Thousand ';
  if (num) words += convertLessThanThousand(num);

  return (words.trim() + ' Rupees Only').replace(/\s+/g, ' ');
}

// Reusable Receipt Card Component (to output identical side-by-side copies)
function ReceiptCard({
  transaction,
  amt,
  amtInWords,
  copyLabel
}: {
  transaction: any;
  amt: number;
  amtInWords: string;
  copyLabel: string;
}) {
  return (
    <div
      className="receipt bg-white border border-[#e6e4f2] text-[#26263a] font-sans relative select-none flex flex-col justify-between p-4.5 space-y-3 flex-shrink-0"
      style={{
        width: '132mm',
        height: '180mm',
        boxShadow: '0 10px 25px rgba(36, 31, 107, 0.05)',
        fontFamily: "'Public Sans', sans-serif",
        boxSizing: 'border-box'
      }}
    >
      {/* Watermark Logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] grayscale select-none">
        <img src="/logo.jpg" alt="Watermark" className="w-[55mm]" />
      </div>

      <div className="space-y-3 relative z-10 flex-1 flex flex-col justify-between">
        
        {/* 1. LETTERHEAD */}
        <div className="flex items-center gap-3 border-b border-[#e6e4f2] pb-2 relative">
          <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-[#e6e4f2] bg-slate-50 flex-shrink-0 flex items-center justify-center">
            <img src="/logo.jpg" alt="Logo" className="object-contain p-0.5 w-full h-full" />
          </div>
          <div className="min-w-0 flex-1 pr-16">
            <h1 className="text-xs font-black text-[#241f6b] leading-tight font-serif tracking-wide uppercase" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Modern Group of Education
            </h1>
            <p className="text-[7.5px] text-[#71708c] font-semibold leading-relaxed">
              Kuchaman City, Nagaur, Rajasthan - 341508
            </p>
            <p className="text-[7px] text-[#71708c] font-medium leading-none">
              Phone: +91 9414XXXXXX | Email: contact@mgeschool.in
            </p>
          </div>
          {/* Copy Identifier Badge */}
          <div className="absolute top-0 right-0 bg-[#fdf6e0] border border-[#f2b41c] text-[#d99a00] text-[7.5px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider">
            {copyLabel}
          </div>
        </div>

        {/* 2. RECEIPT TITLE */}
        <div className="text-center py-0.5">
          <span className="text-[9.5px] font-black uppercase tracking-widest text-[#241f6b] border-b border-[#f2b41c] pb-0.5">
            Payment Receipt
          </span>
        </div>

        {/* 3. TRANSACTION METADATA */}
        {(() => {
          const safeDateStr = typeof transaction.date === 'string'
            ? transaction.date
            : transaction.date instanceof Date
              ? transaction.date.toISOString()
              : String(transaction.date || '');
          const dateClean = safeDateStr ? safeDateStr.replace(/-/g, '').slice(2, 6) : '0000';
          const safeTxnId = (transaction.id || 'XXXX').slice(0, 4).toUpperCase();
          const receiptNo = `REC-${dateClean}-${safeTxnId}`;

          const formattedDate = (() => {
            try {
              const d = new Date(transaction.date);
              return isNaN(d.getTime()) ? String(transaction.date || '—') : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            } catch {
              return String(transaction.date || '—');
            }
          })();

          return (
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-0.5 text-[8.5px] bg-[#fcfaf5] p-2 rounded-lg border border-[#e8dfcf]">
              <div className="flex justify-between">
                <span className="text-[#71708c] font-semibold">Receipt No:</span>
                <span className="font-bold text-[#26263a] font-mono text-[8px]">{receiptNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71708c] font-semibold">Date:</span>
                <span className="font-bold text-[#26263a]">{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71708c] font-semibold">Payment Mode:</span>
                <span className="font-bold text-[#26263a]">{transaction.paymentMode || 'CASH'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71708c] font-semibold">Reference No:</span>
                <span className="font-bold text-[#26263a] font-mono text-[8px] truncate max-w-[85px]">{transaction.referenceNo || '—'}</span>
              </div>
              <div className="col-span-2 flex justify-between border-t border-[#e6e4f2]/40 pt-1 mt-0.5">
                <span className="text-[#71708c] font-semibold">Academic Division:</span>
                <span className="font-bold text-brand uppercase text-[8px]">{transaction.unit?.name || 'Cross-Division Ledger'}</span>
              </div>
            </div>
          );
        })()}

        {/* 4. PAYEE DETAILS */}
        {transaction.student ? (
          <div className="space-y-0.5 border-t border-[#e6e4f2] pt-2">
            <h4 className="text-[7.5px] font-bold text-[#241f6b] uppercase tracking-wider">Payee Information (Student)</h4>
            <div className="grid grid-cols-2 gap-y-0.5 text-[8.5px] pl-1">
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Student Name:</span>
                <span className="font-bold text-[#26263a] uppercase">{transaction.student.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Admission ID:</span>
                <span className="font-bold text-[#26263a] font-mono text-[8px]">{transaction.student.admissionNo}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Father's Name:</span>
                <span className="font-bold text-[#26263a] uppercase">{transaction.student.fatherName}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Class & Section:</span>
                <span className="font-bold text-[#26263a]">Class {transaction.student.className} - {transaction.student.section}</span>
              </div>
            </div>
          </div>
        ) : transaction.staff ? (
          <div className="space-y-0.5 border-t border-[#e6e4f2] pt-2">
            <h4 className="text-[7.5px] font-bold text-[#241f6b] uppercase tracking-wider">Payee Information (Employee)</h4>
            <div className="grid grid-cols-2 gap-y-0.5 text-[8.5px] pl-1">
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Staff Name:</span>
                <span className="font-bold text-[#26263a] uppercase">{transaction.staff.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Employee ID:</span>
                <span className="font-bold text-[#26263a] font-mono text-[8px]">{transaction.staff.staffNo}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Department:</span>
                <span className="font-bold text-[#26263a]">{transaction.staff.department}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[#71708c] w-18 flex-shrink-0">Designation:</span>
                <span className="font-bold text-[#26263a]">{transaction.staff.roleOrDesignation}</span>
              </div>
            </div>
          </div>
        ) : transaction.description ? (
          <div className="space-y-0.5 border-t border-[#e6e4f2] pt-2">
            <h4 className="text-[7.5px] font-bold text-[#241f6b] uppercase tracking-wider">Transaction Context</h4>
            <div className="text-[8.5px] pl-1 flex gap-2">
              <span className="text-[#71708c] w-18 flex-shrink-0">Description:</span>
              <span className="font-bold text-[#26263a]">{transaction.description}</span>
            </div>
          </div>
        ) : null}

        {/* 5. TRANSACTION TABLE */}
        <div className="border border-[#e6e4f2] rounded-lg overflow-hidden mt-1">
          <table className="w-full text-left text-[8.5px]">
            <thead>
              <tr className="bg-[#fcfaf5] text-[#241f6b] font-bold border-b border-[#e6e4f2] uppercase tracking-wider">
                <th className="p-1.5">Category & Description</th>
                <th className="p-1.5 text-right w-20">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e4f2]">
              <tr>
                <td className="p-1.5">
                  <span className="font-bold text-[#26263a] block">
                    {CATEGORY_LABELS[transaction.category] || transaction.category}
                  </span>
                  {transaction.description && (
                    <span className="text-[#71708c] text-[8px] block mt-0.5">{transaction.description}</span>
                  )}
                </td>
                <td className="p-1.5 text-right font-mono font-bold text-[#26263a]">
                  ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
              <tr className="bg-[#fcfaf5]/50 font-bold border-t border-[#e6e4f2]">
                <td className="p-1.5 text-right uppercase tracking-wider text-[#71708c] text-[7.5px]">Total Paid:</td>
                <td className="p-1.5 text-right font-mono text-[9px] text-[#241f6b]">
                  ₹{amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 6. AMOUNT IN WORDS */}
        <div className="flex gap-2 items-baseline text-[8.5px] border-b border-[#e6e4f2] pb-2 pt-0.5">
          <span className="text-[#71708c] font-semibold flex-shrink-0">Amount in Words:</span>
          <span className="font-bold text-[#241f6b] border-b border-dotted border-[#b9b6d8] flex-1 leading-normal pb-0.5 italic">
            {amtInWords}
          </span>
        </div>
      </div>

      {/* 7. SIGNATURES & FOOTER */}
      <div className="pt-1.5 space-y-3.5 pb-2">
        <div className="grid grid-cols-2 gap-4 text-[8.5px] pt-3">
          <div className="text-center">
            <div className="mx-auto w-28 border-b border-dotted border-[#b9b6d8] mb-1" />
            <span className="text-[#71708c] font-semibold">Signature of Payee</span>
          </div>
          <div className="text-center">
            <div className="mx-auto w-28 border-b border-dotted border-[#b9b6d8] mb-1" />
            <span className="text-[#71708c] font-semibold">Authorized Signatory</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptModal({ isOpen, onClose, transaction }: ReceiptModalProps) {
  if (!isOpen || !transaction) return null;

  const amt = Number(transaction.amount);
  const amtInWords = amountToWords(Math.floor(amt));

  const isStaff = !!transaction.staff || ['SALARY', 'HOSTEL_SALARY'].includes(transaction.category);
  const unitNameLower = (transaction.unit?.name || '').toLowerCase();
  const unitIdLower = (transaction.unit?.id || '').toLowerCase();

  const isHostel = unitIdLower.includes('hostel') || unitNameLower.includes('hostel') || ['HOSTEL_FEE', 'HOSTEL_SALARY', 'MESS', 'LAUNDRY', 'DAILY_USE', 'GHAR', 'SCHOOL', 'RELIGIOUS_SOCIAL'].includes(transaction.category);
  const isCollege = unitNameLower.includes('college') || unitIdLower.includes('college');

  const payeeCopyLabel = isStaff ? 'STAFF COPY' : 'STUDENT COPY';
  const officeCopyLabel = isHostel ? 'HOSTEL COPY' : isCollege ? 'COLLEGE COPY' : 'SCHOOL COPY';

  const handlePrint = () => {
    // Generate dynamic filename (e.g. PRIYA SINGH_REC-2007-83EE.pdf)
    const payeeName = transaction.student?.name || transaction.staff?.name || 'Transaction';
    const safeDateStr = typeof transaction.date === 'string'
      ? transaction.date
      : transaction.date instanceof Date
        ? transaction.date.toISOString()
        : String(transaction.date || '');
    const dateClean = safeDateStr ? safeDateStr.replace(/-/g, '').slice(2, 6) : '0000';
    const safeTxnId = (transaction.id || 'XXXX').slice(0, 4).toUpperCase();
    const receiptNo = `REC-${dateClean}-${safeTxnId}`;
    const cleanPayeeName = payeeName.replace(/[^a-zA-Z0-9]/g, ' ').trim().replace(/\s+/g, '_');
    const printTitle = `${cleanPayeeName}_${receiptNo}`;

    // Temporarily replace page title so print dialog defaults to this file name
    const originalTitle = document.title;
    document.title = printTitle;

    // Trigger Native Print Dialog
    window.print();

    // Restore original page title after a short delay
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      
      {/* Print Stylesheet injection */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm 8mm !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            height: 100% !important;
            overflow: hidden !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden !important;
          }
          .print-container, .print-container * {
            visibility: visible !important;
          }
          .print-container {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 281mm !important;
            height: 194mm !important;
            margin: 0 !important;
            padding: 4mm 4mm !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            background: #fff !important;
            box-sizing: border-box !important;
            z-index: 99999 !important;
          }
          .receipt {
            width: 132mm !important;
            height: 180mm !important;
            border: 1px dashed #b9b6d8 !important;
            padding: 4mm 4.5mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            background: #fff !important;
          }
          .print-divider {
            display: block !important;
            height: 180mm !important;
            border-left: 2px dashed #b9b6d8 !important;
            margin: 0 2mm !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      {/* Modal Card wrapper */}
      <div className="w-full max-w-[95vw] lg:max-w-[310mm] rounded-xl border border-beige bg-paper text-ink shadow-2xl flex flex-col max-h-[95vh] overflow-y-auto animate-in fade-in zoom-in-95">
        
        {/* Modal Action Header */}
        <div className="flex items-center justify-between border-b border-beige px-4 py-3 text-ink bg-paper sticky top-0 z-20 no-print">
          <span className="text-xs font-bold uppercase tracking-wider text-brand">Transaction Receipt Preview</span>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-8 px-3 gap-1.5 rounded-lg cursor-pointer"
            >
              <Printer size={13} />
              <span>Print Dual Copies</span>
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              className="h-8 w-8 p-0 text-mute hover:bg-cream rounded-full"
            >
              <X size={15} />
            </Button>
          </div>
        </div>

        {/* Receipt container (dual column on desktop, column-stacked on mobile) */}
        <div className="p-6 bg-cream/35 overflow-y-auto flex flex-col lg:flex-row items-center justify-center gap-6 print-container">
          <ReceiptCard transaction={transaction} amt={amt} amtInWords={amtInWords} copyLabel={payeeCopyLabel} />
          <div className="hidden lg:block h-[180mm] border-l-2 border-dashed border-[#b9b6d8] print-divider" />
          <ReceiptCard transaction={transaction} amt={amt} amtInWords={amtInWords} copyLabel={officeCopyLabel} />
        </div>

      </div>
    </div>
  );
}
