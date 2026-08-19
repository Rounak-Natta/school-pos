import { prisma } from "@/lib/prisma";
import {
  getSchoolIdsForPermission,
  Permission,
  type AccessScope,
} from "@/lib/rbac";

export async function getAuditLogs(access: AccessScope, limit = 250) {
  const schoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.VIEW_AUDIT_LOGS);

  return prisma.auditLog.findMany({
    where: access.isSuperAdmin ? undefined : { schoolId: { in: schoolIds ?? [] } },
    include: {
      school: { select: { name: true, code: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}
