import Link from "next/link";

import { PaymentMode } from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getPaymentsReport } from "@/features/reports/reports-service";
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
  resolvePaymentMode,
  resolveReportRange,
  toPositiveInt,
  type PaymentReportFilters,
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
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-black text-slate-950">{formatEnum(mode)}</p>
          <p className="mt-1 text-sm text-slate-500">
            {count} transaction{count === 1 ? "" : "s"}
          </p>
        </div>

        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-xs font-black text-white">
          {icon}
        </div>
      </div>

      <p className="mt-5 text-2xl font-black tracking-tight text-slate-950">
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
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
        <h1 className="text-xl font-black text-slate-950">Payment Report</h1>
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

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ReportHeader
        title="Payment Report"
        description="Transaction-wise collection report for cash, UPI, card, bank transfer and other payment modes."
        exportHref={buildCsvExportHref("payments", filters)}
      />

      <FiltersCard>
        <form action="/reports/payments">
          <div className="grid gap-4 xl:grid-cols-[1fr_220px_180px_170px_160px_160px_auto]">
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Search invoice, customer, transaction ref..."
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
              name="mode"
              defaultValue={filters.mode}
              className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-slate-400 focus:bg-white"
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
                href="/reports/payments"
                className="inline-flex h-11 items-center rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                Reset
              </Link>
            </div>
          </div>
        </form>
      </FiltersCard>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
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
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
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

      <TableCard
        title="Payment Transactions"
        subtitle={`Showing ${report.pagination.showingFrom}-${report.pagination.showingTo} of ${report.pagination.totalCount} · Range: ${report.dateLabel}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4 font-black">Date</th>
                <th className="px-6 py-4 font-black">Invoice</th>
                <th className="px-6 py-4 font-black">Customer</th>
                <th className="px-6 py-4 font-black">School</th>
                <th className="px-6 py-4 font-black">Mode</th>
                <th className="px-6 py-4 text-right font-black">Amount</th>
                <th className="px-6 py-4 font-black">Reference</th>
                <th className="px-6 py-4 font-black">Received By</th>
                <th className="px-6 py-4 text-right font-black">Open</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-5 align-top text-slate-700">
                    {formatDateTime(row.paidAt)}
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="font-black text-slate-950">{row.invoiceNo}</p>
                    <span
                      className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${getStatusClass(
                        row.invoiceStatus,
                      )}`}
                    >
                      {formatEnum(row.invoiceStatus)}
                    </span>
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="max-w-[220px] truncate font-bold text-slate-900">
                      {row.customerName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.customerPhone || "No phone"}
                    </p>
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="max-w-[220px] truncate font-bold text-slate-900">
                      {row.schoolName}
                    </p>
                  </td>

                  <td className="px-6 py-5 align-top font-bold text-slate-900">
                    {formatEnum(row.mode)}
                  </td>

                  <td className="px-6 py-5 text-right align-top font-black text-slate-950">
                    {money(row.amount)}
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="max-w-[190px] truncate text-slate-600">
                      {row.transactionRef || "-"}
                    </p>
                  </td>

                  <td className="px-6 py-5 align-top">
                    <p className="max-w-[170px] truncate text-slate-700">
                      {row.receivedBy}
                    </p>
                  </td>

                  <td className="px-6 py-5 text-right align-top">
                    <Link
                      href={`/invoices/${row.invoiceId}`}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700 hover:bg-white"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}

              {report.rows.length === 0 ? (
                <EmptyTableRow
                  colSpan={9}
                  label="No payment transactions found for selected filters."
                />
              ) : null}
            </tbody>
          </table>
        </div>

        <ReportPagination
          basePath="/reports/payments"
          filters={filters}
          page={report.pagination.page}
          totalPages={report.pagination.totalPages}
        />
      </TableCard>
    </div>
  );
}