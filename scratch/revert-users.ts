import 'dotenv/config'; // Load env variables from .env first!
import { Role } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

const ADMIN_ID = '00000000-0000-4000-a000-000000000001';

async function main() {
  console.log('--- Reverting MGE School Portal Users to baseline ---');

  // 1. Re-activate/Upsert the default admin user
  const adminUser = await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: {
      username: 'admin',
      passwordHash: '$2b$12$DU5FAHlRVNZKjgRSD5RBTu6dFt/dfB4jacrGYOzC5ubvnjiqz4u/6', // admin123
      name: 'Director Admin',
      role: Role.DIRECTOR,
      accessUnits: ['hindi', 'english', 'college', 'hostel', 'transport'],
      isActive: true,
    },
    create: {
      id: ADMIN_ID,
      username: 'admin',
      passwordHash: '$2b$12$DU5FAHlRVNZKjgRSD5RBTu6dFt/dfB4jacrGYOzC5ubvnjiqz4u/6', // admin123
      name: 'Director Admin',
      role: Role.DIRECTOR,
      accessUnits: ['hindi', 'english', 'college', 'hostel', 'transport'],
      isActive: true,
    },
  });
  console.log(`Re-activated default admin user: ${adminUser.username}`);

  // 2. Deactivate the 6 department-specific users
  const customUsernames = [
    'devilal_director',
    'kamlesh_english',
    'madanlal_hindi',
    'pankaj_college',
    'suresh_hostel',
    'babulal_transport',
  ];

  const deactivated = await prisma.user.updateMany({
    where: {
      username: { in: customUsernames },
    },
    data: {
      isActive: false,
    },
  });
  console.log(`Deactivated ${deactivated.count} custom department-specific users.`);

  console.log('--- Reversion Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
