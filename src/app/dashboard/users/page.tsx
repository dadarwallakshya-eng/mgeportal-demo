'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Settings, UserPlus, Search, Eye, EyeOff, Edit3, UserMinus, ShieldAlert, CheckCircle2, AlertCircle, Loader2, X, ShieldCheck, Check, KeyRound
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface UserRecord {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: 'DIRECTOR' | 'PRINCIPAL' | 'DATA_ENTRY' | 'DEPARTMENT_HEAD';
  accessUnits: string[];
  isActive: boolean;
  createdAt: string;
}

const UNIT_LABELS: Record<string, string> = {
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
  hostel: 'Modern Hostel',
  transport: 'Transport',
};

export default function UserManagementPage() {
  const [role, setRole] = useState('');
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal states
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);

  // Form states (Add/Edit)
  const [formName, setFormName] = useState('');
  const [formPrefix, setFormPrefix] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'DIRECTOR' | 'PRINCIPAL' | 'DATA_ENTRY'>('PRINCIPAL');
  const [formUnits, setFormUnits] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);


  // Verify director status
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) setRole(d.user.role);
      })
      .finally(() => setIsLoadingUser(false));
  }, []);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'DIRECTOR') {
      loadUsers();
    }
  }, [role, loadUsers]);


  const handleDeactivate = async (u: UserRecord) => {
    const confirmDeactivate = window.confirm(
      `Are you sure you want to deactivate ${u.name}'s account (${u.username})?`
    );
    if (!confirmDeactivate) return;

    try {
      const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSuccess(`Account ${u.username} deactivated successfully.`);
      loadUsers();
    } catch (e: any) {
      setError(e.message || 'Deactivation failed.');
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const prefix = formPrefix.trim();
    if (!formName.trim() || !prefix || !formPassword.trim() || formUnits.length === 0) {
      setError('All fields are required and at least one division must be selected.');
      return;
    }

    // Append default domain
    const username = `${prefix.replace(/@.*$/, '')}@mgportal.com`;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          username,
          password: formPassword,
          email: formEmail.trim() || undefined,
          role: formRole,
          accessUnits: formUnits,
          isActive: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'VALIDATION_ERROR' && data.details) {
          const detailMsg = data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
          throw new Error(`Validation failed: ${detailMsg}`);
        }
        throw new Error(data.error || 'Failed to create user');
      }

      setSuccess(`User ${username} created successfully.`);
      setShowAdd(false);
      // Reset form
      setFormName('');
      setFormPrefix('');
      setFormEmail('');
      setFormPassword('');
      setFormRole('PRINCIPAL');
      setFormUnits([]);
      loadUsers();
    } catch (e: any) {
      setError(e.message || 'Failed to create user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (u: UserRecord) => {
    setSelectedUser(u);
    setFormName(u.name);
    // Split prefix from domain
    setFormPrefix(u.username.split('@')[0]);
    setFormEmail(u.email || '');
    setFormPassword(''); // blank unless changing
    setFormRole(u.role as any);
    setFormUnits(u.accessUnits);
    setShowEdit(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const prefix = formPrefix.trim();
    if (!formName.trim() || !prefix || formUnits.length === 0) {
      setError('Name, username prefix, and divisions are required.');
      return;
    }

    const username = `${prefix.replace(/@.*$/, '')}@mgportal.com`;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/users/${selectedUser?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          username,
          email: formEmail.trim() || undefined,
          password: formPassword.trim() || undefined, // send if modified
          role: formRole,
          accessUnits: formUnits,
          isActive: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      setSuccess(`User ${username} updated successfully.`);
      setShowEdit(false);
      loadUsers();
    } catch (e: any) {
      setError(e.message || 'Failed to update user.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminMfaReset = async (u: UserRecord) => {
    const confirmed = confirm(
      `Are you sure you want to reset 2FA Authenticator for ${u.name} (${u.username})?\n\n` +
      `This will clear their current 2FA key and require them to register a new authenticator device upon their next login.`
    );
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/auth/mfa/reset-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: u.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset 2FA');

      setSuccess(data.message || `2FA reset successfully for ${u.name}.`);
      loadUsers();
    } catch (e: any) {
      setError(e.message || 'Failed to reset 2FA.');
    }
  };

  const handleUnitToggle = (unitId: string) => {
    setFormUnits((prev) =>
      prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]
    );
  };

  const filteredUsers = users.filter(
    (u) =>
      u.isActive &&
      (u.name.toLowerCase().includes(search.toLowerCase()) ||
       u.username.toLowerCase().includes(search.toLowerCase()))
  );

  if (isLoadingUser) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-brand" />
      </div>
    );
  }

  if (role !== 'DIRECTOR') {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <ShieldAlert size={48} className="mx-auto text-red-600 mb-4" />
        <h2 className="text-lg font-bold text-ink">Access Denied</h2>
        <p className="text-mute text-xs mt-2">
          Only directors can view or manage account configurations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <Settings size={22} className="text-brand" /> User Management
          </h1>
          <p className="text-xs text-mute mt-1">
            Create portal accounts, configure scoped division access, and manage credentials.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/users/whitelist">
            <Button
              variant="outline"
              className="border-brand text-brand hover:bg-brand/5 font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer"
            >
              Google Gateway Whitelist
            </Button>
          </Link>
          <Button
            onClick={() => {
              setFormName('');
              setFormPrefix('');
              setFormPassword('');
              setFormRole('PRINCIPAL');
              setFormUnits([]);
              setShowAdd(true);
            }}
            className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-xs h-9 px-4 gap-2 rounded-lg cursor-pointer"
          >
            <UserPlus size={14} /> Add User Account
          </Button>
        </div>
      </div>

      {/* ── Status Alerts ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={14} className="shrink-0" /> <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 size={14} className="shrink-0" /> <span>{success}</span>
        </div>
      )}

      {/* ── Search & Metrics ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" size={14} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or username..."
            className="pl-9 border-beige bg-field text-ink text-xs placeholder:text-mute focus-visible:ring-brand"
          />
        </div>
        <span className="text-xs text-mute">
          Showing <span className="font-bold text-label">{filteredUsers.length}</span> of{' '}
          <span className="font-bold text-label">{users.filter((u) => u.isActive).length}</span> active portal accounts
        </span>
      </div>

      {/* ── User Table Card ─────────────────────────────────────────────── */}
      <Card className="border-beige bg-paper text-ink shadow-md">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-brand" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16">
              <Settings size={36} className="mx-auto text-mute mb-3 animate-pulse" />
              <p className="text-mute text-sm font-semibold">No accounts found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige bg-cream text-mute font-bold uppercase tracking-wider">
                    <th className="p-4">Name</th>
                    <th className="p-4">Portal Username</th>
                    <th className="p-4">Registered OTP Email</th>
                    <th className="p-4">System Role</th>
                    <th className="p-4">Permitted Divisions</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige">
                  {filteredUsers.map((u) => {
                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-cream transition-colors ${
                          !u.isActive ? 'opacity-45' : ''
                        }`}
                      >
                        <td className="p-4 font-bold text-ink">{u.name}</td>
                        <td className="p-4 font-mono font-semibold text-brand">{u.username}</td>
                        <td className="p-4 font-mono text-xs text-ink">{u.email || <span className="text-mute italic">Not Set</span>}</td>
                        <td className="p-4 font-semibold text-mute">{u.role}</td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {u.accessUnits.map((unit) => (
                              <span
                                key={unit}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-extrabold bg-brand/10 text-brand border border-brand/20 uppercase"
                              >
                                {UNIT_LABELS[unit] || unit}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-3xs font-bold ${
                              u.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-600 border border-red-200'
                            }`}
                          >
                            {u.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openEditModal(u)}
                              title="Edit User"
                              className="p-1.5 rounded bg-cream hover:bg-beige text-mute hover:text-ink cursor-pointer"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              onClick={() => handleAdminMfaReset(u)}
                              title="Reset 2FA Authenticator"
                              className="p-1.5 rounded bg-brand/10 hover:bg-brand/20 text-brand cursor-pointer"
                            >
                              <KeyRound size={13} />
                            </button>
                            {u.role !== 'DIRECTOR' && u.isActive && (
                              <button
                                onClick={() => handleDeactivate(u)}
                                title="Deactivate Account"
                                className="p-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer"
                              >
                                <UserMinus size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MODAL: Add User Account ────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <Card className="border border-beige bg-paper text-ink shadow-2xl w-full max-w-md">
            <CardHeader className="pb-3 border-b border-beige">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-brand">
                  Add User Account
                </CardTitle>
                <button
                  onClick={() => setShowAdd(false)}
                  className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </CardHeader>
            <form onSubmit={handleAddSubmit}>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="addName" className="text-label text-xs font-semibold">
                    Name
                  </Label>
                  <Input
                    id="addName"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Amit Sharma"
                    className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="addPrefix" className="text-label text-xs font-semibold">
                    Username
                  </Label>
                  <div className="flex items-center">
                    <Input
                      id="addPrefix"
                      value={formPrefix}
                      onChange={(e) => setFormPrefix(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase())}
                      placeholder="e.g. amit23"
                      className="h-8 rounded-r-none border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono"
                    />
                    <span className="inline-flex items-center px-3 h-8 border border-l-0 border-beige bg-cream text-mute text-xs font-mono font-semibold rounded-r-lg">
                      @mgportal.com
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="addEmail" className="text-label text-xs font-semibold">
                    Registered Personal Email (for 2FA Reset OTP)
                  </Label>
                  <Input
                    id="addEmail"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. user@gmail.com"
                    className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="addPassword" className="text-label text-xs font-semibold">
                    Password
                  </Label>
                  <Input
                    id="addPassword"
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="e.g. Am#8$Tx9"
                    className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="addRole" className="text-label text-xs font-semibold">
                    System Role
                  </Label>
                  <select
                    id="addRole"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="PRINCIPAL">Principal</option>
                    <option value="DATA_ENTRY">Data Entry Operator</option>
                    <option value="DIRECTOR">Director</option>
                  </select>
                </div>

                <div className="space-y-1.5 pt-1">
                  <Label className="text-label text-xs font-semibold">
                    Division Access Scopes
                  </Label>
                  <div className="grid grid-cols-2 gap-2 border border-beige p-2.5 rounded-lg bg-cream">
                    {Object.entries(UNIT_LABELS).map(([id, label]) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 text-xs font-medium text-mute hover:text-ink cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formUnits.includes(id)}
                          onChange={() => handleUnitToggle(id)}
                          className="rounded text-brand border-beige focus:ring-brand cursor-pointer"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-beige mt-4">
                  <Button
                    type="button"
                    onClick={() => setShowAdd(false)}
                    variant="ghost"
                    className="h-8 text-2xs hover:bg-cream text-mute font-semibold rounded-md"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-2xs h-8 px-4 rounded-lg cursor-pointer flex gap-1.5"
                  >
                    {isSubmitting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Save Account
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}

      {/* ── MODAL: Edit User Account ───────────────────────────────────── */}
      {showEdit && selectedUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <Card className="border border-beige bg-paper text-ink shadow-2xl w-full max-w-md">
            <CardHeader className="pb-3 border-b border-beige">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-brand">
                  Edit User Account
                </CardTitle>
                <button
                  onClick={() => setShowEdit(false)}
                  className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>
            </CardHeader>
            <form onSubmit={handleEditSubmit}>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="editName" className="text-label text-xs font-semibold">
                    Name
                  </Label>
                  <Input
                    id="editName"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Amit Sharma"
                    className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editPrefix" className="text-label text-xs font-semibold">
                    Username
                  </Label>
                  <div className="flex items-center">
                    <Input
                      id="editPrefix"
                      value={formPrefix}
                      onChange={(e) => setFormPrefix(e.target.value.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase())}
                      placeholder="e.g. amit23"
                      className="h-8 rounded-r-none border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono"
                    />
                    <span className="inline-flex items-center px-3 h-8 border border-l-0 border-beige bg-cream text-mute text-xs font-mono font-semibold rounded-r-lg">
                      @mgportal.com
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editEmail" className="text-label text-xs font-semibold">
                    Registered Personal Email (for 2FA Reset OTP)
                  </Label>
                  <Input
                    id="editEmail"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g. user@gmail.com"
                    className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editPassword" className="text-label text-xs font-semibold">
                    New Password (optional)
                  </Label>
                  <Input
                    id="editPassword"
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    className="h-8 border-beige bg-field text-ink text-xs focus-visible:ring-brand font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editRole" className="text-label text-xs font-semibold">
                    System Role
                  </Label>
                  <select
                    id="editRole"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    className="w-full h-8 bg-field border border-beige text-ink text-xs rounded-lg px-2 focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="PRINCIPAL">Principal</option>
                    <option value="DATA_ENTRY">Data Entry Operator</option>
                    <option value="DIRECTOR">Director</option>
                  </select>
                </div>

                <div className="space-y-1.5 pt-1">
                  <Label className="text-label text-xs font-semibold">
                    Division Access Scopes
                  </Label>
                  <div className="grid grid-cols-2 gap-2 border border-beige p-2.5 rounded-lg bg-cream">
                    {Object.entries(UNIT_LABELS).map(([id, label]) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 text-xs font-medium text-mute hover:text-ink cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formUnits.includes(id)}
                          onChange={() => handleUnitToggle(id)}
                          className="rounded text-brand border-beige focus:ring-brand cursor-pointer"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-beige mt-4">
                  <Button
                    type="button"
                    onClick={() => setShowEdit(false)}
                    variant="ghost"
                    className="h-8 text-2xs hover:bg-cream text-mute font-semibold rounded-md"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-brand hover:bg-[#4a2090] text-white font-semibold text-2xs h-8 px-4 rounded-lg cursor-pointer flex gap-1.5"
                  >
                    {isSubmitting ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Update Account
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
