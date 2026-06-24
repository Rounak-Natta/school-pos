/*
  Warnings:

  - A unique constraint covering the columns `[schoolId,name]` on the table `products` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `schoolId` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "schoolId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "products_schoolId_idx" ON "products"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "products_schoolId_name_key" ON "products"("schoolId", "name");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
