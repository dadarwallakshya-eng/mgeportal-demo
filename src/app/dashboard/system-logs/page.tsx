'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Activity, Clock, Laptop, User, Shield, Terminal, 
  AlertCircle, Loader2, Wifi, Calendar, ArrowUpRight 
} from 'lucide-react';
import Link from 'next/link';

interface Session {
  id: string;
  userId: string;
  loginAt: string;
  logoutAt: string | null;
  lastActive: string;
  activePath: string;
  ip: string;
  userAgent: string;
  user: {
    name: string;
    username: string;
    role: string;
  };
}

interface ActivityLog {
  id: string;
  userId: string;
  timestamp: string;
  action: string;
  entity: string;
  details: string | null;
  user: {
    name: string;
    role: string;
  };
}

export default function SystemLogsPage() {
  const [activeTab, setActiveTab] = useState<'active' | 'activities' | 'history'>('active');
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [completedSessions, setCompletedSessions] = useState<Session[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/system/sessions');
      if (!res.ok) {
        if (res.status === 403) throw new Error('Access denied. Only Directors can view system logs.');
        throw new Error('Failed to fetch system logs.');
      }
      const data = await res.json();
      setActiveSessions(data.activeSessions || []);
      setCompletedSessions(data.completedSessions || []);
      setActivities(data.activities || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Poll every 2 minutes (120 seconds) for live presence updates
    const interval = setInterval(fetchLogs, 120000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (start: string, end: string | null) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const diffMs = endTime - startTime;
    
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Less than a minute';
    const hrs = Math.floor(diffMins / 600);
    const mins = diffMins % 60;
    
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} mins`;
  };

  const getCleanUserAgent = (ua: string) => {
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Macintosh')) return 'MacBook / Mac';
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('Android')) return 'Android Phone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Linux')) return 'Linux PC';
    return ua.substring(0, 20) + '...';
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-mute">
        <Loader2 className="animate-spin text-brand" size={32} />
        <p className="text-xs font-semibold uppercase tracking-wider">Syncing Presence & Session logs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2.5 p-4 rounded-xl border border-red-200 bg-red-50 text-red-600 text-xs max-w-lg">
          <AlertCircle size={18} className="shrink-0" />
          <div>
            <h4 className="font-bold">System Log Fetch Error</h4>
            <p className="mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-beige pb-5">
        <div>
          <h1 className="text-xl font-black text-ink tracking-tight uppercase flex items-center gap-2">
            <Shield className="text-brand" size={20} /> System Sessions & Logs
          </h1>
          <p className="text-xs text-mute mt-1">
            Monitor online collaborators, active tab sessions, user actions, and device audits.
          </p>
        </div>
        <div className="flex items-center gap-2 border border-beige bg-field/30 rounded-xl p-1 shrink-0 w-fit">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'active' ? 'bg-brand text-white shadow-md' : 'text-mute hover:text-ink'
            }`}
          >
            Active Users ({activeSessions.length})
          </button>
          <button
            onClick={() => setActiveTab('activities')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'activities' ? 'bg-brand text-white shadow-md' : 'text-mute hover:text-ink'
            }`}
          >
            Activity Stream
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history' ? 'bg-brand text-white shadow-md' : 'text-mute hover:text-ink'
            }`}
          >
            Session History
          </button>
        </div>
      </div>

      {/* ── Active Sessions View ────────────────────────────────────────── */}
      {/* ── Active Sessions View ────────────────────────────────────────── */}
      {activeTab === 'active' && (
        <div className="space-y-4">
          <h2 className="text-xs font-black uppercase text-brand tracking-widest flex items-center gap-1.5">
            <Wifi className="animate-pulse" size={13} /> Active Sessions Right Now
          </h2>
          {activeSessions.length === 0 ? (
            <Card className="border border-dashed border-beige bg-field/10">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center text-mute text-xs">
                <User size={24} className="opacity-40 mb-2" />
                <p>No other active user sessions detected.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[650px] overflow-y-auto pr-1 scrollbar-thin">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeSessions.map((session) => (
                  <Card key={session.id} className="border border-beige bg-cream text-ink relative overflow-hidden group shadow-sm hover:shadow-md transition-all">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
                    <CardHeader className="pb-2 pl-5 pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-xs font-bold text-ink uppercase tracking-wider">{session.user.name}</CardTitle>
                          <CardDescription className="text-brand text-3xs font-extrabold uppercase mt-0.5">{session.user.role.replace('_', ' ')}</CardDescription>
                        </div>
                        <div className="flex items-center gap-1 text-3xs font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Online
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs pl-5 pb-4">
                      <div className="flex items-center gap-1.5 text-mute">
                        <Clock size={12} />
                        <span>Active for: <strong className="text-ink font-semibold">{formatDuration(session.loginAt, null)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-mute">
                        <Laptop size={12} />
                        <span>Device: <strong className="text-ink font-semibold">{getCleanUserAgent(session.userAgent)}</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5 text-mute">
                        <Terminal size={12} />
                        <span>IP: <strong className="text-ink font-semibold font-mono text-3xs">{session.ip}</strong></span>
                      </div>
                      <div className="pt-2 mt-2 border-t border-beige/60 flex items-center justify-between text-3xs font-bold">
                        <span className="text-mute uppercase tracking-widest">Active Tab:</span>
                        <span className="text-[#6b3bb0] font-semibold flex items-center gap-0.5">
                          {session.activePath} <ArrowUpRight size={10} />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── User Activity Stream View ───────────────────────────────────── */}
      {activeTab === 'activities' && (
        <Card className="border border-beige bg-cream shadow-sm text-ink">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase text-brand tracking-wider flex items-center gap-1.5">
              <Activity size={14} /> Chronological Audit Stream
            </CardTitle>
            <CardDescription className="text-xs text-mute">Historical database mutations, logins, and configurations.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-mute text-xs">
                <Terminal size={24} className="opacity-40 mb-2" />
                <p>No recorded activity audit events in database.</p>
              </div>
            ) : (
              <div className="max-h-[650px] overflow-y-auto overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs relative">
                  <thead className="sticky top-0 z-10 border-b border-beige bg-cream">
                    <tr className="text-mute uppercase font-bold text-3xs tracking-wider">
                      <th className="px-5 py-3 bg-cream">Timestamp</th>
                      <th className="px-4 py-3 bg-cream">Actor Name</th>
                      <th className="px-4 py-3 bg-cream">Role</th>
                      <th className="px-4 py-3 bg-cream">Action</th>
                      <th className="px-4 py-3 bg-cream">Entity Type</th>
                      <th className="px-5 py-3 bg-cream">Audit Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige/60">
                    {activities.map((act) => (
                      <tr key={act.id} className="hover:bg-field/10">
                        <td className="px-5 py-2.5 font-mono text-3xs text-mute">
                          {new Date(act.timestamp).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-2.5 font-bold">{act.user.name}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-3xs uppercase font-extrabold tracking-wider text-brand">
                            {act.user.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-3xs text-brand/80">{act.action}</td>
                        <td className="px-4 py-2.5 text-mute">{act.entity}</td>
                        <td className="px-5 py-2.5">
                          {(() => {
                            if (!act.details) return <span className="text-mute">—</span>;
                            try {
                              const parsed = typeof act.details === 'string' ? JSON.parse(act.details) : act.details;
                              if (typeof parsed !== 'object' || parsed === null) {
                                return <span className="text-ink font-medium">{String(act.details)}</span>;
                              }
                              return (
                                <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                                  {Object.entries(parsed).map(([k, v]) => {
                                    const formattedVal = k.toLowerCase().includes('amount') && typeof v === 'number'
                                      ? `₹${v.toLocaleString('en-IN')}`
                                      : String(v);
                                    return (
                                      <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-paper border border-beige/80 text-ink shadow-2xs">
                                        <span className="text-mute font-bold uppercase text-[8px] tracking-wider">{k}:</span>
                                        <span className="font-mono text-brand font-bold text-3xs">{formattedVal}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            } catch {
                              return <span className="text-ink font-mono text-3xs">{act.details}</span>;
                            }
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Historical Completed Sessions View ──────────────────────────── */}
      {activeTab === 'history' && (
        <Card className="border border-beige bg-cream shadow-sm text-ink">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold uppercase text-brand tracking-wider flex items-center gap-1.5">
              <Clock size={14} /> Completed User Sessions Log
            </CardTitle>
            <CardDescription className="text-xs text-mute">Archived records of past user visits, IPs, and active durations.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {completedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-mute text-xs">
                <Calendar size={24} className="opacity-40 mb-2" />
                <p>No historical completed sessions found.</p>
              </div>
            ) : (
              <div className="max-h-[650px] overflow-y-auto overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs relative">
                  <thead className="sticky top-0 z-10 border-b border-beige bg-cream">
                    <tr className="text-mute uppercase font-bold text-3xs tracking-wider">
                      <th className="px-5 py-3 bg-cream">Login Time</th>
                      <th className="px-4 py-3 bg-cream">User</th>
                      <th className="px-4 py-3 bg-cream">Role</th>
                      <th className="px-4 py-3 bg-cream">Duration</th>
                      <th className="px-4 py-3 bg-cream">Platform</th>
                      <th className="px-4 py-3 bg-cream">IP Address</th>
                      <th className="px-5 py-3 bg-cream">Last Exit Path</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-beige/60">
                    {completedSessions.map((session) => (
                      <tr key={session.id} className="hover:bg-field/10 text-mute">
                        <td className="px-5 py-2.5 font-mono text-3xs">
                          {new Date(session.loginAt).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-ink">{session.user.name}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-3xs uppercase font-extrabold tracking-wider text-brand">
                            {session.user.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-ink font-semibold">
                          {formatDuration(session.loginAt, session.logoutAt || session.lastActive)}
                        </td>
                        <td className="px-4 py-2.5">{getCleanUserAgent(session.userAgent)}</td>
                        <td className="px-4 py-2.5 font-mono text-3xs">{session.ip}</td>
                        <td className="px-5 py-2.5 font-mono text-3xs">{session.activePath}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
