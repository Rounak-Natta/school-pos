import {
  createProductsExportBuffer,
  type ProductExportRow,
} from "@/features/import-export/excel-export";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(arrayBuffer).set(data);
  return arrayBuffer;
}

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  const url = new URL(request.url);
  const schoolId = url.searchParams.get("schoolId") || "";

  const inventory = await prisma.inventoryStock.findMany({
    where: {
      ...(schoolId
        ? {
            schoolId,
          }
        : {}),
      productVariant: {
        isActive: true,
        product: {
          deletedAt: null,
          isActive: true,
        },
      },
    },
    include: {
      school: true,
      productVariant: {
        include: {
          product: true,
        },
      },
    },
    orderBy: [
      {
        school: {
          name: "asc",
        },
      },
      {
        productVariant: {
          product: {
            name: "asc",
          },
        },
      },
    ],
  });

  const rows: ProductExportRow[] = inventory.map((stock) => {
    const variant = stock.productVariant;
    const product = variant.product;

    return {
      school: stock.school.name,
      schoolCode: stock.school.code,
      name: product.name,
      category: product.category || "",
      sku: variant.sku || "",
      barcode: variant.barcode || "",
      unit: variant.unit,
      className: variant.className || "",
      sectionName: variant.sectionName || "",
      size: variant.size || "",
      color: variant.color || "",
      salePrice: Number(variant.salePrice),
      mrp: variant.mrp ? Number(variant.mrp) : "",
      costPrice: variant.costPrice ? Number(variant.costPrice) : "",
      wholesaleRate: variant.wholesaleRate ? Number(variant.wholesaleRate) : "",
      quantity: stock.quantity,
      reorderLevel: stock.reorderLevel,
    };
  });

  const buffer = await createProductsExportBuffer(rows);
  const body = toArrayBuffer(buffer);

  const fileName = schoolId
    ? "products-export-school-wise.xlsx"
    : "products-export-all-schools.xlsx";

  return new Response(body, {
    headers: {
      "Content-Type": EXCEL_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}