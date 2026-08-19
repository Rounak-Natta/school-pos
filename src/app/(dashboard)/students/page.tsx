import { createStudentAction, toggleStudentAction } from "@/features/students/actions";
import { getAccessScope, getSchoolIdsForPermission, hasPermission, Permission, requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export default async function StudentsPage() {
  const access = await getAccessScope();
  requirePermission(access, Permission.VIEW_STUDENTS);
  const canManage = hasPermission(access, Permission.MANAGE_STUDENTS);
  const visibleSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.VIEW_STUDENTS);
  const manageableSchoolIds = access.isSuperAdmin
    ? undefined
    : access.schoolIds.filter((schoolId) => hasPermission(access, Permission.MANAGE_STUDENTS, schoolId));
  const [schools, students] = await Promise.all([
    prisma.school.findMany({ where: { isActive: true, ...(access.isSuperAdmin ? {} : { id: { in: manageableSchoolIds ?? [] } }) }, orderBy: { name: "asc" } }),
    prisma.student.findMany({
      where: access.isSuperAdmin ? undefined : { schoolId: { in: visibleSchoolIds ?? [] } },
      include: { school: { select: { name: true } } },
      orderBy: [{ school: { name: "asc" } }, { className: "asc" }, { name: "asc" }],
      take: 500,
    }),
  ]);

  return <div className="mx-auto max-w-7xl space-y-6">
    <div>
      <h1 className="text-2xl font-semibold text-slate-950">Students</h1>
      <p className="mt-1 text-sm text-slate-500">Every student record keeps the required school, name, class and contact number used during billing.</p>
    </div>

    {canManage ? <form action={createStudentAction} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">Add Student</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <select name="schoolId" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">School *</option>{schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input name="name" required placeholder="Student name *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="className" required placeholder="Class *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="parentPhone" required placeholder="Contact number *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="sectionName" placeholder="Section" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="admissionNo" placeholder="Admission no." className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="rollNumber" placeholder="Roll no." className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input name="parentName" placeholder="Parent / guardian" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <textarea name="address" placeholder="Address (optional)" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} />
      <button className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Save Student</button>
    </form> : null}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">School</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Number</th><th className="px-4 py-3">Admission / Roll</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{students.map(student => <tr key={student.id}>
          <td className="px-4 py-3 font-medium text-slate-900">{student.name}</td><td className="px-4 py-3">{student.school.name}</td><td className="px-4 py-3">{student.className}{student.sectionName ? ` / ${student.sectionName}` : ""}</td><td className="px-4 py-3">{student.parentPhone || "-"}</td><td className="px-4 py-3">{student.admissionNo || "-"} / {student.rollNumber || "-"}</td><td className="px-4 py-3">{student.isActive ? "Active" : "Inactive"}</td><td className="px-4 py-3">{hasPermission(access, Permission.MANAGE_STUDENTS, student.schoolId) ? <form action={toggleStudentAction}><input type="hidden" name="studentId" value={student.id}/><button className="text-sm font-semibold text-slate-700 underline">{student.isActive ? "Deactivate" : "Restore"}</button></form> : "-"}</td>
        </tr>)}</tbody>
      </table></div>
      {students.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No students yet.</p> : null}
    </div>
  </div>;
}
