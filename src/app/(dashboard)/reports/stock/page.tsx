import Link from "next/link";

import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getStockReport } from "@/features/reports/reports-service";
import {
  buildReportHref,
  formatDateTime,
  getParam,
  resolveStockStatus,
  toPositiveInt,
  type ReportSearchParams,
  type StockReportFilters,
} from "@/features/reports/reports-utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: ReportSearchParams | Promise<ReportSearchParams>;
};

function buildFilters(params: ReportSearchParams): StockReportFilters {
  return {
    q: getParam(params, "q"),
    schoolId: getParam(params, "schoolId"),
    category: getParam(params, "category"),
    className: getParam(params, "className"),
    stockStatus: resolveStockStatus(getParam(params, "stockStatus")),
    page: toPositiveInt(getParam(params, "page"), 1),
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 truncate text-sm text-slate-500">{hint}</p>
    </div>
  );
}

export default async function StockReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const access = await getInvoiceAccessScope(user);
  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getStockReport({
    access,
    filters,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <Link href="/reports" className="text-sm font-semibold text-slate-500">
          Reports
        </Link>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
          Stock Report
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Current stock, low stock, out of stock and reorder status.
        </p>
      </div>

      <form action="/reports/stock" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_150px_150px_160px_auto]">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search product, SKU, barcode..."
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none"
          />
          <select name="schoolId" defaultValue={filters.schoolId} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
            <option value="">All Schools</option>
            {report.schools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </select>
          <input name="category" defaultValue={filters.category} placeholder="Category" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
          <input name="className" defaultValue={filters.className} placeholder="Class" className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
          <select name="stockStatus" defaultValue={filters.stockStatus} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
            <option value="">All Stock</option>
            <option value="available">Available</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
          <div className="flex gap-2">
            <button className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">
              Apply
            </button>
            <Link href="/reports/stock" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold">
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stock Records" value={String(report.summary.stockRecords)} hint="Total stock lines" />
        <StatCard label="Total Quantity" value={String(report.summary.totalQuantity)} hint="Total units in stock" />
        <StatCard label="Low Stock" value={String(report.summary.lowStock)} hint="10 or fewer units" />
        <StatCard label="Out of Stock" value={String(report.summary.outOfStock)} hint="Zero or negative quantity" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase text-slate-500">
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 font-bold">School</th>
                <th className="px-4 py-3 font-bold">SKU</th>
                <th className="px-4 py-3 font-bold">Class</th>
                <th className="px-4 py-3 text-right font-bold">Qty</th>
                <th className="px-4 py-3 text-right font-bold">Reorder</th>
                <th className="px-4 py-3 font-bold">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950">{row.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[row.category, row.size, row.color, row.unit].filter(Boolean).join(" · ") || "No details"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{row.schoolName}</td>
                  <td className="px-4 py-3">{row.sku || "-"}</td>
                  <td className="px-4 py-3">{[row.className, row.sectionName].filter(Boolean).join(" · ") || "-"}</td>
                  <td className={`px-4 py-3 text-right font-black ${row.quantity <= 0 ? "text-red-600" : row.quantity <= 10 ? "text-amber-600" : "text-slate-950"}`}>
                    {row.quantity}
                  </td>
                  <td className="px-4 py-3 text-right">{row.reorderLevel}</td>
                  <td className="px-4 py-3">{formatDateTime(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3">
          <p className="text-sm text-slate-500">
            Page <b>{report.pagination.page}</b> of <b>{report.pagination.totalPages}</b>
          </p>
          <div className="flex gap-2">
            <Link href={buildReportHref("/reports/stock", filters, { page: Math.max(1, filters.page - 1) })} className="rounded-xl border px-4 py-2 text-sm font-bold">
              Previous
            </Link>
            <Link href={buildReportHref("/reports/stock", filters, { page: Math.min(report.pagination.totalPages, filters.page + 1) })} className="rounded-xl border px-4 py-2 text-sm font-bold">
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}