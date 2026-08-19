import Link from "next/link";

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/notifications/actions";
import { prisma } from "@/lib/prisma";
import { getAccessScope } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function typeClass(type: string) {
  switch (type) {
    case "LOW_STOCK":
      return "bg-red-50 text-red-700 border-red-200";
    case "TRANSFER":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "RETURN":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "INVOICE":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export default async function NotificationsPage() {
  const access = await getAccessScope();
  const notifications = await prisma.notification.findMany({
    where: { userId: access.userId },
    include: { school: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const unread = notifications.filter((item) => !item.isRead).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Low stock, transfer, return and operational alerts. {unread} unread.
          </p>
        </div>
        {unread > 0 ? (
          <form action={markAllNotificationsReadAction}>
            <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              Mark all as read
            </button>
          </form>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {notifications.length ? (
          <div className="divide-y divide-slate-100">
            {notifications.map((item) => (
              <div
                key={item.id}
                className={`p-4 sm:p-5 ${item.isRead ? "bg-white" : "bg-slate-50/70"}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${typeClass(item.type)}`}>
                        {item.type.replaceAll("_", " ")}
                      </span>
                      {!item.isRead ? (
                        <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-bold text-white">
                          NEW
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {formatDate(item.createdAt)}{item.school ? ` · ${item.school.name}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Open
                      </Link>
                    ) : null}
                    {!item.isRead ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={item.id} />
                        <button className="h-9 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white">
                          Mark read
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-16 text-center text-sm text-slate-500">
            No notifications yet.
          </div>
        )}
      </div>
    </div>
  );
}
