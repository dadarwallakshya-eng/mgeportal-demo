import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  // Direct unverified 1-click self-service 2FA reset is disabled for security.
  // Users must either re-authenticate via a Whitelisted Google Account or request a Director reset.
  return NextResponse.json(
    {
      error: 'Unverified self-service 2FA reset is disabled. Please click "Reset 2FA via Whitelisted Google Account" or contact your Director.',
      code: 'MFA_RESET_RESTRICTED',
    },
    { status: 403 }
  );
}
