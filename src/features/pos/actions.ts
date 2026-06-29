"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  InvoiceStatus,
  PaymentMode,
  RoleName,
  StockMovementType,
  type Prisma,
} from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_ITEMS = 50;
const MAX_QTY_PER_LINE = 9999;

type PosSearchResult = {
  inventoryStockId: string;
  productVariantId: string;
  code: string;
  barcode: string;
  productName: string;
  category: string;
  className: string;
  sectionName: string;
  size: string;
  color: string;
  unit: string;
  salePrice: number;
  stockQty: number;
};

type AccessScope = {
  userId: string | null;
  email: string;
  isSuperAdmin: boolean;
  schoolIds: string[];
};

type CollectedItem = {
  inventoryStockId: string;
  quantity: number;
};

type PreparedInvoiceItem = {
  inventoryStockId: string;
  productVariantId: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
  productLabel: string;
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

function clean(value: FormDataEntryValue | string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDecimalString(value: number): string {
  return roundMoney(value).toFixed(2);
}

function parseMoneyInput(
  value: FormDataEntryValue | null,
  fieldName: string,
  fallback = 0,
): number {
  const rawValue = clean(value);

  if (!rawValue) {
    return fallback;
  }

  const amount = Number(rawValue);

  if (!Number.isFinite(amount)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  return roundMoney(amount);
}

function parsePositiveInteger(value: string, fieldName: string): number {
  const numberValue = Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue <= 0 ||
    numberValue > MAX_QTY_PER_LINE
  ) {
    throw new Error(
      `${fieldName} must be a whole number between 1 and ${MAX_QTY_PER_LINE}.`,
    );
  }

  return numberValue;
}

function createInvoiceNo(): string {
  const now = new Date();

  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replace(/-/g, "");

  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(/\D/g, "");

  const randomPart = String(randomInt(1000, 9999));

  return `INV-${datePart}-${timePart}${randomPart}`;
}

function resolvePaymentMode(value: string): PaymentMode {
  if (!Object.values(PaymentMode).includes(value as PaymentMode)) {
    throw new Error("Valid payment mode is required.");
  }

  return value as PaymentMode;
}

function getInvoiceStatus(input: {
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

function getProductLabel(stock: StockWithProduct): string {
  const product = stock.productVariant.product;
  const variant = stock.productVariant;

  const variantParts = [
    variant.className ? `Class ${variant.className}` : "",
    variant.sectionName ? `Sec ${variant.sectionName}` : "",
    variant.size,
    variant.color,
  ]
    .map((value) => clean(value))
    .filter(Boolean);

  return variantParts.length > 0
    ? `${product.name} - ${variantParts.join(", ")}`
    : product.name;
}

async function getAccessScope(): Promise<AccessScope> {
  const sessionUser = await requireUser();

  const dbUser = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },
    select: {
      id: true,
      email: true,
      schoolRoles: {
        where: {
          isActive: true,
          school: {
            isActive: true,
          },
        },
        select: {
          schoolId: true,
          role: true,
        },
      },
    },
  });

  const dbRoles = dbUser?.schoolRoles ?? [];
  const sessionRoles = sessionUser.roles ?? [];

  const roles =
    dbRoles.length > 0
      ? dbRoles
      : sessionRoles
          .filter((role) => Boolean(role.schoolId))
          .map((role) => ({
            schoolId: role.schoolId,
            role: role.role,
          }));

  const isSuperAdmin = roles.some(
    (role) =>
      role.role === RoleName.SUPER_ADMIN || String(role.role) === "SUPER_ADMIN",
  );

  const schoolIds = Array.from(
    new Set(
      roles
        .map((role) => role.schoolId)
        .filter((schoolId): schoolId is string => Boolean(schoolId)),
    ),
  );

  return {
    userId: dbUser?.id ?? sessionUser.id ?? null,
    email: dbUser?.email ?? sessionUser.email ?? "unknown-user",
    isSuperAdmin,
    schoolIds,
  };
}

async function resolveSchoolId(input: {
  postedSchoolId: string;
  access: AccessScope;
}): Promise<string> {
  const { postedSchoolId, access } = input;

  if (!postedSchoolId) {
    if (!access.isSuperAdmin && access.schoolIds.length === 1) {
      return access.schoolIds[0];
    }

    throw new Error("School is required.");
  }

  const school = await prisma.school.findFirst({
    where: {
      id: postedSchoolId,
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
    },
  });

  if (!school) {
    throw new Error("You do not have access to this school.");
  }

  return school.id;
}

function collectFormItems(formData: FormData): CollectedItem[] {
  const itemMap = new Map<string, number>();

  for (let index = 0; index < MAX_ITEMS; index++) {
    const inventoryStockId = clean(formData.get(`inventoryStockId_${index}`));
    const rawQuantity = clean(formData.get(`quantity_${index}`));

    if (!inventoryStockId && !rawQuantity) {
      continue;
    }

    if (!inventoryStockId) {
      throw new Error(`Product is missing in row ${index + 1}.`);
    }

    const quantity = parsePositiveInteger(rawQuantity, `Quantity in row ${index + 1}`);

    itemMap.set(
      inventoryStockId,
      (itemMap.get(inventoryStockId) ?? 0) + quantity,
    );
  }

  const items = Array.from(itemMap.entries()).map(
    ([inventoryStockId, quantity]) => ({
      inventoryStockId,
      quantity,
    }),
  );

  if (items.length === 0) {
    throw new Error("Add at least one product.");
  }

  if (items.length > MAX_ITEMS) {
    throw new Error(`Only ${MAX_ITEMS} products can be billed at once.`);
  }

  return items;
}

async function prepareInvoiceItemsInsideTransaction(input: {
  tx: Prisma.TransactionClient;
  schoolId: string;
  items: CollectedItem[];
}): Promise<PreparedInvoiceItem[]> {
  const { tx, schoolId, items } = input;
  const stockIds = items.map((item) => item.inventoryStockId);

  const stocks = await tx.inventoryStock.findMany({
    where: {
      id: {
        in: stockIds,
      },
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
    throw new Error("One or more selected products are invalid or out of stock.");
  }

  const stockById = new Map<string, StockWithProduct>(
    stocks.map((stock) => [stock.id, stock]),
  );

  return items.map((item) => {
    const stock = stockById.get(item.inventoryStockId);

    if (!stock) {
      throw new Error("Selected product stock was not found.");
    }

    if (item.quantity > stock.quantity) {
      throw new Error(
        `${getProductLabel(stock)} has only ${stock.quantity} stock available.`,
      );
    }

    const unitPrice = roundMoney(Number(stock.productVariant.salePrice));

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error(`${getProductLabel(stock)} has an invalid sale price.`);
    }

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
  const access = await getAccessScope();

  const schoolId = await resolveSchoolId({
    postedSchoolId: clean(input.schoolId),
    access,
  });

  const searchText = normalizeSearch(clean(input.code));
  const normalizedCode = normalizeCode(searchText);

  if (!searchText) {
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
              contains: searchText,
              mode: "insensitive",
            },
          },
          {
            className: {
              contains: searchText,
              mode: "insensitive",
            },
          },
          {
            sectionName: {
              contains: searchText,
              mode: "insensitive",
            },
          },
          {
            size: {
              contains: searchText,
              mode: "insensitive",
            },
          },
          {
            color: {
              contains: searchText,
              mode: "insensitive",
            },
          },
          {
            product: {
              name: {
                contains: searchText,
                mode: "insensitive",
              },
            },
          },
          {
            product: {
              category: {
                contains: searchText,
                mode: "insensitive",
              },
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
          product: {
            name: "asc",
          },
        },
      },
      {
        productVariant: {
          sku: "asc",
        },
      },
    ],
    take: 30,
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
      className: variant.className || "",
      sectionName: variant.sectionName || "",
      size: variant.size || "",
      color: variant.color || "",
      unit: variant.unit,
      salePrice: Number(variant.salePrice),
      stockQty: stock.quantity,
    };
  });
}

export async function createPosInvoiceAction(formData: FormData): Promise<void> {
  const access = await getAccessScope();

  const schoolId = await resolveSchoolId({
    postedSchoolId: clean(formData.get("schoolId")),
    access,
  });

  const customerName = clean(formData.get("customerName"));
  const customerPhone = clean(formData.get("customerPhone"));
  const customerClassName = clean(formData.get("customerClassName"));
  const customerSectionName = clean(formData.get("customerSectionName"));
  const transactionRef = clean(formData.get("transactionRef"));
  const note = clean(formData.get("note"));

  if (!customerName) {
    throw new Error("Customer name is required.");
  }

  const paymentMode = resolvePaymentMode(clean(formData.get("paymentMode")));

  const discountAmount = parseMoneyInput(
    formData.get("discountAmount"),
    "Discount",
    0,
  );

  if (discountAmount < 0) {
    throw new Error("Discount cannot be negative.");
  }

  const collectedItems = collectFormItems(formData);

  const { invoiceId } = await prisma.$transaction(
    async (tx) => {
      const invoiceItems = await prepareInvoiceItemsInsideTransaction({
        tx,
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

      const status = getInvoiceStatus({
        payableAmount,
        paidAmount,
      });

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

          totalAmount: toDecimalString(totalAmount),
          discountAmount: toDecimalString(discountAmount),
          payableAmount: toDecimalString(payableAmount),
          paidAmount: toDecimalString(paidAmount),
          balanceAmount: toDecimalString(balanceAmount),

          note: note || null,
          billedById: access.userId,

          items: {
            create: invoiceItems.map((item) => ({
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitPrice: toDecimalString(item.unitPrice),
              discountAmount: toDecimalString(item.discountAmount),
              lineTotal: toDecimalString(item.lineTotal),
            })),
          },

          payments:
            paidAmount > 0
              ? {
                  create: {
                    mode: paymentMode,
                    amount: toDecimalString(paidAmount),
                    transactionRef: transactionRef || null,
                    receivedById: access.userId,
                  },
                }
              : undefined,
        },
        select: {
          id: true,
          invoiceNo: true,
        },
      });

      for (const item of invoiceItems) {
        const stockBeforeUpdate = await tx.inventoryStock.findUnique({
          where: {
            id: item.inventoryStockId,
          },
          select: {
            quantity: true,
          },
        });

        if (!stockBeforeUpdate) {
          throw new Error(`${item.productLabel} stock was not found.`);
        }

        const updateResult = await tx.inventoryStock.updateMany({
          where: {
            id: item.inventoryStockId,
            schoolId,
            productVariantId: item.productVariantId,
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
          throw new Error(
            `${item.productLabel} does not have enough stock anymore. Please refresh and try again.`,
          );
        }

        const afterQty = stockBeforeUpdate.quantity - item.quantity;

        await tx.stockMovement.create({
          data: {
            schoolId,
            productVariantId: item.productVariantId,
            type: StockMovementType.SALE,
            quantity: -item.quantity,
            beforeQty: stockBeforeUpdate.quantity,
            afterQty,
            referenceType: "INVOICE",
            referenceId: invoice.id,
            note: `POS sale ${invoice.invoiceNo} by ${access.email}`,
            createdById: access.userId,
          },
        });
      }

      return {
        invoiceId: invoice.id,
      };
    },
    {
      timeout: 15_000,
      maxWait: 5_000,
    },
  );

  revalidatePath("/pos");
  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);

redirect(`/invoices/${invoiceId}`);
}