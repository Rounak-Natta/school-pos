import ExcelJS from "exceljs";

import {
  PRODUCT_IMPORT_HEADERS,
  STUDENT_IMPORT_HEADERS,
} from "@/features/import-export/schemas";
import {
  CLASS_OPTIONS,
  COLOR_OPTIONS,
  PRODUCT_CATEGORIES,
  PRODUCT_NAME_OPTIONS,
  SECTION_OPTIONS,
  SIZE_OPTIONS,
  SKU_OPTIONS,
  UNIT_OPTIONS,
} from "@/features/products/options";

export type ProductExportRow = {
  school: string;
  schoolCode: string;
  name: string;
  category: string;
  sku: string;
  barcode: string;
  unit: string;
  className: string;
  sectionName: string;
  size: string;
  color: string;
  salePrice: number;
  mrp: number | "";
  costPrice: number | "";
  wholesaleRate: number | "";
  gstRate: number;
  hsnCode: string;
  quantity: number;
  reorderLevel: number;
};

function addHeaderStyle(worksheet: ExcelJS.Worksheet): void {
  const headerRow = worksheet.getRow(1);

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF111827" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addOptionSheet(
  workbook: ExcelJS.Workbook,
  schools: Array<{ name: string; code: string }> = [],
) {
  const optionSheet = workbook.addWorksheet("Options");
  optionSheet.state = "veryHidden";

  const groups = [
    { title: "Product Names", values: PRODUCT_NAME_OPTIONS, column: 1 },
    { title: "Categories", values: PRODUCT_CATEGORIES, column: 2 },
    { title: "SKUs", values: SKU_OPTIONS, column: 3 },
    { title: "Units", values: UNIT_OPTIONS, column: 4 },
    { title: "Classes", values: CLASS_OPTIONS, column: 5 },
    { title: "Sections", values: SECTION_OPTIONS, column: 6 },
    { title: "Sizes", values: SIZE_OPTIONS, column: 7 },
    { title: "Colors", values: COLOR_OPTIONS, column: 8 },
    { title: "Schools", values: schools.map((school) => school.name), column: 9 },
    { title: "School Codes", values: schools.map((school) => school.code), column: 10 },
  ];

  for (const group of groups) {
    optionSheet.getCell(1, group.column).value = group.title;
    group.values.forEach((value, index) => {
      optionSheet.getCell(index + 2, group.column).value = value;
    });
  }

  return {
    productNames: `'Options'!$A$2:$A$${PRODUCT_NAME_OPTIONS.length + 1}`,
    categories: `'Options'!$B$2:$B$${PRODUCT_CATEGORIES.length + 1}`,
    skus: `'Options'!$C$2:$C$${SKU_OPTIONS.length + 1}`,
    units: `'Options'!$D$2:$D$${UNIT_OPTIONS.length + 1}`,
    classes: `'Options'!$E$2:$E$${CLASS_OPTIONS.length + 1}`,
    sections: `'Options'!$F$2:$F$${SECTION_OPTIONS.length + 1}`,
    sizes: `'Options'!$G$2:$G$${SIZE_OPTIONS.length + 1}`,
    colors: `'Options'!$H$2:$H$${COLOR_OPTIONS.length + 1}`,
    schools:
      schools.length > 0
        ? `'Options'!$I$2:$I$${schools.length + 1}`
        : null,
    schoolCodes:
      schools.length > 0
        ? `'Options'!$J$2:$J$${schools.length + 1}`
        : null,
  };
}

function addDropdown(
  worksheet: ExcelJS.Worksheet,
  columnLetter: string,
  fromRow: number,
  toRow: number,
  formula: string,
  allowBlank = true,
): void {
  for (let rowNumber = fromRow; rowNumber <= toRow; rowNumber++) {
    worksheet.getCell(`${columnLetter}${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: "Invalid option",
      error: "Please select a value from the dropdown list.",
    };
  }
}

async function workbookToUint8Array(
  workbook: ExcelJS.Workbook,
): Promise<Uint8Array> {
  const data = (await workbook.xlsx.writeBuffer()) as unknown;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data as ArrayBufferLike);
}

export async function createProductsTemplateBuffer(
  schools: Array<{ name: string; code: string }> = [],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "School POS";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Products Import");
  const ranges = addOptionSheet(workbook, schools);

  worksheet.columns = PRODUCT_IMPORT_HEADERS.map((header) => ({
    header,
    key: header,
    width:
      header === "Product Name"
        ? 30
        : header === "Wholesale Rate" || header === "Opening Stock"
          ? 18
          : header === "Reorder Level"
            ? 16
            : 14,
  }));

  addHeaderStyle(worksheet);

  // School / School Code make the workbook safe for one-file multi-school imports.
  const firstSchool = schools[0] ?? { name: "School Name", code: "SCHOOL-CODE" };
  const secondSchool = schools[1] ?? firstSchool;

  // GST is percentage (e.g. 5 means 5%). Existing products can keep 0.
  worksheet.addRow([
    firstSchool.name,
    firstSchool.code,
    "Half Shirt",
    "Uniform",
    "HS24",
    "",
    "PCS",
    "Not Applicable",
    "Not Applicable",
    "24",
    "Not Applicable",
    200,
    220,
    150,
    180,
    5,
    "6205",
    10,
    3,
  ]);

  worksheet.addRow([
    secondSchool.name,
    secondSchool.code,
    "T-Shirt Red House",
    "House Uniform",
    "TSR24",
    "",
    "PCS",
    "Not Applicable",
    "Not Applicable",
    "24",
    "Red",
    250,
    280,
    190,
    220,
    5,
    "6109",
    10,
    3,
  ]);

  if (ranges.schools) addDropdown(worksheet, "A", 2, 1000, ranges.schools, false);
  if (ranges.schoolCodes)
    addDropdown(worksheet, "B", 2, 1000, ranges.schoolCodes, false);
  addDropdown(worksheet, "C", 2, 1000, ranges.productNames, false);
  addDropdown(worksheet, "D", 2, 1000, ranges.categories, false);
  addDropdown(worksheet, "E", 2, 1000, ranges.skus, false);
  addDropdown(worksheet, "G", 2, 1000, ranges.units, false);
  addDropdown(worksheet, "H", 2, 1000, ranges.classes);
  addDropdown(worksheet, "I", 2, 1000, ranges.sections);
  addDropdown(worksheet, "J", 2, 1000, ranges.sizes);
  addDropdown(worksheet, "K", 2, 1000, ranges.colors);

  ["L", "M", "N", "O", "P"].forEach((column) => {
    worksheet.getColumn(column).numFmt = "0.00";
  });
  worksheet.getColumn("Q").numFmt = "@";
  ["R", "S"].forEach((column) => {
    worksheet.getColumn(column).numFmt = "0";
  });

  return workbookToUint8Array(workbook);
}

export async function createProductsExportBuffer(
  rows: ProductExportRow[],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "School POS";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Products Export");

  worksheet.columns = [
    { header: "School", key: "school", width: 36 },
    { header: "School Code", key: "schoolCode", width: 18 },
    { header: "Product Name", key: "name", width: 30 },
    { header: "Category", key: "category", width: 24 },
    { header: "SKU", key: "sku", width: 16 },
    { header: "Barcode", key: "barcode", width: 20 },
    { header: "Unit", key: "unit", width: 12 },
    { header: "Class", key: "className", width: 18 },
    { header: "Section", key: "sectionName", width: 14 },
    { header: "Size", key: "size", width: 12 },
    { header: "Color", key: "color", width: 18 },
    { header: "Sale Price", key: "salePrice", width: 14 },
    { header: "MRP", key: "mrp", width: 14 },
    { header: "Cost Price", key: "costPrice", width: 14 },
    { header: "Wholesale Rate", key: "wholesaleRate", width: 18 },
    { header: "GST Rate", key: "gstRate", width: 12 },
    { header: "HSN Code", key: "hsnCode", width: 14 },
    { header: "Current Stock", key: "quantity", width: 16 },
    { header: "Reorder Level", key: "reorderLevel", width: 16 },
  ];

  addHeaderStyle(worksheet);
  rows.forEach((row) => worksheet.addRow(row));

  ["L", "M", "N", "O", "P"].forEach((column) => {
    worksheet.getColumn(column).numFmt = "0.00";
  });
  worksheet.getColumn("Q").numFmt = "@";
  ["R", "S"].forEach((column) => {
    worksheet.getColumn(column).numFmt = "0";
  });

  return workbookToUint8Array(workbook);
}

export async function createStudentsTemplateBuffer(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "School POS";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("Students Import");

  worksheet.columns = STUDENT_IMPORT_HEADERS.map((header) => ({
    header,
    key: header,
    width:
      header === "Student Name" || header === "Parent / Guardian"
        ? 24
        : header === "Address"
          ? 32
          : 18,
  }));

  addHeaderStyle(worksheet);
  worksheet.addRow([
    "Aarav Sharma",
    "5",
    "A",
    "ADM-1001",
    "12",
    "Rahul Sharma",
    "9876543210",
    "Kolkata",
  ]);
  worksheet.getColumn("G").numFmt = "@";

  return workbookToUint8Array(workbook);
}
