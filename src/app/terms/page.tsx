'use client';

import React from 'react';
import Link from 'next/link';
import { Shield, BookOpen, Clock, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function TermsOfServicePage() {
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
                  Terms of Service
                </CardTitle>
                <CardDescription className="text-mute text-xs mt-1">
                  Last updated: June 11, 2026 · Modern Group of Education
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-8 space-y-6 text-sm text-label leading-relaxed">
            <p>
              Welcome to the <strong>Modern Group of Education (MGE) School Portal</strong>. By accessing or using this system, you agree to comply with and be bound by the following terms and conditions. Please read them carefully.
            </p>

            <hr className="border-beige" />

            {/* Section 1 */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <BookOpen size={16} className="text-brand" /> 1. Authorized Account Access
              </h3>
              <p className="text-xs text-mute pl-6">
                This portal is intended solely for authorized administrative staff, principals, and directors of MGE. You are responsible for keeping your login credentials secure and confidential. Sharing credentials or accessing another user&apos;s account without explicit permission is strictly prohibited.
              </p>
            </div>

            {/* Section 2 */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <Clock size={16} className="text-brand" /> 2. Activity Monitoring & Recording
              </h3>
              <p className="text-xs text-mute pl-6">
                To maintain data integrity and security, all logins, data entry, student registration, financial transaction records, and administrative modifications are logged for audit purposes. Unauthorized access attempts or suspicious activities will be investigated and may result in immediate revocation of access.
              </p>
            </div>

            {/* Section 3 */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <AlertTriangle size={16} className="text-brand" /> 3. Responsible Use & Data Accuracy
              </h3>
              <p className="text-xs text-mute pl-6">
                All portal operators (including Data Entry staff) must ensure the accuracy and completeness of all student registrations, attendance, and outstanding fee values entered. Deliberate falsification of data or misuse of general ledger accounting systems will lead to disciplinary actions.
              </p>
            </div>

            {/* Section 4 */}
            <div className="space-y-2">
              <h3 className="font-bold text-ink flex items-center gap-2">
                <Shield size={16} className="text-brand" /> 4. Intellectual Property & Brand Assets
              </h3>
              <p className="text-xs text-mute pl-6">
                All logo marks, page layouts, design elements, analytics aggregation configurations, and operational materials visible on this portal are the intellectual property of Modern Group of Education. Copying or redistribution without written approval is prohibited.
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
