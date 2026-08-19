"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { studentFormSchema } from "@/features/students/schemas";
import { writeAuditLog } from "@/features/audit/audit-service";
import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, resolveAccessibleSchoolId, requirePermission } from "@/lib/rbac";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
function nullable(value: string) { return value ? value : null; }

export async function createStudentAction(formData: FormData) {
  const access = await getAccessScope();
  const input = studentFormSchema.parse({
    schoolId: clean(formData.get("schoolId")),
    name: clean(formData.get("name")),
    className: clean(formData.get("className")),
    sectionName: clean(formData.get("sectionName")),
    admissionNo: clean(formData.get("admissionNo")),
    rollNumber: clean(formData.get("rollNumber")),
    parentName: clean(formData.get("parentName")),
    parentPhone: clean(formData.get("parentPhone")),
    address: clean(formData.get("address")),
  });
  const schoolId = await resolveAccessibleSchoolId({ postedSchoolId: input.schoolId, access, permission: Permission.MANAGE_STUDENTS });

  await prisma.$transaction(async (tx) => {
    const student = await tx.student.create({
      data: {
        schoolId,
        name: input.name,
        className: input.className,
        sectionName: nullable(input.sectionName ?? ""),
        admissionNo: nullable(input.admissionNo ?? ""),
        rollNumber: nullable(input.rollNumber ?? ""),
        parentName: nullable(input.parentName ?? ""),
        parentPhone: input.parentPhone,
        address: nullable(input.address ?? ""),
      },
    });
    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId,
      action: "CREATE",
      entity: "STUDENT",
      entityId: student.id,
      newData: { name: student.name, className: student.className, parentPhone: student.parentPhone },
    });
  });
  revalidatePath("/students");
  revalidatePath("/pos");
  redirect("/students");
}

export async function toggleStudentAction(formData: FormData) {
  const access = await getAccessScope();
  const id = clean(formData.get("studentId"));
  const student = await prisma.student.findUnique({ where: { id }, select: { id: true, schoolId: true, isActive: true, name: true } });
  if (!student) throw new Error("Student not found.");
  requirePermission(access, Permission.MANAGE_STUDENTS, student.schoolId);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.student.update({ where: { id }, data: { isActive: !student.isActive, deletedAt: student.isActive ? new Date() : null } });
    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId: student.schoolId,
      action: updated.isActive ? "RESTORE" : "DEACTIVATE",
      entity: "STUDENT",
      entityId: id,
      oldData: { isActive: student.isActive },
      newData: { isActive: updated.isActive },
    });
  });
  revalidatePath("/students");
  revalidatePath("/pos");
}
