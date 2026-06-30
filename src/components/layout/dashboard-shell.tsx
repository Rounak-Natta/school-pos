"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  group: "Business" | "Operations" | "Admin";
};

type DashboardShellProps = {
  children: ReactNode;
  userEmail: string;
  logoutAction: () => Promise<void>;
};

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "⌂",
    group: "Business",
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: "↗",
    group: "Business",
  },
  {
    label: "Billing",
    href: "/pos",
    icon: "₹",
    group: "Business",
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: "≡",
    group: "Business",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: "▣",
    group: "Business",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: "□",
    group: "Operations",
  },
  {
    label: "Products",
    href: "/products",
    icon: "◈",
    group: "Operations",
  },
  {
    label: "Transfers",
    href: "/transfers",
    icon: "⇄",
    group: "Operations",
  },
  {
    label: "Students",
    href: "/students",
    icon: "◎",
    group: "Operations",
  },
  {
    label: "Schools",
    href: "/schools",
    icon: "▤",
    group: "Admin",
  },
  {
    label: "Users",
    href: "/users",
    icon: "◐",
    group: "Admin",
  },
  {
    label: "Import / Export",
    href: "/import-export",
    icon: "⇅",
    group: "Admin",
  },
  {
    label: "Audit Logs",
    href: "/audit-logs",
    icon: "◇",
    group: "Admin",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "⚙",
    group: "Admin",
  },
];

const groupOrder: NavItem["group"][] = ["Business", "Operations", "Admin"];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getPageTitle(pathname: string) {
  const activeItem = navItems
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => isActivePath(pathname, item.href));

  return activeItem?.label ?? "School POS";
}

function getInitials(email: string) {
  const name = email.split("@")[0] || "U";

  return name
    .split(/[._\-\s]+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const groupedItems = useMemo(() => {
    return groupOrder.map((group) => ({
      group,
      items: navItems.filter((item) => item.group === group),
    }));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-5">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-sm">
          POS
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-tight text-slate-950">
            School POS
          </p>
          <p className="truncate text-xs text-slate-500">
            Billing & Inventory
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-6">
          {groupedItems.map((group) => (
            <div key={group.group}>
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {group.group}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      className={`group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all duration-200 ${
                        active
                          ? "bg-slate-950 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs transition-all duration-200 ${
                          active
                            ? "bg-white/15 text-white"
                            : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-slate-900"
                        }`}
                      >
                        {item.icon}
                      </span>

                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function DashboardShell({
  children,
  userEmail,
  logoutAction,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle = getPageTitle(pathname);
  const initials = getInitials(userEmail);

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-slate-200 bg-white md:block">
        <SidebarContent pathname={pathname} />
      </aside>

      <div
        className={`fixed inset-0 z-50 md:hidden ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <aside
          className={`absolute inset-y-0 left-0 w-80 max-w-[86vw] border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarContent
            pathname={pathname}
            onNavigate={() => setMobileOpen(false)}
          />
        </aside>
      </div>

      <header className="fixed left-0 right-0 top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl md:left-72">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-700 transition hover:bg-slate-50 md:hidden"
              aria-label="Open menu"
            >
              <span className="text-xl leading-none">≡</span>
            </button>

            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-tight text-slate-950">
                {pageTitle}
              </p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                Manage POS, inventory, revenue and school operations
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="/pos"
              className="hidden h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 sm:inline-flex"
            >
              New Bill
            </Link>

            <div className="hidden h-10 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 sm:flex">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-slate-950 text-[11px] font-bold text-white">
                {initials}
              </div>

              <div className="max-w-[180px]">
                <p className="truncate text-xs font-semibold text-slate-900">
                  {userEmail}
                </p>
                <p className="text-[11px] text-slate-500">Active session</p>
              </div>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="min-w-0 pt-16 md:pl-72">
        <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}