import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      accessUnits: true
    }
  });
  console.log('Seeded Users in DB:');
  console.dir(users, { depth: null });
}

main().catch(console.error);
