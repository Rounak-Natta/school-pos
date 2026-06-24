import { getProductsForList } from "@/features/products/queries";

export default async function ProductsPage() {
  const products = await getProductsForList();

  const totalVariants = products.reduce(
    (total, product) => total + product.variants.length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Products</h1>
        <p className="mt-1 text-sm text-slate-500">
          Product master and size-wise variants.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Products</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {products.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Variants</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {totalVariants}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Sale Price</th>
              <th className="px-4 py-3 font-medium">MRP</th>
            </tr>
          </thead>

          <tbody>
            {products.flatMap((product) =>
              product.variants.map((variant) => (
                <tr
                  key={variant.id}
                  className="border-t border-slate-200 text-slate-700"
                >
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {product.name}
                  </td>
                  <td className="px-4 py-3">{variant.sku || "-"}</td>
                  <td className="px-4 py-3">{variant.unit}</td>
                  <td className="px-4 py-3">{variant.size || "-"}</td>
                  <td className="px-4 py-3">
                    ₹{variant.costPrice?.toString() || "0.00"}
                  </td>
                  <td className="px-4 py-3">
                    ₹{variant.salePrice.toString()}
                  </td>
                  <td className="px-4 py-3">
                    ₹{variant.mrp?.toString() || "0.00"}
                  </td>
                </tr>
              ))
            )}

            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No products found. Import opening stock first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}