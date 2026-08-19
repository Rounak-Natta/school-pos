import { NotificationType, RoleName, type Prisma } from "@/generated/prisma/client";

export async function notifySchoolUsers(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    type?: NotificationType;
    title: string;
    message: string;
    href?: string | null;
    roles?: RoleName[];
    excludeUserId?: string | null;
  },
) {
  const schoolRoles = await tx.userSchoolRole.findMany({
    where: {
      schoolId: input.schoolId,
      isActive: true,
      ...(input.roles?.length ? { role: { in: input.roles } } : {}),
      user: {
        isActive: true,
        deletedAt: null,
        ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
      },
    },
    select: { userId: true },
  });

  // SUPER_ADMIN is global in RBAC even when its role record is attached to a
  // different school, so include global super admins for operational alerts.
  const includeGlobalSuperAdmins = !input.roles || input.roles.includes(RoleName.SUPER_ADMIN);
  const globalSuperAdmins = includeGlobalSuperAdmins
    ? await tx.userSchoolRole.findMany({
        where: {
          role: RoleName.SUPER_ADMIN,
          isActive: true,
          user: {
            isActive: true,
            deletedAt: null,
            ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
          },
        },
        select: { userId: true },
      })
    : [];

  const userIds = Array.from(
    new Set([...schoolRoles, ...globalSuperAdmins].map((role) => role.userId)),
  );
  if (userIds.length === 0) return;

  await tx.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      schoolId: input.schoolId,
      type: input.type ?? NotificationType.INFO,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
    })),
  });
}

export async function createUserNotification(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    schoolId?: string | null;
    type?: NotificationType;
    title: string;
    message: string;
    href?: string | null;
  },
) {
  await tx.notification.create({
    data: {
      userId: input.userId,
      schoolId: input.schoolId ?? null,
      type: input.type ?? NotificationType.INFO,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
    },
  });
}
