import Link from "next/link";
import { getTransfers } from "@/features/transfers/queries";
import {
  getAccessScope,
  hasPermission,
  Permission,
  requirePermission,
} from "@/lib/rbac";

export default async function TransfersPage() {
  const access = await getAccessScope();
  requirePermission(access, Permission.VIEW_TRANSFERS);
  const transfers = await getTransfers(access);
  const canManage = hasPermission(access, Permission.MANAGE_TRANSFERS);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Stock Transfers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Controlled request → approval → dispatch → receive workflow with stock movement history.
          </p>
        </div>
        {canManage ? (
          <Link href="/transfers/new" className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            New Transfer
          </Link>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Transfer</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {transfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="px-4 py-3 font-semibold">{transfer.transferNo}</td>
                  <td className="px-4 py-3">{transfer.fromSchool.name}</td>
                  <td className="px-4 py-3">{transfer.toSchool.name}</td>
                  <td className="px-4 py-3">{transfer.items.length}</td>
                  <td className="px-4 py-3">{transfer.status.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3">{transfer.createdAt.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">
                    <Link href={`/transfers/${transfer.id}`} className="font-semibold underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {transfers.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No transfers yet.</p>
        ) : null}
      </div>
    </div>
  );
}
