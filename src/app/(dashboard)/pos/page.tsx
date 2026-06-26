import Link from "next/link";
import { PosBillingForm } from "@/features/pos/pos-billing-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function PosPage() {
  const user = await requireUser();

  const accessibleSchoolIds = Array.from(
    new Set(user.roles.map((role) => role.schoolId))
  );

  const schools = await prisma.school.findMany({
    where: {
      id: {
        in: accessibleSchoolIds,
      },
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      code: true,
    },
  });

  const canSelectSchool = schools.length > 1;
  const defaultSchoolId = canSelectSchool ? "" : schools[0]?.id || "";

  const today = new Date();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-sm font-bold text-white">
                POS
              </div>

              <div>
                <h1 className="text-2xl font-semibold text-slate-950">
                  POS Billing
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Search product by shortcode, add to bill, collect payment and
                  auto-deduct stock.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Billing Date
              </div>
              <div className="font-semibold text-slate-950">
                {today.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>

            <Link
              href="/invoices"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              View Invoices
            </Link>
          </div>
        </div>
      </div>

      {schools.length === 0 ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          No active school access found for this user.
        </div>
      ) : (
        <PosBillingForm
          schools={schools.map((school) => ({
            id: school.id,
            name: school.name,
          }))}
          canSelectSchool={canSelectSchool}
          defaultSchoolId={defaultSchoolId}
        />
      )}
    </div>
  );
}