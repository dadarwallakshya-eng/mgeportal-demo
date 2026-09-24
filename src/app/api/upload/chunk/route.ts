/**
 * @file src/app/api/upload/chunk/route.ts
 * @description API route to handle chunked uploads (2 MB slices) for files up to 10 MB.
 *              Bypasses Vercel serverless request body limits (4.5 MB limit per HTTP request).
 */

import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToR2 } from '@/lib/r2';

/** Max file size cap — 10 MB */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Allowed MIME types */
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const MAX_PATH_DEPTH = 8;
const MAX_SEGMENT_LEN = 80;

function sanitizeSegment(raw: string): string | null {
  const trimmed = (raw ?? '').toString().trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) return null;
  const cleaned = trimmed.replace(/[^A-Za-z0-9 _.()\-]/g, '').trim();
  return cleaned ? cleaned.slice(0, MAX_SEGMENT_LEN) : null;
}

// In-memory chunk store (cleared after complete or timeout)
const chunkStore = new Map<
  string,
  {
    chunks: Buffer[];
    totalChunks: number;
    mimeType: string;
    fileName: string;
    pathParts: string[];
    createdAt: number;
  }
>();

// Cleanup stale chunk sessions older than 10 minutes
function cleanupStaleSessions() {
  const now = Date.now();
  for (const [id, session] of chunkStore.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      chunkStore.delete(id);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    cleanupStaleSessions();

    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const contentType = request.headers.get('content-type') || '';

    // Action 1: INIT / COMPLETE (JSON payload)
    if (contentType.includes('application/json')) {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON payload', code: 'INVALID_JSON' },
          { status: 400 }
        );
      }

      const { action, uploadId, fileName: fileNameRaw, path: pathRaw, mimeType, totalChunks, fileSize } = body;

      if (action === 'init') {
        if (!fileNameRaw || !pathRaw || !totalChunks || typeof totalChunks !== 'number') {
          return NextResponse.json(
            { error: 'Missing parameters for chunk init', code: 'MISSING_PARAM' },
            { status: 400 }
          );
        }

        if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: 'Maximum allowed size is 10 MB. Please upload a file of 10 MB or less.', code: 'FILE_TOO_LARGE' },
            { status: 413 }
          );
        }

        const mime = mimeType || 'application/pdf';
        if (!ALLOWED_MIME.has(mime)) {
          return NextResponse.json(
            { error: 'Unsupported file type. Only images and PDFs are allowed.', code: 'UNSUPPORTED_TYPE' },
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

        let pathParts: string[] = [];
        try {
          pathParts = JSON.parse(pathRaw);
        } catch {
          return NextResponse.json(
            { error: 'Invalid path format', code: 'INVALID_PATH' },
            { status: 400 }
          );
        }

        const sanitizedPathParts = pathParts
          .map((p) => sanitizeSegment(p))
          .filter((p): p is string => p !== null);

        const newUploadId = `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        chunkStore.set(newUploadId, {
          chunks: new Array(totalChunks),
          totalChunks,
          mimeType: mime,
          fileName,
          pathParts: sanitizedPathParts,
          createdAt: Date.now(),
        });

        return NextResponse.json({ uploadId: newUploadId });
      }

      if (action === 'complete') {
        if (!uploadId || !chunkStore.has(uploadId)) {
          return NextResponse.json(
            { error: 'Invalid or expired upload session', code: 'INVALID_SESSION' },
            { status: 404 }
          );
        }

        const session = chunkStore.get(uploadId)!;

        // Verify all chunks are received
        for (let i = 0; i < session.totalChunks; i++) {
          if (!session.chunks[i]) {
            return NextResponse.json(
              { error: `Missing chunk ${i + 1} of ${session.totalChunks}`, code: 'MISSING_CHUNK' },
              { status: 400 }
            );
          }
        }

        // Recombine all 2MB chunks into 1 complete original buffer
        const completeBuffer = Buffer.concat(session.chunks);
        chunkStore.delete(uploadId);

        if (completeBuffer.length > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: 'Maximum allowed size is 10 MB. Please upload a file of 10 MB or less.', code: 'FILE_TOO_LARGE' },
            { status: 413 }
          );
        }

        // Upload complete original file to Cloudflare R2
        const fileId = await uploadFileToR2(
          completeBuffer,
          session.fileName,
          session.mimeType,
          session.pathParts
        );

        return NextResponse.json({ fileId });
      }

      return NextResponse.json({ error: 'Invalid chunk action', code: 'INVALID_ACTION' }, { status: 400 });
    }

    // Action 2: APPEND CHUNK (FormData payload)
    const formData = await request.formData();
    const uploadId = formData.get('uploadId') as string | null;
    const chunkIndexRaw = formData.get('chunkIndex') as string | null;
    const chunkFile = formData.get('chunk') as File | null;

    if (!uploadId || chunkIndexRaw === null || !chunkFile) {
      return NextResponse.json(
        { error: 'Missing chunk data: uploadId, chunkIndex, or chunk file.', code: 'MISSING_PARAM' },
        { status: 400 }
      );
    }

    const session = chunkStore.get(uploadId);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid or expired upload session', code: 'INVALID_SESSION' },
        { status: 404 }
      );
    }

    const chunkIndex = parseInt(chunkIndexRaw, 10);
    if (isNaN(chunkIndex) || chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      return NextResponse.json(
        { error: 'Invalid chunk index', code: 'INVALID_INDEX' },
        { status: 400 }
      );
    }

    const arrayBuffer = await chunkFile.arrayBuffer();
    session.chunks[chunkIndex] = Buffer.from(arrayBuffer);

    return NextResponse.json({ message: `Chunk ${chunkIndex + 1}/${session.totalChunks} received` });
  } catch (error) {
    console.error('[CHUNK_UPLOAD_ERROR]', error);
    return NextResponse.json(
      { error: 'Failed to process file chunk.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
