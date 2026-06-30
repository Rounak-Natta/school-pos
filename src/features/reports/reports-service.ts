import {
  InvoiceStatus,
  PaymentMode,
  type Prisma,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getDateRange,
  REPORT_PAGE_SIZE,
  toNumber,
  type CashierReportFilters,
  type PaymentReportFilters,
  type ProductReportFilters,
  type SalesReportFilters,
  type SchoolReportFilters,
  type StockReportFilters,
} from "@/features/reports/reports-utils";

export type ReportsAccessScope = {
  isSuperAdmin: boolean;
  schoolIds: string[];
};

const ACTIVE_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PAID,
  InvoiceStatus.PARTIALLY_PAID,
];

function getSchoolIdFilter(
  access: ReportsAccessScope,
  requestedSchoolId: string,
): Prisma.StringFilter | string | undefined {
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

export function getReportSchools(access: ReportsAccessScope) {
  return prisma.school.findMany({
    where: {
      isActive: true,
      ...(access.isSuperAdmin
        ? {}
        : {
            id: {
              in: access.schoolIds,
            },
          }),
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

function buildDateInvoiceWhere(input: {
  access: ReportsAccessScope;
  schoolId: string;
  range: string;
  from: string;
  to: string;
  q?: string;
}) {
  const dateRange = getDateRange({
    range: input.range as never,
    from: input.from,
    to: input.to,
  });

  const schoolIdFilter = getSchoolIdFilter(input.access, input.schoolId);

  const where: Prisma.InvoiceWhereInput = {
    status: {
      in: ACTIVE_INVOICE_STATUSES,
    },
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...(dateRange
      ? {
          createdAt: {
            ...(dateRange.start ? { gte: dateRange.start } : {}),
            ...(dateRange.end ? { lte: dateRange.end } : {}),
          },
        }
      : {}),
    ...(input.q
      ? {
          OR: [
            {
              invoiceNo: {
                contains: input.q,
                mode: "insensitive",
              },
            },
            {
              customerName: {
                contains: input.q,
                mode: "insensitive",
              },
            },
            {
              customerPhone: {
                contains: input.q,
                mode: "insensitive",
              },
            },
            {
              school: {
                name: {
                  contains: input.q,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  return {
    where,
    dateLabel: dateRange?.label ?? "All Time",
  };
}

export async function getSalesReport(input: {
  access: ReportsAccessScope;
  filters: SalesReportFilters;
}) {
  const { access, filters } = input;

  const dateRange = getDateRange({
    range: filters.range,
    from: filters.from,
    to: filters.to,
  });

  const schoolIdFilter = getSchoolIdFilter(access, filters.schoolId);

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...(filters.status
      ? {
          status: filters.status,
        }
      : {
          status: {
            in: ACTIVE_INVOICE_STATUSES,
          },
        }),
    ...(dateRange
      ? {
          createdAt: {
            ...(dateRange.start ? { gte: dateRange.start } : {}),
            ...(dateRange.end ? { lte: dateRange.end } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            {
              invoiceNo: {
                contains: filters.q,
                mode: "insensitive",
              },
            },
            {
              customerName: {
                contains: filters.q,
                mode: "insensitive",
              },
            },
            {
              customerPhone: {
                contains: filters.q,
                mode: "insensitive",
              },
            },
            {
              school: {
                name: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
            },
            {
              items: {
                some: {
                  productVariant: {
                    product: {
                      name: {
                        contains: filters.q,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            },
            {
              items: {
                some: {
                  productVariant: {
                    sku: {
                      contains: filters.q,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [schools, totalCount, totals, itemTotals, invoices] =
    await prisma.$transaction([
      getReportSchools(access),
      prisma.invoice.count({ where: invoiceWhere }),
      prisma.invoice.aggregate({
        where: invoiceWhere,
        _count: { _all: true },
        _sum: {
          totalAmount: true,
          discountAmount: true,
          payableAmount: true,
          paidAmount: true,
          balanceAmount: true,
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
      prisma.invoice.findMany({
        where: invoiceWhere,
        select: {
          id: true,
          invoiceNo: true,
          status: true,
          customerName: true,
          customerPhone: true,
          customerClassName: true,
          customerSectionName: true,
          totalAmount: true,
          discountAmount: true,
          payableAmount: true,
          paidAmount: true,
          balanceAmount: true,
          createdAt: true,
          school: {
            select: {
              name: true,
            },
          },
          billedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          payments: {
            select: {
              mode: true,
            },
            orderBy: {
              paidAt: "desc",
            },
            take: 1,
          },
          _count: {
            select: {
              items: true,
              payments: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (filters.page - 1) * REPORT_PAGE_SIZE,
        take: REPORT_PAGE_SIZE,
      }),
    ]);

  return {
    schools,
    dateLabel: dateRange?.label ?? "All Time",
    pagination: buildPagination(totalCount, filters.page),
    summary: {
      invoiceCount: totals._count._all,
      grossSales: toNumber(totals._sum.totalAmount),
      discount: toNumber(totals._sum.discountAmount),
      revenue: toNumber(totals._sum.payableAmount),
      paid: toNumber(totals._sum.paidAmount),
      due: toNumber(totals._sum.balanceAmount),
      itemsSold: itemTotals._sum.quantity ?? 0,
      averageBill:
        totals._count._all > 0
          ? toNumber(totals._sum.payableAmount) / totals._count._all
          : 0,
    },
    rows: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      status: invoice.status,
      customerName: invoice.customerName || "Walk-in Customer",
      customerPhone: invoice.customerPhone || "",
      customerClassName: invoice.customerClassName || "",
      customerSectionName: invoice.customerSectionName || "",
      totalAmount: toNumber(invoice.totalAmount),
      discountAmount: toNumber(invoice.discountAmount),
      payableAmount: toNumber(invoice.payableAmount),
      paidAmount: toNumber(invoice.paidAmount),
      balanceAmount: toNumber(invoice.balanceAmount),
      createdAt: invoice.createdAt,
      schoolName: invoice.school.name,
      billedBy:
        invoice.billedBy?.name || invoice.billedBy?.email || "System User",
      latestPaymentMode: invoice.payments[0]?.mode || "",
      itemCount: invoice._count.items,
      paymentCount: invoice._count.payments,
    })),
  };
}

export async function getPaymentsReport(input: {
  access: ReportsAccessScope;
  filters: PaymentReportFilters;
}) {
  const { access, filters } = input;

  const dateRange = getDateRange({
    range: filters.range,
    from: filters.from,
    to: filters.to,
  });

  const schoolIdFilter = getSchoolIdFilter(access, filters.schoolId);

  const paymentWhere: Prisma.PaymentWhereInput = {
    ...(filters.mode ? { mode: filters.mode } : {}),
    ...(dateRange
      ? {
          paidAt: {
            ...(dateRange.start ? { gte: dateRange.start } : {}),
            ...(dateRange.end ? { lte: dateRange.end } : {}),
          },
        }
      : {}),
    invoice: {
      status: {
        in: ACTIVE_INVOICE_STATUSES,
      },
      ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    },
    ...(filters.q
      ? {
          OR: [
            {
              transactionRef: {
                contains: filters.q,
                mode: "insensitive",
              },
            },
            {
              receivedBy: {
                name: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
            },
            {
              receivedBy: {
                email: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
            },
            {
              invoice: {
                invoiceNo: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
            },
            {
              invoice: {
                customerName: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
            },
            {
              invoice: {
                school: {
                  name: {
                    contains: filters.q,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const [schools, totalCount, totals, modeGroups, payments] =
    await prisma.$transaction([
      getReportSchools(access),
      prisma.payment.count({ where: paymentWhere }),
      prisma.payment.aggregate({
        where: paymentWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.payment.groupBy({
        by: ["mode"],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: {
          _sum: {
            amount: "desc",
          },
        },
      }),
      prisma.payment.findMany({
        where: paymentWhere,
        select: {
          id: true,
          mode: true,
          amount: true,
          transactionRef: true,
          paidAt: true,
          receivedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNo: true,
              customerName: true,
              customerPhone: true,
              status: true,
              school: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ paidAt: "desc" }, { id: "desc" }],
        skip: (filters.page - 1) * REPORT_PAGE_SIZE,
        take: REPORT_PAGE_SIZE,
      }),
    ]);

  const collection = toNumber(totals._sum.amount);
  const transactionCount = totals._count._all;

  return {
    schools,
    dateLabel: dateRange?.label ?? "All Time",
    pagination: buildPagination(totalCount, filters.page),
    summary: {
      collection,
      transactionCount,
      averagePayment: transactionCount > 0 ? collection / transactionCount : 0,
    },
    modeGroups: modeGroups.map((group) => ({
      mode: group.mode as PaymentMode,
      amount: toNumber(group._sum.amount),
      count: group._count._all,
    })),
    rows: payments.map((payment) => ({
      id: payment.id,
      mode: payment.mode,
      amount: toNumber(payment.amount),
      transactionRef: payment.transactionRef || "",
      paidAt: payment.paidAt,
      receivedBy:
        payment.receivedBy?.name ||
        payment.receivedBy?.email ||
        "System User",
      invoiceId: payment.invoice.id,
      invoiceNo: payment.invoice.invoiceNo,
      customerName: payment.invoice.customerName || "Walk-in Customer",
      customerPhone: payment.invoice.customerPhone || "",
      invoiceStatus: payment.invoice.status,
      schoolName: payment.invoice.school.name,
    })),
  };
}

export async function getProductSalesReport(input: {
  access: ReportsAccessScope;
  filters: ProductReportFilters;
}) {
  const { access, filters } = input;
  const { where: invoiceWhere, dateLabel } = buildDateInvoiceWhere({
    access,
    schoolId: filters.schoolId,
    range: filters.range,
    from: filters.from,
    to: filters.to,
  });

  const itemWhere: Prisma.InvoiceItemWhereInput = {
    invoice: invoiceWhere,
    productVariant: {
      ...(filters.className
        ? {
            className: filters.className,
          }
        : {}),
      product: {
        ...(filters.category
          ? {
              category: filters.category,
            }
          : {}),
      },
      ...(filters.q
        ? {
            OR: [
              {
                sku: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                barcode: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                className: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                size: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                color: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                product: {
                  name: {
                    contains: filters.q,
                    mode: "insensitive",
                  },
                },
              },
              {
                product: {
                  category: {
                    contains: filters.q,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    },
  };

  const [schools, totals, allGroups, groups] = await prisma.$transaction([
    getReportSchools(access),
    prisma.invoiceItem.aggregate({
      where: itemWhere,
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.invoiceItem.groupBy({
      by: ["productVariantId"],
      where: itemWhere,
      _count: {
        _all: true,
      },
    }),
    prisma.invoiceItem.groupBy({
      by: ["productVariantId"],
      where: itemWhere,
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
      skip: (filters.page - 1) * REPORT_PAGE_SIZE,
      take: REPORT_PAGE_SIZE,
    }),
  ]);

  const variantIds = groups.map((group) => group.productVariantId);

  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: {
          id: {
            in: variantIds,
          },
        },
        select: {
          id: true,
          sku: true,
          barcode: true,
          className: true,
          sectionName: true,
          size: true,
          color: true,
          unit: true,
          salePrice: true,
          product: {
            select: {
              name: true,
              category: true,
            },
          },
        },
      })
    : [];

  const variantMap = new Map(variants.map((variant) => [variant.id, variant]));

  return {
    schools,
    dateLabel,
    pagination: buildPagination(allGroups.length, filters.page),
    summary: {
      productCount: allGroups.length,
      lineCount: totals._count._all,
      quantitySold: totals._sum.quantity ?? 0,
      revenue: toNumber(totals._sum.lineTotal),
    },
    rows: groups.map((group) => {
      const variant = variantMap.get(group.productVariantId);

      return {
        productVariantId: group.productVariantId,
        productName: variant?.product.name ?? "Unknown Product",
        category: variant?.product.category ?? "",
        sku: variant?.sku ?? "",
        barcode: variant?.barcode ?? "",
        className: variant?.className ?? "",
        sectionName: variant?.sectionName ?? "",
        size: variant?.size ?? "",
        color: variant?.color ?? "",
        unit: variant?.unit ?? "PCS",
        salePrice: toNumber(variant?.salePrice),
        quantity: group._sum.quantity ?? 0,
        revenue: toNumber(group._sum.lineTotal),
        lineCount: group._count._all,
      };
    }),
  };
}

export async function getStockReport(input: {
  access: ReportsAccessScope;
  filters: StockReportFilters;
}) {
  const { access, filters } = input;
  const schoolIdFilter = getSchoolIdFilter(access, filters.schoolId);

  const stockWhere: Prisma.InventoryStockWhereInput = {
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...(filters.stockStatus === "out"
      ? {
          quantity: {
            lte: 0,
          },
        }
      : {}),
    ...(filters.stockStatus === "low"
      ? {
          quantity: {
            lte: 10,
          },
        }
      : {}),
    ...(filters.stockStatus === "available"
      ? {
          quantity: {
            gt: 0,
          },
        }
      : {}),
    productVariant: {
      isActive: true,
      ...(filters.className
        ? {
            className: filters.className,
          }
        : {}),
      product: {
        isActive: true,
        deletedAt: null,
        ...(filters.category
          ? {
              category: filters.category,
            }
          : {}),
      },
      ...(filters.q
        ? {
            OR: [
              {
                sku: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                barcode: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                className: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                size: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                color: {
                  contains: filters.q,
                  mode: "insensitive",
                },
              },
              {
                product: {
                  name: {
                    contains: filters.q,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    },
  };

  const [schools, totalCount, totalQty, lowCount, outCount, rows] =
    await prisma.$transaction([
      getReportSchools(access),
      prisma.inventoryStock.count({
        where: stockWhere,
      }),
      prisma.inventoryStock.aggregate({
        where: stockWhere,
        _sum: {
          quantity: true,
        },
      }),
      prisma.inventoryStock.count({
        where: {
          ...stockWhere,
          quantity: {
            lte: 10,
          },
        },
      }),
      prisma.inventoryStock.count({
        where: {
          ...stockWhere,
          quantity: {
            lte: 0,
          },
        },
      }),
      prisma.inventoryStock.findMany({
        where: stockWhere,
        select: {
          id: true,
          quantity: true,
          reorderLevel: true,
          updatedAt: true,
          school: {
            select: {
              name: true,
            },
          },
          productVariant: {
            select: {
              sku: true,
              barcode: true,
              unit: true,
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
        orderBy: [{ quantity: "asc" }, { updatedAt: "desc" }],
        skip: (filters.page - 1) * REPORT_PAGE_SIZE,
        take: REPORT_PAGE_SIZE,
      }),
    ]);

  return {
    schools,
    pagination: buildPagination(totalCount, filters.page),
    summary: {
      stockRecords: totalCount,
      totalQuantity: totalQty._sum.quantity ?? 0,
      lowStock: lowCount,
      outOfStock: outCount,
    },
    rows: rows.map((row) => ({
      id: row.id,
      schoolName: row.school.name,
      productName: row.productVariant.product.name,
      category: row.productVariant.product.category || "",
      sku: row.productVariant.sku || "",
      barcode: row.productVariant.barcode || "",
      unit: row.productVariant.unit,
      className: row.productVariant.className || "",
      sectionName: row.productVariant.sectionName || "",
      size: row.productVariant.size || "",
      color: row.productVariant.color || "",
      quantity: row.quantity,
      reorderLevel: row.reorderLevel,
      updatedAt: row.updatedAt,
    })),
  };
}

export async function getCashierReport(input: {
  access: ReportsAccessScope;
  filters: CashierReportFilters;
}) {
  const { access, filters } = input;

  const { where: invoiceWhere, dateLabel } = buildDateInvoiceWhere({
    access,
    schoolId: filters.schoolId,
    range: filters.range,
    from: filters.from,
    to: filters.to,
    q: filters.q,
  });

  const [schools, totals, allGroups, groups] = await prisma.$transaction([
    getReportSchools(access),
    prisma.invoice.aggregate({
      where: invoiceWhere,
      _count: {
        _all: true,
      },
      _sum: {
        payableAmount: true,
        paidAmount: true,
        balanceAmount: true,
      },
    }),
    prisma.invoice.groupBy({
      by: ["billedById"],
      where: invoiceWhere,
      _count: {
        _all: true,
      },
    }),
    prisma.invoice.groupBy({
      by: ["billedById"],
      where: invoiceWhere,
      _sum: {
        payableAmount: true,
        paidAmount: true,
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
      skip: (filters.page - 1) * REPORT_PAGE_SIZE,
      take: REPORT_PAGE_SIZE,
    }),
  ]);

  const userIds = groups
    .map((group) => group.billedById)
    .filter((id): id is string => Boolean(id));

  const users = userIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      })
    : [];

  const userMap = new Map(users.map((user) => [user.id, user]));

  return {
    schools,
    dateLabel,
    pagination: buildPagination(allGroups.length, filters.page),
    summary: {
      cashierCount: allGroups.length,
      invoiceCount: totals._count._all,
      revenue: toNumber(totals._sum.payableAmount),
      paid: toNumber(totals._sum.paidAmount),
      due: toNumber(totals._sum.balanceAmount),
    },
    rows: groups.map((group) => {
      const user = group.billedById ? userMap.get(group.billedById) : null;
      const revenue = toNumber(group._sum.payableAmount);
      const invoiceCount = group._count._all;

      return {
        userId: group.billedById || "system",
        name: user?.name || user?.email || "System User",
        email: user?.email || "",
        invoiceCount,
        revenue,
        paid: toNumber(group._sum.paidAmount),
        due: toNumber(group._sum.balanceAmount),
        averageBill: invoiceCount > 0 ? revenue / invoiceCount : 0,
      };
    }),
  };
}

export async function getSchoolReport(input: {
  access: ReportsAccessScope;
  filters: SchoolReportFilters;
}) {
  const { access, filters } = input;

  const { where: invoiceWhere, dateLabel } = buildDateInvoiceWhere({
    access,
    schoolId: filters.schoolId,
    range: filters.range,
    from: filters.from,
    to: filters.to,
    q: filters.q,
  });

  const [schools, totals, allGroups, groups] = await prisma.$transaction([
    getReportSchools(access),
    prisma.invoice.aggregate({
      where: invoiceWhere,
      _count: {
        _all: true,
      },
      _sum: {
        payableAmount: true,
        paidAmount: true,
        balanceAmount: true,
      },
    }),
    prisma.invoice.groupBy({
      by: ["schoolId"],
      where: invoiceWhere,
      _count: {
        _all: true,
      },
    }),
    prisma.invoice.groupBy({
      by: ["schoolId"],
      where: invoiceWhere,
      _sum: {
        payableAmount: true,
        paidAmount: true,
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
      skip: (filters.page - 1) * REPORT_PAGE_SIZE,
      take: REPORT_PAGE_SIZE,
    }),
  ]);

  const pageSchoolIds = groups.map((group) => group.schoolId);

  const [schoolRows, itemRows] = await Promise.all([
    pageSchoolIds.length
      ? prisma.school.findMany({
          where: {
            id: {
              in: pageSchoolIds,
            },
          },
          select: {
            id: true,
            name: true,
            code: true,
          },
        })
      : [],
    pageSchoolIds.length
      ? prisma.invoiceItem.findMany({
          where: {
            invoice: {
              ...invoiceWhere,
              schoolId: {
                in: pageSchoolIds,
              },
            },
          },
          select: {
            quantity: true,
            invoice: {
              select: {
                schoolId: true,
              },
            },
          },
        })
      : [],
  ]);

  const schoolMap = new Map(schoolRows.map((school) => [school.id, school]));
  const itemQtyMap = new Map<string, number>();

  itemRows.forEach((item) => {
    itemQtyMap.set(
      item.invoice.schoolId,
      (itemQtyMap.get(item.invoice.schoolId) ?? 0) + item.quantity,
    );
  });

  return {
    schools,
    dateLabel,
    pagination: buildPagination(allGroups.length, filters.page),
    summary: {
      schoolCount: allGroups.length,
      invoiceCount: totals._count._all,
      revenue: toNumber(totals._sum.payableAmount),
      paid: toNumber(totals._sum.paidAmount),
      due: toNumber(totals._sum.balanceAmount),
    },
    rows: groups.map((group) => {
      const school = schoolMap.get(group.schoolId);
      const revenue = toNumber(group._sum.payableAmount);
      const invoiceCount = group._count._all;

      return {
        schoolId: group.schoolId,
        schoolName: school?.name || "Unknown School",
        schoolCode: school?.code || "",
        invoiceCount,
        itemsSold: itemQtyMap.get(group.schoolId) ?? 0,
        revenue,
        paid: toNumber(group._sum.paidAmount),
        due: toNumber(group._sum.balanceAmount),
        averageBill: invoiceCount > 0 ? revenue / invoiceCount : 0,
      };
    }),
  };
}

function buildPagination(totalCount: number, page: number) {
  return {
    page,
    pageSize: REPORT_PAGE_SIZE,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / REPORT_PAGE_SIZE)),
    showingFrom: totalCount === 0 ? 0 : (page - 1) * REPORT_PAGE_SIZE + 1,
    showingTo: Math.min(page * REPORT_PAGE_SIZE, totalCount),
  };
}