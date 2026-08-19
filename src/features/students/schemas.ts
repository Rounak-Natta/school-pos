import { z } from "zod";

export const studentFormSchema = z.object({
  schoolId: z.string().min(1, "School is required"),
  name: z.string().trim().min(1, "Student name is required"),
  className: z.string().trim().min(1, "Class is required"),
  sectionName: z.string().trim().optional(),
  admissionNo: z.string().trim().optional(),
  rollNumber: z.string().trim().optional(),
  parentName: z.string().trim().optional(),
  parentPhone: z.string().trim().min(6, "Contact number is required"),
  address: z.string().trim().optional(),
});

export type StudentFormInput = z.infer<typeof studentFormSchema>;
