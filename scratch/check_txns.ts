import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
  const allTxns = await prisma.transaction.findMany({
    take: 100,
    orderBy: { date: 'desc' },
    select: {
      id: true,
      category: true,
      amount: true,
      unitId: true,
      description: true
    }
  });

  console.log('Total sample txns in db:', allTxns.length);
  console.log('Sample rows:');
  console.dir(allTxns, { depth: null });
}

main().catch(console.error);
