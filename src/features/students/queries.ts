import { prisma } from "@/lib/prisma";
import type { AccessScope } from "@/lib/rbac";

export async function getStudents(access: AccessScope) {
  return prisma.student.findMany({
    where: access.isSuperAdmin ? undefined : { schoolId: { in: access.schoolIds } },
    include: { school: { select: { name: true, code: true } } },
    orderBy: [{ school: { name: "asc" } }, { className: "asc" }, { name: "asc" }],
  });
}
