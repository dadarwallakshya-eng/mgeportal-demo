/**
 * @file src/app/api/notifications/stream/route.ts
 * @description Real-time Server-Sent Events (SSE) notifications streaming API.
 *              Allows active user tabs to listen to live alerts.
 */

import { NextRequest } from 'next/server';
import { notificationEmitter } from '@/lib/notifications';

export async function GET(request: NextRequest): Promise<Response> {
  const userId = request.headers.get('x-user-id');
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Send connection confirmation packet
  writer.write(encoder.encode(': ok\n\n'));

  // Notification event listener
  const onNotification = (data: { userId: string; notification: any }) => {
    if (data.userId === userId) {
      const payload = `event: notification\ndata: ${JSON.stringify(data.notification)}\n\n`;
      writer.write(encoder.encode(payload));
    }
  };

  // Subscribe to emitter
  notificationEmitter.on('notification', onNotification);

  // Setup 15-second heartbeat ping to prevent proxy connection timeouts
  const pingInterval = setInterval(() => {
    try {
      writer.write(encoder.encode(': ping\n\n'));
    } catch {
      // Ignored: writer might already be closed/released
    }
  }, 15000);

  // Clean up references when client aborts the connection (e.g. tab closed)
  request.signal.addEventListener('abort', () => {
    clearInterval(pingInterval);
    notificationEmitter.off('notification', onNotification);
    try {
      writer.close();
    } catch {
      // Already closed
    }
  });

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
