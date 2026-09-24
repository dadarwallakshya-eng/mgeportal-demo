import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('ERROR: Please specify the path to the backup ZIP file.');
    console.log('Usage: npm run db:restore <path_to_backup.zip>');
    process.exit(1);
  }

  const backupPath = path.resolve(args[0]);
  if (!fs.existsSync(backupPath)) {
    console.error(`ERROR: Backup file not found at path: ${backupPath}`);
    process.exit(1);
  }

  console.log(`Starting restore from archive: ${backupPath}...`);

  const zip = new AdmZip(backupPath);
  const getJsonFromZip = (fileName: string): any[] => {
    const entry = zip.getEntry(fileName);
    if (!entry) {
      console.warn(`Warning: Entry ${fileName} not found in zip archive.`);
      return [];
    }
    return JSON.parse(entry.getData().toString('utf8'));
  };

  // ── Read all data from ZIP archive ───────────────────────────────────────
  const units = getJsonFromZip('units.json');
  const users = getJsonFromZip('users.json');
  const googleWhitelists = getJsonFromZip('google_whitelists.json');
  const systemSettings = getJsonFromZip('system_settings.json');
  const students = getJsonFromZip('students.json');
  const feeStructures = getJsonFromZip('fee_structures.json');
  const feeComponents = getJsonFromZip('fee_components.json');
  const concessions = getJsonFromZip('student_concessions.json');
  const allocations = getJsonFromZip('fee_allocations.json');
  const feePayments = getJsonFromZip('fee_payments.json');
  const feePaymentDetails = getJsonFromZip('fee_payment_details.json');
  const staff = getJsonFromZip('staff.json');
  const salarySlips = getJsonFromZip('salary_slips.json');
  const ledgerAccounts = getJsonFromZip('ledger_accounts.json');
  const journalEntries = getJsonFromZip('journal_entries.json');
  const transactionLegs = getJsonFromZip('transaction_legs.json');
  const budgets = getJsonFromZip('budgets.json');
  const buses = getJsonFromZip('buses.json');
  const busStations = getJsonFromZip('bus_stations.json');
  const hostelRooms = getJsonFromZip('hostel_rooms.json');
  const hostelAllocations = getJsonFromZip('hostel_allocations.json');
  const transactions = getJsonFromZip('transactions.json');
  const hostelResidents = getJsonFromZip('hostel_residents.json');
  const hostelStaff = getJsonFromZip('hostel_staff.json');
  const admissionCounters = getJsonFromZip('admission_counters.json');
  const discountLogs = getJsonFromZip('student_discount_logs.json');
  const staffCounters = getJsonFromZip('staff_counters.json');
  const notifications = getJsonFromZip('notifications.json');
  const editLogs = getJsonFromZip('transaction_edit_logs.json');

  console.log('Read all table files from zip archive successfully.');

  // ── Database Purge Phase (in reverse constraint order) ──────────────────
  console.log('Purging existing database tables...');
  
  await prisma.transactionEditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.staffCounter.deleteMany({});
  await prisma.studentDiscountLog.deleteMany({});
  await prisma.admissionCounter.deleteMany({});
  await prisma.transactionLeg.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.journalEntry.deleteMany({});
  await prisma.ledgerAccount.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.hostelStaff.deleteMany({});
  await prisma.hostelResident.deleteMany({});
  await prisma.salarySlip.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.feePaymentDetail.deleteMany({});
  await prisma.feePayment.deleteMany({});
  await prisma.feeAllocation.deleteMany({});
  await prisma.studentConcession.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.feeComponent.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.hostelRoom.deleteMany({});
  await prisma.busStation.deleteMany({});
  await prisma.bus.deleteMany({});
  await prisma.systemSetting.deleteMany({});
  await prisma.googleWhitelist.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.unit.deleteMany({});

  console.log('Database tables purged successfully.');

  // ── Data Seeding Phase (in dependency constraint order) ──────────────────
  console.log('Restoring data from backup...');

  // 1. Units
  if (units.length > 0) {
    await prisma.unit.createMany({ data: units });
    console.log(`Restored ${units.length} Units.`);
  }

  // 2. Users
  if (users.length > 0) {
    await prisma.user.createMany({ data: users });
    console.log(`Restored ${users.length} Users.`);
  }

  // 3. Google Whitelists
  if (googleWhitelists.length > 0) {
    await prisma.googleWhitelist.createMany({ data: googleWhitelists });
    console.log(`Restored ${googleWhitelists.length} Google Whitelist records.`);
  }

  // 4. System Settings
  if (systemSettings.length > 0) {
    await prisma.systemSetting.createMany({ data: systemSettings });
    console.log(`Restored ${systemSettings.length} System Settings.`);
  }

  // 5. Buses
  if (buses.length > 0) {
    await prisma.bus.createMany({ data: buses });
    console.log(`Restored ${buses.length} Buses.`);
  }

  // 6. Bus Stations
  if (busStations.length > 0) {
    await prisma.busStation.createMany({ data: busStations });
    console.log(`Restored ${busStations.length} Bus Stations.`);
  }

  // 7. Hostel Rooms
  if (hostelRooms.length > 0) {
    await prisma.hostelRoom.createMany({ data: hostelRooms });
    console.log(`Restored ${hostelRooms.length} Hostel Rooms.`);
  }

  // 8. Fee Structures
  if (feeStructures.length > 0) {
    await prisma.feeStructure.createMany({ data: feeStructures });
    console.log(`Restored ${feeStructures.length} Fee Structures.`);
  }

  // 9. Fee Components
  if (feeComponents.length > 0) {
    await prisma.feeComponent.createMany({ data: feeComponents });
    console.log(`Restored ${feeComponents.length} Fee Components.`);
  }

  // 10. Students
  if (students.length > 0) {
    const formattedStudents = students.map((s: any) => ({
      ...s,
      dob: new Date(s.dob),
      admissionDate: new Date(s.admissionDate),
    }));
    await prisma.student.createMany({ data: formattedStudents });
    console.log(`Restored ${students.length} Students.`);
  }

  // 11. Student Concessions
  if (concessions.length > 0) {
    await prisma.studentConcession.createMany({ data: concessions });
    console.log(`Restored ${concessions.length} Student Concessions.`);
  }

  // 12. Fee Allocations
  if (allocations.length > 0) {
    const formattedAllocations = allocations.map((a: any) => ({
      ...a,
      dueDate: new Date(a.dueDate),
    }));
    await prisma.feeAllocation.createMany({ data: formattedAllocations });
    console.log(`Restored ${allocations.length} Fee Allocations.`);
  }

  // 13. Fee Payments
  if (feePayments.length > 0) {
    const formattedPayments = feePayments.map((p: any) => ({
      ...p,
      paymentDate: new Date(p.paymentDate),
      reversedAt: p.reversedAt ? new Date(p.reversedAt) : null,
    }));
    await prisma.feePayment.createMany({ data: formattedPayments });
    console.log(`Restored ${feePayments.length} Fee Payments.`);
  }

  // 14. Fee Payment Details
  if (feePaymentDetails.length > 0) {
    await prisma.feePaymentDetail.createMany({ data: feePaymentDetails });
    console.log(`Restored ${feePaymentDetails.length} Fee Payment Details.`);
  }

  // 15. Staff
  if (staff.length > 0) {
    const formattedStaff = staff.map((s: any) => ({
      ...s,
      dob: new Date(s.dob),
      joiningDate: new Date(s.joiningDate),
    }));
    await prisma.staff.createMany({ data: formattedStaff });
    console.log(`Restored ${staff.length} Staff members.`);
  }

  // 16. Salary Slips
  if (salarySlips.length > 0) {
    const formattedSlips = salarySlips.map((s: any) => ({
      ...s,
      generatedAt: new Date(s.generatedAt),
      paidAt: s.paidAt ? new Date(s.paidAt) : null,
    }));
    await prisma.salarySlip.createMany({ data: formattedSlips });
    console.log(`Restored ${salarySlips.length} Salary Slips.`);
  }

  // 17. Hostel Residents
  if (hostelResidents.length > 0) {
    const formattedResidents = hostelResidents.map((r: any) => ({
      ...r,
      checkInDate: new Date(r.checkInDate),
      checkOutDate: r.checkOutDate ? new Date(r.checkOutDate) : null,
    }));
    await prisma.hostelResident.createMany({ data: formattedResidents });
    console.log(`Restored ${hostelResidents.length} Hostel Residents.`);
  }

  // 18. Hostel Staff
  if (hostelStaff.length > 0) {
    const formattedHostelStaff = hostelStaff.map((s: any) => ({
      ...s,
      dob: new Date(s.dob),
      joiningDate: new Date(s.joiningDate),
    }));
    await prisma.hostelStaff.createMany({ data: formattedHostelStaff });
    console.log(`Restored ${hostelStaff.length} Hostel Staff.`);
  }

  // 19. Transactions
  if (transactions.length > 0) {
    const formattedTxns = transactions.map((t: any) => ({
      ...t,
      date: new Date(t.date),
      createdAt: new Date(t.createdAt),
      deletedAt: t.deletedAt ? new Date(t.deletedAt) : null,
    }));
    await prisma.transaction.createMany({ data: formattedTxns });
    console.log(`Restored ${transactions.length} Transactions.`);
  }

  // 20. Ledger Accounts
  if (ledgerAccounts.length > 0) {
    await prisma.ledgerAccount.createMany({ data: ledgerAccounts });
    console.log(`Restored ${ledgerAccounts.length} Ledger Accounts.`);
  }

  // 21. Journal Entries
  if (journalEntries.length > 0) {
    const formattedJournals = journalEntries.map((j: any) => ({
      ...j,
      entryDate: new Date(j.entryDate),
      createdAt: new Date(j.createdAt),
    }));
    await prisma.journalEntry.createMany({ data: formattedJournals });
    console.log(`Restored ${journalEntries.length} Journal Entries.`);
  }

  // 22. Transaction Legs
  if (transactionLegs.length > 0) {
    await prisma.transactionLeg.createMany({ data: transactionLegs });
    console.log(`Restored ${transactionLegs.length} Transaction Legs.`);
  }

  // 23. Budgets
  if (budgets.length > 0) {
    const formattedBudgets = budgets.map((b: any) => ({
      ...b,
      startDate: new Date(b.startDate),
      endDate: new Date(b.endDate),
    }));
    await prisma.budget.createMany({ data: formattedBudgets });
    console.log(`Restored ${budgets.length} Budgets.`);
  }

  // 24. Admission Counters
  if (admissionCounters.length > 0) {
    await prisma.admissionCounter.createMany({ data: admissionCounters });
    console.log(`Restored ${admissionCounters.length} Admission Counters.`);
  }

  // 25. Discount Logs
  if (discountLogs.length > 0) {
    const formattedLogs = discountLogs.map((l: any) => ({
      ...l,
      createdAt: new Date(l.createdAt),
    }));
    await prisma.studentDiscountLog.createMany({ data: formattedLogs });
    console.log(`Restored ${discountLogs.length} Student Discount Logs.`);
  }

  // 26. Staff Counters
  if (staffCounters.length > 0) {
    await prisma.staffCounter.createMany({ data: staffCounters });
    console.log(`Restored ${staffCounters.length} Staff Counters.`);
  }

  // 27. Notifications
  if (notifications.length > 0) {
    const formattedNotifs = notifications.map((n: any) => ({
      ...n,
      createdAt: new Date(n.createdAt),
      readAt: n.readAt ? new Date(n.readAt) : null,
    }));
    await prisma.notification.createMany({ data: formattedNotifs });
    console.log(`Restored ${notifications.length} Notifications.`);
  }

  // 28. Transaction Edit Logs
  if (editLogs.length > 0) {
    const formattedEditLogs = editLogs.map((l: any) => ({
      ...l,
      editedAt: new Date(l.editedAt),
    }));
    await prisma.transactionEditLog.createMany({ data: formattedEditLogs });
    console.log(`Restored ${editLogs.length} Transaction Edit Logs.`);
  }

  console.log('\n🎉 DATABASE RESTORE COMPLETED SUCCESSFULLY!');
}

main()
  .catch((e) => {
    console.error('FATAL RESTORE ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
