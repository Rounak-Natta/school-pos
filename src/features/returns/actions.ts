"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { InvoiceStatus, NotificationType, PaymentMode, ReturnMode, StockMovementType, type Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { notifySchoolUsers } from "@/features/notifications/notification-service";
import { nextReturnNo } from "@/features/pos/invoice-number";
import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, requirePermission } from "@/lib/rbac";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const dec = (v: number) => money(v).toFixed(2);

export async function processInvoiceReturnAction(formData: FormData) {
  const access = await getAccessScope();
  const invoiceId = clean(formData.get("invoiceId"));
  const modeText = clean(formData.get("mode"));
  const mode = modeText === ReturnMode.EXCHANGE ? ReturnMode.EXCHANGE : ReturnMode.RETURN;
  const reason = clean(formData.get("reason"));
  const refundModeRaw = clean(formData.get("refundMode"));
  const refundMode = Object.values(PaymentMode).includes(refundModeRaw as PaymentMode) ? refundModeRaw as PaymentMode : PaymentMode.CASH;
  const refundReference = clean(formData.get("refundReference"));

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: {
        include: {
          saleReturnItems: true,
          productVariant: { include: { product: true } },
        },
      },
      school: { select: { name: true } },
    },
  });
  if (!invoice) throw new Error("Invoice not found.");
  if (invoice.status === InvoiceStatus.CANCELLED) throw new Error("Cancelled invoices cannot be returned.");
  if (Number(invoice.balanceAmount) > 0) {
    throw new Error(
      "Settle the remaining invoice balance before processing a return or exchange.",
    );
  }
  requirePermission(access, Permission.RETURN_INVOICE, invoice.schoolId);

  const selected: Array<{ item: typeof invoice.items[number]; qty: number }> = [];
  for (const item of invoice.items) {
    const qty = Number(clean(formData.get(`returnQty_${item.id}`)) || 0);
    if (!Number.isInteger(qty) || qty < 0) throw new Error("Return quantity must be a whole number.");
    if (!qty) continue;
    const available = item.quantity - item.returnedQty;
    if (qty > available) throw new Error(`${item.productVariant.product.name}: only ${available} item(s) can still be returned.`);
    selected.push({ item, qty });
  }
  if (!selected.length) throw new Error("Select at least one item to return or exchange.");

  const result = await prisma.$transaction(async (tx) => {
    // Claim the invoice row before changing return quantities. This serializes
    // returns against invoice cancellation so stock can never be restored twice
    // by a return and a cancellation racing each other.
    const invoiceClaim = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        status: InvoiceStatus.PAID,
      },
      data: { updatedAt: new Date() },
    });
    if (invoiceClaim.count !== 1) {
      throw new Error(
        "Invoice status changed before the return could be processed. Refresh and try again.",
      );
    }

    // Re-read returned quantities inside the transaction to prevent duplicate concurrent returns.
    const freshItems = await tx.invoiceItem.findMany({
      where: { id: { in: selected.map(s => s.item.id) }, invoiceId },
      include: { saleReturnItems: true, productVariant: { include: { product: true } } },
    });
    const freshById = new Map(freshItems.map(i => [i.id, i]));
    let totalCredit = 0;
    const prepared: Array<{ invoiceItemId: string; productVariantId: string; quantity: number; unitCredit: number; gstAmount: number; lineCredit: number; label: string }> = [];
    for (const selectedItem of selected) {
      const item = freshById.get(selectedItem.item.id);
      if (!item) throw new Error("Invoice item changed. Refresh and try again.");
      if (selectedItem.qty > item.quantity - item.returnedQty) throw new Error("Return quantity changed. Refresh and try again.");
      // Allocate invoice-level discount proportionally, so a discounted sale cannot
      // be returned for more than the value actually charged before payment tender.
      const invoiceGross = Number(invoice.totalAmount);
      const discountFactor = invoiceGross > 0
        ? Math.max(0, (invoiceGross - Number(invoice.discountAmount)) / invoiceGross)
        : 1;
      const grossUnitCredit = Number(item.lineTotal) / item.quantity;
      const unitCredit = money(grossUnitCredit * discountFactor);
      const lineCredit = money(unitCredit * selectedItem.qty);
      const gstAmount = money((Number(item.gstAmount) / item.quantity) * selectedItem.qty * discountFactor);
      totalCredit = money(totalCredit + lineCredit);
      prepared.push({ invoiceItemId: item.id, productVariantId: item.productVariantId, quantity: selectedItem.qty, unitCredit, gstAmount, lineCredit, label: item.productVariant.product.name });
    }

    // Atomically claim the return quantity on every invoice line. This prevents
    // two concurrent return/exchange requests from restoring the same stock twice.
    for (const item of prepared) {
      const sourceItem = freshById.get(item.invoiceItemId);
      if (!sourceItem) throw new Error("Invoice item changed. Refresh and try again.");
      const claimed = await tx.invoiceItem.updateMany({
        where: {
          id: item.invoiceItemId,
          invoiceId,
          returnedQty: { lte: sourceItem.quantity - item.quantity },
        },
        data: { returnedQty: { increment: item.quantity } },
      });
      if (claimed.count !== 1) {
        throw new Error("One or more items were already returned by another request. Refresh and try again.");
      }
    }

    const saleReturn = await tx.saleReturn.create({
      data: {
        returnNo: await nextReturnNo(tx, invoice.schoolId),
        invoiceId,
        schoolId: invoice.schoolId,
        mode,
        reason: reason || null,
        totalAmount: dec(totalCredit),
        refundAmount: mode === ReturnMode.RETURN ? dec(totalCredit) : "0.00",
        refundMode: mode === ReturnMode.RETURN ? refundMode : null,
        refundReference: mode === ReturnMode.RETURN ? refundReference || null : null,
        exchangeCreditAmount: mode === ReturnMode.EXCHANGE ? dec(totalCredit) : "0.00",
        processedById: access.userId,
        items: { create: prepared.map(p => ({ invoiceItemId: p.invoiceItemId, productVariantId: p.productVariantId, quantity: p.quantity, unitCredit: dec(p.unitCredit), gstAmount: dec(p.gstAmount), lineCredit: dec(p.lineCredit) })) },
      },
    });

    for (const item of prepared) {
      const stock = await tx.inventoryStock.findUnique({ where: { schoolId_productVariantId: { schoolId: invoice.schoolId, productVariantId: item.productVariantId } }, select: { quantity: true } });
      const beforeQty = stock?.quantity ?? 0;
      await tx.inventoryStock.upsert({
        where: { schoolId_productVariantId: { schoolId: invoice.schoolId, productVariantId: item.productVariantId } },
        create: { schoolId: invoice.schoolId, productVariantId: item.productVariantId, quantity: item.quantity, reorderLevel: 0 },
        update: { quantity: { increment: item.quantity } },
      });
      await tx.stockMovement.create({ data: { schoolId: invoice.schoolId, productVariantId: item.productVariantId, type: StockMovementType.SALE_RETURN, quantity: item.quantity, beforeQty, afterQty: beforeQty + item.quantity, referenceType: "SALE_RETURN", referenceId: saleReturn.id, note: `${mode === ReturnMode.EXCHANGE ? "Exchange" : "Return"} ${saleReturn.returnNo} against ${invoice.invoiceNo}`, createdById: access.userId } });
    }

    const allItems = await tx.invoiceItem.findMany({
      where: { invoiceId },
      select: { quantity: true, returnedQty: true },
    });
    const fullyReturned = allItems.every(i => i.returnedQty >= i.quantity);
    if (fullyReturned) await tx.invoice.update({ where: { id: invoiceId }, data: { status: InvoiceStatus.RETURNED } });

    await writeAuditLog(tx, { userId: access.userId, schoolId: invoice.schoolId, action: mode === ReturnMode.EXCHANGE ? "EXCHANGE" : "RETURN", entity: "INVOICE", entityId: invoiceId, newData: { returnNo: saleReturn.returnNo, totalCredit, mode } });
    await notifySchoolUsers(tx, { schoolId: invoice.schoolId, type: NotificationType.RETURN, title: mode === ReturnMode.EXCHANGE ? "Exchange processed" : "Return processed", message: `${saleReturn.returnNo} for ${invoice.invoiceNo} · ₹${totalCredit.toFixed(2)}`, href: `/invoices/${invoiceId}` });
    return saleReturn;
  }, { timeout: 15000, maxWait: 5000 });

  revalidatePath(`/invoices/${invoiceId}`); revalidatePath("/invoices"); revalidatePath("/inventory"); revalidatePath("/inventory/movements"); revalidatePath("/notifications");
  redirect(`/invoices/${invoiceId}?return=${result.returnNo}`);
}
