import { prisma } from "@/lib/prisma";
import {
  getSchoolIdsForPermission,
  Permission,
  type AccessScope,
} from "@/lib/rbac";

export function getTransfers(access: AccessScope) {
  const schoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.VIEW_TRANSFERS);

  return prisma.transfer.findMany({
    where: access.isSuperAdmin
      ? undefined
      : {
          OR: [
            { fromSchoolId: { in: schoolIds ?? [] } },
            { toSchoolId: { in: schoolIds ?? [] } },
          ],
        },
    include: { fromSchool: true, toSchool: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 250,
  });
}
