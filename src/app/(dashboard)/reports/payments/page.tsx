import Link from "next/link";

import { PaymentMode } from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getPaymentsReport } from "@/features/reports/reports-service";
import {
  buildPaymentReportHref,
  compactMoney,
  formatDateTime,
  formatEnum,
  getParam,
  getStatusClass,
  money,
  resolvePaymentMode,
  resolveReportRange,
  toPositiveInt,
  type PaymentReportFilters,
  type ReportRange,
  type ReportSearchParams,
} from "@/features/reports/reports-utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: ReportSearchParams | Promise<ReportSearchParams>;
};

function buildFilters(params: ReportSearchParams): PaymentReportFilters {
  return {
    q: getParam(params, "q"),
    range: resolveReportRange(getParam(params, "range")),
    schoolId: getParam(params, "schoolId"),
    mode: resolvePaymentMode(getParam(params, "mode")),
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

function ModeCard({
  mode,
  amount,
  count,
}: {
  mode: PaymentMode;
  amount: number;
  count: number;
}) {
  const icon =
    mode === PaymentMode.CASH
      ? "₹"
      : mode === PaymentMode.UPI
        ? "U"
        : mode === PaymentMode.CARD
          ? "C"
          : mode === PaymentMode.BANK_TRANSFER
            ? "B"
            : "O";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-black text-slate-950">
            {formatEnum(mode)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {count} transaction{count === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-xs font-black text-white">
          {icon}
        </div>
      </div>

      <p className="mt-4 text-2xl font-black tracking-tight text-slate-950">
        {money(amount)}
      </p>
    </div>
  );
}

export default async function PaymentsReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const access = await getInvoiceAccessScope(user);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Payment Report</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school report.
        </p>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getPaymentsReport({
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
              Payments
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Payment Report
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Transaction-wise collection report for cash, UPI, card, bank
            transfer and other payment modes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {rangeOptions.slice(0, 5).map((option) => (
            <Link
              key={option.value}
              href={buildPaymentReportHref("/reports/payments", filters, {
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
        action="/reports/payments"
        className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px_150px_150px_auto]">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Search invoice, customer, transaction ref..."
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
            name="mode"
            defaultValue={filters.mode}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          >
            <option value="">All Modes</option>
            {Object.values(PaymentMode).map((mode) => (
              <option key={mode} value={mode}>
                {formatEnum(mode)}
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
              href="/reports/payments"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Collection"
          value={compactMoney(report.summary.collection)}
          hint={`${report.summary.transactionCount} payment transactions`}
        />
        <StatCard
          label="Average Payment"
          value={compactMoney(report.summary.averagePayment)}
          hint="Collection divided by transaction count"
        />
        <StatCard
          label="Date Range"
          value={report.dateLabel}
          hint="Current selected reporting period"
        />
      </div>

      {report.modeGroups.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {report.modeGroups.map((group) => (
            <ModeCard
              key={group.mode}
              mode={group.mode}
              amount={group.amount}
              count={group.count}
            />
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-950">
              Payment Transactions
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
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="w-[190px] px-4 py-3 font-bold">Date</th>
                <th className="w-[210px] px-4 py-3 font-bold">Invoice</th>
                <th className="w-[220px] px-4 py-3 font-bold">Customer</th>
                <th className="w-[210px] px-4 py-3 font-bold">School</th>
                <th className="px-4 py-3 font-bold">Mode</th>
                <th className="px-4 py-3 text-right font-bold">Amount</th>
                <th className="px-4 py-3 font-bold">Reference</th>
                <th className="px-4 py-3 font-bold">Received By</th>
                <th className="px-4 py-3 text-right font-bold">Open</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 align-top text-slate-700">
                    {formatDateTime(row.paidAt)}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="font-black text-slate-950">
                      {row.invoiceNo}
                    </p>

                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${getStatusClass(
                        row.invoiceStatus,
                      )}`}
                    >
                      {formatEnum(row.invoiceStatus)}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="max-w-[200px] truncate font-semibold text-slate-900">
                      {row.customerName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.customerPhone || "No phone"}
                    </p>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="max-w-[200px] truncate font-semibold text-slate-900">
                      {row.schoolName}
                    </p>
                  </td>

                  <td className="px-4 py-3 align-top font-semibold text-slate-900">
                    {formatEnum(row.mode)}
                  </td>

                  <td className="px-4 py-3 text-right align-top font-black text-slate-950">
                    {money(row.amount)}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="max-w-[180px] truncate text-slate-600">
                      {row.transactionRef || "-"}
                    </p>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="max-w-[160px] truncate text-slate-700">
                      {row.receivedBy}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-right align-top">
                    <Link
                      href={`/invoices/${row.invoiceId}`}
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
                    colSpan={9}
                    className="px-4 py-14 text-center text-sm text-slate-500"
                  >
                    No payment transactions found for selected filters.
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
              href={buildPaymentReportHref("/reports/payments", filters, {
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
              href={buildPaymentReportHref("/reports/payments", filters, {
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