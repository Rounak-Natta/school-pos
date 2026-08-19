import Link from "next/link";
import { TransferCreateForm } from "@/features/transfers/transfer-create-form";
import {
  getAccessScope,
  getSchoolIdsForPermission,
  Permission,
  requirePermission,
} from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export default async function NewTransferPage() {
  const access = await getAccessScope();
  requirePermission(access, Permission.MANAGE_TRANSFERS);

  const sourceSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.MANAGE_TRANSFERS);

  const [sourceSchools, destinationSchools, stocks] = await Promise.all([
    prisma.school.findMany({
      where: {
        isActive: true,
        ...(access.isSuperAdmin ? {} : { id: { in: sourceSchoolIds ?? [] } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.school.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryStock.findMany({
      where: {
        quantity: { gt: 0 },
        ...(access.isSuperAdmin ? {} : { schoolId: { in: sourceSchoolIds ?? [] } }),
        productVariant: {
          isActive: true,
          product: { isActive: true, deletedAt: null },
        },
      },
      include: { productVariant: { include: { product: true } } },
      orderBy: { quantity: "desc" },
    }),
  ]);

  const options = stocks.map((stock) => ({
    schoolId: stock.schoolId,
    productVariantId: stock.productVariantId,
    quantity: stock.quantity,
    label: [
      stock.productVariant.product.name,
      stock.productVariant.sku,
      stock.productVariant.size ? `Size ${stock.productVariant.size}` : "",
      stock.productVariant.className ? `Class ${stock.productVariant.className}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/transfers" className="text-sm text-slate-500 underline">Back to transfers</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">New Stock Transfer</h1>
        <p className="mt-1 text-sm text-slate-500">
          Stock is only deducted after approval and dispatch. Destination stock is only increased once when received.
        </p>
      </div>
      <TransferCreateForm sourceSchools={sourceSchools} destinationSchools={destinationSchools} stocks={options} />
    </div>
  );
}
