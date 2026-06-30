import Link from "next/link";

import { InvoiceStatus } from "@/generated/prisma/client";
import { getReportSchools, getSalesReport } from "@/features/reports/reports-service";
import {
  buildReportHref,
  compactMoney,
  formatDateTime,
  formatEnum,
  getParam,
  getStatusClass,
  money,
  resolveInvoiceStatus,
  resolveReportRange,
  toPositiveInt,
  type ReportRange,
  type ReportSearchParams,
  type SalesReportFilters,
} from "@/features/reports/reports-utils";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: ReportSearchParams | Promise<ReportSearchParams>;
};

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

function buildFilters(params: ReportSearchParams): SalesReportFilters {
  const range = resolveReportRange(getParam(params, "range"));
  const status = resolveInvoiceStatus(getParam(params, "status"));

  return {
    q: getParam(params, "q"),
    range,
    schoolId: getParam(params, "schoolId"),
    status,
    from: getParam(params, "from"),
    to: getParam(params, "to"),
    page: toPositiveInt(getParam(params, "page"), 1),
  };
}

export default async function SalesReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const access = await getInvoiceAccessScope(user);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Sales Report</h1>
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

  const rangeOptions: {
    label: string;
    value: ReportRange;
  }[] = [
    {
      label: "Today",
      value: "today",
    },
    {
      label: "7 Days",
      value: "7d",
    },
    {
      label: "30 Days",
      value: "30d",
    },
    {
      label: "This Month",
      value: "this-month",
    },
    {
      label: "All Time",
      value: "all",
    },
    {
      label: "Custom",
      value: "custom",
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/reports"
              className="text-sm font-semibold text-slate-500 hover:text-slate-950"
            >
              Reports
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold text-slate-950">
              Sales
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Sales Report
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Invoice-wise sales, revenue, paid amount, due, discount and billing
            user.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {rangeOptions.slice(0, 5).map((option) => (
            <Link
              key={option.value}
              href={buildReportHref("/reports/sales", filters, {
                range: option.value,
                page: 1,
              })}
              className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm font-bold ${
                filters.range === option.value
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <form
        action="/reports/sales"
        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_150px_150px_auto]">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search invoice, customer, product, SKU..."
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

          <select
            name="status"
            defaultValue={filters.status}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
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
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2">
            <input
              name="from"
              type="date"
              defaultValue={filters.from}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />
            <input
              name="to"
              type="date"
              defaultValue={filters.to}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800"
            >
              Apply
            </button>

            <Link
              href="/reports/sales"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-950">
              Invoice Records
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Showing {report.pagination.showingFrom}-
              {report.pagination.showingTo} of {report.pagination.totalCount}
            </p>
          </div>

          <p className="text-xs font-semibold text-slate-500">
            Range: {report.dateLabel}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="w-[210px] px-4 py-3 font-bold">Invoice</th>
                <th className="w-[220px] px-4 py-3 font-bold">Customer</th>
                <th className="w-[220px] px-4 py-3 font-bold">School</th>
                <th className="px-4 py-3 text-right font-bold">Payable</th>
                <th className="px-4 py-3 text-right font-bold">Paid</th>
                <th className="px-4 py-3 text-right font-bold">Due</th>
                <th className="px-4 py-3 text-right font-bold">Discount</th>
                <th className="px-4 py-3 font-bold">Payment</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">By</th>
                <th className="px-4 py-3 text-right font-bold">Open</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top">
                    <p className="font-black text-slate-950">{row.invoiceNo}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(row.createdAt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
                    </p>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="max-w-[200px] truncate font-semibold text-slate-900">
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

                  <td className="px-4 py-3 align-top">
                    <p className="max-w-[200px] truncate font-semibold text-slate-900">
                      {row.schoolName}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-right align-top font-black text-slate-950">
                    {money(row.payableAmount)}
                  </td>

                  <td className="px-4 py-3 text-right align-top">
                    {money(row.paidAmount)}
                  </td>

                  <td className="px-4 py-3 text-right align-top">
                    <span
                      className={
                        row.balanceAmount > 0
                          ? "font-bold text-amber-600"
                          : "text-slate-500"
                      }
                    >
                      {money(row.balanceAmount)}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right align-top">
                    {money(row.discountAmount)}
                  </td>

                  <td className="px-4 py-3 align-top">
                    {row.latestPaymentMode
                      ? formatEnum(row.latestPaymentMode)
                      : "-"}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getStatusClass(
                        row.status,
                      )}`}
                    >
                      {formatEnum(row.status)}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="max-w-[150px] truncate text-slate-700">
                      {row.billedBy}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-right align-top">
                    <Link
                      href={`/invoices/${row.id}`}
                      className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-white"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}

              {report.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    No sales records found for selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Page{" "}
            <span className="font-bold text-slate-800">
              {report.pagination.page}
            </span>{" "}
            of{" "}
            <span className="font-bold text-slate-800">
              {report.pagination.totalPages}
            </span>
          </p>

          <div className="flex gap-2">
            <Link
              href={buildReportHref("/reports/sales", filters, {
                page: Math.max(1, filters.page - 1),
              })}
              aria-disabled={filters.page <= 1}
              className={`inline-flex h-9 items-center rounded-xl border px-4 text-sm font-bold ${
                filters.page <= 1
                  ? "pointer-events-none border-slate-200 text-slate-300"
                  : "border-slate-200 text-slate-700 hover:bg-white"
              }`}
            >
              Previous
            </Link>

            <Link
              href={buildReportHref("/reports/sales", filters, {
                page: Math.min(report.pagination.totalPages, filters.page + 1),
              })}
              aria-disabled={filters.page >= report.pagination.totalPages}
              className={`inline-flex h-9 items-center rounded-xl border px-4 text-sm font-bold ${
                filters.page >= report.pagination.totalPages
                  ? "pointer-events-none border-slate-200 text-slate-300"
                  : "border-slate-200 text-slate-700 hover:bg-white"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}