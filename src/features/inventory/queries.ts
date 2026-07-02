import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  Permission,
  requirePermission,
} from "@/lib/rbac";

function buildInventoryStockWhere(params: {
  isSuperAdmin: boolean;
  schoolIds: string[];
}): Prisma.InventoryStockWhereInput {
  const { isSuperAdmin, schoolIds } = params;

  return {
    ...(isSuperAdmin
      ? {}
      : {
          schoolId: {
            in: schoolIds,
          },
        }),

    productVariant: {
      isActive: true,
      product: {
        isActive: true,
        deletedAt: null,
      },
    },
  };
}

export async function getInventoryForList() {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_INVENTORY);

  const where = buildInventoryStockWhere({
    isSuperAdmin: access.isSuperAdmin,
    schoolIds: access.schoolIds,
  });

  return prisma.inventoryStock.findMany({
    where,
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
          size: "asc",
        },
      },
      {
        productVariant: {
          color: "asc",
        },
      },
    ],
    take: 200,
  });
}

export async function getInventorySummary() {
  const access = await getAccessScope();

  requirePermission(access, Permission.VIEW_INVENTORY);

  const where = buildInventoryStockWhere({
    isSuperAdmin: access.isSuperAdmin,
    schoolIds: access.schoolIds,
  });

  const [stockRecords, totalQuantity, lowStockRecords] = await Promise.all([
    prisma.inventoryStock.count({
      where,
    }),

    prisma.inventoryStock.aggregate({
      where,
      _sum: {
        quantity: true,
      },
    }),

    prisma.inventoryStock.count({
      where: {
        ...where,
        quantity: {
          lte: prisma.inventoryStock.fields.reorderLevel,
        },
      },
    }),
  ]);

  return {
    stockRecords,
    totalQuantity: totalQuantity._sum.quantity ?? 0,
    lowStockRecords,
  };
}