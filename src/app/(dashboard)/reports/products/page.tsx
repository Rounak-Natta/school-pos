import Link from "next/link";

import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getProductSalesReport } from "@/features/reports/reports-service";
import {
  buildReportHref,
  compactMoney,
  formatEnum,
  getParam,
  money,
  resolveReportRange,
  toPositiveInt,
  type ProductReportFilters,
  type ReportRange,
  type ReportSearchParams,
} from "@/features/reports/reports-utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: ReportSearchParams | Promise<ReportSearchParams>;
};

function buildFilters(params: ReportSearchParams): ProductReportFilters {
  return {
    q: getParam(params, "q"),
    range: resolveReportRange(getParam(params, "range")),
    schoolId: getParam(params, "schoolId"),
    category: getParam(params, "category"),
    className: getParam(params, "className"),
    from: getParam(params, "from"),
    to: getParam(params, "to"),
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

export default async function ProductSalesReportPage({
  searchParams,
}: PageProps) {
  const user = await requireUser();
  const access = await getInvoiceAccessScope(user);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Product Sales</h1>
        <p className="mt-2 text-sm text-slate-500">No active school access.</p>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getProductSalesReport({
    access,
    filters,
  });

  const ranges: { label: string; value: ReportRange }[] = [
    { label: "Today", value: "today" },
    { label: "7 Days", value: "7d" },
    { label: "30 Days", value: "30d" },
    { label: "This Month", value: "this-month" },
    { label: "All Time", value: "all" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/reports" className="text-sm font-semibold text-slate-500">
              Reports
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold text-slate-950">
              Product Sales
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Product Sales Report
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Product-wise quantity sold, revenue and SKU performance.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {ranges.map((range) => (
            <Link
              key={range.value}
              href={buildReportHref("/reports/products", filters, {
                range: range.value,
                page: 1,
              })}
              className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm font-bold ${
                filters.range === range.value
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {range.label}
            </Link>
          ))}
        </div>
      </div>

      <form action="/reports/products" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_150px_150px_150px_auto]">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search product, SKU, barcode..."
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          />

          <select
            name="schoolId"
            defaultValue={filters.schoolId}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          >
            <option value="">All Schools</option>
            {report.schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>

          <input
            name="category"
            defaultValue={filters.category}
            placeholder="Category"
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          />

          <input
            name="className"
            defaultValue={filters.className}
            placeholder="Class"
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          />

          <select
            name="range"
            defaultValue={filters.range}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          >
            <option value="today">Today</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="this-month">This Month</option>
            <option value="all">All Time</option>
            <option value="custom">Custom</option>
          </select>

          <div className="flex gap-2">
            <button className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">
              Apply
            </button>
            <Link
              href="/reports/products"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Products Sold"
          value={String(report.summary.productCount)}
          hint="Unique variants sold"
        />
        <StatCard
          label="Quantity Sold"
          value={String(report.summary.quantitySold)}
          hint="Total item quantity"
        />
        <StatCard
          label="Revenue"
          value={compactMoney(report.summary.revenue)}
          hint="Total item revenue"
        />
        <StatCard
          label="Line Items"
          value={String(report.summary.lineCount)}
          hint={`Range: ${report.dateLabel}`}
        />
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-black text-slate-950">Product Records</h2>
          <p className="mt-1 text-xs text-slate-500">
            Showing {report.pagination.showingFrom}-{report.pagination.showingTo} of{" "}
            {report.pagination.totalCount}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-bold">Product</th>
                <th className="px-4 py-3 font-bold">SKU</th>
                <th className="px-4 py-3 font-bold">Class</th>
                <th className="px-4 py-3 text-right font-bold">Qty</th>
                <th className="px-4 py-3 text-right font-bold">Revenue</th>
                <th className="px-4 py-3 text-right font-bold">Avg Rate</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.productVariantId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950">{row.productName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[row.category, row.size, row.color, row.unit]
                        .filter(Boolean)
                        .join(" · ") || "No details"}
                    </p>
                  </td>
                  <td className="px-4 py-3">{row.sku || "-"}</td>
                  <td className="px-4 py-3">
                    {[row.className, row.sectionName].filter(Boolean).join(" · ") || "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-black">{row.quantity}</td>
                  <td className="px-4 py-3 text-right font-black">
                    {money(row.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {money(row.quantity > 0 ? row.revenue / row.quantity : 0)}
                  </td>
                </tr>
              ))}

              {report.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-slate-500">
                    No product sales found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <Pagination
          base="/reports/products"
          filters={filters}
          page={report.pagination.page}
          totalPages={report.pagination.totalPages}
        />
      </div>
    </div>
  );
}

function Pagination({
  base,
  filters,
  page,
  totalPages,
}: {
  base: string;
  filters: ProductReportFilters;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3">
      <p className="text-sm text-slate-500">
        Page <b>{page}</b> of <b>{totalPages}</b>
      </p>
      <div className="flex gap-2">
        <Link
          href={buildReportHref(base, filters, { page: Math.max(1, page - 1) })}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
        >
          Previous
        </Link>
        <Link
          href={buildReportHref(base, filters, {
            page: Math.min(totalPages, page + 1),
          })}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
        >
          Next
        </Link>
      </div>
    </div>
  );
}