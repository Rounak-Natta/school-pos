import {
  getInventoryForList,
  getInventorySummary,
} from "@/features/inventory/queries";

export default async function InventoryPage() {
  const [inventory, summary] = await Promise.all([
    getInventoryForList(),
    getInventorySummary(),
  ]);

  const lowStockItems = inventory.filter((item) => item.quantity <= 5).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Inventory</h1>
        <p className="mt-1 text-sm text-slate-500">
          School-wise stock count for every product variant.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Stock Records</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {summary.stockRecords}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Quantity</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {summary.totalQuantity}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Low Stock Items</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {lowStockItems}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Sale Price</th>
              <th className="px-4 py-3 font-medium">Stock Value</th>
            </tr>
          </thead>

          <tbody>
            {inventory.map((stock) => {
              const salePrice = Number(stock.productVariant.salePrice);
              const stockValue = stock.quantity * salePrice;

              return (
                <tr
                  key={stock.id}
                  className="border-t border-slate-200 text-slate-700"
                >
                  <td className="px-4 py-3">{stock.school.name}</td>
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {stock.productVariant.product.name}
                  </td>
                  <td className="px-4 py-3">
                    {stock.productVariant.sku || "-"}
                  </td>
                  <td className="px-4 py-3">
                    {stock.productVariant.size || "-"}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {stock.quantity}
                  </td>
                  <td className="px-4 py-3">
                    ₹{stock.productVariant.salePrice.toString()}
                  </td>
                  <td className="px-4 py-3">₹{stockValue.toFixed(2)}</td>
                </tr>
              );
            })}

            {inventory.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No stock found. Import opening stock first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Showing first 200 records. Search and pagination will be added next.
      </p>
    </div>
  );
}