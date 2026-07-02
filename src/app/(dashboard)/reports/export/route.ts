import { NextRequest, NextResponse } from "next/server";

import {
  InvoiceStatus,
  PaymentMode,
  type Prisma,
} from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import {
  getDateRange,
  resolveInvoiceStatus,
  resolvePaymentMode,
  resolveReportRange,
  resolveStockStatus,
  toNumber,
} from "@/features/reports/reports-utils";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.PAID,
  InvoiceStatus.PARTIALLY_PAID,
];

type ExportType =
  | "sales"
  | "payments"
  | "products"
  | "stock"
  | "cashiers"
  | "schools";

function getParam(request: NextRequest, key: string) {
  return request.nextUrl.searchParams.get(key)?.trim() ?? "";
}

function getExportType(value: string): ExportType {
  const types: ExportType[] = [
    "sales",
    "payments",
    "products",
    "stock",
    "cashiers",
    "schools",
  ];

  return types.includes(value as ExportType) ? (value as ExportType) : "sales";
}

function csvEscape(value: unknown) {
  const stringValue = String(value ?? "");

  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function makeCsv(headers: string[], rows: unknown[][]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

function makeCsvResponse(input: {
  filename: string;
  headers: string[];
  rows: unknown[][];
}) {
  const csv = makeCsv(input.headers, input.rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${input.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function getSchoolIdFilter(input: {
  isSuperAdmin: boolean;
  schoolIds: string[];
  requestedSchoolId: string;
}) {
  if (input.isSuperAdmin) {
    return input.requestedSchoolId || undefined;
  }

  if (input.requestedSchoolId) {
    return input.schoolIds.includes(input.requestedSchoolId)
      ? input.requestedSchoolId
      : "__NO_ACCESS__";
  }

  return {
    in: input.schoolIds,
  };
}

function getDateFilter(request: NextRequest, field: "createdAt" | "paidAt") {
  const range = resolveReportRange(getParam(request, "range"));
  const from = getParam(request, "from");
  const to = getParam(request, "to");

  const dateRange = getDateRange({
    range,
    from,
    to,
  });

  if (!dateRange) {
    return {};
  }

  return {
    [field]: {
      ...(dateRange.start ? { gte: dateRange.start } : {}),
      ...(dateRange.end ? { lte: dateRange.end } : {}),
    },
  };
}

export async function GET(request: NextRequest) {
  const access = await getInvoiceAccessScope();

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return NextResponse.json(
      {
        error: "No active school access.",
      },
      {
        status: 403,
      },
    );
  }

  const type = getExportType(getParam(request, "type"));

  if (type === "sales") {
    return exportSales(request, access);
  }

  if (type === "payments") {
    return exportPayments(request, access);
  }

  if (type === "products") {
    return exportProducts(request, access);
  }

  if (type === "stock") {
    return exportStock(request, access);
  }

  if (type === "cashiers") {
    return exportCashiers(request, access);
  }

  return exportSchools(request, access);
}

async function exportSales(
  request: NextRequest,
  access: Awaited<ReturnType<typeof getInvoiceAccessScope>>,
) {
  const q = getParam(request, "q");
  const schoolId = getParam(request, "schoolId");
  const status = resolveInvoiceStatus(getParam(request, "status"));

  const schoolIdFilter = getSchoolIdFilter({
    ...access,
    requestedSchoolId: schoolId,
  });

  const where: Prisma.InvoiceWhereInput = {
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...(status
      ? {
          status,
        }
      : {
          status: {
            in: ACTIVE_INVOICE_STATUSES,
          },
        }),
    ...getDateFilter(request, "createdAt"),
    ...(q
      ? {
          OR: [
            {
              invoiceNo: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              customerName: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              customerPhone: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              school: {
                name: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {}),
  };

  const rows = await prisma.invoice.findMany({
    where,
    select: {
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
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 10000,
  });

  return makeCsvResponse({
    filename: "sales-report.csv",
    headers: [
      "Invoice No",
      "Date",
      "School",
      "Customer",
      "Phone",
      "Class",
      "Section",
      "Status",
      "Total",
      "Discount",
      "Payable",
      "Paid",
      "Balance",
      "Billed By",
    ],
    rows: rows.map((row) => [
      row.invoiceNo,
      formatDate(row.createdAt),
      row.school.name,
      row.customerName || "Walk-in Customer",
      row.customerPhone || "",
      row.customerClassName || "",
      row.customerSectionName || "",
      row.status,
      toNumber(row.totalAmount),
      toNumber(row.discountAmount),
      toNumber(row.payableAmount),
      toNumber(row.paidAmount),
      toNumber(row.balanceAmount),
      row.billedBy?.name || row.billedBy?.email || "System User",
    ]),
  });
}

async function exportPayments(
  request: NextRequest,
  access: Awaited<ReturnType<typeof getInvoiceAccessScope>>,
) {
  const q = getParam(request, "q");
  const schoolId = getParam(request, "schoolId");
  const mode = resolvePaymentMode(getParam(request, "mode"));

  const schoolIdFilter = getSchoolIdFilter({
    ...access,
    requestedSchoolId: schoolId,
  });

  const where: Prisma.PaymentWhereInput = {
    ...(mode ? { mode } : {}),
    ...getDateFilter(request, "paidAt"),
    invoice: {
      status: {
        in: ACTIVE_INVOICE_STATUSES,
      },
      ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    },
    ...(q
      ? {
          OR: [
            {
              transactionRef: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              invoice: {
                invoiceNo: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
            {
              invoice: {
                customerName: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
            {
              invoice: {
                school: {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        }
      : {}),
  };

  const rows = await prisma.payment.findMany({
    where,
    select: {
      mode: true,
      amount: true,
      transactionRef: true,
      paidAt: true,
      invoice: {
        select: {
          invoiceNo: true,
          customerName: true,
          customerPhone: true,
          school: {
            select: {
              name: true,
            },
          },
        },
      },
      receivedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      paidAt: "desc",
    },
    take: 10000,
  });

  return makeCsvResponse({
    filename: "payments-report.csv",
    headers: [
      "Date",
      "Invoice No",
      "School",
      "Customer",
      "Phone",
      "Mode",
      "Amount",
      "Transaction Ref",
      "Received By",
    ],
    rows: rows.map((row) => [
      formatDate(row.paidAt),
      row.invoice.invoiceNo,
      row.invoice.school.name,
      row.invoice.customerName || "Walk-in Customer",
      row.invoice.customerPhone || "",
      row.mode,
      toNumber(row.amount),
      row.transactionRef || "",
      row.receivedBy?.name || row.receivedBy?.email || "System User",
    ]),
  });
}

async function exportProducts(
  request: NextRequest,
  access: Awaited<ReturnType<typeof getInvoiceAccessScope>>,
) {
  const q = getParam(request, "q");
  const schoolId = getParam(request, "schoolId");
  const category = getParam(request, "category");
  const className = getParam(request, "className");

  const schoolIdFilter = getSchoolIdFilter({
    ...access,
    requestedSchoolId: schoolId,
  });

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: {
      in: ACTIVE_INVOICE_STATUSES,
    },
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...getDateFilter(request, "createdAt"),
  };

  const itemWhere: Prisma.InvoiceItemWhereInput = {
    invoice: invoiceWhere,
    productVariant: {
      ...(className ? { className } : {}),
      product: {
        ...(category ? { category } : {}),
      },
      ...(q
        ? {
            OR: [
              {
                sku: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                barcode: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                product: {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    },
  };

  const groups = await prisma.invoiceItem.groupBy({
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
    take: 10000,
  });

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

  return makeCsvResponse({
    filename: "product-sales-report.csv",
    headers: [
      "Product",
      "Category",
      "SKU",
      "Barcode",
      "Class",
      "Section",
      "Size",
      "Color",
      "Unit",
      "Quantity Sold",
      "Revenue",
      "Line Count",
    ],
    rows: groups.map((group) => {
      const variant = variantMap.get(group.productVariantId);

      return [
        variant?.product.name || "Unknown Product",
        variant?.product.category || "",
        variant?.sku || "",
        variant?.barcode || "",
        variant?.className || "",
        variant?.sectionName || "",
        variant?.size || "",
        variant?.color || "",
        variant?.unit || "PCS",
        group._sum.quantity ?? 0,
        toNumber(group._sum.lineTotal),
        group._count._all,
      ];
    }),
  });
}

async function exportStock(
  request: NextRequest,
  access: Awaited<ReturnType<typeof getInvoiceAccessScope>>,
) {
  const q = getParam(request, "q");
  const schoolId = getParam(request, "schoolId");
  const category = getParam(request, "category");
  const className = getParam(request, "className");
  const stockStatus = resolveStockStatus(getParam(request, "stockStatus"));

  const schoolIdFilter = getSchoolIdFilter({
    ...access,
    requestedSchoolId: schoolId,
  });

  const where: Prisma.InventoryStockWhereInput = {
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...(stockStatus === "out" ? { quantity: { lte: 0 } } : {}),
    ...(stockStatus === "low" ? { quantity: { lte: 10 } } : {}),
    ...(stockStatus === "available" ? { quantity: { gt: 0 } } : {}),
    productVariant: {
      isActive: true,
      ...(className ? { className } : {}),
      product: {
        isActive: true,
        deletedAt: null,
        ...(category ? { category } : {}),
      },
      ...(q
        ? {
            OR: [
              {
                sku: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                barcode: {
                  contains: q,
                  mode: "insensitive",
                },
              },
              {
                product: {
                  name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              },
            ],
          }
        : {}),
    },
  };

  const rows = await prisma.inventoryStock.findMany({
    where,
    select: {
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
    orderBy: {
      quantity: "asc",
    },
    take: 10000,
  });

  return makeCsvResponse({
    filename: "stock-report.csv",
    headers: [
      "School",
      "Product",
      "Category",
      "SKU",
      "Barcode",
      "Class",
      "Section",
      "Size",
      "Color",
      "Unit",
      "Quantity",
      "Reorder Level",
      "Updated At",
    ],
    rows: rows.map((row) => [
      row.school.name,
      row.productVariant.product.name,
      row.productVariant.product.category || "",
      row.productVariant.sku || "",
      row.productVariant.barcode || "",
      row.productVariant.className || "",
      row.productVariant.sectionName || "",
      row.productVariant.size || "",
      row.productVariant.color || "",
      row.productVariant.unit,
      row.quantity,
      row.reorderLevel,
      formatDate(row.updatedAt),
    ]),
  });
}

async function exportCashiers(
  request: NextRequest,
  access: Awaited<ReturnType<typeof getInvoiceAccessScope>>,
) {
  const schoolId = getParam(request, "schoolId");

  const schoolIdFilter = getSchoolIdFilter({
    ...access,
    requestedSchoolId: schoolId,
  });

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: {
      in: ACTIVE_INVOICE_STATUSES,
    },
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...getDateFilter(request, "createdAt"),
  };

  const groups = await prisma.invoice.groupBy({
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
    take: 10000,
  });

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

  return makeCsvResponse({
    filename: "cashier-report.csv",
    headers: [
      "Cashier",
      "Email",
      "Invoices",
      "Revenue",
      "Paid",
      "Due",
      "Average Bill",
    ],
    rows: groups.map((group) => {
      const user = group.billedById ? userMap.get(group.billedById) : null;
      const invoiceCount = group._count._all;
      const revenue = toNumber(group._sum.payableAmount);

      return [
        user?.name || user?.email || "System User",
        user?.email || "",
        invoiceCount,
        revenue,
        toNumber(group._sum.paidAmount),
        toNumber(group._sum.balanceAmount),
        invoiceCount > 0 ? revenue / invoiceCount : 0,
      ];
    }),
  });
}

async function exportSchools(
  request: NextRequest,
  access: Awaited<ReturnType<typeof getInvoiceAccessScope>>,
) {
  const schoolId = getParam(request, "schoolId");

  const schoolIdFilter = getSchoolIdFilter({
    ...access,
    requestedSchoolId: schoolId,
  });

  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: {
      in: ACTIVE_INVOICE_STATUSES,
    },
    ...(schoolIdFilter ? { schoolId: schoolIdFilter } : {}),
    ...getDateFilter(request, "createdAt"),
  };

  const groups = await prisma.invoice.groupBy({
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
    take: 10000,
  });

  const schoolIds = groups.map((group) => group.schoolId);

  const schools = schoolIds.length
    ? await prisma.school.findMany({
        where: {
          id: {
            in: schoolIds,
          },
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
      })
    : [];

  const schoolMap = new Map(schools.map((school) => [school.id, school]));

  return makeCsvResponse({
    filename: "school-report.csv",
    headers: [
      "School",
      "Code",
      "Invoices",
      "Revenue",
      "Paid",
      "Due",
      "Average Bill",
    ],
    rows: groups.map((group) => {
      const school = schoolMap.get(group.schoolId);
      const invoiceCount = group._count._all;
      const revenue = toNumber(group._sum.payableAmount);

      return [
        school?.name || "Unknown School",
        school?.code || "",
        invoiceCount,
        revenue,
        toNumber(group._sum.paidAmount),
        toNumber(group._sum.balanceAmount),
        invoiceCount > 0 ? revenue / invoiceCount : 0,
      ];
    }),
  });
}