import Link from "next/link";

import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getProductSalesReport } from "@/features/reports/reports-service";
import {
  buildCsvExportHref,
  EmptyTableRow,
  FiltersCard,
  ReportHeader,
  ReportPagination,
  StatCard,
  TableCard,
} from "@/features/reports/reports-page-ui";
import {
  compactMoney,
  getParam,
  money,
  resolveReportRange,
  toPositiveInt,
  type ProductReportFilters,
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

export default async function ProductSalesReportPage({
  searchParams,
}: PageProps) {
  const access = await getInvoiceAccessScope();

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-xl font-black text-slate-950">Product Sales</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school report.
        </p>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getProductSalesReport({
    access,
    filters,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ReportHeader
        title="Product Sales Report"
        description="Product-wise quantity sold, revenue, SKU performance, category, class, size and color movement."
        exportHref={buildCsvExportHref("products", filters)}
      />

      <FiltersCard>
        <form action="/reports/products">
          <div className="grid gap-4 xl:grid-cols-[1fr_220px_170px_150px_170px_160px_160px_auto]">
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Search product, SKU, barcode..."
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />

            <select
              name="schoolId"
              defaultValue={filters.schoolId}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
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
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />

            <input
              name="className"
              defaultValue={filters.className}
              placeholder="Class"
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />

            <select
              name="range"
              defaultValue={filters.range}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            >
              <option value="today">Today</option>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="this-month">This Month</option>
              <option value="all">All Time</option>
              <option value="custom">Custom</option>
            </select>

            <input
              name="from"
              type="date"
              defaultValue={filters.from}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />

            <input
              name="to"
              type="date"
              defaultValue={filters.to}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />

            <div className="flex gap-2">
              <button className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800">
                Apply
              </button>

              <Link
                href="/reports/products"
                className="inline-flex h-11 items-center rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Reset
              </Link>
            </div>
          </div>
        </form>
      </FiltersCard>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
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

      <TableCard
        title="Product Records"
        subtitle={`Showing ${report.pagination.showingFrom}-${report.pagination.showingTo} of ${report.pagination.totalCount} · Range: ${report.dateLabel}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4 font-black">Product</th>
                <th className="px-6 py-4 font-black">SKU</th>
                <th className="px-6 py-4 font-black">Class</th>
                <th className="px-6 py-4 font-black">Variant</th>
                <th className="px-6 py-4 text-right font-black">Qty</th>
                <th className="px-6 py-4 text-right font-black">Revenue</th>
                <th className="px-6 py-4 text-right font-black">Avg Rate</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.productVariantId} className="hover:bg-slate-50/80">
                  <td className="px-6 py-5 align-top">
                    <p className="font-black text-slate-950">
                      {row.productName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.category || "No category"}
                    </p>
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p>{row.sku || "-"}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {row.barcode || ""}
                    </p>
                  </td>

                  <td className="px-6 py-5 align-top">
                    {[row.className, row.sectionName].filter(Boolean).join(" · ") ||
                      "-"}
                  </td>

                  <td className="px-6 py-5 align-top">
                    {[row.size, row.color, row.unit].filter(Boolean).join(" · ") ||
                      "-"}
                  </td>

                  <td className="px-6 py-5 text-right align-top font-black text-slate-950">
                    {row.quantity}
                  </td>

                  <td className="px-6 py-5 text-right align-top font-black text-slate-950">
                    {money(row.revenue)}
                  </td>

                  <td className="px-6 py-5 text-right align-top">
                    {money(row.quantity > 0 ? row.revenue / row.quantity : 0)}
                  </td>
                </tr>
              ))}

              {report.rows.length === 0 ? (
                <EmptyTableRow colSpan={7} label="No product sales found." />
              ) : null}
            </tbody>
          </table>
        </div>

        <ReportPagination
          basePath="/reports/products"
          filters={filters}
          page={report.pagination.page}
          totalPages={report.pagination.totalPages}
        />
      </TableCard>
    </div>
  );
}