import { z } from "zod";

export const schoolFormSchema = z.object({
  name: z.string().trim().min(2, "School name is required."),
  code: z
    .string()
    .trim()
    .min(2, "School code is required.")
    .max(30, "School code is too long.")
    .regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, hyphen and underscore."),
  address: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.string().trim().email("Enter a valid email."), z.literal("")]).optional(),
});
