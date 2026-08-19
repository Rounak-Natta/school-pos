import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  hasPermission,
  Permission,
  requirePermission,
} from "@/lib/rbac";

type InventoryPageProps = {
  searchParams: Promise<{
    schoolId?: string;
    q?: string;
  }>;
};

function buildInventoryWhere(input: {
  access: Awaited<ReturnType<typeof getAccessScope>>;
  selectedSchoolId: string;
  query: string;
}): Prisma.InventoryStockWhereInput {
  const { access, selectedSchoolId, query } = input;

  const where: Prisma.InventoryStockWhereInput = {
    productVariant: {
      isActive: true,
      product: {
        deletedAt: null,
        isActive: true,
      },
    },
  };

  if (access.isSuperAdmin) {
    if (selectedSchoolId) {
      where.schoolId = selectedSchoolId;
    }
  } else if (selectedSchoolId && access.schoolIds.includes(selectedSchoolId)) {
    where.schoolId = selectedSchoolId;
  } else {
    where.schoolId = {
      in: access.schoolIds,
    };
  }

  if (query) {
    where.OR = [
      {
        productVariant: {
          product: {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        productVariant: {
          product: {
            category: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        productVariant: {
          sku: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      {
        productVariant: {
          barcode: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      {
        productVariant: {
          size: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      {
        productVariant: {
          color: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      {
        productVariant: {
          className: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
      {
        productVariant: {
          sectionName: {
            contains: query,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  return where;
}

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_INVENTORY);

  const canManageInventory = hasPermission(access, Permission.MANAGE_INVENTORY);
  const canManageProducts = hasPermission(access, Permission.MANAGE_PRODUCTS);

  const params = await searchParams;

  const requestedSchoolId = params.schoolId || "";
  const selectedSchoolId =
    access.isSuperAdmin || access.schoolIds.includes(requestedSchoolId)
      ? requestedSchoolId
      : "";

  const query = params.q?.trim() || "";

  const schoolWhere: Prisma.SchoolWhereInput = {
    isActive: true,
    ...(access.isSuperAdmin
      ? {}
      : {
          id: {
            in: access.schoolIds,
          },
        }),
  };

  const inventoryWhere = buildInventoryWhere({
    access,
    selectedSchoolId,
    query,
  });

  const [schools, inventory] = await Promise.all([
    prisma.school.findMany({
      where: schoolWhere,
      orderBy: {
        name: "asc",
      },
    }),

    prisma.inventoryStock.findMany({
      where: inventoryWhere,
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
        {
          updatedAt: "desc",
        },
      ],
    }),
  ]);

  const totalQuantity = inventory.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const lowStockCount = inventory.filter((item) => {
    if (item.reorderLevel <= 0) return false;
    return item.quantity <= item.reorderLevel;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            School-wise stock count connected with product records.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManageProducts ? (
            <Link
              href="/products/new"
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
            >
              Add Product
            </Link>
          ) : null}

          {canManageInventory ? (
            <Link
              href="/inventory/adjustments"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Adjust Stock
            </Link>
          ) : null}

          <Link
            href="/inventory/movements"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Movement History
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Stock Records</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {inventory.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Quantity</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {totalQuantity}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Low Stock Items</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {lowStockCount}
          </p>
        </div>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <select
          name="schoolId"
          defaultValue={selectedSchoolId}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          <option value="">All schools</option>

          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>

        <input
          name="q"
          defaultValue={query}
          placeholder="Search product, category, SKU, barcode, size, color"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />

        <button
          type="submit"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Barcode</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Color</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Reorder</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>

          <tbody>
            {inventory.map((stock) => {
              const variant = stock.productVariant;
              const product = variant.product;
              const isLowStock =
                stock.reorderLevel > 0 && stock.quantity <= stock.reorderLevel;

              return (
                <tr
                  key={stock.id}
                  className="border-t border-slate-200 text-slate-700"
                >
                  <td className="px-4 py-3">{stock.school.name}</td>

                  <td className="px-4 py-3 font-medium text-slate-950">
                    {product.name}
                  </td>

                  <td className="px-4 py-3">{product.category || "-"}</td>

                  <td className="px-4 py-3">{variant.sku || "-"}</td>

                  <td className="px-4 py-3">{variant.barcode || "-"}</td>

                  <td className="px-4 py-3">{variant.size || "-"}</td>

                  <td className="px-4 py-3">{variant.color || "-"}</td>

                  <td className="px-4 py-3 font-semibold">
                    {stock.quantity}
                  </td>

                  <td className="px-4 py-3">{stock.reorderLevel}</td>

                  <td className="px-4 py-3">₹{variant.salePrice.toString()}</td>

                  <td className="px-4 py-3">
                    {isLowStock ? (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                        Low Stock
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                        In Stock
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {canManageProducts ? (
                      <Link
                        href={`/products/${product.id}/edit?variantId=${variant.id}`}
                        className="text-slate-950 underline"
                      >
                        Edit
                      </Link>
                    ) : (
                      <span className="text-slate-400">View only</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {inventory.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No inventory found. Add products with opening stock first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}