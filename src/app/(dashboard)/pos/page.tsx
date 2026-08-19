import Link from "next/link";

import { PaymentMode, type Prisma } from "@/generated/prisma/client";
import {
  PosBillingForm,
  type PosProductOption,
  type PosSchoolOption,
} from "@/features/pos/pos-billing-form";
import type { StudentOption } from "@/features/students/types";
import { prisma } from "@/lib/prisma";
import { getAccessScope, hasPermission, Permission } from "@/lib/rbac";

// ==============================
// Helpers (pure functions)
// ==============================

type StockRow = Prisma.InventoryStockGetPayload<{
  include: {
    school: true;
    productVariant: {
      include: {
        product: true;
      };
    };
  };
}>;

function cleanText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function buildVariantName(stock: StockRow): string {
  const variant = stock.productVariant;
  return [
    variant.className ? `Class ${variant.className}` : "",
    variant.sectionName ? `Sec ${variant.sectionName}` : "",
    variant.size,
    variant.color,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" · ");
}

function buildDisplayName(stock: StockRow): string {
  const productName = cleanText(stock.productVariant.product.name);
  const variantName = buildVariantName(stock);
  return variantName ? `${productName} — ${variantName}` : productName;
}

function buildSearchText(stock: StockRow): string {
  const variant = stock.productVariant;
  const product = variant.product;
  return [
    product.name,
    product.category,
    variant.sku,
    variant.barcode,
    variant.unit,
    variant.className,
    variant.sectionName,
    variant.size,
    variant.color,
    stock.school.name,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// ==============================
// Page Component
// ==============================

export default async function PosPage() {
  const access = await getAccessScope();

  if (!hasPermission(access, Permission.POS_BILLING)) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">POS Billing</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have permission to create POS bills.
        </p>
      </div>
    );
  }

  const isSuperAdmin = access.isSuperAdmin;
  const accessibleSchoolIds = isSuperAdmin
    ? []
    : access.schoolIds.filter((schoolId) =>
        hasPermission(access, Permission.POS_BILLING, schoolId),
      );

  // 2. Build where clauses
  const schoolWhere: Prisma.SchoolWhereInput = { isActive: true };
  if (!isSuperAdmin) {
    schoolWhere.id = { in: accessibleSchoolIds };
  }

  const stockWhere: Prisma.InventoryStockWhereInput = {
    quantity: { gt: 0 },
    school: { isActive: true },
    productVariant: {
      isActive: true,
      product: { isActive: true, deletedAt: null },
    },
  };
  if (!isSuperAdmin) {
    stockWhere.schoolId = { in: accessibleSchoolIds };
  }

  // 3. Fetch data in parallel
  const [schools, stocks, studentRows] = await Promise.all([
    prisma.school.findMany({
      where: schoolWhere,
      orderBy: { name: "asc" },
    }),
    prisma.inventoryStock.findMany({
      where: stockWhere,
      include: {
        school: true,
        productVariant: { include: { product: true } },
      },
      orderBy: [
        { school: { name: "asc" } },
        { productVariant: { product: { name: "asc" } } },
        { productVariant: { className: "asc" } },
        { productVariant: { size: "asc" } },
      ],
    }),
    prisma.student.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(isSuperAdmin ? {} : { schoolId: { in: accessibleSchoolIds } }),
      },
      include: { school: { select: { name: true } } },
      orderBy: [{ name: "asc" }],
      take: 5000,
    }),
  ]);

  // 4. Build options
  const activeSchoolIds = new Set(schools.map((s) => s.id));

  const schoolOptions: PosSchoolOption[] = schools.map((school) => ({
    id: school.id,
    name: school.name,
  }));

  const productOptions: PosProductOption[] = stocks
    .filter((stock) => activeSchoolIds.has(stock.schoolId))
    .map((stock) => {
      const variant = stock.productVariant;
      const product = variant.product;
      return {
        inventoryStockId: stock.id,
        productVariantId: variant.id,
        schoolId: stock.schoolId,
        schoolName: stock.school.name,

        productName: cleanText(product.name),
        displayName: buildDisplayName(stock),
        variantName: buildVariantName(stock),
        category: cleanText(product.category),

        sku: cleanText(variant.sku),
        barcode: cleanText(variant.barcode),
        unit: cleanText(variant.unit) || "PCS",

        className: cleanText(variant.className),
        sectionName: cleanText(variant.sectionName),
        size: cleanText(variant.size),
        color: cleanText(variant.color),

        salePrice: Number(variant.salePrice),
        gstRate: Number(variant.gstRate),
        stockQty: stock.quantity,
        searchText: buildSearchText(stock),
      };
    });

  const studentOptions: StudentOption[] = studentRows
    .filter((student) => activeSchoolIds.has(student.schoolId))
    .map((student) => ({
      id: student.id,
      schoolId: student.schoolId,
      schoolName: student.school.name,
      name: cleanText(student.name),
      className: cleanText(student.className),
      sectionName: cleanText(student.sectionName),
      admissionNo: cleanText(student.admissionNo),
      rollNumber: cleanText(student.rollNumber),
      phone: cleanText(student.parentPhone),
      searchText: [student.name, student.className, student.sectionName, student.admissionNo, student.rollNumber, student.parentPhone, student.school.name]
        .map(cleanText)
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    }));

  // 5. Fallback if no schools
  if (schoolOptions.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">POS Billing</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school.
        </p>
      </div>
    );
  }

  // 6. Render
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">POS Billing</h1>
          <p className="mt-1 text-sm text-slate-500">
            Search products, filter stock, add items to cart, collect payment,
            and generate invoice.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Loaded {productOptions.length} sellable product
            {productOptions.length === 1 ? "" : "s"} from {schoolOptions.length}{" "}
            active school{schoolOptions.length === 1 ? "" : "s"}.
          </p>
        </div>
        <Link
          href="/invoices"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          View Invoices
        </Link>
      </div>

      {/* Form */}
      <PosBillingForm
        schools={schoolOptions}
        products={productOptions}
        students={studentOptions}
        paymentModes={Object.values(PaymentMode)}
      />
    </div>
  );
}