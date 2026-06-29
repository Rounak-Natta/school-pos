import Link from "next/link";
import { notFound } from "next/navigation";

import type { Prisma } from "@/generated/prisma/client";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type InvoiceWithDetails = Prisma.InvoiceGetPayload<{
  include: {
    school: true;
    payments: true;
    items: {
      include: {
        productVariant: {
          include: {
            product: true;
          };
        };
      };
    };
  };
}>;

type InvoiceItem = InvoiceWithDetails["items"][number];
type InvoicePayment = InvoiceWithDetails["payments"][number];

type InvoicePageProps = {
  params:
    | {
        invoiceId: string;
      }
    | Promise<{
        invoiceId: string;
      }>;
};

function toNumber(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === "object") {
    const decimalValue = value as {
      toNumber?: () => number;
      toString?: () => string;
    };

    if (typeof decimalValue.toNumber === "function") {
      return decimalValue.toNumber();
    }

    if (typeof decimalValue.toString === "function") {
      const parsed = Number(decimalValue.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }

  return 0;
}

function money(value: unknown) {
  return `₹${toNumber(value).toFixed(2)}`;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatPaymentMode(mode: string) {
  return mode.split("_").join(" ");
}

function getPaymentModes(payments: InvoicePayment[]) {
  if (payments.length === 0) {
    return "-";
  }

  return payments.map((payment) => formatPaymentMode(payment.mode)).join(", ");
}

function getCustomerName(invoice: InvoiceWithDetails) {
  return invoice.customerName || "Walk-in Customer";
}

function getCustomerPhone(invoice: InvoiceWithDetails) {
  return invoice.customerPhone || "-";
}

function getCustomerClass(invoice: InvoiceWithDetails) {
  const classParts = [
    invoice.customerClassName,
    invoice.customerSectionName,
  ].filter(Boolean);

  if (classParts.length === 0) {
    return "-";
  }

  return classParts.join(" - ");
}

function getItemName(item: InvoiceItem) {
  const productName = item.productVariant.product.name;

  const variantParts = [
    item.productVariant.className,
    item.productVariant.sectionName,
    item.productVariant.size,
    item.productVariant.color,
  ].filter(Boolean);

  if (variantParts.length === 0) {
    return productName;
  }

  return `${productName} - ${variantParts.join(", ")}`;
}

function getItemMeta(item: InvoiceItem) {
  const metaParts = [
    item.productVariant.sku ? `SKU: ${item.productVariant.sku}` : null,
    item.productVariant.barcode
      ? `Barcode: ${item.productVariant.barcode}`
      : null,
    item.productVariant.unit ? `Unit: ${item.productVariant.unit}` : null,
  ].filter(Boolean);

  return metaParts.join(" · ");
}

export default async function InvoiceDetailPage({ params }: InvoicePageProps) {
  await requireUser();

  const { invoiceId } = await Promise.resolve(params);

  const invoice = await prisma.invoice.findUnique({
    where: {
      id: invoiceId,
    },
    include: {
      school: true,
      payments: {
        orderBy: {
          paidAt: "asc",
        },
      },
      items: {
        include: {
          productVariant: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Invoice</p>

          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {invoice.invoiceNo}
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Created on {formatDate(invoice.createdAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/pos"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to POS
          </Link>

          <Link
            href="/invoices"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            All Invoices
          </Link>

          <Link
            href={`/invoices/${invoice.id}/pdf`}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Download PDF
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Customer Details
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Customer Name
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {getCustomerName(invoice)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Phone
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {getCustomerPhone(invoice)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Class / Section
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {getCustomerClass(invoice)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                School
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {invoice.school.name}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Payment Details
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Status
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {invoice.status}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Payment Mode
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {getPaymentModes(invoice.payments)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Total Amount
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {money(invoice.totalAmount)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Discount
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {money(invoice.discountAmount)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Paid
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {money(invoice.paidAmount)}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase text-slate-500">
                Balance
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {money(invoice.balanceAmount)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Invoice Items
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Item</th>
                <th className="px-6 py-3 text-center">Qty</th>
                <th className="px-6 py-3 text-right">Rate</th>
                <th className="px-6 py-3 text-right">Discount</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {invoice.items.map((item: InvoiceItem) => {
                const itemMeta = getItemMeta(item);

                return (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-900">
                        {getItemName(item)}
                      </p>

                      {itemMeta ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {itemMeta}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-6 py-4 text-center">
                      {item.quantity}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {money(item.unitPrice)}
                    </td>

                    <td className="px-6 py-4 text-right">
                      {money(item.discountAmount)}
                    </td>

                    <td className="px-6 py-4 text-right font-medium">
                      {money(item.lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t bg-slate-50 px-6 py-5">
          <div className="ml-auto max-w-sm space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Total Amount</span>
              <span className="font-medium text-slate-900">
                {money(invoice.totalAmount)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Discount</span>
              <span className="font-medium text-slate-900">
                {money(invoice.discountAmount)}
              </span>
            </div>

            <div className="flex justify-between border-t pt-3 text-base font-semibold text-slate-900">
              <span>Payable</span>
              <span>{money(invoice.payableAmount)}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Paid</span>
              <span className="font-medium text-slate-900">
                {money(invoice.paidAmount)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-500">Balance</span>
              <span className="font-medium text-slate-900">
                {money(invoice.balanceAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {invoice.note ? (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Note</h2>
          <p className="mt-3 text-sm text-slate-600">{invoice.note}</p>
        </div>
      ) : null}

      {invoice.payments.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Payment History
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Mode</th>
                  <th className="px-6 py-3">Transaction Ref</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {invoice.payments.map((payment: InvoicePayment) => (
                  <tr key={payment.id}>
                    <td className="px-6 py-4">
                      {formatDate(payment.paidAt)}
                    </td>

                    <td className="px-6 py-4">
                      {formatPaymentMode(payment.mode)}
                    </td>

                    <td className="px-6 py-4">
                      {payment.transactionRef || "-"}
                    </td>

                    <td className="px-6 py-4 text-right font-medium">
                      {money(payment.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}