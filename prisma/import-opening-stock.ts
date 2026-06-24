import "dotenv/config";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient, StockMovementType } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

type ParsedRow = {
  warehouse: string;
  item: string;
  code: string;
  unit: string;
  size?: string;
  barcode?: string;
  qty: number;
  rate?: string;
  mrp?: string;
  salesRate?: string;
  wholesaleRate?: string;
};

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function toNumber(value: unknown): number {
  const cleaned = clean(value).replace(/,/g, "");
  if (!cleaned) return 0;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDecimalString(value: unknown): string | undefined {
  const cleaned = clean(value).replace(/,/g, "");
  if (!cleaned) return undefined;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return undefined;

  return parsed.toFixed(2);
}

function createSchoolCode(name: string) {
  return name
    .toUpperCase()
    .replace(/THE\s+/g, "")
    .replace(/SCHOOL/g, "SCH")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function createVariantKey(row: ParsedRow) {
  return [
    row.item,
    row.code,
    row.unit,
    row.size ?? "",
    row.barcode ?? "",
  ]
    .map((part) => part.toUpperCase().trim())
    .join("|");
}

function getCell(row: ExcelJS.Row, index?: number) {
  if (!index) return "";
  return row.getCell(index).value;
}

async function main() {
  const filePath = path.join(process.cwd(), "data", "opening-stock.xlsx");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("No worksheet found in Excel file.");
  }

  let headerRowNumber = 0;
  const headerMap = new Map<string, number>();

  worksheet.eachRow((row, rowNumber) => {
    const values = row.values as unknown[];

    const normalizedValues = values.map((value) =>
      clean(value).toLowerCase()
    );

    const hasWarehouse = normalizedValues.includes("warehouse");
    const hasItem = normalizedValues.includes("item");
    const hasCode = normalizedValues.includes("code");

    if (hasWarehouse && hasItem && hasCode && headerRowNumber === 0) {
      headerRowNumber = rowNumber;

      row.eachCell((cell, colNumber) => {
        const header = clean(cell.value).toLowerCase();
        if (header) {
          headerMap.set(header, colNumber);
        }
      });
    }
  });

  if (!headerRowNumber) {
    throw new Error("Header row not found. Expected columns: Warehouse, Item, Code.");
  }

  const col = {
    warehouse: headerMap.get("warehouse"),
    item: headerMap.get("item"),
    code: headerMap.get("code"),
    unit: headerMap.get("unit"),
    attribute1: headerMap.get("attribute1"),
    attribute2: headerMap.get("attribute2"),
    attribute3: headerMap.get("attribute3"),
    barcode: headerMap.get("barcode"),
    qty: headerMap.get("qty"),
    rate: headerMap.get("rate"),
    mrp: headerMap.get("mrp"),
    salesRate: headerMap.get("salesrate"),
    wholesaleRate: headerMap.get("wholesalerate"),
  };

  const parsedRows: ParsedRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const warehouse = clean(getCell(row, col.warehouse));
    const item = clean(getCell(row, col.item));
    const code = clean(getCell(row, col.code));
    const unit = clean(getCell(row, col.unit)) || "PCS";

    if (!warehouse || !item || !code) return;

    const size =
      clean(getCell(row, col.attribute2)) ||
      clean(getCell(row, col.attribute1)) ||
      clean(getCell(row, col.attribute3)) ||
      undefined;

    parsedRows.push({
      warehouse,
      item,
      code,
      unit,
      size,
      barcode: clean(getCell(row, col.barcode)) || undefined,
      qty: toNumber(getCell(row, col.qty)),
      rate: toDecimalString(getCell(row, col.rate)),
      mrp: toDecimalString(getCell(row, col.mrp)),
      salesRate: toDecimalString(getCell(row, col.salesRate)),
      wholesaleRate: toDecimalString(getCell(row, col.wholesaleRate)),
    });
  });

  console.log(`Rows found: ${parsedRows.length}`);

  let createdProducts = 0;
  let createdVariants = 0;
  let updatedStocks = 0;
  let createdMovements = 0;

  for (const row of parsedRows) {
    const school = await prisma.school.upsert({
      where: {
        code: createSchoolCode(row.warehouse),
      },
      update: {
        name: row.warehouse,
        isActive: true,
      },
      create: {
        name: row.warehouse,
        code: createSchoolCode(row.warehouse),
        isActive: true,
      },
    });

    let product = await prisma.product.findFirst({
      where: {
        name: row.item,
        deletedAt: null,
      },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          name: row.item,
          isActive: true,
        },
      });

      createdProducts++;
    }

    const variantKey = createVariantKey(row);

    const existingVariant = await prisma.productVariant.findUnique({
      where: {
        variantKey,
      },
    });

    const variant = await prisma.productVariant.upsert({
      where: {
        variantKey,
      },
      update: {
        sku: row.code,
        barcode: row.barcode,
        unit: row.unit,
        size: row.size,
        costPrice: row.rate,
        salePrice: row.salesRate ?? "0.00",
        mrp: row.mrp,
        wholesaleRate: row.wholesaleRate,
        isActive: true,
      },
      create: {
        productId: product.id,
        variantKey,
        sku: row.code,
        barcode: row.barcode,
        unit: row.unit,
        size: row.size,
        costPrice: row.rate,
        salePrice: row.salesRate ?? "0.00",
        mrp: row.mrp,
        wholesaleRate: row.wholesaleRate,
        isActive: true,
      },
    });

    if (!existingVariant) {
      createdVariants++;
    }

    const existingStock = await prisma.inventoryStock.findUnique({
      where: {
        schoolId_productVariantId: {
          schoolId: school.id,
          productVariantId: variant.id,
        },
      },
    });

    const beforeQty = existingStock?.quantity ?? 0;
    const afterQty = row.qty;

    await prisma.inventoryStock.upsert({
      where: {
        schoolId_productVariantId: {
          schoolId: school.id,
          productVariantId: variant.id,
        },
      },
      update: {
        quantity: afterQty,
      },
      create: {
        schoolId: school.id,
        productVariantId: variant.id,
        quantity: afterQty,
      },
    });

    updatedStocks++;

    if (beforeQty !== afterQty) {
      await prisma.stockMovement.create({
        data: {
          schoolId: school.id,
          productVariantId: variant.id,
          type: StockMovementType.OPENING_STOCK,
          quantity: afterQty - beforeQty,
          beforeQty,
          afterQty,
          referenceType: "OPENING_STOCK_IMPORT",
          referenceId: variant.id,
          note: `Opening stock imported from Excel for ${row.warehouse}`,
        },
      });

      createdMovements++;
    }
  }

  console.log("Opening stock import completed.");
  console.log({
    createdProducts,
    createdVariants,
    updatedStocks,
    createdMovements,
  });
}

main()
  .catch((error) => {
    console.error("Import failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });