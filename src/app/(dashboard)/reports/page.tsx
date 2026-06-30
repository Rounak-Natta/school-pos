import Link from "next/link";

const reportCards = [
  {
    title: "Sales Report",
    href: "/reports/sales",
    description: "Invoice-wise revenue, discount, paid amount, due and status.",
    icon: "₹",
  },
  {
    title: "Payment Report",
    href: "/reports/payments",
    description: "Cash, UPI, card, bank and transaction-level collections.",
    icon: "◉",
  },
  {
    title: "Product Sales",
    href: "/reports/products",
    description: "Product-wise quantity sold, revenue and SKU performance.",
    icon: "◈",
  },
  {
    title: "Stock Report",
    href: "/reports/stock",
    description: "Current stock, low stock, reorder level and inventory status.",
    icon: "□",
  },
  {
    title: "Cashier Report",
    href: "/reports/cashiers",
    description: "Cashier-wise invoices, revenue, collections and average bill.",
    icon: "◐",
  },
  {
    title: "School Report",
    href: "/reports/schools",
    description: "School-wise sales, collection, dues and item movement.",
    icon: "▤",
  },
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-sm font-bold text-slate-500">Business Reports</p>

        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight text-slate-950">
              Clean, export-ready reports for your POS business.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Use these lightweight pages to review sales, payments, product
              movement, inventory health, cashier performance and school-wise
              revenue.
            </p>
          </div>

          <Link
            href="/analytics"
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800"
          >
            View Analytics
          </Link>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {reportCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <div className="group h-full rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <div className="flex gap-5">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-950 text-xl font-black text-white">
                  {card.icon}
                </div>

                <div className="min-w-0">
                  <p className="text-base font-black text-slate-950">
                    {card.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {card.description}
                  </p>
                  <p className="mt-4 text-sm font-black text-slate-700 group-hover:text-slate-950">
                    Open report →
                  </p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}