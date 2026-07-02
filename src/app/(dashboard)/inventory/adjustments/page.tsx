import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import { adjustInventoryAction } from "@/features/inventory/actions";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  Permission,
  requirePermission,
} from "@/lib/rbac";

export default async function InventoryAdjustmentsPage() {
  const access = await getAccessScope();

  requirePermission(access, Permission.MANAGE_INVENTORY);

  const stockWhere: Prisma.InventoryStockWhereInput = {
    ...(access.isSuperAdmin
      ? {}
      : {
          schoolId: {
            in: access.schoolIds,
          },
        }),
    productVariant: {
      isActive: true,
      product: {
        isActive: true,
        deletedAt: null,
      },
    },
  };

  const stocks = await prisma.inventoryStock.findMany({
    where: stockWhere,
    include: {
      school: true,
      productVariant: {
        include: {
          product: true,
        },
      },
    },
    orderBy: [
      {
        school: {
          name: "asc",
        },
      },
      {
        productVariant: {
          product: {
            name: "asc",
          },
        },
      },
    ],
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-slate-500 underline">
          Back to inventory
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Stock Adjustment
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Increase or decrease stock manually. Every change will be saved in
          movement history.
        </p>
      </div>

      <form
        action={adjustInventoryAction}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            Product Stock
          </label>

          <select
            name="inventoryStockId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="">Select product stock</option>

            {stocks.map((stock) => {
              const variant = stock.productVariant;
              const product = variant.product;

              return (
                <option key={stock.id} value={stock.id}>
                  {stock.school.name} — {product.name}
                  {variant.sku ? ` — SKU: ${variant.sku}` : ""}
                  {variant.barcode ? ` — Barcode: ${variant.barcode}` : ""}
                  {variant.size ? ` — Size: ${variant.size}` : ""}
                  {variant.color ? ` — Color: ${variant.color}` : ""}
                  {` — Current Qty: ${stock.quantity}`}
                </option>
              );
            })}
          </select>

          {stocks.length === 0 ? (
            <p className="text-xs text-red-600">
              No stock records available for your school access.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Adjustment Type
            </label>

            <select
              name="adjustmentType"
              required
              defaultValue="IN"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="IN">Increase Stock</option>
              <option value="OUT">Decrease Stock</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Quantity
            </label>

            <input
              name="quantity"
              type="number"
              min="1"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Note</label>

          <textarea
            name="note"
            rows={3}
            placeholder="Reason for adjustment"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <Link
            href="/inventory"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={stocks.length === 0}
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Save Adjustment
          </button>
        </div>
      </form>
    </div>
  );
}