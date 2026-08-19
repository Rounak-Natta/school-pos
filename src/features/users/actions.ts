"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { RoleName } from "@/generated/prisma/client";
import { writeAuditLog } from "@/features/audit/audit-service";
import { createUserSchema } from "@/features/users/schemas";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  Permission,
  requirePermission,
  resolveAccessibleSchoolId,
} from "@/lib/rbac";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function createUserAction(formData: FormData) {
  const access = await getAccessScope();

  const input = createUserSchema.parse({
    name: clean(formData.get("name")),
    email: clean(formData.get("email")).toLowerCase(),
    phone: clean(formData.get("phone")),
    password: String(formData.get("password") ?? ""),
    schoolId: clean(formData.get("schoolId")),
    role: clean(formData.get("role")),
  });

  const schoolId = await resolveAccessibleSchoolId({
    postedSchoolId: input.schoolId,
    access,
    permission: Permission.MANAGE_USERS,
  });

  if (!access.isSuperAdmin && input.role === RoleName.SUPER_ADMIN) {
    throw new Error("Only a super admin can create another super admin.");
  }

  const duplicate = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (duplicate) {
    throw new Error("A user with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone || null,
        passwordHash,
        isActive: true,
      },
    });

    await tx.userSchoolRole.create({
      data: {
        userId: user.id,
        schoolId,
        role: input.role,
        isActive: true,
      },
    });

    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId,
      action: "CREATE",
      entity: "USER",
      entityId: user.id,
      newData: {
        name: user.name,
        email: user.email,
        role: input.role,
      },
    });
  });

  revalidatePath("/users");
  revalidatePath("/audit-logs");
}

export async function toggleUserAction(formData: FormData) {
  const access = await getAccessScope();
  requirePermission(access, Permission.MANAGE_USERS);

  if (!access.isSuperAdmin) {
    throw new Error("Only a super admin can globally activate or deactivate a user.");
  }

  const userId = clean(formData.get("userId"));
  if (!userId) throw new Error("User is required.");
  if (userId === access.userId) throw new Error("You cannot deactivate your own account.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      schoolRoles: {
        where: { isActive: true },
        select: { schoolId: true },
        take: 1,
      },
    },
  });

  if (!user) throw new Error("User not found.");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        isActive: !user.isActive,
      },
      select: { isActive: true },
    });

    await writeAuditLog(tx, {
      userId: access.userId,
      schoolId: user.schoolRoles[0]?.schoolId ?? null,
      action: updated.isActive ? "ACTIVATE" : "DEACTIVATE",
      entity: "USER",
      entityId: user.id,
      oldData: { isActive: user.isActive },
      newData: { isActive: updated.isActive },
    });
  });

  revalidatePath("/users");
  revalidatePath("/audit-logs");
}
