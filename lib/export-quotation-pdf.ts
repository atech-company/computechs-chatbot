"use client";

import { jsPDF } from "jspdf";
import type { QuotationPayload } from "@/types/chat";
import { formatQuotationMoney } from "@/lib/format-quotation";

export function exportQuotationPdf(q: QuotationPayload): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  let y = margin;

  doc.setFillColor(24, 24, 27);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 72, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("QUOTATION", margin, 28);
  doc.setFontSize(16);
  doc.text(q.storeName, margin, 48);
  doc.setTextColor(0, 0, 0);

  y = 96;
  doc.setFontSize(11);
  doc.text(`Reference: ${q.reference}`, margin, y);
  y += 16;
  doc.setFontSize(10);
  doc.text(`Date: ${new Date(q.createdAt).toLocaleString()}`, margin, y);
  y += 26;

  doc.setDrawColor(220);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(margin, y - 8, doc.internal.pageSize.getWidth() - margin * 2, 36, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.text("Bill to", margin + 8, y + 6);
  doc.setFont("helvetica", "normal");
  doc.text(q.customerName?.trim() ? q.customerName : "(pending)", margin + 8, y + 22);
  y += 44;

  doc.setDrawColor(220);
  doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Item", margin, y);
  doc.text("Qty", margin + 260, y);
  doc.text("Unit", margin + 310, y);
  doc.text("Line", margin + 390, y);
  y += 14;
  doc.setFont("helvetica", "normal");

  for (const line of q.lines) {
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = margin;
    }
    const name = doc.splitTextToSize(line.name, 240);
    doc.text(name, margin, y + 12);
    doc.text(String(line.quantity), margin + 260, y + 12);
    doc.text(formatQuotationMoney(line.unitPrice, q.currency), margin + 310, y + 12);
    doc.text(formatQuotationMoney(line.lineTotal, q.currency), margin + 390, y + 12);
    y += 12 + Math.max(14, name.length * 14);
  }

  y += 12;
  doc.line(margin, y, doc.internal.pageSize.getWidth() - margin, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.text(`Subtotal (${q.currency || "—"})`, margin + 310, y);
  doc.text(formatQuotationMoney(q.subtotal, q.currency), margin + 390, y);
  y += 22;
  doc.setFont("helvetica", "normal");

  if (q.notes?.trim()) {
    doc.text("Notes:", margin, y);
    y += 16;
    const noteLines = doc.splitTextToSize(q.notes.trim(), doc.internal.pageSize.getWidth() - margin * 2);
    for (const line of noteLines) {
      doc.text(line, margin, y);
      y += 14;
    }
  }

  y += 10;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("Subject to stock and confirmation.", margin, y);

  doc.save(`computechsleb-quotation-${q.reference}.pdf`);
}
