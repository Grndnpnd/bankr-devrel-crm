import { inlineType } from '@/lib/beta';

/**
 * Content-Disposition for any filename. Header values must be Latin-1, and real filenames
 * aren't (macOS screenshots have a narrow no-break space before "AM"), so send an ASCII
 * fallback plus the UTF-8 name (RFC 6266).
 */
export function contentDisposition(kind: 'inline' | 'attachment', filename: string) {
  const ascii = filename.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'file';
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Serve an uploaded tester file safely: sandboxed, no sniffing; anything but images/video downloads. */
export function attachmentResponse(a: { filename: string; contentType: string; data: Uint8Array | Buffer }) {
  return new Response(new Uint8Array(a.data), {
    headers: {
      'Content-Type': a.contentType,
      'Content-Disposition': contentDisposition(inlineType(a.contentType) ? 'inline' : 'attachment', a.filename),
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
