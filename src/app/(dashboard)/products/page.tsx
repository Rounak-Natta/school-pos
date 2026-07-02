import Link from "next/link";

import type { Prisma } from "@/generated/prisma/client";
import { deleteProductAction } from "@/features/products/actions";
import { PRODUCT_CATEGORIES } from "@/features/products/options";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  hasPermission,
  Permission,
  requirePermission,
} from "@/lib/rbac";

type ProductsPageProps = {
  searchParams: Promise<{
    schoolId?: string;
    category?: string;
    q?: string;
  }>;
};

function buildProductWhere(input: {
  access: Awaited<ReturnType<typeof getAccessScope>>;
  selectedSchoolId: string;
  selectedCategory: string;
  query: string;
}): Prisma.ProductWhereInput {
  const { access, selectedSchoolId, selectedCategory, query } = input;

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    isActive: true,
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

  if (selectedCategory) {
    where.category = selectedCategory;
  }

  if (query) {
    where.OR = [
      {
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        category: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        variants: {
          some: {
            sku: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        variants: {
          some: {
            barcode: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        variants: {
          some: {
            size: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        variants: {
          some: {
            color: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        variants: {
          some: {
            className: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
      {
        variants: {
          some: {
            sectionName: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      },
    ];
  }

  return where;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_PRODUCTS);

  const canManageProducts = hasPermission(access, Permission.MANAGE_PRODUCTS);
  const canViewInventory = hasPermission(access, Permission.VIEW_INVENTORY);

  const params = await searchParams;

  const requestedSchoolId = params.schoolId || "";
  const selectedSchoolId =
    access.isSuperAdmin || access.schoolIds.includes(requestedSchoolId)
      ? requestedSchoolId
      : "";

  const selectedCategory = params.category || "";
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

  const productWhere = buildProductWhere({
    access,
    selectedSchoolId,
    selectedCategory,
    query,
  });

  const [schools, products] = await prisma.$transaction([
    prisma.school.findMany({
      where: schoolWhere,
      orderBy: {
        name: "asc",
      },
    }),

    prisma.product.findMany({
      where: productWhere,
      include: {
        school: true,
        variants: {
          where: {
            isActive: true,
          },
          include: {
            inventoryStocks: {
              select: {
                schoolId: true,
                quantity: true,
                reorderLevel: true,
              },
            },
          },
          orderBy: [
            {
              sku: "asc",
            },
            {
              size: "asc",
            },
          ],
        },
      },
      orderBy: [
        {
          school: {
            name: "asc",
          },
        },
        {
          name: "asc",
        },
      ],
    }),
  ]);

  const productVariantRows = products.flatMap((product) =>
    product.variants.map((variant) => {
      const stock = variant.inventoryStocks.find(
        (inventoryStock) => inventoryStock.schoolId === product.schoolId,
      );

      return {
        product,
        variant,
        stock,
        quantity: stock?.quantity ?? 0,
        reorderLevel: stock?.reorderLevel ?? 0,
      };
    }),
  );

  const totalStock = productVariantRows.reduce(
    (total, row) => total + row.quantity,
    0,
  );

  const lowStockCount = productVariantRows.filter((row) => {
    if (row.reorderLevel <= 0) return false;
    return row.quantity <= row.reorderLevel;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage school-wise products, variants, pricing and stock.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canManageProducts ? (
            <Link
              href="/products/new"
              className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
            >
              Add Product / Variant
            </Link>
          ) : null}

          {canViewInventory ? (
            <Link
              href="/inventory"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              View Inventory
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Products</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {products.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Variants</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {productVariantRows.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Stock</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {totalStock}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Low Stock</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {lowStockCount}
          </p>
        </div>
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_1fr_auto]">
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

        <select
          name="category"
          defaultValue={selectedCategory}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        >
          <option value="">All categories</option>

          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>

        <input
          name="q"
          defaultValue={query}
          placeholder="Search product, SKU, barcode, size, color"
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
        <table className="w-full min-w-[1250px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Barcode</th>
              <th className="px-4 py-3 font-medium">Class</th>
              <th className="px-4 py-3 font-medium">Section</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Color</th>
              <th className="px-4 py-3 font-medium">MRP</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Reorder</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {productVariantRows.map(
              ({ product, variant, quantity, reorderLevel }) => {
                const isLowStock =
                  reorderLevel > 0 && quantity <= reorderLevel;

                return (
                  <tr
                    key={variant.id}
                    className="border-t border-slate-200 text-slate-700"
                  >
                    <td className="px-4 py-3">{product.school.name}</td>

                    <td className="px-4 py-3 font-medium text-slate-950">
                      {product.name}
                    </td>

                    <td className="px-4 py-3">{product.category || "-"}</td>

                    <td className="px-4 py-3">{variant.sku || "-"}</td>

                    <td className="px-4 py-3">{variant.barcode || "-"}</td>

                    <td className="px-4 py-3">{variant.className || "-"}</td>

                    <td className="px-4 py-3">{variant.sectionName || "-"}</td>

                    <td className="px-4 py-3">{variant.size || "-"}</td>

                    <td className="px-4 py-3">{variant.color || "-"}</td>

                    <td className="px-4 py-3">
                      ₹{variant.mrp?.toString() || "0"}
                    </td>

                    <td className="px-4 py-3">
                      ₹{variant.salePrice.toString()}
                    </td>

                    <td className="px-4 py-3 font-semibold">
                      {quantity}
                      {isLowStock ? (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                          Low
                        </span>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">{reorderLevel}</td>

                    <td className="px-4 py-3">
                      {canManageProducts ? (
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/products/${product.id}/edit?variantId=${variant.id}`}
                            className="text-slate-950 underline"
                          >
                            Edit
                          </Link>

                          <form
                            action={deleteProductAction.bind(null, product.id)}
                          >
                            <button
                              type="submit"
                              className="text-red-600 underline"
                            >
                              Delete
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-slate-400">View only</span>
                      )}
                    </td>
                  </tr>
                );
              },
            )}

            {productVariantRows.length === 0 ? (
              <tr>
                <td
                  colSpan={14}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No products found. Add your first product or variant.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}