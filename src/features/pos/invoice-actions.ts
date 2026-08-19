"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  InvoiceStatus,
  NotificationType,
  PaymentMode,
  RoleName,
  StockMovementType,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { notifySchoolUsers } from "@/features/notifications/notification-service";
import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, requirePermission } from "@/lib/rbac";

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim();
const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const dec = (value: number) => roundMoney(value).toFixed(2);

function resolvePaymentMode(value: string): PaymentMode {
  if (!Object.values(PaymentMode).includes(value as PaymentMode)) {
    throw new Error("Valid payment mode is required.");
  }
  return value as PaymentMode;
}

function revalidateInvoiceViews(invoiceId: string) {
  [
    `/invoices/${invoiceId}`,
    "/invoices",
    "/dashboard",
    "/analytics",
    "/reports",
    "/reports/sales",
    "/reports/payments",
    "/reports/schools",
    "/reports/cashiers",
    "/inventory",
    "/inventory/movements",
    "/notifications",
    "/audit-logs",
  ].forEach((path) => revalidatePath(path));
}

export async function addInvoicePaymentAction(formData: FormData): Promise<void> {
  const access = await getAccessScope();
  const invoiceId = clean(formData.get("invoiceId"));
  const amount = roundMoney(Number(clean(formData.get("amount"))));
  const mode = resolvePaymentMode(clean(formData.get("mode")));
  const transactionRef = clean(formData.get("transactionRef"));

  if (!invoiceId) throw new Error("Invoice is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than 0.");
  }

  const invoiceForAccess = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      schoolId: true,
      invoiceNo: true,
      status: true,
      balanceAmount: true,
    },
  });
  if (!invoiceForAccess) throw new Error("Invoice not found.");
  requirePermission(access, Permission.RECEIVE_PAYMENT, invoiceForAccess.schoolId);

  if (
    invoiceForAccess.status === InvoiceStatus.CANCELLED ||
    invoiceForAccess.status === InvoiceStatus.RETURNED
  ) {
    throw new Error("Payments cannot be added to a cancelled or returned invoice.");
  }
  if (Number(invoiceForAccess.balanceAmount) <= 0) {
    throw new Error("This invoice has no remaining balance.");
  }

  await prisma.$transaction(
    async (tx) => {
      // The balance condition is part of the UPDATE itself so two users cannot
      // collect more than the outstanding amount at the same time.
      const claimed = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          schoolId: invoiceForAccess.schoolId,
          status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.PARTIALLY_PAID] },
          balanceAmount: { gte: dec(amount) },
        },
        data: {
          paidAmount: { increment: dec(amount) },
          balanceAmount: { decrement: dec(amount) },
        },
      });

      if (claimed.count !== 1) {
        throw new Error(
          "The invoice balance changed or the payment is greater than the remaining balance. Refresh and try again.",
        );
      }

      const refreshed = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: { paidAmount: true, balanceAmount: true, status: true },
      });
      const remaining = roundMoney(Number(refreshed.balanceAmount));
      const nextStatus =
        remaining <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      if (refreshed.status !== nextStatus || remaining < 0.005) {
        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            status: nextStatus,
            ...(remaining < 0.005 ? { balanceAmount: "0.00" } : {}),
          },
        });
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId,
          mode,
          amount: dec(amount),
          transactionRef: transactionRef || null,
          receivedById: access.userId,
        },
        select: { id: true, amount: true },
      });

      await writeAuditLog(tx, {
        userId: access.userId,
        schoolId: invoiceForAccess.schoolId,
        action: "RECEIVE_PAYMENT",
        entity: "INVOICE",
        entityId: invoiceId,
        oldData: {
          balanceAmount: Number(invoiceForAccess.balanceAmount),
          status: invoiceForAccess.status,
        },
        newData: {
          paymentId: payment.id,
          mode,
          amount,
          transactionRef: transactionRef || null,
          paidAmount: Number(refreshed.paidAmount),
          balanceAmount: Math.max(0, remaining),
          status: nextStatus,
        },
      });

      await notifySchoolUsers(tx, {
        schoolId: invoiceForAccess.schoolId,
        type: NotificationType.INVOICE,
        title: "Invoice payment received",
        message: `${invoiceForAccess.invoiceNo}: ₹${amount.toFixed(2)} received via ${mode.replaceAll("_", " ")}.`,
        href: `/invoices/${invoiceId}`,
        roles: [
          RoleName.SUPER_ADMIN,
          RoleName.SCHOOL_ADMIN,
          RoleName.ACCOUNTANT,
        ],
      });
    },
    { timeout: 15000, maxWait: 5000 },
  );

  revalidateInvoiceViews(invoiceId);
  redirect(`/invoices/${invoiceId}?payment=received`);
}

export async function cancelInvoiceAction(formData: FormData): Promise<void> {
  const access = await getAccessScope();
  const invoiceId = clean(formData.get("invoiceId"));
  const reason = clean(formData.get("reason"));

  if (!invoiceId) throw new Error("Invoice is required.");
  if (!reason) throw new Error("Cancellation reason is required.");

  const invoiceForAccess = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      schoolId: true,
      invoiceNo: true,
      status: true,
    },
  });
  if (!invoiceForAccess) throw new Error("Invoice not found.");
  requirePermission(access, Permission.CANCEL_INVOICE, invoiceForAccess.schoolId);

  await prisma.$transaction(
    async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: {
            include: {
              productVariant: { include: { product: true } },
            },
          },
          saleReturns: { select: { id: true } },
        },
      });
      if (!invoice) throw new Error("Invoice not found.");

      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new Error("Invoice is already cancelled.");
      }
      if (invoice.status === InvoiceStatus.RETURNED || invoice.saleReturns.length > 0) {
        throw new Error(
          "An invoice with return/exchange history cannot be cancelled. Use the return workflow instead.",
        );
      }

      // Claim cancellation exactly once. The relation guard also prevents a
      // concurrent return from being committed before this cancellation.
      const claimed = await tx.invoice.updateMany({
        where: {
          id: invoiceId,
          status: {
            in: [
              InvoiceStatus.DRAFT,
              InvoiceStatus.PAID,
              InvoiceStatus.PARTIALLY_PAID,
            ],
          },
          saleReturns: { none: {} },
        },
        data: {
          status: InvoiceStatus.CANCELLED,
          cancelledAt: new Date(),
          balanceAmount: "0.00",
          note: invoice.note
            ? `${invoice.note}\nCancellation: ${reason}`
            : `Cancellation: ${reason}`,
        },
      });
      if (claimed.count !== 1) {
        throw new Error(
          "Invoice status changed before cancellation. Refresh and try again.",
        );
      }

      for (const item of invoice.items) {
        const stock = await tx.inventoryStock.findUnique({
          where: {
            schoolId_productVariantId: {
              schoolId: invoice.schoolId,
              productVariantId: item.productVariantId,
            },
          },
          select: { quantity: true },
        });
        const beforeQty = stock?.quantity ?? 0;

        await tx.inventoryStock.upsert({
          where: {
            schoolId_productVariantId: {
              schoolId: invoice.schoolId,
              productVariantId: item.productVariantId,
            },
          },
          create: {
            schoolId: invoice.schoolId,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            reorderLevel: 0,
          },
          update: { quantity: { increment: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            schoolId: invoice.schoolId,
            productVariantId: item.productVariantId,
            type: StockMovementType.SALE_RETURN,
            quantity: item.quantity,
            beforeQty,
            afterQty: beforeQty + item.quantity,
            referenceType: "INVOICE_CANCEL",
            referenceId: invoice.id,
            note: `Cancelled invoice ${invoice.invoiceNo}: ${reason}`,
            createdById: access.userId,
          },
        });
      }

      await writeAuditLog(tx, {
        userId: access.userId,
        schoolId: invoice.schoolId,
        action: "CANCEL",
        entity: "INVOICE",
        entityId: invoice.id,
        oldData: { status: invoice.status },
        newData: {
          status: InvoiceStatus.CANCELLED,
          reason,
          stockRestored: invoice.items.reduce(
            (sum, item) => sum + item.quantity,
            0,
          ),
        },
      });

      await notifySchoolUsers(tx, {
        schoolId: invoice.schoolId,
        type: NotificationType.INVOICE,
        title: "Invoice cancelled",
        message: `${invoice.invoiceNo} was cancelled. Stock was restored automatically.`,
        href: `/invoices/${invoice.id}`,
        roles: [
          RoleName.SUPER_ADMIN,
          RoleName.SCHOOL_ADMIN,
          RoleName.ACCOUNTANT,
          RoleName.INVENTORY_MANAGER,
        ],
      });
    },
    { timeout: 15000, maxWait: 5000 },
  );

  revalidateInvoiceViews(invoiceId);
  redirect(`/invoices/${invoiceId}?cancelled=1`);
}
