import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
  },
  {
    label: "Schools",
    href: "/schools",
  },
  {
    label: "Users",
    href: "/users",
  },
  {
    label: "Students",
    href: "/students",
  },
  {
    label: "Products",
    href: "/products",
  },
  {
    label: "Inventory",
    href: "/inventory",
  },
  {
    label: "Transfers",
    href: "/transfers",
  },
  {
    label: "POS Billing",
    href: "/pos",
  },
  {
    label: "Invoices",
    href: "/invoices",
  },
  {
    label: "Reports",
    href: "/reports",
  },
  {
    label: "Import / Export",
    href: "/import-export",
  },
  {
    label: "Audit Logs",
    href: "/audit-logs",
  },
  {
    label: "Settings",
    href: "/settings",
  },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center justify-between px-6">
          <div>
            <p className="text-sm font-semibold text-slate-950">
              School POS System
            </p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </form>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden min-h-[calc(100vh-56px)] w-64 border-r border-slate-200 bg-white p-4 md:block">
          <nav className="space-y-1 text-sm">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}