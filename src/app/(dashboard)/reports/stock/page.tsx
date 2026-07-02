import Link from "next/link";

import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getStockReport } from "@/features/reports/reports-service";
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

export default async function StockReportPage({ searchParams }: PageProps) {
  const access = await getInvoiceAccessScope();
  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getStockReport({
    access,
    filters,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ReportHeader
        title="Stock Report"
        description="Current stock, low stock, out of stock, reorder level and last updated inventory records."
        exportHref={buildCsvExportHref("stock", filters)}
      />

      <FiltersCard>
        <form action="/reports/stock">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px_170px_150px_180px_auto]">
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
              name="stockStatus"
              defaultValue={filters.stockStatus}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            >
              <option value="">All Stock</option>
              <option value="available">Available</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>

            <div className="flex gap-2">
              <button className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800">
                Apply
              </button>

              <Link
                href="/reports/stock"
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
          label="Stock Records"
          value={String(report.summary.stockRecords)}
          hint="Total stock lines"
        />
        <StatCard
          label="Total Quantity"
          value={String(report.summary.totalQuantity)}
          hint="Total available units"
        />
        <StatCard
          label="Low Stock"
          value={String(report.summary.lowStock)}
          hint="10 or fewer units"
        />
        <StatCard
          label="Out of Stock"
          value={String(report.summary.outOfStock)}
          hint="Zero or negative quantity"
        />
      </div>

      <TableCard
        title="Inventory Records"
        subtitle={`Showing ${report.pagination.showingFrom}-${report.pagination.showingTo} of ${report.pagination.totalCount}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4 font-black">Product</th>
                <th className="px-6 py-4 font-black">School</th>
                <th className="px-6 py-4 font-black">SKU</th>
                <th className="px-6 py-4 font-black">Class</th>
                <th className="px-6 py-4 text-right font-black">Quantity</th>
                <th className="px-6 py-4 text-right font-black">Reorder</th>
                <th className="px-6 py-4 font-black">Updated</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-5">
                    <p className="font-black text-slate-950">
                      {row.productName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[row.category, row.size, row.color, row.unit]
                        .filter(Boolean)
                        .join(" · ") || "No details"}
                    </p>
                  </td>

                  <td className="px-6 py-5">{row.schoolName}</td>
                  <td className="px-6 py-5">{row.sku || "-"}</td>

                  <td className="px-6 py-5">
                    {[row.className, row.sectionName].filter(Boolean).join(" · ") ||
                      "-"}
                  </td>

                  <td
                    className={`px-6 py-5 text-right font-black ${
                      row.quantity <= 0
                        ? "text-red-600"
                        : row.quantity <= 10
                          ? "text-amber-600"
                          : "text-slate-950"
                    }`}
                  >
                    {row.quantity}
                  </td>

                  <td className="px-6 py-5 text-right">{row.reorderLevel}</td>
                  <td className="px-6 py-5">{formatDateTime(row.updatedAt)}</td>
                </tr>
              ))}

              {report.rows.length === 0 ? (
                <EmptyTableRow colSpan={7} label="No stock records found." />
              ) : null}
            </tbody>
          </table>
        </div>

        <ReportPagination
          basePath="/reports/stock"
          filters={filters}
          page={report.pagination.page}
          totalPages={report.pagination.totalPages}
        />
      </TableCard>
    </div>
  );
}