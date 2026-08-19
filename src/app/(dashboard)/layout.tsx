import { DashboardShell } from "@/components/layout/dashboard-shell";
import { logoutAction } from "@/features/auth/actions";
import { prisma } from "@/lib/prisma";
import { getAccessScope, getPermissionKeys } from "@/lib/rbac";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await getAccessScope();
  const permissions = getPermissionKeys(access);

  const unreadNotificationCount = await prisma.notification.count({
    where: {
      userId: access.userId,
      isRead: false,
    },
  });

  return (
    <>
      <DashboardShell
        userEmail={access.email}
        permissions={permissions}
        unreadNotificationCount={unreadNotificationCount}
        logoutAction={logoutAction}
      >
        {children}
      </DashboardShell>

      <Analytics />
      <SpeedInsights />
    </>
  );
}