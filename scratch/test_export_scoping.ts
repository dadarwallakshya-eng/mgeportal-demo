import 'dotenv/config';
import { loadMonthlyReport } from '../src/lib/monthlyReport';

async function test() {
  const kamleshUnits = ['english', 'college'];
  const month = '2026-06';
  
  const report = await loadMonthlyReport(month, kamleshUnits);
  
  console.log('--- VERIFYING KAMLESH JI SCRITERIA ---');
  console.log('Month:', month);
  console.log('Kamlesh Allowed Units:', kamleshUnits);
  console.log('Total Transactions Loaded:', report.transactions.length);
  
  const unauthorizedTxns = report.transactions.filter(t => {
    if (t.unitId === null) return false;
    return !kamleshUnits.includes(t.unitId);
  });
  
  console.log('Unauthorized Transactions Found:', unauthorizedTxns.length);
  if (unauthorizedTxns.length > 0) {
    console.log('UNAUTHORIZED TXNS DETECTED:', unauthorizedTxns.map(t => ({
      id: t.id,
      category: t.category,
      unitId: t.unitId,
      amount: t.amount,
      description: t.description
    })));
  } else {
    console.log('Success: No unauthorized transactions found for Kamlesh Ji.');
  }

  console.log('\nBreakdown of Units in Report:');
  console.log(Object.keys(report.byUnit));
}

test().catch(console.error);
