/**
 * @module lib/gtag
 * @description Google Analytics 4 event logging helper for custom portal telemetry.
 */

import { sendGAEvent } from '@next/third-parties/google';

/**
 * Log a custom portal event to Google Analytics.
 * @param action The event name/action (e.g. 'fee_collected', 'salary_disbursed', 'login')
 * @param category Event category (e.g. 'FEES', 'PAYROLL', 'AUTH')
 * @param label Optional description label
 * @param value Optional numerical value (e.g. fee amount)
 */
export const logPortalEvent = (
  action: string,
  category: string,
  label?: string,
  value?: number
) => {
  try {
    sendGAEvent('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  } catch (err) {
    console.error('[GA_EVENT_ERROR]', err);
  }
};
