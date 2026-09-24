'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Download,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardDrive,
  Users,
  Wallet,
  Coins,
  RefreshCw,
  Info
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface BackupRecord {
  key: string;
  name: string;
  size: number;
  lastModified: string;
}

interface DBStats {
  students: number;
  staff: number;
  transactions: number;
  feePayments: number;
}

export default function DBMSPage() {
  const [role, setRole] = useState<string>('');
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [stats, setStats] = useState<DBStats | null>(null);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 1. Verify Director Status
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setRole(d.user.role);
      })
      .finally(() => setIsLoadingUser(false));
  }, []);

  // 2. Fetch Backups History and DB Stats
  const loadBackupData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dbms/backups');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch backups.');
      setBackups(data.backups || []);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load backup directory.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'DIRECTOR') {
      loadBackupData();
    }
  }, [role, loadBackupData]);

  // 3. Trigger Instant Manual Backup & Download
  const handleGenerateBackup = async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      // Trigger API to generate and save to R2
      const res = await fetch('/api/cron/db-backup');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate backup.');

      setSuccess(`Backup ${data.fileName} successfully generated and stored in Cloudflare R2!`);
      
      // Auto-trigger browser download
      window.location.href = '/api/cron/db-backup?download=true';
      
      // Reload history list
      loadBackupData();
    } catch (err: any) {
      setError(err.message || 'Failed to generate system backup.');
    } finally {
      setIsGenerating(false);
    }
  };

  // 4. Download specific backup from list
  const handleDownloadBackup = (record: BackupRecord) => {
    window.location.href = `/api/dbms/backups/download?key=${encodeURIComponent(record.key)}`;
  };

  // Helper: Format byte size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  if (role !== 'DIRECTOR') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
        <ShieldAlert size={48} className="text-red-500 animate-pulse" />
        <h2 className="font-serif text-2xl font-bold text-ink">Access Denied / अनाधिकृत पहुंच</h2>
        <p className="text-mute max-w-md">
          Only the Director is authorized to access the Database Management System (DBMS) control panel.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-2">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-beige pb-5">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink flex items-center gap-2.5">
            <Database className="text-brand" size={24} />
            DBMS & Backups / डेटाबेस प्रबंधन
          </h1>
          <p className="text-xs text-mute mt-1">
            Generate offline system backups, monitor database stats, and secure MGE Portal records.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={loadBackupData}
            disabled={isLoading || isGenerating}
            className="border-beige text-ink hover:bg-cream rounded-xl text-xs h-9 cursor-pointer"
          >
            <RefreshCw size={14} className={`mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh / रिफ्रेश
          </Button>
          <Button
            onClick={handleGenerateBackup}
            disabled={isGenerating || isLoading}
            className="bg-gradient-to-b from-brand-dark to-brand-darker text-white hover:brightness-110 active:scale-[0.98] rounded-xl text-xs h-9 shadow-sm cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Download size={14} className="mr-1.5" />
                Backup & Download / बैकअप डाउनलोड करें
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Notifications ──────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs animate-shake">
          <AlertCircle size={16} className="shrink-0 text-red-500" />
          <p className="font-medium">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2.5 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs animate-fade-in shadow-2xs">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <p className="font-medium">{success}</p>
        </div>
      )}

      {/* ── Overview Statistics Cards ───────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border border-beige bg-paper rounded-xl shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-mute uppercase tracking-wider">Total Students</p>
                <p className="text-xl font-bold text-ink">{stats.students}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                <Users size={18} />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-beige bg-paper rounded-xl shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-mute uppercase tracking-wider">Staff Members</p>
                <p className="text-xl font-bold text-ink">{stats.staff}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                <Users size={18} />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-beige bg-paper rounded-xl shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-mute uppercase tracking-wider">Transactions</p>
                <p className="text-xl font-bold text-ink">{stats.transactions}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
                <Coins size={18} />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-beige bg-paper rounded-xl shadow-2xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-mute uppercase tracking-wider">Fee Payments</p>
                <p className="text-xl font-bold text-ink">{stats.feePayments}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
                <Wallet size={18} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Main Dashboard Layout ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Connection Info & Recovery Instructions */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="border border-beige bg-paper rounded-xl shadow-2xs">
            <CardHeader className="pb-3">
              <CardTitle className="font-serif text-sm font-semibold text-ink flex items-center gap-2">
                <HardDrive size={16} className="text-brand" />
                Storage Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-3.5">
              <div className="flex justify-between items-center py-1.5 border-b border-cream">
                <span className="text-mute font-medium">Backup Storage</span>
                <span className="font-semibold text-ink bg-purple-50 text-brand px-2 py-0.5 rounded-md">Cloudflare R2</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-cream">
                <span className="text-mute font-medium">Auto Backups</span>
                <span className="font-semibold text-ink flex items-center gap-1">
                  <Clock size={13} className="text-emerald-500" />
                  Daily at Midnight
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-cream">
                <span className="text-mute font-medium">Database System</span>
                <span className="font-semibold text-ink">PostgreSQL (Supabase)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-beige bg-paper rounded-xl shadow-2xs">
            <CardHeader className="pb-2">
              <CardTitle className="font-serif text-sm font-semibold text-ink flex items-center gap-2">
                <Info size={16} className="text-blue-500" />
                Disaster Recovery CLI
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-mute space-y-3 leading-relaxed">
              <p>
                In the event of a platform ban, hosting change, or server crash, you can instantly restore your database to a new server using the command-line utility.
              </p>
              <div className="bg-[#fbf9f4] border border-beige p-2.5 rounded-lg font-mono text-[10.5px] text-ink overflow-x-auto whitespace-pre">
                npm run db:restore &lt;path_to_backup.zip&gt;
              </div>
              <p className="text-[11px] italic">
                Note: This operation clears all tables on the target database and seeds them in correct dependency order.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Backups History List */}
        <div className="lg:col-span-2">
          <Card className="border border-beige bg-paper rounded-xl shadow-2xs">
            <CardHeader className="pb-3 border-b border-beige">
              <CardTitle className="font-serif text-base font-semibold text-ink">
                Stored Backup History / बैकअप इतिहास
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time backup files uploaded to Cloudflare R2 storage bucket.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                  <span className="text-xs text-mute">Loading R2 Backups Folder...</span>
                </div>
              ) : backups.length === 0 ? (
                <div className="text-center py-16 text-xs text-mute space-y-1">
                  <Database size={24} className="mx-auto text-mute opacity-60 mb-1" />
                  <p className="font-semibold">No backup files found.</p>
                  <p>Click "Backup & Download" above to generate your first system snapshot.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-cream/40 border-b border-beige text-mute uppercase tracking-wider font-semibold">
                        <th className="py-3 px-4">File Name</th>
                        <th className="py-3 px-4">Size</th>
                        <th className="py-3 px-4">Created Date</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream">
                      {backups.map((record) => (
                        <tr key={record.key} className="hover:bg-cream/20 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-medium text-ink break-all max-w-[240px]">
                            {record.name}
                          </td>
                          <td className="py-3.5 px-4 text-mute">
                            {formatBytes(record.size)}
                          </td>
                          <td className="py-3.5 px-4 text-mute">
                            {new Date(record.lastModified).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Button
                              variant="ghost"
                              onClick={() => handleDownloadBackup(record)}
                              className="text-brand hover:text-brand-dark hover:bg-brand/5 rounded-lg p-2 h-8 w-8 cursor-pointer"
                              title="Download backup file"
                            >
                              <Download size={14} />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
