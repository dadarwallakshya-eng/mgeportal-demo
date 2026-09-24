import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid json body', code: 'BAD_REQUEST' }, { status: 400 });
    }

    const { photoUrl } = body;

    // Validate photoUrl format if provided
    if (photoUrl !== null && photoUrl.trim() !== '') {
      const isUrl = /^https?:\/\/\S+$/i.test(photoUrl.trim());
      const isBase64 = /^data:image\/(jpeg|jpg|png|webp|gif);base64,\S+$/i.test(photoUrl.trim());
      if (!isUrl && !isBase64) {
        return NextResponse.json({ error: 'Photo must be a valid URL or a base64 data image', code: 'BAD_REQUEST' }, { status: 400 });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        photoUrl: photoUrl?.trim() || null
      },
      select: {
        id: true,
        username: true,
        name: true,
        photoUrl: true,
      }
    });

    return NextResponse.json({ success: true, user: updatedUser }, { status: 200 });
  } catch (error) {
    console.error('[CORE_UPDATE_PROFILE] Error:', error);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
