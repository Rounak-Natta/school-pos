"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StockMovementType } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function adjustInventoryAction(formData: FormData) {
  const user = await requireUser();

  const inventoryStockId = clean(formData.get("inventoryStockId"));
  const adjustmentType = clean(formData.get("adjustmentType"));
  const quantity = Number(clean(formData.get("quantity")));
  const note = clean(formData.get("note"));

  if (!inventoryStockId) {
    throw new Error("Inventory stock is required.");
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }

  const stock = await prisma.inventoryStock.findUnique({
    where: {
      id: inventoryStockId,
    },
    include: {
      productVariant: {
        include: {
          product: true,
        },
      },
      school: true,
    },
  });

  if (!stock) {
    throw new Error("Stock record not found.");
  }

  const beforeQty = stock.quantity;

  const afterQty =
    adjustmentType === "OUT" ? beforeQty - quantity : beforeQty + quantity;

  if (afterQty < 0) {
    throw new Error("Stock cannot become negative.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventoryStock.update({
      where: {
        id: stock.id,
      },
      data: {
        quantity: afterQty,
      },
    });

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
          `Manual stock ${
            adjustmentType === "OUT" ? "decrease" : "increase"
          } by ${user.email}`,
        createdById: user.id,
      },
    });
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/movements");

  redirect("/inventory");
}