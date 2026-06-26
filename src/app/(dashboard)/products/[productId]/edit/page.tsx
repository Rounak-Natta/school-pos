import Link from "next/link";
import { notFound } from "next/navigation";
import { updateProductAction } from "@/features/products/actions";
import { PRODUCT_CATEGORIES } from "@/features/products/categories";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type EditProductPageProps = {
  params: Promise<{
    productId: string;
  }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  await requireUser();

  const { productId } = await params;

  const product = await prisma.product.findUnique({
    where: {
      id: productId,
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
        take: 1,
      },
    },
  });

  if (!product || product.deletedAt) {
    notFound();
  }

  const variant = product.variants[0];
  const stock = variant?.inventoryStocks[0];

  const categoryOptions =
    product.category && !PRODUCT_CATEGORIES.includes(product.category)
      ? [product.category, ...PRODUCT_CATEGORIES]
      : PRODUCT_CATEGORIES;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/products" className="text-sm text-slate-500 underline">
          Back to products
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Edit Product
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Editing product for {product.school.name}
        </p>
      </div>

      <form
        action={updateProductAction.bind(null, product.id)}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="schoolId" value={product.schoolId} />

        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-950">
            Product Details
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                School
              </label>

              <input
                value={product.school.name}
                disabled
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Product Name
              </label>

              <input
                name="name"
                required
                defaultValue={product.name}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Category
              </label>

              <select
                name="category"
                required
                defaultValue={product.category || "Uniform"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-700">
                Description
              </label>

              <textarea
                name="description"
                rows={3}
                defaultValue={product.description || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-6">
          <h2 className="text-base font-semibold text-slate-950">
            Variant Details
          </h2>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">SKU</label>

              <input
                name="sku"
                defaultValue={variant?.sku || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Barcode
              </label>

              <input
                name="barcode"
                defaultValue={variant?.barcode || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Unit</label>

              <input
                name="unit"
                defaultValue={variant?.unit || "PCS"}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Size</label>

              <input
                name="size"
                defaultValue={variant?.size || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Color
              </label>

              <input
                name="color"
                defaultValue={variant?.color || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Class
              </label>

              <input
                name="className"
                defaultValue={variant?.className || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Section
              </label>

              <input
                name="sectionName"
                defaultValue={variant?.sectionName || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4 border-t border-slate-200 pt-6">
          <h2 className="text-base font-semibold text-slate-950">
            Pricing & Inventory
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Sale Price
              </label>

              <input
                name="salePrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={variant?.salePrice.toString() || "0"}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">MRP</label>

              <input
                name="mrp"
                type="number"
                step="0.01"
                min="0"
                defaultValue={variant?.mrp?.toString() || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Cost Price
              </label>

              <input
                name="costPrice"
                type="number"
                step="0.01"
                min="0"
                defaultValue={variant?.costPrice?.toString() || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Wholesale Rate
              </label>

              <input
                name="wholesaleRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue={variant?.wholesaleRate?.toString() || ""}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Current Stock
              </label>

              <input
                name="quantity"
                type="number"
                min="0"
                defaultValue={stock?.quantity ?? 0}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Reorder Level
              </label>

              <input
                name="reorderLevel"
                type="number"
                min="0"
                defaultValue={stock?.reorderLevel ?? 0}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
          <Link
            href="/products"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancel
          </Link>

          <button
            type="submit"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Update Product
          </button>
        </div>
      </form>
    </div>
  );
}