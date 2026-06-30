import Link from "next/link";
import type { ReactNode } from "react";

import { buildReportHref } from "@/features/reports/reports-utils";

export function buildCsvExportHref(type: string, filters: object) {
  const params = new URLSearchParams();

  params.set("type", type);

  Object.entries(filters as Record<string, unknown>).forEach(([key, value]) => {
    if (
      key === "page" ||
      value === undefined ||
      value === null ||
      value === ""
    ) {
      return;
    }

    params.set(key, String(value));
  });

  return `/reports/export?${params.toString()}`;
}

export function ReportHeader({
  title,
  description,
  exportHref,
}: {
  title: string;
  description: string;
  exportHref?: string;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Link
          href="/reports"
          className="text-sm font-bold text-slate-500 hover:text-slate-950"
        >
          Reports
        </Link>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          {title}
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>

      {exportHref ? (
        <Link
          href={exportHref}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Export CSV
        </Link>
      ) : null}
    </div>
  );
}

export function FiltersCard({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-5 text-slate-500">{hint}</p>
    </div>
  );
}

export function TableCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h2 className="text-base font-black text-slate-950">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      {children}
    </section>
  );
}

export function EmptyTableRow({
  colSpan,
  label,
}: {
  colSpan: number;
  label: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-16 text-center text-sm text-slate-500">
        {label}
      </td>
    </tr>
  );
}

export function ReportPagination({
  basePath,
  filters,
  page,
  totalPages,
}: {
  basePath: string;
  filters: object;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        Page <span className="font-black text-slate-900">{page}</span> of{" "}
        <span className="font-black text-slate-900">{totalPages}</span>
      </p>

      <div className="flex gap-2">
        <Link
          href={buildReportHref(
            basePath,
            filters as Record<string, unknown>,
            { page: Math.max(1, page - 1) },
          )}
          className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-bold ${
            page <= 1
              ? "pointer-events-none border-slate-200 text-slate-300"
              : "border-slate-200 text-slate-700 hover:bg-white"
          }`}
        >
          Previous
        </Link>

        <Link
          href={buildReportHref(
            basePath,
            filters as Record<string, unknown>,
            { page: Math.min(totalPages, page + 1) },
          )}
          className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-bold ${
            page >= totalPages
              ? "pointer-events-none border-slate-200 text-slate-300"
              : "border-slate-200 text-slate-700 hover:bg-white"
          }`}
        >
          Next
        </Link>
      </div>
    </div>
  );
}