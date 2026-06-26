"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { StockMovementType } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { productFormSchema } from "@/features/products/schemas";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function emptyToNull(value?: string) {
  const cleaned = String(value ?? "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function toDecimalString(value?: number) {
  if (value === undefined || Number.isNaN(value)) return null;
  return value.toFixed(2);
}

function normalizeKey(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
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
    .map((part) => normalizeKey(part))
    .join("|");
}

function readProductFormData(formData: FormData) {
  return productFormSchema.parse({
    schoolId: clean(formData.get("schoolId")),
    name: clean(formData.get("name")),
    category: clean(formData.get("category")),
    description: clean(formData.get("description")),

    sku: clean(formData.get("sku")),
    barcode: clean(formData.get("barcode")),
    unit: clean(formData.get("unit")) || "PCS",

    className: clean(formData.get("className")),
    sectionName: clean(formData.get("sectionName")),
    color: clean(formData.get("color")),
    size: clean(formData.get("size")),

    salePrice: clean(formData.get("salePrice")) || "0",
    costPrice: clean(formData.get("costPrice")) || undefined,
    mrp: clean(formData.get("mrp")) || undefined,
    wholesaleRate: clean(formData.get("wholesaleRate")) || undefined,

    quantity: clean(formData.get("quantity")) || "0",
    reorderLevel: clean(formData.get("reorderLevel")) || "0",
  });
}

export async function createProductAction(formData: FormData) {
  const user = await requireUser();
  const input = readProductFormData(formData);

  const duplicateProduct = await prisma.product.findFirst({
    where: {
      schoolId: input.schoolId,
      name: input.name,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (duplicateProduct) {
    throw new Error("This product already exists for the selected school.");
  }

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        schoolId: input.schoolId,
        name: input.name,
        category: emptyToNull(input.category),
        description: emptyToNull(input.description),
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    const variantKey = createVariantKey({
      schoolId: input.schoolId,
      productId: product.id,
      sku: emptyToNull(input.sku),
      unit: input.unit,
      className: emptyToNull(input.className),
      sectionName: emptyToNull(input.sectionName),
      color: emptyToNull(input.color),
      size: emptyToNull(input.size),
    });

    const variant = await tx.productVariant.create({
      data: {
        productId: product.id,
        variantKey,
        sku: emptyToNull(input.sku),
        barcode: emptyToNull(input.barcode),
        unit: input.unit,

        className: emptyToNull(input.className),
        sectionName: emptyToNull(input.sectionName),
        color: emptyToNull(input.color),
        size: emptyToNull(input.size),

        salePrice: input.salePrice.toFixed(2),
        costPrice: toDecimalString(input.costPrice),
        mrp: toDecimalString(input.mrp),
        wholesaleRate: toDecimalString(input.wholesaleRate),

        isActive: true,
      },
      select: {
        id: true,
      },
    });

    await tx.inventoryStock.create({
      data: {
        schoolId: input.schoolId,
        productVariantId: variant.id,
        quantity: input.quantity,
        reorderLevel: input.reorderLevel,
      },
    });

    if (input.quantity > 0) {
      await tx.stockMovement.create({
        data: {
          schoolId: input.schoolId,
          productVariantId: variant.id,
          type: StockMovementType.OPENING_STOCK,
          quantity: input.quantity,
          beforeQty: 0,
          afterQty: input.quantity,
          referenceType: "PRODUCT_CREATE",
          referenceId: product.id,
          note: `Opening stock added while creating product by ${user.email}`,
          createdById: user.id,
        },
      });
    }
  });

  revalidatePath("/products");
  revalidatePath("/inventory");
  redirect("/products");
}

export async function updateProductAction(
  productId: string,
  formData: FormData
) {
  const user = await requireUser();
  const input = readProductFormData(formData);

  const product = await prisma.product.findUnique({
    where: {
      id: productId,
    },
    include: {
      variants: {
        orderBy: {
          createdAt: "asc",
        },
        take: 1,
      },
    },
  });

  if (!product || product.deletedAt) {
    throw new Error("Product not found.");
  }

  const duplicateProduct = await prisma.product.findFirst({
    where: {
      schoolId: product.schoolId,
      name: input.name,
      deletedAt: null,
      NOT: {
        id: productId,
      },
    },
    select: {
      id: true,
    },
  });

  if (duplicateProduct) {
    throw new Error("Another product with this name already exists in this school.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: {
        id: productId,
      },
      data: {
        name: input.name,
        category: emptyToNull(input.category),
        description: emptyToNull(input.description),
        isActive: true,
      },
    });

    let variant = product.variants[0];

    if (!variant) {
      const variantKey = createVariantKey({
        schoolId: product.schoolId,
        productId,
        sku: emptyToNull(input.sku),
        unit: input.unit,
        className: emptyToNull(input.className),
        sectionName: emptyToNull(input.sectionName),
        color: emptyToNull(input.color),
        size: emptyToNull(input.size),
      });

      variant = await tx.productVariant.create({
        data: {
          productId,
          variantKey,
          sku: emptyToNull(input.sku),
          barcode: emptyToNull(input.barcode),
          unit: input.unit,

          className: emptyToNull(input.className),
          sectionName: emptyToNull(input.sectionName),
          color: emptyToNull(input.color),
          size: emptyToNull(input.size),

          salePrice: input.salePrice.toFixed(2),
          costPrice: toDecimalString(input.costPrice),
          mrp: toDecimalString(input.mrp),
          wholesaleRate: toDecimalString(input.wholesaleRate),

          isActive: true,
        },
      });
    } else {
      const variantKey = createVariantKey({
        schoolId: product.schoolId,
        productId,
        sku: emptyToNull(input.sku),
        unit: input.unit,
        className: emptyToNull(input.className),
        sectionName: emptyToNull(input.sectionName),
        color: emptyToNull(input.color),
        size: emptyToNull(input.size),
      });

      variant = await tx.productVariant.update({
        where: {
          id: variant.id,
        },
        data: {
          variantKey,
          sku: emptyToNull(input.sku),
          barcode: emptyToNull(input.barcode),
          unit: input.unit,

          className: emptyToNull(input.className),
          sectionName: emptyToNull(input.sectionName),
          color: emptyToNull(input.color),
          size: emptyToNull(input.size),

          salePrice: input.salePrice.toFixed(2),
          costPrice: toDecimalString(input.costPrice),
          mrp: toDecimalString(input.mrp),
          wholesaleRate: toDecimalString(input.wholesaleRate),

          isActive: true,
        },
      });
    }

    const existingStock = await tx.inventoryStock.findUnique({
      where: {
        schoolId_productVariantId: {
          schoolId: product.schoolId,
          productVariantId: variant.id,
        },
      },
      select: {
        quantity: true,
      },
    });

    const beforeQty = existingStock?.quantity ?? 0;
    const afterQty = input.quantity;

    await tx.inventoryStock.upsert({
      where: {
        schoolId_productVariantId: {
          schoolId: product.schoolId,
          productVariantId: variant.id,
        },
      },
      update: {
        quantity: afterQty,
        reorderLevel: input.reorderLevel,
      },
      create: {
        schoolId: product.schoolId,
        productVariantId: variant.id,
        quantity: afterQty,
        reorderLevel: input.reorderLevel,
      },
    });

    if (beforeQty !== afterQty) {
      await tx.stockMovement.create({
        data: {
          schoolId: product.schoolId,
          productVariantId: variant.id,
          type:
            afterQty > beforeQty
              ? StockMovementType.ADJUSTMENT_IN
              : StockMovementType.ADJUSTMENT_OUT,
          quantity: afterQty - beforeQty,
          beforeQty,
          afterQty,
          referenceType: "PRODUCT_EDIT",
          referenceId: product.id,
          note: `Stock adjusted while editing product by ${user.email}`,
          createdById: user.id,
        },
      });
    }
  });

  revalidatePath("/products");
  revalidatePath("/inventory");
  redirect("/products");
}

export async function deleteProductAction(productId: string) {
  await requireUser();

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: {
        id: productId,
      },
      data: {
        isActive: false,
        deletedAt: new Date(),
        variants: {
          updateMany: {
            where: {},
            data: {
              isActive: false,
            },
          },
        },
      },
    });
  });

  revalidatePath("/products");
  revalidatePath("/inventory");
}