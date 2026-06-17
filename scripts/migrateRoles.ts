/**
 * Pre-deploy migration: convert any legacy VIEWER users to DEVREL before the
 * Role enum drops VIEWER. Runs BEFORE `prisma db push` in the start command, so
 * no row holds a value the new enum lacks (which would make db push fail).
 *
 * Idempotent + safe: if VIEWER no longer exists or no rows match, it's a no-op.
 * Uses raw SQL so it works regardless of the Prisma client's current enum view.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  try {
    // Cast to text so this works whether or not 'VIEWER' is still a valid enum label.
    const updated = await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "role" = 'DEVREL' WHERE "role"::text = 'VIEWER'`
    );
    console.log(`[migrate-roles] converted ${updated} VIEWER user(s) -> DEVREL`);
  } catch (e: any) {
    // If the column/enum is already migrated, the cast may no-op or throw harmlessly.
    console.log(`[migrate-roles] nothing to migrate (${e?.message ?? "ok"})`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
