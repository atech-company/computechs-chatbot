import type { QuotationPayload } from "@/types/chat";

/** WhatsApp pre-filled text is limited; keep a safety margin below ~4096. */
export const WHATSAPP_QUOTE_TEXT_MAX = 3500;

export function formatQuotationMoney(n: number, currency: string): string {
  const c = currency?.trim();
  try {
    return new Intl.NumberFormat(undefined, {
      style: c ? "currency" : "decimal",
      currency: c && c.length === 3 ? c : undefined,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${c ? `${c} ` : ""}${n.toFixed(2)}`;
  }
}

/** Plain text with WhatsApp-friendly *bold* markers. */
export function formatQuotationPlainText(q: QuotationPayload): string {
  const lines: string[] = [];
  lines.push(`*${q.storeName}*`);
  lines.push(`Quotation *${q.reference}*`);
  lines.push(`Date: ${new Date(q.createdAt).toLocaleString()}`);
  lines.push("");
  lines.push(`Customer: ${q.customerName?.trim() ? q.customerName : "(pending)"}`);
  lines.push("");
  lines.push("────────────────");
  for (const line of q.lines) {
    lines.push(`• ${line.name}`);
    lines.push(
      `  ${line.quantity} × ${formatQuotationMoney(line.unitPrice, q.currency)} = ${formatQuotationMoney(line.lineTotal, q.currency)}`,
    );
  }
  lines.push("────────────────");
  lines.push(`*Subtotal${q.currency ? ` (${q.currency})` : ""}:* ${formatQuotationMoney(q.subtotal, q.currency)}`);
  if (q.notes?.trim()) {
    lines.push("");
    lines.push("_Notes:_");
    lines.push(q.notes.trim());
  }
  lines.push("");
  lines.push("_Subject to stock & confirmation. Reply on WhatsApp to proceed._");
  return lines.join("\n");
}

export function truncateForWhatsApp(text: string, max = WHATSAPP_QUOTE_TEXT_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 80).trimEnd()}\n\n… (truncated — download PDF from chat for the full quotation)`;
}
