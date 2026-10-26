import { inlineType } from '@/lib/beta';

/** Serve an uploaded tester file safely: sandboxed, no sniffing; anything but images/video downloads. */
export function attachmentResponse(a: { filename: string; contentType: string; data: Uint8Array | Buffer }) {
  const disposition = `${inlineType(a.contentType) ? 'inline' : 'attachment'}; filename="${a.filename.replace(/"/g, '')}"`;
  return new Response(new Uint8Array(a.data), {
    headers: {
      'Content-Type': a.contentType,
      'Content-Disposition': disposition,
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
