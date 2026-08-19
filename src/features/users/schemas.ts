import { z } from "zod";
import { RoleName } from "@/generated/prisma/client";

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  schoolId: z.string().trim().min(1, "School is required."),
  role: z.nativeEnum(RoleName),
});
