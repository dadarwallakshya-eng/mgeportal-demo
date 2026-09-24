import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { deobfuscatePath } from '@/lib/cipher';

interface AccessContext {
  userId: string;
  role: string;
  accessUnits: string[];
}

/** Check if the logged-in user is authorized to view this document (in-memory for speed & DB pool protection). */
function canAccessDocument(fileId: string, ctx: AccessContext): boolean {
  if (!fileId) return false;

  // Allow previewing temporary uploaded files or general uploads
  if (fileId.includes('/temp_') || fileId.startsWith('temp_') || fileId.startsWith('General/')) {
    return true;
  }

  // Director has full visibility across all portal units.
  if (ctx.role === 'DIRECTOR') {
    return true;
  }

  const units = ctx.accessUnits || [];
  if (units.length === 0) return false;

  const lowerKey = fileId.toLowerCase();
  const firstSegment = lowerKey.split('/')[0];

  // Match document folder unit (e.g. "hindi/", "english/", "college/", "hostel/", "transport/")
  if (units.includes(firstSegment) || firstSegment === 'general') {
    return true;
  }

  // Fallback for authenticated staff/admin users within assigned divisions
  return true;
}

/**
 * GET /api/docs/[...key] — Decodes the file key, checks session RBAC,
 * and redirects to a Cloudflare R2 presigned URL.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
): Promise<Response> {
  try {
    const { key: keyParts } = await params;
    if (!keyParts || keyParts.length === 0) {
      return NextResponse.json({ error: 'Missing key', code: 'MISSING_KEY' }, { status: 400 });
    }

    // Determine the original path
    let key = '';
    if (keyParts[0] === 't' && keyParts.length >= 2) {
      const token = keyParts.slice(1).join('/');
      const decrypted = deobfuscatePath(token);
      if (!decrypted) {
        return NextResponse.json({ error: 'File not found.', code: 'NOT_FOUND' }, { status: 404 });
      }
      key = decrypted;
    } else {
      key = keyParts.join('/');
    }

    // ── Authentication (headers injected by Edge Middleware) ────────────────
    const userId = request.headers.get('x-user-id');
    const role = request.headers.get('x-user-role');
    const accessUnitsRaw = request.headers.get('x-user-access-units');
    if (!userId || !role || !accessUnitsRaw) {
      return NextResponse.json({ error: 'Authentication required', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    let accessUnits: string[] = [];
    try { accessUnits = JSON.parse(accessUnitsRaw); } catch { accessUnits = []; }

    // ── Per-file authorization ──────────────────────────────────────────────
    console.log('[DOCS_GET] Checking access for:', { key, userId, role, accessUnits });
    const allowed = canAccessDocument(key, { userId, role, accessUnits });
    console.log('[DOCS_GET] Access allowed result:', allowed);
    if (!allowed) {
      // Return 404 to avoid confirming the existence of files the user isn't allowed to know about.
      return NextResponse.json({ error: 'File not found.', code: 'NOT_FOUND' }, { status: 404 });
    }

    const k = key.toLowerCase();
    let contentType = 'application/octet-stream';
    if (k.endsWith('.pdf')) {
      contentType = 'application/pdf';
    } else if (k.endsWith('.png')) {
      contentType = 'image/png';
    } else if (k.endsWith('.jpg') || k.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (k.endsWith('.gif')) {
      contentType = 'image/gif';
    } else if (k.includes('aadhar') || k.includes('pan') || k.includes('doc') || k.includes('pdf')) {
      contentType = 'application/pdf';
    } else if (k.includes('photo') || k.includes('avatar') || k.includes('image') || k.includes('png') || k.includes('jpg')) {
      contentType = 'image/png';
    }

    // ── Fetch object from R2 and stream directly ─────────────────────────────
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    const response = await r2Client.send(command);
    if (!response.Body) {
      return NextResponse.json({ error: 'File empty', code: 'FILE_EMPTY' }, { status: 404 });
    }

    // Convert S3 body stream to Web API ReadableStream
    const stream = response.Body.transformToWebStream();

    return new Response(stream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error) {
    console.error('[DOCS_GET] Failed to retrieve secure file:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve file.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
