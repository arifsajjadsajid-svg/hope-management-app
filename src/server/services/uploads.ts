import 'server-only';

import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * Uploaded images are stored in the database, not on the filesystem.
 *
 * Managed hosting (Vercel, and most container platforms) gives every request a
 * read-only, throwaway filesystem, so a logo written during one request has
 * vanished by the next. Holding the bytes in Postgres keeps uploads working
 * identically on a laptop, a school server and serverless hosting, and means a
 * single database backup captures the records and the pictures together.
 *
 * Files stay small by policy: 2 MB each, and only branding assets plus one
 * photograph per student.
 */

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

export type UploadFolder = 'branding' | 'photos';

export class UploadError extends Error {}

/**
 * Magic-number check so a renamed executable cannot masquerade as an image.
 * SVG is text, so it is validated by looking for an <svg root element instead.
 */
function sniffImage(buffer: Buffer, declaredType: string): boolean {
  if (buffer.length < 12) return false;

  const png = buffer
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const gif =
    buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
    buffer.subarray(0, 6).toString('ascii') === 'GIF89a';
  const webp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (declaredType === 'image/svg+xml') {
    const head = buffer.subarray(0, 1024).toString('utf8').toLowerCase();
    // Reject SVGs carrying scripts or external references.
    if (/<script|javascript:|onload\s*=|<foreignobject/i.test(head)) return false;
    return head.includes('<svg');
  }

  if (declaredType === 'image/png') return png;
  if (declaredType === 'image/jpeg') return jpeg;
  if (declaredType === 'image/gif') return gif;
  if (declaredType === 'image/webp') return webp;
  return false;
}

/**
 * Validates and stores an uploaded image, returning the URL the application
 * should reference it by. The URL shape is unchanged from when these were kept
 * on disk, so stored paths from earlier versions still resolve.
 */
export async function saveImageUpload(file: File, folder: UploadFolder): Promise<string> {
  if (!file || file.size === 0) throw new UploadError('No file was uploaded.');
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UploadError(
      `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Images must be 2 MB or smaller.`,
    );
  }

  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    throw new UploadError('Only PNG, JPEG, WebP, GIF or SVG images are accepted.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(buffer, file.type)) {
    throw new UploadError('That file is not a valid image, or contains unsafe content.');
  }

  // Random name: the original filename never reaches storage or the URL.
  const fileName = `${crypto.randomBytes(16).toString('hex')}${extension}`;

  await prisma.storedFile.create({
    data: {
      folder,
      fileName,
      contentType: file.type,
      sizeBytes: buffer.byteLength,
      data: buffer,
    },
  });

  return `/api/files/${folder}/${fileName}`;
}

/** Removes a previously stored upload. Unknown or foreign URLs are ignored. */
export async function deleteUpload(url: string | null | undefined): Promise<void> {
  const parsed = parseUploadUrl(url);
  if (!parsed) return;

  await prisma.storedFile
    .delete({ where: { folder_fileName: parsed } })
    .catch(() => undefined); // already gone
}

/** Splits "/api/files/photos/abc.png" into its folder and file name. */
export function parseUploadUrl(
  url: string | null | undefined,
): { folder: string; fileName: string } | null {
  if (!url?.startsWith('/api/files/')) return null;
  const segments = url.slice('/api/files/'.length).split('/');
  if (segments.length !== 2) return null;
  return resolveUploadRef(segments);
}

/**
 * Validates the path segments of a file request. Returning null for anything
 * unexpected keeps traversal attempts and odd names out of the query.
 */
export function resolveUploadRef(
  segments: string[],
): { folder: string; fileName: string } | null {
  if (segments.length !== 2) return null;
  const [folder, fileName] = segments;

  if (folder !== 'branding' && folder !== 'photos') return null;
  // Random hex plus a known extension — nothing else is ever generated above.
  if (!/^[a-f0-9]{32}\.(png|jpg|jpeg|webp|gif|svg)$/.test(fileName)) return null;

  return { folder, fileName };
}

export const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};
