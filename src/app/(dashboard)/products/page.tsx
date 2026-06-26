import Link from "next/link";
import { deleteProductAction } from "@/features/products/actions";
import { PRODUCT_CATEGORIES } from "@/features/products/categories";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ProductsPageProps = {
  searchParams: Promise<{
    schoolId?: string;
    category?: string;
    q?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  await requireUser();

  const params = await searchParams;

  const selectedSchoolId = params.schoolId || "";
  const selectedCategory = params.category || "";
  const query = params.q?.trim() || "";

  const schools = await prisma.school.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const products = await prisma.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,

      ...(selectedSchoolId
        ? {
            schoolId: selectedSchoolId,
          }
        : {}),

      ...(selectedCategory
        ? {
            category: selectedCategory,
          }
        : {}),

      ...(query
        ? {
            OR: [
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
            ],
          }
        : {}),
    },
    include: {
      school: true,
      variants: {
        where: {
          isActive: true,
        },
        include: {
          inventoryStocks: true,
        },
        orderBy: {
          createdAt: "asc",
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
        name: "asc",
      },
    ],
  });

  const totalStock = products.reduce((total, product) => {
    const productStock = product.variants.reduce((variantTotal, variant) => {
      return (
        variantTotal +
        variant.inventoryStocks.reduce(
          (stockTotal, stock) => stockTotal + stock.quantity,
          0
        )
      );
    }, 0);

    return total + productStock;
  }, 0);

  const lowStockCount = products.reduce((total, product) => {
    const productLowStock = product.variants.reduce((variantTotal, variant) => {
      const lowStocks = variant.inventoryStocks.filter((stock) => {
        if (stock.reorderLevel <= 0) return false;
        return stock.quantity <= stock.reorderLevel;
      });

      return variantTotal + lowStocks.length;
    }, 0);

    return total + productLowStock;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage school-wise products, variants, pricing and opening stock.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/products/new"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Add Product
          </Link>

          <Link
            href="/inventory"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            View Inventory
          </Link>
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

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Schools</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {schools.length}
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
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Barcode</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Color</th>
              <th className="px-4 py-3 font-medium">MRP</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {products.map((product) => {
              const variant = product.variants[0];

              const quantity =
                variant?.inventoryStocks.reduce(
                  (total, stock) => total + stock.quantity,
                  0
                ) ?? 0;

              return (
                <tr
                  key={product.id}
                  className="border-t border-slate-200 text-slate-700"
                >
                  <td className="px-4 py-3">{product.school.name}</td>

                  <td className="px-4 py-3 font-medium text-slate-950">
                    {product.name}
                  </td>

                  <td className="px-4 py-3">{product.category || "-"}</td>

                  <td className="px-4 py-3">{variant?.sku || "-"}</td>

                  <td className="px-4 py-3">{variant?.barcode || "-"}</td>

                  <td className="px-4 py-3">{variant?.size || "-"}</td>

                  <td className="px-4 py-3">{variant?.color || "-"}</td>

                  <td className="px-4 py-3">
                    ₹{variant?.mrp?.toString() || "0"}
                  </td>

                  <td className="px-4 py-3">
                    ₹{variant?.salePrice.toString() || "0"}
                  </td>

                  <td className="px-4 py-3 font-semibold">{quantity}</td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/products/${product.id}/edit`}
                        className="text-slate-950 underline"
                      >
                        Edit
                      </Link>

                      <form action={deleteProductAction.bind(null, product.id)}>
                        <button
                          type="submit"
                          className="text-red-600 underline"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}

            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No products found. Add your first product.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}