/**
 * @file src/app/api/upload/route.ts
 * @description API route to handle secure document uploads to Cloudflare R2.
 *              Receives a file, a target filename, and path parts (folder hierarchy).
 *
 * SECURITY HARDENING:
 * - Requires an authenticated session (x-user-id injected by Edge Middleware).
 * - MIME allowlist: only images and PDFs may be uploaded. This blocks uploading
 *   HTML/SVG/JS that could later be served same-origin and used for stored XSS.
 * - Size cap: rejects files over MAX_UPLOAD_BYTES to prevent memory-exhaustion DoS
 *   (the whole file is buffered into RAM by formData()).
 * - Path & filename sanitisation: every path segment and the filename are stripped
 *   to a safe charset and checked for traversal (`..`), depth, and length.
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToR2 } from '@/lib/r2';

/** Max upload size — generous for a scanned Aadhaar/PAN/photo, small enough to bound memory. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Only document/image types a school portal legitimately stores. */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/** Max number of nested folders + max length per segment. */
const MAX_PATH_DEPTH = 8;
const MAX_SEGMENT_LEN = 80;

/**
 * Sanitise a single path/file segment: keep a conservative charset, collapse
 * whitespace, and reject anything that looks like traversal. Returns null when
 * the segment is unusable.
 */
function sanitizeSegment(raw: string): string | null {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed) return null;
  if (trimmed === '.' || trimmed === '..') return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) return null;
  // Allow letters, numbers, space, and a few safe punctuation marks only.
  const cleaned = trimmed.replace(/[^A-Za-z0-9 _.()\-]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_SEGMENT_LEN);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verify authentication (headers injected by Edge Middleware).
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 2. Parse form data.
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileNameRaw = formData.get('fileName') as string | null;
    const pathRaw = formData.get('path') as string | null;

    if (!file || !fileNameRaw || !pathRaw) {
      return NextResponse.json(
        { error: 'Missing required parameters: file, fileName, or path.', code: 'MISSING_PARAM' },
        { status: 400 }
      );
    }

    // 3. Enforce size cap BEFORE buffering into memory where possible.
    if (typeof file.size === 'number' && file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Maximum allowed size is 10 MB. Please upload a file of 10 MB or less.', code: 'FILE_TOO_LARGE' },
        { status: 413 }
      );
    }

    // 4. Enforce MIME allowlist.
    const mimeType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only images (JPG/PNG/WEBP/GIF/HEIC) and PDF are allowed.', code: 'UNSUPPORTED_TYPE' },
        { status: 415 }
      );
    }

    // 5. Sanitise filename (preserve a safe extension).
    const fileName = sanitizeSegment(fileNameRaw);
    if (!fileName) {
      return NextResponse.json(
        { error: 'Invalid file name.', code: 'INVALID_FILENAME' },
        { status: 400 }
      );
    }

    // 6. Parse + sanitise the folder path.
    let pathPartsRaw: unknown;
    try {
      pathPartsRaw = JSON.parse(pathRaw);
    } catch {
      return NextResponse.json(
        { error: 'Invalid path format. Expected a JSON-stringified array of strings.', code: 'INVALID_PATH' },
        { status: 400 }
      );
    }
    if (!Array.isArray(pathPartsRaw) || pathPartsRaw.length === 0 || pathPartsRaw.length > MAX_PATH_DEPTH) {
      return NextResponse.json(
        { error: `Path must be an array of 1 to ${MAX_PATH_DEPTH} folder names.`, code: 'INVALID_PATH' },
        { status: 400 }
      );
    }
    const pathParts: string[] = [];
    for (const seg of pathPartsRaw) {
      const clean = typeof seg === 'string' && seg.trim() ? sanitizeSegment(seg) : 'General';
      pathParts.push(clean || 'General');
    }

    // 7. Buffer and double-check the real size (file.size can be spoofed by clients).
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`, code: 'FILE_TOO_LARGE' },
        { status: 413 }
      );
    }
    const buffer = Buffer.from(arrayBuffer);
    
    let uploadBuffer = buffer;
    let uploadMimeType = mimeType;
    let finalFileName = fileName;

    // Server-side image optimization (resizing & compression via optional dynamic sharp import)
    if (mimeType.startsWith('image/') && mimeType !== 'image/gif') {
      try {
        const sharpModule = await import('sharp');
        const sharp = (sharpModule as any).default || sharpModule;

        const isAvatar = pathParts.some((part) =>
          ['Student_Photos', 'Staff_Photos', 'Hostel_Staff_Photos'].includes(part)
        );

        const targetSize = isAvatar ? 300 : 1200;
        const quality = isAvatar ? 80 : 75;

        // Resize if larger than target dimensions, and compress as progressive JPEG
        uploadBuffer = await sharp(buffer)
          .resize({
            width: targetSize,
            height: targetSize,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality, progressive: true })
          .toBuffer();

        uploadMimeType = 'image/jpeg';
        
        // Force file extension to .jpg in final filename
        const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
        finalFileName = `${baseName}.jpg`;
      } catch (imgErr) {
        console.warn('[UPLOAD_IMAGE_OPTIMIZATION] Sharp module unavailable, streaming original file:', imgErr);
      }
    }

    // 8. Stream upload to Cloudflare R2.
    const fileId = await uploadFileToR2(uploadBuffer, finalFileName, uploadMimeType, pathParts);

    return NextResponse.json({ success: true, fileId }, { status: 200 });
  } catch (error: any) {
    console.error('[API_UPLOAD] Upload failed:', error);
    const detail = error?.message || 'Server upload failed. Please try again.';
    return NextResponse.json(
      { error: `Upload error: ${detail}`, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
