import { z } from "zod";

export const productFormSchema = z.object({
  schoolId: z.string().min(1, "School is required"),
  name: z.string().min(1, "Product name is required"),
  category: z.string().optional(),
  description: z.string().optional(),

  sku: z.string().optional(),
  barcode: z.string().optional(),
  unit: z.string().min(1, "Unit is required").default("PCS"),

  className: z.string().optional(),
  sectionName: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),

  salePrice: z.coerce.number().min(0, "Sale price cannot be negative"),
  costPrice: z.coerce.number().min(0).optional(),
  mrp: z.coerce.number().min(0).optional(),
  wholesaleRate: z.coerce.number().min(0).optional(),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  hsnCode: z.string().trim().optional(),

  quantity: z.coerce.number().int().min(0, "Quantity cannot be negative"),
  reorderLevel: z.coerce.number().int().min(0).default(0),
});

export type ProductFormInput = z.infer<typeof productFormSchema>;