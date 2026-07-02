import Link from "next/link";

import {
  InvoiceStatus,
  type PaymentMode,
  type Prisma,
} from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_ZONE = "Asia/Kolkata";

const ACTIVE_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PAID,
  InvoiceStatus.PARTIALLY_PAID,
];

type DecimalLike = { toString(): string } | number | string | null | undefined;

function toNumber(value: DecimalLike) {
  const n = Number(value?.toString() ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getGroupCount(count: unknown) {
  if (
    count &&
    typeof count === "object" &&
    "_all" in count &&
    typeof (count as { _all?: unknown })._all === "number"
  ) {
    return (count as { _all: number })._all;
  }

  return 0;
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

  return {
    in: input.schoolIds,
  };
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
      <p className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>
        {label}
      </p>
      <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
      {sub ? <p className={`mt-1 text-sm ${subColor}`}>{sub}</p> : null}
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

      <div className="max-h-72 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="p-6 text-center text-sm text-slate-500">{label}</div>;
}

export default async function DashboardPage() {
  const access = await getInvoiceAccessScope();

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
    status: {
      in: ACTIVE_INVOICE_STATUSES,
    },
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
  };

  const todayInvoiceWhere: Prisma.InvoiceWhereInput = {
    ...baseInvoiceWhere,
    createdAt: {
      gte: todayRange.start,
      lte: todayRange.end,
    },
  };

  const monthInvoiceWhere: Prisma.InvoiceWhereInput = {
    ...baseInvoiceWhere,
    createdAt: {
      gte: monthRange.start,
      lte: monthRange.end,
    },
  };

  const paymentWhere: Prisma.PaymentWhereInput = {
    paidAt: {
      gte: todayRange.start,
      lte: todayRange.end,
    },
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
    prisma.school.count({
      where: baseSchoolWhere,
    }),

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
      _count: {
        _all: true,
      },
      _sum: {
        payableAmount: true,
        balanceAmount: true,
        discountAmount: true,
      },
    }),

    prisma.invoice.aggregate({
      where: monthInvoiceWhere,
      _count: {
        _all: true,
      },
      _sum: {
        payableAmount: true,
        balanceAmount: true,
        discountAmount: true,
      },
    }),

    prisma.payment.aggregate({
      where: paymentWhere,
      _count: {
        _all: true,
      },
      _sum: {
        amount: true,
      },
    }),

    prisma.invoiceItem.aggregate({
      where: {
        invoice: todayInvoiceWhere,
      },
      _sum: {
        quantity: true,
      },
    }),

    prisma.payment.groupBy({
      by: ["mode"],
      where: paymentWhere,
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          amount: "desc",
        },
      },
    }),

    prisma.inventoryStock.findMany({
      where: {
        ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
        quantity: {
          lte: 10,
        },
        productVariant: {
          isActive: true,
          product: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        quantity: true,
        reorderLevel: true,
        school: {
          select: {
            name: true,
          },
        },
        productVariant: {
          select: {
            sku: true,
            className: true,
            size: true,
            color: true,
            product: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        },
      },
      orderBy: {
        quantity: "asc",
      },
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
        school: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 7,
    }),

    prisma.invoiceItem.groupBy({
      by: ["productVariantId"],
      where: {
        invoice: monthInvoiceWhere,
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: 5,
    }),
  ]);

  const topVariantIds = topProductGroups.map((group) => group.productVariantId);

  const topVariants = topVariantIds.length
    ? await prisma.productVariant.findMany({
        where: {
          id: {
            in: topVariantIds,
          },
        },
        select: {
          id: true,
          sku: true,
          className: true,
          size: true,
          color: true,
          product: {
            select: {
              name: true,
              category: true,
            },
          },
        },
      })
    : [];

  const topVariantMap = new Map(topVariants.map((variant) => [variant.id, variant]));

  const topProducts = topProductGroups.map((group) => {
    const variant = topVariantMap.get(group.productVariantId);

    return {
      id: group.productVariantId,
      name: variant?.product.name ?? "Unknown",
      category: variant?.product.category ?? "",
      sku: variant?.sku ?? "",
      className: variant?.className ?? "",
      size: variant?.size ?? "",
      color: variant?.color ?? "",
      quantity: group._sum?.quantity ?? 0,
      revenue: toNumber(group._sum?.lineTotal),
    };
  });

  const todayRevenue = toNumber(todayInvoiceTotals._sum.payableAmount);
  const todayCollection = toNumber(todayPaymentTotals._sum.amount);
  const todayDue = toNumber(todayInvoiceTotals._sum.balanceAmount);
  const monthRevenue = toNumber(monthInvoiceTotals._sum.payableAmount);
  const todayInvoiceCount = todayInvoiceTotals._count._all;
  const todayPaymentCount = todayPaymentTotals._count._all;
  const todayAverageBill =
    todayInvoiceCount > 0 ? todayRevenue / todayInvoiceCount : 0;
  const itemsSold = toNumber(todayItemsSold._sum.quantity);

  const maxPayment = Math.max(
    ...paymentModeGroups.map((group) => toNumber(group._sum?.amount)),
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-6">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Today Revenue"
          value={compactMoney(todayRevenue)}
          sub={`${todayInvoiceCount} invoices`}
          tone="dark"
        />
        <MetricCard
          label="Today Collection"
          value={compactMoney(todayCollection)}
          sub={`${todayPaymentCount} transactions`}
          tone="success"
        />
        <MetricCard
          label="Today Due"
          value={compactMoney(todayDue)}
          sub="unpaid balance"
          tone={todayDue > 0 ? "warning" : "default"}
        />
        <MetricCard
          label="This Month"
          value={compactMoney(monthRevenue)}
          sub={`${monthInvoiceTotals._count._all} invoices`}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <QuickStat label="Avg. Bill" value={compactMoney(todayAverageBill)} />
        <QuickStat label="Items Sold" value={String(itemsSold)} />
        <QuickStat label="Products" value={String(productCount)} />
        <QuickStat label="Stock Records" value={String(stockCount)} />
        <QuickStat label="Variants" value={String(variantCount)} />
      </div>

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

      <div className="grid gap-6 md:grid-cols-2">
        <InsightCard
          title="Payment Collection"
          subtitle="Today's payments by mode"
        >
          {paymentModeGroups.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {paymentModeGroups.map((item) => {
                const amount = toNumber(item._sum?.amount);
                const count = getGroupCount(item._count);
                const percent = maxPayment > 0 ? (amount / maxPayment) * 100 : 0;

                return (
                  <div key={item.mode} className="px-5 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">
                        {formatEnum(item.mode as PaymentMode)}
                      </span>
                      <span className="text-slate-500">
                        {money(amount)} · {count} txns
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-800"
                        style={{ width: `${Math.max(2, percent)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState label="No payments today." />
          )}
        </InsightCard>

        <InsightCard
          title="Top Products"
          subtitle="Best sellers this month by quantity"
        >
          {topProducts.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {topProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">
                      {product.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[
                        product.category,
                        product.sku && `SKU ${product.sku}`,
                        product.className,
                        product.size,
                        product.color,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-black text-slate-950">
                      {product.quantity}
                    </p>
                    <p className="text-xs text-slate-500">
                      {money(product.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No product sales this month." />
          )}
        </InsightCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <InsightCard title="Recent Invoices" subtitle="Latest activity">
          {recentInvoices.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentInvoices.map((invoice) => (
                <Link
                  key={invoice.id}
                  href={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between px-5 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">
                      {invoice.invoiceNo}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {invoice.customerName || "Walk-in"} ·{" "}
                      {invoice.school.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(invoice.createdAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-black text-slate-950">
                      {money(toNumber(invoice.payableAmount))}
                    </p>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${getStatusClass(
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
            <EmptyState label="No recent invoices." />
          )}
        </InsightCard>

        <InsightCard title="Low Stock Watch" subtitle="Items with ≤10 units left">
          {lowStockProducts.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {lowStockProducts.map((stock) => {
                const variant = stock.productVariant;
                const meta = [
                  variant.product.category,
                  variant.sku && `SKU ${variant.sku}`,
                  variant.className,
                  variant.size,
                  variant.color,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={stock.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-950">
                        {variant.product.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {meta || "—"}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {stock.school.name}
                      </p>
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