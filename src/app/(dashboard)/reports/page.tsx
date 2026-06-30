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
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm">
        <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-300">
              Business Reports
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Detailed reports for sales, payments and stock.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Lightweight, server-rendered report pages for transaction records,
              product performance, stock health, cashiers and schools.
            </p>
          </div>

          <Link
            href="/analytics"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/20 px-5 text-sm font-black text-white hover:bg-white/10"
          >
            View Analytics
          </Link>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {reportCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-lg font-black text-white">
                  {card.icon}
                </div>

                <div className="min-w-0">
                  <p className="font-black text-slate-950">{card.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {card.description}
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