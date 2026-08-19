import { prisma } from "@/lib/prisma";
import { getAccessScope, Permission, requirePermission } from "@/lib/rbac";

export async function getSchoolsAdminPageData() {
  const access = await getAccessScope();
  requirePermission(access, Permission.MANAGE_SCHOOLS);

  const schools = await prisma.school.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      phone: true,
      email: true,
      isActive: true,
      isSystemFixed: true,
      createdAt: true,
      _count: {
        select: {
          students: true,
          products: true,
          invoices: true,
          userRoles: true,
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return { access, schools };
}
