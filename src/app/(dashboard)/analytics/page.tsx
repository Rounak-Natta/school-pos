import Link from "next/link";

import { InvoiceStatus } from "@/generated/prisma/client";
import {
  getAnalyticsDashboardData,
  type AnalyticsRange,
} from "@/features/analytics/analytics-service";
import {
  getAccessScope,
  Permission,
  requirePermission,
} from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_ZONE = "Asia/Kolkata";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function getParam(params: SearchParams, key: string) {
  const value = params[key];

  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function resolveRange(value: string): AnalyticsRange {
  const allowed: AnalyticsRange[] = ["today", "7d", "30d", "this-month", "all"];

  return allowed.includes(value as AnalyticsRange)
    ? (value as AnalyticsRange)
    : "today";
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function compactMoney(value: number) {
  if (value >= 10_000_000) {
    return `₹${(value / 10_000_000).toFixed(2)}Cr`;
  }

  if (value >= 100_000) {
    return `₹${(value / 100_000).toFixed(2)}L`;
  }

  return money(value);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(date);
}

function formatEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function buildAnalyticsHref(input: {
  range: string;
  schoolId: string;
  nextRange?: string;
  nextSchoolId?: string;
}) {
  const params = new URLSearchParams();

  params.set("range", input.nextRange ?? input.range);

  const schoolId = input.nextSchoolId ?? input.schoolId;

  if (schoolId) {
    params.set("schoolId", schoolId);
  }

  return `/analytics?${params.toString()}`;
}

function getStatusClass(status: InvoiceStatus) {
  switch (status) {
    case InvoiceStatus.PAID:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case InvoiceStatus.PARTIALLY_PAID:
      return "border-amber-200 bg-amber-50 text-amber-700";
    case InvoiceStatus.CANCELLED:
      return "border-red-200 bg-red-50 text-red-700";
    case InvoiceStatus.RETURNED:
      return "border-purple-200 bg-purple-50 text-purple-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

function BarRow({
  label,
  value,
  amount,
  max,
}: {
  label: string;
  value: string;
  amount: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(4, Math.round((amount / max) * 100)) : 0;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-4 text-sm">
        <span className="truncate font-medium text-slate-800">{label}</span>
        <span className="whitespace-nowrap text-slate-500">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-slate-900"
          style={{
            width: `${width}%`,
          }}
        />
      </div>
    </div>
  );
}

function ProductMeta(product: {
  category: string;
  sku: string;
  className: string;
  sectionName: string;
  size: string;
  color: string;
}) {
  const meta = [
    product.category,
    product.sku ? `SKU ${product.sku}` : "",
    product.className ? `Class ${product.className}` : "",
    product.sectionName ? `Sec ${product.sectionName}` : "",
    product.size,
    product.color,
  ]
    .filter(Boolean)
    .join(" · ");

  return <span>{meta || "No details"}</span>;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_REPORTS);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school analytics.
        </p>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams ?? {});
  const range = resolveRange(getParam(params, "range"));
  const requestedSchoolId = getParam(params, "schoolId");

  const schoolId =
    access.isSuperAdmin || access.schoolIds.includes(requestedSchoolId)
      ? requestedSchoolId
      : "";

  const data = await getAnalyticsDashboardData({
    access,
    filters: {
      range,
      schoolId,
    },
  });

  const rangeOptions: {
    label: string;
    value: AnalyticsRange;
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
  ];

  const maxPayment = Math.max(
    ...data.paymentModes.map((item) => item.amount),
    0,
  );

  const maxSchoolRevenue = Math.max(
    ...data.schoolRevenue.map((item) => item.revenue),
    0,
  );

  const maxCashierRevenue = Math.max(
    ...data.cashierSales.map((item) => item.revenue),
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            POS revenue, collections, dues, products, schools, and transactions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {rangeOptions.map((option) => (
            <Link
              key={option.value}
              href={buildAnalyticsHref({
                range,
                schoolId,
                nextRange: option.value,
              })}
              className={`inline-flex h-9 items-center rounded-xl border px-3 text-sm font-semibold ${
                range === option.value
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
        action="/analytics"
        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
          <select
            name="range"
            defaultValue={range}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            name="schoolId"
            defaultValue={schoolId}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
          >
            <option value="">All Schools</option>
            {data.schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={compactMoney(data.summary.revenue)}
          hint={`${data.dateLabel} bill value after discount`}
        />
        <StatCard
          label="Collection"
          value={compactMoney(data.summary.collection)}
          hint={`${data.summary.paymentCount} payment transactions`}
        />
        <StatCard
          label="Pending Due"
          value={compactMoney(data.summary.due)}
          hint="Unpaid balance from invoices"
        />
        <StatCard
          label="Invoices"
          value={String(data.summary.invoiceCount)}
          hint={`Average bill ${money(data.summary.averageBill)}`}
        />
        <StatCard
          label="Items Sold"
          value={String(data.summary.itemsSold)}
          hint="Total item quantity sold"
        />
        <StatCard
          label="Discount"
          value={compactMoney(data.summary.discount)}
          hint="Total discount given"
        />
        <StatCard
          label="Gross Sales"
          value={compactMoney(data.summary.grossSales)}
          hint="Before discount"
        />
        <StatCard
          label="Average Bill"
          value={compactMoney(data.summary.averageBill)}
          hint="Revenue divided by invoice count"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-950">
              Payment Mode Collection
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Cash, UPI, card, bank transfer, and other payments.
            </p>
          </div>

          {data.paymentModes.length ? (
            <div className="space-y-4">
              {data.paymentModes.map((item) => (
                <BarRow
                  key={item.mode}
                  label={formatEnum(item.mode)}
                  value={`${money(item.amount)} · ${item.count}`}
                  amount={item.amount}
                  max={maxPayment}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="No payments found for this range." />
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-950">
              School-wise Revenue
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Top schools by POS invoice value.
            </p>
          </div>

          {data.schoolRevenue.length ? (
            <div className="space-y-4">
              {data.schoolRevenue.map((item) => (
                <BarRow
                  key={item.schoolId}
                  label={item.schoolName}
                  value={`${money(item.revenue)} · ${item.invoiceCount}`}
                  amount={item.revenue}
                  max={maxSchoolRevenue}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="No school revenue found." />
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-950">
              Cashier-wise Sales
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Revenue generated by billing user.
            </p>
          </div>

          {data.cashierSales.length ? (
            <div className="space-y-4">
              {data.cashierSales.map((item) => (
                <BarRow
                  key={item.userId || "system"}
                  label={item.name}
                  value={`${money(item.revenue)} · ${item.invoiceCount}`}
                  amount={item.revenue}
                  max={maxCashierRevenue}
                />
              ))}
            </div>
          ) : (
            <EmptyState label="No cashier sales found." />
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              Top Selling Products
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Products ranked by quantity sold.
            </p>
          </div>

          {data.topProducts.length ? (
            <div className="divide-y divide-slate-100">
              {data.topProducts.map((product) => (
                <div
                  key={product.productVariantId}
                  className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">
                      {product.productName}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      <ProductMeta {...product} />
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-slate-950">
                      {product.quantity}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {money(product.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState label="No product sales found." />
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              Low Stock Alerts
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Products near reorder level or below 10 quantity.
            </p>
          </div>

          {data.lowStockProducts.length ? (
            <div className="divide-y divide-slate-100">
              {data.lowStockProducts.map((stock) => (
                <div
                  key={stock.id}
                  className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">
                      {stock.productName}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      <ProductMeta {...stock} />
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {stock.schoolName}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`font-bold ${
                        stock.quantity <= 0
                          ? "text-red-600"
                          : stock.quantity <= 5
                            ? "text-amber-600"
                            : "text-slate-950"
                      }`}
                    >
                      {stock.quantity}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Reorder {stock.reorderLevel || 10}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState label="No low stock alerts." />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              Recent Invoices
            </h2>
          </div>

          {data.recentInvoices.length ? (
            <div className="divide-y divide-slate-100">
              {data.recentInvoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">
                      {invoice.invoiceNo}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {invoice.customerName} · {invoice.schoolName}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(invoice.createdAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-slate-950">
                      {money(invoice.payableAmount)}
                    </p>
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusClass(
                        invoice.status,
                      )}`}
                    >
                      {formatEnum(invoice.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState label="No recent invoices." />
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">
              Recent Payment Transactions
            </h2>
          </div>

          {data.recentPayments.length ? (
            <div className="divide-y divide-slate-100">
              {data.recentPayments.map((payment) => (
                <Link
                  key={payment.id}
                  href={`/invoices/${payment.invoiceId}`}
                  className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">
                      {payment.invoiceNo}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {payment.customerName} · {payment.schoolName}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-400">
                      {formatEnum(payment.mode)}
                      {payment.transactionRef
                        ? ` · ${payment.transactionRef}`
                        : ""}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-slate-950">
                      {money(payment.amount)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(payment.paidAt)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState label="No recent payments." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 