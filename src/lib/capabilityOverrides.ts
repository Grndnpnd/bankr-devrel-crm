import { prisma } from "@/lib/prisma";
import { setCapabilityOverrides, type Capability, type Role } from "@/lib/access";

/**
 * Loads the admin-edited capability overrides from AppConfig into the in-memory
 * cache that `can()` reads. Cached with a short TTL so we don't hit the DB on
 * every gated request (can() is called from ~30 places), but changes from the
 * Admin page take effect within a few seconds without a redeploy.
 */

const TTL_MS = 30_000;
let lastLoad = 0;
let loading: Promise<void> | null = null;

async function doLoad(): Promise<void> {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: "default" } });
    const raw = (cfg as any)?.capabilityOverrides;
    setCapabilityOverrides(
      raw && typeof raw === "object" ? (raw as Partial<Record<Capability, Role[]>>) : null
    );
  } catch {
    // On failure, leave whatever's cached (fail to current behavior, not open).
  } finally {
    lastLoad = Date.now();
  }
}

/** Ensure overrides are loaded (respecting TTL). Safe to call frequently. */
export async function ensureCapabilityOverrides(): Promise<void> {
  if (Date.now() - lastLoad < TTL_MS) return;
  if (loading) return loading;
  loading = doLoad().finally(() => { loading = null; });
  return loading;
}

/** Force an immediate reload (call right after an admin saves changes). */
export async function reloadCapabilityOverrides(): Promise<void> {
  lastLoad = 0;
  await ensureCapabilityOverrides();
}
