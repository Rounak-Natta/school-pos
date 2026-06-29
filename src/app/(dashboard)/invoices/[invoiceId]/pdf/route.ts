import { renderToBuffer } from "@react-pdf/renderer";

import { createInvoicePdfDocument } from "@/features/pos/invoice-pdf";
import { getInvoiceAccessScope } from "@/features/pos/invoice-access";
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

function safeFileName(value: string) {
  const cleaned = value
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return cleaned || "invoice";
}

export async function GET(_request: Request, { params }: RouteProps) {
  const user = await requireUser();
  const access = await getInvoiceAccessScope(user);

  if (!access.isSuperAdmin && access.schoolIds.length === 0) {
    return new Response("You do not have access to invoices.", {
      status: 403,
    });
  }

  const { invoiceId } = await Promise.resolve(params);

  if (!invoiceId || typeof invoiceId !== "string") {
    return new Response("Invalid invoice id", {
      status: 400,
    });
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(access.isSuperAdmin
        ? {}
        : {
            schoolId: {
              in: access.schoolIds,
            },
          }),
    },
    include: {
      school: true,
      student: true,
      billedBy: true,
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  if (!invoice) {
    return new Response("Invoice not found", {
      status: 404,
    });
  }

  try {
    const pdfDocument = createInvoicePdfDocument(
      invoice,
    ) as Parameters<typeof renderToBuffer>[0];

    const buffer = await renderToBuffer(pdfDocument);
    const fileName = `${safeFileName(invoice.invoiceNo)}.pdf`;

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(
          fileName,
        )}`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Invoice PDF generation failed:", error);

    return new Response("Unable to generate invoice PDF", {
      status: 500,
    });
  }
}