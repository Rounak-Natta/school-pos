"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  InvoiceStatus,
  PaymentMode,
  StockMovementType,
  type Prisma,
} from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_ITEMS = 50;

type CurrentDbUser = {
  userId: string | null;
  email: string;
  accessibleSchoolIds: string[];
};

type PosSearchResult = {
  inventoryStockId: string;
  productVariantId: string;
  code: string;
  barcode: string;
  productName: string;
  category: string;
  size: string;
  color: string;
  unit: string;
  salePrice: number;
  stockQty: number;
};

type StockWithProduct = Prisma.InventoryStockGetPayload<{
  include: {
    productVariant: {
      include: {
        product: true;
      };
    };
  };
}>;

type PreparedInvoiceItem = {
  inventoryStockId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  productLabel: string;
};

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

function parseMoneyInput(
  value: FormDataEntryValue | null,
  fieldName: string,
  fallback = 0,
): number {
  const cleaned = clean(value);

  if (!cleaned) {
    return fallback;
  }

  const amount = Number(cleaned);

  if (!Number.isFinite(amount)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return roundMoney(amount);
}

function createInvoiceNo(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = String(now.getTime()).slice(-7);

  return `INV-${datePart}-${timePart}`;
}

function getProductLabel(stock: StockWithProduct): string {
  const product = stock.productVariant.product;
  const variant = stock.productVariant;

  const variantParts = [
    variant.className,
    variant.sectionName,
    variant.size,
    variant.color,
  ].filter(Boolean);

  if (variantParts.length === 0) {
    return product.name;
  }

  return `${product.name} - ${variantParts.join(", ")}`;
}

async function getCurrentDbUser(): Promise<CurrentDbUser> {
  const sessionUser = await requireUser();

  const dbUser = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },
    select: {
      id: true,
      email: true,
    },
  });

  return {
    userId: dbUser?.id ?? null,
    email: dbUser?.email ?? sessionUser.email,
    accessibleSchoolIds: Array.from(
      new Set(sessionUser.roles.map((role) => role.schoolId)),
    ),
  };
}

function resolveSchoolId(input: {
  postedSchoolId: string;
  accessibleSchoolIds: string[];
}): string {
  const { postedSchoolId, accessibleSchoolIds } = input;

  if (postedSchoolId) {
    if (!accessibleSchoolIds.includes(postedSchoolId)) {
      throw new Error("You do not have access to this school.");
    }

    return postedSchoolId;
  }

  if (accessibleSchoolIds.length === 1) {
    return accessibleSchoolIds[0];
  }

  throw new Error("School is required.");
}

function resolvePaymentMode(value: string): PaymentMode {
  if (!Object.values(PaymentMode).includes(value as PaymentMode)) {
    throw new Error("Valid payment mode is required.");
  }

  return value as PaymentMode;
}

function getStatus(input: {
  payableAmount: number;
  paidAmount: number;
}): InvoiceStatus {
  const { payableAmount, paidAmount } = input;

  if (payableAmount <= 0 || paidAmount >= payableAmount) {
    return InvoiceStatus.PAID;
  }

  if (paidAmount > 0) {
    return InvoiceStatus.PARTIALLY_PAID;
  }

  return InvoiceStatus.DRAFT;
}

function collectFormItems(formData: FormData): Array<{
  inventoryStockId: string;
  quantity: number;
}> {
  const itemMap = new Map<string, number>();

  for (let index = 0; index < MAX_ITEMS; index++) {
    const inventoryStockId = clean(formData.get(`inventoryStockId_${index}`));
    const quantity = Number(clean(formData.get(`quantity_${index}`)) || "0");

    if (!inventoryStockId && quantity <= 0) {
      continue;
    }

    if (!inventoryStockId) {
      throw new Error(`Product is missing in row ${index + 1}.`);
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`Quantity must be greater than 0 in row ${index + 1}.`);
    }

    itemMap.set(
      inventoryStockId,
      (itemMap.get(inventoryStockId) ?? 0) + quantity,
    );
  }

  return Array.from(itemMap.entries()).map(([inventoryStockId, quantity]) => ({
    inventoryStockId,
    quantity,
  }));
}

async function prepareInvoiceItems(input: {
  schoolId: string;
  items: Array<{
    inventoryStockId: string;
    quantity: number;
  }>;
}): Promise<PreparedInvoiceItem[]> {
  const { schoolId, items } = input;

  if (items.length === 0) {
    throw new Error("Add at least one product.");
  }

  const stockIds = items.map((item) => item.inventoryStockId);

  const stocks = await prisma.inventoryStock.findMany({
    where: {
      id: {
        in: stockIds,
      },
      schoolId,
      productVariant: {
        isActive: true,
        product: {
          isActive: true,
          deletedAt: null,
        },
      },
    },
    include: {
      productVariant: {
        include: {
          product: true,
        },
      },
    },
  });

  if (stocks.length !== stockIds.length) {
    throw new Error("One or more products are not valid for this school.");
  }

  const stockById = new Map<string, StockWithProduct>(
    stocks.map((stock) => [stock.id, stock]),
  );

  return items.map((item) => {
    const stock = stockById.get(item.inventoryStockId);

    if (!stock) {
      throw new Error("Selected product stock not found.");
    }

    if (item.quantity > stock.quantity) {
      throw new Error(
        `${getProductLabel(stock)} has only ${stock.quantity} stock.`,
      );
    }

    const unitPrice = roundMoney(Number(stock.productVariant.salePrice));
    const lineTotal = roundMoney(unitPrice * item.quantity);

    return {
      inventoryStockId: stock.id,
      productVariantId: stock.productVariantId,
      quantity: item.quantity,
      unitPrice,
      discountAmount: 0,
      lineTotal,
      productLabel: getProductLabel(stock),
    };
  });
}

export async function searchPosProductsAction(input: {
  schoolId: string;
  code: string;
}): Promise<PosSearchResult[]> {
  const { accessibleSchoolIds } = await getCurrentDbUser();

  const schoolId = resolveSchoolId({
    postedSchoolId: clean(input.schoolId),
    accessibleSchoolIds,
  });

  const searchCode = clean(input.code);
  const normalizedCode = normalizeCode(searchCode);

  if (!normalizedCode) {
    return [];
  }

  const stocks = await prisma.inventoryStock.findMany({
    where: {
      schoolId,
      quantity: {
        gt: 0,
      },
      productVariant: {
        isActive: true,
        product: {
          isActive: true,
          deletedAt: null,
        },
        OR: [
          {
            sku: {
              contains: normalizedCode,
              mode: "insensitive",
            },
          },
          {
            barcode: {
              contains: searchCode,
              mode: "insensitive",
            },
          },
        ],
      },
    },
    include: {
      productVariant: {
        include: {
          product: true,
        },
      },
    },
    orderBy: [
      {
        productVariant: {
          sku: "asc",
        },
      },
    ],
    take: 20,
  });

  return stocks.map((stock) => {
    const variant = stock.productVariant;
    const product = variant.product;

    return {
      inventoryStockId: stock.id,
      productVariantId: variant.id,
      code: variant.sku || "",
      barcode: variant.barcode || "",
      productName: product.name,
      category: product.category || "",
      size: variant.size || "",
      color: variant.color || "",
      unit: variant.unit,
      salePrice: Number(variant.salePrice),
      stockQty: stock.quantity,
    };
  });
}

export async function createPosInvoiceAction(
  formData: FormData,
): Promise<void> {
  const { userId, email, accessibleSchoolIds } = await getCurrentDbUser();

  const schoolId = resolveSchoolId({
    postedSchoolId: clean(formData.get("schoolId")),
    accessibleSchoolIds,
  });

  const customerName = clean(formData.get("customerName"));
  const customerPhone = clean(formData.get("customerPhone"));
  const customerClassName = clean(formData.get("customerClassName"));
  const customerSectionName = clean(formData.get("customerSectionName"));

  if (!customerName) {
    throw new Error("Customer name is required.");
  }

  const paymentMode = resolvePaymentMode(clean(formData.get("paymentMode")));
  const transactionRef = clean(formData.get("transactionRef"));
  const note = clean(formData.get("note"));

  const discountAmount = parseMoneyInput(
    formData.get("discountAmount"),
    "Discount",
    0,
  );

  if (discountAmount < 0) {
    throw new Error("Discount cannot be negative.");
  }

  const collectedItems = collectFormItems(formData);

  const invoiceItems = await prepareInvoiceItems({
    schoolId,
    items: collectedItems,
  });

  const totalAmount = roundMoney(
    invoiceItems.reduce((total, item) => total + item.lineTotal, 0),
  );

  if (discountAmount > totalAmount) {
    throw new Error("Discount cannot be greater than total amount.");
  }

  const payableAmount = roundMoney(totalAmount - discountAmount);

  const postedPaidAmount = clean(formData.get("paidAmount"));

  const paidAmount = postedPaidAmount
    ? parseMoneyInput(formData.get("paidAmount"), "Paid amount", payableAmount)
    : payableAmount;

  if (paidAmount < 0) {
    throw new Error("Paid amount cannot be negative.");
  }

  if (paidAmount > payableAmount) {
    throw new Error("Paid amount cannot be greater than payable amount.");
  }

  const balanceAmount = roundMoney(payableAmount - paidAmount);

  const status = getStatus({
    payableAmount,
    paidAmount,
  });

  const invoiceId = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo: createInvoiceNo(),
        schoolId,
        studentId: null,
        status,

        customerName,
        customerPhone: customerPhone || null,
        customerClassName: customerClassName || null,
        customerSectionName: customerSectionName || null,

        totalAmount: toMoney(totalAmount),
        discountAmount: toMoney(discountAmount),
        payableAmount: toMoney(payableAmount),
        paidAmount: toMoney(paidAmount),
        balanceAmount: toMoney(balanceAmount),

        note: note || null,
        billedById: userId,

        items: {
          create: invoiceItems.map((item) => ({
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            unitPrice: toMoney(item.unitPrice),
            discountAmount: toMoney(item.discountAmount),
            lineTotal: toMoney(item.lineTotal),
          })),
        },

        payments:
          paidAmount > 0
            ? {
                create: {
                  mode: paymentMode,
                  amount: toMoney(paidAmount),
                  transactionRef: transactionRef || null,
                  receivedById: userId,
                },
              }
            : undefined,
      },
      select: {
        id: true,
      },
    });

    for (const item of invoiceItems) {
      const updateResult = await tx.inventoryStock.updateMany({
        where: {
          id: item.inventoryStockId,
          schoolId,
          quantity: {
            gte: item.quantity,
          },
        },
        data: {
          quantity: {
            decrement: item.quantity,
          },
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(`${item.productLabel} does not have enough stock.`);
      }

      const updatedStock = await tx.inventoryStock.findUnique({
        where: {
          id: item.inventoryStockId,
        },
        select: {
          quantity: true,
        },
      });

      if (!updatedStock) {
        throw new Error("Updated stock not found.");
      }

      const afterQty = updatedStock.quantity;
      const beforeQty = afterQty + item.quantity;

      await tx.stockMovement.create({
        data: {
          schoolId,
          productVariantId: item.productVariantId,
          type: StockMovementType.SALE,
          quantity: -item.quantity,
          beforeQty,
          afterQty,
          referenceType: "INVOICE",
          referenceId: invoice.id,
          note: `POS sale by ${email}`,
          createdById: userId,
        },
      });
    }

    return invoice.id;
  });

  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

  redirect(`/invoices/${invoiceId}`);
}