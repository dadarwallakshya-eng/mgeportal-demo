import 'dotenv/config';
import prisma from '../src/lib/prisma';

async function main() {
  console.log('--- Updating Core Management User Phone Numbers ---');

  const updates = [
    { username: 'kamlesh2005@mgportal.com', phone: '9887734168' },
    { username: 'm8l31@mgportal.com', phone: '9784461516' },
    { username: 's2k75@mgportal.com', phone: '9252142007' },
    { username: 'b5l46@mgportal.com', phone: '9887983678' },
  ];

  for (const item of updates) {
    const user = await prisma.user.findUnique({
      where: { username: item.username }
    });

    if (user) {
      await prisma.user.update({
        where: { username: item.username },
        data: { phone: item.phone }
      });
      console.log(`Updated phone for: ${user.name} (${item.username}) -> ${item.phone}`);
    } else {
      console.warn(`User not found: ${item.username}`);
    }
  }

  console.log('--- Finished Updating Users ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
