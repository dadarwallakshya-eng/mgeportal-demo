import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  console.log("Resolved DATABASE_URL:", process.env.DATABASE_URL || "Localhost fallback!");

  // Dynamically import to ensure dotenv.config() runs first
  const { default: prisma } = await import('../src/lib/prisma');
  const { Role } = await import('@prisma/client');

  const email = 'kamlesh2005@mgportal.com';
  
  // Find or create Kamlesh Ji
  const user = await prisma.user.upsert({
    where: { username: email },
    update: {
      role: Role.DIRECTOR,
      isActive: true,
      accessUnits: ["hindi", "english", "college", "hostel", "transport"],
    },
    create: {
      username: email,
      name: "Mr. Kamlesh Ji",
      // bcrypt hash for default password 'admin123'
      passwordHash: "$2b$12$DU5FAHlRVNZKjgRSD5RBTu6dFt/dfB4jacrGYOzC5ubvnjiqz4u/6",
      role: Role.DIRECTOR,
      accessUnits: ["hindi", "english", "college", "hostel", "transport"],
      isActive: true,
    }
  });

  console.log("Kamlesh Ji database record successfully verified/updated:");
  console.log(JSON.stringify(user, null, 2));
  
  await prisma.$disconnect();
}

main().catch(console.error);
