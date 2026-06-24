import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const user = await requireUser();

  const [schoolCount, productCount, variantCount, stockCount] =
    await Promise.all([
      prisma.school.count(),
      prisma.product.count({
        where: {
          deletedAt: null,
        },
      }),
      prisma.productVariant.count(),
      prisma.inventoryStock.count(),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Welcome back, {user.name}. Manage school-wise billing and inventory.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Schools</p>
          <p className="mt-2 text-3xl font-semibold">{schoolCount}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Products</p>
          <p className="mt-2 text-3xl font-semibold">{productCount}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Product Variants</p>
          <p className="mt-2 text-3xl font-semibold">{variantCount}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Stock Records</p>
          <p className="mt-2 text-3xl font-semibold">{stockCount}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-950">
          Your School Access
        </h2>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2">School</th>
                <th className="px-4 py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {user.roles.map((role) => (
                <tr key={`${role.schoolId}-${role.role}`} className="border-t">
                  <td className="px-4 py-2">{role.schoolName}</td>
                  <td className="px-4 py-2">{role.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );    
}