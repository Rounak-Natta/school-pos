import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  getSchoolIdsForPermission,
  Permission,
  requirePermission,
} from "@/lib/rbac";

export async function getUsersAdminPageData() {
  const access = await getAccessScope();
  requirePermission(access, Permission.MANAGE_USERS);

  const manageableSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.MANAGE_USERS);

  const [schools, users] = await Promise.all([
    prisma.school.findMany({
      where: {
        isActive: true,
        ...(manageableSchoolIds ? { id: { in: manageableSchoolIds } } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(manageableSchoolIds
          ? {
              schoolRoles: {
                some: {
                  schoolId: { in: manageableSchoolIds },
                  isActive: true,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        schoolRoles: {
          where: {
            isActive: true,
            ...(manageableSchoolIds ? { schoolId: { in: manageableSchoolIds } } : {}),
          },
          select: {
            id: true,
            role: true,
            schoolId: true,
            school: { select: { name: true, code: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
  ]);

  return { access, schools, users };
}
