import { z } from "zod";

export const transferCreateSchema = z.object({
  fromSchoolId: z.string().min(1),
  toSchoolId: z.string().min(1),
  note: z.string().optional(),
  items: z.array(z.object({ productVariantId: z.string().min(1), quantity: z.number().int().positive() })).min(1),
});
