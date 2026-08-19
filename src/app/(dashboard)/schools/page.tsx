import { createSchoolAction, toggleSchoolAction } from "@/features/schools/actions";
import { getSchoolsAdminPageData } from "@/features/schools/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SchoolsPage() {
  const { schools } = await getSchoolsAdminPageData();

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Schools</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage school masters used for billing, students, stock and invoice numbering.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <form action={createSchoolAction} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Add School</h2>
          <p className="mt-1 text-xs text-slate-500">School code must be unique.</p>

          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              School Name
              <input name="name" required className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              School Code
              <input name="code" required placeholder="TBS-NEW" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 uppercase outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone
              <input name="phone" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input name="email" type="email" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Address
              <textarea name="address" rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-slate-400" />
            </label>
          </div>

          <button type="submit" className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            Create School
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">All Schools</h2>
            <p className="text-xs text-slate-500">{schools.length} school(s)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3 text-center">Students</th>
                  <th className="px-4 py-3 text-center">Products</th>
                  <th className="px-4 py-3 text-center">Invoices</th>
                  <th className="px-4 py-3 text-center">Users</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schools.map((school) => (
                  <tr key={school.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{school.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{school.code}</div>
                      {school.isSystemFixed ? <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Seeded</span> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{school.phone || "—"}</div>
                      <div className="text-xs text-slate-500">{school.email || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{school._count.students}</td>
                    <td className="px-4 py-3 text-center font-medium">{school._count.products}</td>
                    <td className="px-4 py-3 text-center font-medium">{school._count.invoices}</td>
                    <td className="px-4 py-3 text-center font-medium">{school._count.userRoles}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${school.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                        {school.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={toggleSchoolAction}>
                        <input type="hidden" name="schoolId" value={school.id} />
                        <button type="submit" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          {school.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
