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

/** A small preview of an image (for thumbnails on slow phones); null when it can't be made. */
async function thumbnail(data: Uint8Array | Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(Buffer.from(data), { failOn: 'none', limitInputPixels: 80_000_000 }).rotate()
      .resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  } catch {
    return null;
  }
}

/** Serve an uploaded tester file safely: sandboxed, no sniffing; anything but images/video downloads. thumb → small preview. */
export async function attachmentResponse(a: { filename: string; contentType: string; data: Uint8Array | Buffer }, opts: { thumb?: boolean } = {}) {
  if (opts.thumb && a.contentType.startsWith('image/')) {
    const small = await thumbnail(a.data);
    if (small) {
      return new Response(new Uint8Array(small), {
        headers: {
          'Content-Type': 'image/webp',
          'Content-Disposition': contentDisposition('inline', a.filename.replace(/\.\w+$/, '') + '.webp'),
          'Content-Security-Policy': "sandbox; default-src 'none'",
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=86400',
        },
      });
    }
  }
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
