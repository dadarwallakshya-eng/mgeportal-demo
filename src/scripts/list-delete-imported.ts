import { prisma } from '../lib/prisma';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const isDeleteMode = process.argv.includes('--delete');

  try {
    // Find students created in the last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const students = await prisma.student.findMany({
      where: {
        createdAt: {
          gte: sixHoursAgo
        }
      },
      select: {
        id: true,
        name: true,
        admissionNo: true,
        className: true,
        unitId: true,
        createdAt: true
      }
    });

    console.log(`Found ${students.length} students registered in the last 6 hours:`);
    students.forEach(s => {
      console.log(`- ID: ${s.id}, Name: ${s.name}, Admission: ${s.admissionNo}, Class: ${s.className}, Unit: ${s.unitId}`);
    });

    if (students.length === 0) {
      console.log('No recent student records found to process.');
      return;
    }

    if (!isDeleteMode) {
      console.log('\n[INFO] To delete these students and all their associated fee allocations / transactions, run this command with the --delete flag:');
      console.log('npx tsx src/scripts/list-delete-imported.ts --delete');
      return;
    }

    console.log('\n[DELETING] Commencing deletion of student records and dependent tables...');
    const studentIds = students.map(s => s.id);

    // Run cascade delete inside transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete Student Concessions
      const concessionsCount = await tx.studentConcession.deleteMany({
        where: { studentId: { in: studentIds } }
      });
      console.log(`- Deleted ${concessionsCount.count} concessions.`);

      // 2. Delete Fee Allocations
      const allocationsCount = await tx.feeAllocation.deleteMany({
        where: { studentId: { in: studentIds } }
      });
      console.log(`- Deleted ${allocationsCount.count} fee allocations.`);

      // 3. Delete transactions or payments if they exist
      const paymentsCount = await tx.feePayment.deleteMany({
        where: { studentId: { in: studentIds } }
      });
      console.log(`- Deleted ${paymentsCount.count} fee payments.`);

      const txCount = await tx.transaction.deleteMany({
        where: { studentId: { in: studentIds } }
      });
      console.log(`- Deleted ${txCount.count} associated ledger transactions.`);

      // 4. Delete Hostel Allocations & Residents
      const hostelResCount = await tx.hostelResident.deleteMany({
        where: { studentId: { in: studentIds } }
      });
      console.log(`- Deleted ${hostelResCount.count} hostel residents.`);

      const hostelAllocCount = await tx.hostelAllocation.deleteMany({
        where: { studentId: { in: studentIds } }
      });
      console.log(`- Deleted ${hostelAllocCount.count} hostel allocations.`);

      // 5. Delete Students
      const studentCount = await tx.student.deleteMany({
        where: { id: { in: studentIds } }
      });
      console.log(`- Deleted ${studentCount.count} student profiles.`);
    });

    console.log('[SUCCESS] All recent import records deleted successfully!');
  } catch (err) {
    console.error('Execution failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
