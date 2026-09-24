/**
 * @module api/export
 * @description API endpoint for exporting portal data (students, staff, fees, hostel, transport) to Excel.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import ExcelJS from 'exceljs';
import { getResidentAccount } from '@/lib/hostel';
import {
  StudentStatus,
  StaffStatus,
  StaffType,
  Gender,
  Category,
  TransportMode,
  TxnDirection,
  TxnCategory,
  PaymentMode,
} from '@prisma/client';

const INR_FORMAT = '"₹"#,##,##0.00;[Red]-"₹"#,##,##0.00';
const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF3A1577' }, // MGE Purple
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};
const BORDER_STYLE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFE3DCD2' } },
  left: { style: 'thin', color: { argb: 'FFE3DCD2' } },
  bottom: { style: 'thin', color: { argb: 'FFE3DCD2' } },
  right: { style: 'thin', color: { argb: 'FFE3DCD2' } },
};

function formatWorksheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ showGridLines: true }];

  // Header row
  const headerRow = sheet.getRow(1);
  headerRow.height = 26;
  headerRow.font = HEADER_FONT;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = BORDER_STYLE;
  });

  // Data rows
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 20;
    row.eachCell((cell) => {
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = { vertical: 'middle' };
      cell.border = BORDER_STYLE;
    });
  });
}

function autoFitColumns(sheet: ExcelJS.Worksheet) {
  if (!sheet.columns) return;
  sheet.columns.forEach((column) => {
    if (!column) return;
    let maxLength = 0;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      let length = 10;
      if (cell.value !== null && cell.value !== undefined) {
        if (typeof cell.value === 'object' && 'formula' in cell.value) {
          length = 15;
        } else {
          length = cell.value.toString().length;
        }
      }
      if (length > maxLength) {
        maxLength = length;
      }
    });
    column.width = Math.max(maxLength + 4, 12);
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Verify authentication ─────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');
    const accessUnitsRaw = request.headers.get('x-user-access-units');

    if (!userId || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const accessUnits: string[] = JSON.parse(accessUnitsRaw);
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type') || 'students';
    const unitParam = searchParams.get('unit') || 'all';
    const statusParam = searchParams.get('status') || undefined;
    const classParam = searchParams.get('class') || undefined;
    const sectionParam = searchParams.get('section') || undefined;
    const searchQuery = searchParams.get('search')?.trim() || '';
    const fromDate = searchParams.get('from') || undefined;
    const toDate = searchParams.get('to') || undefined;
    const typeParam = searchParams.get('typeFilter') || undefined; // staff type filter
    const categoryParam = searchParams.get('category') || undefined; // hostel expense category filter
    const directionParam = searchParams.get('direction') || undefined; // transport finance direction filter

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MGE Portal';
    workbook.created = new Date();

    let fileName = 'Export';

    // ── Enforce Access Validation by Type ─────────────────────────────────
    if (type.startsWith('hostel_')) {
      if (!accessUnits.includes('hostel')) {
        return NextResponse.json({ error: 'Hostel access required', code: 'FORBIDDEN' }, { status: 403 });
      }
    } else if (type.startsWith('transport_')) {
      if (!accessUnits.includes('transport')) {
        return NextResponse.json({ error: 'Transport access required', code: 'FORBIDDEN' }, { status: 403 });
      }
    }

    // ── Switch on Export Type ─────────────────────────────────────────────
    if (type === 'students') {
      const targetUnits = unitParam === 'all' ? accessUnits : [unitParam];
      const where: any = {
        unitId: { in: targetUnits },
      };
      if (statusParam && statusParam !== 'all') {
        where.status = statusParam as StudentStatus;
      }
      if (classParam && classParam !== 'all') {
        where.className = classParam;
      }
      if (sectionParam && sectionParam !== 'all') {
        where.section = sectionParam;
      }
      if (searchQuery) {
        where.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { nameHindi: { contains: searchQuery, mode: 'insensitive' } },
          { admissionNo: { contains: searchQuery, mode: 'insensitive' } },
          { fatherName: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      const students = await prisma.student.findMany({
        where,
        include: { unit: true },
        orderBy: [{ className: 'asc' }, { section: 'asc' }, { name: 'asc' }],
      });

      fileName = `Students_Export_${unitParam.toUpperCase()}`;
      const sheet = workbook.addWorksheet('Students');
      sheet.columns = [
        { header: 'Admission ID', key: 'admissionNo' },
        { header: 'Student Name', key: 'name' },
        { header: 'Name (Hindi)', key: 'nameHindi' },
        { header: 'Division', key: 'division' },
        { header: 'Class', key: 'class' },
        { header: 'Section', key: 'section' },
        { header: 'Gender', key: 'gender' },
        { header: 'Date of Birth', key: 'dob' },
        { header: 'Father Name', key: 'fatherName' },
        { header: 'Mother Name', key: 'motherName' },
        { header: 'Student Phone', key: 'phone' },
        { header: 'Father Phone', key: 'fatherPhone' },
        { header: 'Address', key: 'address' },
        { header: 'Aadhar No', key: 'aadharNo' },
        { header: 'Category', key: 'category' },
        { header: 'Admission Date', key: 'admissionDate' },
        { header: 'Discount (%)', key: 'discountPercent' },
        { header: 'Transport Mode', key: 'transportMode' },
        { header: 'Status', key: 'status' },
      ];

      for (const s of students) {
        sheet.addRow({
          admissionNo: s.admissionNo,
          name: s.name,
          nameHindi: s.nameHindi || '',
          division: s.unit.name,
          class: s.className,
          section: s.section,
          gender: s.gender,
          dob: s.dob ? new Date(s.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          fatherName: s.fatherName,
          motherName: s.motherName || '',
          phone: s.phone || '',
          fatherPhone: s.fatherPhone || '',
          address: s.address || '',
          aadharNo: s.aadharNo || '',
          category: s.category,
          admissionDate: s.admissionDate ? new Date(s.admissionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          discountPercent: Number(s.discountPercent),
          transportMode: s.transportMode,
          status: s.status,
        });
      }

      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'alumni' || type === 'early_leavers') {
      if (!['DIRECTOR', 'PRINCIPAL'].includes(userRole || '')) {
        return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
      }

      const targetUnits = unitParam === 'all' ? accessUnits : [unitParam];
      const where: any = {
        status: type === 'alumni' ? 'GRADUATED' : 'WITHDRAWN',
        unitId: { in: targetUnits },
      };

      if (searchQuery) {
        where.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { nameHindi: { contains: searchQuery, mode: 'insensitive' } },
          { admissionNo: { contains: searchQuery, mode: 'insensitive' } },
          { fatherName: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      const students = await prisma.student.findMany({
        where,
        include: {
          unit: true,
          feeAllocations: {
            include: {
              feeComponent: true,
            },
          },
          concessions: true,
        },
        orderBy: [{ className: 'asc' }, { name: 'asc' }],
      });

      const duesFilterParam = searchParams.get('duesFilter') || 'all';

      const alumniList = students.map((student) => {
        const concessionsMap = new Map<string, { type: string; value: number }>();
        for (const c of student.concessions) {
          concessionsMap.set(c.feeComponentName, { type: c.discountType, value: Number(c.value) });
        }

        let totalOrig = 0;
        let totalPaid = 0;
        let totalNet = 0;
        let balanceDue = 0;

        for (const alloc of student.feeAllocations) {
          const orig = Number(alloc.amountDue);
          const paid = Number(alloc.amountPaid);
          const conc = concessionsMap.get(alloc.feeComponent.name);
          let net = orig;
          if (conc) {
            if (conc.type === 'FIXED_AMOUNT') {
              net = Math.max(0, orig - conc.value);
            } else {
              net = orig * (1 - conc.value / 100);
            }
          }
          const bal = Math.max(0, net - paid);

          totalOrig += orig;
          totalPaid += paid;
          totalNet += net;
          balanceDue += bal;
        }

        return {
          student,
          totalOrig,
          totalPaid,
          balanceDue,
        };
      }).filter((a) => {
        if (duesFilterParam === 'with_dues' && a.balanceDue <= 0.005) return false;
        if (duesFilterParam === 'cleared' && a.balanceDue > 0.005) return false;
        return true;
      });

      fileName = type === 'alumni'
        ? `Alumni_Export_${unitParam.toUpperCase()}`
        : `Early_Leavers_Export_${unitParam.toUpperCase()}`;
      const sheet = workbook.addWorksheet(type === 'alumni' ? 'Alumni' : 'Early Leavers');
      sheet.columns = [
        { header: 'Admission ID', key: 'admissionNo' },
        { header: 'Student Name', key: 'name' },
        { header: 'Name (Hindi)', key: 'nameHindi' },
        { header: 'Division', key: 'division' },
        { header: 'Last Class', key: 'class' },
        { header: 'Gender', key: 'gender' },
        { header: 'Date of Birth', key: 'dob' },
        { header: 'Father Name', key: 'fatherName' },
        { header: 'Phone', key: 'phone' },
        { header: 'Father Phone', key: 'fatherPhone' },
        { header: 'Address', key: 'address' },
        { header: 'Aadhar No', key: 'aadharNo' },
        { header: 'Category', key: 'category' },
        { header: 'Admission Date', key: 'admissionDate' },
        { header: 'Total Invoiced', key: 'totalOrig' },
        { header: 'Total Paid', key: 'totalPaid' },
        { header: 'Outstanding Dues', key: 'balanceDue' },
        { header: 'Dues Status', key: 'duesStatus' },
      ];

      for (const a of alumniList) {
        const s = a.student;
        sheet.addRow({
          admissionNo: s.admissionNo,
          name: s.name,
          nameHindi: s.nameHindi || '',
          division: s.unit.name,
          class: s.className,
          gender: s.gender,
          dob: s.dob ? new Date(s.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          fatherName: s.fatherName,
          phone: s.phone || '',
          fatherPhone: s.fatherPhone || '',
          address: s.address || '',
          aadharNo: s.aadharNo || '',
          category: s.category,
          admissionDate: s.admissionDate ? new Date(s.admissionDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          totalOrig: a.totalOrig,
          totalPaid: a.totalPaid,
          balanceDue: a.balanceDue,
          duesStatus: a.balanceDue > 0.005 ? 'PENDING DUES' : 'CLEARED',
        });
      }

      for (const col of ['totalOrig', 'totalPaid', 'balanceDue']) {
        sheet.getColumn(col).numFmt = INR_FORMAT;
      }
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'staff') {
      if (!['DIRECTOR', 'PRINCIPAL'].includes(userRole || '')) {
        return NextResponse.json({ error: 'Insufficient permissions', code: 'FORBIDDEN' }, { status: 403 });
      }

      const targetUnits = unitParam === 'all' ? accessUnits : [unitParam];
      const where: any = {
        unitId: { in: targetUnits },
      };
      if (statusParam && statusParam !== 'all') {
        where.status = statusParam as StaffStatus;
      }
      if (typeParam && typeParam !== 'all') {
        where.staffType = typeParam as StaffType;
      }
      if (searchQuery) {
        where.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { staffNo: { contains: searchQuery, mode: 'insensitive' } },
          { roleOrDesignation: { contains: searchQuery, mode: 'insensitive' } },
          { department: { contains: searchQuery, mode: 'insensitive' } },
          { phone: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      const staffRows = await prisma.staff.findMany({
        where,
        include: { unit: true },
        orderBy: [{ staffType: 'asc' }, { name: 'asc' }],
      });

      fileName = `Staff_Export_${unitParam.toUpperCase()}`;
      const sheet = workbook.addWorksheet('Staff');
      sheet.columns = [
        { header: 'Staff No', key: 'staffNo' },
        { header: 'Staff Type', key: 'staffType' },
        { header: 'Name', key: 'name' },
        { header: 'Division', key: 'division' },
        { header: 'Designation', key: 'designation' },
        { header: 'Department', key: 'department' },
        { header: 'Subject', key: 'subject' },
        { header: 'Phone', key: 'phone' },
        { header: 'Email', key: 'email' },
        { header: 'Date of Birth', key: 'dob' },
        { header: 'Joining Date', key: 'joiningDate' },
        { header: 'Employment Type', key: 'employmentType' },
        { header: 'Base Salary', key: 'monthlyBaseSalary' },
        { header: 'Bank Account No', key: 'bankAccountNo' },
        { header: 'Aadhar No', key: 'aadharNo' },
        { header: 'PAN No', key: 'panNo' },
        { header: 'Status', key: 'status' },
      ];

      for (const s of staffRows) {
        sheet.addRow({
          staffNo: s.staffNo || '',
          staffType: s.staffType,
          name: s.name,
          division: s.unit.name,
          designation: s.roleOrDesignation || '',
          department: s.department || '',
          subject: s.subject || '',
          phone: s.phone || '',
          email: s.email || '',
          dob: s.dob ? new Date(s.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          joiningDate: s.joiningDate ? new Date(s.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '',
          employmentType: s.employmentType,
          monthlyBaseSalary: Number(s.monthlyBaseSalary),
          bankAccountNo: s.bankAccountNo || '',
          aadharNo: s.aadharNo || '',
          panNo: s.panNo || '',
          status: s.status,
        });
      }

      sheet.getColumn('monthlyBaseSalary').numFmt = INR_FORMAT;
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'fees') {
      const targetUnits = unitParam === 'all' ? accessUnits : [unitParam];
      const where: any = {
        student: { unitId: { in: targetUnits } },
      };
      if (fromDate) {
        where.paymentDate = { ...where.paymentDate, gte: new Date(fromDate) };
      }
      if (toDate) {
        where.paymentDate = { ...where.paymentDate, lte: new Date(toDate) };
      }
      if (searchQuery) {
        where.OR = [
          { receiptNo: { contains: searchQuery, mode: 'insensitive' } },
          { student: { name: { contains: searchQuery, mode: 'insensitive' } } },
          { student: { admissionNo: { contains: searchQuery, mode: 'insensitive' } } },
        ];
      }

      const receipts = await prisma.feePayment.findMany({
        where,
        include: { student: { include: { unit: true } } },
        orderBy: { paymentDate: 'desc' },
      });

      fileName = `Fees_Receipts_${unitParam.toUpperCase()}`;
      const sheet = workbook.addWorksheet('Receipts');
      sheet.columns = [
        { header: 'Receipt No', key: 'receiptNo' },
        { header: 'Admission ID', key: 'admissionNo' },
        { header: 'Student Name', key: 'studentName' },
        { header: 'Class', key: 'class' },
        { header: 'Section', key: 'section' },
        { header: 'Division', key: 'division' },
        { header: 'Payment Date', key: 'paymentDate' },
        { header: 'Payment Mode', key: 'paymentMode' },
        { header: 'Total Amount', key: 'totalAmount' },
      ];

      for (const r of receipts) {
        sheet.addRow({
          receiptNo: r.receiptNo,
          admissionNo: r.student.admissionNo,
          studentName: r.student.name,
          class: r.student.className,
          section: r.student.section,
          division: r.student.unit.name,
          paymentDate: new Date(r.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          paymentMode: r.paymentMode,
          totalAmount: Number(r.totalAmount),
        });
      }

      sheet.getColumn('totalAmount').numFmt = INR_FORMAT;
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'hostel_residents') {
      const where: any = {
        status: (statusParam || 'ACTIVE') as any,
      };
      if (searchQuery) {
        where.student = {
          OR: [
            { name: { contains: searchQuery, mode: 'insensitive' } },
            { admissionNo: { contains: searchQuery, mode: 'insensitive' } },
          ],
        };
      }

      const residents = await prisma.hostelResident.findMany({
        where,
        include: { student: { include: { unit: true } }, room: true },
        orderBy: { createdAt: 'desc' },
      });

      fileName = 'Hostel_Residents_Export';
      const sheet = workbook.addWorksheet('Residents');
      sheet.columns = [
        { header: 'Admission ID', key: 'admissionNo' },
        { header: 'Student Name', key: 'studentName' },
        { header: 'Class', key: 'class' },
        { header: 'Section', key: 'section' },
        { header: 'Division', key: 'division' },
        { header: 'Room', key: 'room' },
        { header: 'Check-in Date', key: 'checkInDate' },
        { header: 'Annual Fee', key: 'annualFee' },
        { header: 'Discount Type', key: 'discountType' },
        { header: 'Discount Value', key: 'discountValue' },
        { header: 'Daily-use Given', key: 'dailyUseGiven' },
        { header: 'Paid', key: 'paid' },
        { header: 'Balance Due', key: 'balanceDue' },
      ];

      for (const r of residents) {
        const account = await getResidentAccount(r.studentId, Number(r.annualFee), r.discountType, Number(r.discountValue));
        sheet.addRow({
          admissionNo: r.student.admissionNo,
          studentName: r.student.name,
          class: r.student.className,
          section: r.student.section,
          division: r.student.unit.name,
          room: r.room ? `${r.room.roomNo} (${r.room.floor})` : '—',
          checkInDate: new Date(r.checkInDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          annualFee: Number(r.annualFee),
          discountType: r.discountType || 'NONE',
          discountValue: Number(r.discountValue || 0),
          dailyUseGiven: account.dailyUseGiven,
          paid: account.paid,
          balanceDue: account.balanceDue,
        });
      }

      for (const col of ['annualFee', 'discountValue', 'dailyUseGiven', 'paid', 'balanceDue']) {
        sheet.getColumn(col).numFmt = INR_FORMAT;
      }
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'hostel_staff') {
      const where: any = {
        status: (statusParam || 'ACTIVE') as any,
      };
      const staff = await prisma.hostelStaff.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      fileName = 'Hostel_Staff_Export';
      const sheet = workbook.addWorksheet('Hostel Staff');
      sheet.columns = [
        { header: 'Name', key: 'name' },
        { header: 'Role', key: 'role' },
        { header: 'Father Name', key: 'fatherName' },
        { header: 'Phone', key: 'phone' },
        { header: 'Address', key: 'address' },
        { header: 'Monthly Salary', key: 'monthlySalary' },
        { header: 'Join Date', key: 'joinDate' },
        { header: 'Aadhar No', key: 'aadharNo' },
        { header: 'PAN No', key: 'panNo' },
        { header: 'Bank Account No', key: 'bankAccountNo' },
        { header: 'Status', key: 'status' },
      ];

      for (const s of staff) {
        sheet.addRow({
          name: s.name,
          role: s.role,
          fatherName: s.fatherName || '',
          phone: s.phone || '',
          address: s.address || '',
          monthlySalary: Number(s.monthlySalary),
          joinDate: new Date(s.joinDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          aadharNo: s.aadharNo || '',
          panNo: s.panNo || '',
          bankAccountNo: s.bankAccountNo || '',
          status: s.status,
        });
      }

      sheet.getColumn('monthlySalary').numFmt = INR_FORMAT;
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'hostel_finance') {
      const where: any = {
        unitId: 'hostel',
        isDeleted: false,
      };
      if (categoryParam === 'INCOME') {
        where.direction = 'INCOME';
      } else if (categoryParam === 'all') {
        where.direction = 'EXPENSE';
      } else if (categoryParam) {
        where.category = categoryParam as TxnCategory;
        where.direction = 'EXPENSE';
      }
      const txns = await prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
      });

      fileName = `Hostel_Finance_${categoryParam || 'ALL'}`;
      const sheet = workbook.addWorksheet('Finance');
      sheet.columns = [
        { header: 'Date', key: 'date' },
        { header: 'Category', key: 'category' },
        { header: 'Description', key: 'description' },
        { header: 'Direction', key: 'direction' },
        { header: 'Amount', key: 'amount' },
        { header: 'Reference No', key: 'referenceNo' },
        { header: 'Payment Mode', key: 'paymentMode' },
      ];

      for (const t of txns) {
        sheet.addRow({
          date: new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          category: t.category,
          description: t.description || '',
          direction: t.direction,
          amount: Number(t.amount),
          referenceNo: t.referenceNo || '',
          paymentMode: t.paymentMode || '',
        });
      }

      sheet.getColumn('amount').numFmt = INR_FORMAT;
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'transport_stations') {
      const where: any = {};
      if (searchQuery) {
        where.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { stationNo: isNaN(Number(searchQuery)) ? undefined : Number(searchQuery) },
        ].filter(Boolean);
      }
      const stations = await prisma.busStation.findMany({
        where,
        include: { _count: { select: { students: true } } },
        orderBy: { stationNo: 'asc' },
      });

      fileName = 'Transport_Stations_Export';
      const sheet = workbook.addWorksheet('Bus Stations');
      sheet.columns = [
        { header: 'Station No', key: 'stationNo' },
        { header: 'Station Name', key: 'name' },
        { header: 'Per Month', key: 'perMonth' },
        { header: 'Per Year', key: 'perYear' },
        { header: 'Active Riders', key: 'riders' },
        { header: 'Status', key: 'status' },
      ];

      for (const s of stations) {
        sheet.addRow({
          stationNo: s.stationNo,
          name: s.name,
          perMonth: Number(s.perMonth),
          perYear: Number(s.perYear),
          riders: s._count?.students || 0,
          status: s.isActive ? 'Active' : 'Inactive',
        });
      }

      sheet.getColumn('perMonth').numFmt = INR_FORMAT;
      sheet.getColumn('perYear').numFmt = INR_FORMAT;
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'transport_fleet') {
      const buses = await prisma.bus.findMany({
        include: { driver: true },
        orderBy: { busNo: 'asc' },
      });

      fileName = 'Transport_Fleet_Export';
      const sheet = workbook.addWorksheet('Fleet');
      sheet.columns = [
        { header: 'Bus No', key: 'busNo' },
        { header: 'Route', key: 'route' },
        { header: 'Seating Capacity', key: 'seatingCapacity' },
        { header: 'Driver Name', key: 'driverName' },
        { header: 'Driver Phone', key: 'driverPhone' },
        { header: 'Driver License', key: 'driverLicense' },
        { header: 'Status', key: 'status' },
      ];

      for (const b of buses) {
        sheet.addRow({
          busNo: b.busNo,
          route: b.route,
          seatingCapacity: b.seatingCapacity,
          driverName: b.driver.name,
          driverPhone: b.driver.phone || '',
          driverLicense: b.driver.licenseNo || '',
          status: b.status,
        });
      }

      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'transport_drivers') {
      const drivers = await prisma.staff.findMany({
        where: { staffType: 'DRIVER', status: 'ACTIVE' },
        orderBy: { name: 'asc' },
      });

      const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const now = new Date();
      const curMonth = MONTHS[now.getMonth()];
      const curYear = now.getFullYear();

      const buses = await prisma.bus.findMany();

      const withBuses = await Promise.all(drivers.map(async (d) => {
        const paidAgg = await prisma.transaction.aggregate({
          where: { staffId: d.id, category: 'SALARY', periodMonth: curMonth, periodYear: curYear },
          _sum: { amount: true },
        });
        const paidThisMonth = Number(paidAgg._sum.amount || 0);
        const monthly = Number(d.monthlyBaseSalary);
        const assigned = buses.filter(b => b.driverId === d.id).map(b => b.busNo).join(', ');
        return { ...d, paidThisMonth, remainingThisMonth: Math.max(0, monthly - paidThisMonth), assignedBuses: assigned };
      }));

      fileName = 'Transport_Drivers_Export';
      const sheet = workbook.addWorksheet('Drivers');
      sheet.columns = [
        { header: 'Staff No', key: 'staffNo' },
        { header: 'Driver Name', key: 'name' },
        { header: 'Phone', key: 'phone' },
        { header: 'License No', key: 'licenseNo' },
        { header: 'Monthly Base Salary', key: 'monthlySalary' },
        { header: 'Paid This Month', key: 'paidThisMonth' },
        { header: 'Remaining Salary', key: 'remainingThisMonth' },
        { header: 'Assigned Buses', key: 'assignedBuses' },
        { header: 'Status', key: 'status' },
      ];

      for (const d of withBuses) {
        sheet.addRow({
          staffNo: d.staffNo || '',
          name: d.name,
          phone: d.phone || '',
          licenseNo: d.licenseNo || '',
          monthlySalary: Number(d.monthlyBaseSalary),
          paidThisMonth: d.paidThisMonth,
          remainingThisMonth: d.remainingThisMonth,
          assignedBuses: d.assignedBuses,
          status: d.status,
        });
      }

      for (const col of ['monthlySalary', 'paidThisMonth', 'remainingThisMonth']) {
        sheet.getColumn(col).numFmt = INR_FORMAT;
      }
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else if (type === 'transport_finance') {
      const where: any = {
        unitId: 'transport',
        isDeleted: false,
      };
      if (directionParam && directionParam !== 'all') {
        where.direction = directionParam as any;
      }
      const txns = await prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
      });

      fileName = `Transport_Finance_${directionParam || 'ALL'}`;
      const sheet = workbook.addWorksheet('Finance');
      sheet.columns = [
        { header: 'Date', key: 'date' },
        { header: 'Category', key: 'category' },
        { header: 'Description', key: 'description' },
        { header: 'Direction', key: 'direction' },
        { header: 'Amount', key: 'amount' },
        { header: 'Reference No', key: 'referenceNo' },
        { header: 'Payment Mode', key: 'paymentMode' },
        { header: 'Source', key: 'source' },
      ];

      for (const t of txns) {
        sheet.addRow({
          date: new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          category: t.category,
          description: t.description || '',
          direction: t.direction,
          amount: Number(t.amount),
          referenceNo: t.referenceNo || '',
          paymentMode: t.paymentMode || '',
          source: t.source || '',
        });
      }

      sheet.getColumn('amount').numFmt = INR_FORMAT;
      formatWorksheet(sheet);
      autoFitColumns(sheet);

    } else {
      return NextResponse.json({ error: 'Invalid export type', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const finalFileName = `${fileName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${finalFileName}.xlsx"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (error) {
    console.error('[EXPORT_GET] Internal error:', error);
    return NextResponse.json(
      { error: 'An error occurred while generating the export file.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
