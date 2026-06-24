import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PrismaClient, StockMovementType } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

type ParsedRow = {
  branch: string;
  warehouse: string;
  item: string;
  code: string;
  unit: string;
  size?: string;
  barcode?: string;
  qty: number;
  mrp?: string;
  price?: string;
};

const SUPPORTED_FILES = [
  "opening-stock.xlsx",
  "opening-stock.tsv",
  "opening-stock.csv",
  "opening-stock.txt",
];

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "object" && value !== null) {
    const objectValue = value as Record<string, unknown>;

    if (Array.isArray(objectValue.richText)) {
      return objectValue.richText
        .map((part) => {
          if (typeof part === "object" && part !== null && "text" in part) {
            return String((part as { text?: unknown }).text ?? "");
          }

          return "";
        })
        .join("")
        .trim()
        .replace(/\s+/g, " ");
    }

    if ("text" in objectValue) {
      return clean(objectValue.text);
    }

    if ("result" in objectValue) {
      return clean(objectValue.result);
    }
  }

  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeHeader(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeKey(value: unknown): string {
  return clean(value).toUpperCase().replace(/\s+/g, " ");
}

function toNumber(value: unknown): number {
  const cleaned = clean(value).replace(/,/g, "");

  if (!cleaned) return 0;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return 0;

  return Math.trunc(parsed);
}

function toDecimalString(value: unknown): string | undefined {
  const cleaned = clean(value).replace(/,/g, "");

  if (!cleaned) return undefined;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return undefined;

  return parsed.toFixed(2);
}

function createSchoolCodeBase(name: string) {
  return normalizeKey(name)
    .replace(/THE\s+/g, "")
    .replace(/SCHOOL/g, "SCH")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 35);
}

function createVariantKey(row: ParsedRow) {
  return [row.warehouse, row.item, row.code, row.unit, row.size ?? ""]
    .map((part) => normalizeKey(part))
    .join("|");
}

function inferColor(item: string): string | null {
  const text = normalizeKey(item);

  if (text.includes("RED HOUSE")) return "RED";
  if (text.includes("GREEN HOUSE")) return "GREEN";
  if (text.includes("YELLOW HOUSE")) return "YELLOW";
  if (text.includes("BLUE HOUSE")) return "BLUE";

  return null;
}

function findSourceFile() {
  const dataDir = path.join(process.cwd(), "data");

  for (const fileName of SUPPORTED_FILES) {
    const fullPath = path.join(dataDir, fileName);

    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  const oldXlsPath = path.join(dataDir, "opening-stock.xls");

  if (fs.existsSync(oldXlsPath)) {
    throw new Error(
      "Found opening-stock.xls. Please open it in Excel and save it as opening-stock.xlsx."
    );
  }

  throw new Error(
    "Opening stock file not found. Put it in data/opening-stock.xlsx, data/opening-stock.tsv, data/opening-stock.csv, or data/opening-stock.txt."
  );
}

async function readRowsFromXlsx(filePath: string): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("No worksheet found in Excel file.");
  }

  const maxColumn = worksheet.columnCount;
  const rows: string[][] = [];

  worksheet.eachRow((row) => {
    const values: string[] = [];

    for (let columnNumber = 1; columnNumber <= maxColumn; columnNumber++) {
      values.push(clean(row.getCell(columnNumber).value));
    }

    if (values.some(Boolean)) {
      rows.push(values);
    }
  });

  return rows;
}

function detectDelimiter(content: string) {
  if (content.includes("\t")) return "\t";
  return ",";
}

function readRowsFromText(filePath: string): string[][] {
  const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(content);

  return content
    .split(/\r?\n/)
    .map((line) => line.split(delimiter).map(clean))
    .filter((row) => row.some(Boolean));
}

async function readSourceRows(filePath: string): Promise<string[][]> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".xlsx") {
    return readRowsFromXlsx(filePath);
  }

  if ([".csv", ".tsv", ".txt"].includes(extension)) {
    return readRowsFromText(filePath);
  }

  throw new Error(`Unsupported file type: ${extension}`);
}

const columnAliases = {
  branch: ["Branch"],
  warehouse: ["Warehouse", "School", "School Name"],
  item: ["Item", "Product", "Product Name"],
  code: ["Code", "SKU", "Item Code"],
  unit: ["Unit"],
  size: ["SIZE", "Size", "Attribute2", "Attribute 2"],
  barcode: ["Barcode", "Bar Code"],
  qty: [
    "Qty(Opening stock)",
    "Qty Opening Stock",
    "Qty Opening",
    "Opening Stock",
    "Opening Qty",
    "Qty",
    "Quantity",
  ],
  mrp: ["MRP"],
  price: ["Price", "Sale Price", "Sales Price", "SalesRate", "Sales Rate"],
};

function hasHeader(row: string[], aliases: string[]) {
  const normalizedRow = row.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader);

  return normalizedRow.some((cell) => normalizedAliases.includes(cell));
}

function findHeaderRow(rows: string[][]) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    const hasWarehouse = hasHeader(row, columnAliases.warehouse);
    const hasItem = hasHeader(row, columnAliases.item);
    const hasCode = hasHeader(row, columnAliases.code);

    const normalizedRow = row.map(normalizeHeader);
    const normalizedQtyAliases = columnAliases.qty.map(normalizeHeader);

    const hasQty = normalizedRow.some(
      (cell) =>
        normalizedQtyAliases.includes(cell) ||
        cell.includes("qty") ||
        cell.includes("openingstock")
    );

    if (hasWarehouse && hasItem && hasCode && hasQty) {
      const headerMap = new Map<string, number>();

      row.forEach((cell, columnIndex) => {
        const header = normalizeHeader(cell);

        if (header) {
          headerMap.set(header, columnIndex);
        }
      });

      return {
        headerRowIndex: rowIndex,
        headerMap,
      };
    }
  }

  console.log("Could not find header row.");
  console.log("First 10 non-empty rows:");

  rows.slice(0, 10).forEach((row, index) => {
    console.log(index + 1, row);
  });

  throw new Error(
    "Header row not found. Expected: Warehouse, Item, Code, Qty(Opening stock)."
  );
}

function findColumn(
  headerMap: Map<string, number>,
  aliases: string[]
): number | undefined {
  const normalizedAliases = aliases.map(normalizeHeader);

  for (const alias of normalizedAliases) {
    const columnIndex = headerMap.get(alias);

    if (columnIndex !== undefined) {
      return columnIndex;
    }
  }

  for (const [header, columnIndex] of headerMap.entries()) {
    const matched = normalizedAliases.some(
      (alias) => header.includes(alias) || alias.includes(header)
    );

    if (matched) {
      return columnIndex;
    }
  }

  return undefined;
}

function getValue(row: string[], columnIndex?: number) {
  if (columnIndex === undefined) return "";
  return clean(row[columnIndex]);
}

function parseRows(rows: string[][]): ParsedRow[] {
  const { headerRowIndex, headerMap } = findHeaderRow(rows);

  const col = {
    branch: findColumn(headerMap, columnAliases.branch),
    warehouse: findColumn(headerMap, columnAliases.warehouse),
    item: findColumn(headerMap, columnAliases.item),
    code: findColumn(headerMap, columnAliases.code),
    unit: findColumn(headerMap, columnAliases.unit),
    size: findColumn(headerMap, columnAliases.size),
    barcode: findColumn(headerMap, columnAliases.barcode),
    qty: findColumn(headerMap, columnAliases.qty),
    mrp: findColumn(headerMap, columnAliases.mrp),
    price: findColumn(headerMap, columnAliases.price),
  };

  if (
    col.warehouse === undefined ||
    col.item === undefined ||
    col.code === undefined ||
    col.qty === undefined
  ) {
    console.log("Detected headers:", Object.fromEntries(headerMap));

    throw new Error(
      "Required columns missing. Need: Warehouse, Item, Code, Qty(Opening stock)."
    );
  }

  const parsedRows: ParsedRow[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];

    const branch = getValue(row, col.branch);
    const warehouse = getValue(row, col.warehouse) || branch;
    const item = getValue(row, col.item);
    const code = getValue(row, col.code);
    const unit = getValue(row, col.unit) || "PCS";
    const size = getValue(row, col.size) || undefined;

    if (!warehouse || !item || !code) continue;

    parsedRows.push({
      branch,
      warehouse,
      item,
      code,
      unit,
      size,
      barcode: getValue(row, col.barcode) || undefined,
      qty: toNumber(getValue(row, col.qty)),
      mrp: toDecimalString(getValue(row, col.mrp)),
      price: toDecimalString(getValue(row, col.price)),
    });
  }

  return parsedRows;
}

async function createUniqueSchoolCode(
  schoolName: string,
  usedCodes: Set<string>
) {
  const baseCode = createSchoolCodeBase(schoolName) || "SCHOOL";

  let code = baseCode;
  let counter = 2;

  while (usedCodes.has(code)) {
    code = `${baseCode}-${counter}`.slice(0, 40);
    counter++;
  }

  usedCodes.add(code);

  return code;
}

async function main() {
  const sourceFile = findSourceFile();

  console.log(`Reading file: ${sourceFile}`);

  const rows = await readSourceRows(sourceFile);
  const parsedRows = parseRows(rows);

  console.log(`Rows found: ${parsedRows.length}`);

  if (parsedRows.length === 0) {
    throw new Error("No valid data rows found after header.");
  }

  const existingSchools = await prisma.school.findMany({
    select: {
      id: true,
      name: true,
      code: true,
    },
  });

  const existingProducts = await prisma.product.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      schoolId: true,
      name: true,
    },
  });

  const schoolCache = new Map<
    string,
    {
      id: string;
      name: string;
      code: string;
    }
  >();

  const productCache = new Map<
    string,
    {
      id: string;
      schoolId: string;
      name: string;
    }
  >();

  const usedSchoolCodes = new Set<string>();

  for (const school of existingSchools) {
    schoolCache.set(normalizeKey(school.name), school);
    usedSchoolCodes.add(school.code);
  }

  for (const product of existingProducts) {
    const productKey = `${product.schoolId}|${normalizeKey(product.name)}`;
    productCache.set(productKey, product);
  }

  let createdSchools = 0;
  let createdProducts = 0;
  let createdVariants = 0;
  let updatedStocks = 0;
  let createdMovements = 0;

  for (const row of parsedRows) {
    const schoolKey = normalizeKey(row.warehouse);

    let school = schoolCache.get(schoolKey);

    if (!school) {
      const code = await createUniqueSchoolCode(row.warehouse, usedSchoolCodes);

      school = await prisma.school.create({
        data: {
          name: row.warehouse,
          code,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
      });

      schoolCache.set(schoolKey, school);
      createdSchools++;
    }

    const productKey = `${school.id}|${normalizeKey(row.item)}`;

    let product = productCache.get(productKey);

    if (!product) {
      product = await prisma.product.upsert({
        where: {
          schoolId_name: {
            schoolId: school.id,
            name: row.item,
          },
        },
        update: {
          isActive: true,
        },
        create: {
          schoolId: school.id,
          name: row.item,
          isActive: true,
        },
        select: {
          id: true,
          schoolId: true,
          name: true,
        },
      });

      productCache.set(productKey, product);
      createdProducts++;
    }

    const variantKey = createVariantKey(row);
    const color = inferColor(row.item);
    const salePrice = row.price ?? row.mrp ?? "0.00";
    const mrp = row.mrp ?? row.price ?? null;

    const existingVariant = await prisma.productVariant.findUnique({
      where: {
        variantKey,
      },
      select: {
        id: true,
      },
    });

    const variant = await prisma.productVariant.upsert({
      where: {
        variantKey,
      },
      update: {
        sku: row.code,
        barcode: row.barcode ?? null,
        unit: row.unit,
        size: row.size ?? null,
        color,
        mrp,
        salePrice,
        costPrice: null,
        wholesaleRate: null,
        isActive: true,
      },
      create: {
        productId: product.id,
        variantKey,
        sku: row.code,
        barcode: row.barcode ?? null,
        unit: row.unit,
        size: row.size ?? null,
        color,
        mrp,
        salePrice,
        costPrice: null,
        wholesaleRate: null,
        isActive: true,
      },
      select: {
        id: true,
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
      select: {
        quantity: true,
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
          note: `Opening stock imported for ${row.warehouse}`,
        },
      });

      createdMovements++;
    }
  }

  console.log("Opening stock import completed.");
  console.log({
    createdSchools,
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