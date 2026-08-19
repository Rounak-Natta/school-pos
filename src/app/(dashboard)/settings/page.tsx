import { prisma } from "@/lib/prisma";
import { getAccessScope, getSchoolIdsForPermission, Permission, requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const access = await getAccessScope();
  requirePermission(access, Permission.SETTINGS);

  const scopedSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.SETTINGS);

  const schoolFilter = scopedSchoolIds ? { id: { in: scopedSchoolIds } } : {};
  const schoolRelationFilter = scopedSchoolIds
    ? { schoolId: { in: scopedSchoolIds } }
    : {};

  const [activeSchools, activeUsers, activeProducts] = await Promise.all([
    prisma.school.count({ where: { isActive: true, ...schoolFilter } }),
    prisma.user.count({
      where: {
        isActive: true,
        deletedAt: null,
        ...(scopedSchoolIds
          ? {
              schoolRoles: {
                some: { schoolId: { in: scopedSchoolIds }, isActive: true },
              },
            }
          : {}),
      },
    }),
    prisma.product.count({
      where: { isActive: true, deletedAt: null, ...schoolRelationFilter },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          System information and operational defaults for the School POS.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Active Schools</div>
          <div className="mt-1 text-3xl font-semibold text-slate-950">{activeSchools}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Active Users</div>
          <div className="mt-1 text-3xl font-semibold text-slate-950">{activeUsers}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Active Products</div>
          <div className="mt-1 text-3xl font-semibold text-slate-950">{activeProducts}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Operational Defaults</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timezone</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">Asia/Kolkata</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Currency</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">INR (₹)</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">GST</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">Per product variant</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice Sequence</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">School + financial year</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          Writable organization-wide settings are intentionally not stored here yet; this page now loads safely without inventing configuration that the database does not persist.
        </p>
      </div>
    </div>
  );
}
