import { InvoiceStatus, type PaymentMode, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type AnalyticsRange = "today" | "7d" | "30d" | "this-month" | "all";

export type AnalyticsAccessScope = {
  isSuperAdmin: boolean;
  schoolIds: string[];
};

export type AnalyticsFilters = {
  range: AnalyticsRange;
  schoolId: string;
};

const ACTIVE_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PAID,
  InvoiceStatus.PARTIALLY_PAID,
];

function toNumber(value: unknown) {
  const numberValue = Number(value?.toString() ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getKolkataDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDateRange(range: AnalyticsRange) {
  const now = new Date();

  if (range === "all") {
    return null;
  }

  const todayString = getKolkataDateString(now);
  const todayStart = new Date(`${todayString}T00:00:00.000+05:30`);

  if (range === "today") {
    return {
      start: todayStart,
      end: now,
      label: "Today",
    };
  }

  if (range === "7d") {
    const start = new Date(todayStart);
    start.setUTCDate(start.getUTCDate() - 6);

    return {
      start,
      end: now,
      label: "Last 7 Days",
    };
  }

  if (range === "30d") {
    const start = new Date(todayStart);
    start.setUTCDate(start.getUTCDate() - 29);

    return {
      start,
      end: now,
      label: "Last 30 Days",
    };
  }

  const [year, month] = todayString.split("-");

  return {
    start: new Date(`${year}-${month}-01T00:00:00.000+05:30`),
    end: now,
    label: "This Month",
  };
}

function getSchoolIdFilter(access: AnalyticsAccessScope, requestedSchoolId: string) {
  if (access.isSuperAdmin) {
    return requestedSchoolId || undefined;
  }

  if (requestedSchoolId) {
    return access.schoolIds.includes(requestedSchoolId)
      ? requestedSchoolId
      : "__NO_ACCESS__";
  }

  return {
    in: access.schoolIds,
  };
}

function buildInvoiceWhere(input: {
  access: AnalyticsAccessScope;
  filters: AnalyticsFilters;
  dateRange: ReturnType<typeof getDateRange>;
}): Prisma.InvoiceWhereInput {
  const schoolIdFilter = getSchoolIdFilter(input.access, input.filters.schoolId);

  return {
    status: {
      in: ACTIVE_INVOICE_STATUSES,
    },
    ...(schoolIdFilter
      ? {
          schoolId: schoolIdFilter,
        }
      : {}),
    ...(input.dateRange
      ? {
          createdAt: {
            gte: input.dateRange.start,
            lte: input.dateRange.end,
          },
        }
      : {}),
  };
}

function buildPaymentWhere(input: {
  access: AnalyticsAccessScope;
  filters: AnalyticsFilters;
  dateRange: ReturnType<typeof getDateRange>;
}): Prisma.PaymentWhereInput {
  const schoolIdFilter = getSchoolIdFilter(input.access, input.filters.schoolId);

  return {
    ...(input.dateRange
      ? {
          paidAt: {
            gte: input.dateRange.start,
            lte: input.dateRange.end,
          },
        }
      : {}),
    invoice: {
      status: {
        in: ACTIVE_INVOICE_STATUSES,
      },
      ...(schoolIdFilter
        ? {
            schoolId: schoolIdFilter,
          }
        : {}),
    },
  };
}

export async function getAnalyticsDashboardData(input: {
  access: AnalyticsAccessScope;
  filters: AnalyticsFilters;
}) {
  const { access, filters } = input;
  const dateRange = getDateRange(filters.range);

  const schoolWhere: Prisma.SchoolWhereInput = {
    isActive: true,
    ...(access.isSuperAdmin
      ? {}
      : {
          id: {
            in: access.schoolIds,
          },
        }),
  };

  const invoiceWhere = buildInvoiceWhere({
    access,
    filters,
    dateRange,
  });

  const paymentWhere = buildPaymentWhere({
    access,
    filters,
    dateRange,
  });

  const lowStockSchoolIdFilter = getSchoolIdFilter(access, filters.schoolId);

  const [
    schools,
    invoiceTotals,
    paymentTotals,
    itemTotals,
    paymentModes,
    schoolRevenueGroups,
    cashierGroups,
    topProductGroups,
    lowStockRaw,
    recentInvoices,
    recentPayments,
  ] = await Promise.all([
    prisma.school.findMany({
      where: schoolWhere,
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),

    prisma.invoice.aggregate({
      where: invoiceWhere,
      _count: {
        _all: true,
      },
      _sum: {
        totalAmount: true,
        discountAmount: true,
        payableAmount: true,
        paidAmount: true,
        balanceAmount: true,
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
        invoice: invoiceWhere,
      },
      _sum: {
        quantity: true,
        lineTotal: true,
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
    }),

    prisma.invoice.groupBy({
      by: ["schoolId"],
      where: invoiceWhere,
      _sum: {
        payableAmount: true,
        balanceAmount: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          payableAmount: "desc",
        },
      },
      take: 10,
    }),

    prisma.invoice.groupBy({
      by: ["billedById"],
      where: invoiceWhere,
      _sum: {
        payableAmount: true,
        paidAmount: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          payableAmount: "desc",
        },
      },
      take: 10,
    }),

    prisma.invoiceItem.groupBy({
      by: ["productVariantId"],
      where: {
        invoice: invoiceWhere,
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          quantity: "desc",
        },
      },
      take: 10,
    }),

    prisma.inventoryStock.findMany({
      where: {
        ...(lowStockSchoolIdFilter
          ? {
              schoolId: lowStockSchoolIdFilter,
            }
          : {}),
        productVariant: {
          isActive: true,
          product: {
            isActive: true,
            deletedAt: null,
          },
        },
        OR: [
          {
            quantity: {
              lte: 10,
            },
          },
          {
            reorderLevel: {
              gt: 0,
            },
          },
        ],
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
            sectionName: true,
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
      orderBy: [
        {
          quantity: "asc",
        },
      ],
      take: 50,
    }),

    prisma.invoice.findMany({
      where: invoiceWhere,
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
      take: 8,
    }),

    prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        mode: true,
        amount: true,
        transactionRef: true,
        paidAt: true,
        invoice: {
          select: {
            id: true,
            invoiceNo: true,
            customerName: true,
            school: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        paidAt: "desc",
      },
      take: 8,
    }),
  ]);

  const schoolIds = schoolRevenueGroups.map((group) => group.schoolId);
  const cashierIds = cashierGroups
    .map((group) => group.billedById)
    .filter((id): id is string => Boolean(id));
  const productVariantIds = topProductGroups.map((group) => group.productVariantId);

  const [schoolNames, cashierNames, productVariants] = await Promise.all([
    schoolIds.length
      ? prisma.school.findMany({
          where: {
            id: {
              in: schoolIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [],

    cashierIds.length
      ? prisma.user.findMany({
          where: {
            id: {
              in: cashierIds,
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        })
      : [],

    productVariantIds.length
      ? prisma.productVariant.findMany({
          where: {
            id: {
              in: productVariantIds,
            },
          },
          select: {
            id: true,
            sku: true,
            className: true,
            sectionName: true,
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
      : [],
  ]);

  const schoolNameMap = new Map(schoolNames.map((school) => [school.id, school.name]));
  const cashierNameMap = new Map(
    cashierNames.map((cashier) => [
      cashier.id,
      cashier.name || cashier.email || "Unknown User",
    ]),
  );
  const productVariantMap = new Map(
    productVariants.map((variant) => [variant.id, variant]),
  );

  const revenue = toNumber(invoiceTotals._sum.payableAmount);
  const collection = toNumber(paymentTotals._sum.amount);
  const invoices = invoiceTotals._count._all;
  const itemsSold = itemTotals._sum.quantity ?? 0;
  const averageBill = invoices > 0 ? revenue / invoices : 0;

  const lowStockProducts = lowStockRaw
    .filter((stock) => {
      const alertLevel = stock.reorderLevel > 0 ? stock.reorderLevel : 10;
      return stock.quantity <= alertLevel;
    })
    .slice(0, 10)
    .map((stock) => ({
      id: stock.id,
      schoolName: stock.school.name,
      productName: stock.productVariant.product.name,
      category: stock.productVariant.product.category || "",
      sku: stock.productVariant.sku || "",
      className: stock.productVariant.className || "",
      sectionName: stock.productVariant.sectionName || "",
      size: stock.productVariant.size || "",
      color: stock.productVariant.color || "",
      quantity: stock.quantity,
      reorderLevel: stock.reorderLevel,
    }));

  return {
    filters,
    dateLabel: dateRange?.label ?? "All Time",

    schools,

    summary: {
      revenue,
      collection,
      due: toNumber(invoiceTotals._sum.balanceAmount),
      discount: toNumber(invoiceTotals._sum.discountAmount),
      grossSales: toNumber(invoiceTotals._sum.totalAmount),
      invoiceCount: invoices,
      paymentCount: paymentTotals._count._all,
      itemsSold,
      averageBill,
    },

    paymentModes: paymentModes
      .map((mode) => ({
        mode: mode.mode as PaymentMode,
        amount: toNumber(mode._sum.amount),
        count: mode._count._all,
      }))
      .sort((a, b) => b.amount - a.amount),

    schoolRevenue: schoolRevenueGroups.map((group) => ({
      schoolId: group.schoolId,
      schoolName: schoolNameMap.get(group.schoolId) ?? "Unknown School",
      revenue: toNumber(group._sum.payableAmount),
      due: toNumber(group._sum.balanceAmount),
      invoiceCount: group._count._all,
    })),

    cashierSales: cashierGroups.map((group) => ({
      userId: group.billedById,
      name: group.billedById
        ? cashierNameMap.get(group.billedById) ?? "Unknown User"
        : "System User",
      revenue: toNumber(group._sum.payableAmount),
      paid: toNumber(group._sum.paidAmount),
      invoiceCount: group._count._all,
    })),

    topProducts: topProductGroups.map((group) => {
      const variant = productVariantMap.get(group.productVariantId);

      return {
        productVariantId: group.productVariantId,
        productName: variant?.product.name ?? "Unknown Product",
        category: variant?.product.category ?? "",
        sku: variant?.sku ?? "",
        className: variant?.className ?? "",
        sectionName: variant?.sectionName ?? "",
        size: variant?.size ?? "",
        color: variant?.color ?? "",
        quantity: group._sum.quantity ?? 0,
        revenue: toNumber(group._sum.lineTotal),
        lineCount: group._count._all,
      };
    }),

    lowStockProducts,

    recentInvoices: recentInvoices.map((invoice) => ({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      customerName: invoice.customerName || "Walk-in Customer",
      schoolName: invoice.school.name,
      payableAmount: toNumber(invoice.payableAmount),
      paidAmount: toNumber(invoice.paidAmount),
      balanceAmount: toNumber(invoice.balanceAmount),
      status: invoice.status,
      createdAt: invoice.createdAt,
    })),

    recentPayments: recentPayments.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoice.id,
      invoiceNo: payment.invoice.invoiceNo,
      customerName: payment.invoice.customerName || "Walk-in Customer",
      schoolName: payment.invoice.school.name,
      mode: payment.mode,
      amount: toNumber(payment.amount),
      transactionRef: payment.transactionRef || "",
      paidAt: payment.paidAt,
    })),
  };
}