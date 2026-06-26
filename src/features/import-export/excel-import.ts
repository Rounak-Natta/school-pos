import ExcelJS from "exceljs";
import { ParsedProductImportRow } from "@/features/import-export/schemas";

function clean(value: unknown): string {
  if (value === null || value === undefined) return "";

  if (typeof value === "object") {
    const objectValue = value as {
      text?: unknown;
      result?: unknown;
      richText?: Array<{ text?: unknown }>;
    };

    if (objectValue.text !== undefined) {
      return clean(objectValue.text);
    }

    if (objectValue.result !== undefined) {
      return clean(objectValue.result);
    }

    if (Array.isArray(objectValue.richText)) {
      return objectValue.richText
        .map((item) => clean(item.text))
        .join("")
        .trim();
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

function toNumber(value: unknown): number {
  const cleaned = clean(value).replace(/,/g, "");

  if (!cleaned) return 0;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return 0;

  return Math.trunc(parsed);
}

function toDecimalString(value: unknown): string | null {
  const cleaned = clean(value).replace(/,/g, "");

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) return null;

  return parsed.toFixed(2);
}

function findColumn(
  headers: Map<string, number>,
  aliases: string[]
): number | undefined {
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeader(alias);
    const exact = headers.get(normalizedAlias);

    if (exact !== undefined) {
      return exact;
    }
  }

  for (const [header, index] of headers.entries()) {
    const matched = aliases.some((alias) => {
      const normalizedAlias = normalizeHeader(alias);
      return header.includes(normalizedAlias) || normalizedAlias.includes(header);
    });

    if (matched) {
      return index;
    }
  }

  return undefined;
}

export async function parseProductsImportBuffer(
  buffer: Buffer
): Promise<ParsedProductImportRow[]> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error(
      "Unable to read Excel file. Please upload a valid .xlsx file downloaded from the template."
    );
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("No worksheet found in Excel file.");
  }

  const headerRow = worksheet.getRow(1);
  const headers = new Map<string, number>();

  headerRow.eachCell((cell, columnNumber) => {
    const header = normalizeHeader(cell.value);

    if (header) {
      headers.set(header, columnNumber);
    }
  });

  const columns = {
    name: findColumn(headers, ["Product Name", "Product", "Item", "Name"]),
    category: findColumn(headers, ["Category"]),
    sku: findColumn(headers, [
      "SKU",
      "Shortcode",
      "Short Code",
      "Code",
      "Item Code",
    ]),
    barcode: findColumn(headers, ["Barcode", "Bar Code"]),
    unit: findColumn(headers, ["Unit"]),
    className: findColumn(headers, ["Class", "Class Name"]),
    sectionName: findColumn(headers, ["Section", "Section Name"]),
    size: findColumn(headers, ["Size"]),
    color: findColumn(headers, ["Color", "Colour"]),
    salePrice: findColumn(headers, [
      "Sale Price",
      "Selling Price",
      "Price",
      "Sales Rate",
    ]),
    mrp: findColumn(headers, ["MRP"]),
    costPrice: findColumn(headers, ["Cost Price", "Cost", "Purchase Price"]),
    wholesaleRate: findColumn(headers, ["Wholesale Rate", "Wholesale"]),
    quantity: findColumn(headers, [
      "Opening Stock",
      "Current Stock",
      "Quantity",
      "Qty",
      "Stock",
      "Stock Qty",
    ]),
    reorderLevel: findColumn(headers, ["Reorder Level", "Reorder"]),
  };

  if (
    columns.name === undefined ||
    columns.sku === undefined ||
    columns.salePrice === undefined ||
    columns.quantity === undefined
  ) {
    throw new Error(
      "Missing required columns. Required: Product Name, SKU, Sale Price, Opening Stock."
    );
  }

  const rows: ParsedProductImportRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const name = clean(row.getCell(columns.name!).value);
    const sku = clean(row.getCell(columns.sku!).value);

    if (!name && !sku) return;

    rows.push({
      rowNumber,
      name,
      category:
        columns.category !== undefined
          ? clean(row.getCell(columns.category).value)
          : undefined,
      sku,
      barcode:
        columns.barcode !== undefined
          ? clean(row.getCell(columns.barcode).value)
          : undefined,
      unit:
        columns.unit !== undefined
          ? clean(row.getCell(columns.unit).value) || "PCS"
          : "PCS",
      className:
        columns.className !== undefined
          ? clean(row.getCell(columns.className).value)
          : undefined,
      sectionName:
        columns.sectionName !== undefined
          ? clean(row.getCell(columns.sectionName).value)
          : undefined,
      size:
        columns.size !== undefined
          ? clean(row.getCell(columns.size).value)
          : undefined,
      color:
        columns.color !== undefined
          ? clean(row.getCell(columns.color).value)
          : undefined,
      salePrice:
        toDecimalString(row.getCell(columns.salePrice!).value) || "0.00",
      mrp:
        columns.mrp !== undefined
          ? toDecimalString(row.getCell(columns.mrp).value)
          : null,
      costPrice:
        columns.costPrice !== undefined
          ? toDecimalString(row.getCell(columns.costPrice).value)
          : null,
      wholesaleRate:
        columns.wholesaleRate !== undefined
          ? toDecimalString(row.getCell(columns.wholesaleRate).value)
          : null,
      quantity:
        columns.quantity !== undefined
          ? toNumber(row.getCell(columns.quantity).value)
          : 0,
      reorderLevel:
        columns.reorderLevel !== undefined
          ? toNumber(row.getCell(columns.reorderLevel).value)
          : 0,
    });
  });

  return rows;
}