'use client';

import React from 'react';
import Link from 'next/link';
import { Shield, Eye, Key, Database, Mail, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function PrivacyPolicyPage() {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-start py-12 px-4 overflow-hidden bg-cream font-sans">
      {/* Background radial gradient and ambient glows */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#fdfbf7] via-cream to-[#f3eee4] z-0" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand/5 rounded-full blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-brand/[0.05] rounded-full blur-[120px]" />

      <div className="relative w-full max-w-3xl z-10 space-y-6">
        {/* Back Link */}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-xs font-semibold text-mute hover:text-brand transition-colors select-none"
        >
          <ArrowLeft size={14} /> Back to Login / वापस जाएं
        </Link>

        {/* Core Card */}
        <Card className="border border-beige bg-paper text-ink rounded-[22px] shadow-[0_10px_30px_rgba(20,18,40,0.05)] overflow-hidden">
          <CardHeader className="border-b border-beige p-8 bg-cream/40">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-brand/10 text-brand">
                <Shield size={24} />
              </div>
              <div>
                <CardTitle className="font-serif text-2xl font-bold tracking-tight text-ink">
                  Privacy Policy
                </CardTitle>
                <CardDescription className="text-mute text-xs mt-1">
                  Last updated: June 11, 2026 · Modern Group of Education
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-8 space-y-6 text-sm text-label leading-relaxed">
            <p>
              At the <strong>Modern Group of Education (MGE)</strong>, we respect your privacy and are committed to protecting the personal data of our students, staff, and system administrators. This policy describes how we collect, store, secure, and use information within this administrative portal.
            </p>

            <hr className="border-beige" />

            {/* Operator Contact details */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <Mail size={16} className="text-brand" /> Operator & Contact Information
              </h3>
              <p className="text-xs text-mute pl-6">
                This portal is operated and managed by:
              </p>
              <div className="text-xs text-mute pl-6 space-y-1 font-mono bg-cream/40 p-3 rounded-lg border border-beige/60">
                <p><strong>Operator Name:</strong> Lakshya Kumawat</p>
                <p><strong>Email Address:</strong> lakshya@modernedugrp.in</p>
                <p><strong>Postal Address:</strong> New Modern Sen. Sec. School, Kuchaman City Rajasthan (341508)</p>
              </div>
            </div>

            {/* Section 1 */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <Database size={16} className="text-brand" /> 1. Data Collection & Usage
              </h3>
              <p className="text-xs text-mute pl-6">
                We store and process data required for normal school operations, including:
              </p>
              <ul className="list-disc text-xs text-mute pl-10 space-y-1">
                <li>Student demographic information, parent contact details, and classes.</li>
                <li>Financial fee records, invoices, outstanding balances, and payment collections.</li>
                <li>Staff personal files, employment histories, bank details, and payroll data.</li>
                <li>Administrative audit logs containing action types, usernames, and timestamp metrics.</li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <Key size={16} className="text-brand" /> 2. Data Protection & Access Control
              </h3>
              <p className="text-xs text-mute pl-6">
                Our database utilizes advanced access control patterns. All user passwords are encrypted using state-of-the-art hashing algorithms. Operational staff access is strictly scoped: data entry operators are restricted from accessing payroll or fee summaries, and principals are bound to view only their assigned school medium.
              </p>
            </div>

            {/* Section 3 */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <Eye size={16} className="text-brand" /> 3. Cookies & Session Management
              </h3>
              <p className="text-xs text-mute pl-6">
                This portal uses secure session cookies to keep you authenticated. These cookies are stored as <strong>HttpOnly</strong> and <strong>Secure</strong>, meaning they cannot be accessed by client-side scripts, protecting your credentials from cross-site scripting (XSS) risks.
              </p>
            </div>

            <hr className="border-beige" />

            <div className="text-center text-3xs text-mute pt-4">
              © {new Date().getFullYear()} Modern Group of Education, Kuchaman City, Rajasthan. All Rights Reserved.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
