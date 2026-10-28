import { NextResponse } from 'next/server';
import { staffProgram } from '@/lib/betaHttp';
import { notionConfigured } from '@/lib/notion';
import { syncProgram } from '@/lib/notionSync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Sync now: pull edits from the program's Notion boards, then push the CRM's. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = await staffProgram(id);
  if ('error' in s) return s.error;
  if (!notionConfigured()) return NextResponse.json({ error: 'Notion isn’t connected yet (NOTION_TOKEN).' }, { status: 400 });
  return NextResponse.json(await syncProgram(id));
}
