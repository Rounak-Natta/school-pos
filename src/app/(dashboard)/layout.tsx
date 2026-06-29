import { DashboardShell } from "@/components/layout/dashboard-shell";
import { logoutAction } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <DashboardShell userEmail={user.email} logoutAction={logoutAction}>
      {children}
    </DashboardShell>
  );
}