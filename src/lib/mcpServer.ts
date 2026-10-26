/**
 * The MCP server people connect their Claude to (claude.ai, Claude Code, Desktop).
 * It acts as the person who owns the token, with exactly their permissions:
 *   - artifacts: list what they own / what's shared with them / what the team shares,
 *     read, publish, update, share, and read/write an artifact's data store
 *   - CRM: the same tools the in-app agent uses (pipeline queries, submissions,
 *     outreach, proposals, scheduled jobs), gated by the same capability checks
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/access';
import type { SessionUser } from '@/lib/auth';
import { AGENT_TOOLS, runTool } from '@/lib/agentTools';
import { loadChatContext, type ChatRow } from '@/lib/chatData';
import { TASK_TOOLS, TASK_TOOL_NAMES, callTaskTool } from '@/lib/mcpTaskTools';
import {
  atLeast, createArtifact, dbDelete, dbGet, dbQuery, dbSet, DbError, listArtifacts, openArtifact,
  setShares, updateArtifact, viewerKey, type DbCtx, type ListScope,
} from '@/lib/artifacts';

const APP_URL = () => (process.env.APP_URL || '').replace(/\/$/, '');
const artifactUrl = (id: string) => `${APP_URL()}/artifacts/${id}`;

export const MCP_INSTRUCTIONS = `This is the team's artifact hub and CRM.
Artifacts: HTML pages, dashboards and docs, each with version history, sharing and its own data store (the claude.ai "db" capability, so claude.ai artifacts keep working here).
- To bring a claude.ai artifact here, read its full HTML and call publish_artifact with source_url set to its claude.ai link; publishing the same source_url again adds a version instead of a duplicate. Pass its declared capabilities (e.g. {"db":{"rules":[...]},"user":{}}) so its data rules carry over.
- "What's been shared with me" is list_artifacts with scope "shared" (or "team").
- Large pages: get_artifact returns metadata by default; ask for include_html only when you need the source.
- Supporting files (images, JSON, video) a page loads by relative path are uploaded with PUT {hub}/api/artifacts/{id}/files?path=<relative path> (raw bytes, same Bearer token); get_artifact lists them.
Tasks: my_tasks / list_tasks / create_task / update_task work the team's task board (create_task with no team or assignee assigns it to this user); my_notifications shows what needs them.
CRM tools (query_pipeline, get_submission_detail, ...) read and change the pipeline as this user; destructive edits are queued for human review, never applied directly.`;

// CRM tools that only make sense inside the web UI.
const UI_ONLY = new Set(['build_panel']);

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failure = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true });

const ARTIFACT_TOOLS = [
  {
    name: 'whoami',
    description: 'Who this connection acts as (name, email, role) and the hub URL.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'list_artifacts',
    description: 'List artifacts this user can open, newest first. scope: all (default), mine, shared (shared with me by someone), team (shared with the whole team).',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'mine', 'shared', 'team'] },
        query: { type: 'string', description: 'Text to match in title, description or tags' },
        tag: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_artifact',
    description: 'One artifact: metadata, the caller\'s access level, and (include_html) its current HTML or an older version\'s.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        include_html: { type: 'boolean' },
        version: { type: 'number', description: 'An older version number (with include_html)' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'publish_artifact',
    description: 'Create an artifact from a complete HTML document. If source_url matches an artifact this user already owns, its HTML becomes a new version instead (so re-importing is safe).',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'A whole HTML document' },
        title: { type: 'string', description: 'Defaults to the page <title>' },
        description: { type: 'string' },
        kind: { type: 'string', enum: ['page', 'dashboard', 'doc', 'deck', 'tool'] },
        tags: { type: 'array', items: { type: 'string' } },
        source_url: { type: 'string', description: 'Where it came from, e.g. https://claude.ai/artifact/…' },
        capabilities: { type: 'object', description: 'Declared runtime capabilities, e.g. {"db":{"rules":[...]},"user":{}}' },
        team_visible: { type: 'boolean', description: 'Let everyone on the team view it' },
        note: { type: 'string', description: 'Version note' },
      },
      required: ['html'],
    },
  },
  {
    name: 'update_artifact',
    description: 'Change an artifact. New html is saved as the next version; other fields update in place. Needs edit access.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        html: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        kind: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        capabilities: { type: 'object' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_people',
    description: 'Active users on the team (name, email) — who an artifact can be shared with.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'share_artifact',
    description: 'Set who can open an artifact. people replaces the share list: level view (read), use (change its shared data) or edit (save versions; owner only). team_visible lets everyone view (owner only).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        people: {
          type: 'array',
          items: { type: 'object', properties: { email: { type: 'string' }, level: { type: 'string', enum: ['view', 'use', 'edit'] } }, required: ['email', 'level'] },
        },
        team_visible: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'read_artifact_data',
    description: 'Read an artifact\'s data store as this user. An even number of path segments reads one document (tasks/t1); an odd number lists a collection (tasks).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, path: { type: 'string' }, limit: { type: 'number' } },
      required: ['id', 'path'],
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'write_artifact_data',
    description: 'Write one document of an artifact\'s data store (path with an even number of segments). merge=true merges into an existing document; otherwise it replaces it. delete=true removes it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        path: { type: 'string' },
        data: { type: 'object' },
        merge: { type: 'boolean' },
        delete: { type: 'boolean' },
      },
      required: ['id', 'path'],
    },
  },
];

const ARTIFACT_TOOL_NAMES = new Set(ARTIFACT_TOOLS.map((t) => t.name));

// Chat rows are a snapshot of the pipeline; rebuild at most once a minute.
let rowsCache: { at: number; rows: ChatRow[] } | null = null;
async function chatRows() {
  if (rowsCache && Date.now() - rowsCache.at < 60_000) return rowsCache.rows;
  rowsCache = { at: Date.now(), rows: await loadChatContext() };
  return rowsCache.rows;
}

const SHARE_LEVELS: Record<string, 'VIEW' | 'INTERACT' | 'EDIT'> = { view: 'VIEW', use: 'INTERACT', edit: 'EDIT' };

async function callArtifactTool(user: SessionUser, name: string, args: any) {
  switch (name) {
    case 'whoami':
      return text({ name: user.name, email: user.email, role: user.role, hub: APP_URL() || null });

    case 'list_artifacts': {
      const rows = await listArtifacts(user, { scope: (args.scope as ListScope) || 'all', q: args.query, tag: args.tag });
      return text(rows.map((r) => ({
        id: r.id, title: r.title, kind: r.kind, tags: r.tags, version: r.currentVersion,
        owner: r.owner.name || r.owner.email, relation: r.relation, access: r.level,
        team_visible: r.visibility === 'TEAM', source_url: r.sourceUrl, updated: r.updatedAt, url: artifactUrl(r.id),
      })));
    }

    case 'get_artifact': {
      const found = await openArtifact(String(args.id), user);
      if (!found) return failure('No such artifact, or it is not shared with you.');
      const { artifact: a, level } = found;
      let html: string | undefined;
      if (args.include_html) {
        html = a.html;
        if (args.version && args.version !== a.currentVersion) {
          const v = await prisma.artifactVersion.findUnique({ where: { artifactId_version: { artifactId: a.id, version: Number(args.version) } } });
          if (!v) return failure(`Version ${args.version} not found.`);
          html = v.html;
        }
      }
      const docCount = await prisma.artifactDoc.count({ where: { artifactId: a.id } });
      const files = await prisma.artifactFile.findMany({ where: { artifactId: a.id }, select: { path: true, size: true, contentType: true }, orderBy: { path: 'asc' } });
      return text({
        id: a.id, title: a.title, description: a.description, kind: a.kind, tags: a.tags,
        version: a.currentVersion, access: level, team_visible: a.visibility === 'TEAM',
        source_url: a.sourceUrl, capabilities: a.capabilities, data_documents: docCount, files,
        size_bytes: Buffer.byteLength(a.html), url: artifactUrl(a.id), updated: a.updatedAt,
        ...(html !== undefined ? { html } : {}),
      });
    }

    case 'publish_artifact': {
      if (typeof args.html !== 'string' || !args.html.trim()) return failure('html is required.');
      const visibility = args.team_visible ? 'TEAM' as const : undefined;
      if (args.source_url) {
        const existing = await prisma.artifact.findFirst({ where: { ownerId: user.id, sourceUrl: String(args.source_url) } });
        if (existing) {
          const a = await updateArtifact(existing.id, user, 'owner', {
            html: args.html, title: args.title, description: args.description, kind: args.kind, tags: args.tags,
            capabilities: args.capabilities, visibility, note: args.note ?? 'Re-imported',
          });
          return text({ id: a.id, title: a.title, version: a.currentVersion, url: artifactUrl(a.id), updated_existing: true });
        }
      }
      const a = await createArtifact(user, {
        html: args.html, title: args.title, description: args.description, kind: args.kind, tags: args.tags,
        sourceUrl: args.source_url, capabilities: args.capabilities, visibility, note: args.note ?? (args.source_url ? 'Imported' : 'Published from Claude'),
      });
      return text({ id: a.id, title: a.title, version: a.currentVersion, url: artifactUrl(a.id), created: true });
    }

    case 'update_artifact': {
      const found = await openArtifact(String(args.id), user);
      if (!found) return failure('No such artifact, or it is not shared with you.');
      const a = await updateArtifact(found.artifact.id, user, found.level, {
        html: args.html, title: args.title, description: args.description, kind: args.kind, tags: args.tags,
        capabilities: args.capabilities, note: args.note ?? (args.html ? 'Updated from Claude' : undefined),
      });
      return text({ id: a.id, title: a.title, version: a.currentVersion, url: artifactUrl(a.id) });
    }

    case 'list_people': {
      const people = await prisma.user.findMany({ where: { active: true }, select: { name: true, email: true }, orderBy: { name: 'asc' } });
      return text(people);
    }

    case 'share_artifact': {
      const found = await openArtifact(String(args.id), user);
      if (!found) return failure('No such artifact, or it is not shared with you.');
      if (!atLeast(found.level, 'admin')) return failure('You need edit access to share this artifact.');
      if (args.team_visible !== undefined && found.level !== 'owner') return failure('Only the owner can change team visibility.');
      if (Array.isArray(args.people)) {
        const emails = args.people.map((p: any) => String(p.email).toLowerCase());
        const users = await prisma.user.findMany({ where: { email: { in: emails, mode: 'insensitive' }, active: true }, select: { id: true, email: true } });
        const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
        const unknown = emails.filter((e: string) => !byEmail.has(e));
        if (unknown.length) return failure(`No active user with email: ${unknown.join(', ')}. Use list_people.`);
        const shares = args.people.map((p: any) => ({ userId: byEmail.get(String(p.email).toLowerCase())!, level: SHARE_LEVELS[p.level] ?? 'VIEW' }));
        if (found.level !== 'owner' && shares.some((s: any) => s.level === 'EDIT')) return failure('Only the owner can grant edit access.');
        await setShares(found.artifact.id, shares);
      }
      if (args.team_visible !== undefined) {
        await prisma.artifact.update({ where: { id: found.artifact.id }, data: { visibility: args.team_visible ? 'TEAM' : 'PRIVATE' } });
      }
      return text({ ok: true, url: artifactUrl(found.artifact.id) });
    }

    case 'read_artifact_data':
    case 'write_artifact_data': {
      const found = await openArtifact(String(args.id), user);
      if (!found) return failure('No such artifact, or it is not shared with you.');
      const ctx: DbCtx = { artifactId: found.artifact.id, capabilities: found.artifact.capabilities, viewer: viewerKey(found.artifact.id, user.id), level: found.level };
      const path = String(args.path ?? '').replace(/^\/+|\/+$/g, '');
      const isDoc = path.split('/').length % 2 === 0;
      if (name === 'read_artifact_data') {
        if (isDoc) return text(await dbGet(ctx, path));
        const docs = await dbQuery(ctx, path, { limit: Math.min(Number(args.limit) || 200, 1000) });
        return text(docs.map((d) => ({ id: d.id, data: d.data })));
      }
      if (!isDoc) return failure('write_artifact_data needs a document path (an even number of segments, e.g. tasks/t1).');
      if (args.delete) { await dbDelete(ctx, path); return text({ ok: true, deleted: path }); }
      await dbSet(ctx, path, args.data, args.merge ? 'update' : 'set');
      return text({ ok: true, path });
    }
  }
  return failure(`Unknown tool ${name}`);
}

/** A fresh server per request (stateless transport); `user` is the token's owner. */
export function buildMcpServer(user: SessionUser) {
  const server = new Server(
    { name: 'artifact-hub', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS },
  );
  const crmAllowed = can(user.role, 'analytics.use');
  const crmTools = crmAllowed
    ? AGENT_TOOLS.filter((t) => !UI_ONLY.has(t.function.name)).map((t) => ({
        name: t.function.name,
        description: t.function.description,
        inputSchema: { type: 'object', properties: {}, ...(t.function.parameters ?? {}) },
      }))
    : [];

  const taskTools = can(user.role, 'tasks.use') ? TASK_TOOLS : [];
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...ARTIFACT_TOOLS, ...taskTools, ...crmTools] as any }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (ARTIFACT_TOOL_NAMES.has(name)) return await callArtifactTool(user, name, args);
      if (TASK_TOOL_NAMES.has(name)) return taskTools.length ? await callTaskTool(user, name, args) : failure('Task tools need the tasks.use capability.');
      if (!crmAllowed || UI_ONLY.has(name) || !crmTools.some((t) => t.name === name)) return failure(`Unknown tool ${name}`);
      const exec = await runTool(name, args, (await chatRows()) as any, { userId: user.id, userEmail: user.email, role: user.role });
      return text(exec.result);
    } catch (e: any) {
      if (e instanceof DbError) return failure(`${e.code}: ${e.message}`);
      return failure(e?.message ?? 'tool failed');
    }
  });
  return server;
}
