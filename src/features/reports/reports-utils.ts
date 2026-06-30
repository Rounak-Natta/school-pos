import { InvoiceStatus, PaymentMode } from "@/generated/prisma/client";

export const REPORT_PAGE_SIZE = 50;
export const TIME_ZONE = "Asia/Kolkata";

export type ReportRange =
  | "today"
  | "7d"
  | "30d"
  | "this-month"
  | "all"
  | "custom";

export type StockStatusFilter = "" | "available" | "low" | "out";

export type ReportSearchParams = Record<string, string | string[] | undefined>;

export type BaseReportFilters = {
  q: string;
  range: ReportRange;
  schoolId: string;
  from: string;
  to: string;
  page: number;
};

export type SalesReportFilters = BaseReportFilters & {
  status: InvoiceStatus | "";
};

export type PaymentReportFilters = BaseReportFilters & {
  mode: PaymentMode | "";
};

export type ProductReportFilters = BaseReportFilters & {
  category: string;
  className: string;
};

export type StockReportFilters = {
  q: string;
  schoolId: string;
  category: string;
  className: string;
  stockStatus: StockStatusFilter;
  page: number;
};

export type CashierReportFilters = BaseReportFilters;

export type SchoolReportFilters = BaseReportFilters;

type DecimalLike =
  | {
      toString(): string;
    }
  | number
  | string
  | null
  | undefined;

export function getParam(params: ReportSearchParams, key: string) {
  const value = params[key];

  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

export function toPositiveInt(value: string, fallback = 1) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export function toNumber(value: DecimalLike) {
  const numberValue = Number(value?.toString() ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function money(value: DecimalLike) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

export function compactMoney(value: DecimalLike) {
  const numberValue = toNumber(value);

  if (numberValue >= 10000000) {
    return `₹${(numberValue / 10000000).toFixed(2)}Cr`;
  }

  if (numberValue >= 100000) {
    return `₹${(numberValue / 100000).toFixed(2)}L`;
  }

  return money(numberValue);
}

export function formatDateTime(date: Date) {
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

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatEnum(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

export function resolveReportRange(value: string): ReportRange {
  const ranges: ReportRange[] = [
    "today",
    "7d",
    "30d",
    "this-month",
    "all",
    "custom",
  ];

  return ranges.includes(value as ReportRange)
    ? (value as ReportRange)
    : "today";
}

export function resolveInvoiceStatus(value: string): InvoiceStatus | "" {
  return Object.values(InvoiceStatus).includes(value as InvoiceStatus)
    ? (value as InvoiceStatus)
    : "";
}

export function resolvePaymentMode(value: string): PaymentMode | "" {
  return Object.values(PaymentMode).includes(value as PaymentMode)
    ? (value as PaymentMode)
    : "";
}

export function resolveStockStatus(value: string): StockStatusFilter {
  const statuses: StockStatusFilter[] = ["", "available", "low", "out"];
  return statuses.includes(value as StockStatusFilter)
    ? (value as StockStatusFilter)
    : "";
}

export function getKolkataDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseKolkataDate(value: string, mode: "start" | "end") {
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

export function getDateRange(input: {
  range: ReportRange;
  from: string;
  to: string;
}) {
  const now = new Date();

  if (input.range === "all") {
    return null;
  }

  if (input.range === "custom") {
    const fromDate = parseKolkataDate(input.from, "start");
    const toDate = parseKolkataDate(input.to, "end");

    if (!fromDate && !toDate) {
      return null;
    }

    return {
      start: fromDate,
      end: toDate,
      label: "Custom Range",
    };
  }

  const todayString = getKolkataDateString(now);
  const todayStart = new Date(`${todayString}T00:00:00.000+05:30`);

  if (input.range === "today") {
    return {
      start: todayStart,
      end: now,
      label: "Today",
    };
  }

  if (input.range === "7d") {
    const start = new Date(todayStart);
    start.setUTCDate(start.getUTCDate() - 6);

    return {
      start,
      end: now,
      label: "Last 7 Days",
    };
  }

  if (input.range === "30d") {
    const start = new Date(todayStart);
    start.setUTCDate(start.getUTCDate() - 29);

    return {
      start,
      end: now,
      label: "Last 30 Days",
    };
  }

  const [year, month] = todayString.split("-");

  return {
    start: new Date(`${year}-${month}-01T00:00:00.000+05:30`),
    end: now,
    label: "This Month",
  };
}

export function buildReportHref<T extends Record<string, unknown>>(
  basePath: string,
  current: T,
  overrides: Partial<T>,
) {
  const next = {
    ...current,
    ...overrides,
  };

  const params = new URLSearchParams();

  Object.entries(next).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (key === "page" && Number(value) <= 1) {
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();

  return query ? `${basePath}?${query}` : basePath;
}

export const buildPaymentReportHref = buildReportHref;

export function getStatusClass(status: InvoiceStatus) {
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