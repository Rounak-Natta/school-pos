import Link from "next/link";

import { InvoiceStatus, type Prisma } from "@/generated/prisma/client";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
import { prisma } from "@/lib/prisma";
import { hasPermission, Permission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const TIME_ZONE = "Asia/Kolkata";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

type DecimalLike =
  | {
      toString(): string;
    }
  | number
  | string
  | null
  | undefined;

function getParam(params: SearchParams, key: string) {
  const value = params[key];

  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function toPositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function money(value: DecimalLike) {
  const numericValue = Number(value?.toString() ?? 0);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(date);
}

function formatEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function parseKolkataDate(value: string, mode: "start" | "end") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const time =
    mode === "start" ? "00:00:00.000+05:30" : "23:59:59.999+05:30";

  const date = new Date(`${value}T${time}`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function buildInvoiceHref(
  current: {
    q: string;
    schoolId: string;
    status: string;
    from: string;
    to: string;
    page: number;
  },
  overrides: Partial<{
    q: string;
    schoolId: string;
    status: string;
    from: string;
    to: string;
    page: number;
  }>,
) {
  const next = {
    ...current,
    ...overrides,
  };

  const params = new URLSearchParams();

  if (next.q) params.set("q", next.q);
  if (next.schoolId) params.set("schoolId", next.schoolId);
  if (next.status) params.set("status", next.status);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.page > 1) params.set("page", String(next.page));

  const query = params.toString();

  return query ? `/invoices?${query}` : "/invoices";
}

function getStatusClass(status: InvoiceStatus) {
  switch (status) {
    case InvoiceStatus.PAID:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case InvoiceStatus.PARTIALLY_PAID:
      return "border-amber-200 bg-amber-50 text-amber-700";
    case InvoiceStatus.CANCELLED:
      return "border-red-200 bg-red-50 text-red-700";
    case InvoiceStatus.RETURNED:
      return "border-purple-200 bg-purple-50 text-purple-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const access = await getInvoiceAccessScope();
  const canCreateBill = hasPermission(access, Permission.POS_BILLING);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Invoices</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school invoices.
        </p>
      </div>
    );
  }

  const params = await Promise.resolve(searchParams ?? {});

  const q = getParam(params, "q");
  const requestedSchoolId = getParam(params, "schoolId");
  const statusParam = getParam(params, "status");
  const from = getParam(params, "from");
  const to = getParam(params, "to");
  const page = toPositiveInt(getParam(params, "page"), 1);

  const validStatuses = new Set<string>(Object.values(InvoiceStatus));
  const selectedStatus = validStatuses.has(statusParam)
    ? (statusParam as InvoiceStatus)
    : "";

  const schoolWhere: Prisma.SchoolWhereInput = {
    isActive: true,
  };

  if (!access.isSuperAdmin) {
    schoolWhere.id = {
      in: access.schoolIds,
    };
  }

  const invoiceWhere: Prisma.InvoiceWhereInput = {};

  if (access.isSuperAdmin) {
    if (requestedSchoolId) {
      invoiceWhere.schoolId = requestedSchoolId;
    }
  } else if (requestedSchoolId) {
    invoiceWhere.schoolId = access.schoolIds.includes(requestedSchoolId)
      ? requestedSchoolId
      : "__NO_ACCESS__";
  } else {
    invoiceWhere.schoolId = {
      in: access.schoolIds,
    };
  }

  if (selectedStatus) {
    invoiceWhere.status = selectedStatus;
  }

  const fromDate = parseKolkataDate(from, "start");
  const toDate = parseKolkataDate(to, "end");

  if (fromDate || toDate) {
    invoiceWhere.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  if (q) {
    invoiceWhere.OR = [
      {
        invoiceNo: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        customerName: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        customerPhone: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        customerClassName: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        customerSectionName: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        school: {
          name: {
            contains: q,
            mode: "insensitive",
          },
        },
      },
      {
        items: {
          some: {
            productVariant: {
              sku: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
      },
      {
        items: {
          some: {
            productVariant: {
              barcode: {
                contains: q,
                mode: "insensitive",
              },
            },
          },
        },
      },
      {
        items: {
          some: {
            productVariant: {
              product: {
                name: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
          },
        },
      },
    ];
  }

  const [schools, totalCount, invoices] = await prisma.$transaction([
    prisma.school.findMany({
      where: schoolWhere,
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        name: "asc",
      },
    }),

    prisma.invoice.count({
      where: invoiceWhere,
    }),

    prisma.invoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        invoiceNo: true,
        status: true,
        customerName: true,
        customerPhone: true,
        customerClassName: true,
        customerSectionName: true,
        payableAmount: true,
        discountAmount: true,
        paidAmount: true,
        balanceAmount: true,
        createdAt: true,

        school: {
          select: {
            id: true,
            name: true,
          },
        },

        billedBy: {
          select: {
            name: true,
            email: true,
          },
        },

        payments: {
          select: {
            mode: true,
            amount: true,
            paidAt: true,
          },
          orderBy: {
            paidAt: "desc",
          },
          take: 1,
        },

        items: {
          select: {
            id: true,
            quantity: true,
            productVariant: {
              select: {
                sku: true,
                barcode: true,
                className: true,
                sectionName: true,
                size: true,
                color: true,
                product: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            id: "asc",
          },
          take: 2,
        },

        _count: {
          select: {
            items: true,
            payments: true,
          },
        },
      },
      orderBy: [
        {
          createdAt: "desc",
        },
        {
          id: "desc",
        },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const showingFrom = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, totalCount);

  const currentHrefState = {
    q,
    schoolId: requestedSchoolId,
    status: selectedStatus,
    from,
    to,
    page,
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {showingFrom}-{showingTo} of {totalCount} invoices
          </p>
        </div>

        {canCreateBill ? (
          <Link
            href="/pos"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            New POS Bill
          </Link>
        ) : null}
      </div>

      <form
        action="/invoices"
        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="grid gap-2 md:grid-cols-[1fr_180px_150px_140px_140px_auto]">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search invoice, customer, product, SKU..."
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          />

          <select
            name="schoolId"
            defaultValue={requestedSchoolId}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">All Schools</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>

          <select
            name="status"
            defaultValue={selectedStatus}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          >
            <option value="">All Status</option>
            {Object.values(InvoiceStatus).map((status) => (
              <option key={status} value={status}>
                {formatEnum(status)}
              </option>
            ))}
          </select>

          <input
            name="from"
            type="date"
            defaultValue={from}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          />

          <input
            name="to"
            type="date"
            defaultValue={to}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          />

          <div className="flex gap-2">
            <button
              type="submit"
              className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Filter
            </button>

            <Link
              href="/invoices"
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset
            </Link>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="w-[230px] px-4 py-3 font-semibold">Invoice</th>
                <th className="w-[240px] px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="w-[170px] px-4 py-3 text-right font-semibold">
                  Amount
                </th>
                <th className="w-[145px] px-4 py-3 font-semibold">Payment</th>
                <th className="w-[140px] px-4 py-3 font-semibold">Billed By</th>
                <th className="w-[110px] px-4 py-3 text-right font-semibold">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => {
                const latestPayment = invoice.payments[0];
                const hiddenItemCount =
                  invoice._count.items - invoice.items.length;

                return (
                  <tr
                    key={invoice.id}
                    className="group align-top transition hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-950">
                        {invoice.invoiceNo}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        {formatDateTime(invoice.createdAt)}
                      </div>

                      <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {invoice._count.items} item
                        {invoice._count.items === 1 ? "" : "s"}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="max-w-[220px] truncate font-medium text-slate-900">
                        {invoice.customerName || "Walk-in Customer"}
                      </div>

                      <div className="mt-1 max-w-[220px] truncate text-xs text-slate-500">
                        {invoice.customerPhone || "No phone"}
                      </div>

                      <div className="mt-1 max-w-[220px] truncate text-xs text-slate-500">
                        {[
                          invoice.customerClassName
                            ? `Class ${invoice.customerClassName}`
                            : "",
                          invoice.customerSectionName
                            ? `Sec ${invoice.customerSectionName}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No class details"}
                      </div>

                      <div className="mt-2 max-w-[220px] truncate text-xs font-medium text-slate-700">
                        {invoice.school.name}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="max-w-[360px] space-y-1">
                        {invoice.items.map((item) => {
                          const variant = item.productVariant;

                          const meta = [
                            variant.sku ? `SKU ${variant.sku}` : "",
                            variant.className
                              ? `Class ${variant.className}`
                              : "",
                            variant.sectionName
                              ? `Sec ${variant.sectionName}`
                              : "",
                            variant.size,
                            variant.color,
                          ]
                            .filter(Boolean)
                            .join(" · ");

                          return (
                            <div key={item.id}>
                              <div className="truncate font-semibold text-slate-900">
                                {variant.product.name} × {item.quantity}
                              </div>

                              {meta ? (
                                <div className="truncate text-xs text-slate-500">
                                  {meta}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        {hiddenItemCount > 0 ? (
                          <div className="pt-1 text-xs font-semibold text-slate-500">
                            +{hiddenItemCount} more
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="font-bold text-slate-950">
                        {money(invoice.payableAmount)}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        Paid {money(invoice.paidAmount)}
                      </div>

                      {Number(invoice.balanceAmount.toString()) > 0 ? (
                        <div className="mt-1 text-xs font-semibold text-amber-600">
                          Due {money(invoice.balanceAmount)}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-slate-400">
                          No due
                        </div>
                      )}

                      {Number(invoice.discountAmount.toString()) > 0 ? (
                        <div className="mt-1 text-xs text-slate-400">
                          Discount {money(invoice.discountAmount)}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {latestPayment?.mode
                          ? formatEnum(latestPayment.mode)
                          : "-"}
                      </div>

                      <span
                        className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                          invoice.status,
                        )}`}
                      >
                        {formatEnum(invoice.status)}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="max-w-[130px] truncate text-sm font-medium text-slate-800">
                        {invoice.billedBy?.name ||
                          invoice.billedBy?.email ||
                          "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="mr-2 inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white"
                      >
                        View
                      </Link>

                      <Link
                        href={`/invoices/${invoice.id}/pdf`}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white"
                      >
                        PDF
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-16 text-center text-sm text-slate-500"
                  >
                    No invoices found. Change filters or create your first POS
                    bill.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            Page <span className="font-medium text-slate-800">{page}</span> of{" "}
            <span className="font-medium text-slate-800">{totalPages}</span>
          </p>

          <div className="flex gap-2">
            <Link
              href={buildInvoiceHref(currentHrefState, {
                page: Math.max(1, page - 1),
              })}
              aria-disabled={page <= 1}
              className={`inline-flex h-9 items-center rounded-xl border px-4 text-sm font-semibold ${
                page <= 1
                  ? "pointer-events-none border-slate-200 text-slate-300"
                  : "border-slate-200 text-slate-700 hover:bg-white"
              }`}
            >
              Previous
            </Link>

            <Link
              href={buildInvoiceHref(currentHrefState, {
                page: Math.min(totalPages, page + 1),
              })}
              aria-disabled={page >= totalPages}
              className={`inline-flex h-9 items-center rounded-xl border px-4 text-sm font-semibold ${
                page >= totalPages
                  ? "pointer-events-none border-slate-200 text-slate-300"
                  : "border-slate-200 text-slate-700 hover:bg-white"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}