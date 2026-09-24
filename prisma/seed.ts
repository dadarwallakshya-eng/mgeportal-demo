// ─────────────────────────────────────────────────────────────
// MGE School Portal — Prisma Seed Script
// Run:  npx prisma db seed
// ─────────────────────────────────────────────────────────────

import "dotenv/config";
import { Role, StaffType, EmploymentType, Gender, Category, AccountType, RoomType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

// ─── Helper: deterministic UUIDs for seed data ───────────────
// We use fixed UUIDs so the seed is fully idempotent.
const IDS = {
  // Users
  adminUser:   "00000000-0000-4000-a000-000000000001",
  // Students
  student1:    "10000000-0000-4000-a000-000000000001",
  student2:    "10000000-0000-4000-a000-000000000002",
  student3:    "10000000-0000-4000-a000-000000000003",
  student4:    "10000000-0000-4000-a000-000000000004",
  student5:    "10000000-0000-4000-a000-000000000005",
  // Staff
  teacher1:    "20000000-0000-4000-a000-000000000001",
  teacher2:    "20000000-0000-4000-a000-000000000002",
  teacher3:    "20000000-0000-4000-a000-000000000003",
  driver1:     "20000000-0000-4000-a000-000000000010",
  officeStaff: "20000000-0000-4000-a000-000000000020",
  // Hostel rooms
  room1:       "30000000-0000-4000-a000-000000000001",
  room2:       "30000000-0000-4000-a000-000000000002",
} as const;

async function main() {
  console.log("ðŸŒ± Seeding MGE School Portal database â€¦\n");

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 1. UNITS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const units = [
    { id: "hindi",     name: "New Modern Sr. Sec. School" },
    { id: "english",   name: "Modern English School" },
    { id: "college",   name: "Modern Mahila Mahavidhyalaya" },
    { id: "hostel",    name: "Modern Hostel" },
    { id: "transport", name: "Transport" },
  ];

  for (const u of units) {
    await prisma.unit.upsert({
      where: { id: u.id },
      update: { name: u.name },
      create: u,
    });
  }
  console.log(`  âœ… ${units.length} units`);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 2. ADMIN USER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  await prisma.user.upsert({
    where: { id: IDS.adminUser },
    update: {},
    create: {
      id: IDS.adminUser,
      username: "admin",
      // bcrypt hash of 'admin123' â€” CHANGE IN PRODUCTION
      passwordHash: "$2b$12$DU5FAHlRVNZKjgRSD5RBTu6dFt/dfB4jacrGYOzC5ubvnjiqz4u/6",
      name: "Director Admin",
      role: Role.DIRECTOR,
      accessUnits: ["hindi", "english", "college", "hostel", "transport"],
    },
  });
  console.log("  âœ… Admin user (director)");

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 3. CHART OF ACCOUNTS (per unit)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const chartOfAccounts: { code: string; name: string; type: AccountType }[] = [
    { code: "1000", name: "Cash in Hand",               type: AccountType.ASSET },
    { code: "1100", name: "Bank Account",               type: AccountType.ASSET },
    { code: "1200", name: "Accounts Receivable - Fees", type: AccountType.ASSET },
    { code: "2000", name: "Accounts Payable",           type: AccountType.LIABILITY },
    { code: "2100", name: "Salary Payable",             type: AccountType.LIABILITY },
    { code: "3000", name: "Owner's Equity",             type: AccountType.EQUITY },
    { code: "3100", name: "Retained Earnings",          type: AccountType.EQUITY },
    { code: "4000", name: "Fee Revenue - Tuition",      type: AccountType.REVENUE },
    { code: "4100", name: "Fee Revenue - Admission",    type: AccountType.REVENUE },
    { code: "4200", name: "Fee Revenue - Transport",    type: AccountType.REVENUE },
    { code: "4300", name: "Fee Revenue - Hostel",       type: AccountType.REVENUE },
    { code: "4400", name: "Fee Revenue - Other",        type: AccountType.REVENUE },
    { code: "5000", name: "Salary Expense - Teachers",  type: AccountType.EXPENSE },
    { code: "5100", name: "Salary Expense - Staff",     type: AccountType.EXPENSE },
    { code: "5200", name: "Transport Expense - Fuel",   type: AccountType.EXPENSE },
    { code: "5300", name: "Transport Expense - Maintenance", type: AccountType.EXPENSE },
    { code: "5400", name: "Hostel Expense - Maintenance",    type: AccountType.EXPENSE },
    { code: "5500", name: "Utilities Expense",          type: AccountType.EXPENSE },
    { code: "5600", name: "Office Supplies Expense",    type: AccountType.EXPENSE },
    { code: "5700", name: "Miscellaneous Expense",      type: AccountType.EXPENSE },
  ];

  // Create the full chart for every unit
  const unitIds = units.map((u) => u.id);
  let accountCount = 0;

  for (const unitId of unitIds) {
    for (const acct of chartOfAccounts) {
      const accountCode = `${unitId.toUpperCase()}-${acct.code}`;
      await prisma.ledgerAccount.upsert({
        where: { accountCode },
        update: { name: acct.name, type: acct.type, unitId },
        create: {
          accountCode,
          name: acct.name,
          type: acct.type,
          unitId,
          currentBalance: 0,
        },
      });
      accountCount++;
    }
  }
  console.log(`  âœ… ${accountCount} ledger accounts (${chartOfAccounts.length} Ã— ${unitIds.length} units)`);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 4. SAMPLE STAFF
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const staffData = [
    {
      id: IDS.teacher1,
      unitId: "hindi",
      staffType: StaffType.TEACHER,
      name: "Rajesh Kumar Sharma",
      fatherName: "Shri Ramesh Sharma",
      roleOrDesignation: "Senior Teacher",
      department: "Mathematics",
      subject: "Mathematics",
      phone: "9876543210",
      email: "rajesh.sharma@mge.edu",
      dob: new Date("1985-03-15"),
      joiningDate: new Date("2015-07-01"),
      employmentType: EmploymentType.FULL_TIME,
      monthlyBaseSalary: 35000,
    },
    {
      id: IDS.teacher2,
      unitId: "hindi",
      staffType: StaffType.TEACHER,
      name: "Sunita Devi",
      fatherName: "Shri Mohan Lal",
      roleOrDesignation: "Teacher",
      department: "Hindi",
      subject: "Hindi Literature",
      phone: "9876543211",
      email: "sunita.devi@mge.edu",
      dob: new Date("1990-08-20"),
      joiningDate: new Date("2018-04-01"),
      employmentType: EmploymentType.FULL_TIME,
      monthlyBaseSalary: 28000,
    },
    {
      id: IDS.teacher3,
      unitId: "english",
      staffType: StaffType.TEACHER,
      name: "Priya Singh",
      fatherName: "Shri Anil Singh",
      roleOrDesignation: "Teacher",
      department: "English",
      subject: "English Language",
      phone: "9876543212",
      email: "priya.singh@mge.edu",
      dob: new Date("1988-11-05"),
      joiningDate: new Date("2016-06-15"),
      employmentType: EmploymentType.FULL_TIME,
      monthlyBaseSalary: 32000,
    },
    {
      id: IDS.driver1,
      unitId: "transport",
      staffType: StaffType.DRIVER,
      name: "Rampal Yadav",
      fatherName: "Shri Babulal Yadav",
      roleOrDesignation: "Bus Driver",
      phone: "9876543220",
      dob: new Date("1980-01-10"),
      joiningDate: new Date("2019-01-15"),
      employmentType: EmploymentType.FULL_TIME,
      monthlyBaseSalary: 18000,
      licenseNo: "UP32-DL-2019-001234",
    },
    {
      id: IDS.officeStaff,
      unitId: "hindi",
      staffType: StaffType.OTHER_STAFF,
      name: "Manoj Tiwari",
      fatherName: "Shri Suresh Tiwari",
      roleOrDesignation: "Office Clerk",
      department: "Administration",
      phone: "9876543230",
      dob: new Date("1992-06-25"),
      joiningDate: new Date("2020-03-01"),
      employmentType: EmploymentType.FULL_TIME,
      monthlyBaseSalary: 15000,
    },
  ];

  for (const s of staffData) {
    await prisma.staff.upsert({
      where: { id: s.id },
      update: {},
      create: s,
    });
  }
  console.log(`  âœ… ${staffData.length} staff members`);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 5. SAMPLE STUDENTS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const studentData = [
    {
      id: IDS.student1,
      unitId: "hindi",
      admissionNo: "NMS2025-00001",
      className: "5",
      section: "A",
      name: "Aarav Gupta",
      nameHindi: "आरव गुप्ता",
      gender: Gender.MALE,
      dob: new Date("2014-05-12"),
      fatherName: "Shri Vikash Gupta",
      motherName: "Smt. Anita Gupta",
      phone: "9800000001",
      fatherPhone: "9800000010",
      address: "123, Main Road, Gorakhpur",
      category: Category.GENERAL,
      admissionDate: new Date("2020-04-01"),
    },
    {
      id: IDS.student2,
      unitId: "hindi",
      admissionNo: "NMS2025-00002",
      className: "5",
      section: "A",
      name: "Kavya Mishra",
      nameHindi: "काव्या मिश्रा",
      gender: Gender.FEMALE,
      dob: new Date("2014-08-23"),
      fatherName: "Shri Pankaj Mishra",
      motherName: "Smt. Reena Mishra",
      phone: "9800000002",
      fatherPhone: "9800000020",
      address: "45, Nehru Nagar, Gorakhpur",
      category: Category.OBC,
      admissionDate: new Date("2020-04-01"),
    },
    {
      id: IDS.student3,
      unitId: "english",
      admissionNo: "MES2025-00001",
      className: "8",
      section: "A",
      name: "Rohan Verma",
      gender: Gender.MALE,
      dob: new Date("2011-11-30"),
      fatherName: "Shri Sunil Verma",
      phone: "9800000003",
      fatherPhone: "9800000030",
      address: "78, Gandhi Road, Gorakhpur",
      category: Category.GENERAL,
      admissionDate: new Date("2019-04-01"),
    },
    {
      id: IDS.student4,
      unitId: "english",
      admissionNo: "MES2025-00002",
      className: "8",
      section: "B",
      name: "Ananya Pandey",
      gender: Gender.FEMALE,
      dob: new Date("2011-02-14"),
      fatherName: "Shri Deepak Pandey",
      motherName: "Smt. Meera Pandey",
      phone: "9800000004",
      fatherPhone: "9800000040",
      address: "12, Station Road, Gorakhpur",
      category: Category.GENERAL,
      admissionDate: new Date("2019-04-01"),
    },
    {
      id: IDS.student5,
      unitId: "college",
      admissionNo: "MGC2025-00001",
      className: "B.A. 1st Year",
      section: "A",
      name: "Amit Patel",
      gender: Gender.MALE,
      dob: new Date("2006-07-19"),
      fatherName: "Shri Dinesh Patel",
      phone: "9800000005",
      fatherPhone: "9800000050",
      address: "34, University Road, Gorakhpur",
      category: Category.SC,
      admissionDate: new Date("2025-07-01"),
    },
  ];

  for (const s of studentData) {
    await prisma.student.upsert({
      where: { admissionNo: s.admissionNo },
      update: s,
      create: s,
    });
  }
  console.log(`  âœ… ${studentData.length} students`);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 6. SAMPLE HOSTEL ROOMS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const roomData = [
    {
      id: IDS.room1,
      roomNo: "G-101",
      floor: "Ground",
      capacity: 4,
      monthlyRent: 2500,
      type: RoomType.NON_AC,
    },
    {
      id: IDS.room2,
      roomNo: "F-201",
      floor: "First",
      capacity: 2,
      monthlyRent: 4000,
      type: RoomType.AC,
    },
  ];

  for (const r of roomData) {
    await prisma.hostelRoom.upsert({
      where: { id: r.id },
      update: {},
      create: r,
    });
  }
  console.log(`  âœ… ${roomData.length} hostel rooms`);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 7. SAMPLE BUS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const busId = "40000000-0000-4000-a000-000000000001";
  await prisma.bus.upsert({
    where: { id: busId },
    update: {},
    create: {
      id: busId,
      busNo: "UP-53-T-1234",
      route: "Gorakhpur City â†’ Campus (via Golghar, Mohaddipur)",
      driverId: IDS.driver1,
      seatingCapacity: 40,
    },
  });
  console.log("  âœ… 1 bus");

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // 8. SAMPLE FEE STRUCTURE (Hindi Unit, Class 5, 2025-26)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const feeStructureId = "50000000-0000-4000-a000-000000000001";
  await prisma.feeStructure.upsert({
    where: {
      unitId_className_academicYear: {
        unitId: "hindi",
        className: "5",
        academicYear: "2025-26",
      },
    },
    update: {},
    create: {
      id: feeStructureId,
      name: "Hindi Medium â€” Class 5 (2025-26)",
      unitId: "hindi",
      className: "5",
      academicYear: "2025-26",
    },
  });

  const feeComponents = [
    { id: "60000000-0000-4000-a000-000000000001", name: "Tuition Fee",   amount: 1500 },
    { id: "60000000-0000-4000-a000-000000000002", name: "Admission Fee", amount: 500 },
    { id: "60000000-0000-4000-a000-000000000003", name: "Exam Fee",      amount: 300 },
    { id: "60000000-0000-4000-a000-000000000004", name: "Computer Fee",  amount: 200 },
    { id: "60000000-0000-4000-a000-000000000005", name: "Activity Fee",  amount: 100 },
  ];

  for (const fc of feeComponents) {
    await prisma.feeComponent.upsert({
      where: { id: fc.id },
      update: {},
      create: {
        id: fc.id,
        feeStructureId,
        name: fc.name,
        amount: fc.amount,
      },
    });
  }
  console.log("  ✅ 1 fee structure with 5 components");

  // ── 9. SEED GOOGLE WHITELIST ──────────────────────────────────────
  const whitelistedEmails = [
    { email: "dadarwallakshya@gmail.com", name: "Lakshya Dadarwal" }
  ];

  for (const w of whitelistedEmails) {
    await prisma.googleWhitelist.upsert({
      where: { email: w.email },
      update: { name: w.name },
      create: w,
    });
  }
  console.log(`  ✅ Seeded ${whitelistedEmails.length} whitelisted Google accounts`);

  console.log("\n🎉 Seed complete!\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
