    import { prisma } from "@/lib/prisma";

export async function getInventoryForList() {
  return prisma.inventoryStock.findMany({
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
    ],
    take: 200,
  });
}

export async function getInventorySummary() {
  const [stockRecords, totalQuantity] = await Promise.all([
    prisma.inventoryStock.count(),
    prisma.inventoryStock.aggregate({
      _sum: {
        quantity: true,
      },
    }),
  ]);

  return {
    stockRecords,
    totalQuantity: totalQuantity._sum.quantity ?? 0,
  };
}