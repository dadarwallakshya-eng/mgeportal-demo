/**
 * @file src/lib/notifications.ts
 * @description In-memory EventEmitter singleton for broadcasting notifications to active SSE streams.
 */

import { EventEmitter } from 'events';

// Store emitter on globalThis to prevent multiple instances during Next.js hot reloads in development
const globalForNotifications = globalThis as unknown as {
  notificationEmitter: EventEmitter | undefined;
};

export const notificationEmitter =
  globalForNotifications.notificationEmitter ?? new EventEmitter();

if (process.env.NODE_ENV !== 'production') {
  globalForNotifications.notificationEmitter = notificationEmitter;
}

// Max listeners set to high limit to accommodate concurrent open client tab connections
notificationEmitter.setMaxListeners(200);
