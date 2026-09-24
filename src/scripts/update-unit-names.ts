import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { prisma } from '../lib/prisma';

async function main() {
  console.log("Updating database Unit names...");

  await prisma.unit.update({
    where: { id: 'hindi' },
    data: { name: 'New Modern Sr. Sec. School' }
  });
  console.log("Updated 'hindi' to 'New Modern Sr. Sec. School'");

  await prisma.unit.update({
    where: { id: 'english' },
    data: { name: 'Modern English School' }
  });
  console.log("Updated 'english' to 'Modern English School'");

  await prisma.unit.update({
    where: { id: 'college' },
    data: { name: 'Modern Mahila Mahavidhyalaya' }
  });
  console.log("Updated 'college' to 'Modern Mahila Mahavidhyalaya'");

  await prisma.unit.update({
    where: { id: 'hostel' },
    data: { name: 'Modern Hostel' }
  });
  console.log("Updated 'hostel' to 'Modern Hostel'");

  console.log("All database Unit names updated successfully!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
