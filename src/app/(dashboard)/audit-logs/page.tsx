import { getAuditLogs } from "@/features/audit/queries";
import { getAccessScope, Permission, requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function formatJson(value: unknown) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default async function AuditLogsPage() {
  const access = await getAccessScope();
  requirePermission(access, Permission.VIEW_AUDIT_LOGS);
  const logs = await getAuditLogs(access, 300);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Trace sensitive billing, inventory, transfer, import, student and product changes.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">School</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => (
              <tr key={log.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-3">{log.school?.name || "Global"}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{log.user?.name || "System"}</p>
                  <p className="text-xs text-slate-500">{log.user?.email || "-"}</p>
                </td>
                <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{log.action}</span></td>
                <td className="px-4 py-3 font-medium text-slate-800">{log.entity}</td>
                <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-500" title={log.entityId || ""}>{log.entityId || "-"}</td>
                <td className="px-4 py-3">
                  {log.oldData || log.newData ? (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">View change</summary>
                      <div className="mt-2 grid max-w-[420px] gap-2 text-xs">
                        {log.oldData ? <pre className="overflow-auto rounded-lg bg-red-50 p-2 text-red-900">{formatJson(log.oldData)}</pre> : null}
                        {log.newData ? <pre className="overflow-auto rounded-lg bg-emerald-50 p-2 text-emerald-900">{formatJson(log.newData)}</pre> : null}
                      </div>
                    </details>
                  ) : "-"}
                </td>
              </tr>
            ))}
            {!logs.length ? (
              <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">No audit events recorded yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
