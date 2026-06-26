"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  InvoiceStatus,
  PaymentMode,
  StockMovementType,
} from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_ITEMS = 50;

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function toMoney(value: number): string {
  return value.toFixed(2);
}

function createInvoiceNo(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const timePart = String(now.getTime()).slice(-7);

  return `INV-${datePart}-${timePart}`;
}

async function getCurrentDbUser(): Promise<{
  userId: string | null;
  email: string;
  accessibleSchoolIds: string[];
}> {
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
      new Set(sessionUser.roles.map((role) => role.schoolId))
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

export async function searchPosProductsAction(input: {
  schoolId: string;
  code: string;
}): Promise<
  Array<{
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
  }>
> {
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
  formData: FormData
): Promise<void> {
  const { userId, email, accessibleSchoolIds } = await getCurrentDbUser();

  const schoolId = resolveSchoolId({
    postedSchoolId: clean(formData.get("schoolId")),
    accessibleSchoolIds,
  });

  const paymentModeValue = clean(formData.get("paymentMode"));
  const discountAmount = Number(clean(formData.get("discountAmount")) || "0");
  const note = clean(formData.get("note"));

  if (!Object.values(PaymentMode).includes(paymentModeValue as PaymentMode)) {
    throw new Error("Valid payment mode is required.");
  }

  if (!Number.isFinite(discountAmount) || discountAmount < 0) {
    throw new Error("Discount cannot be negative.");
  }

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
      (itemMap.get(inventoryStockId) ?? 0) + quantity
    );
  }

  const items = Array.from(itemMap.entries()).map(
    ([inventoryStockId, quantity]) => ({
      inventoryStockId,
      quantity,
    })
  );

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

  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));

  const invoiceItems = items.map((item) => {
    const stock = stockById.get(item.inventoryStockId);

    if (!stock) {
      throw new Error("Selected product stock not found.");
    }

    if (item.quantity > stock.quantity) {
      throw new Error(
        `${stock.productVariant.product.name} / ${
          stock.productVariant.sku || "NO-CODE"
        } has only ${stock.quantity} stock.`
      );
    }

    const unitPrice = Number(stock.productVariant.salePrice);
    const lineTotal = unitPrice * item.quantity;

    return {
      productVariantId: stock.productVariantId,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      stock,
    };
  });

  const totalAmount = invoiceItems.reduce(
    (total, item) => total + item.lineTotal,
    0
  );

  if (discountAmount > totalAmount) {
    throw new Error("Discount cannot be greater than total amount.");
  }

  const payableAmount = totalAmount - discountAmount;
  const paidAmount = payableAmount;
  const balanceAmount = 0;

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo: createInvoiceNo(),
        schoolId,
        studentId: null,
        status: InvoiceStatus.PAID,

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
            discountAmount: "0.00",
            lineTotal: toMoney(item.lineTotal),
          })),
        },

        payments: {
          create: {
            mode: paymentModeValue as PaymentMode,
            amount: toMoney(paidAmount),
            receivedById: userId,
          },
        },
      },
      select: {
        id: true,
      },
    });

    for (const item of invoiceItems) {
      const beforeQty = item.stock.quantity;
      const afterQty = beforeQty - item.quantity;

      await tx.inventoryStock.update({
        where: {
          id: item.stock.id,
        },
        data: {
          quantity: afterQty,
        },
      });

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
  });

  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/invoices");

  redirect("/invoices");
}