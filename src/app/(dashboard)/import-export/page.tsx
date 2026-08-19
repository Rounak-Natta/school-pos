import {
  importProductsExcelAction,
  importStudentsExcelAction,
} from "@/features/import-export/actions";
import { ImportUploadCard } from "@/features/import-export/components/import-upload-card";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  getSchoolIdsForPermission,
  hasPermission,
  Permission,
} from "@/lib/rbac";

type ImportExportPageProps = {
  searchParams: Promise<{
    schoolId?: string;
    import?: string;
    success?: string;
    failed?: string;
    error?: string;
  }>;
};

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const preferredRegion = "hnd1";

const INTERRUPTED_AFTER_MS = 2 * 60 * 1000;

const OPENING_STOCK_COLUMNS = [
  "Branch",
  "Warehouse",
  "Item",
  "Code",
  "SubItem",
  "Unit",
  "Attribute1",
  "SIZE",
  "Attribute3",
  "Attribute4",
  "Attribute5",
  "Barcode",
  "Pack",
  "Qty(Opening stock)",
  "Amount",
  "MRP",
  "Price",
] as const;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);
}

function safeCount(value?: string) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 0;
}

type ImportErrorDetail = {
  rowNumber?: number;
  error?: string;
  school?: string;
  schoolCode?: string;
  name?: string;
  sku?: string;
  className?: string;
  parentPhone?: string;
};

function getImportErrors(value: unknown): ImportErrorDetail[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    .map((item) => ({
      rowNumber:
        typeof item.rowNumber === "number" && Number.isFinite(item.rowNumber)
          ? item.rowNumber
          : undefined,
      error: typeof item.error === "string" ? item.error : "Unknown error",
      school: typeof item.school === "string" ? item.school : undefined,
      schoolCode:
        typeof item.schoolCode === "string" ? item.schoolCode : undefined,
      name: typeof item.name === "string" ? item.name : undefined,
      sku: typeof item.sku === "string" ? item.sku : undefined,
      className:
        typeof item.className === "string" ? item.className : undefined,
      parentPhone:
        typeof item.parentPhone === "string" ? item.parentPhone : undefined,
    }));
}

function importStatusLabel(input: {
  successRows: number;
  failedRows: number;
  status: string;
  createdAt: Date;
}) {
  if (input.status === "PENDING") {
    const age = Date.now() - input.createdAt.getTime();
    if (age > INTERRUPTED_AFTER_MS) return "INTERRUPTED";
    if (input.successRows > 0 || input.failedRows > 0) return "PROCESSING";
    return "PENDING";
  }
  if (input.successRows > 0 && input.failedRows > 0) return "PARTIAL";
  if (input.failedRows > 0) return "FAILED";
  if (input.successRows > 0) return "COMPLETED";
  return input.status;
}

export default async function ImportExportPage({
  searchParams,
}: ImportExportPageProps) {
  const access = await getAccessScope();

  if (!hasPermission(access, Permission.IMPORT_EXPORT)) {
    throw new Error("You do not have permission to import or export data.");
  }

  const params = await searchParams;
  const requestedSchoolId = params.schoolId || "";
  const importSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.IMPORT_EXPORT);

  const selectedSchoolId =
    requestedSchoolId &&
    (access.isSuperAdmin || (importSchoolIds ?? []).includes(requestedSchoolId))
      ? requestedSchoolId
      : "";

  const schools = await prisma.school.findMany({
    where: {
      isActive: true,
      ...(access.isSuperAdmin ? {} : { id: { in: importSchoolIds ?? [] } }),
    },
    orderBy: { name: "asc" },
  });

  const recentImports = await prisma.excelImport.findMany({
    where: access.isSuperAdmin
      ? {}
      : {
          OR: [
            { schoolId: { in: importSchoolIds ?? [] } },
            { schoolId: null, uploadedById: access.userId },
          ],
        },
    include: { school: true, uploadedBy: true },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const exportHref = selectedSchoolId
    ? `/import-export/products-export?schoolId=${encodeURIComponent(selectedSchoolId)}`
    : "/import-export/products-export";

  const importType = params.import;
  const successCount = safeCount(params.success);
  const failedCount = safeCount(params.failed);
  const hasResult = importType === "products" || importType === "students";
  const importError = params.error?.trim() || "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-950">
          Import / Export
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Opening-stock Excel for all schools, plus school-wise student import.
        </p>
      </div>

      {importError ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-950 shadow-sm"
          role="alert"
        >
          <p className="font-semibold">Import could not start</p>
          <p className="mt-1 text-sm">{importError}</p>
          <p className="mt-1 text-xs text-red-700">
            Fix the workbook/file and upload again. No stock rows were changed
            by this failed attempt.
          </p>
        </div>
      ) : null}

      {hasResult ? (
        <div
          className={`rounded-2xl border px-5 py-4 shadow-sm ${
            failedCount > 0
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
          role="status"
        >
          <p className="font-semibold">
            {failedCount > 0
              ? "Import completed with some row errors"
              : "Import completed successfully"}
          </p>
          <p className="mt-1 text-sm">
            {successCount} row{successCount === 1 ? "" : "s"} updated
            successfully
            {failedCount > 0
              ? ` and ${failedCount} row${failedCount === 1 ? "" : "s"} failed.`
              : "."}
            {failedCount > 0
              ? " Scroll to Recent Imports and open View row errors to see the exact Excel rows and reasons."
              : ""}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <a
          href="/import-export/products-template"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Opening stock
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            Download Required Template
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Downloads the exact 17-column opening-stock format used by your
            current workbook.
          </p>
        </a>

        <a
          href={exportHref}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Inventory
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            Download Current Inventory
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Current stock is exported in the same opening-stock format so you
            can edit and upload it again directly.
          </p>
        </a>

        <a
          href="/import-export/students-template"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Students
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            Download Student Template
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Student Name, Class and Contact Number are required.
          </p>
        </a>

        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Multi-school safe
          </p>
          <p className="mt-2 text-lg font-semibold">One file, all schools</p>
          <p className="mt-1 text-sm text-slate-300">
            Branch identifies the school on every row. No school selector is
            required for stock upload.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Required opening-stock Excel format
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Keep these 17 headers in the same order. Branch and Warehouse
                can contain the same school name, exactly like your existing
                opening-stock.xlsx.
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              Official format
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left text-xs">
            <thead className="bg-slate-950 text-white">
              <tr>
                {OPENING_STOCK_COLUMNS.map((column, index) => (
                  <th
                    key={column}
                    className="whitespace-nowrap border-r border-slate-800 px-3 py-3 font-semibold last:border-r-0"
                  >
                    <span className="mr-1 text-slate-400">
                      {String.fromCharCode(65 + index)}.
                    </span>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white text-slate-600">
                <td className="px-3 py-3">School</td>
                <td className="px-3 py-3">School / Warehouse</td>
                <td className="px-3 py-3">Product name</td>
                <td className="px-3 py-3">SKU / Code</td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3">PCS</td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3">Size</td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3 font-semibold text-slate-950">
                  Final stock
                </td>
                <td className="px-3 py-3">Optional</td>
                <td className="px-3 py-3">MRP</td>
                <td className="px-3 py-3 font-semibold text-slate-950">
                  Selling price
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          School filter for inventory export
        </label>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select
            name="schoolId"
            defaultValue={selectedSchoolId}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="">All accessible schools</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950">
        <p className="text-sm font-semibold">How stock upload works</p>
        <div className="mt-2 grid gap-3 text-sm leading-6 md:grid-cols-3">
          <p>
            <span className="font-semibold">1.</span> Download Current Inventory
            for all schools or use the required opening-stock template.
          </p>
          <p>
            <span className="font-semibold">2.</span> Update
            <span className="font-semibold"> Qty(Opening stock)</span>, Price,
            MRP or other supported values. Keep Branch on every row.
          </p>
          <p>
            <span className="font-semibold">3.</span> Upload the workbook once.
            Qty(Opening stock) becomes the final stock value for that school.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ImportUploadCard
          action={importProductsExcelAction}
          title="Upload Opening Stock — All Schools"
          description="Upload the same 17-column opening-stock.xlsx format. Branch maps each row to the correct school, so one workbook can contain all four schools. Maximum 10 MB."
          buttonLabel="Import Opening Stock"
          pendingLabel="Updating stock..."
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            <span className="font-semibold text-slate-800">Required values:</span>{" "}
            Branch, Item, Code, Qty(Opening stock), and Price. Warehouse should
            normally match Branch. Blank optional columns are allowed.
          </div>
          <input
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
        </ImportUploadCard>

        <ImportUploadCard
          action={importStudentsExcelAction}
          title="Upload Student Records"
          description="Student import remains school-wise. Name, class and customer/contact number are mandatory. Maximum 10 MB."
          buttonLabel="Import Student Excel"
          pendingLabel="Importing students..."
        >
          <select
            name="schoolId"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          >
            <option value="">Select school</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <input
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
        </ImportUploadCard>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-950">
            Recent Imports
          </h2>
        </div>

        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Type</th>
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
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDate(item.createdAt)}
                </td>
                <td className="px-4 py-3">{item.type}</td>
                <td className="px-4 py-3">
                  {item.school?.name ||
                    (item.type === "PRODUCTS" ? "Multiple schools" : "-")}
                </td>
                <td className="max-w-[240px] truncate px-4 py-3">
                  {item.fileName}
                </td>
                <td className="px-4 py-3">{item.totalRows}</td>
                <td className="px-4 py-3 text-emerald-700">
                  {item.successRows}
                </td>
                <td className="px-4 py-3 text-red-600">{item.failedRows}</td>
                <td className="px-4 py-3">
                  {(() => {
                    const errors = getImportErrors(item.errorSummary);
                    const displayStatus = importStatusLabel(item);

                    return (
                      <div className="min-w-[240px]">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            displayStatus === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700"
                              : displayStatus === "PARTIAL" ||
                                  displayStatus === "PROCESSING" ||
                                  displayStatus === "PENDING"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700"
                          }`}
                        >
                          {displayStatus}
                        </span>

                        {displayStatus === "PROCESSING" ||
                        displayStatus === "PENDING" ? (
                          <p className="mt-2 text-xs text-amber-700">
                            Import is still processing. Refresh this page after a few seconds.
                          </p>
                        ) : displayStatus === "INTERRUPTED" ? (
                          <p className="mt-2 max-w-sm text-xs leading-5 text-red-700">
                            This request did not reach final completion. This commonly happens when the hosting function is interrupted or times out. You can safely upload the same opening-stock workbook again because stock values are treated as final quantities, not quantities to add.
                          </p>
                        ) : null}

                        {errors.length > 0 ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold text-slate-700 hover:text-slate-950">
                              View {errors.length} row error
                              {errors.length === 1 ? "" : "s"}
                            </summary>
                            <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-red-100 bg-red-50/60">
                              <table className="w-full min-w-[680px] text-xs">
                                <thead className="sticky top-0 bg-red-50 text-red-900">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      Excel Row
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      School
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      Item / Student
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      Code / Details
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      Reason
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {errors.map((error, index) => (
                                    <tr
                                      key={`${item.id}-${error.rowNumber ?? index}-${index}`}
                                      className="border-t border-red-100 align-top text-slate-700"
                                    >
                                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-950">
                                        {error.rowNumber ?? "-"}
                                      </td>
                                      <td className="px-3 py-2">
                                        {error.school || error.schoolCode || "-"}
                                      </td>
                                      <td className="px-3 py-2">
                                        {error.name || "-"}
                                      </td>
                                      <td className="px-3 py-2">
                                        {error.sku ||
                                          [error.className, error.parentPhone]
                                            .filter(Boolean)
                                            .join(" / ") ||
                                          "-"}
                                      </td>
                                      <td className="px-3 py-2 font-medium text-red-800">
                                        {error.error || "Unknown error"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ) : item.failedRows > 0 ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Error details were not recorded for this older
                            import.
                          </p>
                        ) : null}
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  {item.uploadedBy?.email || "-"}
                </td>
              </tr>
            ))}

            {recentImports.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
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
