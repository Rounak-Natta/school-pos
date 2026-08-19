-- Add return/exchange, GST, school-wise invoice sequencing and notifications.
-- This migration is additive and preserves existing invoices/products.

-- CreateEnum
CREATE TYPE "ReturnMode" AS ENUM ('RETURN', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'LOW_STOCK', 'TRANSFER', 'RETURN', 'INVOICE', 'SYSTEM');

-- AlterTable: students
ALTER TABLE "students" ADD COLUMN "rollNumber" TEXT;

-- AlterTable: product variants
ALTER TABLE "product_variants"
ADD COLUMN "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "hsnCode" TEXT;

-- AlterTable: invoices
ALTER TABLE "invoices"
ADD COLUMN "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "gstAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "exchangeCreditAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "exchangeReturnId" TEXT;

-- Existing invoices had totalAmount as the pre-GST total; preserve that as subtotal.
UPDATE "invoices" SET "subtotalAmount" = "totalAmount" WHERE "subtotalAmount" = 0;

-- AlterTable: invoice items
ALTER TABLE "invoice_items"
ADD COLUMN "returnedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "taxableAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "gstAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE "invoice_items" SET "taxableAmount" = "lineTotal" WHERE "taxableAmount" = 0;

-- CreateTable
CREATE TABLE "school_invoice_sequences" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_invoice_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "mode" "ReturnMode" NOT NULL,
    "reason" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "refundMode" "PaymentMode",
    "refundReference" TEXT,
    "exchangeCreditAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "id" TEXT NOT NULL,
    "saleReturnId" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCredit" DECIMAL(10,2) NOT NULL,
    "gstAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineCredit" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "schoolId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "students_schoolId_rollNumber_idx" ON "students"("schoolId", "rollNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_exchangeReturnId_key" ON "invoices"("exchangeReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "school_invoice_sequences_schoolId_financialYear_key"
ON "school_invoice_sequences"("schoolId", "financialYear");
CREATE INDEX "school_invoice_sequences_schoolId_idx" ON "school_invoice_sequences"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_returnNo_key" ON "sale_returns"("returnNo");
CREATE INDEX "sale_returns_invoiceId_idx" ON "sale_returns"("invoiceId");
CREATE INDEX "sale_returns_schoolId_idx" ON "sale_returns"("schoolId");
CREATE INDEX "sale_returns_mode_idx" ON "sale_returns"("mode");
CREATE INDEX "sale_returns_createdAt_idx" ON "sale_returns"("createdAt");

-- CreateIndex
CREATE INDEX "sale_return_items_saleReturnId_idx" ON "sale_return_items"("saleReturnId");
CREATE INDEX "sale_return_items_invoiceItemId_idx" ON "sale_return_items"("invoiceItemId");
CREATE INDEX "sale_return_items_productVariantId_idx" ON "sale_return_items"("productVariantId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
CREATE INDEX "notifications_schoolId_idx" ON "notifications"("schoolId");
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- AddForeignKey
ALTER TABLE "school_invoice_sequences" ADD CONSTRAINT "school_invoice_sequences_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_processedById_fkey"
FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_saleReturnId_fkey"
FOREIGN KEY ("saleReturnId") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_invoiceItemId_fkey"
FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_productVariantId_fkey"
FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_exchangeReturnId_fkey"
FOREIGN KEY ("exchangeReturnId") REFERENCES "sale_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
