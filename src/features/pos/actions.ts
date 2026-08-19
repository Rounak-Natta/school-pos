"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  InvoiceStatus,
  NotificationType,
  PaymentMode,
  ReturnMode,
  RoleName,
  StockMovementType,
  type Prisma,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { notifySchoolUsers } from "@/features/notifications/notification-service";
import { nextSchoolInvoiceNo } from "@/features/pos/invoice-number";
import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, resolveAccessibleSchoolId } from "@/lib/rbac";

const MAX_ITEMS = 50;
const MAX_QTY_PER_LINE = 9999;

type PosSearchResult = {
  inventoryStockId: string; productVariantId: string; code: string; barcode: string; productName: string; category: string;
  className: string; sectionName: string; size: string; color: string; unit: string; salePrice: number; gstRate: number; stockQty: number;
};
type CollectedItem = { inventoryStockId: string; quantity: number };
type PreparedInvoiceItem = {
  inventoryStockId: string; productVariantId: string; quantity: number; unitPrice: number; taxableAmount: number;
  discountAmount: number; gstRate: number; gstAmount: number; lineTotal: number; productLabel: string;
};
type StockWithProduct = Prisma.InventoryStockGetPayload<{ include: { productVariant: { include: { product: true } } } }>;

const clean = (value: FormDataEntryValue | string | null | undefined) => String(value ?? "").trim();
const normalizeSearch = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const toDecimalString = (value: number) => roundMoney(value).toFixed(2);

function parseMoneyInput(value: FormDataEntryValue | null, fieldName: string, fallback = 0) {
  const raw = clean(value); if (!raw) return fallback; const amount = Number(raw);
  if (!Number.isFinite(amount)) throw new Error(`${fieldName} must be a valid number.`);
  return roundMoney(amount);
}
function parsePositiveInteger(value: string, fieldName: string) {
  const n = Number(value); if (!Number.isInteger(n) || n <= 0 || n > MAX_QTY_PER_LINE) throw new Error(`${fieldName} must be a whole number between 1 and ${MAX_QTY_PER_LINE}.`); return n;
}
function resolvePaymentMode(value: string): PaymentMode {
  if (!Object.values(PaymentMode).includes(value as PaymentMode)) throw new Error("Valid payment mode is required.");
  return value as PaymentMode;
}
function getInvoiceStatus(payableAmount: number, paidAmount: number) {
  if (payableAmount <= 0 || paidAmount >= payableAmount) return InvoiceStatus.PAID;
  if (paidAmount > 0) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.DRAFT;
}
function getProductLabel(stock: StockWithProduct) {
  const v = stock.productVariant;
  const parts = [v.className ? `Class ${v.className}` : "", v.sectionName ? `Sec ${v.sectionName}` : "", v.size, v.color].map(clean).filter(Boolean);
  return parts.length ? `${v.product.name} - ${parts.join(", ")}` : v.product.name;
}
function collectFormItems(formData: FormData): CollectedItem[] {
  const map = new Map<string, number>();
  for (let i = 0; i < MAX_ITEMS; i++) {
    const id = clean(formData.get(`inventoryStockId_${i}`)); const rawQty = clean(formData.get(`quantity_${i}`));
    if (!id && !rawQty) continue; if (!id) throw new Error(`Product is missing in row ${i + 1}.`);
    const qty = parsePositiveInteger(rawQty, `Quantity in row ${i + 1}`); map.set(id, (map.get(id) ?? 0) + qty);
  }
  const items = Array.from(map, ([inventoryStockId, quantity]) => ({ inventoryStockId, quantity }));
  if (!items.length) throw new Error("Add at least one product."); return items;
}

async function prepareInvoiceItemsInsideTransaction(tx: Prisma.TransactionClient, schoolId: string, items: CollectedItem[]) {
  const stockIds = items.map(i => i.inventoryStockId);
  const stocks = await tx.inventoryStock.findMany({
    where: { id: { in: stockIds }, schoolId, quantity: { gt: 0 }, productVariant: { isActive: true, product: { isActive: true, deletedAt: null } } },
    include: { productVariant: { include: { product: true } } },
  });
  if (stocks.length !== stockIds.length) throw new Error("One or more selected products are invalid or out of stock.");
  const byId = new Map(stocks.map(s => [s.id, s]));
  return items.map(item => {
    const stock = byId.get(item.inventoryStockId); if (!stock) throw new Error("Selected product stock was not found.");
    if (item.quantity > stock.quantity) throw new Error(`${getProductLabel(stock)} has only ${stock.quantity} stock available.`);
    const unitPrice = roundMoney(Number(stock.productVariant.salePrice)); const gstRate = roundMoney(Number(stock.productVariant.gstRate));
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`${getProductLabel(stock)} has an invalid sale price.`);
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) throw new Error(`${getProductLabel(stock)} has an invalid GST rate.`);
    const taxableAmount = roundMoney(unitPrice * item.quantity); const gstAmount = roundMoney(taxableAmount * gstRate / 100); const lineTotal = roundMoney(taxableAmount + gstAmount);
    return { inventoryStockId: stock.id, productVariantId: stock.productVariantId, quantity: item.quantity, unitPrice, taxableAmount, discountAmount: 0, gstRate, gstAmount, lineTotal, productLabel: getProductLabel(stock) } satisfies PreparedInvoiceItem;
  });
}

export async function searchPosProductsAction(input: { schoolId: string; code: string }): Promise<PosSearchResult[]> {
  const access = await getAccessScope();
  const schoolId = await resolveAccessibleSchoolId({ postedSchoolId: clean(input.schoolId), access, permission: Permission.POS_BILLING });
  const searchText = normalizeSearch(clean(input.code)); const normalizedCode = normalizeCode(searchText); if (!searchText) return [];
  const stocks = await prisma.inventoryStock.findMany({
    where: { schoolId, quantity: { gt: 0 }, productVariant: { isActive: true, product: { isActive: true, deletedAt: null }, OR: [
      { sku: { contains: normalizedCode, mode: "insensitive" } }, { barcode: { contains: searchText, mode: "insensitive" } }, { className: { contains: searchText, mode: "insensitive" } }, { sectionName: { contains: searchText, mode: "insensitive" } }, { size: { contains: searchText, mode: "insensitive" } }, { color: { contains: searchText, mode: "insensitive" } }, { product: { name: { contains: searchText, mode: "insensitive" } } }, { product: { category: { contains: searchText, mode: "insensitive" } } },
    ] } },
    include: { productVariant: { include: { product: true } } }, take: 30,
  });
  return stocks.map(stock => ({ inventoryStockId: stock.id, productVariantId: stock.productVariantId, code: stock.productVariant.sku || "", barcode: stock.productVariant.barcode || "", productName: stock.productVariant.product.name, category: stock.productVariant.product.category || "", className: stock.productVariant.className || "", sectionName: stock.productVariant.sectionName || "", size: stock.productVariant.size || "", color: stock.productVariant.color || "", unit: stock.productVariant.unit, salePrice: Number(stock.productVariant.salePrice), gstRate: Number(stock.productVariant.gstRate), stockQty: stock.quantity }));
}

export async function createPosInvoiceAction(formData: FormData): Promise<void> {
  const access = await getAccessScope();
  const schoolId = await resolveAccessibleSchoolId({ postedSchoolId: clean(formData.get("schoolId")), access, permission: Permission.POS_BILLING });
  const studentId = clean(formData.get("studentId"));
  const customerName = clean(formData.get("customerName")); const customerPhone = clean(formData.get("customerPhone")); const customerClassName = clean(formData.get("customerClassName")); const customerSectionName = clean(formData.get("customerSectionName"));
  if (!customerName) throw new Error("Student / customer name is required."); if (!customerPhone) throw new Error("Contact number is required."); if (!customerClassName) throw new Error("Class is required.");
  if (studentId) {
    const student = await prisma.student.findFirst({ where: { id: studentId, schoolId, isActive: true, deletedAt: null }, select: { id: true } });
    if (!student) throw new Error("Selected student is not active in this school.");
  }
  const paymentMode = resolvePaymentMode(clean(formData.get("paymentMode"))); const transactionRef = clean(formData.get("transactionRef")); const note = clean(formData.get("note"));
  const discountAmount = parseMoneyInput(formData.get("discountAmount"), "Discount", 0); if (discountAmount < 0) throw new Error("Discount cannot be negative.");
  const exchangeReturnNo = clean(formData.get("exchangeReturnNo")); const collectedItems = collectFormItems(formData);

  const { invoiceId } = await prisma.$transaction(async tx => {
    const invoiceItems = await prepareInvoiceItemsInsideTransaction(tx, schoolId, collectedItems);
    const subtotalAmount = roundMoney(invoiceItems.reduce((s, i) => s + i.taxableAmount, 0));
    const gstAmount = roundMoney(invoiceItems.reduce((s, i) => s + i.gstAmount, 0));
    const totalAmount = roundMoney(subtotalAmount + gstAmount);
    if (discountAmount > totalAmount) throw new Error("Discount cannot be greater than total amount.");

    let exchangeCreditAmount = 0; let exchangeReturnId: string | null = null;
    if (exchangeReturnNo) {
      const exchangeReturn = await tx.saleReturn.findUnique({ where: { returnNo: exchangeReturnNo }, include: { exchangeInvoice: { select: { id: true, invoiceNo: true } } } });
      if (!exchangeReturn || exchangeReturn.mode !== ReturnMode.EXCHANGE) throw new Error("Exchange credit reference is invalid.");
      if (exchangeReturn.schoolId !== schoolId) throw new Error("Exchange credit belongs to a different school.");
      if (exchangeReturn.exchangeInvoice) throw new Error(`Exchange credit was already used on ${exchangeReturn.exchangeInvoice.invoiceNo}.`);
      exchangeCreditAmount = roundMoney(Number(exchangeReturn.exchangeCreditAmount)); exchangeReturnId = exchangeReturn.id;
      if (exchangeCreditAmount <= 0) throw new Error("Exchange credit has no available value.");
      if (exchangeCreditAmount > roundMoney(totalAmount - discountAmount)) throw new Error(`Replacement bill must be at least ₹${exchangeCreditAmount.toFixed(2)} after discount to use this exchange credit.`);
    }

    const payableAmount = roundMoney(totalAmount - discountAmount - exchangeCreditAmount);
    const postedPaid = clean(formData.get("paidAmount")); const paidAmount = postedPaid ? parseMoneyInput(formData.get("paidAmount"), "Paid amount", payableAmount) : payableAmount;
    if (paidAmount < 0 || paidAmount > payableAmount) throw new Error("Paid amount must be between 0 and final payable amount after exchange credit.");
    const balanceAmount = roundMoney(payableAmount - paidAmount); const status = getInvoiceStatus(payableAmount, paidAmount);
    const invoiceNo = await nextSchoolInvoiceNo(tx, schoolId);
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo, schoolId, studentId: studentId || null, status, customerName, customerPhone, customerClassName, customerSectionName: customerSectionName || null,
        subtotalAmount: toDecimalString(subtotalAmount), gstAmount: toDecimalString(gstAmount), totalAmount: toDecimalString(totalAmount), discountAmount: toDecimalString(discountAmount), exchangeCreditAmount: toDecimalString(exchangeCreditAmount), exchangeReturnId,
        payableAmount: toDecimalString(payableAmount), paidAmount: toDecimalString(paidAmount), balanceAmount: toDecimalString(balanceAmount), note: note || null, billedById: access.userId,
        items: { create: invoiceItems.map(i => ({ productVariantId: i.productVariantId, quantity: i.quantity, unitPrice: toDecimalString(i.unitPrice), discountAmount: "0.00", taxableAmount: toDecimalString(i.taxableAmount), gstRate: toDecimalString(i.gstRate), gstAmount: toDecimalString(i.gstAmount), lineTotal: toDecimalString(i.lineTotal) })) },
        payments: paidAmount > 0 ? { create: { mode: paymentMode, amount: toDecimalString(paidAmount), transactionRef: transactionRef || null, receivedById: access.userId } } : undefined,
      }, select: { id: true, invoiceNo: true },
    });

    for (const item of invoiceItems) {
      const before = await tx.inventoryStock.findUnique({ where: { id: item.inventoryStockId }, select: { quantity: true, reorderLevel: true } });
      if (!before) throw new Error(`${item.productLabel} stock was not found.`);
      const result = await tx.inventoryStock.updateMany({ where: { id: item.inventoryStockId, schoolId, productVariantId: item.productVariantId, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } });
      if (result.count !== 1) throw new Error(`${item.productLabel} does not have enough stock anymore. Refresh and try again.`);
      const afterQty = before.quantity - item.quantity;
      await tx.stockMovement.create({ data: { schoolId, productVariantId: item.productVariantId, type: StockMovementType.SALE, quantity: -item.quantity, beforeQty: before.quantity, afterQty, referenceType: "INVOICE", referenceId: invoice.id, note: `POS sale ${invoice.invoiceNo} by ${access.email}`, createdById: access.userId } });
      if (afterQty <= before.reorderLevel) await notifySchoolUsers(tx, { schoolId, type: NotificationType.LOW_STOCK, title: "Low stock alert", message: `${item.productLabel} has ${afterQty} left (reorder level ${before.reorderLevel}).`, href: "/inventory", roles: [RoleName.SUPER_ADMIN, RoleName.SCHOOL_ADMIN, RoleName.INVENTORY_MANAGER] });
    }
    await writeAuditLog(tx, { userId: access.userId, schoolId, action: "CREATE", entity: "INVOICE", entityId: invoice.id, newData: { invoiceNo: invoice.invoiceNo, subtotalAmount, gstAmount, totalAmount, discountAmount, exchangeCreditAmount, payableAmount, paidAmount, studentId: studentId || null } });
    return { invoiceId: invoice.id };
  }, { timeout: 15000, maxWait: 5000 });

  ["/pos", "/products", "/inventory", "/inventory/movements", "/invoices", "/dashboard", "/notifications"].forEach((path) => revalidatePath(path));
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}`);
}
