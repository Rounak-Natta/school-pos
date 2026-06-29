import Link from "next/link";

import { InvoiceStatus, type PaymentMode, type Prisma } from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_ZONE = "Asia/Kolkata";

const ACTIVE_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PAID,
  InvoiceStatus.PARTIALLY_PAID,
];

// ----- helpers (unchanged) -----
type DecimalLike = { toString(): string } | number | string | null | undefined;
function toNumber(value: DecimalLike) {
  const n = Number(value?.toString() ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}
function compactMoney(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(2)}Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(2)}L`;
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
function getKolkataDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function getTodayRange() {
  const now = new Date();
  const today = getKolkataDateString(now);
  return {
    start: new Date(`${today}T00:00:00.000+05:30`),
    end: now,
  };
}
function getMonthRange() {
  const now = new Date();
  const today = getKolkataDateString(now);
  const [year, month] = today.split("-");
  return {
    start: new Date(`${year}-${month}-01T00:00:00.000+05:30`),
    end: now,
  };
}
function getSchoolFilter(input: { isSuperAdmin: boolean; schoolIds: string[] }) {
  if (input.isSuperAdmin) return undefined;
  return { in: input.schoolIds };
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

// ----- simplified UI components -----
function MetricCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "dark" | "success" | "warning";
}) {
  const bg =
    tone === "dark"
      ? "bg-slate-950 text-white"
      : tone === "success"
      ? "bg-emerald-50 text-emerald-950"
      : tone === "warning"
      ? "bg-amber-50 text-amber-950"
      : "bg-white text-slate-950";
  const labelColor = tone === "dark" ? "text-slate-300" : "text-slate-500";
  const subColor = tone === "dark" ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`rounded-2xl border border-slate-200 p-5 shadow-sm ${bg}`}>
      <p className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {sub && <p className={`mt-1 text-sm ${subColor}`}>{sub}</p>}
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-base font-bold text-slate-950">{value}</span>
    </div>
  );
}

function InsightCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-bold text-slate-950">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {/* Scrollable content area */}
      <div className="max-h-72 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="p-6 text-center text-sm text-slate-500">{label}</div>;
}

// ----- main page -----
export default async function DashboardPage() {
  const user = await requireUser();
  const access = await getInvoiceAccessScope(user);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-950">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school.
        </p>
      </div>
    );
  }

  const todayRange = getTodayRange();
  const monthRange = getMonthRange();
  const schoolIdFilter = getSchoolFilter(access);

  const baseSchoolWhere: Prisma.SchoolWhereInput = {
    isActive: true,
    ...(schoolIdFilter ? { id: schoolIdFilter } : {}),
  };
  const baseInvoiceWhere: Prisma.InvoiceWhereInput = {
    status: { in: ACTIVE_INVOICE_STATUSES },
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
  };
  const todayInvoiceWhere: Prisma.InvoiceWhereInput = {
    ...baseInvoiceWhere,
    createdAt: { gte: todayRange.start, lte: todayRange.end },
  };
  const monthInvoiceWhere: Prisma.InvoiceWhereInput = {
    ...baseInvoiceWhere,
    createdAt: { gte: monthRange.start, lte: monthRange.end },
  };
  const paymentWhere: Prisma.PaymentWhereInput = {
    paidAt: { gte: todayRange.start, lte: todayRange.end },
    invoice: baseInvoiceWhere,
  };

  const [
    schoolCount,
    productCount,
    variantCount,
    stockCount,
    todayInvoiceTotals,
    monthInvoiceTotals,
    todayPaymentTotals,
    todayItemsSold,
    paymentModeGroups,
    lowStockProducts,
    recentInvoices,
    topProductGroups,
  ] = await Promise.all([
    prisma.school.count({ where: baseSchoolWhere }),
    prisma.product.count({
      where: {
        deletedAt: null,
        isActive: true,
        ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
      },
    }),
    prisma.productVariant.count({
      where: {
        isActive: true,
        product: {
          deletedAt: null,
          isActive: true,
          ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
        },
      },
    }),
    prisma.inventoryStock.count({
      where: schoolIdFilter ? { schoolId: schoolIdFilter } : {},
    }),
    prisma.invoice.aggregate({
      where: todayInvoiceWhere,
      _count: { _all: true },
      _sum: { payableAmount: true, balanceAmount: true, discountAmount: true },
    }),
    prisma.invoice.aggregate({
      where: monthInvoiceWhere,
      _count: { _all: true },
      _sum: { payableAmount: true, balanceAmount: true, discountAmount: true },
    }),
    prisma.payment.aggregate({
      where: paymentWhere,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.invoiceItem.aggregate({
      where: { invoice: todayInvoiceWhere },
      _sum: { quantity: true },
    }),
    prisma.payment.groupBy({
      by: ["mode"],
      where: paymentWhere,
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prisma.inventoryStock.findMany({
      where: {
        ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
        quantity: { lte: 10 },
        productVariant: {
          isActive: true,
          product: { isActive: true, deletedAt: null },
        },
      },
      select: {
        id: true,
        quantity: true,
        reorderLevel: true,
        school: { select: { name: true } },
        productVariant: {
          select: {
            sku: true,
            className: true,
            size: true,
            color: true,
            product: { select: { name: true, category: true } },
          },
        },
      },
      orderBy: { quantity: "asc" },
      take: 8,
    }),
    prisma.invoice.findMany({
      where: baseInvoiceWhere,
      select: {
        id: true,
        invoiceNo: true,
        customerName: true,
        payableAmount: true,
        paidAmount: true,
        balanceAmount: true,
        status: true,
        createdAt: true,
        school: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 7,
    }),
    prisma.invoiceItem.groupBy({
      by: ["productVariantId"],
      where: { invoice: monthInvoiceWhere },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
  ]);

  // resolve top products
  const topVariantIds = topProductGroups.map((g) => g.productVariantId);
  const topVariants = topVariantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: topVariantIds } },
        select: {
          id: true,
          sku: true,
          className: true,
          size: true,
          color: true,
          product: { select: { name: true, category: true } },
        },
      })
    : [];
  const topVariantMap = new Map(topVariants.map((v) => [v.id, v]));

  const topProducts = topProductGroups.map((g) => {
    const v = topVariantMap.get(g.productVariantId);
    return {
      id: g.productVariantId,
      name: v?.product.name ?? "Unknown",
      category: v?.product.category ?? "",
      sku: v?.sku ?? "",
      className: v?.className ?? "",
      size: v?.size ?? "",
      color: v?.color ?? "",
      quantity: g._sum.quantity ?? 0,
      revenue: toNumber(g._sum.lineTotal),
    };
  });

  // computed metrics
  const todayRevenue = toNumber(todayInvoiceTotals._sum.payableAmount);
  const todayCollection = toNumber(todayPaymentTotals._sum.amount);
  const todayDue = toNumber(todayInvoiceTotals._sum.balanceAmount);
  const monthRevenue = toNumber(monthInvoiceTotals._sum.payableAmount);
  const todayInvoiceCount = todayInvoiceTotals._count._all;
  const todayPaymentCount = todayPaymentTotals._count._all;
  const todayAverageBill = todayInvoiceCount > 0 ? todayRevenue / todayInvoiceCount : 0;
  const itemsSold = toNumber(todayItemsSold._sum.quantity);
  const maxPayment = Math.max(
    ...paymentModeGroups.map((g) => toNumber(g._sum.amount)),
    0,
  );

  // ---- UI ----
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "full",
              timeZone: TIME_ZONE,
            }).format(new Date())}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="hidden sm:inline">⚡</span>
          <span>{schoolCount} active schools</span>
        </div>
      </div>

      {/* Primary metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Today Revenue" value={compactMoney(todayRevenue)} sub={`${todayInvoiceCount} invoices`} tone="dark" />
        <MetricCard label="Today Collection" value={compactMoney(todayCollection)} sub={`${todayPaymentCount} transactions`} tone="success" />
        <MetricCard label="Today Due" value={compactMoney(todayDue)} sub="unpaid balance" tone={todayDue > 0 ? "warning" : "default"} />
        <MetricCard label="This Month" value={compactMoney(monthRevenue)} sub={`${monthInvoiceTotals._count._all} invoices`} />
      </div>

      {/* Secondary quick stats */}
      <div className="flex flex-wrap gap-3">
        <QuickStat label="Avg. Bill" value={compactMoney(todayAverageBill)} />
        <QuickStat label="Items Sold" value={String(itemsSold)} />
        <QuickStat label="Products" value={String(productCount)} />
        <QuickStat label="Stock Records" value={String(stockCount)} />
        <QuickStat label="Variants" value={String(variantCount)} />
      </div>

      {/* Action shortcuts - smaller, less intrusive */}
      <div className="flex flex-wrap gap-2">
        {[
          { href: "/pos", label: "New POS", icon: "₹" },
          { href: "/invoices", label: "Invoices", icon: "≡" },
          { href: "/inventory", label: "Inventory", icon: "□" },
          { href: "/analytics", label: "Analytics", icon: "↗" },
        ].map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <span className="text-base">{icon}</span>
            {label}
          </Link>
        ))}
      </div>

      {/* Main insights: payment modes + top products */}
      <div className="grid gap-6 md:grid-cols-2">
        <InsightCard title="Payment Collection" subtitle="Today's payments by mode">
          {paymentModeGroups.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {paymentModeGroups.map((item) => {
                const amount = toNumber(item._sum.amount);
                const percent = maxPayment > 0 ? (amount / maxPayment) * 100 : 0;
                return (
                  <div key={item.mode} className="px-5 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{formatEnum(item.mode as PaymentMode)}</span>
                      <span className="text-slate-500">
                        {money(amount)} · {item._count._all} txns
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(2, percent)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState label="No payments today." />
          )}
        </InsightCard>

        <InsightCard title="Top Products" subtitle="Best sellers this month by quantity">
          {topProducts.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {topProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{p.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {[p.category, p.sku && `SKU ${p.sku}`, p.className, p.size, p.color]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-950">{p.quantity}</p>
                    <p className="text-xs text-slate-500">{money(p.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No product sales this month." />
          )}
        </InsightCard>
      </div>

      {/* Bottom: recent invoices + low stock */}
      <div className="grid gap-6 md:grid-cols-2">
        <InsightCard title="Recent Invoices" subtitle="Latest activity">
          {recentInvoices.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentInvoices.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="flex items-center justify-between px-5 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{inv.invoiceNo}</p>
                    <p className="truncate text-xs text-slate-500">
                      {inv.customerName || "Walk-in"} · {inv.school.name}
                    </p>
                    <p className="text-xs text-slate-400">{formatDateTime(inv.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-slate-950">{money(toNumber(inv.payableAmount))}</p>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${getStatusClass(
                        inv.status
                      )}`}
                    >
                      {formatEnum(inv.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState label="No recent invoices." />
          )}
        </InsightCard>

        <InsightCard title="Low Stock Watch" subtitle="Items with ≤10 units left">
          {lowStockProducts.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {lowStockProducts.map((stock) => {
                const v = stock.productVariant;
                const meta = [v.product.category, v.sku && `SKU ${v.sku}`, v.className, v.size, v.color]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={stock.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-950">{v.product.name}</p>
                      <p className="truncate text-xs text-slate-500">{meta || "—"}</p>
                      <p className="truncate text-xs text-slate-400">{stock.school.name}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-black ${
                          stock.quantity <= 0
                            ? "text-red-600"
                            : stock.quantity <= 5
                            ? "text-amber-600"
                            : "text-slate-950"
                        }`}
                      >
                        {stock.quantity}
                      </p>
                      <p className="text-xs text-slate-500">left</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState label="All stocks are healthy." />
          )}
        </InsightCard>
      </div>
    </div>
  );
}