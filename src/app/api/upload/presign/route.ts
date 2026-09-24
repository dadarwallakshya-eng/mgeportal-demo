/**
 * @file src/app/api/upload/presign/route.ts
 * @description API route to generate a presigned PUT URL for direct R2 uploads.
 *              Bypasses Vercel serverless request body limits (allows up to 10 MB).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl } from '@/lib/r2';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

function sanitizeSegment(raw: string): string | null {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) return null;
  const cleaned = trimmed.replace(/[^A-Za-z0-9 _.()\-]/g, '').trim();
  return cleaned ? cleaned.slice(0, 80) : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { fileName: fileNameRaw, mimeType, pathParts, fileSize } = body;

    if (!fileNameRaw || !mimeType || !pathParts || !Array.isArray(pathParts)) {
      return NextResponse.json(
        { error: 'Missing required parameters.', code: 'MISSING_PARAM' },
        { status: 400 }
      );
    }

    if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Maximum allowed size is 10 MB. Please upload a file of 10 MB or less.', code: 'FILE_TOO_LARGE' },
        { status: 413 }
      );
    }

    if (!ALLOWED_MIME.has(mimeType)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Only images (JPG/PNG/WEBP) and PDF are allowed.', code: 'UNSUPPORTED_TYPE' },
        { status: 415 }
      );
    }

    const fileName = sanitizeSegment(fileNameRaw);
    if (!fileName) {
      return NextResponse.json(
        { error: 'Invalid file name.', code: 'INVALID_FILENAME' },
        { status: 400 }
      );
    }

    const sanitizedPathParts = pathParts
      .map((p: any) => sanitizeSegment(p))
      .filter((p: string | null): p is string => p !== null);

    const { uploadUrl, fileKey } = await getPresignedUploadUrl(
      fileName,
      mimeType,
      sanitizedPathParts
    );

    return NextResponse.json({ uploadUrl, fileKey });
  } catch (error) {
    console.error('[PRESIGN_UPLOAD_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
