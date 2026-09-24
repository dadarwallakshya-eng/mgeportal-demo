import 'dotenv/config'; // Load env variables from .env first!
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

const SALT_ROUNDS = 12;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log('--- Configuring MGE School Portal Users ---');

  // Define the target users requested
  const targetUsers = [
    {
      username: 'devilal_director',
      name: 'Mr. Devilal Kumawat',
      role: Role.DIRECTOR,
      accessUnits: ['hindi', 'english', 'college', 'hostel', 'transport'],
      password: 'MGE_Devilal_2026',
    },
    {
      username: 'kamlesh_english',
      name: 'Mr. Kamlesh Kumar',
      role: Role.DIRECTOR, // Set to DIRECTOR so he can access Income & Expense and Payroll sidebar links
      accessUnits: ['english', 'college', 'transport'],
      password: 'MGE_Kamlesh_2026',
    },
    {
      username: 'madanlal_hindi',
      name: 'Mr. Madanlal',
      role: Role.DIRECTOR, // Set to DIRECTOR so he can access Income & Expense and Payroll sidebar links
      accessUnits: ['hindi', 'transport'],
      password: 'MGE_Madanlal_2026',
    },
    {
      username: 'pankaj_college',
      name: 'Mr. Pankaj Ji Sharma',
      role: Role.PRINCIPAL, // PRINCIPAL role has access to Students & Fees Engine, but NOT Income & Expense (restricted to DIRECTOR)
      accessUnits: ['college'],
      password: 'MGE_Pankaj_2026',
    },
    {
      username: 'suresh_hostel',
      name: 'Mr. Suresh Kumar',
      role: Role.DEPARTMENT_HEAD, // Has access to Hostel Boarding page
      accessUnits: ['hostel'],
      password: 'MGE_Suresh_2026',
    },
    {
      username: 'babulal_transport',
      name: 'Mr. Babulal Ji',
      role: Role.DEPARTMENT_HEAD, // Has access to Transport Department page
      accessUnits: ['transport'],
      password: 'MGE_Babulal_2026',
    },
  ];

  // 1. Upsert target users by username to preserve references
  for (const u of targetUsers) {
    const passwordHash = await hashPassword(u.password);
    const existing = await prisma.user.findUnique({ where: { username: u.username } });
    if (existing) {
      await prisma.user.update({
        where: { username: u.username },
        data: {
          name: u.name,
          role: u.role,
          accessUnits: u.accessUnits,
          passwordHash,
          isActive: true,
        },
      });
      console.log(`Updated existing user: ${u.username}`);
    } else {
      await prisma.user.create({
        data: {
          username: u.username,
          name: u.name,
          role: u.role,
          accessUnits: u.accessUnits,
          passwordHash,
          isActive: true,
        },
      });
      console.log(`Created new user: ${u.username}`);
    }
  }

  // 2. Deactivate all other users to ensure only these authorized users can access the portal.
  const targetUsernames = targetUsers.map((u) => u.username);
  const deactivated = await prisma.user.updateMany({
    where: {
      username: { notIn: targetUsernames },
    },
    data: {
      isActive: false,
    },
  });
  console.log(`Deactivated ${deactivated.count} other users.`);

  console.log('--- Configuration Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
