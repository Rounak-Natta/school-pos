import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function InvoicesPage() {
  await requireUser();

  const invoices = await prisma.invoice.findMany({
    include: {
      school: true,
      billedBy: true,
      items: {
        include: {
          productVariant: {
            include: {
              product: true,
            },
          },
        },
      },
      payments: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Invoices</h1>
          <p className="mt-1 text-sm text-slate-500">
            Latest POS sales invoices.
          </p>
        </div>

        <Link
          href="/pos"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          New POS Bill
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Invoice No</th>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Discount</th>
              <th className="px-4 py-3 font-medium">Paid</th>
              <th className="px-4 py-3 font-medium">Mode</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">By</th>
            </tr>
          </thead>

          <tbody>
            {invoices.map((invoice) => {
              const payment = invoice.payments[0];

              return (
                <tr
                  key={invoice.id}
                  className="border-t border-slate-200 text-slate-700"
                >
                  <td className="px-4 py-3">
                    {invoice.createdAt.toLocaleString("en-IN")}
                  </td>

                  <td className="px-4 py-3 font-medium text-slate-950">
                    {invoice.invoiceNo}
                  </td>

                  <td className="px-4 py-3">{invoice.school.name}</td>

                  <td className="px-4 py-3">
                    {invoice.items.map((item) => (
                      <div key={item.id}>
                        {item.productVariant.product.name}
                        {item.productVariant.sku
                          ? ` / ${item.productVariant.sku}`
                          : ""}
                        {` × ${item.quantity}`}
                      </div>
                    ))}
                  </td>

                  <td className="px-4 py-3">
                    ₹{invoice.totalAmount.toString()}
                  </td>

                  <td className="px-4 py-3">
                    ₹{invoice.discountAmount.toString()}
                  </td>

                  <td className="px-4 py-3">
                    ₹{invoice.paidAmount.toString()}
                  </td>

                  <td className="px-4 py-3">{payment?.mode || "-"}</td>

                  <td className="px-4 py-3">{invoice.status}</td>

                  <td className="px-4 py-3">
                    {invoice.billedBy?.email || "-"}
                  </td>
                </tr>
              );
            })}

            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No invoices yet. Create your first POS bill.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}