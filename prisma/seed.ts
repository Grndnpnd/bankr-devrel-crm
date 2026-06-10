import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { runImport } from "../src/lib/adapters";
import { SeedFileAdapter } from "../src/lib/adapters/seedFile";

async function main() {
  const adminPw = process.env.SEED_ADMIN_PASSWORD || "changeme-admin";
  const devrelPw = process.env.SEED_DEVREL_PASSWORD || "changeme-devrel";

  const users = [
    { email: "admin@bankr.bot", name: "Admin", role: "ADMIN" as const, pw: adminPw },
    { email: "devrel@bankr.bot", name: "DevRel", role: "DEVREL" as const, pw: devrelPw },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.pw, 10) },
    });
  }
  console.log(`Seeded ${users.length} users (admin@bankr.bot / devrel@bankr.bot)`);

  const result = await runImport(new SeedFileAdapter());
  console.log(`Imported submissions:`, result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
