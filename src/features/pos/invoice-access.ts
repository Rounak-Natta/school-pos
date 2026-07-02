import {
  getAccessScope,
  Permission,
  requirePermission,
} from "@/lib/rbac";

export async function getInvoiceAccessScope() {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_INVOICES);

  return access;
}