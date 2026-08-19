"use server";

import { revalidatePath } from "next/cache";

import { RoleName } from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { schoolFormSchema } from "@/features/schools/schemas";
import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, requirePermission } from "@/lib/rbac";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function nullable(value: string) {
  return value ? value : null;
}

export async function createSchoolAction(formData: FormData) {
  const access = await getAccessScope();
  requirePermission(access, Permission.MANAGE_SCHOOLS);

  const input = schoolFormSchema.parse({
    name: clean(formData.get("name")),
    code: clean(formData.get("code")),
    address: clean(formData.get("address")),
    phone: clean(formData.get("phone")),
    email: clean(formData.get("email")),
  });

  const code = input.code.toUpperCase();

  await prisma.$transaction(async (tx) => {
    const duplicate = await tx.school.findFirst({
      where: {
        OR: [
          { code },
          { name: { equals: input.name, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new Error("A school with this name or code already exists.");
    }

    const school = await tx.school.create({
      data: {
        name: input.name,
        code,
        address: nullable(input.address ?? ""),
        phone: nullable(input.phone ?? ""),
        email: nullable(input.email ?? ""),
        isActive: true,
        isSystemFixed: false,
      },
    });

    // Keep the current super admin able to work in newly created schools.
    if (access.isSuperAdmin) {
      await tx.userSchoolRole.upsert({
        where: {
          userId_schoolId_role: {
            userId: access.userId,
            schoolId: school.id,
            role: RoleName.SUPER_ADMIN,
          },
        },
        update: { isActive: true },
        create: {
          userId: access.userId,
          schoolId: school.id,
          role: RoleName.SUPER_ADMIN,
          isActive: true,
        },
      });
    }

    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId: school.id,
      action: "CREATE",
      entity: "SCHOOL",
      entityId: school.id,
      newData: {
        name: school.name,
        code: school.code,
        phone: school.phone,
        email: school.email,
      },
    });
  });

  revalidatePath("/schools");
  revalidatePath("/users");
  revalidatePath("/dashboard");
  revalidatePath("/audit-logs");
}

export async function toggleSchoolAction(formData: FormData) {
  const access = await getAccessScope();
  requirePermission(access, Permission.MANAGE_SCHOOLS);

  const schoolId = clean(formData.get("schoolId"));
  if (!schoolId) throw new Error("School is required.");

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
    },
  });

  if (!school) throw new Error("School not found.");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.school.update({
      where: { id: school.id },
      data: { isActive: !school.isActive },
      select: { isActive: true },
    });

    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId: school.id,
      action: updated.isActive ? "ACTIVATE" : "DEACTIVATE",
      entity: "SCHOOL",
      entityId: school.id,
      oldData: { isActive: school.isActive },
      newData: { isActive: updated.isActive },
    });
  });

  revalidatePath("/schools");
  revalidatePath("/users");
  revalidatePath("/dashboard");
  revalidatePath("/audit-logs");
}
