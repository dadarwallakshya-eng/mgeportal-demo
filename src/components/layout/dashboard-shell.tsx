'use client';

import React, { useState } from 'react';
import Sidebar from './sidebar';
import Header from './header';
import Breadcrumbs from './breadcrumbs';

interface DashboardShellProps {
  children: React.ReactNode;
  user: {
    id: string;
    username: string;
    role: string;
    name: string;
    accessUnits: string[];
    phone?: string | null;
    photoUrl?: string | null;
  };
}

export default function DashboardShell({ children, user }: DashboardShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream text-ink flex font-sans">
      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        userRole={user.role}
        accessUnits={user.accessUnits}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 pl-0 ${
          isSidebarCollapsed ? 'md:pl-16' : 'md:pl-64'
        }`}
      >
        {/* Header */}
        <Header user={user} onMenuClick={() => setIsMobileOpen(!isMobileOpen)} />

        {/* Content Wrapper */}
        <main className="flex-1 flex flex-col p-6 max-w-7xl w-full mx-auto pb-12">
          {/* Breadcrumbs */}
          <Breadcrumbs />

          {/* Children Pages */}
          <div className="flex-1 flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
