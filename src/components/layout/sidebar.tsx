'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  UserCheck,
  CircleDollarSign,
  BookOpen,
  Wallet,
  Bus,
  Home,
  Settings,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  MapPin,
  ArrowRightLeft,
  UserCog,
  Brain,
  Database,
  Activity,
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
  userRole: string;
  accessUnits?: string[];
}

interface NavItem {
  type?: 'heading';
  name: string;
  href?: string;
  icon?: React.ComponentType<any>;
  roles: string[];
  division?: string;
}

export default function Sidebar({
  isCollapsed,
  setIsCollapsed,
  isMobileOpen = false,
  setIsMobileOpen,
  userRole,
  accessUnits,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get('tab');
  const [activeUnit, setActiveUnit] = React.useState<string>('all');

  React.useEffect(() => {
    const handleUnitChange = () => {
      const unit = localStorage.getItem('mge-active-unit') || 'all';
      setActiveUnit(unit);
    };

    window.addEventListener('mge-unit-changed', handleUnitChange);
    handleUnitChange(); // Initial check

    return () => {
      window.removeEventListener('mge-unit-changed', handleUnitChange);
    };
  }, []);

  const navItems: NavItem[] = [
    { type: 'heading', name: 'Core Portal', roles: ['DIRECTOR', 'PRINCIPAL', 'DATA_ENTRY', 'DEPARTMENT_HEAD'] },
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'] },
    { name: 'Students', href: '/dashboard/students', icon: Users, roles: ['DIRECTOR', 'PRINCIPAL', 'DATA_ENTRY'] },
    { name: 'Alumni Portal', href: '/dashboard/alumni', icon: GraduationCap, roles: ['DIRECTOR', 'PRINCIPAL'] },
    { name: 'Fees Engine', href: '/dashboard/fees', icon: CreditCard, roles: ['DIRECTOR', 'PRINCIPAL'] },
    { name: 'Staff Management', href: '/dashboard/staff', icon: UserCheck, roles: ['DIRECTOR', 'PRINCIPAL', 'DEPARTMENT_HEAD'] },
    { name: 'Payroll & Salary', href: '/dashboard/payroll', icon: CircleDollarSign, roles: ['DIRECTOR', 'PRINCIPAL'] },
    { name: 'Income & Expense', href: '/dashboard/accounts', icon: Wallet, roles: ['DIRECTOR', 'PRINCIPAL'] },
    { name: 'Core Management', href: '/dashboard/core-management', icon: Users, roles: ['DIRECTOR'] },
    { name: 'Accounting Hub ERP', href: '/dashboard/accounting-hub', icon: CircleDollarSign, roles: ['DIRECTOR'] },
    { name: 'AI Manager', href: '/dashboard/ai-manager', icon: Brain, roles: ['DIRECTOR'] },
    { name: 'Transport Department', href: '/dashboard/transport', icon: Bus, roles: ['DIRECTOR', 'PRINCIPAL'] },
    { name: 'Hostel Boarding', href: '/dashboard/hostel', icon: Home, roles: ['DIRECTOR', 'PRINCIPAL'], division: 'hostel' },

    { type: 'heading', name: 'Transport Fleet', roles: ['DEPARTMENT_HEAD'], division: 'transport' },
    { name: 'Transport Dashboard', href: '/dashboard/transport?tab=dashboard', icon: LayoutDashboard, roles: ['DEPARTMENT_HEAD'], division: 'transport' },
    { name: 'Bus Stations', href: '/dashboard/transport?tab=stations', icon: MapPin, roles: ['DEPARTMENT_HEAD'], division: 'transport' },
    { name: 'Fleet Management', href: '/dashboard/transport?tab=fleet', icon: Bus, roles: ['DEPARTMENT_HEAD'], division: 'transport' },
    { name: 'Drivers Directory', href: '/dashboard/transport?tab=drivers', icon: UserCheck, roles: ['DEPARTMENT_HEAD'], division: 'transport' },
    { name: 'Transport Finance', href: '/dashboard/transport?tab=finance', icon: ArrowRightLeft, roles: ['DEPARTMENT_HEAD'], division: 'transport' },

    { type: 'heading', name: 'Hostel Boarding', roles: ['DEPARTMENT_HEAD'], division: 'hostel' },
    { name: 'Hostel Dashboard', href: '/dashboard/hostel?tab=dashboard', icon: LayoutDashboard, roles: ['DEPARTMENT_HEAD'], division: 'hostel' },
    { name: 'Hostel Residents', href: '/dashboard/hostel?tab=students', icon: Users, roles: ['DEPARTMENT_HEAD'], division: 'hostel' },
    { name: 'Hostel Staff', href: '/dashboard/hostel?tab=staff', icon: UserCog, roles: ['DEPARTMENT_HEAD'], division: 'hostel' },
    { name: 'Hostel Finance', href: '/dashboard/hostel?tab=finance', icon: Wallet, roles: ['DEPARTMENT_HEAD'], division: 'hostel' },

    { type: 'heading', name: 'System', roles: ['DIRECTOR'] },
    { name: 'User Management', href: '/dashboard/users', icon: Settings, roles: ['DIRECTOR'] },
    { name: 'DBMS / Backups', href: '/dashboard/dbms', icon: Database, roles: ['DIRECTOR'] },
    { name: 'System Sessions & Logs', href: '/dashboard/system-logs', icon: Activity, roles: ['DIRECTOR'] },
  ];

  const allowedItems = navItems.filter((item) => {
    // 1. Role checks
    if (!item.roles.includes(userRole)) return false;

    // 2. Hide hostel items/headings if division is hostel and active unit is college
    if (item.division === 'hostel' && activeUnit === 'college') {
      return false;
    }

    // 3. Department Head restrictions
    if (userRole === 'DEPARTMENT_HEAD') {
      if (item.division === 'transport') {
        return accessUnits?.includes('transport') ?? false;
      }
      if (item.division === 'hostel') {
        return accessUnits?.includes('hostel') ?? false;
      }
      // Hide all other items/headings for HODs
      return false;
    }

    return true;
  });

  return (
    <>
      {/* Mobile Sidebar backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden"
          onClick={() => setIsMobileOpen?.(false)}
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col border-r border-beige bg-paper text-ink transition-all duration-300 md:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${isCollapsed ? 'md:w-16' : 'md:w-64'} w-64`}
      >
      {/* ── Brand Logo & Title ────────────────────────────────────────── */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-beige">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden select-none">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-beige bg-field flex-shrink-0">
            <Image
              src="/logo.jpg"
              alt="MGE"
              fill
              className="object-contain p-0.5"
            />
          </div>
          {!isCollapsed && (
            <span className="font-bold text-sm bg-gradient-to-r from-brand to-[#6b3bb0] bg-clip-text text-transparent truncate">
              MGE School Portal
            </span>
          )}
        </Link>
        {!isCollapsed && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="rounded p-1 hover:bg-cream text-mute hover:text-ink cursor-pointer hidden md:block"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* ── Navigation Links ──────────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {allowedItems.map((item, index) => {
          if (item.type === 'heading') {
            if (isCollapsed) {
              return <div key={`divider-${index}`} className="h-px bg-beige/60 my-3 mx-2" />;
            }
            return (
              <div
                key={`heading-${item.name}`}
                className="text-[10px] uppercase tracking-wider font-extrabold text-mute px-3 pt-4 pb-1 select-none"
              >
                {item.name}
              </div>
            );
          }

          // Compute isActive for query-driven sub-tabs
          const [basePath, queryStr] = item.href!.split('?');
          let isActive = false;
          if (pathname === basePath) {
            if (queryStr) {
              const itemParams = new URLSearchParams(queryStr);
              const itemTab = itemParams.get('tab');
              const activeTab = activeTabParam || 'dashboard';
              isActive = itemTab === activeTab;
            } else {
              isActive = true;
            }
          } else if (item.href !== '/dashboard' && pathname.startsWith(item.href!)) {
            isActive = true;
          }

          const Icon = item.icon!;

          return (
            <Link
              key={item.name}
              href={item.href!}
              onClick={() => setIsMobileOpen?.(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative ${
                isActive
                  ? 'bg-brand text-white font-semibold'
                  : 'text-mute hover:bg-cream hover:text-ink'
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!isCollapsed && <span className="truncate">{item.name}</span>}
              
              {/* Tooltip on collapse */}
              {isCollapsed && (
                <div className="absolute left-14 hidden group-hover:block bg-cream text-ink text-xs px-2.5 py-1.5 rounded-md border border-beige shadow-xl z-50 whitespace-nowrap">
                  {item.name}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Sidebar Footer / Collapse Trigger ─────────────────────────── */}
      {isCollapsed && (
        <div className="p-2 border-t border-beige flex justify-center">
          <button
            onClick={() => setIsCollapsed(false)}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-cream text-mute hover:text-ink cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </aside>
  </>
  );
}
