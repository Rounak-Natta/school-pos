import Link from "next/link";
import { notFound } from "next/navigation";
import { updateProductAction } from "@/features/products/actions";
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

type EditProductPageProps = {
  params: Promise<{
    productId: string;
  }>;
  searchParams: Promise<{
    variantId?: string;
  }>;
};

function withCurrentOption(options: readonly string[], current?: string | null) {
  if (!current) return options;

  if (options.includes(current)) {
    return options;
  }

  return [current, ...options];
}

function fallback(value?: string | null) {
  return value || "Not Applicable";
}

export default async function EditProductPage({
  params,
  searchParams,
}: EditProductPageProps) {
  await requireUser();

  const { productId } = await params;
  const { variantId } = await searchParams;

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
  });

  if (!product || product.deletedAt) {
    notFound();
  }

  const selectedVariant =
    product.variants.find((variant) => variant.id === variantId) ??
    product.variants[0];

  const stock = selectedVariant?.inventoryStocks[0];

  const productNameOptions = withCurrentOption(PRODUCT_NAME_OPTIONS, product.name);
  const categoryOptions = withCurrentOption(
    PRODUCT_CATEGORIES,
    product.category
  );
  const skuOptions = withCurrentOption(SKU_OPTIONS, selectedVariant?.sku);
  const unitOptions = withCurrentOption(UNIT_OPTIONS, selectedVariant?.unit);
  const sizeOptions = withCurrentOption(SIZE_OPTIONS, selectedVariant?.size);
  const colorOptions = withCurrentOption(
    COLOR_OPTIONS,
    fallback(selectedVariant?.color)
  );
  const classOptions = withCurrentOption(
    CLASS_OPTIONS,
    fallback(selectedVariant?.className)
  );
  const sectionOptions = withCurrentOption(
    SECTION_OPTIONS,
    fallback(selectedVariant?.sectionName)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/products" className="text-sm text-slate-500 underline">
          Back to products
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-950">
          Edit Product / Variant
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Editing {product.name} for {product.school.name}
        </p>
      </div>

      {product.variants.length > 1 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-medium text-slate-700">
            Select variant to edit
          </p>

          <div className="flex flex-wrap gap-2">
            {product.variants.map((variant) => {
              const active = variant.id === selectedVariant?.id;

              return (
                <Link
                  key={variant.id}
                  href={`/products/${product.id}/edit?variantId=${variant.id}`}
                  className={
                    active
                      ? "rounded-full bg-slate-950 px-3 py-1 text-sm font-medium text-white"
                      : "rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                  }
                >
                  {variant.sku || "No SKU"}
                  {variant.size ? ` / ${variant.size}` : ""}
                  {variant.color ? ` / ${variant.color}` : ""}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <form
        action={updateProductAction.bind(null, product.id)}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="schoolId" value={product.schoolId} />
        <input type="hidden" name="variantId" value={selectedVariant?.id || ""} />

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

              <select
                name="name"
                required
                defaultValue={product.name}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {productNameOptions.map((productName) => (
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

              <select
                name="sku"
                required
                defaultValue={selectedVariant?.sku || "HS24"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {skuOptions.map((sku) => (
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
                defaultValue={selectedVariant?.barcode || ""}
                placeholder="Optional"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Unit</label>

              <select
                name="unit"
                required
                defaultValue={selectedVariant?.unit || "PCS"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {unitOptions.map((unit) => (
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
                defaultValue={selectedVariant?.size || "24"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {sizeOptions.map((size) => (
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
                defaultValue={fallback(selectedVariant?.color)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {colorOptions.map((color) => (
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
                defaultValue={fallback(selectedVariant?.className)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {classOptions.map((className) => (
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
                defaultValue={fallback(selectedVariant?.sectionName)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              >
                {sectionOptions.map((sectionName) => (
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
                defaultValue={selectedVariant?.salePrice.toString() || "0"}
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
                defaultValue={selectedVariant?.mrp?.toString() || ""}
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
                defaultValue={selectedVariant?.costPrice?.toString() || ""}
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
                defaultValue={selectedVariant?.wholesaleRate?.toString() || ""}
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
            Update Product / Variant
          </button>
        </div>
      </form>
    </div>
  );
}