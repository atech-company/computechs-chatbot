"use client";

import type { QuotationPayload } from "@/types/chat";
import { formatQuotationPlainText, truncateForWhatsApp } from "@/lib/format-quotation";

function whatsappDigits(): string {
  return (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
}

export function openWhatsAppWithQuotation(q: QuotationPayload): void {
  const body = truncateForWhatsApp(formatQuotationPlainText(q));
  const encoded = encodeURIComponent(body);
  const phone = whatsappDigits();
  const url = phone
    ? `https://wa.me/${phone}?text=${encoded}`
    : `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
