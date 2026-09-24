import { NextRequest, NextResponse } from 'next/server';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Verify Authorization (Director Only) ───────────────────────────────
    const userRole = request.headers.get('x-user-role');
    if (userRole !== 'DIRECTOR') {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Key is required', code: 'BAD_REQUEST' }, { status: 400 });
    }

    // ── Fetch Object from R2 ───────────────────────────────────────────────
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );

    if (!response.Body) {
      return NextResponse.json({ error: 'File content is empty', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Convert S3 body stream to Uint8Array/Buffer
    const streamToBuffer = async (stream: any): Promise<Buffer> => {
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    };

    const fileBuffer = await streamToBuffer(response.Body);
    const fileName = key.split('/').pop() || 'backup.zip';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename=${fileName}`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('[DBMS_BACKUP_DOWNLOAD] Download failed:', error);
    return NextResponse.json(
      { error: error.message || 'File download failed.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
