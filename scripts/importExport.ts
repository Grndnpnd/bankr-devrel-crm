/**
 * Import an export folder of claude.ai artifacts into the hub, owned by one user.
 *
 *   DATABASE_URL=… npx tsx scripts/importExport.ts <export dir> <owner email> [--team] [--only slug,slug] [--editor email]
 *
 * The folder holds manifest.json (one entry per artifact: slug, title, url, capabilities,
 * html_file, files), <slug>.html, files/<slug>/<relative path>, and optional
 * <slug>.db.json ([{ path, data }]) with the page's shared db documents.
 * Re-running is safe: an artifact with the same source URL gets a new version (only if the
 * HTML changed), files are upserted, db documents are set.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { createArtifact, updateArtifact } from '../src/lib/artifacts';
import { cleanPath, sha256, typeFor } from '../src/lib/artifactFiles';

interface Entry {
  slug: string; title: string; url: string; capabilities: unknown; typed?: boolean;
  html_file: string; files?: string[];
}

async function main() {
  const [dir, email, ...rest] = process.argv.slice(2);
  if (!dir || !email) throw new Error('usage: importExport.ts <export dir> <owner email> [--team] [--only a,b]');
  const team = rest.includes('--team');
  const onlyIdx = rest.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(rest[onlyIdx + 1].split(',')) : null;
  const edIdx = rest.indexOf('--editor');
  const editor = edIdx >= 0 ? await prisma.user.findFirst({ where: { email: { equals: rest[edIdx + 1], mode: 'insensitive' } } }) : null;
  if (edIdx >= 0 && !editor) throw new Error(`no user with email ${rest[edIdx + 1]}`);

  const owner = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  if (!owner) throw new Error(`no user with email ${email}`);
  const viewer = { id: owner.id, email: owner.email, name: owner.name, role: owner.role };
  const manifest: Entry[] = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  for (const e of manifest) {
    if (only && !only.has(e.slug)) continue;
    const html = fs.readFileSync(path.join(dir, e.html_file), 'utf8');
    const kind = e.typed ? 'doc' : /storyboard/i.test(e.title) ? 'deck' : /watch|telemetry|cup/i.test(e.title) ? 'dashboard' : 'page';
    const existing = await prisma.artifact.findFirst({ where: { ownerId: owner.id, sourceUrl: e.url } });
    const art = existing
      ? await updateArtifact(existing.id, viewer, 'owner', { html, title: e.title, capabilities: e.capabilities ?? undefined, note: 'Re-imported from claude.ai' })
      : await createArtifact(viewer, {
          html, title: e.title, kind, sourceUrl: e.url, capabilities: e.capabilities ?? undefined,
          tags: ['claude.ai'], visibility: team ? 'TEAM' : 'PRIVATE', note: 'Imported from claude.ai',
        });

    if (editor && editor.id !== owner.id) {
      await prisma.artifactShare.upsert({
        where: { artifactId_userId: { artifactId: art.id, userId: editor.id } },
        update: { level: 'EDIT' },
        create: { artifactId: art.id, userId: editor.id, level: 'EDIT' },
      });
    }

    let files = 0, bytes = 0;
    for (const rel of e.files ?? []) {
      const p = cleanPath(rel);
      const src = path.join(dir, 'files', e.slug, rel);
      if (!p || !fs.existsSync(src)) continue;
      const buf = fs.readFileSync(src);
      await prisma.artifactFile.upsert({
        where: { artifactId_path: { artifactId: art.id, path: p } },
        update: { data: buf, size: buf.length, sha256: sha256(buf), contentType: typeFor(p) },
        create: { artifactId: art.id, path: p, data: buf, size: buf.length, sha256: sha256(buf), contentType: typeFor(p) },
      });
      files++; bytes += buf.length;
    }

    let docs = 0;
    const dbFile = path.join(dir, `${e.slug}.db.json`);
    if (fs.existsSync(dbFile)) {
      for (const d of JSON.parse(fs.readFileSync(dbFile, 'utf8')) as { path: string; data: Record<string, unknown> }[]) {
        if (d.path.startsWith('data/users/')) continue;
        const segs = d.path.split('/');
        await prisma.artifactDoc.upsert({
          where: { artifactId_path: { artifactId: art.id, path: d.path } },
          update: { data: d.data as Prisma.InputJsonValue, version: { increment: 1 } },
          create: { artifactId: art.id, path: d.path, collection: segs.slice(0, -1).join('/'), docId: segs[segs.length - 1], data: d.data as Prisma.InputJsonValue },
        });
        docs++;
      }
    }
    console.log(`${existing ? 'updated ' : 'created '} ${e.slug} -> ${art.id} v${art.currentVersion}  files=${files} (${(bytes / 1e6).toFixed(1)} MB) docs=${docs}`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (err) => { console.error(err.message ?? err); await prisma.$disconnect(); process.exit(1); });
