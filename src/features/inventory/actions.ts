"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  NotificationType,
  RoleName,
  StockMovementType,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { notifySchoolUsers } from "@/features/notifications/notification-service";
import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, requirePermission } from "@/lib/rbac";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function adjustInventoryAction(formData: FormData) {
  const access = await getAccessScope();
  const inventoryStockId = clean(formData.get("inventoryStockId"));
  const adjustmentType = clean(formData.get("adjustmentType"));
  const quantity = Number(clean(formData.get("quantity")));
  const note = clean(formData.get("note"));

  if (!inventoryStockId) throw new Error("Inventory stock is required.");
  if (adjustmentType !== "IN" && adjustmentType !== "OUT") {
    throw new Error("Valid adjustment type is required.");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }

  const stockForAccess = await prisma.inventoryStock.findUnique({
    where: { id: inventoryStockId },
    select: { schoolId: true },
  });
  if (!stockForAccess) throw new Error("Stock record not found.");
  requirePermission(access, Permission.MANAGE_INVENTORY, stockForAccess.schoolId);

  await prisma.$transaction(async (tx) => {
    const stock = await tx.inventoryStock.findUnique({
      where: { id: inventoryStockId },
      include: {
        productVariant: { include: { product: true } },
        school: { select: { name: true } },
      },
    });
    if (!stock) throw new Error("Stock record not found.");

    requirePermission(access, Permission.MANAGE_INVENTORY, stock.schoolId);
    const beforeQty = stock.quantity;

    if (adjustmentType === "OUT") {
      const updated = await tx.inventoryStock.updateMany({
        where: { id: stock.id, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (updated.count !== 1) {
        throw new Error("Stock changed or is insufficient. Refresh and try again.");
      }
    } else {
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: { increment: quantity } },
      });
    }

    const refreshed = await tx.inventoryStock.findUniqueOrThrow({
      where: { id: stock.id },
      select: { quantity: true },
    });
    const afterQty = refreshed.quantity;

    await tx.stockMovement.create({
      data: {
        schoolId: stock.schoolId,
        productVariantId: stock.productVariantId,
        type:
          adjustmentType === "OUT"
            ? StockMovementType.ADJUSTMENT_OUT
            : StockMovementType.ADJUSTMENT_IN,
        quantity: adjustmentType === "OUT" ? -quantity : quantity,
        beforeQty,
        afterQty,
        referenceType: "MANUAL_ADJUSTMENT",
        referenceId: stock.id,
        note:
          note ||
          `Manual stock ${adjustmentType === "OUT" ? "decrease" : "increase"} by ${access.email}`,
        createdById: access.userId,
      },
    });

    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId: stock.schoolId,
      action: adjustmentType === "OUT" ? "STOCK_OUT" : "STOCK_IN",
      entity: "INVENTORY_STOCK",
      entityId: stock.id,
      oldData: { quantity: beforeQty },
      newData: {
        quantity: afterQty,
        adjustment: adjustmentType === "OUT" ? -quantity : quantity,
        note: note || null,
      },
    });

    if (afterQty <= stock.reorderLevel) {
      await notifySchoolUsers(tx, {
        schoolId: stock.schoolId,
        type: NotificationType.LOW_STOCK,
        title: "Low stock alert",
        message: `${stock.productVariant.product.name} has ${afterQty} left (reorder level ${stock.reorderLevel}).`,
        href: "/inventory",
        roles: [
          RoleName.SUPER_ADMIN,
          RoleName.SCHOOL_ADMIN,
          RoleName.INVENTORY_MANAGER,
        ],
      });
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/movements");
  revalidatePath("/audit-logs");
  revalidatePath("/notifications");
  redirect("/inventory");
}
