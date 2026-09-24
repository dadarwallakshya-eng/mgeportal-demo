'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function SessionPresenceTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Generate or retrieve session ID for this browser tab session
    let sessionId = sessionStorage.getItem('mge-presence-session-id');
    if (!sessionId) {
      sessionId = crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('mge-presence-session-id', sessionId);
    }

    const sendPing = async (isClose = false) => {
      try {
        const payload = JSON.stringify({
          sessionId,
          activePath: window.location.pathname || pathname || '/dashboard',
          isClose,
        });

        if (isClose && typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/system/heartbeat', payload);
        } else {
          await fetch('/api/system/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          });
        }
      } catch (err) {
        console.error('[PRESENCE_PING_ERROR]', err);
      }
    };

    // Initial ping on load
    sendPing();

    // Set interval to ping every 2 minutes (120 seconds)
    const interval = setInterval(() => {
      sendPing();
    }, 120000);

    // Event listener for tab/page closure
    const handleUnload = () => {
      sendPing(true);
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [pathname]);

  return null;
}
