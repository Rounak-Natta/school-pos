import type { Prisma } from "@/generated/prisma/client";

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  input: {
    userId?: string | null;
    schoolId?: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    oldData?: unknown;
    newData?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
) {
  await tx.auditLog.create({
    data: {
      userId: input.userId ?? null,
      schoolId: input.schoolId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      oldData: jsonValue(input.oldData),
      newData: jsonValue(input.newData),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
