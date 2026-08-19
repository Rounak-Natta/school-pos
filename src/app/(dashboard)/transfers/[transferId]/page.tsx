import { notFound } from "next/navigation";
import { TransferStatus } from "@/generated/prisma/client";
import {
  approveTransferAction,
  dispatchTransferAction,
  receiveTransferAction,
} from "@/features/transfers/actions";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  getSchoolIdsForPermission,
  hasPermission,
  Permission,
  requirePermission,
} from "@/lib/rbac";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const access = await getAccessScope();
  requirePermission(access, Permission.VIEW_TRANSFERS);
  const { transferId } = await params;
  const visibleSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.VIEW_TRANSFERS);

  const transfer = await prisma.transfer.findFirst({
    where: {
      id: transferId,
      ...(access.isSuperAdmin
        ? {}
        : {
            OR: [
              { fromSchoolId: { in: visibleSchoolIds ?? [] } },
              { toSchoolId: { in: visibleSchoolIds ?? [] } },
            ],
          }),
    },
    include: {
      fromSchool: true,
      toSchool: true,
      requestedBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      receivedBy: { select: { name: true } },
      items: { include: { productVariant: { include: { product: true } } } },
    },
  });
  if (!transfer) notFound();

  const canFrom = hasPermission(access, Permission.MANAGE_TRANSFERS, transfer.fromSchoolId);
  const canTo = hasPermission(access, Permission.MANAGE_TRANSFERS, transfer.toSchoolId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">{transfer.transferNo}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {transfer.fromSchool.name} → {transfer.toSchool.name} · {transfer.status.replaceAll("_", " ")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {transfer.status === TransferStatus.REQUESTED && canFrom ? (
          <form action={approveTransferAction}>
            <input type="hidden" name="transferId" value={transfer.id} />
            <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Approve</button>
          </form>
        ) : null}
        {transfer.status === TransferStatus.APPROVED && canFrom ? (
          <form action={dispatchTransferAction}>
            <input type="hidden" name="transferId" value={transfer.id} />
            <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Dispatch & Deduct Stock</button>
          </form>
        ) : null}
        {(transfer.status === TransferStatus.DISPATCHED ||
  transfer.status === TransferStatus.IN_TRANSIT) &&
canTo ? (
  <form action={receiveTransferAction}>
    <input type="hidden" name="transferId" value={transfer.id} />
    <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
      Receive Stock
    </button>
  </form>
) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">Dispatched</th>
              <th className="px-4 py-3">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transfer.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  {item.productVariant.product.name} {item.productVariant.sku ? `· ${item.productVariant.sku}` : ""}
                </td>
                <td className="px-4 py-3">{item.requestedQty}</td>
                <td className="px-4 py-3">{item.dispatchedQty}</td>
                <td className="px-4 py-3">{item.receivedQty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border bg-white p-5 text-sm shadow-sm">
        <p><b>Requested by:</b> {transfer.requestedBy?.name || transfer.requestedBy?.email || "-"}</p>
        <p className="mt-2"><b>Note:</b> {transfer.note || "-"}</p>
      </div>
    </div>
  );
}
