import { createProductsTemplateBuffer } from "@/features/import-export/excel-export";
import { getCurrentUser } from "@/lib/session";

export const runtime = "nodejs";

const EXCEL_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(arrayBuffer).set(data);
  return arrayBuffer;
}

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  const buffer = await createProductsTemplateBuffer();
  const body = toArrayBuffer(buffer);

  return new Response(body, {
    headers: {
      "Content-Type": EXCEL_CONTENT_TYPE,
      "Content-Disposition":
        'attachment; filename="products-import-template.xlsx"',
    },
  });
}