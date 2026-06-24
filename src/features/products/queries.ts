    import { prisma } from "@/lib/prisma";

export async function getProductsForList() {
  return prisma.product.findMany({
    where: {
      deletedAt: null,
    },
    include: {
      variants: {
        orderBy: [
          {
            sku: "asc",
          },
          {
            size: "asc",
          },
        ],
      },
    },
    orderBy: {
      name: "asc",
    },
    take: 100,
  });
}