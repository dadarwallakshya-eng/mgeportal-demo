/**
 * @module audit
 * @description Audit logging for security-sensitive operations.
 *
 * PURPOSE:
 * Every mutation (create, update, delete) to critical entities must be logged
 * with the acting user's identity, the affected entity, and a description of
 * the change. This creates a tamper-evident trail for compliance and forensics.
 *
 * OUTPUT FORMAT:
 * - Development: Pretty-printed console output for readability.
 * - Production: Single-line JSON to stdout, suitable for ingestion by log
 *   aggregators (CloudWatch, Datadog, ELK, etc.).
 *
 * FUTURE ENHANCEMENTS:
 * - Persist audit events to a dedicated database table for queryability.
 * - Send critical events (DELETE, role changes) to an alerting system.
 */

import prisma from './prisma';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/** Actions that can be audited. */
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ACCESS_DENIED' | 'MFA_RESET' | 'MFA_FAILED' | 'LOGIN_PASSWORD_VERIFIED' | 'WHITELIST_REMOVE' | 'WHITELIST_ADD';

/** Structured audit event shape. */
export interface AuditEvent {
  /** ISO-8601 timestamp of when the event occurred. */
  timestamp: string;
  /** ID of the user who performed the action (or 'SYSTEM' / 'ANONYMOUS'). */
  userId: string;
  /** The action performed. */
  action: AuditAction;
  /** Entity type affected (e.g., 'Student', 'FeePayment', 'User'). */
  entity: string;
  /** Primary key of the affected entity, or null for non-entity events. */
  entityId: string | null;
  /** Free-form details about the change (e.g., which fields changed). */
  details?: Record<string, unknown> | string;
}

/**
 * Log an audit event.
 *
 * @param userId   - The acting user's ID. Use 'ANONYMOUS' for unauthenticated actions
 *                   and 'SYSTEM' for automated processes.
 * @param action   - The type of action performed.
 * @param entity   - The type of entity affected.
 * @param entityId - The primary key of the entity, or null.
 * @param details  - Optional additional context about the change.
 *
 * @example
 * ```ts
 * await logAuditEvent(user.id, 'UPDATE', 'Student', studentId, {
 *   field: 'name',
 *   oldValue: 'Jane',
 *   newValue: 'Janet',
 * });
 * ```
 */
export async function logAuditEvent(
  userId: string,
  action: AuditAction,
  entity: string,
  entityId: string | null,
  details?: Record<string, unknown> | string
): Promise<void> {
  let ip = 'unknown';
  let userAgent = 'unknown';
  try {
    const { headers } = require('next/headers');
    const headerList = await headers();
    ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() || headerList.get('x-real-ip') || 'unknown';
    userAgent = headerList.get('user-agent') || 'unknown';
  } catch {
    // Silent catch if called outside of request context (e.g. CLI seed scripts)
  }

  const event: AuditEvent & { ip: string; userAgent: string } = {
    timestamp: new Date().toISOString(),
    userId,
    action,
    entity,
    entityId,
    ip,
    userAgent,
    ...(details !== undefined && { details }),
  };

  if (IS_PRODUCTION) {
    // Single-line JSON for structured log aggregation.
    // Using process.stdout.write avoids console.log's trailing newline inconsistencies.
    process.stdout.write(JSON.stringify({ level: 'audit', ...event }) + '\n');
  } else {
    // Human-readable output for local development.
    console.log(
      `[AUDIT] ${event.timestamp} | ${event.action} | User: ${event.userId} | ` +
        `${event.entity}${event.entityId ? `:${event.entityId}` : ''}`
    );
    if (details) {
      console.log('  Details:', typeof details === 'string' ? details : JSON.stringify(details, null, 2));
    }
  }

  // Save to Database UserActivity if it's a valid user UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  if (isUuid) {
    try {
      await prisma.userActivity.create({
        data: {
          userId,
          action,
          entity,
          details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
        },
      });
    } catch (dbErr) {
      console.error('[AUDIT_DB_WRITE_ERROR]', dbErr);
    }
  }
}
