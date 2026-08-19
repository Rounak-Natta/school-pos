import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

function financialYearFor(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? 0);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 0);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

export async function nextSchoolInvoiceNo(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<string> {
  const school = await tx.school.findUnique({
    where: { id: schoolId },
    select: { code: true },
  });
  if (!school) throw new Error("School not found while generating invoice number.");

  const financialYear = financialYearFor(new Date());
  const sequence = await tx.schoolInvoiceSequence.upsert({
    where: { schoolId_financialYear: { schoolId, financialYear } },
    create: { schoolId, financialYear, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });

  return `${school.code.toUpperCase()}-${financialYear}-${String(sequence.lastNumber).padStart(6, "0")}`;
}

export async function nextReturnNo(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<string> {
  const school = await tx.school.findUnique({ where: { id: schoolId }, select: { code: true } });
  if (!school) throw new Error("School not found while generating return number.");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replace(/-/g, "");
  return `RET-${school.code.toUpperCase()}-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
