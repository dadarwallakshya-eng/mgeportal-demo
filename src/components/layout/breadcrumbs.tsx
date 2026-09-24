'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';

export default function Breadcrumbs() {
  const pathname = usePathname();
  const pathSegments = pathname.split('/').filter((segment) => segment);

  if (pathSegments.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5 text-xs text-mute font-medium py-4 px-1 select-none">
      <Link
        href="/dashboard"
        className="flex items-center gap-1 hover:text-label transition-colors"
      >
        <Home size={14} />
      </Link>
      
      {pathSegments.map((segment, index) => {
        const isLast = index === pathSegments.length - 1;
        const href = '/' + pathSegments.slice(0, index + 1).join('/');
        
        // Clean up display names (e.g. 'fees' -> 'Fees Engine')
        let label = segment.charAt(0).toUpperCase() + segment.slice(1);
        if (segment === 'fees') label = 'Fees Engine';
        if (segment === 'staff') label = 'Staff Management';
        if (segment === 'payroll') label = 'Payroll';
        if (segment === 'accounts') label = 'General Ledger';
        if (segment === 'transport') label = 'Transport Department';
        if (segment === 'hostel') label = 'Hostel Boarding';
        
        return (
          <React.Fragment key={segment}>
            <ChevronRight size={12} className="text-mute shrink-0" />
            {isLast ? (
              <span className="text-label font-semibold">{label}</span>
            ) : (
              <Link
                href={href}
                className="hover:text-label transition-colors capitalize"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
