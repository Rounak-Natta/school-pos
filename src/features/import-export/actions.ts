"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ImportStatus,
  ImportType,
  StockMovementType,
} from "@/generated/prisma/client";
import type { ProductImportRowError } from "@/features/import-export/schemas";
import { parseProductsImportBuffer } from "@/features/import-export/excel-import";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function normalizeKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function emptyToNull(value?: string): string | null {
  const cleaned = String(value ?? "").trim();

  if (!cleaned || cleaned === "Not Applicable") {
    return null;
  }

  return cleaned;
}

function createVariantKey(input: {
  schoolId: string;
  productId: string;
  sku?: string | null;
  unit: string;
  className?: string | null;
  sectionName?: string | null;
  color?: string | null;
  size?: string | null;
}): string {
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
    .map((part) => normalizeKey(part))
    .join("|");
}

async function getCurrentDbUser(): Promise<{
  createdById: string | null;
  createdByEmail: string;
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
    createdById: dbUser?.id ?? null,
    createdByEmail: dbUser?.email ?? sessionUser.email,
  };
}

export async function importProductsExcelAction(
  formData: FormData
): Promise<void> {
  const { createdById, createdByEmail } = await getCurrentDbUser();

  const schoolId = clean(formData.get("schoolId"));
  const file = formData.get("file");

  if (!schoolId) {
    throw new Error("School is required.");
  }

  if (!(file instanceof File)) {
    throw new Error("Excel file is required.");
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Only .xlsx Excel files are allowed.");
  }

  if (file.size <= 0) {
    throw new Error("Uploaded Excel file is empty.");
  }

  const school = await prisma.school.findUnique({
    where: {
      id: schoolId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!school) {
    throw new Error("Selected school not found.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const rows = await parseProductsImportBuffer(buffer);

  let successRows = 0;
  let failedRows = 0;
  const errors: ProductImportRowError[] = [];

  const importLog = await prisma.excelImport.create({
    data: {
      schoolId: school.id,
      type: ImportType.PRODUCTS,
      fileName: file.name,
      totalRows: rows.length,
      successRows: 0,
      failedRows: 0,
      status: ImportStatus.PENDING,
      uploadedById: createdById,
    },
    select: {
      id: true,
    },
  });

  for (const row of rows) {
    try {
      if (!row.name) {
        throw new Error("Product name is missing.");
      }

      if (!row.sku) {
        throw new Error("SKU is missing.");
      }

      if (row.quantity < 0) {
        throw new Error("Opening stock cannot be negative.");
      }

      await prisma.$transaction(async (tx) => {
        const product = await tx.product.upsert({
          where: {
            schoolId_name: {
              schoolId: school.id,
              name: row.name,
            },
          },
          update: {
            category: emptyToNull(row.category),
            isActive: true,
            deletedAt: null,
          },
          create: {
            schoolId: school.id,
            name: row.name,
            category: emptyToNull(row.category),
            isActive: true,
          },
          select: {
            id: true,
            schoolId: true,
          },
        });

        const variantKey = createVariantKey({
          schoolId: product.schoolId,
          productId: product.id,
          sku: emptyToNull(row.sku),
          unit: row.unit || "PCS",
          className: emptyToNull(row.className),
          sectionName: emptyToNull(row.sectionName),
          color: emptyToNull(row.color),
          size: emptyToNull(row.size),
        });

        const existingVariant = await tx.productVariant.findUnique({
          where: {
            variantKey,
          },
          select: {
            id: true,
          },
        });

        const variant = await tx.productVariant.upsert({
          where: {
            variantKey,
          },
          update: {
            sku: emptyToNull(row.sku),
            barcode: emptyToNull(row.barcode),
            unit: row.unit || "PCS",
            className: emptyToNull(row.className),
            sectionName: emptyToNull(row.sectionName),
            color: emptyToNull(row.color),
            size: emptyToNull(row.size),
            salePrice: row.salePrice,
            mrp: row.mrp,
            costPrice: row.costPrice,
            wholesaleRate: row.wholesaleRate,
            isActive: true,
          },
          create: {
            productId: product.id,
            variantKey,
            sku: emptyToNull(row.sku),
            barcode: emptyToNull(row.barcode),
            unit: row.unit || "PCS",
            className: emptyToNull(row.className),
            sectionName: emptyToNull(row.sectionName),
            color: emptyToNull(row.color),
            size: emptyToNull(row.size),
            salePrice: row.salePrice,
            mrp: row.mrp,
            costPrice: row.costPrice,
            wholesaleRate: row.wholesaleRate,
            isActive: true,
          },
          select: {
            id: true,
          },
        });

        const existingStock = await tx.inventoryStock.findUnique({
          where: {
            schoolId_productVariantId: {
              schoolId: school.id,
              productVariantId: variant.id,
            },
          },
          select: {
            quantity: true,
          },
        });

        const beforeQty = existingStock?.quantity ?? 0;
        const afterQty = row.quantity;

        await tx.inventoryStock.upsert({
          where: {
            schoolId_productVariantId: {
              schoolId: school.id,
              productVariantId: variant.id,
            },
          },
          update: {
            quantity: afterQty,
            reorderLevel: row.reorderLevel,
          },
          create: {
            schoolId: school.id,
            productVariantId: variant.id,
            quantity: afterQty,
            reorderLevel: row.reorderLevel,
          },
        });

        if (beforeQty !== afterQty) {
          await tx.stockMovement.create({
            data: {
              schoolId: school.id,
              productVariantId: variant.id,
              type:
                !existingVariant && afterQty > 0
                  ? StockMovementType.OPENING_STOCK
                  : afterQty > beforeQty
                    ? StockMovementType.ADJUSTMENT_IN
                    : StockMovementType.ADJUSTMENT_OUT,
              quantity: afterQty - beforeQty,
              beforeQty,
              afterQty,
              referenceType: "PRODUCT_EXCEL_IMPORT",
              referenceId: importLog.id,
              note: `Excel import by ${createdByEmail}`,
              createdById,
            },
          });
        }
      });

      successRows++;
    } catch (error) {
      failedRows++;

      errors.push({
        rowNumber: row.rowNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  await prisma.excelImport.update({
    where: {
      id: importLog.id,
    },
    data: {
      successRows,
      failedRows,
      status: failedRows > 0 ? ImportStatus.FAILED : ImportStatus.COMPLETED,
      errorSummary: errors.length > 0 ? errors : undefined,
    },
  });

  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/import-export");

  redirect("/import-export");
}