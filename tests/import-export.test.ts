import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import {
  parseProductsImportBuffer,
  parseStudentsImportBuffer,
} from "../src/features/import-export/excel-import";

async function workbookBuffer(headers: string[], rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output as ArrayBuffer);
}

test("product import accepts legacy Branch/Warehouse opening-stock workbook", async () => {
  const buffer = await workbookBuffer(
    ["Branch", "Warehouse", "Item", "Code", "SIZE", "Qty(Opening stock)", "MRP", "Price"],
    [["HP GHOSH MEMORIAL SCHOOL", "HP GHOSH MEMORIAL SCHOOL", "School Shirt", "SHIRT-32", "32", 14, 500, 450]],
  );

  const rows = await parseProductsImportBuffer(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].school, "HP GHOSH MEMORIAL SCHOOL");
  assert.equal(rows[0].name, "School Shirt");
  assert.equal(rows[0].sku, "SHIRT-32");
  assert.equal(rows[0].size, "32");
  assert.equal(rows[0].quantity, 14);
  assert.equal(rows[0].salePrice, "450.00");
  assert.equal(rows[0].mrp, "500.00");
});

test("product import accepts School Code, Current Stock, GST and HSN", async () => {
  const buffer = await workbookBuffer(
    ["School Code", "Product Name", "SKU", "Sale Price", "Current Stock", "GST Rate", "HSN Code", "Reorder Level"],
    [["TALDI", "School Bag", "BAG-01", 1000, 25, 18, "4202", 5]],
  );

  const rows = await parseProductsImportBuffer(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].schoolCode, "TALDI");
  assert.equal(rows[0].quantity, 25);
  assert.equal(rows[0].gstRate, "18.00");
  assert.equal(rows[0].hsnCode, "4202");
  assert.equal(rows[0].reorderLevel, 5);
});

test("product import rejects a workbook with no school mapping column", async () => {
  const buffer = await workbookBuffer(
    ["Product Name", "SKU", "Sale Price", "Current Stock"],
    [["School Bag", "BAG-01", 1000, 25]],
  );

  await assert.rejects(
    () => parseProductsImportBuffer(buffer),
    /Missing school column/i,
  );
});

test("student import reads required name, class and contact number", async () => {
  const buffer = await workbookBuffer(
    ["Student Name", "Class", "Section", "Contact Number", "Admission No"],
    [["Rahul Sen", "V", "A", "9876543210", "ADM-1001"]],
  );

  const rows = await parseStudentsImportBuffer(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Rahul Sen");
  assert.equal(rows[0].className, "V");
  assert.equal(rows[0].sectionName, "A");
  assert.equal(rows[0].parentPhone, "9876543210");
  assert.equal(rows[0].admissionNo, "ADM-1001");
});
