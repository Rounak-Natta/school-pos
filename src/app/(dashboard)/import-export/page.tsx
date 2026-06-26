import { importProductsExcelAction } from "@/features/import-export/actions";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ImportExportPageProps = {
  searchParams: Promise<{
    schoolId?: string;
  }>;
};

export default async function ImportExportPage({
  searchParams,
}: ImportExportPageProps) {
  await requireUser();

  const params = await searchParams;
  const selectedSchoolId = params.schoolId || "";

  const schools = await prisma.school.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const recentImports = await prisma.excelImport.findMany({
    include: {
      school: true,
      uploadedBy: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  const exportHref = selectedSchoolId
    ? `/import-export/products-export?schoolId=${selectedSchoolId}`
    : "/import-export/products-export";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">
          Import / Export
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Upload and download school-wise product, variant and inventory Excel
          files.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <a
          href="/import-export/products-template"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm text-slate-500">Step 1</p>

          <p className="mt-2 text-lg font-semibold text-slate-950">
            Download Template
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Blank Excel format with dropdown options.
          </p>
        </a>

        <a
          href={exportHref}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm text-slate-500">Export</p>

          <p className="mt-2 text-lg font-semibold text-slate-950">
            Download Current Data
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Export current products, variants and inventory.
          </p>
        </a>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Upload</p>

          <p className="mt-2 text-lg font-semibold text-slate-950">
            Import Excel
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Upload filled template into one selected school.
          </p>
        </div>
      </div>

      <form className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Select school for export
        </label>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select
            name="schoolId"
            defaultValue={selectedSchoolId}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="">All schools</option>

            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
          >
            Apply
          </button>
        </div>
      </form>

      <form
        action={importProductsExcelAction}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-base font-semibold text-slate-950">
          Upload Product + Stock Excel
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Import into school
            </label>

            <select
              name="schoolId"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            >
              <option value="">Select school</option>

              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Excel file
            </label>

            <input
              name="file"
              type="file"
              accept=".xlsx"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          Upload Excel
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">
            Recent Imports
          </h2>
        </div>

        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">School</th>
              <th className="px-4 py-3 font-medium">File</th>
              <th className="px-4 py-3 font-medium">Rows</th>
              <th className="px-4 py-3 font-medium">Success</th>
              <th className="px-4 py-3 font-medium">Failed</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">By</th>
            </tr>
          </thead>

          <tbody>
            {recentImports.map((item) => (
              <tr
                key={item.id}
                className="border-t border-slate-200 text-slate-700"
              >
                <td className="px-4 py-3">
                  {item.createdAt.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3">{item.school?.name || "-"}</td>
                <td className="px-4 py-3">{item.fileName}</td>
                <td className="px-4 py-3">{item.totalRows}</td>
                <td className="px-4 py-3">{item.successRows}</td>
                <td className="px-4 py-3">{item.failedRows}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3">{item.uploadedBy?.email || "-"}</td>
              </tr>
            ))}

            {recentImports.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No imports yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}