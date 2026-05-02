export type Intent = "SALES" | "SUPPORT" | "QUOTATION" | "ACTION";

export type ChatRole = "user" | "assistant";

export interface WooProductSummary {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  short_description: string;
  image?: string | null;
  stock_status?: string;
}

export interface QuotationLine {
  productId?: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface QuotationPayload {
  customerName: string | null;
  storeName: string;
  reference: string;
  currency: string;
  lines: QuotationLine[];
  subtotal: number;
  notes?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  products?: WooProductSummary[];
  quotation?: QuotationPayload | null;
  intent?: Intent;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface ChatApiResponse {
  message: string;
  intent: Intent;
  products?: WooProductSummary[];
  quotation?: QuotationPayload | null;
  error?: string;
}
