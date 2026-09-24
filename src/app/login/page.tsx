'use client';

/**
 * @file src/app/login/page.tsx
 * @description Premium glassmorphism Login Page for the MGE School Portal.
 *
 * DESIGN DECISIONS:
 * - High-end glassmorphism card layout with gradient backgrounds and smooth animations.
 * - Fits the theme of modern, secure corporate portals.
 * - Displays the official school logo.
 * - Fully client-side validated before posting to API (Zod-equivalent validation).
 * - Secure session handling (tokens are stored in HttpOnly cookies, invisible to JS).
 * - Enclosed in a Suspense boundary to prevent CSR static generation bailout.
 */

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Eye, EyeOff, Lock, User, AlertCircle, Loader2, ShieldAlert, KeyRound, CheckCircle2, Mail } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mfaResetNotice, setMfaResetNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MFA states
  const [step, setStep] = useState<'login' | 'mfa-setup' | 'mfa-verify' | 'email-otp'>('login');
  const [mfaPendingToken, setMfaPendingToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  // Check if there is a redirect path
  const redirectFrom = (searchParams && searchParams.get('from')) || '/dashboard';
  const reason = searchParams ? searchParams.get('reason') : null;
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const mfaResetParam = searchParams.get('mfa_reset');

  useEffect(() => {
    if (mfaResetParam === 'success') {
      setMfaResetNotice(
        '2FA Reset Verified! Your authenticator configuration has been cleared via your Whitelisted Google Account. Please log in with your credentials to register a new device.'
      );
    }
  }, [mfaResetParam]);

  useEffect(() => {
    if (reason === 'timeout') {
      setInfoMessage(
        'Your session has expired due to 15 minutes of inactivity. Please log in again for security. ' +
        '(सुरक्षा कारणों से 15 मिनट की निष्क्रियता के बाद आपका सत्र समाप्त हो गया है। कृपया पुनः लॉग इन करें।)'
      );
    }
  }, [reason]);

  // Check if already logged in (redirect to dashboard)
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          router.push(redirectFrom);
        }
      } catch {
        // Not logged in, stay on page
      }
    }
    checkAuth();
  }, [router, redirectFrom]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validations
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid username or password.');
      }

      if (data.mfaRequired) {
        setMfaPendingToken(data.mfaPendingToken);
        if (data.isFirstTime) {
          // Fetch MFA setup details (QR code)
          const setupRes = await fetch('/api/auth/mfa/setup', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${data.mfaPendingToken}`,
            },
          });
          const setupData = await setupRes.json();
          if (!setupRes.ok) {
            throw new Error(setupData.error || 'Failed to initialize MFA setup.');
          }
          setQrCodeUrl(setupData.qrCodeUrl);
          setMfaSecret(setupData.secret);
          setStep('mfa-setup');
        } else {
          setStep('mfa-verify');
        }
      } else {
        // Fallback if MFA not enabled (should not happen with our login API changes)
        router.push(redirectFrom);
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(otpCode)) {
      setError('Please enter a valid 6-digit code.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mfaPendingToken}`,
        },
        body: JSON.stringify({ code: otpCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed. Please try again.');
      }

      // Success! Redirect to dashboard
      router.push(redirectFrom);
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
      setIsLoading(false);
    }
  };

  const handleRequestEmailOtp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (mfaPendingToken && mfaPendingToken !== 'undefined') {
        headers['Authorization'] = `Bearer ${mfaPendingToken}`;
      }

      const res = await fetch('/api/auth/mfa/send-reset-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send verification email.');
      }

      setMaskedEmail(data.maskedEmail || 'your registered email');
      setEmailOtpCode('');
      setStep('email-otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{6}$/.test(emailOtpCode)) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    setIsLoading(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (mfaPendingToken && mfaPendingToken !== 'undefined') {
        headers['Authorization'] = `Bearer ${mfaPendingToken}`;
      }

      const res = await fetch('/api/auth/mfa/verify-reset-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ otpCode: emailOtpCode, username }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid verification code.');
      }

      // 2FA has been reset and new secret/QR code generated!
      setQrCodeUrl(data.qrCodeUrl);
      setMfaSecret(data.secret);
      setOtpCode('');
      setStep('mfa-setup');
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickDemoLogin = async (targetRole: 'DIRECTOR' | 'PRINCIPAL' | 'DEPARTMENT_HEAD') => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('user_id', data.user.id);
        localStorage.setItem('user_role', data.user.role);
        router.push(redirectFrom || '/dashboard');
      } else {
        setError(data.error || 'Quick demo login failed.');
      }
    } catch {
      setError('Connection error during quick demo login.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border border-beige bg-paper text-ink overflow-visible rounded-[22px] shadow-[0_10px_30px_rgba(20,18,40,0.06),0_20px_60px_rgba(58,21,119,0.06)]">
      <CardHeader className="grid-cols-1 space-y-2 justify-items-center text-center pt-6 pb-2">
        {/* Logo (centered inside the card) */}
        <div className="w-full flex justify-center">
          <div className="relative w-[280px] h-[110px]">
            <Image
              src="/logo.jpg"
              alt="Modern Group of Education"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <div className="space-y-1 pt-0.5">
          <CardTitle className="font-serif text-[20px] font-semibold tracking-tight text-ink">
            Modern Group of Education
          </CardTitle>
          <p className="text-brand italic text-[12.5px] font-medium">
            &quot;Enjoying • Believing • Achieving&quot;
          </p>
          <p className="text-mute text-[10px] font-bold uppercase tracking-[0.18em]">
            Kuchaman City · Rajasthan
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Quick Demo Login Cards for Evaluators */}
        <div className="p-3 bg-brand/5 border border-brand/20 rounded-xl space-y-2">
          <p className="text-[10px] font-extrabold text-brand uppercase tracking-wider text-center">
            🚀 1-Click Evaluator Demo Access
          </p>
          <div className="grid grid-cols-3 gap-1.5 text-[10px] font-semibold">
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('DIRECTOR')}
              className="p-2 bg-brand text-white rounded-lg hover:bg-[#4a2090] transition-all cursor-pointer text-center font-bold"
            >
              Director Demo
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('PRINCIPAL')}
              className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all cursor-pointer text-center font-bold"
            >
              Principal Demo
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('DEPARTMENT_HEAD')}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all cursor-pointer text-center font-bold"
            >
              Hostel Head
            </button>
          </div>
        </div>

        {/* 2FA Reset Success Banner */}
        {mfaResetNotice && !error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs animate-fade-in shadow-2xs">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
            <p className="leading-relaxed font-medium">{mfaResetNotice}</p>
          </div>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3.5">
            {/* Error Callout */}
            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs animate-shake">
                <AlertCircle size={14} className="shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Inactivity Timeout Banner */}
            {infoMessage && !error && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs animate-fade-in">
                <AlertCircle size={14} className="shrink-0 text-amber-600 mt-0.5" />
                <p className="leading-relaxed">{infoMessage}</p>
              </div>
            )}

            {/* Username field */}
            <div className="space-y-1">
              <Label htmlFor="username" className="text-label text-[10px] font-bold uppercase tracking-wide">Username / यूज़रनेम</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={15} />
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  disabled={isLoading}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand/40 focus-visible:border-brand h-10 rounded-[10px] transition-colors"
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-1">
              <Label htmlFor="password" className="text-label text-[10px] font-bold uppercase tracking-wide">Password / पासवर्ड</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={15} />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand/40 focus-visible:border-brand h-10 rounded-[10px] transition-colors"
                />
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-mute hover:text-label transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Submit Button — deep purple gradient */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center h-10 rounded-xl bg-gradient-to-b from-brand-dark to-brand-darker text-white font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 focus:ring-offset-paper active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none mt-1 shadow-[0_4px_12px_rgba(58,21,119,0.20),inset_0_1px_0_rgba(255,255,255,0.10)] cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Login / प्रवेश करें'
              )}
            </button>
          </form>
        )}

        {step === 'mfa-setup' && (
          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-brand">Configure Authenticator</h3>
              <p className="text-xs text-mute leading-relaxed">
                Scan this QR code in your Google Authenticator app, then enter the 6-digit verification code.
              </p>
            </div>

            {/* Error Callout */}
            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs animate-shake">
                <AlertCircle size={14} className="shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center space-y-2 py-2 border border-beige/60 bg-cream/40 rounded-2xl">
              {qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="Google Authenticator QR Code"
                  className="w-40 h-40 object-contain rounded-lg p-1 bg-white border border-beige"
                />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center border border-dashed border-beige rounded-lg">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              )}
              {mfaSecret && (
                <div className="text-[10px] text-center text-mute font-mono select-all">
                  Manual key: <span className="font-bold text-ink bg-beige/40 px-1.5 py-0.5 rounded">{mfaSecret}</span>
                </div>
              )}
            </div>

            {/* OTP Code field */}
            <div className="space-y-1.5">
              <Label htmlFor="otpCode" className="text-label text-[10px] font-bold uppercase tracking-wide">Verification Code (6 Digits)</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={15} />
                <Input
                  id="otpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  disabled={isLoading}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="pl-10 text-center font-mono text-base tracking-[0.3em] border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand/40 focus-visible:border-brand h-10 rounded-[10px]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              className="w-full flex items-center justify-center h-10 rounded-xl bg-gradient-to-b from-brand-dark to-brand-darker text-white font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 focus:ring-offset-paper active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none shadow-[0_4px_12px_rgba(58,21,119,0.20)] cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activating MFA...
                </>
              ) : (
                'Verify & Activate / सत्यापित करें'
              )}
            </button>
          </form>
        )}

        {step === 'mfa-verify' && (
          <form onSubmit={handleMfaVerify} className="space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold uppercase tracking-wider text-brand">2-Step Verification</h3>
              <p className="text-xs text-mute leading-relaxed">
                Enter the time-based 6-digit security code generated by your Google Authenticator app.
              </p>
            </div>

            {/* Error Callout */}
            {error && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs animate-shake">
                <AlertCircle size={14} className="shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* OTP Code field */}
            <div className="space-y-1.5">
              <Label htmlFor="otpCode" className="text-label text-[10px] font-bold uppercase tracking-wide">Verification Code (6 Digits)</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={15} />
                <Input
                  id="otpCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  disabled={isLoading}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="pl-10 text-center font-mono text-base tracking-[0.3em] border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand/40 focus-visible:border-brand h-10 rounded-[10px]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length !== 6}
              className="w-full flex items-center justify-center h-10 rounded-xl bg-gradient-to-b from-brand-dark to-brand-darker text-white font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 focus:ring-offset-paper active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none shadow-[0_4px_12px_rgba(58,21,119,0.20)] cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Login / सत्यापित करें'
              )}
            </button>

            {/* Reset option when user lost access code (Sends Email OTP to registered address) */}
            <div className="text-center pt-1">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleRequestEmailOtp}
                className="text-xs text-mute hover:text-brand hover:underline transition-colors focus:outline-none bg-transparent border-0 cursor-pointer font-medium"
              >
                Reset Authenticator / Lost Device? (नया QR कोड जनरेट करें)
              </button>
            </div>
          </form>
        )}

        {/* Step 4: Email OTP Verification Step */}
        {step === 'email-otp' && (
          <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
            <div className="text-center space-y-1">
              <div className="inline-flex p-2.5 rounded-full bg-brand/10 text-brand mb-1">
                <Mail size={22} />
              </div>
              <h3 className="font-serif text-base font-bold text-ink">Enter Email Verification Code</h3>
              <p className="text-xs text-mute leading-relaxed">
                A 6-digit verification code has been sent to your registered email: <br />
                <span className="font-mono font-bold text-brand">{maskedEmail}</span>
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="emailOtp" className="text-label text-[10px] font-bold uppercase tracking-wide">
                Email Code (6 Digits) / ईमेल कोड
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={15} />
                <Input
                  id="emailOtp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  disabled={isLoading}
                  value={emailOtpCode}
                  onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="pl-10 text-center font-mono text-base tracking-[0.3em] border-beige bg-field text-ink placeholder:text-mute focus-visible:ring-brand/40 focus-visible:border-brand h-10 rounded-[10px]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || emailOtpCode.length !== 6}
              className="w-full flex items-center justify-center h-10 rounded-xl bg-gradient-to-b from-brand-dark to-brand-darker text-white font-semibold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 focus:ring-offset-paper active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none shadow-[0_4px_12px_rgba(58,21,119,0.20)] cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying Code...
                </>
              ) : (
                'Verify & Generate QR / कोड सत्यापित करें'
              )}
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setStep('mfa-verify')}
                className="text-mute hover:text-ink font-medium bg-transparent border-0 cursor-pointer"
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleRequestEmailOtp}
                className="text-brand hover:underline font-semibold bg-transparent border-0 cursor-pointer"
              >
                Resend Email Code
              </button>
            </div>
          </form>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-center justify-center pb-5 pt-1">
        <span className="text-mute text-[10.5px] tracking-wide">
          Authorized administrators only · Activity is monitored
        </span>
        <div className="flex gap-4 mt-2.5 text-[10px] text-mute font-semibold">
          <Link href="/terms" className="hover:text-brand hover:underline transition-colors">
            Terms of Service
          </Link>
          <span>•</span>
          <Link href="/privacy" className="hover:text-brand hover:underline transition-colors">
            Privacy Policy
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-cream font-sans">
      {/* ── Warm cream background ─────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#fdfbf7] via-cream to-[#f3eee4] z-0" />

      {/* Soft ambient purple glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand/10 rounded-full blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand/[0.07] rounded-full blur-[120px]" />

      {/* ── Login Card wrapper with Suspense ───────────────────────────── */}
      <div className="relative w-full max-w-[440px] px-4 z-10 animate-fade-in">
        <Suspense fallback={
          <Card className="border border-beige bg-paper text-ink flex items-center justify-center py-20 rounded-[22px] shadow-[0_10px_30px_rgba(20,18,40,0.08)]">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
          </Card>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
