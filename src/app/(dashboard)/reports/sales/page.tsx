import Link from "next/link";

import { InvoiceStatus } from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getSalesReport } from "@/features/reports/reports-service";
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
  formatDateTime,
  formatEnum,
  getParam,
  getStatusClass,
  money,
  resolveInvoiceStatus,
  resolveReportRange,
  toPositiveInt,
  type ReportSearchParams,
  type SalesReportFilters,
} from "@/features/reports/reports-utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: ReportSearchParams | Promise<ReportSearchParams>;
};

function buildFilters(params: ReportSearchParams): SalesReportFilters {
  return {
    q: getParam(params, "q"),
    range: resolveReportRange(getParam(params, "range")),
    schoolId: getParam(params, "schoolId"),
    status: resolveInvoiceStatus(getParam(params, "status")),
    from: getParam(params, "from"),
    to: getParam(params, "to"),
    page: toPositiveInt(getParam(params, "page"), 1),
  };
}

export default async function SalesReportPage({ searchParams }: PageProps) {
  const access = await getInvoiceAccessScope();

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-xl font-black text-slate-950">Sales Report</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school report.
        </p>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getSalesReport({
    access,
    filters,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ReportHeader
        title="Sales Report"
        description="Invoice-wise sales, revenue, discount, paid amount, pending due, status and billing user."
        exportHref={buildCsvExportHref("sales", filters)}
      />

      <FiltersCard>
        <form action="/reports/sales">
          <div className="grid gap-4 xl:grid-cols-[1fr_220px_180px_170px_160px_160px_auto]">
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Search invoice, customer, product, SKU..."
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

            <select
              name="status"
              defaultValue={filters.status}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
            >
              <option value="">Active Status</option>
              {Object.values(InvoiceStatus).map((status) => (
                <option key={status} value={status}>
                  {formatEnum(status)}
                </option>
              ))}
            </select>

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
                href="/reports/sales"
                className="inline-flex h-11 items-center rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Reset
              </Link>
            </div>
          </div>
        </form>
      </FiltersCard>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Revenue"
          value={compactMoney(report.summary.revenue)}
          hint={`${report.summary.invoiceCount} invoices`}
        />
        <StatCard
          label="Paid"
          value={compactMoney(report.summary.paid)}
          hint="Paid amount in invoices"
        />
        <StatCard
          label="Due"
          value={compactMoney(report.summary.due)}
          hint="Pending balance"
        />
        <StatCard
          label="Discount"
          value={compactMoney(report.summary.discount)}
          hint="Total discount"
        />
        <StatCard
          label="Items Sold"
          value={String(report.summary.itemsSold)}
          hint={`Average bill ${money(report.summary.averageBill)}`}
        />
      </div>

      <TableCard
        title="Invoice Records"
        subtitle={`Showing ${report.pagination.showingFrom}-${report.pagination.showingTo} of ${report.pagination.totalCount} · Range: ${report.dateLabel}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1240px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4 font-black">Invoice</th>
                <th className="px-6 py-4 font-black">Customer</th>
                <th className="px-6 py-4 font-black">School</th>
                <th className="px-6 py-4 text-right font-black">Payable</th>
                <th className="px-6 py-4 text-right font-black">Paid</th>
                <th className="px-6 py-4 text-right font-black">Due</th>
                <th className="px-6 py-4 text-right font-black">Discount</th>
                <th className="px-6 py-4 font-black">Payment</th>
                <th className="px-6 py-4 font-black">Status</th>
                <th className="px-6 py-4 font-black">Billed By</th>
                <th className="px-6 py-4 text-right font-black">Open</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-5 align-top">
                    <p className="font-black text-slate-950">{row.invoiceNo}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(row.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
                    </p>
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="max-w-[220px] truncate font-bold text-slate-900">
                      {row.customerName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.customerPhone || "No phone"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {[row.customerClassName, row.customerSectionName]
                        .filter(Boolean)
                        .join(" · ") || "No class details"}
                    </p>
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="max-w-[220px] truncate font-bold text-slate-900">
                      {row.schoolName}
                    </p>
                  </td>

                  <td className="px-6 py-5 text-right align-top font-black text-slate-950">
                    {money(row.payableAmount)}
                  </td>
                  <td className="px-6 py-5 text-right align-top">
                    {money(row.paidAmount)}
                  </td>
                  <td className="px-6 py-5 text-right align-top">
                    <span
                      className={
                        row.balanceAmount > 0
                          ? "font-black text-amber-600"
                          : "text-slate-500"
                      }
                    >
                      {money(row.balanceAmount)}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right align-top">
                    {money(row.discountAmount)}
                  </td>

                  <td className="px-6 py-5 align-top">
                    {row.latestPaymentMode
                      ? formatEnum(row.latestPaymentMode)
                      : "-"}
                  </td>

                  <td className="px-6 py-5 align-top">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClass(
                        row.status,
                      )}`}
                    >
                      {formatEnum(row.status)}
                    </span>
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="max-w-[160px] truncate text-slate-700">
                      {row.billedBy}
                    </p>
                  </td>

                  <td className="px-6 py-5 text-right align-top">
                    <Link
                      href={`/invoices/${row.id}`}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700 hover:bg-white"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}

              {report.rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={11}
                  label="No sales records found for selected filters."
                />
              ) : null}
            </tbody>
          </table>
        </div>

        <ReportPagination
          basePath="/reports/sales"
          filters={filters}
          page={report.pagination.page}
          totalPages={report.pagination.totalPages}
        />
      </TableCard>
    </div>
  );
}