import Link from "next/link";

import { PaymentMode, RoleName, type Prisma } from "@/generated/prisma/client";
import {
  PosBillingForm,
  type PosProductOption,
  type PosSchoolOption,
} from "@/features/pos/pos-billing-form";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

function cleanText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function buildVariantName(stock: StockRow) {
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

function buildDisplayName(stock: StockRow) {
  const productName = cleanText(stock.productVariant.product.name);
  const variantName = buildVariantName(stock);

  return variantName ? `${productName} — ${variantName}` : productName;
}

function buildSearchText(stock: StockRow) {
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

export default async function PosPage() {
  const sessionUser = await requireUser();

  const dbUser = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },
    select: {
      schoolRoles: {
        where: {
          isActive: true,
          school: {
            isActive: true,
          },
        },
        select: {
          schoolId: true,
          role: true,
        },
      },
    },
  });

  const activeRoles =
    dbUser?.schoolRoles.length
      ? dbUser.schoolRoles
      : sessionUser.roles.map((role) => ({
          schoolId: role.schoolId,
          role: role.role,
        }));

  const isSuperAdmin = activeRoles.some(
    (role) => role.role === RoleName.SUPER_ADMIN,
  );

  const accessibleSchoolIds = Array.from(
    new Set(activeRoles.map((role) => role.schoolId).filter(Boolean)),
  );

  if (!isSuperAdmin && accessibleSchoolIds.length === 0) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">POS Billing</h1>
        <p className="mt-2 text-sm text-slate-500">
          You do not have access to any active school.
        </p>
      </div>
    );
  }

  const schoolWhere: Prisma.SchoolWhereInput = {
    isActive: true,
  };

  if (!isSuperAdmin) {
    schoolWhere.id = {
      in: accessibleSchoolIds,
    };
  }

  const stockWhere: Prisma.InventoryStockWhereInput = {
    quantity: {
      gt: 0,
    },
    school: {
      isActive: true,
    },
    productVariant: {
      isActive: true,
      product: {
        isActive: true,
        deletedAt: null,
      },
    },
  };

  if (!isSuperAdmin) {
    stockWhere.schoolId = {
      in: accessibleSchoolIds,
    };
  }

  const [schools, stocks] = await Promise.all([
    prisma.school.findMany({
      where: schoolWhere,
      orderBy: {
        name: "asc",
      },
    }),

    prisma.inventoryStock.findMany({
      where: stockWhere,
      include: {
        school: true,
        productVariant: {
          include: {
            product: true,
          },
        },
      },
      orderBy: [
        {
          school: {
            name: "asc",
          },
        },
        {
          productVariant: {
            product: {
              name: "asc",
            },
          },
        },
        {
          productVariant: {
            className: "asc",
          },
        },
        {
          productVariant: {
            size: "asc",
          },
        },
      ],
    }),
  ]);

  const activeSchoolIds = new Set(schools.map((school) => school.id));

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
        stockQty: stock.quantity,
        searchText: buildSearchText(stock),
      };
    });

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            POS Billing
          </h1>
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
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View Invoices
        </Link>
      </div>

      <PosBillingForm
        schools={schoolOptions}
        products={productOptions}
        paymentModes={Object.values(PaymentMode)}
      />
    </div>
  );
}