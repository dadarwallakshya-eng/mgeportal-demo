import prisma from '@/lib/prisma';

async function main() {
  console.log('Testing Hostel API queries...');
  try {
    const expenses = await prisma.transaction.findMany({
      where: { unitId: 'hostel', direction: 'EXPENSE', isDeleted: false },
      take: 50,
      orderBy: { date: 'desc' }
    });
    console.log('Expenses count:', expenses.length);
    console.log('Sample expense:', expenses[0]);

    const incomes = await prisma.transaction.findMany({
      where: { unitId: 'hostel', direction: 'INCOME', isDeleted: false },
      take: 50,
      orderBy: { date: 'desc' }
    });
    console.log('Incomes count:', incomes.length);

    const residents = await prisma.hostelResident.findMany({
      include: {
        student: { select: { id: true, name: true, admissionNo: true, className: true, section: true, photoUrl: true, unit: { select: { name: true } } } },
        room: { select: { roomNo: true, floor: true } }
      }
    });
    console.log('Residents count:', residents.length);
    console.log('Sample resident:', residents[0]);
  } catch (err) {
    console.error('Error testing hostel DB:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
