import { createStudentsTemplateBuffer } from "@/features/import-export/excel-export";
import { getCurrentUser } from "@/lib/session";
export const runtime = "nodejs";
function toArrayBuffer(data: Uint8Array): ArrayBuffer { const buffer = new ArrayBuffer(data.byteLength); new Uint8Array(buffer).set(data); return buffer; }
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const data = await createStudentsTemplateBuffer();
  return new Response(toArrayBuffer(data), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="students-import-template.xlsx"' } });
}
