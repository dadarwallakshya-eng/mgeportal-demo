'use client';

/**
 * @file src/components/auth/SessionTimeoutListener.tsx
 * @description Bank-grade inactivity auto-logout monitor with warning modal overlay.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert, LogOut, ShieldCheck } from 'lucide-react';

// Configuration (Time in milliseconds)
const INACTIVITY_TIMEOUT = 14 * 60 * 1000; // 14 minutes of silence before showing warning
const GRACE_PERIOD = 60 * 1000;            // 60 seconds grace countdown
const THROTTLE_DELAY = 5000;               // Reset activity at most every 5 seconds to reduce CPU usage

export default function SessionTimeoutListener() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60); // 60 seconds grace countdown
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  const lastActiveRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Throttled activity reset
  const resetActivity = () => {
    const now = Date.now();
    if (now - lastActiveRef.current > THROTTLE_DELAY) {
      lastActiveRef.current = now;
      if (!showWarning) {
        startInactivityTimer();
      }
    }
  };

  // Perform backend logout
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('[TIMEOUT] Failed to request server logout:', err);
    } finally {
      // Clear session cookies and redirect to login page with timeout query parameter
      window.location.href = '/login?reason=timeout';
    }
  };

  // Ping endpoint to refresh server-side cookie/session
  const handleKeepLoggedIn = async () => {
    setShowWarning(false);
    resetTimers();
    lastActiveRef.current = Date.now();
    startInactivityTimer();

    try {
      // Background ping to confirm session is still alive and extend backend cookies
      await fetch('/api/auth/me');
    } catch (err) {
      console.error('[TIMEOUT] Session ping failed:', err);
    }
  };

  const resetTimers = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  };

  const startInactivityTimer = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    
    inactivityTimerRef.current = setTimeout(() => {
      // Show warning modal when 14 minutes have passed without interaction
      setShowWarning(true);
      setTimeLeft(60);
    }, INACTIVITY_TIMEOUT);
  };

  // Check if session is still valid (used on tab refocus/visibility change)
  const verifySessionOnFocus = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        // Session is invalid/expired — force logout redirect
        window.location.href = '/login?reason=timeout';
      }
    } catch {
      // Network issues/failure — fallback safe logout
      window.location.href = '/login?reason=timeout';
    }
  };

  // Monitor grace countdown when warning is showing
  useEffect(() => {
    if (showWarning) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      
      countdownTimerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current!);
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [showWarning]);

  // Monitor activity and visibility
  useEffect(() => {
    // 1. Setup user activity event listeners
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, resetActivity, { passive: true });
    });

    // 2. Setup tab visibility change listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        verifySessionOnFocus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 3. Start the initial inactivity timer
    startInactivityTimer();

    return () => {
      resetTimers();
      events.forEach((event) => {
        window.removeEventListener(event, resetActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-beige bg-paper text-ink p-6 shadow-2xl animate-scale-in">
        
        {/* Sleek Decorative ambient glow inside modal */}
        <div className="absolute -top-20 -left-20 w-48 h-48 bg-brand/10 rounded-full blur-[80px]" />
        <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-red-500/5 rounded-full blur-[80px]" />

        {/* Modal content */}
        <div className="relative space-y-5 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-50 text-red-500 border border-red-100">
            <ShieldAlert size={24} className="animate-pulse" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-serif font-semibold tracking-tight text-ink">
              Inactivity Timeout Warning
            </h3>
            <p className="text-xs text-mute font-bold uppercase tracking-widest">
              निष्क्रियता चेतावनी
            </p>
          </div>

          <div className="p-4 bg-cream/40 border border-beige/40 rounded-2xl space-y-2">
            <p className="text-xs text-ink leading-relaxed">
              You have been inactive for a while. For your security, you will be automatically logged out of the portal in:
            </p>
            <div className="text-2xl font-mono font-bold text-red-500 tabular-nums">
              {timeLeft}s
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full h-1.5 bg-beige/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-red-400 to-red-600 transition-all duration-1000 ease-linear"
                style={{ width: `${(timeLeft / 60) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-beige bg-field hover:bg-beige/20 text-mute hover:text-ink font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoggingOut ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <LogOut size={14} />
              )}
              Logout / बाहर निकलें
            </button>
            <button
              onClick={handleKeepLoggedIn}
              disabled={isLoggingOut}
              className="flex-1 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-b from-brand-dark to-brand-darker hover:from-brand hover:to-brand-dark text-white font-semibold text-xs transition-all shadow-[0_4px_12px_rgba(58,21,119,0.15)] cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck size={14} />
              Stay Logged In / लॉग इन रहें
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
