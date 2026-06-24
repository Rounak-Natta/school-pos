import { prisma } from "@/lib/prisma";

export default async function InventoryPage() {
  const inventory = await prisma.inventoryStock.findMany({
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
    ],
    take: 300,
  });

  const totalQuantity = inventory.reduce(
    (total, item) => total + item.quantity,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Inventory</h1>
        <p className="mt-1 text-sm text-slate-500">
          School-wise stock count for every product.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Showing Records</p>
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
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Color</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Price</th>
            </tr>
          </thead>

          <tbody>
            {inventory.map((stock) => (
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
                <td className="px-4 py-3">
                  {stock.productVariant.color || "-"}
                </td>
                <td className="px-4 py-3 font-semibold">{stock.quantity}</td>
                <td className="px-4 py-3">
                  ₹{stock.productVariant.salePrice.toString()}
                </td>
              </tr>
            ))}

            {inventory.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No inventory found. Import opening stock first.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Showing first 300 records. Search and pagination will be added next.
      </p>
    </div>
  );
}