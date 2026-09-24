import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { prisma } from '../lib/prisma';

async function main() {
  console.log("Checking active bus service student allocations in database...");

  const activeRiders = await prisma.student.findMany({
    where: {
      transportMode: 'BUS_SERVICE',
      busStationId: { not: null }
    },
    include: {
      busStation: true,
      feeAllocations: {
        where: {
          feeComponent: { name: 'Transport Fee' }
        },
        include: {
          feeComponent: true
        }
      }
    }
  });

  console.log(`\nFound ${activeRiders.length} active bus riders in the database.\n`);

  if (activeRiders.length === 0) {
    console.log("No active bus riders found.");
    return;
  }

  let matching = 0;
  let mismatched = 0;

  for (const student of activeRiders) {
    const station = student.busStation;
    if (!station) continue;

    const allocation = student.feeAllocations[0];
    const targetFare = Number(station.perYear);
    
    if (allocation) {
      const allocatedFare = Number(allocation.amountDue);
      if (allocatedFare === targetFare) {
        matching++;
        console.log(`✅ MATCH: ${student.name} (Class ${student.className}) - Station: "${station.name}" - Fare: ₹${targetFare} - Allocated: ₹${allocatedFare} (Status: ${allocation.status})`);
      } else {
        mismatched++;
        console.log(`❌ MISMATCH: ${student.name} (Class ${student.className}) - Station: "${station.name}" - Target: ₹${targetFare} - Allocated: ₹${allocatedFare}`);
      }
    } else {
      mismatched++;
      console.log(`⚠️ MISSING ALLOCATION: ${student.name} (Class ${student.className}) - Station: "${station.name}" has no Transport Fee allocation.`);
    }
  }

  console.log(`\nVerification Summary:`);
  console.log(`- Matching Allocations: ${matching}`);
  console.log(`- Mismatched/Missing Allocations: ${mismatched}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
