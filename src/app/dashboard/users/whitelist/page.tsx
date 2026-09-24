'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, ShieldCheck, Mail, User, Loader2, AlertCircle, CheckCircle2, ShieldAlert
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface WhitelistEntry {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export default function WhitelistPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Verify director status
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setRole(d.user.role);
        }
      })
      .catch(() => {
        setRole(null);
      })
      .finally(() => setIsLoadingUser(false));
  }, []);

  const loadWhitelist = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/google/whitelist');
      const data = await res.json();
      if (res.ok) {
        setWhitelist(data.whitelist || []);
      } else {
        setError(data.error || 'Failed to load whitelist.');
      }
    } catch {
      setError('Connection failed. Could not load whitelist.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'DIRECTOR') {
      loadWhitelist();
    }
  }, [role, loadWhitelist]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError('Email address is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/google/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add email');

      setSuccess(`Gmail "${email.trim().toLowerCase()}" added to the whitelist successfully.`);
      setEmail('');
      setName('');
      loadWhitelist();
    } catch (err: any) {
      setError(err.message || 'Failed to whitelist email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entry: WhitelistEntry) => {
    const confirmDelete = window.confirm(`Are you sure you want to remove ${entry.email} from the Google Gateway whitelist? This will immediately revoke their access to the portal.`);
    if (!confirmDelete) return;

    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/auth/google/whitelist?id=${entry.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete email');

      setSuccess(`Gmail "${entry.email}" removed from whitelist.`);
      loadWhitelist();
    } catch (err: any) {
      setError(err.message || 'Failed to delete email.');
    }
  };

  if (isLoadingUser) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (role !== 'DIRECTOR') {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md p-6 border border-red-200 bg-red-50 text-red-700 rounded-2xl flex flex-col items-center text-center space-y-3">
          <ShieldAlert className="h-12 w-12 text-red-600 animate-pulse" />
          <h2 className="text-lg font-bold">Access Denied / प्रवेश वर्जित</h2>
          <p className="text-sm">
            Only the Director is authorized to manage the Google Gateway Whitelist.
            कृपया व्यवस्थापक से संपर्क करें।
          </p>
          <Button onClick={() => router.push('/dashboard')} className="mt-2 bg-red-600 hover:bg-red-700 text-white">
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/users">
            <Button variant="outline" size="icon" className="border-beige text-mute hover:text-ink rounded-xl">
              <ArrowLeft size={16} />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink font-serif">Google Gateway Whitelist</h1>
            <p className="text-xs text-mute font-medium">Manage Google accounts authorized to bypass the public block gate.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 rounded-full text-green-700 text-[11px] font-bold uppercase tracking-wider">
          <ShieldCheck size={14} className="text-green-600" />
          Double-Gate Active
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs">
          <AlertCircle size={16} className="shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-green-200 bg-green-50 text-green-700 text-xs">
          <CheckCircle2 size={16} className="shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Whitelist Form */}
        <div className="md:col-span-1">
          <Card className="border border-beige bg-paper text-ink rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-brand">Authorize Email</CardTitle>
              <CardDescription className="text-xs">Add a Gmail address to grant access to the portal login page.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="whitelist-email" className="text-[10px] font-bold uppercase tracking-wider text-label">Gmail Address / ईमेल</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
                    <Input
                      id="whitelist-email"
                      type="email"
                      placeholder="username@gmail.com"
                      required
                      disabled={isSubmitting}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 border-beige bg-field placeholder:text-mute focus-visible:ring-brand/40 focus-visible:border-brand rounded-xl h-10 transition-colors text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="whitelist-name" className="text-[10px] font-bold uppercase tracking-wider text-label">Staff Name / नाम (Optional)</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
                    <Input
                      id="whitelist-name"
                      type="text"
                      placeholder="e.g. Ramesh Kumar"
                      disabled={isSubmitting}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-9 border-beige bg-field placeholder:text-mute focus-visible:ring-brand/40 focus-visible:border-brand rounded-xl h-10 transition-colors text-xs"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center bg-gradient-to-b from-brand-dark to-brand-darker text-white font-semibold text-xs h-10 rounded-xl shadow-sm hover:opacity-95 transition-opacity"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authorizing...
                    </>
                  ) : (
                    <>
                      <Plus size={14} className="mr-1.5" />
                      Whitelist Email
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Active Whitelist List */}
        <div className="md:col-span-2">
          <Card className="border border-beige bg-paper text-ink rounded-2xl shadow-sm">
            <CardHeader className="pb-3 border-b border-beige/60">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-brand">Whitelisted Accounts</CardTitle>
              <CardDescription className="text-xs">These users can access the portal login page via Google OAuth.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              ) : whitelist.length === 0 ? (
                <div className="text-center py-12 text-mute text-xs">
                  No whitelisted email accounts found.
                </div>
              ) : (
                <div className="divide-y divide-beige/40">
                  {whitelist.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between p-4 hover:bg-cream/20 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-brand/5 border border-brand/10 flex items-center justify-center text-brand">
                          <Mail size={14} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink font-mono">{entry.email}</p>
                          <p className="text-[10px] text-mute font-medium">
                            {entry.name ? `${entry.name} • ` : ''}Authorized {new Date(entry.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {/* Primary Owner Email can't be deleted */}
                      {entry.email === 'dadarwallakshya@gmail.com' ? (
                        <span className="text-[9px] font-bold text-brand uppercase tracking-wider bg-brand/5 px-2 py-1 border border-brand/10 rounded-lg">
                          Primary Owner
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(entry)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
