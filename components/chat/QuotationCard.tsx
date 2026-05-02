"use client";

import type { QuotationPayload } from "@/types/chat";
import { formatQuotationMoney } from "@/lib/format-quotation";
import { exportQuotationPdf } from "@/lib/export-quotation-pdf";
import { openWhatsAppWithQuotation } from "@/lib/open-whatsapp-quotation";

export function QuotationCard({ quotation: q }: { quotation: QuotationPayload }) {
  const phoneConfigured = Boolean((process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, ""));

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/90 shadow-sm dark:border-zinc-600 dark:from-zinc-900 dark:to-zinc-950/90">
      <div className="border-b border-zinc-200/90 bg-zinc-900 px-4 py-3 text-white dark:border-zinc-700 dark:bg-zinc-950">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-300">Quotation</p>
        <p className="text-lg font-semibold tracking-tight">{q.storeName}</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
          <span>
            Ref: <span className="font-mono text-white">{q.reference}</span>
          </span>
          <span>{new Date(q.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/60">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Bill to</p>
          <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {q.customerName?.trim() ? q.customerName : "Customer name — confirm with sales"}
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="w-full min-w-[280px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-100/90 dark:border-zinc-700 dark:bg-zinc-800/80">
                <th className="px-3 py-2 font-semibold text-zinc-700 dark:text-zinc-200">Item</th>
                <th className="w-12 px-2 py-2 text-center font-semibold text-zinc-700 dark:text-zinc-200">Qty</th>
                <th className="w-24 px-2 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-200">Unit</th>
                <th className="w-28 px-3 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-200">Line</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    No line items yet — ask the assistant to add products from the catalog.
                  </td>
                </tr>
              ) : (
                q.lines.map((line, i) => (
                  <tr key={`${line.name}-${i}`} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="px-3 py-2.5 align-top text-sm text-zinc-900 dark:text-zinc-100">{line.name}</td>
                    <td className="px-2 py-2.5 text-center font-mono text-zinc-700 dark:text-zinc-300">{line.quantity}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-zinc-700 dark:text-zinc-300">
                      {formatQuotationMoney(line.unitPrice, q.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-medium text-zinc-900 dark:text-zinc-50">
                      {formatQuotationMoney(line.lineTotal, q.currency)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-700">
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Subtotal{q.currency ? ` (${q.currency})` : ""}
            </p>
            <p className="text-xl font-bold tabular-nums text-violet-700 dark:text-violet-300">
              {formatQuotationMoney(q.subtotal, q.currency)}
            </p>
          </div>
        </div>

        {q.notes?.trim() ? (
          <div className="rounded-xl bg-zinc-100/80 px-3 py-2 dark:bg-zinc-800/60">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{q.notes.trim()}</p>
          </div>
        ) : null}

        <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400">
          Prices subject to confirmation and availability.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => openWhatsAppWithQuotation(q)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#20bd5a] sm:flex-none"
          >
            <span aria-hidden>📱</span>
            Send via WhatsApp
          </button>
          <button
            type="button"
            onClick={() => exportQuotationPdf(q)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800 sm:flex-none"
          >
            <span aria-hidden>⬇</span>
            Download PDF
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-500">
          {phoneConfigured
            ? "WhatsApp opens with this quotation prefilled to your store number."
            : "WhatsApp opens with this quotation prefilled — choose who to send it to. Add NEXT_PUBLIC_WHATSAPP_NUMBER (digits with country code) to pre-select your business chat."}
        </p>
      </div>
    </div>
  );
}
