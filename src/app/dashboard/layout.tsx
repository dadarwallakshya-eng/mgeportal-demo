import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import DashboardShell from '@/components/layout/dashboard-shell';
import SessionTimeoutListener from '@/components/auth/SessionTimeoutListener';
import SessionPresenceTracker from '@/components/auth/SessionPresenceTracker';
import prisma from '@/lib/prisma';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // If session is expired or invalid, redirect to login
  if (!session) {
    redirect('/login');
  }

  // Fetch latest photoUrl and phone from database safely
  let dbUser = null;
  try {
    dbUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        phone: true,
        photoUrl: true,
      },
    });
  } catch (err) {
    console.warn('[DASHBOARD_LAYOUT_USER_WARN] DB lookup warning, proceeding with session claims:', err);
  }

  // Cast UserPayload to pass to the client component
  const user = {
    id: session.userId,
    username: session.username,
    role: session.role,
    name: session.name,
    accessUnits: session.accessUnits,
    phone: dbUser?.phone || null,
    photoUrl: dbUser?.photoUrl || null,
  };

  return (
    <>
      <SessionTimeoutListener />
      <SessionPresenceTracker />
      <DashboardShell user={user}>{children}</DashboardShell>
    </>
  );
}
