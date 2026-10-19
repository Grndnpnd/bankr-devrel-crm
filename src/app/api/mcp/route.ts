import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { bearerFrom, userFromToken } from '@/lib/apiTokens';
import { buildMcpServer } from '@/lib/mcpServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Streamable HTTP MCP endpoint, stateless: each request gets its own server bound to
 * the token's user. Auth: `Authorization: Bearer ahub_…` (Settings → Claude).
 */
async function handle(req: Request) {
  const user = await userFromToken(bearerFrom(req));
  if (!user) {
    return new Response(JSON.stringify({ error: 'unauthorized', hint: 'Create a token in Settings → Claude and send it as a Bearer token.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer realm="artifact-hub"' },
    });
  }
  const server = buildMcpServer(user);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // The JSON response is fully built by now; release the per-request server.
    setTimeout(() => { server.close().catch(() => {}); }, 0);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
