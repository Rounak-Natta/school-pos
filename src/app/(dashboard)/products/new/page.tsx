import Link from "next/link";
import { createProductAction } from "@/features/products/actions";
import {
  CLASS_OPTIONS,
  COLOR_OPTIONS,
  PRODUCT_CATEGORIES,
  PRODUCT_NAME_OPTIONS,
  SECTION_OPTIONS,
  SIZE_OPTIONS,
  SKU_OPTIONS,
  UNIT_OPTIONS,
} from "@/features/products/options";
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
          Add Product / Variant
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Select a school product, add SKU, size, price and stock. If the product already exists, a new variant will be added.
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

              <select
                name="name"
                required
                defaultValue="Half Shirt"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {PRODUCT_NAME_OPTIONS.map((productName) => (
                  <option key={productName} value={productName}>
                    {productName}
                  </option>
                ))}
              </select>
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

              <select
                name="sku"
                required
                defaultValue="HS24"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {SKU_OPTIONS.map((sku) => (
                  <option key={sku} value={sku}>
                    {sku}
                  </option>
                ))}
              </select>
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

              <select
                name="unit"
                required
                defaultValue="PCS"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Size</label>

              <select
                name="size"
                required
                defaultValue="24"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Color
              </label>

              <select
                name="color"
                defaultValue="Not Applicable"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {COLOR_OPTIONS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Class
              </label>

              <select
                name="className"
                defaultValue="Not Applicable"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {CLASS_OPTIONS.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Section
              </label>

              <select
                name="sectionName"
                defaultValue="Not Applicable"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {SECTION_OPTIONS.map((sectionName) => (
                  <option key={sectionName} value={sectionName}>
                    {sectionName}
                  </option>
                ))}
              </select>
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
                Opening / Current Stock
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
            Save Product / Variant
          </button>
        </div>
      </form>
    </div>
  );
}