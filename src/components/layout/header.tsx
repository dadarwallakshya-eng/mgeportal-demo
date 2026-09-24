'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User, Bell, ChevronDown, Check, Building2, X, UploadCloud, Loader2, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { triggerDataChange, useDataSubscription } from '@/lib/events';

interface HeaderProps {
  user: {
    id: string;
    username: string;
    role: string;
    name: string;
    accessUnits: string[];
    phone?: string | null;
    photoUrl?: string | null;
  };
  onMenuClick?: () => void;
}

const UNIT_LABELS: Record<string, string> = {
  all: 'Whole Group',
  hindi: 'New Modern Sr. Sec. School',
  english: 'Modern English School',
  college: 'Modern Mahila Mahavidhyalaya',
  hostel: 'Modern Hostel',
  transport: 'MGE Transport Fleet',
};

const fmt = (n: string | number) => `₹${Number(n).toLocaleString('en-IN')}`;

export default function Header({ user, onMenuClick }: HeaderProps) {
  const router = useRouter();
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'details' | 'salary'>('details');
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDesc, setWithdrawDesc] = useState('');
  const [withdrawDate, setWithdrawDate] = useState('');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);

  useEffect(() => {
    if (user.role !== 'DIRECTOR') return;

    const fetchOnlineUsers = async () => {
      try {
        const res = await fetch('/api/system/sessions?activeOnly=true');
        if (res.ok) {
          const data = await res.json();
          const uniqueUsers: any[] = [];
          const seenIds = new Set();
          if (data.activeSessions) {
            for (const sess of data.activeSessions) {
              if (sess.user && !seenIds.has(sess.user.id)) {
                seenIds.add(sess.user.id);
                uniqueUsers.push({
                  ...sess.user,
                  activePath: sess.activePath,
                });
              }
            }
          }
          setOnlineUsers(uniqueUsers);
        }
      } catch (err) {
        console.error('[FETCH_ONLINE_USERS_ERROR]', err);
      }
    };

    fetchOnlineUsers();
    const interval = setInterval(fetchOnlineUsers, 120000);
    return () => clearInterval(interval);
  }, [user.role]);

  const CORE_MANAGEMENT_EMAILS = [
    'kamlesh2005@mgportal.com',
    'kamleshkumar@mgportal.com',
    'm8l31@mgportal.com',
    's2k75@mgportal.com',
    'transporthead@mgportal.com'
  ];
  const isCoreManagement = CORE_MANAGEMENT_EMAILS.includes(user.username);

  useEffect(() => {
    // Load selected unit from localStorage or default to first access unit
    const savedUnit = localStorage.getItem('mge-active-unit');
    const roleUpper = user.role?.toUpperCase();
    const isDirector = roleUpper === 'DIRECTOR';
    const userUnits = user.accessUnits || [];
    
    // For Director, any valid unit key in UNIT_LABELS is allowed.
    // For other roles, they must have the unit explicitly in their accessUnits.
    const isValidUnit = savedUnit && (
      userUnits.includes(savedUnit) || 
      (savedUnit === 'all' && isDirector) ||
      (isDirector && Object.keys(UNIT_LABELS).includes(savedUnit))
    );
    
    if (isValidUnit) {
      setSelectedUnit(savedUnit);
    } else if (isDirector) {
      setSelectedUnit('all');
      localStorage.setItem('mge-active-unit', 'all');
    } else if (userUnits.length > 0) {
      setSelectedUnit(userUnits[0]);
      localStorage.setItem('mge-active-unit', userUnits[0]);
    }
  }, [user.accessUnits, user.role]);

  const loadSalaryData = useCallback(async () => {
    if (!isCoreManagement || !selectedUnit) return;
    setIsLoadingData(true);
    setWithdrawError(null);
    try {
      // Fetch balance
      const resBal = await fetch(`/api/core-management/balance?unitId=${selectedUnit}`);
      const dataBal = await resBal.json();
      if (resBal.ok) {
        setBalance(dataBal.balance);
      }
      
      // Fetch history
      const resHist = await fetch(`/api/core-management/withdrawals?unitId=${selectedUnit}`);
      const dataHist = await resHist.json();
      if (resHist.ok) {
        setWithdrawals(dataHist.transactions || []);
      }
    } catch (err) {
      console.error('Failed to load salary data', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [isCoreManagement, selectedUnit]);

  useEffect(() => {
    if (isModalOpen && activeModalTab === 'salary') {
      loadSalaryData();
    }
  }, [isModalOpen, activeModalTab, loadSalaryData]);

  useDataSubscription(useCallback(() => {
    if (isModalOpen && activeModalTab === 'salary') {
      loadSalaryData();
    }
  }, [isModalOpen, activeModalTab, loadSalaryData]));

  const handleUnitChange = (unit: string) => {
    setSelectedUnit(unit);
    localStorage.setItem('mge-active-unit', unit);
    setIsUnitOpen(false);
    // Reload or fire event so active page updates context
    window.dispatchEvent(new Event('mge-unit-changed'));
    router.refresh();
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleUploadPhotoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setPhotoError('Only image files (JPEG, PNG, WEBP) are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be smaller than 5MB.');
      return;
    }

    setIsSavingPhoto(true);
    setPhotoError(null);

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 150;
            canvas.height = 150;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas context');

            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 150, 150);

            const base64 = canvas.toDataURL('image/jpeg', 0.8);

            const res = await fetch('/api/core-management/update-profile', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photoUrl: base64 }),
            });

            if (res.ok) {
              setIsEditingPhoto(false);
              router.refresh();
            } else {
              const data = await res.json();
              setPhotoError(data.error || 'Failed to update photo.');
            }
          } catch (canvasErr) {
            console.error(canvasErr);
            setPhotoError('Failed to process image.');
          } finally {
            setIsSavingPhoto(false);
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setPhotoError('Failed to read image file.');
      setIsSavingPhoto(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError(null);
    setWithdrawSuccess(false);
    const amt = Number(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError('Please enter a positive amount');
      return;
    }
    if (balance !== null && amt > balance) {
      setWithdrawError('Insufficient funds in the selected division');
      return;
    }
    setIsWithdrawing(true);
    try {
      const res = await fetch('/api/core-management/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, unitId: selectedUnit, description: withdrawDesc, date: withdrawDate || null }),
      });
      if (res.ok) {
        setWithdrawAmount('');
        setWithdrawDesc('');
        setWithdrawDate('');
        setWithdrawSuccess(true);
        loadSalaryData();
        triggerDataChange();
      } else {
        const data = await res.json();
        setWithdrawError(data.error || 'Withdrawal failed');
      }
    } catch (err) {
      setWithdrawError('An error occurred during withdrawal');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Notification States
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Poll for new notifications every 60 seconds (efficient short-lived API calls)
    const interval = setInterval(() => {
      fetchNotifications();
    }, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleMarkOneRead = async (id: string) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  return (
    <header className="sticky top-0 right-0 z-20 flex h-16 w-full items-center justify-between border-b border-beige bg-paper px-6 text-ink">
      {/* ── Active Unit Selector ────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 -ml-2 rounded-lg hover:bg-cream text-mute hover:text-ink transition-colors cursor-pointer"
        >
          <Menu size={20} />
        </button>
        <div className="relative">
        <button
          onClick={() => setIsUnitOpen(!isUnitOpen)}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-beige bg-cream/50 hover:bg-cream text-sm font-semibold transition-all select-none cursor-pointer"
        >
          <Building2 size={16} className="text-brand" />
          <span className="truncate max-w-[180px] sm:max-w-xs">
            {UNIT_LABELS[selectedUnit] || 'Select Division'}
          </span>
          <ChevronDown size={14} className="text-mute" />
        </button>

        {isUnitOpen && (
          <div className="absolute left-0 mt-2 w-56 rounded-lg border border-beige bg-cream shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
            <div className="px-3 py-2 border-b border-beige">
              <span className="text-mute text-2xs uppercase tracking-wider font-bold">
                Available Divisions
              </span>
            </div>
            <div className="p-1 space-y-0.5">
              {(user.role?.toUpperCase() === 'DIRECTOR' ? Object.keys(UNIT_LABELS) : (user.accessUnits || [])).map((unitCode) => {
                const isSelected = selectedUnit === unitCode;
                return (
                  <button
                    key={unitCode}
                    onClick={() => handleUnitChange(unitCode)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-brand/10 text-brand font-semibold'
                        : 'text-label hover:bg-beige'
                    }`}
                  >
                    <span>{UNIT_LABELS[unitCode] || unitCode.toUpperCase()}</span>
                    {isSelected && <Check size={14} className="text-brand" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* ── Top Bar Controls & User Profile ────────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* Active Online Users (Avatars) */}
        {user.role === 'DIRECTOR' && onlineUsers.length > 0 && (
          <div className="flex items-center -space-x-1.5 mr-2">
            {onlineUsers.map((onlineUser) => {
              const initials = onlineUser.name
                ? onlineUser.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
                : '?';
              return (
                <div
                  key={onlineUser.id}
                  className="relative group cursor-pointer"
                >
                  {onlineUser.photoUrl ? (
                    <img
                      src={onlineUser.photoUrl}
                      alt={onlineUser.name}
                      className="w-7 h-7 rounded-full border border-beige bg-field object-cover ring-2 ring-paper"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full border border-beige bg-brand/10 text-brand text-2xs font-extrabold flex items-center justify-center ring-2 ring-paper uppercase">
                      {initials}
                    </div>
                  )}
                  {/* Tooltip */}
                  <div className="absolute right-0 top-full mt-2 w-48 hidden group-hover:block bg-paper border border-beige rounded-lg shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-1 text-ink text-3xs">
                    <p className="font-bold text-xs">{onlineUser.name}</p>
                    <p className="text-mute font-medium text-3xs uppercase tracking-wider">{onlineUser.role.replace('_', ' ')}</p>
                    <p className="text-[#6b3bb0] font-medium truncate mt-1">Viewing: {onlineUser.activePath || '/dashboard'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative rounded-lg p-1.5 hover:bg-cream text-mute hover:text-ink transition-colors cursor-pointer"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-paper" />
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg border border-beige bg-cream shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 text-ink">
              <div className="flex items-center justify-between px-4 py-3 border-b border-beige">
                <span className="text-xs font-extrabold uppercase tracking-wider text-brand">
                  Notifications ({unreadCount})
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-3xs uppercase tracking-wider font-extrabold text-brand hover:underline cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-beige">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-mute font-medium">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleMarkOneRead(notif.id)}
                      className={`p-3 text-left transition-colors cursor-pointer ${
                        notif.isRead ? 'hover:bg-beige/40' : 'bg-brand/5 hover:bg-brand/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className={`text-xs ${notif.isRead ? 'font-semibold text-ink' : 'font-bold text-brand'}`}>
                          {notif.title}
                        </span>
                        {!notif.isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-3xs text-label leading-normal mt-1 break-words">
                        {notif.message}
                      </p>
                      <span className="text-4xs text-mute font-semibold block mt-1.5">
                        {new Date(notif.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="h-6 w-[1px] bg-beige" />

        {/* User profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-cream transition-colors select-none cursor-pointer"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand text-sm font-bold">
              {user.name.charAt(0)}
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-semibold text-ink">{user.name}</span>
              <span className="text-2xs font-medium text-mute">
                {user.role === 'DEPARTMENT_HEAD'
                  ? user.accessUnits.includes('transport')
                    ? 'HOD Transport'
                    : user.accessUnits.includes('hostel')
                    ? 'HOD Hostel'
                    : 'HOD'
                  : user.role.replace('_', ' ').toLowerCase()}
              </span>
            </div>
            <ChevronDown size={14} className="text-mute hidden md:block" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg border border-beige bg-cream shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
              <div className="px-4 py-3 border-b border-beige text-ink">
                <p className="text-xs font-semibold">{user.name}</p>
                <p className="text-2xs text-mute font-medium truncate mt-0.5">
                  @{user.username}
                </p>
              </div>
              
              <div className="p-1 space-y-0.5 border-b border-beige">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    setIsModalOpen(true);
                    setActiveModalTab('details');
                    setPhotoUrlInput(user.photoUrl || '');
                    setIsEditingPhoto(false);
                    setPhotoError(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-mute hover:bg-beige hover:text-ink transition-colors text-left cursor-pointer"
                >
                  <User size={14} />
                  <span>Profile details</span>
                </button>
              </div>

              <div className="p-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-left cursor-pointer"
                >
                  <LogOut size={14} />
                  <span>Logout from Portal</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Profile Details & Salary Withdrawal Modal ────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-xl rounded-xl border border-beige bg-paper text-ink shadow-2xl p-6 relative flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-beige pb-3">
              <h2 className="text-base font-extrabold uppercase tracking-wider text-brand">
                User Profile details
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-cream rounded text-mute hover:text-ink cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs Selector (Only for core management) */}
            {isCoreManagement && (
              <div className="flex border-b border-beige shrink-0 -mt-2">
                <button
                  onClick={() => setActiveModalTab('details')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeModalTab === 'details'
                      ? 'border-brand text-brand'
                      : 'border-transparent text-mute hover:text-ink'
                  }`}
                >
                  Profile Details
                </button>
                <button
                  onClick={() => setActiveModalTab('salary')}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    activeModalTab === 'salary'
                      ? 'border-brand text-brand'
                      : 'border-transparent text-mute hover:text-ink'
                  }`}
                >
                  Salary Withdrawal
                </button>
              </div>
            )}

            {/* Tab Content */}
            {activeModalTab === 'details' ? (
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 py-2">
                {/* Profile Photo */}
                <div className="flex flex-col items-center gap-2">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-brand/30 bg-brand/5 flex items-center justify-center shrink-0">
                    {user.photoUrl ? (
                      <img src={user.photoUrl} alt={user.name} className="object-cover w-full h-full" />
                    ) : (
                      <span className="text-3xl font-extrabold text-brand select-none">
                        {user.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  {!isEditingPhoto ? (
                    <button
                      onClick={() => setIsEditingPhoto(true)}
                      className="text-3xs uppercase tracking-wider font-extrabold text-brand hover:underline cursor-pointer"
                    >
                      Change Photo
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditingPhoto(false)}
                      className="text-3xs uppercase tracking-wider font-extrabold text-mute hover:underline cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {/* Profile Information details */}
                <div className="flex-1 space-y-4 w-full text-center sm:text-left">
                  {isEditingPhoto ? (
                    <div className="space-y-3 text-left">
                      <label className="text-[10px] text-mute font-bold uppercase tracking-wider block">
                        Upload Profile Photo
                      </label>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingPhoto(true);
                        }}
                        onDragLeave={() => setIsDraggingPhoto(false)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          setIsDraggingPhoto(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file) handleUploadPhotoFile(file);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 ${
                          isDraggingPhoto
                            ? 'border-brand bg-brand/5 scale-[0.99]'
                            : 'border-beige bg-field hover:border-brand/40 hover:bg-cream/40'
                        } ${isSavingPhoto ? 'pointer-events-none opacity-80' : ''}`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadPhotoFile(file);
                          }}
                          accept="image/*"
                          className="hidden"
                        />
                        {isSavingPhoto ? (
                          <div className="flex flex-col items-center justify-center py-2 space-y-2">
                            <Loader2 size={20} className="text-brand animate-spin" />
                            <p className="text-[10px] font-semibold text-brand">Uploading directly to database...</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-1 space-y-1">
                            <UploadCloud size={24} className="text-mute" />
                            <p className="text-xs font-bold text-ink">
                              Drag &amp; drop file here, or <span className="text-brand">browse</span>
                            </p>
                            <p className="text-[9px] text-mute">
                              Images only (Max 5MB). Photo is optimized &amp; saved in database.
                            </p>
                          </div>
                        )}
                      </div>

                      {photoError && (
                        <p className="text-3xs font-semibold text-red-600 mt-1">{photoError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 text-xs">
                      <div>
                        <span className="text-2xs text-mute font-semibold block">Full Name</span>
                        <span className="font-bold text-ink text-sm">{user.name}</span>
                      </div>
                      <div>
                        <span className="text-2xs text-mute font-semibold block">Username (Email)</span>
                        <span className="font-semibold text-ink">{user.username}</span>
                      </div>
                      <div>
                        <span className="text-2xs text-mute font-semibold block">System Role</span>
                        <span className="font-semibold uppercase text-brand text-2xs bg-brand/10 px-2 py-0.5 rounded-full inline-block mt-0.5">
                          {user.role.replace('_', ' ')}
                        </span>
                      </div>
                      {isCoreManagement && user.phone && (
                        <div>
                          <span className="text-2xs text-mute font-semibold block">Mobile Number</span>
                          <span className="font-bold text-ink">{user.phone}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-2xs text-mute font-semibold block">Authorized Divisions</span>
                        <span className="text-mute font-medium leading-relaxed block mt-0.5 text-left">
                          {user.accessUnits.map(code => UNIT_LABELS[code] || code).join(', ')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Tab 2 Content (Salary Withdrawal)
              <div className="space-y-4 py-1">
                {/* Active Division Summary */}
                <div className="bg-cream p-4 rounded-xl border border-beige flex items-center justify-between flex-wrap gap-3">
                  <div className="text-left">
                    <h3 className="text-2xs text-mute font-bold uppercase tracking-wider">
                      Active Division
                    </h3>
                    <p className="text-sm font-bold text-ink mt-0.5">
                      {UNIT_LABELS[selectedUnit] || 'Select Division'}
                    </p>
                  </div>
                  <div className="text-right">
                    <h3 className="text-2xs text-mute font-bold uppercase tracking-wider">
                      Available Cash
                    </h3>
                    {isLoadingData ? (
                      <p className="text-sm font-bold text-mute mt-0.5">Loading...</p>
                    ) : balance !== null ? (
                      <p className="text-lg font-extrabold text-emerald-700 mt-0.5">
                        {fmt(balance)}
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-red-600 mt-0.5">Error</p>
                    )}
                  </div>
                </div>

                {/* Form to withdraw */}
                <form onSubmit={handleWithdraw} className="space-y-3 p-4 bg-brand/5 rounded-xl border border-brand/20">
                  <div className="text-left">
                    <h3 className="text-xs font-bold text-brand uppercase tracking-wider">
                      Take Division Money (Salary)
                    </h3>
                    <p className="text-3xs text-mute mt-0.5 leading-normal">
                      This amount will be directly logged in this division's expense ledger under Category 'SALARY' as 'Principal Salary'. It will not appear in the standard payroll slip runs.
                    </p>
                  </div>

                  {withdrawError && (
                    <div className="p-2 text-2xs text-red-600 bg-red-50 border border-red-200 rounded-lg text-left">
                      {withdrawError}
                    </div>
                  )}

                  {withdrawSuccess && (
                    <div className="p-2 text-2xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg text-left">
                      Withdrawal recorded successfully! Division ledger updated.
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                      <div className="space-y-1">
                        <label className="text-3xs text-mute font-semibold">Withdrawal Date (Optional)</label>
                        <input
                          type="date"
                          value={withdrawDate}
                          onChange={(e) => setWithdrawDate(e.target.value)}
                          className="w-full h-8 px-2 bg-field border border-beige rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-3xs text-mute font-semibold">Description / Purpose</label>
                        <input
                          type="text"
                          value={withdrawDesc}
                          onChange={(e) => setWithdrawDesc(e.target.value)}
                          placeholder="e.g. Diesel, Conveyance, Personal"
                          className="w-full h-8 px-2 bg-field border border-beige rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-3xs text-mute font-semibold">Amount to Take (₹)</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={withdrawAmount}
                          onChange={(e) => {
                            setWithdrawAmount(e.target.value);
                            setWithdrawError(null);
                            setWithdrawSuccess(false);
                          }}
                          placeholder="Enter amount in ₹"
                          className="w-full h-8 px-2 bg-field border border-beige rounded-md text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={isWithdrawing || isLoadingData || balance === null || balance <= 0}
                      className="w-full h-8 px-4 bg-brand hover:bg-[#4a2090] text-white font-bold text-xs rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {isWithdrawing ? 'Withdrawing...' : 'Take Money'}
                    </button>
                  </div>
                </form>

                {/* Historical Withdrawals */}
                <div className="space-y-2">
                  <h3 className="text-2xs text-mute font-bold uppercase tracking-wider text-left">
                    Recent Withdrawals (This Division)
                  </h3>
                  <div className="border border-beige rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                    {isLoadingData ? (
                      <div className="p-4 text-center text-xs text-mute">Loading history...</div>
                    ) : withdrawals.length === 0 ? (
                      <div className="p-4 text-center text-xs text-mute">No withdrawals recorded in this division.</div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-cream border-b border-beige text-mute text-[10px] font-bold uppercase tracking-wider">
                            <th className="p-2 pl-3">Date</th>
                            <th className="p-2">Description</th>
                            <th className="p-2 pr-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-beige font-medium">
                          {withdrawals.map(t => (
                            <tr key={t.id} className="hover:bg-cream/40">
                              <td className="p-2 pl-3 text-mute font-mono">
                                {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className="p-2 text-ink truncate max-w-[180px]" title={t.description || ''}>
                                {t.description || 'Core Management Salary'}
                              </td>
                              <td className="p-2 pr-3 text-right text-red-600 font-mono font-bold">
                                -{fmt(t.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
