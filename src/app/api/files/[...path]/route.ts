import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { resolveUploadRef } from '@/server/services/uploads';

export const dynamic = 'force-dynamic';

/**
 * Serves uploaded images (academy logo, stamps, signatures, student
 * photographs) from the database.
 *
 * Branding assets are public because they appear on documents a member of the
 * public may legitimately verify; everything else requires a signed-in user.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  const ref = resolveUploadRef(segments);
  if (!ref) return new NextResponse('Not found', { status: 404 });

  const isBranding = ref.folder === 'branding';
  if (!isBranding) {
    const user = await getCurrentUser();
    if (!user) return new NextResponse('Not authorised', { status: 403 });
  }

  const file = await prisma.storedFile.findUnique({
    where: { folder_fileName: ref },
    select: { data: true, contentType: true, sizeBytes: true },
  });

  if (!file) return new NextResponse('Not found', { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.sizeBytes),
      // File names are random and never reused, so these can be cached hard.
      'Cache-Control': isBranding
        ? 'public, max-age=86400, immutable'
        : 'private, max-age=3600',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
