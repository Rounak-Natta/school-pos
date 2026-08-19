import { createProductsTemplateBuffer } from "@/features/import-export/excel-export";
import { prisma } from "@/lib/prisma";
import {
  getAccessScope,
  getSchoolIdsForPermission,
  hasPermission,
  Permission,
} from "@/lib/rbac";

export const runtime = "nodejs";

const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(arrayBuffer).set(data);
  return arrayBuffer;
}

export async function GET(): Promise<Response> {
  const access = await getAccessScope();

  if (!hasPermission(access, Permission.IMPORT_EXPORT)) {
    return new Response("Forbidden", { status: 403 });
  }

  const allowedSchoolIds = access.isSuperAdmin
    ? undefined
    : getSchoolIdsForPermission(access, Permission.IMPORT_EXPORT);

  const schools = await prisma.school.findMany({
    where: {
      isActive: true,
      ...(access.isSuperAdmin ? {} : { id: { in: allowedSchoolIds ?? [] } }),
    },
    select: { name: true, code: true },
    orderBy: { name: "asc" },
  });

  const buffer = await createProductsTemplateBuffer(schools);

  return new Response(toArrayBuffer(buffer), {
    headers: {
      "Content-Type": EXCEL_CONTENT_TYPE,
      "Content-Disposition":
        'attachment; filename="products-multi-school-import-template.xlsx"',
    },
  });
}
