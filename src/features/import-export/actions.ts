"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ImportStatus,
  ImportType,
  NotificationType,
  RoleName,
  StockMovementType,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { notifySchoolUsers } from "@/features/notifications/notification-service";
import {
  parseProductsImportBuffer,
  parseStudentsImportBuffer,
} from "@/features/import-export/excel-import";
import type {
  ProductImportRowError,
  StudentImportRowError,
} from "@/features/import-export/schemas";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  getSchoolIdsForPermission,
  hasPermission,
  Permission,
  resolveAccessibleSchoolId,
} from "@/lib/rbac";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PRODUCT_IMPORT_BATCH_SIZE = 4;
const PRODUCT_TRANSACTION_TIMEOUT_MS = 30_000;
const PRODUCT_TRANSACTION_MAX_WAIT_MS = 10_000;
const PRODUCT_TRANSACTION_ATTEMPTS = 3;
const clean = (value: FormDataEntryValue | null) =>
  String(value ?? "").trim();
const emptyToNull = (value?: string) => {
  const normalized = String(value ?? "").trim();
  return !normalized || normalized === "Not Applicable" ? null : normalized;
};
const normalizeKey = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, " ");
const normalizeSchoolCode = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, "");

function createVariantKey(input: {
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
    .map(normalizeKey)
    .join("|");
}

function validateExcelFile(file: FormDataEntryValue | null): asserts file is File {
  if (!(file instanceof File)) throw new Error("Excel file is required.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Only .xlsx Excel files are allowed.");
  }
  if (file.size <= 0) throw new Error("Uploaded Excel file is empty.");
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Excel file must be 10 MB or smaller.");
  }
}

function resultRedirect(type: "products" | "students", success: number, failed: number) {
  const params = new URLSearchParams({
    import: type,
    success: String(success),
    failed: String(failed),
  });
  redirect(`/import-export?${params.toString()}`);
}

function errorRedirect(type: "products" | "students", message: string): never {
  const params = new URLSearchParams({
    import: type,
    error: message.slice(0, 500),
  });
  redirect(`/import-export?${params.toString()}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Import could not be processed.";
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableTransactionError(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown };
  const message = String(candidate?.message ?? "").toLowerCase();

  return (
    candidate?.code === "P2028" ||
    message.includes("expired transaction") ||
    message.includes("transaction api error") ||
    message.includes("timed out")
  );
}

async function withProductTransactionRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PRODUCT_TRANSACTION_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (
        !isRetryableTransactionError(error) ||
        attempt === PRODUCT_TRANSACTION_ATTEMPTS
      ) {
        throw error;
      }

      // Supabase/Vercel can occasionally stall a pooled transaction. Back off
      // briefly and retry the whole row; the transaction has already rolled
      // back, so the retry is safe and idempotent.
      await sleep(300 * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Product row transaction failed after retries.");
}

export async function importProductsExcelAction(
  formData: FormData,
): Promise<void> {
  const access = await getAccessScope();

  if (!hasPermission(access, Permission.IMPORT_EXPORT)) {
    throw new Error("You do not have permission to import product stock.");
  }

  const file = formData.get("file");
  try {
    validateExcelFile(file);
  } catch (error) {
    errorRedirect("products", errorMessage(error));
  }

  const allowedSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.IMPORT_EXPORT);

  const accessibleSchools = await prisma.school.findMany({
    where: {
      isActive: true,
      ...(access.isSuperAdmin
        ? {}
        : { id: { in: allowedSchoolIds ?? [] } }),
    },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  if (accessibleSchools.length === 0) {
    throw new Error("No active schools are available for this import.");
  }

  const schoolByCode = new Map(
    accessibleSchools.map((school) => [
      normalizeSchoolCode(school.code),
      school,
    ]),
  );
  const schoolByName = new Map(
    accessibleSchools.map((school) => [normalizeKey(school.name), school]),
  );

  let rows: Awaited<ReturnType<typeof parseProductsImportBuffer>>;
  try {
    rows = await parseProductsImportBuffer(
      Buffer.from(await file.arrayBuffer()),
    );
  } catch (error) {
    errorRedirect("products", errorMessage(error));
  }

  const importLog = await prisma.excelImport.create({
    data: {
      // Null intentionally means this file can contain rows for multiple schools.
      schoolId: null,
      type: ImportType.PRODUCTS,
      fileName: file.name,
      totalRows: rows.length,
      uploadedById: access.userId,
    },
    select: { id: true },
  });

  let successRows = 0;
  let failedRows = 0;
  const errors: ProductImportRowError[] = [];
  const touchedSchoolIds = new Set<string>();
  const touchedSchoolNames = new Set<string>();

  for (let offset = 0; offset < rows.length; offset += PRODUCT_IMPORT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + PRODUCT_IMPORT_BATCH_SIZE);

    await Promise.all(
      batch.map(async (row) => {
        try {
      if (!row.school && !row.schoolCode) {
        throw new Error("School or School Code is missing.");
      }

      const schoolFromCode = row.schoolCode
        ? schoolByCode.get(normalizeSchoolCode(row.schoolCode))
        : undefined;
      const schoolFromName = row.school
        ? schoolByName.get(normalizeKey(row.school))
        : undefined;

      if (row.schoolCode && !schoolFromCode) {
        throw new Error(
          `School Code \"${row.schoolCode}\" was not found or you do not have import access to it.`,
        );
      }

      if (row.school && !schoolFromName) {
        throw new Error(
          `School \"${row.school}\" was not found or you do not have import access to it.`,
        );
      }

      if (
        schoolFromCode &&
        schoolFromName &&
        schoolFromCode.id !== schoolFromName.id
      ) {
        throw new Error(
          `School and School Code point to different schools (${row.school} / ${row.schoolCode}).`,
        );
      }

      const school = schoolFromCode ?? schoolFromName;
      if (!school) {
        throw new Error("Unable to resolve the school for this row.");
      }

      if (!row.name) throw new Error("Product name is missing.");
      if (!row.sku) throw new Error("SKU is missing.");
      if (row.quantity < 0) {
        throw new Error("Stock quantity cannot be negative.");
      }

      const gstRate =
        row.gstRate === undefined ? undefined : Number(row.gstRate);
      if (
        gstRate !== undefined &&
        (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100)
      ) {
        throw new Error("GST rate must be between 0 and 100.");
      }

      const stockResult = await withProductTransactionRetry(() =>
        prisma.$transaction(
          async (tx) => {
        const product = await tx.product.upsert({
          where: {
            schoolId_name: { schoolId: school.id, name: row.name },
          },
          update: {
            ...(row.category !== undefined
              ? { category: emptyToNull(row.category) }
              : {}),
            isActive: true,
            deletedAt: null,
          },
          create: {
            schoolId: school.id,
            name: row.name,
            category: emptyToNull(row.category),
            isActive: true,
          },
          select: { id: true },
        });

        const variantKey = createVariantKey({
          schoolId: school.id,
          productId: product.id,
          sku: emptyToNull(row.sku),
          unit: row.unit || "PCS",
          className: emptyToNull(row.className),
          sectionName: emptyToNull(row.sectionName),
          color: emptyToNull(row.color),
          size: emptyToNull(row.size),
        });

        const variant = await tx.productVariant.upsert({
          where: { variantKey },
          update: {
            sku: emptyToNull(row.sku),
            ...(row.barcode !== undefined
              ? { barcode: emptyToNull(row.barcode) }
              : {}),
            unit: row.unit || "PCS",
            ...(row.className !== undefined
              ? { className: emptyToNull(row.className) }
              : {}),
            ...(row.sectionName !== undefined
              ? { sectionName: emptyToNull(row.sectionName) }
              : {}),
            ...(row.color !== undefined
              ? { color: emptyToNull(row.color) }
              : {}),
            ...(row.size !== undefined
              ? { size: emptyToNull(row.size) }
              : {}),
            salePrice: row.salePrice,
            ...(row.mrp !== undefined ? { mrp: row.mrp } : {}),
            ...(row.costPrice !== undefined
              ? { costPrice: row.costPrice }
              : {}),
            ...(row.wholesaleRate !== undefined
              ? { wholesaleRate: row.wholesaleRate }
              : {}),
            ...(row.gstRate !== undefined
              ? { gstRate: row.gstRate }
              : {}),
            ...(row.hsnCode !== undefined
              ? { hsnCode: emptyToNull(row.hsnCode) }
              : {}),
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
            gstRate: row.gstRate ?? "0.00",
            hsnCode: emptyToNull(row.hsnCode),
            isActive: true,
          },
          select: { id: true },
        });

        const existingStock = await tx.inventoryStock.findUnique({
          where: {
            schoolId_productVariantId: {
              schoolId: school.id,
              productVariantId: variant.id,
            },
          },
          select: { quantity: true, reorderLevel: true },
        });

        const beforeQty = existingStock?.quantity ?? 0;
        const afterQty = row.quantity;
        const reorderLevel =
          row.reorderLevel ?? existingStock?.reorderLevel ?? 0;

        await tx.inventoryStock.upsert({
          where: {
            schoolId_productVariantId: {
              schoolId: school.id,
              productVariantId: variant.id,
            },
          },
          update: {
            quantity: afterQty,
            reorderLevel,
          },
          create: {
            schoolId: school.id,
            productVariantId: variant.id,
            quantity: afterQty,
            reorderLevel,
          },
        });

        if (beforeQty !== afterQty) {
          await tx.stockMovement.create({
            data: {
              schoolId: school.id,
              productVariantId: variant.id,
              type:
                !existingStock && afterQty > 0
                  ? StockMovementType.OPENING_STOCK
                  : afterQty > beforeQty
                    ? StockMovementType.ADJUSTMENT_IN
                    : StockMovementType.ADJUSTMENT_OUT,
              quantity: afterQty - beforeQty,
              beforeQty,
              afterQty,
              referenceType: "PRODUCT_EXCEL_IMPORT",
              referenceId: importLog.id,
              note: `Multi-school Excel import by ${access.email}`,
              createdById: access.userId,
            },
          });
        }

            return { beforeQty, afterQty, reorderLevel };
          },
          {
            maxWait: PRODUCT_TRANSACTION_MAX_WAIT_MS,
            timeout: PRODUCT_TRANSACTION_TIMEOUT_MS,
          },
        ),
      );

      // Do not make a successful stock update fail just because notification
      // delivery is slow. Keep notification work outside the core row
      // transaction and treat it as best-effort.
      if (
        stockResult.reorderLevel > 0 &&
        stockResult.afterQty <= stockResult.reorderLevel &&
        (stockResult.beforeQty > stockResult.reorderLevel ||
          stockResult.beforeQty !== stockResult.afterQty)
      ) {
        try {
          await prisma.$transaction(
            async (tx) =>
              notifySchoolUsers(tx, {
                schoolId: school.id,
                type: NotificationType.LOW_STOCK,
                title: "Low stock after Excel import",
                message: `${row.name}${row.sku ? ` (${row.sku})` : ""} has ${stockResult.afterQty} left (reorder level ${stockResult.reorderLevel}).`,
                href: "/inventory",
                roles: [
                  RoleName.SUPER_ADMIN,
                  RoleName.SCHOOL_ADMIN,
                  RoleName.INVENTORY_MANAGER,
                ],
              }),
            { maxWait: 5_000, timeout: 10_000 },
          );
        } catch (notificationError) {
          console.warn(
            "Low-stock notification skipped after successful Excel row import:",
            errorMessage(notificationError),
          );
        }
      }

      touchedSchoolIds.add(school.id);
      touchedSchoolNames.add(school.name);
      successRows++;
    } catch (error) {
      failedRows++;
          errors.push({
            rowNumber: row.rowNumber,
            error: error instanceof Error ? error.message : "Unknown error",
            school: row.school || undefined,
            schoolCode: row.schoolCode || undefined,
            name: row.name || undefined,
            sku: row.sku || undefined,
          });
        }
      }),
    );

    // Persist progress after every batch. If the hosting platform interrupts the
    // request, Recent Imports still shows how far the workbook got instead of
    // staying at 0 / 0 forever.
    await prisma.excelImport.update({
      where: { id: importLog.id },
      data: {
        successRows,
        failedRows,
        errorSummary: errors.length ? errors : undefined,
      },
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.excelImport.update({
      where: { id: importLog.id },
      data: {
        successRows,
        failedRows,
        status: failedRows > 0 ? ImportStatus.FAILED : ImportStatus.COMPLETED,
        errorSummary: errors.length ? errors : undefined,
      },
    });

    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId: touchedSchoolIds.size === 1 ? [...touchedSchoolIds][0] : null,
      action: "IMPORT",
      entity: "PRODUCTS_STOCK_MULTI_SCHOOL",
      entityId: importLog.id,
      newData: {
        fileName: file.name,
        totalRows: rows.length,
        successRows,
        failedRows,
        schools: [...touchedSchoolNames].sort(),
      },
    });
  });

  [
    "/products",
    "/inventory",
    "/inventory/movements",
    "/import-export",
    "/pos",
  ].forEach((path) => revalidatePath(path));

  resultRedirect("products", successRows, failedRows);
}

export async function importStudentsExcelAction(
  formData: FormData,
): Promise<void> {
  const access = await getAccessScope();
  const schoolId = await resolveAccessibleSchoolId({
    postedSchoolId: clean(formData.get("schoolId")),
    access,
    permission: Permission.IMPORT_EXPORT,
  });

  const file = formData.get("file");
  try {
    validateExcelFile(file);
  } catch (error) {
    errorRedirect("students", errorMessage(error));
  }

  let rows: Awaited<ReturnType<typeof parseStudentsImportBuffer>>;
  try {
    rows = await parseStudentsImportBuffer(
      Buffer.from(await file.arrayBuffer()),
    );
  } catch (error) {
    errorRedirect("students", errorMessage(error));
  }

  const importLog = await prisma.excelImport.create({
    data: {
      schoolId,
      type: ImportType.STUDENTS,
      fileName: file.name,
      totalRows: rows.length,
      uploadedById: access.userId,
    },
    select: { id: true },
  });

  let successRows = 0;
  let failedRows = 0;
  const errors: StudentImportRowError[] = [];

  for (const row of rows) {
    try {
      if (!row.name) throw new Error("Student name is missing.");
      if (!row.className) throw new Error("Class is missing.");
      if (!row.parentPhone || row.parentPhone.length < 6) {
        throw new Error("Contact number is required.");
      }

      await prisma.$transaction(async (tx) => {
        let existing = row.admissionNo
          ? await tx.student.findUnique({
              where: {
                schoolId_admissionNo: {
                  schoolId,
                  admissionNo: row.admissionNo,
                },
              },
            })
          : null;

        if (!existing) {
          existing = await tx.student.findFirst({
            where: {
              schoolId,
              name: row.name,
              className: row.className,
              parentPhone: row.parentPhone,
              deletedAt: null,
            },
          });
        }

        if (existing) {
          await tx.student.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              className: row.className,
              sectionName: emptyToNull(row.sectionName),
              admissionNo: emptyToNull(row.admissionNo),
              rollNumber: emptyToNull(row.rollNumber),
              parentName: emptyToNull(row.parentName),
              parentPhone: row.parentPhone,
              address: emptyToNull(row.address),
              isActive: true,
              deletedAt: null,
            },
          });
        } else {
          await tx.student.create({
            data: {
              schoolId,
              name: row.name,
              className: row.className,
              sectionName: emptyToNull(row.sectionName),
              admissionNo: emptyToNull(row.admissionNo),
              rollNumber: emptyToNull(row.rollNumber),
              parentName: emptyToNull(row.parentName),
              parentPhone: row.parentPhone,
              address: emptyToNull(row.address),
              isActive: true,
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
        name: row.name || undefined,
        className: row.className || undefined,
        parentPhone: row.parentPhone || undefined,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.excelImport.update({
      where: { id: importLog.id },
      data: {
        successRows,
        failedRows,
        status: failedRows > 0 ? ImportStatus.FAILED : ImportStatus.COMPLETED,
        errorSummary: errors.length ? errors : undefined,
      },
    });

    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId,
      action: "IMPORT",
      entity: "STUDENTS",
      entityId: importLog.id,
      newData: {
        fileName: file.name,
        totalRows: rows.length,
        successRows,
        failedRows,
      },
    });
  });

  revalidatePath("/students");
  revalidatePath("/import-export");
  revalidatePath("/pos");

  resultRedirect("students", successRows, failedRows);
}
