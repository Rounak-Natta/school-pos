import { RoleName } from "@/generated/prisma/client";
import { createUserAction, toggleUserAction } from "@/features/users/actions";
import { getUsersAdminPageData } from "@/features/users/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatRole(role: RoleName) {
  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: Date | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

export default async function UsersPage() {
  const { access, schools, users } = await getUsersAdminPageData();

  const allowedRoles = Object.values(RoleName).filter(
    (role) => access.isSuperAdmin || role !== RoleName.SUPER_ADMIN,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create staff accounts and assign a school-specific role.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form action={createUserAction} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Create User</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Name
              <input name="name" required className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input name="email" type="email" required className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Phone
              <input name="phone" className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input name="password" type="password" required minLength={8} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-slate-400" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              School
              <select name="schoolId" required className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-slate-400">
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>{school.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Role
              <select name="role" required defaultValue={RoleName.CASHIER} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-slate-400">
                {allowedRoles.map((role) => (
                  <option key={role} value={role}>{formatRole(role)}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            Create User
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Staff Accounts</h2>
            <p className="text-xs text-slate-500">{users.length} user(s)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">School / Role</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                      <div className="text-xs text-slate-400">{user.phone || "No phone"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {user.schoolRoles.map((assignment) => (
                          <div key={assignment.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-slate-700">{assignment.school.name}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{formatRole(assignment.role)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(user.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${user.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {access.isSuperAdmin && user.id !== access.userId ? (
                        <form action={toggleUserAction}>
                          <input type="hidden" name="userId" value={user.id} />
                          <button type="submit" className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
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
