import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceStatus, type Prisma } from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { prisma } from "@/lib/prisma";
import { hasPermission, Permission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_ZONE = "Asia/Kolkata";

type InvoicePageProps = {
  params:
    | {
        invoiceId: string;
      }
    | Promise<{
        invoiceId: string;
      }>;
};

type DecimalLike =
  | {
      toString(): string;
    }
  | number
  | string
  | null
  | undefined;

type InvoiceItem = Prisma.InvoiceItemGetPayload<{
  select: {
    id: true;
    quantity: true;
    unitPrice: true;
    discountAmount: true;
    lineTotal: true;
    productVariant: {
      select: {
        sku: true;
        barcode: true;
        unit: true;
        className: true;
        sectionName: true;
        size: true;
        color: true;
        product: {
          select: {
            name: true;
            category: true;
          };
        };
      };
    };
  };
}>;

function money(value: DecimalLike) {
  const numericValue = Number(value?.toString() ?? 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

function getItemTitle(item: InvoiceItem) {
  return item.productVariant.product.name;
}

function getItemMeta(item: InvoiceItem) {
  const variant = item.productVariant;

  return [
    variant.product.category,
    variant.sku ? `SKU ${variant.sku}` : "",
    variant.barcode ? `Barcode ${variant.barcode}` : "",
    variant.className ? `Class ${variant.className}` : "",
    variant.sectionName ? `Sec ${variant.sectionName}` : "",
    variant.size,
    variant.color,
    variant.unit ? `Unit ${variant.unit}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function getCustomerClass(invoice: {
  customerClassName: string | null;
  customerSectionName: string | null;
}) {
  return [
    invoice.customerClassName ? `Class ${invoice.customerClassName}` : "",
    invoice.customerSectionName ? `Sec ${invoice.customerSectionName}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function InvoiceDetailPage({
  params,
}: InvoicePageProps) {
  const access = await getInvoiceAccessScope();
  const canCreateBill = hasPermission(access, Permission.POS_BILLING);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    notFound();
  }

  const { invoiceId } = await Promise.resolve(params);

  if (!invoiceId || typeof invoiceId !== "string") {
    notFound();
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(access.isSuperAdmin
        ? {}
        : {
            schoolId: {
              in: access.schoolIds,
            },
          }),
    },
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

      note: true,
      createdAt: true,

      school: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          phone: true,
          email: true,
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
          id: true,
          mode: true,
          amount: true,
          transactionRef: true,
          paidAt: true,
        },
        orderBy: {
          paidAt: "asc",
        },
      },

      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          discountAmount: true,
          lineTotal: true,
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
          id: "asc",
        },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  const stockMovements = await prisma.stockMovement.findMany({
    where: {
      schoolId: invoice.school.id,
      referenceType: "INVOICE",
      referenceId: invoice.id,
    },
    select: {
      id: true,
      type: true,
      quantity: true,
      beforeQty: true,
      afterQty: true,
      createdAt: true,
      note: true,
      productVariant: {
        select: {
          sku: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const totalQuantity = invoice.items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const customerClass = getCustomerClass(invoice);
  const balanceAmount = Number(invoice.balanceAmount.toString());

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {invoice.invoiceNo}
            </h1>

            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                invoice.status,
              )}`}
            >
              {formatEnum(invoice.status)}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            {formatDateTime(invoice.createdAt)} · {invoice.school.name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/invoices"
            className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            All Invoices
          </Link>

          {canCreateBill ? (
            <Link
              href="/pos"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              New Bill
            </Link>
          ) : null}

          <Link
            href={`/invoices/${invoice.id}/pdf`}
            className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Download PDF
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Customer
              </p>
              <p className="mt-2 truncate text-base font-semibold text-slate-950">
                {invoice.customerName || "Walk-in Customer"}
              </p>
              <p className="mt-1 truncate text-sm text-slate-500">
                {invoice.customerPhone || "No phone"}
              </p>
              <p className="mt-1 truncate text-sm text-slate-500">
                {customerClass || "No class details"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                School
              </p>
              <p className="mt-2 line-clamp-2 text-base font-semibold text-slate-950">
                {invoice.school.name}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Code: {invoice.school.code}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Billed By
              </p>
              <p className="mt-2 truncate text-base font-semibold text-slate-950">
                {invoice.billedBy?.name || "System User"}
              </p>
              <p className="mt-1 truncate text-sm text-slate-500">
                {invoice.billedBy?.email || "-"}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">
                  Invoice Items
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {invoice.items.length} line item
                  {invoice.items.length === 1 ? "" : "s"} · {totalQuantity}{" "}
                  total quantity
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="w-20 px-4 py-3 text-center font-semibold">
                      Qty
                    </th>
                    <th className="w-130 px-4 py-3 text-right font-semibold">
                      Rate
                    </th>
                    <th className="w-130 px-4 py-3 text-right font-semibold">
                      Discount
                    </th>
                    <th className="w-130 px-4 py-3 text-right font-semibold">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item) => {
                    const itemMeta = getItemMeta(item);

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-950">
                            {getItemTitle(item)}
                          </p>

                          {itemMeta ? (
                            <p className="mt-1 max-w-[520px] truncate text-xs text-slate-500">
                              {itemMeta}
                            </p>
                          ) : null}
                        </td>

                        <td className="px-4 py-3 text-center font-medium text-slate-900">
                          {item.quantity}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-700">
                          {money(item.unitPrice)}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-700">
                          {money(item.discountAmount)}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-950">
                          {money(item.lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {invoice.payments.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">
                  Payment History
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Mode</th>
                      <th className="px-4 py-3 font-semibold">Reference</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Amount
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {invoice.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3">
                          {formatDateTime(payment.paidAt)}
                        </td>

                        <td className="px-4 py-3 font-medium text-slate-900">
                          {formatEnum(payment.mode)}
                        </td>

                        <td className="px-4 py-3 text-slate-500">
                          {payment.transactionRef || "-"}
                        </td>

                        <td className="px-4 py-3 text-right font-semibold text-slate-950">
                          {money(payment.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {stockMovements.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">
                  Stock Movements
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Product</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 text-right font-semibold">Qty</th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Before
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        After
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {stockMovements.map((movement) => (
                      <tr key={movement.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {movement.productVariant.product.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {movement.productVariant.sku || "-"}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-slate-700">
                          {formatEnum(movement.type)}
                        </td>

                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {movement.quantity}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-500">
                          {movement.beforeQty}
                        </td>

                        <td className="px-4 py-3 text-right text-slate-500">
                          {movement.afterQty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {invoice.note ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-950">Note</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {invoice.note}
              </p>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">
              Bill Summary
            </h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Total</span>
                <span className="font-medium text-slate-900">
                  {money(invoice.totalAmount)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Discount</span>
                <span className="font-medium text-slate-900">
                  {money(invoice.discountAmount)}
                </span>
              </div>

              <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
                <span className="font-semibold text-slate-950">Payable</span>
                <span className="text-lg font-bold text-slate-950">
                  {money(invoice.payableAmount)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Paid</span>
                <span className="font-medium text-slate-900">
                  {money(invoice.paidAmount)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Balance</span>
                <span
                  className={
                    balanceAmount > 0
                      ? "font-semibold text-amber-600"
                      : "font-medium text-emerald-700"
                  }
                >
                  {money(invoice.balanceAmount)}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <Link
                href={`/invoices/${invoice.id}/pdf`}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Download PDF
              </Link>

              <Link
                href="/invoices"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Back to Invoices
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}