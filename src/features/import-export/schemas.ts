export type ParsedProductImportRow = {
  rowNumber: number;
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
  quantity: number;
  reorderLevel: number;
};

export type ProductImportRowError = {
  rowNumber: number;
  error: string;
};

export const PRODUCT_IMPORT_HEADERS = [
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
  "Opening Stock",
  "Reorder Level",
] as const;