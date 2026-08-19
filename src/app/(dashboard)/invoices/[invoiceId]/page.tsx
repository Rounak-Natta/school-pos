import Link from "next/link";
import { notFound } from "next/navigation";

import { InvoiceStatus, PaymentMode } from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { addInvoicePaymentAction, cancelInvoiceAction } from "@/features/pos/invoice-actions";
import { InvoiceShareActions } from "@/features/pos/invoice-share-actions";
import { prisma } from "@/lib/prisma";
import { hasPermission, Permission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_ZONE = "Asia/Kolkata";

type InvoicePageProps = {
  params: Promise<{ invoiceId: string }> | { invoiceId: string };
};

type DecimalLike = { toString(): string } | number | string | null | undefined;

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

export default async function InvoiceDetailPage({ params }: InvoicePageProps) {
  const access = await getInvoiceAccessScope();
  const canCreateBill = hasPermission(access, Permission.POS_BILLING);
  const { invoiceId } = await Promise.resolve(params);

  if (!invoiceId) notFound();

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(access.isSuperAdmin ? {} : { schoolId: { in: access.schoolIds } }),
    },
    include: {
      school: true,
      student: true,
      billedBy: true,
      payments: { orderBy: { paidAt: "asc" } },
      items: {
        include: {
          productVariant: { include: { product: true } },
          saleReturnItems: true,
        },
        orderBy: { id: "asc" },
      },
      saleReturns: {
        include: {
          items: true,
          processedBy: { select: { name: true, email: true } },
          exchangeInvoice: { select: { id: true, invoiceNo: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      exchangeReturn: {
        select: { id: true, returnNo: true, exchangeCreditAmount: true },
      },
    },
  });

  if (!invoice) notFound();

  const canReturn =
    invoice.status === InvoiceStatus.PAID &&
    Number(invoice.balanceAmount) <= 0 &&
    hasPermission(access, Permission.RETURN_INVOICE, invoice.schoolId) &&
    invoice.items.some(
      (item) =>
        item.saleReturnItems.reduce((sum, entry) => sum + entry.quantity, 0) <
        item.quantity,
    );

  const canReceivePayment =
    Number(invoice.balanceAmount) > 0 &&
    invoice.status !== InvoiceStatus.CANCELLED &&
    invoice.status !== InvoiceStatus.RETURNED &&
    hasPermission(access, Permission.RECEIVE_PAYMENT, invoice.schoolId);

  const canCancel =
    invoice.status !== InvoiceStatus.CANCELLED &&
    invoice.status !== InvoiceStatus.RETURNED &&
    invoice.saleReturns.length === 0 &&
    hasPermission(access, Permission.CANCEL_INVOICE, invoice.schoolId);

  const stockMovements = await prisma.stockMovement.findMany({
    where: {
      schoolId: invoice.schoolId,
      OR: [
        { referenceType: "INVOICE", referenceId: invoice.id },
        { referenceType: "INVOICE_CANCEL", referenceId: invoice.id },
        {
          referenceType: "SALE_RETURN",
          referenceId: { in: invoice.saleReturns.map((entry) => entry.id) },
        },
      ],
    },
    include: {
      productVariant: { include: { product: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalQuantity = invoice.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const customerClass = [
    invoice.customerClassName ? `Class ${invoice.customerClassName}` : "",
    invoice.customerSectionName ? `Sec ${invoice.customerSectionName}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              {invoice.invoiceNo}
            </h1>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(invoice.status)}`}
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
            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            All Invoices
          </Link>
          {canReturn ? (
            <Link
              href={`/invoices/${invoice.id}/return`}
              className="inline-flex h-10 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Return / Exchange
            </Link>
          ) : null}
          {canCreateBill ? (
            <Link
              href="/pos"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">Send bill to customer</p>
            <p className="mt-1 text-xs text-slate-500">
              Share via WhatsApp, the device share sheet, or copy a bill message.
            </p>
          </div>
          <InvoiceShareActions
            invoiceNo={invoice.invoiceNo}
            customerName={invoice.customerName || "Customer"}
            customerPhone={invoice.customerPhone || ""}
            schoolName={invoice.school.name}
            payableAmount={money(invoice.payableAmount)}
            pdfHref={`/invoices/${invoice.id}/pdf`}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer / Kid</p>
          <p className="mt-2 font-semibold text-slate-950">{invoice.customerName || "-"}</p>
          <p className="mt-1 text-sm text-slate-500">{invoice.customerPhone || "No number"}</p>
          <p className="mt-1 text-sm text-slate-500">{customerClass || "No class details"}</p>
          {invoice.student?.admissionNo || invoice.student?.rollNumber ? (
            <p className="mt-1 text-xs text-slate-400">
              {[invoice.student.admissionNo ? `Adm ${invoice.student.admissionNo}` : "", invoice.student.rollNumber ? `Roll ${invoice.student.rollNumber}` : ""].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">School</p>
          <p className="mt-2 font-semibold text-slate-950">{invoice.school.name}</p>
          <p className="mt-1 text-sm text-slate-500">Code: {invoice.school.code}</p>
          {invoice.school.phone ? <p className="mt-1 text-sm text-slate-500">{invoice.school.phone}</p> : null}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed By</p>
          <p className="mt-2 font-semibold text-slate-950">{invoice.billedBy?.name || "System User"}</p>
          <p className="mt-1 text-sm text-slate-500">{invoice.billedBy?.email || "-"}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-950">Invoice Items</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {invoice.items.length} line(s) · {totalQuantity} total quantity
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Base Rate</th>
                    <th className="px-4 py-3 text-right">Taxable</th>
                    <th className="px-4 py-3 text-right">GST</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item) => {
                    const variant = item.productVariant;
                    const returnedQty = item.saleReturnItems.reduce((sum, entry) => sum + entry.quantity, 0);
                    const meta = [
                      variant.product.category,
                      variant.sku ? `SKU ${variant.sku}` : "",
                      variant.hsnCode ? `HSN ${variant.hsnCode}` : "",
                      variant.className ? `Class ${variant.className}` : "",
                      variant.sectionName ? `Sec ${variant.sectionName}` : "",
                      variant.size,
                      variant.color,
                    ].filter(Boolean).join(" · ");
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-950">{variant.product.name}</p>
                          {meta ? <p className="mt-1 text-xs text-slate-500">{meta}</p> : null}
                          {returnedQty > 0 ? <p className="mt-1 text-xs font-semibold text-purple-600">Returned / exchanged: {returnedQty}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-center">{item.quantity}</td>
                        <td className="px-4 py-3 text-right">{money(item.unitPrice)}</td>
                        <td className="px-4 py-3 text-right">{money(item.taxableAmount)}</td>
                        <td className="px-4 py-3 text-right">
                          {money(item.gstAmount)}
                          <div className="text-xs text-slate-400">{Number(item.gstRate).toFixed(2)}%</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-950">{money(item.lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {invoice.saleReturns.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">Return / Exchange History</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {invoice.saleReturns.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-2 px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{entry.returnNo} · {formatEnum(entry.mode)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(entry.createdAt)} · {entry.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</p>
                      {entry.reason ? <p className="mt-1 text-xs text-slate-500">Reason: {entry.reason}</p> : null}
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-semibold text-slate-950">{money(entry.totalAmount)}</p>
                      {Number(entry.exchangeCreditAmount) > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Exchange credit {money(entry.exchangeCreditAmount)}
                          {entry.exchangeInvoice ? (
                            <> · used on <Link className="underline" href={`/invoices/${entry.exchangeInvoice.id}`}>{entry.exchangeInvoice.invoiceNo}</Link></>
                          ) : " · unused"}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-500">Refund {money(entry.refundAmount)} · {entry.refundMode ? formatEnum(entry.refundMode) : "-"}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {invoice.payments.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-950">Payment History</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.payments.map((payment) => <tr key={payment.id}><td className="px-4 py-3">{formatDateTime(payment.paidAt)}</td><td className="px-4 py-3">{formatEnum(payment.mode)}</td><td className="px-4 py-3 text-slate-500">{payment.transactionRef || "-"}</td><td className="px-4 py-3 text-right font-semibold">{money(payment.amount)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {stockMovements.length > 0 ? (
            <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-950">Stock movement trail ({stockMovements.length})</summary>
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Before → After</th><th className="px-4 py-3">Date</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{stockMovements.map((movement) => <tr key={movement.id}><td className="px-4 py-3">{movement.productVariant.product.name}</td><td className="px-4 py-3">{formatEnum(movement.type)}</td><td className="px-4 py-3">{movement.quantity}</td><td className="px-4 py-3">{movement.beforeQty} → {movement.afterQty}</td><td className="px-4 py-3">{formatDateTime(movement.createdAt)}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">Bill Summary</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Taxable subtotal</span><span>{money(invoice.subtotalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">GST amount</span><span>{money(invoice.gstAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Gross total</span><span>{money(invoice.totalAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>- {money(invoice.discountAmount)}</span></div>
              {Number(invoice.exchangeCreditAmount) > 0 ? <div className="flex justify-between text-amber-700"><span>Exchange credit</span><span>- {money(invoice.exchangeCreditAmount)}</span></div> : null}
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-950"><span>Payable</span><span>{money(invoice.payableAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Paid</span><span>{money(invoice.paidAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className={Number(invoice.balanceAmount) > 0 ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>{money(invoice.balanceAmount)}</span></div>
            </div>
            {invoice.exchangeReturn ? (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                Exchange credit used: <b>{invoice.exchangeReturn.returnNo}</b> ({money(invoice.exchangeReturn.exchangeCreditAmount)})
              </div>
            ) : null}
          </div>

          {canReceivePayment ? (
            <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-950">Collect Remaining Balance</h2>
              <p className="mt-1 text-xs text-slate-500">
                Record another payment against this invoice. The server prevents over-collection even if two users submit at the same time.
              </p>
              <form action={addInvoicePaymentAction} className="mt-4 space-y-3">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <label className="block text-xs font-semibold text-slate-600">
                  Amount
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    max={Number(invoice.balanceAmount)}
                    step="0.01"
                    defaultValue={Number(invoice.balanceAmount).toFixed(2)}
                    required
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Payment Mode
                  <select name="mode" defaultValue={PaymentMode.CASH} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
                    {Object.values(PaymentMode).map((mode) => (
                      <option key={mode} value={mode}>{formatEnum(mode)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Transaction Reference
                  <input name="transactionRef" placeholder="Optional" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <button className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
                  Record Payment
                </button>
              </form>
            </div>
          ) : null}

          {canCancel ? (
            <details className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold text-red-700">Cancel Invoice</summary>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Cancellation restores all sold stock and removes this invoice from active sales/collection reports. Invoices with return/exchange history must use the return workflow instead.
              </p>
              <form action={cancelInvoiceAction} className="mt-4 space-y-3">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <label className="block text-xs font-semibold text-slate-600">
                  Cancellation Reason
                  <textarea name="reason" required rows={3} placeholder="Required" className="mt-1 w-full rounded-xl border border-red-200 px-3 py-2 text-sm" />
                </label>
                <button className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800">
                  Confirm Cancellation
                </button>
              </form>
            </details>
          ) : null}

          {invoice.note ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-950">Note</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{invoice.note}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
