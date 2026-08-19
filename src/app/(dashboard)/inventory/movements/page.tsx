import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  Permission,
  requirePermission,
} from "@/lib/rbac";

type InventoryMovementsPageProps = {
  searchParams: Promise<{
    schoolId?: string;
    q?: string;
  }>;
};

function buildMovementWhere(input: {
  access: Awaited<ReturnType<typeof getAccessScope>>;
  selectedSchoolId: string;
  query: string;
}): Prisma.StockMovementWhereInput {
  const { access, selectedSchoolId, query } = input;

  const where: Prisma.StockMovementWhereInput = {
    productVariant: {
      isActive: true,
      product: {
        isActive: true,
        deletedAt: null,
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

export default async function InventoryMovementsPage({
  searchParams,
}: InventoryMovementsPageProps) {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_INVENTORY);

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

  const movementWhere = buildMovementWhere({
    access,
    selectedSchoolId,
    query,
  });

  const [schools, movements] = await Promise.all([
    prisma.school.findMany({
      where: schoolWhere,
      orderBy: {
        name: "asc",
      },
    }),

    prisma.stockMovement.findMany({
      where: movementWhere,
      include: {
        school: true,
        createdBy: true,
        productVariant: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 300,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/inventory" className="text-sm text-slate-500 underline">
          Back to inventory
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Stock Movements
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          History of opening stock, stock adjustments, sales and transfers.
        </p>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <select
          name="schoolId"
          defaultValue={selectedSchoolId}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          <option value="">
            {access.isSuperAdmin ? "All schools" : "My school"}
          </option>

          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>

        <input
          name="q"
          defaultValue={query}
          placeholder="Search product, category, SKU, barcode, size or color"
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
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Change</th>
              <th className="px-4 py-3 font-medium">Before</th>
              <th className="px-4 py-3 font-medium">After</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>

          <tbody>
            {movements.map((movement) => (
              <tr
                key={movement.id}
                className="border-t border-slate-200 text-slate-700"
              >
                <td className="px-4 py-3">
                  {movement.createdAt.toLocaleString("en-IN")}
                </td>

                <td className="px-4 py-3">{movement.school.name}</td>

                <td className="px-4 py-3 font-medium text-slate-950">
                  {movement.productVariant.product.name}
                </td>

                <td className="px-4 py-3">
                  {movement.productVariant.sku || "-"}
                </td>

                <td className="px-4 py-3">{movement.type}</td>

                <td className="px-4 py-3 font-semibold">
                  {movement.quantity > 0
                    ? `+${movement.quantity}`
                    : movement.quantity}
                </td>

                <td className="px-4 py-3">{movement.beforeQty}</td>

                <td className="px-4 py-3">{movement.afterQty}</td>

                <td className="px-4 py-3">
                  {movement.createdBy?.email || "-"}
                </td>

                <td className="px-4 py-3">{movement.note || "-"}</td>
              </tr>
            ))}

            {movements.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No stock movements found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Showing latest 300 stock movement records.
      </p>
    </div>
  );
}