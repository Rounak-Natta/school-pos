import { renderToBuffer } from "@react-pdf/renderer";

import { createInvoicePdfDocument } from "@/features/pos/invoice-pdf";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteProps = {
  params:
    | {
        invoiceId: string;
      }
    | Promise<{
        invoiceId: string;
      }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  await requireUser();

  const { invoiceId } = await Promise.resolve(params);

  const invoice = await prisma.invoice.findUnique({
    where: {
      id: invoiceId,
    },
    include: {
      school: true,
      student: true,
      payments: {
        orderBy: {
          paidAt: "asc",
        },
      },
      items: {
        include: {
          productVariant: {
            include: {
              product: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    return new Response("Invoice not found", {
      status: 404,
    });
  }

  const pdfDocument = createInvoicePdfDocument(
    invoice,
  ) as Parameters<typeof renderToBuffer>[0];

  const buffer = await renderToBuffer(pdfDocument);
  const safeInvoiceNo = invoice.invoiceNo.replace(/[^\w.-]/g, "_");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeInvoiceNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}