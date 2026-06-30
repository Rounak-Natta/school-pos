import Link from "next/link";

import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { getSchoolReport } from "@/features/reports/reports-service";
import {
  buildReportHref,
  compactMoney,
  getParam,
  money,
  resolveReportRange,
  toPositiveInt,
  type ReportSearchParams,
  type SchoolReportFilters,
} from "@/features/reports/reports-utils";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: ReportSearchParams | Promise<ReportSearchParams>;
};

function buildFilters(params: ReportSearchParams): SchoolReportFilters {
  return {
    q: getParam(params, "q"),
    range: resolveReportRange(getParam(params, "range")),
    schoolId: getParam(params, "schoolId"),
    from: getParam(params, "from"),
    to: getParam(params, "to"),
    page: toPositiveInt(getParam(params, "page"), 1),
  };
}

export default async function SchoolReportPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const access = await getInvoiceAccessScope(user);
  const params = await Promise.resolve(searchParams ?? {});
  const filters = buildFilters(params);

  const report = await getSchoolReport({
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
          School Report
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          School-wise sales, collection, dues and item movement.
        </p>
      </div>

      <form action="/reports/schools" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px_150px_150px_auto]">
          <input name="q" defaultValue={filters.q} placeholder="Search school, invoice, customer..." className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
          <select name="schoolId" defaultValue={filters.schoolId} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
            <option value="">All Schools</option>
            {report.schools.map((school) => (
              <option key={school.id} value={school.id}>{school.name}</option>
            ))}
          </select>
          <select name="range" defaultValue={filters.range} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
            <option value="today">Today</option>
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="this-month">This Month</option>
            <option value="all">All Time</option>
            <option value="custom">Custom</option>
          </select>
          <input name="from" type="date" defaultValue={filters.from} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
          <input name="to" type="date" defaultValue={filters.to} className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm" />
          <div className="flex gap-2">
            <button className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white">Apply</button>
            <Link href="/reports/schools" className="inline-flex h-10 items-center rounded-xl border px-4 text-sm font-bold">Reset</Link>
          </div>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Schools" value={String(report.summary.schoolCount)} hint="Schools with sales" />
        <Card label="Revenue" value={compactMoney(report.summary.revenue)} hint={`${report.summary.invoiceCount} invoices`} />
        <Card label="Collected" value={compactMoney(report.summary.paid)} hint="Paid invoice amount" />
        <Card label="Due" value={compactMoney(report.summary.due)} hint={`Range: ${report.dateLabel}`} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase text-slate-500">
                <th className="px-4 py-3 font-bold">School</th>
                <th className="px-4 py-3 text-right font-bold">Invoices</th>
                <th className="px-4 py-3 text-right font-bold">Items</th>
                <th className="px-4 py-3 text-right font-bold">Revenue</th>
                <th className="px-4 py-3 text-right font-bold">Paid</th>
                <th className="px-4 py-3 text-right font-bold">Due</th>
                <th className="px-4 py-3 text-right font-bold">Average Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.rows.map((row) => (
                <tr key={row.schoolId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950">{row.schoolName}</p>
                    <p className="mt-1 text-xs text-slate-500">{row.schoolCode || "-"}</p>
                  </td>
                  <td className="px-4 py-3 text-right">{row.invoiceCount}</td>
                  <td className="px-4 py-3 text-right">{row.itemsSold}</td>
                  <td className="px-4 py-3 text-right font-black">{money(row.revenue)}</td>
                  <td className="px-4 py-3 text-right">{money(row.paid)}</td>
                  <td className="px-4 py-3 text-right">{money(row.due)}</td>
                  <td className="px-4 py-3 text-right">{money(row.averageBill)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between border-t bg-slate-50/80 px-4 py-3">
          <p className="text-sm text-slate-500">Page {report.pagination.page} of {report.pagination.totalPages}</p>
          <div className="flex gap-2">
            <Link href={buildReportHref("/reports/schools", filters, { page: Math.max(1, filters.page - 1) })} className="rounded-xl border px-4 py-2 text-sm font-bold">Previous</Link>
            <Link href={buildReportHref("/reports/schools", filters, { page: Math.min(report.pagination.totalPages, filters.page + 1) })} className="rounded-xl border px-4 py-2 text-sm font-bold">Next</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </div>
  );
}