import { DashboardShell } from "@/components/layout/dashboard-shell";
import { logoutAction } from "@/features/auth/actions";
import { getAccessScope, getPermissionKeys } from "@/lib/rbac";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccessScope();
  const permissions = getPermissionKeys(access);

  return (
    <DashboardShell
      userEmail={access.email}
      permissions={permissions}
      logoutAction={logoutAction}
    >
      {children}
    </DashboardShell>
  );
}