import Link from "next/link";

import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getCashierReport } from "@/features/reports/reports-service";
import {
  buildCsvExportHref,
  FiltersCard,
  ReportHeader,
  ReportPagination,
  StatCard,
  TableCard,
  EmptyTableRow,
} from "@/features/reports/reports-page-ui";
import {
  compactMoney,
  getParam,
  money,
  resolveReportRange,
  toPositiveInt,
  type CashierReportFilters,
  type ReportSearchParams,
} from "@/features/reports/reports-utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: ReportSearchParams | Promise<ReportSearchParams>;
};

function buildFilters(params: ReportSearchParams): CashierReportFilters {
  return {
    q: getParam(params, "q"),
    range: resolveReportRange(getParam(params, "range")),
    schoolId: getParam(params, "schoolId"),
    from: getParam(params, "from"),
    to: getParam(params, "to"),
    page: toPositiveInt(getParam(params, "page"), 1),
  };
}

export default async function CashierReportPage({ searchParams }: PageProps) {
  const access = await getInvoiceAccessScope();
  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getCashierReport({
    access,
    filters,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <ReportHeader
        title="Cashier Report"
        description="Cashier-wise invoices, revenue, collection, pending due and average bill value."
        exportHref={buildCsvExportHref("cashiers", filters)}
      />

      <FiltersCard>
        <form action="/reports/cashiers">
          <div className="grid gap-4 lg:grid-cols-[1fr_220px_180px_160px_160px_auto]">
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Search invoice, customer, school..."
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
                href="/reports/cashiers"
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
          label="Cashiers"
          value={String(report.summary.cashierCount)}
          hint="Billing users"
        />
        <StatCard
          label="Revenue"
          value={compactMoney(report.summary.revenue)}
          hint={`${report.summary.invoiceCount} invoices`}
        />
        <StatCard
          label="Collected"
          value={compactMoney(report.summary.paid)}
          hint="Paid invoice amount"
        />
        <StatCard
          label="Due"
          value={compactMoney(report.summary.due)}
          hint={`Range: ${report.dateLabel}`}
        />
      </div>

      <TableCard
        title="Cashier Performance"
        subtitle={`Showing ${report.pagination.showingFrom}-${report.pagination.showingTo} of ${report.pagination.totalCount}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-6 py-4 font-black">Cashier</th>
                <th className="px-6 py-4 text-right font-black">Invoices</th>
                <th className="px-6 py-4 text-right font-black">Revenue</th>
                <th className="px-6 py-4 text-right font-black">Collected</th>
                <th className="px-6 py-4 text-right font-black">Due</th>
                <th className="px-6 py-4 text-right font-black">Average Bill</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.userId} className="hover:bg-slate-50/80">
                  <td className="px-6 py-5">
                    <p className="font-black text-slate-950">{row.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.email || "-"}
                    </p>
                  </td>
                  <td className="px-6 py-5 text-right">{row.invoiceCount}</td>
                  <td className="px-6 py-5 text-right font-black">
                    {money(row.revenue)}
                  </td>
                  <td className="px-6 py-5 text-right">{money(row.paid)}</td>
                  <td className="px-6 py-5 text-right">{money(row.due)}</td>
                  <td className="px-6 py-5 text-right">
                    {money(row.averageBill)}
                  </td>
                </tr>
              ))}

              {report.rows.length === 0 ? (
                <EmptyTableRow colSpan={6} label="No cashier records found." />
              ) : null}
            </tbody>
          </table>
        </div>

        <ReportPagination
          basePath="/reports/cashiers"
          filters={filters}
          page={report.pagination.page}
          totalPages={report.pagination.totalPages}
        />
      </TableCard>
    </div>
  );
}