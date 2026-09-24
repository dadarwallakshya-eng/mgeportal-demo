import { useEffect } from 'react';

const MGE_EVENT_NAME = 'mge-data-changed';
const MGE_CHANNEL_NAME = 'mge-erp-channel';

/**
 * Triggers a real-time data change event globally in the current tab
 * and broadcasts it to all other open browser tabs.
 */
export function triggerDataChange() {
  if (typeof window === 'undefined') return;
  
  // Trigger locally
  window.dispatchEvent(new Event(MGE_EVENT_NAME));
  
  // Broadcast to other tabs
  try {
    const channel = new BroadcastChannel(MGE_CHANNEL_NAME);
    channel.postMessage({ type: 'DATA_CHANGED' });
    channel.close();
  } catch (err) {
    console.error('Failed to broadcast data change:', err);
  }
}

/**
 * Custom React hook that subscribes a page or component to data/unit changes.
 * Executes the callback immediately when data changes locally or on another tab.
 */
export function useDataSubscription(callback: () => void) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Listen for local changes and unit switches
    window.addEventListener(MGE_EVENT_NAME, callback);
    window.addEventListener('mge-unit-changed', callback);

    // Listen for changes from other tabs
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(MGE_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === 'DATA_CHANGED') {
          callback();
        }
      };
    } catch (err) {
      console.error('Failed to create BroadcastChannel:', err);
    }

    return () => {
      window.removeEventListener(MGE_EVENT_NAME, callback);
      window.removeEventListener('mge-unit-changed', callback);
      if (channel) {
        channel.close();
      }
    };
  }, [callback]);
}
