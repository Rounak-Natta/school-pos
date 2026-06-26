import Link from "next/link";
import { createProductAction } from "@/features/products/actions";
import { PRODUCT_CATEGORIES } from "@/features/products/categories";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function NewProductPage() {
  await requireUser();

  const schools = await prisma.school.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/products" className="text-sm text-slate-500 underline">
          Back to products
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Add Product
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Add a product, its first variant and opening stock.
        </p>
      </div>

      <form
        action={createProductAction}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-slate-950">
            Product Details
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                School
              </label>

              <select
                name="schoolId"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                <option value="">Select school</option>

                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Product Name
              </label>

              <input
                name="name"
                required
                placeholder="Half Shirt"
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
                defaultValue="Uniform"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {PRODUCT_CATEGORIES.map((category) => (
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
                placeholder="Optional product notes"
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
                placeholder="HS24"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Barcode
              </label>

              <input
                name="barcode"
                placeholder="Optional"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Unit</label>

              <input
                name="unit"
                defaultValue="PCS"
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Size</label>

              <input
                name="size"
                placeholder="24"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Color
              </label>

              <input
                name="color"
                placeholder="Red"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Class
              </label>

              <input
                name="className"
                placeholder="Nursery"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Section
              </label>

              <input
                name="sectionName"
                placeholder="A"
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
                defaultValue="0"
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
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Opening Stock
              </label>

              <input
                name="quantity"
                type="number"
                min="0"
                defaultValue="0"
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
                defaultValue="0"
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
            Save Product
          </button>
        </div>
      </form>
    </div>
  );
}