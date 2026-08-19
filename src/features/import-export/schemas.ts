export type ParsedProductImportRow = {
  rowNumber: number;
  school?: string;
  schoolCode?: string;
  name: string;
  category?: string;
  sku: string;
  barcode?: string;
  unit: string;
  className?: string;
  sectionName?: string;
  size?: string;
  color?: string;
  salePrice: string;
  mrp?: string | null;
  costPrice?: string | null;
  wholesaleRate?: string | null;
  gstRate: string;
  hsnCode?: string;
  quantity: number;
  reorderLevel: number;
};

export type ProductImportRowError = {
  rowNumber: number;
  error: string;
  school?: string;
  schoolCode?: string;
  name?: string;
  sku?: string;
};

export const PRODUCT_IMPORT_HEADERS = [
  "School",
  "School Code",
  "Product Name",
  "Category",
  "SKU",
  "Barcode",
  "Unit",
  "Class",
  "Section",
  "Size",
  "Color",
  "Sale Price",
  "MRP",
  "Cost Price",
  "Wholesale Rate",
  "GST Rate",
  "HSN Code",
  "Opening Stock",
  "Reorder Level",
] as const;

export type ParsedStudentImportRow = {
  rowNumber: number;
  name: string;
  className: string;
  sectionName?: string;
  admissionNo?: string;
  rollNumber?: string;
  parentName?: string;
  parentPhone: string;
  address?: string;
};

export type StudentImportRowError = {
  rowNumber: number;
  error: string;
  name?: string;
  className?: string;
  parentPhone?: string;
};

export const STUDENT_IMPORT_HEADERS = [
  "Student Name",
  "Class",
  "Section",
  "Admission No",
  "Roll No",
  "Parent / Guardian",
  "Contact Number",
  "Address",
] as const;
