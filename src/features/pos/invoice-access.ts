import { RoleName } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type UserRoleLike = {
  schoolId: string | null;
  role: RoleName | string;
};

type UserLike = {
  id: string;
  roles?: UserRoleLike[];
};

export async function getInvoiceAccessScope(user: UserLike) {
  const dbUser = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      schoolRoles: {
        where: {
          isActive: true,
          school: {
            isActive: true,
          },
        },
        select: {
          schoolId: true,
          role: true,
        },
      },
    },
  });

  const dbRoles = dbUser?.schoolRoles ?? [];
  const sessionRoles = user.roles ?? [];

  const roles =
    dbRoles.length > 0
      ? dbRoles
      : sessionRoles.filter(
          (
            role,
          ): role is {
            schoolId: string;
            role: RoleName | string;
          } => Boolean(role.schoolId),
        );

  const isSuperAdmin = roles.some(
    (role) =>
      role.role === RoleName.SUPER_ADMIN || String(role.role) === "SUPER_ADMIN",
  );

  const schoolIds = Array.from(
    new Set(
      roles
        .map((role) => role.schoolId)
        .filter((schoolId): schoolId is string => Boolean(schoolId)),
    ),
  );

  return {
    isSuperAdmin,
    schoolIds,
  };
}