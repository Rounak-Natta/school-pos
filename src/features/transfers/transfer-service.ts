import { randomUUID } from "node:crypto";

import {
  NotificationType,
  RoleName,
  StockMovementType,
  TransferStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { notifySchoolUsers } from "@/features/notifications/notification-service";


function normalizeVariantKeyPart(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function destinationVariantKey(input: {
  schoolId: string;
  productId: string;
  sku?: string | null;
  unit: string;
  className?: string | null;
  sectionName?: string | null;
  color?: string | null;
  size?: string | null;
}) {
  return [
    input.schoolId,
    input.productId,
    input.sku || "NO-SKU",
    input.unit,
    input.className || "",
    input.sectionName || "",
    input.color || "",
    input.size || "",
  ]
    .map(normalizeVariantKeyPart)
    .join("|");
}

function createTransferNo() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
  return `TRF-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createTransfer(
  tx: Prisma.TransactionClient,
  input: {
    fromSchoolId: string;
    toSchoolId: string;
    note?: string | null;
    requestedById: string;
    requestedByEmail: string;
    items: Array<{ productVariantId: string; quantity: number }>;
  },
) {
  if (input.fromSchoolId === input.toSchoolId) {
    throw new Error("Source and destination schools must be different.");
  }
  if (!input.items.length) throw new Error("Add at least one transfer item.");

  const [fromSchool, toSchool] = await Promise.all([
    tx.school.findFirst({
      where: { id: input.fromSchoolId, isActive: true },
      select: { id: true, name: true },
    }),
    tx.school.findFirst({
      where: { id: input.toSchoolId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!fromSchool || !toSchool) throw new Error("Source or destination school is inactive or missing.");

  const variantIds = Array.from(new Set(input.items.map((item) => item.productVariantId)));
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, isActive: true },
    select: { id: true },
  });
  if (variants.length !== variantIds.length) {
    throw new Error("One or more transfer products are invalid.");
  }

  const sourceStocks = await tx.inventoryStock.findMany({
    where: {
      schoolId: input.fromSchoolId,
      productVariantId: { in: variantIds },
    },
    select: { productVariantId: true, quantity: true },
  });
  const qtyByVariant = new Map(
    sourceStocks.map((stock) => [stock.productVariantId, stock.quantity]),
  );
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Transfer quantity must be a positive whole number.");
    }
    if ((qtyByVariant.get(item.productVariantId) ?? 0) < item.quantity) {
      throw new Error("Requested transfer quantity exceeds available source stock.");
    }
  }

  // Requesting reserves no stock. Actual stock deduction happens exactly once at dispatch.
  const transfer = await tx.transfer.create({
    data: {
      transferNo: createTransferNo(),
      fromSchoolId: input.fromSchoolId,
      toSchoolId: input.toSchoolId,
      status: TransferStatus.REQUESTED,
      note: input.note || null,
      requestedById: input.requestedById,
      items: {
        create: input.items.map((item) => ({
          productVariantId: item.productVariantId,
          requestedQty: item.quantity,
        })),
      },
    },
    include: {
      fromSchool: { select: { name: true } },
      toSchool: { select: { name: true } },
    },
  });

  await writeAuditLog(tx, {
    userId: input.requestedById,
    schoolId: input.fromSchoolId,
    action: "REQUEST",
    entity: "TRANSFER",
    entityId: transfer.id,
    newData: {
      transferNo: transfer.transferNo,
      toSchoolId: input.toSchoolId,
      items: input.items,
    },
  });
  await notifySchoolUsers(tx, {
    schoolId: input.fromSchoolId,
    type: NotificationType.TRANSFER,
    title: "Transfer requested",
    message: `${transfer.transferNo}: ${transfer.fromSchool.name} → ${transfer.toSchool.name}`,
    href: `/transfers/${transfer.id}`,
    roles: [
      RoleName.SUPER_ADMIN,
      RoleName.SCHOOL_ADMIN,
      RoleName.INVENTORY_MANAGER,
    ],
  });

  return transfer;
}

export async function approveTransfer(
  tx: Prisma.TransactionClient,
  input: { transferId: string; userId: string },
) {
  const current = await tx.transfer.findUnique({
    where: { id: input.transferId },
    select: { id: true, fromSchoolId: true, status: true, transferNo: true },
  });
  if (!current) throw new Error("Transfer not found.");

  const claimed = await tx.transfer.updateMany({
    where: { id: current.id, status: TransferStatus.REQUESTED },
    data: {
      status: TransferStatus.APPROVED,
      approvedById: input.userId,
      approvedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new Error("This transfer is no longer waiting for approval. Refresh and try again.");
  }

  await writeAuditLog(tx, {
    userId: input.userId,
    schoolId: current.fromSchoolId,
    action: "APPROVE",
    entity: "TRANSFER",
    entityId: current.id,
    oldData: { status: current.status },
    newData: { status: TransferStatus.APPROVED },
  });

  return tx.transfer.findUniqueOrThrow({ where: { id: current.id } });
}

export async function dispatchTransfer(
  tx: Prisma.TransactionClient,
  input: { transferId: string; userId: string; userEmail: string },
) {
  const transfer = await tx.transfer.findUnique({
    where: { id: input.transferId },
    include: {
      items: {
        include: {
          productVariant: { include: { product: true } },
        },
      },
      fromSchool: { select: { name: true } },
      toSchool: { select: { name: true } },
    },
  });
  if (!transfer) throw new Error("Transfer not found.");

  // Claim APPROVED -> DISPATCHED atomically before touching stock. If anything below
  // fails, the surrounding database transaction rolls this status change back too.
  const claimed = await tx.transfer.updateMany({
    where: { id: transfer.id, status: TransferStatus.APPROVED },
    data: {
      status: TransferStatus.DISPATCHED,
      dispatchedById: input.userId,
      dispatchedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new Error("This transfer was already dispatched or its status changed. Refresh and try again.");
  }

  for (const item of transfer.items) {
    const result = await tx.inventoryStock.updateMany({
      where: {
        schoolId: transfer.fromSchoolId,
        productVariantId: item.productVariantId,
        quantity: { gte: item.requestedQty },
      },
      data: { quantity: { decrement: item.requestedQty } },
    });
    if (result.count !== 1) {
      throw new Error(
        "Source stock changed and is no longer sufficient. Nothing was dispatched; refresh and try again.",
      );
    }

    const stockAfter = await tx.inventoryStock.findUniqueOrThrow({
      where: {
        schoolId_productVariantId: {
          schoolId: transfer.fromSchoolId,
          productVariantId: item.productVariantId,
        },
      },
      select: { quantity: true },
    });
    const afterQty = stockAfter.quantity;
    const beforeQty = afterQty + item.requestedQty;

    await tx.transferItem.update({
      where: { id: item.id },
      data: { dispatchedQty: item.requestedQty },
    });
    await tx.stockMovement.create({
      data: {
        schoolId: transfer.fromSchoolId,
        productVariantId: item.productVariantId,
        type: StockMovementType.TRANSFER_OUT,
        quantity: -item.requestedQty,
        beforeQty,
        afterQty,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        note: `Transfer ${transfer.transferNo} dispatched by ${input.userEmail}`,
        createdById: input.userId,
      },
    });
  }

  await writeAuditLog(tx, {
    userId: input.userId,
    schoolId: transfer.fromSchoolId,
    action: "DISPATCH",
    entity: "TRANSFER",
    entityId: transfer.id,
    oldData: { status: transfer.status },
    newData: { status: TransferStatus.DISPATCHED },
  });
  await notifySchoolUsers(tx, {
    schoolId: transfer.toSchoolId,
    type: NotificationType.TRANSFER,
    title: "Stock transfer dispatched",
    message: `${transfer.transferNo} is on the way from ${transfer.fromSchool.name}.`,
    href: `/transfers/${transfer.id}`,
    roles: [
      RoleName.SUPER_ADMIN,
      RoleName.SCHOOL_ADMIN,
      RoleName.INVENTORY_MANAGER,
    ],
  });

  return tx.transfer.findUniqueOrThrow({ where: { id: transfer.id } });
}

export async function receiveTransfer(
  tx: Prisma.TransactionClient,
  input: { transferId: string; userId: string; userEmail: string },
) {
  const transfer = await tx.transfer.findUnique({
    where: { id: input.transferId },
    include: {
      items: {
        include: {
          productVariant: { include: { product: true } },
        },
      },
      fromSchool: { select: { name: true } },
      toSchool: { select: { name: true } },
    },
  });
  if (!transfer) throw new Error("Transfer not found.");

  // Claim receipt exactly once. The status claim and all destination-stock updates
  // live in the same transaction, so partial receipt cannot be committed accidentally.
  const claimed = await tx.transfer.updateMany({
    where: {
      id: transfer.id,
      status: { in: [TransferStatus.DISPATCHED, TransferStatus.IN_TRANSIT] },
    },
    data: {
      status: TransferStatus.COMPLETED,
      receivedById: input.userId,
      receivedAt: new Date(),
    },
  });
  if (claimed.count !== 1) {
    throw new Error("This transfer was already received or its status changed. Refresh and try again.");
  }

  for (const item of transfer.items) {
    if (item.dispatchedQty <= 0) {
      throw new Error("Dispatched quantity is invalid.");
    }

    // Products are school-scoped in this project. Mirror the source product/variant
    // into the destination school instead of attaching destination stock to a
    // product owned by the source school.
    const sourceVariant = item.productVariant;
    const sourceProduct = sourceVariant.product;
    const destinationProduct = await tx.product.upsert({
      where: {
        schoolId_name: {
          schoolId: transfer.toSchoolId,
          name: sourceProduct.name,
        },
      },
      update: {
        category: sourceProduct.category,
        description: sourceProduct.description,
        isActive: true,
        deletedAt: null,
      },
      create: {
        schoolId: transfer.toSchoolId,
        name: sourceProduct.name,
        category: sourceProduct.category,
        description: sourceProduct.description,
        isActive: true,
      },
      select: { id: true },
    });

    const variantKey = destinationVariantKey({
      schoolId: transfer.toSchoolId,
      productId: destinationProduct.id,
      sku: sourceVariant.sku,
      unit: sourceVariant.unit,
      className: sourceVariant.className,
      sectionName: sourceVariant.sectionName,
      color: sourceVariant.color,
      size: sourceVariant.size,
    });
    const destinationVariant = await tx.productVariant.upsert({
      where: { variantKey },
      update: {
        sku: sourceVariant.sku,
        barcode: sourceVariant.barcode,
        unit: sourceVariant.unit,
        className: sourceVariant.className,
        sectionName: sourceVariant.sectionName,
        color: sourceVariant.color,
        size: sourceVariant.size,
        salePrice: sourceVariant.salePrice,
        costPrice: sourceVariant.costPrice,
        mrp: sourceVariant.mrp,
        wholesaleRate: sourceVariant.wholesaleRate,
        gstRate: sourceVariant.gstRate,
        hsnCode: sourceVariant.hsnCode,
        isActive: true,
      },
      create: {
        productId: destinationProduct.id,
        variantKey,
        sku: sourceVariant.sku,
        barcode: sourceVariant.barcode,
        unit: sourceVariant.unit,
        className: sourceVariant.className,
        sectionName: sourceVariant.sectionName,
        color: sourceVariant.color,
        size: sourceVariant.size,
        salePrice: sourceVariant.salePrice,
        costPrice: sourceVariant.costPrice,
        mrp: sourceVariant.mrp,
        wholesaleRate: sourceVariant.wholesaleRate,
        gstRate: sourceVariant.gstRate,
        hsnCode: sourceVariant.hsnCode,
        isActive: true,
      },
      select: { id: true },
    });

    const updatedStock = await tx.inventoryStock.upsert({
      where: {
        schoolId_productVariantId: {
          schoolId: transfer.toSchoolId,
          productVariantId: destinationVariant.id,
        },
      },
      create: {
        schoolId: transfer.toSchoolId,
        productVariantId: destinationVariant.id,
        quantity: item.dispatchedQty,
        reorderLevel: 0,
      },
      update: { quantity: { increment: item.dispatchedQty } },
      select: { quantity: true },
    });
    const afterQty = updatedStock.quantity;
    const beforeQty = afterQty - item.dispatchedQty;

    await tx.transferItem.update({
      where: { id: item.id },
      data: { receivedQty: item.dispatchedQty },
    });
    await tx.stockMovement.create({
      data: {
        schoolId: transfer.toSchoolId,
        productVariantId: destinationVariant.id,
        type: StockMovementType.TRANSFER_IN,
        quantity: item.dispatchedQty,
        beforeQty,
        afterQty,
        referenceType: "TRANSFER",
        referenceId: transfer.id,
        note: `Transfer ${transfer.transferNo} received by ${input.userEmail}`,
        createdById: input.userId,
      },
    });
  }

  await writeAuditLog(tx, {
    userId: input.userId,
    schoolId: transfer.toSchoolId,
    action: "RECEIVE",
    entity: "TRANSFER",
    entityId: transfer.id,
    oldData: { status: transfer.status },
    newData: { status: TransferStatus.COMPLETED },
  });
  await notifySchoolUsers(tx, {
    schoolId: transfer.fromSchoolId,
    type: NotificationType.TRANSFER,
    title: "Transfer received",
    message: `${transfer.transferNo} was received by ${transfer.toSchool.name}.`,
    href: `/transfers/${transfer.id}`,
  });

  return tx.transfer.findUniqueOrThrow({ where: { id: transfer.id } });
}
