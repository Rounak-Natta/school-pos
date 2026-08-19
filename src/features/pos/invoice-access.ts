import {
  getAccessScope,
  getSchoolIdsForPermission,
  Permission,
  requirePermission,
} from "@/lib/rbac";

export async function getInvoiceAccessScope() {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_INVOICES);

  if (access.isSuperAdmin) {
    return access;
  }

  return {
    ...access,
    schoolIds: getSchoolIdsForPermission(access, Permission.VIEW_INVOICES),
  };
}
