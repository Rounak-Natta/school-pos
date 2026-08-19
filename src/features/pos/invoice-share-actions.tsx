"use client";

import { useState } from "react";

type InvoiceShareActionsProps = {
  invoiceNo: string;
  customerName: string;
  customerPhone: string;
  schoolName: string;
  payableAmount: string;
  pdfHref: string;
};

function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
}

export function InvoiceShareActions({
  invoiceNo,
  customerName,
  customerPhone,
  schoolName,
  payableAmount,
  pdfHref,
}: InvoiceShareActionsProps) {
  const [copied, setCopied] = useState(false);

  function getMessage() {
    const absolutePdf = `${window.location.origin}${pdfHref}`;
    return `Hello ${customerName || "Customer"}, your invoice ${invoiceNo} from ${schoolName} is ready. Amount: ${payableAmount}. Download bill: ${absolutePdf}`;
  }

  async function copyMessage() {
    await navigator.clipboard.writeText(getMessage());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareBill() {
    const url = `${window.location.origin}${pdfHref}`;
    const text = getMessage();

    if (navigator.share) {
      await navigator.share({ title: `Invoice ${invoiceNo}`, text, url });
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const phone = normalizeWhatsAppPhone(customerPhone);

  function sendWhatsApp() {
    if (!phone) return;
    const href = `https://wa.me/${phone}?text=${encodeURIComponent(getMessage())}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <button
          type="button"
          onClick={sendWhatsApp}
          className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          Send on WhatsApp
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => void shareBill()}
        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Share Bill
      </button>

      <button
        type="button"
        onClick={() => void copyMessage()}
        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        {copied ? "Copied" : "Copy Bill Message"}
      </button>
    </div>
  );
}
